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
import CateringAssortmentTab from "./catering/CateringAssortmentTab";
import CateringRoleSettingsTab from "./catering/CateringRoleSettingsTab";

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
  proposals: {
    api: "cateringCommercialProposals",
    storage: "lucia_catering_commercial_proposals",
  },
  assortmentItems: {
    api: "assortmentMatrixItems",
    storage: "lucia_assortment_matrix_items",
  },
  roleSettings: {
    api: "cateringRoleSettings",
    storage: "lucia_catering_role_settings",
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

const toStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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
    customerName: String(value?.customerName || value?.customer_name || value?.customer || "").trim(),
    companyName: String(value?.companyName || value?.company_name || value?.company || "").trim(),
    eventType: String(value?.eventType || value?.event_type || "").trim(),
    contactId: String(value?.contactId || value?.contact_id || "").trim(),
    managerName: String(value?.managerName || value?.manager_name || value?.salesManager || value?.sales_manager || "").trim(),
    serviceManagerName: String(value?.serviceManagerName || value?.service_manager_name || value?.serviceManager || value?.service_manager || "").trim(),
    clientType: String(value?.clientType || value?.client_type || "").trim(),
    leadSource: String(value?.leadSource || value?.lead_source || value?.leadChannel || value?.lead_channel || value?.channel || value?.source || "").trim(),
    amount: toNumber(value?.amount),
    guestCount: String(value?.guestCount || value?.guest_count || "").trim(),
    eventDate: String(value?.eventDate || value?.event_date || value?.requiredDate || value?.required_date || "").trim(),
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
  industry: String(value?.industry || value?.businessDirection || "").trim(),
  address: String(value?.address || value?.location || "").trim(),
  phone: String(value?.phone || "").trim(),
  email: String(value?.email || "").trim(),
  assignedManager: String(value?.assignedManager || value?.managerName || "").trim(),
  leadSource: String(value?.leadSource || "").trim(),
  notes: String(value?.notes || "").trim(),
  createdAt: String(value?.createdAt || ""),
  updatedAt: String(value?.updatedAt || ""),
});

const normalizeField = (value = {}) => ({
  id: String(value?.id || ""),
  label: String(value?.label || "").trim(),
  key: String(value?.key || "").trim(),
  category: String(value?.category || "order").trim() || "order",
  type: String(value?.type || "text").trim() || "text",
  required: Boolean(value?.required),
  placeholder: String(value?.placeholder || "").trim(),
  description: String(value?.description || "").trim(),
  options: toStringArray(value?.options),
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

const normalizeProposal = (value = {}) => {
  const rawItems = (() => {
    if (Array.isArray(value?.items)) return value.items;
    if (typeof value?.items === "string") {
      try {
        const parsed = JSON.parse(value.items);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  })();

  return {
    id: String(value?.id || ""),
    orderId: String(value?.orderId || value?.order_id || "").trim(),
    orderTitle: String(value?.orderTitle || value?.order_title || "").trim(),
    customerName: String(value?.customerName || value?.customer_name || "").trim(),
    companyName: String(value?.companyName || value?.company_name || "").trim(),
    managerName: String(value?.managerName || value?.manager_name || "").trim(),
    title: String(value?.title || "").trim(),
    notes: String(value?.notes || "").trim(),
    status: String(value?.status || "draft").trim() || "draft",
    items: rawItems.map((item) => ({
      id: String(item?.id || createLocalId()),
      category: String(item?.category || "").trim(),
      subcategory: String(item?.subcategory || item?.sub_category || "").trim(),
      productName: String(item?.productName || item?.product_name || item?.name || "").trim(),
      output: String(item?.output || item?.portion || "").trim(),
      unitPrice: toNumber(item?.unitPrice ?? item?.unit_price),
      quantity: toNumber(item?.quantity || 1),
      amount: toNumber(item?.amount),
    })),
    totalAmount: toNumber(value?.totalAmount ?? value?.total_amount),
    createdAt: String(value?.createdAt || value?.created_at || ""),
    updatedAt: String(value?.updatedAt || value?.updated_at || ""),
  };
};

const normalizeAssortmentItem = (value = {}) => ({
  id: String(value?.id || ""),
  category: String(value?.category || "").trim(),
  subcategory: String(value?.subcategory || value?.subCategory || "").trim(),
  productName: String(value?.name || value?.productName || "").trim(),
  output: String(value?.output || value?.portion || value?.yield || "").trim(),
  unitPrice: toNumber(
    value?.portionSalePrice ?? value?.salePrice ?? value?.price ?? value?.unitPrice,
  ),
  costPrice: toNumber(value?.portionCostPrice ?? value?.costPrice),
  updatedAt: String(value?.updatedAt || value?.createdAt || ""),
});

const normalizeRoleSetting = (value = {}) => ({
  id: String(value?.id || value?.userId || ""),
  userId: String(value?.userId || value?.id || ""),
  userName: String(value?.userName || value?.displayName || "").trim(),
  userEmail: String(value?.userEmail || value?.email || "").trim(),
  isManager: Boolean(value?.isManager),
  isServiceManager: Boolean(value?.isServiceManager),
  createdAt: String(value?.createdAt || ""),
  updatedAt: String(value?.updatedAt || ""),
});

const sortByUpdatedAt = (left, right) => String(right?.updatedAt || right?.createdAt || "").localeCompare(String(left?.updatedAt || left?.createdAt || ""));

export default function CateringOperationsModule({ user, activeNav, topTab }) {
  const [orders, setOrders] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [fieldTemplates, setFieldTemplates] = useState([]);
  const [salesPlans, setSalesPlans] = useState([]);
  const [commercialProposals, setCommercialProposals] = useState([]);
  const [assortmentItems, setAssortmentItems] = useState([]);
  const [roleSettings, setRoleSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const activeNavToken = normalizeToken(activeNav);
  const topTabToken = normalizeToken(topTab);

  const currentRoute = useMemo(() => {
    const probe = `${activeNavToken} ${topTabToken}`;
    if (
      probe.includes("rolesetting") ||
      probe.includes("rolesettings") ||
      probe.includes("cateringrolesettings") ||
      probe.includes("rolemanagement") ||
      probe.includes("управлінняролями")
    ) {
      return "role-settings";
    }
    if (probe.includes("asortiment") || probe.includes("assortment")) return "assortment";
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
      const [ordersData, contactsData, fieldsData, plansData, proposalsData, assortmentItemsData, roleSettingsData] = await Promise.all([
        listRecords(COLLECTIONS.orders),
        listRecords(COLLECTIONS.contacts),
        listRecords(COLLECTIONS.fields),
        listRecords(COLLECTIONS.plans),
        listRecords(COLLECTIONS.proposals),
        listRecords(COLLECTIONS.assortmentItems),
        listRecords(COLLECTIONS.roleSettings),
      ]);
      setOrders((Array.isArray(ordersData) ? ordersData : []).map(normalizeOrder).sort(sortByUpdatedAt));
      setContacts((Array.isArray(contactsData) ? contactsData : []).map(normalizeContact).sort((left, right) => left.name.localeCompare(right.name, "uk")));
      setFieldTemplates((Array.isArray(fieldsData) ? fieldsData : []).map(normalizeField).sort((left, right) => left.label.localeCompare(right.label, "uk")));
      setSalesPlans((Array.isArray(plansData) ? plansData : []).map(normalizePlan).sort((left, right) => `${right.month}_${right.managerName}`.localeCompare(`${left.month}_${left.managerName}`, "uk")));
      setCommercialProposals((Array.isArray(proposalsData) ? proposalsData : []).map(normalizeProposal).sort(sortByUpdatedAt));
      setAssortmentItems((Array.isArray(assortmentItemsData) ? assortmentItemsData : []).map(normalizeAssortmentItem).filter((item) => item.productName));
      setRoleSettings((Array.isArray(roleSettingsData) ? roleSettingsData : []).map(normalizeRoleSetting).sort(sortByUpdatedAt));
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
    const managerNamesFromRoles = roleSettings
      .filter((item) => item.isManager || item.isServiceManager)
      .map((item) => item.userName || item.userEmail)
      .map((item) => String(item || "").trim())
      .filter(Boolean);

    const values = new Set([
      String(user?.displayName || user?.fullName || user?.email || "").trim(),
      ...managerNamesFromRoles,
      ...contacts.map((item) => String(item?.assignedManager || "").trim()),
      ...orders.map((item) => String(item?.managerName || "").trim()),
      ...orders.map((item) => String(item?.serviceManagerName || "").trim()),
      ...salesPlans.map((item) => String(item?.managerName || "").trim()),
    ].filter(Boolean));
    return Array.from(values).sort((left, right) => left.localeCompare(right, "uk"));
  }, [contacts, orders, roleSettings, salesPlans, user]);

  const currentUserName = useMemo(
    () => String(user?.displayName || user?.fullName || user?.email || "").trim(),
    [user],
  );

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

  const handleSaveProposal = useCallback(async (draft) => {
    setSaving(true);
    try {
      const preparedItems = Array.isArray(draft?.items)
        ? draft.items.map((item) => ({
          ...item,
          unitPrice: toNumber(item?.unitPrice),
          quantity: toNumber(item?.quantity || 1),
          amount: toNumber(item?.amount),
        }))
        : [];
      const totalAmount = preparedItems.reduce((sum, item) => sum + toNumber(item.amount || item.unitPrice * item.quantity), 0);
      const saved = normalizeProposal(await saveRecord(COLLECTIONS.proposals, {
        ...draft,
        items: preparedItems,
        totalAmount,
      }));
      setCommercialProposals((prev) => [saved, ...prev.filter((item) => String(item.id) !== String(saved.id))].sort(sortByUpdatedAt));
      return { success: true, proposal: saved };
    } catch (saveError) {
      console.error("Помилка збереження комерційної пропозиції:", saveError);
      alert("Не вдалося зберегти комерційну пропозицію.");
      return { success: false };
    } finally {
      setSaving(false);
    }
  }, []);

  const handleDeleteProposal = useCallback(async (id) => {
    setSaving(true);
    try {
      await deleteRecord(COLLECTIONS.proposals, id);
      setCommercialProposals((prev) => prev.filter((item) => String(item.id) !== String(id)));
    } catch (deleteError) {
      console.error("Помилка видалення комерційної пропозиції:", deleteError);
      alert("Не вдалося видалити комерційну пропозицію.");
    } finally {
      setSaving(false);
    }
  }, []);

  const handleSaveAssortmentItem = useCallback(async (draft) => {
    setSaving(true);
    try {
      const saved = normalizeAssortmentItem(await saveRecord(COLLECTIONS.assortmentItems, {
        ...draft,
        name: String(draft?.productName || draft?.name || "").trim(),
        price: toNumber(draft?.unitPrice),
      }));
      setAssortmentItems((prev) => [saved, ...prev.filter((item) => String(item.id) !== String(saved.id))].sort((left, right) => left.productName.localeCompare(right.productName, "uk")));
      return { success: true };
    } catch (saveError) {
      console.error("Помилка збереження асортиментної позиції:", saveError);
      alert("Не вдалося зберегти позицію асортименту.");
      return { success: false };
    } finally {
      setSaving(false);
    }
  }, []);

  const handleDeleteAssortmentItem = useCallback(async (id) => {
    setSaving(true);
    try {
      await deleteRecord(COLLECTIONS.assortmentItems, id);
      setAssortmentItems((prev) => prev.filter((item) => String(item.id) !== String(id)));
    } catch (deleteError) {
      console.error("Помилка видалення асортиментної позиції:", deleteError);
      alert("Не вдалося видалити позицію асортименту.");
    } finally {
      setSaving(false);
    }
  }, []);

  const handleSaveRoleSetting = useCallback(async (draft) => {
    setSaving(true);
    try {
      const saved = normalizeRoleSetting(await saveRecord(COLLECTIONS.roleSettings, draft));
      setRoleSettings((prev) => [saved, ...prev.filter((item) => String(item.id) !== String(saved.id))].sort(sortByUpdatedAt));
      return { success: true };
    } catch (saveError) {
      console.error("Помилка збереження рольових налаштувань кейтерингу:", saveError);
      alert("Не вдалося зберегти рольові налаштування.");
      return { success: false };
    } finally {
      setSaving(false);
    }
  }, []);

  const handleDeleteRoleSetting = useCallback(async (id) => {
    setSaving(true);
    try {
      await deleteRecord(COLLECTIONS.roleSettings, id);
      setRoleSettings((prev) => prev.filter((item) => String(item.id) !== String(id)));
    } catch (deleteError) {
      console.error("Помилка видалення рольових налаштувань кейтерингу:", deleteError);
      alert("Не вдалося видалити рольові налаштування.");
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
      ) : currentRoute === "assortment" ? (
        <CateringAssortmentTab
          items={assortmentItems}
          saving={saving}
          onSaveItem={handleSaveAssortmentItem}
          onDeleteItem={handleDeleteAssortmentItem}
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
      ) : currentRoute === "role-settings" ? (
        <CateringRoleSettingsTab
          roleSettings={roleSettings}
          saving={saving}
          onSaveRoleSetting={handleSaveRoleSetting}
          onDeleteRoleSetting={handleDeleteRoleSetting}
        />
      ) : (
        <CateringCrmTab
          mode={currentRoute}
          orders={orders}
          contacts={contacts}
          fieldTemplates={fieldTemplates}
          proposals={commercialProposals}
          assortmentItems={assortmentItems}
          managers={salesManagers}
          currentUserName={currentUserName}
          saving={saving}
          onSaveOrder={handleSaveOrder}
          onDeleteOrder={handleDeleteOrder}
          onSaveContact={handleSaveContact}
          onDeleteContact={handleDeleteContact}
          onSaveField={handleSaveField}
          onDeleteField={handleDeleteField}
          onSaveProposal={handleSaveProposal}
          onDeleteProposal={handleDeleteProposal}
        />
      )}
    </div>
  );
}