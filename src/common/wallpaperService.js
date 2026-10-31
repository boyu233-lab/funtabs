/**
 * 壁纸服务：直接取网络图片，只保存 URL，不再把 base64 塞进 localStorage。
 *
 * 优先级：
 *   1. NAS 后端代理的 Bing 每日图（解决跨域，且是同一套自托管服务）
 *   2. 代理不可用（纯静态部署）时回退 Picsum 随机图
 *   3. 完全离线时用上次缓存的 URL，界面不空白
 */
import { getBaseUrl, getToken } from "./nasStore";

const CACHE_KEY = "dailyWallpaper";
const FALLBACK = "https://picsum.photos/1920/1080";
const TIMEOUT = 8000;

function readCache() {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch (e) {
		return null;
	}
}

function writeCache(payload) {
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
	} catch (e) {
		// ignore
	}
}

async function jsonWithTimeout(url) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT);
	try {
		const res = await fetch(url, {
			signal: controller.signal,
			headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
		});
		if (!res.ok) throw new Error(`http_${res.status}`);
		return await res.json();
	} finally {
		clearTimeout(timer);
	}
}

/**
 * 获取今日壁纸。
 * 返回 { url, title, copyright, offline, stale, source }
 */
export async function getDailyWallpaper(options = {}) {
	const day = options.day || 0;
	const cached = readCache();
	const cachedToday =
		cached && cached.date === new Date().toISOString().slice(0, 10);

	if (cachedToday && !options.force) {
		return { ...cached, offline: false, stale: false };
	}

	// 1) NAS 代理的 Bing 每日图
	try {
		const body = await jsonWithTimeout(
			`${getBaseUrl()}/api/wallpaper/bing?day=${day}`
		);
		if (body && body.url) {
			const payload = {
				url: body.url,
				title: body.title,
				copyright: body.copyright,
				date: new Date().toISOString().slice(0, 10),
				source: "bing",
			};
			writeCache(payload);
			return { ...payload, offline: false, stale: false };
		}
	} catch (e) {
		// 落到下一步兜底
	}

	// 2) 无后端或后端失败：用可跨域的随机图源
	try {
		const url = `${FALLBACK}?${Date.now()}`;
		await preloadImage(url);
		const payload = {
			url,
			title: "",
			copyright: "",
			date: new Date().toISOString().slice(0, 10),
			source: "picsum",
		};
		writeCache(payload);
		return { ...payload, offline: false, stale: false };
	} catch (e) {
		// 3) 完全离线：用缓存兜底
		if (cached && cached.url) {
			return {
				...cached,
				offline: true,
				stale: true,
				error: "offline_using_cache",
			};
		}
		return { url: "", offline: true, stale: true, error: "no_wallpaper" };
	}
}

/** 预加载，避免切换壁纸时出现白屏闪烁 */
export function preloadImage(url) {
	return new Promise((resolve, reject) => {
		if (!url) return reject(new Error("empty_url"));
		const img = new Image();
		img.onload = () => resolve(url);
		img.onerror = () => reject(new Error("load_failed"));
		img.src = url;
	});
}

/** 取缓存（供首屏同步渲染，减少闪一下默认背景） */
export function getCachedWallpaper() {
	return readCache();
}
