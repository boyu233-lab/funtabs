/**
 * 天气服务：直接调用公网 Open-Meteo（免费、无需 API key、允许 CORS）。
 *
 * 设计要点：
 * 1. 多个天气卡片共享同一份数据与同一个轮询定时器，不再各自 setInterval。
 * 2. 数据带 localStorage 缓存，离线时返回上次结果并标记 stale，界面不报错。
 */
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL = 10 * 60 * 1000; // 10 分钟
const POLL_INTERVAL = 10 * 60 * 1000;

/** WMO 天气代码 -> 中文描述 + emoji 图标 */
const WMO_MAP = {
	0: ["晴", "☀️"],
	1: ["晴间少云", "🌤️"],
	2: ["多云", "⛅"],
	3: ["阴", "☁️"],
	45: ["雾", "🌫️"],
	48: ["雾凇", "🌫️"],
	51: ["毛毛雨", "🌦️"],
	53: ["小雨", "🌦️"],
	55: ["中雨", "🌧️"],
	56: ["冻毛毛雨", "🌧️"],
	57: ["冻雨", "🌧️"],
	61: ["小雨", "🌦️"],
	63: ["中雨", "🌧️"],
	65: ["大雨", "🌧️"],
	66: ["冻雨", "🌧️"],
	67: ["冻雨", "🌧️"],
	71: ["小雪", "🌨️"],
	73: ["中雪", "🌨️"],
	75: ["大雪", "❄️"],
	77: ["米雪", "🌨️"],
	80: ["阵雨", "🌦️"],
	81: ["阵雨", "🌧️"],
	82: ["强阵雨", "⛈️"],
	85: ["小阵雪", "🌨️"],
	86: ["大阵雪", "❄️"],
	95: ["雷阵雨", "⛈️"],
	96: ["雷阵雨伴冰雹", "⛈️"],
	99: ["雷阵雨伴冰雹", "⛈️"],
};

export function wmoToText(code) {
	const hit = WMO_MAP[Number(code)];
	return hit ? hit[0] : "未知";
}

export function wmoToIcon(code) {
	const hit = WMO_MAP[Number(code)];
	return hit ? hit[1] : "🌡️";
}

/** 蒲福风级 */
function windLevel(speedKmh) {
	const s = Number(speedKmh) || 0;
	if (s < 1) return "0级";
	if (s < 6) return "1级";
	if (s < 12) return "2级";
	if (s < 20) return "3级";
	if (s < 29) return "4级";
	if (s < 39) return "5级";
	if (s < 50) return "6级";
	if (s < 62) return "7级";
	if (s < 75) return "8级";
	return "9级以上";
}

function windDirection(deg) {
	const d = Number(deg) || 0;
	const names = [
		"北风",
		"东北风",
		"东风",
		"东南风",
		"南风",
		"西南风",
		"西风",
		"西北风",
	];
	return names[Math.round(d / 45) % 8];
}

const cacheKey = (city) => `om_weather_${city}`;

function readCache(city) {
	try {
		const raw = localStorage.getItem(cacheKey(city));
		return raw ? JSON.parse(raw) : null;
	} catch (e) {
		return null;
	}
}

function writeCache(city, payload) {
	try {
		localStorage.setItem(cacheKey(city), JSON.stringify(payload));
	} catch (e) {
		// 存储写满时忽略，不影响使用
	}
}

/**
 * 城市搜索（用于输入框自动补全），同样走 Open-Meteo，不依赖任何第三方服务。
 * 返回 [{ value, label }]
 */
export async function searchCity(keyword) {
	if (!keyword || !keyword.trim()) return [];
	try {
		const res = await fetch(
			`${GEO_URL}?name=${encodeURIComponent(keyword.trim())}&count=8&language=zh&format=json`
		);
		if (!res.ok) throw new Error(`geo_http_${res.status}`);
		const body = await res.json();
		const results = body.results || [];
		return results.map((item) => {
			const region = [item.admin1, item.country].filter(Boolean).join(" · ");
			return {
				value: item.name,
				label: region ? `${item.name}（${region}）` : item.name,
			};
		});
	} catch (e) {
		return [];
	}
}

/** 城市名 -> 经纬度（带缓存） */
async function geocode(city) {
	const geoCacheKey = `om_geo_${city}`;
	try {
		const cached = localStorage.getItem(geoCacheKey);
		if (cached) return JSON.parse(cached);
	} catch (e) {
		// ignore
	}
	const res = await fetch(
		`${GEO_URL}?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`
	);
	if (!res.ok) throw new Error(`geo_http_${res.status}`);
	const body = await res.json();
	if (!body.results || !body.results.length) {
		throw new Error("city_not_found");
	}
	const hit = body.results[0];
	const point = {
		latitude: hit.latitude,
		longitude: hit.longitude,
		name: hit.name,
	};
	try {
		localStorage.setItem(geoCacheKey, JSON.stringify(point));
	} catch (e) {
		// ignore
	}
	return point;
}

/**
 * 拉取天气。
 * 返回 { data, stale, offline, updatedAt }
 * data: { city, temp, feelsLike, humidity, weather, icon, wind, windLevel, max, min }
 */
export async function fetchWeather(city, options = {}) {
	if (!city) return { data: null, stale: false, offline: false };
	const cached = readCache(city);
	const fresh = cached && Date.now() - cached.updatedAt < CACHE_TTL;
	if (fresh && !options.force) {
		return { data: cached.data, stale: false, offline: false, updatedAt: cached.updatedAt };
	}

	try {
		const point = await geocode(city);
		const res = await fetch(
			`${FORECAST_URL}?latitude=${point.latitude}&longitude=${point.longitude}` +
				`&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m` +
				`&daily=temperature_2m_max,temperature_2m_min,weather_code` +
				`&timezone=auto&forecast_days=2`
		);
		if (!res.ok) throw new Error(`wx_http_${res.status}`);
		const body = await res.json();
		const cur = body.current || {};
		const daily = body.daily || {};
		const code = cur.weather_code;
		const data = {
			city: point.name || city,
			temp: Math.round(cur.temperature_2m),
			feelsLike: Math.round(cur.apparent_temperature),
			humidity: cur.relative_humidity_2m,
			weather: wmoToText(code),
			icon: wmoToIcon(code),
			weatherType: String(code == null ? "" : code),
			wind: windDirection(cur.wind_direction_10m),
			windLevel: windLevel(cur.wind_speed_10m),
			windSpeed: Math.round(cur.wind_speed_10m),
			max: daily.temperature_2m_max ? Math.round(daily.temperature_2m_max[0]) : "",
			min: daily.temperature_2m_min ? Math.round(daily.temperature_2m_min[0]) : "",
		};
		const payload = { data, updatedAt: Date.now() };
		writeCache(city, payload);
		return { data, stale: false, offline: false, updatedAt: payload.updatedAt };
	} catch (e) {
		// 离线或接口异常：降级用缓存，界面照常显示，只是标记为旧数据
		if (cached && cached.data) {
			return {
				data: cached.data,
				stale: true,
				offline: !navigator.onLine,
				updatedAt: cached.updatedAt,
				error: e.message,
			};
		}
		return { data: null, stale: false, offline: !navigator.onLine, error: e.message };
	}
}

/* ---------------- 共享订阅：所有天气卡片共用一份轮询 ---------------- */

const subscribers = new Map(); // city -> Set<fn>
const latest = new Map(); // city -> 结果
let pollTimer = null;

async function refreshCity(city) {
	const result = await fetchWeather(city);
	latest.set(city, result);
	const subs = subscribers.get(city);
	if (subs) subs.forEach((fn) => fn(result));
	return result;
}

function ensurePolling() {
	if (pollTimer) return;
	pollTimer = setInterval(() => {
		subscribers.forEach((_subs, city) => {
			refreshCity(city);
		});
	}, POLL_INTERVAL);
}

/**
 * 订阅某城市的天气。返回取消订阅函数。
 * 会立即用缓存渲染一次，再异步刷新。
 */
export function subscribeWeather(city, callback) {
	if (!city) return () => {};
	if (!subscribers.has(city)) subscribers.set(city, new Set());
	subscribers.get(city).add(callback);

	const cached = latest.get(city) || readCache(city);
	if (cached) {
		callback(
			latest.get(city) || {
				data: cached.data,
				stale: true,
				offline: !navigator.onLine,
				updatedAt: cached.updatedAt,
			}
		);
	}
	refreshCity(city);
	ensurePolling();

	return () => {
		const set = subscribers.get(city);
		if (!set) return;
		set.delete(callback);
		if (set.size === 0) {
			subscribers.delete(city);
		}
		if (subscribers.size === 0 && pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	};
}
