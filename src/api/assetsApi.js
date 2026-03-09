const ENV_API_BASE = String(import.meta.env.VITE_DATA_API_BASE_URL || "").trim().replace(/\/+$/, "");
const ENV_API_TOKEN = String(import.meta.env.VITE_DATA_API_TOKEN || "").trim();

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

const headers = () => {
  const next = { "Content-Type": "application/json" };
  const token = getApiToken();
  if (token) {
    next.Authorization = `Bearer ${token}`;
  }
  return next;
};

const endpoint = (path) => `${getApiBase()}${path}`;

export const isAssetsApiEnabled = () => Boolean(getApiBase());

export const getAssetsApi = async () => {
  const response = await fetch(endpoint("/api/assets"), {
    method: "GET",
    headers: headers(),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Assets API GET failed (${response.status}): ${body || "no body"}`);
  }
  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
};

export const addAssetApi = async (asset) => {
  const response = await fetch(endpoint("/api/assets"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(asset || {}),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Assets API POST failed (${response.status}): ${body || "no body"}`);
  }
  const payload = await response.json();
  return String(payload?.id || "");
};

export const updateAssetApi = async (id, data) => {
  const response = await fetch(endpoint(`/api/assets/${encodeURIComponent(String(id || ""))}`), {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(data || {}),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Assets API PUT failed (${response.status}): ${body || "no body"}`);
  }
};

export const deleteAssetApi = async (id) => {
  const response = await fetch(endpoint(`/api/assets/${encodeURIComponent(String(id || ""))}`), {
    method: "DELETE",
    headers: headers(),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Assets API DELETE failed (${response.status}): ${body || "no body"}`);
  }
};
