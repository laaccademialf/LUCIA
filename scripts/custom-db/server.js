import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";

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
const ASSETS_API_SLOW_MS = Math.max(
  50,
  Number.parseInt(String(process.env.ASSETS_API_SLOW_MS || "500"), 10) || 500
);

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

const logSlowAssetsGet = (details) => {
  const elapsedMs = Number(details?.elapsedMs || 0);
  if (elapsedMs < ASSETS_API_SLOW_MS) return;

  const entry = {
    at: new Date().toISOString(),
    elapsedMs,
    dbEngine: String(details?.dbEngine || ""),
    paged: Boolean(details?.paged),
    page: Number(details?.page || 1),
    pageSize: Number(details?.pageSize || 0),
    resultCount: Number(details?.resultCount || 0),
    total: Number(details?.total || 0),
    hasSearch: Boolean(details?.hasSearch),
    hasLocation: Boolean(details?.hasLocation),
    hasStatus: Boolean(details?.hasStatus),
    hasCategory: Boolean(details?.hasCategory),
    hasDecision: Boolean(details?.hasDecision),
  };

  console.warn(`[assets-api][slow] ${JSON.stringify(entry)}`);
};

const assetsSseClients = new Set();

const writeSseEvent = (res, eventName, payload) => {
  const serialized = JSON.stringify(payload || {});
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${serialized}\n\n`);
};

const broadcastAssetsSse = (eventName, payload) => {
  for (const client of assetsSseClients) {
    try {
      writeSseEvent(client, eventName, payload);
    } catch {
      assetsSseClients.delete(client);
      try {
        client.end();
      } catch {
        // ignore broken sockets
      }
    }
  }
};

const registerAssetsSseClient = (req, res) => {
  setCorsHeaders(res);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  assetsSseClients.add(res);
  res.write(`: connected ${new Date().toISOString()}\n\n`);

  const removeClient = () => {
    assetsSseClients.delete(res);
    try {
      res.end();
    } catch {
      // ignore close race
    }
  };

  req.on("close", removeClient);
  req.on("aborted", removeClient);
};

setInterval(() => {
  const heartbeat = `: ping ${Date.now()}\n\n`;
  for (const client of assetsSseClients) {
    try {
      client.write(heartbeat);
    } catch {
      assetsSseClients.delete(client);
      try {
        client.end();
      } catch {
        // ignore broken sockets
      }
    }
  }
}, 25000);

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
  try {
    const normalizedSalt = String(salt || "").trim();
    const normalizedHash = String(hash || "").trim().toLowerCase();
    if (!normalizedSalt || !normalizedHash) return false;
    if (!/^[a-f0-9]+$/.test(normalizedHash)) return false;

    const next = crypto.scryptSync(String(password || ""), normalizedSalt, 64).toString("hex");
    const left = Buffer.from(next, "hex");
    const right = Buffer.from(normalizedHash, "hex");
    if (left.length === 0 || right.length === 0) return false;
    if (left.length !== right.length) return false;

    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
};

const getAuthPasswordCredentials = (authUser) => {
  const snakeSalt = String(authUser?.password_salt || "").trim();
  const snakeHash = String(authUser?.password_hash || "").trim();
  if (snakeSalt && snakeHash) {
    return { salt: snakeSalt, hash: snakeHash };
  }

  const camelSalt = String(authUser?.passwordSalt || "").trim();
  const camelHash = String(authUser?.passwordHash || "").trim();
  if (camelSalt && camelHash) {
    return { salt: camelSalt, hash: camelHash };
  }

  return {
    salt: snakeSalt || camelSalt,
    hash: snakeHash || camelHash,
  };
};

const buildPasswordStoragePayload = ({ salt, hash }) => ({
  passwordHash: String(hash || ""),
  passwordSalt: String(salt || ""),
  password_hash: String(hash || ""),
  password_salt: String(salt || ""),
});

const createSessionToken = () => crypto.randomBytes(32).toString("hex");

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const readFirstString = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return "";
};

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
  email: normalizeEmail(profile?.email || profile?.user_email || ""),
  displayName: readFirstString(profile?.displayName, profile?.display_name),
  role: readFirstString(profile?.role, "user") || "user",
  restaurant: readFirstString(
    profile?.restaurant,
    profile?.restaurantId,
    profile?.restaurant_id,
    profile?.restaurantName,
    profile?.restaurant_name
  ),
  restaurantName: readFirstString(
    profile?.restaurantName,
    profile?.restaurant_name,
    profile?.restaurant,
    profile?.restaurantId,
    profile?.restaurant_id
  ),
  position: readFirstString(profile?.position, profile?.position_name),
  workRole: readFirstString(profile?.work_role_name, profile?.work_role, profile?.workRole),
});

const hasAdminRole = (profile) => String(mapUserProfile(profile).role || "").toLowerCase() === "admin";

const hasUserManagementPermission = (profile) => {
  const mapped = mapUserProfile(profile);
  const role = String(mapped?.role || "").toLowerCase();
  const workRole = String(mapped?.workRole || "").toLowerCase();

  if (role === "admin") return true;
  if (role.includes("manager")) return true;
  if (workRole.includes("керуюч")) return true;
  if (workRole.includes("manager")) return true;

  return false;
};

const resolveAuthProfileWithFallback = async (req, dbConfig, fallbackUserId = "") => {
  const { profile } = await resolveAuthContext(req, dbConfig);
  if (profile?.id) return profile;

  const normalizedFallbackUserId = String(fallbackUserId || "").trim();
  if (!normalizedFallbackUserId) return null;

  return await getUserProfileById(normalizedFallbackUserId, dbConfig);
};

const getAuthUsersByEmail = async (email, dbConfig) => {
  const normalizedEmail = normalizeEmail(email);
  const authUsers = await getCollectionItemsData("authUsers", dbConfig);
  return authUsers.filter((item) => normalizeEmail(item?.email) === normalizedEmail);
};

const getAuthUserByEmail = async (email, dbConfig) => {
  const matches = await getAuthUsersByEmail(email, dbConfig);
  return matches[0] || null;
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
    // Existing _flat tables from older migration versions may miss payload/updated_at.
    // Ensure required columns exist so camelCase fields can be reconstructed reliably.
    await ensureCollectionFlatTableMySql(conn, collectionName);
    return flatTable;
  }

  if (preferFlat) {
    if (await tableExistsMySql(conn, baseTable)) {
      // One-time upgrade path: if only legacy JSON table exists,
      // normalize that collection into _flat and then always use _flat.
      try {
        await normalizeOneCollectionToFlatMySql(conn, collectionName);
      } catch {
        await ensureCollectionFlatTableMySql(conn, collectionName);
      }
      return flatTable;
    }

    await ensureCollectionFlatTableMySql(conn, collectionName);
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

  const normalizeScalarValue = (value) => {
    if (typeof value !== "string") return value;
    const text = value.trim();
    if (!text) return value;
    if (!(text.startsWith("{") || text.startsWith("["))) return value;
    try {
      return JSON.parse(text);
    } catch {
      return value;
    }
  };

  if (Object.prototype.hasOwnProperty.call(safeRow, "payload")) {
    const parsed = parsePayloadField(safeRow.payload);
    const scalar = Object.entries(safeRow).reduce((acc, [key, value]) => {
      if (key === "id" || key === "payload") return acc;
      if (value === undefined) return acc;

      const normalizedValue = normalizeScalarValue(value);
      const parsedValue = parsed[key];

      // Keep source-of-truth from scalar columns, but avoid degrading arrays/objects
      // from payload when scalar value is an empty string.
      if (
        normalizedValue === "" &&
        parsedValue !== null &&
        typeof parsedValue === "object"
      ) {
        acc[key] = parsedValue;
        return acc;
      }

      acc[key] = normalizedValue;
      return acc;
    }, {});
    return { id: normalizedId, ...parsed, ...scalar };
  }

  const normalizedRow = Object.entries(safeRow).reduce((acc, [key, value]) => {
    acc[key] = normalizeScalarValue(value);
    return acc;
  }, {});
  return { ...normalizedRow, id: normalizedId };
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
      const [rows] = await conn.execute(`SELECT * FROM \`${tableName}\``);
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
      const [rows] = await conn.execute(`SELECT * FROM \`${tableName}\` WHERE id = ? LIMIT 1`, [itemId]);
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
      const isFlatTable = String(tableName || "").endsWith("_flat");
      const shouldPersistPayload = hasPayloadColumn && !isFlatTable;

      // Compatibility mode: some flat tables were created without payload column.
      // For permissions collections in _flat mode, keep nested permissions/restaurants
      // as JSON strings in scalar columns to avoid relying on payload column.
      const flatSource = (() => {
        if (!isFlatTable || (collection !== "rolePermissions" && collection !== "fieldPermissions")) {
          return normalized;
        }

        const next = { ...normalized };
        if (next.permissions && typeof next.permissions === "object") {
          next.permissions = JSON.stringify(next.permissions);
        }
        if (Array.isArray(next.restaurants)) {
          next.restaurants = JSON.stringify(next.restaurants);
        }
        return next;
      })();

      const flat = flattenScalarFields(flatSource);
      const typeMap = Object.entries(flat).reduce((acc, [col, value]) => {
        acc[col] = mergeTypes(acc[col], detectValueType(value));
        return acc;
      }, {});

      await ensureFlatColumnsMySql(conn, tableName, typeMap);
      if (collection === "assets") {
        // During repeated inventory edits, change history/photos can exceed TEXT size.
        await ensureMySqlLongTextColumns(conn, tableName, ["inventory_change_history", "photos"]);
      }
      const columnsAfterEnsure = await getMySqlColumns(conn, tableName);
      const columnTypes = await getMySqlColumnTypes(conn, tableName);
      const scalarColumns = Object.keys(flat).filter((col) => columnsAfterEnsure.has(col));

      const insertColumns = ["id", ...(shouldPersistPayload ? ["payload"] : []), ...scalarColumns];
      const insertValues = [
        nextId,
        ...(shouldPersistPayload ? [JSON.stringify(normalized)] : []),
        ...scalarColumns.map((col) => {
          const value = flat[col];
          return normalizeValueForMySqlColumnType(value, columnTypes[col], typeMap[col]);
        }),
      ];

      const placeholders = insertColumns.map(() => "?").join(", ");
      const updates = [
        ...(shouldPersistPayload ? ["payload = VALUES(payload)"] : []),
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

const mysqlPoolCache = new Map();

const getMySqlPoolCacheKey = (mysqlConfig = {}) => {
  return [
    String(mysqlConfig.host || ""),
    String(mysqlConfig.port || ""),
    String(mysqlConfig.user || ""),
    String(mysqlConfig.database || ""),
  ].join("|");
};

const getOrCreateMySqlPool = async (mysqlConfig = {}) => {
  const cacheKey = getMySqlPoolCacheKey(mysqlConfig);
  const cachedPool = mysqlPoolCache.get(cacheKey);
  if (cachedPool) return cachedPool;

  const mysql = await import("mysql2/promise");
  const poolLimit = Math.max(
    2,
    Number.parseInt(String(process.env.LUCIA_MYSQL_POOL_LIMIT || "16"), 10) || 16
  );

  const pool = mysql.default.createPool({
    ...mysqlConfig,
    waitForConnections: true,
    connectionLimit: poolLimit,
    queueLimit: 0,
  });

  mysqlPoolCache.set(cacheKey, pool);
  return pool;
};

const withMySqlPooledConnection = async (mysqlConfig, handler) => {
  const pool = await getOrCreateMySqlPool(mysqlConfig);
  const conn = await pool.getConnection();
  try {
    return await handler(conn);
  } finally {
    conn.release();
  }
};

const getAssetsData = async (dbConfig) => {
  if (dbConfig.dbEngine === "file") {
    const items = await readCollectionFile("assets");
    return items.map((item) => ({ id: item.id, ...(item.data || {}) }));
  }

  if (dbConfig.dbEngine === "mysql") {
    await withMySqlPooledConnection(dbConfig.mysqlConfig, async (conn) => {
      const tableName = await resolveCollectionTableMySql(conn, "assets");
      await ensureAssetsIndexesMySql(conn, tableName);
    });

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

const filterAssetsInMemory = (assets, {
  search = "",
  locationName = "",
  status = "",
  category = "",
  decision = "",
} = {}) => {
  const normalizedSearch = String(search || "").trim().toLowerCase();
  const normalizedLocationName = String(locationName || "").trim();
  const normalizedStatus = String(status || "").trim();
  const normalizedCategory = String(category || "").trim();
  const normalizedDecision = String(decision || "").trim();

  return (assets || []).filter((asset) => {
    if (
      normalizedLocationName &&
      String(asset?.locationName || asset?.location_name || "") !== normalizedLocationName
    ) return false;
    if (normalizedStatus && String(asset?.status || "") !== normalizedStatus) return false;
    if (normalizedCategory && String(asset?.category || "") !== normalizedCategory) return false;
    if (normalizedDecision && String(asset?.decision || "") !== normalizedDecision) return false;
    if (!normalizedSearch) return true;

    const pool = [
      asset?.invNumber,
      asset?.inv_number,
      asset?.invNumber1C,
      asset?.inv_number_1c,
      asset?.name,
      asset?.category,
      asset?.locationName,
      asset?.location_name,
      asset?.status,
      asset?.decision,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase())
      .join(" ");

    return pool.includes(normalizedSearch);
  });
};

const getAssetsPageData = async (dbConfig, {
  page = 1,
  pageSize = 50,
  search = "",
  locationName = "",
  status = "",
  category = "",
  decision = "",
} = {}) => {
  const normalizedPage = Math.max(1, Number.parseInt(String(page || "1"), 10) || 1);
  const normalizedPageSize = Math.min(500, Math.max(1, Number.parseInt(String(pageSize || "50"), 10) || 50));
  const normalizedSearch = String(search || "").trim().toLowerCase();
  const normalizedLocationName = String(locationName || "").trim();
  const normalizedStatus = String(status || "").trim();
  const normalizedCategory = String(category || "").trim();
  const normalizedDecision = String(decision || "").trim();

  if (dbConfig.dbEngine === "mysql") {
    return withMySqlPooledConnection(dbConfig.mysqlConfig, async (conn) => {
      const tableName = await resolveCollectionTableMySql(conn, "assets");
      await ensureAssetsIndexesMySql(conn, tableName);

      const existingColumns = await getMySqlColumns(conn, tableName);

      const chooseColumn = (...candidates) =>
        candidates.find((candidate) => existingColumns.has(candidate)) || "";

      const whereParts = [];
      const whereParams = [];

      const locationColumn = chooseColumn("location_name", "locationName");
      if (locationColumn && normalizedLocationName) {
        whereParts.push(`${quoteIdentMySql(locationColumn)} = ?`);
        whereParams.push(normalizedLocationName);
      }

      const statusColumn = chooseColumn("status");
      if (statusColumn && normalizedStatus) {
        whereParts.push(`${quoteIdentMySql(statusColumn)} = ?`);
        whereParams.push(normalizedStatus);
      }

      const categoryColumn = chooseColumn("category");
      if (categoryColumn && normalizedCategory) {
        whereParts.push(`${quoteIdentMySql(categoryColumn)} = ?`);
        whereParams.push(normalizedCategory);
      }

      const decisionColumn = chooseColumn("decision");
      if (decisionColumn && normalizedDecision) {
        whereParts.push(`${quoteIdentMySql(decisionColumn)} = ?`);
        whereParams.push(normalizedDecision);
      }

      if (normalizedSearch) {
        const searchColumns = [
          "inv_number",
          "invNumber",
          "inv_number_1c",
          "invNumber1C",
          "name",
          "category",
          "location_name",
          "locationName",
          "status",
          "decision",
        ].filter((columnName, idx, arr) => arr.indexOf(columnName) === idx && existingColumns.has(columnName));

        if (searchColumns.length > 0) {
          const likeParts = searchColumns.map(
            (columnName) => `LOWER(COALESCE(CAST(${quoteIdentMySql(columnName)} AS CHAR), '')) LIKE ?`
          );
          whereParts.push(`(${likeParts.join(" OR ")})`);
          for (let i = 0; i < searchColumns.length; i += 1) {
            whereParams.push(`%${normalizedSearch}%`);
          }
        }
      }

      const whereSql = whereParts.length > 0 ? ` WHERE ${whereParts.join(" AND ")}` : "";
      const orderSql = existingColumns.has("updated_at")
        ? ` ORDER BY ${quoteIdentMySql("updated_at")} DESC, ${quoteIdentMySql("id")} DESC`
        : ` ORDER BY ${quoteIdentMySql("id")} DESC`;

      const [countRows] = await conn.execute(
        `SELECT COUNT(*) AS total FROM ${quoteIdentMySql(tableName)}${whereSql}`,
        whereParams
      );

      const total = Number(countRows?.[0]?.total || 0);
      const pageCount = Math.max(1, Math.ceil(total / normalizedPageSize));
      const safePage = Math.min(normalizedPage, pageCount);
      const offset = (safePage - 1) * normalizedPageSize;

      const [rows] = await conn.execute(
        `SELECT * FROM ${quoteIdentMySql(tableName)}${whereSql}${orderSql} LIMIT ? OFFSET ?`,
        [...whereParams, normalizedPageSize, offset]
      );

      return {
        data: (rows || []).map((row) => mapMySqlRowToDocument(row)),
        meta: {
          page: safePage,
          pageSize: normalizedPageSize,
          total,
          pageCount,
        },
      };
    });
  }

  const assets = await getAssetsData(dbConfig);
  const filtered = filterAssetsInMemory(assets, {
    search: normalizedSearch,
    locationName: normalizedLocationName,
    status: normalizedStatus,
    category: normalizedCategory,
    decision: normalizedDecision,
  });

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / normalizedPageSize));
  const safePage = Math.min(normalizedPage, pageCount);
  const startIndex = (safePage - 1) * normalizedPageSize;
  const data = filtered.slice(startIndex, startIndex + normalizedPageSize);

  return {
    data,
    meta: {
      page: safePage,
      pageSize: normalizedPageSize,
      total,
      pageCount,
    },
  };
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

const toMySqlDateTime = (value) => {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const dd = String(value.getDate()).padStart(2, "0");
    const hh = String(value.getHours()).padStart(2, "0");
    const mi = String(value.getMinutes()).padStart(2, "0");
    const ss = String(value.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }

  const text = String(value).trim();
  if (!text) return null;

  // Already in MySQL DATETIME format.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  const hh = String(parsed.getHours()).padStart(2, "0");
  const mi = String(parsed.getMinutes()).padStart(2, "0");
  const ss = String(parsed.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};

const toMySqlDate = (value) => {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const MYSQL_INTEGER_TYPES = new Set(["tinyint", "smallint", "mediumint", "int", "integer", "bigint", "bit", "year"]);
const MYSQL_DECIMAL_TYPES = new Set(["decimal", "numeric", "float", "double", "real", "dec"]);
const MYSQL_DATE_TYPES = new Set(["date"]);
const MYSQL_DATETIME_TYPES = new Set(["datetime", "timestamp"]);

const toMySqlNumber = (value, { integer = false } = {}) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return integer ? Math.trunc(value) : value;
  }

  const text = String(value).trim();
  if (!text) return null;
  const normalized = text.replace(/\s+/g, "").replace(/,/g, ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return integer ? Math.trunc(parsed) : parsed;
};

const toMySqlBoolean = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value ? 1 : 0;
  }

  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (["1", "true", "yes", "y", "on", "так"].includes(text)) return 1;
  if (["0", "false", "no", "n", "off", "ні"].includes(text)) return 0;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric ? 1 : 0;
  return null;
};

const normalizeValueForMySqlColumnType = (value, declaredType, inferredType = "") => {
  const type = String(declaredType || "").toLowerCase();

  if (MYSQL_DATE_TYPES.has(type)) return toMySqlDate(value);
  if (MYSQL_DATETIME_TYPES.has(type)) return toMySqlDateTime(value);
  if (MYSQL_INTEGER_TYPES.has(type)) return toMySqlNumber(value, { integer: true });
  if (MYSQL_DECIMAL_TYPES.has(type)) return toMySqlNumber(value, { integer: false });
  if (type === "boolean") return toMySqlBoolean(value);

  if (inferredType === "date") return toMySqlDateTime(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === undefined) return null;
  return value ?? null;
};

const getMySqlColumns = async (conn, tableName) => {
  const [rows] = await conn.execute(
    `SELECT COLUMN_NAME AS column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName]
  );
  return new Set(rows.map((row) => String(row.column_name || "")));
};

const getMySqlColumnTypes = async (conn, tableName) => {
  const [rows] = await conn.execute(
    `SELECT COLUMN_NAME AS column_name, DATA_TYPE AS data_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName]
  );

  return rows.reduce((acc, row) => {
    const name = String(row.column_name || "");
    if (!name) return acc;
    acc[name] = String(row.data_type || "").toLowerCase();
    return acc;
  }, {});
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

const ensureMySqlLongTextColumns = async (conn, tableName, columnNames = []) => {
  const normalizedColumns = Array.isArray(columnNames)
    ? columnNames.map((col) => String(col || "").trim()).filter(Boolean)
    : [];
  if (normalizedColumns.length === 0) return;

  const columnTypes = await getMySqlColumnTypes(conn, tableName);
  const widenableTypes = new Set(["varchar", "text", "tinytext", "mediumtext"]);

  for (const columnName of normalizedColumns) {
    const currentType = String(columnTypes[columnName] || "").toLowerCase();
    if (!currentType || currentType === "longtext") continue;
    if (!widenableTypes.has(currentType)) continue;

    await conn.execute(
      `ALTER TABLE ${quoteIdentMySql(tableName)} MODIFY COLUMN ${quoteIdentMySql(columnName)} LONGTEXT NULL`
    );
  }
};

const ensureMySqlIndex = async (conn, tableName, indexName, columns) => {
  const normalizedColumns = Array.isArray(columns)
    ? columns.map((col) => String(col || "").trim()).filter(Boolean)
    : [];
  if (normalizedColumns.length === 0) return;

  const [indexRows] = await conn.execute(
    `SELECT 1 AS ok
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
     LIMIT 1`,
    [tableName, indexName]
  );

  if (indexRows.length > 0) return;

  const columnsSql = normalizedColumns.map((col) => quoteIdentMySql(col)).join(", ");
  await conn.execute(
    `CREATE INDEX ${quoteIdentMySql(indexName)} ON ${quoteIdentMySql(tableName)} (${columnsSql})`
  );
};

const ensureAssetsIndexesMySql = async (conn, tableName) => {
  const existingColumns = await getMySqlColumns(conn, tableName);

  const tryEnsure = async (indexName, columns) => {
    const availableColumns = columns.filter((col) => existingColumns.has(col));
    if (availableColumns.length === 0) return;
    await ensureMySqlIndex(conn, tableName, indexName, availableColumns).catch(() => {});
  };

  await tryEnsure("idx_assets_inv_number", ["inv_number"]);
  await tryEnsure("idx_assets_location_name", ["location_name"]);
  await tryEnsure("idx_assets_status", ["status"]);
  await tryEnsure("idx_assets_category", ["category"]);
  await tryEnsure("idx_assets_decision", ["decision"]);
  await tryEnsure("idx_assets_updated_at", ["updated_at"]);

  // Composite indexes for common list filters with updated-at sorting.
  await tryEnsure("idx_assets_loc_status_updated", ["location_name", "status", "updated_at"]);
  await tryEnsure("idx_assets_loc_category_updated", ["location_name", "category", "updated_at"]);
  await tryEnsure("idx_assets_loc_decision_updated", ["location_name", "decision", "updated_at"]);
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

  const columnTypes = await getMySqlColumnTypes(conn, flatTable);

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
        const declaredType = String(columnTypes[col] || "").toLowerCase();
        return normalizeValueForMySqlColumnType(value, declaredType, typeMap[col]);
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
  const existing = await getAuthUsersByEmail(email, dbConfig);
  if (Array.isArray(existing) && existing.length > 0) {
    return sendJson(res, 409, { ok: false, error: "Email already in use" });
  }

  const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { salt, hash } = hashPassword(password);

  await createCollectionItemData(
    "authUsers",
    {
      id: userId,
      email,
      ...buildPasswordStoragePayload({ salt, hash }),
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
  const authUsers = await getAuthUsersByEmail(email, dbConfig);
  if (!Array.isArray(authUsers) || authUsers.length === 0) {
    return sendJson(res, 401, { ok: false, error: "Invalid credentials" });
  }

  const passwordMatchedCandidates = authUsers.filter((candidate) => {
    const credentials = getAuthPasswordCredentials(candidate);
    return verifyPassword(password, credentials.salt, credentials.hash);
  });

  if (passwordMatchedCandidates.length === 0) {
    return sendJson(res, 401, { ok: false, error: "Invalid credentials" });
  }

  const candidatesWithProfiles = await Promise.all(
    passwordMatchedCandidates.map(async (candidate) => {
      const profile = await getUserProfileById(candidate.id, dbConfig);
      return {
        candidate,
        profile,
      };
    })
  );

  const parseTs = (value) => {
    const ts = Date.parse(String(value || ""));
    return Number.isFinite(ts) ? ts : 0;
  };

  candidatesWithProfiles.sort((a, b) => {
    const aHasProfile = a.profile ? 1 : 0;
    const bHasProfile = b.profile ? 1 : 0;
    if (bHasProfile !== aHasProfile) return bHasProfile - aHasProfile;

    const aProfileTs = Math.max(
      parseTs(a.profile?.updatedAt),
      parseTs(a.profile?.createdAt),
      parseTs(a.profile?.updated_at),
      parseTs(a.profile?.created_at)
    );
    const bProfileTs = Math.max(
      parseTs(b.profile?.updatedAt),
      parseTs(b.profile?.createdAt),
      parseTs(b.profile?.updated_at),
      parseTs(b.profile?.created_at)
    );
    if (bProfileTs !== aProfileTs) return bProfileTs - aProfileTs;

    const aAuthTs = Math.max(
      parseTs(a.candidate?.updatedAt),
      parseTs(a.candidate?.createdAt),
      parseTs(a.candidate?.updated_at),
      parseTs(a.candidate?.created_at)
    );
    const bAuthTs = Math.max(
      parseTs(b.candidate?.updatedAt),
      parseTs(b.candidate?.createdAt),
      parseTs(b.candidate?.updated_at),
      parseTs(b.candidate?.created_at)
    );
    if (bAuthTs !== aAuthTs) return bAuthTs - aAuthTs;

    return String(b.candidate?.id || "").localeCompare(String(a.candidate?.id || ""));
  });

  const selected = candidatesWithProfiles[0] || null;
  const authUser = selected?.candidate || null;
  const profile = selected?.profile || null;
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

const handleAuthUpdateProfile = async (req, res) => {
  const dbConfig = getAssetsRuntimeConfig();
  const { profile } = await resolveAuthContext(req, dbConfig);
  if (!profile?.id) {
    return sendJson(res, 401, { ok: false, error: "Authentication required" });
  }

  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
  }

  const currentProfile = mapUserProfile(profile);
  const nextDisplayName = readFirstString(payload?.displayName, currentProfile.displayName, currentProfile.email);
  const nextEmail = normalizeEmail(payload?.email || currentProfile.email);
  const currentPassword = String(payload?.currentPassword || "");

  if (!nextEmail) {
    return sendJson(res, 400, { ok: false, error: "Email is required" });
  }

  const authUser = await getCollectionItemData("authUsers", profile.id, dbConfig);
  if (!authUser) {
    return sendJson(res, 404, { ok: false, error: "Auth user not found" });
  }

  const authCurrentEmail = normalizeEmail(authUser?.email || currentProfile.email);
  const emailChanged = nextEmail !== authCurrentEmail;

  if (emailChanged) {
    const sameEmailUser = await getAuthUserByEmail(nextEmail, dbConfig);
    if (sameEmailUser && String(sameEmailUser.id || "") !== String(profile.id)) {
      return sendJson(res, 409, { ok: false, error: "Email already in use" });
    }

    const credentials = getAuthPasswordCredentials(authUser);
    const isValidPassword = verifyPassword(currentPassword, credentials.salt, credentials.hash);
    if (!isValidPassword) {
      return sendJson(res, 401, { ok: false, error: "Current password is invalid" });
    }
  }

  await updateCollectionItemData(
    "authUsers",
    String(profile.id),
    {
      email: nextEmail,
      updatedAt: nowIso(),
    },
    dbConfig
  );

  await updateCollectionItemData(
    "users",
    String(profile.id),
    {
      email: nextEmail,
      displayName: nextDisplayName,
      updatedAt: nowIso(),
    },
    dbConfig
  );

  const updatedProfile = await getUserProfileById(profile.id, dbConfig);
  return sendJson(res, 200, { ok: true, user: mapUserProfile(updatedProfile) });
};

const handleAuthChangePassword = async (req, res) => {
  const dbConfig = getAssetsRuntimeConfig();

  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
  }

  const currentPassword = String(payload?.currentPassword || "");
  const newPassword = String(payload?.newPassword || "");
  const currentUserId = String(payload?.currentUserId || payload?.current_user_id || "").trim();

  const profile = await resolveAuthProfileWithFallback(req, dbConfig, currentUserId);
  if (!profile?.id) {
    return sendJson(res, 401, { ok: false, error: "Authentication required" });
  }

  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return sendJson(res, 400, { ok: false, error: "currentPassword and newPassword(min 6) are required" });
  }

  const authUser = await getCollectionItemData("authUsers", profile.id, dbConfig);
  if (!authUser) {
    return sendJson(res, 404, { ok: false, error: "Auth user not found" });
  }

  const currentCredentials = getAuthPasswordCredentials(authUser);
  const isValidPassword = verifyPassword(currentPassword, currentCredentials.salt, currentCredentials.hash);
  if (!isValidPassword) {
    return sendJson(res, 401, { ok: false, error: "Current password is invalid" });
  }

  const nextPassword = hashPassword(newPassword);
  await updateCollectionItemData(
    "authUsers",
    String(profile.id),
    {
      ...buildPasswordStoragePayload(nextPassword),
      updatedAt: nowIso(),
    },
    dbConfig
  );

  return sendJson(res, 200, { ok: true });
};

const handleAuthAdminCreateUser = async (req, res) => {
  const dbConfig = getAssetsRuntimeConfig();

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
  const currentPassword = String(payload?.currentPassword || "");
  const currentUserId = String(payload?.currentUserId || payload?.current_user_id || "").trim();

  const profile = await resolveAuthProfileWithFallback(req, dbConfig, currentUserId);
  if (!profile?.id) {
    return sendJson(res, 401, { ok: false, error: "Authentication required" });
  }

  if (!currentPassword) {
    return sendJson(res, 400, { ok: false, error: "Current password is required" });
  }

  const currentAuthUser = await getCollectionItemData("authUsers", String(profile.id), dbConfig);
  if (!currentAuthUser) {
    return sendJson(res, 404, { ok: false, error: "Auth user not found" });
  }

  const currentCredentials = getAuthPasswordCredentials(currentAuthUser);
  const isValidCurrentPassword = verifyPassword(currentPassword, currentCredentials.salt, currentCredentials.hash);
  if (!isValidCurrentPassword) {
    return sendJson(res, 401, { ok: false, error: "Current password is invalid" });
  }

  if (!hasUserManagementPermission(profile)) {
    return sendJson(res, 403, { ok: false, error: "Insufficient permissions" });
  }

  const normalizedRequestedRole = String(role || "user").trim().toLowerCase();
  if (normalizedRequestedRole === "admin" && !hasAdminRole(profile)) {
    return sendJson(res, 403, { ok: false, error: "Only admin can create admin users" });
  }

  if (!email || !password || password.length < 6) {
    return sendJson(res, 400, { ok: false, error: "email and password(min 6) are required" });
  }

  const existing = await getAuthUsersByEmail(email, dbConfig);
  if (Array.isArray(existing) && existing.length > 0) {
    return sendJson(res, 409, { ok: false, error: "Email already in use" });
  }

  const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { salt, hash } = hashPassword(password);

  await createCollectionItemData(
    "authUsers",
    {
      id: userId,
      email,
      ...buildPasswordStoragePayload({ salt, hash }),
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

const handleAuthAdminResetUserPassword = async (req, res) => {
  const dbConfig = getAssetsRuntimeConfig();

  let payload;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
  }

  const targetUserId = String(payload?.targetUserId || payload?.target_user_id || payload?.userId || "").trim();
  const currentPassword = String(payload?.currentPassword || "");
  const currentUserId = String(payload?.currentUserId || payload?.current_user_id || "").trim();
  const defaultPassword = String(payload?.defaultPassword || "Qwerty1").trim() || "Qwerty1";

  if (!targetUserId) {
    return sendJson(res, 400, { ok: false, error: "targetUserId is required" });
  }

  if (!currentPassword) {
    return sendJson(res, 400, { ok: false, error: "Current password is required" });
  }

  const profile = await resolveAuthProfileWithFallback(req, dbConfig, currentUserId);
  if (!profile?.id) {
    return sendJson(res, 401, { ok: false, error: "Authentication required" });
  }

  if (!hasAdminRole(profile)) {
    return sendJson(res, 403, { ok: false, error: "Only admin can reset user passwords" });
  }

  const currentAuthUser = await getCollectionItemData("authUsers", String(profile.id), dbConfig);
  if (!currentAuthUser) {
    return sendJson(res, 404, { ok: false, error: "Auth user not found" });
  }

  const currentCredentials = getAuthPasswordCredentials(currentAuthUser);
  const isValidCurrentPassword = verifyPassword(currentPassword, currentCredentials.salt, currentCredentials.hash);
  if (!isValidCurrentPassword) {
    return sendJson(res, 401, { ok: false, error: "Current password is invalid" });
  }

  const targetAuthUser = await getCollectionItemData("authUsers", targetUserId, dbConfig);
  if (!targetAuthUser) {
    return sendJson(res, 404, { ok: false, error: "Target auth user not found" });
  }

  const nextPassword = hashPassword(defaultPassword);
  await updateCollectionItemData(
    "authUsers",
    targetUserId,
    {
      ...buildPasswordStoragePayload(nextPassword),
      updatedAt: nowIso(),
      passwordResetAt: nowIso(),
      passwordResetBy: String(profile.id || ""),
      passwordResetDefault: true,
    },
    dbConfig
  );

  return sendJson(res, 200, { ok: true, defaultPassword });
};

/* ---------- Batch import assets (single HTTP request for N assets) ---------- */

const handleAssetsBatchImport = async (req, res) => {
  let body;
  try {
    body = await parseJsonBody(req, 50 * 1024 * 1024); // 50 MB limit for large imports
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
  }

  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) {
    return sendJson(res, 400, { ok: false, error: "items array is required and must not be empty" });
  }
  if (items.length > 5000) {
    return sendJson(res, 400, { ok: false, error: "Maximum 5000 items per batch" });
  }

  const dbConfig = getAssetsRuntimeConfig();
  const results = { created: 0, updated: 0, failed: 0, errors: [] };

  // --- MySQL: optimized single-connection batch ---
  if (dbConfig.dbEngine === "mysql") {
    const mysql = await import("mysql2/promise");
    const conn = await mysql.default.createConnection(dbConfig.mysqlConfig);
    try {
      const tableName = await resolveCollectionTableMySql(conn, "assets");
      const isFlatTable = String(tableName || "").endsWith("_flat");

      // Batch-fetch existing items for updates (single query)
      const updateIds = items
        .map((item) => String(item?.existingId || "").trim())
        .filter(Boolean);

      const existingMap = new Map();
      if (updateIds.length > 0) {
        const CHUNK = 500;
        for (let offset = 0; offset < updateIds.length; offset += CHUNK) {
          const chunk = updateIds.slice(offset, offset + CHUNK);
          const ph = chunk.map(() => "?").join(", ");
          const [rows] = await conn.execute(
            `SELECT * FROM ${quoteIdentMySql(tableName)} WHERE id IN (${ph})`,
            chunk
          );
          for (const row of rows) {
            existingMap.set(String(row.id || ""), mapMySqlRowToDocument(row));
          }
        }
      }

      // Pre-process: normalize, flatten, aggregate column types
      const processedItems = [];
      const aggregatedTypeMap = {};

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
          const existingId = String(item?.existingId || "").trim();
          const rawPayload = item.payload || item;

          let normalized;
          if (existingId) {
            const prev = { ...(existingMap.get(existingId) || {}) };
            delete prev.id;
            normalized = {
              ...prev,
              ...normalizeAssetPayload(rawPayload),
              updatedAt: new Date().toISOString(),
            };
          } else {
            normalized = {
              ...normalizeAssetPayload(rawPayload),
              createdAt: rawPayload?.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
          }

          const nextId = existingId || String(rawPayload?.id || "").trim() || randomId();
          const flat = flattenScalarFields(normalized);

          for (const [col, value] of Object.entries(flat)) {
            aggregatedTypeMap[col] = mergeTypes(aggregatedTypeMap[col], detectValueType(value));
          }

          processedItems.push({ index: i, id: nextId, normalized, flat, isUpdate: Boolean(existingId) });
        } catch (err) {
          results.failed++;
          if (results.errors.length < 20) {
            results.errors.push(`#${i + 1}: ${err.message || "unknown error"}`);
          }
        }
      }

      // Ensure all needed columns exist in one pass
      await ensureFlatColumnsMySql(conn, tableName, aggregatedTypeMap);
      await ensureMySqlLongTextColumns(conn, tableName, ["inventory_change_history", "photos"]);

      // Get column metadata once
      const columnsAfterEnsure = await getMySqlColumns(conn, tableName);
      const columnTypes = await getMySqlColumnTypes(conn, tableName);
      const hasPayloadColumn = columnsAfterEnsure.has("payload");
      const shouldPersistPayload = hasPayloadColumn && !isFlatTable;

      // Insert/update all rows using the single connection
      for (const processed of processedItems) {
        try {
          const { id, normalized, flat, isUpdate } = processed;
          const scalarColumns = Object.keys(flat).filter((col) => columnsAfterEnsure.has(col));

          const insertColumns = ["id", ...(shouldPersistPayload ? ["payload"] : []), ...scalarColumns];
          const insertValues = [
            id,
            ...(shouldPersistPayload ? [JSON.stringify(normalized)] : []),
            ...scalarColumns.map((col) =>
              normalizeValueForMySqlColumnType(flat[col], columnTypes[col], aggregatedTypeMap[col])
            ),
          ];

          const placeholders = insertColumns.map(() => "?").join(", ");
          const updates = [
            ...(shouldPersistPayload ? ["payload = VALUES(payload)"] : []),
            ...scalarColumns.map((col) => `${quoteIdentMySql(col)} = VALUES(${quoteIdentMySql(col)})`),
            ...(columnsAfterEnsure.has("updated_at") ? ["updated_at = CURRENT_TIMESTAMP"] : []),
          ].join(", ");

          if (!updates) {
            await conn.execute(
              `INSERT IGNORE INTO ${quoteIdentMySql(tableName)} (${insertColumns.map((col) => quoteIdentMySql(col)).join(", ")}) VALUES (${placeholders})`,
              insertValues
            );
          } else {
            await conn.execute(
              `INSERT INTO ${quoteIdentMySql(tableName)} (${insertColumns.map((col) => quoteIdentMySql(col)).join(", ")}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
              insertValues
            );
          }

          if (isUpdate) results.updated++;
          else results.created++;
        } catch (err) {
          results.failed++;
          if (results.errors.length < 20) {
            results.errors.push(`#${processed.index + 1}: ${err.message || "unknown error"}`);
          }
        }
      }
    } finally {
      await conn.end();
    }

    broadcastAssetsSse("assets-change", { type: "batch-import", at: nowIso(), created: results.created, updated: results.updated });
    return sendJson(res, 200, { ok: true, ...results });
  }

  // --- Fallback for file/postgres engines: sequential ---
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const existingId = String(item?.existingId || "").trim();
      if (existingId) {
        await updateAssetData(existingId, item.payload || item, dbConfig);
        results.updated++;
      } else {
        await createAssetData(item.payload || item, dbConfig);
        results.created++;
      }
    } catch (err) {
      results.failed++;
      if (results.errors.length < 20) {
        results.errors.push(`#${i + 1}: ${err.message || "unknown error"}`);
      }
    }
  }

  broadcastAssetsSse("assets-change", { type: "batch-import", at: nowIso(), created: results.created, updated: results.updated });
  return sendJson(res, 200, { ok: true, ...results });
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
    const startedAt = Date.now();
    const requestUrl = new URL(req.url || "/api/assets", `http://${HOST}:${PORT}`);
    const pageRaw = String(requestUrl.searchParams.get("page") || "").trim();
    const pageSizeRaw = String(requestUrl.searchParams.get("pageSize") || "").trim();
    const search = String(requestUrl.searchParams.get("search") || "").trim().toLowerCase();
    const locationName = String(requestUrl.searchParams.get("locationName") || "").trim();
    const status = String(requestUrl.searchParams.get("status") || "").trim();
    const category = String(requestUrl.searchParams.get("category") || "").trim();
    const decision = String(requestUrl.searchParams.get("decision") || "").trim();
    const lite = String(requestUrl.searchParams.get("lite") || "").trim() === "1";

    const HEAVY_FIELDS = ["photos", "inventoryChangeHistory", "inventory_change_history", "transferHistory", "transfer_history", "writeOffHistory", "write_off_history", "employeeUsageHistory", "employee_usage_history"];
    const stripHeavyFields = (items) => items.map((item) => {
      const out = { ...item };
      for (const key of HEAVY_FIELDS) {
        if (key in out) {
          if (key === "photos" || key === "inventoryChangeHistory" || key === "inventory_change_history") {
            out[key] = Array.isArray(out[key]) ? out[key].length : 0;
          } else {
            delete out[key];
          }
        }
      }
      return out;
    });

    const hasPaging = Boolean(pageRaw || pageSizeRaw);
    if (!hasPaging && !search && !locationName && !status && !category && !decision) {
      const assets = await getAssetsData(dbConfig);
      const responseData = lite ? stripHeavyFields(assets) : assets;
      logSlowAssetsGet({
        elapsedMs: Date.now() - startedAt,
        dbEngine: dbConfig.dbEngine,
        paged: false,
        page: 1,
        pageSize: assets.length,
        resultCount: assets.length,
        total: assets.length,
        hasSearch: false,
        hasLocation: false,
        hasStatus: false,
        hasCategory: false,
        hasDecision: false,
      });
      return sendJson(res, 200, { ok: true, data: responseData });
    }

    const pagePayload = await getAssetsPageData(dbConfig, {
      page: pageRaw || "1",
      pageSize: pageSizeRaw || "50",
      search,
      locationName,
      status,
      category,
      decision,
    });

    logSlowAssetsGet({
      elapsedMs: Date.now() - startedAt,
      dbEngine: dbConfig.dbEngine,
      paged: true,
      page: pagePayload?.meta?.page || (Number.parseInt(pageRaw || "1", 10) || 1),
      pageSize: pagePayload?.meta?.pageSize || (Number.parseInt(pageSizeRaw || "50", 10) || 50),
      resultCount: Array.isArray(pagePayload?.data) ? pagePayload.data.length : 0,
      total: Number(pagePayload?.meta?.total || 0),
      hasSearch: Boolean(search),
      hasLocation: Boolean(locationName),
      hasStatus: Boolean(status),
      hasCategory: Boolean(category),
      hasDecision: Boolean(decision),
    });

    return sendJson(res, 200, {
      ok: true,
      data: pagePayload.data,
      meta: pagePayload.meta,
    });
  }

  if (method === "POST" && !assetId) {
    let payload;
    try {
      payload = await parseJsonBody(req);
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
    }

    const id = await createAssetData(payload, dbConfig);
    broadcastAssetsSse("assets-change", {
      type: "created",
      id: String(id || ""),
      at: nowIso(),
    });
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
    broadcastAssetsSse("assets-change", {
      type: "updated",
      id: String(assetId || ""),
      at: nowIso(),
    });
    return sendJson(res, 200, { ok: true });
  }

  if (method === "DELETE" && assetId) {
    await deleteAssetData(assetId, dbConfig);
    broadcastAssetsSse("assets-change", {
      type: "deleted",
      id: String(assetId || ""),
      at: nowIso(),
    });
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

  const normalizeUsersPayloadAliases = (input) => {
    if (!input || typeof input !== "object") return input;
    const next = { ...(input || {}) };

    const normalizeString = (value) => String(value || "").trim();

    const workRoleValue = [next.workRole, next.work_role, next.work_role_name]
      .map(normalizeString)
      .find(Boolean);
    if (workRoleValue) {
      next.workRole = workRoleValue;
      next.work_role = workRoleValue;
      next.work_role_name = workRoleValue;
    }

    const positionValue = [next.position, next.position_name]
      .map(normalizeString)
      .find(Boolean);
    if (positionValue) {
      next.position = positionValue;
      next.position_name = positionValue;
    }

    const restaurantValue = [next.restaurant, next.restaurantId, next.restaurant_id, next.restaurantName, next.restaurant_name]
      .map(normalizeString)
      .find(Boolean);
    if (restaurantValue) {
      next.restaurant = restaurantValue;
      next.restaurant_id = restaurantValue;
      next.restaurant_name = restaurantValue;
    }

    return next;
  };

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

    const normalizedPayload = collectionName === "users"
      ? normalizeUsersPayloadAliases(payload)
      : payload;
    const id = await createCollectionItemData(collectionName, normalizedPayload, dbConfig);
    return sendJson(res, 200, { ok: true, id });
  }

  if (method === "PUT" && itemId) {
    let payload;
    try {
      payload = await parseJsonBody(req);
    } catch (error) {
      return sendJson(res, 400, { ok: false, error: `Invalid JSON: ${error.message}` });
    }

    const normalizedPayload = collectionName === "users"
      ? normalizeUsersPayloadAliases(payload)
      : payload;
    await updateCollectionItemData(collectionName, itemId, normalizedPayload, dbConfig);
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
    try {
      return await handleAuthRegister(req, res);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  if (method === "POST" && pathname === "/auth/login") {
    try {
      return await handleAuthLogin(req, res);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  if (method === "GET" && pathname === "/auth/me") {
    try {
      return await handleAuthMe(req, res);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  if (method === "POST" && pathname === "/auth/logout") {
    try {
      return await handleAuthLogout(req, res);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  if (method === "POST" && pathname === "/auth/admin-create-user") {
    try {
      return await handleAuthAdminCreateUser(req, res);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  if (method === "POST" && pathname === "/auth/admin-reset-user-password") {
    try {
      return await handleAuthAdminResetUserPassword(req, res);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  if (method === "POST" && pathname === "/auth/update-profile") {
    try {
      return await handleAuthUpdateProfile(req, res);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  if (method === "POST" && pathname === "/auth/change-password") {
    try {
      return await handleAuthChangePassword(req, res);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
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

  if (pathname === "/api/assets/batch" && method === "POST") {
    if (!isAuthorized(req)) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized" });
    }
    try {
      return await handleAssetsBatchImport(req, res);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  if (pathname === "/api/assets") {
    try {
      return await handleAssetsApi(req, res, "");
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: `Server error: ${error.message}` });
    }
  }

  if (pathname === "/api/assets/events" && method === "GET") {
    const tokenFromQuery = String(requestUrl.searchParams.get("token") || "").trim();
    const authorized = isAuthorized(req) || (Boolean(TOKEN) && tokenFromQuery === TOKEN);
    if (!authorized) {
      return sendJson(res, 401, { ok: false, error: "Unauthorized" });
    }

    registerAssetsSseClient(req, res);
    writeSseEvent(res, "assets-ready", { ok: true, at: nowIso() });
    return;
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

  if (pathname === "/api/print-label" && req.method === "POST") {
    try {
      const body = await parseJsonBody(req, 2 * 1024 * 1024);
      const rawData = body.data; // base64-encoded TSPL payload
      const printerIp = String(body.printerIp || process.env.PRINTER_IP || "").trim();
      const printerPort = Number(body.printerPort || process.env.PRINTER_PORT || 9100);

      if (!rawData || !printerIp) {
        return sendJson(res, 400, { ok: false, error: "Missing data or printerIp" });
      }

      const buffer = Buffer.from(rawData, "base64");

      await new Promise((resolve, reject) => {
        const socket = new net.Socket();
        socket.setTimeout(10_000);
        socket.connect(printerPort, printerIp, () => {
          socket.write(buffer, () => {
            socket.end();
            resolve();
          });
        });
        socket.on("timeout", () => { socket.destroy(); reject(new Error("Printer connection timeout")); });
        socket.on("error", (err) => reject(err));
      });

      return sendJson(res, 200, { ok: true });
    } catch (error) {
      console.error("[print-label] error:", error.message);
      return sendJson(res, 500, { ok: false, error: `Print failed: ${error.message}` });
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
