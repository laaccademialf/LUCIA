import { Clock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { parsePossiblyExcelDate } from "../utils/dateUtils";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeText = (value) => String(value || "").trim();

const normalizeKey = (value) => normalizeText(value).toLowerCase();

const getBusinessUnitLabel = (asset) => normalizeText(asset?.businessUnit || asset?.business_unit) || "Без бізнес-напряму";

const getPlacementLabel = (asset) => {
  const zone = normalizeText(asset?.zone);
  if (zone) return zone;

  const location = normalizeText(asset?.locationName || asset?.location_name);
  if (location) return location;

  return "Без розміщення";
};

const getInventoryQuantity = (asset) => {
  const qty = toNumber(asset?.inventoryQuantity ?? asset?.inventory_quantity);
  return qty > 0 ? qty : 1;
};

const getRestaurantLabel = (asset, restaurantsById, restaurantsByKey) => {
  const idCandidates = [
    asset?.restaurantId,
    asset?.restaurant_id,
    asset?.locationId,
    asset?.location_id,
  ].map((value) => normalizeText(value));

  for (const idCandidate of idCandidates) {
    if (!idCandidate) continue;
    const byId = restaurantsById.get(idCandidate);
    if (byId) return byId;
  }

  const nameCandidates = [
    asset?.restaurantName,
    asset?.restaurant_name,
    asset?.locationName,
    asset?.location_name,
    asset?.location,
    asset?.restaurant,
  ].map((value) => normalizeText(value));

  for (const candidate of nameCandidates) {
    if (!candidate) continue;
    const byName = restaurantsByKey.get(normalizeKey(candidate));
    if (byName) return byName;
  }

  return nameCandidates.find(Boolean) || "Без закладу";
};

const calculateMetrics = (rows) => {
  const quantity = rows.reduce((sum, asset) => sum + getInventoryQuantity(asset), 0);
  const initialValue = rows.reduce((sum, asset) => sum + toNumber(asset?.initialCost || asset?.initial_cost), 0);
  const estimatedValue = rows.reduce((sum, asset) => sum + toNumber(asset?.residualValue || asset?.residual_value), 0);
  const wear = initialValue - estimatedValue;

  return {
    quantity,
    initialValue,
    estimatedValue,
    wear,
  };
};

const formatCurrency = (value) => {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(toNumber(value));
};

const buildCategoryRows = (rows) => {
  const categoryMap = new Map();

  rows.forEach((asset) => {
    const category = normalizeText(asset?.category) || "Без категорії";
    const subCategory = normalizeText(asset?.subCategory || asset?.sub_category) || "Без підкатегорії";

    if (!categoryMap.has(category)) {
      categoryMap.set(category, {
        assets: [],
        subcategories: new Map(),
      });
    }

    const categoryEntry = categoryMap.get(category);
    categoryEntry.assets.push(asset);

    if (!categoryEntry.subcategories.has(subCategory)) {
      categoryEntry.subcategories.set(subCategory, []);
    }

    categoryEntry.subcategories.get(subCategory).push(asset);
  });

  return Array.from(categoryMap.entries())
    .sort(([left], [right]) => left.localeCompare(right, "uk"))
    .flatMap(([categoryName, categoryEntry]) => {
      const categoryRow = {
        key: `cat:${categoryName}`,
        level: "category",
        label: categoryName,
        ...calculateMetrics(categoryEntry.assets),
      };

      const subRows = Array.from(categoryEntry.subcategories.entries())
        .sort(([left], [right]) => left.localeCompare(right, "uk"))
        .map(([subName, subAssets]) => ({
          key: `sub:${categoryName}:${subName}`,
          level: "subcategory",
          label: subName,
          ...calculateMetrics(subAssets),
        }));

      return [categoryRow, ...subRows];
    });
};

const buildPlacementRows = (rows) => {
  const placementMap = new Map();

  rows.forEach((asset) => {
    const placement = getPlacementLabel(asset);
    if (!placementMap.has(placement)) {
      placementMap.set(placement, []);
    }
    placementMap.get(placement).push(asset);
  });

  return Array.from(placementMap.entries())
    .sort(([left], [right]) => left.localeCompare(right, "uk"))
    .map(([placement, placementAssets]) => ({
      key: `placement:${placement}`,
      placement,
      ...calculateMetrics(placementAssets),
    }));
};

const isWriteOffAsset = (asset) => {
  const decision = normalizeKey(asset?.decision);
  const status = normalizeKey(asset?.status);
  return decision.includes("спис") || status.includes("спис");
};

const isClarificationAsset = (asset) => {
  const searchable = [
    asset?.decision,
    asset?.status,
    asset?.reason,
    asset?.reasonComment,
    asset?.comment,
  ]
    .map((value) => normalizeKey(value))
    .join(" ");

  return (
    searchable.includes("вияс") ||
    searchable.includes("виясн") ||
    searchable.includes("з'яс") ||
    searchable.includes("зяс") ||
    searchable.includes("уточ")
  );
};

const buildAgeGroups = (rows) => {
  const now = new Date();
  const groups = {
    "0-3": 0,
    "3-5": 0,
    "5-10": 0,
    "10+": 0,
  };

  rows.forEach((asset) => {
    const parsedDate = parsePossiblyExcelDate(asset?.commissionDate);
    if (!parsedDate) return;

    const years = (now - parsedDate) / (1000 * 60 * 60 * 24 * 365.25);
    if (years < 3) groups["0-3"] += 1;
    else if (years < 5) groups["3-5"] += 1;
    else if (years < 10) groups["5-10"] += 1;
    else groups["10+"] += 1;
  });

  return Object.entries(groups).map(([name, value]) => ({ name, value }));
};

const syncSelection = (current, options) => {
  if (!Array.isArray(options) || options.length === 0) return [];
  if (!Array.isArray(current) || current.length === 0) return options;

  const available = current.filter((item) => options.includes(item));
  return available.length > 0 ? available : options;
};

const toggleOption = (selected, value) => {
  if (selected.includes(value)) {
    return selected.filter((item) => item !== value);
  }
  return [...selected, value];
};

const FilterChips = ({ title, options, selected, onToggle, onSelectAll, onClear }) => {
  const selectedCount = selected.length;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700">{title}</h4>
          <span className="flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
            {selectedCount}/{options.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onSelectAll}
            className="text-[10px] font-semibold text-slate-500 underline hover:text-slate-700"
          >
            Все
          </button>
          <span className="text-slate-300">•</span>
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] font-semibold text-slate-500 underline hover:text-slate-700"
          >
            Очистити
          </button>
        </div>
      </div>

      <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
        {options.map((option) => {
          const isSelected = selected.includes(option);
          return (
            <button
              key={`${title}:${option}`}
              type="button"
              onClick={() => onToggle(option)}
              className={[
                "rounded-full px-2.5 py-1 text-xs font-medium transition-all whitespace-nowrap",
                isSelected
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              ].join(" ")}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const FinancialSummaryTable = ({ title, rows }) => (
  <div className="overflow-x-auto rounded-lg border border-slate-200">
    <table className="min-w-full text-sm">
      <thead className="bg-slate-50">
        <tr>
          <th className="px-3 py-2 text-left font-semibold text-slate-800">{title}</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-800">Кількість в наявності</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-800">Первісна вартість (всіх ОС)</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-800">Оціночна вартість (остання інвент.)</th>
          <th className="px-3 py-2 text-right font-semibold text-slate-800">Знос (дельта), грн</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.key}
            className={row.level === "category" ? "border-t border-slate-200 bg-slate-50/80" : "border-t border-slate-200"}
          >
            <td
              className={[
                "px-3 py-2 text-slate-900",
                row.level === "category" ? "font-semibold" : "pl-8 text-slate-700",
              ].join(" ")}
            >
              {row.level === "subcategory" ? `- ${row.label}` : row.label}
            </td>
            <td className="px-3 py-2 text-right text-slate-900">{row.quantity}</td>
            <td className="px-3 py-2 text-right text-slate-900">{formatCurrency(row.initialValue)}</td>
            <td className="px-3 py-2 text-right text-slate-900">{formatCurrency(row.estimatedValue)}</td>
            <td className="px-3 py-2 text-right text-slate-900">{formatCurrency(row.wear)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const FinancialAssetsReport = ({ assets = [], restaurants = [] }) => {
  const restaurantsById = useMemo(() => {
    const map = new Map();
    (restaurants || []).forEach((restaurant) => {
      const id = normalizeText(restaurant?.id);
      if (!id) return;
      map.set(id, normalizeText(restaurant?.name) || id);
    });
    return map;
  }, [restaurants]);

  const restaurantsByKey = useMemo(() => {
    const map = new Map();
    (restaurants || []).forEach((restaurant) => {
      const name = normalizeText(restaurant?.name);
      const reg = normalizeText(restaurant?.regNumber || restaurant?.reg_number);
      if (name) map.set(normalizeKey(name), name);
      if (reg) map.set(normalizeKey(reg), name || reg);
    });
    return map;
  }, [restaurants]);

  const assetsWithLabels = useMemo(() => {
    return (assets || []).map((asset) => ({
      ...asset,
      __restaurantLabel: getRestaurantLabel(asset, restaurantsById, restaurantsByKey),
      __businessUnit: getBusinessUnitLabel(asset),
      __placement: getPlacementLabel(asset),
      __category: normalizeText(asset?.category) || "Без категорії",
      __status: normalizeText(asset?.status) || "Без статусу",
    }));
  }, [assets, restaurantsById, restaurantsByKey]);

  const restaurantOptions = useMemo(() => {
    const values = Array.from(new Set(assetsWithLabels.map((asset) => asset.__restaurantLabel)));
    return values.sort((left, right) => left.localeCompare(right, "uk"));
  }, [assetsWithLabels]);

  const businessUnitOptions = useMemo(() => {
    const values = Array.from(new Set(assetsWithLabels.map((asset) => asset.__businessUnit)));
    return values.sort((left, right) => left.localeCompare(right, "uk"));
  }, [assetsWithLabels]);

  const [selectedRestaurants, setSelectedRestaurants] = useState([]);
  const [selectedBusinessUnits, setSelectedBusinessUnits] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedPlacements, setSelectedPlacements] = useState([]);

  useEffect(() => {
    setSelectedRestaurants((prev) => syncSelection(prev, restaurantOptions));
  }, [restaurantOptions]);

  useEffect(() => {
    setSelectedBusinessUnits((prev) => syncSelection(prev, businessUnitOptions));
  }, [businessUnitOptions]);

  const activeRestaurants = selectedRestaurants.length > 0 ? selectedRestaurants : restaurantOptions;
  const activeBusinessUnits = selectedBusinessUnits.length > 0 ? selectedBusinessUnits : businessUnitOptions;

  const assetsAfterRestaurantAndBusinessUnit = useMemo(() => {
    return assetsWithLabels.filter(
      (asset) => activeRestaurants.includes(asset.__restaurantLabel) && activeBusinessUnits.includes(asset.__businessUnit)
    );
  }, [assetsWithLabels, activeRestaurants, activeBusinessUnits]);

  const categoryOptions = useMemo(() => {
    const values = Array.from(new Set(assetsAfterRestaurantAndBusinessUnit.map((asset) => asset.__category)));
    return values.sort((left, right) => left.localeCompare(right, "uk"));
  }, [assetsAfterRestaurantAndBusinessUnit]);

  const statusOptions = useMemo(() => {
    const values = Array.from(new Set(assetsAfterRestaurantAndBusinessUnit.map((asset) => asset.__status)));
    return values.sort((left, right) => left.localeCompare(right, "uk"));
  }, [assetsAfterRestaurantAndBusinessUnit]);

  const placementOptions = useMemo(() => {
    const values = Array.from(new Set(assetsAfterRestaurantAndBusinessUnit.map((asset) => asset.__placement)));
    return values.sort((left, right) => left.localeCompare(right, "uk"));
  }, [assetsAfterRestaurantAndBusinessUnit]);

  useEffect(() => {
    setSelectedCategories((prev) => syncSelection(prev, categoryOptions));
  }, [categoryOptions]);

  useEffect(() => {
    setSelectedStatuses((prev) => syncSelection(prev, statusOptions));
  }, [statusOptions]);

  useEffect(() => {
    setSelectedPlacements((prev) => syncSelection(prev, placementOptions));
  }, [placementOptions]);

  const activeCategories = selectedCategories.length > 0 ? selectedCategories : categoryOptions;
  const activeStatuses = selectedStatuses.length > 0 ? selectedStatuses : statusOptions;
  const activePlacements = selectedPlacements.length > 0 ? selectedPlacements : placementOptions;

  const filteredAssets = useMemo(() => {
    return assetsAfterRestaurantAndBusinessUnit.filter(
      (asset) =>
        activeCategories.includes(asset.__category) &&
        activeStatuses.includes(asset.__status) &&
        activePlacements.includes(asset.__placement)
    );
  }, [assetsAfterRestaurantAndBusinessUnit, activeCategories, activeStatuses, activePlacements]);

  const groupedByBusinessUnit = useMemo(() => {
    return activeBusinessUnits
      .map((businessUnit) => {
        const rows = filteredAssets.filter((asset) => asset.__businessUnit === businessUnit);
        return {
          businessUnit,
          rows,
          summary: calculateMetrics(rows),
          byCategory: buildCategoryRows(rows),
          byPlacement: buildPlacementRows(rows),
          writeOffSummary: calculateMetrics(rows.filter(isWriteOffAsset)),
          clarificationSummary: calculateMetrics(rows.filter(isClarificationAsset)),
        };
      })
      .filter((item) => item.rows.length > 0);
  }, [activeBusinessUnits, filteredAssets]);

  const ageGroups = useMemo(() => buildAgeGroups(filteredAssets), [filteredAssets]);

  const resetFilters = () => {
    setSelectedRestaurants(restaurantOptions);
    setSelectedBusinessUnits(businessUnitOptions);
    setSelectedCategories(categoryOptions);
    setSelectedStatuses(statusOptions);
    setSelectedPlacements(placementOptions);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-slate-900">Основний звіт по основних засобах</h2>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
          >
            ↺ Скинути
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2 text-[11px] text-slate-500">
          <span className="font-semibold">Закладів: <span className="text-slate-700 font-bold">{activeRestaurants.length}</span></span>
          <span className="text-slate-300">•</span>
          <span className="font-semibold">Бізнес-напрямів: <span className="text-slate-700 font-bold">{activeBusinessUnits.length}</span></span>
          <span className="text-slate-300">•</span>
          <span className="font-semibold">Активів: <span className="text-slate-700 font-bold">{filteredAssets.length}</span></span>
        </div>

        <div className="space-y-3 border-t border-slate-100 pt-4">
          <FilterChips
            title="Заклади"
            options={restaurantOptions}
            selected={selectedRestaurants}
            onToggle={(value) => setSelectedRestaurants((prev) => toggleOption(prev, value))}
            onSelectAll={() => setSelectedRestaurants(restaurantOptions)}
            onClear={() => setSelectedRestaurants([])}
          />

          <FilterChips
            title="Бізнес-напрями"
            options={businessUnitOptions}
            selected={selectedBusinessUnits}
            onToggle={(value) => setSelectedBusinessUnits((prev) => toggleOption(prev, value))}
            onSelectAll={() => setSelectedBusinessUnits(businessUnitOptions)}
            onClear={() => setSelectedBusinessUnits([])}
          />

          <FilterChips
            title="Категорії"
            options={categoryOptions}
            selected={selectedCategories}
            onToggle={(value) => setSelectedCategories((prev) => toggleOption(prev, value))}
            onSelectAll={() => setSelectedCategories(categoryOptions)}
            onClear={() => setSelectedCategories([])}
          />

          <FilterChips
            title="Статуси"
            options={statusOptions}
            selected={selectedStatuses}
            onToggle={(value) => setSelectedStatuses((prev) => toggleOption(prev, value))}
            onSelectAll={() => setSelectedStatuses(statusOptions)}
            onClear={() => setSelectedStatuses([])}
          />

          <FilterChips
            title="Розміщення"
            options={placementOptions}
            selected={selectedPlacements}
            onToggle={(value) => setSelectedPlacements((prev) => toggleOption(prev, value))}
            onSelectAll={() => setSelectedPlacements(placementOptions)}
            onClear={() => setSelectedPlacements([])}
          />
        </div>
      </div>

      {groupedByBusinessUnit.map((unitBlock) => (
        <div key={unitBlock.businessUnit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">Бізнес-напрям: {unitBlock.businessUnit}</h3>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-800">Показники</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-800">Кількість в наявності</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-800">Первісна вартість (всіх ОС)</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-800">Оціночна вартість (остання інвент.)</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-800">Знос (дельта), грн</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-200">
                  <td className="px-3 py-2 font-semibold text-slate-900">Підсумок по бізнес-напряму</td>
                  <td className="px-3 py-2 text-right text-slate-900">{unitBlock.summary.quantity}</td>
                  <td className="px-3 py-2 text-right text-slate-900">{formatCurrency(unitBlock.summary.initialValue)}</td>
                  <td className="px-3 py-2 text-right text-slate-900">{formatCurrency(unitBlock.summary.estimatedValue)}</td>
                  <td className="px-3 py-2 text-right text-slate-900">{formatCurrency(unitBlock.summary.wear)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <FinancialSummaryTable title="По категоріях" rows={unitBlock.byCategory} />

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-800">По розміщенню</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-800">Кількість в наявності</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-800">Первісна вартість (всіх ОС)</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-800">Оціночна вартість (остання інвент.)</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-800">Знос (дельта), грн</th>
                </tr>
              </thead>
              <tbody>
                {unitBlock.byPlacement.map((placementRow) => (
                  <tr key={placementRow.key} className="border-t border-slate-200">
                    <td className="px-3 py-2 text-slate-900">{placementRow.placement}</td>
                    <td className="px-3 py-2 text-right text-slate-900">{placementRow.quantity}</td>
                    <td className="px-3 py-2 text-right text-slate-900">{formatCurrency(placementRow.initialValue)}</td>
                    <td className="px-3 py-2 text-right text-slate-900">{formatCurrency(placementRow.estimatedValue)}</td>
                    <td className="px-3 py-2 text-right text-slate-900">{formatCurrency(placementRow.wear)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-800">Спецстатуси</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-800">Кількість</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-800">Первісна вартість</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-800">Оціночна вартість (остання інвент.)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-200">
                  <td className="px-3 py-2 font-semibold text-slate-900">До списання</td>
                  <td className="px-3 py-2 text-right text-slate-900">{unitBlock.writeOffSummary.quantity}</td>
                  <td className="px-3 py-2 text-right text-slate-900">{formatCurrency(unitBlock.writeOffSummary.initialValue)}</td>
                  <td className="px-3 py-2 text-right text-slate-900">{formatCurrency(unitBlock.writeOffSummary.estimatedValue)}</td>
                </tr>
                <tr className="border-t border-slate-200">
                  <td className="px-3 py-2 font-semibold text-slate-900">До вияснення</td>
                  <td className="px-3 py-2 text-right text-slate-900">{unitBlock.clarificationSummary.quantity}</td>
                  <td className="px-3 py-2 text-right text-slate-900">{formatCurrency(unitBlock.clarificationSummary.initialValue)}</td>
                  <td className="px-3 py-2 text-right text-slate-900">{formatCurrency(unitBlock.clarificationSummary.estimatedValue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Clock size={20} className="text-indigo-600" />
          Структура активів за віком (роки з моменту введення)
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={ageGroups}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" fill="#6366f1" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default FinancialAssetsReport;
