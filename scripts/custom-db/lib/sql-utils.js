// ============================================================================
// LUCIA custom-db — чисті SQL/дані-хелпери (без стану, без I/O).
// Перший крок модуляризації server.js: усе тут — детерміновані функції,
// які можна юніт-тестити ізольовано.
// ============================================================================

export const quoteIdentMySql = (name) => {
  if (!/^[a-zA-Z0-9_]+$/.test(String(name || ""))) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return `\`${name}\``;
};

export const sanitizeColumnName = (raw) => {
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

export const MAX_MYSQL_IDENTIFIER_LENGTH = 64;

// Поля, які завжди зберігаються як JSON (не розгортаються рекурсивно)
export const ALWAYS_JSON_FIELDS = new Set([
  "assignmentTypes", "assignment_types",
  "pricingByRestaurantId", "pricing_by_restaurant_id",
  "pricingByRestaurantGroup", "pricing_by_restaurant_group",
]);

export const flattenScalarFields = (input, prefix = "", out = {}) => {
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
      const colName = sanitizeColumnName(nextKey);
      // Зберегти як JSON якщо: поле у списку динамічних, або ім'я занадто довге
      if (ALWAYS_JSON_FIELDS.has(key) || prefix && ALWAYS_JSON_FIELDS.has(prefix) || colName.length >= MAX_MYSQL_IDENTIFIER_LENGTH - 20) {
        out[colName] = JSON.stringify(value);
      } else {
        flattenScalarFields(value, nextKey, out);
      }
    }
  }
  return out;
};

export const detectValueType = (value) => {
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

export const mergeTypes = (current, next) => {
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

export const sqlTypeFor = (type) => {
  if (type === "boolean") return "TINYINT(1) NULL";
  if (type === "integer") return "BIGINT NULL";
  if (type === "number") return "DOUBLE NULL";
  if (type === "date") return "DATETIME NULL";
  return "TEXT NULL";
};

export const toMySqlDateTime = (value) => {
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

export const toMySqlDate = (value) => {
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

export const toMySqlNumber = (value, { integer = false } = {}) => {
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

export const toMySqlBoolean = (value) => {
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

export const normalizeValueForMySqlColumnType = (value, declaredType, inferredType = "") => {
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

export const parsePayloadField = (value) => {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

export const sortByPayloadTimestampsDesc = (items) => {
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
