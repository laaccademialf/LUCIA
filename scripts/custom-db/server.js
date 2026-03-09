import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.MIGRATION_PORT || 8787);
const HOST = process.env.MIGRATION_HOST || "0.0.0.0";
const TOKEN = String(process.env.CUSTOM_MIGRATION_TOKEN || "").trim();
const ENGINE = String(process.env.MIGRATION_DB_ENGINE || "file").trim().toLowerCase();
const DATA_DIR = process.env.CUSTOM_MIGRATION_DATA_DIR || "./tmp/custom-db";
const SETTINGS_FILE = process.env.RUNTIME_SETTINGS_FILE || "./tmp/custom-db/runtime-settings.json";
const POSTGRES_URL = String(process.env.POSTGRES_URL || "").trim();

const MYSQL_CONFIG = {
  host: String(process.env.MYSQL_HOST || "").trim(),
  port: Number(process.env.MYSQL_PORT || 3306),
  user: String(process.env.MYSQL_USER || "").trim(),
  password: String(process.env.MYSQL_PASSWORD || "").trim(),
  database: String(process.env.MYSQL_DATABASE || "").trim(),
};

const parseTargetDbConfig = (target) => {
  const dbEngineRaw = String(target?.dbEngine || ENGINE || "").trim().toLowerCase();
  const dbEngine = dbEngineRaw === "mariadb" ? "mysql" : dbEngineRaw;

  const mysqlConfig = {
    host: String(target?.dbHost || MYSQL_CONFIG.host || "").trim(),
    port: Number(target?.dbPort || MYSQL_CONFIG.port || 3306),
    user: String(target?.dbUser || MYSQL_CONFIG.user || "").trim(),
    password:
      typeof target?.dbPassword === "string" ? target.dbPassword : MYSQL_CONFIG.password,
    database: String(target?.dbName || MYSQL_CONFIG.database || "").trim(),
  };

  const postgresUrl = String(target?.postgresUrl || POSTGRES_URL || "").trim();

  return {
    dbEngine,
    mysqlConfig,
    postgresUrl,
  };
};

const ALLOWED_ENGINES = new Set(["file", "postgres", "mysql"]);

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const ensureParentDir = async (filePath) => {
  await ensureDir(path.dirname(filePath));
};

const readSettingsFile = async () => {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { primaryConnectionId: "", runtimeConfig: null };
  }
};

const writeSettingsFile = async (settings) => {
  await ensureParentDir(SETTINGS_FILE);
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
};

const CORS_ORIGIN = process.env.RUNTIME_SETTINGS_CORS_ORIGIN || "*";

const setCorsHeaders = (res) => {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

const sendJson = (res, status, payload) => {
  const body = JSON.stringify(payload);
  setCorsHeaders(res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
};

const isValidFirebaseRuntimeConfig = (config) => {
  const required = ["apiKey", "authDomain", "projectId", "appId"];
  return required.every((key) => Boolean(String(config?.[key] || "").trim()));
};

const parseJsonBody = async (req, maxSize = 20 * 1024 * 1024) => {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxSize) {
      throw new Error("Payload too large");
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return {};
  return JSON.parse(raw);
};

const isAuthorized = (req) => {
  if (!TOKEN) return true;
  const authHeader = String(req.headers.authorization || "");
  const expected = `Bearer ${TOKEN}`;
  return authHeader === expected;
};

const sanitizeCollection = (name) => {
  const next = String(name || "").trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(next)) return null;
  return next;
};

const writeCollection = async (collectionName, docs) => {
  const filePath = path.join(DATA_DIR, `${collectionName}.json`);
  const normalized = docs.map((item) => ({ id: item.id, data: item.data }));
  await fs.writeFile(filePath, JSON.stringify(normalized, null, 2), "utf-8");
};

const collectCollectionsData = (collections, data) => {
  const collectionsData = {};
  const result = {};

  for (const rawName of collections) {
    const collectionName = sanitizeCollection(rawName);
    if (!collectionName) {
      throw new Error(`Invalid collection name: ${rawName}`);
    }

    const docs = Array.isArray(data[collectionName]) ? data[collectionName] : [];
    const normalizedDocs = docs.map((item) => ({
      id: String(item?.id || "").trim(),
      data: item?.data && typeof item.data === "object" ? item.data : {},
    }));

    collectionsData[collectionName] = normalizedDocs;
    result[collectionName] = normalizedDocs.length;
  }

  return { collectionsData, result };
};

const importToFileEngine = async (collectionsData) => {
  await ensureDir(DATA_DIR);
  for (const [collectionName, docs] of Object.entries(collectionsData)) {
    await writeCollection(collectionName, docs);
  }
};

const importToPostgresEngine = async (collectionsData, postgresUrl) => {
  if (!postgresUrl) {
    throw new Error("POSTGRES_URL is required for postgres engine");
  }

  const { importCollectionsToPostgres } = await import("./adapters/postgresAdapter.js");
  await importCollectionsToPostgres({
    collectionsData,
    connectionString: postgresUrl,
  });
};

const importToMySqlEngine = async (collectionsData, mysqlConfig) => {
  if (!mysqlConfig.host || !mysqlConfig.user || !mysqlConfig.database) {
    throw new Error("MYSQL_HOST, MYSQL_USER and MYSQL_DATABASE are required for mysql engine");
  }

  const { importCollectionsToMySql } = await import("./adapters/mysqlAdapter.js");
  await importCollectionsToMySql({
    collectionsData,
    mysqlConfig,
  });
};

const runImportByEngine = async ({ collectionsData, dbEngine, mysqlConfig, postgresUrl }) => {
  if (dbEngine === "file") {
    await importToFileEngine(collectionsData);
    return;
  }
  if (dbEngine === "postgres") {
    await importToPostgresEngine(collectionsData, postgresUrl);
    return;
  }
  if (dbEngine === "mysql") {
    await importToMySqlEngine(collectionsData, mysqlConfig);
    return;
  }

  throw new Error(`Unsupported engine: ${dbEngine}`);
};

const testDbConnection = async ({ dbEngine, mysqlConfig, postgresUrl }) => {
  if (dbEngine === "postgres") {
    if (!postgresUrl) {
      throw new Error("postgresUrl is required for postgres test");
    }

    const { Client } = await import("pg");
    const client = new Client({ connectionString: postgresUrl });
    try {
      await client.connect();
      await client.query("SELECT 1");
    } finally {
      await client.end();
    }
    return;
  }

  if (dbEngine === "mysql") {
    if (!mysqlConfig.host || !mysqlConfig.user || !mysqlConfig.database) {
      throw new Error("dbHost, dbUser and dbName are required for mysql test");
    }

    const mysql = await import("mysql2/promise");
    const conn = await mysql.default.createConnection(mysqlConfig);
    try {
      await conn.execute("SELECT 1");
    } finally {
      await conn.end();
    }
    return;
  }

  throw new Error(`Unsupported dbEngine for test: ${dbEngine}`);
};

const handleMigrationImport = async (req, res) => {
  if (!isAuthorized(req)) {
    return sendJson(res, 401, { ok: false, error: "Unauthorized" });
  }

  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
  }

  const collections = Array.isArray(payload?.collections) ? payload.collections : [];
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const targetDb = parseTargetDbConfig(payload?.target || {});

  if (!collections.length) {
    return sendJson(res, 400, { ok: false, error: "No collections provided" });
  }

  let collectionsData;
  let result;
  try {
    const prepared = collectCollectionsData(collections, data);
    collectionsData = prepared.collectionsData;
    result = prepared.result;
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message });
  }

  try {
    await runImportByEngine({
      collectionsData,
      dbEngine: targetDb.dbEngine,
      mysqlConfig: targetDb.mysqlConfig,
      postgresUrl: targetDb.postgresUrl,
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message });
  }

  return sendJson(res, 200, {
    ok: true,
    engine: targetDb.dbEngine,
    source: payload?.source || null,
    target: payload?.target || null,
    importedCollections: result,
    importedAt: new Date().toISOString(),
  });
};

const handleDbTest = async (req, res) => {
  if (!isAuthorized(req)) {
    return sendJson(res, 401, { ok: false, error: "Unauthorized" });
  }

  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
  }

  const targetDb = parseTargetDbConfig(payload?.target || {});
  try {
    await testDbConnection(targetDb);
    return sendJson(res, 200, {
      ok: true,
      dbEngine: targetDb.dbEngine,
      testedAt: new Date().toISOString(),
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message });
  }
};

const handleGetRuntimeSettings = async (req, res) => {
  if (!isAuthorized(req)) {
    return sendJson(res, 401, { ok: false, error: "Unauthorized" });
  }

  const settings = await readSettingsFile();
  return sendJson(res, 200, {
    ok: true,
    primaryConnectionId: String(settings?.primaryConnectionId || ""),
    runtimeConfig: settings?.runtimeConfig || null,
  });
};

const handlePutRuntimeSettings = async (req, res) => {
  if (!isAuthorized(req)) {
    return sendJson(res, 401, { ok: false, error: "Unauthorized" });
  }

  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
  }

  const primaryConnectionId = String(payload?.primaryConnectionId || "");
  const runtimeConfig = payload?.runtimeConfig || null;

  if (runtimeConfig && !isValidFirebaseRuntimeConfig(runtimeConfig)) {
    return sendJson(res, 400, { ok: false, error: "Invalid runtimeConfig" });
  }

  await writeSettingsFile({
    primaryConnectionId,
    runtimeConfig,
    updatedAt: new Date().toISOString(),
  });

  return sendJson(res, 200, { ok: true });
};

const handleDeleteRuntimeSettings = async (req, res) => {
  if (!isAuthorized(req)) {
    return sendJson(res, 401, { ok: false, error: "Unauthorized" });
  }

  await writeSettingsFile({
    primaryConnectionId: "",
    runtimeConfig: null,
    updatedAt: new Date().toISOString(),
  });

  return sendJson(res, 200, { ok: true });
};

const server = http.createServer(async (req, res) => {
  const method = req.method || "GET";
  const url = req.url || "/";

  if (method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (method === "GET" && url === "/health") {
    if (!ALLOWED_ENGINES.has(ENGINE)) {
      return sendJson(res, 500, {
        ok: false,
        error: `Invalid MIGRATION_DB_ENGINE: ${ENGINE}`,
        allowed: Array.from(ALLOWED_ENGINES),
      });
    }

    return sendJson(res, 200, {
      ok: true,
      service: "custom-db-migration-server",
      engine: ENGINE,
      tokenProtected: Boolean(TOKEN),
      now: new Date().toISOString(),
    });
  }

  if (method === "POST" && url === "/migration/import") {
    try {
      return await handleMigrationImport(req, res);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  if (method === "POST" && url === "/db/test") {
    try {
      return await handleDbTest(req, res);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  if (url === "/settings/firebase-runtime" && method === "GET") {
    return handleGetRuntimeSettings(req, res);
  }

  if (url === "/settings/firebase-runtime" && method === "PUT") {
    return handlePutRuntimeSettings(req, res);
  }

  if (url === "/settings/firebase-runtime" && method === "DELETE") {
    return handleDeleteRuntimeSettings(req, res);
  }

  return sendJson(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Custom migration server is running on http://${HOST}:${PORT}`);
  console.log(`Engine: ${ENGINE}`);
  console.log(`Health endpoint: http://${HOST}:${PORT}/health`);
  console.log(`Migration endpoint: http://${HOST}:${PORT}/migration/import`);
});
