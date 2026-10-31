/**
 * 自托管场景下的统一数据出入口
 *
 * 背景：NAS 上的 data/funtabs.json 是唯一真相源，页面启动时它会覆盖浏览器本地数据。
 * 因此任何"导入/恢复/重置"操作，如果只写 localStorage 而不回写 NAS，
 * 刷新后就会被 NAS 上的旧数据覆盖，表现为"导入无效"。
 * 这里把"写本地 + 强制推送 NAS"封装成一个动作，供备份恢复、书签导入、重置等复用。
 */
import { getBaseUrl, getToken, load as nasLoad, save as nasSave } from "./nasStore";

export const DOC_KEY = "funtabs";

/** 读取本地快照中的 newData（书签与布局配置） */
export function readLocalNewData() {
	try {
		const raw = localStorage.getItem(DOC_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		return parsed && parsed.newData ? parsed.newData : null;
	} catch (e) {
		return null;
	}
}

/** 把 newData 写回本地快照 */
export function writeLocalNewData(newData) {
	localStorage.setItem(DOC_KEY, JSON.stringify({ newData }));
	localStorage.setItem("saveTime", String(Date.now()));
}

/**
 * 把当前本地快照强制推送到 NAS。
 * force=true 表示忽略冲突直接覆盖——导入/恢复/重置都是用户显式意图，应当覆盖。
 * @returns {Promise<{ok:boolean, offline?:boolean, message?:string}>}
 */
export async function pushToNas(newData) {
	const data = newData || readLocalNewData();
	if (!data) return { ok: false, message: "本地没有可同步的数据" };
	writeLocalNewData(data);
	try {
		const res = await nasSave(data, 0, true);
		if (res.ok) return { ok: true };
		if (res.offline)
			return {
				ok: false,
				offline: true,
				message: "已保存到本机，联网后会自动补传到 NAS",
			};
		return { ok: false, message: "写入 NAS 失败，请检查服务地址与 Token" };
	} catch (e) {
		return { ok: false, offline: true, message: `写入 NAS 失败：${e.message}` };
	}
}

/**
 * 以 NAS 为真相源拉取最新数据，并同步到本地快照。
 * 导出前调用，保证导出的不是本机陈旧缓存。
 * @returns {Promise<{data:object|null, offline:boolean}>}
 */
export async function pullFromNas() {
	try {
		const res = await nasLoad();
		if (res && res.data && !res.offline) {
			writeLocalNewData(res.data);
			return { data: res.data, offline: false };
		}
		return { data: readLocalNewData(), offline: !!(res && res.offline) };
	} catch (e) {
		return { data: readLocalNewData(), offline: true };
	}
}

/**
 * 直接导出 NAS 上的原始文件（YAML / JSON），不经过 localStorage。
 * 相比本地导出，这个拿到的永远是真相源，也最适合放进 git 做版本管理。
 */
export async function downloadRawFromNas(format = "yaml") {
	const res = await apiRequest(`/api/data/raw?format=${format}`, {
		method: "GET",
	});
	if (!res.ok) throw new Error(`导出失败：HTTP ${res.status}`);
	const text = await res.text();
	const dispo = res.headers.get("content-disposition") || "";
	const match = /filename="([^"]+)"/.exec(dispo);
	const name = match ? match[1] : `xtab-${Date.now()}.${format}`;
	const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
	return name;
}

/**
 * 把 YAML / JSON 文本直接写入 NAS（服务端解析并校验，不依赖本地状态）。
 * 这是最可靠的导入方式：写完刷新即可，不会被本地旧缓存覆盖。
 */
export async function importRawToNas(content, format = "yaml") {
	const res = await apiRequest("/api/data/import", {
		method: "POST",
		body: JSON.stringify({ content, format }),
	});
	let body = null;
	try {
		body = await res.json();
	} catch (e) {
		/* 忽略 */
	}
	if (!res.ok || !body || !body.ok) {
		throw new Error(
			(body && (body.message || body.error)) || `导入失败：HTTP ${res.status}`
		);
	}
	return body;
}

/** 带 Token 的请求封装（与前端自托管配置保持一致） */
async function apiRequest(url, options = {}) {
	const base = getBaseUrl();
	const headers = { "Content-Type": "application/json" };
	const token = getToken();
	if (token) headers.Authorization = `Bearer ${token}`;
	return fetch(`${base}${url}`, { ...options, headers });
}

/** 生成 Windows 也合法的文件名时间戳：2026-10-31_19-20-33 */
export function timestampForFile(d = new Date()) {
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(
		d.getHours()
	)}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/**
 * 校验导入的数据结构是否可用
 * @returns {{ok:boolean, reason?:string, newData?:object}}
 */
export function validateImport(raw) {
	let parsed;
	try {
		parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
	} catch (e) {
		return { ok: false, reason: "不是合法的 JSON 文本" };
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return { ok: false, reason: "数据格式错误，应该是 JSON 对象" };
	}
	// 备份文件格式：{ funtabs: "{\"newData\": ...}" }
	if (parsed.funtabs) {
		let inner;
		try {
			inner =
				typeof parsed.funtabs === "string"
					? JSON.parse(parsed.funtabs)
					: parsed.funtabs;
		} catch (e) {
			return { ok: false, reason: "备份中的 funtabs 字段无法解析" };
		}
		if (!inner || !inner.newData) {
			return { ok: false, reason: "备份缺少 newData 字段" };
		}
		return { ok: true, newData: inner.newData, settings: parsed };
	}
	// 也允许直接导入 { newData: ... } 或 { content: [...] }
	if (parsed.newData) return { ok: true, newData: parsed.newData, settings: null };
	if (Array.isArray(parsed.content))
		return { ok: true, newData: parsed, settings: null };
	return { ok: false, reason: "未识别的数据结构（需包含 funtabs 或 newData）" };
}
