const normalizeApiBase = (value) => String(value || "").trim().replace(/\/+$/, "").replace(/\/api$/i, "");
const ENV_METRO_BASE = normalizeApiBase(import.meta.env.VITE_METRO_API_BASE_URL || "");
const ENV_API_BASE = normalizeApiBase(import.meta.env.VITE_DATA_API_BASE_URL || "");
const ENV_API_TOKEN = String(import.meta.env.VITE_DATA_API_TOKEN || "").trim();

const readRuntime = () => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem("lucia_runtime_custom_config");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const getApiBase = () => {
  if (ENV_METRO_BASE) return ENV_METRO_BASE;
  const runtime = readRuntime();
  const runtimeBase = normalizeApiBase(runtime?.apiBaseUrl || "");
  return runtimeBase || ENV_API_BASE;
};

const getApiToken = () => {
  const runtime = readRuntime();
  return String(runtime?.token || "").trim() || ENV_API_TOKEN;
};

const getSessionToken = () => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return "";
  return String(localStorage.getItem("lucia_auth_session_token") || "").trim();
};

const buildHeaders = () => {
  const headers = { "Content-Type": "application/json" };
  const apiToken = getApiToken();
  const sessionToken = getSessionToken();
  if (apiToken) headers.Authorization = `Bearer ${apiToken}`;
  if (sessionToken) headers["x-session-token"] = sessionToken;
  return headers;
};

export const isMetroApiEnabled = () => Boolean(getApiBase());

export const fetchMetroProducts = async ({ email, password, query, limit = 50, manual = false, signal } = {}) => {
  const base = getApiBase();
  if (!base) {
    throw new Error("API не налаштовано. Встановіть VITE_DATA_API_BASE_URL");
  }

  const response = await fetch(`${base}/api/metro/search`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
      email: String(email || "").trim(),
      password: String(password || ""),
      query: String(query || "").trim(),
      limit: Math.max(1, Math.min(200, Number(limit) || 50)),
      manual: Boolean(manual),
    }),
    signal,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!payload || typeof payload !== "object") {
    throw new Error(`HTTP ${response.status}: невалідна відповідь сервера`);
  }

  if (!response.ok) {
    return {
      ok: false,
      fetchedAt: payload.fetchedAt || new Date().toISOString(),
      rows: Array.isArray(payload.rows) ? payload.rows : [],
      error: payload.error || `HTTP ${response.status}`,
      diagnostics: payload.diagnostics || null,
      sourceUrl: payload.sourceUrl || "",
    };
  }

  return payload;
};
