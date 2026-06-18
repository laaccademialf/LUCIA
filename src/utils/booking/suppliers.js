// Чисті хелпери резолву постачальників: зіставлення за email/назвою, контракти
// під заклад, рекомендації шефа, вибір найдешевшого, агрегація відповідей.
// НЕ містять залежностей від React.
import {
  buildRestaurantLookupKey,
  collectRestaurantTokens,
  hasRestaurantTokenOverlap,
} from "./restaurantScope.js";
import { getSupplierResponseStatus } from "./orderStatus.js";

// Локальна копія toNumber (самодостатня, без зовнішніх залежностей).
const toNumber = (value) => {
  const normalized = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Нормалізує ідентичність постачальника для порівняння (lowercase, стиснені пробіли).
export const normalizeSupplierIdentity = (value) =>
  String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

// Усі email-адреси порталу постачальника (унікальні, нормалізовані).
export const getSupplierPortalEmails = (supplier) => {
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

// Знаходить запис постачальника для користувача за email, потім за ім'ям.
export const resolveSupplierForUser = (user, suppliers = []) => {
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

// Розбиває рядок постачальників (через ,;|/ та переноси) на унікальний список.
export const splitSupplierCandidates = (value) => {
  return Array.from(
    new Set(
      String(value || "")
        .split(/[,;\n|/]+/)
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
};

// Чи має постачальник контракт під цей заклад.
export const supplierHasContractForRestaurant = (supplierRecord, restaurantRef = {}) => {
  const contracts = Array.isArray(supplierRecord?.contracts) ? supplierRecord.contracts : [];
  if (contracts.length === 0) return false;

  const restaurantLookupKey = buildRestaurantLookupKey(restaurantRef || {});
  const restaurantTokens = collectRestaurantTokens(restaurantRef || {});

  return contracts.some((contract) => {
    const contractLookupKey = String(contract?.restaurantLookupKey || "").trim();
    if (restaurantLookupKey && contractLookupKey && contractLookupKey === restaurantLookupKey) return true;
    return hasRestaurantTokenOverlap(collectRestaurantTokens(contract || {}), restaurantTokens);
  });
};

// Повертає контракт постачальника під цей заклад (або null).
export const resolveSupplierContractForRestaurant = (supplierRecord, restaurantRef = {}) => {
  const contracts = Array.isArray(supplierRecord?.contracts) ? supplierRecord.contracts : [];
  if (contracts.length === 0) return null;

  const restaurantLookupKey = buildRestaurantLookupKey(restaurantRef || {});
  const restaurantTokens = collectRestaurantTokens(restaurantRef || {});

  for (const contract of contracts) {
    const contractLookupKey = String(contract?.restaurantLookupKey || "").trim();
    if (restaurantLookupKey && contractLookupKey && contractLookupKey === restaurantLookupKey) return contract;
    if (hasRestaurantTokenOverlap(collectRestaurantTokens(contract || {}), restaurantTokens)) return contract;
  }
  return null;
};

// Мінімальна сума замовлення за контрактом постачальника під заклад (0 якщо немає).
export const getSupplierMinimumForRestaurant = (supplierRecord, restaurantRef = {}) => {
  const matchedContract = resolveSupplierContractForRestaurant(supplierRecord, restaurantRef);
  if (matchedContract) return Math.max(0, toNumber(matchedContract?.minimumOrderAmount || 0));
  return 0;
};

// ─── Рекомендований постачальник у заклад (chef-pinned) ───
// Шеф-кухар може закріпити конкретного постачальника продукту за переліком
// закладів. Це правило має найвищий пріоритет — вище за APL та контракти.
// Зберігається у довіднику постачальника як supplier.productRecommendations:
//   [{ productKey, productName, code1C, restaurantIds: [...] }]
export const buildProductRecommendationKey = (productRef) => {
  if (!productRef || typeof productRef !== "object") return "";
  const code = String(productRef.code1C || "").trim().toLowerCase();
  if (code) return code;
  return String(productRef.name || "").trim().toLowerCase();
};

export const parseSupplierRecommendations = (supplierRecord) => {
  const raw = supplierRecord?.productRecommendations;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const supplierRecommendsForProductRestaurant = (supplierRecord, productKey, restaurantId) => {
  if (!productKey || !restaurantId) return false;
  const entry = parseSupplierRecommendations(supplierRecord).find(
    (item) => String(item?.productKey || "").trim().toLowerCase() === productKey
  );
  if (!entry) return false;
  const ids = Array.isArray(entry.restaurantIds) ? entry.restaurantIds.map((id) => String(id || "").trim()) : [];
  return ids.includes(String(restaurantId || "").trim());
};

// Кеш мапи «нормалізована назва постачальника → запис довідника».
// Ключ — посилання на масив suppliersDirectory (стабільне між рендерами),
// тож мапа перебудовується лише коли довідник реально змінився.
const supplierDirectoryByNameCache = new WeakMap();
export const getSupplierDirectoryByName = (suppliersDirectory) => {
  const arr = Array.isArray(suppliersDirectory) ? suppliersDirectory : null;
  if (!arr) return new Map();
  const cached = supplierDirectoryByNameCache.get(arr);
  if (cached) return cached;
  const map = new Map(
    arr
      .map((supplier) => [normalizeSupplierIdentity(supplier?.name), supplier])
      .filter(([key]) => Boolean(key))
  );
  supplierDirectoryByNameCache.set(arr, map);
  return map;
};

export const resolveSupplierForRestaurantContext = (rawSupplier, restaurantRef = {}, suppliersDirectory = [], productRef = null, supplierPriceMap = null) => {
  const candidates = splitSupplierCandidates(rawSupplier);
  if (candidates.length === 0) return "";
  if (candidates.length === 1) return candidates[0];

  const directoryByName = getSupplierDirectoryByName(suppliersDirectory);
  // 1) Рекомендація шефа (закріплення постачальника за закладом) — найвищий пріоритет.
  const productKey = buildProductRecommendationKey(productRef);
  const restaurantId = String(restaurantRef?.id || "").trim();
  if (productKey && restaurantId) {
    for (const candidate of candidates) {
      const supplierRecord = directoryByName.get(normalizeSupplierIdentity(candidate));
      if (supplierRecord && supplierRecommendsForProductRestaurant(supplierRecord, productKey, restaurantId)) {
        return String(supplierRecord?.name || candidate).trim();
      }
    }
  }

  // Вибір найдешевшого постачальника серед списку (за наявності карти цін).
  const priceMap = supplierPriceMap instanceof Map ? supplierPriceMap : null;
  const pickCheapest = (list) => {
    if (!priceMap || list.length === 0) return null;
    let best = null;
    let bestPrice = Infinity;
    for (const name of list) {
      const price = priceMap.get(normalizeSupplierIdentity(name));
      if (Number.isFinite(price) && price > 0 && price < bestPrice) {
        bestPrice = price;
        best = name;
      }
    }
    return best;
  };

  // 2) Контракт постачальника для цього закладу.
  //    Якщо контракт мають кілька постачальників — обираємо з найменшою ціною.
  const contractedCandidates = candidates.filter((candidate) => {
    const supplierRecord = directoryByName.get(normalizeSupplierIdentity(candidate));
    return supplierRecord && supplierHasContractForRestaurant(supplierRecord, restaurantRef);
  });

  if (contractedCandidates.length > 0) {
    const chosen = pickCheapest(contractedCandidates) || contractedCandidates[0];
    const supplierRecord = directoryByName.get(normalizeSupplierIdentity(chosen));
    return String(supplierRecord?.name || chosen).trim();
  }

  // 3) Запасний варіант — найдешевший серед усіх кандидатів, інакше перший.
  return pickCheapest(candidates) || candidates[0];
};

// Карта «постачальник → мінімальна ціна» для конкретного продукту BookingTab.
// Використовується резолвером для вибору найдешевшого постачальника серед
// тих, що мають контракт із закладом (коли немає рекомендації шефа).
const supplierPriceMapCache = new WeakMap();
export const buildSupplierPriceMap = (product) => {
  if (product && typeof product === "object") {
    const cached = supplierPriceMapCache.get(product);
    if (cached) return cached;
  }
  const map = new Map();
  const add = (supplierName, price) => {
    const key = normalizeSupplierIdentity(supplierName);
    if (!key) return;
    const numeric = toNumber(price);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    if (!map.has(key) || numeric < map.get(key)) map.set(key, numeric);
  };

  if (Array.isArray(product?.whiteCards)) {
    product.whiteCards.forEach((card) => add(card?.supplier, card?.unitPrice));
  }

  if (map.size === 0) {
    const price = toNumber(product?.unitPrice);
    const list = Array.isArray(product?.supplierList) && product.supplierList.length > 0
      ? product.supplierList
      : splitSupplierCandidates(product?.supplier || "");
    list.forEach((name) => add(name, price));
  }

  if (product && typeof product === "object") {
    supplierPriceMapCache.set(product, map);
  }
  return map;
};

// Агрегує відповіді постачальника на позиції замовлення.
export const summarizeSupplierResponses = (order, supplierName) => {
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
