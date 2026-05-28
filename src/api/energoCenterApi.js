// Клієнт для GET /api/energocenter/consumption.
// Використовує власну змінну VITE_ENERGOCENTER_API_BASE_URL з фолбеком на VITE_DATA_API_BASE_URL.
const ENV_ENERGOCENTER_BASE = String(import.meta.env.VITE_ENERGOCENTER_API_BASE_URL || "").trim().replace(/\/+$/, "");
const ENV_API_BASE = String(import.meta.env.VITE_DATA_API_BASE_URL || "").trim().replace(/\/+$/, "");
const ENV_API_TOKEN = String(import.meta.env.VITE_DATA_API_TOKEN || "").trim();

const readRuntime = () => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem("lucia_runtime_custom_config");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

const getApiBase = () => {
  if (ENV_ENERGOCENTER_BASE) return ENV_ENERGOCENTER_BASE;
  const runtime = readRuntime();
  const runtimeBase = String(runtime?.apiBaseUrl || "").trim().replace(/\/+$/, "");
  return runtimeBase || ENV_API_BASE;
};

const getApiToken = () => {
  const runtime = readRuntime();
  return String(runtime?.token || "").trim() || ENV_API_TOKEN;
};

export const isEnergoCenterApiEnabled = () => Boolean(getApiBase());

export const fetchEnergoCenterConsumption = async ({ signal, date, force, login, password, treeText } = {}) => {
  const base = getApiBase();
  if (!base) {
    throw new Error("API не налаштовано. Встановіть VITE_DATA_API_BASE_URL");
  }
  const headers = { "Content-Type": "application/json" };
  const token = getApiToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const sessionToken =
    typeof window !== "undefined" && typeof localStorage !== "undefined"
      ? String(localStorage.getItem("lucia_auth_session_token") || "").trim()
      : "";
  if (sessionToken) headers["x-session-token"] = sessionToken;

  // Облікові дані ресторану. Кодуємо у base64, бо логін/пароль/назва
  // можуть містити кирилицю або символи, недопустимі у HTTP-заголовках.
  const enc = (v) => {
    const s = String(v ?? "").trim();
    if (!s) return "";
    if (typeof btoa === "function") {
      try { return `b64:${btoa(unescape(encodeURIComponent(s)))}`; } catch { /* fallthrough */ }
    }
    return s;
  };
  const loginEnc = enc(login);
  const passEnc = password ? `b64:${typeof btoa === "function" ? btoa(unescape(encodeURIComponent(String(password)))) : String(password)}` : "";
  const treeEnc = enc(treeText);
  if (loginEnc) headers["x-energo-login"] = loginEnc;
  if (passEnc) headers["x-energo-password"] = passEnc;
  if (treeEnc) headers["x-energo-tree"] = treeEnc;

  const qs = new URLSearchParams();
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) qs.set("date", date);
  if (force) qs.set("force", "1");
  const url = `${base}/api/energocenter/consumption${qs.toString() ? `?${qs.toString()}` : ""}`;

  const response = await fetch(url, {
    method: "GET",
    headers,
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
    const baseErr = payload.error || `HTTP ${response.status}`;
    return {
      ok: false,
      fetchedAt: payload.fetchedAt || new Date().toISOString(),
      sourceUrl: payload.sourceUrl,
      rows: Array.isArray(payload.rows) ? payload.rows : [],
      error: response.status === 404
        ? `${baseErr} (ендпоінт /api/energocenter/consumption відсутній — перезапустіть migration-сервер)`
        : `${baseErr} (HTTP ${response.status})`,
    };
  }
  return payload;
};

const DIRECTIONS = ["A+", "A-", "R+", "R-"];

export const summarizeRowsByDirection = (rows) => {
  const totals = Object.fromEntries(DIRECTIONS.map((d) => [d, 0]));
  if (!Array.isArray(rows)) return totals;
  for (const row of rows) {
    const dir = String(row?.direction || "").trim();
    if (!DIRECTIONS.includes(dir)) continue;
    const v = typeof row?.consumption === "number" ? row.consumption : Number(row?.consumption);
    if (!Number.isFinite(v)) continue;
    totals[dir] += v;
  }
  return totals;
};

export const ENERGOCENTER_DIRECTIONS = DIRECTIONS;
