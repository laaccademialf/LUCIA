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

// Мапа dr → людська назва напрямку.
const DIRECTION_BY_DR = { 1: "A+", 2: "A-", 3: "R+", 4: "R-" };
// Звичайні поля у JSON, які зустрічаються в маркетах getsqlmaket.
const DR_FIELDS = ["dr", "DR", "Dr", "direction", "Direction"];
const VALUE_FIELDS = ["v", "V", "value", "Value", "consumption", "Consumption", "kwh", "KWH"];
const DATE_FIELDS = ["dt", "DT", "date", "Date", "period", "Period", "dtstart", "DtStart"];
const POINT_FIELDS = ["name", "Name", "point", "Point", "eic_name", "EIC_Name", "objName"];

const DIRECTIONS = ["A+", "A-", "R+", "R-"];

const getConfig = () => ({
  apiBase: String(process.env.VIKSOFT_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, ""),
  user: String(process.env.VIKSOFT_USER || "").trim(),
  password: String(process.env.VIKSOFT_PASSWORD || "").trim(),
});

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

// POST /api/v1/login?user=...&pass=...
// Повертає токен (може бути plain text або JSON {token: "..."} — обробляємо обидва).
const login = async (cfg) => {
  const url = `${cfg.apiBase}/api/v1/login?user=${encodeURIComponent(cfg.user)}&pass=${encodeURIComponent(cfg.password)}`;
  const raw = await fetchJson(url, { method: "POST" });
  let token = "";
  if (typeof raw === "string") {
    token = raw.trim();
  } else if (raw && typeof raw === "object") {
    token = String(
      raw.token || raw.Token || raw.access_token || raw.accessToken || raw.value || ""
    ).trim();
  }
  if (!token) throw new Error(`Login OK, але токен порожній. Raw: ${JSON.stringify(raw).slice(0, 200)}`);
  return token;
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
      const value = await login(cfg);
      cachedToken = { value, expiresAt: Date.now() + TOKEN_TTL_MS };
      return value;
    } finally {
      loginPromise = null;
    }
  })();
  return loginPromise;
};

export const invalidateVikSoftToken = () => {
  cachedToken = null;
};

// Викликає GET ендпоінт, додаючи токен. Якщо 401/403 — оновлює токен і повторює.
const apiGet = async (path, params = {}) => {
  const cfg = getConfig();
  const buildUrl = (token) => {
    const u = new URL(`${cfg.apiBase}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      u.searchParams.set(k, String(v));
    }
    // Vik-Soft може приймати токен як query (?token=) або як header.
    if (token) u.searchParams.set("token", token);
    return u.toString();
  };
  let token = await getToken();
  let url = buildUrl(token);
  let r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 401 || r.status === 403) {
    invalidateVikSoftToken();
    token = await getToken();
    url = buildUrl(token);
    r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }
  const ct = String(r.headers.get("content-type") || "").toLowerCase();
  if (!r.ok) {
    let body = "";
    try { body = (await r.text()).slice(0, 500); } catch {}
    throw new Error(`HTTP ${r.status} ${path} :: ${body}`);
  }
  if (ct.includes("application/json")) return r.json();
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
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
