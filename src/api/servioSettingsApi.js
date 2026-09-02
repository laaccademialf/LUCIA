// Клієнт для роботи з Servio (MS SQL) через migration-сервер.
// Перевикористовує ту саму baseUrl + auth, що й інші налаштування.

const normalizeApiBase = (value) => String(value || "").trim().replace(/\/+$/, "").replace(/\/api$/i, "");
const ENV_BASE = normalizeApiBase(import.meta.env.VITE_DATA_API_BASE_URL || "");
const ENV_TOKEN = String(import.meta.env.VITE_DATA_API_TOKEN || "").trim();

const readRuntime = () => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem("lucia_runtime_custom_config");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

const getApiBase = () => {
  const runtime = readRuntime();
  const runtimeBase = normalizeApiBase(runtime?.apiBaseUrl || "");
  const originBase =
    typeof window !== "undefined" && window.location?.origin
      ? normalizeApiBase(window.location.origin)
      : "";
  return runtimeBase || ENV_BASE || originBase;
};

const getApiToken = () => {
  const runtime = readRuntime();
  return String(runtime?.token || "").trim() || ENV_TOKEN;
};

const buildHeaders = () => {
  const headers = { "Content-Type": "application/json" };
  const token = getApiToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const sessionToken =
    typeof window !== "undefined" && typeof localStorage !== "undefined"
      ? String(localStorage.getItem("lucia_auth_session_token") || "").trim()
      : "";
  if (sessionToken) headers["x-session-token"] = sessionToken;
  return headers;
};

const requireBase = () => {
  const base = getApiBase();
  if (!base) throw new Error("API не налаштовано. Встановіть VITE_DATA_API_BASE_URL.");
  return base;
};

export const isServioApiEnabled = () => Boolean(getApiBase());

export const getServioSettings = async () => {
  const base = requireBase();
  const r = await fetch(`${base}/api/settings/servio`, { headers: buildHeaders() });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json?.ok) throw new Error(json?.error || `HTTP ${r.status}`);
  return json;
};

export const saveServioSettings = async ({ host, port, database, user, password, mapping }) => {
  const base = requireBase();
  const body = { host, port, database, user };
  if (password !== undefined) body.password = password;
  if (mapping !== undefined) body.mapping = mapping;
  const r = await fetch(`${base}/api/settings/servio`, {
    method: "PUT",
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json?.ok) throw new Error(json?.error || `HTTP ${r.status}`);
  return json;
};

export const testServioConnection = async (override) => {
  const base = requireBase();
  const r = await fetch(`${base}/api/settings/servio/test`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(override || {}),
  });
  const json = await r.json().catch(() => null);
  if (!json || typeof json !== "object") throw new Error(`HTTP ${r.status}: невалідна відповідь`);
  return json;
};

export const syncServioRestaurants = async () => {
  const base = requireBase();
  const r = await fetch(`${base}/api/servio/restaurants`, { headers: buildHeaders() });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json?.ok) throw new Error(json?.error || `HTTP ${r.status}`);
  return Array.isArray(json.restaurants) ? json.restaurants : [];
};

// startDate/endDate — рядки. Приклади: "2026-08-01", "20260801 23:59:59".
// restCode — CSV з BaseExternalID (порожній рядок = всі ресторани).
export const fetchServioSales = async ({ startDate, endDate, restCode } = {}) => {
  const base = requireBase();
  const r = await fetch(`${base}/api/servio/sales`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ startDate, endDate, restCode: restCode ?? "" }),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json?.ok) throw new Error(json?.error || `HTTP ${r.status}`);
  return Array.isArray(json.rows) ? json.rows : [];
};
