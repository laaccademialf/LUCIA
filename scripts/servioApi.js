// Servio (MS SQL Server) client — прямий обмін фактом продажів із бази Loyalty.
//
// Один акаунт обслуговує всі ресторани. Облікові дані беруться з env або з
// runtime-конфігу (керується через UI «Налаштування продажів»):
//   SERVIO_HOST       (обов'язково) — IP або хост MS SQL Server
//   SERVIO_PORT       (типово 1433)
//   SERVIO_DATABASE   (типово Loyalty)
//   SERVIO_USER       (обов'язково)
//   SERVIO_PASSWORD   (обов'язково)
//
// Драйвер `mssql` (tedious) підвантажується ліниво — якщо пакет не встановлено,
// повертаємо зрозумілу помилку з інструкцією.

const DEFAULT_PORT = 1433;
const DEFAULT_DATABASE = "Loyalty";
const REQUEST_TIMEOUT_MS = Math.max(
  5000,
  Number.parseInt(String(process.env.SERVIO_REQUEST_TIMEOUT_MS || "30000"), 10) || 30000
);

// Runtime-override з UI має пріоритет над env.
let runtimeConfig = null;

export const setServioRuntimeConfig = (cfg) => {
  if (!cfg || typeof cfg !== "object") {
    runtimeConfig = null;
    return;
  }
  runtimeConfig = {
    host: String(cfg.host || "").trim(),
    port: Number.parseInt(String(cfg.port ?? DEFAULT_PORT), 10) || DEFAULT_PORT,
    database: String(cfg.database || "").trim() || DEFAULT_DATABASE,
    user: String(cfg.user || "").trim(),
    password: String(cfg.password || ""),
  };
};

const readEnvConfig = () => ({
  host: String(process.env.SERVIO_HOST || "").trim(),
  port: Number.parseInt(String(process.env.SERVIO_PORT || DEFAULT_PORT), 10) || DEFAULT_PORT,
  database: String(process.env.SERVIO_DATABASE || "").trim() || DEFAULT_DATABASE,
  user: String(process.env.SERVIO_USER || "").trim(),
  password: String(process.env.SERVIO_PASSWORD || ""),
});

const resolveConfig = (override) => {
  const base = runtimeConfig || readEnvConfig();
  const merged = { ...base };
  if (override && typeof override === "object") {
    if (override.host !== undefined && override.host !== "") merged.host = String(override.host).trim();
    if (override.port !== undefined && override.port !== "") merged.port = Number.parseInt(String(override.port), 10) || merged.port;
    if (override.database !== undefined && override.database !== "") merged.database = String(override.database).trim();
    if (override.user !== undefined && override.user !== "") merged.user = String(override.user).trim();
    if (override.password !== undefined && override.password !== "") merged.password = String(override.password);
  }
  merged.port = merged.port || DEFAULT_PORT;
  merged.database = merged.database || DEFAULT_DATABASE;
  return merged;
};

export const getServioPublicConfig = () => {
  const cfg = runtimeConfig || readEnvConfig();
  return {
    host: cfg.host || "",
    port: cfg.port || DEFAULT_PORT,
    database: cfg.database || DEFAULT_DATABASE,
    user: cfg.user || "",
    hasPassword: Boolean(cfg.password),
    source: runtimeConfig ? "runtime" : "env",
  };
};

let mssqlModule = null;
const loadDriver = async () => {
  if (mssqlModule) return mssqlModule;
  try {
    const mod = await import("mssql");
    mssqlModule = mod.default || mod;
    return mssqlModule;
  } catch (e) {
    throw new Error(
      `Драйвер MS SQL не встановлено. Додайте пакет у КОРЕНЕВІ залежності та перевстановіть: у корені проєкту виконайте \`npm install\` (mssql уже в package.json). УВАГА: бекенд бере модулі з /app/node_modules — встановлення у scripts/custom-db НЕ допоможе (${e?.message || e}).`
    );
  }
};

const buildConnectionConfig = (cfg) => ({
  server: cfg.host,
  port: cfg.port,
  database: cfg.database,
  user: cfg.user,
  password: cfg.password,
  connectionTimeout: REQUEST_TIMEOUT_MS,
  requestTimeout: REQUEST_TIMEOUT_MS,
  options: {
    encrypt: String(process.env.SERVIO_ENCRYPT || "false").trim().toLowerCase() === "true",
    trustServerCertificate: String(process.env.SERVIO_TRUST_CERT || "true").trim().toLowerCase() !== "false",
    enableArithAbort: true,
  },
  pool: { max: 4, min: 0, idleTimeoutMillis: 30000 },
});

// Відкриває окремий пул на час запиту й гарантовано закриває його.
const withConnection = async (override, fn) => {
  const cfg = resolveConfig(override);
  if (!cfg.host) throw new Error("SERVIO_HOST (IP) обовʼязковий");
  if (!cfg.user) throw new Error("SERVIO_USER (login) обовʼязковий");
  if (!cfg.password) throw new Error("SERVIO_PASSWORD (password) обовʼязковий");

  const sql = await loadDriver();
  const pool = new sql.ConnectionPool(buildConnectionConfig(cfg));
  try {
    await pool.connect();
    return await fn(pool, sql);
  } finally {
    try { await pool.close(); } catch { /* ignore close errors */ }
  }
};

// Перевірка підключення: SELECT 1.
export const testServioConnection = async (override) => {
  try {
    const info = await withConnection(override, async (pool) => {
      const r = await pool.request().query("SELECT @@VERSION AS version");
      return r?.recordset?.[0]?.version || "";
    });
    return { ok: true, version: String(info || "").split("\n")[0].trim() };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
};

// Довідник ресторанів Servio: BaseExternalID + BaseExternalName.
export const fetchServioRestaurants = async (override) => {
  const rows = await withConnection(override, async (pool) => {
    const r = await pool.request().query(`
      SELECT [BaseExternalID], [BaseExternalName]
      FROM [Loyalty].[report].[tbCommonBaseExternal]
      WHERE BaseExternalID NOT IN (56, 5, 99)
      ORDER BY BaseExternalName
    `);
    return r?.recordset || [];
  });
  return rows.map((row) => ({
    baseExternalId: row.BaseExternalID,
    baseExternalName: String(row.BaseExternalName || "").trim(),
  }));
};

// Приводить дату (ISO yyyy-mm-dd або datetime-рядок) до JS Date для параметра.
const toDate = (value, endOfDay) => {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("Порожня дата");
  // Формати: "2026-08-01", "2026-08-01 23:59:59", "20260801", "20260801 23:59:59"
  let iso = raw;
  if (/^\d{8}(\s.*)?$/.test(raw)) {
    const [datePart, timePart] = raw.split(/\s+/);
    iso = `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}${timePart ? ` ${timePart}` : ""}`;
  }
  if (!/\d{2}:\d{2}/.test(iso)) {
    iso = `${iso} ${endOfDay ? "23:59:59" : "00:00:00"}`;
  }
  const d = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) throw new Error(`Некоректна дата: ${value}`);
  return d;
};

// Погодинна агрегація факту продажів (той самий SQL, що виконується вручну).
// @RestCode — CSV з BaseExternalID; порожній рядок = всі ресторани.
export const fetchServioHourlySales = async ({ startDate, endDate, restCode } = {}, override) => {
  const start = toDate(startDate, false);
  const end = toDate(endDate, true);
  const rest = String(restCode ?? "").trim();

  const rows = await withConnection(override, async (pool, sql) => {
    const request = pool.request();
    request.input("StartDate", sql.DateTime, start);
    request.input("EndDate", sql.DateTime, end);
    request.input("RestCode", sql.NVarChar(sql.MAX), rest);
    const r = await request.query(`
;WITH BillItems AS
(
    SELECT
        BI.BaseExternalID,
        BI.BillID,
        SUM(BI.Total) AS Total,
        MAX(BI.EnterpriseID) AS EnterpriseID
    FROM tbBillItem_ BI WITH (NOLOCK INDEX(PK_tbBillItem_))
    INNER JOIN tbBill_ B WITH (NOLOCK)
      ON B.BaseExternalID = BI.BaseExternalID
      AND B.ID = BI.BillID
    WHERE BI.ItemState <> 2
      AND B.Closed BETWEEN @StartDate AND @EndDate
      AND
      (
        NULLIF(LTRIM(RTRIM(@RestCode)), '') IS NULL
        OR
        ',' + REPLACE(@RestCode, ' ', '') + ','
          LIKE
        '%,' + CAST(BI.BaseExternalID AS nvarchar(50)) + ',%'
      )
    GROUP BY BI.BaseExternalID, BI.BillID
),
Bills AS
(
    SELECT
        B.BaseExternalID,
        CBE.BaseExternalName,
        B.ID AS BillID,
        B.Number AS BillNumber,
        B.Closed AS BillClosed,
        CONVERT(date, B.Closed) AS BillClosedDate,
        DATEPART(HOUR, B.Closed) AS ClosedHour,
        BI.Total,
        CASE WHEN B.GuestCount IS NULL OR B.GuestCount = 0 THEN 1 ELSE B.GuestCount END AS GuestCount,
        ISNULL(B.ChildCount, 0) AS ChildCount
    FROM tbBill_ B
    INNER JOIN BillItems BI
        ON BI.BaseExternalID = B.BaseExternalID
        AND BI.BillID = B.ID
    INNER JOIN report.fnGetReportUserBaseExternal(1000) CBE
        ON CBE.BaseExternalID = B.BaseExternalID
    WHERE
        B.Closed BETWEEN @StartDate AND @EndDate
        AND
        (
            NULLIF(LTRIM(RTRIM(@RestCode)), '') IS NULL
            OR
            ',' + REPLACE(@RestCode, ' ', '') + ','
                LIKE
            '%,' + CAST(B.BaseExternalID AS nvarchar(50)) + ',%'
        )
)
SELECT
    BillClosedDate,
    BaseExternalID,
    BaseExternalName,
    ClosedHour AS HourFrom,
    ClosedHour + 1 AS HourTo,
    COUNT(*) AS BillCount,
    SUM(Total) AS TotalSales,
    SUM(GuestCount) AS GuestCount,
    SUM(ChildCount) AS ChildCount,
    SUM(Total) / NULLIF(COUNT(*), 0) AS AverageBill,
    SUM(Total) / NULLIF(SUM(GuestCount), 0) AS AveragePerGuest
FROM Bills
WHERE ClosedHour BETWEEN 0 AND 22
GROUP BY BillClosedDate, BaseExternalID, BaseExternalName, ClosedHour
ORDER BY BillClosedDate, BaseExternalID, ClosedHour;
    `);
    return r?.recordset || [];
  });

  return rows.map((row) => ({
    date: row.BillClosedDate instanceof Date
      ? row.BillClosedDate.toISOString().slice(0, 10)
      : String(row.BillClosedDate || "").slice(0, 10),
    baseExternalId: row.BaseExternalID,
    baseExternalName: String(row.BaseExternalName || "").trim(),
    hourFrom: Number(row.HourFrom),
    hourTo: Number(row.HourTo),
    billCount: Number(row.BillCount) || 0,
    totalSales: Number(row.TotalSales) || 0,
    guestCount: Number(row.GuestCount) || 0,
    childCount: Number(row.ChildCount) || 0,
    averageBill: Number(row.AverageBill) || 0,
    averagePerGuest: Number(row.AveragePerGuest) || 0,
  }));
};
