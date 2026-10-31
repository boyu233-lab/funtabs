/**
 * Obsidian 集成（双通道，都不需要 NAS 后端）
 *
 * A. Advanced URI：把内容一键追加到当天日记 / 指定笔记的标题下。
 *    只需 Obsidian 装 Advanced URI 插件即可，装不了就用 B 通道。
 * C. File System Access API：授权一次 vault 目录后，浏览器直接读写 .md 文件，
 *    可读写、可列目录、真离线，仅 Chrome / Edge 支持。
 */
import { cacheGet, cacheSet } from "./idbCache";

const CFG_KEY = "obsidianConfig";
const HANDLE_KEY = "obsidianVaultHandle";

export const DEFAULT_CONFIG = {
	vault: "", // vault 名称，Advanced URI 必需
	daily: true, // 追加到当天日记
	note: "", // 或追加到指定笔记（不含 .md）
	heading: "收集箱", // 追加到该标题下
	mode: "append",
	useClipboard: true, // 走剪贴板传内容，规避 URL 长度限制
};

export async function getConfig() {
	const saved = await cacheGet(CFG_KEY);
	return { ...DEFAULT_CONFIG, ...(saved || {}) };
}

export async function setConfig(patch) {
	const next = { ...(await getConfig()), ...patch };
	await cacheSet(CFG_KEY, next);
	return next;
}

/* ---------------- A 通道：Advanced URI ---------------- */

/**
 * 快速收集：把一段文字追加到 Obsidian。
 * 返回 { uri, viaClipboard }
 */
export async function quickCapture(text) {
	const content = String(text || "").trim();
	if (!content) throw new Error("内容为空");
	const cfg = await getConfig();
	if (!cfg.vault) throw new Error("请先填写 Obsidian vault 名称");

	const params = new URLSearchParams();
	params.set("vault", cfg.vault);
	params.set("mode", cfg.mode || "append");
	if (cfg.daily) {
		params.set("daily", "true");
	} else if (cfg.note) {
		params.set("file", cfg.note);
	}
	if (cfg.heading) params.set("heading", cfg.heading);

	let viaClipboard = false;
	if (cfg.useClipboard && navigator.clipboard) {
		await navigator.clipboard.writeText(content);
		params.set("clipboard", "true");
		viaClipboard = true;
	} else {
		params.set("data", content);
	}

	const uri = `obsidian://adv-uri?${params.toString()}`;
	// 用隐藏链接触发协议，避免当前页面被导航走
	const link = document.createElement("a");
	link.href = uri;
	link.style.display = "none";
	document.body.appendChild(link);
	link.click();
	setTimeout(() => link.remove(), 1000);
	return { uri, viaClipboard };
}

/* ---------------- C 通道：File System Access API ---------------- */

export function supportsFileSystemAccess() {
	return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

async function verifyPermission(handle) {
	const opts = { mode: "readwrite" };
	if (!handle.queryPermission) return true;
	if ((await handle.queryPermission(opts)) === "granted") return true;
	if (!handle.requestPermission) return false;
	return (await handle.requestPermission(opts)) === "granted";
}

/** 弹出目录选择器，授权 vault 根目录；句柄存 IndexedDB，下次免授权 */
export async function connectVault() {
	if (!supportsFileSystemAccess()) {
		throw new Error("当前浏览器不支持本地目录访问，请使用 Chrome / Edge");
	}
	const handle = await window.showDirectoryPicker({
		id: "funtabs-obsidian-vault",
		mode: "readwrite",
	});
	await cacheSet(HANDLE_KEY, handle);
	return handle;
}

export async function disconnectVault() {
	await cacheSet(HANDLE_KEY, null);
}

/** 取已授权的 vault 句柄，未授权返回 null */
export async function getVaultHandle() {
	try {
		const handle = await cacheGet(HANDLE_KEY);
		if (!handle) return null;
		return (await verifyPermission(handle)) ? handle : null;
	} catch (e) {
		return null;
	}
}

async function walk(dir, prefix, out, depth = 0) {
	if (depth > 6) return; // 防止超深目录卡死
	for await (const [name, entry] of dir.entries()) {
		if (entry.kind === "directory") {
			if (name.startsWith(".")) continue; // 跳过 .obsidian / .git 等
			await walk(entry, `${prefix}${name}/`, out, depth + 1);
		} else if (name.toLowerCase().endsWith(".md")) {
			out.push({ path: `${prefix}${name}`, name });
		}
	}
}

/** 列出 vault 下所有 markdown 文件 */
export async function listNotes(handle) {
	const out = [];
	await walk(handle, "", out);
	out.sort((a, b) => a.path.localeCompare(b.path));
	return out;
}

/** 按相对路径取文件句柄（不存在则创建） */
async function resolveFile(root, path, create) {
	const parts = String(path || "")
		.split("/")
		.filter(Boolean);
	if (!parts.length) throw new Error("路径为空");
	let dir = root;
	for (let i = 0; i < parts.length - 1; i++) {
		dir = await dir.getDirectoryHandle(parts[i], { create: !!create });
	}
	return dir.getFileHandle(parts[parts.length - 1], { create: !!create });
}

export async function readNote(handle, path) {
	const file = await resolveFile(handle, path, false);
	const text = await file.getFile();
	return await text.text();
}

export async function writeNote(handle, path, content) {
	if (!path) throw new Error("请先选择或填写笔记路径");
	let target = path;
	if (!target.toLowerCase().endsWith(".md")) target = `${target}.md`;
	const file = await resolveFile(handle, target, true);
	const writable = await file.createWritable();
	await writable.write(content);
	await writable.close();
	return target;
}
