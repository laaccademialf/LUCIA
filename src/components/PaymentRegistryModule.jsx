import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Check, X, Plus, Download, Upload, Clock3, FileText, Edit3, Trash2, Search, Save, Building2, RefreshCcw, Landmark, Pause, Play, Send, Paperclip, Camera } from "lucide-react";
import * as XLSX from "xlsx";
import { getUsers } from "../firebase/users";
import {
  isPaymentRequestsApiEnabled,
  getPaymentRequestsApi,
  addPaymentRequestApi,
  updatePaymentRequestApi,
  deletePaymentRequestApi,
} from "../api/paymentRequestsApi.js";
import {
  isPaymentSettingsApiEnabled,
  getPayersApi, addPayerApi, updatePayerApi, deletePayerApi,
  getCounterpartiesApi, addCounterpartyApi, updateCounterpartyApi, deleteCounterpartyApi,
  getApprovalRoutesApi, addApprovalRouteApi, updateApprovalRouteApi, deleteApprovalRouteApi,
  getTypicalFieldsApi, saveTypicalFieldsApi,
} from "../api/paymentSettingsApi.js";

const cardClass = "card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl";
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";
const btnPrimary = "inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60";
const btnSecondary = "inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100";
const btnApprove = "inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60";
const btnReject = "inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60";

const PAYMENT_STATUSES = {
  draft: "Чернетка",
  pending: "На погодженні",
  accounting: "На бухгалтера",
  approved: "Погоджено",
  paused: "Призупинено",
  scheduled: "Заплановано до оплати",
  paid: "Оплачено",
  rejected: "Відхилено",
  cancelled: "Скасовано",
};

const PAYMENT_CATEGORIES = [];

const DEFAULT_ARTICLES = [
  { code: "201", name: "Оренда" },
  { code: "202", name: "Комунальні послуги" },
  { code: "203", name: "Постачальники продуктів" },
  { code: "204", name: "Ремонт та обслуговування" },
  { code: "205", name: "Зарплата" },
  { code: "206", name: "Податки та збори" },
  { code: "207", name: "Маркетинг" },
  { code: "208", name: "Обладнання" },
  { code: "209", name: "Транспорт" },
  { code: "210", name: "Канцелярія" },
  { code: "299", name: "Інше" },
];

const RECORD_TYPE_PAYMENT_REQUEST = "payment_request";
const RECORD_TYPE_RECURRING_TEMPLATE = "payment_recurring_template";

const RECURRING_FREQUENCIES = {
  monthly: "Щомісяця",
  quarterly: "Щокварталу",
  yearly: "Щороку",
};

const URGENCY_LEVELS = {
  low: "Низька",
  normal: "Звичайна",
  high: "Висока",
  critical: "Терміново",
};

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-700",
  pending: "bg-amber-100 text-amber-800",
  accounting: "bg-violet-100 text-violet-800",
  approved: "bg-emerald-100 text-emerald-800",
  paused: "bg-orange-100 text-orange-800",
  scheduled: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  rejected: "bg-rose-100 text-rose-800",
  cancelled: "bg-slate-200 text-slate-500",
};

const URGENCY_COLORS = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-blue-50 text-blue-700",
  high: "bg-amber-100 text-amber-800",
  critical: "bg-rose-100 text-rose-800",
};

const isFinanceLikeUser = (user) => {
  const roleValue = String(user?.role || "").toLowerCase();
  const workRoleValue = String(user?.workRole || "").toLowerCase();
  const terms = ["finance", "financial", "фін", "директор", "cfo", "admin"];
  return terms.some((term) => roleValue.includes(term) || workRoleValue.includes(term));
};

const formatDateTime = (value) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(value);
  }
};

const formatDate = (value) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return String(value);
  }
};

const formatMoney = (value) => {
  const num = Number.parseFloat(String(value || "0").replace(/\s+/g, "").replace(",", "."));
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseAmountValue = (value) => {
  const parsed = Number.parseFloat(String(value || "0").replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : NaN;
};

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("Не вдалося прочитати файл"));
  reader.readAsDataURL(file);
});

const formatFileSize = (bytes) => {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 Б";
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} КБ`;
  return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
};

const normalizeAttachments = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      id: String(item?.id || generateId("att")).trim(),
      name: String(item?.name || "Файл").trim() || "Файл",
      type: String(item?.type || "").trim(),
      size: Number(item?.size || 0) || 0,
      dataUrl: String(item?.dataUrl || item?.url || "").trim(),
      createdAt: String(item?.createdAt || "").trim(),
    }))
    .filter((item) => Boolean(item.dataUrl));
};

const generateId = (prefix = "pay") => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const generateRecurringSeriesKey = () => generateId("rser");

const generatePaymentNumber = (restaurantName, restaurants, existingPayments) => {
  const restaurant = (restaurants || []).find((r) => (r.name || r.id) === restaurantName);
  const code = String(restaurant?.regNumber || "000").substring(0, 3).padStart(3, "0");
  const prefix = `P${code}`;
  let maxSeq = 0;
  (existingPayments || []).forEach((p) => {
    const pn = String(p.paymentNumber || "");
    if (!pn.startsWith(prefix)) return;
    const seq = Number.parseInt(pn.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  });
  return `${prefix}${String(maxSeq + 1).padStart(9, "0")}`;
};

const padNumber = (value) => String(value).padStart(2, "0");

const toDateOnly = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${padNumber(parsed.getMonth() + 1)}-${padNumber(parsed.getDate())}`;
};

const normalizeCompanyCode = (value) => String(value || "").replace(/\D/g, "");

const parseExcelDateOnly = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return `${parsed.y}-${padNumber(parsed.m)}-${padNumber(parsed.d)}`;
  }
  return toDateOnly(value);
};

const getDayDiff = (fromDate, toDate) => {
  const from = toDateOnly(fromDate);
  const to = toDateOnly(toDate);
  if (!from || !to) return null;
  const fromUtc = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const toUtc = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((toUtc - fromUtc) / 86400000);
};

const buildVatTitleTail = (amount, vatMode, vatRate) => {
  if (vatMode === "without") {
    return ", без ПДВ";
  }
  if (vatMode === "with" && vatRate) {
    const rate = Number.parseFloat(String(vatRate).replace(",", "."));
    if (Number.isFinite(rate)) {
      const vatAmount = amount * rate / 100;
      return `, в т.ч. ПДВ ${vatRate}% - ${formatMoney(vatAmount)} грн`;
    }
  }
  return "";
};

const getTodayDateOnly = () => toDateOnly(new Date().toISOString());

const getLastDayOfMonth = (year, month) => new Date(year, month, 0).getDate();

const getRecurringStepMonths = (frequency) => {
  if (frequency === "quarterly") return 3;
  if (frequency === "yearly") return 12;
  return 1;
};

const getPreferredDay = (dayValue) => {
  const parsed = Number.parseInt(String(dayValue || "1"), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(31, parsed));
};

const buildDateWithPreferredDay = (year, month, preferredDay) => {
  const day = Math.min(getPreferredDay(preferredDay), getLastDayOfMonth(year, month));
  return `${year}-${padNumber(month)}-${padNumber(day)}`;
};

const addMonthsWithPreferredDay = (dateValue, monthOffset, preferredDay) => {
  const normalized = toDateOnly(dateValue);
  if (!normalized) return "";
  const [year, month] = normalized.split("-").map(Number);
  const totalMonths = year * 12 + (month - 1) + monthOffset;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12) + 1;
  return buildDateWithPreferredDay(nextYear, nextMonth, preferredDay);
};

const resolveInitialRecurringOccurrence = (template) => {
  const startDate = toDateOnly(template?.startDate) || getTodayDateOnly();
  const preferredDay = getPreferredDay(template?.dayOfMonth);
  const [year, month, day] = startDate.split("-").map(Number);
  let candidate = buildDateWithPreferredDay(year, month, preferredDay);
  while (candidate && candidate < startDate) {
    candidate = addMonthsWithPreferredDay(candidate, getRecurringStepMonths(template?.frequency), preferredDay);
  }
  if (!candidate) {
    return `${year}-${padNumber(month)}-${padNumber(day)}`;
  }
  return candidate;
};

const getNextRecurringOccurrence = (template, currentOccurrence) => {
  return addMonthsWithPreferredDay(currentOccurrence, getRecurringStepMonths(template?.frequency), getPreferredDay(template?.dayOfMonth));
};

const buildRecurringOccurrenceKey = (templateId, occurrenceDate) => `${String(templateId || "").trim()}::${String(occurrenceDate || "").trim()}`;

const createPaymentFormState = (defaultCurrency = "UAH") => ({
  title: "",
  description: "",
  paymentPurpose: "",
  amount: "",
  currency: defaultCurrency,
  category: "",
  articleCode: "",
  subArticleCode: "",
  urgency: "normal",
  counterparty: "",
  iban: "",
  dueDate: "",
  restaurant: "",
  attachmentNote: "",
  attachments: [],
  payerId: "",
  paidBy: "",
  expenseRestaurant: "",
  expenseRestaurants: [],
  vatMode: "none",
  vatRate: "",
  isRecurring: false,
  frequency: "monthly",
  dayOfMonth: "10",
  startDate: "",
  endDate: "",
  noEndDate: true,
});

const createRecurringTemplateFormState = (defaultCurrency = "UAH") => ({
  title: "",
  description: "",
  amount: "",
  currency: defaultCurrency,
  category: "",
  articleCode: "",
  subArticleCode: "",
  urgency: "normal",
  counterparty: "",
  iban: "",
  restaurant: "",
  expenseRestaurant: "",
  expenseRestaurants: [],
  attachmentNote: "",
  attachments: [],
  payerId: "",
  paidBy: "",
  startDate: getTodayDateOnly(),
  endDate: "",
  noEndDate: true,
  frequency: "monthly",
  dayOfMonth: "10",
});

const normalizeTypicalFieldsState = (value) => ({
  categories: Array.isArray(value?.categories) ? value.categories : [...PAYMENT_CATEGORIES],
  articles: Array.isArray(value?.articles) ? value.articles : [...DEFAULT_ARTICLES],
  subArticles: Array.isArray(value?.subArticles) ? value.subArticles : Array.isArray(value?.sub_articles) ? value.sub_articles : [],
  defaultCurrency: String(value?.defaultCurrency || value?.default_currency || "UAH").trim() || "UAH",
  vatRates: Array.isArray(value?.vatRates) ? value.vatRates : Array.isArray(value?.vat_rates) ? value.vat_rates : [7, 20],
});

const normalizeCounterpartyRecord = (value) => ({
  ...value,
  contactPerson: String(value?.contactPerson || value?.contact_person || "").trim(),
  vatMode: String(value?.vatMode || value?.vat_mode || "none").trim() || "none",
  vatRate: String(value?.vatRate || value?.vat_rate || "").trim(),
});

const isRecurringTemplateRecord = (item) => {
  const explicitType = String(item?.recordType || item?.type || "").toLowerCase();
  if (explicitType === RECORD_TYPE_RECURRING_TEMPLATE) return true;
  if (explicitType === RECORD_TYPE_PAYMENT_REQUEST) return false;

  const hasRecurringSchedule = Boolean(
    (item?.frequency && RECURRING_FREQUENCIES[item.frequency]) ||
    item?.nextOccurrenceDate ||
    item?.startDate ||
    item?.dayOfMonth ||
    typeof item?.isActive === "boolean" ||
    item?.totalGenerated
  );

  const hasPaymentWorkflow = Boolean(
    item?.status ||
    item?.paymentNumber ||
    item?.approvals ||
    item?.requestedById ||
    item?.requestedByEmail ||
    item?.paidAt ||
    item?.scheduledAt
  );

  return hasRecurringSchedule && !hasPaymentWorkflow;
};

const normalizePaymentRecord = (item) => ({
  ...item,
  recordType: RECORD_TYPE_PAYMENT_REQUEST,
  type: RECORD_TYPE_PAYMENT_REQUEST,
  requestedById: String(item?.requestedById || item?.requested_by_id || item?.ownerUserId || item?.owner_user_id || "").trim(),
  requestedByEmail: String(item?.requestedByEmail || item?.requested_by_email || item?.ownerEmail || item?.owner_email || "").trim(),
  requestedByName: String(item?.requestedByName || item?.requested_by_name || item?.ownerName || item?.owner_name || "").trim(),
  ownerUserId: String(item?.ownerUserId || item?.owner_user_id || item?.requestedById || item?.requested_by_id || "").trim(),
  ownerEmail: String(item?.ownerEmail || item?.owner_email || item?.requestedByEmail || item?.requested_by_email || "").trim(),
  ownerName: String(item?.ownerName || item?.owner_name || item?.requestedByName || item?.requested_by_name || "").trim(),
  recurringTemplateId: String(item?.recurringTemplateId || item?.recurring_template_id || "").trim(),
  recurringSeriesKey: String(item?.recurringSeriesKey || item?.recurring_series_key || item?.recurringTemplateId || item?.recurring_template_id || "").trim(),
  approvals: Array.isArray(item?.approvals) ? item.approvals : [],
  comments: Array.isArray(item?.comments) ? item.comments : [],
  attachments: normalizeAttachments(item?.attachments),
  dueDate: toDateOnly(item?.dueDate) || "",
  scheduledForDate: toDateOnly(item?.scheduledForDate || item?.scheduled_for_date) || "",
  recurringOccurrenceDate: toDateOnly(item?.recurringOccurrenceDate || item?.recurring_occurrence_date) || "",
});

const normalizeRecurringTemplateRecord = (item) => {
  const normalized = {
    ...item,
    recordType: RECORD_TYPE_RECURRING_TEMPLATE,
    type: RECORD_TYPE_RECURRING_TEMPLATE,
    ownerUserId: String(item?.ownerUserId || item?.owner_user_id || item?.requestedById || item?.requested_by_id || "").trim(),
    ownerEmail: String(item?.ownerEmail || item?.owner_email || item?.requestedByEmail || item?.requested_by_email || "").trim(),
    ownerName: String(item?.ownerName || item?.owner_name || item?.requestedByName || item?.requested_by_name || "").trim(),
    recurringSeriesKey: String(item?.recurringSeriesKey || item?.recurring_series_key || item?.id || "").trim(),
    requestedById: String(item?.requestedById || item?.requested_by_id || item?.ownerUserId || item?.owner_user_id || "").trim(),
    requestedByEmail: String(item?.requestedByEmail || item?.requested_by_email || item?.ownerEmail || item?.owner_email || "").trim(),
    requestedByName: String(item?.requestedByName || item?.requested_by_name || item?.ownerName || item?.owner_name || "").trim(),
    isActive: item?.isActive !== false && item?.is_active !== false,
    frequency: RECURRING_FREQUENCIES[item?.frequency] ? item.frequency : "monthly",
    dayOfMonth: String(getPreferredDay(item?.dayOfMonth || item?.day_of_month)),
    startDate: toDateOnly(item?.startDate || item?.start_date) || toDateOnly(item?.nextOccurrenceDate || item?.next_occurrence_date) || getTodayDateOnly(),
    endDate: toDateOnly(item?.endDate || item?.end_date) || "",
    nextOccurrenceDate: toDateOnly(item?.nextOccurrenceDate || item?.next_occurrence_date) || "",
    totalGenerated: Number.parseInt(String(item?.totalGenerated || item?.total_generated || "0"), 10) || 0,
    attachments: normalizeAttachments(item?.attachments),
  };

  if (!normalized.nextOccurrenceDate) {
    normalized.nextOccurrenceDate = resolveInitialRecurringOccurrence(normalized);
  }

  return normalized;
};

const createPaymentFromRecurringTemplate = (template, occurrenceDate, paymentNumber) => {
  const nowIso = new Date().toISOString();
  const amount = Number.isFinite(Number(template?.amount)) ? Number(template.amount) : parseAmountValue(template?.amount);
  return {
    id: generateId("pay"),
    paymentNumber: paymentNumber || "",
    recordType: RECORD_TYPE_PAYMENT_REQUEST,
    type: RECORD_TYPE_PAYMENT_REQUEST,
    title: template.title || "Регулярний платіж",
    description: template.description || "",
    amount: Number.isFinite(amount) ? amount : 0,
    currency: template.currency || "UAH",
    category: template.category || "",
    articleCode: template.articleCode || "",
    subArticleCode: template.subArticleCode || "",
    urgency: template.urgency || "normal",
    counterparty: template.counterparty || "",
    iban: template.iban || "",
    dueDate: occurrenceDate,
    restaurant: template.restaurant || "",
    expenseRestaurant: template.expenseRestaurant || template.restaurant || "",
    attachmentNote: template.attachmentNote || "",
    attachments: normalizeAttachments(template.attachments),
    payerId: template.payerId || "",
    paidBy: template.paidBy || "",
    status: "approved",
    createdAt: nowIso,
    updatedAt: nowIso,
    requestedById: template.requestedById || template.ownerUserId || "",
    requestedByEmail: template.requestedByEmail || template.ownerEmail || "",
    requestedByName: template.requestedByName || template.ownerName || "Система",
    ownerUserId: template.ownerUserId || template.requestedById || "",
    ownerEmail: template.ownerEmail || template.requestedByEmail || "",
    ownerName: template.ownerName || template.requestedByName || "",
    approvals: [],
    comments: [],
    recurringTemplateId: template.id,
    recurringSeriesKey: template.recurringSeriesKey || template.id,
    recurringOccurrenceDate: occurrenceDate,
    recurringFrequency: template.frequency,
    recurringDayOfMonth: String(template.dayOfMonth || ""),
  };
};

const paymentBelongsToUser = (payment, userId, email, name) => (
  (userId && payment.requestedById === userId) ||
  (email && payment.requestedByEmail === email) ||
  (name && payment.requestedByName === name) ||
  (userId && payment.ownerUserId === userId) ||
  (email && payment.ownerEmail === email) ||
  (name && payment.ownerName === name)
);

const escapeCsvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const downloadCsvFile = (filename, rows) => {
  const csvContent = `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}`;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
};

const isTreasuryTabKey = (value) => {
  const key = String(value || "").toLowerCase();
  return key.includes("kaznachey") || key.includes("treasury") || key.includes("казнач");
};

export default function PaymentRegistryModule({ topTab, restaurants, user, onAuditEvent }) {
  // ─── State ───
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const paymentsLoadedRef = useRef(false);
  const DELETED_TOMBSTONES_STORAGE_KEY = "lucia_payment_deleted_tombstones";
  const deletedPaymentIdsRef = useRef(new Map());

  const LOCAL_DELETE_TOMBSTONE_MS = 24 * 60 * 60 * 1000;
  const LOCAL_KEEP_MISSING_RECORD_MS = 15000;

  const persistDeletedTombstones = useCallback(() => {
    try {
      const payload = Array.from(deletedPaymentIdsRef.current.entries());
      localStorage.setItem(DELETED_TOMBSTONES_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage issues
    }
  }, []);

  const hydrateDeletedTombstones = useCallback(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(DELETED_TOMBSTONES_STORAGE_KEY) || "[]");
      if (!Array.isArray(raw)) return;
      const next = new Map();
      raw.forEach((entry) => {
        if (!Array.isArray(entry) || entry.length < 2) return;
        const id = String(entry[0] || "").trim();
        const ts = Number(entry[1] || 0);
        if (!id || !Number.isFinite(ts)) return;
        next.set(id, ts);
      });
      deletedPaymentIdsRef.current = next;
    } catch {
      deletedPaymentIdsRef.current = new Map();
    }
  }, []);

  const markLocallyDeletedPayments = useCallback((ids) => {
    const now = Date.now();
    const map = deletedPaymentIdsRef.current;
    (Array.isArray(ids) ? ids : [ids]).forEach((id) => {
      const key = String(id || "").trim();
      if (key) map.set(key, now);
    });
    persistDeletedTombstones();
  }, [persistDeletedTombstones]);

  const unmarkLocallyDeletedPayments = useCallback((ids) => {
    const map = deletedPaymentIdsRef.current;
    (Array.isArray(ids) ? ids : [ids]).forEach((id) => {
      const key = String(id || "").trim();
      if (key) map.delete(key);
    });
    persistDeletedTombstones();
  }, []);

  const refreshPaymentsFromApi = useCallback(async ({ withLoader = false } = {}) => {
    if (!isPaymentRequestsApiEnabled()) return;
    if (withLoader) setPaymentsLoading(true);
    try {
      const data = await getPaymentRequestsApi();
      const normalized = Array.isArray(data)
        ? data.map((item) => (isRecurringTemplateRecord(item) ? normalizeRecurringTemplateRecord(item) : normalizePaymentRecord(item)))
        : [];

      const nowTs = Date.now();
      const tombstones = deletedPaymentIdsRef.current;
      for (const [id, deletedAtTs] of tombstones.entries()) {
        if (nowTs - deletedAtTs > LOCAL_DELETE_TOMBSTONE_MS) {
          tombstones.delete(id);
        }
      }
      persistDeletedTombstones();

      const filteredNormalized = normalized.filter((item) => !tombstones.has(String(item?.id || "")));

      setPayments((prev) => {
        const prevById = new Map(prev.map((item) => [String(item.id || ""), item]));
        const nextById = new Map();

        filteredNormalized.forEach((remoteItem) => {
          const id = String(remoteItem.id || "");
          const localItem = prevById.get(id);
          if (!localItem) {
            nextById.set(id, remoteItem);
            return;
          }

          const remoteTs = new Date(remoteItem.updatedAt || remoteItem.createdAt || 0).getTime();
          const localTs = new Date(localItem.updatedAt || localItem.createdAt || 0).getTime();
          nextById.set(id, remoteTs >= localTs ? remoteItem : localItem);
        });

        prev.forEach((localItem) => {
          const id = String(localItem.id || "");
          if (nextById.has(id) || tombstones.has(id)) {
            return;
          }

          const localTs = new Date(localItem.updatedAt || localItem.createdAt || 0).getTime();
          if (Number.isFinite(localTs) && nowTs - localTs <= LOCAL_KEEP_MISSING_RECORD_MS) {
            nextById.set(id, localItem);
          }
        });

        return Array.from(nextById.values()).sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
      });
    } catch (err) {
      console.error("[PaymentRegistry] Failed to load payments:", err);
    } finally {
      if (withLoader) setPaymentsLoading(false);
    }
  }, []);

  // Load payments from DB on mount
  useEffect(() => {
    if (paymentsLoadedRef.current) return;
    if (!isPaymentRequestsApiEnabled()) return;
    paymentsLoadedRef.current = true;
    hydrateDeletedTombstones();
    refreshPaymentsFromApi({ withLoader: true });
  }, [hydrateDeletedTombstones, refreshPaymentsFromApi]);

  // Keep list fresh for other users without page reload
  useEffect(() => {
    if (!isPaymentRequestsApiEnabled()) return;
    const id = setInterval(() => {
      refreshPaymentsFromApi();
    }, 10000);
    const onFocus = () => refreshPaymentsFromApi();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshPaymentsFromApi]);

  const defaultTypicalFields = normalizeTypicalFieldsState({});
  const [typicalFields, setTypicalFields] = useState(defaultTypicalFields);
  const typicalFieldsDbIdRef = useRef(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debtAgingThresholdDays, setDebtAgingThresholdDays] = useState("3");
  const [isDebtDropActive, setIsDebtDropActive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [editingRecurringTemplate, setEditingRecurringTemplate] = useState(null);
  const [processingId, setProcessingId] = useState("");
  const [treasuryDatePreset, setTreasuryDatePreset] = useState("all");
  const [treasuryDateFrom, setTreasuryDateFrom] = useState("");
  const [treasuryDateTo, setTreasuryDateTo] = useState("");
  const [scheduleModal, setScheduleModal] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Counterparties (contractors) state
  const [counterparties, setCounterparties] = useState([]);

  // Payers (our side) state
  const [payers, setPayers] = useState([]);

  // Approval routes state (rules for who approves what)
  const [approvalRoutes, setApprovalRoutes] = useState([]);

  // Load settings from DB on mount
  const settingsLoadedRef = useRef(false);
  useEffect(() => {
    if (settingsLoadedRef.current) return;
    if (!isPaymentSettingsApiEnabled()) {
      // Fallback: load from localStorage
      try { const s = localStorage.getItem("lucia_payment_typical_fields"); if (s) { const p = JSON.parse(s); setTypicalFields(normalizeTypicalFieldsState(p)); } } catch { /* ignore */ }
      try { const s = localStorage.getItem("lucia_payment_counterparties"); if (s) setCounterparties(JSON.parse(s).map(normalizeCounterpartyRecord)); } catch { /* ignore */ }
      try { const s = localStorage.getItem("lucia_payment_payers"); if (s) setPayers(JSON.parse(s)); } catch { /* ignore */ }
      try { const s = localStorage.getItem("lucia_payment_approval_routes"); if (s) setApprovalRoutes(JSON.parse(s)); } catch { /* ignore */ }
      return;
    }
    settingsLoadedRef.current = true;
    Promise.allSettled([getPayersApi(), getCounterpartiesApi(), getApprovalRoutesApi(), getTypicalFieldsApi()])
      .then(([payersRes, cpRes, routesRes, tfRes]) => {
        if (payersRes.status === "fulfilled" && payersRes.value.length) setPayers(payersRes.value);
        if (cpRes.status === "fulfilled" && cpRes.value.length) setCounterparties(cpRes.value.map(normalizeCounterpartyRecord));
        if (routesRes.status === "fulfilled" && routesRes.value.length) setApprovalRoutes(routesRes.value);
        if (tfRes.status === "fulfilled" && tfRes.value.length) {
          const rec = tfRes.value[0];
          typicalFieldsDbIdRef.current = rec.id || null;
          setTypicalFields(normalizeTypicalFieldsState(rec));
        }
      })
      .catch((err) => console.error("[PaymentRegistry] Failed to load settings:", err));
  }, []);

  // Approval modal state
  const [approvalModal, setApprovalModal] = useState(null);
  const [approvalData, setApprovalData] = useState({ comment: "" });
  const [accountantSelections, setAccountantSelections] = useState({});
  const [accountantDetailsPaymentId, setAccountantDetailsPaymentId] = useState("");
  const [chiefPayerChoice, setChiefPayerChoice] = useState("");
  const [chiefArticleChoice, setChiefArticleChoice] = useState("");
  const [chiefSubArticleChoice, setChiefSubArticleChoice] = useState("");
  const debtAgingInputRef = useRef(null);

  // Form state
  const [formData, setFormData] = useState(() => createPaymentFormState("UAH"));
  const [recurringFormData, setRecurringFormData] = useState(() => createRecurringTemplateFormState("UAH"));

  // Typical fields editor state
  const [newCategory, setNewCategory] = useState("");

  const isFinance = isFinanceLikeUser(user);
  const isAdmin = user?.role === "admin";

  const writeAudit = useCallback((payload) => {
    if (typeof onAuditEvent !== "function") return;
    onAuditEvent(payload);
  }, [onAuditEvent]);

  const pushCenterNotification = useCallback((title, body) => {
    try {
      const key = `pnotify_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const payload = {
        key,
        title,
        body,
        createdAt: new Date().toISOString(),
        source: "payments",
      };
      const storageKey = "lucia_center_notifications";
      const current = JSON.parse(localStorage.getItem(storageKey) || "[]");
      const next = [payload, ...current].slice(0, 100);
      localStorage.setItem(storageKey, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("lucia:notifications-updated"));
    } catch {
      // ignore notification write issues
    }
  }, []);

  const getEffectivePaymentDate = useCallback((payment) => {
    return toDateOnly(payment?.scheduledForDate) || toDateOnly(payment?.dueDate) || "";
  }, []);

  // ─── Counterparties CRUD ───
  const saveCounterparties = useCallback((list) => {
    setCounterparties(list.map(normalizeCounterpartyRecord));
  }, []);

  const addCounterparty = useCallback((cp) => {
    const id = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const entry = { id, ...cp, createdAt: now, updatedAt: now };
    saveCounterparties([...counterparties, entry]);
    if (isPaymentSettingsApiEnabled()) addCounterpartyApi(entry).catch((err) => console.error("[PaymentRegistry] addCounterparty:", err));
    return entry;
  }, [counterparties, saveCounterparties]);

  // ─── Payers CRUD ───
  const savePayers = useCallback((list) => {
    setPayers(list);
  }, []);

  const addPayer = useCallback((p) => {
    const id = `pyr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const entry = { id, ...p, createdAt: now, updatedAt: now };
    savePayers([...payers, entry]);
    if (isPaymentSettingsApiEnabled()) addPayerApi(entry).catch((err) => console.error("[PaymentRegistry] addPayer:", err));
    return entry;
  }, [payers, savePayers]);

  const updatePayer = useCallback((id, data) => {
    savePayers(payers.map((p) => p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p));
    if (isPaymentSettingsApiEnabled()) updatePayerApi(id, data).catch((err) => console.error("[PaymentRegistry] updatePayer:", err));
  }, [payers, savePayers]);

  const removePayer = useCallback((id) => {
    savePayers(payers.filter((p) => p.id !== id));
    if (isPaymentSettingsApiEnabled()) deletePayerApi(id).catch((err) => console.error("[PaymentRegistry] removePayer:", err));
  }, [payers, savePayers]);

  // ─── Approval Routes CRUD ───
  const saveApprovalRoutes = useCallback((list) => {
    setApprovalRoutes(list);
  }, []);

  const addApprovalRoute = useCallback((route) => {
    const id = `ar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const entry = { id, ...route, createdAt: new Date().toISOString() };
    saveApprovalRoutes([...approvalRoutes, entry]);
    if (isPaymentSettingsApiEnabled()) addApprovalRouteApi(entry).catch((err) => console.error("[PaymentRegistry] addApprovalRoute:", err));
    return entry;
  }, [approvalRoutes, saveApprovalRoutes]);

  const updateApprovalRoute = useCallback((id, data) => {
    saveApprovalRoutes(approvalRoutes.map((r) => r.id === id ? { ...r, ...data } : r));
    if (isPaymentSettingsApiEnabled()) updateApprovalRouteApi(id, data).catch((err) => console.error("[PaymentRegistry] updateApprovalRoute:", err));
  }, [approvalRoutes, saveApprovalRoutes]);

  const removeApprovalRoute = useCallback((id) => {
    saveApprovalRoutes(approvalRoutes.filter((r) => r.id !== id));
    if (isPaymentSettingsApiEnabled()) deleteApprovalRouteApi(id).catch((err) => console.error("[PaymentRegistry] removeApprovalRoute:", err));
  }, [approvalRoutes, saveApprovalRoutes]);

  const findApproverForPayment = useCallback((payment) => {
    const amount = Number.parseFloat(payment.amount) || 0;
    const category = String(payment.category || "").toLowerCase();
    // Find most specific matching route (category+amount > category > amount > default)
    let bestMatch = null;
    let bestScore = -1;
    for (const route of approvalRoutes) {
      if (!route.approverName && !route.approverEmail) continue;
      let score = 0;
      const routeCategory = String(route.category || "").toLowerCase();
      const routeMinAmount = Number.parseFloat(route.minAmount) || 0;
      const routeMaxAmount = Number.parseFloat(route.maxAmount) || 0;
      // Category match
      if (routeCategory && routeCategory !== "усі" && routeCategory !== "all") {
        if (category !== routeCategory) continue; // no match
        score += 2;
      }
      // Amount range match
      if (routeMinAmount > 0 && amount < routeMinAmount) continue;
      if (routeMaxAmount > 0 && amount > routeMaxAmount) continue;
      if (routeMinAmount > 0 || routeMaxAmount > 0) score += 1;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = route;
      }
    }
    return bestMatch;
  }, [approvalRoutes]);

  const updateCounterparty = useCallback((id, data) => {
    saveCounterparties(counterparties.map((c) => c.id === id ? { ...c, ...data, updatedAt: new Date().toISOString() } : c));
    if (isPaymentSettingsApiEnabled()) updateCounterpartyApi(id, data).catch((err) => console.error("[PaymentRegistry] updateCounterparty:", err));
  }, [counterparties, saveCounterparties]);

  const removeCounterparty = useCallback((id) => {
    saveCounterparties(counterparties.filter((c) => c.id !== id));
    if (isPaymentSettingsApiEnabled()) deleteCounterpartyApi(id).catch((err) => console.error("[PaymentRegistry] removeCounterparty:", err));
  }, [counterparties, saveCounterparties]);

  const myUserId = String(user?.uid || user?.id || user?.userId || "").trim();
  const myName = user?.displayName || user?.fullName || user?.email || "Користувач";
  const myEmail = String(user?.email || "").trim();
  const userRestaurant = useMemo(() => {
    if (user?.role === "admin") return "";
    const key = String(user?.restaurant || user?.restaurantId || user?.restaurant_id || user?.restaurantName || user?.restaurant_name || "").trim();
    if (!key) return "";
    const match = (restaurants || []).find((r) => {
      const n = String(r?.name || "").trim().toLowerCase();
      const i = String(r?.id || "").trim().toLowerCase();
      return n === key.toLowerCase() || i === key.toLowerCase();
    });
    return match ? (match.name || match.id) : key;
  }, [user, restaurants]);

  const paymentRequests = useMemo(
    () => payments.filter((item) => !isRecurringTemplateRecord(item)).map(normalizePaymentRecord),
    [payments]
  );

  const recurringTemplates = useMemo(
    () => payments.filter(isRecurringTemplateRecord).map(normalizeRecurringTemplateRecord),
    [payments]
  );

  const payersById = useMemo(() => {
    const next = new Map();
    payers.forEach((payer) => {
      if (payer?.id) next.set(String(payer.id), payer);
    });
    return next;
  }, [payers]);

  const getPayersForRestaurant = useCallback((restaurantName) => {
    if (!restaurantName) return payers;
    const matched = [];
    const rest = [];
    for (const p of payers) {
      const ids = Array.isArray(p.restaurantIds) ? p.restaurantIds : [];
      if (ids.length === 0 || ids.some((id) => String(id || "").toLowerCase() === String(restaurantName || "").toLowerCase())) {
        matched.push(p);
      } else {
        rest.push(p);
      }
    }
    return [...matched, ...rest];
  }, [payers]);

  const updateStoredRecord = useCallback((recordId, updater) => {
    setPayments((prev) => prev.map((item) => (item.id === recordId ? updater(item) : item)));
  }, []);

  const appendStoredRecord = useCallback((record) => {
    setPayments((prev) => [record, ...prev]);
  }, []);

  const replaceStoredRecords = useCallback((nextRecords) => {
    setPayments((prev) => {
      const existingById = new Map(prev.map((item) => [item.id, item]));
      nextRecords.forEach((item) => {
        existingById.set(item.id, item);
      });
      return Array.from(existingById.values()).sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
    });
  }, []);

  // ─── Filtering ───
  const filteredPayments = useMemo(() => {
    const recurringTemplatesBySeries = new Map(
      recurringTemplates.map((template) => [String(template.recurringSeriesKey || template.id || "").trim(), template])
    );

    const visibleTemplates = recurringTemplates.filter((template) => {
      if (topTab === "mypayments" && !isFinance) {
        return paymentBelongsToUser(template, myUserId, myEmail, myName);
      }
      return true;
    }).map((template) => {
      const templateSeriesKey = String(template.recurringSeriesKey || template.id || "").trim();
      const linkedPayments = paymentRequests
        .filter((payment) => {
          const paymentSeriesKey = String(payment.recurringSeriesKey || payment.recurringTemplateId || "").trim();
          return Boolean(templateSeriesKey) && paymentSeriesKey === templateSeriesKey;
        })
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
      const linkedPayment = linkedPayments[0] || null;
      return {
        ...template,
        linkedPayment,
        registryStatus: linkedPayment?.status || "template",
        registryDate: linkedPayment ? (getEffectivePaymentDate(linkedPayment) || linkedPayment.dueDate || "") : (template.nextOccurrenceDate || ""),
        registryInitiator: linkedPayment?.requestedByName || template.requestedByName || template.ownerName || "-",
      };
    });

    const standalonePayments = paymentRequests.filter((payment) => {
      const paymentSeriesKey = String(payment.recurringSeriesKey || payment.recurringTemplateId || "").trim();
      if (!paymentSeriesKey) return true;
      return !recurringTemplatesBySeries.has(paymentSeriesKey);
    });

    let result = [...standalonePayments, ...visibleTemplates];

    if (topTab === "mypayments" && !isFinance) {
      result = result.filter(
        (p) =>
          (myUserId && p.requestedById === myUserId) ||
          (myEmail && p.requestedByEmail === myEmail) ||
          (myName && p.requestedByName === myName)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((p) => !isRecurringTemplateRecord(p) ? p.status === statusFilter : p.registryStatus === statusFilter);
    }
    if (urgencyFilter !== "all") {
      result = result.filter((p) => p.urgency === urgencyFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((p) =>
        [p.paymentNumber, p.title, p.counterparty, p.category, p.description, p.iban, p.restaurant, p.nextOccurrenceDate, p.frequency]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    result.sort((a, b) => {
      const urgencyOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      const statusOrder = { pending: 0, accounting: 1, approved: 2, scheduled: 3, paused: 4, draft: 5, paid: 6, rejected: 7, cancelled: 8 };
      const ua = urgencyOrder[a.urgency] ?? 4;
      const ub = urgencyOrder[b.urgency] ?? 4;
      if (ua !== ub) return ua - ub;
      const sa = isRecurringTemplateRecord(a) ? (statusOrder[a.registryStatus] ?? 8) : (statusOrder[a.status] ?? 7);
      const sb = isRecurringTemplateRecord(b) ? (statusOrder[b.registryStatus] ?? 8) : (statusOrder[b.status] ?? 7);
      if (sa !== sb) return sa - sb;
      return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
    });

    return result;
  }, [paymentRequests, recurringTemplates, topTab, isFinance, myUserId, myEmail, myName, statusFilter, urgencyFilter, searchQuery]);

  // ─── Stats ───
  const stats = useMemo(() => {
    const pending = paymentRequests.filter((p) => p.status === "pending").length;
    const approved = paymentRequests.filter((p) => p.status === "approved" || p.status === "scheduled").length;
    const totalPending = paymentRequests
      .filter((p) => p.status === "pending")
      .reduce((sum, p) => sum + (Number.parseFloat(p.amount) || 0), 0);
    const totalApproved = paymentRequests
      .filter((p) => p.status === "approved" || p.status === "scheduled")
      .reduce((sum, p) => sum + (Number.parseFloat(p.amount) || 0), 0);
    return { pending, approved, totalPending, totalApproved };
  }, [paymentRequests]);

  // ─── Form Handlers ───
  const resetForm = () => {
    const base = createPaymentFormState(typicalFields.defaultCurrency || "UAH");
    setFormData({ ...base, restaurant: userRestaurant, expenseRestaurant: userRestaurant });
    setEditingPayment(null);
    setShowForm(false);
  };

  const resetRecurringForm = () => {
    const base = createRecurringTemplateFormState(typicalFields.defaultCurrency || "UAH");
    setRecurringFormData({ ...base, restaurant: userRestaurant, expenseRestaurant: userRestaurant });
    setEditingRecurringTemplate(null);
    setShowRecurringForm(false);
  };

  const openNewForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (payment) => {
    setFormData({
      title: payment.title || "",
      description: payment.description || "",
      paymentPurpose: payment.paymentPurpose || "",
      amount: String(payment.amount || ""),
      currency: payment.currency || "UAH",
      category: payment.category || "",
      articleCode: payment.articleCode || "",
      subArticleCode: payment.subArticleCode || "",
      urgency: payment.urgency || "normal",
      counterparty: payment.counterparty || "",
      iban: payment.iban || "",
      dueDate: payment.dueDate || "",
      restaurant: payment.restaurant || "",
      expenseRestaurant: payment.expenseRestaurant || payment.restaurant || "",
      attachmentNote: payment.attachmentNote || "",
      attachments: Array.isArray(payment.attachments) ? payment.attachments : [],
      payerId: payment.payerId || "",
      paidBy: payment.paidBy || "",
      isRecurring: false,
      frequency: "monthly",
      dayOfMonth: "10",
      startDate: "",
      endDate: "",
      noEndDate: true,
    });
    setEditingPayment(payment);
    setShowForm(true);
  };

  const openNewRecurringForm = () => {
    resetRecurringForm();
    setShowRecurringForm(true);
  };

  const openEditRecurringForm = (template) => {
    setRecurringFormData({
      title: template.title || "",
      description: template.description || "",
      amount: String(template.amount || ""),
      currency: template.currency || typicalFields.defaultCurrency || "UAH",
      category: template.category || "",
      articleCode: template.articleCode || "",
      subArticleCode: template.subArticleCode || "",
      urgency: template.urgency || "normal",
      counterparty: template.counterparty || "",
      iban: template.iban || "",
      restaurant: template.restaurant || "",
      expenseRestaurant: template.expenseRestaurant || template.restaurant || "",
      attachmentNote: template.attachmentNote || "",
      attachments: normalizeAttachments(template.attachments),
      payerId: template.payerId || "",
      paidBy: template.paidBy || "",
      startDate: template.startDate || getTodayDateOnly(),
      endDate: template.endDate || "",
      noEndDate: !template.endDate,
      frequency: template.frequency || "monthly",
      dayOfMonth: String(template.dayOfMonth || "10"),
    });
    setEditingRecurringTemplate(template);
    setShowRecurringForm(true);
  };

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const addPaymentAttachments = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const oversized = files.filter((file) => file.size > MAX_ATTACHMENT_SIZE_BYTES);
    if (oversized.length > 0) {
      alert(`Деякі файли перевищують 10 МБ і не будуть додані: ${oversized.map((f) => f.name).join(", ")}`);
    }

    const accepted = files.filter((file) => file.size <= MAX_ATTACHMENT_SIZE_BYTES);
    if (accepted.length === 0) return;

    try {
      const prepared = await Promise.all(accepted.map(async (file) => ({
        id: generateId("att"),
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: await readFileAsDataUrl(file),
        createdAt: new Date().toISOString(),
      })));

      setFormData((prev) => ({
        ...prev,
        attachments: [...normalizeAttachments(prev.attachments), ...prepared].slice(0, 12),
      }));
    } catch (err) {
      console.error("[PaymentRegistry] Failed to process attachments:", err);
      alert("Не вдалося додати вкладення.");
    }
  };

  const removePaymentAttachment = (attachmentId) => {
    setFormData((prev) => ({
      ...prev,
      attachments: normalizeAttachments(prev.attachments).filter((item) => item.id !== attachmentId),
    }));
  };

  const handleRecurringFormChange = (field, value) => {
    setRecurringFormData((prev) => ({ ...prev, [field]: value }));
  };

  const submitPayment = (asDraft = false) => {
    if (!formData.title.trim()) {
      alert("Вкажіть мету платежу.");
      return;
    }
    const amount = Number.parseFloat(String(formData.amount || "0").replace(/\s+/g, "").replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Вкажіть коректну суму платежу.");
      return;
    }

    const vatSuffix = buildVatTitleTail(amount, formData.vatMode, formData.vatRate);
    const paymentPurposeBase = (formData.paymentPurpose || "").replace(/,\s*(без ПДВ|в т\.ч\. ПДВ\s*\d+(\.\d+)?%(\s*-\s*[\d\s]+[,.]?\d*\s*грн)?)(\s*\/\/.*)?$/g, "").replace(/\s*\/\/.*$/, "").trim();
    const codeSuffix = [formData.articleCode, formData.subArticleCode].filter(Boolean).join("//");
    const paymentPurposeWithVat = (paymentPurposeBase ? `${paymentPurposeBase}${vatSuffix}` : "") + (codeSuffix ? ` //${codeSuffix}` : "");
    const normalizedTitle = (formData.title || "").trim();

    // If recurring toggle is on — create a recurring template instead
    if (formData.isRecurring && !editingPayment) {
      if (!toDateOnly(formData.startDate)) {
        alert("Вкажіть дату старту регулярного платежу.");
        return;
      }
      const nowIso = new Date().toISOString();
      const normalizedTemplate = normalizeRecurringTemplateRecord({
        ...formData,
        title: normalizedTitle,
        paymentPurpose: paymentPurposeWithVat,
        amount,
        id: generateId("rec"),
        recurringSeriesKey: generateRecurringSeriesKey(),
        recordType: RECORD_TYPE_RECURRING_TEMPLATE,
        type: RECORD_TYPE_RECURRING_TEMPLATE,
        requestedById: myUserId,
        requestedByEmail: myEmail,
        requestedByName: myName,
        ownerUserId: myUserId,
        ownerEmail: myEmail,
        ownerName: myName,
        createdAt: nowIso,
        updatedAt: nowIso,
        isActive: true,
      });

      appendStoredRecord(normalizedTemplate);
      addPaymentRequestApi(normalizedTemplate).catch((err) =>
        console.error("[PaymentRegistry] Failed to create recurring template:", err)
      );
      writeAudit({
        action: "payment_recurring_template_create",
        entityType: "payment_recurring_template",
        entityId: normalizedTemplate.id,
        description: `Створено регулярний платіж "${normalizedTemplate.title}" (${formatMoney(amount)} ${formData.currency}, ${RECURRING_FREQUENCIES[formData.frequency] || formData.frequency})`,
      });
      resetForm();
      return;
    }


    const nowIso = new Date().toISOString();
    const status = asDraft ? "draft" : "pending";

    if (editingPayment) {
      const updatedData = {
        ...editingPayment,
        ...formData,
        title: normalizedTitle,
        paymentPurpose: paymentPurposeWithVat,
        recordType: RECORD_TYPE_PAYMENT_REQUEST,
        type: RECORD_TYPE_PAYMENT_REQUEST,
        ownerUserId: editingPayment.ownerUserId || editingPayment.requestedById || myUserId,
        ownerEmail: editingPayment.ownerEmail || editingPayment.requestedByEmail || myEmail,
        ownerName: editingPayment.ownerName || editingPayment.requestedByName || myName,
        amount,
        status: editingPayment.status === "draft" ? status : editingPayment.status,
        updatedAt: nowIso,
        updatedById: myUserId,
        updatedByName: myName,
      };
      updateStoredRecord(editingPayment.id, () => updatedData);
      updatePaymentRequestApi(editingPayment.id, updatedData).catch((err) =>
        console.error("[PaymentRegistry] Failed to update payment:", err)
      );
      writeAudit({
        action: "payment_request_update",
        entityType: "payment_request",
        entityId: editingPayment.id,
        description: `Оновлено заявку на платіж "${formData.title.trim()}" (${formatMoney(amount)} ${formData.currency})`,
      });
    } else {
      const paymentNumber = generatePaymentNumber(formData.restaurant || formData.expenseRestaurant, restaurants, paymentRequests);
      const newPayment = {
        id: generateId(),
        paymentNumber,
        recordType: RECORD_TYPE_PAYMENT_REQUEST,
        type: RECORD_TYPE_PAYMENT_REQUEST,
        ...formData,
        title: normalizedTitle,
        paymentPurpose: paymentPurposeWithVat,
        amount,
        status,
        createdAt: nowIso,
        updatedAt: nowIso,
        requestedById: myUserId,
        requestedByEmail: myEmail,
        requestedByName: myName,
        ownerUserId: myUserId,
        ownerEmail: myEmail,
        ownerName: myName,
        approvals: [],
        comments: [],
      };
      appendStoredRecord(newPayment);
      addPaymentRequestApi({ ...newPayment }).catch((err) =>
        console.error("[PaymentRegistry] Failed to save payment:", err)
      );
      if (status === "pending") {
        pushCenterNotification(
          "Нова заявка на погодження",
          `${newPayment.title} · ${formatMoney(amount)} ${newPayment.currency}`
        );
      }
      writeAudit({
        action: "payment_request_create",
        entityType: "payment_request",
        entityId: newPayment.id,
        description: `Створено заявку на платіж "${formData.title.trim()}" (${formatMoney(amount)} ${formData.currency})`,
      });
    }

    resetForm();
  };

  const submitRecurringTemplate = () => {
    if (!recurringFormData.title.trim()) {
      alert("Вкажіть назву регулярного платежу.");
      return;
    }
    const amount = parseAmountValue(recurringFormData.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Вкажіть коректну суму регулярного платежу.");
      return;
    }
    if (!toDateOnly(recurringFormData.startDate)) {
      alert("Вкажіть дату старту регулярного платежу.");
      return;
    }

    const nowIso = new Date().toISOString();
    const normalizedTemplate = normalizeRecurringTemplateRecord({
      ...(editingRecurringTemplate || {}),
      ...recurringFormData,
      amount,
      id: editingRecurringTemplate?.id || generateId("rec"),
      recordType: RECORD_TYPE_RECURRING_TEMPLATE,
      type: RECORD_TYPE_RECURRING_TEMPLATE,
      requestedById: editingRecurringTemplate?.requestedById || myUserId,
      requestedByEmail: editingRecurringTemplate?.requestedByEmail || myEmail,
      requestedByName: editingRecurringTemplate?.requestedByName || myName,
      ownerUserId: editingRecurringTemplate?.ownerUserId || myUserId,
      ownerEmail: editingRecurringTemplate?.ownerEmail || myEmail,
      ownerName: editingRecurringTemplate?.ownerName || myName,
      recurringSeriesKey: editingRecurringTemplate?.recurringSeriesKey || generateRecurringSeriesKey(),
      createdAt: editingRecurringTemplate?.createdAt || nowIso,
      updatedAt: nowIso,
      isActive: editingRecurringTemplate?.isActive ?? true,
      nextOccurrenceDate: editingRecurringTemplate?.nextOccurrenceDate || undefined,
    });

    if (editingRecurringTemplate) {
      updateStoredRecord(editingRecurringTemplate.id, () => normalizedTemplate);
      updatePaymentRequestApi(editingRecurringTemplate.id, normalizedTemplate).catch((err) =>
        console.error("[PaymentRegistry] Failed to update recurring template:", err)
      );
      writeAudit({
        action: "payment_recurring_template_update",
        entityType: "payment_recurring_template",
        entityId: normalizedTemplate.id,
        description: `Оновлено регулярний платіж "${normalizedTemplate.title}"`,
      });
    } else {
      appendStoredRecord(normalizedTemplate);
      addPaymentRequestApi(normalizedTemplate).catch((err) =>
        console.error("[PaymentRegistry] Failed to create recurring template:", err)
      );
      writeAudit({
        action: "payment_recurring_template_create",
        entityType: "payment_recurring_template",
        entityId: normalizedTemplate.id,
        description: `Створено регулярний платіж "${normalizedTemplate.title}"`,
      });
    }

    resetRecurringForm();
  };

  const toggleRecurringTemplateActive = (template) => {
    const nowIso = new Date().toISOString();
    const updatedTemplate = {
      ...template,
      isActive: !template.isActive,
      nextOccurrenceDate: !template.isActive
        ? toDateOnly(template.nextOccurrenceDate) || resolveInitialRecurringOccurrence(template)
        : template.nextOccurrenceDate,
      updatedAt: nowIso,
    };
    updateStoredRecord(template.id, () => updatedTemplate);
    updatePaymentRequestApi(template.id, updatedTemplate).catch((err) =>
      console.error("[PaymentRegistry] Failed to toggle recurring template:", err)
    );
  };

  const runRecurringTemplateNow = (template) => {
    const occurrenceDate = toDateOnly(template.nextOccurrenceDate) || resolveInitialRecurringOccurrence(template);
    if (!occurrenceDate) return;
    const recurringSeriesKey = String(template.recurringSeriesKey || template.id || "").trim();
    const hasOpenRecurringPayment = paymentRequests.some((payment) => {
      const paymentSeriesKey = String(payment.recurringSeriesKey || payment.recurringTemplateId || "").trim();
      return Boolean(recurringSeriesKey) && paymentSeriesKey === recurringSeriesKey && !["paid", "rejected", "cancelled"].includes(payment.status);
    });
    if (hasOpenRecurringPayment) {
      alert("За цим регулярним шаблоном вже є активний або призупинений платіж. Спочатку завершіть, оплатіть або скасуйте його.");
      return;
    }
    const existingPayment = paymentRequests.find(
      (payment) => {
        const paymentSeriesKey = String(payment.recurringSeriesKey || payment.recurringTemplateId || "").trim();
        return paymentSeriesKey === recurringSeriesKey && payment.recurringOccurrenceDate === occurrenceDate;
      }
    );
    if (existingPayment) {
      alert("Платіж на найближчу дату вже створений.");
      return;
    }
    const pNum = generatePaymentNumber(template.restaurant || template.expenseRestaurant, restaurants, paymentRequests);
    const payment = createPaymentFromRecurringTemplate(template, occurrenceDate, pNum);
    const updatedTemplate = {
      ...template,
      nextOccurrenceDate: getNextRecurringOccurrence(template, occurrenceDate),
      totalGenerated: (Number(template.totalGenerated) || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    replaceStoredRecords([payment, updatedTemplate]);
    addPaymentRequestApi(payment).catch((err) => console.error("[PaymentRegistry] Failed to create manual recurring payment:", err));
    updatePaymentRequestApi(template.id, updatedTemplate).catch((err) => console.error("[PaymentRegistry] Failed to advance recurring template:", err));
  };

  const canCreateFromRecurringTemplate = (template) => {
    const recurringSeriesKey = String(template?.recurringSeriesKey || template?.id || "").trim();
    if (!recurringSeriesKey) return true;
    return !paymentRequests.some((payment) => {
      const paymentSeriesKey = String(payment.recurringSeriesKey || payment.recurringTemplateId || "").trim();
      return paymentSeriesKey === recurringSeriesKey && !["paid", "rejected", "cancelled"].includes(payment.status);
    });
  };

  const removeRecurringTemplate = async (template) => {
    const recurringSeriesKey = String(template?.recurringSeriesKey || template?.id || "").trim();
    const linkedOpenPayments = payments.filter((item) => {
      if (isRecurringTemplateRecord(item)) return false;
      const paymentSeriesKey = String(item?.recurringSeriesKey || item?.recurringTemplateId || "").trim();
      return Boolean(recurringSeriesKey) && paymentSeriesKey === recurringSeriesKey && item.status !== "paid";
    });

    const confirmText = linkedOpenPayments.length
      ? `Видалити регулярний платіж "${template.title}" разом з ${linkedOpenPayments.length} пов'язаними незавершеними платежами?`
      : `Видалити регулярний платіж "${template.title}"?`;
    if (!window.confirm(confirmText)) return;

    const removableIds = new Set([template.id, ...linkedOpenPayments.map((item) => item.id)]);
    markLocallyDeletedPayments(Array.from(removableIds));
    setPayments((prev) => prev.filter((item) => !removableIds.has(item.id)));
    const deleteResults = await Promise.allSettled([
      deletePaymentRequestApi(template.id),
      ...linkedOpenPayments.map((payment) => deletePaymentRequestApi(payment.id)),
    ]);

    const failedIds = [template.id, ...linkedOpenPayments.map((item) => item.id)].filter((_, idx) => deleteResults[idx]?.status === "rejected");

    if (failedIds.length > 0) {
      console.error("[PaymentRegistry] Failed to delete some recurring records", deleteResults);
      unmarkLocallyDeletedPayments(failedIds);
      setPayments((prev) => {
        const restoreById = new Map([
          [template.id, template],
          ...linkedOpenPayments.map((item) => [item.id, item]),
        ]);
        const next = [...prev];
        failedIds.forEach((id) => {
          const item = restoreById.get(id);
          if (!item) return;
          if (!next.some((entry) => entry.id === id)) next.unshift(item);
        });
        return next.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
      });
      alert("Не вдалося видалити всі пов'язані записи. Перевірте підключення до БД.");
    }

    refreshPaymentsFromApi();

    writeAudit({
      action: "payment_recurring_template_delete",
      entityType: "payment_recurring_template",
      entityId: template.id,
      description: linkedOpenPayments.length
        ? `Видалено регулярний платіж "${template.title}" разом з ${linkedOpenPayments.length} незавершеними платежами`
        : `Видалено регулярний платіж "${template.title}"`,
    });
  };

  const deletePayment = async (payment) => {
    if (!paymentBelongsToUser(payment, myUserId, myEmail, myName)) {
      alert("Видаляти заявку може лише її ініціатор.");
      return;
    }
    if (!window.confirm(`Видалити заявку "${payment.title}" (${formatMoney(payment.amount)} ${payment.currency})? Цю дію неможливо скасувати.`)) return;
    markLocallyDeletedPayments([payment.id]);
    setPayments((prev) => prev.filter((item) => item.id !== payment.id));
    try {
      await deletePaymentRequestApi(payment.id);
    } catch (err) {
      console.error("[PaymentRegistry] Failed to delete payment:", err);
      unmarkLocallyDeletedPayments([payment.id]);
      setPayments((prev) => {
        if (prev.some((item) => item.id === payment.id)) return prev;
        return [payment, ...prev].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
      });
      alert("Не вдалося видалити платіж у БД. Заявку відновлено.");
      return;
    }

    refreshPaymentsFromApi();
    writeAudit({
      action: "payment_request_delete",
      entityType: "payment_request",
      entityId: payment.id,
      description: `Ініціатор видалив заявку "${payment.title}" (${formatMoney(payment.amount)} ${payment.currency})`,
    });
  };

  const launchPayment = (payment) => {
    if (processingId) return;
    if (payment.status !== "draft") return;
    setProcessingId(payment.id);
    const nowIso = new Date().toISOString();
    const updatedData = {
      ...payment,
      status: "approved",
      updatedAt: nowIso,
      approvals: [
        ...(payment.approvals || []),
        { action: "approved", at: nowIso, byId: myUserId, byName: myName, comment: "Запущено вручну" },
      ],
    };
    updateStoredRecord(payment.id, () => updatedData);
    updatePaymentRequestApi(payment.id, updatedData).catch((err) =>
      console.error("[PaymentRegistry] Failed to launch payment:", err)
    );
    writeAudit({
      action: "payment_request_launch",
      entityType: "payment_request",
      entityId: payment.id,
      description: `Запущено заявку "${payment.title}" (${formatMoney(payment.amount)} ${payment.currency})`,
    });
    setProcessingId("");
  };

  const bulkLaunchSelected = () => {
    if (selectedIds.size === 0) return;
    const drafts = paymentRequests.filter((p) => selectedIds.has(p.id) && p.status === "draft");
    if (drafts.length === 0) { alert("Серед виділених немає чернеток для запуску."); return; }
    if (!confirm(`Запустити ${drafts.length} заявок на оплату?`)) return;
    const nowIso = new Date().toISOString();
    drafts.forEach((payment) => {
      const updatedData = {
        ...payment,
        status: "approved",
        updatedAt: nowIso,
        approvals: [
          ...(payment.approvals || []),
          { action: "approved", at: nowIso, byId: myUserId, byName: myName, comment: "Масовий запуск" },
        ],
      };
      updateStoredRecord(payment.id, () => updatedData);
      updatePaymentRequestApi(payment.id, updatedData).catch((err) =>
        console.error("[PaymentRegistry] Failed to launch payment:", err)
      );
    });
    writeAudit({
      action: "payment_request_bulk_launch",
      entityType: "payment_request",
      entityId: "",
      description: `Масово запущено ${drafts.length} заявок`,
    });
    setSelectedIds(new Set());
  };

  const bulkDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const selectedPayments = paymentRequests.filter((p) => selectedIds.has(p.id));
    const toDelete = selectedPayments.filter((p) => !isRecurringTemplateRecord(p) && paymentBelongsToUser(p, myUserId, myEmail, myName));
    const skipped = selectedPayments.length - toDelete.length;
    if (toDelete.length === 0) return;
    if (!confirm(`Видалити ${toDelete.length} заявок? Цю дію неможливо скасувати.${skipped > 0 ? `\n${skipped} заявок пропущено: видаляти може лише ініціатор.` : ""}`)) return;
    markLocallyDeletedPayments(toDelete.map((payment) => payment.id));
    const toDeleteIds = new Set(toDelete.map((payment) => payment.id));
    setPayments((prev) => prev.filter((item) => !toDeleteIds.has(item.id)));
    const results = await Promise.allSettled(toDelete.map((payment) => deletePaymentRequestApi(payment.id)));
    const failedIds = toDelete.filter((_, idx) => results[idx]?.status === "rejected").map((item) => item.id);

    if (failedIds.length > 0) {
      console.error("[PaymentRegistry] Failed to delete some payments:", results);
      unmarkLocallyDeletedPayments(failedIds);
      setPayments((prev) => {
        const restoreById = new Map(toDelete.map((item) => [item.id, item]));
        const next = [...prev];
        failedIds.forEach((id) => {
          const item = restoreById.get(id);
          if (!item) return;
          if (!next.some((entry) => entry.id === id)) next.unshift(item);
        });
        return next.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
      });
      alert(`Не вдалося видалити ${failedIds.length} заявок у БД. Вони відновлені.`);
    }

    refreshPaymentsFromApi();
    writeAudit({
      action: "payment_request_bulk_delete",
      entityType: "payment_request",
      entityId: "",
      description: `Масово видалено ${toDelete.length} заявок`,
    });
    setSelectedIds(new Set());
  };

  const toggleSelectPayment = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredPayments.filter((p) => !isRecurringTemplateRecord(p)).map((p) => p.id);
    setSelectedIds((prev) => {
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(visibleIds);
    });
  };

  // ─── Actions ───
  const openApprovalModal = (payment) => {
    setApprovalData({ comment: "" });
    setApprovalModal(payment);
  };

  const confirmApproval = () => {
    const payment = approvalModal;
    if (!payment) return;
    setProcessingId(payment.id);
    const hasPayerDetails = Boolean(
      String(payment.payerId || "").trim() ||
      String(payment.paidBy || "").trim()
    );
    const nowIso = new Date().toISOString();
    const updatedData = {
      ...payment,
      status: "accounting",
      accountingStage: hasPayerDetails ? "article" : "chief",
      approvalComment: approvalData.comment.trim(),
      updatedAt: nowIso,
      approvals: [
        ...(payment.approvals || []),
        {
          action: "approved",
          at: nowIso,
          byId: myUserId,
          byName: myName,
          comment: hasPayerDetails
            ? `${approvalData.comment.trim()} ${approvalData.comment.trim() ? "| " : ""}Пропущено етап головбуха: платника вже обрано.`
            : approvalData.comment.trim(),
        },
      ],
    };
    updateStoredRecord(payment.id, () => updatedData);
    updatePaymentRequestApi(payment.id, updatedData).catch((err) =>
      console.error("[PaymentRegistry] Failed to update payment:", err)
    );
    writeAudit({
      action: "payment_request_approve",
      entityType: "payment_request",
      entityId: payment.id,
      description: `Погоджено платіж "${payment.title}" (${formatMoney(payment.amount)} ${payment.currency}) і передано бухгалтеру`,
    });
    pushCenterNotification(
      "Платіж передано бухгалтеру",
      `${payment.title} · ${formatMoney(payment.amount)} ${payment.currency}`
    );
    setProcessingId("");
    setApprovalModal(null);
  };

  const rejectPayment = (payment) => {
    if (processingId) return;
    const reason = window.prompt("Причина відхилення:");
    if (reason === null) return;
    setProcessingId(payment.id);
    const nowIso = new Date().toISOString();
    const updatedData = {
      ...payment,
      status: "rejected",
      updatedAt: nowIso,
      rejectionReason: reason,
      approvals: [
        ...(payment.approvals || []),
        { action: "rejected", at: nowIso, byId: myUserId, byName: myName, reason },
      ],
    };
    updateStoredRecord(payment.id, () => updatedData);
    updatePaymentRequestApi(payment.id, updatedData).catch((err) =>
      console.error("[PaymentRegistry] Failed to update payment:", err)
    );
    writeAudit({
      action: "payment_request_reject",
      entityType: "payment_request",
      entityId: payment.id,
      description: `Відхилено платіж "${payment.title}" — ${reason || "без причини"}`,
    });
    setProcessingId("");
  };

  const togglePaymentPaused = (payment) => {
    if (processingId) return;
    setProcessingId(payment.id);
    const nowIso = new Date().toISOString();
    const isPausing = payment.status !== "paused";
    const newStatus = isPausing ? "paused" : (payment.statusBeforePause || "approved");
    const updatedData = {
      ...payment,
      status: newStatus,
      updatedAt: nowIso,
      ...(isPausing ? { statusBeforePause: payment.status } : { statusBeforePause: null }),
    };
    updateStoredRecord(payment.id, () => updatedData);
    updatePaymentRequestApi(payment.id, updatedData).catch((err) =>
      console.error("[PaymentRegistry] Failed to toggle payment pause:", err)
    );
    writeAudit({
      action: isPausing ? "payment_pause" : "payment_resume",
      entityType: "payment_request",
      entityId: payment.id,
      description: `${isPausing ? "Призупинено" : "Відновлено"} платіж "${payment.title}" (${formatMoney(payment.amount)} ${payment.currency})`,
    });
    setProcessingId("");
  };

  const schedulePayment = (payment, scheduledForDate) => {
    if (processingId) return;
    const plannedDate = toDateOnly(scheduledForDate) || getEffectivePaymentDate(payment) || getTodayDateOnly();
    if (!plannedDate) {
      alert("Оберіть дату планування платежу.");
      return;
    }
    setProcessingId(payment.id);
    const nowIso = new Date().toISOString();
    const updatedData = { ...payment, status: "scheduled", updatedAt: nowIso, scheduledAt: nowIso, scheduledByName: myName, scheduledForDate: plannedDate };
    updateStoredRecord(payment.id, () => updatedData);
    updatePaymentRequestApi(payment.id, updatedData).catch((err) =>
      console.error("[PaymentRegistry] Failed to update payment:", err)
    );
    writeAudit({
      action: "payment_schedule",
      entityType: "payment_request",
      entityId: payment.id,
      description: `Заплановано до оплати "${payment.title}" на ${formatDate(plannedDate)}`,
    });
    setProcessingId("");
  };

  const openScheduleModal = (payment) => {
    setScheduleModal({
      payment,
      date: toDateOnly(payment?.scheduledForDate) || toDateOnly(payment?.dueDate) || getTodayDateOnly(),
    });
  };

  const confirmSchedulePayment = () => {
    if (!scheduleModal?.payment) return;
    schedulePayment(scheduleModal.payment, scheduleModal.date);
    setScheduleModal(null);
  };

  const markPaid = (payment) => {
    if (processingId) return;
    setProcessingId(payment.id);
    const nowIso = new Date().toISOString();
    const updatedData = { ...payment, status: "paid", updatedAt: nowIso, paidAt: nowIso, paidByName: myName };
    updateStoredRecord(payment.id, () => updatedData);
    updatePaymentRequestApi(payment.id, updatedData).catch((err) =>
      console.error("[PaymentRegistry] Failed to update payment:", err)
    );
    writeAudit({
      action: "payment_mark_paid",
      entityType: "payment_request",
      entityId: payment.id,
      description: `Позначено як оплачено "${payment.title}" (${formatMoney(payment.amount)} ${payment.currency})`,
    });
    setProcessingId("");
  };

  const cancelPayment = (payment) => {
    if (!window.confirm(`Скасувати заявку "${payment.title}"?`)) return;
    const nowIso = new Date().toISOString();
    const updatedData = { ...payment, status: "cancelled", updatedAt: nowIso, cancelledByName: myName };
    updateStoredRecord(payment.id, () => updatedData);
    updatePaymentRequestApi(payment.id, updatedData).catch((err) =>
      console.error("[PaymentRegistry] Failed to update payment:", err)
    );
    writeAudit({
      action: "payment_cancel",
      entityType: "payment_request",
      entityId: payment.id,
      description: `Скасовано заявку "${payment.title}"`,
    });
  };

  // ─── Typical Fields ───
  const saveTypicalFields = (updated) => {
    setTypicalFields(updated);
    if (isPaymentSettingsApiEnabled()) {
      saveTypicalFieldsApi(typicalFieldsDbIdRef.current, updated)
        .then((newId) => { if (newId && !typicalFieldsDbIdRef.current) typicalFieldsDbIdRef.current = newId; })
        .catch((err) => console.error("[PaymentRegistry] saveTypicalFields:", err));
    }
  };

  const addCategory = () => {
    const cat = newCategory.trim();
    if (!cat) return;
    if (typicalFields.categories.includes(cat)) {
      alert("Така категорія вже існує.");
      return;
    }
    saveTypicalFields({ ...typicalFields, categories: [...typicalFields.categories, cat] });
    setNewCategory("");
  };

  const removeCategory = (cat) => {
    saveTypicalFields({ ...typicalFields, categories: typicalFields.categories.filter((c) => c !== cat) });
  };

  // ─── Імпорт файлу старіння заборгованості з 1С ───
  const importDebtAgingFromFile = (file) => {
    if (!file) return;
    const thresholdDays = Math.max(0, Number.parseInt(String(debtAgingThresholdDays || "3"), 10) || 3);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const ws = workbook.Sheets[workbook.SheetNames[0]];
        const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        const nowIso = new Date().toISOString();
        const today = nowIso.slice(0, 10);
        let imported = 0;
        let skippedByTerm = 0;
        let skippedInvalid = 0;
        const newPayments = [];

        for (let i = 0; i < allRows.length; i++) {
          const row = allRows[i];
          if (!row || row.every((cell) => cell === "" || cell === null || cell === undefined)) continue;

          const restaurantAccountNumber = String(row[0] || "").trim();
          const counterparty = String(row[1] || "").trim();
          const counterpartyEdrpou = normalizeCompanyCode(row[2]);
          const contractInfo = String(row[5] || "").trim();
          const payerName = String(row[7] || "").trim();
          const payerEdrpou = normalizeCompanyCode(row[8]);
          const debtDueDate = parseExcelDateOnly(row[12]);
          const contractDueDate = parseExcelDateOnly(row[13]);
          const debtAmount = parseAmountValue(row[14]);
          if (!counterparty || !Number.isFinite(debtAmount) || debtAmount <= 0) continue;

          const daysRemaining = getDayDiff(debtDueDate, contractDueDate);
          if (daysRemaining === null) {
            skippedInvalid++;
            continue;
          }
          if (daysRemaining >= thresholdDays) {
            skippedByTerm++;
            continue;
          }

          const matchedCounterparty = counterparties.find((c) => {
            const dbCode = normalizeCompanyCode(c.edrpou || c.code);
            return (counterpartyEdrpou && dbCode === counterpartyEdrpou)
              || c.name?.toLowerCase() === counterparty.toLowerCase();
          });
          const matchedPayer = payers.find((payer) => {
            const dbCode = normalizeCompanyCode(payer?.edrpou);
            return (payerEdrpou && dbCode === payerEdrpou)
              || payer?.name?.toLowerCase() === payerName.toLowerCase();
          });
          const payerRestaurant = Array.isArray(matchedPayer?.restaurantIds) && matchedPayer.restaurantIds.length > 0
            ? matchedPayer.restaurantIds[0]
            : "";

          const urgency = daysRemaining < 0 ? "critical" : daysRemaining === 0 ? "high" : "normal";

          const titleBase = `Оплата за товар згідно договору ${contractInfo || ""}`.trim();
          const vatTail = buildVatTitleTail(debtAmount, matchedCounterparty?.vatMode, matchedCounterparty?.vatRate);
          const codeSuffix = ["203", ""].filter(Boolean).join("//");
          const title = codeSuffix ? `${titleBase}${vatTail} //${codeSuffix}` : `${titleBase}${vatTail}`;
          const description = [
            restaurantAccountNumber ? `Обліковий номер ресторану: ${restaurantAccountNumber}` : "",
            counterpartyEdrpou ? `ЄДРПОУ контрагента: ${counterpartyEdrpou}` : "",
            payerName ? `Платник: ${payerName}` : "",
            payerEdrpou ? `ЄДРПОУ платника: ${payerEdrpou}` : "",
            contractInfo ? `Дані договору: ${contractInfo}` : "",
            debtDueDate ? `Дата строку боргу: ${formatDate(debtDueDate)}` : "",
            contractDueDate ? `Дата строку договору: ${formatDate(contractDueDate)}` : "",
            `Різниця між строком договору та боргу: ${daysRemaining} дн.`,
          ].filter(Boolean).join("\n");

          const paymentNumber = generatePaymentNumber(payerRestaurant, restaurants, [...paymentRequests, ...newPayments]);

          const payment = {
            id: generateId("debt"),
            paymentNumber,
            recordType: RECORD_TYPE_PAYMENT_REQUEST,
            type: RECORD_TYPE_PAYMENT_REQUEST,
            title,
            description,
            amount: Math.round(debtAmount * 100) / 100,
            currency: "UAH",
            counterparty: matchedCounterparty?.name || counterparty,
            iban: matchedCounterparty?.iban || "",
            edrpou: counterpartyEdrpou,
            category: "203 Постачальники продуктів",
            articleCode: "203",
            urgency,
            vatMode: matchedCounterparty?.vatMode || "none",
            vatRate: matchedCounterparty?.vatRate || "",
            restaurant: payerRestaurant || payerName || "",
            expenseRestaurant: payerRestaurant || payerName || "",
            payerId: matchedPayer?.id || "",
            paidBy: matchedPayer?.name || payerName || "",
            dueDate: today,
            status: "draft",
            createdAt: nowIso,
            updatedAt: nowIso,
            requestedById: myUserId,
            requestedByEmail: myEmail,
            requestedByName: myName,
            ownerUserId: myUserId,
            ownerEmail: myEmail,
            ownerName: myName,
            approvals: [],
            comments: [],
            importedFrom: "1c_debt_aging",
            importedAt: nowIso,
          };

          newPayments.push(payment);
          imported++;
        }

        if (imported === 0) {
          alert(`У файлі не знайдено заборгованостей, що потребують оплати (різниця < ${thresholdDays} днів).${skippedByTerm > 0 ? `\nПропущено ${skippedByTerm} позицій (ще є час до кінцевого терміну).` : ""}${skippedInvalid > 0 ? `\nПропущено ${skippedInvalid} позицій з некоректними датами.` : ""}`);
          return;
        }

        const totalAmount = newPayments.reduce((sum, p) => sum + p.amount, 0);
        if (!confirm(`Буде створено ${imported} заявок на оплату заборгованості на загальну суму ${formatMoney(totalAmount)} грн.${skippedByTerm > 0 ? `\nПропущено ${skippedByTerm} позицій (різниця до терміну ≥ ${thresholdDays} днів).` : ""}${skippedInvalid > 0 ? `\nПропущено ${skippedInvalid} позицій з некоректними датами.` : ""}\n\nПродовжити?`)) {
          return;
        }

        newPayments.forEach((payment) => {
          appendStoredRecord(payment);
          addPaymentRequestApi({ ...payment }).catch((err) =>
            console.error("[PaymentRegistry] Failed to save debt payment:", err)
          );
        });

        writeAudit({
          action: "debt_aging_import",
          entityType: "payment_request",
          entityId: "",
          description: `Імпортовано ${imported} заявок на оплату заборгованості з файлу 1С (${formatMoney(totalAmount)} грн)`,
        });

        // Виділити імпортовані заявки
        setSelectedIds(new Set(newPayments.map((p) => p.id)));
        alert(`Імпортовано ${imported} чернеток. Перевірте та натисніть «Запустити» щоб відправити на оплату.`);
      } catch (err) {
        console.error("[PaymentRegistry] Import debt aging error:", err);
        alert("Помилка при обробці файлу: " + (err.message || err));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const importDebtAgingFile = (e) => {
    const file = e.target.files?.[0];
    importDebtAgingFromFile(file);
    e.target.value = "";
  };

  // ─── Render: Заявка на платіж ───
  const renderPaymentRequest = () => (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs text-amber-700">На погодженні</div>
          <div className="mt-1 text-xl font-bold text-amber-800">{stats.pending}</div>
          <div className="text-xs text-amber-600">{formatMoney(stats.totalPending)} грн</div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-xs text-emerald-700">Погоджено / заплановано</div>
          <div className="mt-1 text-xl font-bold text-emerald-800">{stats.approved}</div>
          <div className="text-xs text-emerald-600">{formatMoney(stats.totalApproved)} грн</div>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <div className="text-xs text-green-700">Оплачено</div>
          <div className="mt-1 text-xl font-bold text-green-800">{paymentRequests.filter((p) => p.status === "paid").length}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-600">Всього заявок</div>
          <div className="mt-1 text-xl font-bold text-slate-800">{paymentRequests.length}</div>
        </div>
      </div>

      {/* New Payment Form */}
      {showForm && (
        <div className={cardClass}>
          <h3 className="text-base font-semibold">{editingPayment ? "Редагувати заявку" : "Нова заявка на платіж"}</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="md:col-span-3">
              <label className="text-sm font-semibold">Мета платежу * <span className="text-xs font-normal text-slate-400">— опишіть своїми словами, навіщо цей платіж</span></label>
              <div className="mt-1 flex gap-2 items-center">
                <input className={`${inputClass} flex-1`} value={formData.title} onChange={(e) => handleFormChange("title", e.target.value)} placeholder="Наприклад: Оплата за продукти — ТОВ Ланч" />
              </div>
            </div>
            <div className="md:col-span-3">
              <label className="text-sm font-semibold text-indigo-700">Призначення платежу <span className="text-xs font-normal text-slate-400">— заповнює бухгалтер (з правилами ПДВ та статтями)</span></label>
              <div className="mt-1 flex gap-2 items-center">
                <input className={`${inputClass} flex-1`} value={formData.paymentPurpose || ""} onChange={(e) => handleFormChange("paymentPurpose", e.target.value)} placeholder="Наприклад: Оплата за товари за договором №… від …" />
                <div className="flex gap-1 items-center shrink-0">
                  <button type="button" className={`rounded-lg px-2 py-1.5 text-xs font-semibold border transition-colors whitespace-nowrap ${formData.vatMode === "none" ? "border-slate-500 bg-slate-100 text-slate-800" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`} onClick={() => handleFormChange("vatMode", "none")}>—</button>
                  <button type="button" className={`rounded-lg px-2 py-1.5 text-xs font-semibold border transition-colors whitespace-nowrap ${formData.vatMode === "without" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`} onClick={() => handleFormChange("vatMode", "without")}>Без ПДВ</button>
                  <button type="button" className={`rounded-lg px-2 py-1.5 text-xs font-semibold border transition-colors whitespace-nowrap ${formData.vatMode === "with" ? "border-blue-500 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`} onClick={() => { handleFormChange("vatMode", "with"); if (!formData.vatRate && typicalFields.vatRates?.length) handleFormChange("vatRate", String(typicalFields.vatRates[0])); }}>З ПДВ</button>
                  {formData.vatMode === "with" && (
                    <select className={`${inputClass} !mt-0 w-20`} value={formData.vatRate} onChange={(e) => handleFormChange("vatRate", e.target.value)}>
                      <option value="">%</option>
                      {(typicalFields.vatRates || []).map((rate) => (
                        <option key={rate} value={String(rate)}>{rate}%</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold">Заклад</label>
              <select className={inputClass} value={formData.restaurant} onChange={(e) => {
                const val = e.target.value;
                setFormData((prev) => ({ ...prev, restaurant: val, expenseRestaurant: prev.expenseRestaurant || val }));
              }}>
                <option value="">Оберіть заклад</option>
                {(restaurants || []).map((r) => (
                  <option key={r.id} value={r.name || r.id}>{r.name || r.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold">Сума *</label>
              <input type="text" inputMode="decimal" className={inputClass} value={formData.amount} onChange={(e) => handleFormChange("amount", e.target.value)} placeholder="25000.00" />
            </div>
            <div>
              <label className="text-sm font-semibold">Валюта</label>
              <select className={inputClass} value={formData.currency} onChange={(e) => handleFormChange("currency", e.target.value)}>
                <option value="UAH">UAH (₴)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold">Контрагент (отримувач) <span className="text-xs font-normal text-slate-400">— заповнюється при погодженні</span></label>
              <input list="counterparties-list" className={inputClass} value={formData.counterparty} onChange={(e) => {
                handleFormChange("counterparty", e.target.value);
                const match = counterparties.find((c) => c.name === e.target.value);
                if (match) {
                  if (match.iban && !formData.iban) handleFormChange("iban", match.iban);
                  if (match.vatMode && match.vatMode !== "none") {
                    setFormData((prev) => ({ ...prev, vatMode: match.vatMode, vatRate: match.vatRate || prev.vatRate }));
                  }
                }
              }} placeholder="ТОВ Ланч Сервіс (необов'язково)" />
              <datalist id="counterparties-list">
                {counterparties.map((c) => <option key={c.id} value={c.name}>{c.name}{c.edrpou ? ` (${c.edrpou})` : ""}</option>)}
              </datalist>
            </div>
            <div>
              <label className="text-sm font-semibold">IBAN / рахунок</label>
              <input className={inputClass} value={formData.iban} onChange={(e) => handleFormChange("iban", e.target.value)} placeholder="UA..." />
            </div>
            <div>
              <label className="text-sm font-semibold">Платник</label>
              <select className={inputClass} value={formData.payerId} onChange={(e) => {
                const payerId = e.target.value;
                const payer = payersById.get(payerId);
                setFormData((prev) => ({ ...prev, payerId, paidBy: payer?.name || prev.paidBy || "" }));
              }}>
                <option value="">Оберіть платника</option>
                {getPayersForRestaurant(formData.restaurant).map((payer) => (
                  <option key={payer.id} value={payer.id}>{payer.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold">Стаття РГК</label>
              <select className={inputClass} value={formData.articleCode} onChange={(e) => {
                const code = e.target.value;
                const art = (typicalFields.articles || []).find((a) => a.code === code);
                setFormData((prev) => ({ ...prev, articleCode: code, category: art ? `${art.code} ${art.name}` : "", subArticleCode: "" }));
              }}>
                <option value="">Оберіть статтю</option>
                {(typicalFields.articles || []).map((art) => (
                  <option key={art.code} value={art.code}>{art.code} {art.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold">Підстаття РГК</label>
              <select className={inputClass} value={formData.subArticleCode} onChange={(e) => handleFormChange("subArticleCode", e.target.value)}>
                <option value="">Оберіть підстаттю</option>
                {(typicalFields.subArticles || []).filter((sa) => sa.articleCode === formData.articleCode).map((sa) => (
                  <option key={sa.code} value={sa.code}>{sa.code} {sa.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold">Терміновість</label>
              <select className={inputClass} value={formData.urgency} onChange={(e) => handleFormChange("urgency", e.target.value)}>
                {Object.entries(URGENCY_LEVELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold">Бажана дата оплати</label>
              <input type="date" className={inputClass} value={formData.dueDate} onChange={(e) => handleFormChange("dueDate", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold">Витрати закладу <span className="text-xs font-normal text-slate-400">— для рознесення в 1С (можна декілька)</span></label>
              <div className="flex gap-2 items-start">
                <select className={`${inputClass} max-w-[220px]`} value="" onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  setFormData((prev) => ({
                    ...prev,
                    expenseRestaurants: prev.expenseRestaurants.includes(val) ? prev.expenseRestaurants : [...prev.expenseRestaurants, val],
                    expenseRestaurant: val,
                  }));
                }}>
                  <option value="">Додати заклад…</option>
                  {(restaurants || []).filter((r) => !(formData.expenseRestaurants || []).includes(r.name || r.id)).map((r) => (
                    <option key={r.id} value={r.name || r.id}>{r.name || r.id}</option>
                  ))}
                </select>
                <div className="mt-1 flex flex-wrap gap-1.5 flex-1">
                  {(formData.expenseRestaurants || []).map((r) => (
                    <span key={r} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-xs text-indigo-700">
                      {r}
                      <button type="button" onClick={() => setFormData((prev) => ({ ...prev, expenseRestaurants: prev.expenseRestaurants.filter((x) => x !== r) }))} className="ml-0.5 rounded-full p-0.5 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="md:col-span-3 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <input type="checkbox" id="isRecurring" checked={formData.isRecurring} onChange={(e) => handleFormChange("isRecurring", e.target.checked)} className="h-4 w-4 accent-blue-600" />
              <label htmlFor="isRecurring" className="text-sm font-semibold text-blue-800 cursor-pointer select-none">Регулярний платіж (створення заявок за розкладом)</label>
            </div>
            {formData.isRecurring && (
              <div className="md:col-span-3 grid grid-cols-1 gap-3 md:grid-cols-5">
                <div className="md:col-span-2 lg:col-span-1">
                  <label className="text-sm font-semibold">Періодичність</label>
                  <select className={inputClass} value={formData.frequency} onChange={(e) => handleFormChange("frequency", e.target.value)}>
                    {Object.entries(RECURRING_FREQUENCIES).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-semibold">День місяця</label>
                  <input type="number" min="1" max="31" className={inputClass} value={formData.dayOfMonth} onChange={(e) => handleFormChange("dayOfMonth", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-semibold">Дата старту *</label>
                  <input type="date" className={inputClass} value={formData.startDate} onChange={(e) => handleFormChange("startDate", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-semibold">Дата завершення</label>
                  <input type="date" className={inputClass} value={formData.endDate} onChange={(e) => handleFormChange("endDate", e.target.value)} disabled={formData.noEndDate} />
                </div>
                <div className="flex items-end">
                  <label className="flex min-h-[42px] w-full items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs text-slate-600 cursor-pointer select-none">
                    <input type="checkbox" checked={formData.noEndDate} onChange={(e) => { handleFormChange("noEndDate", e.target.checked); if (e.target.checked) handleFormChange("endDate", ""); }} className="h-3.5 w-3.5 accent-blue-600" />
                    Безстроковий
                  </label>
                </div>
              </div>
            )}
            <div className="md:col-span-3 grid grid-cols-1 items-stretch gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div>
                  <div className="text-sm font-semibold">Опис / коментар <span className="text-xs font-normal text-slate-400">— для ініціатора</span></div>
                </div>
                <textarea className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 min-h-[84px]" value={formData.description} onChange={(e) => handleFormChange("description", e.target.value)} placeholder="Додаткова інформація до заявки" />
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">Вкладення</div>
                      <div className="text-xs text-slate-500">Фото/файли, до 12 шт, до 10 МБ кожен</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 border border-slate-200">
                        {normalizeAttachments(formData.attachments).length} файл(ів)
                      </span>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                        <Upload size={13} /> Додати
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                          onChange={(e) => {
                            addPaymentAttachments(e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  {normalizeAttachments(formData.attachments).length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {normalizeAttachments(formData.attachments).map((attachment) => {
                        const isImage = attachment.type.startsWith("image/");
                        return (
                          <div key={attachment.id} className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1">
                            <button
                              type="button"
                              className="flex min-w-0 items-center gap-2 text-left text-xs text-indigo-700 hover:underline"
                              onClick={() => window.open(attachment.dataUrl, "_blank", "noopener,noreferrer")}
                            >
                              {isImage ? (
                                <img src={attachment.dataUrl} alt={attachment.name} className="h-6 w-6 rounded object-cover" />
                              ) : (
                                <FileText size={12} className="shrink-0" />
                              )}
                              <span className="truncate">{attachment.name}</span>
                              <span className="shrink-0 text-[11px] text-slate-400">{formatFileSize(attachment.size)}</span>
                            </button>
                            <button type="button" className="rounded border border-rose-200 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50" onClick={() => removePaymentAttachment(attachment.id)}>
                              Видалити
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={() => submitPayment(false)}>
              <FileText size={14} /> {editingPayment ? "Зберегти" : "Відправити на погодження"}
            </button>
            {!editingPayment && (
              <button type="button" className={btnSecondary} onClick={() => submitPayment(true)}>
                Зберегти як чернетку
              </button>
            )}
            <button type="button" className={btnSecondary} onClick={resetForm}>Скасувати</button>
          </div>
        </div>
      )}

      {!showForm && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={`${btnPrimary} !h-10 !px-4`} onClick={openNewForm}>
            <Plus size={14} /> Нова заявка на платіж
          </button>
          <div
            className={`flex h-10 flex-wrap items-center gap-2 rounded-lg border border-dashed px-2 py-1 transition ${isDebtDropActive ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-white"}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!isDebtDropActive) setIsDebtDropActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDebtDropActive(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDebtDropActive(false);
              const droppedFile = e.dataTransfer?.files?.[0];
              if (droppedFile) importDebtAgingFromFile(droppedFile);
            }}
          >
            <button
              type="button"
              className={`${btnSecondary} !h-8 !px-3 !text-sm`}
              onClick={() => debtAgingInputRef.current?.click()}
            >
              <Upload size={14} /> Імпорт боргів з 1С
            </button>
            <span className="text-sm text-slate-500 whitespace-nowrap">або перетягніть файл сюди</span>
            <div className="ml-1 flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm text-slate-600">
              <span className="font-semibold whitespace-nowrap">Поріг, днів</span>
              <input
                type="number"
                min="0"
                className="h-6 w-14 rounded border border-slate-300 px-1.5 py-0.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                value={debtAgingThresholdDays}
                onChange={(e) => setDebtAgingThresholdDays(e.target.value)}
              />
            </div>
            <input ref={debtAgingInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importDebtAgingFile} />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Статус</label>
            <select className={`${inputClass} !mt-0.5`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Усі</option>
              {Object.entries(PAYMENT_STATUSES).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Терміновість</label>
            <select className={`${inputClass} !mt-0.5`} value={urgencyFilter} onChange={(e) => setUrgencyFilter(e.target.value)}>
              <option value="all">Усі</option>
              {Object.entries(URGENCY_LEVELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-600">Пошук</label>
            <input className={`${inputClass} !mt-0.5`} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Назва, контрагент, категорія..." />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={cardClass}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-base font-semibold">Реєстр платежів ({filteredPayments.length})</h3>
            {filteredPayments.filter((p) => !isRecurringTemplateRecord(p)).length > 0 && (
              <div className="mt-0.5 text-xs text-slate-500">
                Загальна сума: <span className="font-semibold text-slate-700">{formatMoney(filteredPayments.filter((p) => !isRecurringTemplateRecord(p)).reduce((sum, p) => sum + (Number(p.amount) || 0), 0))} {filteredPayments.find((p) => !isRecurringTemplateRecord(p))?.currency || "UAH"}</span>
                {[...new Set(filteredPayments.filter((p) => !isRecurringTemplateRecord(p)).map((p) => p.currency))].length > 1 && (
                  <span className="ml-2 text-slate-400">(різні валюти — суми не агреговано)</span>
                )}
              </div>
            )}
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Виділено: {selectedIds.size}</span>
              <button type="button" onClick={bulkLaunchSelected} className={btnApprove} title="Запустити виділені чернетки на оплату">
                <Send size={12} /> Запустити
              </button>
              {paymentRequests.some((p) => selectedIds.has(p.id) && !isRecurringTemplateRecord(p) && paymentBelongsToUser(p, myUserId, myEmail, myName)) && (
                <button type="button" onClick={bulkDeleteSelected} className={btnReject} title="Видалити мої виділені заявки">
                  <Trash2 size={12} /> Видалити
                </button>
              )}
              <button type="button" onClick={() => setSelectedIds(new Set())} className={btnSecondary} title="Зняти виділення">
                <X size={12} /> Скинути
              </button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-2 py-2 w-8">
                  <input type="checkbox" checked={filteredPayments.filter((p) => !isRecurringTemplateRecord(p)).length > 0 && filteredPayments.filter((p) => !isRecurringTemplateRecord(p)).every((p) => selectedIds.has(p.id))} onChange={toggleSelectAll} className="rounded border-slate-300" />
                </th>
                <th className="px-3 py-2 text-left">Платіж</th>
                <th className="px-3 py-2 text-right">Сума</th>
                <th className="px-3 py-2 text-left">Статус</th>
                <th className="px-3 py-2 text-left">Дата</th>
                <th className="px-3 py-2 text-left">Ініціатор</th>
                <th className="px-3 py-2 text-left">Дії</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((payment) => {
                const isRecurringTemplate = isRecurringTemplateRecord(payment);
                const linkedPayment = isRecurringTemplate ? payment.linkedPayment || null : null;
                const actionPayment = linkedPayment || payment;
                const matchedRoute = findApproverForPayment(payment);
                const isAssignedApprover = matchedRoute && (
                  (matchedRoute.approverEmail && matchedRoute.approverEmail.toLowerCase() === myEmail.toLowerCase()) ||
                  (matchedRoute.approverName && matchedRoute.approverName === myName)
                );
                const canApprove = !isRecurringTemplate && (isFinance || isAssignedApprover) && (payment.status === "pending");
                const canPause = Boolean(actionPayment) && isFinance && ["approved", "scheduled", "paused"].includes(actionPayment.status);
                const canEdit = isRecurringTemplate
                  ? (isFinance || paymentBelongsToUser(payment, myUserId, myEmail, myName))
                  : (payment.status === "draft" || (payment.status === "pending" && payment.requestedById === myUserId));
                const canCancel = !isRecurringTemplate && (payment.status === "draft" || payment.status === "pending") && (payment.requestedById === myUserId || isFinance);
                const canDelete = !isRecurringTemplate && paymentBelongsToUser(payment, myUserId, myEmail, myName);

                return (
                  <tr key={payment.id} className={`border-t border-slate-200 hover:bg-slate-50${selectedIds.has(payment.id) ? " bg-indigo-50" : ""}`}>
                    <td className="px-2 py-2 w-8">
                      {!isRecurringTemplate && (
                        <input type="checkbox" checked={selectedIds.has(payment.id)} onChange={() => toggleSelectPayment(payment.id)} className="rounded border-slate-300" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{payment.title}</div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-slate-500">
                        {(linkedPayment?.paymentNumber || payment.paymentNumber) && <span className="font-mono">{linkedPayment?.paymentNumber || payment.paymentNumber}</span>}
                        {isRecurringTemplate && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Регулярний</span>}
                        {payment.counterparty && <span>→ {payment.counterparty}</span>}
                        {(payersById.get(String(payment.payerId || ""))?.name || payment.paidBy) && (
                          <span className="text-indigo-600 font-medium">Платник: {payersById.get(String(payment.payerId || ""))?.name || payment.paidBy}</span>
                        )}
                        {payment.category && <span className="text-slate-400">{payment.category}</span>}
                      </div>
                      {isRecurringTemplate && linkedPayment && (
                        <div className="mt-1 text-xs text-slate-500">Активний платіж: {PAYMENT_STATUSES[linkedPayment.status] || linkedPayment.status}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{formatMoney(linkedPayment?.amount ?? payment.amount)} {linkedPayment?.currency || payment.currency}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${isRecurringTemplate ? (linkedPayment ? (STATUS_COLORS[linkedPayment.status] || "bg-blue-100 text-blue-800") : "bg-blue-100 text-blue-800") : (STATUS_COLORS[payment.status] || "")}`}>
                        {isRecurringTemplate ? (linkedPayment ? (PAYMENT_STATUSES[linkedPayment.status] || linkedPayment.status) : "Очікує запуску") : (PAYMENT_STATUSES[payment.status] || payment.status)}
                      </span>
                      {!isRecurringTemplate && payment.urgency && payment.urgency !== "normal" && (
                        <span className={`ml-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${URGENCY_COLORS[payment.urgency] || ""}`}>
                          {URGENCY_LEVELS[payment.urgency] || payment.urgency}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      <div>{formatDate(isRecurringTemplate ? (payment.registryDate || payment.nextOccurrenceDate) : payment.dueDate) || "—"}</div>
                      <div className="text-slate-400">{formatDateTime((linkedPayment || payment).createdAt)}</div>
                      {isRecurringTemplate && linkedPayment && payment.nextOccurrenceDate && (
                        <div className="text-slate-400">Наступний запуск: {formatDate(payment.nextOccurrenceDate)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{isRecurringTemplate ? (payment.registryInitiator || "-") : (payment.requestedByName || "-")}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex flex-nowrap gap-1 [&>*]:shrink-0">
                        {!isRecurringTemplate && payment.status === "draft" && (
                          <button type="button" disabled={Boolean(processingId)} onClick={() => launchPayment(payment)} className={btnApprove} title="Запустити на оплату">
                            <Send size={12} /> Запустити
                          </button>
                        )}
                        {isRecurringTemplate && (
                          <button type="button" disabled={Boolean(processingId) || !canCreateFromRecurringTemplate(payment)} onClick={() => runRecurringTemplateNow(payment)} className={btnSecondary} title={!canCreateFromRecurringTemplate(payment) ? "Спочатку завершіть або скасуйте поточний платіж з цього шаблону" : ""}>
                            <RefreshCcw size={12} /> Створити зараз
                          </button>
                        )}
                        {canApprove && (
                          <>
                            <button type="button" disabled={Boolean(processingId)} onClick={() => openApprovalModal(payment)} className={btnApprove}>
                              <Check size={12} /> Погодити
                            </button>
                            <button type="button" disabled={Boolean(processingId)} onClick={() => rejectPayment(payment)} className={btnReject}>
                              <X size={12} /> Відхилити
                            </button>
                          </>
                        )}
                        {canPause && (
                          <button type="button" disabled={Boolean(processingId)} onClick={() => togglePaymentPaused(actionPayment)} className={actionPayment.status === "paused" ? btnApprove : btnSecondary}>
                            {actionPayment.status === "paused" ? <><Play size={12} /> Відновити</> : <><Pause size={12} /> Пауза</>}
                          </button>
                        )}
                        {canEdit && (
                          <button type="button" onClick={() => (isRecurringTemplate ? openEditRecurringForm(payment) : openEditForm(payment))} className={btnSecondary}>
                            Редагувати
                          </button>
                        )}
                        {canCancel && (
                          <button type="button" onClick={() => cancelPayment(payment)} className={btnReject}>
                            Скасувати
                          </button>
                        )}
                        {canDelete && (
                          <button type="button" onClick={() => deletePayment(payment)} className={btnReject} title="Видалити заявку назавжди">
                            <Trash2 size={12} /> Видалити
                          </button>
                        )}
                        {isAdmin && isRecurringTemplate && (
                          <button type="button" onClick={() => removeRecurringTemplate(payment)} className={btnReject} title="Видалити шаблон регулярного платежу">
                            <Trash2 size={12} /> Видалити
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                    {paymentRequests.length === 0 && recurringTemplates.length === 0 ? "Заявок на платіж поки немає. Натисніть «Нова заявка» щоб створити першу." : "Нічого не знайдено за обраними фільтрами."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Approval Modal */}
      {approvalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setApprovalModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-1">Погодження платежу</h3>
            <p className="text-sm text-slate-500 mb-4">"{approvalModal.title}" — {formatMoney(approvalModal.amount)} {approvalModal.currency}</p>
            <p className="text-xs text-slate-500 mb-3">Реквізити контрагента, IBAN та платника заповнює головний бухгалтер на наступному етапі.</p>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-sm font-semibold">Коментар до погодження</label>
                <textarea className={`${inputClass} min-h-[60px]`} value={approvalData.comment} onChange={(e) => setApprovalData((prev) => ({ ...prev, comment: e.target.value }))} placeholder="Додаткові примітки" />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className={btnApprove} onClick={confirmApproval} disabled={Boolean(processingId)}>
                <Check size={14} /> Погодити платіж
              </button>
              <button type="button" className={btnSecondary} onClick={() => setApprovalModal(null)}>Скасувати</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ─── Render: Мої платежі ───
  const renderMyPayments = () => {
    const myPayments = paymentRequests.filter((payment) => paymentBelongsToUser(payment, myUserId, myEmail, myName));
    const grouped = {
      active: myPayments.filter((p) => ["draft", "pending", "accounting", "approved", "scheduled"].includes(p.status)),
      paused: myPayments.filter((p) => p.status === "paused"),
      completed: myPayments.filter((p) => p.status === "paid"),
      other: myPayments.filter((p) => ["rejected", "cancelled"].includes(p.status)),
    };

    const canPauseResume = (p) => ["approved", "scheduled", "paused"].includes(p.status);

    const getStatusLabel = (payment) => {
      if (payment.status !== "accounting") {
        return PAYMENT_STATUSES[payment.status] || payment.status;
      }
      if (payment.accountingStage === "article") return "У бухгалтера";
      if (payment.accountingStage === "done") return "Передано казначею";
      return "У головного бухгалтера";
    };

    const getStatusPair = (payment) => {
      const route = findApproverForPayment(payment);
      const routePerson = route?.approverName || route?.approverEmail || "не визначено";
      const approvals = Array.isArray(payment.approvals) ? payment.approvals : [];
      const approvedEvent = approvals.find((item) => item.action === "approved");
      const payerSetEvent = approvals.find((item) => item.action === "accounting_payer_set");
      const toTreasuryEvent = approvals.find((item) => item.action === "accounting_to_treasury");

      const current = (() => {
        if (payment.status === "pending") return `На погодженні (${routePerson})`;
        if (payment.status === "accounting" && payment.accountingStage === "chief") return "У головного бухгалтера";
        if (payment.status === "accounting" && payment.accountingStage === "article") return "У бухгалтера";
        if (payment.status === "approved") return toTreasuryEvent ? `Передано казначею (${toTreasuryEvent.byName || "—"})` : "Погоджено";
        if (payment.status === "scheduled") return payment.scheduledByName ? `Заплановано (${payment.scheduledByName})` : "Заплановано";
        if (payment.status === "paid") return payment.paidByName ? `Оплачено (${payment.paidByName})` : "Оплачено";
        return PAYMENT_STATUSES[payment.status] || payment.status;
      })();

      const previous = (() => {
        if (payment.status === "pending") return "Чернетка";
        if (payment.status === "accounting" && payment.accountingStage === "chief") {
          return approvedEvent?.byName ? `Погоджено (${approvedEvent.byName})` : "На погодженні";
        }
        if (payment.status === "accounting" && payment.accountingStage === "article") {
          return payerSetEvent?.byName ? `Головний бухгалтер (${payerSetEvent.byName})` : "У головного бухгалтера";
        }
        if (payment.status === "approved") {
          return toTreasuryEvent?.byName ? `У бухгалтера (${toTreasuryEvent.byName})` : "На бухгалтерії";
        }
        if (payment.status === "scheduled") return "Погоджено";
        if (payment.status === "paid") return payment.scheduledByName ? `Заплановано (${payment.scheduledByName})` : "Заплановано";
        if (payment.status === "paused") return PAYMENT_STATUSES[payment.statusBeforePause] || "Погоджено";
        return approvedEvent?.byName ? `Погоджено (${approvedEvent.byName})` : "—";
      })();

      return { current, previous };
    };

    const renderSection = (title, items, emptyText, { showPauseBtn = false } = {}) => (
      <div className={cardClass}>
        <h3 className="text-base font-semibold">{title} ({items.length})</h3>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">№</th>
                <th className="px-3 py-2 text-left">Назва</th>
                <th className="px-3 py-2 text-left">Контрагент</th>
                <th className="px-3 py-2 text-right">Сума</th>
                <th className="px-3 py-2 text-left">Статус</th>
                <th className="px-3 py-2 text-left">Попередній</th>
                <th className="px-3 py-2 text-left">Дата оплати</th>
                <th className="px-3 py-2 text-left">Оновлено</th>
                {showPauseBtn && <th className="px-3 py-2 text-left">Дії</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const statusPair = getStatusPair(p);
                return (
                <tr key={p.id} className="border-t border-slate-200">
                  <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{p.paymentNumber || "—"}</td>
                  <td className="px-3 py-2 font-medium">{p.title}</td>
                  <td className="px-3 py-2">{p.counterparty || "-"}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{formatMoney(p.amount)} {p.currency}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[p.status] || ""}`}>
                      {statusPair.current || getStatusLabel(p)}
                    </span>
                    {p.status === "scheduled" && p.scheduledForDate && (
                      <div className="mt-1 text-xs text-blue-700">На {formatDate(p.scheduledForDate)}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{statusPair.previous || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div>{formatDate(p.dueDate)}</div>
                    {p.scheduledForDate && p.scheduledForDate !== p.dueDate && (
                      <div className="text-xs text-slate-400">План: {formatDate(p.scheduledForDate)}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(p.updatedAt)}</td>
                  {showPauseBtn && (
                    <td className="px-3 py-2">
                      {canPauseResume(p) && (
                        <button type="button" className={p.status === "paused" ? btnApprove : btnSecondary} disabled={Boolean(processingId)} onClick={() => togglePaymentPaused(p)}>
                          {p.status === "paused" ? <><Play size={12} /> Відновити</> : <><Pause size={12} /> Пауза</>}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={showPauseBtn ? 9 : 8} className="px-3 py-6 text-center text-slate-500">{emptyText}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );

    const myRecurringTemplates = recurringTemplates
      .filter((template) => isFinance || paymentBelongsToUser(template, myUserId, myEmail, myName))
      .sort((a, b) => new Date(a.nextOccurrenceDate || a.startDate || 0).getTime() - new Date(b.nextOccurrenceDate || b.startDate || 0).getTime());

    return (
      <div className="space-y-5">
        {renderSection("Активні заявки", grouped.active, "Немає активних заявок", { showPauseBtn: true })}
        {grouped.paused.length > 0 && renderSection("Призупинені", grouped.paused, "", { showPauseBtn: true })}
        {renderSection("Оплачено", grouped.completed, "Оплачених заявок поки немає")}
        {grouped.other.length > 0 && renderSection("Відхилені / скасовані", grouped.other, "")}

        {/* Recurring templates section */}
        <div className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold">Регулярні платежі ({myRecurringTemplates.length})</h3>
          </div>
          <p className="mt-1 text-sm text-slate-600">Шаблони для автоматичного створення заявок за розкладом. Створити новий можна через &quot;Заявка на платіж&quot; → чекбокс &quot;Регулярний платіж&quot;.</p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left">Назва</th>
                  <th className="px-3 py-2 text-left">Контрагент</th>
                  <th className="px-3 py-2 text-right">Сума</th>
                  <th className="px-3 py-2 text-left">Частота</th>
                  <th className="px-3 py-2 text-left">Наступна дата</th>
                  <th className="px-3 py-2 text-left">Дії</th>
                </tr>
              </thead>
              <tbody>
                {myRecurringTemplates.map((template) => (
                  <tr key={template.id} className="border-t border-slate-200 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{template.title}</td>
                    <td className="px-3 py-2">{template.counterparty || "-"}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{formatMoney(template.amount)} {template.currency}</td>
                    <td className="px-3 py-2">{RECURRING_FREQUENCIES[template.frequency] || template.frequency}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(template.nextOccurrenceDate)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button type="button" className={btnSecondary} onClick={() => runRecurringTemplateNow(template)} disabled={!canCreateFromRecurringTemplate(template)} title={!canCreateFromRecurringTemplate(template) ? "Спочатку завершіть або скасуйте поточний платіж з цього шаблону" : ""}>
                          <RefreshCcw size={12} /> Створити зараз
                        </button>
                        <button type="button" className={btnSecondary} onClick={() => openEditRecurringForm(template)}>
                          Редагувати
                        </button>
                        <button type="button" className={btnReject} onClick={() => removeRecurringTemplate(template)}>
                          Видалити
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {myRecurringTemplates.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">Регулярних платежів поки немає. Створіть через форму &quot;Заявка на платіж&quot;.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Edit recurring template form (inline) */}
        {showRecurringForm && editingRecurringTemplate && (
          <div className={cardClass}>
            <h3 className="text-base font-semibold">Редагувати регулярний платіж</h3>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-sm font-semibold">Назва *</label>
                <input className={inputClass} value={recurringFormData.title} onChange={(e) => handleRecurringFormChange("title", e.target.value)} placeholder="Оренда офісу / електроенергія / інтернет" />
              </div>
              <div>
                <label className="text-sm font-semibold">Сума *</label>
                <input type="text" inputMode="decimal" className={inputClass} value={recurringFormData.amount} onChange={(e) => handleRecurringFormChange("amount", e.target.value)} placeholder="15000.00" />
              </div>
              <div>
                <label className="text-sm font-semibold">Валюта</label>
                <select className={inputClass} value={recurringFormData.currency} onChange={(e) => handleRecurringFormChange("currency", e.target.value)}>
                  <option value="UAH">UAH (₴)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold">Контрагент</label>
                <input list="recurring-edit-counterparties-list" className={inputClass} value={recurringFormData.counterparty} onChange={(e) => {
                  handleRecurringFormChange("counterparty", e.target.value);
                  const match = counterparties.find((item) => item.name === e.target.value);
                  if (match?.iban && !recurringFormData.iban) handleRecurringFormChange("iban", match.iban);
                }} placeholder="Оберіть контрагента" />
                <datalist id="recurring-edit-counterparties-list">
                  {counterparties.map((counterparty) => <option key={counterparty.id} value={counterparty.name}>{counterparty.name}</option>)}
                </datalist>
              </div>
              <div>
                <label className="text-sm font-semibold">IBAN</label>
                <input className={inputClass} value={recurringFormData.iban} onChange={(e) => handleRecurringFormChange("iban", e.target.value)} placeholder="UA..." />
              </div>
              <div>
                <label className="text-sm font-semibold">Періодичність</label>
                <select className={inputClass} value={recurringFormData.frequency} onChange={(e) => handleRecurringFormChange("frequency", e.target.value)}>
                  {Object.entries(RECURRING_FREQUENCIES).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold">День місяця</label>
                <input type="number" min="1" max="31" className={inputClass} value={recurringFormData.dayOfMonth} onChange={(e) => handleRecurringFormChange("dayOfMonth", e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-semibold">Дата старту *</label>
                <input type="date" className={inputClass} value={recurringFormData.startDate} onChange={(e) => handleRecurringFormChange("startDate", e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-semibold">Дата завершення</label>
                <input type="date" className={inputClass} value={recurringFormData.endDate} onChange={(e) => handleRecurringFormChange("endDate", e.target.value)} disabled={recurringFormData.noEndDate} />
                <label className="mt-1 flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                  <input type="checkbox" checked={recurringFormData.noEndDate} onChange={(e) => { handleRecurringFormChange("noEndDate", e.target.checked); if (e.target.checked) handleRecurringFormChange("endDate", ""); }} className="h-3.5 w-3.5 accent-blue-600" />
                  Безстроковий
                </label>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} onClick={submitRecurringTemplate}>
                <Save size={14} /> Зберегти
              </button>
              <button type="button" className={btnSecondary} onClick={resetRecurringForm}>Скасувати</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderRecurringPayments = () => {
    const treasuryTemplates = recurringTemplates
      .filter((template) => isFinance || paymentBelongsToUser(template, myUserId, myEmail, myName))
      .sort((a, b) => new Date(a.nextOccurrenceDate || a.startDate || 0).getTime() - new Date(b.nextOccurrenceDate || b.startDate || 0).getTime());

    return (
      <div className="space-y-5">
        <div className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Регулярні платежі</h3>
              <p className="mt-1 text-sm text-slate-600">Створюйте шаблони для щомісячних, квартальних і річних платежів. Система автоматично створює заявки на дату оплати.</p>
            </div>
            <button type="button" className={btnPrimary} onClick={openNewRecurringForm}>
              <Plus size={14} /> Новий регулярний платіж
            </button>
          </div>
        </div>

        {showRecurringForm && (
          <div className={cardClass}>
            <h3 className="text-base font-semibold">{editingRecurringTemplate ? "Редагувати регулярний платіж" : "Новий регулярний платіж"}</h3>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-sm font-semibold">Назва *</label>
                <input className={inputClass} value={recurringFormData.title} onChange={(e) => handleRecurringFormChange("title", e.target.value)} placeholder="Оренда офісу / електроенергія / інтернет" />
              </div>
              <div>
                <label className="text-sm font-semibold">Сума *</label>
                <input type="text" inputMode="decimal" className={inputClass} value={recurringFormData.amount} onChange={(e) => handleRecurringFormChange("amount", e.target.value)} placeholder="15000.00" />
              </div>
              <div>
                <label className="text-sm font-semibold">Валюта</label>
                <select className={inputClass} value={recurringFormData.currency} onChange={(e) => handleRecurringFormChange("currency", e.target.value)}>
                  <option value="UAH">UAH (₴)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold">Контрагент</label>
                <input list="recurring-counterparties-list" className={inputClass} value={recurringFormData.counterparty} onChange={(e) => {
                  handleRecurringFormChange("counterparty", e.target.value);
                  const match = counterparties.find((item) => item.name === e.target.value);
                  if (match?.iban && !recurringFormData.iban) handleRecurringFormChange("iban", match.iban);
                }} placeholder="Оберіть контрагента" />
                <datalist id="recurring-counterparties-list">
                  {counterparties.map((counterparty) => <option key={counterparty.id} value={counterparty.name}>{counterparty.name}</option>)}
                </datalist>
              </div>
              <div>
                <label className="text-sm font-semibold">IBAN</label>
                <input className={inputClass} value={recurringFormData.iban} onChange={(e) => handleRecurringFormChange("iban", e.target.value)} placeholder="UA..." />
              </div>
              <div>
                <label className="text-sm font-semibold">Періодичність</label>
                <select className={inputClass} value={recurringFormData.frequency} onChange={(e) => handleRecurringFormChange("frequency", e.target.value)}>
                  {Object.entries(RECURRING_FREQUENCIES).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold">День місяця</label>
                <input type="number" min="1" max="31" className={inputClass} value={recurringFormData.dayOfMonth} onChange={(e) => handleRecurringFormChange("dayOfMonth", e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-semibold">Дата старту *</label>
                <input type="date" className={inputClass} value={recurringFormData.startDate} onChange={(e) => handleRecurringFormChange("startDate", e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-semibold">Дата завершення</label>
                <input type="date" className={inputClass} value={recurringFormData.endDate} onChange={(e) => handleRecurringFormChange("endDate", e.target.value)} disabled={recurringFormData.noEndDate} />
                <label className="mt-1 flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                  <input type="checkbox" checked={recurringFormData.noEndDate} onChange={(e) => { handleRecurringFormChange("noEndDate", e.target.checked); if (e.target.checked) handleRecurringFormChange("endDate", ""); }} className="h-3.5 w-3.5 accent-blue-600" />
                  Безстроковий
                </label>
              </div>
              <div>
                <label className="text-sm font-semibold">Категорія</label>
                <select className={inputClass} value={recurringFormData.category} onChange={(e) => handleRecurringFormChange("category", e.target.value)}>
                  <option value="">Оберіть категорію</option>
                  {typicalFields.categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold">Терміновість</label>
                <select className={inputClass} value={recurringFormData.urgency} onChange={(e) => handleRecurringFormChange("urgency", e.target.value)}>
                  {Object.entries(URGENCY_LEVELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold">Заклад</label>
                <select className={inputClass} value={recurringFormData.restaurant} onChange={(e) => {
                  const val = e.target.value;
                  setRecurringFormData((prev) => ({ ...prev, restaurant: val, expenseRestaurant: prev.expenseRestaurant || val }));
                }}>
                  <option value="">Оберіть заклад</option>
                  {(restaurants || []).map((restaurant) => (
                    <option key={restaurant.id} value={restaurant.name || restaurant.id}>{restaurant.name || restaurant.id}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold">Витрати закладу <span className="text-xs font-normal text-slate-400">— для рознесення в 1С</span></label>
                <select className={inputClass} value={recurringFormData.expenseRestaurant} onChange={(e) => handleRecurringFormChange("expenseRestaurant", e.target.value)}>
                  <option value="">Той самий заклад</option>
                  {(restaurants || []).map((restaurant) => (
                    <option key={restaurant.id} value={restaurant.name || restaurant.id}>{restaurant.name || restaurant.id}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold">Платник</label>
                <select className={inputClass} value={recurringFormData.payerId} onChange={(e) => {
                  const payerId = e.target.value;
                  const payer = payersById.get(payerId);
                  setRecurringFormData((prev) => ({ ...prev, payerId, paidBy: payer?.name || prev.paidBy || "" }));
                }}>
                  <option value="">Оберіть платника</option>
                  {getPayersForRestaurant(recurringFormData.restaurant).map((payer) => (
                    <option key={payer.id} value={payer.id}>{payer.name}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-semibold">Опис / коментар</label>
                <textarea className={`${inputClass} min-h-[80px]`} value={recurringFormData.description} onChange={(e) => handleRecurringFormChange("description", e.target.value)} placeholder="Деталі регулярного платежу" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-semibold">Примітка</label>
                <input className={inputClass} value={recurringFormData.attachmentNote} onChange={(e) => handleRecurringFormChange("attachmentNote", e.target.value)} placeholder="Рахунок, договір, внутрішня примітка" />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} onClick={submitRecurringTemplate}>
                <Save size={14} /> {editingRecurringTemplate ? "Зберегти" : "Створити шаблон"}
              </button>
              <button type="button" className={btnSecondary} onClick={resetRecurringForm}>Скасувати</button>
            </div>
          </div>
        )}

        <div className={cardClass}>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left">Назва</th>
                  <th className="px-3 py-2 text-left">Контрагент</th>
                  <th className="px-3 py-2 text-right">Сума</th>
                  <th className="px-3 py-2 text-left">Частота</th>
                  <th className="px-3 py-2 text-left">Наступна дата</th>
                  <th className="px-3 py-2 text-left">Дії</th>
                </tr>
              </thead>
              <tbody>
                {treasuryTemplates.map((template) => (
                  <tr key={template.id} className="border-t border-slate-200 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{template.title}</td>
                    <td className="px-3 py-2">{template.counterparty || "-"}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{formatMoney(template.amount)} {template.currency}</td>
                    <td className="px-3 py-2">{RECURRING_FREQUENCIES[template.frequency] || template.frequency}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(template.nextOccurrenceDate)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button type="button" className={btnSecondary} onClick={() => runRecurringTemplateNow(template)} disabled={!canCreateFromRecurringTemplate(template)} title={!canCreateFromRecurringTemplate(template) ? "Спочатку завершіть або скасуйте поточний платіж з цього шаблону" : ""}>
                          <RefreshCcw size={12} /> Створити зараз
                        </button>
                        <button type="button" className={btnSecondary} onClick={() => openEditRecurringForm(template)}>
                          Редагувати
                        </button>
                        <button type="button" className={btnReject} onClick={() => removeRecurringTemplate(template)}>
                          Видалити
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {treasuryTemplates.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">Регулярних платежів поки немає.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderTreasuryTab = () => {
    const addDaysToDate = (dateValue, days) => {
      const normalized = toDateOnly(dateValue);
      if (!normalized) return "";
      const parsed = new Date(`${normalized}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) return "";
      parsed.setDate(parsed.getDate() + days);
      return toDateOnly(parsed.toISOString());
    };

    const today = getTodayDateOnly();
    const tomorrow = addDaysToDate(today, 1);

    const resolveTreasuryRange = () => {
      if (treasuryDatePreset === "today") return { from: today, to: today };
      if (treasuryDatePreset === "tomorrow") return { from: tomorrow, to: tomorrow };
      if (treasuryDatePreset === "week") return { from: today, to: addDaysToDate(today, 7) };
      if (treasuryDatePreset === "custom") return { from: treasuryDateFrom, to: treasuryDateTo };
      return { from: "", to: "" };
    };

    const { from: treasuryRangeFrom, to: treasuryRangeTo } = resolveTreasuryRange();

    const selectedChiefPayment = paymentRequests.find((p) => p.id === accountantDetailsPaymentId) || null;

    const treasuryQueue = paymentRequests
      .filter((payment) => ["approved", "scheduled"].includes(payment.status) && payment.status !== "paused")
      .filter((payment) => {
        const effectiveDate = getEffectivePaymentDate(payment);
        if (!treasuryRangeFrom && !treasuryRangeTo) return true;
        if (!effectiveDate) return false;
        if (treasuryRangeFrom && effectiveDate < treasuryRangeFrom) return false;
        if (treasuryRangeTo && effectiveDate > treasuryRangeTo) return false;
        return true;
      })
      .sort((a, b) => new Date(getEffectivePaymentDate(a) || a.createdAt || 0).getTime() - new Date(getEffectivePaymentDate(b) || b.createdAt || 0).getTime());

    const todayQueue = paymentRequests.filter((payment) => ["approved", "scheduled"].includes(payment.status) && payment.status !== "paused" && getEffectivePaymentDate(payment) === today);

    const exportTreasuryCsv = () => {
      if (!treasuryQueue.length) {
        alert("Немає платежів для вивантаження.");
        return;
      }
      const rows = [
        ["№ Платежу", "ID", "Дата оплати", "Контрагент", "IBAN отримувача", "Сума", "Валюта", "Призначення", "Категорія", "Заклад", "Платник", "ЄДРПОУ платника", "IBAN платника", "МФО платника", "Статус"],
        ...treasuryQueue.map((payment) => {
          const payer = payersById.get(String(payment.payerId || ""));
          return [
            payment.paymentNumber || "",
            payment.id,
            getEffectivePaymentDate(payment) || "",
            payment.counterparty || "",
            payment.iban || "",
            Number(payment.amount || 0).toFixed(2),
            payment.currency || "UAH",
            payment.paymentPurpose || payment.description || payment.title || "",
            payment.category || "",
            payment.restaurant || "",
            payment.paidBy || payer?.name || "",
            payer?.edrpou || "",
            payer?.iban || "",
            payer?.mfo || "",
            PAYMENT_STATUSES[payment.status] || payment.status,
          ];
        }),
      ];
      downloadCsvFile(`treasury-export-${getTodayDateOnly()}.csv`, rows);
    };

    const exportBankClientCsv = () => {
      if (!treasuryQueue.length) {
        alert("Немає платежів для вивантаження.");
        return;
      }
      const formatBankDate = (dateStr) => {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        if (Number.isNaN(d.getTime())) return "";
        return `${padNumber(d.getDate())}${padNumber(d.getMonth() + 1)}${d.getFullYear()}`;
      };
      const counterpartiesMap = new Map();
      counterparties.forEach((c) => {
        if (c.name) counterpartiesMap.set(c.name.trim().toLowerCase(), c);
      });
      const header = ["TYPE","DATE","NUM","MFO_P","ACCOUNT","EDRPOU_I","AMOUNT","DETAILS","EDRPOU_I","NAME_R","MFO_R","ACCOUNT","COUNTRY","ID_R"].join(";");
      const lines = treasuryQueue.map((payment) => {
        const payer = payersById.get(String(payment.payerId || ""));
        const cKey = (payment.counterparty || "").trim().toLowerCase();
        const cp = counterpartiesMap.get(cKey);
        const amountKop = Math.round((Number(payment.amount) || 0) * 100);
        const fields = [
          "1",
          formatBankDate(getEffectivePaymentDate(payment)),
          "",
          payer?.mfo || "",
          payer?.iban || "",
          payer?.edrpou || "",
          String(amountKop),
          (payment.paymentPurpose || payment.title || payment.description || "").replace(/;/g, ","),
          cp?.edrpou || "",
          payment.counterparty || "",
          cp?.mfo || "",
          payment.iban || "",
          "",
          "",
        ];
        return fields.join(";");
      });
      const csvContent = `\uFEFF${header}\n${lines.join("\n")}`;
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `bank-import-${getTodayDateOnly()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    };

    const totalAmount = treasuryQueue.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
    const todayAmount = todayQueue.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);

    return (
      <div className="space-y-5">
        <div className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2"><Landmark size={18} /> Казначей</h3>
              <p className="mt-1 text-sm text-slate-600">Тут збираються погоджені й заплановані платежі для вивантаження в клієнт-банк.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} onClick={exportBankClientCsv}>
                <Download size={14} /> Вивантажити для клієнт-банку
              </button>
              <button type="button" className={btnSecondary} onClick={exportTreasuryCsv}>
                <Download size={14} /> Вивантажити CSV
              </button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="text-xs text-blue-700">Платежів у черзі</div>
              <div className="mt-1 text-xl font-bold text-blue-900">{treasuryQueue.length}</div>
            </div>
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <div className="text-xs text-indigo-700">На сьогодні</div>
              <div className="mt-1 text-xl font-bold text-indigo-900">{todayQueue.length}</div>
              <div className="text-sm text-indigo-700">{formatMoney(todayAmount)} грн</div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-xs text-emerald-700">Сума до оплати</div>
              <div className="mt-1 text-xl font-bold text-emerald-900">{formatMoney(totalAmount)} грн</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-600">Без обраного платника</div>
              <div className="mt-1 text-xl font-bold text-slate-800">{treasuryQueue.filter((payment) => !payment.payerId && !payment.paidBy).length}</div>
            </div>
          </div>
        </div>

        <div className={cardClass}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label className="text-xs font-semibold text-slate-600">Період</label>
              <select className={`${inputClass} !mt-0.5`} value={treasuryDatePreset} onChange={(e) => setTreasuryDatePreset(e.target.value)}>
                <option value="all">Усі дати</option>
                <option value="today">Сьогодні</option>
                <option value="tomorrow">Завтра</option>
                <option value="week">7 днів</option>
                <option value="custom">Проміжок дат</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Від</label>
              <input type="date" className={`${inputClass} !mt-0.5`} value={treasuryDatePreset === "custom" ? treasuryDateFrom : treasuryRangeFrom} onChange={(e) => { setTreasuryDatePreset("custom"); setTreasuryDateFrom(e.target.value); }} disabled={treasuryDatePreset !== "custom"} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">До</label>
              <input type="date" className={`${inputClass} !mt-0.5`} value={treasuryDatePreset === "custom" ? treasuryDateTo : treasuryRangeTo} onChange={(e) => { setTreasuryDatePreset("custom"); setTreasuryDateTo(e.target.value); }} disabled={treasuryDatePreset !== "custom"} />
            </div>
            <div className="flex items-end">
              <button type="button" className={btnSecondary} onClick={() => { setTreasuryDatePreset("all"); setTreasuryDateFrom(""); setTreasuryDateTo(""); }}>
                Скинути фільтр
              </button>
            </div>
          </div>
        </div>

        {selectedChiefPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setAccountantDetailsPaymentId("")}>
            <div className="mx-4 w-full max-w-3xl rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold">Картка платежу для головного бухгалтера</h3>
              <div className="mt-1 text-sm text-slate-500">{selectedChiefPayment.title} · {formatMoney(selectedChiefPayment.amount)} {selectedChiefPayment.currency}</div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold text-slate-500">Контрагент</div>
                  <div className="text-sm text-slate-800">{selectedChiefPayment.counterparty || "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">IBAN</div>
                  <div className="text-sm text-slate-800">{selectedChiefPayment.iban || "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Опис / коментар</div>
                  <div className="text-sm text-slate-800">{selectedChiefPayment.description || "—"}</div>
                </div>
              </div>

              <div className="mt-4">
                <label className="text-sm font-semibold">Платник</label>
                <select className={inputClass} value={chiefPayerChoice} onChange={(e) => setChiefPayerChoice(e.target.value)}>
                  <option value="">Оберіть платника</option>
                  {getPayersForRestaurant(selectedChiefPayment.restaurant).map((payer) => (
                    <option key={payer.id} value={payer.id}>{payer.name}</option>
                  ))}
                </select>
              </div>

              <div className="mt-4">
                <div className="text-sm font-semibold">Вкладення ({normalizeAttachments(selectedChiefPayment.attachments).length})</div>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {normalizeAttachments(selectedChiefPayment.attachments).map((attachment) => {
                    const isImage = attachment.type.startsWith("image/");
                    return (
                      <button
                        key={attachment.id}
                        type="button"
                        className="flex items-center gap-2 rounded border border-slate-200 p-2 text-left hover:bg-slate-50"
                        onClick={() => window.open(attachment.dataUrl, "_blank", "noopener,noreferrer")}
                      >
                        {isImage ? (
                          <img src={attachment.dataUrl} alt={attachment.name} className="h-10 w-10 rounded object-cover" />
                        ) : (
                          <FileText size={16} className="text-slate-500" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm text-indigo-700">{attachment.name}</div>
                          <div className="text-xs text-slate-500">{formatFileSize(attachment.size)}</div>
                        </div>
                      </button>
                    );
                  })}
                  {normalizeAttachments(selectedChiefPayment.attachments).length === 0 && (
                    <div className="text-xs text-slate-500">Вкладень немає.</div>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnApprove}
                  onClick={() => {
                    saveChiefDetails(selectedChiefPayment, chiefPayerChoice);
                    setAccountantDetailsPaymentId("");
                  }}
                >
                  <Check size={12} /> Зберегти платника і передати бухгалтеру
                </button>
                <button type="button" className={btnSecondary} onClick={() => setAccountantDetailsPaymentId("")}>Закрити</button>
              </div>
            </div>
          </div>
        )}

        <div className={cardClass}>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left">Платіж</th>
                  <th className="px-3 py-2 text-right">Сума</th>
                  <th className="px-3 py-2 text-left">Статус</th>
                  <th className="px-3 py-2 text-left">План</th>
                  <th className="px-3 py-2 text-left">Ініціатор</th>
                  <th className="px-3 py-2 text-left">Дії</th>
                </tr>
              </thead>
              <tbody>
                {treasuryQueue.map((payment) => {
                  const payer = payersById.get(String(payment.payerId || ""));
                  const assignPayer = (payerId) => {
                    const selectedPayer = payersById.get(payerId);
                    if (!selectedPayer) return;
                    const updatedData = { ...payment, payerId, paidBy: selectedPayer.name, updatedAt: new Date().toISOString() };
                    updateStoredRecord(payment.id, () => updatedData);
                    updatePaymentRequestApi(payment.id, updatedData).catch((err) =>
                      console.error("[PaymentRegistry] Failed to assign payer:", err)
                    );
                  };

                  return (
                    <tr key={payment.id} className="border-t border-slate-200 hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <div className="font-medium">{payment.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                          {payment.paymentNumber && <span className="font-mono">{payment.paymentNumber}</span>}
                          {payment.counterparty && <span>→ {payment.counterparty}</span>}
                          {payment.category && <span className="text-slate-400">{payment.category}</span>}
                        </div>
                        <div className="mt-1">
                          {payer ? (
                            <span className="text-xs text-slate-600">Платник: {payer.name}</span>
                          ) : (
                            <select className="rounded border border-orange-300 bg-orange-50 px-2 py-1 text-xs" value="" onChange={(e) => assignPayer(e.target.value)}>
                              <option value="">— Обрати платника —</option>
                              {payers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{formatMoney(payment.amount)} {payment.currency}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[payment.status] || ""}`}>
                          {PAYMENT_STATUSES[payment.status] || payment.status}
                        </span>
                        {payment.scheduledAt && (
                          <div className="mt-1 text-xs text-slate-500">Оновлено: {formatDateTime(payment.scheduledAt)}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        <div className="font-medium text-slate-900">{formatDate(getEffectivePaymentDate(payment))}</div>
                        {payment.scheduledForDate && payment.scheduledForDate !== payment.dueDate && (
                          <div className="text-blue-700">Заявка була на {formatDate(payment.dueDate)}</div>
                        )}
                        {payment.scheduledByName && (
                          <div className="text-slate-400">Планував: {payment.scheduledByName}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div>{payment.requestedByName || "-"}</div>
                        <div className="text-slate-400">{formatDateTime(payment.createdAt)}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(payment.status === "approved" || payment.status === "scheduled") && (
                            <button type="button" className={btnSecondary} onClick={() => openScheduleModal(payment)}>
                              <Clock3 size={12} /> {payment.status === "scheduled" ? "Перенести" : "Запланувати"}
                            </button>
                          )}
                          {(payment.status === "approved" || payment.status === "scheduled") && (
                            <button type="button" className={btnApprove} onClick={() => markPaid(payment)}>
                              <Check size={12} /> Оплачено
                            </button>
                          )}
                          <button type="button" className={btnSecondary} disabled={Boolean(processingId)} onClick={() => togglePaymentPaused(payment)}>
                            <Pause size={12} /> Пауза
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {treasuryQueue.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-500">Немає платежів для казначея за обраним періодом.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {scheduleModal?.payment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setScheduleModal(null)}>
            <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold">Планування платежу</h3>
              <p className="mt-1 text-sm text-slate-500">{scheduleModal.payment.title}</p>
              <div className="mt-4">
                <label className="text-sm font-semibold">Дата оплати</label>
                <input type="date" className={inputClass} value={scheduleModal.date} onChange={(e) => setScheduleModal((prev) => ({ ...prev, date: e.target.value }))} />
              </div>
              <div className="mt-4 flex gap-2">
                <button type="button" className={btnPrimary} onClick={confirmSchedulePayment} disabled={Boolean(processingId)}>
                  <Clock3 size={14} /> Зберегти дату
                </button>
                <button type="button" className={btnSecondary} onClick={() => setScheduleModal(null)}>
                  Скасувати
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Render: Типові поля ───
  const renderTypicalFields = () => (
    <div className="space-y-5">
      <div className={cardClass}>
        <h3 className="text-base font-semibold">Статті РГК</h3>
        <p className="mt-1 text-sm text-slate-600">Управляйте переліком статей РГК. Код + Назва.</p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left w-24">Код</th>
                <th className="px-3 py-2 text-left">Назва</th>
                <th className="px-3 py-2 text-left w-16">Дії</th>
              </tr>
            </thead>
            <tbody>
              {(typicalFields.articles || []).map((art) => (
                <tr key={art.code} className="border-t border-slate-200">
                  <td className="px-3 py-1.5 font-mono text-xs">{art.code}</td>
                  <td className="px-3 py-1.5">{art.name}</td>
                  <td className="px-3 py-1.5">
                    <button type="button" onClick={() => saveTypicalFields({ ...typicalFields, articles: typicalFields.articles.filter((a) => a.code !== art.code) })} className="p-1 hover:bg-red-50 rounded">
                      <X size={14} className="text-red-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex gap-2">
          <input className={`${inputClass} max-w-[100px]`} id="newArticleCode" placeholder="Код" />
          <input className={`${inputClass} max-w-xs`} id="newArticleName" placeholder="Назва статті" onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const code = document.getElementById("newArticleCode")?.value?.trim();
            const name = e.target.value.trim();
            if (!code || !name) return;
            if ((typicalFields.articles || []).some((a) => a.code === code)) { alert("Стаття з таким кодом вже існує."); return; }
            saveTypicalFields({ ...typicalFields, articles: [...(typicalFields.articles || []), { code, name }] });
            document.getElementById("newArticleCode").value = "";
            e.target.value = "";
          }} />
          <button type="button" className={btnPrimary} onClick={() => {
            const code = document.getElementById("newArticleCode")?.value?.trim();
            const name = document.getElementById("newArticleName")?.value?.trim();
            if (!code || !name) { alert("Вкажіть код і назву статті."); return; }
            if ((typicalFields.articles || []).some((a) => a.code === code)) { alert("Стаття з таким кодом вже існує."); return; }
            saveTypicalFields({ ...typicalFields, articles: [...(typicalFields.articles || []), { code, name }] });
            document.getElementById("newArticleCode").value = "";
            document.getElementById("newArticleName").value = "";
          }}>
            <Plus size={14} /> Додати
          </button>
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="text-base font-semibold">Підстатті РГК</h3>
        <p className="mt-1 text-sm text-slate-600">Підстатті прив'язуються до статей. Код + Назва + Стаття-батько.</p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left w-24">Код</th>
                <th className="px-3 py-2 text-left">Назва</th>
                <th className="px-3 py-2 text-left">Стаття</th>
                <th className="px-3 py-2 text-left w-16">Дії</th>
              </tr>
            </thead>
            <tbody>
              {(typicalFields.subArticles || []).map((sa) => {
                const parent = (typicalFields.articles || []).find((a) => a.code === sa.articleCode);
                return (
                  <tr key={sa.code} className="border-t border-slate-200">
                    <td className="px-3 py-1.5 font-mono text-xs">{sa.code}</td>
                    <td className="px-3 py-1.5">{sa.name}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-500">{parent ? `${parent.code} ${parent.name}` : sa.articleCode}</td>
                    <td className="px-3 py-1.5">
                      <button type="button" onClick={() => saveTypicalFields({ ...typicalFields, subArticles: typicalFields.subArticles.filter((s) => s.code !== sa.code) })} className="p-1 hover:bg-red-50 rounded">
                        <X size={14} className="text-red-400" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {(!typicalFields.subArticles || typicalFields.subArticles.length === 0) && (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400 text-xs">Підстатей поки немає</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex gap-2 flex-wrap">
          <select className={`${inputClass} max-w-[200px]`} id="newSubArticleParent">
            <option value="">Стаття-батько</option>
            {(typicalFields.articles || []).map((art) => (
              <option key={art.code} value={art.code}>{art.code} {art.name}</option>
            ))}
          </select>
          <input className={`${inputClass} max-w-[100px]`} id="newSubArticleCode" placeholder="Код" />
          <input className={`${inputClass} max-w-xs`} id="newSubArticleName" placeholder="Назва підстатті" />
          <button type="button" className={btnPrimary} onClick={() => {
            const articleCode = document.getElementById("newSubArticleParent")?.value?.trim();
            const code = document.getElementById("newSubArticleCode")?.value?.trim();
            const name = document.getElementById("newSubArticleName")?.value?.trim();
            if (!articleCode || !code || !name) { alert("Вкажіть статтю-батька, код і назву підстатті."); return; }
            if ((typicalFields.subArticles || []).some((s) => s.code === code)) { alert("Підстаття з таким кодом вже існує."); return; }
            saveTypicalFields({ ...typicalFields, subArticles: [...(typicalFields.subArticles || []), { code, name, articleCode }] });
            document.getElementById("newSubArticleCode").value = "";
            document.getElementById("newSubArticleName").value = "";
          }}>
            <Plus size={14} /> Додати
          </button>
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="text-base font-semibold">Валюта за замовчуванням</h3>
        <select className={`${inputClass} max-w-xs`} value={typicalFields.defaultCurrency} onChange={(e) => saveTypicalFields({ ...typicalFields, defaultCurrency: e.target.value })}>
          <option value="UAH">UAH (₴)</option>
          <option value="USD">USD ($)</option>
          <option value="EUR">EUR (€)</option>
        </select>
      </div>

      <div className={cardClass}>
        <h3 className="text-base font-semibold">Ставки ПДВ</h3>
        <p className="mt-1 text-sm text-slate-600">Управляйте переліком ставок ПДВ, які доступні при створенні заявки на платіж.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(typicalFields.vatRates || []).map((rate) => (
            <span key={rate} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700 border border-blue-200">
              {rate}%
              <button type="button" onClick={() => saveTypicalFields({ ...typicalFields, vatRates: (typicalFields.vatRates || []).filter((r) => r !== rate) })} className="ml-1 rounded-full p-0.5 text-blue-400 hover:bg-blue-100 hover:text-blue-700">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input type="number" min="0" max="100" step="0.01" className={`${inputClass} max-w-[120px]`} id="newVatRateInput" placeholder="Напр. 20" onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const val = Number.parseFloat(e.target.value);
            if (!Number.isFinite(val) || val < 0) return;
            if ((typicalFields.vatRates || []).includes(val)) { alert("Така ставка вже існує."); return; }
            saveTypicalFields({ ...typicalFields, vatRates: [...(typicalFields.vatRates || []), val].sort((a, b) => a - b) });
            e.target.value = "";
          }} />
          <button type="button" className={btnPrimary} onClick={() => {
            const input = document.getElementById("newVatRateInput");
            const val = Number.parseFloat(input?.value);
            if (!Number.isFinite(val) || val < 0) { alert("Введіть коректну ставку."); return; }
            if ((typicalFields.vatRates || []).includes(val)) { alert("Така ставка вже існує."); return; }
            saveTypicalFields({ ...typicalFields, vatRates: [...(typicalFields.vatRates || []), val].sort((a, b) => a - b) });
            if (input) input.value = "";
          }}>
            <Plus size={14} /> Додати
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Render: База контрагентів ───
  const renderContractorsBase = () => <ContractorsBaseTab counterparties={counterparties} addCounterparty={addCounterparty} updateCounterparty={updateCounterparty} removeCounterparty={removeCounterparty} />;

  // ─── Render: База платників ───
  const renderPayersBase = () => <PayersBaseTab payers={payers} addPayer={addPayer} updatePayer={updatePayer} removePayer={removePayer} restaurants={restaurants} />;

  // ─── Render: Погоджувачі ───
  const renderApproversTab = () => <ApproversTab approvalRoutes={approvalRoutes} addApprovalRoute={addApprovalRoute} updateApprovalRoute={updateApprovalRoute} removeApprovalRoute={removeApprovalRoute} categories={typicalFields.articles ? typicalFields.articles.map((a) => `${a.code} ${a.name}`) : typicalFields.categories} />;

  const renderAccountantTab = () => {
    const queue = paymentRequests
      .filter((p) => p.status === "accounting")
      .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

    const chiefStage = queue.filter((p) => (p.accountingStage || "chief") === "chief");
    const articleStage = queue.filter((p) => p.accountingStage === "article");

    const applyPurposeRules = (payment, rawPurpose, articleCode, subArticleCode) => {
      const amount = Number(payment.amount) || 0;
      const vatSuffix = buildVatTitleTail(amount, payment.vatMode, payment.vatRate);
      const basePurpose = String(rawPurpose || payment.paymentPurpose || payment.title || "")
        .replace(/,\s*(без ПДВ|в т\.ч\. ПДВ\s*\d+(\.\d+)?%(\s*-\s*[\d\s]+[,.]?\d*\s*грн)?)(\s*\/\/.*)?$/g, "")
        .replace(/\s*\/\/.*$/, "")
        .trim();
      const codeSuffix = [articleCode, subArticleCode].filter(Boolean).join("//");
      return `${basePurpose}${vatSuffix}${codeSuffix ? ` //${codeSuffix}` : ""}`.trim();
    };

    const getSelection = (payment) => {
      const current = accountantSelections[payment.id] || {};
      const articleCode = current.articleCode ?? payment.articleCode ?? "";
      const subArticleCode = current.subArticleCode ?? payment.subArticleCode ?? "";
      return {
        payerId: current.payerId ?? payment.payerId ?? "",
        articleCode,
        subArticleCode,
        paymentPurpose: current.paymentPurpose ?? applyPurposeRules(payment, payment.paymentPurpose || payment.title || "", articleCode, subArticleCode),
      };
    };

    const setSelection = (paymentId, patch) => {
      setAccountantSelections((prev) => ({
        ...prev,
        [paymentId]: {
          ...(prev[paymentId] || {}),
          ...patch,
        },
      }));
    };

    const saveChiefDetails = (payment, payerId, articleCode, subArticleCode) => {
      const payer = payersById.get(String(payerId || ""));
      if (!payer) {
        alert("Оберіть платника.");
        return;
      }
      const art = (typicalFields.articles || []).find((a) => a.code === articleCode);
      const nowIso = new Date().toISOString();
      const updatedData = {
        ...payment,
        payerId: payer.id,
        paidBy: payer.name,
        articleCode: articleCode || payment.articleCode || "",
        subArticleCode: subArticleCode || "",
        category: art ? `${art.code} ${art.name}` : (payment.category || ""),
        accountingStage: "article",
        updatedAt: nowIso,
        approvals: [
          ...(payment.approvals || []),
          {
            action: "accounting_payer_set",
            at: nowIso,
            byId: myUserId,
            byName: myName,
            comment: `Платник: ${payer.name}${articleCode ? `, стаття: ${articleCode}` : ""}${subArticleCode ? `/${subArticleCode}` : ""}`,
          },
        ],
      };
      updateStoredRecord(payment.id, () => updatedData);
      updatePaymentRequestApi(payment.id, updatedData).catch((err) =>
        console.error("[PaymentRegistry] Failed to set payer details:", err)
      );
      writeAudit({
        action: "payment_accountant_set_payer",
        entityType: "payment_request",
        entityId: payment.id,
        description: `Для платежу "${payment.title}" обрано платника ${payer.name}`,
      });
    };

    const sendToTreasury = (payment, articleCode, subArticleCode, paymentPurpose) => {
      if (!payment.payerId) {
        alert("Спочатку оберіть платника у верхньому модулі.");
        return;
      }
      if (!articleCode) {
        alert("Оберіть статтю витрат.");
        return;
      }
      const normalizedPurpose = applyPurposeRules(payment, paymentPurpose, articleCode, subArticleCode);
      if (!normalizedPurpose) {
        alert("Заповніть призначення платежу.");
        return;
      }
      const art = (typicalFields.articles || []).find((a) => a.code === articleCode);
      const nowIso = new Date().toISOString();
      const updatedData = {
        ...payment,
        status: "approved",
        accountingStage: "done",
        articleCode,
        subArticleCode: subArticleCode || "",
        paymentPurpose: normalizedPurpose,
        category: art ? `${art.code} ${art.name}` : payment.category,
        updatedAt: nowIso,
        approvals: [
          ...(payment.approvals || []),
          { action: "accounting_to_treasury", at: nowIso, byId: myUserId, byName: myName },
        ],
      };
      updateStoredRecord(payment.id, () => updatedData);
      updatePaymentRequestApi(payment.id, updatedData).catch((err) =>
        console.error("[PaymentRegistry] Failed to send payment to treasury:", err)
      );
      writeAudit({
        action: "payment_sent_to_treasury",
        entityType: "payment_request",
        entityId: payment.id,
        description: `Платіж "${payment.title}" передано до казначея`,
      });
      pushCenterNotification(
        "Новий платіж до казначея",
        `${payment.title} · ${formatMoney(payment.amount)} ${payment.currency}`
      );
    };

    const openChiefDetails = (payment) => {
      setAccountantDetailsPaymentId(payment.id);
      setChiefPayerChoice(payment.payerId || "");
      setChiefArticleChoice(payment.articleCode || "");
      setChiefSubArticleChoice(payment.subArticleCode || "");
    };

    const selectedChiefPayment = chiefStage.find((payment) => payment.id === accountantDetailsPaymentId) || null;

    return (
      <div className="space-y-5">
        <div className={cardClass}>
          <h3 className="text-base font-semibold">Головний бухгалтер: реквізити платника</h3>
          <p className="mt-1 text-sm text-slate-500">Після погодження платежі потрапляють сюди для вибору платника.</p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left">Платіж</th>
                  <th className="px-3 py-2 text-right">Сума</th>
                  <th className="px-3 py-2 text-left">Контрагент / IBAN</th>
                  <th className="px-3 py-2 text-left">Дія</th>
                </tr>
              </thead>
              <tbody>
                {chiefStage.map((payment) => (
                  <tr key={payment.id} className="border-t border-slate-200 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <button type="button" className="text-left font-medium text-indigo-700 hover:underline" onClick={() => openChiefDetails(payment)}>
                        {payment.title}
                      </button>
                      <div className="text-xs text-slate-500">Платник: {payment.paidBy || "не обрано"}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{formatMoney(payment.amount)} {payment.currency}</td>
                    <td className="px-3 py-2">
                      <div className="text-xs text-slate-600">{payment.counterparty || "—"}</div>
                      <div className="text-xs text-slate-400">{payment.iban || "IBAN не заповнено"}</div>
                      <div className="text-xs text-slate-400">Вкладень: {normalizeAttachments(payment.attachments).length}</div>
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" className={btnSecondary} onClick={() => openChiefDetails(payment)}>
                        Відкрити картку
                      </button>
                    </td>
                  </tr>
                ))}
                {chiefStage.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">Немає заявок для вибору платника.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={cardClass}>
          <h3 className="text-base font-semibold">Бухгалтер: стаття і передача казначею</h3>
          <p className="mt-1 text-sm text-slate-500">Після вибору платника оберіть статтю витрат і передайте заявку у казначейство.</p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left">Платіж</th>
                  <th className="px-3 py-2 text-right">Сума</th>
                  <th className="px-3 py-2 text-left">Стаття</th>
                  <th className="px-3 py-2 text-left">Підстаття</th>
                  <th className="px-3 py-2 text-left">Призначення платежу</th>
                  <th className="px-3 py-2 text-left">Дія</th>
                </tr>
              </thead>
              <tbody>
                {articleStage.map((payment) => (
                  (() => {
                    const selection = getSelection(payment);
                    const selectedArticleCode = selection.articleCode;
                    const availableSubArticles = (typicalFields.subArticles || []).filter((sa) => sa.articleCode === selectedArticleCode);
                    return (
                  <tr key={payment.id} className="border-t border-slate-200 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="font-medium">{payment.title}</div>
                      <div className="text-xs text-slate-500">Платник: {payment.paidBy || "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{formatMoney(payment.amount)} {payment.currency}</td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                        value={selectedArticleCode}
                        onChange={(e) => {
                          const nextArticleCode = e.target.value;
                          const nextPurpose = applyPurposeRules(payment, selection.paymentPurpose, nextArticleCode, "");
                          setSelection(payment.id, { articleCode: nextArticleCode, subArticleCode: "", paymentPurpose: nextPurpose });
                        }}
                      >
                        <option value="">Оберіть статтю</option>
                        {(typicalFields.articles || []).map((article) => (
                          <option key={article.code} value={article.code}>{article.code} {article.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                        value={selection.subArticleCode}
                        onChange={(e) => {
                          const nextSubArticleCode = e.target.value;
                          const nextPurpose = applyPurposeRules(payment, selection.paymentPurpose, selectedArticleCode, nextSubArticleCode);
                          setSelection(payment.id, { subArticleCode: nextSubArticleCode, paymentPurpose: nextPurpose });
                        }}
                      >
                        <option value="">Без підстатті</option>
                        {availableSubArticles.map((sa) => (
                          <option key={sa.code} value={sa.code}>{sa.code} {sa.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex min-w-[320px] items-center gap-2">
                        <input
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                          value={selection.paymentPurpose || ""}
                          onChange={(e) => setSelection(payment.id, { paymentPurpose: e.target.value })}
                          placeholder="Вкажіть призначення платежу"
                        />
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={() => setSelection(payment.id, { paymentPurpose: applyPurposeRules(payment, selection.paymentPurpose, selectedArticleCode, selection.subArticleCode) })}
                          title="Підтягнути правила ПДВ і статей"
                        >
                          Правила
                        </button>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">ПДВ і коди статей додаються в кінець автоматично.</div>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className={btnApprove}
                        onClick={() => sendToTreasury(payment, selectedArticleCode, selection.subArticleCode, selection.paymentPurpose)}
                      >
                        <Send size={12} /> Передати казначею
                      </button>
                    </td>
                  </tr>
                    );
                  })()
                ))}
                {articleStage.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">Немає заявок для передачі в казначейство.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selectedChiefPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setAccountantDetailsPaymentId("")}>
            <div className="mx-4 w-full max-w-3xl rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold">Картка платежу для головного бухгалтера</h3>
              <div className="mt-1 text-sm text-slate-500">{selectedChiefPayment.title} · {formatMoney(selectedChiefPayment.amount)} {selectedChiefPayment.currency}</div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold text-slate-500">Контрагент</div>
                  <div className="text-sm text-slate-800">{selectedChiefPayment.counterparty || "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">IBAN</div>
                  <div className="text-sm text-slate-800">{selectedChiefPayment.iban || "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Опис / коментар</div>
                  <div className="text-sm text-slate-800">{selectedChiefPayment.description || "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Номер платежу</div>
                  <div className="text-sm text-slate-800">{selectedChiefPayment.paymentNumber || "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Заклад / витрати закладу</div>
                  <div className="text-sm text-slate-800">{selectedChiefPayment.restaurant || "—"} / {selectedChiefPayment.expenseRestaurant || "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Терміновість</div>
                  <div className="text-sm text-slate-800">{URGENCY_LEVELS[selectedChiefPayment.urgency] || selectedChiefPayment.urgency || "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Бажана дата оплати</div>
                  <div className="text-sm text-slate-800">{formatDate(selectedChiefPayment.dueDate)}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Ініціатор</div>
                  <div className="text-sm text-slate-800">{selectedChiefPayment.requestedByName || "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Створено</div>
                  <div className="text-sm text-slate-800">{formatDateTime(selectedChiefPayment.createdAt)}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                <label className="text-sm font-semibold">Платник</label>
                <select className={inputClass} value={chiefPayerChoice} onChange={(e) => setChiefPayerChoice(e.target.value)}>
                  <option value="">Оберіть платника</option>
                  {getPayersForRestaurant(selectedChiefPayment.restaurant).map((payer) => (
                    <option key={payer.id} value={payer.id}>{payer.name}</option>
                  ))}
                </select>
                </div>
                <div>
                  <label className="text-sm font-semibold">Стаття</label>
                  <select className={inputClass} value={chiefArticleChoice} onChange={(e) => {
                    setChiefArticleChoice(e.target.value);
                    setChiefSubArticleChoice("");
                  }}>
                    <option value="">Оберіть статтю</option>
                    {(typicalFields.articles || []).map((article) => (
                      <option key={article.code} value={article.code}>{article.code} {article.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-semibold">Підстаття</label>
                  <select className={inputClass} value={chiefSubArticleChoice} onChange={(e) => setChiefSubArticleChoice(e.target.value)}>
                    <option value="">Без підстатті</option>
                    {(typicalFields.subArticles || []).filter((sa) => sa.articleCode === chiefArticleChoice).map((sa) => (
                      <option key={sa.code} value={sa.code}>{sa.code} {sa.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-sm font-semibold">Вкладення ({normalizeAttachments(selectedChiefPayment.attachments).length})</div>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {normalizeAttachments(selectedChiefPayment.attachments).map((attachment) => {
                    const isImage = attachment.type.startsWith("image/");
                    return (
                      <button
                        key={attachment.id}
                        type="button"
                        className="flex items-center gap-2 rounded border border-slate-200 p-2 text-left hover:bg-slate-50"
                        onClick={() => window.open(attachment.dataUrl, "_blank", "noopener,noreferrer")}
                      >
                        {isImage ? (
                          <img src={attachment.dataUrl} alt={attachment.name} className="h-10 w-10 rounded object-cover" />
                        ) : (
                          <FileText size={16} className="text-slate-500" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm text-indigo-700">{attachment.name}</div>
                          <div className="text-xs text-slate-500">{formatFileSize(attachment.size)}</div>
                        </div>
                      </button>
                    );
                  })}
                  {normalizeAttachments(selectedChiefPayment.attachments).length === 0 && (
                    <div className="text-xs text-slate-500">Вкладень немає.</div>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnApprove}
                  onClick={() => {
                    saveChiefDetails(selectedChiefPayment, chiefPayerChoice, chiefArticleChoice, chiefSubArticleChoice);
                    setAccountantDetailsPaymentId("");
                  }}
                >
                  <Check size={12} /> Зберегти платника і передати бухгалтеру
                </button>
                <button type="button" className={btnSecondary} onClick={() => setAccountantDetailsPaymentId("")}>Закрити</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Tab Router ───
  const tabKey = String(topTab || "").toLowerCase();

  if (tabKey.includes("mypayment") || tabKey.includes("moiplatezhi") || tabKey === "мої платежі") {
    return renderMyPayments();
  }

  if (tabKey.includes("typical") || tabKey.includes("typovi") || tabKey.includes("типові") || tabKey.includes("paymentfields")) {
    return renderTypicalFields();
  }

  if (tabKey.includes("paymentsbase") || tabKey.includes("contractor") || tabKey.includes("контрагент") || tabKey.includes("counterpart")) {
    return renderContractorsBase();
  }

  if (tabKey.includes("baseofplatniki") || tabKey.includes("платник")) {
    return renderPayersBase();
  }

  if (tabKey.includes("approvalpeople") || tabKey.includes("погоджувач")) {
    return renderApproversTab();
  }

  if (tabKey.includes("bukhalter") || tabKey.includes("бухгалтер")) {
    return renderAccountantTab();
  }

  if (isTreasuryTabKey(tabKey)) {
    return renderTreasuryTab();
  }

  // Default: payment request / registry
  return renderPaymentRequest();
}

/* ═══════════════════════════════════════════════════
   CONTRACTORS BASE TAB
   ═══════════════════════════════════════════════════ */

const cardClassLocal = "card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl";
const inputClassLocal = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";
const btnPrimaryLocal = "inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60";
const btnSecondaryLocal = "inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100";

function ContractorsBaseTab({ counterparties, addCounterparty, updateCounterparty, removeCounterparty }) {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingCp, setEditingCp] = useState(null);
  const [form, setForm] = useState({ name: "", edrpou: "", iban: "", mfo: "", vatMode: "none", vatRate: "", contactPerson: "", phone: "", email: "", address: "", notes: "" });

  const resetForm = () => {
    setForm({ name: "", edrpou: "", iban: "", mfo: "", vatMode: "none", vatRate: "", contactPerson: "", phone: "", email: "", address: "", notes: "" });
    setEditingCp(null);
    setShowForm(false);
  };

  const openNew = () => { resetForm(); setShowForm(true); };

  const openEdit = (cp) => {
    setForm({
      name: cp.name || "",
      edrpou: cp.edrpou || "",
      iban: cp.iban || "",
      mfo: cp.mfo || "",
      vatMode: cp.vatMode || "none",
      vatRate: cp.vatRate || "",
      contactPerson: cp.contactPerson || "",
      phone: cp.phone || "",
      email: cp.email || "",
      address: cp.address || "",
      notes: cp.notes || "",
    });
    setEditingCp(cp);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { alert("Вкажіть назву контрагента."); return; }
    if (editingCp) {
      updateCounterparty(editingCp.id, form);
    } else {
      addCounterparty(form);
    }
    resetForm();
  };

  const handleDelete = (cp) => {
    if (!window.confirm(`Видалити контрагента "${cp.name}"?`)) return;
    removeCounterparty(cp.id);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return counterparties;
    return counterparties.filter((c) =>
      [c.name, c.edrpou, c.iban, c.mfo, c.contactPerson, c.phone, c.email, c.address]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [counterparties, search]);

  const exportToExcel = () => {
    const rows = counterparties.map((c) => ({
      "Назва": c.name || "",
      "ЄДРПОУ": c.edrpou || "",
      "IBAN": c.iban || "",
      "МФО": c.mfo || "",
      "ПДВ": c.vatMode === "with" ? `${c.vatRate || 20}%` : c.vatMode === "without" ? "без ПДВ" : "",
      "Контактна особа": c.contactPerson || "",
      "Телефон": c.phone || "",
      "Email": c.email || "",
      "Адреса": c.address || "",
      "Примітки": c.notes || "",
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Контрагенти");
    XLSX.writeFile(wb, "counterparties.xlsx");
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{ "Назва": "", "ЄДРПОУ": "", "IBAN": "", "МФО": "", "ПДВ": "", "Контактна особа": "", "Телефон": "", "Email": "", "Адреса": "", "Примітки": "" }]);
    XLSX.utils.book_append_sheet(wb, ws, "Контрагенти");
    XLSX.writeFile(wb, "counterparties_template.xlsx");
  };

  const importFromExcel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const ws = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      let added = 0;
      rows.forEach((row) => {
        const name = String(row["Назва"] || row["назва"] || row["Name"] || "").trim();
        if (!name) return;
        const pdv = String(row["ПДВ"] || row["пдв"] || "").trim().toLowerCase();
        let vatMode = "none";
        let vatRate = "";
        if (pdv.includes("без")) { vatMode = "without"; }
        else if (pdv.includes("%")) { vatMode = "with"; vatRate = pdv.replace(/[^0-9.,]/g, "").replace(",", "."); }
        addCounterparty({
          name,
          edrpou: String(row["ЄДРПОУ"] || row["єдрпоу"] || "").trim(),
          iban: String(row["IBAN"] || row["iban"] || "").trim(),
          mfo: String(row["МФО"] || row["мфо"] || "").trim(),
          vatMode, vatRate,
          contactPerson: String(row["Контактна особа"] || "").trim(),
          phone: String(row["Телефон"] || "").trim(),
          email: String(row["Email"] || row["email"] || "").trim(),
          address: String(row["Адреса"] || "").trim(),
          notes: String(row["Примітки"] || "").trim(),
        });
        added++;
      });
      alert(`Імпортовано ${added} контрагентів.`);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className={cardClassLocal}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2"><Building2 size={18} /> База контрагентів</h3>
            <p className="text-sm text-slate-500 mt-1">Ведіть реєстр контрагентів для швидкого вибору при створенні та погодженні платежів.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimaryLocal} onClick={openNew}>
              <Plus size={14} /> Новий контрагент
            </button>
            <button type="button" className={btnSecondaryLocal} onClick={exportToExcel}>
              <Download size={14} /> Excel
            </button>
            <label className={`${btnSecondaryLocal} cursor-pointer`}>
              <Upload size={14} /> Імпорт
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importFromExcel} />
            </label>
            <button type="button" className={btnSecondaryLocal} onClick={downloadTemplate}>
              <FileText size={14} /> Шаблон
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className={cardClassLocal}>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputClassLocal} !pl-9 !mt-0`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук за назвою, ЄДРПОУ, IBAN, контактною особою…"
          />
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className={cardClassLocal}>
          <h4 className="text-sm font-semibold mb-3">{editingCp ? "Редагувати контрагента" : "Новий контрагент"}</h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-sm font-semibold">Назва (юрособа / ФОП) *</label>
              <input className={inputClassLocal} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder='ТОВ "Ланч Сервіс"' />
            </div>
            <div>
              <label className="text-sm font-semibold">ЄДРПОУ / ІПН</label>
              <input className={inputClassLocal} value={form.edrpou} onChange={(e) => setForm((p) => ({ ...p, edrpou: e.target.value }))} placeholder="12345678" />
            </div>
            <div>
              <label className="text-sm font-semibold">IBAN / розрахунковий рахунок</label>
              <input className={inputClassLocal} value={form.iban} onChange={(e) => setForm((p) => ({ ...p, iban: e.target.value }))} placeholder="UA..." />
            </div>
            <div>
              <label className="text-sm font-semibold">МФО банку</label>
              <input className={inputClassLocal} value={form.mfo} onChange={(e) => setForm((p) => ({ ...p, mfo: e.target.value }))} placeholder="123456" />
            </div>
            <div>
              <label className="text-sm font-semibold">ПДВ за замовчуванням</label>
              <div className="flex gap-1 mt-1">
                <button type="button" className={`rounded-lg px-2 py-1.5 text-xs font-semibold border transition-colors ${form.vatMode === "none" ? "border-slate-500 bg-slate-100 text-slate-800" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`} onClick={() => setForm((p) => ({ ...p, vatMode: "none", vatRate: "" }))}>—</button>
                <button type="button" className={`rounded-lg px-2 py-1.5 text-xs font-semibold border transition-colors ${form.vatMode === "without" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`} onClick={() => setForm((p) => ({ ...p, vatMode: "without", vatRate: "" }))}>Без ПДВ</button>
                <button type="button" className={`rounded-lg px-2 py-1.5 text-xs font-semibold border transition-colors ${form.vatMode === "with" ? "border-blue-500 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`} onClick={() => setForm((p) => ({ ...p, vatMode: "with", vatRate: p.vatRate || "20" }))}>З ПДВ</button>
              </div>
              {form.vatMode === "with" && (
                <input type="number" min="0" max="100" step="0.01" className={inputClassLocal} value={form.vatRate} onChange={(e) => setForm((p) => ({ ...p, vatRate: e.target.value }))} placeholder="Ставка %" />
              )}
            </div>
            <div>
              <label className="text-sm font-semibold">Контактна особа</label>
              <input className={inputClassLocal} value={form.contactPerson} onChange={(e) => setForm((p) => ({ ...p, contactPerson: e.target.value }))} placeholder="Іванов Іван Іванович" />
            </div>
            <div>
              <label className="text-sm font-semibold">Телефон</label>
              <input className={inputClassLocal} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+380..." />
            </div>
            <div>
              <label className="text-sm font-semibold">Email</label>
              <input type="email" className={inputClassLocal} value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="info@company.ua" />
            </div>
            <div>
              <label className="text-sm font-semibold">Адреса</label>
              <input className={inputClassLocal} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder="м. Київ, вул. ..." />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold">Примітки</label>
              <textarea className={`${inputClassLocal} min-h-[60px]`} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Додаткова інформація" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" className={btnPrimaryLocal} onClick={handleSubmit}>
              <Save size={14} /> {editingCp ? "Зберегти зміни" : "Додати контрагента"}
            </button>
            <button type="button" className={btnSecondaryLocal} onClick={resetForm}>Скасувати</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className={cardClassLocal}>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">Назва</th>
                <th className="px-3 py-2 text-left">ЄДРПОУ</th>
                <th className="px-3 py-2 text-left">IBAN</th>
                <th className="px-3 py-2 text-left">МФО</th>
                <th className="px-3 py-2 text-left">Контактна особа</th>
                <th className="px-3 py-2 text-left">Телефон</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Дії</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((cp) => (
                <tr key={cp.id} className="border-t border-slate-200 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">{cp.name}</td>
                  <td className="px-3 py-2">{cp.edrpou || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs max-w-[180px] truncate">{cp.iban || "—"}</td>
                  <td className="px-3 py-2">{cp.mfo || "—"}</td>
                  <td className="px-3 py-2">{cp.contactPerson || "—"}</td>
                  <td className="px-3 py-2">{cp.phone || "—"}</td>
                  <td className="px-3 py-2">{cp.email || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button type="button" className="p-1 hover:bg-slate-100 rounded" title="Редагувати" onClick={() => openEdit(cp)}>
                        <Edit3 size={15} className="text-slate-500" />
                      </button>
                      <button type="button" className="p-1 hover:bg-red-50 rounded" title="Видалити" onClick={() => handleDelete(cp)}>
                        <Trash2 size={15} className="text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    {counterparties.length === 0 ? "Контрагентів ще немає. Додайте першого." : "Нічого не знайдено."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">Всього: {counterparties.length} контрагентів</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   PAYERS BASE TAB (База платників)
   ═══════════════════════════════════════════════════ */

function PayersBaseTab({ payers, addPayer, updatePayer, removePayer, restaurants }) {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingPayer, setEditingPayer] = useState(null);
  const [form, setForm] = useState({ name: "", edrpou: "", iban: "", mfo: "", contactPerson: "", phone: "", email: "", address: "", notes: "", restaurantIds: [] });

  const resetForm = () => {
    setForm({ name: "", edrpou: "", iban: "", mfo: "", contactPerson: "", phone: "", email: "", address: "", notes: "", restaurantIds: [] });
    setEditingPayer(null);
    setShowForm(false);
  };

  const openNew = () => { resetForm(); setShowForm(true); };

  const openEdit = (p) => {
    setForm({
      name: p.name || "",
      edrpou: p.edrpou || "",
      iban: p.iban || "",
      mfo: p.mfo || "",
      contactPerson: p.contactPerson || "",
      phone: p.phone || "",
      email: p.email || "",
      address: p.address || "",
      notes: p.notes || "",
      restaurantIds: Array.isArray(p.restaurantIds) ? p.restaurantIds : [],
    });
    setEditingPayer(p);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { alert("Вкажіть назву платника."); return; }
    if (editingPayer) {
      updatePayer(editingPayer.id, form);
    } else {
      addPayer(form);
    }
    resetForm();
  };

  const handleDelete = (p) => {
    if (!window.confirm(`Видалити платника "${p.name}"?`)) return;
    removePayer(p.id);
  };

  const exportToExcel = () => {
    const rows = payers.map((p) => ({
      "Назва": p.name || "",
      "ЄДРПОУ": p.edrpou || "",
      "IBAN": p.iban || "",
      "МФО": p.mfo || "",
      "Контактна особа": p.contactPerson || "",
      "Телефон": p.phone || "",
      "Email": p.email || "",
      "Адреса": p.address || "",
      "Примітки": p.notes || "",
      "Заклади": Array.isArray(p.restaurantIds) ? p.restaurantIds.join(", ") : "",
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Платники");
    XLSX.writeFile(wb, "payers.xlsx");
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{ "Назва": "", "ЄДРПОУ": "", "IBAN": "", "МФО": "", "Контактна особа": "", "Телефон": "", "Email": "", "Адреса": "", "Примітки": "", "Заклади": "" }]);
    XLSX.utils.book_append_sheet(wb, ws, "Платники");
    XLSX.writeFile(wb, "payers_template.xlsx");
  };

  const importFromExcel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const ws = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      let added = 0;
      rows.forEach((row) => {
        const name = String(row["Назва"] || row["назва"] || row["Name"] || "").trim();
        if (!name) return;
        const restaurantsStr = String(row["Заклади"] || row["заклади"] || "").trim();
        const restaurantIds = restaurantsStr ? restaurantsStr.split(",").map((s) => s.trim()).filter(Boolean) : [];
        addPayer({
          name,
          edrpou: String(row["ЄДРПОУ"] || row["єдрпоу"] || "").trim(),
          iban: String(row["IBAN"] || row["iban"] || "").trim(),
          mfo: String(row["МФО"] || row["мфо"] || "").trim(),
          contactPerson: String(row["Контактна особа"] || "").trim(),
          phone: String(row["Телефон"] || "").trim(),
          email: String(row["Email"] || row["email"] || "").trim(),
          address: String(row["Адреса"] || "").trim(),
          notes: String(row["Примітки"] || "").trim(),
          restaurantIds,
        });
        added++;
      });
      alert(`Імпортовано ${added} платників.`);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return payers;
    return payers.filter((p) =>
      [p.name, p.edrpou, p.iban, p.mfo, p.contactPerson, p.phone, p.email, p.address, ...(Array.isArray(p.restaurantIds) ? p.restaurantIds : [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [payers, search]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className={cardClassLocal}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2"><Building2 size={18} /> База платників</h3>
            <p className="text-sm text-slate-500 mt-1">Реєстр осіб та організацій з нашого боку, які здійснюють оплати. Вибирайте платника при створенні заявки на платіж.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimaryLocal} onClick={openNew}>
              <Plus size={14} /> Новий платник
            </button>
            <button type="button" className={btnSecondaryLocal} onClick={exportToExcel}>
              <Download size={14} /> Excel
            </button>
            <label className={`${btnSecondaryLocal} cursor-pointer`}>
              <Upload size={14} /> Імпорт
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importFromExcel} />
            </label>
            <button type="button" className={btnSecondaryLocal} onClick={downloadTemplate}>
              <FileText size={14} /> Шаблон
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className={cardClassLocal}>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className={`${inputClassLocal} !pl-9 !mt-0`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук за назвою, ЄДРПОУ, IBAN, контактною особою…"
          />
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className={cardClassLocal}>
          <h4 className="text-sm font-semibold mb-3">{editingPayer ? "Редагувати платника" : "Новий платник"}</h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-sm font-semibold">Назва (юрособа / ФОП) *</label>
              <input className={inputClassLocal} value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder='ТОВ "La Accademia"' />
            </div>
            <div>
              <label className="text-sm font-semibold">ЄДРПОУ / ІПН</label>
              <input className={inputClassLocal} value={form.edrpou} onChange={(e) => setForm((prev) => ({ ...prev, edrpou: e.target.value }))} placeholder="12345678" />
            </div>
            <div>
              <label className="text-sm font-semibold">IBAN / розрахунковий рахунок</label>
              <input className={inputClassLocal} value={form.iban} onChange={(e) => setForm((prev) => ({ ...prev, iban: e.target.value }))} placeholder="UA..." />
            </div>
            <div>
              <label className="text-sm font-semibold">МФО банку</label>
              <input className={inputClassLocal} value={form.mfo} onChange={(e) => setForm((prev) => ({ ...prev, mfo: e.target.value }))} placeholder="123456" />
            </div>
            <div>
              <label className="text-sm font-semibold">Контактна особа</label>
              <input className={inputClassLocal} value={form.contactPerson} onChange={(e) => setForm((prev) => ({ ...prev, contactPerson: e.target.value }))} placeholder="Іванов Іван Іванович" />
            </div>
            <div>
              <label className="text-sm font-semibold">Телефон</label>
              <input className={inputClassLocal} value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="+380..." />
            </div>
            <div>
              <label className="text-sm font-semibold">Email</label>
              <input type="email" className={inputClassLocal} value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="info@company.ua" />
            </div>
            <div>
              <label className="text-sm font-semibold">Адреса</label>
              <input className={inputClassLocal} value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} placeholder="м. Київ, вул. ..." />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold">Заклади <span className="text-xs font-normal text-slate-400">— до яких закладів прив'язаний платник</span></label>
              <div className="mt-1 flex flex-wrap gap-2">
                {(restaurants || []).map((r) => {
                  const rName = r.name || r.id;
                  const isChecked = form.restaurantIds.includes(rName);
                  return (
                    <label key={r.id} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm cursor-pointer select-none transition-colors ${isChecked ? "border-blue-400 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                      <input type="checkbox" checked={isChecked} onChange={() => {
                        setForm((prev) => ({
                          ...prev,
                          restaurantIds: isChecked
                            ? prev.restaurantIds.filter((id) => id !== rName)
                            : [...prev.restaurantIds, rName],
                        }));
                      }} className="h-3.5 w-3.5 accent-blue-600" />
                      {rName}
                    </label>
                  );
                })}
              </div>
              {(restaurants || []).length === 0 && <p className="mt-1 text-xs text-slate-400">Закладів не знайдено</p>}
              {form.restaurantIds.length === 0 && (restaurants || []).length > 0 && <p className="mt-1 text-xs text-slate-400">Доступний для всіх закладів (жоден не обрано)</p>}
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold">Примітки</label>
              <textarea className={`${inputClassLocal} min-h-[60px]`} value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Додаткова інформація" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" className={btnPrimaryLocal} onClick={handleSubmit}>
              <Save size={14} /> {editingPayer ? "Зберегти зміни" : "Додати платника"}
            </button>
            <button type="button" className={btnSecondaryLocal} onClick={resetForm}>Скасувати</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className={cardClassLocal}>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">Назва</th>
                <th className="px-3 py-2 text-left">ЄДРПОУ</th>
                <th className="px-3 py-2 text-left">IBAN</th>
                <th className="px-3 py-2 text-left">МФО</th>
                <th className="px-3 py-2 text-left">Заклади</th>
                <th className="px-3 py-2 text-left">Контактна особа</th>
                <th className="px-3 py-2 text-left">Телефон</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Дії</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-slate-200 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2">{p.edrpou || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs max-w-[180px] truncate">{p.iban || "—"}</td>
                  <td className="px-3 py-2">{p.mfo || "—"}</td>
                  <td className="px-3 py-2 text-xs">{Array.isArray(p.restaurantIds) && p.restaurantIds.length > 0 ? p.restaurantIds.join(", ") : <span className="text-slate-400">Всі</span>}</td>
                  <td className="px-3 py-2">{p.contactPerson || "—"}</td>
                  <td className="px-3 py-2">{p.phone || "—"}</td>
                  <td className="px-3 py-2">{p.email || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button type="button" className="p-1 hover:bg-slate-100 rounded" title="Редагувати" onClick={() => openEdit(p)}>
                        <Edit3 size={15} className="text-slate-500" />
                      </button>
                      <button type="button" className="p-1 hover:bg-red-50 rounded" title="Видалити" onClick={() => handleDelete(p)}>
                        <Trash2 size={15} className="text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    {payers.length === 0 ? "Платників ще немає. Додайте першого." : "Нічого не знайдено."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">Всього: {payers.length} платників</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   APPROVERS TAB (Погоджувачі)
   ═══════════════════════════════════════════════════ */

function ApproversTab({ approvalRoutes, addApprovalRoute, updateApprovalRoute, removeApprovalRoute, categories }) {
  const [showForm, setShowForm] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);
  const [form, setForm] = useState({ category: "", minAmount: "", maxAmount: "", approverName: "", approverEmail: "" });
  const [users, setUsers] = useState([]);

  useEffect(() => {
    getUsers().then((list) => setUsers(list || [])).catch(() => {});
  }, []);

  const handleUserSelect = (e) => {
    const userId = e.target.value;
    if (!userId) {
      setForm((p) => ({ ...p, approverName: "", approverEmail: "" }));
      return;
    }
    const u = users.find((u) => u.id === userId);
    if (u) {
      setForm((p) => ({ ...p, approverName: u.displayName || u.email || "", approverEmail: u.email || "" }));
    }
  };

  const selectedUserId = useMemo(() => {
    if (!form.approverEmail) return "";
    const match = users.find((u) => (u.email || "").toLowerCase() === form.approverEmail.toLowerCase());
    return match?.id || "";
  }, [form.approverEmail, users]);

  const resetForm = () => {
    setForm({ category: "", minAmount: "", maxAmount: "", approverName: "", approverEmail: "" });
    setEditingRoute(null);
    setShowForm(false);
  };

  const openNew = () => { resetForm(); setShowForm(true); };

  const openEdit = (route) => {
    setForm({
      category: route.category || "",
      minAmount: route.minAmount || "",
      maxAmount: route.maxAmount || "",
      approverName: route.approverName || "",
      approverEmail: route.approverEmail || "",
    });
    setEditingRoute(route);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!form.approverName.trim() && !form.approverEmail.trim()) {
      alert("Вкажіть ім'я або email погоджувача.");
      return;
    }
    if (editingRoute) {
      updateApprovalRoute(editingRoute.id, form);
    } else {
      addApprovalRoute(form);
    }
    resetForm();
  };

  const handleDelete = (route) => {
    const label = route.approverName || route.approverEmail || "маршрут";
    if (!window.confirm(`Видалити маршрут "${label}"?`)) return;
    removeApprovalRoute(route.id);
  };

  const allCategories = ["Усі категорії", ...(categories || [])];

  const formatAmount = (val) => {
    const n = Number.parseFloat(val);
    return n > 0 ? n.toLocaleString("uk-UA") : "—";
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className={cardClassLocal}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Check size={18} /> Маршрутизація погоджень
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Налаштуйте, хто погоджує платежі залежно від категорії та суми. Якщо правило не знайдено — погоджує фінансовий директор.
            </p>
          </div>
          <button type="button" className={btnPrimaryLocal} onClick={openNew}>
            <Plus size={14} /> Нове правило
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className={cardClassLocal}>
          <h4 className="text-sm font-semibold mb-3">{editingRoute ? "Редагувати правило" : "Нове правило маршрутизації"}</h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold">Категорія платежу</label>
              <select className={inputClassLocal} value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
                <option value="">Усі категорії</option>
                {(categories || []).map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-sm font-semibold">Сума від (₴)</label>
                <input type="number" min="0" className={inputClassLocal} value={form.minAmount} onChange={(e) => setForm((p) => ({ ...p, minAmount: e.target.value }))} placeholder="0" />
              </div>
              <div className="flex-1">
                <label className="text-sm font-semibold">Сума до (₴)</label>
                <input type="number" min="0" className={inputClassLocal} value={form.maxAmount} onChange={(e) => setForm((p) => ({ ...p, maxAmount: e.target.value }))} placeholder="∞" />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold">Погоджувач *</label>
              <select className={inputClassLocal} value={selectedUserId} onChange={handleUserSelect}>
                <option value="">— Оберіть користувача —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName || u.email}{u.position ? ` (${u.position})` : ""}{u.email ? ` — ${u.email}` : ""}
                  </option>
                ))}
              </select>
              {form.approverName && (
                <p className="mt-1 text-xs text-slate-500">Обрано: {form.approverName}{form.approverEmail ? ` (${form.approverEmail})` : ""}</p>
              )}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" className={btnPrimaryLocal} onClick={handleSubmit}>
              <Save size={14} /> {editingRoute ? "Зберегти зміни" : "Додати правило"}
            </button>
            <button type="button" className={btnSecondaryLocal} onClick={resetForm}>Скасувати</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className={cardClassLocal}>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Категорія</th>
                <th className="px-3 py-2 text-left">Сума від</th>
                <th className="px-3 py-2 text-left">Сума до</th>
                <th className="px-3 py-2 text-left">Погоджувач</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Дії</th>
              </tr>
            </thead>
            <tbody>
              {approvalRoutes.map((route, idx) => (
                <tr key={route.id} className="border-t border-slate-200 hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                  <td className="px-3 py-2">{route.category || "Усі категорії"}</td>
                  <td className="px-3 py-2">{formatAmount(route.minAmount)}</td>
                  <td className="px-3 py-2">{formatAmount(route.maxAmount)}</td>
                  <td className="px-3 py-2 font-medium">{route.approverName || "—"}</td>
                  <td className="px-3 py-2">{route.approverEmail || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button type="button" className="p-1 hover:bg-slate-100 rounded" title="Редагувати" onClick={() => openEdit(route)}>
                        <Edit3 size={15} className="text-slate-500" />
                      </button>
                      <button type="button" className="p-1 hover:bg-red-50 rounded" title="Видалити" onClick={() => handleDelete(route)}>
                        <Trash2 size={15} className="text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {approvalRoutes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    Правил маршрутизації ще немає. Додайте перше правило — інакше всі платежі погоджує фінансовий директор.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">Всього: {approvalRoutes.length} правил</p>
      </div>

      {/* Info */}
      <div className={cardClassLocal}>
        <h4 className="text-sm font-semibold mb-2">Як працює маршрутизація?</h4>
        <ul className="text-sm text-slate-600 space-y-1 list-disc pl-5">
          <li><strong>Категорія + Сума</strong> — найвищий пріоритет (збіг і по категорії, і по діапазону суми)</li>
          <li><strong>Тільки категорія</strong> — середній пріоритет</li>
          <li><strong>Тільки сума</strong> — нижчий пріоритет</li>
          <li><strong>Правило без обмежень</strong> — стандартний погоджувач (якщо немає більш точного правила)</li>
          <li>Якщо жодне правило не підійшло, платіж погоджує <strong>фінансовий директор</strong></li>
        </ul>
      </div>
    </div>
  );
}
