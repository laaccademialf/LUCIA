const PLATFORM_ADMIN_EMAILS_STORAGE_KEY = "lucia_platform_admin_emails";

const isBrowser = () => typeof window !== "undefined" && typeof localStorage !== "undefined";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const uniqueEmails = (items) => Array.from(new Set((items || []).map(normalizeEmail).filter(Boolean)));

export const getRuntimePlatformAdminEmails = () => {
  if (!isBrowser()) return [];

  const raw = localStorage.getItem(PLATFORM_ADMIN_EMAILS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? uniqueEmails(parsed) : [];
  } catch {
    return [];
  }
};

export const setRuntimePlatformAdminEmails = (emails) => {
  if (!isBrowser()) return [];

  const normalized = uniqueEmails(emails);
  localStorage.setItem(PLATFORM_ADMIN_EMAILS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
};

export const addRuntimePlatformAdminEmail = (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return getRuntimePlatformAdminEmails();

  const current = getRuntimePlatformAdminEmails();
  return setRuntimePlatformAdminEmails([...current, normalized]);
};

export const removeRuntimePlatformAdminEmail = (email) => {
  const normalized = normalizeEmail(email);
  const current = getRuntimePlatformAdminEmails();
  return setRuntimePlatformAdminEmails(current.filter((item) => item !== normalized));
};

export const clearRuntimePlatformAdminEmails = () => {
  if (!isBrowser()) return;
  localStorage.removeItem(PLATFORM_ADMIN_EMAILS_STORAGE_KEY);
};

export const PLATFORM_ADMIN_EMAILS_KEY = PLATFORM_ADMIN_EMAILS_STORAGE_KEY;
