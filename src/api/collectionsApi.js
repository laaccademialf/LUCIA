const ENV_API_BASE = String(import.meta.env.VITE_DATA_API_BASE_URL || "").trim().replace(/\/+$/, "");
const ENV_API_TOKEN = String(import.meta.env.VITE_DATA_API_TOKEN || "").trim();

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

export const isCollectionsApiEnabled = () => Boolean(getApiBase());

const assertEnabled = () => {
  if (!getApiBase()) {
    throw new Error("Collections API is not enabled. Set VITE_DATA_API_BASE_URL");
  }
};

export const listCollectionItemsApi = async (collectionName) => {
  assertEnabled();
  const response = await fetch(endpoint(`/api/collections/${encodeURIComponent(collectionName)}`), {
    method: "GET",
    headers: headers(),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`List ${collectionName} failed (${response.status}): ${body || "no body"}`);
  }
  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
};

export const getCollectionItemApi = async (collectionName, id) => {
  assertEnabled();
  const response = await fetch(
    endpoint(`/api/collections/${encodeURIComponent(collectionName)}/${encodeURIComponent(String(id || ""))}`),
    { method: "GET", headers: headers() }
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Get ${collectionName}/${id} failed (${response.status}): ${body || "no body"}`);
  }
  const payload = await response.json();
  return payload?.data || null;
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
  return {
    ok: Boolean(payload?.ok),
    deleted: Number(payload?.deleted || 0),
    created: Number(payload?.created || 0),
  };
};
