// API-клієнт для модуля Юридичного відділу.
// Зберігає юридичні задачі та сповіщення у власній MariaDB через generic
// collections-ендпоінт custom-db сервера (/api/collections/<name>).
// Навмисно НЕ використовує кеш collectionsApi.js, бо канбан/TODO потребують
// майже-реального оновлення між користувачами (короткий polling).

const ENV_API_BASE = String(import.meta.env.VITE_DATA_API_BASE_URL || "").trim().replace(/\/+$/, "");
const ENV_API_TOKEN = String(import.meta.env.VITE_DATA_API_TOKEN || "").trim();

const LEGAL_TASKS_COLLECTION = "legalTasks";
const LEGAL_NOTIFICATIONS_COLLECTION = "legalNotifications";

const readRuntimeCustomConfig = () => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem("lucia_runtime_custom_config");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

const getApiBase = () => {
  const runtime = readRuntimeCustomConfig();
  const runtimeBase = String(runtime?.apiBaseUrl || "").trim().replace(/\/+$/, "");
  return runtimeBase || ENV_API_BASE;
};

const getApiToken = () => {
  const runtime = readRuntimeCustomConfig();
  const runtimeToken = String(runtime?.token || "").trim();
  return runtimeToken || ENV_API_TOKEN;
};

const getAuthSessionToken = () => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return "";
  return String(localStorage.getItem("lucia_auth_session_token") || "").trim();
};

const headers = () => {
  const next = { "Content-Type": "application/json" };
  const token = getApiToken();
  if (token) next.Authorization = `Bearer ${token}`;
  const sessionToken = getAuthSessionToken();
  if (sessionToken) next["x-session-token"] = sessionToken;
  return next;
};

const endpoint = (path) => `${getApiBase()}${path}`;

export const isLegalApiEnabled = () => Boolean(getApiBase());

const listCollection = async (collectionName) => {
  const response = await fetch(endpoint(`/api/collections/${encodeURIComponent(collectionName)}`), {
    method: "GET",
    headers: headers(),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Legal API GET ${collectionName} failed (${response.status}): ${body || "no body"}`);
  }
  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
};

const createInCollection = async (collectionName, data) => {
  const response = await fetch(endpoint(`/api/collections/${encodeURIComponent(collectionName)}`), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(data || {}),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Legal API POST ${collectionName} failed (${response.status}): ${body || "no body"}`);
  }
  const payload = await response.json();
  return String(payload?.id || "");
};

const updateInCollection = async (collectionName, id, data) => {
  const response = await fetch(
    endpoint(`/api/collections/${encodeURIComponent(collectionName)}/${encodeURIComponent(String(id || ""))}`),
    {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(data || {}),
    }
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Legal API PUT ${collectionName}/${id} failed (${response.status}): ${body || "no body"}`);
  }
};

const deleteFromCollection = async (collectionName, id) => {
  const response = await fetch(
    endpoint(`/api/collections/${encodeURIComponent(collectionName)}/${encodeURIComponent(String(id || ""))}`),
    {
      method: "DELETE",
      headers: headers(),
    }
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Legal API DELETE ${collectionName}/${id} failed (${response.status}): ${body || "no body"}`);
  }
};

// ─── Legal tasks ───
export const getLegalTasksApi = () => listCollection(LEGAL_TASKS_COLLECTION);
export const addLegalTaskApi = (data) => createInCollection(LEGAL_TASKS_COLLECTION, data);
export const updateLegalTaskApi = (id, data) => updateInCollection(LEGAL_TASKS_COLLECTION, id, data);
export const deleteLegalTaskApi = (id) => deleteFromCollection(LEGAL_TASKS_COLLECTION, id);

// ─── Legal notifications ───
export const getLegalNotificationsApi = () => listCollection(LEGAL_NOTIFICATIONS_COLLECTION);
export const addLegalNotificationApi = (data) => createInCollection(LEGAL_NOTIFICATIONS_COLLECTION, data);
export const deleteLegalNotificationApi = (id) => deleteFromCollection(LEGAL_NOTIFICATIONS_COLLECTION, id);
