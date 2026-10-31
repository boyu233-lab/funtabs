/**
 * funtabs 自托管后端
 * 数据真相源是 NAS 磁盘上的 data/funtabs.json，浏览器本地只是离线缓存。
 */
const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const PORT = parseInt(process.env.PORT || "8099", 10);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "funtabs.json");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const API_TOKEN = process.env.API_TOKEN || "";
const MAX_BODY = process.env.MAX_BODY || "20mb";
// 反向代理后 req.ip 会全部变成代理的地址，必须显式信任才能正确限流。
// 群晖反向代理 / nginx / Cloudflare Tunnel 场景设为 1；直连保持 0。
const TRUST_PROXY = process.env.TRUST_PROXY || "0";
// 单 IP 在窗口期内的最大请求数，用于缓解公网下的暴力破解与刷接口
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || "600", 10);
const RATE_WINDOW = parseInt(process.env.RATE_WINDOW || "300000", 10);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.set("trust proxy", TRUST_PROXY);
app.use(express.json({ limit: MAX_BODY }));

/** 原子写：先写临时文件再 rename，避免写一半断电导致数据损坏 */
async function writeJsonAtomic(file, obj) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(obj), "utf8");
  await fsp.rename(tmp, file);
}

async function readData() {
  try {
    const raw = await fsp.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    if (err.code === "ENOENT") return null;
    // 主文件损坏时尝试回滚到备份
    try {
      const backup = await fsp.readFile(`${DATA_FILE}.bak`, "utf8");
      return JSON.parse(backup);
    } catch (_) {
      throw err;
    }
  }
}

/** 极简内存限流：无第三方依赖，定期清理过期桶避免内存无限增长 */
const buckets = new Map();
function rateLimit(req, res, next) {
  if (RATE_LIMIT <= 0) return next();
  const now = Date.now();
  const key = req.ip || "unknown";
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
    }
    return next();
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT) {
    res.set("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
    return res.status(429).json({ error: "too_many_requests" });
  }
  return next();
}

function auth(req, res, next) {
  if (!API_TOKEN) return next();
  const header = req.get("authorization") || "";
  if (header === `Bearer ${API_TOKEN}`) return next();
  return res.status(401).json({ error: "unauthorized" });
}

app.use("/api", rateLimit);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "funtabs", time: Date.now() });
});

app.get("/api/data", auth, async (req, res) => {
  try {
    const doc = await readData();
    if (!doc) return res.json({ data: null, updatedAt: 0 });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: "read_failed", message: err.message });
  }
});

app.put("/api/data", auth, async (req, res) => {
  const body = req.body || {};
  if (typeof body.data !== "object" || body.data === null) {
    return res.status(400).json({ error: "invalid_payload" });
  }
  try {
    const current = await readData();
    const force = req.query.force === "1";
    // 冲突检测：离线客户端带着旧 updatedAt 回写时，先返回服务端版本让其确认
    if (
      !force &&
      current &&
      current.updatedAt &&
      body.updatedAt &&
      Number(body.updatedAt) !== Number(current.updatedAt)
    ) {
      return res.status(409).json({
        error: "conflict",
        server: current,
      });
    }
    // 保留上一版本作备份
    if (current) {
      await fsp
        .writeFile(`${DATA_FILE}.bak`, JSON.stringify(current), "utf8")
        .catch(() => {});
    }
    const doc = {
      data: body.data,
      updatedAt: Date.now(),
      version: (current && current.version ? current.version : 0) + 1,
    };
    await writeJsonAtomic(DATA_FILE, doc);
    res.json({ ok: true, ...doc });
  } catch (err) {
    res.status(500).json({ error: "write_failed", message: err.message });
  }
});

/**
 * 每日壁纸代理：Bing 每日图不允许浏览器跨域直连，由 NAS 后端代取。
 * 只把图片 URL 返回给前端，前端不存 base64，避免撑爆存储。
 */
app.get("/api/wallpaper/bing", auth, async (req, res) => {
	const day = Math.min(Math.max(parseInt(req.query.day || "0", 10), 0), 7);
	try {
		const upstream = await fetch(
			`https://cn.bing.com/HPImageArchive.aspx?format=js&idx=${day}&n=1`,
			{ headers: { "User-Agent": "Mozilla/5.0" } }
		);
		if (!upstream.ok) throw new Error(`upstream_${upstream.status}`);
		const body = await upstream.json();
		const image = body.images && body.images[0];
		if (!image || !image.url) throw new Error("empty_response");
		const url = image.url.startsWith("http")
			? image.url
			: `https://cn.bing.com${image.url}`;
		res.json({
			ok: true,
			url,
			title: image.title || "",
			copyright: image.copyright || "",
			date: image.startdate || "",
		});
	} catch (err) {
		res.status(502).json({ error: "wallpaper_failed", message: err.message });
	}
});

/** 图片上传：接收 base64，落盘到 NAS，只把 URL 返回给前端 */
app.post("/api/upload", auth, async (req, res) => {
  const { name, dataUrl } = req.body || {};
  if (!dataUrl || typeof dataUrl !== "string") {
    return res.status(400).json({ error: "missing_dataurl" });
  }
  const match = /^data:(image|video)\/([a-zA-Z0-9.+-]+);base64,(.*)$/.exec(
    dataUrl
  );
  if (!match) return res.status(400).json({ error: "invalid_dataurl" });
  const ext = match[2].replace("jpeg", "jpg");
  const base = path
    .basename(name || "upload", path.extname(name || ""))
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .slice(0, 40);
  const fileName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${
    base || "file"
  }.${ext}`;
  try {
    await fsp.writeFile(
      path.join(UPLOAD_DIR, fileName),
      Buffer.from(match[3], "base64")
    );
    res.json({ ok: true, url: `/uploads/${fileName}` });
  } catch (err) {
    res.status(500).json({ error: "write_failed", message: err.message });
  }
});

app.use(
  "/uploads",
  express.static(UPLOAD_DIR, { maxAge: "30d", immutable: true })
);

const buildDir = path.join(__dirname, "..", "build");
if (fs.existsSync(buildDir)) {
  app.use(express.static(buildDir, { maxAge: "1h" }));
  app.get("*", (req, res) => {
    res.sendFile(path.join(buildDir, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res
      .status(503)
      .send("前端尚未构建：请先执行 npm run build，构建产物需位于 build/ 目录");
  });
}

app.listen(PORT, () => {
  console.log(`[funtabs] 服务已启动 http://0.0.0.0:${PORT}`);
  console.log(`[funtabs] 数据目录 ${DATA_DIR}`);
});
