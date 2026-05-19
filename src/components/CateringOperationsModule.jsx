import { useCallback, useEffect, useMemo, useState } from "react";
import { ChefHat, Loader2, RefreshCw, Settings2 } from "lucide-react";
import {
  createCollectionItemApi,
  deleteCollectionItemApi,
  isCollectionsApiEnabled,
  listCollectionItemsApi,
  updateCollectionItemApi,
} from "../api/collectionsApi";
import CateringCrmTab from "./catering/CateringCrmTab";
import CateringKitchenTab from "./catering/CateringKitchenTab";
import CateringAnalyticsTab from "./catering/CateringAnalyticsTab";

const COLLECTIONS = {
  orders: {
    api: "cateringCrmOrders",
    storage: "lucia_catering_crm_orders",
  },
  contacts: {
    api: "cateringCrmContacts",
    storage: "lucia_catering_crm_contacts",
  },
  fields: {
    api: "cateringCrmTypicalFields",
    storage: "lucia_catering_crm_typical_fields",
  },
  plans: {
    api: "cateringSalesPlans",
    storage: "lucia_catering_sales_plans",
  },
};

const CRM_STATUS_OPTIONS = ["new", "brief", "proposal", "work", "tender", "confirmed", "cancelled"];
const KITCHEN_STATUS_OPTIONS = ["queue", "preparing", "ready", "completed"];

const normalizeToken = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-zа-яіїєґ0-9]+/gi, "");

const toNumber = (value) => {
  const normalized = Number(String(value ?? "").replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(normalized) ? normalized : 0;
};

const createLocalId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const readLocalCollection = (storageKey) => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLocalCollection = (storageKey, items) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(Array.isArray(items) ? items : []));
};

const listRecords = async (config) => {
  if (isCollectionsApiEnabled()) {
    return listCollectionItemsApi(config.api);
  }
  return readLocalCollection(config.storage);
};

const saveRecord = async (config, record) => {
  const now = new Date().toISOString();
  const nextRecord = {
    ...record,
    updatedAt: now,
  };

  if (isCollectionsApiEnabled()) {
    if (nextRecord.id) {
      await updateCollectionItemApi(config.api, nextRecord.id, nextRecord);
      return nextRecord;
    }
    const id = await createCollectionItemApi(config.api, {
      ...nextRecord,
      createdAt: nextRecord.createdAt || now,
    });
    return { ...nextRecord, id, createdAt: nextRecord.createdAt || now };
  }

  const current = readLocalCollection(config.storage);
  if (nextRecord.id) {
    const nextItems = current.map((item) => (String(item?.id) === String(nextRecord.id) ? nextRecord : item));
    writeLocalCollection(config.storage, nextItems);
    return nextRecord;
  }

  const createdRecord = {
    ...nextRecord,
    id: createLocalId(),
    createdAt: nextRecord.createdAt || now,
  };
  writeLocalCollection(config.storage, [createdRecord, ...current]);
  return createdRecord;
};

const deleteRecord = async (config, id) => {
  if (!id) return;
  if (isCollectionsApiEnabled()) {
    await deleteCollectionItemApi(config.api, id);
    return;
  }
  const current = readLocalCollection(config.storage);
  writeLocalCollection(config.storage, current.filter((item) => String(item?.id) !== String(id)));
};

const normalizeOrder = (value = {}) => {
  const status = CRM_STATUS_OPTIONS.includes(String(value?.status || "")) ? String(value.status) : "new";
  const kitchenStatus = KITCHEN_STATUS_OPTIONS.includes(String(value?.kitchenStatus || ""))
    ? String(value.kitchenStatus)
    : "queue";
  return {
    id: String(value?.id || ""),
    title: String(value?.title || value?.name || "").trim(),
    customerName: String(value?.customerName || value?.customer || "").trim(),
    contactId: String(value?.contactId || "").trim(),
    managerName: String(value?.managerName || value?.salesManager || "").trim(),
    amount: toNumber(value?.amount),
    guestCount: String(value?.guestCount || "").trim(),
    eventDate: String(value?.eventDate || value?.requiredDate || "").trim(),
    status,
    kitchenStatus,
    notes: String(value?.notes || value?.comment || "").trim(),
    tags: Array.isArray(value?.tags) ? value.tags.map((item) => String(item || "").trim()).filter(Boolean) : [],
    createdAt: String(value?.createdAt || ""),
    updatedAt: String(value?.updatedAt || ""),
  };
};

const normalizeContact = (value = {}) => ({
  id: String(value?.id || ""),
  name: String(value?.name || "").trim(),
  company: String(value?.company || "").trim(),
  phone: String(value?.phone || "").trim(),
  email: String(value?.email || "").trim(),
  assignedManager: String(value?.assignedManager || value?.managerName || "").trim(),
  notes: String(value?.notes || "").trim(),
  createdAt: String(value?.createdAt || ""),
  updatedAt: String(value?.updatedAt || ""),
});

const normalizeField = (value = {}) => ({
  id: String(value?.id || ""),
  label: String(value?.label || "").trim(),
  key: String(value?.key || "").trim(),
  type: String(value?.type || "text").trim() || "text",
  required: Boolean(value?.required),
  placeholder: String(value?.placeholder || "").trim(),
  createdAt: String(value?.createdAt || ""),
  updatedAt: String(value?.updatedAt || ""),
});

const normalizePlan = (value = {}) => ({
  id: String(value?.id || ""),
  managerName: String(value?.managerName || "").trim(),
  month: String(value?.month || "").slice(0, 7),
  targetAmount: toNumber(value?.targetAmount),
  notes: String(value?.notes || "").trim(),
  createdAt: String(value?.createdAt || ""),
  updatedAt: String(value?.updatedAt || ""),
});

const sortByUpdatedAt = (left, right) => String(right?.updatedAt || right?.createdAt || "").localeCompare(String(left?.updatedAt || left?.createdAt || ""));

export default function CateringOperationsModule({ user, activeNav, topTab }) {
  const [orders, setOrders] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [fieldTemplates, setFieldTemplates] = useState([]);
  const [salesPlans, setSalesPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const activeNavToken = normalizeToken(activeNav);
  const topTabToken = normalizeToken(topTab);

  const currentRoute = useMemo(() => {
    const probe = `${activeNavToken} ${topTabToken}`;
    if (probe.includes("chefmonitor") || probe.includes("kitchen")) return "kitchen";
    if (
      probe.includes("salescateringreport") ||
      probe.includes("managmentpnl") ||
      probe.includes("managementpnl") ||
      probe.includes("analytics") ||
      probe.includes("report") ||
      probe.includes("plan")
    ) {
      return "analytics";
    }
    if (probe.includes("contact")) return "crm-contacts";
    if (probe.includes("typycal") || probe.includes("typical") || probe.includes("field") || probe.includes("form")) {
      return "crm-fields";
    }
    return "crm-orders";
  }, [activeNavToken, topTabToken]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ordersData, contactsData, fieldsData, plansData] = await Promise.all([
        listRecords(COLLECTIONS.orders),
        listRecords(COLLECTIONS.contacts),
        listRecords(COLLECTIONS.fields),
        listRecords(COLLECTIONS.plans),
      ]);
      setOrders((Array.isArray(ordersData) ? ordersData : []).map(normalizeOrder).sort(sortByUpdatedAt));
      setContacts((Array.isArray(contactsData) ? contactsData : []).map(normalizeContact).sort((left, right) => left.name.localeCompare(right.name, "uk")));
      setFieldTemplates((Array.isArray(fieldsData) ? fieldsData : []).map(normalizeField).sort((left, right) => left.label.localeCompare(right.label, "uk")));
      setSalesPlans((Array.isArray(plansData) ? plansData : []).map(normalizePlan).sort((left, right) => `${right.month}_${right.managerName}`.localeCompare(`${left.month}_${left.managerName}`, "uk")));
    } catch (loadError) {
      console.error("Помилка завантаження кейтеринг-модуля:", loadError);
      setError("Не вдалося завантажити дані Кейтерингу.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const salesManagers = useMemo(() => {
    const values = new Set([
      String(user?.displayName || user?.fullName || user?.email || "").trim(),
      ...contacts.map((item) => String(item?.assignedManager || "").trim()),
      ...orders.map((item) => String(item?.managerName || "").trim()),
      ...salesPlans.map((item) => String(item?.managerName || "").trim()),
    ].filter(Boolean));
    return Array.from(values).sort((left, right) => left.localeCompare(right, "uk"));
  }, [contacts, orders, salesPlans, user]);

  const handleSaveOrder = useCallback(async (draft) => {
    setSaving(true);
    try {
      const saved = normalizeOrder(await saveRecord(COLLECTIONS.orders, {
        ...draft,
        amount: toNumber(draft?.amount),
        tags: Array.isArray(draft?.tags)
          ? draft.tags
          : String(draft?.tags || "")
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
      }));
      setOrders((prev) => [saved, ...prev.filter((item) => String(item.id) !== String(saved.id))].sort(sortByUpdatedAt));
      return { success: true };
    } catch (saveError) {
      console.error("Помилка збереження CRM-замовлення:", saveError);
      alert("Не вдалося зберегти CRM-замовлення.");
      return { success: false };
    } finally {
      setSaving(false);
    }
  }, []);

  const handleDeleteOrder = useCallback(async (id) => {
    setSaving(true);
    try {
      await deleteRecord(COLLECTIONS.orders, id);
      setOrders((prev) => prev.filter((item) => String(item.id) !== String(id)));
    } catch (deleteError) {
      console.error("Помилка видалення CRM-замовлення:", deleteError);
      alert("Не вдалося видалити CRM-замовлення.");
    } finally {
      setSaving(false);
    }
  }, []);

  const handleSaveContact = useCallback(async (draft) => {
    setSaving(true);
    try {
      const saved = normalizeContact(await saveRecord(COLLECTIONS.contacts, draft));
      setContacts((prev) => [saved, ...prev.filter((item) => String(item.id) !== String(saved.id))].sort((left, right) => left.name.localeCompare(right.name, "uk")));
      return { success: true };
    } catch (saveError) {
      console.error("Помилка збереження контакту:", saveError);
      alert("Не вдалося зберегти контакт.");
      return { success: false };
    } finally {
      setSaving(false);
    }
  }, []);

  const handleDeleteContact = useCallback(async (id) => {
    setSaving(true);
    try {
      await deleteRecord(COLLECTIONS.contacts, id);
      setContacts((prev) => prev.filter((item) => String(item.id) !== String(id)));
    } catch (deleteError) {
      console.error("Помилка видалення контакту:", deleteError);
      alert("Не вдалося видалити контакт.");
    } finally {
      setSaving(false);
    }
  }, []);

  const handleSaveField = useCallback(async (draft) => {
    setSaving(true);
    try {
      const saved = normalizeField(await saveRecord(COLLECTIONS.fields, draft));
      setFieldTemplates((prev) => [saved, ...prev.filter((item) => String(item.id) !== String(saved.id))].sort((left, right) => left.label.localeCompare(right.label, "uk")));
      return { success: true };
    } catch (saveError) {
      console.error("Помилка збереження типового поля:", saveError);
      alert("Не вдалося зберегти типове поле.");
      return { success: false };
    } finally {
      setSaving(false);
    }
  }, []);

  const handleDeleteField = useCallback(async (id) => {
    setSaving(true);
    try {
      await deleteRecord(COLLECTIONS.fields, id);
      setFieldTemplates((prev) => prev.filter((item) => String(item.id) !== String(id)));
    } catch (deleteError) {
      console.error("Помилка видалення типового поля:", deleteError);
      alert("Не вдалося видалити типове поле.");
    } finally {
      setSaving(false);
    }
  }, []);

  const handleSavePlan = useCallback(async (draft) => {
    setSaving(true);
    try {
      const saved = normalizePlan(await saveRecord(COLLECTIONS.plans, {
        ...draft,
        targetAmount: toNumber(draft?.targetAmount),
      }));
      setSalesPlans((prev) => [saved, ...prev.filter((item) => String(item.id) !== String(saved.id))].sort((left, right) => `${right.month}_${right.managerName}`.localeCompare(`${left.month}_${left.managerName}`, "uk")));
      return { success: true };
    } catch (saveError) {
      console.error("Помилка збереження плану:", saveError);
      alert("Не вдалося зберегти план менеджера.");
      return { success: false };
    } finally {
      setSaving(false);
    }
  }, []);

  const handleDeletePlan = useCallback(async (id) => {
    setSaving(true);
    try {
      await deleteRecord(COLLECTIONS.plans, id);
      setSalesPlans((prev) => prev.filter((item) => String(item.id) !== String(id)));
    } catch (deleteError) {
      console.error("Помилка видалення плану:", deleteError);
      alert("Не вдалося видалити план менеджера.");
    } finally {
      setSaving(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="card flex min-h-[300px] items-center justify-center gap-3 border border-slate-200 bg-white p-6 text-slate-700 shadow-xl">
        <Loader2 className="animate-spin text-indigo-600" size={22} />
        <span className="text-sm font-medium">Завантаження модулів Кейтерингу…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {currentRoute === "kitchen" ? (
        <CateringKitchenTab
          orders={orders}
          contacts={contacts}
          saving={saving}
          onSaveOrder={handleSaveOrder}
        />
      ) : currentRoute === "analytics" ? (
        <CateringAnalyticsTab
          orders={orders}
          plans={salesPlans}
          managers={salesManagers}
          saving={saving}
          onSavePlan={handleSavePlan}
          onDeletePlan={handleDeletePlan}
          activeNav={activeNav}
          topTab={topTab}
        />
      ) : (
        <CateringCrmTab
          mode={currentRoute}
          orders={orders}
          contacts={contacts}
          fieldTemplates={fieldTemplates}
          managers={salesManagers}
          saving={saving}
          onSaveOrder={handleSaveOrder}
          onDeleteOrder={handleDeleteOrder}
          onSaveContact={handleSaveContact}
          onDeleteContact={handleDeleteContact}
          onSaveField={handleSaveField}
          onDeleteField={handleDeleteField}
        />
      )}
    </div>
  );
}