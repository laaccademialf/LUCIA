import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, ContactRound, Download, FileDown, FileText, Pencil, Plus, Trash2, Upload, Users } from "lucide-react";
import {
  downloadCateringContactsTemplate,
  exportCateringContactsToExcel,
  importCateringContactsFromExcel,
} from "../../utils/cateringExcel";

const ORDER_STATUSES = [
  { id: "new", label: "Новий / Інтерес", tone: "border-slate-200 bg-slate-50 text-slate-700" },
  { id: "brief", label: "Бриф", tone: "border-sky-200 bg-sky-50 text-sky-700" },
  { id: "proposal", label: "Пропозиція", tone: "border-violet-200 bg-violet-50 text-violet-700" },
  { id: "work", label: "В роботі", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  { id: "tender", label: "Тендер", tone: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700" },
  { id: "confirmed", label: "Підтверджено", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { id: "cancelled", label: "Втрачено", tone: "border-rose-200 bg-rose-50 text-rose-700" },
];

const FIELD_TYPES = ["text", "textarea", "number", "date", "select", "multiselect", "checkbox"];

const formatMoney = (value) => new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "UAH",
  maximumFractionDigits: 0,
}).format(Number(value || 0));

const formatDateUk = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
  const ukMatch = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ukMatch) return raw;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString("uk-UA");
  return raw;
};

const toDateInputValue = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return raw;
  const ukMatch = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ukMatch) return `${ukMatch[3]}-${ukMatch[2]}-${ukMatch[1]}`;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return "";
};

const normalizeKey = (value) => String(value || "")
  .toLowerCase()
  .replace(/[^a-zа-яіїєґ0-9]+/gi, "");

const extractNumber = (value) => {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) return 0;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  return Number(match[0]) || 0;
};

const BEVERAGE_KEYWORDS = [
  "нап",
  "drink",
  "beverage",
  "juice",
  "сік",
  "вода",
  "water",
  "чай",
  "coffee",
  "кава",
  "лимонад",
  "soda",
  "cola",
  "коктейл",
];

const VAT_RULES_FIELD_KEYS = [
  "paymenttypevatrules",
  "vatrulesbypaymenttype",
  "pdvrulesbypaymenttype",
  "pdvbypaymenttype",
];

const PAYMENT_TYPE_FIELD_KEYS = [
  "paymenttype",
  "типоплати",
];

const ALCOHOL_KEYWORDS = [
  "алког",
  "спирт",
  "вино",
  "wine",
  "beer",
  "пиво",
  "whisky",
  "віскі",
  "vodka",
  "горіл",
  "rum",
  "ром",
  "gin",
  "джин",
  "tequila",
  "текіла",
  "cognac",
  "коньяк",
  "brandy",
  "бренді",
  "liqueur",
  "лікер",
  "champagne",
  "шампан",
  "prosecco",
  "просекко",
];

const hasAnyKeyword = (value, keywords) => {
  const probe = normalizeKey(value);
  if (!probe) return false;
  return keywords.some((item) => probe.includes(normalizeKey(item)));
};

const toProposalMetrics = (items, guestCountRaw) => {
  const safeItems = Array.isArray(items) ? items : [];
  const guestCount = Math.max(0, Number(guestCountRaw || 0));

  const totals = safeItems.reduce((acc, item) => {
    const quantity = Math.max(0, Number(item?.quantity || 0));
    const amount = Math.max(0, Number(item?.amount || Number(item?.unitPrice || 0) * quantity || 0));
    const outputPerPortion = Math.max(0, extractNumber(item?.output));
    const outputTotal = outputPerPortion * quantity;
    const haystack = [item?.category, item?.subcategory, item?.productName, item?.output].filter(Boolean).join(" ");
    const isAlcohol = hasAnyKeyword(haystack, ALCOHOL_KEYWORDS);
    const isBeverage = isAlcohol || hasAnyKeyword(haystack, BEVERAGE_KEYWORDS) || normalizeKey(String(item?.output || "")).includes("мл");

    acc.totalMenuCost += amount;
    if (isAlcohol) {
      acc.totalAlcoholMl += outputTotal;
    } else if (isBeverage) {
      acc.totalNonAlcoholMl += outputTotal;
    } else {
      acc.totalFoodGrams += outputTotal;
    }

    return acc;
  }, {
    totalFoodGrams: 0,
    totalNonAlcoholMl: 0,
    totalAlcoholMl: 0,
    totalMenuCost: 0,
  });

  return {
    ...totals,
    guestCount,
    foodPerGuestGrams: guestCount > 0 ? totals.totalFoodGrams / guestCount : 0,
    nonAlcoholPerGuestMl: guestCount > 0 ? totals.totalNonAlcoholMl / guestCount : 0,
    alcoholPerGuestMl: guestCount > 0 ? totals.totalAlcoholMl / guestCount : 0,
    costPerGuest: guestCount > 0 ? totals.totalMenuCost / guestCount : 0,
  };
};

const formatNumberUk = (value, fractionDigits = 0) => new Intl.NumberFormat("uk-UA", {
  minimumFractionDigits: fractionDigits,
  maximumFractionDigits: fractionDigits,
}).format(Number(value || 0));

const parseVatRuleFromOption = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parts = raw.split(/\||=|:/);
  const paymentType = String(parts[0] || "").trim();
  const vatPercent = Number(String(parts[1] || "").trim().replace(",", "."));
  if (!paymentType || !Number.isFinite(vatPercent)) return null;
  return {
    paymentType,
    vatPercent: Math.max(0, vatPercent),
  };
};

const parseVatRules = (fieldTemplate) => {
  const options = Array.isArray(fieldTemplate?.options) ? fieldTemplate.options : [];
  return options
    .map(parseVatRuleFromOption)
    .filter(Boolean);
};

const serializeVatRule = ({ paymentType, vatPercent }) => `${String(paymentType || "").trim()}|${Number(vatPercent || 0)}`;

const getVatPercentForPaymentType = (paymentType, vatRules) => {
  const paymentProbe = normalizeKey(paymentType);
  if (!paymentProbe) return 0;
  const directMatch = (Array.isArray(vatRules) ? vatRules : []).find((rule) => normalizeKey(rule.paymentType) === paymentProbe);
  if (directMatch) return Number(directMatch.vatPercent || 0);
  const containsMatch = (Array.isArray(vatRules) ? vatRules : []).find((rule) => paymentProbe.includes(normalizeKey(rule.paymentType)));
  if (containsMatch) return Number(containsMatch.vatPercent || 0);
  return 0;
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll("\"", "&quot;")
  .replaceAll("'", "&#039;");

const buildOrderTitle = (_eventType, companyName, customerName) => {
  const cleanCompany = String(companyName || "").trim();
  const cleanCustomer = String(customerName || "").trim();
  const customerBlock = [cleanCompany, cleanCustomer].filter(Boolean).join(" — ");
  if (customerBlock) return customerBlock;
  return "";
};

const emptyOrder = {
  id: "",
  title: "",
  customerName: "",
  companyName: "",
  eventType: "",
  contactId: "",
  managerName: "",
  serviceManagerName: "",
  clientType: "",
  leadSource: "",
  amount: "",
  guestCount: "",
  eventDate: "",
  eventEndDate: "",
  eventTime: "",
  eventEndTime: "",
  paymentType: "",
  discountValue: "",
  status: "new",
  notes: "",
  tags: "",
  newContactPhone: "",
  newContactEmail: "",
  newContactIndustry: "",
  newContactAddress: "",
};

const emptyContact = {
  id: "",
  name: "",
  company: "",
  industry: "",
  address: "",
  phone: "",
  email: "",
  assignedManager: "",
  leadSource: "",
  notes: "",
};

const emptyField = {
  id: "",
  label: "",
  key: "",
  category: "order",
  type: "text",
  required: false,
  placeholder: "",
  description: "",
  options: "",
};

const emptyProposal = {
  id: "",
  orderId: "",
  orderTitle: "",
  title: "",
  customerName: "",
  companyName: "",
  managerName: "",
  status: "draft",
  notes: "",
  items: [],
};

const PROPOSAL_STATUS_OPTIONS = [
  { value: "draft", label: "Чернетка" },
  { value: "sent", label: "Надіслано" },
  { value: "approved", label: "Погоджено" },
  { value: "cancelled", label: "Скасовано" },
];

const FIELD_PRESETS = [
  {
    id: "eventType",
    label: "Тип заходу",
    key: "eventType",
    category: "order",
    type: "select",
    required: true,
    placeholder: "Оберіть тип заходу",
    description: "Використовується в назві угоди",
    options: "Фуршет, Банкет, Кава-брейк, Корпоратив",
  },
  {
    id: "clientType",
    label: "Тип клієнта",
    key: "clientType",
    category: "customer",
    type: "select",
    required: false,
    placeholder: "Постійний / Новий",
    description: "Фіксує рівень лояльності клієнта",
    options: "Постійний, Новий",
  },
  {
    id: "leadSource",
    label: "Джерело ліда",
    key: "leadSource",
    category: "source",
    type: "select",
    required: false,
    placeholder: "Звідки прийшов клієнт",
    description: "Наприклад: Telegram, Instagram, Сайт, Рекомендація",
    options: "Telegram, Instagram, Сайт, Телефон, Email, Рекомендація",
  },
  {
    id: "paymentType",
    label: "Тип оплати",
    key: "paymentType",
    category: "order",
    type: "select",
    required: false,
    placeholder: "Оберіть тип оплати",
    description: "Використовується в CRM угоді та таблиці",
    options: "ФОП-ФОП, Безготівка, Готівка, Картка, Післяплата",
  },
  {
    id: "eventTime",
    label: "Час проведення",
    key: "eventTime",
    category: "order",
    type: "text",
    required: false,
    placeholder: "Наприклад 18:30",
    description: "Час старту події",
    options: "",
  },
  {
    id: "orderTags",
    label: "Теги угоди",
    key: "orderTags",
    category: "tags",
    type: "multiselect",
    required: false,
    placeholder: "Позначки угоди",
    description: "Допомагає фільтрувати CRM",
    options: "VIP, Повторне звернення, Терміново, Пріоритет",
  },
];

const ORDER_TABLE_COLUMNS = [
  { id: "title", label: "Угода" },
  { id: "status", label: "Стадія" },
  { id: "managerName", label: "Менеджер" },
  { id: "serviceManagerName", label: "Сервіс менеджер" },
  { id: "eventType", label: "Тип заходу" },
  { id: "clientType", label: "Тип клієнта" },
  { id: "leadSource", label: "Джерело" },
  { id: "contactName", label: "Контакт (ПІБ)" },
  { id: "contactCompany", label: "Контакт (компанія)" },
  { id: "contactPhone", label: "Телефон контакту" },
  { id: "contactEmail", label: "Email контакту" },
  { id: "contactAddress", label: "Адреса контакту" },
  { id: "contactIndustry", label: "Промисловість контакту" },
  { id: "contactManager", label: "Менеджер контакту" },
  { id: "contactNotes", label: "Нотатки контакту" },
  { id: "eventDateTime", label: "Дата/час" },
  { id: "paymentType", label: "Тип оплати" },
  { id: "guestCount", label: "Гостей" },
  { id: "discountValue", label: "Знижка" },
  { id: "amount", label: "Сума" },
  { id: "tags", label: "Теги" },
];

const DEFAULT_ORDER_TABLE_COLUMN_IDS = [
  "title",
  "status",
  "managerName",
  "serviceManagerName",
  "eventDateTime",
  "paymentType",
  "guestCount",
  "amount",
];

const ORDER_TABLE_COLUMNS_STORAGE_KEY = "lucia_catering_crm_order_table_columns";

const baseInput = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
const compactActionBtn = "inline-flex h-7 items-center justify-center rounded-md border px-2 text-[11px] font-semibold transition";

const openNativeDatePicker = (event) => {
  const input = event.currentTarget;
  if (typeof input?.showPicker === "function") {
    input.showPicker();
  }
};

export default function CateringCrmTab({
  mode,
  orders,
  contacts,
  fieldTemplates,
  proposals,
  assortmentItems,
  managers,
  currentUserName,
  saving,
  onSaveOrder,
  onDeleteOrder,
  onSaveContact,
  onDeleteContact,
  onSaveField,
  onDeleteField,
  onSaveProposal,
  onDeleteProposal,
}) {
  const createDefaultOrder = (managerName) => ({
    ...emptyOrder,
    managerName: String(managerName || "").trim(),
    serviceManagerName: String(managerName || "").trim(),
  });

  const [orderForm, setOrderForm] = useState(() => createDefaultOrder(currentUserName));
  const [contactForm, setContactForm] = useState(emptyContact);
  const [fieldForm, setFieldForm] = useState(emptyField);
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [draggedOrderId, setDraggedOrderId] = useState("");
  const [ordersViewMode, setOrdersViewMode] = useState("table");
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [proposalForm, setProposalForm] = useState(emptyProposal);
  const [proposalProductSearch, setProposalProductSearch] = useState("");
  const [proposalCategoryFilter, setProposalCategoryFilter] = useState("all");
  const [proposalSubcategoryFilter, setProposalSubcategoryFilter] = useState("all");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [contactManagerFilter, setContactManagerFilter] = useState("");
  const [contactIndustryFilter, setContactIndustryFilter] = useState("");
  const [fieldSearch, setFieldSearch] = useState("");
  const [fieldCategoryFilter, setFieldCategoryFilter] = useState("all");
  const [vatRulesDraft, setVatRulesDraft] = useState([]);
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [draggedColumnId, setDraggedColumnId] = useState("");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [orderTableColumns, setOrderTableColumns] = useState(() => {
    const fallback = ORDER_TABLE_COLUMNS.map((column) => ({
      id: column.id,
      visible: DEFAULT_ORDER_TABLE_COLUMN_IDS.includes(column.id),
    }));

    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(ORDER_TABLE_COLUMNS_STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return fallback;

      const parsedMap = new Map(
        parsed
          .filter((item) => item && typeof item === "object")
          .map((item) => [String(item.id || ""), Boolean(item.visible)]),
      );

      const orderedKnown = parsed
        .map((item) => String(item?.id || ""))
        .filter((id) => ORDER_TABLE_COLUMNS.some((column) => column.id === id));
      const missingKnown = ORDER_TABLE_COLUMNS.map((column) => column.id).filter((id) => !orderedKnown.includes(id));
      const finalOrder = [...orderedKnown, ...missingKnown];

      return finalOrder.map((id) => ({
        id,
        visible: parsedMap.has(id) ? Boolean(parsedMap.get(id)) : DEFAULT_ORDER_TABLE_COLUMN_IDS.includes(id),
      }));
    } catch {
      return fallback;
    }
  });
  const contactImportRef = useRef(null);
  const columnsMenuRef = useRef(null);

  useEffect(() => {
    setOrderForm(createDefaultOrder(currentUserName));
    setContactForm(emptyContact);
    setFieldForm(emptyField);
  }, [mode, currentUserName]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ORDER_TABLE_COLUMNS_STORAGE_KEY, JSON.stringify(orderTableColumns));
  }, [orderTableColumns]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!columnsMenuRef.current) return;
      if (columnsMenuRef.current.contains(event.target)) return;
      setShowColumnsMenu(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const boardOrders = useMemo(() => {
    const base = orders.filter((item) => item.status !== "cancelled");
    if (!orderDateFrom && !orderDateTo) return base;
    return base.filter((item) => {
      const date = String(item.eventDate || "").slice(0, 10);
      if (!date) return false;
      if (orderDateFrom && date < orderDateFrom) return false;
      if (orderDateTo && date > orderDateTo) return false;
      return true;
    });
  }, [orders, orderDateFrom, orderDateTo]);
  const cancelledOrders = useMemo(() => orders.filter((item) => item.status === "cancelled"), [orders]);
  const wonAmount = useMemo(() => orders.filter((item) => item.status === "confirmed").reduce((sum, item) => sum + Number(item.amount || 0), 0), [orders]);
  const pipelineAmount = useMemo(() => orders.filter((item) => item.status !== "confirmed" && item.status !== "cancelled").reduce((sum, item) => sum + Number(item.amount || 0), 0), [orders]);
  const statusSummary = useMemo(
    () => ORDER_STATUSES.map((status) => {
      const byStatus = orders.filter((item) => String(item.status || "") === status.id);
      return {
        ...status,
        count: byStatus.length,
      };
    }),
    [orders],
  );

  const crmProgress = useMemo(() => {
    const activeOrders = orders.filter((item) => item.status !== "cancelled");
    const confirmedOrders = activeOrders.filter((item) => item.status === "confirmed");
    const total = activeOrders.length;
    const done = confirmedOrders.length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return {
      total,
      done,
      percent,
    };
  }, [orders]);

  const eventTypeOptions = useMemo(() => {
    const eventTypeTemplateOptions = fieldTemplates
      .filter((item) => {
        const key = normalizeKey(item.key);
        const label = normalizeKey(item.label);
        return key === "eventtype" || label === "типзаходу";
      })
      .flatMap((item) => (Array.isArray(item.options) ? item.options : []));

    const dedicatedTypeRows = fieldTemplates
      .filter((item) => normalizeKey(item.key).startsWith("eventtypeoption"))
      .map((item) => item.label);

    return Array.from(new Set([...eventTypeTemplateOptions, ...dedicatedTypeRows].map((item) => String(item || "").trim()).filter(Boolean)));
  }, [fieldTemplates]);

  const contactLookup = useMemo(() => {
    const map = new Map();
    contacts.forEach((item) => {
      const name = String(item.name || "").trim();
      const company = String(item.company || "").trim();
      if (name) map.set(normalizeKey(name), item);
      if (company) map.set(normalizeKey(company), item);
      if (name && company) map.set(normalizeKey(`${name} ${company}`), item);
      if (name && company) map.set(normalizeKey(`${name} • ${company}`), item);
      if (name && company) map.set(normalizeKey(`${company} ${name}`), item);
      if (name && company) map.set(normalizeKey(`${company} • ${name}`), item);
    });
    return map;
  }, [contacts]);

  const contactsById = useMemo(() => {
    const map = new Map();
    contacts.forEach((item) => {
      const id = String(item?.id || "").trim();
      if (!id) return;
      map.set(id, item);
    });
    return map;
  }, [contacts]);

  const productsByCategory = useMemo(() => {
    const grouped = new Map();
    (Array.isArray(assortmentItems) ? assortmentItems : []).forEach((item) => {
      const category = String(item.category || "Без категорії").trim() || "Без категорії";
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(item);
    });
    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "uk"))
      .map(([category, items]) => ({
        category,
        items: [...items].sort((a, b) => String(a?.productName || "").localeCompare(String(b?.productName || ""), "uk")),
      }));
  }, [assortmentItems]);

  const proposalCategoryOptions = useMemo(
    () => productsByCategory.map((group) => group.category),
    [productsByCategory],
  );

  const proposalSubcategoryOptions = useMemo(() => {
    const source = Array.isArray(assortmentItems) ? assortmentItems : [];
    const set = new Set();
    source.forEach((item) => {
      const category = String(item?.category || "Без категорії").trim() || "Без категорії";
      if (proposalCategoryFilter !== "all" && category !== proposalCategoryFilter) return;
      const subcategory = String(item?.subcategory || "").trim();
      if (subcategory) set.add(subcategory);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "uk"));
  }, [assortmentItems, proposalCategoryFilter]);

  const filteredProductsByCategory = useMemo(() => {
    const probe = normalizeKey(proposalProductSearch);
    return productsByCategory
      .map((group) => {
        if (proposalCategoryFilter !== "all" && group.category !== proposalCategoryFilter) return null;
        const items = group.items.filter((item) => {
          const subcategory = String(item?.subcategory || "").trim();
          if (proposalSubcategoryFilter !== "all" && subcategory !== proposalSubcategoryFilter) return false;
          if (!probe) return true;
          const haystack = normalizeKey(
            [
              item?.productName,
              item?.name,
              item?.category,
              item?.subcategory,
              item?.output,
            ].filter(Boolean).join(" "),
          );
          return haystack.includes(probe);
        });
        if (items.length === 0) return null;
        return {
          category: group.category,
          items,
        };
      })
      .filter(Boolean);
  }, [productsByCategory, proposalProductSearch, proposalCategoryFilter, proposalSubcategoryFilter]);

  const filteredProductsCount = useMemo(
    () => filteredProductsByCategory.reduce((sum, group) => sum + group.items.length, 0),
    [filteredProductsByCategory],
  );

  const proposalsByOrder = useMemo(() => {
    const map = new Map();
    (Array.isArray(proposals) ? proposals : []).forEach((item) => {
      const key = String(item.orderId || "");
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return map;
  }, [proposals]);

  const proposalStats = useMemo(() => {
    const all = Array.isArray(proposals) ? proposals : [];
    const active = all.filter((item) => String(item.status || "draft").toLowerCase() !== "cancelled");
    const cancelled = all.filter((item) => String(item.status || "").toLowerCase() === "cancelled");
    return { all, active, cancelled };
  }, [proposals]);

  const selectedOrder = useMemo(
    () => orders.find((item) => String(item.id) === String(selectedOrderId)) || null,
    [orders, selectedOrderId],
  );

  const selectedOrderProposals = useMemo(() => {
    if (!selectedOrder) return [];
    return [...(proposalsByOrder.get(String(selectedOrder.id)) || [])].sort((a, b) => {
      const left = new Date(String(a?.updatedAt || a?.createdAt || 0)).getTime();
      const right = new Date(String(b?.updatedAt || b?.createdAt || 0)).getTime();
      return right - left;
    });
  }, [selectedOrder, proposalsByOrder]);

  const getFieldTemplateOptions = (keys = []) => {
    const normalizedKeys = keys.map((item) => normalizeKey(item));
    const values = fieldTemplates
      .filter((item) => normalizedKeys.includes(normalizeKey(item.key)) || normalizedKeys.includes(normalizeKey(item.label)))
      .flatMap((item) => (Array.isArray(item.options) ? item.options : []))
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    return Array.from(new Set(values));
  };

  const clientTypeOptions = useMemo(() => getFieldTemplateOptions(["clientType", "тип клієнта", "тип клиента"]), [fieldTemplates]);
  const leadSourceOptions = useMemo(() => getFieldTemplateOptions(["leadSource", "leadChannel", "джерело", "джерело ліда", "канал", "source"]), [fieldTemplates]);
  const paymentTypeOptions = useMemo(() => {
    const baseOptions = getFieldTemplateOptions(["paymentType", "тип оплати", "оплата", "payment"]);
    const vatTemplate = fieldTemplates.find((item) => VAT_RULES_FIELD_KEYS.includes(normalizeKey(item?.key || item?.label)));
    const vatOptions = parseVatRules(vatTemplate).map((item) => String(item.paymentType || "").trim()).filter(Boolean);
    return Array.from(new Set([...baseOptions, ...vatOptions]));
  }, [fieldTemplates]);
  const industryOptions = useMemo(() => getFieldTemplateOptions(["industry", "промисловість", "бізнес напрям", "напрям"]), [fieldTemplates]);

  const contactManagerOptions = useMemo(() => {
    const set = new Set(contacts.map((item) => String(item.assignedManager || "").trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "uk"));
  }, [contacts]);

  const contactIndustryFilterOptions = useMemo(() => {
    const set = new Set(contacts.map((item) => String(item.industry || "").trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "uk"));
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    const probe = normalizeKey(contactSearch);
    return contacts.filter((item) => {
      if (contactManagerFilter && String(item.assignedManager || "").trim() !== contactManagerFilter) return false;
      if (contactIndustryFilter && String(item.industry || "").trim() !== contactIndustryFilter) return false;
      if (!probe) return true;
      const haystack = normalizeKey([item.name, item.company, item.industry, item.address, item.phone, item.email, item.assignedManager, item.leadSource].filter(Boolean).join(" "));
      return haystack.includes(probe);
    });
  }, [contacts, contactSearch, contactManagerFilter, contactIndustryFilter]);

  const handleDownloadContactsTemplate = () => {
    downloadCateringContactsTemplate();
  };

  const handleExportContacts = () => {
    exportCateringContactsToExcel(contacts);
  };

  const handleImportContacts = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const importedRows = await importCateringContactsFromExcel(file);
      if (!Array.isArray(importedRows) || importedRows.length === 0) {
        window.alert("У файлі не знайдено контактів для імпорту.");
        return;
      }

      let importedCount = 0;
      for (const row of importedRows) {
        // eslint-disable-next-line no-await-in-loop
        const result = await onSaveContact(row);
        if (result?.success) importedCount += 1;
      }

      window.alert(`Імпорт завершено. Додано/оновлено контактів: ${importedCount}.`);
    } catch (error) {
      console.error("Помилка імпорту контактів:", error);
      window.alert("Не вдалося імпортувати контакти з Excel.");
    }
  };

  const filteredFieldTemplates = useMemo(() => {
    const probe = normalizeKey(fieldSearch);
    return fieldTemplates.filter((item) => {
      const categoryPass = fieldCategoryFilter === "all" || String(item.category || "").trim() === fieldCategoryFilter;
      if (!categoryPass) return false;
      if (!probe) return true;
      const haystack = normalizeKey([item.label, item.key, item.category, item.type, item.description, ...(Array.isArray(item.options) ? item.options : [])].filter(Boolean).join(" "));
      return haystack.includes(probe);
    });
  }, [fieldTemplates, fieldSearch, fieldCategoryFilter]);

  const vatRulesTemplate = useMemo(
    () => fieldTemplates.find((item) => VAT_RULES_FIELD_KEYS.includes(normalizeKey(item?.key || item?.label))),
    [fieldTemplates],
  );

  const vatRules = useMemo(() => parseVatRules(vatRulesTemplate), [vatRulesTemplate]);

  useEffect(() => {
    setVatRulesDraft(vatRules.length > 0 ? vatRules : [{ paymentType: "", vatPercent: 0 }]);
  }, [vatRulesTemplate?.id, vatRulesTemplate?.updatedAt]);

  const nonVatFieldTemplates = useMemo(
    () => filteredFieldTemplates.filter((item) => {
      const normalized = normalizeKey(item?.key || item?.label);
      if (VAT_RULES_FIELD_KEYS.includes(normalized)) return false;
      if (PAYMENT_TYPE_FIELD_KEYS.includes(normalized)) return false;
      return true;
    }),
    [filteredFieldTemplates],
  );

  const saveVatRules = async () => {
    const prepared = vatRulesDraft
      .map((row) => ({
        paymentType: String(row?.paymentType || "").trim(),
        vatPercent: Math.max(0, Number(row?.vatPercent || 0)),
      }))
      .filter((row) => row.paymentType);

    const result = await onSaveField({
      id: vatRulesTemplate?.id || "",
      label: "ПДВ за типом оплати",
      key: "paymentTypeVatRules",
      category: "order",
      type: "select",
      required: false,
      placeholder: "Правила ПДВ для суми КП",
      description: "Формат options: Тип оплати|Відсоток ПДВ",
      options: prepared.map(serializeVatRule),
    });

    if (result?.success) {
      window.alert("Правила ПДВ збережено.");
    }
  };

  const openOrderEditor = (item) => {
    const normalizedDate = toDateInputValue(item?.eventDate);
    setOrderForm({
      ...createDefaultOrder(currentUserName),
      ...item,
      eventDate: normalizedDate,
      tags: Array.isArray(item?.tags) ? item.tags.join(", ") : String(item?.tags || ""),
    });
    setShowNewOrderModal(true);
  };

  const openProposalBuilder = (order) => {
    setProposalProductSearch("");
    setProposalCategoryFilter("all");
    setProposalSubcategoryFilter("all");
    setProposalForm({
      ...emptyProposal,
      orderId: String(order?.id || ""),
      orderTitle: String(order?.title || "").trim(),
      title: `КП: ${String(order?.title || "Нова пропозиція").trim()}`,
      customerName: String(order?.customerName || "").trim(),
      companyName: String(order?.companyName || "").trim(),
      managerName: String(order?.managerName || currentUserName || "").trim(),
      notes: String(order?.notes || "").trim(),
      items: [],
    });
    setShowProposalModal(true);
  };

  const openExistingProposalEditor = (proposal, order) => {
    setProposalProductSearch("");
    setProposalCategoryFilter("all");
    setProposalSubcategoryFilter("all");
    const fallbackOrder = order || orders.find((item) => String(item.id) === String(proposal?.orderId));
    setProposalForm({
      ...emptyProposal,
      id: String(proposal?.id || ""),
      orderId: String(proposal?.orderId || fallbackOrder?.id || ""),
      orderTitle: String(proposal?.orderTitle || fallbackOrder?.title || "").trim(),
      title: String(proposal?.title || "").trim(),
      customerName: String(proposal?.customerName || fallbackOrder?.customerName || "").trim(),
      companyName: String(proposal?.companyName || fallbackOrder?.companyName || "").trim(),
      managerName: String(proposal?.managerName || fallbackOrder?.managerName || currentUserName || "").trim(),
      status: String(proposal?.status || "draft").trim() || "draft",
      notes: String(proposal?.notes || "").trim(),
      items: Array.isArray(proposal?.items)
        ? proposal.items.map((item) => ({
          id: String(item?.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
          category: String(item?.category || "").trim(),
          subcategory: String(item?.subcategory || "").trim(),
          productName: String(item?.productName || "").trim(),
          output: String(item?.output || "").trim(),
          unitPrice: Number(item?.unitPrice || 0),
          quantity: Number(item?.quantity || 0),
          amount: Number(item?.amount || Number(item?.unitPrice || 0) * Number(item?.quantity || 0)),
        }))
        : [],
    });
    setShowProposalModal(true);
  };

  const handleOpenProposalForBrief = (order) => {
    const orderId = String(order?.id || "");
    if (!orderId) {
      openProposalBuilder(order);
      return;
    }

    const existing = [...(proposalsByOrder.get(orderId) || [])]
      .sort((a, b) => {
        const left = new Date(String(a?.updatedAt || a?.createdAt || 0)).getTime();
        const right = new Date(String(b?.updatedAt || b?.createdAt || 0)).getTime();
        return right - left;
      })[0];

    if (!existing) {
      openProposalBuilder(order);
      return;
    }

    const shouldEditExisting = window.confirm(
      "Для цього брифу вже є КП. Натисніть ОК, щоб редагувати наявне КП, або Скасувати, щоб створити нове.",
    );

    if (shouldEditExisting) {
      openExistingProposalEditor(existing, order);
      return;
    }

    openProposalBuilder(order);
  };

  const markProposalCancelled = async (item) => {
    const result = await onSaveProposal({ ...item, status: "cancelled" });
    return result?.success;
  };

  const addProposalItem = (product) => {
    setProposalForm((prev) => {
      const unitPrice = Number(product?.unitPrice || 0);
      const nextItem = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        category: String(product?.category || "").trim(),
        subcategory: String(product?.subcategory || "").trim(),
        productName: String(product?.productName || product?.name || "").trim(),
        output: String(product?.output || "").trim(),
        unitPrice,
        quantity: 1,
        amount: unitPrice,
      };
      return {
        ...prev,
        items: [...prev.items, nextItem],
      };
    });
  };

  const updateProposalItem = (itemId, patch) => {
    setProposalForm((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== itemId) return item;
        const next = { ...item, ...patch };
        const unitPrice = Number(next.unitPrice || 0);
        const quantity = Number(next.quantity || 0);
        return {
          ...next,
          amount: unitPrice * quantity,
        };
      }),
    }));
  };

  const removeProposalItem = (itemId) => {
    setProposalForm((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== itemId),
    }));
  };

  const proposalItemsByCategory = useMemo(() => {
    const grouped = new Map();
    proposalForm.items.forEach((item) => {
      const category = String(item?.category || "Без категорії").trim() || "Без категорії";
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(item);
    });
    return Array.from(grouped.entries()).map(([category, items]) => ({ category, items }));
  }, [proposalForm.items]);

  const proposalGuestCount = useMemo(() => {
    const relatedOrder = orders.find((item) => String(item.id) === String(proposalForm.orderId));
    return Number(relatedOrder?.guestCount || 0);
  }, [orders, proposalForm.orderId]);

  const proposalPaymentType = useMemo(() => {
    const relatedOrder = orders.find((item) => String(item.id) === String(proposalForm.orderId));
    return String(relatedOrder?.paymentType || "").trim();
  }, [orders, proposalForm.orderId]);

  const proposalMetrics = useMemo(
    () => toProposalMetrics(proposalForm.items, proposalGuestCount),
    [proposalForm.items, proposalGuestCount],
  );

  const proposalVatPercent = useMemo(
    () => getVatPercentForPaymentType(proposalPaymentType, vatRules),
    [proposalPaymentType, vatRules],
  );

  const proposalVatAmount = useMemo(
    () => proposalMetrics.totalMenuCost * (proposalVatPercent / 100),
    [proposalMetrics.totalMenuCost, proposalVatPercent],
  );

  const proposalTotalWithVat = useMemo(
    () => proposalMetrics.totalMenuCost + proposalVatAmount,
    [proposalMetrics.totalMenuCost, proposalVatAmount],
  );

  const handleExportProposalPdf = (proposal = proposalForm, linkedOrder = null) => {
    if (typeof window === "undefined") return;

    const items = Array.isArray(proposal?.items) ? proposal.items : [];
    if (items.length === 0) {
      window.alert("Додайте позиції у КП перед експортом в PDF.");
      return;
    }

    const order = linkedOrder || orders.find((item) => String(item.id) === String(proposal?.orderId));
    const metrics = toProposalMetrics(items, Number(order?.guestCount || 0));
    const paymentType = String(order?.paymentType || "").trim();
    const vatPercent = getVatPercentForPaymentType(paymentType, vatRules);
    const vatAmount = metrics.totalMenuCost * (vatPercent / 100);
    const totalWithVat = metrics.totalMenuCost + vatAmount;

    const grouped = new Map();
    items.forEach((item) => {
      const category = String(item?.category || "Без категорії").trim() || "Без категорії";
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(item);
    });

    const linesHtml = Array.from(grouped.entries())
      .map(([category, rows]) => {
        const rowHtml = rows.map((item) => {
          const qty = Number(item?.quantity || 0);
          const unitPrice = Number(item?.unitPrice || 0);
          const amount = Number(item?.amount || unitPrice * qty || 0);
          return `
            <div class="line-item">
              <div class="name">${escapeHtml(item?.productName || "—")}</div>
              <div>${escapeHtml(item?.output || "—")}</div>
              <div>${escapeHtml(formatMoney(unitPrice))}</div>
              <div>${escapeHtml(formatNumberUk(qty, 0))}</div>
              <div class="sum">${escapeHtml(formatMoney(amount))}</div>
            </div>
          `;
        }).join("");

        return `
          <section class="category-block">
            <h3>${escapeHtml(category)}</h3>
            <div class="line-head">
              <div>Позиція</div>
              <div>Вихід</div>
              <div>Ціна</div>
              <div>К-сть</div>
              <div>Сума</div>
            </div>
            ${rowHtml}
          </section>
        `;
      })
      .join("");

    const html = `
      <!doctype html>
      <html lang="uk">
        <head>
          <meta charset="UTF-8" />
          <title>${escapeHtml(proposal?.title || "Комерційна пропозиція")}</title>
          <style>
            @page { size: A4; margin: 14mm; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              font-family: "Segoe UI", Tahoma, Arial, sans-serif;
              color: #0f172a;
              background: #fff;
            }
            .sheet { width: 100%; }
            .top {
              display: grid;
              grid-template-columns: 1fr auto;
              gap: 12px;
              margin-bottom: 14px;
              align-items: end;
            }
            .title {
              margin: 0;
              font-size: 24px;
              font-weight: 700;
              color: #112b61;
            }
            .meta {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 8px;
              margin-bottom: 16px;
              font-size: 12px;
            }
            .meta div {
              border: 1px solid #cbd5e1;
              border-radius: 8px;
              padding: 7px 9px;
              background: #f8fafc;
            }
            .category-block {
              border: 1px solid #dbe4f0;
              border-radius: 10px;
              padding: 10px;
              margin-bottom: 10px;
              page-break-inside: avoid;
            }
            .category-block h3 {
              margin: 0 0 8px;
              font-size: 14px;
              text-align: center;
              color: #112b61;
              text-transform: uppercase;
              letter-spacing: 0.04em;
            }
            .line-head,
            .line-item {
              display: grid;
              grid-template-columns: 2.3fr 0.9fr 0.9fr 0.7fr 1fr;
              gap: 8px;
              align-items: center;
            }
            .line-head {
              font-size: 11px;
              font-weight: 700;
              color: #64748b;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 6px;
            }
            .line-item {
              font-size: 12px;
              padding: 7px 0;
              border-bottom: 1px dashed #e2e8f0;
            }
            .line-item:last-child { border-bottom: 0; }
            .line-item .name { font-weight: 600; }
            .line-item .sum { font-weight: 700; }
            .totals {
              margin-top: 14px;
              border: 1px solid #bfd0f0;
              border-radius: 10px;
              overflow: hidden;
            }
            .totals-row {
              display: grid;
              grid-template-columns: 1fr auto;
              gap: 8px;
              padding: 9px 12px;
              border-bottom: 1px solid #dbe4f0;
              font-size: 13px;
            }
            .totals-row:last-child { border-bottom: 0; }
            .totals-row strong { color: #0b1c44; }
            .totals-row.main {
              background: #112b61;
              color: #fff;
              font-weight: 700;
              font-size: 14px;
            }
            .footer {
              margin-top: 14px;
              font-size: 11px;
              color: #64748b;
            }
            @media print {
              .sheet { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="top">
              <h1 class="title">${escapeHtml(proposal?.title || "Комерційна пропозиція")}</h1>
              <div>${escapeHtml(new Date().toLocaleDateString("uk-UA"))}</div>
            </div>

            <div class="meta">
              <div><strong>Компанія:</strong> ${escapeHtml(proposal?.companyName || order?.companyName || "—")}</div>
              <div><strong>Клієнт:</strong> ${escapeHtml(proposal?.customerName || order?.customerName || "—")}</div>
              <div><strong>Менеджер:</strong> ${escapeHtml(proposal?.managerName || order?.managerName || "—")}</div>
              <div><strong>К-сть гостей:</strong> ${escapeHtml(metrics.guestCount > 0 ? formatNumberUk(metrics.guestCount, 0) : "—")}</div>
            </div>

            ${linesHtml}

            <div class="totals">
              <div class="totals-row"><span>Вихід меню на 1 Гостя, грам</span><strong>${escapeHtml(formatNumberUk(metrics.foodPerGuestGrams, 0))}</strong></div>
              <div class="totals-row"><span>Вихід безалкогольних напоїв на 1 Гостя, мл</span><strong>${escapeHtml(formatNumberUk(metrics.nonAlcoholPerGuestMl, 0))}</strong></div>
              <div class="totals-row"><span>Вихід алкогольних напоїв на 1 Гостя, мл</span><strong>${escapeHtml(formatNumberUk(metrics.alcoholPerGuestMl, 0))}</strong></div>
              <div class="totals-row"><span>Вартість меню на 1 Гостя, грн</span><strong>${escapeHtml(formatNumberUk(metrics.costPerGuest, 0))}</strong></div>
              <div class="totals-row"><span>ПДВ ${escapeHtml(formatNumberUk(vatPercent, 0))}%</span><strong>${escapeHtml(formatNumberUk(vatAmount, 0))}</strong></div>
              <div class="totals-row main"><span>Всього за меню, грн</span><strong>${escapeHtml(formatNumberUk(metrics.totalMenuCost, 0))}</strong></div>
              <div class="totals-row main"><span>Всього з ПДВ, грн</span><strong>${escapeHtml(formatNumberUk(totalWithVat, 0))}</strong></div>
            </div>

            ${proposal?.notes ? `<div class="footer"><strong>Коментар:</strong> ${escapeHtml(proposal.notes)}</div>` : ""}
          </div>
        </body>
      </html>
    `;

    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.style.opacity = "0";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);

    const printDoc = frame.contentWindow?.document;
    if (!printDoc || !frame.contentWindow) {
      frame.remove();
      window.alert("Не вдалося сформувати PDF. Спробуйте ще раз.");
      return;
    }

    printDoc.open();
    printDoc.write(html);
    printDoc.close();

    const cleanup = () => {
      window.setTimeout(() => {
        frame.remove();
      }, 400);
    };

    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      cleanup();
    };

    window.setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      cleanup();
    }, 250);
  };

  const moveOrderToStatus = (orderId, nextStatus) => {
    if (!orderId || !nextStatus) return;
    const sourceOrder = orders.find((item) => String(item.id) === String(orderId));
    if (!sourceOrder || sourceOrder.status === nextStatus) return;
    void onSaveOrder({ ...sourceOrder, status: nextStatus });
  };

  const closeOrderDetails = () => {
    setSelectedOrderId("");
  };

  const visibleOrderTableColumns = useMemo(
    () => orderTableColumns.filter((column) => column.visible),
    [orderTableColumns],
  );

  const getOrderTableCellValue = (item, columnId) => {
    const relatedContact =
      contactsById.get(String(item?.contactId || "").trim())
      || contactLookup.get(normalizeKey(`${String(item?.companyName || "").trim()} ${String(item?.customerName || "").trim()}`))
      || contactLookup.get(normalizeKey(String(item?.customerName || "").trim()))
      || contactLookup.get(normalizeKey(String(item?.companyName || "").trim()))
      || null;

    switch (columnId) {
      case "title":
        return <span className="font-semibold text-slate-900">{item.title || "Без назви"}</span>;
      case "status":
        return ORDER_STATUSES.find((status) => status.id === item.status)?.label || item.status;
      case "managerName":
        return item.managerName || "—";
      case "serviceManagerName":
        return item.serviceManagerName || "—";
      case "eventType":
        return item.eventType || "—";
      case "clientType":
        return item.clientType || "—";
      case "leadSource":
        return item.leadSource || "—";
      case "contactName":
        return relatedContact?.name || item.customerName || "—";
      case "contactCompany":
        return relatedContact?.company || item.companyName || "—";
      case "contactPhone":
        return relatedContact?.phone || "—";
      case "contactEmail":
        return relatedContact?.email || "—";
      case "contactAddress":
        return relatedContact?.address || "—";
      case "contactIndustry":
        return relatedContact?.industry || "—";
      case "contactManager":
        return relatedContact?.assignedManager || "—";
      case "contactNotes":
        return relatedContact?.notes || "—";
      case "eventDateTime": {
        const startDate = formatDateUk(item.eventDate);
        const endDate = item.eventEndDate && item.eventEndDate !== item.eventDate ? formatDateUk(item.eventEndDate) : "";
        const timePart = item.eventTime
          ? (item.eventEndTime ? `${item.eventTime}–${item.eventEndTime}` : item.eventTime)
          : "";
        const datePart = endDate ? `${startDate} – ${endDate}` : startDate;
        return `${datePart}${timePart ? ` • ${timePart}` : ""}`;
      }
      case "paymentType":
        return item.paymentType || "—";
      case "guestCount":
        return item.guestCount || "—";
      case "discountValue":
        return item.discountValue || "—";
      case "amount":
        return formatMoney(item.amount);
      case "tags":
        return Array.isArray(item.tags) && item.tags.length > 0 ? item.tags.join(", ") : "—";
      default:
        return "—";
    }
  };

  const toggleTableColumn = (columnId) => {
    setOrderTableColumns((prev) => prev.map((column) => (column.id === columnId ? { ...column, visible: !column.visible } : column)));
  };

  const moveTableColumn = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    setOrderTableColumns((prev) => {
      const fromIndex = prev.findIndex((column) => column.id === fromId);
      const toIndex = prev.findIndex((column) => column.id === toId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const orderCards = (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 shadow-inner ring-1 ring-slate-200">
                <button
                  type="button"
                  className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${ordersViewMode === "kanban" ? "bg-[#112b61] text-white shadow-sm" : "text-slate-600 hover:bg-white/80"}`}
                  onClick={() => setOrdersViewMode("kanban")}
                >
                  Борд
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${ordersViewMode === "table" ? "bg-[#112b61] text-white shadow-sm" : "text-slate-600 hover:bg-white/80"}`}
                  onClick={() => setOrdersViewMode("table")}
                >
                  Таблиця
                </button>
              </div>

              <div className="min-w-[210px] px-1 py-0.5">
                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700">Виконання плану</span>
                  <span>{crmProgress.percent}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100">
                  <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, crmProgress.percent)}%` }} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                {statusSummary.map((status) => (
                  <span key={status.id} className={`rounded-lg border px-2 py-1 ${status.tone}`}>
                    {status.label}: <span className="font-semibold">{status.count}</span>
                  </span>
                ))}
                <span className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-sky-700">Контакти: <span className="font-semibold text-sky-900">{contacts.length}</span></span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Дата</span>
                <input
                  type="date"
                  className="h-7 w-[130px] rounded-md border border-slate-200 px-2 text-xs text-slate-700 outline-none focus:border-indigo-400"
                  value={orderDateFrom}
                  onFocus={openNativeDatePicker}
                  onClick={openNativeDatePicker}
                  onChange={(event) => setOrderDateFrom(event.target.value)}
                />
                <span className="text-xs text-slate-400">—</span>
                <input
                  type="date"
                  className="h-7 w-[130px] rounded-md border border-slate-200 px-2 text-xs text-slate-700 outline-none focus:border-indigo-400"
                  value={orderDateTo}
                  onFocus={openNativeDatePicker}
                  onClick={openNativeDatePicker}
                  onChange={(event) => setOrderDateTo(event.target.value)}
                />
                {(orderDateFrom || orderDateTo) && (
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 px-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                    onClick={() => { setOrderDateFrom(""); setOrderDateTo(""); }}
                    title="Скинути фільтр дат"
                  >
                    ×
                  </button>
                )}
              </div>
              {ordersViewMode === "table" && (
                <div className="relative" ref={columnsMenuRef}>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => setShowColumnsMenu((prev) => !prev)}
                  >
                    Колонки
                  </button>
                  {showColumnsMenu && (
                    <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                      <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Показ / порядок колонок</p>
                      <div className="max-h-72 space-y-1 overflow-auto">
                        {orderTableColumns.map((column) => {
                          const label = ORDER_TABLE_COLUMNS.find((item) => item.id === column.id)?.label || column.id;
                          return (
                            <div
                              key={column.id}
                              draggable
                              className="flex cursor-grab items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50 active:cursor-grabbing"
                              onDragStart={() => setDraggedColumnId(column.id)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={() => {
                                moveTableColumn(draggedColumnId, column.id);
                                setDraggedColumnId("");
                              }}
                              onDragEnd={() => setDraggedColumnId("")}
                            >
                              <span className="text-slate-400">::</span>
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5"
                                checked={column.visible}
                                onChange={() => toggleTableColumn(column.id)}
                              />
                              <span className="truncate">{label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving}
                onClick={() => {
                  setOrderForm(createDefaultOrder(currentUserName));
                  setShowNewOrderModal(true);
                }}
              >
                <Plus size={15} className="inline mr-1" />
                Нова угода
              </button>
            </div>
          </div>

          <>
            {showNewOrderModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
                <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900">{orderForm.id ? "Редагування CRM угоди" : "Нова CRM угода"}</h3>
                  <div className="space-y-3 max-h-[70vh] overflow-y-auto">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Тип клієнта</label>
                      <select className={baseInput} value={orderForm.clientType} onChange={(event) => setOrderForm((prev) => ({ ...prev, clientType: event.target.value }))}>
                        <option value="">Оберіть тип клієнта</option>
                        {(clientTypeOptions.length > 0 ? clientTypeOptions : ["Постійний", "Новий"]).map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Тип заходу</label>
                        <select
                          className={baseInput}
                          value={orderForm.eventType}
                          onChange={(event) => {
                            const nextEventType = event.target.value;
                            setOrderForm((prev) => ({
                              ...prev,
                              eventType: nextEventType,
                              title: buildOrderTitle(nextEventType, prev.companyName, prev.customerName),
                            }));
                          }}
                        >
                          <option value="">Оберіть тип заходу</option>
                          {eventTypeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Клієнт / контакт</label>
                        <input
                          className={baseInput}
                          list="catering-client-contact-list"
                          value={orderForm.customerName}
                          onChange={(event) => {
                            const nextCustomer = event.target.value;
                            const matched = contactLookup.get(normalizeKey(nextCustomer));
                            setOrderForm((prev) => ({
                              ...prev,
                              customerName: matched?.name || nextCustomer,
                              companyName: matched?.company || "",
                              contactId: matched?.id || "",
                              title: buildOrderTitle(prev.eventType, matched?.company || "", matched?.name || nextCustomer),
                            }));
                          }}
                          placeholder="Почніть вводити ім'я/компанію"
                        />
                        <datalist id="catering-client-contact-list">
                          {contacts.map((item) => (
                            <option key={item.id} value={item.company ? `${item.company} • ${item.name}` : item.name}>{item.company ? `${item.company} • ${item.name}` : item.name}</option>
                          ))}
                        </datalist>
                      </div>
                    </div>

                    {String(orderForm.clientType || "").toLowerCase().includes("нов") && !orderForm.contactId && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">Дані нового контакту (буде створено разом з угодою)</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">ПІБ / Назва</label>
                            <input className={baseInput} value={orderForm.customerName} onChange={(event) => setOrderForm((prev) => ({ ...prev, customerName: event.target.value, title: buildOrderTitle(prev.eventType, prev.companyName, event.target.value) }))} placeholder="Ім'я контактної особи" />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Компанія</label>
                            <input className={baseInput} value={orderForm.companyName} onChange={(event) => setOrderForm((prev) => ({ ...prev, companyName: event.target.value, title: buildOrderTitle(prev.eventType, event.target.value, prev.customerName) }))} placeholder="Назва компанії" />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Телефон</label>
                            <input className={baseInput} value={orderForm.newContactPhone} onChange={(event) => setOrderForm((prev) => ({ ...prev, newContactPhone: event.target.value }))} placeholder="+380..." />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
                            <input className={baseInput} value={orderForm.newContactEmail} onChange={(event) => setOrderForm((prev) => ({ ...prev, newContactEmail: event.target.value }))} placeholder="email@company.com" />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Сфера / Промисловість</label>
                            <input className={baseInput} value={orderForm.newContactIndustry} onChange={(event) => setOrderForm((prev) => ({ ...prev, newContactIndustry: event.target.value }))} placeholder="IT, Фарма, Ритейл..." />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Адреса</label>
                            <input className={baseInput} value={orderForm.newContactAddress} onChange={(event) => setOrderForm((prev) => ({ ...prev, newContactAddress: event.target.value }))} placeholder="Місто, вулиця" />
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Назва угоди (генерується автоматично)</label>
                      <input className={`${baseInput} bg-slate-50`} value={buildOrderTitle(orderForm.eventType, orderForm.companyName, orderForm.customerName)} readOnly />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Джерело ліда</label>
                        <select className={baseInput} value={orderForm.leadSource} onChange={(event) => setOrderForm((prev) => ({ ...prev, leadSource: event.target.value }))}>
                          <option value="">Оберіть джерело ліда</option>
                          {(leadSourceOptions.length > 0 ? leadSourceOptions : ["Telegram", "Instagram", "Рекомендація", "Сайт", "Вхідний дзвінок"]).map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Стадія</label>
                        <select className={baseInput} value={orderForm.status} onChange={(event) => setOrderForm((prev) => ({ ...prev, status: event.target.value }))}>
                          {ORDER_STATUSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Сума</label>
                        <input className={baseInput} value={orderForm.amount} onChange={(event) => setOrderForm((prev) => ({ ...prev, amount: event.target.value }))} placeholder="125000" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Гостей</label>
                        <input className={baseInput} value={orderForm.guestCount} onChange={(event) => setOrderForm((prev) => ({ ...prev, guestCount: event.target.value }))} placeholder="80" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Дата події (з)</label>
                        <input
                          type="date"
                          className={baseInput}
                          value={orderForm.eventDate}
                          onFocus={openNativeDatePicker}
                          onClick={openNativeDatePicker}
                          onChange={(event) => setOrderForm((prev) => ({ ...prev, eventDate: event.target.value, eventEndDate: prev.eventEndDate && prev.eventEndDate < event.target.value ? event.target.value : prev.eventEndDate }))}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Дата завершення (по)</label>
                        <input
                          type="date"
                          className={baseInput}
                          value={orderForm.eventEndDate}
                          min={orderForm.eventDate || undefined}
                          onFocus={openNativeDatePicker}
                          onClick={openNativeDatePicker}
                          onChange={(event) => setOrderForm((prev) => ({ ...prev, eventEndDate: event.target.value }))}
                        />
                        <p className="mt-1 text-[11px] text-slate-500">Залишіть порожнім, якщо захід триває один день</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Час від</label>
                        <input
                          type="time"
                          className={baseInput}
                          value={orderForm.eventTime}
                          onFocus={openNativeDatePicker}
                          onClick={openNativeDatePicker}
                          onChange={(event) => setOrderForm((prev) => ({ ...prev, eventTime: event.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Час до</label>
                        <input
                          type="time"
                          className={baseInput}
                          value={orderForm.eventEndTime}
                          onFocus={openNativeDatePicker}
                          onClick={openNativeDatePicker}
                          onChange={(event) => setOrderForm((prev) => ({ ...prev, eventEndTime: event.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Тип оплати</label>
                        <select className={baseInput} value={orderForm.paymentType} onChange={(event) => setOrderForm((prev) => ({ ...prev, paymentType: event.target.value }))}>
                          <option value="">Оберіть тип оплати</option>
                          {paymentTypeOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Знижка грн/%</label>
                        <input className={baseInput} value={orderForm.discountValue} onChange={(event) => setOrderForm((prev) => ({ ...prev, discountValue: event.target.value }))} placeholder="10% або 5000" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Теги</label>
                        <input className={baseInput} value={orderForm.tags} onChange={(event) => setOrderForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="Весілля, Foodbox" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Менеджер</label>
                        <input className={baseInput} list="catering-sales-managers" value={orderForm.managerName} onChange={(event) => setOrderForm((prev) => ({ ...prev, managerName: event.target.value }))} placeholder="Прізвище менеджера" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Сервіс менеджер</label>
                        <input className={baseInput} list="catering-sales-managers" value={orderForm.serviceManagerName} onChange={(event) => setOrderForm((prev) => ({ ...prev, serviceManagerName: event.target.value }))} placeholder="Відповідальний сервіс менеджер" />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Нотатки</label>
                      <textarea className={`${baseInput} min-h-[96px]`} value={orderForm.notes} onChange={(event) => setOrderForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Короткий опис запиту, джерело ліда, деталі брифу" />
                    </div>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-200 pt-4">
                    <button
                      type="button"
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={saving || !orderForm.customerName.trim() || !orderForm.eventType.trim()}
                      onClick={async () => {
                        let contactId = orderForm.contactId;
                        const isNewClient = String(orderForm.clientType || "").toLowerCase().includes("нов");
                        if (isNewClient && !contactId && orderForm.customerName.trim()) {
                          const contactDraft = {
                            ...emptyContact,
                            name: orderForm.customerName.trim(),
                            company: orderForm.companyName.trim(),
                            phone: orderForm.newContactPhone.trim(),
                            email: orderForm.newContactEmail.trim(),
                            industry: orderForm.newContactIndustry.trim(),
                            address: orderForm.newContactAddress.trim(),
                            assignedManager: orderForm.managerName.trim(),
                            leadSource: orderForm.leadSource,
                          };
                          const contactResult = await onSaveContact(contactDraft);
                          if (!contactResult?.success) return;
                          contactId = contactResult.contact?.id || "";
                        }

                        const { newContactPhone, newContactEmail, newContactIndustry, newContactAddress, ...orderRest } = orderForm;
                        const payload = {
                          ...orderRest,
                          contactId,
                          title: buildOrderTitle(orderForm.eventType, orderForm.companyName, orderForm.customerName),
                        };
                        const result = await onSaveOrder(payload);
                        if (result?.success) {
                          setShowNewOrderModal(false);
                          setOrderForm(createDefaultOrder(currentUserName));
                        }
                      }}
                    >
                      {orderForm.id ? "Оновити угоду" : "Додати угоду"}
                    </button>
                    <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => {
                      setShowNewOrderModal(false);
                      setOrderForm(createDefaultOrder(currentUserName));
                    }}>
                      Скасувати
                    </button>
                  </div>
                  <datalist id="catering-sales-managers">
                    {managers.map((manager) => <option key={manager} value={manager} />)}
                  </datalist>
                </div>
              </div>
            )}
          </>
        </div>
      </div>

      <div className="space-y-4">
        {ordersViewMode === "table" ? (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    {visibleOrderTableColumns.map((column) => {
                      const label = ORDER_TABLE_COLUMNS.find((item) => item.id === column.id)?.label || column.id;
                      return (
                        <th key={column.id} className="px-3 py-2">{label}</th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {boardOrders.map((item) => (
                    <tr key={item.id} className="cursor-pointer border-t border-slate-200 hover:bg-slate-50/70" onClick={() => setSelectedOrderId(String(item.id))}>
                      {visibleOrderTableColumns.map((column) => (
                        <td key={`${item.id}_${column.id}`} className="px-3 py-2.5 text-slate-700">
                          {getOrderTableCellValue(item, column.id)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {boardOrders.length === 0 && (
                    <tr>
                      <td colSpan={Math.max(visibleOrderTableColumns.length, 1)} className="px-3 py-8 text-center text-slate-500">Поки порожньо</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-6">
          {ORDER_STATUSES.filter((item) => item.id !== "cancelled").map((column) => {
            const columnOrders = boardOrders.filter((item) => item.status === column.id);
            return (
              <div
                key={column.id}
                className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const droppedId = event.dataTransfer.getData("text/plain") || draggedOrderId;
                  setDraggedOrderId("");
                  moveOrderToStatus(droppedId, column.id);
                }}
              >
                <div className={`mb-3 rounded-xl border px-3 py-2 text-xs font-semibold ${column.tone}`}>
                  {column.label}: {columnOrders.length}
                </div>
                <div className="space-y-2">
                  {columnOrders.map((item) => (
                    <div
                      key={item.id}
                      className="cursor-grab rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 shadow-sm active:cursor-grabbing"
                      draggable
                      onClick={() => setSelectedOrderId(String(item.id))}
                      onDragStart={(event) => {
                        setDraggedOrderId(String(item.id));
                        event.dataTransfer.setData("text/plain", String(item.id));
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggedOrderId("");
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="line-clamp-2 text-[15px] font-semibold leading-tight text-slate-900">{item.title || "Без назви"}</div>
                          <div className="mt-0.5 text-xs text-slate-500">{item.customerName || "Без клієнта"}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className={`${compactActionBtn} border-slate-300 text-slate-600 hover:bg-white`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openOrderEditor(item);
                            }}
                          >
                            <Pencil size={14} />
                          </button>
                          {item.status === "brief" && (
                            <button
                              type="button"
                              className={`${compactActionBtn} border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100`}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleOpenProposalForBrief(item);
                              }}
                            >
                              КП
                            </button>
                          )}
                          <button
                            type="button"
                            className={`${compactActionBtn} border-rose-200 text-rose-600 hover:bg-rose-50`}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!window.confirm("Видалити CRM-угоду?")) return;
                              void onDeleteOrder(item.id);
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.eventType && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">{item.eventType}</span>}
                        {item.clientType && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">{item.clientType}</span>}
                        {item.leadSource && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">{item.leadSource}</span>}
                        {proposalsByOrder.get(String(item.id))?.length > 0 && (
                          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                            КП: {proposalsByOrder.get(String(item.id)).length}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[12px] text-slate-600">
                        <div className="truncate">Менеджер: <span className="font-medium text-slate-800">{item.managerName || "—"}</span></div>
                        <div className="truncate">Сервіс: <span className="font-medium text-slate-800">{item.serviceManagerName || "—"}</span></div>
                        <div className="truncate">Гостей: <span className="font-medium text-slate-800">{item.guestCount || "—"}</span></div>
                        <div className="truncate">Сума: <span className="font-medium text-slate-800">{formatMoney(item.amount)}</span></div>
                        <div className="truncate">Подія: <span className="font-medium text-slate-800">{formatDateUk(item.eventDate)}</span></div>
                        <div className="truncate">Час: <span className="font-medium text-slate-800">{item.eventTime || "—"}</span></div>
                        <div className="truncate">Оплата: <span className="font-medium text-slate-800">{item.paymentType || "—"}</span></div>
                        <div className="truncate">Джерело: <span className="font-medium text-slate-800">{item.leadSource || "—"}</span></div>
                      </div>

                      {(item.tags || []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(item.tags || []).map((tag) => (
                            <span key={`${item.id}_${tag}`} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {columnOrders.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                      Поки порожньо
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        )}

        {selectedOrder && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4" onClick={closeOrderDetails}>
            <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{selectedOrder.title || "Деталі замовлення"}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">{[selectedOrder.companyName, selectedOrder.customerName].filter(Boolean).join(" — ") || "—"}</p>
                </div>
                <button type="button" className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={closeOrderDetails}>
                  Закрити
                </button>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <select
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                  value={selectedOrder.status}
                  onChange={(event) => moveOrderToStatus(selectedOrder.id, event.target.value)}
                >
                  {ORDER_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
                </select>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-white"
                  onClick={() => {
                    closeOrderDetails();
                    openOrderEditor(selectedOrder);
                  }}
                >
                  Редагувати
                </button>
                <button
                  type="button"
                  className="rounded-md border border-indigo-300 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                  onClick={() => {
                    closeOrderDetails();
                    handleOpenProposalForBrief(selectedOrder);
                  }}
                >
                  КП{selectedOrderProposals.length > 0 ? ` (${selectedOrderProposals.length})` : ""}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  onClick={() => {
                    if (!window.confirm("Видалити CRM-угоду?")) return;
                    void onDeleteOrder(selectedOrder.id);
                    closeOrderDetails();
                  }}
                >
                  Видалити
                </button>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-2 text-xs text-slate-700 sm:grid-cols-4">
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">Стадія: <span className="font-semibold text-slate-900">{ORDER_STATUSES.find((status) => status.id === selectedOrder.status)?.label || selectedOrder.status}</span></div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">Подія: <span className="font-semibold text-slate-900">{formatDateUk(selectedOrder.eventDate)}</span></div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">Час: <span className="font-semibold text-slate-900">{selectedOrder.eventTime || "—"}</span></div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">Сума: <span className="font-semibold text-slate-900">{formatMoney(selectedOrder.amount)}</span></div>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-2 text-xs text-slate-700 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">Тип оплати: <span className="font-semibold text-slate-900">{selectedOrder.paymentType || "—"}</span></div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">Гостей: <span className="font-semibold text-slate-900">{selectedOrder.guestCount || "—"}</span></div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">Знижка: <span className="font-semibold text-slate-900">{selectedOrder.discountValue || "—"}</span></div>
              </div>

              <div className="rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                  <h4 className="text-sm font-semibold text-slate-900">Комерційні пропозиції цього замовлення</h4>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{selectedOrderProposals.length}</span>
                </div>

                <div className="max-h-[320px] overflow-auto">
                  {selectedOrderProposals.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-slate-500">Ще немає КП для цього замовлення.</div>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Назва</th>
                          <th className="px-3 py-2">Статус</th>
                          <th className="px-3 py-2">Сума</th>
                          <th className="px-3 py-2">Дії</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrderProposals.map((proposal) => (
                          <tr key={proposal.id} className="border-t border-slate-200">
                            <td className="px-3 py-2 font-medium text-slate-900">{proposal.title || proposal.orderTitle || "КП"}</td>
                            <td className="px-3 py-2 text-slate-700">{PROPOSAL_STATUS_OPTIONS.find((row) => row.value === String(proposal.status || "draft").toLowerCase())?.label || proposal.status || "draft"}</td>
                            <td className="px-3 py-2 text-slate-700">{formatMoney(proposal.totalAmount)}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="rounded-md border border-indigo-300 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                                  onClick={() => handleExportProposalPdf(proposal, selectedOrder)}
                                >
                                  PDF
                                </button>
                                <button
                                  type="button"
                                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                  onClick={() => {
                                    closeOrderDetails();
                                    openExistingProposalEditor(proposal, selectedOrder);
                                  }}
                                >
                                  Редагувати
                                </button>
                                <button
                                  type="button"
                                  className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                                  onClick={() => {
                                    if (!window.confirm("Видалити комерційну пропозицію?")) return;
                                    void onDeleteProposal(proposal.id);
                                  }}
                                >
                                  Видалити
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">Комерційні пропозиції (активні)</h3>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{proposalStats.active.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">Назва</th>
                  <th className="px-3 py-2">Клієнт</th>
                  <th className="px-3 py-2">Менеджер</th>
                  <th className="px-3 py-2">Статус</th>
                  <th className="px-3 py-2">Сума</th>
                  <th className="px-3 py-2">Дії</th>
                </tr>
              </thead>
              <tbody>
                {proposalStats.active.map((item) => (
                  <tr key={item.id} className="border-t border-slate-200">
                    <td className="px-3 py-3 font-medium text-slate-900">{item.title || item.orderTitle || "КП"}</td>
                    <td className="px-3 py-3 text-slate-700">{[item.companyName, item.customerName].filter(Boolean).join(" — ") || "—"}</td>
                    <td className="px-3 py-3 text-slate-700">{item.managerName || "—"}</td>
                    <td className="px-3 py-3 text-slate-700">{PROPOSAL_STATUS_OPTIONS.find((row) => row.value === String(item.status || "draft").toLowerCase())?.label || item.status || "draft"}</td>
                    <td className="px-3 py-3 text-slate-700">{formatMoney(item.totalAmount)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-indigo-300 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                          onClick={() => handleExportProposalPdf(item)}
                        >
                          PDF
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-amber-200 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                          onClick={() => {
                            if (!window.confirm("Перенести пропозицію в скасовані?")) return;
                            void markProposalCancelled(item);
                          }}
                        >
                          Скасувати
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                          onClick={() => {
                            if (!window.confirm("Видалити комерційну пропозицію?")) return;
                            void onDeleteProposal(item.id);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {proposalStats.active.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-500">Ще немає активних комерційних пропозицій.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-rose-200 bg-rose-50/50 p-2 shadow-sm">
          <div className="mb-1 flex items-center justify-between px-2 py-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Втрачені замовлення</p>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-rose-700">{cancelledOrders.length}</span>
          </div>
          <table className="min-w-full text-sm">
            <thead className="text-left text-rose-700/80">
              <tr>
                {visibleOrderTableColumns.map((column) => {
                  const label = ORDER_TABLE_COLUMNS.find((item) => item.id === column.id)?.label || column.id;
                  return (
                    <th key={`bottom_cancelled_${column.id}`} className="px-3 py-2">{label}</th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {cancelledOrders.map((item) => (
                <tr key={`bottom_cancelled_row_${item.id}`} className="cursor-pointer border-t border-rose-100 hover:bg-white" onClick={() => setSelectedOrderId(String(item.id))}>
                  {visibleOrderTableColumns.map((column) => (
                    <td key={`bottom_cancelled_${item.id}_${column.id}`} className="px-3 py-2.5 text-slate-700">
                      {getOrderTableCellValue(item, column.id)}
                    </td>
                  ))}
                </tr>
              ))}
              {cancelledOrders.length === 0 && (
                <tr>
                  <td colSpan={Math.max(visibleOrderTableColumns.length, 1)} className="px-3 py-6 text-center text-slate-500">Втрачених замовлень поки немає.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {showProposalModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
            <div className="flex max-h-[94vh] w-full max-w-[96vw] flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl xl:max-w-7xl 2xl:max-w-[1720px]">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">{proposalForm.id ? "Редагування комерційної пропозиції" : "Конструктор комерційної пропозиції"}</h3>
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[390px_minmax(0,1fr)]">
                <div className="flex min-h-0 flex-col rounded-xl border border-slate-200 p-3">
                  <div className="mb-2 text-sm font-semibold text-slate-900">Продукти з Керування асортиментом</div>

                  <div className="mb-3 space-y-2">
                    <input
                      className={`${baseInput} h-9 py-1.5 text-xs`}
                      value={proposalProductSearch}
                      onChange={(event) => setProposalProductSearch(event.target.value)}
                      placeholder="Пошук позиції"
                    />

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <select
                        className={`${baseInput} h-9 py-1.5 text-xs`}
                        value={proposalCategoryFilter}
                        onChange={(event) => {
                          setProposalCategoryFilter(event.target.value);
                          setProposalSubcategoryFilter("all");
                        }}
                      >
                        <option value="all">Усі категорії</option>
                        {proposalCategoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>

                      <select
                        className={`${baseInput} h-9 py-1.5 text-xs`}
                        value={proposalSubcategoryFilter}
                        onChange={(event) => setProposalSubcategoryFilter(event.target.value)}
                      >
                        <option value="all">Усі підкатегорії</option>
                        {proposalSubcategoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Знайдено позицій: <span className="font-semibold text-slate-700">{filteredProductsCount}</span></span>
                      <button
                        type="button"
                        className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        onClick={() => {
                          setProposalProductSearch("");
                          setProposalCategoryFilter("all");
                          setProposalSubcategoryFilter("all");
                        }}
                      >
                        Скинути
                      </button>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                    {filteredProductsByCategory.map((group) => (
                      <div key={group.category}>
                        <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase text-slate-500">
                          <span>{group.category}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{group.items.length}</span>
                        </div>
                        <div className="space-y-1">
                          {group.items.map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                              onClick={() => addProposalItem(product)}
                            >
                              <div className="font-semibold text-slate-800">{product.productName}</div>
                              <div className="text-slate-500">{product.subcategory || "—"} • {product.output || "—"} • {formatMoney(product.unitPrice)}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {filteredProductsByCategory.length === 0 && (
                      <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
                        Нічого не знайдено за поточними фільтрами.
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex min-h-0 flex-col rounded-xl border border-slate-200 p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input className={baseInput} value={proposalForm.title} onChange={(event) => setProposalForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Назва КП" />
                    <select className={baseInput} value={proposalForm.status} onChange={(event) => setProposalForm((prev) => ({ ...prev, status: event.target.value }))}>
                      {PROPOSAL_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </div>
                  <textarea className={`${baseInput} mt-3 min-h-[72px]`} value={proposalForm.notes} onChange={(event) => setProposalForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Коментар до КП" />
                  <div className="mt-2 text-xs text-slate-500">
                    Тип оплати: <span className="font-semibold text-slate-700">{proposalPaymentType || "не вказано"}</span>
                    {" • "}
                    ПДВ: <span className="font-semibold text-slate-700">{formatNumberUk(proposalVatPercent, 0)}%</span>
                  </div>

                  <div className="mt-3 min-h-0 flex-1 overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-slate-500">
                        <tr>
                          <th className="px-2 py-2">Позиція</th>
                          <th className="px-2 py-2">Вихід</th>
                          <th className="px-2 py-2">Ціна</th>
                          <th className="px-2 py-2">К-сть</th>
                          <th className="px-2 py-2">Сума</th>
                          <th className="px-2 py-2"> </th>
                        </tr>
                      </thead>
                      {proposalItemsByCategory.map((group) => (
                        <tbody key={`proposal_group_${group.category}`}>
                          <tr className="border-t border-slate-200 bg-slate-50/70">
                            <td colSpan={6} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">{group.category}</td>
                          </tr>
                          {group.items.map((item) => (
                            <tr key={item.id} className="border-t border-slate-200">
                              <td className="px-2 py-2 text-xs font-semibold">{item.productName}</td>
                              <td className="px-2 py-2 text-xs">{item.output || "—"}</td>
                              <td className="px-2 py-2">
                                <input className="w-24 rounded border border-slate-300 px-2 py-1 text-xs" value={item.unitPrice} onChange={(event) => updateProposalItem(item.id, { unitPrice: Number(event.target.value || 0) })} />
                              </td>
                              <td className="px-2 py-2">
                                <input className="w-20 rounded border border-slate-300 px-2 py-1 text-xs" value={item.quantity} onChange={(event) => updateProposalItem(item.id, { quantity: Number(event.target.value || 0) })} />
                              </td>
                              <td className="px-2 py-2 text-xs font-semibold">{formatMoney(item.amount)}</td>
                              <td className="px-2 py-2">
                                <button type="button" className="rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50" onClick={() => removeProposalItem(item.id)}>
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      ))}
                      {proposalForm.items.length === 0 && (
                        <tbody>
                          <tr>
                            <td colSpan={6} className="px-2 py-8 text-center text-xs text-slate-500">Додайте позиції зліва.</td>
                          </tr>
                        </tbody>
                      )}
                    </table>
                  </div>

                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70">
                    <div className="grid grid-cols-1 divide-y divide-slate-200 text-xs sm:grid-cols-[1fr_auto] sm:divide-y-0 sm:[&>div:nth-child(2n+1)]:border-r sm:[&>div:nth-child(2n+1)]:border-slate-200">
                      <div className="px-3 py-2 text-slate-600">Вихід меню на 1 Гостя, грам</div>
                      <div className="px-3 py-2 text-right font-semibold text-slate-900">{formatNumberUk(proposalMetrics.foodPerGuestGrams, 0)}</div>

                      <div className="px-3 py-2 text-slate-600">Вихід безалкогольних напоїв на 1 Гостя, мл</div>
                      <div className="px-3 py-2 text-right font-semibold text-slate-900">{formatNumberUk(proposalMetrics.nonAlcoholPerGuestMl, 0)}</div>

                      <div className="px-3 py-2 text-slate-600">Вихід алкогольних напоїв на 1 Гостя, мл</div>
                      <div className="px-3 py-2 text-right font-semibold text-slate-900">{formatNumberUk(proposalMetrics.alcoholPerGuestMl, 0)}</div>

                      <div className="px-3 py-2 text-slate-600">Вартість меню на 1 Гостя, грн</div>
                      <div className="px-3 py-2 text-right font-semibold text-slate-900">{formatNumberUk(proposalMetrics.costPerGuest, 0)}</div>

                      <div className="px-3 py-2 text-slate-600">ПДВ {formatNumberUk(proposalVatPercent, 0)}%</div>
                      <div className="px-3 py-2 text-right font-semibold text-slate-900">{formatNumberUk(proposalVatAmount, 0)}</div>

                      <div className="bg-[#112b61] px-3 py-2 text-[13px] font-semibold text-white">Всього за меню, грн</div>
                      <div className="bg-[#112b61] px-3 py-2 text-right text-[13px] font-bold text-white">{formatNumberUk(proposalMetrics.totalMenuCost, 0)}</div>

                      <div className="bg-[#0b1c44] px-3 py-2 text-[13px] font-semibold text-white">Всього з ПДВ, грн</div>
                      <div className="bg-[#0b1c44] px-3 py-2 text-right text-[13px] font-bold text-white">{formatNumberUk(proposalTotalWithVat, 0)}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
                    <div className="text-sm font-semibold text-slate-900">Разом: {formatMoney(proposalTotalWithVat)}</div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                        disabled={proposalForm.items.length === 0}
                        onClick={() => handleExportProposalPdf(proposalForm)}
                      >
                        <FileText size={14} className="mr-1 inline" /> PDF
                      </button>
                      <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setShowProposalModal(false)}>
                        Скасувати
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                        disabled={saving || !proposalForm.orderId || proposalForm.items.length === 0}
                        onClick={async () => {
                          const result = await onSaveProposal({
                            ...proposalForm,
                            totalAmount: proposalTotalWithVat,
                          });
                          if (result?.success) {
                            setShowProposalModal(false);
                            setProposalForm(emptyProposal);
                            const orderToMove = orders.find((item) => String(item.id) === String(proposalForm.orderId));
                            if (orderToMove && orderToMove.status === "brief") {
                              void onSaveOrder({ ...orderToMove, status: "proposal" });
                            }
                          }
                        }}
                      >
                        {proposalForm.id ? "Оновити КП" : "Зберегти КП"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const contactsView = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
            <Users size={18} className="text-sky-600" />
            <h3 className="text-base font-semibold text-slate-900">Компанії та контакти</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{contacts.length}</span>
          </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={handleDownloadContactsTemplate}>
                <FileDown size={14} /> Шаблон
              </button>
              <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={handleExportContacts}>
                <Download size={14} /> Експорт
              </button>
              <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => contactImportRef.current?.click()}>
                <Upload size={14} /> Імпорт
              </button>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white shadow hover:bg-indigo-500"
                onClick={() => {
                  setContactForm(emptyContact);
                  setShowContactModal(true);
                }}
                title="Додати контакт"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              ref={contactImportRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImportContacts}
            />
            <input
              className={`${baseInput} h-9 w-full py-1.5 text-xs`}
              value={contactSearch}
              onChange={(event) => setContactSearch(event.target.value)}
              placeholder="Пошук контакту"
            />
            <select
              className={`${baseInput} h-9 w-full py-1.5 text-xs`}
              value={contactManagerFilter}
              onChange={(event) => setContactManagerFilter(event.target.value)}
            >
              <option value="">Усі менеджери</option>
              {contactManagerOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select
              className={`${baseInput} h-9 w-full py-1.5 text-xs`}
              value={contactIndustryFilter}
              onChange={(event) => setContactIndustryFilter(event.target.value)}
            >
              <option value="">Усі промисловості</option>
              {contactIndustryFilterOptions.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Контакт</th>
                <th className="px-3 py-2">Компанія</th>
                <th className="px-3 py-2">Промисловість</th>
                <th className="px-3 py-2">Адреса</th>
                <th className="px-3 py-2">Джерело ліда</th>
                <th className="px-3 py-2">Менеджер</th>
                <th className="px-3 py-2">Телефон</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Дії</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((item) => (
                <tr key={item.id} className="border-t border-slate-200 align-top">
                  <td className="px-3 py-3 font-medium text-slate-900">{item.name}</td>
                  <td className="px-3 py-3 text-slate-700">{item.company || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{item.industry || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{item.address || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{item.leadSource || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{item.assignedManager || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{item.phone || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{item.email || "—"}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50"
                        onClick={() => {
                          setContactForm(item);
                          setShowContactModal(true);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                        onClick={() => {
                          if (!window.confirm("Видалити контакт?")) return;
                          void onDeleteContact(item.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredContacts.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">Контактів за фільтром не знайдено.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-2">
              <ContactRound size={18} className="text-indigo-600" />
              <h3 className="text-lg font-semibold text-slate-900">{contactForm.id ? "Редагування контакту" : "Новий контакт"}</h3>
            </div>
            <div className="space-y-3">
              <input className={baseInput} value={contactForm.name} onChange={(event) => setContactForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Ім'я або назва компанії" />
              <input className={baseInput} value={contactForm.company} onChange={(event) => setContactForm((prev) => ({ ...prev, company: event.target.value }))} placeholder="Компанія" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input className={baseInput} list="catering-industry-list" value={contactForm.industry} onChange={(event) => setContactForm((prev) => ({ ...prev, industry: event.target.value }))} placeholder="Промисловість / бізнес напрям" />
                <input className={baseInput} value={contactForm.address} onChange={(event) => setContactForm((prev) => ({ ...prev, address: event.target.value }))} placeholder="Адреса" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input className={baseInput} value={contactForm.phone} onChange={(event) => setContactForm((prev) => ({ ...prev, phone: event.target.value }))} placeholder="Телефон" />
                <input className={baseInput} value={contactForm.email} onChange={(event) => setContactForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="Email" />
              </div>
              <input className={baseInput} list="catering-contact-managers" value={contactForm.assignedManager} onChange={(event) => setContactForm((prev) => ({ ...prev, assignedManager: event.target.value }))} placeholder="Закріплений менеджер" />
              <input className={baseInput} list="catering-lead-source-list" value={contactForm.leadSource} onChange={(event) => setContactForm((prev) => ({ ...prev, leadSource: event.target.value }))} placeholder="Джерело ліда" />
              <textarea className={`${baseInput} min-h-[96px]`} value={contactForm.notes} onChange={(event) => setContactForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Коментар, джерело контакту, особливості клієнта" />
            </div>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving || !contactForm.name.trim() || !contactForm.assignedManager.trim()}
                onClick={async () => {
                  const result = await onSaveContact(contactForm);
                  if (result?.success) {
                    setContactForm(emptyContact);
                    setShowContactModal(false);
                  }
                }}
              >
                {contactForm.id ? "Оновити контакт" : "Додати контакт"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setContactForm(emptyContact);
                  setShowContactModal(false);
                }}
              >
                Скасувати
              </button>
            </div>
            <datalist id="catering-lead-source-list">
              {["Рекомендація", "Сайт", "Соціальні мережі", "Реклама", "Виставка", "Холодний дзвінок", "Повторне звернення", "Інше"].map((source) => <option key={source} value={source} />)}
            </datalist>
            <datalist id="catering-contact-managers">
              {managers.map((manager) => <option key={manager} value={manager} />)}
            </datalist>
            <datalist id="catering-industry-list">
              {industryOptions.map((value) => <option key={value} value={value} />)}
            </datalist>
          </div>
        </div>
      )}
    </div>
  );

  const fieldsView = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-sky-50 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-violet-600" />
            <h3 className="text-base font-semibold text-slate-900">Конструктор типових полів і правил</h3>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">{fieldTemplates.length}</span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-indigo-500"
            onClick={() => {
              setFieldForm(emptyField);
              setShowFieldModal(true);
            }}
          >
            <Plus size={14} /> Додати типове поле
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Бізнес-правило КП</p>
            <h4 className="mt-1 text-sm font-semibold text-slate-900">ПДВ залежно від типу оплати</h4>
            <p className="mt-1 text-xs text-slate-600">Вибраний у CRM тип оплати автоматично визначає відсоток ПДВ у підсумку КП та PDF.</p>
          </div>

          <div className="space-y-2">
            {vatRulesDraft.map((row, index) => (
              <div key={`vat_row_${index}`} className="grid grid-cols-[1fr_120px_32px] gap-2">
                <input
                  className={`${baseInput} py-1.5 text-xs`}
                  list="catering-payment-type-list"
                  value={row.paymentType}
                  onChange={(event) => {
                    const value = event.target.value;
                    setVatRulesDraft((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, paymentType: value } : item)));
                  }}
                  placeholder="Тип оплати"
                />
                <input
                  className={`${baseInput} py-1.5 text-xs`}
                  type="number"
                  min="0"
                  step="0.1"
                  value={row.vatPercent}
                  onChange={(event) => {
                    const value = Number(event.target.value || 0);
                    setVatRulesDraft((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, vatPercent: value } : item)));
                  }}
                  placeholder="% ПДВ"
                />
                <button
                  type="button"
                  className="rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
                  onClick={() => {
                    setVatRulesDraft((prev) => (prev.length === 1 ? [{ paymentType: "", vatPercent: 0 }] : prev.filter((_, itemIndex) => itemIndex !== index)));
                  }}
                  title="Видалити правило"
                >
                  <Trash2 size={14} className="mx-auto" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
              onClick={() => setVatRulesDraft((prev) => [...prev, { paymentType: "", vatPercent: 0 }])}
            >
              + Додати правило
            </button>
            <button
              type="button"
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              disabled={saving}
              onClick={() => {
                void saveVatRules();
              }}
            >
              Зберегти ПДВ-правила
            </button>
          </div>

          <datalist id="catering-payment-type-list">
            {paymentTypeOptions.map((value) => <option key={value} value={value} />)}
          </datalist>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Каталог типових полів</h4>
              <p className="text-xs text-slate-500">Швидко редагуйте поля, опції та обов'язковість.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className={`${baseInput} w-[220px]`}
                value={fieldSearch}
                onChange={(event) => setFieldSearch(event.target.value)}
                placeholder="Пошук поля"
              />
              <select className={`${baseInput} w-[180px]`} value={fieldCategoryFilter} onChange={(event) => setFieldCategoryFilter(event.target.value)}>
                <option value="all">Усі категорії</option>
                <option value="order">Замовлення</option>
                <option value="customer">Клієнт</option>
                <option value="source">Джерело/канал</option>
                <option value="tags">Теги</option>
                <option value="other">Інше</option>
              </select>
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Швидкі шаблони</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {FIELD_PRESETS.filter((preset) => preset.id !== "paymentType").map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  onClick={() => {
                    setFieldForm({ ...preset, id: "" });
                    setShowFieldModal(true);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {nonVatFieldTemplates.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-500">Ключ: {item.key}</p>
                    {item.description && <p className="mt-1 text-xs text-slate-500">{item.description}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">{item.category || "other"}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">{item.type}</span>
                    {item.required && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">обов'язкове</span>}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Опцій: {Array.isArray(item.options) ? item.options.length : 0}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50"
                      onClick={() => {
                        setFieldForm({
                          ...item,
                          options: Array.isArray(item.options) ? item.options.join(", ") : "",
                        });
                        setShowFieldModal(true);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                      onClick={() => {
                        if (!window.confirm("Видалити типове поле?")) return;
                        void onDeleteField(item.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {nonVatFieldTemplates.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 px-3 py-8 text-center text-sm text-slate-500">
                Полів за фільтром не знайдено.
              </div>
            )}
          </div>
        </div>
      </div>

      {showFieldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-2">
              <FileText size={18} className="text-violet-600" />
              <h3 className="text-lg font-semibold text-slate-900">{fieldForm.id ? "Редагування типового поля" : "Нове типове поле"}</h3>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input className={baseInput} value={fieldForm.label} onChange={(event) => setFieldForm((prev) => ({ ...prev, label: event.target.value }))} placeholder="Назва поля" />
              <input className={baseInput} value={fieldForm.key} onChange={(event) => setFieldForm((prev) => ({ ...prev, key: event.target.value }))} placeholder="Ключ, напр. eventType" />
              <select className={baseInput} value={fieldForm.category} onChange={(event) => setFieldForm((prev) => ({ ...prev, category: event.target.value }))}>
                <option value="order">Замовлення</option>
                <option value="customer">Клієнт</option>
                <option value="source">Джерело/канал</option>
                <option value="tags">Теги</option>
                <option value="other">Інше</option>
              </select>
              <select className={baseInput} value={fieldForm.type} onChange={(event) => setFieldForm((prev) => ({ ...prev, type: event.target.value }))}>
                {FIELD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            <input className={`${baseInput} mt-3`} value={fieldForm.placeholder} onChange={(event) => setFieldForm((prev) => ({ ...prev, placeholder: event.target.value }))} placeholder="Плейсхолдер або підказка" />
            <input className={`${baseInput} mt-3`} value={fieldForm.description} onChange={(event) => setFieldForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Опис / для чого це поле" />

            {(fieldForm.type === "select" || fieldForm.type === "multiselect" || normalizeKey(fieldForm.key) === "eventtype") && (
              <textarea
                className={`${baseInput} mt-3 min-h-[90px]`}
                value={fieldForm.options}
                onChange={(event) => setFieldForm((prev) => ({ ...prev, options: event.target.value }))}
                placeholder="Опції через кому, напр.: Фуршет, Банкет, Кава-брейк"
              />
            )}

            <label className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input type="checkbox" checked={fieldForm.required} onChange={(event) => setFieldForm((prev) => ({ ...prev, required: event.target.checked }))} />
              Обов'язкове поле
            </label>

            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving || !fieldForm.label.trim() || !fieldForm.key.trim()}
                onClick={async () => {
                  const result = await onSaveField({
                    ...fieldForm,
                    options: String(fieldForm.options || "")
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  });
                  if (result?.success) {
                    setFieldForm(emptyField);
                    setShowFieldModal(false);
                  }
                }}
              >
                {fieldForm.id ? "Оновити поле" : "Додати поле"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setFieldForm(emptyField);
                  setShowFieldModal(false);
                }}
              >
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {mode === "crm-contacts" ? contactsView : mode === "crm-fields" ? fieldsView : orderCards}
    </div>
  );
}
