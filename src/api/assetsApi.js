const ENV_API_BASE = String(import.meta.env.VITE_DATA_API_BASE_URL || "").trim().replace(/\/+$/, "");
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
  const runtimeBase = String(runtime?.apiBaseUrl || "").trim().replace(/\/+$/, "");
  return runtimeBase || ENV_API_BASE;
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

  const token = getApiToken();
  const params = new URLSearchParams();
  if (token) {
    params.set("token", token);
  }

  const sseUrl = `${endpoint("/api/assets/events")}${params.toString() ? `?${params.toString()}` : ""}`;
  const source = new EventSource(sseUrl);

  const notifyChange = () => {
    if (typeof onChange === "function") {
      onChange();
    }
  };

  source.addEventListener("assets-change", notifyChange);
  source.onmessage = notifyChange;
  source.onerror = (event) => {
    if (typeof onError === "function") {
      onError(event);
    }
  };

  return () => {
    source.close();
  };
};
