const normalizeApiBase = (value) => String(value || "").trim().replace(/\/+$/, "").replace(/\/api$/i, "");
const ENV_API_BASE = normalizeApiBase(import.meta.env.VITE_DATA_API_BASE_URL || "");
const ENV_API_TOKEN = String(import.meta.env.VITE_DATA_API_TOKEN || "").trim();

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
  const runtimeBase = normalizeApiBase(runtime?.apiBaseUrl || "");
  const originBase =
    typeof window !== "undefined" && window.location?.origin
      ? normalizeApiBase(window.location.origin)
      : "";
  return runtimeBase || ENV_API_BASE || originBase;
};

const getApiToken = () => {
  const runtime = readRuntimeCustomConfig();
  const runtimeToken = String(runtime?.token || "").trim();
  return runtimeToken || ENV_API_TOKEN;
};

const headers = () => {
  const next = { "Content-Type": "application/json" };
  const token = getApiToken();
  if (token) {
    next.Authorization = `Bearer ${token}`;
  }
  const sessionToken =
    typeof window !== "undefined" && typeof localStorage !== "undefined"
      ? String(localStorage.getItem("lucia_auth_session_token") || "").trim()
      : "";
  if (sessionToken) next["x-session-token"] = sessionToken;
  return next;
};

const endpoint = (path) => `${getApiBase()}${path}`;

export const isAssetsApiEnabled = () => Boolean(getApiBase());

export const getAssetsApi = async ({ lite = false } = {}) => {
  const url = lite ? endpoint("/api/assets?lite=1") : endpoint("/api/assets");
  const response = await fetch(url, {
    method: "GET",
    headers: headers(),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Assets API GET failed (${response.status}): ${body || "no body"}`);
  }
  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
};

export const getAssetsPageApi = async ({
  page = 1,
  pageSize = 50,
  search = "",
  locationName = "",
  status = "",
  category = "",
  decision = "",
} = {}) => {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (String(search || "").trim()) params.set("search", String(search || "").trim());
  if (String(locationName || "").trim()) params.set("locationName", String(locationName || "").trim());
  if (String(status || "").trim()) params.set("status", String(status || "").trim());
  if (String(category || "").trim()) params.set("category", String(category || "").trim());
  if (String(decision || "").trim()) params.set("decision", String(decision || "").trim());

  const response = await fetch(endpoint(`/api/assets?${params.toString()}`), {
    method: "GET",
    headers: headers(),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Assets API GET page failed (${response.status}): ${body || "no body"}`);
  }

  const payload = await response.json().catch(() => ({}));
  return {
    data: Array.isArray(payload?.data) ? payload.data : [],
    meta: payload?.meta && typeof payload.meta === "object"
      ? payload.meta
      : {
          page: Number(page) || 1,
          pageSize: Number(pageSize) || 50,
          total: 0,
          pageCount: 0,
        },
  };
};

export const addAssetApi = async (asset) => {
  const response = await fetch(endpoint("/api/assets"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(asset || {}),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Assets API POST failed (${response.status}): ${body || "no body"}`);
  }
  const payload = await response.json();
  return String(payload?.id || "");
};

export const updateAssetApi = async (id, data) => {
  const response = await fetch(endpoint(`/api/assets/${encodeURIComponent(String(id || ""))}`), {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(data || {}),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Assets API PUT failed (${response.status}): ${body || "no body"}`);
  }
};

export const deleteAssetApi = async (id) => {
  const response = await fetch(endpoint(`/api/assets/${encodeURIComponent(String(id || ""))}`), {
    method: "DELETE",
    headers: headers(),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Assets API DELETE failed (${response.status}): ${body || "no body"}`);
  }
};

export const batchImportAssetsApi = async (items) => {
  const CHUNK_SIZE = 100;
  const totals = { created: 0, updated: 0, failed: 0, errors: [] };

  for (let offset = 0; offset < items.length; offset += CHUNK_SIZE) {
    const chunk = items.slice(offset, offset + CHUNK_SIZE);
    const response = await fetch(endpoint("/api/assets/batch"), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ items: chunk }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Assets batch import failed (${response.status}): ${body || "no body"}`);
    }
    const result = await response.json();
    totals.created += result.created || 0;
    totals.updated += result.updated || 0;
    totals.failed += result.failed || 0;
    if (Array.isArray(result.errors)) {
      totals.errors.push(...result.errors.map((e) => `[chunk ${Math.floor(offset / CHUNK_SIZE) + 1}] ${e}`));
    }
  }

  return totals;
};

export const uploadAssetPhotoApi = async ({ fileName, dataUrl }) => {
  const response = await fetch(endpoint("/api/assets/photos"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ fileName, dataUrl }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Assets API PHOTO upload failed (${response.status}): ${body || "no body"}`);
  }

  const payload = await response.json().catch(() => null);
  return {
    url: String(payload?.url || ""),
    name: String(payload?.name || fileName || "photo"),
  };
};

export const subscribeToAssetsEventsApi = ({ onChange, onError } = {}) => {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => {};
  }

  const base = getApiBase();
  if (!base) {
    return () => {};
  }

  let source = null;
  let closed = false;
  let reconnectTimer = null;
  let retryDelay = 2000; // старт 2с
  const MAX_RETRY_DELAY = 30000;

  // EventSource не вміє слати заголовки, тому авторизація йде через query.
  // Безпека: віддаємо ПЕРЕВАГУ короткоживучому сесійному токену (відкликається
  // при logout), а глобальний API-токен у URL — лише як legacy fallback,
  // щоб не світити довгоживучий секрет в історії браузера та логах проксі.
  // ВАЖЛИВО: токен читаємо ЗАНОВО на кожному (пере)підключенні — після
  // повторного логіну токен у localStorage ротується, а вже відкритий
  // EventSource не може оновити свій URL, тому кожен переконект = новий EventSource
  // зі свіжим токеном. Це прибирає 401, коли платформа відкрита довго.
  const buildUrl = () => {
    const sessionToken =
      typeof localStorage !== "undefined"
        ? String(localStorage.getItem("lucia_auth_session_token") || "").trim()
        : "";
    const params = new URLSearchParams();
    if (sessionToken) {
      params.set("session", sessionToken);
    } else {
      const token = getApiToken();
      if (token) {
        params.set("token", token);
      }
    }
    return `${endpoint("/api/assets/events")}${params.toString() ? `?${params.toString()}` : ""}`;
  };

  const notifyChange = () => {
    if (typeof onChange === "function") {
      onChange();
    }
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
  };

  const connect = () => {
    if (closed) return;
    try {
      source = new EventSource(buildUrl());
    } catch (error) {
      scheduleReconnect();
      return;
    }

    source.addEventListener("assets-change", notifyChange);
    source.onmessage = notifyChange;
    source.onopen = () => {
      // Здорове з'єднання — скидаємо backoff.
      retryDelay = 2000;
    };
    source.onerror = (event) => {
      if (typeof onError === "function") {
        onError(event);
      }
      // Штатний авто-реконект браузера повторно бив би у ТОЙ САМИЙ URL зі
      // старим (можливо, простроченим) токеном → нескінченні 401. Тому беремо
      // керування на себе: закриваємо і переконектуємось зі свіжим токеном.
      if (source) {
        source.close();
        source = null;
      }
      scheduleReconnect();
    };
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (source) {
      source.close();
      source = null;
    }
  };
};
