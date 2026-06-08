// Клієнт для /api/settings/viksoft (керування з UI).
// Перевикористовує ту саму baseUrl + auth, що й energoCenterApi.

const ENV_BASE = String(import.meta.env.VITE_DATA_API_BASE_URL || "").trim().replace(/\/+$/, "");
const ENV_TOKEN = String(import.meta.env.VITE_DATA_API_TOKEN || "").trim();

const readRuntime = () => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem("lucia_runtime_custom_config");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

const getApiBase = () => {
  const runtime = readRuntime();
  const runtimeBase = String(runtime?.apiBaseUrl || "").trim().replace(/\/+$/, "");
  return runtimeBase || ENV_BASE;
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

const formatRouteError = (status, error, route) => {
  const baseError = String(error || `HTTP ${status}`).trim();
  if (status === 404 || /^not found$/i.test(baseError)) {
    return `${baseError} (ендпоінт ${route} відсутній на бекенді — онови і перезапусти migration-сервер)`;
  }
  return baseError;
};

export const getVikSoftSettings = async () => {
  const base = requireBase();
  const r = await fetch(`${base}/api/settings/viksoft`, { headers: buildHeaders() });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json?.ok) {
    throw new Error(formatRouteError(r.status, json?.error, "/api/settings/viksoft"));
  }
  return json;
};

export const saveVikSoftSettings = async ({ apiBase, user, password }) => {
  const base = requireBase();
  // Якщо password === undefined → сервер залишить попередній.
  const body = { apiBase, user };
  if (password !== undefined) body.password = password;
  const r = await fetch(`${base}/api/settings/viksoft`, {
    method: "PUT",
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json?.ok) {
    throw new Error(formatRouteError(r.status, json?.error, "/api/settings/viksoft"));
  }
  return json;
};

export const testVikSoftConnection = async (override) => {
  const base = requireBase();
  const r = await fetch(`${base}/api/settings/viksoft/test`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(override || {}),
  });
  const json = await r.json().catch(() => null);
  if (!json || typeof json !== "object") {
    throw new Error(`HTTP ${r.status}: невалідна відповідь`);
  }
  if (r.status === 404 || /^not found$/i.test(String(json?.error || "").trim())) {
    return {
      ok: false,
      stage: "backend_route",
      error: formatRouteError(r.status, json?.error, "/api/settings/viksoft/test"),
    };
  }
  return json; // { ok, tokenPreview?, error?, apiBase?, user? }
};

export const getVikSoftDebug = async ({ eic, date } = {}) => {
  const base = requireBase();
  const qs = new URLSearchParams();
  if (eic) qs.set("eic", String(eic));
  if (date) qs.set("date", String(date));
  const url = `${base}/api/energocenter/debug${qs.toString() ? `?${qs.toString()}` : ""}`;
  const r = await fetch(url, { headers: buildHeaders() });
  const json = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(formatRouteError(r.status, json?.error, "/api/energocenter/debug"));
  }
  return json;
};
