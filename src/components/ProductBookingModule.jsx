import { useEffect, useMemo, useRef, useState } from "react";
import { Package, ShoppingCart, ClipboardCheck, Plus, Trash2, Download, Upload, FileDown, X, Printer, Calculator } from "lucide-react";
import { useProductBooking } from "../hooks/useProductBooking";
import {
  endProductInventorySession,
  getActiveProductInventorySession,
  startProductInventorySession,
  subscribeToActiveProductInventorySession,
} from "../firebase/firestore";

const loadProductInventoryExcel = () => import("../utils/productInventoryExcel");
const loadInventoryListExcel = () => import("../utils/inventoryListExcel");

const normalizeTabKind = (tabId = "") => {
  const value = String(tabId).toLowerCase();
  if (
    value.includes("inventarizationspisok") ||
    value.includes("inventorylist") ||
    value.includes("inventory-list") ||
    value.includes("списокінвентаризаці") ||
    value.includes("список інвентаризац")
  ) return "inventoryList";
  if (
    value.includes("productsettings") ||
    value.includes("inventoryproducts") ||
    value.includes("inventory-products") ||
    value.includes("productsadmin")
  ) return "products";
  if (value.includes("journal") || value.includes("журнал")) return "inventoryJournal";
  if (value.includes("vendor") || value.includes("supplier") || value.includes("постач")) return "suppliers";
  if (
    value.includes("inventarizations") ||
    value.includes("inventorization") ||
    value.includes("інвентаризац") ||
    value.includes("inventar") ||
    value.includes("inventory") ||
    value.includes("інвентар") ||
    value.includes("залишк")
  ) return "inventory";
  if (
    value.includes("typical") ||
    value.includes("typcal") ||
    value.includes("field") ||
    value.includes("category") ||
    value.includes("unit") ||
    value.includes("типов") ||
    (value.includes("typ") && value.includes("cal"))
  ) return "typicalFields";
  if (value.includes("product") || value.includes("admin") && value.includes("prod")) return "products";
  if (value.includes("order") || value.includes("manage")) return "orders";
  return "booking";
};

const cardClass = "card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl";
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";

const getErrorMessage = (error, fallbackMessage) => {
  const message = String(error?.message || error || "").trim();
  return message ? `${fallbackMessage}\n\n${message}` : fallbackMessage;
};

const toNumber = (value) => {
  const normalized = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoney = (value) => `${toNumber(value).toFixed(2)} грн`;

const formatDateUk = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const shortMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (shortMatch) {
    return `${shortMatch[3]}.${shortMatch[2]}.${shortMatch[1]}`;
  }
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString("uk-UA");
  }
  return raw;
};

const getInventoryEndedByLabel = (inventory) => {
  const endedBy = String(
    inventory?.inventorySessionEndedBy ||
    inventory?.inventory_session_ended_by ||
    inventory?.sessionEndedBy ||
    ""
  ).trim();
  return endedBy || "-";
};

const getMergedFromIds = (inventory) => {
  const direct = inventory?.mergedFromIds ?? inventory?.merged_from_ids;
  if (Array.isArray(direct)) return direct;
  if (typeof direct === "string") {
    const trimmed = direct.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
};

const getMergedIntoId = (inventory) => String(inventory?.mergedIntoId || inventory?.merged_into_id || "").trim();

const normalizeComparableToken = (value) => String(value || "").trim().toLowerCase();

const sameRestaurant = (productRestaurantId, restaurantId) => normalizeComparableToken(productRestaurantId) === normalizeComparableToken(restaurantId);

const collectRestaurantTokens = (source = {}) => {
  return new Set(
    [
      source?.restaurantId,
      source?.restaurant_id,
      source?.restaurant,
      source?.restaurantName,
      source?.restaurant_name,
      source?.restaurantRegNumber,
      source?.restaurant_reg_number,
      source?.regNumber,
      source?.reg_number,
      source?.id,
      source?.name,
      source?.code,
    ]
      .map((value) => normalizeComparableToken(value))
      .filter(Boolean)
  );
};

const hasRestaurantTokenOverlap = (leftTokens, rightTokens) => {
  if (!(leftTokens instanceof Set) || !(rightTokens instanceof Set)) return false;
  if (!leftTokens.size || !rightTokens.size) return false;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) return true;
  }
  return false;
};

const buildUserRestaurantTokens = (user, restaurants = []) => {
  const userTokens = collectRestaurantTokens(user || {});
  if (!userTokens.size) return userTokens;

  // Expand tokens from the matched restaurant record so we can compare by id/name/regNumber interchangeably.
  const matchedRestaurant = (Array.isArray(restaurants) ? restaurants : []).find((item) =>
    hasRestaurantTokenOverlap(userTokens, collectRestaurantTokens(item || {}))
  );

  if (matchedRestaurant) {
    for (const token of collectRestaurantTokens(matchedRestaurant)) {
      userTokens.add(token);
    }
  }

  return userTokens;
};

const isInventoryVisibleForUserRestaurant = (inventory, user, restaurants = [], isGlobalAdmin = false) => {
  if (isGlobalAdmin) return true;
  const userRestaurantTokens = buildUserRestaurantTokens(user, restaurants);
  const inventoryTokens = collectRestaurantTokens(inventory || {});
  return hasRestaurantTokenOverlap(userRestaurantTokens, inventoryTokens);
};

const findRestaurantByAnyReference = (restaurants = [], references = []) => {
  if (!Array.isArray(restaurants) || restaurants.length === 0) return null;

  const normalizedRefs = Array.from(new Set(references.map((value) => normalizeComparableToken(value)).filter(Boolean)));
  if (!normalizedRefs.length) return null;

  return restaurants.find((restaurant) => {
    const candidates = [
      restaurant?.id,
      restaurant?.code,
      restaurant?.regNumber,
      restaurant?.restaurantCode,
      restaurant?.name,
      restaurant?.restaurantName,
    ]
      .map((value) => normalizeComparableToken(value))
      .filter(Boolean);

    return candidates.some((candidate) => normalizedRefs.includes(candidate));
  }) || null;
};

const normalizeRestaurantScopedRecord = (record, restaurants = []) => {
  if (!record || typeof record !== "object") return record;

  const recordRestaurantId = String(record.restaurantId || "").trim();
  const recordRestaurantName = String(record.restaurantName || "").trim();
  const recordRestaurantRegNumber = String(record.restaurantRegNumber || "").trim();

  const matchedRestaurant = findRestaurantByAnyReference(restaurants, [
    recordRestaurantId,
    recordRestaurantName,
    recordRestaurantRegNumber,
    record.restaurant,
    record.restaurant_id,
    record.restaurant_name,
    record.restaurant_reg_number,
    record.regNumber,
    record.reg_number,
  ]);

  if (!matchedRestaurant) return record;

  return {
    ...record,
    restaurantId: String(matchedRestaurant.id || recordRestaurantId || "").trim(),
    restaurantName: String(matchedRestaurant.name || recordRestaurantName || "").trim(),
    restaurantRegNumber: String(
      matchedRestaurant.regNumber ||
      recordRestaurantRegNumber ||
      matchedRestaurant.code ||
      matchedRestaurant.restaurantCode ||
      ""
    ).trim(),
  };
};

const buildDerivedRestaurants = (records = []) => {
  const restaurantMap = new Map();

  records.forEach((record) => {
    if (!record || typeof record !== "object") return;

    const id = String(
      record.restaurantId ||
      record.restaurant_id ||
      record.restaurantRegNumber ||
      record.restaurant_reg_number ||
      record.regNumber ||
      record.reg_number ||
      record.restaurantName ||
      record.restaurant_name ||
      record.restaurant ||
      ""
    ).trim();
    const name = String(record.restaurantName || record.restaurant_name || record.restaurant || "").trim();
    const regNumber = String(
      record.restaurantRegNumber || record.restaurant_reg_number || record.regNumber || record.reg_number || ""
    ).trim();

    if (!id && !name && !regNumber) return;

    const key = String(id || regNumber || name).trim().toLowerCase();
    if (!key) return;

    const existing = restaurantMap.get(key);
    if (existing) {
      restaurantMap.set(key, {
        ...existing,
        id: existing.id || id || regNumber || name,
        name: existing.name || name || regNumber || id,
        regNumber: existing.regNumber || regNumber,
      });
      return;
    }

    restaurantMap.set(key, {
      id: id || regNumber || name,
      name: name || regNumber || id,
      regNumber,
    });
  });

  return Array.from(restaurantMap.values()).sort((a, b) =>
    String(a?.name || a?.regNumber || a?.id || "").localeCompare(String(b?.name || b?.regNumber || b?.id || ""), "uk")
  );
};

const getRestaurantNameById = (restaurants = [], restaurantId) => {
  return restaurants.find((item) => String(item.id) === String(restaurantId || ""))?.name || "";
};

const hasProcurementAccess = (user) => {
  const roleValue = String(user?.role || "").toLowerCase();
  const workRoleValue = String(user?.workRole || "").toLowerCase();
  const terms = [
    "admin",
    "procurement",
    "purchasing",
    "закуп",
    "закупівл",
    "постач",
    "manager",
    "керуюч",
    "управля",
  ];
  return terms.some((term) => roleValue.includes(term) || workRoleValue.includes(term));
};

const isGlobalAdminUser = (user) => String(user?.role || "").toLowerCase() === "admin";

function ProductAdminTab({ products, suppliers, categories, subcategoriesByCategory, units, inventories, restaurants, user, canManageProducts, addProduct, updateProduct, deleteProduct }) {
  const isGlobalAdmin = isGlobalAdminUser(user);
  const defaultRestaurantId = isGlobalAdmin ? "" : String(user?.restaurant || "");
  const createEmptyDraft = (restaurantId = "") => ({
    restaurantId,
    name: "",
    code1C: "",
    category: "",
    subcategory: "",
    unit: "",
    supplier: "",
    unitPrice: "",
  });
  const [createDraft, setCreateDraft] = useState(() => createEmptyDraft(defaultRestaurantId));
  const [editingProductId, setEditingProductId] = useState("");
  const [editDraft, setEditDraft] = useState(() => createEmptyDraft(defaultRestaurantId));
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [subcategoryFilter, setSubcategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [restaurantFilter, setRestaurantFilter] = useState(defaultRestaurantId);
  const [importMode, setImportMode] = useState("selected");

  const availableCreateSubcategories = useMemo(() => {
    if (!createDraft.category) return [];
    return subcategoriesByCategory?.[createDraft.category] || [];
  }, [createDraft.category, subcategoriesByCategory]);

  const availableEditSubcategories = useMemo(() => {
    if (!editDraft.category) return [];
    return subcategoriesByCategory?.[editDraft.category] || [];
  }, [editDraft.category, subcategoriesByCategory]);

  const editingProduct = useMemo(
    () => products.find((item) => String(item.id || "") === String(editingProductId || "")) || null,
    [products, editingProductId]
  );

  useEffect(() => {
    if (isGlobalAdmin) return;
    const scopedRestaurant = String(user?.restaurant || "");
    setRestaurantFilter(scopedRestaurant);
    setCreateDraft((prev) => ({ ...prev, restaurantId: scopedRestaurant }));
    setEditDraft((prev) => ({ ...prev, restaurantId: scopedRestaurant }));
  }, [user, isGlobalAdmin]);

  useEffect(() => {
    if (!editingProductId || editingProduct) return;
    setEditingProductId("");
    setEditDraft(createEmptyDraft(defaultRestaurantId));
  }, [defaultRestaurantId, editingProduct, editingProductId]);

  const availableRestaurants = useMemo(() => {
    if (isGlobalAdmin) return restaurants;
    return restaurants.filter((item) => String(item.id) === String(user?.restaurant || ""));
  }, [restaurants, user, isGlobalAdmin]);

  const resetCreateDraft = () => {
    setCreateDraft(createEmptyDraft(defaultRestaurantId));
  };

  const resetEditDraft = () => {
    setEditingProductId("");
    setEditDraft(createEmptyDraft(defaultRestaurantId));
  };

  const buildProductPayload = (draftValue, activeValue = true) => {
    const selectedRestaurant = restaurants.find((item) => String(item.id) === String(draftValue.restaurantId));
    return {
      restaurantId: String(draftValue.restaurantId),
      restaurantName: selectedRestaurant?.name || "Невідомий ресторан",
      restaurantRegNumber: String(selectedRestaurant?.regNumber || ""),
      name: String(draftValue.name || "").trim(),
      code1C: String(draftValue.code1C || "").trim(),
      category: String(draftValue.category || "").trim(),
      subcategory: String(draftValue.subcategory || "").trim(),
      unit: String(draftValue.unit || "").trim(),
      supplier: String(draftValue.supplier || "").trim(),
      unitPrice: toNumber(draftValue.unitPrice),
      isActive: activeValue,
    };
  };

  const validateDraft = (draftValue) => {
    if (!String(draftValue.restaurantId || "").trim()) {
      alert("Оберіть заклад для продукту.");
      return false;
    }
    if (!String(draftValue.name || "").trim() || !String(draftValue.category || "").trim() || !String(draftValue.unit || "").trim() || !String(draftValue.supplier || "").trim()) {
      alert("Заповніть обов'язкові поля: Назва, Категорія, Одиниця, Постачальник.");
      return false;
    }
    return true;
  };

  const handleDraftCategoryChange = (setDraftState, nextCategory) => {
    setDraftState((prev) => ({
      ...prev,
      category: nextCategory,
      subcategory: "",
    }));
  };

  const handleSelectProductForEdit = (item) => {
    setEditingProductId(String(item?.id || ""));
    setEditDraft({
      restaurantId: String(item?.restaurantId || defaultRestaurantId || ""),
      name: String(item?.name || ""),
      code1C: String(item?.code1C || ""),
      category: String(item?.category || ""),
      subcategory: String(item?.subcategory || ""),
      unit: String(item?.unit || ""),
      supplier: String(item?.supplier || ""),
      unitPrice: String(item?.unitPrice ?? ""),
    });
  };

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return products.filter((item) => {
      const byRestaurant = restaurantFilter ? sameRestaurant(item.restaurantId, restaurantFilter) : true;
      const bySearch = normalizedSearch
        ? [item.name, item.code1C, item.category, item.subcategory, item.unit, item.supplier, item.restaurantName]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch)
        : true;
      const byCategory = categoryFilter ? item.category === categoryFilter : true;
      const bySubcategory = subcategoryFilter ? String(item.subcategory || "") === subcategoryFilter : true;
      const bySupplier = supplierFilter ? item.supplier === supplierFilter : true;
      const byStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
            ? item.isActive !== false
            : item.isActive === false;

      return byRestaurant && bySearch && byCategory && bySubcategory && bySupplier && byStatus;
    });
  }, [products, searchTerm, categoryFilter, subcategoryFilter, supplierFilter, statusFilter, restaurantFilter]);

  const handleAdd = async () => {
    if (!validateDraft(createDraft)) return;

    const result = await addProduct(buildProductPayload(createDraft, true));
    if (!result.success) {
      alert(getErrorMessage(result.error, "Не вдалося додати продукт у базу."));
      return;
    }

    resetCreateDraft();
  };

  const handleSaveEdit = async () => {
    if (!editingProductId || !editingProduct) {
      alert("Спочатку оберіть продукт для редагування.");
      return;
    }
    if (!validateDraft(editDraft)) return;

    const result = await updateProduct(
      editingProductId,
      buildProductPayload(editDraft, editingProduct.isActive !== false)
    );
    if (!result.success) {
      alert(getErrorMessage(result.error, "Не вдалося зберегти зміни продукту."));
      return;
    }

    alert("Зміни продукту збережено.");
  };

  const toggleActive = async (item) => {
    const { id, ...payload } = item;
    const result = await updateProduct(id, { ...payload, isActive: !item.isActive });
    if (!result.success) {
      alert(getErrorMessage(result.error, "Не вдалося оновити статус продукту."));
    }
  };

  const handleDeleteProduct = async (item) => {
    const confirmed = window.confirm(
      `Видалити продукт "${item?.name || "без назви"}"?\nЦю дію неможливо скасувати.`
    );
    if (!confirmed) return;

    const result = await deleteProduct(item.id);
    if (!result.success) {
      alert(getErrorMessage(result.error, "Не вдалося видалити продукт."));
    }

    if (String(editingProductId || "") === String(item?.id || "")) {
      resetEditDraft();
    }
  };

  const handleExportProductsAndInventories = async () => {
    const { exportProductsAndInventoriesToExcel } = await loadProductInventoryExcel();
    exportProductsAndInventoriesToExcel(products, inventories);
  };

  const handleDownloadProductsTemplate = async () => {
    const { downloadProductsTemplate } = await loadProductInventoryExcel();
    downloadProductsTemplate();
  };

  const handleDownloadProductsTemplate1C = async () => {
    const { downloadProductsTemplate1C } = await loadProductInventoryExcel();
    downloadProductsTemplate1C();
  };

  const handleImportProducts = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const selectedRestaurantId = String(createDraft.restaurantId || restaurantFilter || user?.restaurant || "");
    const selectedRestaurant = restaurants.find((item) => String(item.id) === selectedRestaurantId);

    if (importMode === "selected" && !selectedRestaurantId) {
      alert("Перед імпортом оберіть заклад.");
      event.target.value = "";
      return;
    }

    try {
      const { importProductsFromExcel } = await loadProductInventoryExcel();
      const importedProducts = await importProductsFromExcel(file, {
        id: importMode === "selected" ? selectedRestaurantId : "",
        name: importMode === "selected" ? String(selectedRestaurant?.name || "") : "",
        regNumber: importMode === "selected" ? String(selectedRestaurant?.regNumber || "") : "",
        forceSingleRestaurant: importMode === "selected",
        restaurants,
      });
      if (importedProducts.length === 0) {
        alert(
          importMode === "selected"
            ? "У файлі не знайдено валідних продуктів для імпорту. Перевірте поля: Код(1С), Номенклатура/Назва, Категорія, Підкатегорія, Единица измерения/Одиниця, Учетная цена/Ціна."
            : "У файлі не знайдено валідних продуктів для імпорту. Для мультизакладного імпорту додайте 'Код закладу' (обліковий №, напр. 101КВ) або 'Заклад'."
        );
        return;
      }

      let successCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      let failCount = 0;

      for (const product of importedProducts) {
        const normalizedCode1C = String(product.code1C || "").trim().toLowerCase();
        if (!normalizedCode1C) {
          skippedCount += 1;
          continue;
        }

        const existingItem = products.find(
          (item) =>
            sameRestaurant(item.restaurantId, product.restaurantId) &&
            String(item.code1C || "").trim().toLowerCase() === normalizedCode1C
        );

        if (existingItem) {
          const { id: existingId, ...existingPayload } = existingItem;
          const result = await updateProduct(existingId, {
            ...existingPayload,
            ...product,
          });
          if (result.success) updatedCount += 1;
          else failCount += 1;
          continue;
        }

        const result = await addProduct(product);
        if (result.success) successCount += 1;
        else failCount += 1;
      }

      alert(`Імпорт завершено. Додано: ${successCount}. Оновлено: ${updatedCount}. Пропущено: ${skippedCount}. Помилок: ${failCount}.`);
    } catch (error) {
      console.error("Помилка імпорту продуктів:", error);
      alert("Не вдалося імпортувати файл продуктів.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className={cardClass}>
      <div className="mb-4 flex items-center gap-2">
        <Package size={18} className="text-indigo-600" />
        <h2 className="text-lg font-semibold">Адміністрування продуктів</h2>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".xlsx,.xls"
          ref={(input) => {
            window.productImportInput = input;
          }}
          style={{ display: "none" }}
          onChange={handleImportProducts}
        />
        {canManageProducts && (
          <>
            <select
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
              value={importMode}
              onChange={(e) => setImportMode(e.target.value)}
            >
              <option value="selected">Імпорт у вибраний заклад</option>
              {isGlobalAdmin && <option value="from-file">Мультизакладний імпорт з файлу</option>}
            </select>
            <button
              type="button"
              onClick={() => {
                void handleDownloadProductsTemplate();
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-600 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-500"
            >
              <FileDown size={15} /> Шаблон
            </button>
            <button
              type="button"
              onClick={() => {
                void handleDownloadProductsTemplate1C();
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-700 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-600"
            >
              <FileDown size={15} /> Шаблон 1С
            </button>
            <button
              type="button"
              onClick={() => window.productImportInput?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              <Upload size={15} /> Імпорт продуктів
            </button>
          </>
        )}
        <button
          type="button"
          onClick={handleExportProductsAndInventories}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
        >
          <Download size={15} /> Експорт Ексель
        </button>
      </div>

      {!canManageProducts && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Лише адміністратор або відділ закупівель може змінювати довідник продуктів.
        </div>
      )}

      {canManageProducts && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {importMode === "selected"
            ? "Режим імпорту: всі рядки з Excel будуть прив'язані до обраного закладу. Підтримується формат 1С та внутрішній шаблон з полями категорії і підкатегорії."
            : "Режим імпорту: заклад береться з колонок 'Код закладу' (обліковий №, напр. 101КВ) або 'Заклад'."}
        </div>
      )}

      {canManageProducts && (
        <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Новий продукт</h3>
                <p className="text-sm text-slate-600">Створення нового продукту окремо від редагування вже наявних позицій.</p>
              </div>
              <button
                type="button"
                onClick={resetCreateDraft}
                className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                Очистити
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-800">Заклад</label>
                <select className={inputClass} value={createDraft.restaurantId} onChange={(e) => setCreateDraft((prev) => ({ ...prev, restaurantId: e.target.value }))}>
                  <option value="">Оберіть заклад</option>
                  {availableRestaurants.map((restaurant) => (
                    <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-800">Назва</label>
                <input className={inputClass} value={createDraft.name} onChange={(e) => setCreateDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Наприклад, Соус ванільний" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-800">Код 1С</label>
                <input className={inputClass} value={createDraft.code1C} onChange={(e) => setCreateDraft((prev) => ({ ...prev, code1C: e.target.value }))} placeholder="Якщо є у довіднику" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-800">Категорія</label>
                <select className={inputClass} value={createDraft.category} onChange={(e) => handleDraftCategoryChange(setCreateDraft, e.target.value)}>
                  <option value="">Оберіть категорію</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-800">Підкатегорія</label>
                <select className={inputClass} value={createDraft.subcategory} onChange={(e) => setCreateDraft((prev) => ({ ...prev, subcategory: e.target.value }))} disabled={!createDraft.category}>
                  <option value="">{createDraft.category ? "Оберіть підкатегорію" : "Спочатку оберіть категорію"}</option>
                  {availableCreateSubcategories.map((subcategory) => (
                    <option key={subcategory} value={subcategory}>{subcategory}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-800">Одиниця</label>
                <select className={inputClass} value={createDraft.unit} onChange={(e) => setCreateDraft((prev) => ({ ...prev, unit: e.target.value }))}>
                  <option value="">Оберіть одиницю</option>
                  {units.map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-800">Постачальник</label>
                <select className={inputClass} value={createDraft.supplier} onChange={(e) => setCreateDraft((prev) => ({ ...prev, supplier: e.target.value }))}>
                  <option value="">Оберіть постачальника</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier} value={supplier}>{supplier}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-800">Ціна за одиницю (грн)</label>
                <input type="number" min="0" step="0.01" className={inputClass} value={createDraft.unitPrice} onChange={(e) => setCreateDraft((prev) => ({ ...prev, unitPrice: e.target.value }))} placeholder="0.00" />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleAdd}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                <Plus size={16} /> Додати продукт
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Редагування продукту</h3>
                <p className="text-sm text-slate-600">Оберіть позицію в таблиці нижче, щоб відкрити її для редагування в окремому блоці.</p>
              </div>
              {editingProductId ? (
                <button
                  type="button"
                  onClick={resetEditDraft}
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                >
                  <X size={15} /> Скасувати
                </button>
              ) : null}
            </div>

            {!editingProductId ? (
              <div className="rounded-xl border border-dashed border-blue-300 bg-white/70 px-4 py-6 text-sm text-slate-600">
                Продукт для редагування ще не вибрано. Натисніть "Редагувати" у таблиці, щоб змінити назву, категорію, постачальника або інші поля.
              </div>
            ) : (
              <>
                <div className="mb-3 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm text-slate-700">
                  Редагується: <span className="font-semibold text-slate-900">{editingProduct?.name || "Без назви"}</span>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Заклад</label>
                    <select className={inputClass} value={editDraft.restaurantId} onChange={(e) => setEditDraft((prev) => ({ ...prev, restaurantId: e.target.value }))}>
                      <option value="">Оберіть заклад</option>
                      {availableRestaurants.map((restaurant) => (
                        <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Назва</label>
                    <input className={inputClass} value={editDraft.name} onChange={(e) => setEditDraft((prev) => ({ ...prev, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Код 1С</label>
                    <input className={inputClass} value={editDraft.code1C} onChange={(e) => setEditDraft((prev) => ({ ...prev, code1C: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Категорія</label>
                    <select className={inputClass} value={editDraft.category} onChange={(e) => handleDraftCategoryChange(setEditDraft, e.target.value)}>
                      <option value="">Оберіть категорію</option>
                      {categories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Підкатегорія</label>
                    <select className={inputClass} value={editDraft.subcategory} onChange={(e) => setEditDraft((prev) => ({ ...prev, subcategory: e.target.value }))} disabled={!editDraft.category}>
                      <option value="">{editDraft.category ? "Оберіть підкатегорію" : "Спочатку оберіть категорію"}</option>
                      {availableEditSubcategories.map((subcategory) => (
                        <option key={subcategory} value={subcategory}>{subcategory}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Одиниця</label>
                    <select className={inputClass} value={editDraft.unit} onChange={(e) => setEditDraft((prev) => ({ ...prev, unit: e.target.value }))}>
                      <option value="">Оберіть одиницю</option>
                      {units.map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Постачальник</label>
                    <select className={inputClass} value={editDraft.supplier} onChange={(e) => setEditDraft((prev) => ({ ...prev, supplier: e.target.value }))}>
                      <option value="">Оберіть постачальника</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier} value={supplier}>{supplier}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Ціна за одиницю (грн)</label>
                    <input type="number" min="0" step="0.01" className={inputClass} value={editDraft.unitPrice} onChange={(e) => setEditDraft((prev) => ({ ...prev, unitPrice: e.target.value }))} />
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={resetEditDraft}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Скасувати зміни
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
                  >
                    Зберегти зміни
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
        <div>
          <label className="text-sm font-semibold text-slate-800">Фільтр закладу</label>
          <select
            className={inputClass}
            value={restaurantFilter}
            onChange={(e) => setRestaurantFilter(e.target.value)}
            disabled={!isGlobalAdmin}
          >
            <option value="">{isGlobalAdmin ? "Всі заклади" : "Оберіть заклад"}</option>
            {availableRestaurants.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
            ))}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label className="text-sm font-semibold text-slate-800">Пошук по продуктах</label>
          <input
            className={inputClass}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Назва, категорія, постачальник, од. вим."
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Фільтр категорії</label>
          <select className={inputClass} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Всі категорії</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Фільтр підкатегорії</label>
          <select className={inputClass} value={subcategoryFilter} onChange={(e) => setSubcategoryFilter(e.target.value)}>
            <option value="">Всі підкатегорії</option>
            {(categoryFilter ? (subcategoriesByCategory?.[categoryFilter] || []) : Object.values(subcategoriesByCategory || {}).flat())
              .filter((value, index, arr) => arr.indexOf(value) === index)
              .map((subcategory) => (
                <option key={subcategory} value={subcategory}>{subcategory}</option>
              ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Фільтр постачальника</label>
          <select className={inputClass} value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
            <option value="">Всі постачальники</option>
            {suppliers.map((supplier) => (
              <option key={supplier} value={supplier}>{supplier}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col justify-end gap-2 lg:col-span-1">
          <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Всі статуси</option>
            <option value="active">Активні</option>
            <option value="inactive">Вимкнені</option>
          </select>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            onClick={() => {
              setSearchTerm("");
              setCategoryFilter("");
              setSubcategoryFilter("");
              setSupplierFilter("");
              setStatusFilter("all");
              setRestaurantFilter(isGlobalAdmin ? "" : String(user?.restaurant || ""));
            }}
          >
            Скинути фільтри
          </button>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between text-xs font-semibold text-slate-600">
        <span>Показано {filteredProducts.length} з {products.length}</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left">Назва</th>
              <th className="px-3 py-2 text-left">Код 1С</th>
              <th className="px-3 py-2 text-left">Категорія</th>
              <th className="px-3 py-2 text-left">Підкатегорія</th>
              <th className="px-3 py-2 text-left">Одиниця</th>
              <th className="px-3 py-2 text-left">Ціна за од.</th>
              <th className="px-3 py-2 text-left">Постачальник</th>
              <th className="px-3 py-2 text-left">Заклад</th>
              <th className="px-3 py-2 text-left">Статус</th>
              {canManageProducts && <th className="px-3 py-2 text-left">Дії</th>}
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((item) => {
              const isEditingCurrentItem = String(editingProductId || "") === String(item.id || "");
              return (
                <tr key={item.id} className="border-t border-slate-200">
                  <td className="px-3 py-2 font-medium text-slate-900">{item.name}</td>
                  <td className="px-3 py-2">{item.code1C || "-"}</td>
                  <td className="px-3 py-2">{item.category}</td>
                  <td className="px-3 py-2">{item.subcategory || "-"}</td>
                  <td className="px-3 py-2">{item.unit}</td>
                  <td className="px-3 py-2">{formatMoney(item.unitPrice)}</td>
                  <td className="px-3 py-2">{item.supplier || "-"}</td>
                  <td className="px-3 py-2">{item.restaurantName || "-"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                      {item.isActive ? "Активний" : "Вимкнений"}
                    </span>
                  </td>
                  {canManageProducts && (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className={`rounded-lg border px-2 py-1 text-xs font-semibold ${isEditingCurrentItem ? "border-blue-300 bg-blue-100 text-blue-700" : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"}`}
                          onClick={() => handleSelectProductForEdit(item)}
                        >
                          {isEditingCurrentItem ? "Редагується" : "Редагувати"}
                        </button>
                        <button type="button" className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-100" onClick={() => toggleActive(item)}>
                          {item.isActive ? "Вимкнути" : "Увімкнути"}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                          onClick={() => handleDeleteProduct(item)}
                        >
                          Видалити
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={canManageProducts ? 10 : 9} className="px-3 py-6 text-center text-slate-500">
                  За поточними фільтрами продукти не знайдено.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InventoryTab({ products, inventories, restaurants, user, createInventory, updateInventory, deleteInventory }) {
  const isGlobalAdmin = isGlobalAdminUser(user);
  const quantityInputRefs = useRef({});
  const pendingRestoreRef = useRef(null);
  const pendingDeltaActionRef = useRef(null);
  const [activeRowProductId, setActiveRowProductId] = useState(null);
  const [restaurantId, setRestaurantId] = useState(isGlobalAdmin ? "" : String(user?.restaurant || ""));
  // quantities = accumulated/committed totals per productId (used for saving & green highlight)
  const [quantities, setQuantities] = useState({});
  // inputValues = current delta text in each quantity input box
  const [inputValues, setInputValues] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [editingInventoryId, setEditingInventoryId] = useState("");
  const [inventoryDate, setInventoryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [stockTakingPlace, setStockTakingPlace] = useState("");
  const [activeSession, setActiveSession] = useState(null);
  // Calculator modal state
  const [calcModal, setCalcModal] = useState({
    isOpen: false,
    productId: null,
    productName: "",
    display: "0",
    expression: "",
    memory: 0,
    lastOp: null,
    newNumber: true,
  });

  useEffect(() => {
    if (isGlobalAdmin) return;
    setRestaurantId(String(user?.restaurant || ""));
  }, [user, isGlobalAdmin]);

  useEffect(() => {
    if (!restaurantId) {
      setActiveSession(null);
      return () => {};
    }

    const unsubscribe = subscribeToActiveProductInventorySession(restaurantId, (session) => {
      if (session) {
        setActiveSession(session);
        return;
      }
      // Poll returned null — guard against stale/racing poll responses that could wipe a
      // freshly-created session. Re-verify directly before clearing the local state.
      setActiveSession((prev) => {
        if (!prev?.id) return null; // already clear — nothing to protect
        getActiveProductInventorySession(restaurantId).then((fresh) => {
          setActiveSession(fresh || null);
        }).catch(() => {
          setActiveSession(null);
        });
        return prev; // keep for now while the direct check is in flight
      });
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [restaurantId]);

  const scopedProducts = useMemo(() => {
    const selectedRestaurantId = String(restaurantId || "");
    if (!selectedRestaurantId) return [];
    return products.filter((item) => item.isActive !== false && sameRestaurant(item.restaurantId, selectedRestaurantId));
  }, [products, restaurantId]);

  useEffect(() => {
    const pendingRestore = pendingRestoreRef.current;
    if (pendingRestore && String(pendingRestore.restaurantId || "") === String(restaurantId || "")) {
      setQuantities(pendingRestore.quantities || {});
      setInputValues({});
      setEditingInventoryId(String(pendingRestore.inventoryId || ""));
      setInventoryDate(String(pendingRestore.inventoryDate || new Date().toISOString().slice(0, 10)));
      setStockTakingPlace(String(pendingRestore.stockTakingPlace || ""));
      pendingRestoreRef.current = null;
      return;
    }

    setQuantities({});
    setInputValues({});
    setEditingInventoryId("");
    setStockTakingPlace("");
  }, [restaurantId]);

  const keywordSuggestions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    return scopedProducts
      .map((item) => String(item.name || "").trim())
      .filter(Boolean)
      .filter((name) => name.toLowerCase().includes(term))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(term) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(term) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.localeCompare(b, "uk");
      })
      .slice(0, 8);
  }, [scopedProducts, searchTerm]);

  const openCalcModal = (productId, productName) => {
    setCalcModal({
      isOpen: true,
      productId,
      productName,
      display: String(toNumber(quantities[productId]) || "0"),
      expression: "",
      memory: 0,
      lastOp: null,
      newNumber: false,
    });
  };

  const closeCalcModal = () => {
    setCalcModal((prev) => ({ ...prev, isOpen: false }));
  };

  const calcInput = (digit) => {
    setCalcModal((prev) => {
      if (prev.newNumber) {
        return { ...prev, display: String(digit), newNumber: false };
      }
      const newDisplay = prev.display === "0" ? String(digit) : prev.display + String(digit);
      return { ...prev, display: newDisplay };
    });
  };

  const calcDot = () => {
    setCalcModal((prev) => {
      if (prev.newNumber) {
        return { ...prev, display: "0.", newNumber: false };
      }
      if (prev.display.includes(".")) return prev;
      return { ...prev, display: prev.display + "." };
    });
  };

  const calcClear = () => {
    setCalcModal((prev) => ({
      ...prev,
      display: "0",
      expression: "",
      memory: 0,
      lastOp: null,
      newNumber: true,
    }));
  };

  const calcBackspace = () => {
    setCalcModal((prev) => {
      const newDisplay = prev.display.slice(0, -1) || "0";
      return { ...prev, display: newDisplay };
    });
  };

  const evaluateCalcExpression = (rawExpression) => {
    const expression = String(rawExpression || "")
      .replace(/,/g, ".")
      .replace(/\s+/g, "")
      .replace(/[+\-*/]+$/, "");

    if (!expression) return 0;

    const tokens = expression.match(/\d*\.?\d+|[+\-*/]/g);
    if (!tokens || tokens.length === 0) return 0;

    // Pass 1: * and /
    const folded = [];
    let current = toNumber(tokens[0]);

    for (let i = 1; i < tokens.length; i += 2) {
      const op = tokens[i];
      const next = toNumber(tokens[i + 1]);
      if (op === "*") {
        current *= next;
      } else if (op === "/") {
        current = next === 0 ? current : current / next;
      } else {
        folded.push(current, op);
        current = next;
      }
    }
    folded.push(current);

    // Pass 2: + and -
    let result = toNumber(folded[0]);
    for (let i = 1; i < folded.length; i += 2) {
      const op = folded[i];
      const next = toNumber(folded[i + 1]);
      if (op === "+") result += next;
      if (op === "-") result -= next;
    }

    return result;
  };

  const calcOperation = (op) => {
    setCalcModal((prev) => {
      if (prev.newNumber) {
        // If user presses operators in sequence, replace the trailing operator.
        const replacedExpression = String(prev.expression || "")
          .replace(/[+\-*/]+$/, "")
          .concat(op);
        return { ...prev, expression: replacedExpression };
      }

      const nextExpression = `${prev.expression || ""}${prev.display}${op}`;
      return {
        ...prev,
        expression: nextExpression,
        newNumber: true,
      };
    });
  };

  const calcEquals = () => {
    setCalcModal((prev) => {
      const fullExpression = prev.newNumber
        ? String(prev.expression || "").replace(/[+\-*/]+$/, "")
        : `${prev.expression || ""}${prev.display}`;

      const result = fullExpression
        ? evaluateCalcExpression(fullExpression)
        : toNumber(prev.display);

      return {
        ...prev,
        expression: "",
        display: String(result),
        newNumber: true,
      };
    });
  };

  const calcSave = () => {
    const fullExpression = calcModal.newNumber
      ? String(calcModal.expression || "").replace(/[+\-*/]+$/, "")
      : `${calcModal.expression || ""}${calcModal.display}`;

    const finalValue = fullExpression
      ? evaluateCalcExpression(fullExpression)
      : toNumber(calcModal.display);

    const safeValue = Math.max(0, finalValue);
    setQuantities((prev) => ({
      ...prev,
      [calcModal.productId]: safeValue === 0 ? "" : String(safeValue),
    }));
    closeCalcModal();
  };

  // Calculator-style: applies the currently-typed delta to the accumulated total.
  // sign=+1 adds, sign=-1 subtracts. After applying, clears the input field and re-focuses.
  const applyDelta = (productId, sign) => {
    const delta = toNumber(inputValues[productId]);
    if (delta === 0) return;
    setQuantities((prev) => {
      const next = Math.max(0, toNumber(prev[productId]) + sign * delta);
      return { ...prev, [productId]: next === 0 ? "" : String(next) };
    });
    setInputValues((prev) => ({ ...prev, [productId]: "" }));
    // Re-focus so the user can immediately type the next delta.
    requestAnimationFrame(() => focusQuantityInput(productId));
  };

  const commitPendingDelta = (productId, sign, shouldRefocus = false) => {
    const delta = toNumber(inputValues[productId]);
    if (delta === 0) return;
    setQuantities((prev) => {
      const next = Math.max(0, toNumber(prev[productId]) + sign * delta);
      return { ...prev, [productId]: next === 0 ? "" : String(next) };
    });
    setInputValues((prev) => ({ ...prev, [productId]: "" }));
    if (shouldRefocus) {
      requestAnimationFrame(() => focusQuantityInput(productId));
    }
  };

  const focusQuantityInput = (productId) => {
    const input = quantityInputRefs.current?.[productId];
    if (!input) return;
    setActiveRowProductId(productId);
    input.focus();
    input.select?.();
  };

  const availableRestaurants = useMemo(() => {
    if (isGlobalAdmin) return restaurants;
    return restaurants.filter((item) => String(item.id) === String(user?.restaurant));
  }, [restaurants, user, isGlobalAdmin]);

  const visibleInventories = useMemo(() => {
    return inventories.filter((item) => isInventoryVisibleForUserRestaurant(item, user, restaurants, isGlobalAdmin));
  }, [inventories, user, restaurants, isGlobalAdmin]);

  const mergeCandidates = useMemo(() => {
    return visibleInventories.filter((item) => {
      const isFinalMerged = getMergedFromIds(item).length > 0;
      const isSourceMerged = Boolean(getMergedIntoId(item));
      return !isFinalMerged && !isSourceMerged;
    });
  }, [visibleInventories]);

  const currentWorkingInventory = useMemo(() => {
    if (editingInventoryId) {
      return visibleInventories.find((item) => String(item?.id || "") === String(editingInventoryId)) || null;
    }
    return null;
  }, [visibleInventories, editingInventoryId]);

  const savedInventoriedProductIds = useMemo(() => {
    const productIds = new Set();

    (Array.isArray(currentWorkingInventory?.items) ? currentWorkingInventory.items : []).forEach((item) => {
      const productId = String(item?.productId || "").trim();
      if (productId && toNumber(item?.qty) > 0) {
        productIds.add(productId);
      }
    });

    return productIds;
  }, [currentWorkingInventory]);

  const inventoriedProductIds = useMemo(() => {
    const productIds = new Set(savedInventoriedProductIds);

    scopedProducts.forEach((product) => {
      const effectiveQty = toNumber(quantities[product.id]) + toNumber(inputValues[product.id]);
      const normalizedId = String(product.id || "").trim();
      if (!normalizedId) return;
      if (effectiveQty > 0) {
        productIds.add(normalizedId);
      } else {
        productIds.delete(normalizedId);
      }
    });

    return productIds;
  }, [savedInventoriedProductIds, quantities, inputValues, scopedProducts]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return scopedProducts.filter((item) => {
      return normalizedSearch
        ? [item.name, item.code1C, item.category]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch)
        : true;
    });
  }, [scopedProducts, searchTerm]);

  // Auto-focus on the single matching product's quantity input when searching.
  useEffect(() => {
    if (filteredProducts.length === 1 && searchTerm.trim()) {
      requestAnimationFrame(() => focusQuantityInput(filteredProducts[0].id));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredProducts.length === 1 ? filteredProducts[0]?.id : null, searchTerm]);

  const filledLines = useMemo(() => {
    return scopedProducts
      .map((product) => {
        // Effective qty = committed total + any typed-but-not-yet-applied delta.
        const qty = toNumber(quantities[product.id]) + toNumber(inputValues[product.id]);
        if (qty <= 0) return null;
        const unitPrice = toNumber(product.unitPrice);
        return {
          productId: product.id,
          productName: product.name,
          code1C: product.code1C || "",
          category: product.category,
          unit: product.unit,
          qty,
          unitPrice,
          amount: qty * unitPrice,
        };
      })
      .filter(Boolean);
  }, [scopedProducts, quantities, inputValues]);

  const buildRestoredQuantities = (inventory, targetRestaurantId) => {
    const normalizedRestaurantId = String(targetRestaurantId || "");
    const scopedRestoreProducts = products.filter(
      (item) => item.isActive !== false && sameRestaurant(item.restaurantId, normalizedRestaurantId)
    );

    const byId = new Map();
    const byCode = new Map();
    const byName = new Map();

    scopedRestoreProducts.forEach((product) => {
      const productId = String(product?.id || "").trim();
      const code1C = String(product?.code1C || "").trim().toLowerCase();
      const name = String(product?.name || "").trim().toLowerCase();

      if (productId) byId.set(productId, product);
      if (code1C) byCode.set(code1C, product);
      if (name) byName.set(name, product);
    });

    return (inventory?.items || []).reduce((acc, item) => {
      const qty = toNumber(item?.qty);
      if (qty <= 0) return acc;

      const productId = String(item?.productId || "").trim();
      const code1C = String(item?.code1C || "").trim().toLowerCase();
      const name = String(item?.productName || item?.name || "").trim().toLowerCase();

      const matchedProduct = byId.get(productId) || byCode.get(code1C) || byName.get(name);
      if (!matchedProduct?.id) return acc;

      acc[String(matchedProduct.id)] = String(qty);
      return acc;
    }, {});
  };

  // Per-user inventory: each user saves their own record independently.
  // No shared session needed — inventoryDate + userId serve as the grouping key.
  const handleSaveInventory = async () => {
    if (!restaurantId) {
      alert("Оберіть ресторан для інвентаризації.");
      return;
    }

    if (filledLines.length === 0) {
      alert("Введіть хоча б одну кількість більше 0.");
      return;
    }

    const selectedRestaurant = restaurants.find((item) => String(item.id) === String(restaurantId));
    const restaurantName = selectedRestaurant?.name || "Невідомий ресторан";
    const restaurantRegNumber = String(selectedRestaurant?.regNumber || "");
    const totalItems = filledLines.reduce((sum, item) => sum + toNumber(item.qty), 0);
    const totalAmount = filledLines.reduce((sum, item) => sum + toNumber(item.amount), 0);
    const nowIso = new Date().toISOString();

    const payload = {
      restaurantId: String(restaurantId),
      restaurantName,
      restaurantRegNumber,
      inventoryDate: inventoryDate,
      stockTakingPlace: String(stockTakingPlace || "").trim(),
      stock_taking_place: String(stockTakingPlace || "").trim(),
      items: filledLines,
      totalItems,
      totalAmount,
      isMerged: false,
      createdBy: user?.displayName || user?.fullName || user?.email || "Користувач",
      createdById: user?.uid || "",
      inventorySessionEndedBy: user?.displayName || user?.fullName || user?.email || "Користувач",
      inventorySessionEndedById: user?.uid || "",
      inventorySessionEndedAt: nowIso,
    };

    const result = editingInventoryId
      ? await updateInventory(editingInventoryId, {
          ...payload,
          updatedBy: user?.displayName || user?.fullName || user?.email || "Користувач",
          updatedById: user?.uid || "",
          updatedAt: nowIso,
        })
      : await createInventory(payload);

    if (!result.success) {
      alert("Не вдалося зберегти інвентаризацію.");
      return;
    }

    if (result.id && !editingInventoryId) {
      setEditingInventoryId(String(result.id));
    }
    setInputValues({});
    // Do NOT clear quantities — user can keep adding to the same inventory.
    alert(editingInventoryId ? "Інвентаризацію оновлено." : "Інвентаризацію збережено.");
  };

  const handleRestoreInventory = async (inventory) => {
    const targetRestaurantId = String(inventory?.restaurantId || restaurantId || "");
    const restoredQuantities = buildRestoredQuantities(inventory, targetRestaurantId);
    const nextInventoryDate = String(
      inventory?.inventoryDate || new Date().toISOString().slice(0, 10)
    );

    if (String(targetRestaurantId || "") !== String(restaurantId || "")) {
      pendingRestoreRef.current = {
        restaurantId: targetRestaurantId,
        quantities: restoredQuantities,
        inventoryId: String(inventory?.id || ""),
        inventoryDate: nextInventoryDate,
        stockTakingPlace: String(inventory?.stockTakingPlace || inventory?.stock_taking_place || ""),
      };
      setRestaurantId(targetRestaurantId);
    } else {
      setQuantities(restoredQuantities);
      setInputValues({});
      setEditingInventoryId(String(inventory?.id || ""));
      setInventoryDate(nextInventoryDate);
      setStockTakingPlace(String(inventory?.stockTakingPlace || inventory?.stock_taking_place || ""));
    }
  };

  const handleDeleteInventory = async (inventory) => {
    if (!isGlobalAdmin) {
      alert("Видалення інвентаризації доступне лише адміністратору.");
      return;
    }

    const confirmed = window.confirm(
      `Видалити інвентаризацію за ${formatDateUk(inventory?.inventoryDate)} (${inventory?.restaurantName || "без закладу"})?\nЦю дію неможливо скасувати.`
    );
    if (!confirmed) return;

    const result = await deleteInventory(String(inventory?.id || ""));
    if (!result.success) {
      alert(getErrorMessage(result.error, "Не вдалося видалити інвентаризацію."));
      return;
    }

    if (String(editingInventoryId || "") === String(inventory?.id || "")) {
      setEditingInventoryId("");
      setQuantities({});
      setInputValues({});
    }
  };

  const [selectedInventoryIds, setSelectedInventoryIds] = useState(new Set());

  useEffect(() => {
    const allowedIds = new Set(mergeCandidates.map((item) => String(item.id)));
    setSelectedInventoryIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => allowedIds.has(String(id))));
      return next.size === prev.size ? prev : next;
    });
  }, [mergeCandidates]);

  const toggleInventorySelection = (id) => {
    setSelectedInventoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMergeInventories = async () => {
    const ids = Array.from(selectedInventoryIds);
    if (ids.length < 2) {
      alert("Оберіть щонайменше 2 інвентаризації для об'єднання.");
      return;
    }
    const selected = mergeCandidates.filter((inv) => ids.includes(inv.id));
    const restaurantIds = [...new Set(selected.map((inv) => String(inv.restaurantId || "")))].filter(Boolean);
    if (restaurantIds.length > 1) {
      alert("Можна об'єднати лише інвентаризації одного закладу.");
      return;
    }
    // Sum items by productId across selected inventories
    const totals = new Map();
    for (const inv of selected) {
      for (const item of (inv.items || [])) {
        const key = String(item.productId || item.code1C || item.productName || "");
        if (!key) continue;
        const existing = totals.get(key) || { ...item, qty: 0, amount: 0 };
        const qty = toNumber(existing.qty) + toNumber(item.qty);
        const unitPrice = toNumber(item.unitPrice) || toNumber(existing.unitPrice);
        totals.set(key, { ...existing, qty, amount: qty * unitPrice });
      }
    }
    const mergedItems = Array.from(totals.values());
    const firstInv = selected[0];
    const totalItems = mergedItems.reduce((s, i) => s + toNumber(i.qty), 0);
    const totalAmount = mergedItems.reduce((s, i) => s + toNumber(i.amount), 0);
    const payload = {
      restaurantId: String(firstInv.restaurantId || ""),
      restaurantName: firstInv.restaurantName || "",
      restaurantRegNumber: firstInv.restaurantRegNumber || "",
      inventoryDate: firstInv.inventoryDate,
      items: mergedItems,
      totalItems,
      totalAmount,
      isMerged: true,
      mergedFromIds: ids,
      createdBy: user?.displayName || user?.fullName || user?.email || "Користувач",
      createdById: user?.uid || "",
      inventorySessionEndedBy: user?.displayName || user?.fullName || user?.email || "Користувач",
      inventorySessionEndedById: user?.uid || "",
      inventorySessionEndedAt: new Date().toISOString(),
    };
    const confirmed = window.confirm(
      `Об'єднати ${ids.length} інвентаризації в одну (${mergedItems.length} позицій, сума ${formatMoney(totalAmount)})?\nСтарі записи будуть позначені як об'єднані.`
    );
    if (!confirmed) return;
    const result = await createInventory(payload);
    if (!result.success) {
      alert("Не вдалося створити об'єднану інвентаризацію.");
      return;
    }
    // Remove source documents so only the final merged document remains.
    for (const inv of selected) {
      await deleteInventory(String(inv.id || ""));
    }
    setSelectedInventoryIds(new Set());
    alert("Інвентаризації об'єднано.");
  };

  const handleCancelEditing = () => {
    setEditingInventoryId("");
    setQuantities({});
    setInputValues({});
    setInventoryDate(new Date().toISOString().slice(0, 10));
    setStockTakingPlace("");
    if (isGlobalAdmin) {
      setRestaurantId("");
    }
  };

  const handleExportSingleInventory = async (inventory) => {
    const safeDate = String(inventory?.inventoryDate || "inventory").replace(/[^0-9-]/g, "");
    const safeRestaurant = String(inventory?.restaurantName || "restaurant")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9а-яА-ЯіїєІЇЄґҐ_-]/g, "");
    const fileName = `inventory_${safeDate || "date"}_${safeRestaurant || "restaurant"}.xlsx`;
    const { exportInventoriesToExcel } = await loadProductInventoryExcel();
    exportInventoriesToExcel([inventory], fileName);
  };

  const handleExportSingleInventory1C = async (inventory) => {
    const safeDate = String(inventory?.inventoryDate || "inventory").replace(/[^0-9-]/g, "");
    const safeRestaurant = String(inventory?.restaurantName || inventory?.restaurantRegNumber || "restaurant")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9а-яА-ЯіїєІЇЄґҐ_-]/g, "");
    const fileName = `inventory_1c_${safeDate || "date"}_${safeRestaurant || "restaurant"}.xlsx`;
    const { exportInventoryTo1CExcel } = await loadProductInventoryExcel();
    exportInventoryTo1CExcel(inventory, fileName);
  };

  const handlePrintSingleInventory = (inventory) => {
    const printWindow = window.open("", "_blank", "width=980,height=760");
    if (!printWindow) {
      alert("Не вдалося відкрити вікно друку. Дозвольте pop-up у браузері.");
      return;
    }

    const escapeHtml = (value) => String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

    const rowsHtml = (inventory?.items || []).map((item, index) => {
      const qty = toNumber(item?.qty);
      const unitPrice = toNumber(item?.unitPrice);
      const amount = toNumber(item?.amount);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item?.productName || "-")}</td>
          <td>${escapeHtml(item?.code1C || "-")}</td>
          <td>${escapeHtml(item?.category || "-")}</td>
          <td>${qty.toFixed(2)}</td>
          <td>${escapeHtml(item?.unit || "-")}</td>
          <td>${unitPrice.toFixed(2)}</td>
          <td>${amount.toFixed(2)}</td>
          <td></td>
        </tr>
      `;
    }).join("");

    const html = `
<!doctype html>
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <title>Інвентаризація продуктів</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #0f172a;
        background: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      }
      .sheet {
        width: 100%;
      }
      .header {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 10px;
        font-size: 12px;
      }
      .title {
        font-size: 18px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
      }
      th, td {
        border: 1px solid #cbd5e1;
        padding: 4px 6px;
        vertical-align: top;
      }
      th {
        text-align: left;
        background: #f8fafc;
        font-weight: 700;
      }
      .summary {
        margin-top: 10px;
        display: flex;
        gap: 16px;
        font-size: 12px;
      }
      .signatures {
        margin-top: 18px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
        font-size: 12px;
      }
      .line {
        margin-top: 28px;
        border-bottom: 1px solid #334155;
      }
      .hint {
        margin-top: 8px;
        font-size: 11px;
        color: #475569;
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="title">Інвентаризація продуктів</div>
      <div class="header">
        <div><strong>Дата:</strong> ${escapeHtml(formatDateUk(inventory?.inventoryDate))}</div>
        <div><strong>Ресторан:</strong> ${escapeHtml(inventory?.restaurantName || "-")}</div>
        <div><strong>Хто створив:</strong> ${escapeHtml(inventory?.createdBy || "-")}</div>
        <div><strong>Хто завершив:</strong> ${escapeHtml(getInventoryEndedByLabel(inventory))}</div>
        <div><strong>К-сть позицій:</strong> ${Array.isArray(inventory?.items) ? inventory.items.length : 0}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 32px;">#</th>
            <th>Продукт</th>
            <th style="width: 90px;">Код 1С</th>
            <th>Категорія</th>
            <th style="width: 70px;">К-сть</th>
            <th style="width: 70px;">Од.</th>
            <th style="width: 90px;">Ціна</th>
            <th style="width: 100px;">Сума</th>
            <th style="width: 120px;">Ручна примітка</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="9">Немає позицій</td></tr>'}
        </tbody>
      </table>

      <div class="summary">
        <div><strong>Всього од.:</strong> ${toNumber(inventory?.totalItems).toFixed(2)}</div>
        <div><strong>Загальна сума:</strong> ${toNumber(inventory?.totalAmount).toFixed(2)} грн</div>
      </div>

      <div class="signatures">
        <div>
          <div>Відповідальний:</div>
          <div class="line"></div>
        </div>
        <div>
          <div>Перевірив:</div>
          <div class="line"></div>
        </div>
      </div>

      <div class="hint">Якщо друк не стартував — натисніть Ctrl/Cmd+P</div>
    </div>

    <script>
      setTimeout(() => {
        window.focus();
        window.print();
      }, 150);
    </script>
  </body>
</html>
`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="space-y-5">
      <div className={`${cardClass} pt-2 sm:pt-3 px-2 sm:px-5 pb-2 sm:pb-3`}>
        {/* ── Sticky top controls ── */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur pb-1 space-y-1.5">
          {isGlobalAdmin && (
            <select
              className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none"
              value={restaurantId}
              onChange={(e) => setRestaurantId(e.target.value)}
            >
              <option value="">Оберіть ресторан</option>
              {availableRestaurants.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
              ))}
            </select>
          )}

          {/* Search row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 pr-7 py-1 text-xs text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Пошук продукту…"
                list="inventory-product-suggestions"
                autoComplete="off"
              />
              {searchTerm && (
                <button
                  type="button"
                  className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:text-slate-700"
                  onClick={() => setSearchTerm("")}
                  aria-label="Очистити пошук"
                >
                  <X size={13} />
                </button>
              )}
              <datalist id="inventory-product-suggestions">
                {keywordSuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            {/* Date picker for this user's inventory */}
            <input
              type="date"
              className="h-8 shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none"
              value={inventoryDate}
              onChange={(e) => setInventoryDate(e.target.value)}
              title="Дата інвентаризації"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="shrink-0 text-[11px] font-semibold text-slate-600">Місце зняття залишків</label>
            <input
              type="text"
              className="h-8 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none"
              value={stockTakingPlace}
              onChange={(e) => setStockTakingPlace(e.target.value)}
              placeholder="Напр. Холодний процес"
            />
          </div>

          {/* Save row + status */}
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-slate-500 leading-tight">
              {editingInventoryId && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">Ред. режим</span>}
              {filledLines.length > 0 && <span className="ml-1">· {filledLines.length} поз.</span>}
            </div>
            <div className="flex items-center gap-1.5">
              {editingInventoryId && (
                <button
                  type="button"
                  onClick={handleCancelEditing}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Скасувати
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveInventory}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                {editingInventoryId ? "Оновити" : "Зберегти"}
              </button>
            </div>
          </div>
        </div>

        <div className="mb-0.5 grid grid-cols-[1fr_auto] items-center gap-2 px-1 py-0.5 leading-none text-[10px] font-semibold text-slate-700 sm:hidden">
          <div>Продукт</div>
          <div className="text-left">Кількість</div>
        </div>

        <div className="-mx-1 sm:mx-0 overflow-x-auto overflow-y-auto max-h-[52vh] sm:max-h-[60vh] rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="hidden sm:table-header-group bg-slate-50 text-slate-700">
              <tr>
                <th className="px-2 py-1 text-left">Продукт</th>
                  <th className="px-2 py-1 text-left">Код 1С</th>
                <th className="px-2 py-1 text-left">Категорія</th>
                <th className="px-2 py-1 text-left">Одиниця</th>
                <th className="px-2 py-1 text-left">Кількість</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const isInventoried = inventoriedProductIds.has(String(product?.id || ""));

                return (
                <tr
                  key={product.id}
                  className={`border-t border-slate-200 transition-colors ${activeRowProductId === product.id ? "bg-amber-100/70" : isInventoried ? "bg-emerald-100/80" : ""}`}
                >
                  <td
                    className="px-2 py-1 font-medium text-slate-900 text-[11px] sm:text-xs leading-tight whitespace-normal break-words cursor-pointer"
                    onClick={() => focusQuantityInput(product.id)}
                    title="Натисніть, щоб ввести кількість"
                  >
                    {product.name}
                  </td>
                  <td className="hidden sm:table-cell px-2 py-1 text-xs">{product.code1C || "-"}</td>
                  <td className="hidden sm:table-cell px-2 py-1 text-xs">{product.category || "-"}</td>
                  <td className="hidden sm:table-cell px-2 py-1 text-xs">{product.unit || "-"}</td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-2 justify-between">
                      <div className="flex flex-col items-start text-xs">
                        <span className="font-medium text-slate-900">
                          {toNumber(quantities[product.id]) || "—"}
                        </span>
                        {toNumber(quantities[product.id]) > 0 && (
                          <span className="text-emerald-700 font-semibold text-[10px]">✓</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => openCalcModal(product.id, product.name)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm transition hover:bg-indigo-100 hover:text-indigo-800"
                        title="Відкрити калькулятор"
                      >
                        <Calculator size={16} strokeWidth={2.2} />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    {restaurantId ? "За поточним пошуком продукти не знайдено." : "Спочатку оберіть заклад."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${cardClass} px-2 sm:px-5`}>
        <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-base font-semibold text-slate-900">Проведені інвентаризації</h3>
          {selectedInventoryIds.size >= 2 && (
            <button
              type="button"
              onClick={handleMergeInventories}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
            >
              Об'єднати вибрані ({selectedInventoryIds.size})
            </button>
          )}
        </div>
        <div className="-mx-1 sm:mx-0 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left"></th>
                <th className="px-3 py-2 text-left">Дата</th>
                <th className="px-3 py-2 text-left">Ресторан</th>
                <th className="px-3 py-2 text-left">Місце зняття залишків</th>
                <th className="px-3 py-2 text-left">Позицій</th>
                <th className="px-3 py-2 text-left">Сума</th>
                <th className="px-3 py-2 text-left">Хто завершив</th>
                <th className="px-3 py-2 text-left">Дії</th>
              </tr>
            </thead>
            <tbody>
              {mergeCandidates.map((inventory) => (
                <tr key={inventory.id} className={`border-t border-slate-200${selectedInventoryIds.has(inventory.id) ? " bg-violet-50" : ""}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-violet-600"
                      checked={selectedInventoryIds.has(inventory.id)}
                      onChange={() => toggleInventorySelection(inventory.id)}
                      aria-label={`Вибрати інвентаризацію від ${formatDateUk(inventory.inventoryDate)}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {formatDateUk(inventory.inventoryDate)}
                    {inventory.isMerged && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">Зведена</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{inventory.restaurantName || "-"}</td>
                  <td className="px-3 py-2">{inventory.stockTakingPlace || inventory.stock_taking_place || "-"}</td>
                  <td className="px-3 py-2">{Array.isArray(inventory.items) ? inventory.items.length : 0}</td>
                  <td className="px-3 py-2 font-medium">{formatMoney(inventory.totalAmount)}</td>
                  <td className="px-3 py-2">{getInventoryEndedByLabel(inventory)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleRestoreInventory(inventory)}
                        className="inline-flex items-center rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                      >
                        Повернути
                      </button>
                      {isGlobalAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            void handleDeleteInventory(inventory);
                          }}
                          className="inline-flex items-center rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          Видалити
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {mergeCandidates.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">Немає окремих інвентаризацій для об'єднання.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Calculator Modal */}
      {calcModal.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={closeCalcModal}
        >
          <div
            className="bg-white rounded-lg shadow-lg p-4 w-80 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">{calcModal.productName}</h3>
            <div className="bg-slate-100 rounded p-3 text-right text-2xl font-mono font-bold text-slate-900 break-words">
              {calcModal.expression}{calcModal.newNumber ? "" : calcModal.display}
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => calcInput(7)} className="bg-slate-200 hover:bg-slate-300 p-2 rounded font-bold">7</button>
              <button onClick={() => calcInput(8)} className="bg-slate-200 hover:bg-slate-300 p-2 rounded font-bold">8</button>
              <button onClick={() => calcInput(9)} className="bg-slate-200 hover:bg-slate-300 p-2 rounded font-bold">9</button>
              <button onClick={() => calcOperation("/")} className="bg-orange-200 hover:bg-orange-300 p-2 rounded font-bold">÷</button>
              
              <button onClick={() => calcInput(4)} className="bg-slate-200 hover:bg-slate-300 p-2 rounded font-bold">4</button>
              <button onClick={() => calcInput(5)} className="bg-slate-200 hover:bg-slate-300 p-2 rounded font-bold">5</button>
              <button onClick={() => calcInput(6)} className="bg-slate-200 hover:bg-slate-300 p-2 rounded font-bold">6</button>
              <button onClick={() => calcOperation("*")} className="bg-orange-200 hover:bg-orange-300 p-2 rounded font-bold">×</button>
              
              <button onClick={() => calcInput(1)} className="bg-slate-200 hover:bg-slate-300 p-2 rounded font-bold">1</button>
              <button onClick={() => calcInput(2)} className="bg-slate-200 hover:bg-slate-300 p-2 rounded font-bold">2</button>
              <button onClick={() => calcInput(3)} className="bg-slate-200 hover:bg-slate-300 p-2 rounded font-bold">3</button>
              <button onClick={() => calcOperation("-")} className="bg-orange-200 hover:bg-orange-300 p-2 rounded font-bold">−</button>
              
              <button onClick={() => calcInput(0)} className="bg-slate-200 hover:bg-slate-300 p-2 rounded font-bold col-span-2">0</button>
              <button onClick={calcDot} className="bg-slate-200 hover:bg-slate-300 p-2 rounded font-bold">.</button>
              <button onClick={() => calcOperation("+")} className="bg-orange-200 hover:bg-orange-300 p-2 rounded font-bold">+</button>
              
              <button onClick={calcEquals} className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded font-bold col-span-2">=</button>
              <button onClick={calcClear} className="bg-red-200 hover:bg-red-300 p-2 rounded font-bold col-span-2">C</button>
            </div>
            <div className="flex gap-2">
              <button onClick={closeCalcModal} className="flex-1 bg-slate-300 hover:bg-slate-400 p-2 rounded font-semibold">Скасувати</button>
              <button onClick={calcSave} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded font-semibold">OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InventoryListTab({ listProducts, restaurants, user, canManage, replaceInventoryListForRestaurant }) {
  const isGlobalAdmin = isGlobalAdminUser(user);
  const importInputRef = useRef(null);
  const importInputId = "inventory-list-import-input";
  const [restaurantId, setRestaurantId] = useState(isGlobalAdmin ? "" : String(user?.restaurant || ""));
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (isGlobalAdmin) return;
    setRestaurantId(String(user?.restaurant || ""));
  }, [user, isGlobalAdmin]);

  const availableRestaurants = useMemo(() => {
    if (isGlobalAdmin) return restaurants;
    return restaurants.filter((item) => String(item.id) === String(user?.restaurant));
  }, [restaurants, user, isGlobalAdmin]);

  const scopedList = useMemo(() => {
    const selectedRestaurantId = String(restaurantId || "");
    if (!selectedRestaurantId) return [];
    return listProducts.filter((item) => item.isActive !== false && sameRestaurant(item.restaurantId, selectedRestaurantId));
  }, [listProducts, restaurantId]);

  const filteredList = useMemo(() => {
    const normalizedSearch = String(searchTerm || "").trim().toLowerCase();
    if (!normalizedSearch) return scopedList;

    return scopedList.filter((item) =>
      [item.name, item.code1C, item.unit]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [scopedList, searchTerm]);

  const handleDownloadTemplate = async () => {
    const { downloadInventoryListTemplate } = await loadInventoryListExcel();
    downloadInventoryListTemplate();
  };

  const handleImportList = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!restaurantId) {
      alert("Перед імпортом оберіть заклад.");
      event.target.value = "";
      return;
    }

    const selectedRestaurant = restaurants.find((item) => String(item.id) === String(restaurantId));
    try {
      const { importInventoryListFromExcel } = await loadInventoryListExcel();
      const importedRows = await importInventoryListFromExcel(file, {
        id: restaurantId,
        name: String(selectedRestaurant?.name || ""),
        regNumber: String(selectedRestaurant?.regNumber || ""),
      });

      const uniqueRows = Array.from(
        new Map(
          importedRows.map((item) => {
            const key = `${String(item.code1C || "").trim().toLowerCase()}::${String(item.name || "").trim().toLowerCase()}`;
            return [key, item];
          })
        ).values()
      ).filter((item) => String(item.name || "").trim() || String(item.code1C || "").trim());

      if (uniqueRows.length === 0) {
        alert("У файлі не знайдено валідних рядків для списку інвентаризації.");
        return;
      }

      const result = await replaceInventoryListForRestaurant(restaurantId, uniqueRows);
      if (!result.success) {
        alert(getErrorMessage(result.error, "Не вдалося замінити список інвентаризації."));
        return;
      }

      alert(`Список інвентаризації оновлено. Завантажено: ${uniqueRows.length} позицій.`);
    } catch (error) {
      console.error("Помилка імпорту списку інвентаризації:", error);
      alert(getErrorMessage(error, "Не вдалося імпортувати список інвентаризації."));
    } finally {
      event.target.value = "";
    }
  };

  const handleClearList = async () => {
    if (!restaurantId) {
      alert("Оберіть заклад.");
      return;
    }

    const confirmed = window.confirm("Очистити поточний список інвентаризації для вибраного закладу?");
    if (!confirmed) return;

    const result = await replaceInventoryListForRestaurant(restaurantId, []);
    if (!result.success) {
      alert(getErrorMessage(result.error, "Не вдалося очистити список інвентаризації."));
      return;
    }

    alert("Список інвентаризації очищено.");
  };

  return (
    <div className={cardClass}>
      <div className="mb-4 flex items-center gap-2">
        <ClipboardCheck size={18} className="text-indigo-600" />
        <h2 className="text-lg font-semibold">Список інвентаризації</h2>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="text-sm font-semibold text-slate-800">Заклад</label>
          <select
            className={inputClass}
            value={restaurantId}
            onChange={(event) => setRestaurantId(event.target.value)}
            disabled={!isGlobalAdmin}
          >
            <option value="">Оберіть заклад</option>
            {availableRestaurants.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-semibold text-slate-800">Пошук у списку</label>
          <input
            className={inputClass}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Назва, код 1С, одиниця"
          />
        </div>
      </div>

      {canManage ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            id={importInputId}
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{
              position: "absolute",
              width: "1px",
              height: "1px",
              padding: 0,
              margin: "-1px",
              overflow: "hidden",
              clip: "rect(0, 0, 0, 0)",
              whiteSpace: "nowrap",
              border: 0,
            }}
            onChange={handleImportList}
          />
          <button
            type="button"
            onClick={() => {
              void handleDownloadTemplate();
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-600 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-500"
          >
            <FileDown size={15} /> Завантажити шаблон
          </button>
          <button
            type="button"
            onClick={() => {
              const input = importInputRef.current || document.getElementById(importInputId);
              if (input && typeof input.click === "function") {
                input.click();
              } else {
                alert("Не вдалося відкрити вибір файлу. Оновіть сторінку і спробуйте ще раз.");
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            <Upload size={15} /> Імпортувати та замінити список
          </button>
          <button
            type="button"
            onClick={handleClearList}
            className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
          >
            <Trash2 size={15} /> Очистити список
          </button>
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Лише адміністратор або відділ закупівель може завантажувати/очищати список.
        </div>
      )}

      <div className="mb-3 flex items-center justify-between text-xs font-semibold text-slate-600">
        <span>Позицій у списку: {filteredList.length} з {scopedList.length}</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left">Назва</th>
              <th className="px-3 py-2 text-left">Код 1С</th>
              <th className="px-3 py-2 text-left">Одиниця</th>
              <th className="px-3 py-2 text-left">Заклад</th>
            </tr>
          </thead>
          <tbody>
            {filteredList.map((item) => (
              <tr key={item.id} className="border-t border-slate-200">
                <td className="px-3 py-2 font-medium text-slate-900">{item.name || "-"}</td>
                <td className="px-3 py-2">{item.code1C || "-"}</td>
                <td className="px-3 py-2">{item.unit || "-"}</td>
                <td className="px-3 py-2">{item.restaurantName || "-"}</td>
              </tr>
            ))}
            {filteredList.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                  {restaurantId ? "Список для цього закладу порожній." : "Спочатку оберіть заклад."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InventoryJournalTab({ inventories, user, deleteInventory }) {
  const isGlobalAdmin = isGlobalAdminUser(user);
  const visibleInventories = useMemo(() => {
    const scoped = inventories.filter((item) => isInventoryVisibleForUserRestaurant(item, user, [], isGlobalAdmin));

    // Journal should contain only final merged inventory documents.
    return scoped.filter((item) => getMergedFromIds(item).length > 0);
  }, [inventories, user, isGlobalAdmin]);

  const handleExportSingleInventory = async (inventory) => {
    const safeDate = String(inventory?.inventoryDate || "inventory").replace(/[^0-9-]/g, "");
    const safeRestaurant = String(inventory?.restaurantName || "restaurant")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9а-яА-ЯіїєІЇЄґҐ_-]/g, "");
    const fileName = `inventory_${safeDate || "date"}_${safeRestaurant || "restaurant"}.xlsx`;
    const { exportInventoriesToExcel } = await loadProductInventoryExcel();
    exportInventoriesToExcel([inventory], fileName);
  };

  const handleExportSingleInventory1C = async (inventory) => {
    const safeDate = String(inventory?.inventoryDate || "inventory").replace(/[^0-9-]/g, "");
    const safeRestaurant = String(inventory?.restaurantName || inventory?.restaurantRegNumber || "restaurant")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9а-яА-ЯіїєІЇЄґҐ_-]/g, "");
    const fileName = `inventory_1c_${safeDate || "date"}_${safeRestaurant || "restaurant"}.xlsx`;
    const { exportInventoryTo1CExcel } = await loadProductInventoryExcel();
    exportInventoryTo1CExcel(inventory, fileName);
  };

  const handlePrintSingleInventory = (inventory) => {
    const printWindow = window.open("", "_blank", "width=980,height=760");
    if (!printWindow) {
      alert("Не вдалося відкрити вікно друку. Дозвольте pop-up у браузері.");
      return;
    }

    const escapeHtml = (value) => String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

    const rowsHtml = (inventory?.items || []).map((item, index) => {
      const qty = toNumber(item?.qty);
      const unitPrice = toNumber(item?.unitPrice);
      const amount = toNumber(item?.amount);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item?.productName || "-")}</td>
          <td>${escapeHtml(item?.code1C || "-")}</td>
          <td>${escapeHtml(item?.category || "-")}</td>
          <td>${qty.toFixed(2)}</td>
          <td>${escapeHtml(item?.unit || "-")}</td>
          <td>${unitPrice.toFixed(2)}</td>
          <td>${amount.toFixed(2)}</td>
          <td></td>
        </tr>
      `;
    }).join("");

    const html = `
<!doctype html>
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <title>Інвентаризація продуктів</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #0f172a;
        background: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      }
      .sheet { width: 100%; }
      .header { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; font-size: 12px; }
      .title { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #cbd5e1; padding: 4px 6px; vertical-align: top; }
      th { text-align: left; background: #f8fafc; font-weight: 700; }
      .summary { margin-top: 10px; display: flex; gap: 16px; font-size: 12px; }
      .signatures { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; font-size: 12px; }
      .line { margin-top: 28px; border-bottom: 1px solid #334155; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="title">Інвентаризація продуктів</div>
      <div class="header">
        <div><strong>Дата:</strong> ${escapeHtml(formatDateUk(inventory?.inventoryDate))}</div>
        <div><strong>Ресторан:</strong> ${escapeHtml(inventory?.restaurantName || "-")}</div>
        <div><strong>Хто створив:</strong> ${escapeHtml(inventory?.createdBy || "-")}</div>
        <div><strong>Хто завершив:</strong> ${escapeHtml(getInventoryEndedByLabel(inventory))}</div>
        <div><strong>К-сть позицій:</strong> ${Array.isArray(inventory?.items) ? inventory.items.length : 0}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 32px;">#</th>
            <th>Продукт</th>
            <th style="width: 90px;">Код 1С</th>
            <th>Категорія</th>
            <th style="width: 70px;">К-сть</th>
            <th style="width: 70px;">Од.</th>
            <th style="width: 90px;">Ціна</th>
            <th style="width: 100px;">Сума</th>
            <th style="width: 120px;">Ручна примітка</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="9">Немає позицій</td></tr>'}
        </tbody>
      </table>
      <div class="summary">
        <div><strong>Всього од.:</strong> ${toNumber(inventory?.totalItems).toFixed(2)}</div>
        <div><strong>Загальна сума:</strong> ${toNumber(inventory?.totalAmount).toFixed(2)} грн</div>
      </div>
      <div class="signatures">
        <div><div>Відповідальний:</div><div class="line"></div></div>
        <div><div>Перевірив:</div><div class="line"></div></div>
      </div>
    </div>
    <script>setTimeout(() => { window.focus(); window.print(); }, 150);</script>
  </body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleDeleteInventory = async (inventory) => {
    if (!isGlobalAdmin) {
      alert("Видалення інвентаризації доступне лише адміністратору.");
      return;
    }

    const confirmed = window.confirm(
      `Видалити інвентаризацію за ${formatDateUk(inventory?.inventoryDate)} (${inventory?.restaurantName || "без закладу"})?\nЦю дію неможливо скасувати.`
    );
    if (!confirmed) return;

    const result = await deleteInventory(String(inventory?.id || ""));
    if (!result.success) {
      alert(getErrorMessage(result.error, "Не вдалося видалити інвентаризацію."));
    }
  };

  return (
    <div className={`${cardClass} px-2 sm:px-5`}>
      <h3 className="mb-3 text-base font-semibold text-slate-900">Журнал інвентаризацій</h3>
      <div className="-mx-1 sm:mx-0 overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left">Дата</th>
              <th className="px-3 py-2 text-left">Ресторан</th>
              <th className="px-3 py-2 text-left">Позицій</th>
              <th className="px-3 py-2 text-left">Сума</th>
              <th className="px-3 py-2 text-left">Хто завершив</th>
              <th className="px-3 py-2 text-left">Дії</th>
            </tr>
          </thead>
          <tbody>
            {visibleInventories.map((inventory) => (
              <tr key={inventory.id} className="border-t border-slate-200">
                <td className="px-3 py-2">{formatDateUk(inventory.inventoryDate)}</td>
                <td className="px-3 py-2">{inventory.restaurantName || "-"}</td>
                <td className="px-3 py-2">{Array.isArray(inventory.items) ? inventory.items.length : 0}</td>
                <td className="px-3 py-2 font-medium">{formatMoney(inventory.totalAmount)}</td>
                <td className="px-3 py-2">{getInventoryEndedByLabel(inventory)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleExportSingleInventory(inventory)}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                    >
                      <Download size={14} /> Ексель
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportSingleInventory1C(inventory)}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      <Download size={14} /> Ексель 1С
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePrintSingleInventory(inventory)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Printer size={14} /> Друк
                    </button>
                    {isGlobalAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          void handleDeleteInventory(inventory);
                        }}
                        className="inline-flex items-center rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Видалити
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {visibleInventories.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">Зведених інвентаризацій поки немає.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SuppliersAdminTab({ suppliers, canManage, createSupplier, updateSupplier, removeSupplier }) {
  const [newSupplierName, setNewSupplierName] = useState("");
  const [legalEntityDrafts, setLegalEntityDrafts] = useState({});
  const [minimumOrderDrafts, setMinimumOrderDrafts] = useState({});
  const importInputRef = useRef(null);

  const getLegalEntities = (supplier) => {
    const fromArray = Array.isArray(supplier?.legalEntities) ? supplier.legalEntities : [];
    const fromSingle = String(supplier?.legalEntity || "").trim();
    const combined = [
      ...fromArray.map((item) => String(item || "").trim()).filter(Boolean),
      ...(fromSingle ? [fromSingle] : []),
    ];
    return Array.from(new Set(combined));
  };

  const updateSupplierLegalEntities = async (supplier, nextEntities) => {
    const normalized = Array.from(new Set((nextEntities || []).map((item) => String(item || "").trim()).filter(Boolean)));
    const { id, ...payload } = supplier;
    const result = await updateSupplier(id, {
      ...payload,
      legalEntities: normalized,
      legalEntity: "",
    });
    if (!result.success) {
      alert("Не вдалося оновити список юридичних осіб.");
      return false;
    }
    return true;
  };

  const addSupplier = async () => {
    const name = newSupplierName.trim();
    if (!name) return;
    const exists = suppliers.some((item) => String(item.name || "").trim().toLowerCase() === name.toLowerCase());
    if (exists) {
      alert("Такий постачальник вже існує.");
      return;
    }
    const result = await createSupplier({ name, isActive: true, legalEntities: [], minimumOrderAmount: 0 });
    if (!result.success) {
      alert(`Не вдалося додати постачальника: ${result?.error?.message || "невідома помилка"}`);
      return;
    }
    setNewSupplierName("");
  };

  const exportSuppliers = async () => {
    const { exportSuppliersToExcel } = await loadProductInventoryExcel();
    exportSuppliersToExcel(suppliers, `suppliers_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleImportSuppliers = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const { importSuppliersFromExcel } = await loadProductInventoryExcel();
      const imported = await importSuppliersFromExcel(file);

      if (imported.length === 0) {
        alert("Файл не містить валідних постачальників для імпорту.");
        return;
      }

      let created = 0;
      let updated = 0;
      let failed = 0;

      for (const candidate of imported) {
        try {
          const existing = suppliers.find(
            (item) => String(item?.name || "").trim().toLowerCase() === candidate.name.toLowerCase()
          );

          if (existing) {
            const mergedLegalEntities = Array.from(
              new Set([...getLegalEntities(existing), ...candidate.legalEntities])
            );
            const { id, ...payload } = existing;
            const result = await updateSupplier(id, {
              ...payload,
              isActive: candidate.isActive,
              minimumOrderAmount: toNumber(candidate.minimumOrderAmount || 0),
              legalEntities: mergedLegalEntities,
              legalEntity: "",
            });
            if (result.success) updated += 1;
            else failed += 1;
          } else {
            const result = await createSupplier({
              name: candidate.name,
              isActive: candidate.isActive,
              minimumOrderAmount: toNumber(candidate.minimumOrderAmount || 0),
              legalEntities: candidate.legalEntities,
            });
            if (result.success) created += 1;
            else failed += 1;
          }
        } catch {
          failed += 1;
        }
      }

      alert(`Імпорт завершено. Додано: ${created}. Оновлено: ${updated}. Помилок: ${failed}.`);
    } catch (error) {
      alert(`Не вдалося імпортувати файл: ${error?.message || "невідома помилка"}`);
    } finally {
      event.target.value = "";
    }
  };

  const addLegalEntity = async (supplier) => {
    const draftValue = String(legalEntityDrafts[supplier.id] || "").trim();
    if (!draftValue) return;

    const current = getLegalEntities(supplier);
    const exists = current.some((item) => item.toLowerCase() === draftValue.toLowerCase());
    if (exists) {
      alert("Така юридична особа вже додана.");
      return;
    }

    const updated = await updateSupplierLegalEntities(supplier, [...current, draftValue]);
    if (updated) {
      setLegalEntityDrafts((prev) => ({ ...prev, [supplier.id]: "" }));
    }
  };

  const removeLegalEntity = async (supplier, legalEntity) => {
    const current = getLegalEntities(supplier);
    const next = current.filter((item) => item !== legalEntity);
    await updateSupplierLegalEntities(supplier, next);
  };

  const toggleActive = async (item) => {
    const { id, ...payload } = item;
    const result = await updateSupplier(id, { ...payload, isActive: !item.isActive });
    if (!result.success) {
      alert("Не вдалося оновити статус постачальника.");
    }
  };

  const saveMinimumOrderAmount = async (supplier) => {
    const raw = Object.prototype.hasOwnProperty.call(minimumOrderDrafts, supplier.id)
      ? minimumOrderDrafts[supplier.id]
      : supplier.minimumOrderAmount;
    const nextValue = Math.max(0, toNumber(raw));
    const { id, ...payload } = supplier;
    const result = await updateSupplier(id, { ...payload, minimumOrderAmount: nextValue });
    if (!result.success) {
      alert("Не вдалося зберегти мінімальну суму замовлення.");
      return;
    }
    setMinimumOrderDrafts((prev) => ({ ...prev, [supplier.id]: String(nextValue) }));
  };

  return (
    <div className={cardClass}>
      <div className="flex items-center gap-2 mb-4">
        <Package size={18} className="text-indigo-600" />
        <h2 className="text-lg font-semibold">Постачальники</h2>
      </div>

      {canManage && (
        <div className="mb-4 flex flex-col gap-2 md:flex-row">
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            style={{ display: "none" }}
            onChange={handleImportSuppliers}
          />
          <input className={inputClass} value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} placeholder="Назва постачальника" />
          <button type="button" onClick={addSupplier} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
            Додати
          </button>
          <button type="button" onClick={exportSuppliers} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            Експорт
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            Імпорт
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left">Назва</th>
              <th className="px-3 py-2 text-left">Мін. сума замовлення</th>
              <th className="px-3 py-2 text-left">Юридичні особи</th>
              <th className="px-3 py-2 text-left">Статус</th>
              {canManage && <th className="px-3 py-2 text-left">Дії</th>}
            </tr>
          </thead>
          <tbody>
            {suppliers.map((item) => {
              const legalEntities = getLegalEntities(item);
              return (
              <tr key={item.id} className="border-t border-slate-200">
                <td className="px-3 py-2 font-medium text-slate-900">{item.name}</td>
                <td className="px-3 py-2">
                  {canManage ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        value={Object.prototype.hasOwnProperty.call(minimumOrderDrafts, item.id) ? minimumOrderDrafts[item.id] : String(toNumber(item.minimumOrderAmount || 0))}
                        onChange={(e) => setMinimumOrderDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        onBlur={() => saveMinimumOrderAmount(item)}
                      />
                      <span className="text-xs text-slate-500">грн</span>
                    </div>
                  ) : (
                    <span>{formatMoney(item.minimumOrderAmount || 0)}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {legalEntities.map((entity) => (
                      <span key={`${item.id}_${entity}`} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
                        {entity}
                        {canManage && (
                          <button
                            type="button"
                            className="font-semibold text-rose-600 hover:text-rose-500"
                            onClick={() => removeLegalEntity(item, entity)}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                    {legalEntities.length === 0 && <span className="text-xs text-slate-500">Не додано</span>}
                  </div>
                  {canManage && (
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <input
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                        value={legalEntityDrafts[item.id] || ""}
                        onChange={(e) => setLegalEntityDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        placeholder="Додати юрособу: ТОВ/ФОП..."
                      />
                      <button
                        type="button"
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        onClick={() => addLegalEntity(item)}
                      >
                        Додати юрособу
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">{item.isActive ? "Активний" : "Вимкнений"}</td>
                {canManage && (
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button type="button" className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-100" onClick={() => toggleActive(item)}>
                        {item.isActive ? "Вимкнути" : "Увімкнути"}
                      </button>
                      <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-500" onClick={() => removeSupplier(item.id)}>
                        <Trash2 size={14} /> Видалити
                      </button>
                    </div>
                  </td>
                )}
              </tr>
              );
            })}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={canManage ? 5 : 4} className="px-3 py-6 text-center text-slate-500">Постачальники ще не додані.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TypicalFieldsTab({ fields, canManage, createTypicalField, updateTypicalField, removeTypicalField }) {
  const [type, setType] = useState("category");
  const [name, setName] = useState("");
  const [subcategoryCategory, setSubcategoryCategory] = useState("");

  const availableCategories = useMemo(() => {
    return fields
      .filter((item) => item.type === "category" && item.isActive !== false)
      .map((item) => String(item.name || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "uk"));
  }, [fields]);

  const addField = async () => {
    const value = name.trim();
    if (!value) return;

    if (type === "subcategory" && !subcategoryCategory.trim()) {
      alert("Оберіть категорію для підкатегорії.");
      return;
    }

    const exists = fields.some(
      (item) => {
        const sameType = item.type === type;
        const sameName = String(item.name || "").trim().toLowerCase() === value.toLowerCase();
        if (!sameType || !sameName) return false;
        if (type !== "subcategory") return true;
        return String(item.categoryName || "").trim() === subcategoryCategory.trim();
      }
    );
    if (exists) {
      alert("Таке типове поле вже існує.");
      return;
    }
    const result = await createTypicalField({
      type,
      name: value,
      categoryName: type === "subcategory" ? subcategoryCategory.trim() : "",
      isActive: true,
    });
    if (!result.success) {
      alert(`Не вдалося додати типове поле: ${result?.error?.message || "невідома помилка"}`);
      return;
    }
    setName("");
    if (type === "subcategory") {
      setSubcategoryCategory("");
    }
  };

  const grouped = useMemo(() => {
    return {
      category: fields.filter((item) => item.type === "category"),
      subcategory: fields.filter((item) => item.type === "subcategory"),
      unit: fields.filter((item) => item.type === "unit"),
    };
  }, [fields]);

  const toggleActive = async (item) => {
    const { id, ...payload } = item;
    const result = await updateTypicalField(id, { ...payload, isActive: !item.isActive });
    if (!result.success) {
      alert("Не вдалося оновити типове поле.");
    }
  };

  return (
    <div className={cardClass}>
      <div className="flex items-center gap-2 mb-4">
        <Package size={18} className="text-indigo-600" />
        <h2 className="text-lg font-semibold">Типові поля</h2>
      </div>

      {canManage && (
        <div className="mb-4 flex flex-col gap-2 md:flex-row">
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="category">Категорія</option>
            <option value="subcategory">Підкатегорія</option>
            <option value="unit">Одиниця вимірювання</option>
          </select>
          {type === "subcategory" && (
            <select className={inputClass} value={subcategoryCategory} onChange={(e) => setSubcategoryCategory(e.target.value)}>
              <option value="">Оберіть категорію</option>
              {availableCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          )}
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Напр. Овочі або кг" />
          <button type="button" onClick={addField} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
            Додати
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[{ key: "category", label: "Категорії" }, { key: "subcategory", label: "Підкатегорії" }, { key: "unit", label: "Одиниці вимірювання" }].map((group) => (
          <div key={group.key} className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 font-semibold text-slate-900">{group.label}</p>
            <div className="space-y-2">
              {grouped[group.key].map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded border border-slate-200 px-2 py-1">
                  <span className="text-sm">
                    {item.name}
                    {item.type === "subcategory" && item.categoryName ? ` (${item.categoryName})` : ""}
                  </span>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <button type="button" className="rounded border border-slate-300 px-2 py-0.5 text-xs font-semibold" onClick={() => toggleActive(item)}>
                        {item.isActive ? "Вимкнути" : "Увімкнути"}
                      </button>
                      <button type="button" className="rounded border border-red-200 px-2 py-0.5 text-xs font-semibold text-red-700" onClick={() => removeTypicalField(item.id)}>
                        Видалити
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {grouped[group.key].length === 0 && <div className="text-sm text-slate-500">Поки порожньо.</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookingTab({ products, orders, createOrder, restaurants, user, suppliersDirectory = [] }) {
  const isGlobalAdmin = isGlobalAdminUser(user);
  const pageSizeOptions = [12, 25, 50];
  const [restaurantId, setRestaurantId] = useState(isGlobalAdmin ? "" : String(user?.restaurant || ""));
  const [requiredDate, setRequiredDate] = useState("");
  const [comment, setComment] = useState("");
  const [quantities, setQuantities] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(12);

  useEffect(() => {
    if (isGlobalAdmin) return;
    setRestaurantId(String(user?.restaurant || ""));
  }, [user, isGlobalAdmin]);

  const availableRestaurants = useMemo(() => {
    if (isGlobalAdmin) return restaurants;
    return restaurants.filter((r) => String(r.id) === String(user?.restaurant));
  }, [restaurants, user, isGlobalAdmin]);

  const myOrders = useMemo(() => {
    if (isGlobalAdmin) return orders;
    return orders.filter((order) => String(order.restaurantId) === String(user?.restaurant));
  }, [orders, user, isGlobalAdmin]);

  const activeProducts = useMemo(() => {
    const selectedRestaurantId = String(restaurantId || "");
    if (!selectedRestaurantId) return [];
    return products.filter((p) => p.isActive && sameRestaurant(p.restaurantId, selectedRestaurantId));
  }, [products, restaurantId]);

  const availableCategories = useMemo(() => {
    return Array.from(new Set(activeProducts.map((product) => product.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "uk"));
  }, [activeProducts]);

  const availableSuppliers = useMemo(() => {
    return Array.from(new Set(activeProducts.map((product) => product.supplier).filter(Boolean))).sort((a, b) => a.localeCompare(b, "uk"));
  }, [activeProducts]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return activeProducts.filter((product) => {
      const bySearch = normalizedSearch
        ? [product.name, product.category, product.supplier, product.unit]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch)
        : true;
      const byCategory = categoryFilter ? product.category === categoryFilter : true;
      const bySupplier = supplierFilter ? product.supplier === supplierFilter : true;
      const bySelected = showOnlySelected ? toNumber(quantities[product.id]) > 0 : true;
      return bySearch && byCategory && bySupplier && bySelected;
    });
  }, [activeProducts, searchTerm, categoryFilter, supplierFilter, showOnlySelected, quantities]);

  const keywordPool = useMemo(() => {
    return Array.from(
      new Set(
        activeProducts
          .flatMap((product) => [product.name, product.category, product.supplier, product.unit])
          .filter(Boolean)
      )
    );
  }, [activeProducts]);

  const keywordSuggestions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    return keywordPool
      .filter((keyword) => keyword.toLowerCase().includes(term))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(term) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(term) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.localeCompare(b, "uk");
      })
      .slice(0, 8);
  }, [keywordPool, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / rowsPerPage));

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredProducts.slice(start, start + rowsPerPage);
  }, [filteredProducts, currentPage, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, supplierFilter, showOnlySelected]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [rowsPerPage]);

  useEffect(() => {
    setQuantities({});
  }, [restaurantId]);

  const selectedItems = useMemo(() => {
    return activeProducts
      .map((product) => {
        const qty = toNumber(quantities[product.id]);
        if (qty <= 0) return null;
        const unitPrice = toNumber(product.unitPrice);
        return {
          id: product.id,
          name: product.name,
          code1C: product.code1C || "",
          category: product.category,
          supplier: product.supplier,
          unit: product.unit,
          qty,
          unitPrice,
          amount: qty * unitPrice,
        };
      })
      .filter(Boolean);
  }, [activeProducts, quantities]);

  const supplierMinimumMap = useMemo(() => {
    const map = new Map();
    (suppliersDirectory || []).forEach((supplier) => {
      const key = String(supplier?.name || "").trim().toLowerCase();
      if (!key) return;
      map.set(key, Math.max(0, toNumber(supplier?.minimumOrderAmount || 0)));
    });
    return map;
  }, [suppliersDirectory]);

  const supplierTotals = useMemo(() => {
    const totals = new Map();
    selectedItems.forEach((item) => {
      const supplierName = String(item?.supplier || "").trim();
      if (!supplierName) return;
      const current = totals.get(supplierName) || 0;
      totals.set(supplierName, current + toNumber(item.amount));
    });
    return Array.from(totals.entries()).map(([supplier, amount]) => ({
      supplier,
      amount,
      minimum: supplierMinimumMap.get(String(supplier).toLowerCase()) || 0,
    }));
  }, [selectedItems, supplierMinimumMap]);

  const minimumOrderWarnings = useMemo(() => {
    return supplierTotals.filter((item) => item.minimum > 0 && item.amount < item.minimum);
  }, [supplierTotals]);
  const hasMinimumOrderViolation = minimumOrderWarnings.length > 0;

  const draftTotalAmount = useMemo(() => {
    return activeProducts.reduce((sum, product) => {
      const qty = toNumber(quantities[product.id]);
      const unitPrice = toNumber(product.unitPrice);
      return sum + qty * unitPrice;
    }, 0);
  }, [activeProducts, quantities]);

  const handleSubmitOrder = async () => {
    const orderItems = activeProducts
      .map((product) => {
        const raw = quantities[product.id];
        const qty = Number(raw);
        if (!raw || Number.isNaN(qty) || qty <= 0) return null;
        return {
          productId: product.id,
          productName: product.name,
          code1C: product.code1C || "",
          category: product.category,
          unit: product.unit,
          qty,
          unitPrice: toNumber(product.unitPrice),
          amount: qty * toNumber(product.unitPrice),
          supplier: product.supplier || "",
        };
      })
      .filter(Boolean);

    if (!restaurantId || !requiredDate || orderItems.length === 0) {
      alert("Оберіть ресторан, дату поставки та введіть хоча б одну кількість.");
      return;
    }

    if (hasMinimumOrderViolation) {
      const details = minimumOrderWarnings
        .map((warning) => `${warning.supplier}: ${formatMoney(warning.amount)} з мінімуму ${formatMoney(warning.minimum)}`)
        .join("\n");
      alert(`Неможливо відправити заявку: не досягнуто мінімальної суми замовлення по постачальниках.\n\n${details}`);
      return;
    }

    const selectedRestaurant = restaurants.find((r) => String(r.id) === String(restaurantId));
    const restaurantName = selectedRestaurant?.name || "Невідомий ресторан";
    const restaurantRegNumber = String(selectedRestaurant?.regNumber || "");
    const totalItems = orderItems.reduce((sum, item) => sum + item.qty, 0);
    const totalAmount = orderItems.reduce((sum, item) => sum + toNumber(item.amount), 0);

    const newOrder = {
      createdBy: user?.displayName || user?.fullName || user?.email || "Користувач",
      createdById: user?.uid || "",
      restaurantId: String(restaurantId),
      restaurantName,
      restaurantRegNumber,
      requiredDate,
      comment: comment.trim(),
      status: "new",
      items: orderItems,
      totalItems,
      totalAmount,
    };

    const result = await createOrder(newOrder);
    if (!result.success) {
      alert("Не вдалося зберегти заявку в базу.");
      return;
    }
    setQuantities({});
    setComment("");
    alert("Замовлення сформовано та передано у відділ закупівель.");
  };

  return (
    <div className="space-y-5">
      <div className={cardClass}>
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart size={18} className="text-indigo-600" />
          <h2 className="text-lg font-semibold">Формування замовлення продукції</h2>
        </div>

        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-900">Реквізити заявки</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="text-sm font-semibold text-slate-800">Ресторан</label>
              <select
                className={inputClass}
                value={restaurantId}
                onChange={(e) => setRestaurantId(e.target.value)}
                disabled={!isGlobalAdmin}
              >
                <option value="">Оберіть ресторан</option>
                {availableRestaurants.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800">Потрібна дата поставки</label>
              <input type="date" className={inputClass} value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800">Коментар</label>
              <input className={inputClass} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Напр. терміново до обіду" />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label className="text-sm font-semibold text-slate-800">Пошук</label>
            <input
              className={inputClass}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Назва, категорія, постачальник, од. вим."
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Категорія</label>
            <select className={inputClass} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Всі категорії</option>
              {availableCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Постачальник</label>
            <select className={inputClass} value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
              <option value="">Всі постачальники</option>
              {availableSuppliers.map((supplier) => (
                <option key={supplier} value={supplier}>{supplier}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={showOnlySelected} onChange={(e) => setShowOnlySelected(e.target.checked)} />
              Лише вибрані
            </label>
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              onClick={() => {
                setSearchTerm("");
                setCategoryFilter("");
                setSupplierFilter("");
                setShowOnlySelected(false);
              }}
            >
              Скинути фільтри
            </button>
          </div>
        </div>

        {keywordSuggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Підказки:</span>
            {keywordSuggestions.map((keyword) => (
              <button
                key={keyword}
                type="button"
                className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                onClick={() => setSearchTerm(keyword)}
              >
                {keyword}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">Продукт</th>
                <th className="px-3 py-2 text-left">Категорія</th>
                <th className="px-3 py-2 text-left">Постачальник</th>
                <th className="px-3 py-2 text-left">Од. вим.</th>
                <th className="px-3 py-2 text-left">Ціна за од.</th>
                <th className="px-3 py-2 text-left">Кількість</th>
                <th className="px-3 py-2 text-left">Сума</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map((product) => (
                <tr key={product.id} className="border-t border-slate-200">
                  <td className="px-3 py-2 font-medium text-slate-900">{product.name}</td>
                  <td className="px-3 py-2">{product.category}</td>
                  <td className="px-3 py-2">{product.supplier || "-"}</td>
                  <td className="px-3 py-2">{product.unit || "-"}</td>
                  <td className="px-3 py-2">{formatMoney(product.unitPrice)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                        value={quantities[product.id] || ""}
                        onChange={(e) => setQuantities((p) => ({ ...p, [product.id]: e.target.value }))}
                      />
                      <span className="text-xs text-slate-500">{product.unit}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {formatMoney(toNumber(quantities[product.id]) * toNumber(product.unitPrice))}
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    {restaurantId ? "За поточними фільтрами продукти не знайдено." : "Спочатку оберіть заклад."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredProducts.length > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 text-sm text-slate-700">
            <span>
              Показано {(currentPage - 1) * rowsPerPage + 1}-{Math.min(currentPage * rowsPerPage, filteredProducts.length)} з {filteredProducts.length}
            </span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                На сторінку
                <select
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  value={rowsPerPage}
                  onChange={(e) => setRowsPerPage(Number(e.target.value))}
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              >
                Назад
              </button>
              <span className="text-xs text-slate-600">Сторінка {currentPage} / {totalPages}</span>
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Вперед
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">Моє замовлення перед відправкою</p>
            <p className="text-xs text-slate-600">Позицій: {selectedItems.length}</p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-2 py-2 text-left">Продукт</th>
                  <th className="px-2 py-2 text-left">Од. вим.</th>
                  <th className="px-2 py-2 text-left">Ціна</th>
                  <th className="px-2 py-2 text-left">К-сть</th>
                  <th className="px-2 py-2 text-left">Сума</th>
                  <th className="px-2 py-2 text-left">Дія</th>
                </tr>
              </thead>
              <tbody>
                {selectedItems.map((item) => (
                  <tr key={item.id} className="border-t border-slate-200">
                    <td className="px-2 py-2 font-medium text-slate-900">{item.name}</td>
                    <td className="px-2 py-2">{item.unit || "-"}</td>
                    <td className="px-2 py-2">{formatMoney(item.unitPrice)}</td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                        value={quantities[item.id] || ""}
                        onChange={(e) => setQuantities((p) => ({ ...p, [item.id]: e.target.value }))}
                      />
                    </td>
                    <td className="px-2 py-2 font-semibold text-slate-900">{formatMoney(item.amount)}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                        onClick={() => setQuantities((p) => ({ ...p, [item.id]: "" }))}
                      >
                        <Trash2 size={13} /> Прибрати
                      </button>
                    </td>
                  </tr>
                ))}
                {selectedItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-2 py-5 text-center text-slate-500">Ще не обрано жодної позиції.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {minimumOrderWarnings.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Увага: мінімальна сума замовлення не виконана</p>
            <ul className="mt-1 list-disc pl-5">
              {minimumOrderWarnings.map((warning) => (
                <li key={warning.supplier}>
                  {warning.supplier}: {formatMoney(warning.amount)} з мінімуму {formatMoney(warning.minimum)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3 flex justify-end text-sm font-semibold text-slate-800">
          Загальна сума заявки: {formatMoney(draftTotalAmount)}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleSubmitOrder}
            disabled={hasMinimumOrderViolation}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
          >
            Сформувати заявку
          </button>
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="text-base font-semibold text-slate-900 mb-3">Мої заявки</h3>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">Дата</th>
                <th className="px-3 py-2 text-left">Ресторан</th>
                <th className="px-3 py-2 text-left">Позицій</th>
                <th className="px-3 py-2 text-left">Поставка</th>
                <th className="px-3 py-2 text-left">Сума</th>
                <th className="px-3 py-2 text-left">Статус</th>
              </tr>
            </thead>
            <tbody>
              {myOrders.map((order) => (
                <tr key={order.id} className="border-t border-slate-200">
                  <td className="px-3 py-2">{new Date(order.createdAt).toLocaleString("uk-UA")}</td>
                  <td className="px-3 py-2">{order.restaurantName}</td>
                  <td className="px-3 py-2">{order.items.length}</td>
                  <td className="px-3 py-2">{order.requiredDate}</td>
                  <td className="px-3 py-2 font-medium">{formatMoney(order.totalAmount)}</td>
                  <td className="px-3 py-2">{statusLabel(order.status)}</td>
                </tr>
              ))}
              {myOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">Заявок поки немає.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const statusLabel = (status) => {
  if (status === "new") return "Нова";
  if (status === "processing") return "В обробці";
  if (status === "sent") return "Надіслано постачальнику";
  if (status === "completed") return "Закрито";
  return status;
};

function OrdersManagementTab({ orders, updateOrder, createSupplierDispatch, canManageOrders, user }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [deliveryDateFrom, setDeliveryDateFrom] = useState("");
  const [deliveryDateTo, setDeliveryDateTo] = useState("");
  const [lineEdits, setLineEdits] = useState({});
  const [sendingSupplier, setSendingSupplier] = useState("");
  const [expandedSuppliers, setExpandedSuppliers] = useState({});
  const [expandedSummarySuppliers, setExpandedSummarySuppliers] = useState({});
  const [expandedRestaurants, setExpandedRestaurants] = useState({});

  const visibleOrders = useMemo(() => {
    const filteredByRole = canManageOrders
      ? orders
      : orders.filter((order) => String(order.restaurantId) === String(user?.restaurant || ""));

    return filteredByRole.filter((order) => {
      const byStatus = statusFilter ? order.status === statusFilter : true;

      const orderDate = String(order.createdAt || "").slice(0, 10);
      const byOrderDateFrom = orderDateFrom ? orderDate && orderDate >= orderDateFrom : true;
      const byOrderDateTo = orderDateTo ? orderDate && orderDate <= orderDateTo : true;

      const deliveryDate = String(order.requiredDate || "");
      const byDeliveryFrom = deliveryDateFrom ? deliveryDate && deliveryDate >= deliveryDateFrom : true;
      const byDeliveryTo = deliveryDateTo ? deliveryDate && deliveryDate <= deliveryDateTo : true;

      return byStatus && byOrderDateFrom && byOrderDateTo && byDeliveryFrom && byDeliveryTo;
    });
  }, [
    orders,
    statusFilter,
    canManageOrders,
    user,
    orderDateFrom,
    orderDateTo,
    deliveryDateFrom,
    deliveryDateTo,
  ]);

  const groupedBySupplier = useMemo(() => {
    const map = {};
    for (const order of visibleOrders) {
      for (const item of order.items || []) {
        const supplier = item.supplier || "Без постачальника";
        if (!map[supplier]) map[supplier] = [];
        map[supplier].push({
          orderId: order.id,
          restaurantName: order.restaurantName,
          requiredDate: order.requiredDate,
          productName: item.productName,
          qty: item.qty,
          unit: item.unit,
          unitPrice: toNumber(item.unitPrice),
          amount: toNumber(item.amount),
        });
      }
    }
    return map;
  }, [visibleOrders]);

  const consolidatedBySupplier = useMemo(() => {
    const supplierMap = {};

    for (const order of visibleOrders) {
      for (const item of order.items || []) {
        if (item.sentToSupplier || order.status === "completed") continue;

        const supplier = item.supplier || "Без постачальника";
        if (!supplierMap[supplier]) supplierMap[supplier] = {};

        const productKey = item.productId || item.productName || "Без назви";
        const key = [productKey, item.unit || "", order.requiredDate || ""].join("|");

        if (!supplierMap[supplier][key]) {
          supplierMap[supplier][key] = {
            supplier,
            productId: item.productId || "",
            productName: item.productName || "Без назви",
            unit: item.unit || "",
            requiredDate: order.requiredDate || "",
            totalQty: 0,
            totalAmount: 0,
            restaurants: [],
            orderIds: new Set(),
          };
        }

        const lineKey = `${order.id}::${item.productId || item.productName || "line"}`;
        const editedQty = lineEdits[lineKey];
        const effectiveQty = editedQty === undefined ? toNumber(item.qty) : toNumber(editedQty);
        const effectiveAmount = effectiveQty * toNumber(item.unitPrice);

        supplierMap[supplier][key].totalQty += effectiveQty;
        supplierMap[supplier][key].totalAmount += effectiveAmount;
        supplierMap[supplier][key].restaurants.push({
          lineKey,
          restaurantId: order.restaurantId,
          restaurantName: order.restaurantName,
          qty: effectiveQty,
          requiredDate: order.requiredDate,
          orderId: order.id,
          productId: item.productId || "",
          productName: item.productName || "Без назви",
          unit: item.unit || "",
          unitPrice: toNumber(item.unitPrice),
        });
        supplierMap[supplier][key].orderIds.add(order.id);
      }
    }

    return Object.fromEntries(
      Object.entries(supplierMap).map(([supplier, keyed]) => [
        supplier,
        Object.values(keyed).map((row) => ({
          ...row,
          orderIds: Array.from(row.orderIds),
        })),
      ])
    );
  }, [visibleOrders, lineEdits]);

  const dispatchableSuppliers = useMemo(() => Object.keys(consolidatedBySupplier), [consolidatedBySupplier]);

  const isSupplierExpanded = (supplier) => {
    if (expandedSuppliers[supplier] === undefined) return false;
    return expandedSuppliers[supplier];
  };

  const toggleSupplierExpanded = (supplier) => {
    setExpandedSuppliers((prev) => ({
      ...prev,
      [supplier]: !(prev[supplier] === undefined ? false : prev[supplier]),
    }));
  };

  const dispatchableOrdersCount = useMemo(() => {
    const ids = new Set();
    Object.values(consolidatedBySupplier).forEach((rows) => {
      rows.forEach((row) => row.orderIds.forEach((id) => ids.add(id)));
    });
    return ids.size;
  }, [consolidatedBySupplier]);

  const overallSuppliersAmount = useMemo(() => {
    return Object.values(groupedBySupplier)
      .flat()
      .reduce((sum, item) => sum + toNumber(item.amount), 0);
  }, [groupedBySupplier]);

  const groupedByRestaurant = useMemo(() => {
    const map = {};

    for (const order of visibleOrders) {
      const restaurant = order.restaurantName || "Невідомий ресторан";
      if (!map[restaurant]) map[restaurant] = [];

      for (const item of order.items || []) {
        map[restaurant].push({
          orderId: order.id,
          supplier: item.supplier || "Без постачальника",
          productName: item.productName || "Без назви",
          qty: toNumber(item.qty),
          unit: item.unit || "",
          unitPrice: toNumber(item.unitPrice),
          amount: toNumber(item.amount),
          requiredDate: order.requiredDate || "",
        });
      }
    }

    return map;
  }, [visibleOrders]);

  const isRestaurantExpanded = (restaurant) => {
    if (expandedRestaurants[restaurant] === undefined) return false;
    return expandedRestaurants[restaurant];
  };

  const toggleRestaurantExpanded = (restaurant) => {
    setExpandedRestaurants((prev) => ({
      ...prev,
      [restaurant]: !(prev[restaurant] === undefined ? false : prev[restaurant]),
    }));
  };

  const isSummarySupplierExpanded = (supplier) => {
    if (expandedSummarySuppliers[supplier] === undefined) return false;
    return expandedSummarySuppliers[supplier];
  };

  const toggleSummarySupplierExpanded = (supplier) => {
    setExpandedSummarySuppliers((prev) => ({
      ...prev,
      [supplier]: !(prev[supplier] === undefined ? false : prev[supplier]),
    }));
  };

  const deriveOrderStatus = (items, currentStatus) => {
    if (currentStatus === "completed") return "completed";
    const hasItems = items.length > 0;
    const hasUnsent = items.some((item) => !item.sentToSupplier);
    const hasSent = items.some((item) => item.sentToSupplier);

    if (!hasItems) return "new";
    if (!hasUnsent) return "sent";
    if (hasSent && hasUnsent) return "processing";
    return "new";
  };

  const updateStatus = async (order, status) => {
    const { id, ...payload } = order;
    const result = await updateOrder(id, { ...payload, status });
    if (!result.success) {
      alert("Не вдалося оновити статус заявки.");
    }
  };

  const applyLineCorrection = async (entry) => {
    if (!canManageOrders) return;

    const editedQty = lineEdits[entry.lineKey];
    if (editedQty === undefined) return;

    const qty = toNumber(editedQty);
    if (qty <= 0) {
      alert("Кількість має бути більше 0.");
      return;
    }

    const order = orders.find((item) => item.id === entry.orderId);
    if (!order) {
      alert("Не вдалося знайти заявку для коригування.");
      return;
    }

    const updatedItems = (order.items || []).map((item) => {
      const sameProduct = (item.productId || item.productName) === (entry.productId || entry.productName);
      if (!sameProduct) return item;
      return {
        ...item,
        qty,
        amount: qty * toNumber(item.unitPrice),
        sentToSupplier: false,
      };
    });

    const totalItems = updatedItems.reduce((sum, item) => sum + toNumber(item.qty), 0);
    const totalAmount = updatedItems.reduce((sum, item) => sum + toNumber(item.amount), 0);
    const { id, ...payload } = order;

    const result = await updateOrder(id, {
      ...payload,
      items: updatedItems,
      totalItems,
      totalAmount,
      status: deriveOrderStatus(updatedItems, order.status),
      correctedAt: new Date().toISOString(),
    });

    if (!result.success) {
      alert("Не вдалося зберегти коригування.");
      return;
    }

    setLineEdits((prev) => {
      const next = { ...prev };
      delete next[entry.lineKey];
      return next;
    });
  };

  const sendToSpecificSuppliers = async (suppliersToSend) => {
    if (!canManageOrders) return;

    const normalizedSuppliers = suppliersToSend.filter((supplier) => consolidatedBySupplier[supplier]?.length > 0);
    if (normalizedSuppliers.length === 0) {
      alert("Немає нових даних для відправки.");
      return;
    }

    const dispatchBatchId = `dispatch_${Date.now()}`;
    const managerName = user?.displayName || user?.fullName || user?.email || "Закупівлі";
    const managerId = user?.uid || "";
    const now = new Date().toISOString();

    try {
      const ordersMap = new Map(orders.map((order) => [order.id, { ...order, items: [...(order.items || [])] }]));
      const patchedOrders = new Map();

      for (const supplier of normalizedSuppliers) {
        const rows = consolidatedBySupplier[supplier] || [];
        const dispatchPayload = {
          supplier,
          dispatchBatchId,
          status: "sent",
          sentBy: managerName,
          sentById: managerId,
          orderIds: Array.from(new Set(rows.flatMap((row) => row.orderIds))),
          lines: rows.map((row) => ({
            productName: row.productName,
            unit: row.unit,
            requiredDate: row.requiredDate,
            totalQty: row.totalQty,
            totalAmount: row.totalAmount,
            restaurants: row.restaurants,
          })),
        };

        const dispatchResult = await createSupplierDispatch(dispatchPayload);
        if (!dispatchResult.success) {
          throw dispatchResult.error || new Error("Не вдалося створити відправку постачальнику");
        }

        const affectedOrderIds = dispatchPayload.orderIds;
        for (const orderId of affectedOrderIds) {
          const workingOrder = patchedOrders.get(orderId) || ordersMap.get(orderId);
          if (!workingOrder) continue;

          const nextItems = (workingOrder.items || []).map((item) => {
            const itemSupplier = item.supplier || "Без постачальника";
            if (itemSupplier !== supplier || item.sentToSupplier) return item;
            return {
              ...item,
              sentToSupplier: true,
              sentAt: now,
            };
          });

          const totalItems = nextItems.reduce((sum, item) => sum + toNumber(item.qty), 0);
          const totalAmount = nextItems.reduce((sum, item) => sum + toNumber(item.amount), 0);

          patchedOrders.set(orderId, {
            ...workingOrder,
            items: nextItems,
            totalItems,
            totalAmount,
            status: deriveOrderStatus(nextItems, workingOrder.status),
            dispatchBatchId,
            sentBy: managerName,
            sentById: managerId,
            sentAt: now,
          });
        }
      }

      for (const [orderId, payload] of patchedOrders.entries()) {
        const { id, ...orderData } = payload;
        const updateResult = await updateOrder(orderId, orderData);
        if (!updateResult.success) {
          throw updateResult.error || new Error(`Не вдалося оновити заявку ${orderId}`);
        }
      }

      alert(`Відправлено постачальникам: ${normalizedSuppliers.length}. Оновлено заявок: ${patchedOrders.size}.`);
    } catch (error) {
      console.error("Помилка відправки постачальникам:", error);
      alert(`Не вдалося відправити постачальникам: ${error?.message || "невідома помилка"}`);
    } finally {
      setSendingSupplier("");
    }
  };

  const sendAllSuppliers = async () => {
    setSendingSupplier("ALL");
    await sendToSpecificSuppliers(dispatchableSuppliers);
  };

  const sendOneSupplier = async (supplier) => {
    setSendingSupplier(supplier);
    await sendToSpecificSuppliers([supplier]);
  };

  return (
    <div className="space-y-5">
      <div className={cardClass}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} className="text-indigo-600" />
            <h2 className="text-lg font-semibold">Управління замовленнями</h2>
          </div>
          <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Всі статуси</option>
            <option value="new">Нові</option>
            <option value="processing">В обробці</option>
            <option value="sent">Надіслані постачальнику</option>
            <option value="completed">Закриті</option>
          </select>
        </div>

        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-900">Фільтр по датах</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="text-xs font-semibold text-slate-700">Замовлення від</label>
              <input type="date" className={inputClass} value={orderDateFrom} onChange={(e) => setOrderDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Замовлення до</label>
              <input type="date" className={inputClass} value={orderDateTo} onChange={(e) => setOrderDateTo(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Поставка від</label>
              <input type="date" className={inputClass} value={deliveryDateFrom} onChange={(e) => setDeliveryDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Поставка до</label>
              <input type="date" className={inputClass} value={deliveryDateTo} onChange={(e) => setDeliveryDateTo(e.target.value)} />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  setOrderDateFrom("");
                  setOrderDateTo("");
                  setDeliveryDateFrom("");
                  setDeliveryDateTo("");
                }}
              >
                Скинути дати
              </button>
            </div>
          </div>
        </div>

        {canManageOrders && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
            <p className="text-sm font-semibold text-indigo-900">
              Готово до відправки: {dispatchableOrdersCount} заявок / {dispatchableSuppliers.length} постачальників
            </p>
            <button
              type="button"
              onClick={sendAllSuppliers}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={dispatchableSuppliers.length === 0 || sendingSupplier === "ALL"}
            >
              {sendingSupplier === "ALL" ? "Відправлення..." : "Відправити всім постачальникам"}
            </button>
          </div>
        )}

        {!canManageOrders && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Для повного управління заявками потрібна роль адміністратора/закупівель.
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">Створено</th>
                <th className="px-3 py-2 text-left">Ресторан</th>
                <th className="px-3 py-2 text-left">Поставка</th>
                <th className="px-3 py-2 text-left">Позицій</th>
                <th className="px-3 py-2 text-left">Одиниці</th>
                <th className="px-3 py-2 text-left">Сума</th>
                <th className="px-3 py-2 text-left">Статус</th>
                {canManageOrders && <th className="px-3 py-2 text-left">Дія</th>}
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => (
                <tr key={order.id} className="border-t border-slate-200 align-top">
                  <td className="px-3 py-2">{new Date(order.createdAt).toLocaleString("uk-UA")}</td>
                  <td className="px-3 py-2">{order.restaurantName}</td>
                  <td className="px-3 py-2">{order.requiredDate}</td>
                  <td className="px-3 py-2">{order.items.length}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{Array.from(new Set((order.items || []).map((item) => item.unit).filter(Boolean))).join(", ") || "-"}</td>
                  <td className="px-3 py-2 font-medium">{formatMoney(order.totalAmount)}</td>
                  <td className="px-3 py-2">{statusLabel(order.status)}</td>
                  {canManageOrders && (
                    <td className="px-3 py-2">
                      <select
                        className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        value={order.status}
                        onChange={(e) => updateStatus(order, e.target.value)}
                      >
                        <option value="new">Нова</option>
                        <option value="processing">В обробці</option>
                        <option value="sent">Надіслано постачальнику</option>
                        <option value="completed">Закрито</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))}
              {visibleOrders.length === 0 && (
                <tr>
                  <td colSpan={canManageOrders ? 8 : 7} className="px-3 py-6 text-center text-slate-500">Заявок не знайдено.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="text-base font-semibold text-slate-900 mb-3">Зведення по ресторанах</h3>
        <div className="space-y-3">
          {Object.entries(groupedByRestaurant).map(([restaurant, items]) => (
            <div key={`restaurant_${restaurant}`} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleRestaurantExpanded(restaurant)}
                  className="flex flex-1 items-start gap-3 text-left"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-700">
                    {isRestaurantExpanded(restaurant) ? "−" : "+"}
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{restaurant}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">Рядків: {items.length}</span>
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">
                        Постачальників: {new Set(items.map((item) => item.supplier)).size}
                      </span>
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">
                        Разом: {items.reduce((sum, item) => sum + toNumber(item.qty), 0).toFixed(2)}
                      </span>
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">
                        Сума: {formatMoney(items.reduce((sum, item) => sum + toNumber(item.amount), 0))}
                      </span>
                    </div>
                  </div>
                </button>
              </div>
              {isRestaurantExpanded(restaurant) && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-slate-600">
                      <tr>
                        <th className="px-2 py-1 text-left">Постачальник</th>
                        <th className="px-2 py-1 text-left">Продукт</th>
                        <th className="px-2 py-1 text-left">Ціна</th>
                        <th className="px-2 py-1 text-left">К-сть</th>
                        <th className="px-2 py-1 text-left">Сума</th>
                        <th className="px-2 py-1 text-left">Поставка</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => (
                        <tr key={`${restaurant}_${item.orderId}_${index}`} className="border-t border-slate-100">
                          <td className="px-2 py-1">{item.supplier}</td>
                          <td className="px-2 py-1">{item.productName}</td>
                          <td className="px-2 py-1">{formatMoney(item.unitPrice)}</td>
                          <td className="px-2 py-1">{item.qty} {item.unit}</td>
                          <td className="px-2 py-1 font-medium">{formatMoney(item.amount)}</td>
                          <td className="px-2 py-1">{item.requiredDate || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {Object.keys(groupedByRestaurant).length === 0 && (
            <div className="text-sm text-slate-500">Немає даних для зведення по ресторанах.</div>
          )}
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="text-base font-semibold text-slate-900 mb-3">Зведення для постачальників</h3>
        <div className="space-y-3">
          {Object.entries(groupedBySupplier).map(([supplier, items]) => (
            <div key={supplier} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleSummarySupplierExpanded(supplier)}
                  className="flex flex-1 items-start gap-3 text-left"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-700">
                    {isSummarySupplierExpanded(supplier) ? "−" : "+"}
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{supplier}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">Рядків: {items.length}</span>
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">
                        Ресторанів: {new Set(items.map((item) => item.restaurantName)).size}
                      </span>
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">
                        Разом: {items.reduce((sum, item) => sum + toNumber(item.qty), 0).toFixed(2)}
                      </span>
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">
                        Сума: {formatMoney(items.reduce((sum, item) => sum + toNumber(item.amount), 0))}
                      </span>
                    </div>
                  </div>
                </button>
              </div>
              {isSummarySupplierExpanded(supplier) && (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="text-slate-600">
                        <tr>
                          <th className="px-2 py-1 text-left">Ресторан</th>
                          <th className="px-2 py-1 text-left">Продукт</th>
                          <th className="px-2 py-1 text-left">Ціна</th>
                          <th className="px-2 py-1 text-left">К-сть</th>
                          <th className="px-2 py-1 text-left">Сума</th>
                          <th className="px-2 py-1 text-left">Поставка</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, index) => (
                          <tr key={`${item.orderId}_${index}`} className="border-t border-slate-100">
                            <td className="px-2 py-1">{item.restaurantName}</td>
                            <td className="px-2 py-1">{item.productName}</td>
                            <td className="px-2 py-1">{formatMoney(item.unitPrice)}</td>
                            <td className="px-2 py-1">{item.qty} {item.unit}</td>
                            <td className="px-2 py-1 font-medium">{formatMoney(item.amount)}</td>
                            <td className="px-2 py-1">{item.requiredDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-right text-sm font-semibold text-slate-800">
                    Разом по постачальнику: {formatMoney(items.reduce((sum, item) => sum + toNumber(item.amount), 0))}
                  </p>
                </>
              )}
            </div>
          ))}
          {Object.keys(groupedBySupplier).length === 0 && (
            <div className="text-sm text-slate-500">Немає даних для формування замовлення постачальникам.</div>
          )}
          {Object.keys(groupedBySupplier).length > 0 && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-right text-base font-semibold text-indigo-900">
              Разом по всіх постачальниках: {formatMoney(overallSuppliersAmount)}
            </div>
          )}
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="text-base font-semibold text-slate-900 mb-3">Консолідоване замовлення (по ресторанах)</h3>
        <div className="space-y-3">
          {Object.entries(consolidatedBySupplier).map(([supplier, rows]) => (
            <div key={`consolidated_${supplier}`} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleSupplierExpanded(supplier)}
                  className="flex flex-1 items-start gap-3 text-left"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-700">
                    {isSupplierExpanded(supplier) ? "−" : "+"}
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{supplier}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">Позицій: {rows.length}</span>
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">
                        Ресторанів: {new Set(rows.flatMap((row) => row.restaurants.map((r) => r.restaurantName))).size}
                      </span>
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">
                        Разом: {rows.reduce((sum, row) => sum + toNumber(row.totalQty), 0).toFixed(2)}
                      </span>
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">
                        Сума: {formatMoney(rows.reduce((sum, row) => sum + toNumber(row.totalAmount), 0))}
                      </span>
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-2 pt-0.5">
                  {canManageOrders && (
                    <button
                      type="button"
                      onClick={() => sendOneSupplier(supplier)}
                      className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={rows.length === 0 || sendingSupplier === supplier || sendingSupplier === "ALL"}
                    >
                      {sendingSupplier === supplier ? "Відправлення..." : "Відправити цьому постачальнику"}
                    </button>
                  )}
                </div>
              </div>
              {isSupplierExpanded(supplier) && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        <th className="px-2 py-1 text-left">Продукт</th>
                        <th className="px-2 py-1 text-left">Дата</th>
                        <th className="px-2 py-1 text-left">Разом</th>
                        <th className="px-2 py-1 text-left">Сума</th>
                        <th className="px-2 py-1 text-left">Коригування по ресторанах</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr key={`${supplier}_${row.productName}_${row.requiredDate}_${index}`} className="border-t border-slate-100 align-top">
                          <td className="px-2 py-1 font-medium text-slate-900">{row.productName}</td>
                          <td className="px-2 py-1">{row.requiredDate || "-"}</td>
                          <td className="px-2 py-1">{row.totalQty} {row.unit}</td>
                          <td className="px-2 py-1 font-semibold">{formatMoney(row.totalAmount)}</td>
                          <td className="px-2 py-1">
                            <div className="space-y-2">
                              {row.restaurants.map((entry, entryIndex) => (
                                <div key={`${entry.orderId}_${entry.restaurantId}_${entryIndex}`} className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                                  <span className="min-w-[200px]">{entry.restaurantName} ({entry.requiredDate || "без дати"})</span>
                                  <input
                                    type="number"
                                    min="0.1"
                                    step="0.1"
                                    className="w-24 rounded border border-slate-300 px-2 py-1"
                                    value={lineEdits[entry.lineKey] ?? entry.qty}
                                    onChange={(e) => setLineEdits((prev) => ({ ...prev, [entry.lineKey]: e.target.value }))}
                                  />
                                  <span>{row.unit}</span>
                                  {canManageOrders && (
                                    <button
                                      type="button"
                                      className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                                      onClick={() => applyLineCorrection(entry)}
                                    >
                                      Зберегти
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {Object.keys(consolidatedBySupplier).length === 0 && (
            <div className="text-sm text-slate-500">Немає нових даних для консолідації або все вже відправлено постачальникам.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProductBookingModule({ topTab, restaurants = [], user }) {
  const {
    products,
    inventoryListProducts,
    orders,
    suppliers,
    typicalFields,
    inventories,
    loading,
    error,
    addProduct,
    updateProduct,
    deleteProduct,
    createOrder,
    updateOrder,
    createSupplierDispatch,
    createSupplier,
    updateSupplier,
    removeSupplier,
    createTypicalField,
    updateTypicalField,
    removeTypicalField,
    replaceInventoryListForRestaurant,
    createInventory,
    updateInventory,
    deleteInventory,
  } = useProductBooking(true);

  const tabKind = normalizeTabKind(topTab);
  const canManageProducts = hasProcurementAccess(user);
  const canManageOrders = hasProcurementAccess(user);
  const normalizedProducts = useMemo(() => {
    return products.map((item) => normalizeRestaurantScopedRecord(item, restaurants));
  }, [products, restaurants]);

  const normalizedInventoryListProducts = useMemo(() => {
    return inventoryListProducts.map((item) => normalizeRestaurantScopedRecord(item, restaurants));
  }, [inventoryListProducts, restaurants]);

  const normalizedOrders = useMemo(() => {
    return orders.map((item) => normalizeRestaurantScopedRecord(item, restaurants));
  }, [orders, restaurants]);

  const normalizedInventories = useMemo(() => {
    return inventories.map((item) => normalizeRestaurantScopedRecord(item, restaurants));
  }, [inventories, restaurants]);

  const effectiveRestaurants = useMemo(() => {
    if (Array.isArray(restaurants) && restaurants.length > 0) return restaurants;
    return buildDerivedRestaurants([...normalizedProducts, ...normalizedInventoryListProducts, ...normalizedOrders, ...normalizedInventories]);
  }, [restaurants, normalizedProducts, normalizedInventoryListProducts, normalizedOrders, normalizedInventories]);

  const availableSuppliers = useMemo(() => {
    const fromDirectory = suppliers
      .filter((item) => item.isActive !== false)
      .map((item) => String(item.name || "").trim())
      .filter(Boolean);

    const fromProducts = normalizedProducts
      .map((item) => String(item.supplier || "").trim())
      .filter(Boolean);

    return Array.from(new Set([...fromDirectory, ...fromProducts])).sort((a, b) => a.localeCompare(b, "uk"));
  }, [suppliers, normalizedProducts]);

  const availableCategories = useMemo(() => {
    const fromDirectory = typicalFields
      .filter((item) => item.type === "category" && item.isActive !== false)
      .map((item) => String(item.name || "").trim())
      .filter(Boolean);

    const fromProducts = normalizedProducts
      .map((item) => String(item.category || "").trim())
      .filter(Boolean);

    return Array.from(new Set([...fromDirectory, ...fromProducts])).sort((a, b) => a.localeCompare(b, "uk"));
  }, [typicalFields, normalizedProducts]);

  const availableSubcategoriesByCategory = useMemo(() => {
    const map = {};

    typicalFields
      .filter((item) => item.type === "subcategory" && item.isActive !== false)
      .forEach((item) => {
        const category = String(item.categoryName || "").trim();
        const subcategory = String(item.name || "").trim();
        if (!category || !subcategory) return;
        if (!map[category]) map[category] = [];
        map[category].push(subcategory);
      });

    normalizedProducts.forEach((item) => {
      const category = String(item.category || "").trim();
      const subcategory = String(item.subcategory || "").trim();
      if (!category || !subcategory) return;
      if (!map[category]) map[category] = [];
      map[category].push(subcategory);
    });

    Object.keys(map).forEach((key) => {
      map[key] = Array.from(new Set(map[key])).sort((a, b) => a.localeCompare(b, "uk"));
    });

    return map;
  }, [typicalFields, normalizedProducts]);

  const availableUnits = useMemo(() => {
    const fromDirectory = typicalFields
      .filter((item) => item.type === "unit" && item.isActive !== false)
      .map((item) => String(item.name || "").trim())
      .filter(Boolean);

    const fromProducts = normalizedProducts
      .map((item) => String(item.unit || "").trim())
      .filter(Boolean);

    return Array.from(new Set([...fromDirectory, ...fromProducts])).sort((a, b) => a.localeCompare(b, "uk"));
  }, [typicalFields, normalizedProducts]);

  if (loading) {
    return <div className={`${cardClass} text-sm text-slate-600`}>Завантаження даних з бази...</div>;
  }

  if (error) {
    return (
      <div className={`${cardClass} text-sm text-red-600`}>
        <div>Помилка завантаження даних модуля замовлень.</div>
        <div className="mt-2 whitespace-pre-wrap text-xs text-red-500">{String(error?.message || error || "")}</div>
      </div>
    );
  }

  if (tabKind === "products") {
    return (
      <ProductAdminTab
        products={normalizedProducts}
        suppliers={availableSuppliers}
        categories={availableCategories}
        subcategoriesByCategory={availableSubcategoriesByCategory}
        units={availableUnits}
        inventories={normalizedInventories}
        restaurants={effectiveRestaurants}
        user={user}
        canManageProducts={canManageProducts}
        addProduct={addProduct}
        updateProduct={updateProduct}
        deleteProduct={deleteProduct}
      />
    );
  }

  if (tabKind === "inventory") {
    return (
      <InventoryTab
        products={normalizedInventoryListProducts}
        inventories={normalizedInventories}
        restaurants={effectiveRestaurants}
        user={user}
        createInventory={createInventory}
        updateInventory={updateInventory}
        deleteInventory={deleteInventory}
      />
    );
  }

  if (tabKind === "inventoryList") {
    return (
      <InventoryListTab
        listProducts={normalizedInventoryListProducts}
        restaurants={effectiveRestaurants}
        user={user}
        canManage={canManageProducts}
        replaceInventoryListForRestaurant={replaceInventoryListForRestaurant}
      />
    );
  }

  if (tabKind === "inventoryJournal") {
    return (
      <InventoryJournalTab
        inventories={normalizedInventories}
        user={user}
        deleteInventory={deleteInventory}
      />
    );
  }

  if (tabKind === "suppliers") {
    return (
      <SuppliersAdminTab
        suppliers={suppliers}
        canManage={canManageProducts}
        createSupplier={createSupplier}
        updateSupplier={updateSupplier}
        removeSupplier={removeSupplier}
      />
    );
  }

  if (tabKind === "typicalFields") {
    return (
      <TypicalFieldsTab
        fields={typicalFields}
        canManage={canManageProducts}
        createTypicalField={createTypicalField}
        updateTypicalField={updateTypicalField}
        removeTypicalField={removeTypicalField}
      />
    );
  }

  if (tabKind === "orders") {
    return (
      <OrdersManagementTab
        orders={normalizedOrders}
        updateOrder={updateOrder}
        createSupplierDispatch={createSupplierDispatch}
        canManageOrders={canManageOrders}
        user={user}
      />
    );
  }

  return <BookingTab products={normalizedProducts} orders={normalizedOrders} createOrder={createOrder} restaurants={effectiveRestaurants} user={user} suppliersDirectory={suppliers} />;
}
