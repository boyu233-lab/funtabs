/**
 * Xtab 自托管后端
 * 数据真相源是 NAS 磁盘上的数据文件（默认 YAML，可选 JSON），
 * 浏览器本地只是离线缓存。
 */
// 发版时与 src/common/version.js、package.json 的 version 保持同步
const APP_VERSION = "1.3.0";
const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
// YAML 解析/序列化：把书签整理成人工可编辑的结构，方便备份、diff 与批量修改
const YAML = require("yaml");

const PORT = parseInt(process.env.PORT || "8099", 10);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
// 主数据格式：yaml（默认，人工可编辑）| json（兼容旧版）
const DATA_FORMAT = (process.env.DATA_FORMAT || "yaml").toLowerCase();
const YAML_FILE = path.join(DATA_DIR, "funtabs.yaml");
const JSON_FILE = path.join(DATA_DIR, "funtabs.json");
const DATA_FILE = DATA_FORMAT === "json" ? JSON_FILE : YAML_FILE;
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const API_TOKEN = process.env.API_TOKEN || "";
const MAX_BODY = process.env.MAX_BODY || "20mb";
// 反向代理后 req.ip 会全部变成代理的地址，必须显式信任才能正确限流。
// 群晖反向代理 / nginx / Cloudflare Tunnel 场景设为 1；直连保持 0。
const TRUST_PROXY = process.env.TRUST_PROXY || "0";
// 单 IP 在窗口期内的最大请求数，用于缓解公网下的暴力破解与刷接口
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || "600", 10);
const RATE_WINDOW = parseInt(process.env.RATE_WINDOW || "300000", 10);
// SSRF 防护开关：后端有两个"按 URL 抓取网页"的接口（/api/webtitle、/api/favicon），
// 若不对目标地址做限制，任何拿到 API_TOKEN 的人都能借你的 NAS 去探测内网
// （群晖 DSM、路由器、云元数据 169.254.169.254 等）并回读内容。
// 默认禁止访问内网/本机地址；若你的书签里有 192.168.x.x 这类内网服务、
// 需要抓取标题和图标，设置 ALLOW_PRIVATE_NET=1 显式放行。
const ALLOW_PRIVATE_NET = process.env.ALLOW_PRIVATE_NET === "1";
// 是否使用 Google 的 favicon 服务兜底。开启可向几乎所有站点取到图标，
// 代价是把你的书签域名提交给 Google；设为 0 关闭。
const FAVICON_GOOGLE_FALLBACK = process.env.FAVICON_GOOGLE_FALLBACK !== "0";

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.set("trust proxy", TRUST_PROXY);
app.use(express.json({ limit: MAX_BODY }));

/* ============ 数据文件读写：YAML / JSON 双格式 ============ */

/**
 * 内部结构 doc = { data: newData, updatedAt, version }
 * 其中 newData = { content: [tab...], ...布局字段 }
 *
 * YAML 采用更适合人工编辑的形状：
 *   version / updatedAt / layout（布局字段）/ tabs（分类，内含 items）
 */
function docToYamlText(doc) {
  const d = (doc && doc.data) || {};
  const layout = {};
  Object.keys(d).forEach((k) => {
    if (k !== "content") layout[k] = d[k];
  });
  const tabs = Array.isArray(d.content)
    ? d.content.map((tab) => {
        const meta = {};
        Object.keys(tab || {}).forEach((k) => {
          if (k !== "content") meta[k] = tab[k];
        });
        return { ...meta, items: Array.isArray(tab.content) ? tab.content : [] };
      })
    : [];
  return YAML.stringify(
    {
      version: (doc && doc.version) || 1,
      updatedAt: (doc && doc.updatedAt) || 0,
      layout,
      tabs,
    },
    { indent: 2, lineWidth: 0 }
  );
}

/** 数字型 key/字段在 YAML 里可能被写成字符串，这里统一还原成数字 */
function normalizeScalar(v) {
  if (typeof v === "string" && v.trim() !== "" && /^-?\d+$/.test(v.trim())) {
    return Number(v.trim());
  }
  return v;
}

function yamlTextToDoc(text) {
  const obj = YAML.parse(text) || {};
  const layout = obj.layout || {};
  const tabs = Array.isArray(obj.tabs) ? obj.tabs : [];
  const content = tabs.map((tab, i) => {
    const meta = {};
    Object.keys(tab || {}).forEach((k) => {
      if (k !== "items") meta[k] = tab[k];
    });
    meta.key = normalizeScalar(meta.key !== undefined ? meta.key : i + 1);
    if (!meta.type) meta.type = "folder";
    return { ...meta, content: Array.isArray(tab.items) ? tab.items : [] };
  });
  const data = {};
  Object.keys(layout).forEach((k) => {
    data[k] = k === "content" ? layout[k] : layout[k];
  });
  data.content = content;
  return {
    data,
    updatedAt: Number(obj.updatedAt) || Date.now(),
    version: Number(obj.version) || 1,
  };
}

async function readRaw(file) {
  return fsp.readFile(file, "utf8");
}

/** 读取当前数据文档；主文件损坏时回退 .bak */
async function readData() {
  try {
    const raw = await readRaw(DATA_FILE);
    if (DATA_FORMAT === "json") return JSON.parse(raw);
    return yamlTextToDoc(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    try {
      const backup = await readRaw(`${DATA_FILE}.bak`);
      if (DATA_FORMAT === "json") return JSON.parse(backup);
      return yamlTextToDoc(backup);
    } catch (_) {
      throw err;
    }
  }
}

/** 原子写（先写临时文件再 rename），格式由当前 DATA_FORMAT 决定 */
async function writeDoc(doc) {
  const text =
    DATA_FORMAT === "json"
      ? JSON.stringify(doc, null, 2)
      : docToYamlText(doc);
  const tmp = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, text, "utf8");
  await fsp.rename(tmp, DATA_FILE);
}

/**
 * 首次启动时做一次格式迁移：
 * 目标格式文件不存在、而另一种格式存在时，自动转换，原文件保留不动。
 */
async function migrateIfNeeded() {
  const target = DATA_FILE;
  const other = DATA_FORMAT === "json" ? YAML_FILE : JSON_FILE;
  try {
    await fsp.access(target);
    return; // 目标文件已存在，无需迁移
  } catch (_) {
    /* 继续 */
  }
  let doc = null;
  try {
    const raw = await readRaw(other);
    doc = other === JSON_FILE ? JSON.parse(raw) : yamlTextToDoc(raw);
  } catch (_) {
    return;
  }
  if (!doc || !doc.data) return;
  try {
    await writeDoc(doc);
    console.log(
      `[xtab] 已将 ${path.basename(other)} 迁移为 ${path.basename(target)}（原文件保留）`
    );
  } catch (e) {
    console.error(`[xtab] 数据格式迁移失败：${e.message}`);
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
  // 定长比较，避免通过响应耗时逐字节猜测 token
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${API_TOKEN}`);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  return res.status(401).json({ error: "unauthorized" });
}

app.use("/api", rateLimit);

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "xtab",
    version: APP_VERSION,
    dataFormat: DATA_FORMAT,
    time: Date.now(),
  });
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
    // 保留上一版本作备份（格式与主文件一致，方便直接查看/回滚）
    if (current) {
      const bakText =
        DATA_FORMAT === "json"
          ? JSON.stringify(current, null, 2)
          : docToYamlText(current);
      await fsp.writeFile(`${DATA_FILE}.bak`, bakText, "utf8").catch(() => {});
    }
    const doc = {
      data: body.data,
      updatedAt: Date.now(),
      version: (current && current.version ? current.version : 0) + 1,
    };
    await writeDoc(doc);
    res.json({ ok: true, ...doc });
  } catch (err) {
    res.status(500).json({ error: "write_failed", message: err.message });
  }
});

/**
 * 导出原始数据文件（不经过前端 localStorage，导出的一定是 NAS 上的真相源）
 * GET /api/data/raw?format=yaml|json
 */
app.get("/api/data/raw", auth, async (req, res) => {
  const format = (req.query.format || DATA_FORMAT).toLowerCase();
  try {
    const doc = await readData();
    if (!doc) return res.status(404).json({ error: "no_data" });
    const isYaml = format !== "json";
    const text = isYaml ? docToYamlText(doc) : JSON.stringify(doc, null, 2);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    res.set("Content-Type", isYaml ? "text/yaml; charset=utf-8" : "application/json; charset=utf-8");
    res.set(
      "Content-Disposition",
      `attachment; filename="xtab-${stamp}.${isYaml ? "yaml" : "json"}"`
    );
    res.send(text);
  } catch (err) {
    res.status(500).json({ error: "export_failed", message: err.message });
  }
});

/**
 * 导入 YAML / JSON 文本并直接写入 NAS（供前端"导入文件"按钮使用）
 * POST /api/data/import  body: { content: "...", format?: "yaml"|"json" }
 */
app.post("/api/data/import", auth, async (req, res) => {
  const body = req.body || {};
  const content = typeof body.content === "string" ? body.content : "";
  if (!content.trim()) {
    return res.status(400).json({ error: "empty_content" });
  }
  const format = (body.format || DATA_FORMAT).toLowerCase();
  let doc;
  try {
    if (format === "json") {
      const parsed = JSON.parse(content);
      // 兼容两种 JSON：完整 doc {data,...} 或直接是 newData
      doc = parsed && parsed.data ? parsed : { data: parsed };
    } else {
      doc = yamlTextToDoc(content);
    }
  } catch (err) {
    return res.status(400).json({ error: "parse_failed", message: err.message });
  }
  if (!doc || !doc.data || typeof doc.data !== "object") {
    return res.status(400).json({ error: "invalid_structure" });
  }
  try {
    const current = await readData();
    if (current) {
      const bakText =
        DATA_FORMAT === "json"
          ? JSON.stringify(current, null, 2)
          : docToYamlText(current);
      await fsp.writeFile(`${DATA_FILE}.bak`, bakText, "utf8").catch(() => {});
    }
    const next = {
      data: doc.data,
      updatedAt: Date.now(),
      version: (current && current.version ? current.version : 0) + 1,
    };
    await writeDoc(next);
    res.json({ ok: true, ...next });
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

/**
 * 静态资源安全响应头。
 * 关键：SVG 是 XML，可以内嵌 <script>。同源提供的 .svg 被直接打开时会执行脚本，
 * 形成存储型 XSS（可窃取 localStorage 里的 nasToken 并读写全部书签）。
 * 因此对 SVG 强制附带 CSP（禁止一切加载与脚本）与 nosniff。
 */
function safeStaticHeaders(res, filePath) {
  const isSvg = /\.svg$/i.test(filePath);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (isSvg) {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox"
    );
  }
}

app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    maxAge: "30d",
    immutable: true,
    setHeaders: safeStaticHeaders,
  })
);

/* ================= Xtab 自托管版新增代理接口 =================
 * 用于替代原 funtabs 作者服务器的能力，全部数据经由用户自己的 NAS */

const FAVICON_DIR = path.join(DATA_DIR, "favicons");
fs.mkdirSync(FAVICON_DIR, { recursive: true });

/* ==================== SSRF 防护 ====================
 * /api/webtitle 与 /api/favicon 会按用户传入的 URL 发起请求。
 * 必须拦截内网、本机、链路本地与云元数据地址，否则本服务会变成
 * 攻击者探测内网的跳板（可回显内网页面标题）。
 */
function isPrivateIPv4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // 解析不出合法 IPv4 一律拒绝
  }
  if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 169 && p[1] === 254) return true; // link-local / 云元数据
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
  if (p[0] === 192 && p[1] === 0 && p[2] === 0) return true;
  if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true;
  if (p[0] >= 224) return true; // 组播与保留
  return false;
}

function isPrivateIPv6(ip) {
  const v = String(ip).toLowerCase().split("%")[0];
  if (v === "::" || v === "::1") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(v)) return true; // fc00::/7 唯一本地地址
  if (/^fe[89ab][0-9a-f]:/.test(v)) return true; // fe80::/10 链路本地
  if (/^::ffff:/.test(v)) return isPrivateIPv4(v.slice(7)); // IPv4 映射地址
  return false;
}

const dns = require("dns").promises;

/** 解析主机名得到全部 IP，任一为内网地址则判定为内网 */
async function resolvesToPrivate(hostname) {
  // 直接就是 IP 字面量的情况
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return isPrivateIPv4(hostname);
  if (hostname.includes(":")) return isPrivateIPv6(hostname);
  let records = [];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch (e) {
    return true; // 解析失败按不安全处理
  }
  if (!records.length) return true;
  return records.some((r) =>
    r.family === 4 ? isPrivateIPv4(r.address) : isPrivateIPv6(r.address)
  );
}

/**
 * 校验外部抓取目标是否允许。
 * 返回 { ok: true } 或 { ok: false, reason }
 */
async function assertSafeTarget(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl || ""));
  } catch (e) {
    return { ok: false, reason: "invalid_url" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: "invalid_protocol" };
  }
  if (ALLOW_PRIVATE_NET) return { ok: true, url: u };
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, reason: "private_address" };
  }
  if (host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, reason: "private_address" };
  }
  const priv = await resolvesToPrivate(host);
  if (priv) return { ok: false, reason: "private_address" };
  return { ok: true, url: u };
}

/** 带超时的 fetch（Node 18+ 全局 fetch） */
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/json,*/*",
        ...(options.headers || {}),
      },
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

/** 基础 HTML 实体解码 */
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** 抓取网页标题：GET /api/webtitle?url=https://example.com → text/plain */
app.get("/api/webtitle", auth, async (req, res) => {
  const target = String(req.query.url || "");
  if (!/^https?:\/\//i.test(target)) {
    return res.status(400).json({ error: "invalid_url" });
  }
  // SSRF 防护：拒绝内网/本机/云元数据地址（可用 ALLOW_PRIVATE_NET=1 放行）
  const safe = await assertSafeTarget(target);
  if (!safe.ok) {
    return res.status(403).json({ error: safe.reason });
  }
  try {
    const resp = await fetchWithTimeout(target, {}, 8000);
    // 只读前 256KB，足够拿到 <head> 里的 title
    const reader = resp.body.getReader();
    let received = 0;
    const chunks = [];
    while (received < 256 * 1024) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
    }
    reader.cancel().catch(() => {});
    const html = Buffer.concat(chunks).toString("utf8");
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (!m) return res.status(404).json({ error: "title_not_found" });
    res.type("text/plain; charset=utf-8").send(decodeEntities(m[1].trim()));
  } catch (err) {
    res.status(502).json({ error: "fetch_failed", message: err.message });
  }
});

/** 抓取并缓存网站图标：GET /api/favicon?url=https://example.com → { icon } */
app.get("/api/favicon", auth, async (req, res) => {
  const target = String(req.query.url || "");
  let origin, host;
  try {
    const u = new URL(target);
    if (!/^https?:$/.test(u.protocol)) throw new Error("bad protocol");
    origin = u.origin;
    host = u.hostname;
  } catch {
    return res.status(400).json({ error: "invalid_url" });
  }
  // SSRF 防护：目标域名本身也要过白名单检查
  const safeOrigin = await assertSafeTarget(target);
  if (!safeOrigin.ok) {
    return res.status(403).json({ error: safeOrigin.reason });
  }
  const hash = crypto.createHash("md5").update(host).digest("hex").slice(0, 12);

  // 已有缓存直接返回
  const cached = fs.readdirSync(FAVICON_DIR).find((f) => f.startsWith(hash));
  if (cached) {
    // redirect=1：直接返回图片，便于前端把本接口当作 <img src> 使用
    if (req.query.redirect === "1") return res.redirect(`/favicons/${cached}`);
    return res.json({ icon: `/favicons/${cached}` });
  }

  const candidates = [];
  // 1) 解析页面 HTML 中的 <link rel="...icon...">
  try {
    const resp = await fetchWithTimeout(origin, {}, 6000);
    const reader = resp.body.getReader();
    let received = 0;
    const chunks = [];
    while (received < 128 * 1024) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
    }
    reader.cancel().catch(() => {});
    const html = Buffer.concat(chunks).toString("utf8");
    const linkRe = /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi;
    let lm;
    while ((lm = linkRe.exec(html))) {
      const hrefM = /href=["']([^"']+)["']/i.exec(lm[0]);
      if (hrefM) {
        try {
          candidates.push(new URL(hrefM[1], origin).href);
        } catch {}
      }
    }
  } catch {}
  // 2) 约定位置 3) Google 服务兜底（会把你的书签域名发给 Google，
  //    介意可设 FAVICON_GOOGLE_FALLBACK=0 关闭，关闭后取不到图标时返回 404）
  candidates.push(`${origin}/favicon.ico`);
  if (FAVICON_GOOGLE_FALLBACK) {
    candidates.push(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
    );
  }

  for (const iconUrl of candidates) {
    try {
      // 每个候选地址都要过 SSRF 检查：icon 的 href 由目标页面提供，不可信
      if (!(await assertSafeTarget(iconUrl)).ok) continue;
      const resp = await fetchWithTimeout(iconUrl, {}, 6000);
      if (!resp.ok) continue;
      const type = resp.headers.get("content-type") || "";
      if (!/image|icon|octet-stream/.test(type)) continue;
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length < 32) continue; // 过小的多半是无效占位
      const ext = type.includes("svg")
        ? "svg"
        : type.includes("png")
        ? "png"
        : type.includes("gif")
        ? "gif"
        : "ico";
      const fileName = `${hash}.${ext}`;
      await fsp.writeFile(path.join(FAVICON_DIR, fileName), buf);
      if (req.query.redirect === "1") return res.redirect(`/favicons/${fileName}`);
      return res.json({ icon: `/favicons/${fileName}` });
    } catch {}
  }
  res.status(404).json({ error: "icon_not_found" });
});

app.use(
  "/favicons",
  express.static(FAVICON_DIR, {
    maxAge: "30d",
    immutable: true,
    setHeaders: safeStaticHeaders,
  })
);

/** 热搜聚合代理：GET /api/hotEvent/:type → { data: [{title,url,hot}] }
 * 上游为 60s API（开源，可 Docker 自托管）。公共实例限流较严格，
 * 建议在 NAS 上自托管 vikiboss/60s 镜像后把 HOT_API_BASE 指向内网地址，
 * 例如 HOT_API_BASE=http://60s:4399/v2 */
const HOT_API_BASE = (process.env.HOT_API_BASE || "https://60s.viki.moe/v2").replace(/\/$/, "");
const HOT_EVENT_SOURCES = {
  weibo: "weibo",
  douyin: "douyin",
  bilibili: "bili",
  toutiao: "toutiao",
  tieba: "tieba",
  baidu: "baidu",
  zhihu: "zhihu",
  sspai: "sspai",
};
/** 上游响应缓存 10 分钟，缓解公共实例限流 */
const hotCache = new Map(); // type -> { at, data }
const HOT_CACHE_TTL = 10 * 60 * 1000;
app.get("/api/hotEvent/:type", auth, async (req, res) => {
  const source = HOT_EVENT_SOURCES[req.params.type];
  if (!source) return res.status(400).json({ error: "unknown_type" });
  const cached = hotCache.get(source);
  if (cached && Date.now() - cached.at < HOT_CACHE_TTL) {
    return res.json({ data: cached.data, cached: true });
  }
  try {
    const resp = await fetchWithTimeout(
      `${HOT_API_BASE}/${source}`,
      { headers: { Accept: "application/json" } },
      10000
    );
    if (!resp.ok) throw new Error(`upstream ${resp.status}`);
    const json = await resp.json();
    const list = Array.isArray(json.data) ? json.data : [];
    // 60s API 字段为 {title, link, hot_value}，归一化为前端用的 {title, url, hot}
    const data = list.map((it) => ({
      title: it.title || "",
      url: it.link || it.url || it.mobil_url || "",
      hot: String(it.hot_value ?? it.hot ?? ""),
    }));
    hotCache.set(source, { at: Date.now(), data });
    res.json({ data });
  } catch (err) {
    // 有旧缓存时降级返回旧数据而不是报错
    if (cached) return res.json({ data: cached.data, cached: true, stale: true });
    res.status(502).json({ error: "hotevent_failed", message: err.message });
  }
});

/** 翻译代理：GET /api/fanyi?text=你好 → text/plain（MyMemory 免费 API） */
app.get("/api/fanyi", auth, async (req, res) => {
  const text = String(req.query.text || "").slice(0, 500);
  if (!text) return res.status(400).json({ error: "missing_text" });
  const hasCJK = /[一-鿿]/.test(text);
  const langpair = hasCJK ? "zh-CN|en-US" : "en|zh-CN";
  try {
    const resp = await fetchWithTimeout(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
        text
      )}&langpair=${encodeURIComponent(langpair)}`,
      { headers: { Accept: "application/json" } },
      8000
    );
    if (!resp.ok) throw new Error(`upstream ${resp.status}`);
    const json = await resp.json();
    const translated = json?.responseData?.translatedText;
    if (!translated) throw new Error("empty result");
    res.type("text/plain; charset=utf-8").send(translated);
  } catch (err) {
    res.status(502).json({ error: "translate_failed", message: err.message });
  }
});

const buildDir = path.join(__dirname, "..", "build");
if (fs.existsSync(buildDir)) {
  // 缓存策略：带内容哈希的静态资源（/static/**）可长期缓存；
  // index.html 必须每次回源校验（no-cache），否则更新镜像后浏览器
  // 仍会加载旧入口，引用旧 JS，出现"已部署新版但页面没变"的问题。
  app.use(
    express.static(buildDir, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
        } else if (/[.-][0-9a-zA-Z_-]{8,}\.(js|css|png|jpe?g|svg|woff2?)$/.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=604800, immutable");
        } else {
          res.setHeader("Cache-Control", "public, max-age=3600");
        }
      },
    })
  );
  // SPA 回退：不用 app.get("*")，Express 5 起该写法非法（需 /*splat），
  // 用中间件形式可同时兼容 v4 / v5
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(buildDir, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res
      .status(503)
      .send("前端尚未构建：请先执行 npm run build，构建产物需位于 build/ 目录");
  });
}

migrateIfNeeded()
  .catch((e) => console.error(`[xtab] 迁移检查失败：${e.message}`))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`[xtab] 服务已启动 http://0.0.0.0:${PORT}（v${APP_VERSION}）`);
      console.log(`[xtab] 数据文件 ${DATA_FILE}（格式：${DATA_FORMAT}）`);
      if (!API_TOKEN) {
        console.warn(
          "[xtab] 警告：未设置 API_TOKEN，所有接口免鉴权。若经公网访问，" +
            "任何人都能读取并覆盖你的书签数据，请尽快在 compose 里配置 API_TOKEN。"
        );
      }
      console.log(
        `[xtab] SSRF 防护：${ALLOW_PRIVATE_NET ? "已关闭（允许抓取内网地址）" : "已开启（拒绝内网/本机地址）"}`
      );
    });
  });
