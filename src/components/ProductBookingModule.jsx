import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Package, ShoppingCart, ClipboardCheck, Trash2, Download, Upload, FileDown, X, Printer, Calculator, BarChart2 } from "lucide-react";
import { useProductBooking } from "../hooks/useProductBooking";
import {
  endProductInventorySession,
  getActiveProductInventorySession,
  startProductInventorySession,
  subscribeToActiveProductInventorySession,
} from "../firebase/firestore";
import { getUsers } from "../firebase/users";

const loadProductInventoryExcel = () => import("../utils/productInventoryExcel");
const loadInventoryListExcel = () => import("../utils/inventoryListExcel");

const normalizeTabKind = (tabId = "") => {
  const value = String(tabId).toLowerCase();
  if (
    (value.includes("order") && (value.includes("supplier") || value.includes("suplayer") || value.includes("vendor") || value.includes("постач"))) ||
    value.includes("supplierportal") ||
    value.includes("suplayerportal") ||
    value.includes("vendorportal") ||
    value.includes("порталпостач")
  ) return "supplierPortal";
  if (value.includes("orderapl") || value.includes("apl")) return "orderApl";
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
  if (value.includes("report") || value.includes("звіт")) return "orderReport";
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

const formatDateTimeSafe = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleString("uk-UA");
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

const getMergedSourceDocuments = (inventory) => {
  const direct = inventory?.mergedSourceDocuments ?? inventory?.merged_source_documents;
  if (Array.isArray(direct)) return direct;
  if (typeof direct === "string") {
    const trimmed = direct.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

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

const buildRestaurantLookupKey = (source = {}) => {
  return Array.from(collectRestaurantTokens(source || {})).sort((left, right) => left.localeCompare(right, "uk")).join("::");
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

const hasSupplierPortalAccess = (user) => {
  const roleValue = String(user?.role || "").toLowerCase();
  const workRoleValue = String(user?.workRole || "").toLowerCase();
  const terms = ["supplier", "vendor", "постач"];
  return terms.some((term) => roleValue.includes(term) || workRoleValue.includes(term));
};

const normalizeSupplierIdentity = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

const getSupplierPortalEmails = (supplier) => {
  const emails = [
    ...(Array.isArray(supplier?.portalEmails) ? supplier.portalEmails : []),
    supplier?.portalEmail,
    supplier?.contactEmail,
    supplier?.email,
  ];
  return Array.from(
    new Set(
      emails
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
};

const resolveSupplierForUser = (user, suppliers = []) => {
  const normalizedSuppliers = Array.isArray(suppliers) ? suppliers : [];
  const email = String(user?.email || "").trim().toLowerCase();
  if (email) {
    const matchedByEmail = normalizedSuppliers.find((supplier) => getSupplierPortalEmails(supplier).includes(email));
    if (matchedByEmail) return matchedByEmail;
  }

  const identityCandidates = [user?.displayName, user?.fullName, user?.name]
    .map((item) => normalizeSupplierIdentity(item))
    .filter(Boolean);

  if (identityCandidates.length > 0) {
    const matchedByName = normalizedSuppliers.find((supplier) =>
      identityCandidates.includes(normalizeSupplierIdentity(supplier?.name))
    );
    if (matchedByName) return matchedByName;
  }

  return null;
};

const deriveOrderStatus = (items, currentStatus) => {
  if (currentStatus === "completed") return "completed";
  const normalizedItems = Array.isArray(items) ? items : [];
  const hasItems = normalizedItems.length > 0;
  const hasUnsent = normalizedItems.some((item) => !item.sentToSupplier);
  const hasSent = normalizedItems.some((item) => item.sentToSupplier);
  const hasPendingSupplierResponses = normalizedItems.some((item) => item.sentToSupplier && getSupplierResponseStatus(item) === "pending");
  const hasSupplierIssues = normalizedItems.some((item) => {
    if (!item.sentToSupplier) return false;
    const responseStatus = getSupplierResponseStatus(item);
    return responseStatus === "partial" || responseStatus === "unavailable";
  });

  if (!hasItems) return "new";
  if (hasSupplierIssues || hasPendingSupplierResponses) return "processing";
  if (!hasUnsent) return "sent";
  if (hasSent && hasUnsent) return "processing";
  return "new";
};

const getSupplierResponseStatus = (item) => {
  const status = String(item?.supplierResponseStatus || item?.vendorResponseStatus || "").trim().toLowerCase();
  if (status) return status;
  return item?.sentToSupplier ? "pending" : "draft";
};

const getSupplierResponseLabel = (status) => {
  if (status === "accepted") return "Підтверджено";
  if (status === "partial") return "Частково";
  if (status === "unavailable") return "Немає в наявності";
  if (status === "pending") return "Очікує відповіді";
  return "Чернетка";
};

const getSupplierResponseBadgeClass = (status) => {
  if (status === "accepted") return "bg-emerald-100 text-emerald-700";
  if (status === "partial") return "bg-amber-100 text-amber-700";
  if (status === "unavailable") return "bg-rose-100 text-rose-700";
  if (status === "pending") return "bg-indigo-100 text-indigo-700";
  return "bg-slate-100 text-slate-600";
};

const summarizeSupplierResponses = (order, supplierName) => {
  const normalizedSupplier = normalizeSupplierIdentity(supplierName);
  const items = (Array.isArray(order?.items) ? order.items : []).filter((item) => {
    if (!item?.sentToSupplier) return false;
    return normalizeSupplierIdentity(item?.supplier) === normalizedSupplier;
  });

  const summary = { pending: 0, accepted: 0, partial: 0, unavailable: 0, total: items.length };
  items.forEach((item) => {
    const status = getSupplierResponseStatus(item);
    if (Object.prototype.hasOwnProperty.call(summary, status)) {
      summary[status] += 1;
    }
  });
  return summary;
};

const DELIVERY_WEEK_DAYS = [
  { id: "mon", label: "Пн" },
  { id: "tue", label: "Вт" },
  { id: "wed", label: "Ср" },
  { id: "thu", label: "Чт" },
  { id: "fri", label: "Пт" },
  { id: "sat", label: "Сб" },
  { id: "sun", label: "Нд" },
];

const isGlobalAdminUser = (user) => String(user?.role || "").toLowerCase() === "admin";

function ProductAdminTab({
  products,
  suppliers,
  suppliersDirectory = [],
  categories,
  subcategoriesByCategory,
  inventories,
  restaurants,
  user,
  canManageProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  createSupplier,
  updateSupplier,
  typicalFields,
  createTypicalField,
  updateTypicalField,
}) {
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
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [subcategoryFilter, setSubcategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [restaurantFilter, setRestaurantFilter] = useState(defaultRestaurantId);
  const [importMode, setImportMode] = useState("selected");
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [bulkSupplier, setBulkSupplier] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [expandedProductCategories, setExpandedProductCategories] = useState({});
  const [expandedProductSubcategories, setExpandedProductSubcategories] = useState({});

  useEffect(() => {
    if (isGlobalAdmin) return;
    const scopedRestaurant = String(user?.restaurant || "");
    setRestaurantFilter(scopedRestaurant);
    setCreateDraft((prev) => ({ ...prev, restaurantId: scopedRestaurant }));
  }, [user, isGlobalAdmin]);

  const availableRestaurants = useMemo(() => {
    if (isGlobalAdmin) return restaurants;
    return restaurants.filter((item) => String(item.id) === String(user?.restaurant || ""));
  }, [restaurants, user, isGlobalAdmin]);

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

  useEffect(() => {
    const allowed = new Set(products.map((item) => String(item.id || "")).filter(Boolean));
    setSelectedProductIds((prev) => prev.filter((id) => allowed.has(String(id))));
  }, [products]);

  const filteredProductIds = useMemo(
    () => filteredProducts.map((item) => String(item.id || "")).filter(Boolean),
    [filteredProducts]
  );

  const areAllFilteredSelected = useMemo(() => {
    if (filteredProductIds.length === 0) return false;
    const selectedSet = new Set(selectedProductIds.map((id) => String(id)));
    return filteredProductIds.every((id) => selectedSet.has(String(id)));
  }, [filteredProductIds, selectedProductIds]);

  const toggleSelected = (productId) => {
    const normalizedId = String(productId || "");
    if (!normalizedId) return;
    setSelectedProductIds((prev) => {
      const next = new Set(prev.map((id) => String(id)));
      if (next.has(normalizedId)) next.delete(normalizedId);
      else next.add(normalizedId);
      return Array.from(next);
    });
  };

  const toggleSelectedMany = (productIds = []) => {
    const normalizedIds = productIds.map((id) => String(id || "")).filter(Boolean);
    if (normalizedIds.length === 0) return;

    setSelectedProductIds((prev) => {
      const next = new Set(prev.map((id) => String(id)));
      const allSelected = normalizedIds.every((id) => next.has(id));
      if (allSelected) {
        normalizedIds.forEach((id) => next.delete(id));
      } else {
        normalizedIds.forEach((id) => next.add(id));
      }
      return Array.from(next);
    });
  };

  const toggleSelectAllFiltered = () => {
    if (areAllFilteredSelected) {
      const filteredSet = new Set(filteredProductIds.map((id) => String(id)));
      setSelectedProductIds((prev) => prev.filter((id) => !filteredSet.has(String(id))));
      return;
    }

    setSelectedProductIds((prev) => {
      const next = new Set(prev.map((id) => String(id)));
      filteredProductIds.forEach((id) => next.add(String(id)));
      return Array.from(next);
    });
  };

  const selectedProducts = useMemo(() => {
    const selectedSet = new Set(selectedProductIds.map((id) => String(id)));
    return products.filter((item) => selectedSet.has(String(item.id || "")));
  }, [products, selectedProductIds]);

  const groupedProducts = useMemo(() => {
    const categoryMap = new Map();

    filteredProducts.forEach((item) => {
      const categoryName = String(item.category || "Без категорії").trim() || "Без категорії";
      const subcategoryName = String(item.subcategory || "Без підкатегорії").trim() || "Без підкатегорії";

      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, new Map());
      }

      const subcategoryMap = categoryMap.get(categoryName);
      if (!subcategoryMap.has(subcategoryName)) {
        subcategoryMap.set(subcategoryName, []);
      }

      subcategoryMap.get(subcategoryName).push(item);
    });

    const toGroupedProductRows = (items) => {
      const grouped = new Map();

      items.forEach((item) => {
        const key = String(item.code1C || "").trim().toLowerCase() || String(item.name || "").trim().toLowerCase();
        const safeKey = key || `item_${String(item.id || "")}`;
        if (!grouped.has(safeKey)) {
          grouped.set(safeKey, []);
        }
        grouped.get(safeKey).push(item);
      });

      return Array.from(grouped.values()).map((groupItems) => {
        const sample = groupItems[0] || {};
        const uniqueSuppliers = Array.from(new Set(groupItems.map((entry) => String(entry.supplier || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "uk"));
        const uniqueRestaurants = Array.from(new Set(groupItems.map((entry) => String(entry.restaurantName || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "uk"));
        const uniqueUnits = Array.from(new Set(groupItems.map((entry) => String(entry.unit || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "uk"));

        const prices = Array.from(
          new Set(
            groupItems
              .map((entry) => toNumber(entry.unitPrice))
              .filter((price) => Number.isFinite(price) && price >= 0)
              .map((price) => Number(price.toFixed(2)))
          )
        ).sort((left, right) => left - right);

        const aggregatedSuppliers = uniqueSuppliers.length > 0 ? uniqueSuppliers.join(", ") : "-";
        const aggregatedRestaurants = uniqueRestaurants.length > 0 ? uniqueRestaurants.join(", ") : "-";
        const aggregatedUnits = uniqueUnits.length > 0 ? uniqueUnits.join(", ") : "-";

        let aggregatedPrice = "-";
        if (prices.length === 1) {
          aggregatedPrice = formatMoney(prices[0]);
        } else if (prices.length > 1) {
          aggregatedPrice = `${formatMoney(prices[0])} - ${formatMoney(prices[prices.length - 1])}`;
        }

        return {
          key: String(sample.id || ""),
          name: String(sample.name || "").trim() || "Без назви",
          code1C: String(sample.code1C || "").trim(),
          supplierText: aggregatedSuppliers,
          restaurantText: aggregatedRestaurants,
          unitText: aggregatedUnits,
          priceText: aggregatedPrice,
          ids: groupItems.map((entry) => String(entry.id || "")).filter(Boolean),
          isActive: groupItems.some((entry) => entry.isActive !== false),
          totalSuppliers: uniqueSuppliers.length,
        };
      });
    };

    return Array.from(categoryMap.entries())
      .sort(([left], [right]) => left.localeCompare(right, "uk"))
      .map(([categoryName, subcategoryMap]) => ({
        categoryName,
        subcategories: Array.from(subcategoryMap.entries())
          .sort(([left], [right]) => left.localeCompare(right, "uk"))
          .map(([subcategoryName, items]) => ({
            subcategoryName,
            items: [...items].sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "uk")),
            groupedItems: toGroupedProductRows(items).sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "uk")),
          })),
      }));
  }, [filteredProducts]);

  const isProductCategoryExpanded = (categoryName) => Boolean(Object.prototype.hasOwnProperty.call(expandedProductCategories, categoryName)
    ? expandedProductCategories[categoryName]
    : false);

  const isProductSubcategoryExpanded = (categoryName, subcategoryName) => {
    const key = `${categoryName}::${subcategoryName}`;
    return Boolean(Object.prototype.hasOwnProperty.call(expandedProductSubcategories, key)
      ? expandedProductSubcategories[key]
      : false);
  };

  const toggleProductCategory = (categoryName) => {
    setExpandedProductCategories((prev) => ({
      ...prev,
      [categoryName]: !(Object.prototype.hasOwnProperty.call(prev, categoryName) ? prev[categoryName] : true),
    }));
  };

  const toggleProductSubcategory = (categoryName, subcategoryName) => {
    const key = `${categoryName}::${subcategoryName}`;
    setExpandedProductSubcategories((prev) => ({
      ...prev,
      [key]: !(Object.prototype.hasOwnProperty.call(prev, key) ? prev[key] : true),
    }));
  };

  const applyBulkStatus = async (isActive) => {
    if (selectedProducts.length === 0) {
      alert("Оберіть продукти для масової операції.");
      return;
    }

    let success = 0;
    let failed = 0;
    for (const item of selectedProducts) {
      const { id, ...payload } = item;
      const result = await updateProduct(id, { ...payload, isActive });
      if (result?.success) success += 1;
      else failed += 1;
    }

    alert(`Оновлено статус. Успішно: ${success}. Помилок: ${failed}.`);
  };

  const applyBulkSupplier = async () => {
    if (!bulkSupplier) {
      alert("Оберіть постачальника для масового оновлення.");
      return;
    }
    if (selectedProducts.length === 0) {
      alert("Оберіть продукти для масової операції.");
      return;
    }

    let success = 0;
    let failed = 0;
    for (const item of selectedProducts) {
      const { id, ...payload } = item;
      const result = await updateProduct(id, { ...payload, supplier: bulkSupplier });
      if (result?.success) success += 1;
      else failed += 1;
    }

    alert(`Масово оновлено постачальника. Успішно: ${success}. Помилок: ${failed}.`);
  };

  const applyBulkCategory = async () => {
    if (!bulkCategory) {
      alert("Оберіть категорію для масового оновлення.");
      return;
    }
    if (selectedProducts.length === 0) {
      alert("Оберіть продукти для масової операції.");
      return;
    }

    let success = 0;
    let failed = 0;

    const runInBatches = async (items, batchSize, worker) => {
      const source = Array.isArray(items) ? items : [];
      const size = Math.max(1, Number(batchSize) || 1);
      for (let i = 0; i < source.length; i += size) {
        const batch = source.slice(i, i + size);
        const results = await Promise.allSettled(batch.map((entry) => worker(entry)));
        results.forEach((result) => {
          const value = result.status === "fulfilled" ? result.value : null;
          if (value?.success) success += 1;
          else failed += 1;
        });
      }
    };

    await runInBatches(selectedProducts, 8, async (item) => {
      const { id, ...payload } = item;
      return updateProduct(id, {
        ...payload,
        category: bulkCategory,
        subcategory: "",
      }, { skipReload: true });
    });

    alert(`Масово оновлено категорію. Успішно: ${success}. Помилок: ${failed}.`);
  };

  const applyBulkDelete = async () => {
    if (selectedProducts.length === 0) {
      alert("Оберіть продукти для масового видалення.");
      return;
    }

    const confirmed = window.confirm(`Видалити ${selectedProducts.length} вибраних продуктів? Дію неможливо скасувати.`);
    if (!confirmed) return;

    let success = 0;
    let failed = 0;

    const runInBatches = async (items, batchSize, worker) => {
      const source = Array.isArray(items) ? items : [];
      const size = Math.max(1, Number(batchSize) || 1);
      for (let i = 0; i < source.length; i += size) {
        const batch = source.slice(i, i + size);
        const results = await Promise.allSettled(batch.map((entry) => worker(entry)));
        results.forEach((result) => {
          const value = result.status === "fulfilled" ? result.value : null;
          if (value?.success) success += 1;
          else failed += 1;
        });
      }
    };

    await runInBatches(selectedProducts, 10, async (item) => deleteProduct(item.id, { skipReload: true }));

    setSelectedProductIds([]);
    alert(`Масове видалення завершено. Видалено: ${success}. Помилок: ${failed}.`);
  };

  const aplAssignments = useMemo(
    () => (typicalFields || []).filter((item) => String(item?.type || "") === "aplAssignment"),
    [typicalFields]
  );

  const makeAplAssignmentKey = (entry) => {
    return [
      String(entry?.restaurantId || "").trim().toLowerCase(),
      String(entry?.restaurantRegNumber || "").trim().toLowerCase(),
      String(entry?.supplier || "").trim().toLowerCase(),
      String(entry?.greenCardName || "").trim().toLowerCase(),
      String(entry?.whiteCardName || "").trim().toLowerCase(),
      String(entry?.code1C || "").trim().toLowerCase(),
    ].join("::");
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

      const normalizeSupplierKey = (value) => String(value || "").trim().toLowerCase();
      const nextContractId = (supplierId, restaurantId, index) => `${String(supplierId || "supplier")}__${String(restaurantId || "restaurant")}__${Date.now()}__${index}`;
      const normalizeSupplierContracts = (supplier) => {
        const source = Array.isArray(supplier?.contracts) ? supplier.contracts : [];
        return source
          .map((contract, index) => ({
            id: String(contract?.id || `${String(supplier?.id || "supplier")}_${index}`).trim(),
            restaurantId: String(contract?.restaurantId || "").trim(),
            restaurantName: String(contract?.restaurantName || "").trim(),
            currency: String(contract?.currency || "UAH").trim() || "UAH",
            contractNumber: String(contract?.contractNumber || "").trim(),
            terms: String(contract?.terms || "").trim(),
            deliveryLeadDays: Math.max(0, Math.round(toNumber(contract?.deliveryLeadDays || 0))),
            paymentDelayDays: Math.max(0, Math.round(toNumber(contract?.paymentDelayDays || 0))),
            deliveryDays: Array.from(new Set((Array.isArray(contract?.deliveryDays) ? contract.deliveryDays : []).map((day) => String(day || "").trim()).filter(Boolean))),
          }))
          .filter((contract) => contract.restaurantId);
      };

      const supplierRestaurantMap = new Map();
      importedProducts.forEach((product) => {
        const supplierName = String(product?.supplier || "").trim();
        const restaurantId = String(product?.restaurantId || "").trim();
        if (!supplierName || !restaurantId) return;

        if (!supplierRestaurantMap.has(supplierName)) {
          supplierRestaurantMap.set(supplierName, new Map());
        }

        supplierRestaurantMap.get(supplierName).set(restaurantId, String(product?.restaurantName || "").trim());
      });

      if (supplierRestaurantMap.size > 0) {
        const directoryByName = new Map(
          (Array.isArray(suppliersDirectory) ? suppliersDirectory : [])
            .map((item) => [normalizeSupplierKey(item?.name), item])
            .filter(([key]) => Boolean(key))
        );

        for (const [supplierName, restaurantMap] of supplierRestaurantMap.entries()) {
          const key = normalizeSupplierKey(supplierName);
          if (!key) continue;

          const existingSupplier = directoryByName.get(key);
          const importedContracts = Array.from(restaurantMap.entries()).map(([restaurantId, restaurantName], index) => ({
            id: nextContractId(existingSupplier?.id, restaurantId, index),
            restaurantId: String(restaurantId || "").trim(),
            restaurantName: String(
              restaurantName ||
              restaurants.find((restaurant) => String(restaurant?.id || "") === String(restaurantId || ""))?.name ||
              ""
            ).trim(),
            currency: "UAH",
            contractNumber: "",
            terms: "",
            deliveryLeadDays: 0,
            paymentDelayDays: 0,
            deliveryDays: [],
          }));

          if (existingSupplier?.id) {
            const existingContracts = normalizeSupplierContracts(existingSupplier);
            const existingRestaurantIds = new Set(existingContracts.map((contract) => String(contract.restaurantId || "").trim()).filter(Boolean));
            const contractsToAdd = importedContracts.filter((contract) => !existingRestaurantIds.has(String(contract.restaurantId || "").trim()));
            if (contractsToAdd.length > 0) {
              const { id, ...payload } = existingSupplier;
              await updateSupplier(id, {
                ...payload,
                contracts: [...existingContracts, ...contractsToAdd],
              }, { skipReload: true });
            }
            continue;
          }

          await createSupplier({
            name: supplierName,
            isActive: true,
            legalEntities: [],
            minimumOrderAmount: 0,
            contracts: importedContracts,
          }, { skipReload: true });
        }
      }

      let successCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      let failCount = 0;
      let aplSyncCount = 0;

      const aplByKey = new Map(
        aplAssignments.map((item) => [
          makeAplAssignmentKey(item),
          item,
        ])
      );

      const processImportedProduct = async (product) => {
        const normalizedCode1C = String(product.code1C || "").trim().toLowerCase();
        if (!normalizedCode1C) {
          return { skippedCount: 1, successCount: 0, updatedCount: 0, failCount: 0, aplSyncCount: 0 };
        }

        const existingItem = products.find(
          (item) =>
            sameRestaurant(item.restaurantId, product.restaurantId) &&
            String(item.code1C || "").trim().toLowerCase() === normalizedCode1C
        );

        let successDelta = 0;
        let updatedDelta = 0;
        let failDelta = 0;
        let aplDelta = 0;

        if (existingItem) {
          const { id: existingId, ...existingPayload } = existingItem;
          const result = await updateProduct(existingId, {
            ...existingPayload,
            ...product,
          }, { skipReload: true });
          if (result.success) updatedDelta += 1;
          else failDelta += 1;
        } else {
          const result = await addProduct(product, { skipReload: true });
          if (result.success) successDelta += 1;
          else failDelta += 1;
        }

        const whiteCardName = String(product.whiteCardName || product.name || "").trim();
        const greenCardName = String(product.greenCardName || product.subcategory || "").trim();
        const code1C = String(product.code1C || "").trim();
        const restaurantId = String(product.restaurantId || "").trim();

        if (whiteCardName && greenCardName && restaurantId) {
          const assignmentPayload = {
            type: "aplAssignment",
            name: `${greenCardName} / ${whiteCardName}`,
            categoryName: String(product.category || "").trim(),
            restaurantId,
            restaurantName: String(product.restaurantName || "").trim(),
            restaurantRegNumber: String(product.restaurantRegNumber || "").trim(),
            supplier: String(product.supplier || "").trim(),
            productGroup: String(product.category || "").trim(),
            code1C,
            whiteCardName,
            greenCardName,
            unit: String(product.unit || "").trim(),
            unitPrice: toNumber(product.unitPrice),
            isActive: true,
          };

          const key = makeAplAssignmentKey(assignmentPayload);
          const existingAssignment = aplByKey.get(key);
          if (existingAssignment?.id) {
            const { id, ...existingPayload } = existingAssignment;
            const updated = await updateTypicalField(id, {
              ...existingPayload,
              ...assignmentPayload,
            }, { skipReload: true });
            if (updated?.success) aplDelta += 1;
          } else {
            const created = await createTypicalField(assignmentPayload, { skipReload: true });
            if (created?.success) {
              aplDelta += 1;
              aplByKey.set(key, { id: created.id, ...assignmentPayload });
            }
          }
        }

        return {
          skippedCount: 0,
          successCount: successDelta,
          updatedCount: updatedDelta,
          failCount: failDelta,
          aplSyncCount: aplDelta,
        };
      };

      const runInBatches = async (items, batchSize, worker) => {
        const source = Array.isArray(items) ? items : [];
        const size = Math.max(1, Number(batchSize) || 1);
        for (let i = 0; i < source.length; i += size) {
          const batch = source.slice(i, i + size);
          const results = await Promise.allSettled(batch.map((entry) => worker(entry)));
          for (const result of results) {
            if (result.status !== "fulfilled" || !result.value) continue;
            successCount += result.value.successCount || 0;
            updatedCount += result.value.updatedCount || 0;
            skippedCount += result.value.skippedCount || 0;
            failCount += result.value.failCount || 0;
            aplSyncCount += result.value.aplSyncCount || 0;
          }
        }
      };

      await runInBatches(importedProducts, 8, processImportedProduct);

      alert(`Імпорт завершено. Додано: ${successCount}. Оновлено: ${updatedCount}. Пропущено: ${skippedCount}. Помилок: ${failCount}. APL синхронізацій: ${aplSyncCount}.`);
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
            ? "Режим імпорту: всі рядки з Excel будуть прив'язані до обраного закладу."
            : "Режим імпорту: заклад визначається з колонки Организация/облікового номера у файлі."}
        </div>
      )}

      {canManageProducts && (
        <div className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 text-sm text-indigo-900">
          Ручне створення та ручне редагування довідника продуктів вимкнено. Актуалізація позицій виконується тільки через імпорт з 1С.
        </div>
      )}

      {canManageProducts && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={toggleSelectAllFiltered}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100"
            >
              {areAllFilteredSelected ? "Зняти вибір з видимих" : "Вибрати всі видимі"}
            </button>
            <span className="text-xs font-semibold text-slate-600">Вибрано: {selectedProductIds.length}</span>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            <button type="button" onClick={() => { void applyBulkStatus(true); }} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
              Масово активувати
            </button>
            <button type="button" onClick={() => { void applyBulkStatus(false); }} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-100">
              Масово вимкнути
            </button>
            <button type="button" onClick={() => { void applyBulkDelete(); }} className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100">
              Масово видалити
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            <select className={inputClass} value={bulkSupplier} onChange={(e) => setBulkSupplier(e.target.value)}>
              <option value="">Оберіть постачальника для масової заміни</option>
              {suppliers.map((supplier) => (
                <option key={`bulk_supplier_${supplier}`} value={supplier}>{supplier}</option>
              ))}
            </select>
            <button type="button" onClick={() => { void applyBulkSupplier(); }} className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">
              Застосувати постачальника
            </button>
            <select className={inputClass} value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}>
              <option value="">Оберіть категорію для масової заміни</option>
              {categories.map((category) => (
                <option key={`bulk_category_${category}`} value={category}>{category}</option>
              ))}
            </select>
            <button type="button" onClick={() => { void applyBulkCategory(); }} className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">
              Застосувати категорію
            </button>
          </div>
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

      <div className="space-y-4">
        {groupedProducts.map((categoryNode) => {
          const categoryExpanded = isProductCategoryExpanded(categoryNode.categoryName);
          const categoryTotal = categoryNode.subcategories.reduce((sum, subcategory) => sum + subcategory.items.length, 0);

          return (
            <div key={categoryNode.categoryName} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-2 text-left"
                  onClick={() => toggleProductCategory(categoryNode.categoryName)}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-700">
                    {categoryExpanded ? "−" : "+"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{categoryNode.categoryName}</p>
                    <p className="text-xs text-slate-500">{categoryTotal} позицій · {categoryNode.subcategories.length} підкатегорій</p>
                  </div>
                </button>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  Категорія
                </span>
              </div>

              {categoryExpanded && (
                <div className="space-y-3 p-4">
                  {categoryNode.subcategories.map((subcategoryNode) => {
                    const subcategoryExpanded = isProductSubcategoryExpanded(categoryNode.categoryName, subcategoryNode.subcategoryName);

                    return (
                      <div key={`${categoryNode.categoryName}__${subcategoryNode.subcategoryName}`} className="rounded-xl border border-slate-200 bg-slate-50">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5 pl-6">
                          <button
                            type="button"
                            className="flex min-w-0 items-center gap-2 text-left"
                            onClick={() => toggleProductSubcategory(categoryNode.categoryName, subcategoryNode.subcategoryName)}
                          >
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                              {subcategoryExpanded ? "−" : "+"}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">{subcategoryNode.subcategoryName}</p>
                              <p className="text-xs text-slate-500">{subcategoryNode.items.length} білих карток</p>
                            </div>
                          </button>
                          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                            Підкатегорія
                          </span>
                        </div>

                        {subcategoryExpanded && (
                          <div className="space-y-2 p-3">
                            <div className="hidden grid-cols-[28px_2.2fr_0.9fr_0.8fr_0.9fr_1.4fr_1fr_0.9fr] items-center gap-2 rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 lg:grid">
                              {canManageProducts ? <span>Вибір</span> : <span />}
                              <span>Назва / Код 1С</span>
                              <span>Одиниця</span>
                              <span>Ціна</span>
                              <span>Постачальник</span>
                              <span>Заклад</span>
                              <span>Статус</span>
                            </div>
                            {subcategoryNode.groupedItems.map((item) => {
                              const selectedSet = new Set(selectedProductIds.map((id) => String(id)));
                              const allGroupSelected = item.ids.length > 0 && item.ids.every((id) => selectedSet.has(String(id)));

                              return (
                              <div key={item.key} className="rounded-md border border-slate-200 bg-white px-2 py-2 shadow-sm">
                                <div className="grid grid-cols-1 gap-2 lg:grid-cols-[28px_2.2fr_0.9fr_0.8fr_0.9fr_1.4fr_1fr_0.9fr] lg:items-center">
                                  {canManageProducts && (
                                    <input
                                      type="checkbox"
                                      checked={allGroupSelected}
                                      onChange={() => toggleSelectedMany(item.ids)}
                                      className="h-4 w-4 accent-indigo-600"
                                    />
                                  )}

                                  {!canManageProducts && <div className="hidden lg:block" />}

                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                                    <p className="text-[11px] text-slate-500">Код 1С: {item.code1C || "-"}</p>
                                  </div>

                                  <div className="text-xs text-slate-700">{item.unitText}</div>
                                  <div className="text-xs text-slate-700">{item.priceText}</div>
                                  <div className="text-xs leading-4 text-slate-700" title={item.supplierText}>{item.supplierText}</div>
                                  <div className="truncate text-xs text-slate-700" title={item.restaurantText}>{item.restaurantText}</div>
                                  <div>
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                                      {item.isActive ? "Активний" : "Вимкнений"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {groupedProducts.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-slate-500">
            За поточними фільтрами продукти не знайдено.
          </div>
        )}
      </div>
    </div>
  );
}

function InventoryTab({ products, inventories, restaurants, user, createInventory, updateInventory, deleteInventory }) {
  const isGlobalAdmin = isGlobalAdminUser(user);
  const quantityInputRefs = useRef({});
  const pendingRestoreRef = useRef(null);
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
        return a.localeCompare(b, "uk");
      });
  }, [scopedProducts, searchTerm]);

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

  const mergeCandidates = useMemo(() => {
    const scoped = inventories.filter((item) => isInventoryVisibleForUserRestaurant(item, user, [], isGlobalAdmin));
    return scoped.filter((item) => getMergedIntoId(item) === "" && getMergedFromIds(item).length === 0);
  }, [inventories, user, isGlobalAdmin]);

  const buildRestoredQuantities = (inventory, targetRestaurantId) => {
    const normalizedRestaurantId = String(targetRestaurantId || "");
    const scopedRestoreProducts = products.filter(
      (item) => item.isActive !== false && sameRestaurant(item.restaurantId, normalizedRestaurantId)
    );

    const byId = new Map();
    const byCode = new Map();
    const byName = new Map();

    scopedRestoreProducts.forEach((product) => {

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
    const mergedSourceDocuments = selected.map((inv) => ({
      id: String(inv?.id || ""),
      inventoryDate: inv?.inventoryDate || "",
      restaurantId: inv?.restaurantId || "",
      restaurantName: inv?.restaurantName || "",
      restaurantRegNumber: inv?.restaurantRegNumber || "",
      stockTakingPlace: inv?.stockTakingPlace || inv?.stock_taking_place || "",
      createdBy: inv?.createdBy || "",
      createdById: inv?.createdById || inv?.created_by_id || "",
      inventorySessionEndedBy: inv?.inventorySessionEndedBy || inv?.inventory_session_ended_by || "",
      inventorySessionEndedById: inv?.inventorySessionEndedById || inv?.inventory_session_ended_by_id || "",
      inventorySessionEndedAt: inv?.inventorySessionEndedAt || inv?.inventory_session_ended_at || "",
      items: Array.isArray(inv?.items) ? inv.items : [],
      totalItems: inv?.totalItems,
      totalAmount: inv?.totalAmount,
    }));
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
      mergedSourceDocuments,
      merged_source_documents: mergedSourceDocuments,
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3"
          onClick={closeCalcModal}
        >
          <div
            className="w-full max-w-sm rounded-[28px] bg-[#0f1116] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-right">
              <p className="truncate text-[11px] uppercase tracking-wide text-slate-400">{calcModal.productName}</p>
              <div className="mt-2 min-h-[56px] break-words rounded-2xl bg-[#11151f] px-3 py-2 text-right text-4xl font-light text-white">
                {calcModal.newNumber
                  ? (calcModal.expression || calcModal.display)
                  : `${calcModal.expression}${calcModal.display}`}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2.5">
              <button onClick={calcClear} className="h-16 rounded-full bg-[#5f6065] text-2xl font-medium text-white transition hover:bg-[#6a6b70]">C</button>
              <button onClick={calcBackspace} className="h-16 rounded-full bg-[#5f6065] text-2xl font-medium text-white transition hover:bg-[#6a6b70]">⌫</button>
              <div className="h-16" />
              <button onClick={() => calcOperation("/")} className="h-16 rounded-full bg-[#ff9f0a] text-3xl font-medium text-white transition hover:bg-[#ffb340]">÷</button>

              <button onClick={() => calcInput(7)} className="h-16 rounded-full bg-[#2f3136] text-3xl font-normal text-white transition hover:bg-[#3a3d43]">7</button>
              <button onClick={() => calcInput(8)} className="h-16 rounded-full bg-[#2f3136] text-3xl font-normal text-white transition hover:bg-[#3a3d43]">8</button>
              <button onClick={() => calcInput(9)} className="h-16 rounded-full bg-[#2f3136] text-3xl font-normal text-white transition hover:bg-[#3a3d43]">9</button>
              <button onClick={() => calcOperation("*")} className="h-16 rounded-full bg-[#ff9f0a] text-3xl font-medium text-white transition hover:bg-[#ffb340]">×</button>

              <button onClick={() => calcInput(4)} className="h-16 rounded-full bg-[#2f3136] text-3xl font-normal text-white transition hover:bg-[#3a3d43]">4</button>
              <button onClick={() => calcInput(5)} className="h-16 rounded-full bg-[#2f3136] text-3xl font-normal text-white transition hover:bg-[#3a3d43]">5</button>
              <button onClick={() => calcInput(6)} className="h-16 rounded-full bg-[#2f3136] text-3xl font-normal text-white transition hover:bg-[#3a3d43]">6</button>
              <button onClick={() => calcOperation("-")} className="h-16 rounded-full bg-[#ff9f0a] text-3xl font-medium text-white transition hover:bg-[#ffb340]">−</button>

              <button onClick={() => calcInput(1)} className="h-16 rounded-full bg-[#2f3136] text-3xl font-normal text-white transition hover:bg-[#3a3d43]">1</button>
              <button onClick={() => calcInput(2)} className="h-16 rounded-full bg-[#2f3136] text-3xl font-normal text-white transition hover:bg-[#3a3d43]">2</button>
              <button onClick={() => calcInput(3)} className="h-16 rounded-full bg-[#2f3136] text-3xl font-normal text-white transition hover:bg-[#3a3d43]">3</button>
              <button onClick={() => calcOperation("+")} className="h-16 rounded-full bg-[#ff9f0a] text-3xl font-medium text-white transition hover:bg-[#ffb340]">+</button>

              <button onClick={() => calcInput(0)} className="col-span-2 h-16 rounded-full bg-[#2f3136] text-3xl font-normal text-white transition hover:bg-[#3a3d43]">0</button>
              <button onClick={calcDot} className="h-16 rounded-full bg-[#2f3136] text-3xl font-normal text-white transition hover:bg-[#3a3d43]">,</button>
              <button onClick={calcEquals} className="h-16 rounded-full bg-[#ff9f0a] text-3xl font-medium text-white transition hover:bg-[#ffb340]">=</button>
            </div>
            <div className="mt-4 flex gap-2.5">
              <button onClick={closeCalcModal} className="flex-1 rounded-xl border border-slate-600 bg-[#1f2532] px-3 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-[#2a3244]">Скасувати</button>
              <button onClick={calcSave} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500">OK</button>
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
  const [expandedMergedIds, setExpandedMergedIds] = useState(new Set());
  const [expandedSourceKeys, setExpandedSourceKeys] = useState(new Set());
  const visibleInventories = useMemo(() => {
    const scoped = inventories.filter((item) => isInventoryVisibleForUserRestaurant(item, user, [], isGlobalAdmin));

    // Journal should contain only final merged inventory documents.
    return scoped.filter((item) => getMergedFromIds(item).length > 0);
  }, [inventories, user, isGlobalAdmin]);

  const toggleMergedExpanded = (id) => {
    setExpandedMergedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSourceExpanded = (mergedId, sourceId, sourceIndex) => {
    const key = `${String(mergedId || "")}::${String(sourceId || sourceIndex || "")}`;
    setExpandedSourceKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
            {visibleInventories.map((inventory) => {
              const mergedSources = getMergedSourceDocuments(inventory);
              const isExpanded = expandedMergedIds.has(String(inventory.id));

              return (
                <Fragment key={inventory.id}>
                  <tr className="border-t border-slate-200">
                    <td className="px-3 py-2">{formatDateUk(inventory.inventoryDate)}</td>
                    <td className="px-3 py-2">{inventory.restaurantName || "-"}</td>
                    <td className="px-3 py-2">{Array.isArray(inventory.items) ? inventory.items.length : 0}</td>
                    <td className="px-3 py-2 font-medium">{formatMoney(inventory.totalAmount)}</td>
                    <td className="px-3 py-2">{getInventoryEndedByLabel(inventory)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => toggleMergedExpanded(String(inventory.id))}
                          className="inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                        >
                          {isExpanded ? "Сховати деталі" : "Показати деталі"}
                        </button>
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
                  {isExpanded && (
                    <tr className="border-t border-slate-100 bg-slate-50/70">
                      <td colSpan={6} className="px-3 py-3">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Документів у зведенні: {mergedSources.length || getMergedFromIds(inventory).length}
                        </div>
                        {mergedSources.length > 0 ? (
                          <div className="space-y-3">
                            {mergedSources.map((sourceDoc, index) => {
                              const sourceKey = `${String(inventory?.id || "")}::${String(sourceDoc?.id || index)}`;
                              const isSourceExpanded = expandedSourceKeys.has(sourceKey);
                              const sourcePositionsCount = Array.isArray(sourceDoc?.items)
                                ? sourceDoc.items.length
                                : Math.max(0, Math.round(toNumber(sourceDoc?.totalItems)));

                              return (
                                <div key={`${sourceDoc?.id || index}`} className="rounded-lg border border-slate-200 bg-white p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-xs text-slate-700">
                                      <span className="font-semibold">#{index + 1}</span>
                                      <span className="ml-2">{formatDateUk(sourceDoc?.inventoryDate)}</span>
                                      <span className="ml-2">Місце: {sourceDoc?.stockTakingPlace || sourceDoc?.stock_taking_place || "-"}</span>
                                      <span className="ml-2">Виконавець: {getInventoryEndedByLabel(sourceDoc)}</span>
                                      <span className="ml-2">Позицій: {sourcePositionsCount}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => toggleSourceExpanded(inventory?.id, sourceDoc?.id, index)}
                                        className="inline-flex items-center gap-1 rounded-md border border-violet-300 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-100"
                                      >
                                        {isSourceExpanded ? "Сховати одиниці" : "Одиниці"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleExportSingleInventory(sourceDoc)}
                                        className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-500"
                                      >
                                        <Download size={12} /> Ексель
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleExportSingleInventory1C(sourceDoc)}
                                        className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
                                      >
                                        <Download size={12} /> 1С
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handlePrintSingleInventory(sourceDoc)}
                                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                                      >
                                        <Printer size={12} /> Друк
                                      </button>
                                    </div>
                                  </div>

                                  {isSourceExpanded && (
                                    <div className="mt-2 overflow-x-auto">
                                      <table className="min-w-full text-xs">
                                        <thead className="text-slate-600">
                                          <tr>
                                            <th className="px-2 py-1 text-left">Продукт</th>
                                            <th className="px-2 py-1 text-left">Код 1С</th>
                                            <th className="px-2 py-1 text-left">К-сть</th>
                                            <th className="px-2 py-1 text-left">Сума</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {(Array.isArray(sourceDoc?.items) ? sourceDoc.items : []).map((item, itemIndex) => (
                                            <tr key={`${sourceDoc?.id || index}_${itemIndex}`} className="border-t border-slate-100">
                                              <td className="px-2 py-1">{item?.productName || "-"}</td>
                                              <td className="px-2 py-1">{item?.code1C || "-"}</td>
                                              <td className="px-2 py-1">{toNumber(item?.qty).toFixed(2)} {item?.unit || ""}</td>
                                              <td className="px-2 py-1">{formatMoney(item?.amount)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500">Деталі по вхідних документах недоступні для цього зведення.</div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
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

function SuppliersAdminTab({ suppliers, restaurants = [], canManage, createSupplier, updateSupplier, removeSupplier }) {
  const [newSupplierName, setNewSupplierName] = useState("");
  const [legalEntityDrafts, setLegalEntityDrafts] = useState({});
  const [portalEmailDrafts, setPortalEmailDrafts] = useState({});
  const [minimumOrderDrafts, setMinimumOrderDrafts] = useState({});
  const [contractDrafts, setContractDrafts] = useState({});
  const [savingContractSupplierId, setSavingContractSupplierId] = useState("");
  const [expandedSupplierContracts, setExpandedSupplierContracts] = useState({});
  const [expandedContractRows, setExpandedContractRows] = useState({});
  const importInputRef = useRef(null);

  const suppliersById = useMemo(() => {
    return new Map((suppliers || []).map((supplier) => [String(supplier?.id || ""), supplier]));
  }, [suppliers]);

  const formatContractDays = (days = []) => {
    const labels = DELIVERY_WEEK_DAYS
      .filter((day) => (Array.isArray(days) ? days : []).includes(day.id))
      .map((day) => day.label);
    return labels.length > 0 ? labels.join(", ") : "Не вказано";
  };

  const getContractRestaurantLabel = (contract) => {
    return contract.restaurantName || restaurants.find((restaurant) => String(restaurant.id) === String(contract.restaurantId))?.name || "Без закладу";
  };

  const isSupplierContractsExpanded = (supplierId) => {
    return Boolean(expandedSupplierContracts[String(supplierId || "")]);
  };

  const toggleSupplierContracts = (supplierId) => {
    const normalizedId = String(supplierId || "");
    setExpandedSupplierContracts((prev) => ({
      ...prev,
      [normalizedId]: !prev[normalizedId],
    }));
  };

  const isContractRowExpanded = (supplierId, contractId) => {
    const key = `${String(supplierId || "")}::${String(contractId || "")}`;
    return Boolean(expandedContractRows[key]);
  };

  const toggleContractRow = (supplierId, contractId) => {
    const key = `${String(supplierId || "")}::${String(contractId || "")}`;
    setExpandedContractRows((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const getLegalEntities = (supplier) => {
    const fromArray = Array.isArray(supplier?.legalEntities) ? supplier.legalEntities : [];
    const fromSingle = String(supplier?.legalEntity || "").trim();
    const combined = [
      ...fromArray.map((item) => String(item || "").trim()).filter(Boolean),
      ...(fromSingle ? [fromSingle] : []),
    ];
    return Array.from(new Set(combined));
  };

  const getPortalEmails = (supplier) => getSupplierPortalEmails(supplier);

  const normalizeContracts = (supplier) => {
    const contractsRaw = Array.isArray(supplier?.contracts) ? supplier.contracts : [];
    return contractsRaw.map((contract, index) => {
      const deliveryDays = Array.isArray(contract?.deliveryDays)
        ? contract.deliveryDays.map((day) => String(day || "").trim()).filter(Boolean)
        : [];
      return {
        id: String(contract?.id || `${supplier?.id || "supplier"}_${index}`).trim(),
        restaurantId: String(contract?.restaurantId || "").trim(),
        restaurantName: String(contract?.restaurantName || "").trim(),
        currency: String(contract?.currency || "UAH").trim(),
        contractNumber: String(contract?.contractNumber || "").trim(),
        terms: String(contract?.terms || "").trim(),
        deliveryLeadDays: Math.max(0, Math.round(toNumber(contract?.deliveryLeadDays || 0))),
        paymentDelayDays: Math.max(0, Math.round(toNumber(contract?.paymentDelayDays || 0))),
        deliveryDays: Array.from(new Set(deliveryDays)),
      };
    });
  };

  const getSupplierContracts = (supplier) => {
    const draftContracts = contractDrafts[supplier.id];
    if (Array.isArray(draftContracts)) return draftContracts;
    return normalizeContracts(supplier);
  };

  const saveSupplierContracts = async (supplier, contracts) => {
    const supplierId = String(supplier?.id || "").trim();
    const normalizedContracts = (Array.isArray(contracts) ? contracts : []).map((contract, index) => ({
      id: String(contract?.id || `${supplier?.id || "supplier"}_${Date.now()}_${index}`).trim(),
      restaurantId: String(contract?.restaurantId || "").trim(),
      restaurantName:
        String(
          restaurants.find((item) => String(item.id) === String(contract?.restaurantId || ""))?.name ||
          contract?.restaurantName ||
          ""
        ).trim(),
      currency: String(contract?.currency || "UAH").trim() || "UAH",
      contractNumber: String(contract?.contractNumber || "").trim(),
      terms: String(contract?.terms || "").trim(),
      deliveryLeadDays: Math.max(0, Math.round(toNumber(contract?.deliveryLeadDays || 0))),
      paymentDelayDays: Math.max(0, Math.round(toNumber(contract?.paymentDelayDays || 0))),
      deliveryDays: Array.from(new Set((Array.isArray(contract?.deliveryDays) ? contract.deliveryDays : []).map((day) => String(day || "").trim()).filter(Boolean))),
    }));

    const invalidContract = normalizedContracts.find((contract) => !String(contract.restaurantId || "").trim());
    if (invalidContract) {
      alert("Для кожного контракту потрібно обрати заклад перед збереженням.");
      return false;
    }

    const { id, ...payload } = supplier;
    setSavingContractSupplierId(supplierId);
    const result = await updateSupplier(id, {
      ...payload,
      contracts: normalizedContracts,
    });
    setSavingContractSupplierId("");
    if (!result.success) {
      alert(getErrorMessage(result.error, "Не вдалося зберегти контракти постачальника."));
      return false;
    }
    setContractDrafts((prev) => ({ ...prev, [supplier.id]: normalizedContracts }));
    alert("Контракти постачальника збережено.");
    return true;
  };

  const patchSupplierContract = (supplierId, contractId, patch) => {
    setContractDrafts((prev) => {
      const currentSupplier = suppliersById.get(String(supplierId || ""));
      const current = Array.isArray(prev[supplierId]) ? prev[supplierId] : normalizeContracts(currentSupplier);
      return {
        ...prev,
        [supplierId]: current.map((contract) => (
          String(contract.id) === String(contractId) ? { ...contract, ...patch } : contract
        )),
      };
    });
  };

  const addContract = (supplier) => {
    const nextContract = {
      id: `${supplier.id}_${Date.now()}`,
      restaurantId: "",
      restaurantName: "",
      currency: "UAH",
      contractNumber: "",
      terms: "",
      deliveryLeadDays: 0,
      paymentDelayDays: 0,
      deliveryDays: [],
    };

    setContractDrafts((prev) => {
      const current = Array.isArray(prev[supplier.id]) ? prev[supplier.id] : normalizeContracts(supplier);
      return {
        ...prev,
        [supplier.id]: [...current, nextContract],
      };
    });
  };

  const removeContract = (supplier, contractId) => {
    setContractDrafts((prev) => {
      const current = Array.isArray(prev[supplier.id]) ? prev[supplier.id] : normalizeContracts(supplier);
      return {
        ...prev,
        [supplier.id]: current.filter((contract) => String(contract.id) !== String(contractId)),
      };
    });
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

  const updateSupplierPortalEmails = async (supplier, nextEmails) => {
    const normalized = Array.from(new Set((nextEmails || []).map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)));
    const { id, ...payload } = supplier;
    const result = await updateSupplier(id, {
      ...payload,
      portalEmails: normalized,
      portalEmail: normalized[0] || "",
    });
    if (!result.success) {
      alert("Не вдалося оновити email-доступ постачальника.");
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

  const addPortalEmail = async (supplier) => {
    const draftValue = String(portalEmailDrafts[supplier.id] || "").trim().toLowerCase();
    if (!draftValue) return;
    const current = getPortalEmails(supplier);
    const exists = current.includes(draftValue);
    if (exists) {
      alert("Такий email уже додано.");
      return;
    }
    const updated = await updateSupplierPortalEmails(supplier, [...current, draftValue]);
    if (updated) {
      setPortalEmailDrafts((prev) => ({ ...prev, [supplier.id]: "" }));
    }
  };

  const removePortalEmail = async (supplier, email) => {
    const current = getPortalEmails(supplier);
    const next = current.filter((item) => item !== email);
    await updateSupplierPortalEmails(supplier, next);
  };

  useEffect(() => {
    setContractDrafts((prev) => {
      const next = { ...prev };
      suppliers.forEach((supplier) => {
        if (!Array.isArray(next[supplier.id])) {
          next[supplier.id] = normalizeContracts(supplier);
        }
      });
      return next;
    });
  }, [suppliers]);

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

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-slate-300 bg-slate-100">
              <th className="px-3 py-2 text-left font-semibold text-slate-700 w-40">Назва</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-700 w-24">Контракти</th>
              <th className="px-3 py-2 text-center font-semibold text-slate-700 w-24">Закладів</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700 w-32">Мін. сума</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700 min-w-48">Юр. особи</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700 w-20">Статус</th>
              {canManage && <th className="px-3 py-2 text-center font-semibold text-slate-700 w-32">Дії</th>}
            </tr>
          </thead>
          <tbody>
            {suppliers.map((item, supplierIndex) => {
              const legalEntities = getLegalEntities(item);
              const contracts = getSupplierContracts(item);
              const isContractsExpanded = isSupplierContractsExpanded(item.id);
              const sortedContracts = [...contracts].sort((left, right) => getContractRestaurantLabel(left).localeCompare(getContractRestaurantLabel(right), "uk"));
              const uniqueContractRestaurants = new Set(
                contracts.map((contract) => String(contract.restaurantName || contract.restaurantId || "").trim()).filter(Boolean)
              );

              return (
                <Fragment key={item.id}>
                  <tr className={`border-b border-slate-200 ${supplierIndex % 2 === 0 ? "bg-white" : "bg-slate-50"} hover:bg-blue-50 cursor-pointer`} onClick={() => toggleSupplierContracts(item.id)}>
                    <td className="px-3 py-2.5 font-semibold text-slate-900">{item.name}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex items-center justify-center rounded-full bg-indigo-100 px-2 py-0.5 font-semibold text-indigo-700">
                        {contracts.length}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                        {uniqueContractRestaurants.size}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-800">
                      {canManage ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-28 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-900"
                          value={Object.prototype.hasOwnProperty.call(minimumOrderDrafts, item.id) ? minimumOrderDrafts[item.id] : String(toNumber(item.minimumOrderAmount || 0))}
                          onChange={(e) => setMinimumOrderDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          onBlur={() => saveMinimumOrderAmount(item)}
                        />
                      ) : (
                        <span className="font-semibold">{formatMoney(item.minimumOrderAmount || 0)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {legalEntities.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {legalEntities.map((entity) => (
                            <span key={`${item.id}_${entity}`} className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
                              {entity}
                              {canManage && (
                                <button
                                  type="button"
                                  className="ml-0.5 font-bold text-rose-600 hover:text-rose-500"
                                  onClick={() => removeLegalEntity(item, entity)}
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500">Не додано</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                        {item.isActive ? "Активний" : "Вимкнений"}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                            onClick={() => toggleActive(item)}
                          >
                            {item.isActive ? "Вимк" : "Увім"}
                          </button>
                          <button
                            type="button"
                            className="rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-100"
                            onClick={() => removeSupplier(item.id)}
                          >
                            ×
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>

                  {isContractsExpanded && (
                    <tr className="border-b border-slate-200">
                      <td colSpan={canManage ? 7 : 6} className="bg-slate-50 px-3 py-3">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              {canManage && (
                                <div className="mb-2 space-y-2">
                                  <div className="flex flex-col gap-1.5 sm:flex-row">
                                    <input
                                      className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                                      value={legalEntityDrafts[item.id] || ""}
                                      onChange={(e) => setLegalEntityDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                      placeholder="Додати юрособу: ТОВ/ФОП..."
                                    />
                                    <button
                                      type="button"
                                      className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                      onClick={() => addLegalEntity(item)}
                                    >
                                      Додати
                                    </button>
                                  </div>
                                  <div className="flex flex-col gap-1.5 sm:flex-row">
                                    <input
                                      className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                                      value={portalEmailDrafts[item.id] || ""}
                                      onChange={(e) => setPortalEmailDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                      placeholder="Email доступу до порталу постачальника"
                                    />
                                    <button
                                      type="button"
                                      className="rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                                      onClick={() => addPortalEmail(item)}
                                    >
                                      Додати email
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {getPortalEmails(item).length > 0 ? getPortalEmails(item).map((email) => (
                                      <span key={`${item.id}_${email}`} className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-700">
                                        {email}
                                        <button
                                          type="button"
                                          className="font-bold text-rose-600 hover:text-rose-500"
                                          onClick={() => removePortalEmail(item, email)}
                                        >
                                          ×
                                        </button>
                                      </span>
                                    )) : (
                                      <span className="text-[11px] text-slate-500">Email доступу до порталу ще не додано.</span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                className="rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                                onClick={() => addContract(item)}
                              >
                                + Контракт
                              </button>
                              {canManage && (
                                <button
                                  type="button"
                                  className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                  disabled={savingContractSupplierId === String(item.id || "")}
                                  onClick={() => {
                                    void saveSupplierContracts(item, getSupplierContracts(item));
                                  }}
                                >
                                  {savingContractSupplierId === String(item.id || "") ? "Збереження..." : "Зберегти"}
                                </button>
                              )}
                            </div>
                          </div>

                          {contracts.length === 0 ? (
                            <div className="text-xs text-slate-500">Контракти ще не додані.</div>
                          ) : (
                            <div className="overflow-x-auto rounded border border-slate-300 bg-white">
                              <table className="w-full text-[11px]">
                                <thead className="border-b border-slate-200 bg-slate-100">
                                  <tr>
                                    <th className="px-2 py-1.5 text-left font-semibold text-slate-700">Заклад</th>
                                    <th className="px-2 py-1.5 text-left font-semibold text-slate-700">Контракт №</th>
                                    <th className="px-2 py-1.5 text-center font-semibold text-slate-700 w-16">Валюта</th>
                                    <th className="px-2 py-1.5 text-center font-semibold text-slate-700 w-16">Поставка</th>
                                    <th className="px-2 py-1.5 text-center font-semibold text-slate-700 w-16">Відстрочка</th>
                                    <th className="px-2 py-1.5 text-left font-semibold text-slate-700 flex-1">Графік / Умови</th>
                                    <th className="px-2 py-1.5 text-center font-semibold text-slate-700 w-12">Дії</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sortedContracts.map((contract, contractIndex) => {
                                    const rowExpanded = isContractRowExpanded(item.id, contract.id);
                                    return (
                                      <Fragment key={contract.id}>
                                        <tr className={`border-b border-slate-200 ${contractIndex % 2 === 0 ? "bg-white" : "bg-slate-50"} hover:bg-blue-50 cursor-pointer`} onClick={() => toggleContractRow(item.id, contract.id)}>
                                          <td className="px-2 py-1 text-slate-900">
                                            <span className="font-semibold">{getContractRestaurantLabel(contract)}</span>
                                          </td>
                                          <td className="px-2 py-1 text-slate-700">{contract.contractNumber || "-"}</td>
                                          <td className="px-2 py-1 text-center text-slate-700">{contract.currency || "UAH"}</td>
                                          <td className="px-2 py-1 text-center text-slate-700">{Math.max(0, Math.round(toNumber(contract.deliveryLeadDays || 0)))} дн.</td>
                                          <td className="px-2 py-1 text-center text-slate-700">{Math.max(0, Math.round(toNumber(contract.paymentDelayDays || 0)))} дн.</td>
                                          <td className="px-2 py-1 text-slate-700">
                                            <div className="flex flex-wrap gap-0.5">
                                              {contract.deliveryDays && contract.deliveryDays.length > 0 ? (
                                                <span className="text-[10px] text-slate-600">
                                                  {formatContractDays(contract.deliveryDays)}
                                                </span>
                                              ) : (
                                                <span className="text-[10px] text-slate-500">Не вказано</span>
                                              )}
                                              {contract.terms && (
                                                <span className="ml-1 text-[10px] text-slate-600 italic">• {contract.terms}</span>
                                              )}
                                            </div>
                                          </td>
                                          <td className="px-2 py-1 text-center text-slate-400">
                                            <span className="text-[10px]">{rowExpanded ? "⬆" : "⬇"}</span>
                                          </td>
                                        </tr>

                                        {rowExpanded && (
                                          <tr className="bg-indigo-50">
                                            <td colSpan={7} className="px-3 py-2.5">
                                              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
                                                <div>
                                                  <label className="text-[10px] font-semibold text-slate-700">Заклад</label>
                                                  <select
                                                    className="mt-0.5 w-full rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px]"
                                                    value={contract.restaurantId}
                                                    onChange={(e) => patchSupplierContract(item.id, contract.id, { restaurantId: e.target.value, restaurantName: restaurants.find((restaurant) => String(restaurant.id) === String(e.target.value))?.name || "" })}
                                                  >
                                                    <option value="">Оберіть заклад</option>
                                                    {restaurants.map((restaurant) => (
                                                      <option key={`${item.id}_${contract.id}_${restaurant.id}`} value={restaurant.id}>{restaurant.name}</option>
                                                    ))}
                                                  </select>
                                                </div>
                                                <div>
                                                  <label className="text-[10px] font-semibold text-slate-700">Валюта</label>
                                                  <select
                                                    className="mt-0.5 w-full rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px]"
                                                    value={contract.currency}
                                                    onChange={(e) => patchSupplierContract(item.id, contract.id, { currency: e.target.value })}
                                                  >
                                                    <option value="UAH">UAH</option>
                                                    <option value="USD">USD</option>
                                                    <option value="EUR">EUR</option>
                                                  </select>
                                                </div>
                                                <div>
                                                  <label className="text-[10px] font-semibold text-slate-700">Номер контракту</label>
                                                  <input
                                                    className="mt-0.5 w-full rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px]"
                                                    value={contract.contractNumber}
                                                    onChange={(e) => patchSupplierContract(item.id, contract.id, { contractNumber: e.target.value })}
                                                  />
                                                </div>
                                                <div>
                                                  <label className="text-[10px] font-semibold text-slate-700">Термін поставки, днів</label>
                                                  <input
                                                    type="number"
                                                    min="0"
                                                    className="mt-0.5 w-full rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px]"
                                                    value={contract.deliveryLeadDays}
                                                    onChange={(e) => patchSupplierContract(item.id, contract.id, { deliveryLeadDays: e.target.value })}
                                                  />
                                                </div>
                                              </div>

                                              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                                                <div>
                                                  <label className="text-[10px] font-semibold text-slate-700">Умови поставки</label>
                                                  <input
                                                    className="mt-0.5 w-full rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px]"
                                                    value={contract.terms}
                                                    onChange={(e) => patchSupplierContract(item.id, contract.id, { terms: e.target.value })}
                                                    placeholder="Напр. до 11:00"
                                                  />
                                                </div>
                                                <div>
                                                  <label className="text-[10px] font-semibold text-slate-700">Відстрочка платежу, днів</label>
                                                  <input
                                                    type="number"
                                                    min="0"
                                                    className="mt-0.5 w-full rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px]"
                                                    value={contract.paymentDelayDays}
                                                    onChange={(e) => patchSupplierContract(item.id, contract.id, { paymentDelayDays: e.target.value })}
                                                  />
                                                </div>
                                                <div>
                                                  <label className="text-[10px] font-semibold text-slate-700">Видалити контракт</label>
                                                  <button
                                                    type="button"
                                                    className="mt-0.5 w-full rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                                                    onClick={() => removeContract(item, contract.id)}
                                                  >
                                                    Видалити
                                                  </button>
                                                </div>
                                              </div>

                                              <div className="mt-2">
                                                <p className="text-[10px] font-semibold text-slate-700 mb-1">Графік поставок</p>
                                                <div className="flex flex-wrap gap-1">
                                                  {DELIVERY_WEEK_DAYS.map((day) => {
                                                    const checked = (contract.deliveryDays || []).includes(day.id);
                                                    return (
                                                      <label key={`${contract.id}_${day.id}`} className="inline-flex items-center gap-0.5 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] cursor-pointer hover:bg-indigo-50">
                                                        <input
                                                          type="checkbox"
                                                          checked={checked}
                                                          onChange={(e) => {
                                                            const current = new Set(contract.deliveryDays || []);
                                                            if (e.target.checked) current.add(day.id);
                                                            else current.delete(day.id);
                                                            patchSupplierContract(item.id, contract.id, { deliveryDays: Array.from(current) });
                                                          }}
                                                        />
                                                        {day.label}
                                                      </label>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            </td>
                                          </tr>
                                        )}
                                      </Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {suppliers.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-slate-500">
            Постачальники ще не додані.
          </div>
        )}
      </div>
    </div>
  );
}

function TypicalFieldsTab({ fields, categories = [], accounts = [], canManage, createTypicalField, updateTypicalField, removeTypicalField }) {
  const [type, setType] = useState("category");
  const [name, setName] = useState("");
  const [subcategoryCategory, setSubcategoryCategory] = useState("");
  const [managerCategory, setManagerCategory] = useState("");
  const [managerUserId, setManagerUserId] = useState("");

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

  const categoryManagers = useMemo(
    () => fields.filter((item) => item.type === "categoryManager" && item.isActive !== false),
    [fields]
  );

  const assignManagerToCategory = async () => {
    if (!managerCategory) {
      alert("Оберіть групу товарів.");
      return;
    }
    if (!managerUserId) {
      alert("Оберіть менеджера.");
      return;
    }

    const manager = accounts.find((item) => String(item.id || "") === String(managerUserId));
    if (!manager) {
      alert("Не знайдено обраного менеджера.");
      return;
    }

    const existing = categoryManagers.find((item) => String(item.categoryName || "") === String(managerCategory));
    const payload = {
      type: "categoryManager",
      name: String(manager.displayName || manager.fullName || manager.email || "").trim(),
      managerUserId: String(manager.id || ""),
      managerEmail: String(manager.email || "").trim(),
      categoryName: String(managerCategory || "").trim(),
      isActive: true,
    };

    if (existing?.id) {
      const { id, ...existingPayload } = existing;
      const result = await updateTypicalField(id, { ...existingPayload, ...payload });
      if (!result.success) {
        alert("Не вдалося оновити відповідального менеджера.");
        return;
      }
    } else {
      const result = await createTypicalField(payload);
      if (!result.success) {
        alert("Не вдалося призначити менеджера.");
        return;
      }
    }

    setManagerCategory("");
    setManagerUserId("");
  };

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

      {canManage && (
        <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <p className="mb-2 text-sm font-semibold text-indigo-900">Відповідальний менеджер за групу товарів</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <select className={inputClass} value={managerCategory} onChange={(e) => setManagerCategory(e.target.value)}>
              <option value="">Оберіть групу товарів</option>
              {categories.map((category) => (
                <option key={`manager_category_${category}`} value={category}>{category}</option>
              ))}
            </select>
            <select className={inputClass} value={managerUserId} onChange={(e) => setManagerUserId(e.target.value)}>
              <option value="">Оберіть акаунт менеджера</option>
              {accounts.map((account) => (
                <option key={`manager_account_${account.id}`} value={account.id}>
                  {account.displayName || account.fullName || account.email || account.id}
                </option>
              ))}
            </select>
            <button type="button" onClick={assignManagerToCategory} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
              Призначити
            </button>
          </div>

          <div className="mt-3 overflow-x-auto rounded-lg border border-indigo-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-indigo-50 text-indigo-900">
                <tr>
                  <th className="px-2 py-1 text-left">Група товарів</th>
                  <th className="px-2 py-1 text-left">Менеджер</th>
                  <th className="px-2 py-1 text-left">Email</th>
                  <th className="px-2 py-1 text-left">Дія</th>
                </tr>
              </thead>
              <tbody>
                {categoryManagers.map((item) => (
                  <tr key={item.id} className="border-t border-indigo-100">
                    <td className="px-2 py-1">{item.categoryName || "-"}</td>
                    <td className="px-2 py-1">{item.name || "-"}</td>
                    <td className="px-2 py-1">{item.managerEmail || "-"}</td>
                    <td className="px-2 py-1">
                      <button type="button" className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700" onClick={() => removeTypicalField(item.id)}>
                        Видалити
                      </button>
                    </td>
                  </tr>
                ))}
                {categoryManagers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-3 text-center text-slate-500">Призначень ще немає.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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

function OrderAplTab({ products, restaurants, typicalFields, user, canManage, createTypicalField, updateTypicalField }) {
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [expandedAplGroups, setExpandedAplGroups] = useState({});
  const [expandedAplGreenCards, setExpandedAplGreenCards] = useState({});
  const [aplCellOverrides, setAplCellOverrides] = useState({});

  const canManageApl = canManage || hasProcurementAccess(user) || isGlobalAdminUser(user);

  const assignmentRecords = useMemo(
    () => (typicalFields || []).filter((item) => String(item?.type || "") === "aplAssignment"),
    [typicalFields]
  );

  const allRestaurantIds = useMemo(
    () => restaurants.map((item) => String(item.id || "")).filter(Boolean),
    [restaurants]
  );

  useEffect(() => {
    if (selectedRestaurantIds.length > 0) return;
    setSelectedRestaurantIds(allRestaurantIds);
  }, [allRestaurantIds, selectedRestaurantIds.length]);

  const makeAssignmentCoreKey = (entry) => [
    String(entry?.restaurantId || "").trim().toLowerCase(),
    String(entry?.greenCardName || "").trim().toLowerCase(),
    String(entry?.whiteCardName || "").trim().toLowerCase(),
    String(entry?.code1C || "").trim().toLowerCase(),
  ].join("::");

  const assignmentsByCoreKey = useMemo(() => {
    const map = new Map();
    assignmentRecords.forEach((item) => {
      const key = makeAssignmentCoreKey(item);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(item);
    });
    return map;
  }, [assignmentRecords]);

  const matrixRows = useMemo(() => {
    const byKey = new Map();
    (products || []).forEach((product) => {
      const whiteCardName = String(product?.whiteCardName || product?.name || "").trim();
      const greenCardName = String(product?.greenCardName || product?.subcategory || "").trim();
      const productGroup = String(product?.category || "").trim();
      const code1C = String(product?.code1C || "").trim();
      if (!whiteCardName || !greenCardName) return;

      const rowKey = [
        productGroup.toLowerCase(),
        greenCardName.toLowerCase(),
        whiteCardName.toLowerCase(),
        code1C.toLowerCase(),
      ].join("::");

      if (!byKey.has(rowKey)) {
        byKey.set(rowKey, {
          key: rowKey,
          greenCardName,
          whiteCardName,
          productGroup,
          code1C,
          unit: String(product?.unit || "").trim(),
          suppliers: new Set(),
        });
      }

      const row = byKey.get(rowKey);
      const supplier = String(product?.supplier || "").trim();
      if (supplier) {
        row.suppliers.add(supplier);
      }
    });

    return Array.from(byKey.values())
      .map((row) => ({
        ...row,
        supplierList: Array.from(row.suppliers.values()).sort((a, b) => a.localeCompare(b, "uk")),
      }))
      .map((row) => ({
        ...row,
        supplier: row.supplierList.join(", "),
      }))
      .sort((a, b) => {
        const byGroup = String(a.productGroup || "").localeCompare(String(b.productGroup || ""), "uk");
        if (byGroup !== 0) return byGroup;
        const byGreen = String(a.greenCardName || "").localeCompare(String(b.greenCardName || ""), "uk");
        if (byGreen !== 0) return byGreen;
        return String(a.whiteCardName || "").localeCompare(String(b.whiteCardName || ""), "uk");
      });
  }, [products]);

  const suppliers = useMemo(
    () => Array.from(new Set(matrixRows.flatMap((item) => item.supplierList || []).filter(Boolean))).sort((a, b) => a.localeCompare(b, "uk")),
    [matrixRows]
  );

  const groups = useMemo(
    () => Array.from(new Set(matrixRows.map((item) => item.productGroup).filter(Boolean))).sort((a, b) => a.localeCompare(b, "uk")),
    [matrixRows]
  );

  const filteredRows = useMemo(() => {
    const normalizedSearch = String(searchTerm || "").trim().toLowerCase();
    return matrixRows.filter((row) => {
      const bySearch = normalizedSearch
        ? [row.greenCardName, row.whiteCardName, row.code1C, row.supplier, row.productGroup]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch)
        : true;
      const bySupplier = supplierFilter ? (row.supplierList || []).includes(supplierFilter) : true;
      const byGroup = groupFilter ? String(row.productGroup || "") === groupFilter : true;
      return bySearch && bySupplier && byGroup;
    });
  }, [matrixRows, searchTerm, supplierFilter, groupFilter]);

  const groupedRows = useMemo(() => {
    const byGroup = new Map();
    filteredRows.forEach((row) => {
      const groupName = String(row.productGroup || "Без групи").trim() || "Без групи";
      if (!byGroup.has(groupName)) {
        byGroup.set(groupName, new Map());
      }

      const byGreen = byGroup.get(groupName);
      const greenName = String(row.greenCardName || "Без зеленої картки").trim() || "Без зеленої картки";
      if (!byGreen.has(greenName)) {
        byGreen.set(greenName, []);
      }
      byGreen.get(greenName).push(row);
    });

    return Array.from(byGroup.entries())
      .sort(([left], [right]) => left.localeCompare(right, "uk"))
      .map(([groupName, byGreen]) => ({
        groupName,
        greenCards: Array.from(byGreen.entries())
          .sort(([left], [right]) => left.localeCompare(right, "uk"))
          .map(([greenCardName, rows]) => ({
            greenCardName,
            rows: [...rows].sort((left, right) => String(left.whiteCardName || "").localeCompare(String(right.whiteCardName || ""), "uk")),
          })),
      }));
  }, [filteredRows]);

  const activeRestaurantIds = selectedRestaurantIds.length > 0 ? selectedRestaurantIds : allRestaurantIds;
  const visibleRestaurants = restaurants.filter((item) => activeRestaurantIds.includes(String(item.id || "")));

  const toggleRestaurantFilter = (restaurantId) => {
    const normalized = String(restaurantId || "");
    setSelectedRestaurantIds((prev) => {
      const current = new Set(prev);
      if (current.has(normalized)) current.delete(normalized);
      else current.add(normalized);
      return Array.from(current);
    });
  };

  const isAplGroupExpanded = (groupName) => Boolean(
    Object.prototype.hasOwnProperty.call(expandedAplGroups, groupName)
      ? expandedAplGroups[groupName]
      : false
  );

  const isAplGreenExpanded = (groupName, greenCardName) => {
    const key = `${groupName}::${greenCardName}`;
    return Boolean(
      Object.prototype.hasOwnProperty.call(expandedAplGreenCards, key)
        ? expandedAplGreenCards[key]
        : false
    );
  };

  const toggleAplGroup = (groupName) => {
    setExpandedAplGroups((prev) => ({
      ...prev,
      [groupName]: !(Object.prototype.hasOwnProperty.call(prev, groupName) ? prev[groupName] : true),
    }));
  };

  const toggleAplGreenCard = (groupName, greenCardName) => {
    const key = `${groupName}::${greenCardName}`;
    setExpandedAplGreenCards((prev) => ({
      ...prev,
      [key]: !(Object.prototype.hasOwnProperty.call(prev, key) ? prev[key] : true),
    }));
  };

  const getCellState = (row, restaurant) => {
    const key = makeAssignmentCoreKey({
      restaurantId: restaurant.id,
      greenCardName: row.greenCardName,
      whiteCardName: row.whiteCardName,
      code1C: row.code1C,
    });
    const records = assignmentsByCoreKey.get(key) || [];
    const assignedFromDb = records.some((record) => record?.isActive !== false);
    const hasOverride = Object.prototype.hasOwnProperty.call(aplCellOverrides, key);
    return {
      key,
      records,
      assigned: hasOverride ? Boolean(aplCellOverrides[key]) : assignedFromDb,
    };
  };

  const toggleAssignment = async (row, restaurant) => {
    if (!canManageApl) return;

    const payload = {
      type: "aplAssignment",
      name: `${row.greenCardName} / ${row.whiteCardName}`,
      categoryName: String(row.productGroup || "").trim(),
      productGroup: String(row.productGroup || "").trim(),
      supplier: String(row.supplier || "").trim(),
      code1C: String(row.code1C || "").trim(),
      whiteCardName: String(row.whiteCardName || "").trim(),
      greenCardName: String(row.greenCardName || "").trim(),
      unit: String(row.unit || "").trim(),
      restaurantId: String(restaurant?.id || "").trim(),
      restaurantName: String(restaurant?.name || "").trim(),
      restaurantRegNumber: String(restaurant?.regNumber || "").trim(),
      restaurantLookupKey: buildRestaurantLookupKey(restaurant || {}),
      isActive: true,
    };

    const cellState = getCellState(row, restaurant);
    const nextActive = !cellState.assigned;
    setAplCellOverrides((prev) => ({
      ...prev,
      [cellState.key]: nextActive,
    }));

    if (cellState.records.length > 0) {
      const results = await Promise.all(
        cellState.records
          .filter((record) => record?.id)
          .map((record) => {
            const { id, ...existingPayload } = record;
            return updateTypicalField(id, {
              ...existingPayload,
              ...payload,
              isActive: nextActive,
            });
          })
      );

      if (results.some((result) => !result?.success)) {
        setAplCellOverrides((prev) => ({
          ...prev,
          [cellState.key]: cellState.assigned,
        }));
        alert("Не вдалося оновити призначення APL.");
      }
      return;
    }

    const result = await createTypicalField(payload);
    if (!result.success) {
      setAplCellOverrides((prev) => ({
        ...prev,
        [cellState.key]: cellState.assigned,
      }));
      alert("Не вдалося створити призначення APL.");
    }
  };

  return (
    <div className={cardClass}>
      <div className="mb-4 flex items-center gap-2">
        <Package size={18} className="text-indigo-600" />
        <h2 className="text-lg font-semibold">APL (OrderAPL): призначення білих карток по ресторанах</h2>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        У верхньому рівні використовується зелена картка, всередині неї білі картки. Відмітка в матриці визначає, яка біла картка доступна для конкретного закладу.
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label className="text-sm font-semibold text-slate-800">Пошук</label>
          <input className={inputClass} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Зелена/біла картка, код 1С, постачальник" />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Постачальник</label>
          <select className={inputClass} value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
            <option value="">Всі постачальники</option>
            {suppliers.map((supplier) => (
              <option key={`apl_supplier_${supplier}`} value={supplier}>{supplier}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Група товарів</label>
          <select className={inputClass} value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="">Всі групи</option>
            {groups.map((group) => (
              <option key={`apl_group_${group}`} value={group}>{group}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-sm font-semibold text-slate-800">Фільтр закладів</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            onClick={() => setSelectedRestaurantIds(allRestaurantIds)}
          >
            Всі
          </button>
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            onClick={() => setSelectedRestaurantIds([])}
          >
            Очистити
          </button>
          {restaurants.map((restaurant) => {
            const active = activeRestaurantIds.includes(String(restaurant.id || ""));
            return (
              <button
                key={`apl_restaurant_filter_${restaurant.id}`}
                type="button"
                onClick={() => toggleRestaurantFilter(restaurant.id)}
                className={`rounded border px-2 py-1 text-xs font-semibold ${active ? "border-indigo-400 bg-indigo-100 text-indigo-800" : "border-slate-300 bg-white text-slate-700"}`}
              >
                {restaurant.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="w-28 px-2 py-2 text-left">Зелена картка</th>
              <th className="w-44 px-2 py-2 text-left">Біла картка</th>
              <th className="w-28 px-2 py-2 text-left">Група товарів</th>
              <th className="w-40 px-2 py-2 text-left">Постачальник</th>
              <th className="w-24 px-2 py-2 text-left">Код 1С</th>
              {visibleRestaurants.map((restaurant) => (
                <th key={`apl_header_${restaurant.id}`} className="h-14 w-16 border-l border-slate-200 px-1 py-1 text-center align-middle">
                  <div className="break-words text-[11px] font-semibold leading-3 text-slate-700">
                    {restaurant.name}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedRows.map((groupNode) => {
              const groupExpanded = isAplGroupExpanded(groupNode.groupName);
              return (
                <Fragment key={`apl_group_${groupNode.groupName}`}>
                  <tr className="border-t border-slate-300 bg-slate-100">
                    <td colSpan={5 + visibleRestaurants.length} className="px-2 py-1.5 text-sm font-semibold text-slate-900">
                      <button type="button" className="inline-flex items-center gap-2" onClick={() => toggleAplGroup(groupNode.groupName)}>
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                          {groupExpanded ? "−" : "+"}
                        </span>
                        {groupNode.groupName}
                      </button>
                    </td>
                  </tr>

                  {groupExpanded && groupNode.greenCards.map((greenNode) => {
                    const greenExpanded = isAplGreenExpanded(groupNode.groupName, greenNode.greenCardName);
                    return (
                      <Fragment key={`apl_green_${groupNode.groupName}_${greenNode.greenCardName}`}>
                        <tr className="border-t border-dashed border-slate-300 bg-slate-50">
                          <td colSpan={5 + visibleRestaurants.length} className="px-2 py-1.5 text-sm text-slate-800">
                            <button type="button" className="inline-flex items-center gap-2" onClick={() => toggleAplGreenCard(groupNode.groupName, greenNode.greenCardName)}>
                              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                                {greenExpanded ? "−" : "+"}
                              </span>
                              <span className="font-semibold">{greenNode.greenCardName}</span>
                              <span className="text-xs text-slate-500">{greenNode.rows.length} білих карток</span>
                            </button>
                          </td>
                        </tr>

                        {greenExpanded && greenNode.rows.map((row) => (
                          <tr key={`apl_row_${row.key}`} className="border-t border-dashed border-slate-200">
                            <td className="px-2 py-1.5 text-xs text-slate-500">{row.greenCardName}</td>
                            <td className="px-2 py-1.5 font-medium text-slate-900">{row.whiteCardName}</td>
                            <td className="px-2 py-1.5">{row.productGroup || "-"}</td>
                            <td className="px-2 py-1.5 text-xs leading-4" title={row.supplier || "-"}>{row.supplier || "-"}</td>
                            <td className="px-2 py-1.5">{row.code1C || "-"}</td>
                            {visibleRestaurants.map((restaurant) => {
                              const cellState = getCellState(row, restaurant);
                              return (
                                <td key={`apl_cell_${row.key}_${restaurant.id}`} className="w-16 border-l border-slate-200 px-2 py-1.5 text-center">
                                  <input
                                    type="checkbox"
                                    checked={cellState.assigned}
                                    onChange={() => {
                                      void toggleAssignment(row, restaurant);
                                    }}
                                    disabled={!canManageApl}
                                    className="h-4 w-4 accent-indigo-600"
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}

            {groupedRows.length === 0 && (
              <tr>
                <td colSpan={5 + Math.max(1, visibleRestaurants.length)} className="px-3 py-6 text-center text-slate-500">
                  Немає даних для матриці APL. Спочатку імпортуйте шаблон 1С з білими/зеленими картками.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BookingTab({ products, orders, aplAssignments = [], createOrder, restaurants, user, suppliersDirectory = [] }) {
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

    const selectedRestaurant = restaurants.find((r) => String(r.id) === selectedRestaurantId) || null;
    const selectedRestaurantTokens = collectRestaurantTokens(selectedRestaurant || { id: selectedRestaurantId });
    const selectedRestaurantLookupKey = buildRestaurantLookupKey(selectedRestaurant || { id: selectedRestaurantId });

    const normalizeSupplierKey = (value) => String(value || "").trim().toLowerCase();
    const suppliersWithContracts = new Set();
    const suppliersMatchingRestaurantContract = new Set();

    (Array.isArray(suppliersDirectory) ? suppliersDirectory : []).forEach((supplierRecord) => {
      const supplierName = String(supplierRecord?.name || "").trim();
      const supplierKey = normalizeSupplierKey(supplierName);
      if (!supplierKey) return;

      const contracts = Array.isArray(supplierRecord?.contracts) ? supplierRecord.contracts : [];
      if (contracts.length === 0) return;

      suppliersWithContracts.add(supplierKey);
      const hasContractForRestaurant = contracts.some((contract) => {
        const contractLookupKey = String(contract?.restaurantLookupKey || "");
        if (contractLookupKey && contractLookupKey === selectedRestaurantLookupKey) return true;
        return hasRestaurantTokenOverlap(collectRestaurantTokens(contract || {}), selectedRestaurantTokens);
      });

      if (hasContractForRestaurant) {
        suppliersMatchingRestaurantContract.add(supplierKey);
      }
    });

    const shouldRestrictByContracts = suppliersWithContracts.size > 0;
    const isSupplierAllowedForRestaurant = (supplierName) => {
      const supplierKey = normalizeSupplierKey(supplierName);
      if (!supplierKey) return false;
      if (!shouldRestrictByContracts) return true;
      if (suppliersMatchingRestaurantContract.has(supplierKey)) return true;
      return !suppliersWithContracts.has(supplierKey);
    };

    const scopedProducts = products.filter((product) => {
      if (!product?.isActive) return false;
      return hasRestaurantTokenOverlap(collectRestaurantTokens(product || {}), selectedRestaurantTokens);
    });
    const scopedAssignments = (aplAssignments || []).filter(
      (entry) =>
        String(entry?.type || "") === "aplAssignment" &&
        entry?.isActive !== false &&
        (String(entry?.restaurantLookupKey || "") === selectedRestaurantLookupKey || hasRestaurantTokenOverlap(collectRestaurantTokens(entry || {}), selectedRestaurantTokens))
    );

    if (scopedAssignments.length === 0) {
      return scopedProducts;
    }

    const byGreenCard = new Map();
    scopedAssignments.forEach((assignment) => {
      const greenCardName = String(assignment?.greenCardName || "").trim();
      const whiteCardName = String(assignment?.whiteCardName || "").trim();
      const code1C = String(assignment?.code1C || "").trim();
      if (!greenCardName) return;

      const key = [greenCardName.toLowerCase()].join("::");
      if (!byGreenCard.has(key)) {
        byGreenCard.set(key, {
          id: `apl::${selectedRestaurantId}::${key}`,
          name: greenCardName,
          category: String(assignment?.productGroup || assignment?.categoryName || "").trim(),
          supplier: "",
          suppliers: new Set(),
          unit: String(assignment?.unit || "").trim(),
          unitPrice: 0,
          restaurantId: selectedRestaurantId,
          isActive: true,
          whiteCards: [],
        });
      }

      const row = byGreenCard.get(key);
      const assignmentSupplier = String(assignment?.supplier || "").trim();
      if (assignmentSupplier && isSupplierAllowedForRestaurant(assignmentSupplier)) {
        row.suppliers.add(assignmentSupplier);
      }
      const matchedProduct = scopedProducts.find((product) => {
        const productCode = String(product?.code1C || "").trim().toLowerCase();
        const assignmentCode = code1C.toLowerCase();
        const productName = String(product?.name || product?.whiteCardName || "").trim().toLowerCase();
        const assignmentWhiteName = whiteCardName.toLowerCase();
        if (assignmentCode && productCode) return assignmentCode === productCode;
        return assignmentWhiteName && productName && assignmentWhiteName === productName;
      });

      if (matchedProduct) {
        const matchedSupplier = String(matchedProduct.supplier || assignmentSupplier).trim();
        if (matchedSupplier && isSupplierAllowedForRestaurant(matchedSupplier)) {
          row.suppliers.add(matchedSupplier);
          row.whiteCards.push({
            id: matchedProduct.id,
            name: matchedProduct.name,
            code1C: matchedProduct.code1C || code1C,
            unitPrice: toNumber(matchedProduct.unitPrice),
            unit: matchedProduct.unit || row.unit,
            supplier: matchedSupplier,
          });
        }
      } else {
        if (assignmentSupplier && isSupplierAllowedForRestaurant(assignmentSupplier)) {
          row.whiteCards.push({
            id: `aplwhite::${selectedRestaurantId}::${code1C || whiteCardName}`,
            name: whiteCardName,
            code1C,
            unitPrice: toNumber(assignment?.unitPrice || 0),
            unit: String(assignment?.unit || "").trim(),
            supplier: assignmentSupplier,
          });
        }
      }
    });

    return Array.from(byGreenCard.values()).map((item) => {
      const prices = item.whiteCards.map((card) => toNumber(card.unitPrice)).filter((price) => price > 0);
      const avgPrice = prices.length > 0 ? prices.reduce((sum, price) => sum + price, 0) / prices.length : 0;
      const supplierList = Array.from(item.suppliers.values()).sort((a, b) => a.localeCompare(b, "uk"));
      return {
        ...item,
        supplier: supplierList[0] || "",
        supplierList,
        unitPrice: avgPrice,
        unit: item.unit || item.whiteCards.find((card) => card.unit)?.unit || "",
      };
    }).filter((item) => item.whiteCards.length > 0 || (item.supplierList || []).length > 0);
  }, [products, aplAssignments, restaurantId, suppliersDirectory, restaurants]);

  const availableCategories = useMemo(() => {
    return Array.from(new Set(activeProducts.map((product) => product.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "uk"));
  }, [activeProducts]);

  const availableSuppliers = useMemo(() => {
    return Array.from(
      new Set(
        activeProducts.flatMap((product) => {
          if (Array.isArray(product.supplierList) && product.supplierList.length > 0) {
            return product.supplierList;
          }
          return product.supplier ? [product.supplier] : [];
        }).filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "uk"));
  }, [activeProducts]);

  const isAplOrderingMode = useMemo(
    () => activeProducts.some((product) => String(product.id || "").startsWith("apl::")),
    [activeProducts]
  );

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
      const bySupplier = supplierFilter
        ? (Array.isArray(product.supplierList) && product.supplierList.length > 0
            ? product.supplierList.includes(supplierFilter)
            : product.supplier === supplierFilter)
        : true;
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
          whiteCards: Array.isArray(product.whiteCards) ? product.whiteCards : [],
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
          aplWhiteCards: Array.isArray(product.whiteCards) ? product.whiteCards : [],
          isAplLine: String(product.id || "").startsWith("apl::"),
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

        {isAplOrderingMode && (
          <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
            Режим APL активний: для замовлення доступні зелені картки, сформовані з призначень білих карток по ресторану.
          </div>
        )}

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
                <th className="px-3 py-2 text-left">Категорія</th>
                <th className="px-3 py-2 text-left">Зелена картка</th>
                <th className="px-3 py-2 text-left">Од. вим.</th>
                <th className="px-3 py-2 text-left">Ціна за од.</th>
                <th className="px-3 py-2 text-left">Кількість</th>
                <th className="px-3 py-2 text-left">Сума</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map((product) => (
                <tr key={product.id} className="border-t border-slate-200">
                  <td className="px-3 py-2">{product.category}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{product.name}</td>
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
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
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
                  <td className="px-3 py-2">{formatDateTimeSafe(order.createdAt)}</td>
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

function OrdersManagementTab({ orders, updateOrder, deleteOrder, createSupplierDispatch, canManageOrders, user }) {
  const isGlobalAdmin = isGlobalAdminUser(user);
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
  const [editingOrder, setEditingOrder] = useState(null);

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

  const supplierResponseIssues = useMemo(() => {
    const rows = [];
    for (const order of visibleOrders) {
      for (const item of order.items || []) {
        if (!item?.sentToSupplier) continue;
        const responseStatus = getSupplierResponseStatus(item);
        if (!["pending", "partial", "unavailable"].includes(responseStatus)) continue;
        rows.push({
          orderId: order.id,
          restaurantName: order.restaurantName || "Без закладу",
          requiredDate: order.requiredDate || "",
          supplier: item.supplier || "Без постачальника",
          productName: item.productName || "Без назви",
          requestedQty: toNumber(item.qty),
          responseQty: toNumber(item.supplierResponseQty),
          unit: item.unit || "",
          status: responseStatus,
          comment: String(item.supplierResponseComment || "").trim(),
          respondedAt: item.supplierRespondedAt || "",
        });
      }
    }
    return rows.sort((left, right) => {
      const priority = { unavailable: 0, partial: 1, pending: 2 };
      const statusDiff = (priority[left.status] ?? 9) - (priority[right.status] ?? 9);
      if (statusDiff !== 0) return statusDiff;
      return String(left.requiredDate || "").localeCompare(String(right.requiredDate || ""));
    });
  }, [visibleOrders]);

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

  const updateStatus = async (order, status) => {
    const { id, ...payload } = order;
    const result = await updateOrder(id, { ...payload, status });
    if (!result.success) {
      alert("Не вдалося оновити статус заявки.");
    }
  };

  const openEditOrder = (order) => {
    const items = Array.isArray(order?.items)
      ? order.items.map((item, index) => ({
          id: `${order?.id || "order"}_${item?.productId || item?.productName || index}`,
          productId: item?.productId || "",
          productName: item?.productName || "",
          supplier: item?.supplier || "",
          unit: item?.unit || "",
          code1C: item?.code1C || "",
          qty: String(toNumber(item?.qty) || ""),
          unitPrice: String(toNumber(item?.unitPrice) || ""),
        }))
      : [];

    setEditingOrder({
      id: order?.id,
      restaurantName: order?.restaurantName || "",
      requiredDate: String(order?.requiredDate || ""),
      comment: String(order?.comment || ""),
      status: String(order?.status || "new"),
      items,
    });
  };

  const updateEditingOrderItem = (itemId, patch) => {
    setEditingOrder((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) => (String(item.id) === String(itemId) ? { ...item, ...patch } : item)),
      };
    });
  };

  const removeEditingOrderItem = (itemId) => {
    setEditingOrder((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.filter((item) => String(item.id) !== String(itemId)),
      };
    });
  };

  const saveEditingOrder = async () => {
    if (!editingOrder?.id) return;

    const normalizedItems = (editingOrder.items || [])
      .map((item) => {
        const qty = toNumber(item.qty);
        const unitPrice = toNumber(item.unitPrice);
        if (qty <= 0) return null;
        return {
          productId: item.productId,
          productName: item.productName,
          supplier: item.supplier,
          unit: item.unit,
          code1C: item.code1C,
          qty,
          unitPrice,
          amount: qty * unitPrice,
        };
      })
      .filter(Boolean);

    if (normalizedItems.length === 0) {
      alert("У заявці має залишитись хоча б одна позиція з кількістю > 0.");
      return;
    }

    const originalOrder = orders.find((order) => String(order.id) === String(editingOrder.id));
    if (!originalOrder) {
      alert("Не вдалося знайти заявку для редагування.");
      return;
    }

    const totalItems = normalizedItems.reduce((sum, item) => sum + toNumber(item.qty), 0);
    const totalAmount = normalizedItems.reduce((sum, item) => sum + toNumber(item.amount), 0);

    const { id, ...payload } = originalOrder;
    const result = await updateOrder(id, {
      ...payload,
      requiredDate: String(editingOrder.requiredDate || "").trim(),
      comment: String(editingOrder.comment || "").trim(),
      status: String(editingOrder.status || "new"),
      items: normalizedItems,
      totalItems,
      totalAmount,
      updatedBy: user?.displayName || user?.fullName || user?.email || "Адміністратор",
      updatedById: user?.uid || "",
      updatedAt: new Date().toISOString(),
    });

    if (!result.success) {
      alert("Не вдалося зберегти зміни заявки.");
      return;
    }

    setEditingOrder(null);
    alert("Зміни заявки збережено.");
  };

  const handleDeleteOrder = async (order) => {
    if (!isGlobalAdmin) {
      alert("Видалення заявки доступне лише адміністратору.");
      return;
    }

    const confirmed = window.confirm(`Видалити заявку ${order?.restaurantName || ""} від ${formatDateTimeSafe(order?.createdAt)}?`);
    if (!confirmed) return;

    const result = await deleteOrder(String(order?.id || ""));
    if (!result.success) {
      alert("Не вдалося видалити заявку.");
      return;
    }

    alert("Заявку видалено.");
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

        {canManageOrders && supplierResponseIssues.length > 0 && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-rose-900">Контроль проблемних відповідей постачальників</p>
                <p className="text-xs text-rose-700">Тут зібрані позиції, які ще очікують відповіді, підтверджені частково або відхилені постачальником.</p>
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-rose-700">
                {supplierResponseIssues.length} проблемних позицій
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-rose-200 bg-white">
              <table className="min-w-full text-xs">
                <thead className="bg-rose-50 text-rose-900">
                  <tr>
                    <th className="px-3 py-2 text-left">Поставка</th>
                    <th className="px-3 py-2 text-left">Заклад</th>
                    <th className="px-3 py-2 text-left">Постачальник</th>
                    <th className="px-3 py-2 text-left">Позиція</th>
                    <th className="px-3 py-2 text-right">Замовлено</th>
                    <th className="px-3 py-2 text-right">Підтверджено</th>
                    <th className="px-3 py-2 text-left">Статус</th>
                    <th className="px-3 py-2 text-left">Коментар</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierResponseIssues.map((row, index) => (
                    <tr key={`${row.orderId}_${row.productName}_${index}`} className="border-t border-rose-100 align-top">
                      <td className="px-3 py-2">{formatDateUk(row.requiredDate)}</td>
                      <td className="px-3 py-2">{row.restaurantName}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{row.supplier}</td>
                      <td className="px-3 py-2">{row.productName}</td>
                      <td className="px-3 py-2 text-right">{row.requestedQty} {row.unit}</td>
                      <td className="px-3 py-2 text-right">{row.status === "pending" ? "—" : `${row.responseQty} ${row.unit}`}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${getSupplierResponseBadgeClass(row.status)}`}>
                          {getSupplierResponseLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{row.comment || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                <th className="px-3 py-2 text-left">Відповідь постачальника</th>
                {canManageOrders && <th className="px-3 py-2 text-left">Дії</th>}
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => (
                <tr key={order.id} className="border-t border-slate-200 align-top">
                  <td className="px-3 py-2">{formatDateTimeSafe(order.createdAt)}</td>
                  <td className="px-3 py-2">{order.restaurantName}</td>
                  <td className="px-3 py-2">{order.requiredDate}</td>
                  <td className="px-3 py-2">{order.items.length}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{Array.from(new Set((order.items || []).map((item) => item.unit).filter(Boolean))).join(", ") || "-"}</td>
                  <td className="px-3 py-2 font-medium">{formatMoney(order.totalAmount)}</td>
                  <td className="px-3 py-2">{statusLabel(order.status)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {(() => {
                      const sentItems = (order.items || []).filter((item) => item.sentToSupplier);
                      if (sentItems.length === 0) return "Ще не відправлено";
                      const accepted = sentItems.filter((item) => getSupplierResponseStatus(item) === "accepted").length;
                      const partial = sentItems.filter((item) => getSupplierResponseStatus(item) === "partial").length;
                      const unavailable = sentItems.filter((item) => getSupplierResponseStatus(item) === "unavailable").length;
                      const pending = sentItems.filter((item) => getSupplierResponseStatus(item) === "pending").length;
                      return `${accepted} підтвердж., ${partial} частк., ${unavailable} немає, ${pending} очікує`;
                    })()}
                  </td>
                  {canManageOrders && (
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
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
                        {isGlobalAdmin && (
                          <>
                            <button
                              type="button"
                              className="rounded border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                              onClick={() => openEditOrder(order)}
                            >
                              Редагувати
                            </button>
                            <button
                              type="button"
                              className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                              onClick={() => { void handleDeleteOrder(order); }}
                            >
                              Видалити
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {visibleOrders.length === 0 && (
                <tr>
                  <td colSpan={canManageOrders ? 9 : 8} className="px-3 py-6 text-center text-slate-500">Заявок не знайдено.</td>
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

      {editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3" onClick={() => setEditingOrder(null)}>
          <div className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">Редагування заявки: {editingOrder.restaurantName}</h3>
              <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700" onClick={() => setEditingOrder(null)}>
                Закрити
              </button>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Дата поставки</label>
                <input
                  type="date"
                  className={inputClass}
                  value={editingOrder.requiredDate}
                  onChange={(e) => setEditingOrder((prev) => ({ ...prev, requiredDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Статус</label>
                <select
                  className={inputClass}
                  value={editingOrder.status}
                  onChange={(e) => setEditingOrder((prev) => ({ ...prev, status: e.target.value }))}
                >
                  <option value="new">Нова</option>
                  <option value="processing">В обробці</option>
                  <option value="sent">Надіслано постачальнику</option>
                  <option value="completed">Закрито</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Коментар</label>
                <input
                  className={inputClass}
                  value={editingOrder.comment}
                  onChange={(e) => setEditingOrder((prev) => ({ ...prev, comment: e.target.value }))}
                />
              </div>
            </div>

            <div className="max-h-[48vh] overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-2 py-1 text-left">Продукт</th>
                    <th className="px-2 py-1 text-left">Постачальник</th>
                    <th className="px-2 py-1 text-left">Кількість</th>
                    <th className="px-2 py-1 text-left">Ціна</th>
                    <th className="px-2 py-1 text-left">Дія</th>
                  </tr>
                </thead>
                <tbody>
                  {(editingOrder.items || []).map((item) => (
                    <tr key={item.id} className="border-t border-slate-200">
                      <td className="px-2 py-1">{item.productName}</td>
                      <td className="px-2 py-1">{item.supplier || "-"}</td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          className="w-24 rounded border border-slate-300 px-2 py-1 text-xs"
                          value={item.qty}
                          onChange={(e) => updateEditingOrderItem(item.id, { qty: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-24 rounded border border-slate-300 px-2 py-1 text-xs"
                          value={item.unitPrice}
                          onChange={(e) => updateEditingOrderItem(item.id, { unitPrice: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <button type="button" className="rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700" onClick={() => removeEditingOrderItem(item.id)}>
                          Видалити рядок
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700" onClick={() => setEditingOrder(null)}>
                Скасувати
              </button>
              <button type="button" className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500" onClick={() => { void saveEditingOrder(); }}>
                Зберегти зміни
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SupplierPortalTab({ orders, suppliers = [], updateOrder, user }) {
  const canPreviewAll = isGlobalAdminUser(user) || (hasProcurementAccess(user) && !hasSupplierPortalAccess(user));
  const [previewSupplierId, setPreviewSupplierId] = useState("");
  const [deliveryDateFrom, setDeliveryDateFrom] = useState("");
  const [deliveryDateTo, setDeliveryDateTo] = useState("");
  const [responseFilter, setResponseFilter] = useState("");
  const [responseDrafts, setResponseDrafts] = useState({});
  const [savingKey, setSavingKey] = useState("");

  const resolvedSupplier = useMemo(() => {
    if (previewSupplierId) {
      return (Array.isArray(suppliers) ? suppliers : []).find((supplier) => String(supplier?.id || "") === String(previewSupplierId)) || null;
    }
    return resolveSupplierForUser(user, suppliers);
  }, [previewSupplierId, suppliers, user]);

  const currentSupplierName = String(resolvedSupplier?.name || "").trim();

  const portalOrders = useMemo(() => {
    if (!currentSupplierName) return [];
    const normalizedSupplier = normalizeSupplierIdentity(currentSupplierName);

    return (Array.isArray(orders) ? orders : [])
      .map((order) => {
        const items = (Array.isArray(order?.items) ? order.items : [])
          .map((item, itemIndex) => ({
            ...item,
            itemIndex,
            lineKey: `${String(order?.id || "order")}::${itemIndex}`,
          }))
          .filter((item) => item.sentToSupplier && normalizeSupplierIdentity(item?.supplier) === normalizedSupplier)
          .filter((item) => {
            const status = getSupplierResponseStatus(item);
            return responseFilter ? status === responseFilter : true;
          });

        if (items.length === 0) return null;

        const deliveryDate = String(order?.requiredDate || "");
        const byDeliveryFrom = deliveryDateFrom ? deliveryDate && deliveryDate >= deliveryDateFrom : true;
        const byDeliveryTo = deliveryDateTo ? deliveryDate && deliveryDate <= deliveryDateTo : true;
        if (!byDeliveryFrom || !byDeliveryTo) return null;

        const summary = summarizeSupplierResponses(order, currentSupplierName);
        return {
          ...order,
          supplierItems: items,
          supplierSummary: summary,
        };
      })
      .filter(Boolean)
      .sort((left, right) => String(left?.requiredDate || "").localeCompare(String(right?.requiredDate || "")));
  }, [orders, currentSupplierName, deliveryDateFrom, deliveryDateTo, responseFilter]);

  const portalStats = useMemo(() => {
    const restaurants = new Set();
    const summary = { orders: portalOrders.length, items: 0, pending: 0, accepted: 0, partial: 0, unavailable: 0, restaurants: 0 };
    portalOrders.forEach((order) => {
      summary.items += order.supplierItems.length;
      summary.pending += order.supplierSummary.pending;
      summary.accepted += order.supplierSummary.accepted;
      summary.partial += order.supplierSummary.partial;
      summary.unavailable += order.supplierSummary.unavailable;
      restaurants.add(String(order.restaurantName || order.restaurantId || "Без закладу"));
    });
    summary.restaurants = restaurants.size;
    return summary;
  }, [portalOrders]);

  const getDraft = (item) => {
    const saved = responseDrafts[item.lineKey];
    if (saved) return saved;
    const status = getSupplierResponseStatus(item);
    const requestedQty = Math.max(0, toNumber(item.qty));
    return {
      status,
      responseQty: String(toNumber(item?.supplierResponseQty ?? (status === "unavailable" ? 0 : requestedQty))),
      comment: String(item?.supplierResponseComment || ""),
    };
  };

  const patchDraft = (lineKey, patch) => {
    setResponseDrafts((prev) => ({
      ...prev,
      [lineKey]: {
        ...(prev[lineKey] || {}),
        ...patch,
      },
    }));
  };

  const saveLineResponse = async (order, entry) => {
    const draft = getDraft(entry);
    const requestedQty = Math.max(0, toNumber(entry.qty));
    const normalizedStatus = String(draft.status || "pending").trim().toLowerCase();
    let responseQty = toNumber(draft.responseQty);

    if (normalizedStatus === "accepted") {
      responseQty = requestedQty;
    } else if (normalizedStatus === "unavailable") {
      responseQty = 0;
    } else if (normalizedStatus === "partial") {
      if (responseQty <= 0 || responseQty >= requestedQty) {
        alert("Для часткового підтвердження кількість має бути більше 0 і менше замовленої.");
        return;
      }
    }

    const { id, ...payload } = order;
    const now = new Date().toISOString();
    const nextItems = (order.items || []).map((item, itemIndex) => {
      if (itemIndex !== entry.itemIndex) return item;
      return {
        ...item,
        supplierResponseStatus: normalizedStatus,
        supplierResponseQty: responseQty,
        supplierResponseAmount: responseQty * toNumber(item.unitPrice),
        supplierResponseComment: String(draft.comment || "").trim(),
        supplierRespondedAt: now,
        supplierRespondedBy: user?.displayName || user?.fullName || user?.email || currentSupplierName,
        supplierRespondedById: user?.uid || user?.email || "",
      };
    });

    setSavingKey(entry.lineKey);
    const result = await updateOrder(id, {
      ...payload,
      items: nextItems,
      status: deriveOrderStatus(nextItems, order.status),
      supplierResponseUpdatedAt: now,
    });
    setSavingKey("");

    if (!result.success) {
      alert(getErrorMessage(result.error, "Не вдалося зберегти відповідь постачальника."));
      return;
    }

    setResponseDrafts((prev) => {
      const next = { ...prev };
      delete next[entry.lineKey];
      return next;
    });
  };

  const acceptAllOrderItems = async (order) => {
    const targets = order.supplierItems.filter((item) => getSupplierResponseStatus(item) !== "accepted");
    if (targets.length === 0) return;

    const { id, ...payload } = order;
    const now = new Date().toISOString();
    const nextItems = (order.items || []).map((item, itemIndex) => {
      const target = targets.find((entry) => entry.itemIndex === itemIndex);
      if (!target) return item;
      const qty = Math.max(0, toNumber(item.qty));
      return {
        ...item,
        supplierResponseStatus: "accepted",
        supplierResponseQty: qty,
        supplierResponseAmount: qty * toNumber(item.unitPrice),
        supplierResponseComment: String(item?.supplierResponseComment || "").trim(),
        supplierRespondedAt: now,
        supplierRespondedBy: user?.displayName || user?.fullName || user?.email || currentSupplierName,
        supplierRespondedById: user?.uid || user?.email || "",
      };
    });

    setSavingKey(`order::${order.id}`);
    const result = await updateOrder(id, {
      ...payload,
      items: nextItems,
      status: deriveOrderStatus(nextItems, order.status),
      supplierResponseUpdatedAt: now,
    });
    setSavingKey("");

    if (!result.success) {
      alert(getErrorMessage(result.error, "Не вдалося підтвердити всі позиції."));
    }
  };

  return (
    <div className="space-y-5">
      <div className={cardClass}>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold">Портал постачальника</h2>
            <p className="mt-1 text-sm text-slate-500">Постачальник бачить тільки свої відправлені позиції та може підтвердити, частково підтвердити або відхилити їх.</p>
          </div>
          {canPreviewAll && (
            <div className="ml-auto min-w-72">
              <label className="text-xs font-semibold text-slate-700">Режим перегляду постачальника</label>
              <select className={inputClass} value={previewSupplierId} onChange={(e) => setPreviewSupplierId(e.target.value)}>
                <option value="">Автовизначення по акаунту</option>
                {(Array.isArray(suppliers) ? suppliers : []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {!resolvedSupplier && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Не вдалося прив'язати ваш акаунт до постачальника. Для доступу потрібно додати email користувача в довідник постачальників у полі email доступу до порталу.
          </div>
        )}

        {resolvedSupplier && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Поточний постачальник:</span>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-semibold text-indigo-700">{resolvedSupplier.name}</span>
            {getSupplierPortalEmails(resolvedSupplier).length > 0 && (
              <span className="text-xs text-slate-500">Email доступу: {getSupplierPortalEmails(resolvedSupplier).join(", ")}</span>
            )}
          </div>
        )}
      </div>

      {resolvedSupplier && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "Заявок", value: portalStats.orders, style: "bg-slate-50 text-slate-700" },
              { label: "Закладів", value: portalStats.restaurants, style: "bg-blue-50 text-blue-700" },
              { label: "Позицій", value: portalStats.items, style: "bg-indigo-50 text-indigo-700" },
              { label: "Очікує", value: portalStats.pending, style: "bg-amber-50 text-amber-700" },
              { label: "Підтверджено", value: portalStats.accepted, style: "bg-emerald-50 text-emerald-700" },
              { label: "Проблемні", value: portalStats.partial + portalStats.unavailable, style: "bg-rose-50 text-rose-700" },
            ].map((card) => (
              <div key={card.label} className={`rounded-xl border border-slate-200 p-4 text-center ${card.style}`}>
                <div className="text-2xl font-bold">{card.value}</div>
                <div className="mt-1 text-xs font-semibold opacity-80">{card.label}</div>
              </div>
            ))}
          </div>

          <div className={cardClass}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
              <div>
                <label className="text-xs font-semibold text-slate-700">Поставка від</label>
                <input type="date" className={inputClass} value={deliveryDateFrom} onChange={(e) => setDeliveryDateFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Поставка до</label>
                <input type="date" className={inputClass} value={deliveryDateTo} onChange={(e) => setDeliveryDateTo(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Статус відповіді</label>
                <select className={inputClass} value={responseFilter} onChange={(e) => setResponseFilter(e.target.value)}>
                  <option value="">Усі</option>
                  <option value="pending">Очікує відповіді</option>
                  <option value="accepted">Підтверджено</option>
                  <option value="partial">Частково</option>
                  <option value="unavailable">Немає в наявності</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  onClick={() => {
                    setDeliveryDateFrom("");
                    setDeliveryDateTo("");
                    setResponseFilter("");
                  }}
                >
                  Скинути
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {portalOrders.map((order) => (
              <div key={order.id} className={cardClass}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-semibold text-slate-900">{order.restaurantName || "Без закладу"}</div>
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                        Заклад призначення
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">Заявка: {String(order.id || "—")} • Поставка: {formatDateUk(order.requiredDate)} • Створено: {formatDateTimeSafe(order.createdAt)}</div>
                    <div className="mt-1 text-xs text-slate-500">Коментар: {String(order.comment || "—")}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{statusLabel(order.status)}</span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Очікує: {order.supplierSummary.pending}</span>
                    <button
                      type="button"
                      className="rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      disabled={savingKey === `order::${order.id}`}
                      onClick={() => { void acceptAllOrderItems(order); }}
                    >
                      {savingKey === `order::${order.id}` ? "Збереження..." : "Підтвердити все"}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        <th className="px-3 py-2 text-left">Заклад</th>
                        <th className="px-3 py-2 text-left">Позиція</th>
                        <th className="px-3 py-2 text-left">Поставка</th>
                        <th className="px-3 py-2 text-left">К-сть</th>
                        <th className="px-3 py-2 text-left">Ціна</th>
                        <th className="px-3 py-2 text-left">Сума</th>
                        <th className="px-3 py-2 text-left">Статус</th>
                        <th className="px-3 py-2 text-left">Підтверджено</th>
                        <th className="px-3 py-2 text-left">Коментар</th>
                        <th className="px-3 py-2 text-left">Дія</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.supplierItems.map((item) => {
                        const draft = getDraft(item);
                        const status = String(draft.status || getSupplierResponseStatus(item));
                        return (
                          <tr key={item.lineKey} className="border-t border-slate-200 align-top">
                            <td className="px-3 py-2">
                              <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                {order.restaurantName || "Без закладу"}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-semibold text-slate-900">{item.productName || "Без назви"}</div>
                              <div className="text-xs text-slate-500">Код позиції: {item.productId || "—"}</div>
                            </td>
                            <td className="px-3 py-2 text-slate-700">{formatDateUk(order.requiredDate)}</td>
                            <td className="px-3 py-2">{toNumber(item.qty)} {item.unit || ""}</td>
                            <td className="px-3 py-2">{toNumber(item.unitPrice).toFixed(2)}</td>
                            <td className="px-3 py-2 font-medium">{formatMoney(item.amount)}</td>
                            <td className="px-3 py-2">
                              <div className="space-y-1">
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getSupplierResponseBadgeClass(status)}`}>
                                  {getSupplierResponseLabel(status)}
                                </span>
                                <select
                                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                                  value={status}
                                  onChange={(e) => patchDraft(item.lineKey, { status: e.target.value })}
                                >
                                  <option value="pending">Очікує відповіді</option>
                                  <option value="accepted">Підтвердити</option>
                                  <option value="partial">Частково</option>
                                  <option value="unavailable">Немає в наявності</option>
                                </select>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="w-28 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                                value={status === "accepted" ? String(toNumber(item.qty)) : draft.responseQty}
                                disabled={status === "accepted" || status === "unavailable"}
                                onChange={(e) => patchDraft(item.lineKey, { responseQty: e.target.value })}
                              />
                              <div className="mt-1 text-[11px] text-slate-500">Замовлено: {toNumber(item.qty)} {item.unit || ""}</div>
                            </td>
                            <td className="px-3 py-2">
                              <textarea
                                className="min-h-16 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                                value={draft.comment}
                                onChange={(e) => patchDraft(item.lineKey, { comment: e.target.value })}
                                placeholder="Коментар постачальника: заміна, причина відсутності, термін поставки..."
                              />
                              {item.supplierRespondedAt && (
                                <div className="mt-1 text-[11px] text-slate-500">Оновлено: {formatDateTimeSafe(item.supplierRespondedAt)}</div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                className="rounded border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                                disabled={savingKey === item.lineKey}
                                onClick={() => { void saveLineResponse(order, item); }}
                              >
                                {savingKey === item.lineKey ? "Збереження..." : "Зберегти"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {portalOrders.length === 0 && (
              <div className={`${cardClass} text-sm text-slate-500`}>
                Для цього постачальника поки немає відправлених замовлень за вибраними фільтрами.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function OrderPurchaseReportTab({ orders, suppliers, restaurants }) {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [activeSection, setActiveSection] = useState("suppliers");

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const d = String(order.createdAt || "").slice(0, 10);
      return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
    });
  }, [orders, dateFrom, dateTo]);

  // ── KPI ─────────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const total = filteredOrders.length;
    const totalAmount = filteredOrders.reduce((s, o) => s + toNumber(o.totalAmount), 0);
    const completed = filteredOrders.filter((o) => o.status === "completed").length;
    const allItems = filteredOrders.flatMap((o) => Array.isArray(o.items) ? o.items : []);
    const totalQty = allItems.reduce((s, i) => s + toNumber(i.qty), 0);
    return { total, totalAmount, completed, totalQty, avgAmount: total ? totalAmount / total : 0 };
  }, [filteredOrders]);

  // ── Supplier Analytics ────────────────────────────────────────────────────
  const supplierStats = useMemo(() => {
    const map = new Map();
    for (const order of filteredOrders) {
      for (const item of Array.isArray(order.items) ? order.items : []) {
        const supplierName = String(item.supplier || "Без постачальника").trim();
        if (!map.has(supplierName)) {
          map.set(supplierName, {
            name: supplierName,
            ordersCount: new Set(),
            totalAmount: 0,
            totalQty: 0,
            completedOrders: new Set(),
            cancelledOrders: new Set(),
            products: new Set(),
          });
        }
        const s = map.get(supplierName);
        s.ordersCount.add(order.id);
        s.totalAmount += toNumber(item.amount);
        s.totalQty += toNumber(item.qty);
        s.products.add(String(item.productName || item.productId || "").trim());
        if (order.status === "completed") s.completedOrders.add(order.id);
        if (order.status === "cancelled") s.cancelledOrders.add(order.id);
      }
    }
    return Array.from(map.values())
      .map((s) => ({
        ...s,
        ordersCount: s.ordersCount.size,
        completedOrders: s.completedOrders.size,
        cancelledOrders: s.cancelledOrders.size,
        products: s.products.size,
        fulfillmentRate: s.ordersCount.size > 0 ? Math.round((s.completedOrders.size / s.ordersCount.size) * 100) : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredOrders]);

  // ── Price Comparison by Product ──────────────────────────────────────────
  const priceComparison = useMemo(() => {
    const map = new Map();
    for (const order of filteredOrders) {
      for (const item of Array.isArray(order.items) ? order.items : []) {
        const productKey = String(item.productName || item.productId || "").trim();
        const supplierName = String(item.supplier || "Без постачальника").trim();
        const price = toNumber(item.unitPrice);
        if (!productKey || price <= 0) continue;
        if (!map.has(productKey)) {
          map.set(productKey, { productName: productKey, unit: item.unit || "", suppliers: new Map() });
        }
        const p = map.get(productKey);
        if (!p.suppliers.has(supplierName)) p.suppliers.set(supplierName, []);
        p.suppliers.get(supplierName).push(price);
      }
    }
    return Array.from(map.values())
      .filter((p) => p.suppliers.size > 1)
      .map((p) => {
        const supplierPrices = Array.from(p.suppliers.entries()).map(([name, prices]) => ({
          name,
          avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
          minPrice: Math.min(...prices),
          maxPrice: Math.max(...prices),
          count: prices.length,
        })).sort((a, b) => a.avgPrice - b.avgPrice);
        const minAvg = supplierPrices[0]?.avgPrice || 0;
        const maxAvg = supplierPrices[supplierPrices.length - 1]?.avgPrice || 0;
        return { ...p, supplierPrices, spread: minAvg > 0 ? Math.round(((maxAvg - minAvg) / minAvg) * 100) : 0 };
      })
      .sort((a, b) => b.spread - a.spread)
      .slice(0, 50);
  }, [filteredOrders]);

  // ── Restaurant Breakdown ─────────────────────────────────────────────────
  const restaurantStats = useMemo(() => {
    const map = new Map();
    for (const order of filteredOrders) {
      const rName = String(order.restaurantName || order.restaurantId || "Невідомий").trim();
      if (!map.has(rName)) map.set(rName, { name: rName, orders: 0, totalAmount: 0, completed: 0 });
      const r = map.get(rName);
      r.orders += 1;
      r.totalAmount += toNumber(order.totalAmount);
      if (order.status === "completed") r.completed += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredOrders]);

  // ── Top Products by Amount ───────────────────────────────────────────────
  const topProducts = useMemo(() => {
    const map = new Map();
    for (const order of filteredOrders) {
      for (const item of Array.isArray(order.items) ? order.items : []) {
        const key = String(item.productName || item.productId || "").trim();
        if (!key) continue;
        if (!map.has(key)) map.set(key, { productName: key, unit: item.unit || "", totalQty: 0, totalAmount: 0, suppliersSet: new Set() });
        const p = map.get(key);
        p.totalQty += toNumber(item.qty);
        p.totalAmount += toNumber(item.amount);
        p.suppliersSet.add(String(item.supplier || "").trim());
      }
    }
    return Array.from(map.values())
      .map((p) => ({ ...p, suppliers: p.suppliersSet.size }))
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 30);
  }, [filteredOrders]);

  // ── Monthly Dynamics ─────────────────────────────────────────────────────
  const monthlyDynamics = useMemo(() => {
    const map = new Map();
    for (const order of filteredOrders) {
      const month = String(order.createdAt || "").slice(0, 7);
      if (!month) continue;
      if (!map.has(month)) map.set(month, { month, orders: 0, totalAmount: 0 });
      const m = map.get(month);
      m.orders += 1;
      m.totalAmount += toNumber(order.totalAmount);
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredOrders]);

  const maxMonthAmount = useMemo(() => Math.max(...monthlyDynamics.map((m) => m.totalAmount), 1), [monthlyDynamics]);

  const sections = [
    { id: "suppliers", label: "Сервіс-рівень постачальників" },
    { id: "prices", label: "Порівняння цін" },
    { id: "products", label: "Топ продуктів" },
    { id: "restaurants", label: "По закладах" },
    { id: "dynamics", label: "Динаміка закупівель" },
  ];

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <BarChart2 size={18} className="text-indigo-600" />
            <h2 className="text-lg font-semibold">Звіт із закупівель</h2>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="text-sm text-slate-700">Від:</label>
            <input type="date" className="rounded border border-slate-300 px-2 py-1 text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <label className="text-sm text-slate-700">До:</label>
            <input type="date" className="rounded border border-slate-300 px-2 py-1 text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: "Заявок", value: kpi.total, color: "bg-indigo-50 text-indigo-700" },
          { label: "Виконано", value: kpi.completed, color: "bg-emerald-50 text-emerald-700" },
          { label: "Сума закупівель", value: `${(kpi.totalAmount / 1000).toFixed(1)}к грн`, color: "bg-amber-50 text-amber-700" },
          { label: "Ср. сума заявки", value: `${(kpi.avgAmount / 1000).toFixed(1)}к грн`, color: "bg-blue-50 text-blue-700" },
          { label: "% виконання", value: kpi.total ? `${Math.round((kpi.completed / kpi.total) * 100)}%` : "—", color: "bg-rose-50 text-rose-700" },
        ].map((card) => (
          <div key={card.label} className={`rounded-xl border border-slate-200 p-4 text-center ${card.color}`}>
            <div className="text-2xl font-bold">{card.value}</div>
            <div className="mt-1 text-xs font-semibold opacity-80">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Section Tabs */}
      <div className={cardClass}>
        <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 pb-3">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSection(s.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${activeSection === s.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* ── Supplier Service Level ─────────────────────────────────────────── */}
        {activeSection === "suppliers" && (
          <div>
            <h3 className="mb-3 text-sm font-bold text-slate-800">Сервіс-рівень по постачальниках</h3>
            {supplierStats.length === 0 ? (
              <p className="text-sm text-slate-500">Немає даних за вибраний період.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b-2 border-slate-300 bg-slate-100 text-left">
                      <th className="px-3 py-2 font-semibold text-slate-700">Постачальник</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Заявок</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Виконано</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Скасовано</th>
                      <th className="px-3 py-2 text-center font-semibold text-slate-700">Рівень сервісу</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Сума, грн</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Кількість SKU</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierStats.map((s, i) => (
                      <tr key={s.name} className={`border-b border-slate-200 ${i % 2 === 0 ? "bg-white" : "bg-slate-50"} hover:bg-blue-50`}>
                        <td className="px-3 py-2 font-semibold text-slate-900">{s.name}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{s.ordersCount}</td>
                        <td className="px-3 py-2 text-right text-emerald-700">{s.completedOrders}</td>
                        <td className="px-3 py-2 text-right text-rose-600">{s.cancelledOrders}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={`h-2 rounded-full ${s.fulfillmentRate >= 80 ? "bg-emerald-500" : s.fulfillmentRate >= 50 ? "bg-amber-400" : "bg-rose-500"}`}
                                style={{ width: `${s.fulfillmentRate}%` }}
                              />
                            </div>
                            <span className={`w-9 text-right font-semibold ${s.fulfillmentRate >= 80 ? "text-emerald-700" : s.fulfillmentRate >= 50 ? "text-amber-700" : "text-rose-600"}`}>
                              {s.fulfillmentRate}%
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-900">{s.totalAmount.toLocaleString("uk-UA", { maximumFractionDigits: 0 })}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{s.products}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                      <td className="px-3 py-2 text-slate-800">Разом</td>
                      <td className="px-3 py-2 text-right">{supplierStats.reduce((s, r) => s + r.ordersCount, 0)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{supplierStats.reduce((s, r) => s + r.completedOrders, 0)}</td>
                      <td className="px-3 py-2 text-right text-rose-600">{supplierStats.reduce((s, r) => s + r.cancelledOrders, 0)}</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right">{supplierStats.reduce((s, r) => s + r.totalAmount, 0).toLocaleString("uk-UA", { maximumFractionDigits: 0 })}</td>
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Price Comparison ───────────────────────────────────────────────── */}
        {activeSection === "prices" && (
          <div>
            <h3 className="mb-1 text-sm font-bold text-slate-800">Порівняння цін по постачальниках</h3>
            <p className="mb-3 text-xs text-slate-500">Показано тільки продукти, які закуповувались у 2+ постачальників. Відсортовано за розкидом ціни (найбільша різниця — першою).</p>
            {priceComparison.length === 0 ? (
              <p className="text-sm text-slate-500">Немає продуктів із закупівлями у кількох постачальників за вибраний період.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b-2 border-slate-300 bg-slate-100 text-left">
                      <th className="px-3 py-2 font-semibold text-slate-700">Продукт</th>
                      <th className="px-3 py-2 font-semibold text-slate-700">Од.</th>
                      <th className="px-3 py-2 font-semibold text-slate-700">Постачальник</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Мін ціна</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Ср. ціна</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Макс ціна</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Замовлень</th>
                      <th className="px-3 py-2 text-center font-semibold text-slate-700">Розкид</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceComparison.flatMap((p) =>
                      p.supplierPrices.map((sp, spIdx) => (
                        <tr key={`${p.productName}_${sp.name}`} className={`border-b border-slate-200 ${spIdx === 0 ? "bg-emerald-50" : spIdx === p.supplierPrices.length - 1 && p.supplierPrices.length > 1 ? "bg-rose-50" : "bg-white"} hover:bg-blue-50`}>
                          {spIdx === 0 && (
                            <td className="px-3 py-2 font-semibold text-slate-900" rowSpan={p.supplierPrices.length}>
                              {p.productName}
                            </td>
                          )}
                          {spIdx === 0 && (
                            <td className="px-3 py-2 text-slate-500" rowSpan={p.supplierPrices.length}>{p.unit}</td>
                          )}
                          <td className="px-3 py-2 text-slate-700">{sp.name}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{sp.minPrice.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-900">{sp.avgPrice.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{sp.maxPrice.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{sp.count}</td>
                          {spIdx === 0 && (
                            <td className="px-3 py-2 text-center" rowSpan={p.supplierPrices.length}>
                              <span className={`rounded-full px-2 py-0.5 font-bold ${p.spread > 20 ? "bg-rose-100 text-rose-700" : p.spread > 10 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                                {p.spread}%
                              </span>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Top Products ──────────────────────────────────────────────────── */}
        {activeSection === "products" && (
          <div>
            <h3 className="mb-3 text-sm font-bold text-slate-800">Топ продуктів за сумою закупівель</h3>
            {topProducts.length === 0 ? (
              <p className="text-sm text-slate-500">Немає даних за вибраний період.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b-2 border-slate-300 bg-slate-100 text-left">
                      <th className="px-3 py-2 w-8 font-semibold text-slate-700">#</th>
                      <th className="px-3 py-2 font-semibold text-slate-700">Продукт</th>
                      <th className="px-3 py-2 font-semibold text-slate-700">Од.</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Кількість</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Сума, грн</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Постачальників</th>
                      <th className="px-3 py-2 font-semibold text-slate-700">Частка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const grandTotal = topProducts.reduce((s, p) => s + p.totalAmount, 0);
                      return topProducts.map((p, i) => {
                        const share = grandTotal > 0 ? (p.totalAmount / grandTotal) * 100 : 0;
                        return (
                          <tr key={p.productName} className={`border-b border-slate-200 ${i % 2 === 0 ? "bg-white" : "bg-slate-50"} hover:bg-blue-50`}>
                            <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                            <td className="px-3 py-2 font-semibold text-slate-900">{p.productName}</td>
                            <td className="px-3 py-2 text-slate-500">{p.unit}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{p.totalQty.toLocaleString("uk-UA", { maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-900">{p.totalAmount.toLocaleString("uk-UA", { maximumFractionDigits: 0 })}</td>
                            <td className="px-3 py-2 text-right text-indigo-700">{p.suppliers}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                                  <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${Math.min(share, 100)}%` }} />
                                </div>
                                <span className="text-[10px] text-slate-500">{share.toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Restaurant Breakdown ──────────────────────────────────────────── */}
        {activeSection === "restaurants" && (
          <div>
            <h3 className="mb-3 text-sm font-bold text-slate-800">Закупівлі по закладах</h3>
            {restaurantStats.length === 0 ? (
              <p className="text-sm text-slate-500">Немає даних за вибраний період.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b-2 border-slate-300 bg-slate-100 text-left">
                      <th className="px-3 py-2 font-semibold text-slate-700">Заклад</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Заявок</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Виконано</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Сума, грн</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-700">Ср. заявка, грн</th>
                      <th className="px-3 py-2 font-semibold text-slate-700">Частка бюджету</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const grandTotal = restaurantStats.reduce((s, r) => s + r.totalAmount, 0);
                      return restaurantStats.map((r, i) => {
                        const share = grandTotal > 0 ? (r.totalAmount / grandTotal) * 100 : 0;
                        return (
                          <tr key={r.name} className={`border-b border-slate-200 ${i % 2 === 0 ? "bg-white" : "bg-slate-50"} hover:bg-blue-50`}>
                            <td className="px-3 py-2 font-semibold text-slate-900">{r.name}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{r.orders}</td>
                            <td className="px-3 py-2 text-right text-emerald-700">{r.completed}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-900">{r.totalAmount.toLocaleString("uk-UA", { maximumFractionDigits: 0 })}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{r.orders > 0 ? Math.round(r.totalAmount / r.orders).toLocaleString("uk-UA") : "—"}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                                  <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${Math.min(share, 100)}%` }} />
                                </div>
                                <span className="text-[10px] text-slate-500">{share.toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                      <td className="px-3 py-2 text-slate-800">Разом</td>
                      <td className="px-3 py-2 text-right">{restaurantStats.reduce((s, r) => s + r.orders, 0)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{restaurantStats.reduce((s, r) => s + r.completed, 0)}</td>
                      <td className="px-3 py-2 text-right">{restaurantStats.reduce((s, r) => s + r.totalAmount, 0).toLocaleString("uk-UA", { maximumFractionDigits: 0 })}</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Monthly Dynamics ──────────────────────────────────────────────── */}
        {activeSection === "dynamics" && (
          <div>
            <h3 className="mb-3 text-sm font-bold text-slate-800">Динаміка закупівель по місяцях</h3>
            {monthlyDynamics.length === 0 ? (
              <p className="text-sm text-slate-500">Немає даних за вибраний період.</p>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b-2 border-slate-300 bg-slate-100 text-left">
                        <th className="px-3 py-2 font-semibold text-slate-700">Місяць</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-700">Заявок</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-700">Сума, грн</th>
                        <th className="px-3 py-2 font-semibold text-slate-700">Графік</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyDynamics.map((m, i) => {
                        const [year, month] = m.month.split("-");
                        const monthNames = ["Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип", "Сер", "Вер", "Жов", "Лис", "Гру"];
                        const label = `${monthNames[parseInt(month, 10) - 1]} ${year}`;
                        const barW = Math.round((m.totalAmount / maxMonthAmount) * 100);
                        return (
                          <tr key={m.month} className={`border-b border-slate-200 ${i % 2 === 0 ? "bg-white" : "bg-slate-50"}`}>
                            <td className="px-3 py-2 font-semibold text-slate-900">{label}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{m.orders}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-900">{m.totalAmount.toLocaleString("uk-UA", { maximumFractionDigits: 0 })}</td>
                            <td className="px-3 py-2 w-48">
                              <div className="h-4 w-full overflow-hidden rounded bg-slate-200">
                                <div className="h-4 rounded bg-indigo-500" style={{ width: `${barW}%` }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
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
    deleteOrder,
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

  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    let isMounted = true;
    getUsers()
      .then((items) => {
        if (!isMounted) return;
        const normalized = (Array.isArray(items) ? items : []).map((item) => ({
          id: String(item?.id || item?.uid || "").trim(),
          displayName: String(item?.displayName || item?.fullName || item?.name || "").trim(),
          fullName: String(item?.fullName || item?.displayName || item?.name || "").trim(),
          email: String(item?.email || "").trim(),
        })).filter((item) => item.id);
        setAccounts(normalized);
      })
      .catch(() => {
        if (isMounted) setAccounts([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const tabKind = normalizeTabKind(topTab);
  const canManageProducts = hasProcurementAccess(user);
  const canManageOrders = hasProcurementAccess(user);
  const aplAssignments = useMemo(
    () => typicalFields.filter((item) => String(item?.type || "") === "aplAssignment"),
    [typicalFields]
  );
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
        suppliersDirectory={suppliers}
        categories={availableCategories}
        subcategoriesByCategory={availableSubcategoriesByCategory}
        inventories={normalizedInventories}
        restaurants={effectiveRestaurants}
        user={user}
        canManageProducts={canManageProducts}
        addProduct={addProduct}
        updateProduct={updateProduct}
        deleteProduct={deleteProduct}
        createSupplier={createSupplier}
        updateSupplier={updateSupplier}
        typicalFields={typicalFields}
        createTypicalField={createTypicalField}
        updateTypicalField={updateTypicalField}
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
        restaurants={effectiveRestaurants}
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
        categories={availableCategories}
        accounts={accounts}
        canManage={canManageProducts}
        createTypicalField={createTypicalField}
        updateTypicalField={updateTypicalField}
        removeTypicalField={removeTypicalField}
      />
    );
  }

  if (tabKind === "orderApl") {
    return (
      <OrderAplTab
        products={normalizedProducts}
        restaurants={effectiveRestaurants}
        typicalFields={typicalFields}
        user={user}
        canManage={canManageProducts}
        createTypicalField={createTypicalField}
        updateTypicalField={updateTypicalField}
      />
    );
  }

  if (tabKind === "orders") {
    return (
      <OrdersManagementTab
        orders={normalizedOrders}
        updateOrder={updateOrder}
        deleteOrder={deleteOrder}
        createSupplierDispatch={createSupplierDispatch}
        canManageOrders={canManageOrders}
        user={user}
      />
    );
  }

  if (tabKind === "supplierPortal") {
    return (
      <SupplierPortalTab
        orders={normalizedOrders}
        suppliers={suppliers}
        updateOrder={updateOrder}
        user={user}
      />
    );
  }

  if (tabKind === "orderReport") {
    return (
      <OrderPurchaseReportTab
        orders={normalizedOrders}
        suppliers={suppliers}
        restaurants={effectiveRestaurants}
      />
    );
  }

  return <BookingTab products={normalizedProducts} orders={normalizedOrders} aplAssignments={aplAssignments} createOrder={createOrder} restaurants={effectiveRestaurants} user={user} suppliersDirectory={suppliers} />;
}
