const DEFAULT_SIGNIN_URL = "https://idam.metro.ua/web/Signin?passwordless=true&redirect_uri=https%3A%2F%2Fdostavka.metro.ua%2Fshop%3FidamRedirect%3D1&client_id=BTEX&country_code=UA&realm_id=SSO_CUST_UA&user_type=CUST&response_type=code";

const LOGIN_INPUT_SELECTORS = [
  'input[type="email"]',
  'input[name*="email" i]',
  'input[name*="login" i]',
  'input[name*="user" i]',
  'input[id*="email" i]',
  'input[id*="login" i]',
  'input[id*="user" i]',
  'input[type="text"]',
];

const PASSWORD_INPUT_SELECTORS = [
  'input[type="password"]',
  'input[name*="pass" i]',
  'input[id*="pass" i]',
];

const SEARCH_INPUT_SELECTORS = [
  'input[type="search"]',
  'input[placeholder*="пошук" i]',
  'input[placeholder*="search" i]',
  'input[name*="search" i]',
];

const LOAD_TIMEOUT_MS = 45_000;
const POST_LOGIN_TIMEOUT_MS = 20_000;

const loadPlaywright = async () => {
  try {
    return await import("playwright");
  } catch (error) {
    throw new Error(`Не вдалося завантажити Playwright: ${error?.message || error}`);
  }
};

const sanitizeLimit = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 50;
  return Math.max(1, Math.min(200, Math.round(numeric)));
};

const findFirstVisible = async (page, selectors = []) => {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (!count) continue;
    const visible = await locator.isVisible().catch(() => false);
    if (visible) return locator;
  }
  return null;
};

const extractDiagnostics = async (page, stage, reason) => {
  const cookies = await page.context().cookies().catch(() => []);
  const htmlSnippet = await page.content().then((html) => html.slice(0, 2500)).catch(() => "");
  return {
    stage,
    reason,
    url: page.url(),
    cookies: cookies.map((cookie) => cookie.name),
    htmlSnippet,
  };
};

const parsePrice = (value) => {
  const numeric = Number(String(value ?? "").replace(/\s+/g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

const parseRowsFromDom = async (page, limit) => {
  return page.evaluate((maxItems) => {
    const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const parsePriceText = (value) => {
      const numeric = Number(String(value || "").replace(/\s+/g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, ""));
      return Number.isFinite(numeric) ? numeric : 0;
    };

    const candidates = Array.from(document.querySelectorAll("article, [data-testid], .product-card, .product-tile, li, .tile"));
    const seen = new Set();
    const rows = [];

    for (const node of candidates) {
      if (rows.length >= maxItems) break;
      const text = normalizeText(node.textContent || "");
      if (!text || text.length < 8) continue;
      const priceMatch = text.match(/\d+[\d\s.,]{0,12}(?:грн|₴)/i) || text.match(/\d+[\d\s.,]{0,12}/);
      const price = parsePriceText(priceMatch?.[0] || "");
      if (!price) continue;

      const titleNode = node.querySelector("h1, h2, h3, h4, [data-testid*='title'], [class*='title'], [class*='name']");
      const title = normalizeText(titleNode?.textContent || text.split(/\d+[\d\s.,]{0,12}/)[0] || "");
      if (!title) continue;

      const skuMatch = text.match(/(?:арт\.?|артикул|sku|код)\s*[:#]?\s*([A-Za-z0-9-]{4,})/i);
      const packageNode = node.querySelector("[class*='pack'], [class*='unit'], [data-testid*='pack'], [data-testid*='unit']");
      const unit = normalizeText(packageNode?.textContent || "");
      const key = `${title}::${skuMatch?.[1] || ""}::${price}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id: key,
        name: title,
        code1C: skuMatch?.[1] || "",
        sku: skuMatch?.[1] || "",
        unit,
        packageText: unit,
        price,
        supplierName: "Metro Cash & Carry",
      });
    }

    return rows;
  }, limit);
};

export const fetchMetroProducts = async ({ email, password, query, limit = 50, manual = false } = {}) => {
  const normalizedEmail = String(email || "").trim();
  const normalizedPassword = String(password || "");
  const normalizedQuery = String(query || "").trim();
  const normalizedLimit = sanitizeLimit(limit);
  const manualMode = Boolean(manual);

  if (!manualMode && (!normalizedEmail || !normalizedPassword)) {
    return {
      ok: false,
      fetchedAt: new Date().toISOString(),
      rows: [],
      error: "Потрібні логін і пароль Metro, або увімкніть ручний вхід.",
      diagnostics: { stage: "validation", reason: "missing_credentials" },
      sourceUrl: DEFAULT_SIGNIN_URL,
    };
  }

  const { chromium } = await loadPlaywright();
  let browser;
  try {
    browser = await chromium.launch({
      headless: !manualMode,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
  } catch (launchError) {
    if (manualMode) {
      return {
        ok: false,
        fetchedAt: new Date().toISOString(),
        rows: [],
        error: `Не вдалося відкрити вікно браузера для ручного входу: ${launchError?.message || launchError}. Ручний вхід потребує сервера з графічним оточенням (не headless).`,
        diagnostics: { stage: "launch_failed", reason: String(launchError?.message || launchError) },
        sourceUrl: DEFAULT_SIGNIN_URL,
      };
    }
    throw launchError;
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    locale: "uk-UA",
    timezoneId: "Europe/Kyiv",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();
  page.setDefaultTimeout(LOAD_TIMEOUT_MS);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    window.chrome = window.chrome || { runtime: {} };
  });

  try {
    await page.goto(DEFAULT_SIGNIN_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(manualMode ? 1500 : 5000);

    if (manualMode) {
      // Чекаємо, поки користувач виконає вхід вручну (URL перейде в dostavka.metro.ua/shop)
      try {
        await page.waitForURL((url) => {
          const href = String(url || "");
          return href.includes("dostavka.metro.ua") && !href.includes("Signin");
        }, { timeout: 5 * 60_000 });
      } catch {
        return {
          ok: false,
          fetchedAt: new Date().toISOString(),
          rows: [],
          error: "Час очікування ручного входу вичерпано (5 хв). Спробуйте ще раз.",
          diagnostics: await extractDiagnostics(page, "manual_login_timeout", "user_did_not_complete_login"),
          sourceUrl: page.url(),
        };
      }
      await page.waitForTimeout(3000);
    } else {
      const loginInput = await findFirstVisible(page, LOGIN_INPUT_SELECTORS);
      const passwordInput = await findFirstVisible(page, PASSWORD_INPUT_SELECTORS);

      if (!loginInput || !passwordInput) {
        return {
          ok: false,
          fetchedAt: new Date().toISOString(),
          rows: [],
          error: "Metro блокує автоматичний логін у headless-сесії через Akamai/barrier challenge. Спробуйте режим ручного входу або офіційний API/export Metro.",
          diagnostics: await extractDiagnostics(page, "login_blocked", "akamai_barrier_or_login_form_unavailable"),
          sourceUrl: page.url(),
        };
      }

      await loginInput.fill(normalizedEmail);
      await passwordInput.fill(normalizedPassword);

      const submitButton = await findFirstVisible(page, [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Увійти")',
        'button:has-text("Вхід")',
        'button:has-text("Log in")',
        'button:has-text("Sign in")',
      ]);

      if (!submitButton) {
        return {
          ok: false,
          fetchedAt: new Date().toISOString(),
          rows: [],
          error: "Не знайдено кнопку входу Metro після рендеру форми.",
          diagnostics: await extractDiagnostics(page, "login_blocked", "submit_button_missing"),
          sourceUrl: page.url(),
        };
      }

      await Promise.all([
        page.waitForLoadState("networkidle", { timeout: POST_LOGIN_TIMEOUT_MS }).catch(() => {}),
        submitButton.click(),
      ]);

      await page.waitForTimeout(5000);
    }

    if (normalizedQuery) {
      const searchInput = await findFirstVisible(page, SEARCH_INPUT_SELECTORS);
      if (searchInput) {
        await searchInput.fill(normalizedQuery);
        await searchInput.press("Enter").catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: POST_LOGIN_TIMEOUT_MS }).catch(() => {});
        await page.waitForTimeout(3000);
      }
    }

    const rows = await parseRowsFromDom(page, normalizedLimit);
    if (rows.length === 0) {
      return {
        ok: false,
        fetchedAt: new Date().toISOString(),
        rows: [],
        error: "Не вдалося витягнути товари Metro з DOM. Імовірно, сторінка змінила структуру або не була доступна для автоматизації.",
        diagnostics: await extractDiagnostics(page, "parsing_failed", normalizedQuery ? "search_results_not_detected" : "catalog_not_detected"),
        sourceUrl: page.url(),
      };
    }

    return {
      ok: true,
      fetchedAt: new Date().toISOString(),
      rows: rows.map((row) => ({
        ...row,
        price: parsePrice(row.price),
      })),
      sourceUrl: page.url(),
    };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
};
