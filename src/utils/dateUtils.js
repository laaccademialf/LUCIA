const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

const toFiniteNumber = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  const normalized = String(value ?? "").trim();
  if (!normalized) return NaN;

  if (!/^[-+]?\d+(\.\d+)?$/.test(normalized)) {
    return NaN;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const parseExcelSerialDate = (value) => {
  const numeric = toFiniteNumber(value);
  if (!Number.isFinite(numeric)) return null;

  // Keep range broad enough for historical/future imports, but avoid tiny numbers and noise.
  if (numeric < 1 || numeric > 2958465) return null;

  const millis = EXCEL_EPOCH_UTC + Math.round(numeric * 86400000);
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const parsePossiblyExcelDate = (value) => {
  if (value === null || value === undefined) return null;

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const excelDate = parseExcelSerialDate(trimmed);
  if (excelDate) return excelDate;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

export const formatPossiblyExcelDate = (value, fallback = "-") => {
  const parsed = parsePossiblyExcelDate(value);
  if (!parsed) return fallback;
  return parsed.toLocaleDateString("uk-UA");
};

export const formatYearOrPossiblyExcelDate = (value, fallback = "-") => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return fallback;

  if (/^\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  return formatPossiblyExcelDate(trimmed, trimmed || fallback);
};
