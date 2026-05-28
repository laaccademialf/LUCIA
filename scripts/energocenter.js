// EnergoCenter (seraskoe.tech) scraper.
//
// Уся логіка ізольована в одній функції fetchEnergoCenterConsumption(),
// яка запускає Playwright (Chromium), логіниться, обирає вузол у дереві,
// вмикає чекбокси напрямків A+/A-/R+/R-, натискає "Оновити" і парсить
// таблицю #MainContent_GrdConsumption у масив рядків.
//
// Playwright імпортується ліниво, тому відсутність пакета не ламає
// решту серверу — у такому випадку ендпоінт поверне зрозумілу помилку.

const DEFAULT_LOGIN_URL = "http://www.seraskoe.tech/Login.aspx";
const DEFAULT_VIEW_URL = "http://www.seraskoe.tech/ViewDataConsumption.aspx";
const DEFAULT_TREE_TEXT = 'Ресторан "Кувшин"';

const DIRECTIONS = ["A+", "A-", "R+", "R-"];

const NAV_TIMEOUT_MS = 45_000;
const ACTION_TIMEOUT_MS = 20_000;

const getConfig = (overrides = {}) => {
  const user = String(overrides.user ?? process.env.SERASKOE_USER ?? "").trim();
  const password = String(overrides.password ?? process.env.SERASKOE_PASSWORD ?? "");
  const treeText = String(overrides.treeText ?? process.env.SERASKOE_TREE_TEXT ?? DEFAULT_TREE_TEXT).trim();
  return {
    loginUrl: String(process.env.SERASKOE_LOGIN_URL || DEFAULT_LOGIN_URL).trim(),
    viewUrl: String(process.env.SERASKOE_VIEW_URL || DEFAULT_VIEW_URL).trim(),
    user,
    password,
    treeText,
  };
};

const credKey = (cfg) => `${cfg.user}|${cfg.treeText}`;

// Парсинг числа з рядків типу "1 234,56" / "1,234.56" / "1234".
export const parseConsumptionNumber = (raw) => {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // Прибрати все, крім цифр, ком, крапок, мінусу
  s = s.replace(/[^0-9,.\-]/g, "");
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Якщо обидва — припускаємо, що остання — десятковий розділювач
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  const num = Number(s);
  return Number.isFinite(num) ? num : null;
};

// Чиста функція агрегації: суми по напрямках.
export const aggregateConsumption = (rows) => {
  const totals = Object.fromEntries(DIRECTIONS.map((d) => [d, 0]));
  if (!Array.isArray(rows)) return totals;
  for (const row of rows) {
    const dir = String(row?.direction || "").trim();
    if (!DIRECTIONS.includes(dir)) continue;
    const v = typeof row?.consumption === "number" ? row.consumption : parseConsumptionNumber(row?.consumption);
    if (v == null) continue;
    totals[dir] += v;
  }
  return totals;
};

const loadPlaywright = async () => {
  try {
    const mod = await import("playwright");
    return mod;
  } catch (err) {
    const msg = err?.message || String(err);
    throw new Error(
      `Не вдалося завантажити Playwright. Встановіть: "npm install playwright && npx playwright install chromium". (${msg})`
    );
  }
};

const fillLogin = async (page, { user, password }) => {
  // Universal ASP.NET login: підтримуємо різні варіанти id/name.
  const userSelectors = [
    'input[name$="TxtLogin"]',
    'input[id$="TxtLogin"]',
    'input[name*="Login"]:not([type="hidden"])',
    'input[type="text"]',
  ];
  const passSelectors = [
    'input[name$="TxtPassword"]',
    'input[id$="TxtPassword"]',
    'input[type="password"]',
  ];
  const buttonSelectors = [
    'input[id$="BtnLogin"]',
    'input[name$="BtnLogin"]',
    'button[id$="BtnLogin"]',
    'input[type="submit"]',
    'button[type="submit"]',
  ];

  const findFirst = async (selectors) => {
    for (const sel of selectors) {
      const handle = await page.$(sel);
      if (handle) return handle;
    }
    return null;
  };

  const userInput = await findFirst(userSelectors);
  if (!userInput) throw new Error("Поле логіну не знайдено на сторінці входу");
  await userInput.fill(user);

  const passInput = await findFirst(passSelectors);
  if (!passInput) throw new Error("Поле пароля не знайдено на сторінці входу");
  await passInput.fill(password);

  const submitBtn = await findFirst(buttonSelectors);
  if (!submitBtn) throw new Error("Кнопка входу не знайдена");

  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT_MS }).catch(() => {}),
    submitBtn.click(),
  ]);
};

const ignoreContextDestroyed = (err) => {
  const msg = String(err?.message || err || "");
  if (msg.includes("Execution context was destroyed")) return null;
  if (msg.includes("Target page, context or browser has been closed")) return null;
  throw err;
};

const selectTreeNode = async (page, treeText) => {
  const needle = String(treeText || "").trim().toLowerCase();
  if (!needle) throw new Error("Порожній SERASKOE_TREE_TEXT");

  // Шукаємо посилання вузла дерева, що містить потрібний текст.
  const findLink = async () =>
    page.evaluate((n) => {
      const links = Array.from(document.querySelectorAll("a"));
      const node = links.find((a) => (a.textContent || "").trim().toLowerCase().includes(n));
      if (!node) return null;
      node.setAttribute("data-pw-tree-target", "1");
      return {
        text: (node.textContent || "").trim(),
        href: node.getAttribute("href") || "",
        id: node.id || "",
      };
    }, needle).catch(() => null);

  // Розгортає всі знайдені toggle-посилання (ASP.NET TreeView_ToggleNode).
  const expandToggles = async () => {
    const n = await page.evaluate(() => {
      const togglers = Array.from(document.querySelectorAll("a")).filter((a) => {
        const h = String(a.getAttribute("href") || "");
        return h.includes("TreeView_ToggleNode");
      });
      let count = 0;
      for (const a of togglers) {
        try {
          a.click();
          count += 1;
        } catch {}
      }
      return count;
    }).catch(() => 0);
    await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT_MS }).catch(() => {});
    return n;
  };

  // До 5 ітерацій: спробувати знайти, інакше розгорнути все ще раз.
  let info = await findLink();
  for (let i = 0; i < 5 && !info; i += 1) {
    const expanded = await expandToggles();
    if (expanded === 0) break;
    info = await findLink();
  }

  if (!info) {
    throw new Error(`Вузол "${treeText}" не знайдено у дереві об'єктів`);
  }

  // Клікаємо позначене посилання. Це викличе __doPostBack — чекаємо на навігацію.
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT_MS }).catch(() => {}),
    page.evaluate(() => {
      const a = document.querySelector('a[data-pw-tree-target="1"]');
      if (!a) return;
      if (typeof a.click === "function") a.click();
      a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    }).catch(ignoreContextDestroyed),
  ]);
};

const enableDirectionCheckboxes = async (page) => {
  // Кожен чекбокс ASP.NET може теж викликати postback. Ставимо їх по черзі
  // з очікуванням networkidle, ігноруючи "context destroyed".
  for (const dir of DIRECTIONS) {
    await Promise.all([
      page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT_MS }).catch(() => {}),
      page.evaluate((direction) => {
        const norm = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
        const needle = norm(direction);
        const inputs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
        for (const cb of inputs) {
          let label = "";
          if (cb.id) {
            const lbl = document.querySelector(`label[for="${cb.id}"]`);
            if (lbl) label = lbl.textContent || "";
          }
          if (!label && cb.parentElement) label = cb.parentElement.textContent || "";
          if (norm(label).includes(needle) && !cb.checked) {
            cb.checked = true;
            cb.dispatchEvent(new Event("click", { bubbles: true }));
            cb.dispatchEvent(new Event("change", { bubbles: true }));
            return;
          }
        }
      }, dir).catch(ignoreContextDestroyed),
    ]);
  }
};

const clickRefresh = async (page) => {
  const handle = await page.$('#MainContent_BtnRefresh, input[id$="BtnRefresh"], input[name$="BtnRefresh"]');
  if (!handle) throw new Error("Кнопку 'Оновити' (MainContent_BtnRefresh) не знайдено");
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT_MS }).catch(() => {}),
    handle.evaluate((el) => el.click()).catch(ignoreContextDestroyed),
  ]);
};

// Конвертує "YYYY-MM-DD" або Date у формат "dd.mm.yyyy".
const toDdMmYyyy = (value) => {
  let d;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, day] = value.split("-").map(Number);
    d = new Date(Date.UTC(y, m - 1, day));
  } else {
    d = new Date();
  }
  if (Number.isNaN(d.getTime())) d = new Date();
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

export const getYesterdayIso = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

// Заповнює обидва поля дат (Begin/End) однаковим значенням "dd.mm.yyyy".
const setReportDate = async (page, dateStr) => {
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT_MS }).catch(() => {}),
    page.evaluate((d) => {
      const ids = ["MainContent_DateCont_TxtBeginDate", "MainContent_DateCont_TxtEndDate"];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.value = d;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));
      }
    }, dateStr).catch(ignoreContextDestroyed),
  ]);
};

const parseTable = async (page) => {
  return await page.evaluate(() => {
    const table = document.querySelector("#MainContent_GrdConsumption");
    if (!table) return { found: false, headers: [], rows: [] };

    const trs = Array.from(table.querySelectorAll("tr"));
    if (!trs.length) return { found: true, headers: [], rows: [] };

    const headerCells = Array.from(trs[0].querySelectorAll("th, td")).map((c) =>
      (c.textContent || "").trim()
    );
    const rows = [];
    for (let i = 1; i < trs.length; i += 1) {
      const cells = Array.from(trs[i].querySelectorAll("td")).map((c) => (c.textContent || "").trim());
      if (cells.length === 0) continue;
      rows.push(cells);
    }
    return { found: true, headers: headerCells, rows };
  }).catch((err) => {
    if (String(err?.message || "").includes("Execution context was destroyed")) {
      return { found: false, headers: [], rows: [] };
    }
    throw err;
  });
};

const detectEmptyMessage = async (page) => {
  return await page.evaluate(() => {
    const text = (document.body?.innerText || "").toLowerCase();
    const markers = [
      "нема доступних звітів для відображення",
      "немає даних",
      "немає доступних",
      "no data available",
    ];
    for (const m of markers) {
      if (text.includes(m)) return m;
    }
    return null;
  }).catch(() => null);
};

const mapTableToRows = ({ headers, rows }) => {
  // Спроба знайти індекси колонок: "Точка обліку", "Напрямок", "Споживання".
  const lc = headers.map((h) => h.toLowerCase());
  const idxPoint = lc.findIndex((h) => h.includes("точк") || h.includes("обліку") || h.includes("point"));
  const idxDir = lc.findIndex((h) => h.includes("напрям") || h.includes("direction"));
  const idxCons = lc.findIndex(
    (h) => h.includes("спожив") || h.includes("consumption") || h.includes("квт")
  );

  const out = [];
  for (const r of rows) {
    const point = idxPoint >= 0 ? r[idxPoint] : r[0] || "";
    const direction = idxDir >= 0 ? r[idxDir] : r[1] || "";
    const consumptionRaw = idxCons >= 0 ? r[idxCons] : r[r.length - 1] || "";
    const consumption = parseConsumptionNumber(consumptionRaw);
    out.push({
      point: String(point || "").trim(),
      direction: String(direction || "").trim(),
      consumption: consumption == null ? consumptionRaw : consumption,
    });
  }
  return out;
};

// ---- Сесійний кеш ----
// Тримаємо браузер + сторінку залогінену та з обраним вузлом дерева у пам'яті,
// щоб не платити вартість login + tree-select на кожному запиті.
// Сесії розділені за обліковими даними (різні ресторани = різні логіни).
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 хвилин
const warmSessions = new Map(); // credKey -> { browser, context, page, expiresAt }
const sessionPromises = new Map(); // credKey -> Promise

export const destroySession = async (key) => {
  if (key === undefined) {
    // Закрити всі
    const keys = [...warmSessions.keys()];
    for (const k of keys) await destroySession(k);
    return;
  }
  const s = warmSessions.get(key);
  warmSessions.delete(key);
  sessionPromises.delete(key);
  if (!s) return;
  try { await s.browser.close(); } catch {}
};

const isSessionAlive = (s) => {
  if (!s) return false;
  if (Date.now() > s.expiresAt) return false;
  try {
    if (s.page?.isClosed?.()) return false;
  } catch { return false; }
  return true;
};

const createSession = async (cfg) => {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    });
    context.setDefaultTimeout(ACTION_TIMEOUT_MS);
    context.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

    // Блокуємо непотрібні для скрапінгу ресурси — пришвидшує завантаження.
    await context.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "image" || type === "font" || type === "media") {
        return route.abort();
      }
      return route.continue();
    });

    const page = await context.newPage();

    await page.goto(cfg.loginUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await fillLogin(page, { user: cfg.user, password: cfg.password });

    await page.goto(cfg.viewUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT_MS }).catch(() => {});

    await selectTreeNode(page, cfg.treeText);

    return { browser, context, page, expiresAt: Date.now() + SESSION_TTL_MS };
  } catch (err) {
    try { await browser.close(); } catch {}
    throw err;
  }
};

const getOrCreateSession = async (cfg) => {
  const key = credKey(cfg);
  const existing = warmSessions.get(key);
  if (isSessionAlive(existing)) return existing;
  const pending = sessionPromises.get(key);
  if (pending) return pending;
  const p = (async () => {
    try {
      const sess = await createSession(cfg);
      warmSessions.set(key, sess);
      return sess;
    } finally {
      sessionPromises.delete(key);
    }
  })();
  sessionPromises.set(key, p);
  return p;
};

// Чекає, поки після postback у таблиці зʼявиться хоча б 1 рядок даних
// АБО повідомлення про відсутність даних. Не кидає виключення.
const waitForTableReady = async (page) => {
  await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT_MS }).catch(() => {});
  try {
    await page.waitForFunction(
      () => {
        const table = document.querySelector("#MainContent_GrdConsumption");
        if (table) {
          const dataRows = table.querySelectorAll("tr").length - 1;
          if (dataRows > 0) return true;
        }
        const text = (document.body?.innerText || "").toLowerCase();
        const markers = [
          "нема доступних звітів",
          "немає даних",
          "немає доступних",
          "no data available",
        ];
        return markers.some((m) => text.includes(m));
      },
      { timeout: 15_000, polling: 300 },
    );
    return true;
  } catch {
    return false;
  }
};

// ---- Кеш результатів за датою + обліковими даними ----
const RESULT_TTL_MS = 5 * 60 * 1000; // 5 хвилин
const resultCache = new Map(); // key: `${credKey}::${reportDateIso}` -> { expiresAt, payload }

const cacheKey = (cfg, reportDateIso) => `${credKey(cfg)}::${reportDateIso}`;

const getCached = (cfg, reportDateIso) => {
  const key = cacheKey(cfg, reportDateIso);
  const hit = resultCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    resultCache.delete(key);
    return null;
  }
  return hit.payload;
};

const setCached = (cfg, reportDateIso, payload) => {
  resultCache.set(cacheKey(cfg, reportDateIso), { expiresAt: Date.now() + RESULT_TTL_MS, payload });
};

export const invalidateEnergoCenterCache = () => {
  resultCache.clear();
};

// Прогріває сесію (логін + дерево) в фоні, щоб перший запит користувача був теплий.
export const warmUpEnergoCenter = async (overrides = {}) => {
  try {
    const cfg = getConfig(overrides);
    if (!cfg.user || !cfg.password) return false;
    await getOrCreateSession(cfg);
    return true;
  } catch {
    return false;
  }
};

export const fetchEnergoCenterConsumption = async ({ debug = false, date, force = false, user, password, treeText } = {}) => {
  const cfg = getConfig({ user, password, treeText });
  const fetchedAt = new Date().toISOString();
  const reportDateIso = (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : getYesterdayIso();
  const reportDateDdMmYyyy = toDdMmYyyy(reportDateIso);
  const debugInfo = debug ? { screenshots: [], pageUrl: null, htmlSnippet: null, bodyText: null } : null;

  if (!cfg.user || !cfg.password) {
    return {
      ok: false,
      fetchedAt,
      sourceUrl: cfg.viewUrl,
      rows: [],
      error: "Не задано SERASKOE_USER / SERASKOE_PASSWORD у змінних оточення",
    };
  }

  // Швидкий шлях: кеш
  if (!force && !debug) {
    const cached = getCached(cfg, reportDateIso);
    if (cached) {
      return { ...cached, fromCache: true };
    }
  }

  let step = "init";
  const shot = async (page, label) => {
    if (!debug || !page) return;
    try {
      const p = `/tmp/energocenter-${Date.now()}-${label}.png`;
      await page.screenshot({ path: p, fullPage: true });
      debugInfo.screenshots.push(p);
    } catch (e) {
      debugInfo.screenshots.push(`(failed ${label}: ${e.message})`);
    }
  };

  // Виконуємо до 2-х спроб (на випадок гонки/протермінованої сесії).
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let session;
    try {
      step = `session-attempt-${attempt}`;
      session = await getOrCreateSession(cfg);
      const page = session.page;

      step = "check-directions";
      await enableDirectionCheckboxes(page);

      step = "set-date";
      await setReportDate(page, reportDateDdMmYyyy);
      await shot(page, `${attempt}-6-date`);

      step = "click-refresh";
      await clickRefresh(page);

      step = "wait-table";
      const tableReady = await waitForTableReady(page);
      await shot(page, `${attempt}-7-refresh`);

      step = "parse";
      const emptyMsg = await detectEmptyMessage(page);
      const table = await parseTable(page);

      if (debug) {
        debugInfo.pageUrl = page.url();
        try {
          debugInfo.htmlSnippet = (await page.content()).slice(0, 20_000);
          debugInfo.bodyText = (await page.evaluate(() => document.body?.innerText || "")).slice(0, 5000);
        } catch {}
        debugInfo.tableReady = tableReady;
        debugInfo.attempt = attempt;
      }

      if (!table.found || (table.rows.length === 0 && !emptyMsg)) {
        // Сторінка ще не догенерувала таблицю — спробуємо ще раз з холодною сесією.
        if (attempt < 2) {
          await destroySession(credKey(cfg));
          continue;
        }
        return {
          ok: false,
          fetchedAt,
          reportDate: reportDateIso,
          sourceUrl: cfg.viewUrl,
          rows: [],
          error: emptyMsg
            ? `Зовнішня система: ${emptyMsg}`
            : "Таблицю MainContent_GrdConsumption не знайдено",
          ...(debug ? { debug: debugInfo } : {}),
        };
      }

      const rows = mapTableToRows(table);

      if (rows.length === 0) {
        return {
          ok: emptyMsg ? false : true,
          fetchedAt,
          reportDate: reportDateIso,
          sourceUrl: cfg.viewUrl,
          rows: [],
          error: emptyMsg ? `Зовнішня система: ${emptyMsg}` : undefined,
          ...(debug ? { debug: debugInfo } : {}),
        };
      }

      // успіх — подовжимо TTL сесії
      session.expiresAt = Date.now() + SESSION_TTL_MS;

      const payload = {
        ok: true,
        fetchedAt,
        reportDate: reportDateIso,
        sourceUrl: cfg.viewUrl,
        rows,
        ...(debug ? { debug: debugInfo } : {}),
      };
      if (!debug) setCached(cfg, reportDateIso, payload);
      return payload;
    } catch (err) {
      const msg = err?.message || String(err);
      // Сесія могла протухнути — спробуємо ще раз чистою
      if (attempt < 2) {
        await destroySession(credKey(cfg));
        continue;
      }
      return {
        ok: false,
        fetchedAt,
        reportDate: reportDateIso,
        sourceUrl: cfg.viewUrl,
        rows: [],
        error: `[${step}] ${msg}`,
        ...(debug ? { debug: debugInfo } : {}),
      };
    }
  }

  return {
    ok: false,
    fetchedAt,
    reportDate: reportDateIso,
    sourceUrl: cfg.viewUrl,
    rows: [],
    error: `[${step}] unknown`,
    ...(debug ? { debug: debugInfo } : {}),
  };
};
