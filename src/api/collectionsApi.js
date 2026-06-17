const ENV_API_BASE = String(import.meta.env.VITE_DATA_API_BASE_URL || "").trim().replace(/\/+$/, "");
const ENV_API_TOKEN = String(import.meta.env.VITE_DATA_API_TOKEN || "").trim();
const ENV_COLLECTIONS_CACHE_TTL_MS = Number(import.meta.env.VITE_COLLECTIONS_CACHE_TTL_MS || 15000);
const COLLECTIONS_CACHE_TTL_MS = Number.isFinite(ENV_COLLECTIONS_CACHE_TTL_MS) ? Math.max(0, ENV_COLLECTIONS_CACHE_TTL_MS) : 15000;
const SESSION_CACHE_PREFIX = "lucia_collections_cache_v1:";

const memoryCache = new Map();
const inFlightListRequests = new Map();
const inFlightItemRequests = new Map();

// Префікси полів з динамічними ключами — їхні sub-keys не мають потрапляти в payload
const DYNAMIC_KEY_PREFIXES = [
  "pricingByRestaurantId_", "pricing_by_restaurant_id_",
  "assignmentTypes_", "assignment_types_",
  "pricingByRestaurantGroup_", "pricing_by_restaurant_group_",
];

const sanitizePayload = (data) => {
  if (!data || typeof data !== "object") return data;
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (DYNAMIC_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    out[key] = value;
  }
  return out;
};

const readRuntimeCustomConfig = () => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem("lucia_runtime_custom_config");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

const getApiBase = () => {
  const runtime = readRuntimeCustomConfig();
  const runtimeBase = String(runtime?.apiBaseUrl || "").trim().replace(/\/+$/, "");
  return runtimeBase || ENV_API_BASE;
};

const getApiToken = () => {
  const runtime = readRuntimeCustomConfig();
  const runtimeToken = String(runtime?.token || "").trim();
  return runtimeToken || ENV_API_TOKEN;
};

const getAuthSessionToken = () => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return "";
  return String(localStorage.getItem("lucia_auth_session_token") || "").trim();
};

const headers = () => {
  const next = { "Content-Type": "application/json" };
  const token = getApiToken();
  if (token) next.Authorization = `Bearer ${token}`;
  const sessionToken = getAuthSessionToken();
  if (sessionToken) next["x-session-token"] = sessionToken;
  return next;
};

const endpoint = (path) => `${getApiBase()}${path}`;

export const getCollectionsApiBase = () => getApiBase();
export const getCollectionsApiHeaders = () => headers();

const cloneData = (value) => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const buildListCacheKey = (collectionName) => `list:${String(collectionName || "").trim()}`;
const buildItemCacheKey = (collectionName, id) => `item:${String(collectionName || "").trim()}:${String(id || "").trim()}`;

const readSessionCache = (key) => {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${SESSION_CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const timestamp = Number(parsed.timestamp || 0);
    if (!Number.isFinite(timestamp)) return null;
    return {
      timestamp,
      data: parsed.data,
    };
  } catch {
    return null;
  }
};

const writeSessionCache = (key, payload) => {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`${SESSION_CACHE_PREFIX}${key}`, JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
};

const readCache = (key) => {
  if (COLLECTIONS_CACHE_TTL_MS <= 0) return null;

  const fromMemory = memoryCache.get(key) || null;
  if (fromMemory) {
    if (Date.now() - fromMemory.timestamp <= COLLECTIONS_CACHE_TTL_MS) {
      return fromMemory;
    }
    memoryCache.delete(key);
  }

  const fromSession = readSessionCache(key);
  if (!fromSession) return null;
  if (Date.now() - fromSession.timestamp > COLLECTIONS_CACHE_TTL_MS) return null;

  memoryCache.set(key, fromSession);
  return fromSession;
};

const writeCache = (key, data) => {
  if (COLLECTIONS_CACHE_TTL_MS <= 0) return;
  const payload = {
    timestamp: Date.now(),
    data,
  };
  memoryCache.set(key, payload);
  writeSessionCache(key, payload);
};

const removeCacheKey = (key) => {
  memoryCache.delete(key);
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(`${SESSION_CACHE_PREFIX}${key}`);
  } catch {
    // ignore
  }
};

const invalidateCollectionCache = (collectionName) => {
  const normalizedCollection = String(collectionName || "").trim();
  if (!normalizedCollection) return;

  const listKey = buildListCacheKey(normalizedCollection);
  removeCacheKey(listKey);

  for (const key of Array.from(memoryCache.keys())) {
    if (key.startsWith(`item:${normalizedCollection}:`)) {
      memoryCache.delete(key);
    }
  }

  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
  try {
    const keysToDelete = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const fullKey = sessionStorage.key(index);
      if (!fullKey || !fullKey.startsWith(SESSION_CACHE_PREFIX)) continue;
      const strippedKey = fullKey.slice(SESSION_CACHE_PREFIX.length);
      if (strippedKey.startsWith(`item:${normalizedCollection}:`)) {
        keysToDelete.push(fullKey);
      }
    }
    keysToDelete.forEach((fullKey) => sessionStorage.removeItem(fullKey));
  } catch {
    // ignore
  }
};

export const isCollectionsApiEnabled = () => Boolean(getApiBase());

const assertEnabled = () => {
  if (!getApiBase()) {
    throw new Error("Collections API is not enabled. Set VITE_DATA_API_BASE_URL");
  }
};

export const listCollectionItemsApi = async (collectionName) => {
  assertEnabled();
  const cacheKey = buildListCacheKey(collectionName);
  const cached = readCache(cacheKey);
  if (cached) {
    return cloneData(Array.isArray(cached.data) ? cached.data : []);
  }

  if (inFlightListRequests.has(cacheKey)) {
    const inFlightData = await inFlightListRequests.get(cacheKey);
    return cloneData(Array.isArray(inFlightData) ? inFlightData : []);
  }

  const requestPromise = (async () => {
    const response = await fetch(endpoint(`/api/collections/${encodeURIComponent(collectionName)}`), {
      method: "GET",
      headers: headers(),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`List ${collectionName} failed (${response.status}): ${body || "no body"}`);
    }
    const payload = await response.json();
    const data = Array.isArray(payload?.data) ? payload.data : [];
    writeCache(cacheKey, data);
    return data;
  })();

  inFlightListRequests.set(cacheKey, requestPromise);
  try {
    const data = await requestPromise;
    return cloneData(data);
  } finally {
    inFlightListRequests.delete(cacheKey);
  }
};

export const getCollectionItemApi = async (collectionName, id) => {
  assertEnabled();
  const cacheKey = buildItemCacheKey(collectionName, id);
  const cached = readCache(cacheKey);
  if (cached) {
    return cached.data ? cloneData(cached.data) : null;
  }

  if (inFlightItemRequests.has(cacheKey)) {
    const inFlightData = await inFlightItemRequests.get(cacheKey);
    return inFlightData ? cloneData(inFlightData) : null;
  }

  const requestPromise = (async () => {
    const response = await fetch(
      endpoint(`/api/collections/${encodeURIComponent(collectionName)}/${encodeURIComponent(String(id || ""))}`),
      { method: "GET", headers: headers() }
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Get ${collectionName}/${id} failed (${response.status}): ${body || "no body"}`);
    }
    const payload = await response.json();
    const data = payload?.data || null;
    writeCache(cacheKey, data);
    return data;
  })();

  inFlightItemRequests.set(cacheKey, requestPromise);
  try {
    const data = await requestPromise;
    return data ? cloneData(data) : null;
  } finally {
    inFlightItemRequests.delete(cacheKey);
  }
};

export const createCollectionItemApi = async (collectionName, data) => {
  assertEnabled();
  const response = await fetch(endpoint(`/api/collections/${encodeURIComponent(collectionName)}`), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(sanitizePayload(data || {})),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Create ${collectionName} failed (${response.status}): ${body || "no body"}`);
  }
  const payload = await response.json();
  invalidateCollectionCache(collectionName);
  return String(payload?.id || "");
};

export const updateCollectionItemApi = async (collectionName, id, data) => {
  assertEnabled();
  const response = await fetch(
    endpoint(`/api/collections/${encodeURIComponent(collectionName)}/${encodeURIComponent(String(id || ""))}`),
    {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(sanitizePayload(data || {})),
    }
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Update ${collectionName}/${id} failed (${response.status}): ${body || "no body"}`);
  }
  invalidateCollectionCache(collectionName);
};

export const deleteCollectionItemApi = async (collectionName, id) => {
  assertEnabled();
  const response = await fetch(
    endpoint(`/api/collections/${encodeURIComponent(collectionName)}/${encodeURIComponent(String(id || ""))}`),
    {
      method: "DELETE",
      headers: headers(),
    }
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Delete ${collectionName}/${id} failed (${response.status}): ${body || "no body"}`);
  }
  invalidateCollectionCache(collectionName);
};

export const replaceInventoryListByRestaurantApi = async (restaurantId, items = []) => {
  assertEnabled();

  const response = await fetch(
    endpoint("/api/collections/inventoryListProducts/replace-by-restaurant"),
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        restaurantId: String(restaurantId || "").trim(),
        items: Array.isArray(items) ? items : [],
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Replace inventory list failed (${response.status}): ${body || "no body"}`);
  }

  const payload = await response.json().catch(() => ({}));
  invalidateCollectionCache("inventoryListProducts");
  return {
    ok: Boolean(payload?.ok),
    deleted: Number(payload?.deleted || 0),
    created: Number(payload?.created || 0),
  };
};
