// Клієнт для /api/settings/viksoft (керування з UI).
// Перевикористовує ту саму baseUrl + auth, що й energoCenterApi.

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

export const getVikSoftApiClientContext = () => {
  const runtime = readRuntime();
  const runtimeBase = normalizeApiBase(runtime?.apiBaseUrl || "");
  const envBase = normalizeApiBase(ENV_BASE || "");
  const resolvedBase = runtimeBase || envBase;
  return {
    resolvedBase,
    source: runtimeBase ? "runtime" : "env",
    hasRuntimeOverride: Boolean(runtimeBase),
    hasSessionToken: Boolean(
      typeof window !== "undefined" && typeof localStorage !== "undefined"
        ? String(localStorage.getItem("lucia_auth_session_token") || "").trim()
        : ""
    ),
  };
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
  const ctx = getVikSoftApiClientContext();
  const suffix = ctx.resolvedBase
    ? ` [backend: ${ctx.resolvedBase}, source: ${ctx.source}]`
    : "";
  if (status === 404 || /^not found$/i.test(baseError)) {
    return `${baseError} (ендпоінт ${route} відсутній на бекенді — онови і перезапусти migration-сервер)${suffix}`;
  }
  return `${baseError}${suffix}`;
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
      client: getVikSoftApiClientContext(),
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

// Mapping Module: список лічильників з Vik-Soft (nodename + eiccode) для мапінгу на заклади.
export const getVikSoftMeters = async () => {
  const base = requireBase();
  const r = await fetch(`${base}/api/energocenter/meters`, { headers: buildHeaders() });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json?.ok) {
    throw new Error(formatRouteError(r.status, json?.error, "/api/energocenter/meters"));
  }
  return json; // { ok, meters: [{ nodename, eiccode, idnode, objref }], summary }
};

// Data Fetcher: ручний запуск синхронізації споживання (одна доба або діапазон from/to).
export const triggerVikSoftSync = async ({ date, from, to, force = false } = {}) => {
  const base = requireBase();
  const payload = {};
  if (date) payload.date = String(date);
  if (from) payload.from = String(from);
  if (to) payload.to = String(to);
  if (force) payload.force = true;
  const r = await fetch(`${base}/api/energocenter/sync`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json?.ok) {
    throw new Error(formatRouteError(r.status, json?.error, "/api/energocenter/sync"));
  }
  return json; // { ok, days, okCount, errCount, results }
};
