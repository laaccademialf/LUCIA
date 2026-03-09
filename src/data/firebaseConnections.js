import { initializeApp, deleteApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  writeBatch,
  doc,
  setDoc,
} from "firebase/firestore";

const CONNECTIONS_KEY = "lucia_db_connections";
const PRIMARY_ID_KEY = "lucia_primary_connection_id";
const RUNTIME_CONFIG_KEY = "lucia_runtime_firebase_config";
const SETTINGS_API_BASE_URL = String(import.meta.env.VITE_RUNTIME_SETTINGS_API_BASE_URL || "").trim().replace(/\/+$/, "");
const SETTINGS_API_TOKEN = String(import.meta.env.VITE_RUNTIME_SETTINGS_API_TOKEN || "").trim();

const REQUIRED_KEYS = ["apiKey", "authDomain", "projectId", "appId"];

const DEFAULT_ENV_CONFIG = {
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || "").trim(),
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "").trim(),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim(),
  storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "").trim(),
  messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "").trim(),
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID || "").trim(),
};

const safeParse = (raw, fallback) => {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const isBrowser = () => typeof window !== "undefined" && typeof localStorage !== "undefined";

const normalizeFirebaseConfig = (config) => {
  const next = {
    apiKey: String(config?.apiKey || "").trim(),
    authDomain: String(config?.authDomain || "").trim(),
    projectId: String(config?.projectId || "").trim(),
    storageBucket: String(config?.storageBucket || "").trim(),
    messagingSenderId: String(config?.messagingSenderId || "").trim(),
    appId: String(config?.appId || "").trim(),
  };
  return next;
};

const normalizeCustomConfig = (config) => {
  const baseUrl = String(config?.apiBaseUrl || "").trim().replace(/\/+$/, "");
  const migrationPath = String(config?.migrationPath || "/migration/import").trim();
  const healthPath = String(config?.healthPath || "/health").trim();
  const testPath = String(config?.testPath || "/db/test").trim();
  const token = String(config?.token || "").trim();
  const dbEngine = String(config?.dbEngine || "mysql").trim().toLowerCase();
  const dbHost = String(config?.dbHost || "").trim();
  const dbPort = Number(config?.dbPort || 3306);
  const dbUser = String(config?.dbUser || "").trim();
  const dbPassword = String(config?.dbPassword || "");
  const dbName = String(config?.dbName || "").trim();
  const postgresUrl = String(config?.postgresUrl || "").trim();

  return {
    apiBaseUrl: baseUrl,
    migrationPath: migrationPath || "/migration/import",
    healthPath: healthPath || "/health",
    testPath: testPath || "/db/test",
    token,
    dbEngine,
    dbHost,
    dbPort,
    dbUser,
    dbPassword,
    dbName,
    postgresUrl,
  };
};

export const isValidCustomConfig = (config) => {
  const normalized = normalizeCustomConfig(config);
  return Boolean(normalized.apiBaseUrl);
};

const customApiUrl = (baseUrl, path) => {
  const normalizedPath = String(path || "").trim();
  const finalPath = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  return `${String(baseUrl || "").replace(/\/+$/, "")}${finalPath}`;
};

const customHeaders = (token) => {
  const next = { "Content-Type": "application/json" };
  if (token) {
    next.Authorization = `Bearer ${token}`;
  }
  return next;
};

const settingsHeaders = () => {
  const headers = { "Content-Type": "application/json" };
  if (SETTINGS_API_TOKEN) {
    headers.Authorization = `Bearer ${SETTINGS_API_TOKEN}`;
  }
  return headers;
};

const settingsEndpoint = () => {
  if (!SETTINGS_API_BASE_URL) return "";
  return `${SETTINGS_API_BASE_URL}/settings/firebase-runtime`;
};

const persistRuntimeConfigToServer = async ({ primaryConnectionId, runtimeConfig }) => {
  const endpoint = settingsEndpoint();
  if (!endpoint) return;

  try {
    await fetch(endpoint, {
      method: "PUT",
      headers: settingsHeaders(),
      body: JSON.stringify({
        primaryConnectionId: primaryConnectionId || "",
        runtimeConfig: runtimeConfig || null,
      }),
    });
  } catch {
    // Local storage remains source-of-truth fallback if settings API is temporarily unavailable.
  }
};

const clearRuntimeConfigOnServer = async () => {
  const endpoint = settingsEndpoint();
  if (!endpoint) return;

  try {
    await fetch(endpoint, {
      method: "DELETE",
      headers: settingsHeaders(),
    });
  } catch {
    // Ignore remote cleanup errors; local cleanup already happened.
  }
};

export const syncRuntimeConfigFromServer = async () => {
  if (!isBrowser()) return { synced: false, reason: "not-browser" };

  const endpoint = settingsEndpoint();
  if (!endpoint) return { synced: false, reason: "settings-api-not-configured" };

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: SETTINGS_API_TOKEN ? { Authorization: `Bearer ${SETTINGS_API_TOKEN}` } : undefined,
    });

    if (!response.ok) {
      return { synced: false, reason: `http-${response.status}` };
    }

    const payload = await response.json().catch(() => null);
    const runtimeConfig = payload?.runtimeConfig || null;
    const primaryConnectionId = String(payload?.primaryConnectionId || "");

    if (runtimeConfig && isValidFirebaseConfig(runtimeConfig)) {
      localStorage.setItem(RUNTIME_CONFIG_KEY, JSON.stringify(normalizeFirebaseConfig(runtimeConfig)));
      if (primaryConnectionId) {
        localStorage.setItem(PRIMARY_ID_KEY, primaryConnectionId);
      }
      return { synced: true, source: "server", hasRuntimeConfig: true };
    }

    localStorage.removeItem(RUNTIME_CONFIG_KEY);
    localStorage.removeItem(PRIMARY_ID_KEY);
    return { synced: true, source: "server", hasRuntimeConfig: false };
  } catch {
    return { synced: false, reason: "network" };
  }
};

export const isValidFirebaseConfig = (config) => {
  const normalized = normalizeFirebaseConfig(config);
  return REQUIRED_KEYS.every((key) => Boolean(normalized[key]));
};

export const getConnections = () => {
  if (!isBrowser()) return [];
  const raw = localStorage.getItem(CONNECTIONS_KEY);
  const parsed = safeParse(raw || "[]", []);
  return Array.isArray(parsed) ? parsed : [];
};

const saveConnections = (connections) => {
  if (!isBrowser()) return;
  localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections));
};

export const addConnection = (payload) => {
  const type = String(payload?.type || "firebase").toLowerCase();
  let config = null;

  if (type === "firebase") {
    config = normalizeFirebaseConfig(payload?.config || {});
    if (!isValidFirebaseConfig(config)) {
      throw new Error("Неповний Firebase конфіг");
    }
  } else if (type === "custom") {
    config = normalizeCustomConfig(payload?.config || {});
    if (!isValidCustomConfig(config)) {
      throw new Error("Неповний конфіг Custom API");
    }
  } else {
    throw new Error("Непідтримуваний тип підключення");
  }

  const connections = getConnections();
  const record = {
    id: `conn_${Date.now()}`,
    name: String(payload?.name || "Нове підключення").trim() || "Нове підключення",
    type,
    config,
    createdAt: new Date().toISOString(),
  };

  saveConnections([record, ...connections]);
  return record;
};

export const deleteConnectionById = async (id) => {
  const connections = getConnections();
  const next = connections.filter((item) => item.id !== id);
  saveConnections(next);

  const primaryId = getPrimaryConnectionId();
  if (primaryId === id) {
    await clearPrimaryConnection();
  }
};

export const getPrimaryConnectionId = () => {
  if (!isBrowser()) return "";
  return String(localStorage.getItem(PRIMARY_ID_KEY) || "");
};

export const getPrimaryConnection = () => {
  const id = getPrimaryConnectionId();
  if (!id) return null;
  return getConnections().find((item) => item.id === id) || null;
};

export const getCurrentRuntimeConfig = () => {
  if (!isBrowser()) {
    return isValidFirebaseConfig(DEFAULT_ENV_CONFIG) ? DEFAULT_ENV_CONFIG : null;
  }

  const raw = localStorage.getItem(RUNTIME_CONFIG_KEY);
  if (raw) {
    const parsed = safeParse(raw, null);
    if (parsed && isValidFirebaseConfig(parsed)) {
      return normalizeFirebaseConfig(parsed);
    }
  }

  return isValidFirebaseConfig(DEFAULT_ENV_CONFIG) ? DEFAULT_ENV_CONFIG : null;
};

export const setPrimaryConnectionById = async (id) => {
  const connection = getConnections().find((item) => item.id === id);
  if (!connection) {
    throw new Error("Підключення не знайдено");
  }
  if (connection.type !== "firebase") {
    throw new Error("Основною можна зробити тільки Firebase БД");
  }

  if (!isBrowser()) return;
  localStorage.setItem(PRIMARY_ID_KEY, id);
  localStorage.setItem(RUNTIME_CONFIG_KEY, JSON.stringify(connection.config));
  await persistRuntimeConfigToServer({
    primaryConnectionId: id,
    runtimeConfig: connection.config,
  });
};

export const clearPrimaryConnection = async () => {
  if (!isBrowser()) return;
  localStorage.removeItem(PRIMARY_ID_KEY);
  localStorage.removeItem(RUNTIME_CONFIG_KEY);
  await clearRuntimeConfigOnServer();
};

export const testFirebaseConnection = async (config) => {
  const normalized = normalizeFirebaseConfig(config);
  if (!isValidFirebaseConfig(normalized)) {
    throw new Error("Неповний Firebase конфіг");
  }

  const appName = `lucia_test_${Date.now()}`;
  const app = initializeApp(normalized, appName);

  try {
    // Lightweight read against a common collection to verify basic Firestore access.
    const db = getFirestore(app);
    await getDocs(collection(db, "menuStructure"));
    return { ok: true, message: "Підключення валідне" };
  } finally {
    await deleteApp(app);
  }
};

export const testCustomConnection = async (config) => {
  const normalized = normalizeCustomConfig(config);
  if (!isValidCustomConfig(normalized)) {
    throw new Error("Неповний конфіг Custom API");
  }

  const hasDbCredentials =
    Boolean(normalized.postgresUrl) ||
    (Boolean(normalized.dbHost) && Boolean(normalized.dbUser) && Boolean(normalized.dbName));

  if (!hasDbCredentials) {
    const url = customApiUrl(normalized.apiBaseUrl, normalized.healthPath);
    const response = await fetch(url, {
      method: "GET",
      headers: normalized.token ? { Authorization: `Bearer ${normalized.token}` } : undefined,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Custom API healthcheck failed (${response.status}): ${body || "no body"}`);
    }

    return { ok: true, status: response.status, mode: "api-health" };
  }

  const url = customApiUrl(normalized.apiBaseUrl, normalized.testPath);
  const response = await fetch(url, {
    method: "POST",
    headers: customHeaders(normalized.token),
    body: JSON.stringify({
      target: {
        dbEngine: normalized.dbEngine,
        dbHost: normalized.dbHost,
        dbPort: normalized.dbPort,
        dbUser: normalized.dbUser,
        dbPassword: normalized.dbPassword,
        dbName: normalized.dbName,
        postgresUrl: normalized.postgresUrl,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Custom DB test failed (${response.status}): ${body || "no body"}`);
  }

  return { ok: true, status: response.status, mode: "db-test" };
};

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

const readFirebaseCollections = async ({ sourceConfig, collections }) => {
  const src = normalizeFirebaseConfig(sourceConfig);

  if (!isValidFirebaseConfig(src)) {
    throw new Error("Для міграції потрібен валідний Firebase конфіг джерела");
  }

  const selectedCollections = Array.isArray(collections) ? collections.filter(Boolean) : [];
  if (selectedCollections.length === 0) {
    throw new Error("Не обрано колекції для міграції");
  }

  const srcApp = initializeApp(src, `lucia_src_${Date.now()}`);

  try {
    const srcDb = getFirestore(srcApp);
    const stats = {};
    const dataByCollection = {};

    for (const collectionName of selectedCollections) {
      const snap = await getDocs(collection(srcDb, collectionName));
      const docs = snap.docs.map((item) => ({ id: item.id, data: item.data() }));
      stats[collectionName] = docs.length;
      dataByCollection[collectionName] = docs;
    }

    return { src, selectedCollections, stats, dataByCollection };
  } finally {
    await deleteApp(srcApp);
  }
};

export const migrateFirebaseData = async ({ sourceConfig, targetConfig, collections }) => {
  const { src, selectedCollections, stats, dataByCollection } = await readFirebaseCollections({
    sourceConfig,
    collections,
  });
  const dst = normalizeFirebaseConfig(targetConfig);

  if (!isValidFirebaseConfig(dst)) {
    throw new Error("Для міграції потрібен валідний Firebase конфіг цілі");
  }

  const dstApp = initializeApp(dst, `lucia_dst_${Date.now()}`);

  try {
    const dstDb = getFirestore(dstApp);

    for (const collectionName of selectedCollections) {
      const docs = dataByCollection[collectionName] || [];

      for (const pack of chunk(docs, 350)) {
        const batch = writeBatch(dstDb);
        pack.forEach((item) => {
          batch.set(doc(dstDb, collectionName, item.id), item.data, { merge: true });
        });
        await batch.commit();
      }

      // Ensure empty but required collections can still exist with a marker doc when needed.
      if (docs.length === 0 && collectionName === "menuStructure") {
        await setDoc(doc(dstDb, collectionName, "main"), { structure: [] }, { merge: true });
      }
    }

    return { ok: true, stats };
  } finally {
    await deleteApp(dstApp);
  }
};

export const migrateFirebaseToCustomData = async ({ sourceConfig, targetConfig, collections }) => {
  const { src, selectedCollections, stats, dataByCollection } = await readFirebaseCollections({
    sourceConfig,
    collections,
  });
  const target = normalizeCustomConfig(targetConfig);

  if (!isValidCustomConfig(target)) {
    throw new Error("Для міграції в Custom DB потрібен валідний API Base URL");
  }

  const endpoint = customApiUrl(target.apiBaseUrl, target.migrationPath);
  const payload = {
    source: {
      type: "firebase",
      projectId: src.projectId,
    },
    target: {
      type: "custom",
      apiBaseUrl: target.apiBaseUrl,
      dbEngine: target.dbEngine,
      dbHost: target.dbHost,
      dbPort: target.dbPort,
      dbUser: target.dbUser,
      dbPassword: target.dbPassword,
      dbName: target.dbName,
      postgresUrl: target.postgresUrl,
    },
    collections: selectedCollections,
    stats,
    data: dataByCollection,
    migratedAt: new Date().toISOString(),
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: customHeaders(target.token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Custom migration failed (${response.status}): ${body || "no body"}`);
  }

  let serverResponse = null;
  try {
    serverResponse = await response.json();
  } catch {
    serverResponse = null;
  }

  return {
    ok: true,
    stats,
    endpoint,
    serverResponse,
  };
};

export const bootstrapFirebaseConnection = async ({ targetConfig, sourceConfig }) => {
  const target = normalizeFirebaseConfig(targetConfig);
  const source = normalizeFirebaseConfig(sourceConfig || getCurrentRuntimeConfig() || {});

  if (!isValidFirebaseConfig(target)) {
    throw new Error("Цільовий конфіг невалідний");
  }

  const targetApp = initializeApp(target, `lucia_bootstrap_target_${Date.now()}`);
  const sourceApp = isValidFirebaseConfig(source)
    ? initializeApp(source, `lucia_bootstrap_source_${Date.now()}`)
    : null;

  try {
    const targetDb = getFirestore(targetApp);
    let structure = [];

    if (sourceApp) {
      const sourceDb = getFirestore(sourceApp);
      const sourceMenuSnap = await getDoc(doc(sourceDb, "menuStructure", "main"));
      if (sourceMenuSnap.exists()) {
        const sourceData = sourceMenuSnap.data();
        structure = Array.isArray(sourceData?.structure) ? sourceData.structure : [];
      }
    }

    await setDoc(
      doc(targetDb, "menuStructure", "main"),
      {
        structure,
        bootstrappedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    await setDoc(
      doc(targetDb, "system", "bootstrap"),
      {
        initializedAt: new Date().toISOString(),
        sourceProjectId: source?.projectId || null,
      },
      { merge: true }
    );

    return { ok: true, structureCount: Array.isArray(structure) ? structure.length : 0 };
  } finally {
    if (sourceApp) await deleteApp(sourceApp);
    await deleteApp(targetApp);
  }
};

export const RUNTIME_FIREBASE_CONFIG_KEY = RUNTIME_CONFIG_KEY;
