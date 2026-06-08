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
    if (res.ok && !looksAuthErr) {
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
const tryRequest = async (url, init = {}) => {
  try {
    const r = await fetch(url, init);
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
    return { ok: false, status: 0, url, error: e?.message || String(e) };
  }
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

// Vik-Soft login: пробуємо GET (так показано в доці-скрінах), якщо не виходить — POST.
// Повертаємо token + діагностику першої вдалої спроби.
const login = async (cfg) => {
  const qs = `user=${encodeURIComponent(cfg.user)}&pass=${encodeURIComponent(cfg.password)}`;
  const url = `${cfg.apiBase}/api/v1/login?${qs}`;

  const attempts = [];
  for (const method of ["GET", "POST"]) {
    const res = await tryRequest(url, { method });
    attempts.push({ method, status: res.status, ct: res.ct, body: (res.body || "").slice(0, 200), error: res.error });
    if (res.ok) {
      const token = extractToken(res.json !== null ? res.json : res.body);
      if (token) {
        return { token, raw: res.json !== null ? res.json : res.body, ct: res.ct, status: res.status, method };
      }
    }
  }
  // Зібрали всі спроби — формуємо корисну помилку.
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
// Vik-Soft документація не уточнює — спершу пробуємо найімовірніші варіанти,
// запам'ятовуємо який спрацював і використовуємо його далі.
const TOKEN_TRANSPORTS = [
  { name: "query:token", apply: (u, h, t) => { u.searchParams.set("token", t); } },
  { name: "query:session", apply: (u, h, t) => { u.searchParams.set("session", t); } },
  { name: "query:sid", apply: (u, h, t) => { u.searchParams.set("sid", t); } },
  { name: "query:key", apply: (u, h, t) => { u.searchParams.set("key", t); } },
  { name: "header:bearer", apply: (u, h, t) => { h.Authorization = `Bearer ${t}`; } },
  { name: "header:token", apply: (u, h, t) => { h.Token = t; } },
  { name: "header:x-token", apply: (u, h, t) => { h["X-Token"] = t; } },
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

  const tryTransport = async (transport) => {
    const req = buildRequest(cfg, path, params, token, transport);
    const res = await tryRequest(req.url, { headers: req.headers });
    return { transport, res };
  };

  // 1) Якщо вже знаємо вдалий транспорт — спробуємо його першим.
  const order = tokenTransport
    ? [tokenTransport, ...TOKEN_TRANSPORTS.filter((t) => t !== tokenTransport)]
    : TOKEN_TRANSPORTS;

  const tried = [];
  for (const t of order) {
    const { res } = await tryTransport(t);
    tried.push({ name: t.name, status: res.status, body: (res.body || "").slice(0, 120) });
    if (res.ok && !looksLikeAuthError(res)) {
      tokenTransport = t;
      return res.json !== null ? res.json : res.body;
    }
    // Якщо просто auth error — пробуємо інший транспорт.
    if (!looksLikeAuthError(res)) {
      // Інша помилка (500, 400 і т.п.) — далі пробувати немає сенсу, повертаємо її.
      throw new Error(`HTTP ${res.status} ${path} :: ${(res.body || "").slice(0, 500)}`);
    }
  }

  // 2) Усі транспорти повернули auth-error — можливо токен застарів. Оновимо й повторимо один раз.
  invalidateVikSoftToken();
  token = await getToken();
  for (const t of TOKEN_TRANSPORTS) {
    const { res } = await tryTransport(t);
    tried.push({ name: t.name + "+retry", status: res.status, body: (res.body || "").slice(0, 120) });
    if (res.ok && !looksLikeAuthError(res)) {
      tokenTransport = t;
      return res.json !== null ? res.json : res.body;
    }
  }
  const detail = tried.map((x) => `${x.name}→${x.status}${x.body ? ` (${x.body})` : ""}`).join(" || ");
  throw new Error(`Vik-Soft ${path}: жоден транспорт токена не спрацював. Спроби: ${detail}`);
};

// GET /api/v1/vviewtree?eType=1&sId=0 → дерево/список EIC кодів.
export const vviewtree = async ({ eType = 1, sId = 0 } = {}) => {
  return apiGet("/api/v1/vviewtree", { eType, sId });
};

// GET /api/v1/getsqlmaket?maket=APIGetD_GR&eic=...&dr=1,2,3,4&dtstart=DD.MM.YYYY&dtend=DD.MM.YYYY&type=json
export const getSqlMaket = async ({ eic, dtstart, dtend, dr = DEFAULT_DR, maket = "APIGetD_GR" } = {}) => {
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

// ---- Допоміжне: побудувати pointName з елемента vviewtree ----
const treeIndex = { byEic: new Map(), fetchedAt: 0 };
const TREE_TTL_MS = 5 * 60 * 1000;

const refreshTreeIndex = async () => {
  try {
    const tree = await vviewtree();
    const records = findRecords(tree);
    const map = new Map();
    for (const node of records) {
      const eic = String(pluck(node, ["eic", "EIC", "Eic"]) || "").trim();
      if (!eic) continue;
      const name = String(pluck(node, POINT_FIELDS) || "").trim();
      map.set(eic, name || eic);
    }
    treeIndex.byEic = map;
    treeIndex.fetchedAt = Date.now();
  } catch (e) {
    console.warn(`[viksoft] vviewtree failed: ${e?.message || e}`);
  }
};

const getPointName = async (eic) => {
  if (!treeIndex.byEic.has(eic) || Date.now() - treeIndex.fetchedAt > TREE_TTL_MS) {
    await refreshTreeIndex();
  }
  return treeIndex.byEic.get(eic) || eic;
};

// ---- Головна функція. Сумісний контракт з попереднім energocenter.js ----
export const fetchEnergoCenterConsumption = async ({
  date,
  force = false,
  eics: eicsInput,
} = {}) => {
  const fetchedAt = new Date().toISOString();
  const reportDateIso = (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))
    ? date
    : getYesterdayIso();
  const reportDateDdMmYyyy = toDdMmYyyy(reportDateIso);

  // Нормалізуємо EIC: масив, через кому, через ;, з пробілами.
  let eics = [];
  if (Array.isArray(eicsInput)) eics = eicsInput;
  else if (typeof eicsInput === "string") eics = eicsInput.split(/[,\s;]+/);
  eics = eics.map((s) => String(s || "").trim()).filter(Boolean);
  eics = [...new Set(eics)];

  if (!eics.length) {
    return {
      ok: false,
      fetchedAt,
      reportDate: reportDateIso,
      sourceUrl: "vik-soft:getsqlmaket",
      rows: [],
      error: "Не задано EIC коди лічильників у картці закладу.",
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
    for (const eic of eics) {
      try {
        const raw = await getSqlMaket({
          eic,
          dtstart: reportDateDdMmYyyy,
          dtend: reportDateDdMmYyyy,
        });
        const records = findRecords(raw);
        const pointName = await getPointName(eic);
        const rows = aggregateForDay(records, pointName);
        allRows.push(...rows);
      } catch (e) {
        errors.push(`EIC ${eic}: ${e?.message || e}`);
      }
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

// Для діагностики з UI.
export const debugVikSoft = async ({ eic, date } = {}) => {
  const cfg = getConfig();
  const out = { config: { apiBase: cfg.apiBase, hasUser: Boolean(cfg.user), hasPassword: Boolean(cfg.password) } };
  try {
    out.token = (await getToken()).slice(0, 12) + "…";
  } catch (e) { out.tokenError = e?.message || String(e); }
  try {
    out.tree = await vviewtree();
  } catch (e) { out.treeError = e?.message || String(e); }
  if (eic) {
    const iso = (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : getYesterdayIso();
    const ddmm = toDdMmYyyy(iso);
    try {
      out.maket = await getSqlMaket({ eic, dtstart: ddmm, dtend: ddmm });
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
