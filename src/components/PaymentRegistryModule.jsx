import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Check, X, Plus, Download, Upload, Clock3, FileText, Edit3, Trash2, Search, Save, Building2, RefreshCcw, Landmark, Pause, Play } from "lucide-react";
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

const generateId = (prefix = "pay") => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
  payerId: "",
  paidBy: "",
  startDate: getTodayDateOnly(),
  endDate: "",
  noEndDate: true,
  frequency: "monthly",
  dayOfMonth: "10",
});

const isRecurringTemplateRecord = (item) => String(item?.recordType || item?.type || "").toLowerCase() === RECORD_TYPE_RECURRING_TEMPLATE;

const normalizePaymentRecord = (item) => ({
  ...item,
  recordType: RECORD_TYPE_PAYMENT_REQUEST,
  approvals: Array.isArray(item?.approvals) ? item.approvals : [],
  comments: Array.isArray(item?.comments) ? item.comments : [],
  dueDate: toDateOnly(item?.dueDate) || "",
  recurringOccurrenceDate: toDateOnly(item?.recurringOccurrenceDate) || "",
});

const normalizeRecurringTemplateRecord = (item) => {
  const normalized = {
    ...item,
    recordType: RECORD_TYPE_RECURRING_TEMPLATE,
    isActive: item?.isActive !== false,
    frequency: RECURRING_FREQUENCIES[item?.frequency] ? item.frequency : "monthly",
    dayOfMonth: String(getPreferredDay(item?.dayOfMonth)),
    startDate: toDateOnly(item?.startDate) || toDateOnly(item?.nextOccurrenceDate) || getTodayDateOnly(),
    endDate: toDateOnly(item?.endDate) || "",
    nextOccurrenceDate: toDateOnly(item?.nextOccurrenceDate) || "",
    totalGenerated: Number.parseInt(String(item?.totalGenerated || "0"), 10) || 0,
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
    payerId: template.payerId || "",
    paidBy: template.paidBy || "",
    status: "approved",
    createdAt: nowIso,
    updatedAt: nowIso,
    requestedById: template.requestedById || "",
    requestedByEmail: template.requestedByEmail || "",
    requestedByName: template.requestedByName || "Система",
    approvals: [],
    comments: [],
    recurringTemplateId: template.id,
    recurringOccurrenceDate: occurrenceDate,
    recurringFrequency: template.frequency,
    recurringDayOfMonth: String(template.dayOfMonth || ""),
  };
};

const paymentBelongsToUser = (payment, userId, email, name) => (
  (userId && payment.requestedById === userId) ||
  (email && payment.requestedByEmail === email) ||
  (name && payment.requestedByName === name)
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

  // Load payments from DB on mount
  useEffect(() => {
    if (paymentsLoadedRef.current) return;
    if (!isPaymentRequestsApiEnabled()) return;
    paymentsLoadedRef.current = true;
    setPaymentsLoading(true);
    getPaymentRequestsApi()
      .then((data) => {
        const normalized = Array.isArray(data)
          ? data.map((item) => (isRecurringTemplateRecord(item) ? normalizeRecurringTemplateRecord(item) : normalizePaymentRecord(item)))
          : [];
        setPayments(normalized);
      })
      .catch((err) => console.error("[PaymentRegistry] Failed to load payments:", err))
      .finally(() => setPaymentsLoading(false));
  }, []);

  const defaultTypicalFields = { categories: [...PAYMENT_CATEGORIES], articles: [...DEFAULT_ARTICLES], subArticles: [], defaultCurrency: "UAH", vatRates: [7, 20] };
  const [typicalFields, setTypicalFields] = useState(defaultTypicalFields);
  const typicalFieldsDbIdRef = useRef(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [editingRecurringTemplate, setEditingRecurringTemplate] = useState(null);
  const [processingId, setProcessingId] = useState("");

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
      try { const s = localStorage.getItem("lucia_payment_typical_fields"); if (s) { const p = JSON.parse(s); setTypicalFields({ categories: p.categories || [...PAYMENT_CATEGORIES], articles: p.articles || [...DEFAULT_ARTICLES], subArticles: p.subArticles || [], defaultCurrency: p.defaultCurrency || "UAH", vatRates: p.vatRates || [7, 20] }); } } catch { /* ignore */ }
      try { const s = localStorage.getItem("lucia_payment_counterparties"); if (s) setCounterparties(JSON.parse(s)); } catch { /* ignore */ }
      try { const s = localStorage.getItem("lucia_payment_payers"); if (s) setPayers(JSON.parse(s)); } catch { /* ignore */ }
      try { const s = localStorage.getItem("lucia_payment_approval_routes"); if (s) setApprovalRoutes(JSON.parse(s)); } catch { /* ignore */ }
      return;
    }
    settingsLoadedRef.current = true;
    Promise.allSettled([getPayersApi(), getCounterpartiesApi(), getApprovalRoutesApi(), getTypicalFieldsApi()])
      .then(([payersRes, cpRes, routesRes, tfRes]) => {
        if (payersRes.status === "fulfilled" && payersRes.value.length) setPayers(payersRes.value);
        if (cpRes.status === "fulfilled" && cpRes.value.length) setCounterparties(cpRes.value);
        if (routesRes.status === "fulfilled" && routesRes.value.length) setApprovalRoutes(routesRes.value);
        if (tfRes.status === "fulfilled" && tfRes.value.length) {
          const rec = tfRes.value[0];
          typicalFieldsDbIdRef.current = rec.id || null;
          setTypicalFields({ categories: rec.categories || [...PAYMENT_CATEGORIES], articles: rec.articles || [...DEFAULT_ARTICLES], subArticles: rec.subArticles || [], defaultCurrency: rec.defaultCurrency || "UAH", vatRates: rec.vatRates || [7, 20] });
        }
      })
      .catch((err) => console.error("[PaymentRegistry] Failed to load settings:", err));
  }, []);

  // Approval modal state
  const [approvalModal, setApprovalModal] = useState(null);
  const [approvalData, setApprovalData] = useState({ counterparty: "", iban: "", paidBy: "", payerId: "", comment: "" });

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

  // ─── Counterparties CRUD ───
  const saveCounterparties = useCallback((list) => {
    setCounterparties(list);
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
    let result = [...paymentRequests];

    if (topTab === "mypayments" && !isFinance) {
      result = result.filter(
        (p) =>
          (myUserId && p.requestedById === myUserId) ||
          (myEmail && p.requestedByEmail === myEmail) ||
          (myName && p.requestedByName === myName)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((p) => p.status === statusFilter);
    }
    if (urgencyFilter !== "all") {
      result = result.filter((p) => p.urgency === urgencyFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((p) =>
        [p.paymentNumber, p.title, p.counterparty, p.category, p.description, p.iban, p.restaurant]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    result.sort((a, b) => {
      const urgencyOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      const statusOrder = { pending: 0, approved: 1, scheduled: 2, paused: 3, draft: 4, paid: 5, rejected: 6, cancelled: 7 };
      const ua = urgencyOrder[a.urgency] ?? 4;
      const ub = urgencyOrder[b.urgency] ?? 4;
      if (ua !== ub) return ua - ub;
      const sa = statusOrder[a.status] ?? 7;
      const sb = statusOrder[b.status] ?? 7;
      if (sa !== sb) return sa - sb;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    return result;
  }, [paymentRequests, topTab, isFinance, myUserId, myEmail, statusFilter, urgencyFilter, searchQuery]);

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
      amount: String(payment.amount || ""),
      currency: payment.currency || "UAH",
      category: payment.category || "",
      urgency: payment.urgency || "normal",
      counterparty: payment.counterparty || "",
      iban: payment.iban || "",
      dueDate: payment.dueDate || "",
      restaurant: payment.restaurant || "",
      expenseRestaurant: payment.expenseRestaurant || payment.restaurant || "",
      attachmentNote: payment.attachmentNote || "",
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
      urgency: template.urgency || "normal",
      counterparty: template.counterparty || "",
      iban: template.iban || "",
      restaurant: template.restaurant || "",
      expenseRestaurant: template.expenseRestaurant || template.restaurant || "",
      attachmentNote: template.attachmentNote || "",
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

  const handleRecurringFormChange = (field, value) => {
    setRecurringFormData((prev) => ({ ...prev, [field]: value }));
  };

  const submitPayment = (asDraft = false) => {
    if (!formData.title.trim()) {
      alert("Вкажіть назву / призначення платежу.");
      return;
    }
    const amount = Number.parseFloat(String(formData.amount || "0").replace(/\s+/g, "").replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Вкажіть коректну суму платежу.");
      return;
    }

    // Build VAT suffix for title
    let vatSuffix = "";
    if (formData.vatMode === "without") {
      vatSuffix = ", без ПДВ";
    } else if (formData.vatMode === "with" && formData.vatRate) {
      const rate = Number.parseFloat(formData.vatRate);
      const vatAmount = amount * rate / 100;
      vatSuffix = `, в т.ч. ПДВ ${formData.vatRate}% - ${formatMoney(vatAmount)} грн`;
    }
    const titleBase = (formData.title || "").replace(/,\s*(без ПДВ|в т\.ч\. ПДВ\s*\d+(\.\d+)?%(\s*-\s*[\d\s]+[,.]?\d*\s*грн)?)(\s*\/\/.*)?$/g, "").replace(/\s*\/\/.*$/, "").trim() + vatSuffix;
    const codeSuffix = [formData.articleCode, formData.subArticleCode].filter(Boolean).join("//");
    const titleWithVat = codeSuffix ? `${titleBase} //${codeSuffix}` : titleBase;

    // If recurring toggle is on — create a recurring template instead
    if (formData.isRecurring && !editingPayment) {
      if (!toDateOnly(formData.startDate)) {
        alert("Вкажіть дату старту регулярного платежу.");
        return;
      }
      const nowIso = new Date().toISOString();
      const normalizedTemplate = normalizeRecurringTemplateRecord({
        ...formData,
        title: titleWithVat,
        amount,
        id: generateId("rec"),
        recordType: RECORD_TYPE_RECURRING_TEMPLATE,
        requestedById: myUserId,
        requestedByEmail: myEmail,
        requestedByName: myName,
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
        title: titleWithVat,
        recordType: RECORD_TYPE_PAYMENT_REQUEST,
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
        ...formData,
        title: titleWithVat,
        amount,
        status,
        createdAt: nowIso,
        updatedAt: nowIso,
        requestedById: myUserId,
        requestedByEmail: myEmail,
        requestedByName: myName,
        approvals: [],
        comments: [],
      };
      appendStoredRecord(newPayment);
      addPaymentRequestApi({ ...newPayment }).catch((err) =>
        console.error("[PaymentRegistry] Failed to save payment:", err)
      );
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
      requestedById: editingRecurringTemplate?.requestedById || myUserId,
      requestedByEmail: editingRecurringTemplate?.requestedByEmail || myEmail,
      requestedByName: editingRecurringTemplate?.requestedByName || myName,
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
    const existingPayment = paymentRequests.find(
      (payment) => payment.recurringTemplateId === template.id && payment.recurringOccurrenceDate === occurrenceDate
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

  const removeRecurringTemplate = (template) => {
    if (!window.confirm(`Видалити регулярний платіж "${template.title}"?`)) return;
    setPayments((prev) => prev.filter((item) => item.id !== template.id));
    deletePaymentRequestApi(template.id).catch((err) =>
      console.error("[PaymentRegistry] Failed to delete recurring template:", err)
    );
  };

  const deletePayment = (payment) => {
    if (!window.confirm(`Видалити заявку "${payment.title}" (${formatMoney(payment.amount)} ${payment.currency})? Цю дію неможливо скасувати.`)) return;
    setPayments((prev) => prev.filter((item) => item.id !== payment.id));
    deletePaymentRequestApi(payment.id).catch((err) =>
      console.error("[PaymentRegistry] Failed to delete payment:", err)
    );
    writeAudit({
      action: "payment_request_delete",
      entityType: "payment_request",
      entityId: payment.id,
      description: `Адмін видалив заявку "${payment.title}" (${formatMoney(payment.amount)} ${payment.currency})`,
    });
  };

  // ─── Actions ───
  const openApprovalModal = (payment) => {
    setApprovalData({
      counterparty: payment.counterparty || "",
      iban: payment.iban || "",
      paidBy: payment.paidBy || "",
      payerId: payment.payerId || "",
      comment: "",
    });
    setApprovalModal(payment);
  };

  const confirmApproval = () => {
    const payment = approvalModal;
    if (!payment) return;
    if (!approvalData.counterparty.trim()) {
      alert("Вкажіть контрагента (отримувача) для погодження.");
      return;
    }
    setProcessingId(payment.id);
    const nowIso = new Date().toISOString();
    const updatedData = {
      ...payment,
      status: "approved",
      counterparty: approvalData.counterparty.trim(),
      iban: approvalData.iban.trim() || payment.iban,
      paidBy: approvalData.paidBy.trim() || myName,
      payerId: approvalData.payerId || payment.payerId || "",
      approvalComment: approvalData.comment.trim(),
      updatedAt: nowIso,
      approvals: [
        ...(payment.approvals || []),
        { action: "approved", at: nowIso, byId: myUserId, byName: myName, comment: approvalData.comment.trim() },
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
      description: `Погоджено платіж "${payment.title}" (${formatMoney(payment.amount)} ${payment.currency}) — контрагент: ${approvalData.counterparty.trim()}`,
    });
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

  const schedulePayment = (payment) => {
    if (processingId) return;
    setProcessingId(payment.id);
    const nowIso = new Date().toISOString();
    const updatedData = { ...payment, status: "scheduled", updatedAt: nowIso, scheduledAt: nowIso, scheduledByName: myName };
    updateStoredRecord(payment.id, () => updatedData);
    updatePaymentRequestApi(payment.id, updatedData).catch((err) =>
      console.error("[PaymentRegistry] Failed to update payment:", err)
    );
    writeAudit({
      action: "payment_schedule",
      entityType: "payment_request",
      entityId: payment.id,
      description: `Заплановано до оплати "${payment.title}"`,
    });
    setProcessingId("");
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
              <label className="text-sm font-semibold">Назва / призначення платежу *</label>
              <div className="flex gap-2 items-center">
                <input className={`${inputClass} flex-1`} value={formData.title} onChange={(e) => handleFormChange("title", e.target.value)} placeholder="Наприклад: Оплата за продукти — ТОВ Ланч" />
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
              <>
                <div>
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
                  <label className="mt-1 flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                    <input type="checkbox" checked={formData.noEndDate} onChange={(e) => { handleFormChange("noEndDate", e.target.checked); if (e.target.checked) handleFormChange("endDate", ""); }} className="h-3.5 w-3.5 accent-blue-600" />
                    Безстроковий (без дати завершення)
                  </label>
                </div>
              </>
            )}
            <div className="md:col-span-2">
              <label className="text-sm font-semibold">Опис / коментар</label>
              <textarea className={`${inputClass} min-h-[60px]`} value={formData.description} onChange={(e) => handleFormChange("description", e.target.value)} placeholder="Додаткова інформація до заявки" />
            </div>
            <div>
              <label className="text-sm font-semibold">Примітка до вкладення</label>
              <input className={inputClass} value={formData.attachmentNote} onChange={(e) => handleFormChange("attachmentNote", e.target.value)} placeholder="Рахунок-фактура в 1С" />
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
        <button type="button" className={btnPrimary} onClick={openNewForm}>
          <Plus size={14} /> Нова заявка на платіж
        </button>
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
          <h3 className="text-base font-semibold">Реєстр платежів ({filteredPayments.length})</h3>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
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
                const matchedRoute = findApproverForPayment(payment);
                const isAssignedApprover = matchedRoute && (
                  (matchedRoute.approverEmail && matchedRoute.approverEmail.toLowerCase() === myEmail.toLowerCase()) ||
                  (matchedRoute.approverName && matchedRoute.approverName === myName)
                );
                const canApprove = (isFinance || isAssignedApprover) && (payment.status === "pending");
                const canSchedule = isFinance && payment.status === "approved";
                const canMarkPaid = isFinance && (payment.status === "scheduled" || payment.status === "approved");
                const canPause = isFinance && ["approved", "scheduled", "paused"].includes(payment.status);
                const canEdit = payment.status === "draft" || (payment.status === "pending" && payment.requestedById === myUserId);
                const canCancel = (payment.status === "draft" || payment.status === "pending") && (payment.requestedById === myUserId || isFinance);

                return (
                  <tr key={payment.id} className="border-t border-slate-200 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="font-medium">{payment.title}</div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-slate-500">
                        {payment.paymentNumber && <span className="font-mono">{payment.paymentNumber}</span>}
                        {payment.counterparty && <span>→ {payment.counterparty}</span>}
                        {payment.category && <span className="text-slate-400">{payment.category}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{formatMoney(payment.amount)} {payment.currency}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[payment.status] || ""}`}>
                        {PAYMENT_STATUSES[payment.status] || payment.status}
                      </span>
                      {payment.urgency && payment.urgency !== "normal" && (
                        <span className={`ml-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${URGENCY_COLORS[payment.urgency] || ""}`}>
                          {URGENCY_LEVELS[payment.urgency] || payment.urgency}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      <div>{formatDate(payment.dueDate) || "—"}</div>
                      <div className="text-slate-400">{formatDateTime(payment.createdAt)}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{payment.requestedByName || "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
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
                        {canSchedule && (
                          <button type="button" disabled={Boolean(processingId)} onClick={() => schedulePayment(payment)} className={btnSecondary}>
                            <Clock3 size={12} /> Запланувати
                          </button>
                        )}
                        {canMarkPaid && (
                          <button type="button" disabled={Boolean(processingId)} onClick={() => markPaid(payment)} className={btnApprove}>
                            <Check size={12} /> Оплачено
                          </button>
                        )}
                        {canPause && (
                          <button type="button" disabled={Boolean(processingId)} onClick={() => togglePaymentPaused(payment)} className={payment.status === "paused" ? btnApprove : btnSecondary}>
                            {payment.status === "paused" ? <><Play size={12} /> Відновити</> : <><Pause size={12} /> Пауза</>}
                          </button>
                        )}
                        {canEdit && (
                          <button type="button" onClick={() => openEditForm(payment)} className={btnSecondary}>
                            Редагувати
                          </button>
                        )}
                        {canCancel && (
                          <button type="button" onClick={() => cancelPayment(payment)} className={btnReject}>
                            Скасувати
                          </button>
                        )}
                        {isAdmin && (
                          <button type="button" onClick={() => deletePayment(payment)} className={btnReject} title="Видалити назавжди">
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
                    {paymentRequests.length === 0 ? "Заявок на платіж поки немає. Натисніть «Нова заявка» щоб створити першу." : "Нічого не знайдено за обраними фільтрами."}
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
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-sm font-semibold">Контрагент (отримувач) *</label>
                <input
                  list="approval-counterparties"
                  className={inputClass}
                  value={approvalData.counterparty}
                  onChange={(e) => {
                    setApprovalData((prev) => ({ ...prev, counterparty: e.target.value }));
                    const match = counterparties.find((c) => c.name === e.target.value);
                    if (match?.iban) setApprovalData((prev) => ({ ...prev, iban: match.iban }));
                  }}
                  placeholder="Оберіть або введіть контрагента"
                />
                <datalist id="approval-counterparties">
                  {counterparties.map((c) => <option key={c.id} value={c.name}>{c.name}{c.edrpou ? ` (${c.edrpou})` : ""}</option>)}
                </datalist>
              </div>
              <div>
                <label className="text-sm font-semibold">IBAN / рахунок</label>
                <input className={inputClass} value={approvalData.iban} onChange={(e) => setApprovalData((prev) => ({ ...prev, iban: e.target.value }))} placeholder="UA..." />
              </div>
              <div>
                <label className="text-sm font-semibold">Платник</label>
                <select className={inputClass} value={approvalData.payerId} onChange={(e) => {
                  const payerId = e.target.value;
                  const payer = payersById.get(payerId);
                  setApprovalData((prev) => ({ ...prev, payerId, paidBy: payer?.name || prev.paidBy || "" }));
                }}>
                  <option value="">Оберіть платника</option>
                  {getPayersForRestaurant(approvalModal?.restaurant).map((payer) => (
                    <option key={payer.id} value={payer.id}>{payer.name}</option>
                  ))}
                </select>
              </div>
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
      active: myPayments.filter((p) => ["draft", "pending", "approved", "scheduled"].includes(p.status)),
      paused: myPayments.filter((p) => p.status === "paused"),
      completed: myPayments.filter((p) => p.status === "paid"),
      other: myPayments.filter((p) => ["rejected", "cancelled"].includes(p.status)),
    };

    const canPauseResume = (p) => ["approved", "scheduled", "paused"].includes(p.status);

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
                <th className="px-3 py-2 text-left">Дата оплати</th>
                <th className="px-3 py-2 text-left">Оновлено</th>
                {showPauseBtn && <th className="px-3 py-2 text-left">Дії</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t border-slate-200">
                  <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{p.paymentNumber || "—"}</td>
                  <td className="px-3 py-2 font-medium">{p.title}</td>
                  <td className="px-3 py-2">{p.counterparty || "-"}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{formatMoney(p.amount)} {p.currency}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[p.status] || ""}`}>
                      {PAYMENT_STATUSES[p.status] || p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(p.dueDate)}</td>
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
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={showPauseBtn ? 8 : 7} className="px-3 py-6 text-center text-slate-500">{emptyText}</td>
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
                        <button type="button" className={btnSecondary} onClick={() => runRecurringTemplateNow(template)}>
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
                        <button type="button" className={btnSecondary} onClick={() => runRecurringTemplateNow(template)}>
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
    const treasuryQueue = paymentRequests
      .filter((payment) => ["approved", "scheduled"].includes(payment.status) && payment.status !== "paused")
      .sort((a, b) => new Date(a.dueDate || a.createdAt || 0).getTime() - new Date(b.dueDate || b.createdAt || 0).getTime());

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
            payment.dueDate || "",
            payment.counterparty || "",
            payment.iban || "",
            Number(payment.amount || 0).toFixed(2),
            payment.currency || "UAH",
            payment.description || payment.title || "",
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
          formatBankDate(payment.dueDate),
          "",
          payer?.mfo || "",
          payer?.iban || "",
          payer?.edrpou || "",
          String(amountKop),
          (payment.title || payment.description || "").replace(/;/g, ","),
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
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="text-xs text-blue-700">Платежів у черзі</div>
              <div className="mt-1 text-xl font-bold text-blue-900">{treasuryQueue.length}</div>
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
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left">№</th>
                  <th className="px-3 py-2 text-left">Назва</th>
                  <th className="px-3 py-2 text-left">Контрагент</th>
                  <th className="px-3 py-2 text-left">Платник</th>
                  <th className="px-3 py-2 text-right">Сума</th>
                  <th className="px-3 py-2 text-left">Дата оплати</th>
                  <th className="px-3 py-2 text-left">Статус</th>
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
                      <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{payment.paymentNumber || "—"}</td>
                      <td className="px-3 py-2 font-medium">{payment.title}</td>
                      <td className="px-3 py-2">{payment.counterparty || "-"}</td>
                      <td className="px-3 py-2">
                        {payer ? (
                          <span>{payer.name}</span>
                        ) : (
                          <select className="rounded border border-orange-300 bg-orange-50 px-2 py-1 text-xs" value="" onChange={(e) => assignPayer(e.target.value)}>
                            <option value="">— Обрати платника —</option>
                            {payers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{formatMoney(payment.amount)} {payment.currency}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(payment.dueDate)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[payment.status] || ""}`}>
                          {PAYMENT_STATUSES[payment.status] || payment.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {payment.status === "approved" && (
                            <button type="button" className={btnSecondary} onClick={() => schedulePayment(payment)}>
                              <Clock3 size={12} /> Запланувати
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
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-500">Немає погоджених платежів для казначея.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
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
