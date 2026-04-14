import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Check, X, Plus, Filter, Download, Printer, Clock3, FileText, Edit3, Trash2, Search, Save, Building2 } from "lucide-react";
import { getUsers } from "../firebase/users";
import {
  isPaymentRequestsApiEnabled,
  getPaymentRequestsApi,
  addPaymentRequestApi,
  updatePaymentRequestApi,
  deletePaymentRequestApi,
} from "../api/paymentRequestsApi.js";

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
  scheduled: "Заплановано до оплати",
  paid: "Оплачено",
  rejected: "Відхилено",
  cancelled: "Скасовано",
};

const PAYMENT_CATEGORIES = [
  "Оренда",
  "Комунальні послуги",
  "Постачальники продуктів",
  "Обладнання",
  "Ремонт та обслуговування",
  "Зарплата",
  "Податки та збори",
  "Маркетинг",
  "Транспорт",
  "Канцелярія",
  "Інше",
];

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

const generateId = () => `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const COLLECTION_NAME = "paymentRequests";

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
      .then((data) => setPayments(Array.isArray(data) ? data : []))
      .catch((err) => console.error("[PaymentRegistry] Failed to load payments:", err))
      .finally(() => setPaymentsLoading(false));
  }, []);

  const [typicalFields, setTypicalFields] = useState(() => {
    try {
      const saved = localStorage.getItem("lucia_payment_typical_fields");
      return saved ? JSON.parse(saved) : { categories: [...PAYMENT_CATEGORIES], defaultCurrency: "UAH" };
    } catch {
      return { categories: [...PAYMENT_CATEGORIES], defaultCurrency: "UAH" };
    }
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [processingId, setProcessingId] = useState("");

  // Counterparties (contractors) state
  const [counterparties, setCounterparties] = useState(() => {
    try {
      const saved = localStorage.getItem("lucia_payment_counterparties");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Payers (our side) state
  const [payers, setPayers] = useState(() => {
    try {
      const saved = localStorage.getItem("lucia_payment_payers");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Approval routes state (rules for who approves what)
  const [approvalRoutes, setApprovalRoutes] = useState(() => {
    try {
      const saved = localStorage.getItem("lucia_payment_approval_routes");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Approval modal state
  const [approvalModal, setApprovalModal] = useState(null);
  const [approvalData, setApprovalData] = useState({ counterparty: "", iban: "", paidBy: "", comment: "" });

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    amount: "",
    currency: "UAH",
    category: "",
    urgency: "normal",
    counterparty: "",
    iban: "",
    dueDate: "",
    restaurant: "",
    attachmentNote: "",
  });

  // Typical fields editor state
  const [newCategory, setNewCategory] = useState("");

  const isFinance = isFinanceLikeUser(user);

  const writeAudit = useCallback((payload) => {
    if (typeof onAuditEvent !== "function") return;
    onAuditEvent(payload);
  }, [onAuditEvent]);

  // ─── Counterparties CRUD ───
  const saveCounterparties = useCallback((list) => {
    setCounterparties(list);
    try { localStorage.setItem("lucia_payment_counterparties", JSON.stringify(list)); } catch { /* ignore */ }
  }, []);

  const addCounterparty = useCallback((cp) => {
    const id = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const entry = { id, ...cp, createdAt: now, updatedAt: now };
    saveCounterparties([...counterparties, entry]);
    return entry;
  }, [counterparties, saveCounterparties]);

  // ─── Payers CRUD ───
  const savePayers = useCallback((list) => {
    setPayers(list);
    try { localStorage.setItem("lucia_payment_payers", JSON.stringify(list)); } catch { /* ignore */ }
  }, []);

  const addPayer = useCallback((p) => {
    const id = `pyr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const entry = { id, ...p, createdAt: now, updatedAt: now };
    savePayers([...payers, entry]);
    return entry;
  }, [payers, savePayers]);

  const updatePayer = useCallback((id, data) => {
    savePayers(payers.map((p) => p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p));
  }, [payers, savePayers]);

  const removePayer = useCallback((id) => {
    savePayers(payers.filter((p) => p.id !== id));
  }, [payers, savePayers]);

  // ─── Approval Routes CRUD ───
  const saveApprovalRoutes = useCallback((list) => {
    setApprovalRoutes(list);
    try { localStorage.setItem("lucia_payment_approval_routes", JSON.stringify(list)); } catch { /* ignore */ }
  }, []);

  const addApprovalRoute = useCallback((route) => {
    const id = `ar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const entry = { id, ...route, createdAt: new Date().toISOString() };
    saveApprovalRoutes([...approvalRoutes, entry]);
    return entry;
  }, [approvalRoutes, saveApprovalRoutes]);

  const updateApprovalRoute = useCallback((id, data) => {
    saveApprovalRoutes(approvalRoutes.map((r) => r.id === id ? { ...r, ...data } : r));
  }, [approvalRoutes, saveApprovalRoutes]);

  const removeApprovalRoute = useCallback((id) => {
    saveApprovalRoutes(approvalRoutes.filter((r) => r.id !== id));
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
  }, [counterparties, saveCounterparties]);

  const removeCounterparty = useCallback((id) => {
    saveCounterparties(counterparties.filter((c) => c.id !== id));
  }, [counterparties, saveCounterparties]);

  const myUserId = String(user?.uid || user?.id || user?.userId || "").trim();
  const myName = user?.displayName || user?.fullName || user?.email || "Користувач";
  const myEmail = String(user?.email || "").trim();

  // ─── Filtering ───
  const filteredPayments = useMemo(() => {
    let result = [...payments];

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
        [p.title, p.counterparty, p.category, p.description, p.iban, p.restaurant]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    result.sort((a, b) => {
      const urgencyOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      const statusOrder = { pending: 0, approved: 1, scheduled: 2, draft: 3, paid: 4, rejected: 5, cancelled: 6 };
      const ua = urgencyOrder[a.urgency] ?? 4;
      const ub = urgencyOrder[b.urgency] ?? 4;
      if (ua !== ub) return ua - ub;
      const sa = statusOrder[a.status] ?? 7;
      const sb = statusOrder[b.status] ?? 7;
      if (sa !== sb) return sa - sb;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    return result;
  }, [payments, topTab, isFinance, myUserId, myEmail, statusFilter, urgencyFilter, searchQuery]);

  // ─── Stats ───
  const stats = useMemo(() => {
    const pending = payments.filter((p) => p.status === "pending").length;
    const approved = payments.filter((p) => p.status === "approved" || p.status === "scheduled").length;
    const totalPending = payments
      .filter((p) => p.status === "pending")
      .reduce((sum, p) => sum + (Number.parseFloat(p.amount) || 0), 0);
    const totalApproved = payments
      .filter((p) => p.status === "approved" || p.status === "scheduled")
      .reduce((sum, p) => sum + (Number.parseFloat(p.amount) || 0), 0);
    return { pending, approved, totalPending, totalApproved };
  }, [payments]);

  // ─── Form Handlers ───
  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      amount: "",
      currency: typicalFields.defaultCurrency || "UAH",
      category: "",
      urgency: "normal",
      counterparty: "",
      iban: "",
      dueDate: "",
      restaurant: "",
      attachmentNote: "",
    });
    setEditingPayment(null);
    setShowForm(false);
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
      attachmentNote: payment.attachmentNote || "",
    });
    setEditingPayment(payment);
    setShowForm(true);
  };

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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


    const nowIso = new Date().toISOString();
    const status = asDraft ? "draft" : "pending";

    if (editingPayment) {
      const updatedData = {
        ...editingPayment,
        ...formData,
        amount,
        status: editingPayment.status === "draft" ? status : editingPayment.status,
        updatedAt: nowIso,
        updatedById: myUserId,
        updatedByName: myName,
      };
      setPayments((prev) =>
        prev.map((p) => (p.id === editingPayment.id ? updatedData : p))
      );
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
      const newPayment = {
        id: generateId(),
        ...formData,
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
      setPayments((prev) => [newPayment, ...prev]);
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

  // ─── Actions ───
  const openApprovalModal = (payment) => {
    setApprovalData({
      counterparty: payment.counterparty || "",
      iban: payment.iban || "",
      paidBy: "",
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
      approvalComment: approvalData.comment.trim(),
      updatedAt: nowIso,
      approvals: [
        ...(payment.approvals || []),
        { action: "approved", at: nowIso, byId: myUserId, byName: myName, comment: approvalData.comment.trim() },
      ],
    };
    setPayments((prev) =>
      prev.map((p) => (p.id === payment.id ? updatedData : p))
    );
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
    setPayments((prev) =>
      prev.map((p) => (p.id === payment.id ? updatedData : p))
    );
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

  const schedulePayment = (payment) => {
    if (processingId) return;
    setProcessingId(payment.id);
    const nowIso = new Date().toISOString();
    const updatedData = { ...payment, status: "scheduled", updatedAt: nowIso, scheduledAt: nowIso, scheduledByName: myName };
    setPayments((prev) =>
      prev.map((p) => (p.id === payment.id ? updatedData : p))
    );
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
    setPayments((prev) =>
      prev.map((p) => (p.id === payment.id ? updatedData : p))
    );
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
    setPayments((prev) =>
      prev.map((p) => (p.id === payment.id ? updatedData : p))
    );
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
    try {
      localStorage.setItem("lucia_payment_typical_fields", JSON.stringify(updated));
    } catch { /* ignore */ }
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
          <div className="mt-1 text-xl font-bold text-green-800">{payments.filter((p) => p.status === "paid").length}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs text-slate-600">Всього заявок</div>
          <div className="mt-1 text-xl font-bold text-slate-800">{payments.length}</div>
        </div>
      </div>

      {/* New Payment Form */}
      {showForm && (
        <div className={cardClass}>
          <h3 className="text-base font-semibold">{editingPayment ? "Редагувати заявку" : "Нова заявка на платіж"}</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-sm font-semibold">Назва / призначення платежу *</label>
              <input className={inputClass} value={formData.title} onChange={(e) => handleFormChange("title", e.target.value)} placeholder="Наприклад: Оплата за продукти — ТОВ Ланч" />
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
                if (match?.iban && !formData.iban) handleFormChange("iban", match.iban);
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
              <label className="text-sm font-semibold">Категорія</label>
              <select className={inputClass} value={formData.category} onChange={(e) => handleFormChange("category", e.target.value)}>
                <option value="">Оберіть категорію</option>
                {typicalFields.categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
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
            <div>
              <label className="text-sm font-semibold">Заклад</label>
              <select className={inputClass} value={formData.restaurant} onChange={(e) => handleFormChange("restaurant", e.target.value)}>
                <option value="">Оберіть заклад</option>
                {(restaurants || []).map((r) => (
                  <option key={r.id} value={r.name || r.id}>{r.name || r.id}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold">Опис / коментар</label>
              <textarea className={`${inputClass} min-h-[80px]`} value={formData.description} onChange={(e) => handleFormChange("description", e.target.value)} placeholder="Додаткова інформація до заявки" />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold">Примітка до вкладення</label>
              <input className={inputClass} value={formData.attachmentNote} onChange={(e) => handleFormChange("attachmentNote", e.target.value)} placeholder="Наприклад: рахунок-фактура додано в 1С" />
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
                <th className="px-3 py-2 text-left">Назва</th>
                <th className="px-3 py-2 text-left">Контрагент</th>
                <th className="px-3 py-2 text-right">Сума</th>
                <th className="px-3 py-2 text-left">Категорія</th>
                <th className="px-3 py-2 text-left">Терміновість</th>
                <th className="px-3 py-2 text-left">Статус</th>
                <th className="px-3 py-2 text-left">Дата оплати</th>
                <th className="px-3 py-2 text-left">Ініціатор</th>
                <th className="px-3 py-2 text-left">Створено</th>
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
                const canEdit = payment.status === "draft" || (payment.status === "pending" && payment.requestedById === myUserId);
                const canCancel = (payment.status === "draft" || payment.status === "pending") && (payment.requestedById === myUserId || isFinance);

                return (
                  <tr key={payment.id} className="border-t border-slate-200 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium max-w-[200px] truncate">{payment.title}</td>
                    <td className="px-3 py-2 max-w-[150px] truncate">{payment.counterparty || "-"}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{formatMoney(payment.amount)} {payment.currency}</td>
                    <td className="px-3 py-2">{payment.category || "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${URGENCY_COLORS[payment.urgency] || ""}`}>
                        {URGENCY_LEVELS[payment.urgency] || payment.urgency}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[payment.status] || ""}`}>
                        {PAYMENT_STATUSES[payment.status] || payment.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(payment.dueDate)}</td>
                    <td className="px-3 py-2 max-w-[120px] truncate">{payment.requestedByName || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(payment.createdAt)}</td>
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
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                    {payments.length === 0 ? "Заявок на платіж поки немає. Натисніть «Нова заявка» щоб створити першу." : "Нічого не знайдено за обраними фільтрами."}
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
                <label className="text-sm font-semibold">Хто платить (юрособа / ФОП)</label>
                <input className={inputClass} value={approvalData.paidBy} onChange={(e) => setApprovalData((prev) => ({ ...prev, paidBy: e.target.value }))} placeholder="ТОВ La Famiglia" />
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
    const myPayments = payments.filter(
      (p) =>
        (myUserId && p.requestedById === myUserId) ||
        (myEmail && p.requestedByEmail === myEmail) ||
        (myName && p.requestedByName === myName)
    );
    const grouped = {
      active: myPayments.filter((p) => ["draft", "pending", "approved", "scheduled"].includes(p.status)),
      completed: myPayments.filter((p) => p.status === "paid"),
      other: myPayments.filter((p) => ["rejected", "cancelled"].includes(p.status)),
    };

    const renderSection = (title, items, emptyText) => (
      <div className={cardClass}>
        <h3 className="text-base font-semibold">{title} ({items.length})</h3>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">Назва</th>
                <th className="px-3 py-2 text-left">Контрагент</th>
                <th className="px-3 py-2 text-right">Сума</th>
                <th className="px-3 py-2 text-left">Статус</th>
                <th className="px-3 py-2 text-left">Дата оплати</th>
                <th className="px-3 py-2 text-left">Оновлено</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t border-slate-200">
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
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">{emptyText}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );

    return (
      <div className="space-y-5">
        {renderSection("Активні заявки", grouped.active, "Немає активних заявок")}
        {renderSection("Оплачено", grouped.completed, "Оплачених заявок поки немає")}
        {grouped.other.length > 0 && renderSection("Відхилені / скасовані", grouped.other, "")}
      </div>
    );
  };

  // ─── Render: Типові поля ───
  const renderTypicalFields = () => (
    <div className="space-y-5">
      <div className={cardClass}>
        <h3 className="text-base font-semibold">Категорії платежів</h3>
        <p className="mt-1 text-sm text-slate-600">Управляйте переліком категорій, які доступні при створенні заявки на платіж.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {typicalFields.categories.map((cat) => (
            <span key={cat} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              {cat}
              <button type="button" onClick={() => removeCategory(cat)} className="ml-1 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input className={`${inputClass} max-w-xs`} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Нова категорія" onKeyDown={(e) => e.key === "Enter" && addCategory()} />
          <button type="button" className={btnPrimary} onClick={addCategory}>
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
    </div>
  );

  // ─── Render: База контрагентів ───
  const renderContractorsBase = () => <ContractorsBaseTab counterparties={counterparties} addCounterparty={addCounterparty} updateCounterparty={updateCounterparty} removeCounterparty={removeCounterparty} />;

  // ─── Render: База платників ───
  const renderPayersBase = () => <PayersBaseTab payers={payers} addPayer={addPayer} updatePayer={updatePayer} removePayer={removePayer} />;

  // ─── Render: Погоджувачі ───
  const renderApproversTab = () => <ApproversTab approvalRoutes={approvalRoutes} addApprovalRoute={addApprovalRoute} updateApprovalRoute={updateApprovalRoute} removeApprovalRoute={removeApprovalRoute} categories={typicalFields.categories} />;

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
  const [form, setForm] = useState({ name: "", edrpou: "", iban: "", contactPerson: "", phone: "", email: "", address: "", notes: "" });

  const resetForm = () => {
    setForm({ name: "", edrpou: "", iban: "", contactPerson: "", phone: "", email: "", address: "", notes: "" });
    setEditingCp(null);
    setShowForm(false);
  };

  const openNew = () => { resetForm(); setShowForm(true); };

  const openEdit = (cp) => {
    setForm({
      name: cp.name || "",
      edrpou: cp.edrpou || "",
      iban: cp.iban || "",
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
      [c.name, c.edrpou, c.iban, c.contactPerson, c.phone, c.email, c.address]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [counterparties, search]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className={cardClassLocal}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2"><Building2 size={18} /> База контрагентів</h3>
            <p className="text-sm text-slate-500 mt-1">Ведіть реєстр контрагентів для швидкого вибору при створенні та погодженні платежів.</p>
          </div>
          <button type="button" className={btnPrimaryLocal} onClick={openNew}>
            <Plus size={14} /> Новий контрагент
          </button>
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
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
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

function PayersBaseTab({ payers, addPayer, updatePayer, removePayer }) {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingPayer, setEditingPayer] = useState(null);
  const [form, setForm] = useState({ name: "", edrpou: "", iban: "", contactPerson: "", phone: "", email: "", address: "", notes: "" });

  const resetForm = () => {
    setForm({ name: "", edrpou: "", iban: "", contactPerson: "", phone: "", email: "", address: "", notes: "" });
    setEditingPayer(null);
    setShowForm(false);
  };

  const openNew = () => { resetForm(); setShowForm(true); };

  const openEdit = (p) => {
    setForm({
      name: p.name || "",
      edrpou: p.edrpou || "",
      iban: p.iban || "",
      contactPerson: p.contactPerson || "",
      phone: p.phone || "",
      email: p.email || "",
      address: p.address || "",
      notes: p.notes || "",
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

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return payers;
    return payers.filter((p) =>
      [p.name, p.edrpou, p.iban, p.contactPerson, p.phone, p.email, p.address]
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
          <button type="button" className={btnPrimaryLocal} onClick={openNew}>
            <Plus size={14} /> Новий платник
          </button>
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
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
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
