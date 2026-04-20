import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Plus,
  Trash2,
  Download,
  Upload,
  FileDown,
  X,
  Save,
  Search,
  ChevronDown,
  ChevronUp,
  Edit3,
  Shield,
  UserCheck,
  Users,
} from "lucide-react";
import { useAssortmentMatrix } from "../hooks/useAssortmentMatrix";
import { getUsers } from "../firebase/users";
import {
  isCollectionsApiEnabled,
  listCollectionItemsApi,
  createCollectionItemApi,
  updateCollectionItemApi,
  deleteCollectionItemApi,
} from "../api/collectionsApi";

const loadExcelHelpers = () => import("../utils/assortmentMatrixExcel");

/* ─── tab normalizer ─── */
const normalizeTabKind = (tabId = "", tabLabel = "") => {
  const v = String(tabId).toLowerCase();
  const label = String(tabLabel).toLowerCase();
  if (label.includes("асортимент")) return "matrix";
  if (label.includes("специф")) return "specifications";
  if (label.includes("типов")) return "typicalFields";
  if (label.includes("надцін") || label.includes("націн") || label.includes("цінк")) return "markups";
  if (label.includes("доступ") || label.includes("керуван")) return "access";
  if (v === "barvinotipicalform") return "typicalFields";
  if (v === "barvinositifications" || v === "barvinospecifications" || v === "barvinospecification") return "specifications";
  if (v === "assortmentmatrix") return "matrix";
  if (v.includes("markup") || v.includes("markups") || v.includes("nacink") || v.includes("nacinka") || v.includes("nadc") || v.includes("цінк")) return "markups";
  if (v.includes("dostupy") || v.includes("access") || v.includes("керуван")) return "access";
  if (v === "test3") return "typicalFields";
  if (v === "test2") return "specifications";
  if (v === "test1") return "matrix";
  if (v.includes("assortmentmatrix")) return "matrix";
  if (v.includes("barvino") && (v.includes("spec") || v.includes("sitif") || v.includes("stif") || v.includes("notic"))) return "specifications";
  if (v.includes("barvino") && (v.includes("tipical") || v.includes("typical") || v.includes("field") || v.includes("form"))) return "typicalFields";
  if (v.includes("типов") || v.includes("typical") || v.includes("field") || v.includes("tipical")) return "typicalFields";
  if (v.includes("специф") || v.includes("spec") || v.includes("stific") || v.includes("notic")) return "specifications";
  return "matrix";
};

/* ─── styling ─── */
const cardClass = "card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl";
const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";
const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 transition";
const btnSecondary =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition";
const CATEGORY_FIELD_NAME = "Категорії бару та вина";
const MARKUP_SETTINGS_FIELD_NAME = "Типові націнки бару та вина";
const DEFAULT_MEASUREMENT_UNITS = ["мл", "л", "шт"];
const DEFAULT_SALE_UNITS = ["пляшка", "порція", "келих", "шт"];
const DEFAULT_PORTION_UNIT = "порція";
const SAMPLE_SUPPLIERS = ["Wine Bureau", "GoodWine Trade", "Metro Cash & Carry", "Bacardi-Martini Ukraine"];

const toNumber = (value) => {
  const normalized = String(value ?? "").replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value) => Number(toNumber(value).toFixed(2));

const roundToTen = (value) => Math.round(toNumber(value) / 10) * 10;

const computeSalePriceFromMarkup = (baseAmount, markupPercent) => {
  const base = toNumber(baseAmount);
  const markup = toNumber(markupPercent);
  if (base <= 0) return 0;
  return roundToTen(base * (1 + markup / 100));
};

const computePortionCost = (purchasePrice, bottleVolumeMl, portionVolumeMl) => {
  const purchase = toNumber(purchasePrice);
  const bottleVolume = toNumber(bottleVolumeMl);
  const portionVolume = toNumber(portionVolumeMl);
  if (purchase <= 0 || bottleVolume <= 0 || portionVolume <= 0) return 0;
  return roundMoney((purchase / bottleVolume) * portionVolume);
};

const computeMarkupPercentFromTargetPrice = (baseAmount, targetPrice) => {
  const base = toNumber(baseAmount);
  const target = toNumber(targetPrice);
  if (base <= 0 || target <= 0) return 0;
  return roundMoney(((target / base) - 1) * 100);
};

const createLocalId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const normalizeCategoryEntry = (entry) => {
  if (typeof entry === "string") {
    return {
      name: normalizeString(entry),
      useTypicalMarkup: false,
    };
  }

  const name = normalizeString(entry?.name || entry?.value || entry?.label);
  return {
    name,
    useTypicalMarkup: Boolean(entry?.useTypicalMarkup || entry?.applyTypicalMarkup || entry?.useTypicalMarkupForCategory),
  };
};

const getCategoryField = (fields) => {
  const directMatch = (fields || []).find((field) => normalizeString(field?.name) === CATEGORY_FIELD_NAME);
  if (directMatch) return directMatch;
  return (fields || []).find((field) => field?.type === "category" || String(field?.name || "").toLowerCase().includes("категор")) || null;
};

const getCategoryEntriesFromFields = (fields) => {
  const categoryField = Array.isArray(fields) ? getCategoryField(fields) : fields;
  const entries = [];
  const seen = new Set();

  const rawOptions = Array.isArray(categoryField?.options) ? categoryField.options : [];
  rawOptions.forEach((option) => {
    const normalized = normalizeCategoryEntry(option);
    if (!normalized.name || seen.has(normalized.name)) return;
    seen.add(normalized.name);
    entries.push(normalized);
  });

  const defaultValue = normalizeString(categoryField?.defaultValue);
  if (defaultValue && !seen.has(defaultValue)) {
    entries.push({ name: defaultValue, useTypicalMarkup: false });
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name, "uk"));
};

const getCategoryOptionsFromFields = (fields) => {
  return getCategoryEntriesFromFields(fields).map((entry) => entry.name);
};

const usesTypicalMarkupForCategory = (fields, categoryName) => getCategoryEntriesFromFields(fields)
  .some((entry) => entry.name === normalizeString(categoryName) && entry.useTypicalMarkup);

const getMarkupSettingsField = (fields) => {
  const directMatch = (fields || []).find((field) => normalizeString(field?.name) === MARKUP_SETTINGS_FIELD_NAME);
  if (directMatch) return directMatch;
  return (fields || []).find((field) => field?.metadataKind === "markupSettings" || field?.metadata_kind === "markupSettings" || String(field?.name || "").toLowerCase().includes("націн")) || null;
};

const normalizeRestaurantPricingGroups = (groups) => (Array.isArray(groups) ? groups : [])
  .map((group) => ({
    id: normalizeString(group?.id) || createLocalId("group"),
    name: normalizeString(group?.name || group?.label),
    restaurantIds: normalizeList(group?.restaurantIds || group?.restaurant_ids || group?.restaurants),
    minimumPortionPrice: toNumber(group?.minimumPortionPrice ?? group?.minimum_portion_price ?? group?.minimumPrice ?? group?.minPrice),
  }))
  .filter((group) => group.name)
  .sort((a, b) => a.name.localeCompare(b.name, "uk"));

const normalizeMarkupRules = (rules) => (Array.isArray(rules) ? rules : [])
  .map((rule) => ({
    id: normalizeString(rule?.id) || createLocalId("rule"),
    alcoholCategory: normalizeString(rule?.alcoholCategory || rule?.alcohol_category || rule?.category),
    restaurantGroupId: normalizeString(rule?.restaurantGroupId || rule?.restaurant_group_id || rule?.groupId),
    costFrom: toNumber(rule?.costFrom ?? rule?.cost_from ?? rule?.from ?? rule?.minCost),
    costTo: toNumber(rule?.costTo ?? rule?.cost_to ?? rule?.to ?? rule?.maxCost),
    markupPercent: toNumber(rule?.markupPercent ?? rule?.markup_percent ?? rule?.targetPortionPrice ?? rule?.target_portion_price),
  }))
  .filter((rule) => rule.alcoholCategory && rule.restaurantGroupId)
  .sort((a, b) => a.costFrom - b.costFrom || a.costTo - b.costTo);

const getMarkupSettings = (fields) => {
  const settingsField = getMarkupSettingsField(fields);
  return {
    field: settingsField,
    restaurantGroups: normalizeRestaurantPricingGroups(settingsField?.restaurantGroups || settingsField?.restaurant_groups || settingsField?.groups),
    rules: normalizeMarkupRules(settingsField?.rules),
  };
};

const resolveRestaurantGroupForRestaurant = (restaurantId, restaurantGroups) => {
  const normalizedRestaurantId = normalizeString(restaurantId);
  if (!normalizedRestaurantId) return null;
  return restaurantGroups.find((group) => group.restaurantIds.includes(normalizedRestaurantId)) || null;
};

const findMarkupRuleForCost = ({ alcoholCategory, restaurantGroupId, portionCostPrice, rules }) => {
  const normalizedCategory = normalizeString(alcoholCategory);
  const cost = toNumber(portionCostPrice);
  return (rules || []).find((rule) => {
    if (rule.alcoholCategory !== normalizedCategory || rule.restaurantGroupId !== normalizeString(restaurantGroupId)) {
      return false;
    }
    if (cost <= 0) return false;
    const from = toNumber(rule.costFrom);
    const to = toNumber(rule.costTo);
    if (to > 0) {
      return cost > from && cost <= to;
    }
    return cost > from;
  }) || null;
};

const normalizePricingByRestaurantGroup = (value) => (Array.isArray(value) ? value : [])
  .map((entry) => ({
    restaurantGroupId: normalizeString(entry?.restaurantGroupId || entry?.groupId),
    restaurantGroupName: normalizeString(entry?.restaurantGroupName || entry?.groupName),
    ruleId: normalizeString(entry?.ruleId),
    portionCostPrice: toNumber(entry?.portionCostPrice),
    markupPercent: toNumber(entry?.markupPercent ?? entry?.markup_percent),
    targetPortionPrice: toNumber(entry?.targetPortionPrice || entry?.portionSalePrice),
    portionSalePrice: toNumber(entry?.portionSalePrice || entry?.targetPortionPrice),
    portionMarkup: toNumber(entry?.portionMarkup),
    minimumPortionPrice: toNumber(entry?.minimumPortionPrice),
  }))
  .filter((entry) => entry.restaurantGroupId);

const buildAutoPricingByRestaurantGroup = ({
  product,
  typicalFields,
  restaurantGroups,
  rules,
}) => {
  const category = normalizeString(product?.category);
  const portionCostPrice = toNumber(product?.portionCostPrice);
  if (!category || portionCostPrice <= 0 || !usesTypicalMarkupForCategory(typicalFields, category)) {
    return [];
  }

  return (restaurantGroups || []).map((group) => {
    const matchedRule = findMarkupRuleForCost({
      alcoholCategory: category,
      restaurantGroupId: group.id,
      portionCostPrice,
      rules,
    });

    const markupPct = toNumber(matchedRule?.markupPercent);
    const calculatedPrice = markupPct > 0 ? roundToTen(portionCostPrice * (1 + markupPct / 100)) : 0;
    const targetPortionPrice = Math.max(calculatedPrice, roundToTen(group.minimumPortionPrice));

    return {
      restaurantGroupId: group.id,
      restaurantGroupName: group.name,
      ruleId: matchedRule?.id || "",
      portionCostPrice,
      markupPercent: markupPct,
      targetPortionPrice,
      portionSalePrice: targetPortionPrice,
      portionMarkup: computeMarkupPercentFromTargetPrice(portionCostPrice, targetPortionPrice),
      minimumPortionPrice: group.minimumPortionPrice,
    };
  }).filter((entry) => entry.portionSalePrice > 0);
};

const getPricingForRestaurant = ({ pricingByRestaurantGroup, restaurantId, restaurantGroups }) => {
  const group = resolveRestaurantGroupForRestaurant(restaurantId, restaurantGroups);
  if (!group) return null;
  return normalizePricingByRestaurantGroup(pricingByRestaurantGroup)
    .find((entry) => entry.restaurantGroupId === group.id) || null;
};

const getMarkupRuleRangeKey = (rule) => `${toNumber(rule?.costFrom)}::${toNumber(rule?.costTo)}`;

const formatMarkupRuleRangeLabel = (costFrom, costTo) => {
  const from = toNumber(costFrom);
  const to = toNumber(costTo);
  if (from <= 0 && to > 0) return `до ${formatPrice(to)}`;
  if (to > 0) return `${formatPrice(from)} - ${formatPrice(to)}`;
  return `від ${formatPrice(from)}`;
};

const buildMarkupMatrixRows = (rules, restaurantGroups) => {
  const rowsByRange = new Map();

  (rules || []).forEach((rule) => {
    const rangeKey = getMarkupRuleRangeKey(rule);
    if (!rowsByRange.has(rangeKey)) {
      rowsByRange.set(rangeKey, {
        rangeKey,
        costFrom: toNumber(rule.costFrom),
        costTo: toNumber(rule.costTo),
        byGroupId: {},
      });
    }

    rowsByRange.get(rangeKey).byGroupId[rule.restaurantGroupId] = rule;
  });

  return Array.from(rowsByRange.values())
    .sort((a, b) => a.costFrom - b.costFrom || a.costTo - b.costTo)
    .map((row) => ({
      ...row,
      label: formatMarkupRuleRangeLabel(row.costFrom, row.costTo),
      cells: (restaurantGroups || []).map((group) => ({
        group,
        rule: row.byGroupId[group.id] || null,
      })),
    }));
};

const formatPrice = (value) => {
  const num = toNumber(value);
  return num === 0 ? "" : num.toFixed(2);
};

const SAMPLE_BAR_TYPICAL_FIELDS = [
  {
    name: CATEGORY_FIELD_NAME,
    type: "category",
    required: false,
    defaultValue: "Віскі",
    options: [
      { name: "Віскі", useTypicalMarkup: true },
      { name: "Вино", useTypicalMarkup: false },
      { name: "Ігристе", useTypicalMarkup: false },
      { name: "Джин", useTypicalMarkup: true },
      { name: "Ром", useTypicalMarkup: true },
      { name: "Лікер", useTypicalMarkup: false },
      { name: "Текіла", useTypicalMarkup: true },
      { name: "Аперитив", useTypicalMarkup: false },
    ],
  },
  {
    name: MARKUP_SETTINGS_FIELD_NAME,
    type: "text",
    metadataKind: "markupSettings",
    restaurantGroups: [],
    rules: [],
  },
];

const SAMPLE_BAR_PRODUCTS = [
  {
    name: "GLENMORANGIE The Original 0.7L",
    category: "Віскі",
    measurementUnit: "мл",
    saleUnit: "пляшка",
    portionSaleUnit: DEFAULT_PORTION_UNIT,
    bottleVolumeMl: 700,
    portionVolumeMl: 50,
    unit: "пляшка",
    supplier: "GoodWine Trade",
    code1C: "BW-0001",
    purchasePrice: 1180,
    bottleMarkup: 95,
    bottleSalePrice: 2301,
    portionCostPrice: 84.29,
    portionMarkup: 170,
    portionSalePrice: 227.58,
    markup: 95,
    salePrice: 2301,
    costPrice: 1180,
    notes: "Шотландський односолодовий, базова позиція бару.",
    isActive: true,
  },
  {
    name: "Woodford Reserve Rye 0.7L",
    category: "Віскі",
    measurementUnit: "мл",
    saleUnit: "пляшка",
    portionSaleUnit: DEFAULT_PORTION_UNIT,
    bottleVolumeMl: 700,
    portionVolumeMl: 50,
    unit: "пляшка",
    supplier: "Metro Cash & Carry",
    code1C: "BW-0002",
    purchasePrice: 1320,
    bottleMarkup: 90,
    bottleSalePrice: 2508,
    portionCostPrice: 94.29,
    portionMarkup: 165,
    portionSalePrice: 249.86,
    markup: 90,
    salePrice: 2508,
    costPrice: 1320,
    notes: "Для коктейльної карти та продажу по шотах.",
    isActive: true,
  },
  {
    name: "Prosecco Extra Dry DOC 0.75L",
    category: "Ігристе",
    measurementUnit: "мл",
    saleUnit: "пляшка",
    portionSaleUnit: DEFAULT_PORTION_UNIT,
    bottleVolumeMl: 750,
    portionVolumeMl: 150,
    unit: "пляшка",
    supplier: "Wine Bureau",
    code1C: "BW-0003",
    purchasePrice: 420,
    bottleMarkup: 140,
    bottleSalePrice: 1008,
    portionCostPrice: 84,
    portionMarkup: 120,
    portionSalePrice: 184.8,
    markup: 140,
    salePrice: 1008,
    costPrice: 420,
    notes: "Італійське ігристе для аперитивів і продажу по келихах.",
    isActive: true,
  },
  {
    name: "Sauvignon Blanc Marlborough 0.75L",
    category: "Вино",
    measurementUnit: "мл",
    saleUnit: "пляшка",
    portionSaleUnit: DEFAULT_PORTION_UNIT,
    bottleVolumeMl: 750,
    portionVolumeMl: 150,
    unit: "пляшка",
    supplier: "Wine Bureau",
    code1C: "BW-0004",
    purchasePrice: 365,
    bottleMarkup: 135,
    bottleSalePrice: 857.75,
    portionCostPrice: 73,
    portionMarkup: 125,
    portionSalePrice: 164.25,
    markup: 135,
    salePrice: 857.75,
    costPrice: 365,
    notes: "Позиція для винної карти, під морепродукти.",
    isActive: true,
  },
  {
    name: "Aperol 1L",
    category: "Аперитив",
    measurementUnit: "мл",
    saleUnit: "пляшка",
    portionSaleUnit: DEFAULT_PORTION_UNIT,
    bottleVolumeMl: 1000,
    portionVolumeMl: 50,
    unit: "пляшка",
    supplier: "Bacardi-Martini Ukraine",
    code1C: "BW-0005",
    purchasePrice: 610,
    bottleMarkup: 120,
    bottleSalePrice: 1342,
    portionCostPrice: 30.5,
    portionMarkup: 220,
    portionSalePrice: 97.6,
    markup: 120,
    salePrice: 1342,
    costPrice: 610,
    notes: "Для Aperol Spritz і літньої коктейльної карти.",
    isActive: true,
  },
  {
    name: "Bombay Sapphire 1L",
    category: "Джин",
    measurementUnit: "мл",
    saleUnit: "пляшка",
    portionSaleUnit: DEFAULT_PORTION_UNIT,
    bottleVolumeMl: 1000,
    portionVolumeMl: 50,
    unit: "пляшка",
    supplier: "Bacardi-Martini Ukraine",
    code1C: "BW-0006",
    purchasePrice: 780,
    bottleMarkup: 110,
    bottleSalePrice: 1638,
    portionCostPrice: 39,
    portionMarkup: 210,
    portionSalePrice: 120.9,
    markup: 110,
    salePrice: 1638,
    costPrice: 780,
    notes: "Базовий джин для gin-tonic та авторських коктейлів.",
    isActive: true,
  },
];

const isAdminUser = (user) => String(user?.role || "").toLowerCase() === "admin";

const normalizeString = (value) => String(value ?? "").trim();

const getRestaurantId = (restaurant) =>
  normalizeString(restaurant?.id ?? restaurant?.restaurantId ?? restaurant?.name);

const getRestaurantName = (restaurant) =>
  normalizeString(restaurant?.name ?? restaurant?.title ?? restaurant?.restaurantName ?? restaurant?.id);

const normalizeList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => normalizeString(item))
      .filter(Boolean);
  }
  return [];
};

const normalizeAssignmentTypes = (value) => {
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return {}; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.entries(parsed).reduce((acc, [key, raw]) => {
    const normalizedKey = normalizeString(key);
    const normalizedValue = normalizeString(raw).toLowerCase();
    if (!normalizedKey) return acc;
    acc[normalizedKey] = normalizedValue === "house" || normalizedValue === "хаус" ? "house" : "standard";
    return acc;
  }, {});
};

const getAssignmentTypeLabel = (value) => (value === "house" ? "Хаус" : "");

const formatOtherRestaurantsSummary = (names) => {
  if (!Array.isArray(names) || names.length === 0) {
    return { text: "Лише цей заклад", title: "" };
  }
  if (names.length <= 2) {
    return { text: names.join(", "), title: names.join(", ") };
  }
  return {
    text: `${names.slice(0, 2).join(", ")} +${names.length - 2}`,
    title: names.join(", "),
  };
};

const getSpecificationProduct = (spec) => ({
  id: spec?.id,
  name: normalizeString(spec?.name || spec?.productName || spec?.dishName || spec?.ingredientName),
  category: normalizeString(spec?.category),
  measurementUnit: normalizeString(spec?.measurementUnit || spec?.measurement_unit || "мл"),
  saleUnit: normalizeString(spec?.saleUnit || spec?.sale_unit || spec?.unit || "пляшка"),
  portionSaleUnit: normalizeString(spec?.portionSaleUnit || spec?.portion_sale_unit || DEFAULT_PORTION_UNIT),
  bottleVolumeMl: toNumber(spec?.bottleVolumeMl ?? spec?.bottle_volume_ml ?? spec?.bottleVolume ?? spec?.bottle_volume),
  portionVolumeMl: toNumber(spec?.portionVolumeMl ?? spec?.portion_volume_ml ?? spec?.portionVolume ?? spec?.portion_volume),
  unit: normalizeString(spec?.saleUnit || spec?.sale_unit || spec?.unit || "пляшка"),
  supplier: normalizeString(spec?.supplier),
  code1C: normalizeString(spec?.code1C || spec?.code_1c || spec?.productCode),
  purchasePrice: toNumber(spec?.purchasePrice ?? spec?.purchase_price),
  bottleMarkup: toNumber(spec?.bottleMarkup ?? spec?.bottle_markup ?? spec?.markup),
  bottleSalePrice: toNumber(spec?.bottleSalePrice ?? spec?.bottle_sale_price ?? spec?.salePrice ?? spec?.sale_price),
  portionCostPrice: toNumber(spec?.portionCostPrice ?? spec?.portion_cost_price) || computePortionCost(spec?.purchasePrice ?? spec?.purchase_price, spec?.bottleVolumeMl ?? spec?.bottle_volume_ml, spec?.portionVolumeMl ?? spec?.portion_volume_ml),
  portionMarkup: toNumber(spec?.portionMarkup ?? spec?.portion_markup),
  portionSalePrice: toNumber(spec?.portionSalePrice ?? spec?.portion_sale_price),
  markup: toNumber(spec?.bottleMarkup ?? spec?.bottle_markup ?? spec?.markup),
  salePrice: toNumber(spec?.bottleSalePrice ?? spec?.bottle_sale_price ?? spec?.salePrice ?? spec?.sale_price),
  costPrice: toNumber(spec?.costPrice ?? spec?.cost_price ?? spec?.portionCost),
  pricingByRestaurantGroup: normalizePricingByRestaurantGroup(spec?.pricingByRestaurantGroup || spec?.pricing_by_restaurant_group),
  notes: normalizeString(spec?.notes),
  isActive: spec?.isActive !== false,
});

const getAssignmentRestaurantIds = (item) => {
  const ids = normalizeList(item?.restaurantIds || item?.restaurant_ids);
  if (ids.length > 0) return ids;
  const fallbackId = normalizeString(item?.restaurantId || item?.restaurant_id);
  const fallbackName = normalizeString(item?.restaurantName || item?.restaurant_name || item?.restaurant);
  return [fallbackId || fallbackName].filter(Boolean);
};

const getAssignmentRestaurantNames = (item, restaurantsById) => {
  const explicitNames = normalizeList(item?.restaurantNames || item?.restaurant_names);
  if (explicitNames.length > 0) return explicitNames;
  return getAssignmentRestaurantIds(item)
    .map((restaurantId) => restaurantsById.get(restaurantId)?.name || restaurantId)
    .filter(Boolean);
};

const buildAssignmentRecord = (item, specificationsById, restaurantsById) => {
  const specificationId = normalizeString(
    item?.specificationId || item?.specification_id || item?.specId || item?.productId || item?.product_id
  );
  const specification = specificationId ? specificationsById.get(specificationId) : null;
  const product = specification ? getSpecificationProduct(specification) : null;
  const restaurantIds = getAssignmentRestaurantIds(item);
  const restaurantNames = getAssignmentRestaurantNames(item, restaurantsById);
  const assignmentTypes = normalizeAssignmentTypes(item?.assignmentTypes || item?.assignment_types);
  const rawPricing = (() => {
    const v = item?.pricingByRestaurantId ?? item?.pricing_by_restaurant_id;
    if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } }
    return v;
  })();
  const pricingByRestaurantId = rawPricing && typeof rawPricing === "object" && !Array.isArray(rawPricing)
    ? Object.entries(rawPricing).reduce((acc, [restaurantId, pricing]) => {
        acc[restaurantId] = {
          restaurantGroupId: normalizeString(pricing?.restaurantGroupId || pricing?.groupId),
          restaurantGroupName: normalizeString(pricing?.restaurantGroupName || pricing?.groupName),
          ruleId: normalizeString(pricing?.ruleId),
          portionCostPrice: toNumber(pricing?.portionCostPrice),
          portionSalePrice: toNumber(pricing?.portionSalePrice || pricing?.targetPortionPrice),
          portionMarkup: toNumber(pricing?.portionMarkup),
        };
        return acc;
      }, {})
    : {};

  return {
    ...item,
    specificationId,
    name: normalizeString(item?.productName || item?.product_name || item?.name || product?.name),
    category: normalizeString(item?.category || product?.category),
    measurementUnit: normalizeString(item?.measurementUnit || item?.measurement_unit || product?.measurementUnit),
    saleUnit: normalizeString(item?.saleUnit || item?.sale_unit || item?.unit || product?.saleUnit || product?.unit),
    portionSaleUnit: normalizeString(item?.portionSaleUnit || item?.portion_sale_unit || product?.portionSaleUnit),
    bottleVolumeMl: toNumber(item?.bottleVolumeMl ?? item?.bottle_volume_ml ?? product?.bottleVolumeMl),
    portionVolumeMl: toNumber(item?.portionVolumeMl ?? item?.portion_volume_ml ?? product?.portionVolumeMl),
    unit: normalizeString(item?.saleUnit || item?.sale_unit || item?.unit || product?.saleUnit || product?.unit),
    supplier: normalizeString(item?.supplier || product?.supplier),
    code1C: normalizeString(item?.code1C || item?.code_1c || product?.code1C),
    purchasePrice: toNumber(item?.purchasePrice ?? item?.purchase_price ?? product?.purchasePrice),
    bottleMarkup: toNumber(item?.bottleMarkup ?? item?.bottle_markup ?? item?.markup ?? product?.bottleMarkup ?? product?.markup),
    bottleSalePrice: toNumber(item?.bottleSalePrice ?? item?.bottle_sale_price ?? item?.salePrice ?? item?.sale_price ?? product?.bottleSalePrice ?? product?.salePrice),
    portionCostPrice: toNumber(item?.portionCostPrice ?? item?.portion_cost_price ?? product?.portionCostPrice),
    portionMarkup: toNumber(item?.portionMarkup ?? item?.portion_markup ?? product?.portionMarkup),
    portionSalePrice: toNumber(item?.portionSalePrice ?? item?.portion_sale_price ?? product?.portionSalePrice),
    markup: toNumber(item?.bottleMarkup ?? item?.bottle_markup ?? item?.markup ?? product?.bottleMarkup ?? product?.markup),
    salePrice: toNumber(item?.bottleSalePrice ?? item?.bottle_sale_price ?? item?.salePrice ?? item?.sale_price ?? product?.bottleSalePrice ?? product?.salePrice),
    costPrice: toNumber(item?.costPrice ?? item?.cost_price ?? product?.costPrice),
    notes: normalizeString(item?.notes || product?.notes),
    isActive: item?.isActive !== false && product?.isActive !== false,
    restaurantIds,
    restaurantNames,
    assignmentTypes,
    pricingByRestaurantId,
  };
};

const mergeAssignmentsBySpecification = (items, specificationsById, restaurantsById) => {
  const merged = new Map();

  (items || []).forEach((item) => {
    const assignment = buildAssignmentRecord(item, specificationsById, restaurantsById);
    const mergeKey = assignment.specificationId || assignment.code1C || assignment.name;
    if (!mergeKey) return;

    const existing = merged.get(mergeKey);
    if (!existing) {
      merged.set(mergeKey, {
        ...assignment,
        sourceIds: [assignment.id].filter(Boolean),
        restaurantIds: [...assignment.restaurantIds],
        restaurantNames: [...assignment.restaurantNames],
        assignmentTypes: { ...assignment.assignmentTypes },
        pricingByRestaurantId: { ...(assignment.pricingByRestaurantId || {}) },
      });
      return;
    }

    const restaurantIds = Array.from(new Set([...existing.restaurantIds, ...assignment.restaurantIds]));
    const restaurantNames = Array.from(new Set([...existing.restaurantNames, ...assignment.restaurantNames]));
    merged.set(mergeKey, {
      ...existing,
      restaurantIds,
      restaurantNames,
      assignmentTypes: { ...(existing.assignmentTypes || {}), ...(assignment.assignmentTypes || {}) },
      pricingByRestaurantId: { ...(existing.pricingByRestaurantId || {}), ...(assignment.pricingByRestaurantId || {}) },
      sourceIds: Array.from(new Set([...(existing.sourceIds || []), assignment.id].filter(Boolean))),
      isActive: existing.isActive !== false || assignment.isActive !== false,
      notes: existing.notes || assignment.notes,
    });
  });

  return merged;
};

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */

const AssortmentMatrixModule = ({ topTab = "matrix", topTabLabel = "", restaurants = [], user = null }) => {
  const kind = normalizeTabKind(topTab, topTabLabel);

  const {
    items,
    typicalFields,
    specifications,
    loading,
    error,
    addItem,
    updateItem,
    deleteItem,
    addField,
    updateField,
    deleteField,
    addSpec,
    updateSpec,
    deleteSpec,
  } = useAssortmentMatrix();

  // Load bar access records
  const [barAccessRecords, setBarAccessRecords] = useState([]);
  useEffect(() => {
    if (!isCollectionsApiEnabled()) return;
    listCollectionItemsApi(ACCESS_COLLECTION).then(setBarAccessRecords).catch(() => {});
  }, []);

  const myEmail = String(user?.email || "").toLowerCase().trim();
  const myBarAccess = useMemo(() => barAccessRecords.find((r) => r.userEmail?.toLowerCase() === myEmail), [barAccessRecords, myEmail]);

  if (loading) {
    return (
      <div className={cardClass}>
        <p className="text-sm text-slate-500 animate-pulse">Завантаження даних асортиментної матриці…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cardClass}>
        <p className="text-sm text-red-600">Помилка: {String(error?.message || error)}</p>
      </div>
    );
  }

  if (kind === "access") {
    return (
      <AccessManagementView
        restaurants={restaurants}
        user={user}
      />
    );
  }

  if (kind === "typicalFields") {
    return (
      <TypicalFieldsView
        typicalFields={typicalFields}
        addField={addField}
        updateField={updateField}
        deleteField={deleteField}
      />
    );
  }

  if (kind === "markups") {
    return (
      <MarkupSettingsView
        typicalFields={typicalFields}
        restaurants={restaurants}
        addField={addField}
        updateField={updateField}
      />
    );
  }

  if (kind === "specifications") {
    return (
      <SpecificationsView
        specifications={specifications}
        typicalFields={typicalFields}
        user={user}
        barAccess={myBarAccess}
        addField={addField}
        addSpec={addSpec}
        updateSpec={updateSpec}
        deleteSpec={deleteSpec}
      />
    );
  }

  return (
    <MatrixView
      items={items}
      specifications={specifications}
      typicalFields={typicalFields}
      restaurants={restaurants}
      user={user}
      barAccess={myBarAccess}
      addItem={addItem}
      updateItem={updateItem}
      deleteItem={deleteItem}
    />
  );
};

/* ═══════════════════════════════════════════════════
   ACCESS MANAGEMENT VIEW
   ═══════════════════════════════════════════════════ */

const ACCESS_COLLECTION = "barvinoAccess";

const BAR_ROLES = {
  manager: "Керівник бару",
  bartender: "Бармен",
};

const PERMISSION_LABELS = {
  viewMatrix: "Перегляд матриці",
  editPrices: "Редагування цін",
  editAssignments: "Прив'язка продукції",
  editSpecifications: "Редагування специфікацій",
  editMarkups: "Редагування націнок",
  manageAccess: "Керування доступами",
};

const DEFAULT_BARTENDER_PERMISSIONS = ["viewMatrix"];
const DEFAULT_MANAGER_PERMISSIONS = Object.keys(PERMISSION_LABELS);

const AccessManagementView = ({ restaurants, user }) => {
  const isAdmin = isAdminUser(user);
  const myEmail = String(user?.email || "").toLowerCase().trim();

  const [accessRecords, setAccessRecords] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [formData, setFormData] = useState({ userId: "", userName: "", userEmail: "", role: "bartender", restaurantIds: [], permissions: [...DEFAULT_BARTENDER_PERMISSIONS] });

  // Check if current user is a bar manager
  const myAccess = useMemo(() => accessRecords.find((r) => r.userEmail?.toLowerCase() === myEmail), [accessRecords, myEmail]);
  const isBarManager = isAdmin || (myAccess?.role === "manager");
  const canManageAccess = isAdmin || (myAccess?.permissions || []).includes("manageAccess");

  // Load data
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [records, users] = await Promise.all([
          isCollectionsApiEnabled() ? listCollectionItemsApi(ACCESS_COLLECTION) : [],
          getUsers(),
        ]);
        if (cancelled) return;
        setAccessRecords(records);
        setAllUsers(users);
      } catch (err) {
        console.error("[BarAccess] Load error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const usersNotAssigned = useMemo(() => {
    const assignedEmails = new Set(accessRecords.map((r) => r.userEmail?.toLowerCase()));
    return allUsers.filter((u) => u.email && !assignedEmails.has(u.email.toLowerCase()));
  }, [allUsers, accessRecords]);

  const handleSave = useCallback(async () => {
    if (!formData.userEmail && !formData.userId) { alert("Оберіть користувача"); return; }
    if (formData.role === "bartender" && formData.restaurantIds.length === 0) { alert("Оберіть хоча б один заклад для бармена"); return; }

    const nowIso = new Date().toISOString();
    const record = {
      userId: formData.userId,
      userName: formData.userName,
      userEmail: formData.userEmail,
      role: formData.role,
      restaurantIds: formData.role === "manager" ? (restaurants || []).map((r) => getRestaurantId(r)) : formData.restaurantIds,
      permissions: formData.permissions,
      updatedAt: nowIso,
      updatedBy: myEmail,
    };

    try {
      if (editingId) {
        await updateCollectionItemApi(ACCESS_COLLECTION, editingId, record);
        setAccessRecords((prev) => prev.map((r) => r.id === editingId ? { ...r, ...record } : r));
      } else {
        record.createdAt = nowIso;
        record.createdBy = myEmail;
        const created = await createCollectionItemApi(ACCESS_COLLECTION, record);
        setAccessRecords((prev) => [...prev, { ...record, id: created?.id || `ba_${Date.now()}` }]);
      }
      setShowForm(false);
      setEditingId("");
    } catch (err) {
      alert("Помилка збереження: " + (err?.message || err));
    }
  }, [formData, editingId, restaurants, myEmail]);

  const handleDelete = useCallback(async (record) => {
    if (!confirm(`Видалити доступ для ${record.userName || record.userEmail}?`)) return;
    try {
      await deleteCollectionItemApi(ACCESS_COLLECTION, record.id);
      setAccessRecords((prev) => prev.filter((r) => r.id !== record.id));
    } catch (err) {
      alert("Помилка видалення: " + (err?.message || err));
    }
  }, []);

  const openEditForm = (record) => {
    setFormData({
      userId: record.userId || "",
      userName: record.userName || "",
      userEmail: record.userEmail || "",
      role: record.role || "bartender",
      restaurantIds: record.restaurantIds || [],
      permissions: record.permissions || [...DEFAULT_BARTENDER_PERMISSIONS],
    });
    setEditingId(record.id);
    setShowForm(true);
  };

  const openAddForm = () => {
    setFormData({ userId: "", userName: "", userEmail: "", role: "bartender", restaurantIds: [], permissions: [...DEFAULT_BARTENDER_PERMISSIONS] });
    setEditingId("");
    setShowForm(true);
  };

  const toggleRestaurant = (restaurantId) => {
    setFormData((prev) => {
      const next = prev.restaurantIds.includes(restaurantId)
        ? prev.restaurantIds.filter((id) => id !== restaurantId)
        : [...prev.restaurantIds, restaurantId];
      return { ...prev, restaurantIds: next };
    });
  };

  const togglePermission = (perm) => {
    setFormData((prev) => {
      const next = prev.permissions.includes(perm)
        ? prev.permissions.filter((p) => p !== perm)
        : [...prev, perm];
      return { ...prev, permissions: next.includes(perm) ? prev.permissions : [...prev.permissions, perm] };
    });
  };

  const setRole = (role) => {
    setFormData((prev) => ({
      ...prev,
      role,
      permissions: role === "manager" ? [...DEFAULT_MANAGER_PERMISSIONS] : [...DEFAULT_BARTENDER_PERMISSIONS],
      restaurantIds: role === "manager" ? (restaurants || []).map((r) => getRestaurantId(r)) : prev.restaurantIds,
    }));
  };

  if (loading) return <div className={cardClass}><p className="text-sm text-slate-500 animate-pulse">Завантаження…</p></div>;

  if (!canManageAccess) {
    return (
      <div className={cardClass}>
        <p className="text-sm text-slate-500">У вас немає прав для керування доступами модуля «Бар та Вино».</p>
        {myAccess && (
          <div className="mt-3 text-sm">
            <p>Ваша роль: <strong>{BAR_ROLES[myAccess.role] || myAccess.role}</strong></p>
            <p>Заклади: {(myAccess.restaurantIds || []).map((id) => {
              const r = (restaurants || []).find((rest) => getRestaurantId(rest) === id);
              return r ? getRestaurantName(r) : id;
            }).join(", ") || "—"}</p>
          </div>
        )}
      </div>
    );
  }

  const managers = accessRecords.filter((r) => r.role === "manager");
  const bartenders = accessRecords.filter((r) => r.role === "bartender");

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Header */}
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold flex items-center gap-2"><Shield size={18} /> Керування доступами</h3>
          <button type="button" className={btnPrimary} onClick={openAddForm}>
            <Plus size={16} /> Додати доступ
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Призначте керівників бару (повний доступ до всіх закладів) та барменів (перегляд обраних закладів). Можна делегувати права редагування окремим акаунтам.
        </p>
      </div>

      {/* Form */}
      {showForm && (
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">{editingId ? "Редагування доступу" : "Новий доступ"}</h3>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(""); }} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* User */}
            <div>
              <label className="text-xs font-semibold text-slate-600">Користувач *</label>
              {editingId ? (
                <input className={inputClass} value={`${formData.userName} (${formData.userEmail})`} disabled />
              ) : (
                <select
                  className={inputClass}
                  value={formData.userId}
                  onChange={(e) => {
                    const u = allUsers.find((u) => u.id === e.target.value);
                    if (u) setFormData((prev) => ({ ...prev, userId: u.id, userName: u.displayName || u.name || u.email, userEmail: u.email }));
                  }}
                >
                  <option value="">Оберіть користувача</option>
                  {usersNotAssigned.map((u) => (
                    <option key={u.id} value={u.id}>{u.displayName || u.name || u.email}{u.role ? ` (${u.role})` : ""}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Role */}
            <div>
              <label className="text-xs font-semibold text-slate-600">Роль *</label>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${formData.role === "manager" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
                  onClick={() => setRole("manager")}
                >
                  <UserCheck size={14} className="inline mr-1" /> Керівник
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${formData.role === "bartender" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
                  onClick={() => setRole("bartender")}
                >
                  <Users size={14} className="inline mr-1" /> Бармен
                </button>
              </div>
            </div>

            {/* Restaurants (for bartenders) */}
            {formData.role === "bartender" && (
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-600">Заклади *</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(restaurants || []).map((r) => {
                    const id = getRestaurantId(r);
                    const name = getRestaurantName(r);
                    const selected = formData.restaurantIds.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${selected ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
                        onClick={() => toggleRestaurant(id)}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {formData.role === "manager" && (
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500 mt-1">Керівник має доступ до всіх закладів автоматично.</p>
              </div>
            )}

            {/* Permissions */}
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-600">Дозволи</label>
              <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(PERMISSION_LABELS).map(([key, label]) => {
                  const checked = formData.permissions.includes(key);
                  const isManagerPerm = formData.role === "manager";
                  return (
                    <label key={key} className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isManagerPerm}
                        onChange={() => {
                          setFormData((prev) => ({
                            ...prev,
                            permissions: checked ? prev.permissions.filter((p) => p !== key) : [...prev.permissions, key],
                          }));
                        }}
                        className="rounded border-slate-300"
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
              {formData.role === "manager" && <p className="text-xs text-slate-400 mt-1">Керівник має всі дозволи.</p>}
            </div>

            {/* Save */}
            <div className="sm:col-span-2 flex gap-2">
              <button type="button" className={btnPrimary} onClick={handleSave}>
                <Save size={16} /> {editingId ? "Оновити" : "Зберегти"}
              </button>
              <button type="button" className={btnSecondary} onClick={() => { setShowForm(false); setEditingId(""); }}>Скасувати</button>
            </div>
          </div>
        </div>
      )}

      {/* Managers */}
      <div className={cardClass}>
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><UserCheck size={16} className="text-indigo-600" /> Керівники бару ({managers.length})</h4>
        {managers.length === 0 ? (
          <p className="text-sm text-slate-400">Керівників ще не призначено.</p>
        ) : (
          <div className="space-y-2">
            {managers.map((record) => (
              <div key={record.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{record.userName || record.userEmail}</div>
                  <div className="text-xs text-slate-500">{record.userEmail} · Повний доступ до всіх закладів</div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" className="p-1 hover:bg-slate-100 rounded" title="Редагувати" onClick={() => openEditForm(record)}>
                    <Edit3 size={15} className="text-slate-500" />
                  </button>
                  {canManageAccess && (
                    <button type="button" className="p-1 hover:bg-red-50 rounded" title="Видалити" onClick={() => handleDelete(record)}>
                      <Trash2 size={15} className="text-red-400" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bartenders */}
      <div className={cardClass}>
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Users size={16} className="text-emerald-600" /> Бармени ({bartenders.length})</h4>
        {bartenders.length === 0 ? (
          <p className="text-sm text-slate-400">Барменів ще не додано.</p>
        ) : (
          <div className="space-y-2">
            {bartenders.map((record) => {
              const restNames = (record.restaurantIds || []).map((id) => {
                const r = (restaurants || []).find((rest) => getRestaurantId(rest) === id);
                return r ? getRestaurantName(r) : id;
              });
              const extraPerms = (record.permissions || []).filter((p) => p !== "viewMatrix");
              return (
                <div key={record.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">{record.userName || record.userEmail}</div>
                    <div className="text-xs text-slate-500">{record.userEmail}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {restNames.map((name) => (
                        <span key={name} className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">{name}</span>
                      ))}
                    </div>
                    {extraPerms.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {extraPerms.map((p) => (
                          <span key={p} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">{PERMISSION_LABELS[p] || p}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="p-1 hover:bg-slate-100 rounded" title="Редагувати" onClick={() => openEditForm(record)}>
                      <Edit3 size={15} className="text-slate-500" />
                    </button>
                    {canManageAccess && (
                      <button type="button" className="p-1 hover:bg-red-50 rounded" title="Видалити" onClick={() => handleDelete(record)}>
                        <Trash2 size={15} className="text-red-400" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AssortmentMatrixModule;

/* ═══════════════════════════════════════════════════
   MATRIX VIEW
   ═══════════════════════════════════════════════════ */

const MatrixView = ({ items, specifications, typicalFields, restaurants, user, barAccess, addItem, updateItem, deleteItem }) => {
  const isAdmin = isAdminUser(user);
  const isBarManager = barAccess?.role === "manager";
  const canEdit = isAdmin || isBarManager || (barAccess?.permissions || []).includes("editAssignments");
  const canEditPrices = isAdmin || isBarManager || (barAccess?.permissions || []).includes("editPrices");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [busyProductId, setBusyProductId] = useState("");
  const [busyTypeProductId, setBusyTypeProductId] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [editingPriceProductId, setEditingPriceProductId] = useState("");
  const [editingPriceValue, setEditingPriceValue] = useState("");
  const fileInputRef = useRef(null);

  const specificationOptions = useMemo(
    () => specifications.map((spec) => getSpecificationProduct(spec)).filter((spec) => spec.name),
    [specifications]
  );

  const markupSettings = useMemo(() => getMarkupSettings(typicalFields), [typicalFields]);
  const restaurantPricingGroups = markupSettings.restaurantGroups;

  const specificationsById = useMemo(
    () => new Map(specificationOptions.map((spec) => [String(spec.id), spec])),
    [specificationOptions]
  );

  const restaurantsById = useMemo(() => {
    const map = new Map();
    (restaurants || []).forEach((restaurant) => {
      const id = getRestaurantId(restaurant);
      if (!id) return;
      map.set(id, { id, name: getRestaurantName(restaurant) });
    });
    return map;
  }, [restaurants]);

  const visibleRestaurants = useMemo(() => {
    const all = Array.from(restaurantsById.values()).sort((a, b) => a.name.localeCompare(b.name, "uk"));
    // Bartenders only see their assigned restaurants
    if (!canEdit && barAccess?.restaurantIds?.length > 0) {
      const allowed = new Set(barAccess.restaurantIds);
      return all.filter((r) => allowed.has(r.id));
    }
    return all;
  }, [restaurantsById, canEdit, barAccess]);

  useEffect(() => {
    if (visibleRestaurants.length === 0) {
      setSelectedRestaurantId("");
      return;
    }
    if (!selectedRestaurantId || !visibleRestaurants.some((restaurant) => restaurant.id === selectedRestaurantId)) {
      setSelectedRestaurantId(visibleRestaurants[0].id);
    }
  }, [visibleRestaurants, selectedRestaurantId]);

  const mergedAssignments = useMemo(
    () => mergeAssignmentsBySpecification(items, specificationsById, restaurantsById),
    [items, specificationsById, restaurantsById]
  );

  const categories = useMemo(() => {
    const set = new Set();
    specificationOptions.forEach((product) => {
      if (product.category) set.add(product.category);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "uk"));
  }, [specificationOptions]);

  const catalogRows = useMemo(() => {
    let result = specificationOptions.map((product) => {
      const assignment = mergedAssignments.get(String(product.id))
        || mergedAssignments.get(product.code1C)
        || mergedAssignments.get(product.name);
      const restaurantIds = assignment?.restaurantIds || [];
      const restaurantNames = assignment?.restaurantNames || [];
      const isAssignedToSelected = selectedRestaurantId ? restaurantIds.includes(selectedRestaurantId) : false;
      const selectedRestaurantPricing = selectedRestaurantId
        ? (assignment?.pricingByRestaurantId?.[selectedRestaurantId] || getPricingForRestaurant({
            pricingByRestaurantGroup: product.pricingByRestaurantGroup,
            restaurantId: selectedRestaurantId,
            restaurantGroups: restaurantPricingGroups,
          }))
        : null;

      return {
        ...product,
        assignmentId: assignment?.id || "",
        sourceIds: assignment?.sourceIds || [],
        assignmentNotes: assignment?.notes || "",
        assignedRestaurantIds: restaurantIds,
        assignedRestaurantNames: restaurantNames,
        assignmentTypes: assignment?.assignmentTypes || {},
        selectedAssignmentType: assignment?.assignmentTypes?.[selectedRestaurantId] || "standard",
        selectedRestaurantPricing,
        effectivePortionSalePrice: roundToTen(toNumber(selectedRestaurantPricing?.portionSalePrice ?? product.portionSalePrice)),
        effectivePortionMarkup: toNumber(selectedRestaurantPricing?.portionMarkup ?? product.portionMarkup),
        isAssignedToSelected,
      };
    });

    if (!canEdit && selectedRestaurantId) {
      result = result.filter((row) => row.isAssignedToSelected);
    }

    const q = search.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (row) =>
          (row.name || "").toLowerCase().includes(q) ||
          (row.category || "").toLowerCase().includes(q) ||
          (row.code1C || "").toLowerCase().includes(q) ||
          (row.supplier || "").toLowerCase().includes(q)
      );
    }

    if (filterCategory) {
      result = result.filter((row) => row.category === filterCategory);
    }

    result.sort((a, b) => {
      const av = String(a[sortField] || "").toLowerCase();
      const bv = String(b[sortField] || "").toLowerCase();
      const cmp = av.localeCompare(bv, "uk");
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [specificationOptions, mergedAssignments, selectedRestaurantId, restaurantPricingGroups, isAdmin, search, filterCategory, sortField, sortDir]);

  const groupedCatalogRows = useMemo(() => {
    const groups = new Map();
    catalogRows.forEach((row) => {
      const key = row.category || "Без категорії";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, "uk"));
  }, [catalogRows]);

  useEffect(() => {
    setCollapsedCategories((prev) => {
      const next = { ...prev };
      groupedCatalogRows.forEach(([categoryName]) => {
        if (typeof next[categoryName] === "undefined") {
          next[categoryName] = true;
        }
      });
      return next;
    });
  }, [groupedCatalogRows]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDir("asc");
  };

  const SortIcon = ({ field }) =>
    sortField === field ? (sortDir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : null;

  const upsertAssignmentForRestaurant = async (product, shouldAssign) => {
    if (!selectedRestaurantId) return;
    const restaurant = restaurantsById.get(selectedRestaurantId);
    if (!restaurant) return;

    const mergedAssignment = mergedAssignments.get(String(product.id))
      || mergedAssignments.get(product.code1C)
      || mergedAssignments.get(product.name);

    const currentRestaurantIds = mergedAssignment?.restaurantIds || [];
    const currentAssignmentTypes = mergedAssignment?.assignmentTypes || {};
    const currentPricingByRestaurantId = mergedAssignment?.pricingByRestaurantId || {};
    const nextRestaurantIds = shouldAssign
      ? Array.from(new Set([...currentRestaurantIds, selectedRestaurantId]))
      : currentRestaurantIds.filter((restaurantId) => restaurantId !== selectedRestaurantId);
    const nextAssignmentTypes = { ...currentAssignmentTypes };
    const nextPricingByRestaurantId = { ...currentPricingByRestaurantId };
    if (shouldAssign) {
      nextAssignmentTypes[selectedRestaurantId] = nextAssignmentTypes[selectedRestaurantId] || "standard";
      if (product.selectedRestaurantPricing) {
        nextPricingByRestaurantId[selectedRestaurantId] = product.selectedRestaurantPricing;
      }
    } else {
      delete nextAssignmentTypes[selectedRestaurantId];
      delete nextPricingByRestaurantId[selectedRestaurantId];
    }

    setBusyProductId(String(product.id));
    try {
      if (mergedAssignment?.id) {
        if (nextRestaurantIds.length === 0) {
          await deleteItem(mergedAssignment.id);
          return;
        }

        await updateItem(mergedAssignment.id, {
          specificationId: product.id,
          productName: product.name,
          category: product.category,
          subCategory: product.subCategory,
          unit: product.unit,
          supplier: product.supplier,
          code1C: product.code1C,
          purchasePrice: product.purchasePrice,
          markup: product.markup,
          salePrice: product.salePrice,
          costPrice: product.costPrice,
          restaurantIds: nextRestaurantIds,
          restaurantNames: nextRestaurantIds.map((restaurantId) => restaurantsById.get(restaurantId)?.name || restaurantId),
          assignmentTypes: JSON.stringify(nextAssignmentTypes),
          pricingByRestaurantId: JSON.stringify(nextPricingByRestaurantId),
          isActive: product.isActive,
          notes: mergedAssignment.notes || "",
        });
        return;
      }

      if (!shouldAssign) return;

      await addItem({
        specificationId: product.id,
        productName: product.name,
        category: product.category,
        subCategory: product.subCategory,
        unit: product.unit,
        supplier: product.supplier,
        code1C: product.code1C,
        purchasePrice: product.purchasePrice,
        markup: product.markup,
        salePrice: product.salePrice,
        costPrice: product.costPrice,
        restaurantIds: [restaurant.id],
        restaurantNames: [restaurant.name],
        assignmentTypes: JSON.stringify({ [restaurant.id]: "standard" }),
        pricingByRestaurantId: JSON.stringify(product.selectedRestaurantPricing ? { [restaurant.id]: product.selectedRestaurantPricing } : {}),
        isActive: product.isActive,
        notes: "",
      });
    } finally {
      setBusyProductId("");
    }
  };

  const handleExport = async () => {
    const { exportAssortmentMatrixToExcel } = await loadExcelHelpers();
    const exportRows = catalogRows
      .filter((row) => row.isAssignedToSelected)
      .map((row) => ({
        ...row,
        restaurantIds: selectedRestaurantId ? [selectedRestaurantId] : [],
        restaurantNames: selectedRestaurantId ? [restaurantsById.get(selectedRestaurantId)?.name || selectedRestaurantId] : [],
        portionMarkup: row.effectivePortionMarkup,
        portionSalePrice: row.effectivePortionSalePrice,
      }));
    exportAssortmentMatrixToExcel(exportRows, specificationOptions, typicalFields);
  };

  const handleImport = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    try {
      const { importAssortmentMatrixFromExcel } = await loadExcelHelpers();
      const imported = await importAssortmentMatrixFromExcel(file, visibleRestaurants, specificationOptions);
      let count = 0;
      for (const item of imported) {
        await addItem(item);
        count++;
      }
      alert(`Імпортовано ${count} прив'язок`);
    } catch (err) {
      alert("Помилка імпорту: " + (err?.message || err));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleTemplate = async () => {
    const { downloadAssortmentMatrixTemplate } = await loadExcelHelpers();
    downloadAssortmentMatrixTemplate();
  };

  const selectedRestaurantName = selectedRestaurantId ? restaurantsById.get(selectedRestaurantId)?.name || "" : "";

  const updatePriceForRestaurant = async (product, newPrice) => {
    if (!selectedRestaurantId) return;
    const roundedPrice = roundToTen(toNumber(newPrice));
    if (roundedPrice <= 0) { setEditingPriceProductId(""); return; }

    const targetId = product.assignmentId
      || (mergedAssignments.get(String(product.id))
        || mergedAssignments.get(product.code1C)
        || mergedAssignments.get(product.name))?.id;

    if (!targetId) {
      alert("Не знайдено прив'язку для цього продукту. Спочатку прив'яжіть продукт до закладу.");
      setEditingPriceProductId("");
      return;
    }

    const mergedAssignment = mergedAssignments.get(String(product.id))
      || mergedAssignments.get(product.code1C)
      || mergedAssignments.get(product.name);

    const existingPricing = typeof mergedAssignment?.pricingByRestaurantId === "string"
      ? JSON.parse(mergedAssignment.pricingByRestaurantId || "{}")
      : (mergedAssignment?.pricingByRestaurantId || {});

    const portionCostPrice = toNumber(product.portionCostPrice);
    const portionMarkup = portionCostPrice > 0 ? roundMoney(((roundedPrice - portionCostPrice) / portionCostPrice) * 100) : 0;

    const nextPricing = {
      ...existingPricing,
      [selectedRestaurantId]: {
        ...(existingPricing[selectedRestaurantId] || {}),
        portionSalePrice: roundedPrice,
        portionCostPrice,
        portionMarkup,
      },
    };

    setBusyTypeProductId(String(product.id));
    try {
      const result = await updateItem(targetId, {
        specificationId: product.id,
        productName: product.name,
        category: product.category,
        subCategory: product.subCategory || "",
        unit: product.unit,
        supplier: product.supplier,
        code1C: product.code1C,
        purchasePrice: product.purchasePrice,
        bottleMarkup: product.bottleMarkup,
        bottleSalePrice: product.bottleSalePrice,
        portionCostPrice: product.portionCostPrice,
        portionMarkup: product.portionMarkup,
        portionSalePrice: product.portionSalePrice,
        markup: product.markup,
        salePrice: product.salePrice,
        costPrice: product.costPrice,
        restaurantIds: product.assignedRestaurantIds || mergedAssignment?.restaurantIds || [selectedRestaurantId],
        restaurantNames: product.assignedRestaurantNames || mergedAssignment?.restaurantNames || [],
        assignmentTypes: JSON.stringify(
          typeof mergedAssignment?.assignmentTypes === "string"
            ? JSON.parse(mergedAssignment.assignmentTypes || "{}")
            : (mergedAssignment?.assignmentTypes || {})
        ),
        pricingByRestaurantId: JSON.stringify(nextPricing),
        isActive: product.isActive,
        notes: product.assignmentNotes || mergedAssignment?.notes || "",
      });
      if (!result?.success) {
        alert("Не вдалося оновити ціну: " + (result?.error?.message || "невідома помилка"));
      }
    } catch (err) {
      alert("Не вдалося оновити ціну: " + (err?.message || err));
    } finally {
      setBusyTypeProductId("");
      setEditingPriceProductId("");
    }
  };

  const updateAssignmentTypeForRestaurant = async (product, nextType) => {
    if (!selectedRestaurantId) return;

    const targetId = product.assignmentId
      || (mergedAssignments.get(String(product.id))
        || mergedAssignments.get(product.code1C)
        || mergedAssignments.get(product.name))?.id;

    if (!targetId) {
      alert("Не знайдено прив'язку для цього продукту. Спочатку прив'яжіть продукт до закладу.");
      return;
    }

    const mergedAssignment = mergedAssignments.get(String(product.id))
      || mergedAssignments.get(product.code1C)
      || mergedAssignments.get(product.name);

    setBusyTypeProductId(String(product.id));
    try {
      const result = await updateItem(targetId, {
        specificationId: product.id,
        productName: product.name,
        category: product.category,
        subCategory: product.subCategory || "",
        unit: product.unit,
        supplier: product.supplier,
        code1C: product.code1C,
        purchasePrice: product.purchasePrice,
        bottleMarkup: product.bottleMarkup,
        bottleSalePrice: product.bottleSalePrice,
        portionCostPrice: product.portionCostPrice,
        portionMarkup: product.portionMarkup,
        portionSalePrice: product.portionSalePrice,
        markup: product.markup,
        salePrice: product.salePrice,
        costPrice: product.costPrice,
        restaurantIds: product.assignedRestaurantIds || mergedAssignment?.restaurantIds || [selectedRestaurantId],
        restaurantNames: product.assignedRestaurantNames || mergedAssignment?.restaurantNames || [],
        assignmentTypes: JSON.stringify({
          ...(typeof product.assignmentTypes === "string" ? JSON.parse(product.assignmentTypes || "{}") : (product.assignmentTypes || {})),
          ...(typeof mergedAssignment?.assignmentTypes === "string" ? JSON.parse(mergedAssignment.assignmentTypes || "{}") : (mergedAssignment?.assignmentTypes || {})),
          [selectedRestaurantId]: nextType,
        }),
        pricingByRestaurantId: JSON.stringify(
          typeof mergedAssignment?.pricingByRestaurantId === "string"
            ? JSON.parse(mergedAssignment.pricingByRestaurantId || "{}")
            : (mergedAssignment?.pricingByRestaurantId || {})
        ),
        isActive: product.isActive,
        notes: product.assignmentNotes || mergedAssignment?.notes || "",
      });
      if (!result?.success) {
        alert("Не вдалося оновити тип прив'язки: " + (result?.error?.message || "невідома помилка"));
      }
    } catch (err) {
      alert("Не вдалося оновити тип: " + (err?.message || err));
    } finally {
      setBusyTypeProductId("");
    }
  };

  const toggleCategory = (categoryName) => {
    setCollapsedCategories((prev) => {
      const isCurrentlyCollapsed = !!prev[categoryName];
      const next = {};
      Object.keys(prev).forEach((key) => {
        next[key] = true;
      });
      next[categoryName] = !isCurrentlyCollapsed;
      return next;
    });
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className={cardClass}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук за продукцією, категорією або кодом…"
              className={inputClass + " !pl-9"}
            />
          </div>

          {categories.length > 0 && (
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className={inputClass + " !mt-0 !w-auto min-w-[180px]"}
            >
              <option value="">Усі категорії</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          )}

          <select
            value={selectedRestaurantId}
            onChange={(e) => setSelectedRestaurantId(e.target.value)}
            className={inputClass + " !mt-0 !w-auto min-w-[220px]"}
          >
            <option value="">Оберіть заклад</option>
            {visibleRestaurants.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
            ))}
          </select>

          <button type="button" className={btnSecondary} onClick={handleExport} disabled={!selectedRestaurantId}>
            <Download size={16} /> Експорт
          </button>

          {canEdit && (
            <>
              <button type="button" className={btnSecondary} onClick={() => fileInputRef.current?.click()}>
                <Upload size={16} /> Імпорт
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
              <button type="button" className={btnSecondary} onClick={handleTemplate}>
                <FileDown size={16} /> Шаблон
              </button>
            </>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>Обраний заклад: {selectedRestaurantName || "не обрано"}</span>
          <span>
            {canEdit
              ? `У каталозі: ${catalogRows.length} позицій. Кнопкою керуєш, що має продаватись у вибраному закладі.`
              : `Ти бачиш лише продукцію, дозволену для закладу ${selectedRestaurantName || ""}.`}
          </span>
        </div>
      </div>

      {canEdit && specificationOptions.length === 0 && (
        <div className={cardClass}>
          <p className="text-sm text-amber-700">
            Спочатку додайте алкогольну продукцію у вкладці "Специфікації", після цього її можна буде вмикати для закладів у матриці.
          </p>
        </div>
      )}

      {!selectedRestaurantId ? (
        <div className={cardClass}>
          <p className="px-3 py-8 text-center text-slate-400">Спочатку оберіть заклад</p>
        </div>
      ) : groupedCatalogRows.length === 0 ? (
        <div className={cardClass}>
          <p className="px-3 py-8 text-center text-slate-400">Позицій не знайдено</p>
        </div>
      ) : (
        groupedCatalogRows.map(([categoryName, rows]) => (
          <div key={categoryName} className={cardClass + " overflow-x-auto !p-3"}>
            <button
              type="button"
              onClick={() => toggleCategory(categoryName)}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">{categoryName}</span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  {rows.length} поз.
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  Активних: {rows.filter((row) => row.isAssignedToSelected).length}
                </span>
              </div>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500">
                {collapsedCategories[categoryName] ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </span>
            </button>

            {collapsedCategories[categoryName] ? null : (
              <div className="mt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-3 py-2 cursor-pointer" onClick={() => handleSort("name")}>
                      <span className="inline-flex items-center gap-1">Продукція <SortIcon field="name" /></span>
                    </th>
                    <th className="px-3 py-2">Постачальник</th>
                    <th className="px-3 py-2 text-right">Пляшка</th>
                    <th className="px-3 py-2 text-right">Порція</th>
                    <th className="px-3 py-2">Інші заклади</th>
                    <th className="px-3 py-2 text-center">Тип</th>
                    {canEdit && <th className="px-3 py-2 text-center">Дія</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const otherRestaurants = row.assignedRestaurantNames.filter((name) => name !== selectedRestaurantName);
                    const busyAction = busyProductId === String(row.id);
                    const busyType = busyTypeProductId === String(row.id);
                    const otherRestaurantsSummary = formatOtherRestaurantsSummary(otherRestaurants);
                    return (
                      <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                        <td className="px-3 py-1.5 font-medium">{row.name || "—"}</td>
                        <td className="px-3 py-1.5">{row.supplier || "—"}</td>
                        <td className="px-3 py-1.5 text-right">
                          <div>{formatPrice(row.bottleSalePrice)}</div>
                          <div className="text-[11px] text-slate-400">{formatPrice(row.purchasePrice) ? `зак. ${formatPrice(row.purchasePrice)}` : ""}</div>
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {canEditPrices && row.isAssignedToSelected && editingPriceProductId === String(row.id) ? (
                            <input
                              type="number"
                              step="10"
                              autoFocus
                              className="w-20 rounded border border-indigo-400 bg-white px-1.5 py-0.5 text-right text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-200"
                              value={editingPriceValue}
                              onChange={(e) => setEditingPriceValue(e.target.value)}
                              onBlur={() => updatePriceForRestaurant(row, editingPriceValue)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); updatePriceForRestaurant(row, editingPriceValue); }
                                if (e.key === "Escape") setEditingPriceProductId("");
                              }}
                            />
                          ) : (
                            <div
                              className={canEditPrices && row.isAssignedToSelected ? "cursor-pointer hover:text-indigo-600" : ""}
                              onClick={() => {
                                if (canEditPrices && row.isAssignedToSelected) {
                                  setEditingPriceProductId(String(row.id));
                                  setEditingPriceValue(String(row.effectivePortionSalePrice || ""));
                                }
                              }}
                              title={canEditPrices && row.isAssignedToSelected ? "Натисніть щоб змінити ціну" : ""}
                            >
                              {formatPrice(row.effectivePortionSalePrice)}
                            </div>
                          )}
                          <div className="text-[11px] text-slate-400">{row.portionVolumeMl ? `${row.portionVolumeMl} мл` : row.portionSaleUnit || DEFAULT_PORTION_UNIT}</div>
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={otherRestaurants.length > 0 ? "text-slate-600" : "text-slate-400"} title={otherRestaurantsSummary.title}>
                            {otherRestaurantsSummary.text}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {row.isAssignedToSelected ? (
                            canEdit ? (
                              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={row.selectedAssignmentType === "house"}
                                  onChange={(e) => updateAssignmentTypeForRestaurant(row, e.target.checked ? "house" : "standard")}
                                  disabled={busyType || busyAction}
                                  className="rounded border-slate-300"
                                />
                                Хаус
                              </label>
                            ) : (
                              row.selectedAssignmentType === "house" ? <span className="font-medium text-slate-700">Хаус</span> : <span className="text-slate-400">—</span>
                            )
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="px-3 py-1.5 text-center">
                            <button
                              type="button"
                              disabled={busyAction || busyType}
                              className={row.isAssignedToSelected
                                ? "inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
                                : "inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white shadow hover:bg-indigo-700 transition"}
                              onClick={() => upsertAssignmentForRestaurant(row, !row.isAssignedToSelected)}
                            >
                              {busyAction ? "Зберігаю…" : row.isAssignedToSelected ? "Зняти" : "Прив'язати"}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════
   TYPICAL FIELDS VIEW
   ═══════════════════════════════════════════════════ */

const TypicalFieldsView = ({ typicalFields, addField, updateField, deleteField }) => {
  const [categoryName, setCategoryName] = useState("");
  const [useTypicalMarkup, setUseTypicalMarkup] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editCategory, setEditCategory] = useState("");

  const categoryField = useMemo(() => getCategoryField(typicalFields), [typicalFields]);

  const categories = useMemo(() => getCategoryEntriesFromFields(categoryField || []), [categoryField]);

  const persistCategories = async (nextCategories, nextDefaultValue = "") => {
    const payload = {
      name: CATEGORY_FIELD_NAME,
      type: "category",
      defaultValue: nextDefaultValue || nextCategories[0]?.name || "",
      required: false,
      options: nextCategories,
    };

    if (categoryField?.id) {
      await updateField(categoryField.id, payload);
      return;
    }

    await addField(payload);
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    const trimmed = normalizeString(categoryName);
    if (!trimmed) return alert("Назва категорії обов'язкова");

    const nextCategories = editCategory
      ? categories.map((category) => (category.name === editCategory ? { ...category, name: trimmed, useTypicalMarkup } : category))
      : [...categories, { name: trimmed, useTypicalMarkup }];

    const uniqueCategories = nextCategories.reduce((acc, category) => {
      if (!category?.name) return acc;
      const existingIndex = acc.findIndex((item) => item.name === category.name);
      if (existingIndex >= 0) {
        acc[existingIndex] = category;
        return acc;
      }
      acc.push(category);
      return acc;
    }, []).sort((a, b) => a.name.localeCompare(b.name, "uk"));

    await persistCategories(uniqueCategories, categoryField?.defaultValue === editCategory ? trimmed : categoryField?.defaultValue);
    setCategoryName("");
    setUseTypicalMarkup(false);
    setEditCategory("");
    setShowForm(false);
  };

  const handleDeleteCategory = async (category) => {
    if (!confirm(`Видалити категорію "${category}"?`)) return;
    const nextCategories = categories.filter((item) => item.name !== category);
    if (nextCategories.length === 0 && categoryField?.id) {
      await deleteField(categoryField.id);
      return;
    }
    await persistCategories(nextCategories, categoryField?.defaultValue === category ? nextCategories[0]?.name || "" : categoryField?.defaultValue);
  };

  const toggleCategoryMarkup = async (categoryNameToToggle) => {
    const nextCategories = categories.map((category) => category.name === categoryNameToToggle
      ? { ...category, useTypicalMarkup: !category.useTypicalMarkup }
      : category);
    await persistCategories(nextCategories, categoryField?.defaultValue);
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">Керування категоріями</h3>
          <button
            type="button"
            className={btnPrimary}
            onClick={() => { setCategoryName(""); setUseTypicalMarkup(false); setEditCategory(""); setShowForm(true); }}
          >
            <Plus size={16} /> Додати категорію
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Тут керуються категорії, які використовуються у специфікаціях та асортиментній матриці бару.
        </p>
      </div>

      {showForm && (
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">{editCategory ? "Редагування категорії" : "Нова категорія"}</h3>
            <button type="button" onClick={() => { setShowForm(false); setEditCategory(""); setCategoryName(""); setUseTypicalMarkup(false); }} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
          </div>

          <form onSubmit={handleSaveCategory} className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>
              <label className="text-xs font-medium text-slate-600">Назва категорії *</label>
              <input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} className={inputClass} />
            </div>
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={useTypicalMarkup}
                onChange={(e) => setUseTypicalMarkup(e.target.checked)}
                className="rounded border-slate-300"
              />
              Застосовувати типову націнку
            </label>
            <div className="flex items-center gap-3">
              <button type="submit" className={btnPrimary}><Save size={16} /> Зберегти</button>
              <button type="button" className={btnSecondary} onClick={() => { setShowForm(false); setEditCategory(""); setCategoryName(""); setUseTypicalMarkup(false); }}>Скасувати</button>
            </div>
          </form>
        </div>
      )}

      <div className={cardClass + " overflow-x-auto"}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="px-3 py-2">Категорія</th>
              <th className="px-3 py-2 text-center">Типова націнка</th>
              <th className="px-3 py-2">За замовчуванням</th>
              <th className="px-3 py-2 text-center">Дії</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-slate-400">Категорій ще немає</td>
              </tr>
            ) : (
              categories.map((category) => (
                <tr key={category.name} className="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td className="px-3 py-2 font-medium">{category.name}</td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={category.useTypicalMarkup}
                      onChange={() => toggleCategoryMarkup(category.name)}
                      className="rounded border-slate-300"
                    />
                  </td>
                  <td className="px-3 py-2">{categoryField?.defaultValue === category.name ? "Так" : "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        className="p-1 hover:bg-slate-100 rounded"
                        title="Редагувати"
                        onClick={() => { setCategoryName(category.name); setUseTypicalMarkup(category.useTypicalMarkup); setEditCategory(category.name); setShowForm(true); }}
                      >
                        <Edit3 size={15} className="text-slate-500" />
                      </button>
                      <button
                        type="button"
                        className="p-1 hover:bg-red-50 rounded"
                        title="Видалити"
                        onClick={() => handleDeleteCategory(category.name)}
                      >
                        <Trash2 size={15} className="text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const MarkupSettingsView = ({ typicalFields, restaurants, addField, updateField }) => {
  const [feedback, setFeedback] = useState("");
  const [groupForm, setGroupForm] = useState({
    id: "",
    name: "",
    minimumPortionPrice: "",
    restaurantIds: [],
  });
  const [ruleForm, setRuleForm] = useState({
    id: "",
    alcoholCategories: [],
    restaurantGroupId: "",
    costFrom: "",
    costTo: "",
    markupPercent: "",
  });

  const categoryEntries = useMemo(() => getCategoryEntriesFromFields(typicalFields), [typicalFields]);
  const markupCategories = useMemo(
    () => categoryEntries.filter((entry) => entry.useTypicalMarkup).map((entry) => entry.name),
    [categoryEntries]
  );
  const settings = useMemo(() => getMarkupSettings(typicalFields), [typicalFields]);
  const markupField = settings.field;
  const restaurantGroups = settings.restaurantGroups;
  const rules = settings.rules;

  const restaurantOptions = useMemo(
    () => (restaurants || [])
      .map((restaurant) => ({ id: getRestaurantId(restaurant), name: getRestaurantName(restaurant) }))
      .filter((restaurant) => restaurant.id && restaurant.name)
      .sort((a, b) => a.name.localeCompare(b.name, "uk")),
    [restaurants]
  );

  const persistMarkupSettings = async (nextRestaurantGroups, nextRules) => {
    const payload = {
      name: MARKUP_SETTINGS_FIELD_NAME,
      type: "text",
      metadataKind: "markupSettings",
      restaurantGroups: nextRestaurantGroups,
      rules: nextRules,
      defaultValue: "",
      required: false,
    };

    if (markupField?.id) {
      const result = await updateField(markupField.id, payload);
      if (!result?.success) {
        throw new Error(result?.error?.message || "Не вдалося оновити налаштування націнки");
      }
      return;
    }

    const result = await addField(payload);
    if (!result?.success) {
      throw new Error(result?.error?.message || "Не вдалося зберегти налаштування націнки");
    }
  };

  const handleSaveGroup = async (e) => {
    e.preventDefault();
    setFeedback("");
    const name = normalizeString(groupForm.name);
    if (!name) return alert("Назва групи закладів обов'язкова");

    const nextGroup = {
      id: groupForm.id || createLocalId("group"),
      name,
      minimumPortionPrice: toNumber(groupForm.minimumPortionPrice),
      restaurantIds: normalizeList(groupForm.restaurantIds),
    };

    const nextGroups = groupForm.id
      ? restaurantGroups.map((group) => (group.id === groupForm.id ? nextGroup : group))
      : [...restaurantGroups, nextGroup];

    try {
      await persistMarkupSettings(nextGroups, rules);
      setGroupForm({ id: "", name: "", minimumPortionPrice: "", restaurantIds: [] });
      setFeedback(`Групу закладів "${name}" збережено.`);
    } catch (err) {
      alert(String(err?.message || err || "Не вдалося зберегти групу закладів"));
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!confirm("Видалити групу закладів?")) return;
    const nextGroups = restaurantGroups.filter((group) => group.id !== groupId);
    const nextRules = rules.filter((rule) => rule.restaurantGroupId !== groupId);
    setFeedback("");
    try {
      await persistMarkupSettings(nextGroups, nextRules);
      setFeedback("Групу закладів видалено.");
    } catch (err) {
      alert(String(err?.message || err || "Не вдалося видалити групу закладів"));
    }
  };

  const handleSaveRule = async (e) => {
    e.preventDefault();
    setFeedback("");
    const selectedCategories = (ruleForm.alcoholCategories || []).filter(Boolean);
    if (selectedCategories.length === 0) return alert("Оберіть хоча б одну категорію алкоголю");
    if (!ruleForm.restaurantGroupId) return alert("Оберіть групу закладів");

    let nextRules = [...rules];

    if (ruleForm.id) {
      // Edit mode — update single existing rule
      const nextRule = {
        id: ruleForm.id,
        alcoholCategory: selectedCategories[0],
        restaurantGroupId: normalizeString(ruleForm.restaurantGroupId),
        costFrom: toNumber(ruleForm.costFrom),
        costTo: toNumber(ruleForm.costTo),
        markupPercent: toNumber(ruleForm.markupPercent),
      };
      nextRules = nextRules.map((rule) => (rule.id === ruleForm.id ? nextRule : rule));
    } else {
      // Create mode — fan out one rule per selected category
      for (const cat of selectedCategories) {
        // Replace existing rule with same category + group + range, or add new
        const existingIdx = nextRules.findIndex((r) =>
          r.alcoholCategory === cat &&
          r.restaurantGroupId === normalizeString(ruleForm.restaurantGroupId) &&
          toNumber(r.costFrom) === toNumber(ruleForm.costFrom) &&
          toNumber(r.costTo) === toNumber(ruleForm.costTo)
        );
        const newRule = {
          id: existingIdx >= 0 ? nextRules[existingIdx].id : createLocalId("rule"),
          alcoholCategory: cat,
          restaurantGroupId: normalizeString(ruleForm.restaurantGroupId),
          costFrom: toNumber(ruleForm.costFrom),
          costTo: toNumber(ruleForm.costTo),
          markupPercent: toNumber(ruleForm.markupPercent),
        };
        if (existingIdx >= 0) {
          nextRules[existingIdx] = newRule;
        } else {
          nextRules.push(newRule);
        }
      }
    }

    try {
      await persistMarkupSettings(restaurantGroups, nextRules);
      setRuleForm({ id: "", alcoholCategories: [], restaurantGroupId: restaurantGroups[0]?.id || "", costFrom: "", costTo: "", markupPercent: "" });
      setFeedback(`Правило націнки збережено для ${selectedCategories.length} категорій.`);
    } catch (err) {
      alert(String(err?.message || err || "Не вдалося зберегти правило націнки"));
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!confirm("Видалити правило націнки?")) return;
    setFeedback("");
    try {
      await persistMarkupSettings(restaurantGroups, rules.filter((rule) => rule.id !== ruleId));
      setFeedback("Правило націнки видалено.");
    } catch (err) {
      alert(String(err?.message || err || "Не вдалося видалити правило націнки"));
    }
  };

  useEffect(() => {
    setRuleForm((prev) => ({
      ...prev,
      restaurantGroupId: prev.restaurantGroupId || restaurantGroups[0]?.id || "",
    }));
  }, [markupCategories, restaurantGroups]);

  const rulesByCategory = useMemo(() => {
    const grouped = new Map();
    rules.forEach((rule) => {
      const key = rule.alcoholCategory || "Без категорії";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(rule);
    });
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b, "uk"));
  }, [rules]);

  const unifiedMatrixRows = useMemo(() => {
    const rowsByRange = new Map();
    (rules || []).forEach((rule) => {
      const rangeKey = getMarkupRuleRangeKey(rule);
      if (!rowsByRange.has(rangeKey)) {
        rowsByRange.set(rangeKey, {
          rangeKey,
          costFrom: toNumber(rule.costFrom),
          costTo: toNumber(rule.costTo),
          byKey: {},
        });
      }
      rowsByRange.get(rangeKey).byKey[`${rule.alcoholCategory}::${rule.restaurantGroupId}`] = rule;
    });
    return Array.from(rowsByRange.values())
      .sort((a, b) => a.costFrom - b.costFrom || a.costTo - b.costTo)
      .map((row) => ({
        ...row,
        label: formatMarkupRuleRangeLabel(row.costFrom, row.costTo),
      }));
  }, [rules]);

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className={cardClass}>
        <h3 className="text-base font-semibold">Керування типовими націнками</h3>
        <p className="mt-2 text-xs text-slate-500">
          Для категорій з увімкненою типовою націнкою ціна порції рахується за правилом: категорія алкоголю + група закладів + діапазон собівартості.
        </p>
        {feedback ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {feedback}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className={cardClass}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Групи закладів</h3>
            <button type="button" className={btnSecondary} onClick={() => setGroupForm({ id: "", name: "", minimumPortionPrice: "", restaurantIds: [] })}>Очистити</button>
          </div>

          <form onSubmit={handleSaveGroup} className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium text-slate-500">Назва *</label>
                <input value={groupForm.name} onChange={(e) => setGroupForm((prev) => ({ ...prev, name: e.target.value }))} className={inputClass} placeholder="Група 1" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500">Мін. ціна порції</label>
                <input type="number" step="0.01" min="0" value={groupForm.minimumPortionPrice} onChange={(e) => setGroupForm((prev) => ({ ...prev, minimumPortionPrice: e.target.value }))} className={inputClass} placeholder="0.00" />
              </div>
            </div>
            <button type="submit" className={btnPrimary + " whitespace-nowrap"}><Save size={14} /> {groupForm.id ? "Оновити" : "Зберегти"}</button>

            <div className="col-span-2">
              <label className="text-[11px] font-medium text-slate-500">Заклади</label>
              <div className="mt-1 grid max-h-32 grid-cols-2 gap-x-3 gap-y-0.5 overflow-auto rounded border border-slate-200 p-2 sm:grid-cols-3">
                {restaurantOptions.map((restaurant) => (
                  <label key={restaurant.id} className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={groupForm.restaurantIds.includes(restaurant.id)}
                      onChange={(e) => setGroupForm((prev) => ({
                        ...prev,
                        restaurantIds: e.target.checked
                          ? Array.from(new Set([...prev.restaurantIds, restaurant.id]))
                          : prev.restaurantIds.filter((item) => item !== restaurant.id),
                      }))}
                      className="rounded border-slate-300 h-3.5 w-3.5"
                    />
                    {restaurant.name}
                  </label>
                ))}
              </div>
            </div>
          </form>

          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Група</th>
                  <th className="px-3 py-2 text-center">Закладів</th>
                  <th className="px-3 py-2 text-right">Мін. ціна</th>
                  <th className="px-3 py-2 text-center">Дії</th>
                </tr>
              </thead>
              <tbody>
                {restaurantGroups.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">Груп закладів ще немає</td></tr>
                ) : restaurantGroups.map((group) => (
                  <tr key={group.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{group.name}</div>
                      <div className="text-xs text-slate-500">{group.restaurantIds.map((restaurantId) => restaurantOptions.find((item) => item.id === restaurantId)?.name || restaurantId).join(", ") || "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-center">{group.restaurantIds.length}</td>
                    <td className="px-3 py-2 text-right">{formatPrice(group.minimumPortionPrice)}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button type="button" className="rounded p-1 hover:bg-slate-100" onClick={() => setGroupForm({ id: group.id, name: group.name, minimumPortionPrice: String(group.minimumPortionPrice || ""), restaurantIds: group.restaurantIds || [] })}><Edit3 size={14} className="text-slate-500" /></button>
                        <button type="button" className="rounded p-1 hover:bg-red-50" onClick={() => handleDeleteGroup(group.id)}><Trash2 size={14} className="text-red-400" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={cardClass}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Правила націнки</h3>
            <button type="button" className={btnSecondary} onClick={() => setRuleForm({ id: "", alcoholCategories: [], restaurantGroupId: restaurantGroups[0]?.id || "", costFrom: "", costTo: "", markupPercent: "" })}>Очистити</button>
          </div>

          <form onSubmit={handleSaveRule} className="grid grid-cols-1 gap-2">
            <div>
              <label className="text-[11px] font-medium text-slate-500">Категорії {ruleForm.id ? "" : "(можна декілька)"}</label>
              {ruleForm.id ? (
                <div className="mt-0.5 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">{ruleForm.alcoholCategories[0] || "—"}</div>
              ) : (
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 rounded border border-slate-200 p-2">
                  {markupCategories.map((category) => (
                    <label key={category} className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={(ruleForm.alcoholCategories || []).includes(category)}
                        onChange={(e) => setRuleForm((prev) => ({
                          ...prev,
                          alcoholCategories: e.target.checked
                            ? Array.from(new Set([...(prev.alcoholCategories || []), category]))
                            : (prev.alcoholCategories || []).filter((c) => c !== category),
                        }))}
                        className="rounded border-slate-300 h-3.5 w-3.5"
                      />
                      {category}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[11px] font-medium text-slate-500">Група *</label>
                <select value={ruleForm.restaurantGroupId} onChange={(e) => setRuleForm((prev) => ({ ...prev, restaurantGroupId: e.target.value }))} className={inputClass}>
                  <option value="">—</option>
                  {restaurantGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500">Від, грн</label>
                <input type="number" step="0.01" min="0" value={ruleForm.costFrom} onChange={(e) => setRuleForm((prev) => ({ ...prev, costFrom: e.target.value }))} className={inputClass} placeholder="0" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500">До, грн</label>
                <input type="number" step="0.01" min="0" value={ruleForm.costTo} onChange={(e) => setRuleForm((prev) => ({ ...prev, costTo: e.target.value }))} className={inputClass} placeholder="0" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500">Надцінка, %</label>
                <input type="number" step="0.01" min="0" value={ruleForm.markupPercent} onChange={(e) => setRuleForm((prev) => ({ ...prev, markupPercent: e.target.value }))} className={inputClass} placeholder="0" />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button type="submit" className={btnPrimary}><Save size={14} /> {ruleForm.id ? "Оновити" : "Зберегти правило"}</button>
            </div>
          </form>
        </div>
      </div>

      <div className={cardClass + " overflow-x-auto"}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">Матриця націнок</h3>
            <p className="mt-1 text-xs text-slate-500">Структура наближена до Excel: рядки це діапазони собівартості, колонки це групи закладів.</p>
          </div>
        </div>

        {restaurantGroups.length === 0 ? (
          <p className="px-3 py-8 text-center text-slate-400">Спочатку створи хоча б одну групу закладів.</p>
        ) : markupCategories.length === 0 ? (
          <p className="px-3 py-8 text-center text-slate-400">Увімкни типову націнку хоча б для однієї категорії у вкладці типових полів.</p>
        ) : (
          <div>
            <div className="rounded-xl border border-slate-200">
              <table className="w-full text-sm" style={{ minWidth: Math.max(700, 180 + markupCategories.length * restaurantGroups.length * 90) }}>
                <thead>
                  <tr className="border-b border-slate-200 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th rowSpan={2} className="w-[180px] border-r border-slate-200 px-3 py-3 text-left align-bottom">Собівартість порції</th>
                    {restaurantGroups.map((group) => (
                      <th key={group.id} colSpan={markupCategories.length} className="border-r border-slate-200 px-2 py-2 last:border-r-0">
                        <div className="font-semibold text-slate-700">{group.name}</div>
                      </th>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-200 text-center text-[11px] font-medium text-slate-500">
                    {restaurantGroups.map((group) =>
                      markupCategories.map((cat) => (
                        <th key={`${group.id}_${cat}`} className="border-r border-slate-100 px-1 py-1.5 last:border-r-0">
                          <div className="truncate" title={cat}>{cat}</div>
                        </th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody>
                  {unifiedMatrixRows.length === 0 ? (
                    <tr>
                      <td colSpan={1 + restaurantGroups.length * markupCategories.length} className="px-3 py-6 text-center text-slate-400">
                        Ще немає жодного правила.
                      </td>
                    </tr>
                  ) : unifiedMatrixRows.map((row) => (
                    <tr key={row.rangeKey} className="border-b border-slate-100 last:border-b-0">
                      <td className="border-r border-slate-200 px-3 py-2 font-medium text-slate-700">{row.label}</td>
                      {restaurantGroups.map((group) =>
                        markupCategories.map((cat) => {
                          const rule = row.byKey[`${cat}::${group.id}`] || null;
                          return (
                            <td key={`${row.rangeKey}_${group.id}_${cat}`} className="border-r border-slate-100 px-1 py-2 text-center last:border-r-0">
                              <button
                                type="button"
                                className={rule
                                  ? "inline-flex min-w-[60px] items-center justify-center rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                                  : "inline-flex min-w-[60px] items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-400 hover:bg-slate-100"}
                                onClick={() => setRuleForm({
                                  id: rule?.id || "",
                                  alcoholCategories: [cat],
                                  restaurantGroupId: group.id,
                                  costFrom: String(row.costFrom || ""),
                                  costTo: String(row.costTo || ""),
                                  markupPercent: String(rule?.markupPercent || ""),
                                })}
                              >
                                {rule ? `${toNumber(rule.markupPercent)}%` : "+"}
                              </button>
                            </td>
                          );
                        })
                      )}
                    </tr>
                  ))}

                  <tr className="bg-slate-50/70">
                    <td className="border-r border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Мін. ціна</td>
                    {restaurantGroups.map((group) =>
                      markupCategories.map((cat, catIdx) => (
                        <td key={`min_${group.id}_${cat}`} className="border-r border-slate-100 px-1 py-2 text-center text-xs font-semibold text-slate-700 last:border-r-0">
                          {catIdx === 0 ? formatPrice(group.minimumPortionPrice) : ""}
                        </td>
                      ))
                    )}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-3">
              <button
                type="button"
                className={btnSecondary}
                onClick={() => setRuleForm({
                  id: "",
                  alcoholCategories: [...markupCategories],
                  restaurantGroupId: restaurantGroups[0]?.id || "",
                  costFrom: "",
                  costTo: "",
                  markupPercent: "",
                })}
              >
                <Plus size={16} /> Додати новий діапазон
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Typical Field Form ─── */
const TypicalFieldForm = ({ field, onSave, onClose }) => {
  const [form, setForm] = useState({
    name: field?.name || "",
    type: field?.type || "text",
    defaultValue: field?.defaultValue || "",
    required: field?.required || false,
    options: Array.isArray(field?.options) ? field.options.join("\n") : "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const showOptions = ["category", "unit", "supplier", "select"].includes(form.type);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert("Назва обов'язкова");
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        type: form.type,
        defaultValue: form.defaultValue.trim(),
        required: form.required,
        options: showOptions
          ? form.options.split("\n").map((s) => s.trim()).filter(Boolean)
          : [],
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">{field ? "Редагування поля" : "Нове типове поле"}</h3>
        <button type="button" onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-600">Назва поля *</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Тип</label>
          <select value={form.type} onChange={(e) => set("type", e.target.value)} className={inputClass}>
            {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Значення за замовчуванням</label>
          <input value={form.defaultValue} onChange={(e) => set("defaultValue", e.target.value)} className={inputClass} />
        </div>

        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.required}
              onChange={(e) => set("required", e.target.checked)}
              className="rounded border-slate-300"
            />
            Обов'язкове
          </label>
        </div>

        {showOptions && (
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-600">
              Опції (кожна з нового рядка)
            </label>
            <textarea
              rows={5}
              value={form.options}
              onChange={(e) => set("options", e.target.value)}
              className={inputClass + " !h-auto"}
              placeholder={"Опція 1\nОпція 2\nОпція 3"}
            />
          </div>
        )}

        <div className="sm:col-span-2 flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className={btnPrimary}>
            <Save size={16} /> {saving ? "Зберігаю…" : "Зберегти"}
          </button>
          <button type="button" className={btnSecondary} onClick={onClose}>Скасувати</button>
        </div>
      </form>
    </div>
  );
};

/* ═══════════════════════════════════════════════════
   SPECIFICATIONS VIEW
   ═══════════════════════════════════════════════════ */

const SpecificationsView = ({ specifications, typicalFields, user, addField, addSpec, updateSpec, deleteSpec }) => {
  const isAdmin = isAdminUser(user);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editSpec, setEditSpec] = useState(null);
  const [seedingSamples, setSeedingSamples] = useState(false);
  const fileInputRef = useRef(null);

  const products = useMemo(
    () => specifications.map((spec) => ({ ...spec, ...getSpecificationProduct(spec) })).filter((spec) => spec.name),
    [specifications]
  );

  const categories = useMemo(() => {
    const set = new Set();
    products.forEach((product) => {
      if (product.category) set.add(product.category);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "uk"));
  }, [products]);

  const defaultCategories = useMemo(() => getCategoryOptionsFromFields(typicalFields), [typicalFields]);

  const measurementUnits = useMemo(() => {
    const units = new Set(DEFAULT_MEASUREMENT_UNITS);
    products.forEach((product) => {
      if (product.measurementUnit) units.add(product.measurementUnit);
    });
    return Array.from(units).sort((a, b) => a.localeCompare(b, "uk"));
  }, [products]);

  const saleUnits = useMemo(() => {
    const units = new Set(DEFAULT_SALE_UNITS);
    products.forEach((product) => {
      if (product.saleUnit) units.add(product.saleUnit);
      if (product.portionSaleUnit) units.add(product.portionSaleUnit);
    });
    return Array.from(units).sort((a, b) => a.localeCompare(b, "uk"));
  }, [products]);

  const suppliers = useMemo(() => {
    const supplierOptions = new Set(SAMPLE_SUPPLIERS);
    products.forEach((product) => {
      if (product.supplier) supplierOptions.add(product.supplier);
    });
    return Array.from(supplierOptions).sort((a, b) => a.localeCompare(b, "uk"));
  }, [products]);

  const productMarkupRanges = (product) => {
    const entries = normalizePricingByRestaurantGroup(product?.pricingByRestaurantGroup);
    if (entries.length === 0) return null;
    const prices = entries.map((entry) => entry.portionSalePrice).filter((price) => price > 0).sort((a, b) => a - b);
    if (prices.length === 0) return null;
    return prices[0] === prices[prices.length - 1]
      ? formatPrice(prices[0])
      : `${formatPrice(prices[0])} - ${formatPrice(prices[prices.length - 1])}`;
  };

  const filtered = useMemo(() => {
    let result = [...products];
    const q = search.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (product) =>
          (product.name || "").toLowerCase().includes(q) ||
          (product.category || "").toLowerCase().includes(q) ||
          (product.code1C || "").toLowerCase().includes(q) ||
          (product.supplier || "").toLowerCase().includes(q)
      );
    }
    if (filterCategory) {
      result = result.filter((product) => product.category === filterCategory);
    }
    return result.sort((a, b) => (a.name || "").localeCompare(b.name || "", "uk"));
  }, [products, search, filterCategory]);

  const handleDelete = async (id) => {
    if (!confirm("Видалити цю позицію продукції?")) return;
    await deleteSpec(id);
  };

  const handleExport = async () => {
    const { exportAssortmentMatrixToExcel } = await loadExcelHelpers();
    exportAssortmentMatrixToExcel([], filtered, typicalFields, "assortment_specifications.xlsx");
  };

  const handleImport = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    try {
      const { importAssortmentSpecsFromExcel } = await loadExcelHelpers();
      const imported = await importAssortmentSpecsFromExcel(file);
      let count = 0;
      for (const spec of imported) {
        await addSpec(spec);
        count++;
      }
      alert(`Імпортовано ${count} позицій продукції`);
    } catch (err) {
      alert("Помилка імпорту: " + (err?.message || err));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleTemplate = async () => {
    const { downloadAssortmentMatrixTemplate } = await loadExcelHelpers();
    downloadAssortmentMatrixTemplate();
  };

  const handleSeedSamples = async () => {
    if (seedingSamples) return;
    setSeedingSamples(true);
    try {
      const existingCategoryField = (typicalFields || []).some((field) => normalizeString(field?.name) === CATEGORY_FIELD_NAME);
      if (!existingCategoryField) {
        await addField(SAMPLE_BAR_TYPICAL_FIELDS[0]);
      }

      const existingNames = new Set((specifications || []).map((spec) => normalizeString(spec?.name || spec?.productName || spec?.dishName)));
      let added = 0;
      for (const sample of SAMPLE_BAR_PRODUCTS) {
        if (existingNames.has(sample.name)) continue;
        await addSpec(sample);
        added += 1;
      }

      alert(added > 0 ? `Додано ${added} тестових позицій бару.` : "Тестові позиції вже були додані раніше.");
    } catch (err) {
      alert("Не вдалося додати приклади: " + (err?.message || err));
    } finally {
      setSeedingSamples(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className={cardClass}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук за назвою продукції, категорією, кодом…"
              className={inputClass + " !pl-9"}
            />
          </div>

          {(categories.length > 0 || defaultCategories.length > 0) && (
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className={inputClass + " !mt-0 !w-auto min-w-[180px]"}
            >
              <option value="">Усі категорії</option>
              {[...new Set([...categories, ...defaultCategories])].map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          )}

          {isAdmin && (
            <button type="button" className={btnPrimary} onClick={() => { setEditSpec(null); setShowForm(true); }}>
              <Plus size={16} /> Додати продукцію
            </button>
          )}

          {isAdmin && (
            <button type="button" className={btnSecondary} onClick={handleSeedSamples} disabled={seedingSamples}>
              {seedingSamples ? "Додаю приклади…" : "Додати приклади"}
            </button>
          )}

          <button type="button" className={btnSecondary} onClick={handleExport}>
            <Download size={16} /> Експорт
          </button>

          {isAdmin && (
            <>
              <button type="button" className={btnSecondary} onClick={() => fileInputRef.current?.click()}>
                <Upload size={16} /> Імпорт
              </button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />

              <button type="button" className={btnSecondary} onClick={handleTemplate}>
                <FileDown size={16} /> Шаблон
              </button>
            </>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>Позицій у довіднику: {filtered.length} з {products.length}</span>
          <span>Тут зберігається база алкогольної продукції, яку потім обирають у матриці.</span>
          {isAdmin && <span>Кнопка "Додати приклади" створює тестові категорії та барні позиції з цінами пляшки й порції.</span>}
        </div>
      </div>

      {showForm && isAdmin && (
        <ProductCatalogForm
          product={editSpec}
          categories={[...new Set([...categories, ...defaultCategories])]}
          measurementUnits={measurementUnits}
          saleUnits={saleUnits}
          suppliers={suppliers}
          typicalFields={typicalFields}
          onSave={async (data) => {
            if (editSpec?.id) {
              await updateSpec(editSpec.id, data);
            } else {
              await addSpec(data);
            }
            setShowForm(false);
            setEditSpec(null);
          }}
          onClose={() => { setShowForm(false); setEditSpec(null); }}
        />
      )}

      <div className={cardClass + " overflow-x-auto"}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="px-3 py-2">Назва</th>
              <th className="px-3 py-2">Категорія</th>
              <th className="px-3 py-2">Од. виміру</th>
              <th className="px-3 py-2">Постачальник</th>
              <th className="px-3 py-2">Код 1С</th>
              <th className="px-3 py-2 text-right">Закупівля</th>
              <th className="px-3 py-2 text-right">Пляшка</th>
              <th className="px-3 py-2 text-right">Порція</th>
              <th className="px-3 py-2 text-center">Активн.</th>
              {isAdmin && <th className="px-3 py-2 text-center">Дії</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 10 : 9} className="px-3 py-8 text-center text-slate-400">
                  Позицій продукції ще немає
                </td>
              </tr>
            ) : (
              filtered.map((product) => (
                <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td className="px-3 py-2 font-medium">{product.name || "—"}</td>
                  <td className="px-3 py-2">{product.category || "—"}</td>
                  <td className="px-3 py-2">{product.measurementUnit || "—"}</td>
                  <td className="px-3 py-2">{product.supplier || "—"}</td>
                  <td className="px-3 py-2">{product.code1C || "—"}</td>
                  <td className="px-3 py-2 text-right">{formatPrice(product.purchasePrice)}</td>
                  <td className="px-3 py-2 text-right">
                    <div>{formatPrice(product.bottleSalePrice)}</div>
                    <div className="text-[11px] text-slate-400">{product.saleUnit || "пляшка"}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div>{productMarkupRanges(product) || formatPrice(product.portionSalePrice)}</div>
                    <div className="text-[11px] text-slate-400">
                      {normalizePricingByRestaurantGroup(product.pricingByRestaurantGroup).length > 0
                        ? `авто по групах, ${product.portionVolumeMl ? `${product.portionVolumeMl} мл` : product.portionSaleUnit || DEFAULT_PORTION_UNIT}`
                        : (product.portionVolumeMl ? `${product.portionVolumeMl} мл` : product.portionSaleUnit || DEFAULT_PORTION_UNIT)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${product.isActive === false ? "bg-red-400" : "bg-emerald-400"}`} />
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          className="rounded p-1 hover:bg-slate-100"
                          title="Редагувати"
                          onClick={() => { setEditSpec(product); setShowForm(true); }}
                        >
                          <Edit3 size={14} className="text-slate-500" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 hover:bg-red-50"
                          title="Видалити"
                          onClick={() => handleDelete(product.id)}
                        >
                          <Trash2 size={14} className="text-red-400" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ProductCatalogForm = ({ product, categories, measurementUnits, saleUnits, suppliers, typicalFields, onSave, onClose }) => {
  const [form, setForm] = useState({
    name: normalizeString(product?.name || product?.productName || product?.dishName || product?.ingredientName),
    category: normalizeString(product?.category),
    measurementUnit: normalizeString(product?.measurementUnit || product?.measurement_unit || "мл"),
    saleUnit: normalizeString(product?.saleUnit || product?.sale_unit || product?.unit || "пляшка"),
    portionSaleUnit: normalizeString(product?.portionSaleUnit || product?.portion_sale_unit || DEFAULT_PORTION_UNIT),
    bottleVolumeMl: product?.bottleVolumeMl ?? product?.bottle_volume_ml ?? product?.bottleVolume ?? "",
    portionVolumeMl: product?.portionVolumeMl ?? product?.portion_volume_ml ?? product?.portionVolume ?? "",
    supplier: normalizeString(product?.supplier),
    code1C: normalizeString(product?.code1C || product?.code_1c || product?.productCode),
    purchasePrice: product?.purchasePrice ?? product?.purchase_price ?? "",
    bottleMarkup: product?.bottleMarkup ?? product?.bottle_markup ?? product?.markup ?? "",
    bottleSalePrice: product?.bottleSalePrice ?? product?.bottle_sale_price ?? product?.salePrice ?? product?.sale_price ?? "",
    portionCostPrice: product?.portionCostPrice ?? product?.portion_cost_price ?? product?.costPrice ?? product?.cost_price ?? product?.portionCost ?? "",
    portionMarkup: product?.portionMarkup ?? product?.portion_markup ?? "",
    portionSalePrice: product?.portionSalePrice ?? product?.portion_sale_price ?? "",
    notes: normalizeString(product?.notes),
    isActive: product?.isActive !== false,
  });
  const [saving, setSaving] = useState(false);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const { restaurantGroups, rules } = useMemo(() => getMarkupSettings(typicalFields), [typicalFields]);
  const shouldUseTypicalMarkup = useMemo(
    () => usesTypicalMarkupForCategory(typicalFields, form.category),
    [typicalFields, form.category]
  );

  const autoPricingByRestaurantGroup = useMemo(
    () => buildAutoPricingByRestaurantGroup({
      product: form,
      typicalFields,
      restaurantGroups,
      rules,
    }),
    [form, typicalFields, restaurantGroups, rules]
  );

  useEffect(() => {
    const nextBottleSalePrice = computeSalePriceFromMarkup(form.purchasePrice, form.bottleMarkup);
    const currentBottleSalePrice = roundToTen(form.bottleSalePrice);
    if (nextBottleSalePrice !== currentBottleSalePrice) {
      set("bottleSalePrice", String(nextBottleSalePrice || ""));
    }
  }, [form.purchasePrice, form.bottleMarkup]);

  useEffect(() => {
    const nextPortionCostPrice = computePortionCost(form.purchasePrice, form.bottleVolumeMl, form.portionVolumeMl);
    const currentPortionCostPrice = roundMoney(form.portionCostPrice);
    if (nextPortionCostPrice !== currentPortionCostPrice) {
      set("portionCostPrice", String(nextPortionCostPrice || ""));
    }
  }, [form.purchasePrice, form.bottleVolumeMl, form.portionVolumeMl]);

  useEffect(() => {
    const nextPortionSalePrice = computeSalePriceFromMarkup(form.portionCostPrice, form.portionMarkup);
    const currentPortionSalePrice = roundToTen(form.portionSalePrice);
    if (!shouldUseTypicalMarkup && nextPortionSalePrice !== currentPortionSalePrice) {
      set("portionSalePrice", String(nextPortionSalePrice || ""));
    }
  }, [form.portionCostPrice, form.portionMarkup, shouldUseTypicalMarkup]);

  useEffect(() => {
    if (!shouldUseTypicalMarkup) return;
    const sortedEntries = [...autoPricingByRestaurantGroup].sort((a, b) => a.portionSalePrice - b.portionSalePrice);
    const baseEntry = sortedEntries[0] || null;
    const nextPortionSalePrice = baseEntry?.portionSalePrice || 0;
    const nextPortionMarkup = baseEntry?.portionMarkup || 0;
    if (roundToTen(form.portionSalePrice) !== roundToTen(nextPortionSalePrice)) {
      set("portionSalePrice", String(nextPortionSalePrice || ""));
    }
    if (roundMoney(form.portionMarkup) !== roundMoney(nextPortionMarkup)) {
      set("portionMarkup", String(nextPortionMarkup || ""));
    }
  }, [shouldUseTypicalMarkup, autoPricingByRestaurantGroup]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert("Назва продукції обов'язкова");
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        category: form.category.trim(),
        measurementUnit: form.measurementUnit.trim(),
        saleUnit: form.saleUnit.trim(),
        portionSaleUnit: form.portionSaleUnit.trim(),
        bottleVolumeMl: toNumber(form.bottleVolumeMl),
        portionVolumeMl: toNumber(form.portionVolumeMl),
        unit: form.saleUnit.trim(),
        supplier: form.supplier.trim(),
        code1C: form.code1C.trim(),
        purchasePrice: toNumber(form.purchasePrice),
        bottleMarkup: toNumber(form.bottleMarkup),
        bottleSalePrice: toNumber(form.bottleSalePrice),
        portionCostPrice: toNumber(form.portionCostPrice),
        portionMarkup: toNumber(form.portionMarkup),
        portionSalePrice: toNumber(form.portionSalePrice),
        pricingByRestaurantGroup: shouldUseTypicalMarkup ? autoPricingByRestaurantGroup : [],
        markup: toNumber(form.bottleMarkup),
        salePrice: toNumber(form.bottleSalePrice),
        costPrice: toNumber(form.portionCostPrice),
        notes: form.notes.trim(),
        isActive: form.isActive,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cardClass}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold">{product ? "Редагування продукції" : "Нова позиція продукції"}</h3>
        <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100"><X size={18} /></button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Row 1: основна інформація */}
        <div className="sm:col-span-2">
          <label className="text-[11px] font-medium text-slate-500">Назва продукції *</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="text-[11px] font-medium text-slate-500">Категорія</label>
          <input list="bar-product-categories" value={form.category} onChange={(e) => set("category", e.target.value)} className={inputClass} />
          <datalist id="bar-product-categories">
            {categories.map((category) => <option key={category} value={category} />)}
          </datalist>
        </div>

        <div>
          <label className="text-[11px] font-medium text-slate-500">Постачальник</label>
          <input list="bar-product-suppliers" value={form.supplier} onChange={(e) => set("supplier", e.target.value)} className={inputClass} />
          <datalist id="bar-product-suppliers">
            {suppliers.map((supplier) => <option key={supplier} value={supplier} />)}
          </datalist>
        </div>

        {/* Row 2: об'єми та одиниці */}
        <div>
          <label className="text-[11px] font-medium text-slate-500">Об'єм пляшки, мл</label>
          <input type="number" step="1" min="0" value={form.bottleVolumeMl} onChange={(e) => set("bottleVolumeMl", e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="text-[11px] font-medium text-slate-500">Об'єм порції, мл</label>
          <input type="number" step="1" min="0" value={form.portionVolumeMl} onChange={(e) => set("portionVolumeMl", e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="text-[11px] font-medium text-slate-500">Ціна закупівлі</label>
          <input type="number" step="0.01" min="0" value={form.purchasePrice} onChange={(e) => set("purchasePrice", e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="text-[11px] font-medium text-slate-500">Код 1С</label>
          <input value={form.code1C} onChange={(e) => set("code1C", e.target.value)} className={inputClass} />
        </div>

        {/* Row 3: націнка пляшки */}
        <div>
          <label className="text-[11px] font-medium text-slate-500">Націнка на пляшку, %</label>
          <input type="number" step="0.1" value={form.bottleMarkup} onChange={(e) => set("bottleMarkup", e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="text-[11px] font-medium text-slate-500">Ціна продажу пляшки</label>
          <div className="mt-0.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{formatPrice(form.bottleSalePrice) || "—"}</div>
        </div>

        {/* Row 3b: собівартість порції + надцінка порції */}
        <div>
          <label className="text-[11px] font-medium text-slate-500">Собівартість порції</label>
          <div className="mt-0.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{formatPrice(form.portionCostPrice) || "—"}</div>
        </div>

        {shouldUseTypicalMarkup ? (
          <div>
            <label className="text-[11px] font-medium text-slate-500">Націнка порції (типова)</label>
            <div className="mt-0.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{formatPrice(form.portionMarkup) || "—"}%</div>
          </div>
        ) : (
          <div>
            <label className="text-[11px] font-medium text-slate-500">Націнка на порцію, %</label>
            <input type="number" step="0.1" value={form.portionMarkup} onChange={(e) => set("portionMarkup", e.target.value)} className={inputClass} />
          </div>
        )}

        {/* Row 4: результат порції + інше */}
        {!shouldUseTypicalMarkup && (
          <div>
            <label className="text-[11px] font-medium text-slate-500">Ціна продажу порції</label>
            <div className="mt-0.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{formatPrice(form.portionSalePrice) || "—"}</div>
          </div>
        )}

        {shouldUseTypicalMarkup && autoPricingByRestaurantGroup.length > 0 && (
          <div className="lg:col-span-4 sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
            <h4 className="mb-2 text-xs font-semibold text-emerald-900">Ціни по групах закладів</h4>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {autoPricingByRestaurantGroup.map((entry) => (
                <div key={entry.restaurantGroupId} className="flex items-center justify-between rounded border border-emerald-100 bg-white px-3 py-1.5 text-xs">
                  <span className="font-medium text-emerald-950">{entry.restaurantGroupName}</span>
                  <span className="text-slate-500">{formatPrice(entry.markupPercent)}% → <span className="font-semibold text-emerald-900">{formatPrice(entry.portionSalePrice)} грн</span></span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="text-[11px] font-medium text-slate-500">Примітки</label>
          <input value={form.notes} onChange={(e) => set("notes", e.target.value)} className={inputClass} />
        </div>

        <div className="flex items-end">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} className="rounded border-slate-300" />
            Активна продукція
          </label>
        </div>

        <div className="flex items-center gap-3 pt-1 sm:col-span-2 lg:col-span-4">
          <button type="submit" disabled={saving} className={btnPrimary}>
            <Save size={16} /> {saving ? "Зберігаю…" : "Зберегти"}
          </button>
          <button type="button" className={btnSecondary} onClick={onClose}>Скасувати</button>
        </div>
      </form>
    </div>
  );
};
