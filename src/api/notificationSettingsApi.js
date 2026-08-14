const normalizeBase = (value) => String(value || "")
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");
const readRuntime = () => {
  try {
    return typeof localStorage !== "undefined"
      ? JSON.parse(localStorage.getItem("lucia_runtime_custom_config") || "null")
      : null;
  } catch {
    return null;
  }
};

const getBase = () => {
  const runtime = readRuntime();
  return String(runtime?.apiBaseUrl || import.meta.env.VITE_DATA_API_BASE_URL || window.location.origin)
    .trim().replace(/\/+$/, "");
};

const headers = () => {
  const runtime = readRuntime();
  const next = { "Content-Type": "application/json" };
  const token = String(runtime?.token || import.meta.env.VITE_DATA_API_TOKEN || "").trim();
  const session = String(localStorage.getItem("lucia_auth_session_token") || "").trim();
  if (token) next.Authorization = `Bearer ${token}`;
  if (session) next["x-session-token"] = session;
  return next;
};

const request = async (path, options = {}) => {
  const response = await fetch(`${normalizeBase(getBase())}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  return payload;
};

export const getNotificationSettings = () => request("/api/settings/notifications");
export const saveNotificationSettings = (settings) => request("/api/settings/notifications", {
  method: "PUT",
  body: JSON.stringify(settings),
});
export const testNotificationSettings = (to) => request("/api/settings/notifications/test", {
  method: "POST",
  body: JSON.stringify({ to }),
});
