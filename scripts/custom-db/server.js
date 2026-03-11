import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const PORT = Number(process.env.MIGRATION_PORT || 8787);
const HOST = process.env.MIGRATION_HOST || "0.0.0.0";
const TOKEN = String(process.env.CUSTOM_MIGRATION_TOKEN || "").trim();
const ENGINE = String(process.env.MIGRATION_DB_ENGINE || "file").trim().toLowerCase();
const DATA_DIR = process.env.CUSTOM_MIGRATION_DATA_DIR || "./tmp/custom-db";
const SETTINGS_FILE = process.env.RUNTIME_SETTINGS_FILE || "./tmp/custom-db/runtime-settings.json";
const POSTGRES_URL = String(process.env.POSTGRES_URL || "").trim();
const ASSET_IMAGE_DIR = String(process.env.ASSET_IMAGE_DIR || "/var/www/luci.lafamiglia.ua/app/img").trim();
const ASSET_IMAGE_PUBLIC_BASE = String(process.env.ASSET_IMAGE_PUBLIC_BASE || "/app/img").trim().replace(/\/+$/, "");

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
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-api-token, x-session-token"
  );
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

const isValidCustomRuntimeConfig = (config) => {
  return Boolean(String(config?.apiBaseUrl || "").trim());
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
  const apiTokenHeader = String(req.headers["x-api-token"] || "");
  const expected = `Bearer ${TOKEN}`;
  return authHeader === expected || apiTokenHeader === TOKEN;
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

const readCollectionFile = async (collectionName) => {
  const filePath = path.join(DATA_DIR, `${collectionName}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeCollectionFile = async (collectionName, items) => {
  await ensureDir(DATA_DIR);
  const filePath = path.join(DATA_DIR, `${collectionName}.json`);
  await fs.writeFile(filePath, JSON.stringify(items, null, 2), "utf-8");
};

const normalizeAssetPayload = (payload) => {
  if (!payload || typeof payload !== "object") return {};
  const next = { ...payload };
  delete next.id;

  if (Array.isArray(next.photos)) {
    next.photos = next.photos
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((url) => Boolean(url) && !url.startsWith("data:image/"))
      .slice(0, 10);
  }

  return next;
};

const IMAGE_EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const decodeDataUrlImage = (dataUrl) => {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL");
  }

  const mimeType = String(match[1] || "").toLowerCase();
  const base64Payload = String(match[2] || "");
  const ext = IMAGE_EXT_BY_MIME[mimeType];
  if (!ext) {
    throw new Error(`Unsupported image mime type: ${mimeType}`);
  }

  const buffer = Buffer.from(base64Payload, "base64");
  if (!buffer.length) {
    throw new Error("Empty image payload");
  }

  return { mimeType, ext, buffer };
};

const sanitizeFileBaseName = (name) => {
  const raw = String(name || "photo").trim().toLowerCase();
  const cleaned = raw
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "photo";
};

const saveAssetPhoto = async ({ fileName, dataUrl }) => {
  const { ext, buffer } = decodeDataUrlImage(dataUrl);
  const safeName = sanitizeFileBaseName(fileName);
  const uniqueName = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}_${safeName}.${ext}`;

  await ensureDir(ASSET_IMAGE_DIR);
  const absolutePath = path.join(ASSET_IMAGE_DIR, uniqueName);
  await fs.writeFile(absolutePath, buffer);

  return {
    name: String(fileName || "photo"),
    url: `${ASSET_IMAGE_PUBLIC_BASE}/${uniqueName}`,
  };
};

const nowIso = () => new Date().toISOString();

const hashPassword = (password, salt = crypto.randomBytes(16).toString("hex")) => {
  const hash = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return { salt, hash };
};

const verifyPassword = (password, salt, hash) => {
  const next = crypto.scryptSync(String(password || ""), String(salt || ""), 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(next, "hex"), Buffer.from(String(hash || ""), "hex"));
};

const createSessionToken = () => crypto.randomBytes(32).toString("hex");

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const sessionTokenFromRequest = (req) => {
  const sessionHeader = String(req.headers["x-session-token"] || "").trim();
  if (sessionHeader) return sessionHeader;

  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (TOKEN && token === TOKEN) return "";
    return token;
  }
  return "";
};

const mapUserProfile = (profile) => ({
  uid: String(profile?.id || ""),
  email: String(profile?.email || ""),
  displayName: String(profile?.displayName || ""),
  role: String(profile?.role || "user"),
  restaurant: String(profile?.restaurant || ""),
  position: String(profile?.position || ""),
  workRole: String(profile?.workRole || ""),
});

const getAuthUserByEmail = async (email, dbConfig) => {
  const normalizedEmail = normalizeEmail(email);
  const authUsers = await getCollectionItemsData("authUsers", dbConfig);
  return (
    authUsers.find((item) => normalizeEmail(item?.email) === normalizedEmail) || null
  );
};

const getUserProfileById = async (id, dbConfig) => {
  return getCollectionItemData("users", id, dbConfig);
};

const getSessionByToken = async (token, dbConfig) => {
  if (!token) return null;
  return getCollectionItemData("authSessions", token, dbConfig);
};

const createSession = async (userId, dbConfig) => {
  const token = createSessionToken();
  await createCollectionItemData(
    "authSessions",
    {
      id: token,
      userId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    dbConfig
  );
  return token;
};

const deleteSession = async (token, dbConfig) => {
  if (!token) return;
  await deleteCollectionItemData("authSessions", token, dbConfig);
};

const resolveAuthContext = async (req, dbConfig) => {
  const token = sessionTokenFromRequest(req);
  if (!token) return { token: "", session: null, profile: null };
  const session = await getSessionByToken(token, dbConfig);
  if (!session) return { token, session: null, profile: null };
  const profile = await getUserProfileById(session.userId, dbConfig);
  return { token, session, profile };
};

const normalizeCollectionName = (name) => {
  const cleaned = String(name || "").trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(cleaned)) {
    throw new Error(`Invalid collection name: ${name}`);
  }
  return cleaned;
};

const tableNameForCollection = (collectionName) =>
  `lucia_${String(collectionName || "").replace(/-/g, "_")}`;

const sortByPayloadTimestampsDesc = (items) => {
  const toTimestamp = (value) => {
    const parsed = Date.parse(String(value || ""));
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  return [...items].sort((a, b) => {
    const bTime = Math.max(
      toTimestamp(b?.updatedAt),
      toTimestamp(b?.createdAt),
      toTimestamp(b?.updated_at),
      toTimestamp(b?.created_at)
    );
    const aTime = Math.max(
      toTimestamp(a?.updatedAt),
      toTimestamp(a?.createdAt),
      toTimestamp(a?.updated_at),
      toTimestamp(a?.created_at)
    );

    if (bTime !== aTime) return bTime - aTime;
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });
};

const ensureGenericTableMySql = async (conn, collectionName) => {
  const tableName = tableNameForCollection(collectionName);
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`${tableName}\` (
      id VARCHAR(255) PRIMARY KEY,
      payload JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  return tableName;
};

const tableExistsMySql = async (conn, tableName) => {
  const [rows] = await conn.execute(
    `SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
};

const resolveCollectionTableMySql = async (conn, collectionName, { preferFlat = true } = {}) => {
  const baseTable = tableNameForCollection(collectionName);
  const flatTable = `${baseTable}_flat`;

  if (preferFlat && (await tableExistsMySql(conn, flatTable))) {
    return flatTable;
  }

  if (await tableExistsMySql(conn, baseTable)) {
    return baseTable;
  }

  // fallback: create base table for backward compatibility
  await ensureGenericTableMySql(conn, collectionName);
  return baseTable;
};

const ensureGenericTablePostgres = async (client, collectionName) => {
  const tableName = tableNameForCollection(collectionName);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${tableName}" (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  return tableName;
};

const mapMySqlRowToDocument = (row) => {
  const safeRow = row && typeof row === "object" ? row : {};
  const normalizedId = String(safeRow.id || "");

  if (Object.prototype.hasOwnProperty.call(safeRow, "payload")) {
    const parsed = parsePayloadField(safeRow.payload);
    const scalar = Object.entries(safeRow).reduce((acc, [key, value]) => {
      if (key === "id" || key === "payload") return acc;
      if (value === undefined || value === null) return acc;
      if (parsed[key] === undefined) {
        acc[key] = value;
      }
      return acc;
    }, {});
    return { id: normalizedId, ...parsed, ...scalar };
  }

  return { ...safeRow, id: normalizedId };
};

const getCollectionItemsData = async (collectionName, dbConfig) => {
  const collection = normalizeCollectionName(collectionName);

  if (dbConfig.dbEngine === "file") {
    const items = await readCollectionFile(collection);
    return items.map((item) => ({ id: item.id, ...(item.data || {}) }));
  }

  if (dbConfig.dbEngine === "mysql") {
    const mysql = await import("mysql2/promise");
    const conn = await mysql.default.createConnection(dbConfig.mysqlConfig);
    try {
      const tableName = await resolveCollectionTableMySql(conn, collection);
      const existingColumns = await getMySqlColumns(conn, tableName);
      const hasPayloadColumn = existingColumns.has("payload");
      const [rows] = await conn.execute(
        hasPayloadColumn
          ? `SELECT id, payload FROM \`${tableName}\``
          : `SELECT * FROM \`${tableName}\``
      );
      return sortByPayloadTimestampsDesc(
        rows.map((row) => mapMySqlRowToDocument(row))
      );
    } finally {
      await conn.end();
    }
  }

  if (dbConfig.dbEngine === "postgres") {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbConfig.postgresUrl });
    await client.connect();
    try {
      const tableName = await ensureGenericTablePostgres(client, collection);
      const result = await client.query(`SELECT id, payload FROM "${tableName}"`);
      return sortByPayloadTimestampsDesc(
        result.rows.map((row) => ({ id: row.id, ...parsePayloadField(row.payload) }))
      );
    } finally {
      await client.end();
    }
  }

  throw new Error(`Unsupported engine for collection ${collection}: ${dbConfig.dbEngine}`);
};

const getCollectionItemData = async (collectionName, id, dbConfig) => {
  const collection = normalizeCollectionName(collectionName);
  const itemId = String(id || "").trim();
  if (!itemId) return null;

  if (dbConfig.dbEngine === "file") {
    const items = await readCollectionFile(collection);
    const found = items.find((item) => String(item?.id || "") === itemId);
    if (!found) return null;
    return { id: found.id, ...(found.data || {}) };
  }

  if (dbConfig.dbEngine === "mysql") {
    const mysql = await import("mysql2/promise");
    const conn = await mysql.default.createConnection(dbConfig.mysqlConfig);
    try {
      const tableName = await resolveCollectionTableMySql(conn, collection);
      const existingColumns = await getMySqlColumns(conn, tableName);
      const hasPayloadColumn = existingColumns.has("payload");
      const [rows] = await conn.execute(
        hasPayloadColumn
          ? `SELECT id, payload FROM \`${tableName}\` WHERE id = ? LIMIT 1`
          : `SELECT * FROM \`${tableName}\` WHERE id = ? LIMIT 1`,
        [itemId]
      );
      if (!rows.length) return null;
      return mapMySqlRowToDocument(rows[0]);
    } finally {
      await conn.end();
    }
  }

  if (dbConfig.dbEngine === "postgres") {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbConfig.postgresUrl });
    await client.connect();
    try {
      const tableName = await ensureGenericTablePostgres(client, collection);
      const result = await client.query(`SELECT id, payload FROM "${tableName}" WHERE id = $1 LIMIT 1`, [itemId]);
      if (!result.rows.length) return null;
      return { id: result.rows[0].id, ...parsePayloadField(result.rows[0].payload) };
    } finally {
      await client.end();
    }
  }

  throw new Error(`Unsupported engine for collection ${collection}: ${dbConfig.dbEngine}`);
};

const createCollectionItemData = async (collectionName, payload, dbConfig) => {
  const collection = normalizeCollectionName(collectionName);
  const nextId = String(payload?.id || "").trim() || randomId();
  const normalized = {
    ...(payload && typeof payload === "object" ? payload : {}),
    createdAt: payload?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  delete normalized.id;

  if (dbConfig.dbEngine === "file") {
    const items = await readCollectionFile(collection);
    const filtered = items.filter((item) => String(item?.id || "") !== nextId);
    filtered.push({ id: nextId, data: normalized });
    await writeCollectionFile(collection, filtered);
    return nextId;
  }

  if (dbConfig.dbEngine === "mysql") {
    const mysql = await import("mysql2/promise");
    const conn = await mysql.default.createConnection(dbConfig.mysqlConfig);
    try {
      const tableName = await resolveCollectionTableMySql(conn, collection);
      const existingColumns = await getMySqlColumns(conn, tableName);
      const hasPayloadColumn = existingColumns.has("payload");

      if (hasPayloadColumn) {
        await conn.execute(
          `INSERT INTO \`${tableName}\` (id, payload) VALUES (?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP`,
          [nextId, JSON.stringify(normalized)]
        );
        return nextId;
      }

      // Compatibility mode: some flat tables were created without payload column.
      const flat = flattenScalarFields(normalized);
      const typeMap = Object.entries(flat).reduce((acc, [col, value]) => {
        acc[col] = mergeTypes(acc[col], detectValueType(value));
        return acc;
      }, {});

      await ensureFlatColumnsMySql(conn, tableName, typeMap);
      const columnsAfterEnsure = await getMySqlColumns(conn, tableName);
      const scalarColumns = Object.keys(flat).filter((col) => columnsAfterEnsure.has(col));

      const insertColumns = ["id", ...scalarColumns];
      const insertValues = [
        nextId,
        ...scalarColumns.map((col) => {
          const value = flat[col];
          if (typeof value === "boolean") return value ? 1 : 0;
          return value ?? null;
        }),
      ];

      const placeholders = insertColumns.map(() => "?").join(", ");
      const updates = [
        ...scalarColumns.map((col) => `${quoteIdentMySql(col)} = VALUES(${quoteIdentMySql(col)})`),
        ...(columnsAfterEnsure.has("updated_at") ? ["updated_at = CURRENT_TIMESTAMP"] : []),
      ].join(", ");

      if (!updates) {
        await conn.execute(
          `INSERT IGNORE INTO ${quoteIdentMySql(tableName)} (${insertColumns.map((col) => quoteIdentMySql(col)).join(", ")}) VALUES (${placeholders})`,
          insertValues
        );
        return nextId;
      }

      await conn.execute(
        `INSERT INTO ${quoteIdentMySql(tableName)} (${insertColumns.map((col) => quoteIdentMySql(col)).join(", ")}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
        insertValues
      );
      return nextId;
    } finally {
      await conn.end();
    }
  }

  if (dbConfig.dbEngine === "postgres") {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbConfig.postgresUrl });
    await client.connect();
    try {
      const tableName = await ensureGenericTablePostgres(client, collection);
      await client.query(
        `INSERT INTO "${tableName}" (id, payload, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
        [nextId, JSON.stringify(normalized)]
      );
      return nextId;
    } finally {
      await client.end();
    }
  }

  throw new Error(`Unsupported engine for collection ${collection}: ${dbConfig.dbEngine}`);
};

const updateCollectionItemData = async (collectionName, id, payload, dbConfig) => {
  const collection = normalizeCollectionName(collectionName);
  const itemId = String(id || "").trim();
  if (!itemId) throw new Error("Item id is required");

  const existing = await getCollectionItemData(collection, itemId, dbConfig);
  if (!existing) throw new Error("Item not found");

  const merged = {
    ...existing,
    ...(payload && typeof payload === "object" ? payload : {}),
    updatedAt: new Date().toISOString(),
  };
  delete merged.id;

  return createCollectionItemData(collection, { ...merged, id: itemId }, dbConfig);
};

const deleteCollectionItemData = async (collectionName, id, dbConfig) => {
  const collection = normalizeCollectionName(collectionName);
  const itemId = String(id || "").trim();
  if (!itemId) throw new Error("Item id is required");

  if (dbConfig.dbEngine === "file") {
    const items = await readCollectionFile(collection);
    await writeCollectionFile(
      collection,
      items.filter((item) => String(item?.id || "") !== itemId)
    );
    return;
  }

  if (dbConfig.dbEngine === "mysql") {
    const mysql = await import("mysql2/promise");
    const conn = await mysql.default.createConnection(dbConfig.mysqlConfig);
    try {
      const tableName = await resolveCollectionTableMySql(conn, collection);
      await conn.execute(`DELETE FROM \`${tableName}\` WHERE id = ?`, [itemId]);
      return;
    } finally {
      await conn.end();
    }
  }

  if (dbConfig.dbEngine === "postgres") {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbConfig.postgresUrl });
    await client.connect();
    try {
      const tableName = await ensureGenericTablePostgres(client, collection);
      await client.query(`DELETE FROM "${tableName}" WHERE id = $1`, [itemId]);
      return;
    } finally {
      await client.end();
    }
  }

  throw new Error(`Unsupported engine for collection ${collection}: ${dbConfig.dbEngine}`);
};

const randomId = () =>
  `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const ensureAssetsTablePostgres = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS lucia_assets (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

const parsePayloadField = (value) => {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const getAssetsRuntimeConfig = () => {
  const targetDb = parseTargetDbConfig({});
  if (targetDb.dbEngine === "postgres" && !targetDb.postgresUrl) {
    return { ...targetDb, dbEngine: "file" };
  }
  if (
    targetDb.dbEngine === "mysql" &&
    (!targetDb.mysqlConfig.host || !targetDb.mysqlConfig.user || !targetDb.mysqlConfig.database)
  ) {
    return { ...targetDb, dbEngine: "file" };
  }
  return targetDb;
};

const getAssetsData = async (dbConfig) => {
  if (dbConfig.dbEngine === "file") {
    const items = await readCollectionFile("assets");
    return items.map((item) => ({ id: item.id, ...(item.data || {}) }));
  }

  if (dbConfig.dbEngine === "mysql") {
    return getCollectionItemsData("assets", dbConfig);
  }

  if (dbConfig.dbEngine === "postgres") {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbConfig.postgresUrl });
    await client.connect();
    try {
      await ensureAssetsTablePostgres(client);
      const result = await client.query("SELECT id, payload FROM lucia_assets ORDER BY id ASC");
      return result.rows.map((row) => ({ id: row.id, ...parsePayloadField(row.payload) }));
    } finally {
      await client.end();
    }
  }

  throw new Error(`Unsupported engine for assets: ${dbConfig.dbEngine}`);
};

const createAssetData = async (payload, dbConfig) => {
  const nextId = String(payload?.id || "").trim() || randomId();
  const normalized = {
    ...normalizeAssetPayload(payload),
    createdAt: payload?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (dbConfig.dbEngine === "file") {
    const items = await readCollectionFile("assets");
    const filtered = items.filter((item) => String(item?.id || "") !== nextId);
    filtered.push({ id: nextId, data: normalized });
    await writeCollectionFile("assets", filtered);
    return nextId;
  }

  if (dbConfig.dbEngine === "mysql") {
    return createCollectionItemData("assets", { ...normalized, id: nextId }, dbConfig);
  }

  if (dbConfig.dbEngine === "postgres") {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbConfig.postgresUrl });
    await client.connect();
    try {
      await ensureAssetsTablePostgres(client);
      await client.query(
        `
          INSERT INTO lucia_assets (id, payload, updated_at)
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (id)
          DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
        `,
        [nextId, JSON.stringify(normalized)]
      );
      return nextId;
    } finally {
      await client.end();
    }
  }

  throw new Error(`Unsupported engine for assets: ${dbConfig.dbEngine}`);
};

const updateAssetData = async (id, payload, dbConfig) => {
  const assetId = String(id || "").trim();
  if (!assetId) throw new Error("Asset id is required");

  if (dbConfig.dbEngine === "file") {
    const items = await readCollectionFile("assets");
    const idx = items.findIndex((item) => String(item?.id || "") === assetId);
    if (idx === -1) throw new Error("Asset not found");
    const prev = items[idx]?.data || {};
    items[idx] = {
      id: assetId,
      data: {
        ...prev,
        ...normalizeAssetPayload(payload),
        updatedAt: new Date().toISOString(),
      },
    };
    await writeCollectionFile("assets", items);
    return;
  }

  if (dbConfig.dbEngine === "mysql") {
    await updateCollectionItemData("assets", assetId, normalizeAssetPayload(payload), dbConfig);
    return;
  }

  if (dbConfig.dbEngine === "postgres") {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbConfig.postgresUrl });
    await client.connect();
    try {
      await ensureAssetsTablePostgres(client);
      const existing = await client.query("SELECT payload FROM lucia_assets WHERE id = $1 LIMIT 1", [
        assetId,
      ]);
      if (!existing.rows.length) throw new Error("Asset not found");
      const prev = parsePayloadField(existing.rows[0].payload);
      const merged = {
        ...prev,
        ...normalizeAssetPayload(payload),
        updatedAt: new Date().toISOString(),
      };
      await client.query("UPDATE lucia_assets SET payload = $1::jsonb, updated_at = NOW() WHERE id = $2", [
        JSON.stringify(merged),
        assetId,
      ]);
      return;
    } finally {
      await client.end();
    }
  }

  throw new Error(`Unsupported engine for assets: ${dbConfig.dbEngine}`);
};

const deleteAssetData = async (id, dbConfig) => {
  const assetId = String(id || "").trim();
  if (!assetId) throw new Error("Asset id is required");

  if (dbConfig.dbEngine === "file") {
    const items = await readCollectionFile("assets");
    await writeCollectionFile(
      "assets",
      items.filter((item) => String(item?.id || "") !== assetId)
    );
    return;
  }

  if (dbConfig.dbEngine === "mysql") {
    await deleteCollectionItemData("assets", assetId, dbConfig);
    return;
  }

  if (dbConfig.dbEngine === "postgres") {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbConfig.postgresUrl });
    await client.connect();
    try {
      await ensureAssetsTablePostgres(client);
      await client.query("DELETE FROM lucia_assets WHERE id = $1", [assetId]);
      return;
    } finally {
      await client.end();
    }
  }

  throw new Error(`Unsupported engine for assets: ${dbConfig.dbEngine}`);
};

const ensureServiceRequestsTablePostgres = async (client) => {
  const tableName = tableNameForCollection("serviceRequests");
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${tableName}" (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  return tableName;
};

const normalizeServiceRequestPayload = (payload) => {
  if (!payload || typeof payload !== "object") return {};
  const next = { ...payload };
  delete next.id;
  return next;
};

const getServiceRequestsData = async (dbConfig) => {
  if (dbConfig.dbEngine === "file") {
    const items = await readCollectionFile("serviceRequests");
    return items
      .map((item) => ({ id: item.id, ...(item.data || {}) }))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }

  if (dbConfig.dbEngine === "mysql") {
    return getCollectionItemsData("serviceRequests", dbConfig);
  }

  if (dbConfig.dbEngine === "postgres") {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbConfig.postgresUrl });
    await client.connect();
    try {
      const tableName = await ensureServiceRequestsTablePostgres(client);
      const result = await client.query(`SELECT id, payload FROM "${tableName}"`);
      return sortByPayloadTimestampsDesc(
        result.rows.map((row) => ({ id: row.id, ...parsePayloadField(row.payload) }))
      );
    } finally {
      await client.end();
    }
  }

  throw new Error(`Unsupported engine for service requests: ${dbConfig.dbEngine}`);
};

const createServiceRequestData = async (payload, dbConfig) => {
  const nextId = String(payload?.id || "").trim() || randomId();
  const now = new Date().toISOString();
  const normalized = {
    ...normalizeServiceRequestPayload(payload),
    createdAt: payload?.createdAt || now,
    updatedAt: now,
  };

  if (dbConfig.dbEngine === "file") {
    const items = await readCollectionFile("serviceRequests");
    const filtered = items.filter((item) => String(item?.id || "") !== nextId);
    filtered.push({ id: nextId, data: normalized });
    await writeCollectionFile("serviceRequests", filtered);
    return nextId;
  }

  if (dbConfig.dbEngine === "mysql") {
    return createCollectionItemData("serviceRequests", { ...normalized, id: nextId }, dbConfig);
  }

  if (dbConfig.dbEngine === "postgres") {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbConfig.postgresUrl });
    await client.connect();
    try {
      const tableName = await ensureServiceRequestsTablePostgres(client);
      await client.query(
        `
          INSERT INTO "${tableName}" (id, payload, updated_at)
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (id)
          DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
        `,
        [nextId, JSON.stringify(normalized)]
      );
      return nextId;
    } finally {
      await client.end();
    }
  }

  throw new Error(`Unsupported engine for service requests: ${dbConfig.dbEngine}`);
};

const updateServiceRequestData = async (id, payload, dbConfig) => {
  const requestId = String(id || "").trim();
  if (!requestId) throw new Error("Service request id is required");

  if (dbConfig.dbEngine === "file") {
    const items = await readCollectionFile("serviceRequests");
    const idx = items.findIndex((item) => String(item?.id || "") === requestId);
    if (idx === -1) throw new Error("Service request not found");
    const prev = items[idx]?.data || {};
    items[idx] = {
      id: requestId,
      data: {
        ...prev,
        ...normalizeServiceRequestPayload(payload),
        updatedAt: new Date().toISOString(),
      },
    };
    await writeCollectionFile("serviceRequests", items);
    return;
  }

  if (dbConfig.dbEngine === "mysql") {
    await updateCollectionItemData("serviceRequests", requestId, normalizeServiceRequestPayload(payload), dbConfig);
    return;
  }

  if (dbConfig.dbEngine === "postgres") {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbConfig.postgresUrl });
    await client.connect();
    try {
      const tableName = await ensureServiceRequestsTablePostgres(client);
      const existing = await client.query(
        `SELECT payload FROM "${tableName}" WHERE id = $1 LIMIT 1`,
        [requestId]
      );
      if (!existing.rows.length) throw new Error("Service request not found");
      const prev = parsePayloadField(existing.rows[0].payload);
      const merged = {
        ...prev,
        ...normalizeServiceRequestPayload(payload),
        updatedAt: new Date().toISOString(),
      };
      await client.query(
        `UPDATE "${tableName}" SET payload = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(merged), requestId]
      );
      return;
    } finally {
      await client.end();
    }
  }

  throw new Error(`Unsupported engine for service requests: ${dbConfig.dbEngine}`);
};

const deleteServiceRequestData = async (id, dbConfig) => {
  const requestId = String(id || "").trim();
  if (!requestId) throw new Error("Service request id is required");

  if (dbConfig.dbEngine === "file") {
    const items = await readCollectionFile("serviceRequests");
    await writeCollectionFile(
      "serviceRequests",
      items.filter((item) => String(item?.id || "") !== requestId)
    );
    return;
  }

  if (dbConfig.dbEngine === "mysql") {
    await deleteCollectionItemData("serviceRequests", requestId, dbConfig);
    return;
  }

  if (dbConfig.dbEngine === "postgres") {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbConfig.postgresUrl });
    await client.connect();
    try {
      const tableName = await ensureServiceRequestsTablePostgres(client);
      await client.query(`DELETE FROM "${tableName}" WHERE id = $1`, [requestId]);
      return;
    } finally {
      await client.end();
    }
  }

  throw new Error(`Unsupported engine for service requests: ${dbConfig.dbEngine}`);
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

const quoteIdentMySql = (name) => {
  if (!/^[a-zA-Z0-9_]+$/.test(String(name || ""))) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return `\`${name}\``;
};

const sanitizeColumnName = (raw) => {
  const normalized = String(raw || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .toLowerCase()
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) return "field_value";
  if (/^[0-9]/.test(normalized)) return `f_${normalized}`;
  if (normalized === "id" || normalized === "payload" || normalized === "updated_at") {
    return `f_${normalized}`;
  }
  return normalized;
};

const flattenScalarFields = (input, prefix = "", out = {}) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;

  for (const [key, value] of Object.entries(input)) {
    const nextKey = prefix ? `${prefix}_${key}` : key;
    if (value === null || value === undefined) {
      out[sanitizeColumnName(nextKey)] = null;
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[sanitizeColumnName(nextKey)] = value;
      continue;
    }
    if (value instanceof Date) {
      out[sanitizeColumnName(nextKey)] = value.toISOString();
      continue;
    }
    if (Array.isArray(value)) {
      out[sanitizeColumnName(nextKey)] = JSON.stringify(value);
      continue;
    }
    if (typeof value === "object") {
      // Підтримуємо вкладені об'єкти (рекурсія)
      flattenScalarFields(value, nextKey, out);
    }
  }
  return out;
};

const detectValueType = (value) => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "string") {
    const isoDateLike = /^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/.test(value);
    if (isoDateLike) return "date";
    return "string";
  }
  return "string";
};

const mergeTypes = (current, next) => {
  if (!current || current === "null") return next;
  if (!next || next === "null") return current;
  if (current === next) return current;
  if ((current === "integer" && next === "number") || (current === "number" && next === "integer")) {
    return "number";
  }
  if ((current === "date" && next === "string") || (current === "string" && next === "date")) {
    return "string";
  }
  return "string";
};

const sqlTypeFor = (type) => {
  if (type === "boolean") return "TINYINT(1) NULL";
  if (type === "integer") return "BIGINT NULL";
  if (type === "number") return "DOUBLE NULL";
  if (type === "date") return "DATETIME NULL";
  return "TEXT NULL";
};

const getMySqlColumns = async (conn, tableName) => {
  const [rows] = await conn.execute(
    `SELECT COLUMN_NAME AS column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => String(row.column_name || "")));
};

const listMySqlLuciaCollections = async (conn) => {
  const [rows] = await conn.execute(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE 'lucia\\_%' ESCAPE '\\'`
  );
  return rows
    .map((row) => String(row.table_name || ""))
    .filter((name) => name.startsWith("lucia_"))
    .filter((name) => !name.endsWith("_flat"))
    .map((name) => name.slice("lucia_".length))
    .filter((name) => /^[a-zA-Z0-9_]+$/.test(name));
};

const ensureCollectionFlatTableMySql = async (conn, collectionName) => {
  const flatTable = `lucia_${collectionName}_flat`;
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ${quoteIdentMySql(flatTable)} (
      id VARCHAR(255) PRIMARY KEY,
      payload JSON NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // Backward compatibility: older _flat tables may miss payload/updated_at columns.
  const existingColumns = await getMySqlColumns(conn, flatTable);
  if (!existingColumns.has("payload")) {
    await conn.execute(
      `ALTER TABLE ${quoteIdentMySql(flatTable)} ADD COLUMN ${quoteIdentMySql("payload")} JSON NULL`
    );
  }
  if (!existingColumns.has("updated_at")) {
    await conn.execute(
      `ALTER TABLE ${quoteIdentMySql(flatTable)} ADD COLUMN ${quoteIdentMySql("updated_at")} TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
    );
  }

  return flatTable;
};

const ensureFlatColumnsMySql = async (conn, flatTable, typeMap) => {
  const existing = await getMySqlColumns(conn, flatTable);
  for (const [columnName, mergedType] of Object.entries(typeMap)) {
    if (!columnName || existing.has(columnName)) continue;
    await conn.execute(
      `ALTER TABLE ${quoteIdentMySql(flatTable)} ADD COLUMN ${quoteIdentMySql(columnName)} ${sqlTypeFor(mergedType)}`
    );
  }
};

const normalizeOneCollectionToFlatMySql = async (conn, collectionName) => {
  const sourceTable = `lucia_${collectionName}`;
  const flatTable = await ensureCollectionFlatTableMySql(conn, collectionName);

  // Гарантуємо існування джерела як JSON-таблиці колекції
  await ensureGenericTableMySql(conn, collectionName);

  const [rows] = await conn.execute(`SELECT id, payload FROM ${quoteIdentMySql(sourceTable)}`);
  const parsedRows = rows.map((row) => ({
    id: String(row.id || ""),
    payload: parsePayloadField(row.payload),
  }));

  const typeMap = {};
  const flattenedRows = parsedRows.map((row) => {
    const flat = flattenScalarFields(row.payload);
    Object.entries(flat).forEach(([col, value]) => {
      typeMap[col] = mergeTypes(typeMap[col], detectValueType(value));
    });
    return { id: row.id, payload: row.payload, flat };
  });

  await ensureFlatColumnsMySql(conn, flatTable, typeMap);

  await conn.execute(`DELETE FROM ${quoteIdentMySql(flatTable)}`);

  const scalarColumns = Object.keys(typeMap);
  for (const row of flattenedRows) {
    if (!row.id) continue;
    const insertColumns = ["id", "payload", ...scalarColumns];
    const insertValues = [
      row.id,
      JSON.stringify(row.payload || {}),
      ...scalarColumns.map((col) => {
        const value = row.flat[col];
        if (typeof value === "boolean") return value ? 1 : 0;
        return value ?? null;
      }),
    ];

    const placeholders = insertColumns.map(() => "?").join(", ");
    const updates = ["payload = VALUES(payload)", ...scalarColumns.map((col) => `${quoteIdentMySql(col)} = VALUES(${quoteIdentMySql(col)})`), "updated_at = CURRENT_TIMESTAMP"].join(", ");

    await conn.execute(
      `INSERT INTO ${quoteIdentMySql(flatTable)} (${insertColumns.map((col) => quoteIdentMySql(col)).join(", ")}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
      insertValues
    );
  }

  return {
    rows: flattenedRows.length,
    columns: scalarColumns.length,
    table: flatTable,
  };
};

const normalizeCollectionsToMySqlFlat = async (mysqlConfig, collections = []) => {
  const mysql = await import("mysql2/promise");
  const conn = await mysql.default.createConnection(mysqlConfig);

  try {
    const targetCollections = Array.isArray(collections) && collections.length > 0
      ? collections.map((name) => normalizeCollectionName(name))
      : await listMySqlLuciaCollections(conn);

    const stats = {};
    for (const collectionName of targetCollections) {
      stats[collectionName] = await normalizeOneCollectionToFlatMySql(conn, collectionName);
    }
    return stats;
  } finally {
    await conn.end();
  }
};

const handleMigrationNormalize = async (req, res) => {
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
  if (targetDb.dbEngine !== "mysql") {
    return sendJson(res, 400, {
      ok: false,
      error: "Нормалізація наразі підтримується тільки для MariaDB/MySQL",
    });
  }

  try {
    const collections = Array.isArray(payload?.collections) ? payload.collections : [];
    const stats = await normalizeCollectionsToMySqlFlat(targetDb.mysqlConfig, collections);
    return sendJson(res, 200, {
      ok: true,
      engine: targetDb.dbEngine,
      stats,
      normalizedAt: new Date().toISOString(),
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message });
  }
};

const handleAuthRegister = async (req, res) => {
  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
  }

  const email = normalizeEmail(payload?.email);
  const password = String(payload?.password || "");
  const displayName = String(payload?.displayName || "").trim();

  if (!email || !password || password.length < 6) {
    return sendJson(res, 400, { ok: false, error: "email and password(min 6) are required" });
  }

  const dbConfig = getAssetsRuntimeConfig();
  const existing = await getAuthUserByEmail(email, dbConfig);
  if (existing) {
    return sendJson(res, 409, { ok: false, error: "Email already in use" });
  }

  const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { salt, hash } = hashPassword(password);

  await createCollectionItemData(
    "authUsers",
    {
      id: userId,
      email,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    dbConfig
  );

  const profilePayload = {
    id: userId,
    email,
    displayName: displayName || email,
    role: "user",
    restaurant: "",
    position: "",
    workRole: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  await createCollectionItemData("users", profilePayload, dbConfig);

  const token = await createSession(userId, dbConfig);
  return sendJson(res, 200, {
    ok: true,
    token,
    user: mapUserProfile(profilePayload),
  });
};

const handleAuthLogin = async (req, res) => {
  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
  }

  const email = normalizeEmail(payload?.email);
  const password = String(payload?.password || "");
  if (!email || !password) {
    return sendJson(res, 400, { ok: false, error: "email and password are required" });
  }

  const dbConfig = getAssetsRuntimeConfig();
  const authUser = await getAuthUserByEmail(email, dbConfig);
  if (!authUser) {
    return sendJson(res, 401, { ok: false, error: "Invalid credentials" });
  }

  const valid = verifyPassword(password, authUser.passwordSalt, authUser.passwordHash);
  if (!valid) {
    return sendJson(res, 401, { ok: false, error: "Invalid credentials" });
  }

  const profile = await getUserProfileById(authUser.id, dbConfig);
  if (!profile) {
    return sendJson(res, 404, { ok: false, error: "User profile not found" });
  }

  const token = await createSession(authUser.id, dbConfig);
  return sendJson(res, 200, {
    ok: true,
    token,
    user: mapUserProfile(profile),
  });
};

const handleAuthMe = async (req, res) => {
  const dbConfig = getAssetsRuntimeConfig();
  const { profile } = await resolveAuthContext(req, dbConfig);
  if (!profile) {
    return sendJson(res, 200, { ok: true, user: null });
  }
  return sendJson(res, 200, { ok: true, user: mapUserProfile(profile) });
};

const handleAuthLogout = async (req, res) => {
  const dbConfig = getAssetsRuntimeConfig();
  const token = sessionTokenFromRequest(req);
  if (token) {
    await deleteSession(token, dbConfig);
  }
  return sendJson(res, 200, { ok: true });
};

const handleAuthAdminCreateUser = async (req, res) => {
  const dbConfig = getAssetsRuntimeConfig();
  const { profile } = await resolveAuthContext(req, dbConfig);
  if (!profile || String(profile.role || "") !== "admin") {
    return sendJson(res, 403, { ok: false, error: "Admin role required" });
  }

  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
  }

  const email = normalizeEmail(payload?.email);
  const password = String(payload?.password || "");
  const displayName = String(payload?.displayName || "").trim();
  const role = String(payload?.role || "user").trim() || "user";
  const restaurant = String(payload?.restaurant || "").trim();
  const position = String(payload?.position || "").trim();
  const workRole = String(payload?.workRole || "").trim();

  if (!email || !password || password.length < 6) {
    return sendJson(res, 400, { ok: false, error: "email and password(min 6) are required" });
  }

  const existing = await getAuthUserByEmail(email, dbConfig);
  if (existing) {
    return sendJson(res, 409, { ok: false, error: "Email already in use" });
  }

  const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { salt, hash } = hashPassword(password);

  await createCollectionItemData(
    "authUsers",
    {
      id: userId,
      email,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    dbConfig
  );

  const profilePayload = {
    id: userId,
    email,
    displayName: displayName || email,
    role,
    restaurant,
    position,
    workRole,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  await createCollectionItemData("users", profilePayload, dbConfig);

  return sendJson(res, 200, {
    ok: true,
    user: mapUserProfile(profilePayload),
  });
};

const handleAssetsApi = async (req, res, assetId) => {
  if (!isAuthorized(req)) {
    return sendJson(res, 401, { ok: false, error: "Unauthorized" });
  }

  const dbConfig = getAssetsRuntimeConfig();
  const method = req.method || "GET";

  // Backward-compatible upload route: some deployments may route
  // POST /api/assets/photos as /api/assets/:id with id="photos".
  if (method === "POST" && assetId === "photos") {
    return handleAssetPhotoUploadApi(req, res);
  }

  if (method === "GET" && !assetId) {
    const assets = await getAssetsData(dbConfig);
    return sendJson(res, 200, { ok: true, data: assets });
  }

  if (method === "POST" && !assetId) {
    let payload;
    try {
      payload = await parseJsonBody(req);
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
    }

    const id = await createAssetData(payload, dbConfig);
    return sendJson(res, 200, { ok: true, id });
  }

  if (method === "PUT" && assetId) {
    let payload;
    try {
      payload = await parseJsonBody(req);
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
    }

    await updateAssetData(assetId, payload, dbConfig);
    return sendJson(res, 200, { ok: true });
  }

  if (method === "DELETE" && assetId) {
    await deleteAssetData(assetId, dbConfig);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { ok: false, error: "Method not allowed" });
};

const handleAssetPhotoUploadApi = async (req, res) => {
  if (!isAuthorized(req)) {
    return sendJson(res, 401, { ok: false, error: "Unauthorized" });
  }

  let payload;
  try {
    payload = await parseJsonBody(req, 25 * 1024 * 1024);
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
  }

  try {
    const saved = await saveAssetPhoto({
      fileName: payload?.fileName,
      dataUrl: payload?.dataUrl,
    });
    return sendJson(res, 200, { ok: true, ...saved });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || "Photo upload failed" });
  }
};

const handleServiceRequestsApi = async (req, res, requestId) => {
  if (!isAuthorized(req)) {
    return sendJson(res, 401, { ok: false, error: "Unauthorized" });
  }

  const dbConfig = getAssetsRuntimeConfig();
  const method = req.method || "GET";

  if (method === "GET" && !requestId) {
    const requests = await getServiceRequestsData(dbConfig);
    return sendJson(res, 200, { ok: true, data: requests });
  }

  if (method === "POST" && !requestId) {
    let payload;
    try {
      payload = await parseJsonBody(req);
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
    }

    const id = await createServiceRequestData(payload, dbConfig);
    return sendJson(res, 200, { ok: true, id });
  }

  if (method === "PUT" && requestId) {
    let payload;
    try {
      payload = await parseJsonBody(req);
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
    }

    await updateServiceRequestData(requestId, payload, dbConfig);
    return sendJson(res, 200, { ok: true });
  }

  if (method === "DELETE" && requestId) {
    await deleteServiceRequestData(requestId, dbConfig);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { ok: false, error: "Method not allowed" });
};

const handleCollectionsApi = async (req, res, collectionName, itemId) => {
  if (!isAuthorized(req)) {
    return sendJson(res, 401, { ok: false, error: "Unauthorized" });
  }

  const dbConfig = getAssetsRuntimeConfig();
  const method = req.method || "GET";

  if (method === "GET" && !itemId) {
    const items = await getCollectionItemsData(collectionName, dbConfig);
    return sendJson(res, 200, { ok: true, data: items });
  }

  if (method === "GET" && itemId) {
    const item = await getCollectionItemData(collectionName, itemId, dbConfig);
    return sendJson(res, 200, { ok: true, data: item });
  }

  if (method === "POST" && !itemId) {
    let payload;
    try {
      payload = await parseJsonBody(req);
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
    }

    const id = await createCollectionItemData(collectionName, payload, dbConfig);
    return sendJson(res, 200, { ok: true, id });
  }

  if (method === "PUT" && itemId) {
    let payload;
    try {
      payload = await parseJsonBody(req);
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
    }

    await updateCollectionItemData(collectionName, itemId, payload, dbConfig);
    return sendJson(res, 200, { ok: true });
  }

  if (method === "DELETE" && itemId) {
    if (collectionName === "users") {
      const user = await getCollectionItemData("users", itemId, dbConfig);
      const userEmail = normalizeEmail(user?.email);

      // 1) Видаляємо auth-користувача за тим самим id (основний сценарій)
      await deleteCollectionItemData("authUsers", itemId, dbConfig).catch(() => {});

      // 2) Додатковий fallback: видаляємо authUsers з таким email (на випадок legacy id)
      if (userEmail) {
        const authUsers = await getCollectionItemsData("authUsers", dbConfig);
        const matchedAuthUsers = authUsers.filter(
          (authUser) => normalizeEmail(authUser?.email) === userEmail
        );
        for (const authUser of matchedAuthUsers) {
          if (!authUser?.id) continue;
          await deleteCollectionItemData("authUsers", authUser.id, dbConfig).catch(() => {});
        }
      }

      // 3) Чистимо всі сесії користувача
      const sessions = await getCollectionItemsData("authSessions", dbConfig);
      const matchedSessions = sessions.filter(
        (session) => String(session?.userId || "") === String(itemId)
      );
      for (const session of matchedSessions) {
        if (!session?.id) continue;
        await deleteCollectionItemData("authSessions", session.id, dbConfig).catch(() => {});
      }
    }

    await deleteCollectionItemData(collectionName, itemId, dbConfig);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { ok: false, error: "Method not allowed" });
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

  if (
    runtimeConfig &&
    !isValidFirebaseRuntimeConfig(runtimeConfig) &&
    !isValidCustomRuntimeConfig(runtimeConfig)
  ) {
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
  const requestUrl = new URL(url, `http://${HOST}:${PORT}`);
  const pathname = requestUrl.pathname;

  if (method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (method === "GET" && pathname === "/health") {
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

  if (method === "POST" && pathname === "/migration/import") {
    try {
      return await handleMigrationImport(req, res);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  if (method === "POST" && pathname === "/db/test") {
    try {
      return await handleDbTest(req, res);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  if (method === "POST" && pathname === "/migration/normalize") {
    try {
      return await handleMigrationNormalize(req, res);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  if (method === "POST" && pathname === "/auth/register") {
    return handleAuthRegister(req, res);
  }

  if (method === "POST" && pathname === "/auth/login") {
    return handleAuthLogin(req, res);
  }

  if (method === "GET" && pathname === "/auth/me") {
    return handleAuthMe(req, res);
  }

  if (method === "POST" && pathname === "/auth/logout") {
    return handleAuthLogout(req, res);
  }

  if (method === "POST" && pathname === "/auth/admin-create-user") {
    return handleAuthAdminCreateUser(req, res);
  }

  if (pathname === "/settings/firebase-runtime" && method === "GET") {
    return handleGetRuntimeSettings(req, res);
  }

  if (pathname === "/settings/firebase-runtime" && method === "PUT") {
    return handlePutRuntimeSettings(req, res);
  }

  if (pathname === "/settings/firebase-runtime" && method === "DELETE") {
    return handleDeleteRuntimeSettings(req, res);
  }

  if (pathname === "/api/assets") {
    try {
      return await handleAssetsApi(req, res, "");
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  if (pathname === "/api/assets/photos") {
    try {
      return await handleAssetPhotoUploadApi(req, res);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  const assetsByIdMatch = pathname.match(/^\/api\/assets\/([^/]+)$/);
  if (assetsByIdMatch) {
    try {
      const assetId = decodeURIComponent(assetsByIdMatch[1]);
      return await handleAssetsApi(req, res, assetId);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  if (pathname === "/api/service-requests") {
    try {
      return await handleServiceRequestsApi(req, res, "");
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  const serviceRequestsByIdMatch = pathname.match(/^\/api\/service-requests\/([^/]+)$/);
  if (serviceRequestsByIdMatch) {
    try {
      const requestId = decodeURIComponent(serviceRequestsByIdMatch[1]);
      return await handleServiceRequestsApi(req, res, requestId);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  const collectionsByIdMatch = pathname.match(/^\/api\/collections\/([^/]+)\/([^/]+)$/);
  if (collectionsByIdMatch) {
    try {
      const collectionName = decodeURIComponent(collectionsByIdMatch[1]);
      const itemId = decodeURIComponent(collectionsByIdMatch[2]);
      return await handleCollectionsApi(req, res, collectionName, itemId);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  const collectionsMatch = pathname.match(/^\/api\/collections\/([^/]+)$/);
  if (collectionsMatch) {
    try {
      const collectionName = decodeURIComponent(collectionsMatch[1]);
      return await handleCollectionsApi(req, res, collectionName, "");
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  return sendJson(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Custom migration server is running on http://${HOST}:${PORT}`);
  console.log(`Engine: ${ENGINE}`);
  console.log(`Health endpoint: http://${HOST}:${PORT}/health`);
  console.log(`Migration endpoint: http://${HOST}:${PORT}/migration/import`);
});
