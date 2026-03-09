import { addDoc, collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "./config";
import {
  createCollectionItemApi,
  isApiDataModeEnabled,
  listCollectionItemsApi,
  subscribeByPolling,
} from "./collectionsAdapter";

const AUDIT_COLLECTION = "platformAuditLogs";
const AUDIT_LOGGING_ENABLED = false;

const normalizeValue = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeValue(item))
      .filter((item) => item !== undefined);
  }

  if (t === "object") {
    return Object.entries(value).reduce((acc, [key, nested]) => {
      const normalized = normalizeValue(nested);
      if (normalized !== undefined) {
        acc[key] = normalized;
      }
      return acc;
    }, {});
  }

  return String(value);
};

export const logAuditEvent = async (payload) => {
  if (!AUDIT_LOGGING_ENABLED) {
    return;
  }

  const now = new Date();
  const createdAt = now.toISOString();

  const normalized = normalizeValue({
    ...payload,
    createdAt,
    day: createdAt.slice(0, 10),
    month: createdAt.slice(0, 7),
  });

  if (isApiDataModeEnabled()) {
    await createCollectionItemApi(AUDIT_COLLECTION, normalized);
    return;
  }

  await addDoc(collection(db, AUDIT_COLLECTION), normalized);
};

export const subscribeToAuditLogs = (callback) => {
  if (isApiDataModeEnabled()) {
    return subscribeByPolling(async () => {
      const items = await listCollectionItemsApi(AUDIT_COLLECTION);
      return items
        .sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")))
        .slice(0, 300);
    }, callback, 5000);
  }

  const q = query(collection(db, AUDIT_COLLECTION), orderBy("createdAt", "desc"), limit(300));
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    callback(items);
  });
};
