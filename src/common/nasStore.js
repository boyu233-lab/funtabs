/**
 * NAS 优先的存储层：所有数据以 NAS 上的 data/funtabs.json 为真相源，
 * 浏览器本地只保留一份缓存，供离线时读取与回写。
 *
 * 状态通过 window 上的 funtabsSync 事件广播：
 *   { status: "synced" | "offline" | "conflict" | "error" | "pending", ... }
 */
import { cacheGet, cacheSet } from "./idbCache";

const CACHE_KEY = "funtabsDoc";
const BASE_KEY = "nasBaseUrl";
const TOKEN_KEY = "nasToken";
const TIMEOUT = 8000;

export const SYNC_EVENT = "funtabsSync";

function emit(detail) {
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail }));
}

/** 未单独配置时，默认就是自托管页面自身的源 */
export function getBaseUrl() {
  const custom = localStorage.getItem(BASE_KEY);
  if (custom) return custom.replace(/\/$/, "");
  return "";
}

export function setBaseUrl(url) {
  if (url) localStorage.setItem(BASE_KEY, url.replace(/\/$/, ""));
  else localStorage.removeItem(BASE_KEY);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  const token = getToken();
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** 健康检查：判断 NAS 是否可达 */
export async function ping() {
  try {
    const res = await request(`${getBaseUrl()}/api/health`);
    if (!res.ok) return false;
    await res.json();
    return true;
  } catch (e) {
    return false;
  }
}

/** 读取：优先 NAS，失败则读本地缓存并标记离线 */
export async function load() {
  try {
    const res = await request(`${getBaseUrl()}/api/data`);
    if (!res.ok) throw new Error(`http_${res.status}`);
    const doc = await res.json();
    if (doc && doc.data) {
      await cacheSet(CACHE_KEY, doc);
      emit({ status: "synced", updatedAt: doc.updatedAt });
      return { data: doc.data, updatedAt: doc.updatedAt, offline: false };
    }
    emit({ status: "synced", updatedAt: doc && doc.updatedAt });
    return { data: null, updatedAt: doc ? doc.updatedAt : 0, offline: false };
  } catch (e) {
    const cached = await cacheGet(CACHE_KEY);
    if (cached && cached.data) {
      emit({ status: "offline", updatedAt: cached.updatedAt });
      return {
        data: cached.data,
        updatedAt: cached.updatedAt,
        offline: true,
      };
    }
    emit({ status: "error", message: e.message });
    return { data: null, updatedAt: 0, offline: true };
  }
}

/**
 * 保存：先落本地缓存保证离线不丢，再回写 NAS。
 * 返回 { ok, offline, conflict, server }
 */
export async function save(data, updatedAt = 0, force = false) {
  const local = { data, updatedAt: updatedAt || Date.now() };
  await cacheSet(CACHE_KEY, { ...local, updatedAt: Date.now() });
  try {
    const res = await request(
      `${getBaseUrl()}/api/data${force ? "?force=1" : ""}`,
      {
        method: "PUT",
        body: JSON.stringify({ data, updatedAt }),
      }
    );
    if (res.status === 409) {
      const body = await res.json();
      emit({ status: "conflict", server: body.server });
      return { ok: false, conflict: true, server: body.server, offline: false };
    }
    if (!res.ok) throw new Error(`http_${res.status}`);
    const doc = await res.json();
    await cacheSet(CACHE_KEY, doc);
    emit({ status: "synced", updatedAt: doc.updatedAt });
    return { ok: true, updatedAt: doc.updatedAt, offline: false };
  } catch (e) {
    // 离线：数据已在本地缓存，联网后由 retrySync 补写
    emit({ status: "pending", message: e.message });
    return { ok: false, offline: true };
  }
}

/** 恢复联网后把本地缓存补写回 NAS */
export async function retrySync() {
  const cached = await cacheGet(CACHE_KEY);
  if (!cached || !cached.data) return { ok: false, reason: "no_cache" };
  const alive = await ping();
  if (!alive) return { ok: false, reason: "offline" };
  return save(cached.data, cached.updatedAt);
}

/** 上传图片到 NAS，返回可持久化的 URL；离线时退回 dataURL */
export async function uploadImage(dataUrl, name = "upload") {
  try {
    const res = await request(`${getBaseUrl()}/api/upload`, {
      method: "POST",
      body: JSON.stringify({ name, dataUrl }),
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const body = await res.json();
    return { url: body.url, offline: false };
  } catch (e) {
    return { url: dataUrl, offline: true };
  }
}

window.addEventListener("online", () => {
  retrySync();
});
