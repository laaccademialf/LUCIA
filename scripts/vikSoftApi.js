// Vik-Soft API client (заміна Playwright-скрейпера seraskoe.tech).
//
// Endpoints (з https://vik-soft.com.ua/apidoc/):
//   POST /api/v1/login?user=...&pass=...           → токен (10-15 хв)
//   GET  /api/v1/vviewtree?eType=1&sId=0           → дерево об'єктів з EIC кодами
//   GET  /api/v1/getsqlmaket?maket=APIGetD_GR
//        &eic=<EIC>&dr=1,2,3,4
//        &dtstart=DD.MM.YYYY&dtend=DD.MM.YYYY
//        &type=json                                → дані по лічильнику
//
// Один акаунт обслуговує всі ресторани. Облікові дані беруться з env:
//   VIKSOFT_API_BASE      (default: http://194.183.165.59:8765)
//   VIKSOFT_USER          (обов'язково)
//   VIKSOFT_PASSWORD      (обов'язково)
//
// На рівні запиту з фронта приходить список EIC кодів конкретного ресторану.

const DEFAULT_API_BASE = "http://194.183.165.59:8765";
const DEFAULT_DR = "1,2,3,4"; // A+, A-, R+, R-
const REQUEST_TIMEOUT_MS = Math.max(
  5000,
  Number.parseInt(String(process.env.VIKSOFT_REQUEST_TIMEOUT_MS || "20000"), 10) || 20000
);

// Кількість додаткових спроб при ТРАНЗИТНИХ мережевих збоях (timeout / connection reset / DNS).
// Vik-Soft хоститься на зовнішньому IP і періодично «відвалюється» — кілька ретраїв з бекофом
// прибирають більшість «часті помилки з конектом».
const REQUEST_NETWORK_RETRIES = Math.max(
  0,
  Number.parseInt(String(process.env.VIKSOFT_NETWORK_RETRIES || "2"), 10) || 2
);
const REQUEST_RETRY_BASE_DELAY_MS = Math.max(
  100,
  Number.parseInt(String(process.env.VIKSOFT_RETRY_BASE_DELAY_MS || "600"), 10) || 600
);

// Макети getsqlmaket, які пробуємо по черзі, поки не отримаємо записи.
// Налаштовується через env VIKSOFT_MAKET (через кому). За замовчуванням —
// APIGetGr30 (30-хв графік, фінальна специфікація), із fallback на APIGetD_GR.
const MAKET_CANDIDATES = (() => {
  const fromEnv = String(process.env.VIKSOFT_MAKET || "").trim();
  const list = fromEnv ? fromEnv.split(/[,\s;]+/).map((s) => s.trim()).filter(Boolean) : [];
  const merged = [...list, "APIGetGr30", "APIGetD_GR"];
  return [...new Set(merged)];
})();

// Нормалізує базу API: приймає як чисту базу, так і випадково вставлений повний URL
// (напр. ".../api/v1/login?user=...&pass=...") — лишає тільки origin (scheme+host+port).
const normalizeApiBase = (raw) => {
  let s = String(raw || "").trim();
  if (!s) return "";
  // Якщо немає схеми — додаємо http:// щоб URL() розпарсив.
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`.replace(/\/+$/, "");
  } catch {
    // Фолбек: відрізаємо все після першого "/api" та query.
    return s.replace(/\/+api\/.*$/i, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
};

// Мапа dr → людська назва напрямку.
const DIRECTION_BY_DR = { 1: "A+", 2: "A-", 3: "R+", 4: "R-" };
// Звичайні поля у JSON, які зустрічаються в маркетах getsqlmaket.
const DR_FIELDS = ["dr", "DR", "Dr", "direction", "Direction"];
const VALUE_FIELDS = ["v", "V", "value", "Value", "consumption", "Consumption", "kwh", "KWH"];
const DATE_FIELDS = ["dt", "DT", "date", "Date", "period", "Period", "dtstart", "DtStart"];
const POINT_FIELDS = ["name", "Name", "point", "Point", "eic_name", "EIC_Name", "objName"];

const DIRECTIONS = ["A+", "A-", "R+", "R-"];

// Runtime override (вмикається через UI «Управління утилітами» → /api/settings/viksoft).
// Якщо встановлено — має пріоритет над змінними оточення.
let runtimeOverride = null;

export const setVikSoftRuntimeConfig = (cfg) => {
  if (!cfg || typeof cfg !== "object") {
    runtimeOverride = null;
  } else {
    runtimeOverride = {
      apiBase: cfg.apiBase ? normalizeApiBase(cfg.apiBase) : "",
      user: cfg.user ? String(cfg.user).trim() : "",
      password: typeof cfg.password === "string" ? cfg.password : "",
    };
  }
  // Будь-яка зміна credentials інвалідовує токен і кеш результатів.
  cachedToken = null;
  if (typeof resultCache !== "undefined" && resultCache && typeof resultCache.clear === "function") {
    resultCache.clear();
  }
};

const getConfig = () => {
  const ro = runtimeOverride || {};
  return {
    apiBase: normalizeApiBase(ro.apiBase || process.env.VIKSOFT_API_BASE || DEFAULT_API_BASE),
    user: String(ro.user || process.env.VIKSOFT_USER || "").trim(),
    password: String(ro.password || process.env.VIKSOFT_PASSWORD || "").trim(),
  };
};

// Безпечне читання поточної конфігурації для UI (БЕЗ розкриття пароля).
export const getVikSoftPublicConfig = () => {
  const c = getConfig();
  return {
    apiBase: c.apiBase,
    user: c.user,
    hasPassword: Boolean(c.password),
    source: runtimeOverride && (runtimeOverride.user || runtimeOverride.password)
      ? "runtime"
      : (process.env.VIKSOFT_USER ? "env" : "none"),
  };
};

// Окремий метод тестування з опційним override'ом (не змінює збережений стан).
export const testVikSoftLogin = async (override) => {
  const cfg = override && (override.user || override.password)
    ? {
        apiBase: normalizeApiBase(override.apiBase || runtimeOverride?.apiBase || process.env.VIKSOFT_API_BASE || DEFAULT_API_BASE),
        user: String(override.user || "").trim(),
        password: String(override.password || "").trim(),
      }
    : getConfig();
  if (!cfg.user || !cfg.password) {
    return { ok: false, error: "Логін або пароль не задано" };
  }
  // 1) Логін.
  let loginRes;
  try {
    loginRes = await login(cfg);
  } catch (e) {
    return {
      ok: false,
      stage: "login",
      apiBase: cfg.apiBase,
      user: cfg.user,
      error: e?.message || String(e),
    };
  }
  // 2) vviewtree — щоб одразу зрозуміти, який транспорт токена приймає API.
  const treeProbe = [];
  let workingTransport = null;
  let treeJson = null;
  for (const t of TOKEN_TRANSPORTS) {
    const req = buildRequest(cfg, "/api/v1/vviewtree", { eType: 1, sId: 0 }, loginRes.token, t);
    // eslint-disable-next-line no-await-in-loop
    const res = await tryRequest(req.url, { headers: req.headers });
    treeProbe.push({
      transport: t.name,
      status: res.status,
      ct: res.ct,
      bodyPreview: (res.body || "").slice(0, 120),
    });
    const looksAuthErr = res.status === 401 || res.status === 403 || /unauthorized|invalid\s*(token|session)|access\s*denied/i.test(res.body || "");
    if (res.ok && !looksAuthErr && !hasEmbeddedApiError(res)) {
      workingTransport = t.name;
      treeJson = res.json !== null ? res.json : res.body;
      break;
    }
  }
  return {
    ok: Boolean(workingTransport),
    apiBase: cfg.apiBase,
    user: cfg.user,
    tokenPreview: `${String(loginRes.token).slice(0, 16)}…`,
    tokenLength: String(loginRes.token).length,
    loginMethod: loginRes.method,
    loginStatus: loginRes.status,
    loginContentType: loginRes.ct,
    tokenTransport: workingTransport,
    treeProbe,
    treePreview: treeJson
      ? (typeof treeJson === "string" ? treeJson.slice(0, 500) : JSON.stringify(treeJson).slice(0, 500))
      : null,
    error: workingTransport
      ? undefined
      : `Логін успішний, але жоден транспорт токена не прийнятий vviewtree. Деталі у полі treeProbe.`,
  };
};

// ---- Token cache ----
const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 хвилин (сервер обіцяє 10-15)
let cachedToken = null; // { value, expiresAt }
let loginPromise = null; // singleflight

const fetchJson = async (url, init = {}) => {
  const r = await fetch(url, init);
  const ct = String(r.headers.get("content-type") || "").toLowerCase();
  if (!r.ok) {
    let body = "";
    try { body = (await r.text()).slice(0, 500); } catch {}
    throw new Error(`HTTP ${r.status} ${url} :: ${body}`);
  }
  if (ct.includes("application/json")) return r.json();
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
};

// Спробувати «сирий» запит, повернути детальний звіт для логіну/діагностики.
// Сюди НЕ кидаємо виключення — повертаємо { ok, status, body, json, ct, url, error }.
const tryRequestOnce = async (url, init = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), REQUEST_TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...init, signal: controller.signal });
    const ct = String(r.headers.get("content-type") || "").toLowerCase();
    let text = "";
    try { text = await r.text(); } catch {}
    let json = null;
    if (text) {
      try { json = JSON.parse(text); } catch { json = null; }
    }
    return {
      ok: r.ok,
      status: r.status,
      ct,
      url,
      body: text.slice(0, 1000),
      json,
    };
  } catch (e) {
    const msg = e?.name === "AbortError"
      ? `Request timeout after ${REQUEST_TIMEOUT_MS}ms`
      : (e?.message || String(e));
    return { ok: false, status: 0, url, error: msg };
  } finally {
    clearTimeout(timer);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Обгортка з ретраями на ТРАНЗИТНІ мережеві збої (status 0: timeout / reset / DNS).
// HTTP-помилки (4xx/5xx) НЕ ретраїмо — вони детерміновані й обробляються вище.
// retries: скільки ДОДАТКОВИХ спроб робити (default = REQUEST_NETWORK_RETRIES).
// Під час перебору транспортів токена передаємо retries:0, щоб «неправильні»
// транспорти не множили таймаути й проксі не впав у 504.
const tryRequest = async (url, init = {}, { retries = REQUEST_NETWORK_RETRIES } = {}) => {
  const maxRetries = Math.max(0, Number(retries) || 0);
  let last = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    last = await tryRequestOnce(url, init);
    // Успіх або детермінована HTTP-відповідь (є статус) — повертаємо одразу.
    if (last.status !== 0) return last;
    // Транзитний мережевий збій — бекоф і повтор (якщо лишились спроби).
    if (attempt < maxRetries) {
      const delay = REQUEST_RETRY_BASE_DELAY_MS * (attempt + 1);
      await sleep(delay);
    }
  }
  return last;
};

// Деякі інсталяції Vik-Soft повертають HTTP 200, але фактичну помилку в errors[].
// Таку відповідь не можна вважати успішною.
const hasEmbeddedApiError = (res) => {
  const json = res?.json;
  if (json && typeof json === "object") {
    const errs = json.errors || json.Errors;
    if (Array.isArray(errs) && errs.length > 0) {
      const first = errs[0] || {};
      const st = Number(first.status || first.Status || 0);
      if (Number.isFinite(st) && st >= 400) return true;
      const title = String(first.title || first.Title || "").toLowerCase();
      const detail = String(first.detail || first.Detail || "").toLowerCase();
      if (/unauthorized|forbidden|bad\s*request|invalid|error/.test(`${title} ${detail}`)) {
        return true;
      }
    }
  }
  const body = String(res?.body || "").toLowerCase();
  return /"errors"\s*:\s*\[/.test(body) && /"status"\s*:\s*"?4\d\d"?/.test(body);
};

const extractToken = (raw) => {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") {
    const s = raw.trim().replace(/^"|"$/g, "");
    // Якщо це не схоже на JSON — повертаємо як токен (буває plain-text).
    return s;
  }
  if (typeof raw === "object") {
    return String(
      raw.token ||
      raw.Token ||
      raw.access_token ||
      raw.accessToken ||
      raw.session ||
      raw.Session ||
      raw.sid ||
      raw.SID ||
      raw.key ||
      raw.Key ||
      raw.value ||
      raw.Value ||
      raw.result ||
      raw.Result ||
      ""
    ).trim();
  }
  return String(raw).trim();
};

// Витягнути читабельне повідомлення помилки з тіла відповіді Vik-Soft.
// Формат: {"errors":[{"status":"401","title":"Unauthorized","detail":"Incorrect password"}]}
const extractApiError = (json, body) => {
  if (json && typeof json === "object") {
    const errs = json.errors || json.Errors;
    if (Array.isArray(errs) && errs.length) {
      const e = errs[0];
      const detail = e?.detail || e?.Detail || e?.title || e?.Title || "";
      const status = e?.status || e?.Status || "";
      return [status, detail].filter(Boolean).join(" ");
    }
    if (json.error || json.Error || json.message || json.Message) {
      return String(json.error || json.Error || json.message || json.Message);
    }
  }
  return String(body || "").slice(0, 200);
};

// Vik-Soft login. Підтверджено робочим запитом:
//   POST /api/v1/login?user=X&pass=Y  з порожнім тілом (Content-Length: 0)
//   → 200 { "Token": "....=" }  |  401 {"errors":[{"detail":"Incorrect password"}]}
// POST — основний метод; GET лишаємо як фолбек на випадок змін API.
const login = async (cfg) => {
  const qs = `user=${encodeURIComponent(cfg.user)}&pass=${encodeURIComponent(cfg.password)}`;
  const url = `${cfg.apiBase}/api/v1/login?${qs}`;

  const attempts = [];
  for (const method of ["POST", "GET"]) {
    const init = method === "POST"
      ? { method: "POST", headers: { "Content-Length": "0" } }
      : { method: "GET" };
    // Логін — лише 1 додаткова спроба на мережевий збій, щоб не множити латентність
    // (інакше POST+GET × ретраї × таймаут можуть перевищити таймаут проксі → 504).
    const res = await tryRequest(url, init, { retries: 1 });
    attempts.push({ method, status: res.status, ct: res.ct, body: (res.body || "").slice(0, 200), error: res.error });
    if (res.ok) {
      const token = extractToken(res.json !== null ? res.json : res.body);
      if (token) {
        return { token, raw: res.json !== null ? res.json : res.body, ct: res.ct, status: res.status, method };
      }
    }
    // Якщо це явна помилка авторизації (невірний пароль) — далі пробувати інший
    // метод немає сенсу, одразу повертаємо зрозумілу помилку.
    if (res.status === 401 || res.status === 403) {
      const msg = extractApiError(res.json, res.body);
      throw new Error(`Vik-Soft: ${msg || "Unauthorized"} (логін «${cfg.user}»)`);
    }
  }
  const detail = attempts
    .map((a) => `${a.method} → ${a.status || "ERR"}${a.error ? ` (${a.error})` : ""}${a.body ? ` body:${a.body}` : ""}`)
    .join(" || ");
  throw new Error(`Vik-Soft login невдалий. Спроби: ${detail}`);
};

const getToken = async () => {
  const cfg = getConfig();
  if (!cfg.user || !cfg.password) {
    throw new Error("Не задано VIKSOFT_USER / VIKSOFT_PASSWORD у env");
  }
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  if (loginPromise) return loginPromise;
  loginPromise = (async () => {
    try {
      const { token, method } = await login(cfg);
      cachedToken = { value: token, expiresAt: Date.now() + TOKEN_TTL_MS, loginMethod: method };
      return token;
    } finally {
      loginPromise = null;
    }
  })();
  return loginPromise;
};

export const invalidateVikSoftToken = () => {
  cachedToken = null;
  tokenTransport = null;
};

// ---- Auto-detect транспорту токена ----
// Vik-Soft документація не уточнює — але підтверджено робочим curl, що працює
// саме `Authorization: Token <token>`. Тому ставимо його ПЕРШИМ (далі bearer,
// потім query-варіанти як фолбек). Це критично для латентності: «неправильні»
// транспорти можуть зависати, а проксі перед сервером має короткий таймаут.
const TOKEN_TRANSPORTS = [
  { name: "header:auth-token", apply: (u, h, t) => { h.Authorization = `Token ${t}`; } },
  { name: "header:bearer", apply: (u, h, t) => { h.Authorization = `Bearer ${t}`; } },
  { name: "header:token", apply: (u, h, t) => { h.Token = t; } },
  { name: "header:x-token", apply: (u, h, t) => { h["X-Token"] = t; } },
  { name: "query:token", apply: (u, h, t) => { u.searchParams.set("token", t); } },
  { name: "query:session", apply: (u, h, t) => { u.searchParams.set("session", t); } },
  { name: "query:sId", apply: (u, h, t) => { u.searchParams.set("sId", t); } },
  { name: "query:sid", apply: (u, h, t) => { u.searchParams.set("sid", t); } },
  { name: "query:key", apply: (u, h, t) => { u.searchParams.set("key", t); } },
];
let tokenTransport = null; // запам'ятовуємо вдалий варіант

const buildRequest = (cfg, path, params, token, transport) => {
  const u = new URL(`${cfg.apiBase}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    u.searchParams.set(k, String(v));
  }
  const headers = {};
  transport.apply(u, headers, token);
  return { url: u.toString(), headers };
};

// Викликає GET ендпоінт, додаючи токен. Перебирає транспорти, поки не отримає
// успіх (200 + контент, який виглядає як корисний JSON чи не-порожній текст без помилки авторизації).
const apiGet = async (path, params = {}) => {
  const cfg = getConfig();
  let token = await getToken();

  const looksLikeAuthError = (res) => {
    if (res.status === 401 || res.status === 403) return true;
    const body = String(res.body || "").toLowerCase();
    if (!body) return false;
    return /unauthorized|not\s*logged|invalid\s*(token|session)|access\s*denied|forbidden|wrong\s*token/.test(body);
  };

  const tryTransport = async (transport, { retries = 0 } = {}) => {
    const req = buildRequest(cfg, path, params, token, transport);
    const res = await tryRequest(req.url, { headers: req.headers }, { retries });
    return { transport, res };
  };

  // 1) Якщо вже знаємо вдалий транспорт — пробуємо його першим з ПОВНИМИ
  //    мережевими ретраями. Решту (на випадок зміни API) — швидко, без ретраїв.
  if (tokenTransport) {
    const { res } = await tryTransport(tokenTransport, { retries: REQUEST_NETWORK_RETRIES });
    if (res.ok && !looksLikeAuthError(res) && !hasEmbeddedApiError(res)) {
      return res.json !== null ? res.json : res.body;
    }
    if (!looksLikeAuthError(res) && res.status !== 0) {
      throw new Error(`HTTP ${res.status} ${path} :: ${(res.body || "").slice(0, 500)}`);
    }
  }

  const order = tokenTransport
    ? TOKEN_TRANSPORTS.filter((t) => t !== tokenTransport)
    : TOKEN_TRANSPORTS;

  const tried = [];
  for (const t of order) {
    // Перебір — швидкий fail (retries:0), щоб не множити таймаути.
    const { res } = await tryTransport(t, { retries: 0 });
    tried.push({ name: t.name, status: res.status, body: (res.body || "").slice(0, 120) });
    if (res.ok && !looksLikeAuthError(res) && !hasEmbeddedApiError(res)) {
      tokenTransport = t;
      return res.json !== null ? res.json : res.body;
    }
    // Якщо це не auth-error і є статус (детермінована HTTP-помилка) — далі немає сенсу.
    if (!looksLikeAuthError(res) && res.status !== 0) {
      throw new Error(`HTTP ${res.status} ${path} :: ${(res.body || "").slice(0, 500)}`);
    }
  }

  // 2) Усі транспорти повернули auth-error. Дві ймовірні причини:
  //    (а) токен ЩОЙНО виданий і ще не активувався на боці Vik-Soft (звідси баг
  //        «перший запит падає, другий проходить»); (б) токен застарів.
  //    Стратегія: спершу кілька повторів з НАЯВНИМ токеном і наростаючою
  //    затримкою (він «дозріває»), а якщо й далі auth-error — релогін і ще раунд.
  //    Усе в межах ОДНОГО виклику, щоб користувач не бачив випадкову помилку.
  const RETRY_DELAYS_MS = [400, 1000, 2000];

  const retryRound = async (label) => {
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      let sawNonAuthError = false;
      for (const t of TOKEN_TRANSPORTS) {
        const { res } = await tryTransport(t);
        tried.push({ name: `${t.name}+${label}${attempt + 1}`, status: res.status, body: (res.body || "").slice(0, 120) });
        if (res.ok && !looksLikeAuthError(res) && !hasEmbeddedApiError(res)) {
          tokenTransport = t;
          return res.json !== null ? res.json : res.body;
        }
        if (!looksLikeAuthError(res)) sawNonAuthError = true;
      }
      // Якщо жоден транспорт не дав auth-помилки — проблема не в токені, не чекаємо.
      if (sawNonAuthError) break;
    }
    return undefined;
  };

  // 2a) Дозрівання поточного токена.
  const matured = await retryRound("wait");
  if (matured !== undefined) return matured;

  // 2b) Релогін і повторний раунд (на випадок справді протермінованого токена).
  invalidateVikSoftToken();
  token = await getToken();
  const relogged = await retryRound("relogin");
  if (relogged !== undefined) return relogged;

  const detail = tried.map((x) => `${x.name}→${x.status}${x.body ? ` (${x.body})` : ""}`).join(" || ");
  throw new Error(`Vik-Soft ${path}: жоден транспорт токена не спрацював. Спроби: ${detail}`);
};

// GET /api/v1/vviewtree?eType=1&sId=0 → дерево/список EIC кодів.
export const vviewtree = async ({ eType = 1, sId = 0 } = {}) => {
  return apiGet("/api/v1/vviewtree", { eType, sId });
};

// GET /api/v1/getsqlmaket?maket=APIGetD_GR&eic=...&dr=1,2,3,4&dtstart=DD.MM.YYYY&dtend=DD.MM.YYYY&type=json
export const getSqlMaket = async ({ eic, dtstart, dtend, dr = DEFAULT_DR, maket = MAKET_CANDIDATES[0] } = {}) => {
  if (!eic) throw new Error("getSqlMaket: eic обов'язковий");
  return apiGet("/api/v1/getsqlmaket", { maket, eic, dr, dtstart, dtend, type: "json" });
};

// ---- Перетворення сирих даних API у наш формат rows[] ----

// Перетворити ISO YYYY-MM-DD → DD.MM.YYYY (формат API).
const toDdMmYyyy = (iso) => {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  return `${m[3]}.${m[2]}.${m[1]}`;
};

const getYesterdayIso = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

// Витягнути з довільного об'єкта одне з полів за списком ключів.
const pluck = (obj, keys) => {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
};

const parseNumber = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/[^0-9,.\-]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// Знайти у будь-якій структурі (масив/обʼєкт) масив записів з показниками.
const findRecords = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload !== "object") return [];
  // Поширені обгортки.
  for (const k of ["data", "Data", "rows", "Rows", "result", "Result", "items", "Items", "value", "Value"]) {
    if (Array.isArray(payload[k])) return payload[k];
  }
  // Якщо payload — об'єкт з вкладеним масивом — беремо перший знайдений.
  for (const v of Object.values(payload)) {
    if (Array.isArray(v) && v.length && typeof v[0] === "object") return v;
  }
  return [];
};

// Агрегує рядки за добу: повертає масив { point, direction, consumption }.
// Один EIC = одна "точка обліку" (передаємо її назву через pointName).
const aggregateForDay = (records, pointName) => {
  // Згрупуємо суми по dr.
  const sumByDr = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const hasByDr = { 1: false, 2: false, 3: false, 4: false };
  for (const rec of records) {
    const drRaw = pluck(rec, DR_FIELDS);
    const dr = Number(drRaw);
    if (![1, 2, 3, 4].includes(dr)) continue;
    const valRaw = pluck(rec, VALUE_FIELDS);
    const val = parseNumber(valRaw);
    if (val === null) continue;
    sumByDr[dr] += val;
    hasByDr[dr] = true;
  }
  const rows = [];
  for (const dr of [1, 2, 3, 4]) {
    rows.push({
      point: pointName || "",
      direction: DIRECTION_BY_DR[dr],
      consumption: hasByDr[dr] ? Number(sumByDr[dr].toFixed(4)) : 0,
    });
  }
  return rows;
};

export const aggregateConsumption = (rows) => {
  const totals = Object.fromEntries(DIRECTIONS.map((d) => [d, 0]));
  if (!Array.isArray(rows)) return totals;
  for (const row of rows) {
    const dir = String(row?.direction || "").trim();
    if (!DIRECTIONS.includes(dir)) continue;
    const v = typeof row?.consumption === "number" ? row.consumption : parseNumber(row?.consumption);
    if (v == null) continue;
    totals[dir] += v;
  }
  // Округлення для презентації.
  for (const k of Object.keys(totals)) totals[k] = Number(totals[k].toFixed(4));
  return totals;
};

// ---- Result cache (5 хвилин, ключ = дата + EIC список) ----
const RESULT_TTL_MS = 5 * 60 * 1000;
const resultCache = new Map();
const cacheKey = (eics, reportDateIso) => `${[...eics].sort().join("|")}::${reportDateIso}`;
const getCached = (eics, iso) => {
  const k = cacheKey(eics, iso);
  const hit = resultCache.get(k);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) { resultCache.delete(k); return null; }
  return hit.payload;
};
const setCached = (eics, iso, payload) => {
  resultCache.set(cacheKey(eics, iso), { expiresAt: Date.now() + RESULT_TTL_MS, payload });
};
export const invalidateVikSoftCache = () => resultCache.clear();

// ---- Допоміжне: побудувати pointName і резолв ідентифікаторів з vviewtree ----
const treeIndex = {
  byEic: new Map(),
  byIdnode: new Map(),
  byObjref: new Map(),
  fetchedAt: 0,
};
const TREE_TTL_MS = 5 * 60 * 1000;

const normalizeIdentifier = (raw) => {
  const s = String(raw || "").trim();
  if (!s) return null;

  const m = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*[:=]\s*(.+)$/.exec(s);
  if (m) {
    const kind = String(m[1] || "").trim().toLowerCase();
    const value = String(m[2] || "").trim();
    if (!value) return null;
    if (kind === "eic" || kind === "eiccode") return { kind: "eic", value };
    if (kind === "idnode" || kind === "id") return { kind: "idnode", value };
    if (kind === "objref" || kind === "obj") return { kind: "objref", value };
    return { kind: "eic", value };
  }

  // Без префікса: числові значення трактуємо як idnode, решту — як eic.
  if (/^\d+$/.test(s)) return { kind: "idnode", value: s };
  return { kind: "eic", value: s };
};

const refreshTreeIndex = async () => {
  try {
    const tree = await vviewtree();
    const records = findRecords(tree);
    const byEic = new Map();
    const byIdnode = new Map();
    const byObjref = new Map();
    for (const node of records) {
      const eic = String(pluck(node, ["eic", "EIC", "Eic", "eiccode", "EICCODE"]) || "").trim();
      const idnode = String(pluck(node, ["idnode", "idNode", "IDNODE", "id", "ID"]) || "").trim();
      const objref = String(pluck(node, ["objref", "objRef", "OBJREF"]) || "").trim();
      const name = String(pluck(node, POINT_FIELDS) || "").trim();
      const doc = { eic, idnode, objref, name: name || eic || idnode || objref || "" };
      if (eic) byEic.set(eic, doc);
      if (idnode) byIdnode.set(idnode, doc);
      if (objref) byObjref.set(objref, doc);
    }
    treeIndex.byEic = byEic;
    treeIndex.byIdnode = byIdnode;
    treeIndex.byObjref = byObjref;
    treeIndex.fetchedAt = Date.now();
  } catch (e) {
    console.warn(`[viksoft] vviewtree failed: ${e?.message || e}`);
  }
};

const ensureTreeIndexFresh = async () => {
  if (Date.now() - treeIndex.fetchedAt > TREE_TTL_MS) {
    await refreshTreeIndex();
  }
};

const resolveIdentifiersToEics = async (inputs = []) => {
  await ensureTreeIndexFresh();

  const eics = [];
  const unresolved = [];
  const resolved = [];
  const seen = new Set();

  for (const input of inputs) {
    const id = normalizeIdentifier(input);
    if (!id) continue;

    let eic = "";
    if (id.kind === "eic") {
      eic = id.value;
      resolved.push({ input: String(input), kind: id.kind, value: id.value, eic });
    } else if (id.kind === "idnode") {
      const hit = treeIndex.byIdnode.get(id.value);
      eic = String(hit?.eic || "").trim();
      if (!eic) unresolved.push({ input: String(input), kind: id.kind, value: id.value, reason: "no_eic_for_idnode" });
      else resolved.push({ input: String(input), kind: id.kind, value: id.value, eic });
    } else if (id.kind === "objref") {
      const hit = treeIndex.byObjref.get(id.value);
      eic = String(hit?.eic || "").trim();
      if (!eic) unresolved.push({ input: String(input), kind: id.kind, value: id.value, reason: "no_eic_for_objref" });
      else resolved.push({ input: String(input), kind: id.kind, value: id.value, eic });
    }

    if (eic && !seen.has(eic)) {
      seen.add(eic);
      eics.push(eic);
    }
  }

  return { eics, unresolved, resolved };
};

const getPointName = async (eic) => {
  if (!treeIndex.byEic.has(eic) || Date.now() - treeIndex.fetchedAt > TREE_TTL_MS) await refreshTreeIndex();
  return treeIndex.byEic.get(eic)?.name || eic;
};

// ---- Головна функція. Сумісний контракт з попереднім energocenter.js ----
export const fetchEnergoCenterConsumption = async ({
  date,
  force = false,
  eics: identifiersInput,
} = {}) => {
  const fetchedAt = new Date().toISOString();
  const reportDateIso = (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))
    ? date
    : getYesterdayIso();
  const reportDateDdMmYyyy = toDdMmYyyy(reportDateIso);

  // Нормалізуємо список ідентифікаторів: eic:..., idnode:..., objref:... або bare-token.
  let identifiers = [];
  if (Array.isArray(identifiersInput)) identifiers = identifiersInput;
  else if (typeof identifiersInput === "string") identifiers = identifiersInput.split(/[,\s;]+/);
  identifiers = identifiers.map((s) => String(s || "").trim()).filter(Boolean);
  identifiers = [...new Set(identifiers)];

  if (!identifiers.length) {
    return {
      ok: false,
      fetchedAt,
      reportDate: reportDateIso,
      sourceUrl: "vik-soft:getsqlmaket",
      rows: [],
      error: "Не задано ідентифікатори лічильників у картці закладу (eic:/idnode:/objref:).",
    };
  }

  // Резолвимо ідентифікатори в EIC через vviewtree.
  const resolvedIds = await resolveIdentifiersToEics(identifiers);
  const eics = resolvedIds.eics;

  if (!eics.length) {
    return {
      ok: false,
      fetchedAt,
      reportDate: reportDateIso,
      sourceUrl: "vik-soft:getsqlmaket",
      rows: [],
      error: "Не вдалося резолвити жоден ідентифікатор у EIC. Перевірте treeSummary/таблицю та заповнення eiccode у Vik-Soft.",
      unresolvedIdentifiers: resolvedIds.unresolved,
    };
  }

  if (!force) {
    const cached = getCached(eics, reportDateIso);
    if (cached) return { ...cached, fromCache: true };
  }

  const cfg = getConfig();
  if (!cfg.user || !cfg.password) {
    return {
      ok: false,
      fetchedAt,
      reportDate: reportDateIso,
      sourceUrl: "vik-soft:getsqlmaket",
      rows: [],
      error: "Не задано VIKSOFT_USER / VIKSOFT_PASSWORD у змінних оточення сервера.",
    };
  }

  try {
    // Спершу оновимо індекс дерева, щоб мати назви точок.
    if (treeIndex.byEic.size === 0) await refreshTreeIndex();

    const allRows = [];
    const errors = [];
    const maketsUsed = new Set();
    for (const eic of eics) {
      let records = [];
      let usedMaket = null;
      let lastErr = null;
      // Пробуємо макети по черзі (APIGetGr30 -> APIGetD_GR), поки не буде даних.
      for (const maket of MAKET_CANDIDATES) {
        try {
          const raw = await getSqlMaket({
            eic,
            dtstart: reportDateDdMmYyyy,
            dtend: reportDateDdMmYyyy,
            maket,
          });
          const recs = findRecords(raw);
          if (recs.length) {
            records = recs;
            usedMaket = maket;
            break;
          }
        } catch (e) {
          lastErr = e;
        }
      }
      if (!records.length) {
        errors.push(
          lastErr
            ? `EIC ${eic}: ${lastErr?.message || lastErr}`
            : `EIC ${eic}: немає даних за ${reportDateDdMmYyyy} (макети: ${MAKET_CANDIDATES.join(", ")})`
        );
        continue;
      }
      if (usedMaket) maketsUsed.add(usedMaket);
      const pointName = await getPointName(eic);
      const rows = aggregateForDay(records, pointName);
      allRows.push(...rows);
    }

    if (allRows.length === 0 && errors.length) {
      return {
        ok: false,
        fetchedAt,
        reportDate: reportDateIso,
        sourceUrl: "vik-soft:getsqlmaket",
        rows: [],
        error: errors.join("; "),
      };
    }

    const totals = aggregateConsumption(allRows);
    const payload = {
      ok: true,
      fetchedAt,
      reportDate: reportDateIso,
      sourceUrl: `vik-soft:${cfg.apiBase}/api/v1/getsqlmaket`,
      headers: ["Точка обліку", "Напрямок", "Споживання"],
      rows: allRows,
      totals,
      maket: maketsUsed.size ? [...maketsUsed].join(", ") : MAKET_CANDIDATES[0],
      resolvedIdentifiers: resolvedIds.resolved,
      unresolvedIdentifiers: resolvedIds.unresolved,
      ...(errors.length ? { warnings: errors } : {}),
    };
    setCached(eics, reportDateIso, payload);
    return payload;
  } catch (e) {
    return {
      ok: false,
      fetchedAt,
      reportDate: reportDateIso,
      sourceUrl: "vik-soft:getsqlmaket",
      rows: [],
      error: `Vik-Soft API: ${e?.message || e}`,
    };
  }
};

// Mapping Module: список лічильників з vviewtree — пари nodename + eiccode для UI.
// Викликається раз на добу/за запитом і дозволяє мапити заклад -> ідентифікатор лічильника.
export const listVikSoftMeters = async () => {
  const cfg = getConfig();
  const out = {
    ok: false,
    fetchedAt: new Date().toISOString(),
    apiBase: cfg.apiBase,
    meters: [],
  };
  if (!cfg.user || !cfg.password) {
    out.error = "Не задано VIKSOFT_USER / VIKSOFT_PASSWORD у змінних оточення сервера.";
    return out;
  }
  try {
    const tree = await vviewtree();
    const records = findRecords(tree);
    const toStr = (v) => String(v == null ? "" : v).trim();
    const meters = records
      .map((node) => ({
        nodename: toStr(
          node?.nodename ?? node?.nodeName ?? node?.NODENAME ?? node?.name ?? node?.Name ?? node?.objName ?? ""
        ),
        eiccode: toStr(node?.eiccode ?? node?.EICCODE ?? node?.eic ?? node?.EIC ?? ""),
        idnode: toStr(node?.idnode ?? node?.idNode ?? node?.IDNODE ?? node?.id ?? ""),
        objref: toStr(node?.objref ?? node?.objRef ?? node?.OBJREF ?? ""),
        typedenom: toStr(node?.typedenom ?? node?.TYPEDENOM ?? ""),
      }))
      .filter((m) => m.nodename || m.eiccode || m.idnode || m.objref);
    out.ok = true;
    out.meters = meters;
    out.summary = {
      total: meters.length,
      withEic: meters.filter((m) => Boolean(m.eiccode)).length,
      withoutEic: meters.filter((m) => !m.eiccode).length,
    };
    return out;
  } catch (e) {
    out.error = e?.message || String(e);
    return out;
  }
};

// Для діагностики з UI.
export const debugVikSoft = async ({ eic, date } = {}) => {
  const cfg = getConfig();
  const out = { config: { apiBase: cfg.apiBase, hasUser: Boolean(cfg.user), hasPassword: Boolean(cfg.password) } };
  try {
    out.token = (await getToken()).slice(0, 12) + "…";
  } catch (e) { out.tokenError = e?.message || String(e); }
  try {
    out.tree = await vviewtree();
    const records = findRecords(out.tree);
    const toStr = (v) => String(v == null ? "" : v).trim();
    const treeMeters = records
      .map((node) => ({
        idnode: toStr(node?.idnode ?? node?.idNode ?? node?.IDNODE ?? ""),
        objref: toStr(node?.objref ?? node?.objRef ?? node?.OBJREF ?? ""),
        eiccode: toStr(node?.eiccode ?? node?.EICCODE ?? node?.eic ?? node?.EIC ?? ""),
        name: toStr(node?.name ?? node?.Name ?? node?.objName ?? ""),
      }))
      .filter((m) => m.idnode || m.objref || m.eiccode || m.name);
    out.treeSummary = {
      totalNodes: treeMeters.length,
      withEic: treeMeters.filter((m) => Boolean(m.eiccode)).length,
      withoutEic: treeMeters.filter((m) => !m.eiccode).length,
    };
    out.treeMeters = treeMeters.slice(0, 500);
  } catch (e) { out.treeError = e?.message || String(e); }
  if (eic) {
    const iso = (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : getYesterdayIso();
    try {
      out.maket = await fetchEnergoCenterConsumption({
        date: iso,
        force: true,
        eics: [eic],
      });
    } catch (e) { out.maketError = e?.message || String(e); }
  }
  return out;
};

// Прогрів — викликаємо login у фоні (для сумісності з warmUpEnergoCenter).
export const warmUpEnergoCenter = async () => {
  try {
    await getToken();
    return true;
  } catch {
    return false;
  }
};

export const destroySession = async () => {
  invalidateVikSoftToken();
  invalidateVikSoftCache();
};

// Експорти для зворотної сумісності з тестами/іншим кодом, якщо лишилися.
export const parseConsumptionNumber = parseNumber;
