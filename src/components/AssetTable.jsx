import { useMemo, useState, useRef, useEffect, useDeferredValue, useCallback } from "react";
import QRCodeImport from "react-qr-code";
const QRCode = QRCodeImport?.default || QRCodeImport;
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDownZA, ArrowUpAZ, Download, FileDown, Pencil, Trash2, Upload, SlidersHorizontal, X } from "lucide-react";
import ColumnVisibilityDropdown from "./ColumnVisibilityDropdown";
import clsx from "clsx";
import { printAssetQrLabel } from "../utils/printQrLabel";

// High-contrast badges on light backgrounds for readability
const decisionColors = {
  "Залишити": "bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold",
  "Списати": "bg-rose-100 text-rose-800 border border-rose-300 font-semibold",
  "Продати": "bg-amber-100 text-amber-800 border border-amber-300 font-semibold",
  "Перемістити": "bg-sky-100 text-sky-800 border border-sky-300 font-semibold",
};

const columnHelper = createColumnHelper();

const readAssetField = (asset, key) => {
  if (!asset || typeof asset !== "object") return "";

  if (key === "invNumber") {
    return asset.invNumber ?? asset.inv_number ?? "";
  }

  if (key === "invNumber1C") {
    return asset.invNumber1C ?? asset.inv_number_1c ?? "";
  }

  return asset[key] ?? "";
};

const matchesSearchQuery = (asset, normalizedQuery) => {
  if (!normalizedQuery) return true;

  const pool = [
    readAssetField(asset, "invNumber"),
    readAssetField(asset, "invNumber1C"),
    asset?.name,
    asset?.category,
    asset?.subCategory,
    asset?.type,
    asset?.inventoryQuantity,
    asset?.nextInventoryQuantity,
    asset?.serialNumber,
    asset?.brand,
    asset?.businessUnit,
    asset?.locationName,
    asset?.zone,
    asset?.respCenter,
    asset?.respPerson,
    asset?.status,
    asset?.condition,
    asset?.residualValuePerUnit,
    asset?.decision,
    asset?.comment,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(" ");

  return pool.includes(normalizedQuery);
};

const ALL_FIELD_DEFS = [
  { key: "invNumber", header: "Інв. номер" },
  { key: "invNumber1C", header: "Інв. номер 1С" },
  { key: "name", header: "Назва активу" },
  { key: "category", header: "Категорія" },
  { key: "subCategory", header: "Підкатегорія" },
  { key: "type", header: "Тип" },
  { key: "inventoryQuantity", header: "Первинна інв. к-сть" },
  { key: "nextInventoryQuantity", header: "Наступна інв. к-сть" },
  { key: "serialNumber", header: "Серійний номер" },
  { key: "brand", header: "Бренд" },
  { key: "businessUnit", header: "Локація" },
  { key: "locationName", header: "Локація (детально)" },
  { key: "zone", header: "Зона" },
  { key: "respCenter", header: "Відповідальний підрозділ" },
  { key: "respPerson", header: "Відповідальна особа" },
  { key: "status", header: "Статус" },
  { key: "condition", header: "Стан" },
  { key: "functionality", header: "Функціональність" },
  { key: "relevance", header: "Актуальність" },
  { key: "comment", header: "Коментар" },
  { key: "purchaseYear", header: "Рік придбання" },
  { key: "commissionDate", header: "Дата введення" },
  { key: "normativeTerm", header: "Нормативний строк" },
  { key: "physicalWear", header: "Фізичний знос" },
  { key: "moralWear", header: "Моральний знос" },
  { key: "totalWear", header: "Загальний знос" },
  { key: "initialCost", header: "Початкова вартість" },
  { key: "marketValueNew", header: "Ринкова вартість (нова)" },
  { key: "marketValueUsed", header: "Ринкова вартість (бу)" },
  { key: "residualValuePerUnit", header: "Залишкова за 1 шт" },
  { key: "residualValue", header: "Залишкова вартість" },
  { key: "decision", header: "Рішення" },
  { key: "reason", header: "Причина" },
  { key: "newLocation", header: "Нова локація" },
  { key: "auditDate", header: "Дата аудиту" },
  { key: "auditors", header: "Аудитори" },
  { key: "actions", header: "Дії" },
];

export function AssetTable({ data, onEdit, onDelete, filters, setFilters, onExport, onImport, onDownloadTemplate, headerTitle = "Облік активів", headerSubtitle = "Швидкі фільтри та експорт", hideLocationFilter = false, isAdminOnly = false, canEdit = true, canEditAsset = null, editDisabledReason = "Редагування тимчасово недоступне", getEditDisabledReason = null, getRowClassName = null, mobileCardMode = false, isAssetInventorizedInSession = null, showInventoryStateFilter = false }) {
  // Стан для видимих колонок
  const fileInputRef = useRef(null);
  const defaultVisible = ["invNumber", "name", "category", "locationName", "status", "decision", "actions"];
  const [visibleColumns, setVisibleColumns] = useState(defaultVisible);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showDesktopFilters, setShowDesktopFilters] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [inventoryStateFilter, setInventoryStateFilter] = useState("all");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const shouldRenderInlineQr = data.length <= 300;
  const canUseInventoryStateFilter = showInventoryStateFilter && typeof isAssetInventorizedInSession === "function";

  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: mobileCardMode ? 50 : 100,
  });

  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [filters, deferredSearchQuery, data.length]);

  useEffect(() => {
    setPagination((prev) => {
      const nextPageSize = mobileCardMode ? 50 : 100;
      if (prev.pageSize === nextPageSize) return prev;
      return { pageIndex: 0, pageSize: nextPageSize };
    });
  }, [mobileCardMode]);

  const renderActions = useCallback((asset) => (
    <div className="flex items-center gap-1 justify-end flex-nowrap">
      <button
        type="button"
        onClick={async () => {
          const normalizedInvNumber = String(readAssetField(asset, "invNumber") || "").trim();
          try {
            await printAssetQrLabel({
              invNumber: normalizedInvNumber,
              name: asset.name,
              qrValue: asset.qrCode || normalizedInvNumber,
            });
          } catch (err) {
            alert(err.message || "Не вдалося надрукувати QR код");
          }
        }}
        className="inline-flex items-center gap-1 rounded-md bg-slate-700 border border-slate-600 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-600 transition whitespace-nowrap"
      >
        <span className="hidden sm:inline">Друк QR</span><span className="sm:hidden">QR</span>
      </button>
      {onEdit && (
        (() => {
          const isAssetEditableByRule = typeof canEditAsset === "function" ? Boolean(canEditAsset(asset)) : true;
          const isEditAllowed = Boolean(canEdit) && isAssetEditableByRule;
          const disabledReasonByAsset = typeof getEditDisabledReason === "function"
            ? String(getEditDisabledReason(asset) || "").trim()
            : "";
          const buttonTitle = isEditAllowed
            ? "Редагувати актив"
            : (disabledReasonByAsset || editDisabledReason);

          return (
        <button
          type="button"
          onClick={() => {
            if (!isEditAllowed) return;
            onEdit(asset);
          }}
          disabled={!isEditAllowed}
          title={buttonTitle}
          className={clsx(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition whitespace-nowrap",
            isEditAllowed
              ? "bg-indigo-600 border border-indigo-500 text-white hover:bg-indigo-500"
              : "bg-slate-300 border border-slate-300 text-slate-600 cursor-not-allowed"
          )}
        >
          <Pencil size={14} /> <span className="hidden sm:inline">Редагувати</span><span className="sm:hidden">Ред.</span>
        </button>
          );
        })()
      )}
      {isAdminOnly && onDelete && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Ви впевнені що хочете видалити актив "${asset.name}"?`)) {
              onDelete(asset.id);
            }
          }}
          className="inline-flex items-center gap-1 rounded-md bg-red-600 border border-red-500 px-2 py-1 text-xs font-semibold text-white hover:bg-red-500 transition whitespace-nowrap"
        >
          <Trash2 size={14} /> <span className="hidden sm:inline">Видалити</span><span className="sm:hidden">Вид.</span>
        </button>
      )}
    </div>
  ), [onEdit, canEdit, canEditAsset, editDisabledReason, getEditDisabledReason, isAdminOnly, onDelete]);

  const allColumns = useMemo(() => ALL_FIELD_DEFS.map((def) => {
    if (def.key === "actions") {
      return columnHelper.display({
        id: "actions",
        header: def.header,
        cell: (info) => renderActions(info.row.original),
      });
    }
    return columnHelper.accessor((row) => readAssetField(row, def.key), {
      id: def.key,
      header: def.header,
      cell: (info) => {
        if (def.key === "invNumber") {
          const invNumberValue = String(info.getValue() || "").trim();
          return (
            <div className="flex items-center gap-2">
              {invNumberValue && (
                shouldRenderInlineQr && (
                  <div className="bg-white p-1 rounded border border-slate-200">
                    {QRCode && <QRCode value={invNumberValue} size={32} level="L" />}
                  </div>
                )
              )}
              <div className="font-semibold text-slate-800">{invNumberValue || "-"}</div>
            </div>
          );
        }
        if (def.key === "status") {
          return <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">{info.getValue()}</span>;
        }
        if (def.key === "decision") {
          return <span className={clsx("badge whitespace-nowrap text-xs", decisionColors[info.getValue()] || "bg-slate-100 text-slate-700")}>{info.getValue()}</span>;
        }
        if (def.key === "initialCost" || def.key === "marketValueNew" || def.key === "marketValueUsed" || def.key === "residualValuePerUnit" || def.key === "residualValue") {
          return info.getValue() ? info.getValue().toLocaleString("uk-UA") + " ₴" : "";
        }
        return <span className="text-sm">{info.getValue() ?? ""}</span>;
      },
    });
  }), [renderActions, shouldRenderInlineQr]);
  // Фільтрація по ВСІХ активних фільтрах
  const filteredData = useMemo(() => {
    const normalizedQuery = String(deferredSearchQuery || "").trim().toLowerCase();

    return data.filter((item) => {
      const byFilters = Object.entries(filters).every(([key, val]) => {
        if (!val) return true;
        // Спеціальна логіка для "location" (businessUnit)
        if (key === "location") return item.businessUnit === val;
        // Спеціальна логіка для "locationName"
        if (key === "locationName") return item.locationName === val;
        return item[key] === val;
      });

      if (!byFilters) return false;

      const isInventorized = canUseInventoryStateFilter ? Boolean(isAssetInventorizedInSession(item)) : false;
      const matchesInventoryState =
        !canUseInventoryStateFilter ||
        inventoryStateFilter === "all" ||
        (inventoryStateFilter === "inventorized" && isInventorized) ||
        (inventoryStateFilter === "notInventorized" && !isInventorized);

      if (!matchesInventoryState) return false;
      return matchesSearchQuery(item, normalizedQuery);
    });
  }, [data, filters, deferredSearchQuery, canUseInventoryStateFilter, isAssetInventorizedInSession, inventoryStateFilter]);

  const columns = useMemo(() => {
    return allColumns.filter((col) => visibleColumns.includes(col.id || col.accessorKey));
  }, [visibleColumns, allColumns]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      pagination,
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const renderSortIcon = (column) => {
    const dir = column.getIsSorted();
    if (!dir) return null;
    return dir === "asc" ? <ArrowUpAZ size={14} className="text-slate-500" /> : <ArrowDownZA size={14} className="text-slate-500" />;
  };

  const filterKeyMap = {
    businessUnit: "location",
  };

  const filterableColumnKeys = new Set([
    "name",
    "category",
    "subCategory",
    "type",
    "serialNumber",
    "brand",
    "businessUnit",
    "locationName",
    "zone",
    "respCenter",
    "respPerson",
    "status",
    "condition",
    "functionality",
    "relevance",
    "decision",
    "reason",
  ]);

  const visibleFilterKeys = useMemo(() => {
    const keys = visibleColumns.filter((key) => filterableColumnKeys.has(key));

    // На мобільному і desktop показуємо детальну локацію пріоритетно, а загальну — після неї.
    return keys.sort((left, right) => {
      if (left === "locationName" && right === "businessUnit") return -1;
      if (left === "businessUnit" && right === "locationName") return 1;
      return 0;
    });
  }, [visibleColumns]);

  const filterOptionsByKey = useMemo(() => {
    const optionsMap = {};

    for (const key of filterableColumnKeys) {
      optionsMap[key] = Array.from(new Set(data.map((asset) => asset?.[key]).filter(Boolean)));
    }

    return optionsMap;
  }, [data]);

  useEffect(() => {
    const allowedFilterKeys = new Set(
      visibleFilterKeys.map((key) => filterKeyMap[key] || key)
    );

    setFilters((prev) => {
      const next = Object.entries(prev || {}).reduce((acc, [key, value]) => {
        if (!allowedFilterKeys.has(key)) return acc;
        acc[key] = value;
        return acc;
      }, {});

      const sameKeys = Object.keys(next).length === Object.keys(prev || {}).length;
      if (sameKeys) return prev;
      return next;
    });
  }, [setFilters, visibleFilterKeys]);

  const renderFilterByKey = (key) => {
    if (key === "businessUnit") {
      return (
        <FilterSelect
          key={key}
          label="Локація"
          value={filters.location || ""}
          options={["Ресторан", "Кав'ярня", "Кейтеринг", "Офіс", "Склад"]}
          onChange={(val) => setFilters((f) => ({ ...f, location: val }))}
        />
      );
    }

    if (key === "category") {
      return (
        <FilterSelect
          key={key}
          label="Категорія"
          value={filters.category || ""}
          options={["Кухня", "Бар", "IT", "Меблі", "Транспорт"]}
          onChange={(val) => setFilters((f) => ({ ...f, category: val }))}
        />
      );
    }

    if (key === "status") {
      return (
        <FilterSelect
          key={key}
          label="Статус"
          value={filters.status || ""}
          options={["В експлуатації", "Не використовується", "Законсервований"]}
          onChange={(val) => setFilters((f) => ({ ...f, status: val }))}
        />
      );
    }

    if (key === "decision") {
      return (
        <FilterSelect
          key={key}
          label="Рішення"
          value={filters.decision || ""}
          options={["Залишити", "Списати", "Продати", "Перемістити"]}
          onChange={(val) => setFilters((f) => ({ ...f, decision: val }))}
        />
      );
    }

    const label = ALL_FIELD_DEFS.find((f) => f.key === key)?.header || key;
    const filterKey = key;
    const options = filterOptionsByKey[key] || [];

    return (
      <FilterSelect
        key={key}
        label={label}
        value={filters[filterKey] || ""}
        options={options}
        onChange={(val) => setFilters((f) => ({ ...f, [filterKey]: val }))}
      />
    );
  };

  return (
    <div className="card p-4 sm:p-5 bg-white border border-slate-200 text-slate-900 shadow-xl">
      <div className="sticky top-2 z-20 -mx-4 px-4 pb-3 sm:-mx-5 sm:px-5 bg-white/95 backdrop-blur border-b border-slate-200/90">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900">{headerTitle}</h2>
            <p className="text-xs sm:text-sm text-slate-600">{headerSubtitle}</p>
          </div>
          <div className="relative z-30 flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 md:overflow-visible [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {isAdminOnly && onImport && (
              <input
                type="file"
                accept=".xlsx,.xls"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    await onImport(file);
                  }
                  e.target.value = "";
                }}
              />
            )}
            <ColumnVisibilityDropdown
              columns={ALL_FIELD_DEFS}
              visibleColumns={visibleColumns}
              setVisibleColumns={setVisibleColumns}
            />
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth >= 768) {
                  setShowDesktopFilters((prev) => !prev);
                  return;
                }
                setShowMobileFilters((prev) => !prev);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold text-xs border border-slate-300 bg-white text-slate-700 whitespace-nowrap"
            >
              <SlidersHorizontal size={14} />
              <span>Фільтри</span>
            </button>
            {isAdminOnly && onDownloadTemplate && (
              <button
                type="button"
                onClick={onDownloadTemplate}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold text-xs bg-slate-600 text-white hover:bg-slate-500 transition-all duration-200 shadow whitespace-nowrap"
              >
                <FileDown size={14} /> <span className="hidden sm:inline">Шаблон</span><span className="sm:hidden">Шабл.</span>
              </button>
            )}
            {isAdminOnly && onImport && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold text-xs bg-emerald-600 text-white hover:bg-emerald-500 transition-all duration-200 shadow whitespace-nowrap"
              >
                <Upload size={14} /> <span className="hidden sm:inline">Імпорт</span><span className="sm:hidden">Імп.</span>
              </button>
            )}
            <button type="button" onClick={onExport} className="inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold text-xs bg-indigo-600 text-white hover:bg-indigo-500 transition-all duration-200 shadow whitespace-nowrap">
              <Download size={14} /> <span>Експорт</span>
            </button>
          </div>
        </div>

        {mobileCardMode && (
          <div className="relative mt-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Пошук: інв. номер, назва, категорія, локація..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-9 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            {searchQuery && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setSearchQuery("")}
                aria-label="Очистити пошук"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {showMobileFilters && (
          <div className="mt-3 grid grid-cols-2 gap-2 md:hidden">
            {visibleFilterKeys.map(renderFilterByKey)}
          </div>
        )}

        {showDesktopFilters && (
          <div className="mt-3 hidden gap-2.5 md:grid md:grid-cols-5 xl:grid-cols-6">
            {visibleFilterKeys.map(renderFilterByKey)}
          </div>
        )}

        {canUseInventoryStateFilter && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">Інвентаризація:</span>
            <select
              value={inventoryStateFilter}
              onChange={(e) => setInventoryStateFilter(e.target.value || "all")}
              className="sm:hidden rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
            >
              <option value="all">Всі</option>
              <option value="inventorized">Проінвентаризовані</option>
              <option value="notInventorized">Не проінвентаризовані</option>
            </select>
            <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2">
              <button
                type="button"
                onClick={() => setInventoryStateFilter("all")}
                className={clsx(
                  "rounded-md border px-2.5 py-1 text-xs font-semibold",
                  inventoryStateFilter === "all"
                    ? "border-indigo-500 bg-indigo-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                )}
              >
                Всі
              </button>
              <button
                type="button"
                onClick={() => setInventoryStateFilter("inventorized")}
                className={clsx(
                  "rounded-md border px-2.5 py-1 text-xs font-semibold",
                  inventoryStateFilter === "inventorized"
                    ? "border-emerald-500 bg-emerald-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                )}
              >
                Проінвентаризовані
              </button>
              <button
                type="button"
                onClick={() => setInventoryStateFilter("notInventorized")}
                className={clsx(
                  "rounded-md border px-2.5 py-1 text-xs font-semibold",
                  inventoryStateFilter === "notInventorized"
                    ? "border-amber-500 bg-amber-500 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                )}
              >
                Не проінвентаризовані
              </button>
            </div>
          </div>
        )}
      </div>

      {!mobileCardMode && (
        <div className="relative mt-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Пошук: інв. номер, назва, категорія, локація..."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-9 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              onClick={() => setSearchQuery("")}
              aria-label="Очистити пошук"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {mobileCardMode && (
        <div className="mt-3 md:hidden space-y-2">
          {table.getRowModel().rows.map((row) => {
            const asset = row.original;
            const rowClassName = typeof getRowClassName === "function" ? String(getRowClassName(asset) || "") : "";
            const isSessionHighlighted = /emerald|green/i.test(rowClassName);

            return (
              <div
                key={asset.id}
                className={clsx(
                  "rounded-lg border bg-white p-2",
                  isSessionHighlighted
                    ? "border-emerald-300 bg-emerald-50/80 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]"
                    : "border-slate-200",
                  rowClassName
                )}
              >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 leading-tight truncate">{asset.name || "-"}</p>
                <div className="flex items-center gap-1">
                  {isSessionHighlighted && (
                    <span className="inline-flex items-center rounded-md bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 whitespace-nowrap">
                      Змінено
                    </span>
                  )}
                  <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">
                    {asset.status || "-"}
                  </span>
                </div>
              </div>

              <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                <div className="min-w-0">
                  <span className="text-slate-500">Інв.: </span>
                  <span className="font-semibold text-slate-900">{asset.invNumber || "-"}</span>
                </div>
                <div className="min-w-0 text-right">
                  <span className="text-slate-500">Локація: </span>
                  <span className="font-medium text-slate-800 truncate">{asset.locationName || asset.businessUnit || "-"}</span>
                </div>
              </div>

              <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                <div className="min-w-0">
                  <span className="text-slate-500">Категорія: </span>
                  <span className="font-medium text-slate-800">{asset.category || "-"}</span>
                </div>
                <div className="min-w-0 text-right">
                  <span className="text-slate-500 mr-1">Рішення:</span>
                  <span className={clsx("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold", decisionColors[asset.decision] || "bg-slate-100 text-slate-700 border border-slate-200")}>{asset.decision || "-"}</span>
                </div>
              </div>

              <div className="mt-2 flex justify-end">{renderActions(asset)}</div>
            </div>
            );
          })}
          {filteredData.length === 0 && (
            <div className="py-6 text-center text-sm text-slate-400">Немає записів за вибраними фільтрами</div>
          )}
        </div>
      )}

      <div className={clsx("mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white -mx-4 sm:-mx-0", mobileCardMode && "hidden md:block") }>
        <div className="inline-block min-w-full sm:min-w-0">
        <table className="min-w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-2.5 text-xs font-semibold text-slate-800 uppercase tracking-wide cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap"
                    onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {renderSortIcon(header.column)}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={clsx(
                  "border-b border-slate-200 last:border-0 hover:bg-slate-50 transition-colors",
                  typeof getRowClassName === "function" ? getRowClassName(row.original) : ""
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 align-top text-slate-800 font-medium">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {filteredData.length === 0 && (
          <div className="py-6 text-center text-sm text-slate-400">Немає записів за вибраними фільтрами</div>
        )}
      </div>

      {filteredData.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm text-slate-700">
          <div>
            Показано {table.getRowModel().rows.length} з {filteredData.length}
          </div>
          <div className="flex items-center gap-2">
            <span>На сторінці:</span>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1"
              value={pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value) || 50)}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-2 py-1 disabled:opacity-50"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Назад
            </button>
            <span>
              {pagination.pageIndex + 1} / {table.getPageCount() || 1}
            </span>
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-2 py-1 disabled:opacity-50"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Далі
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  const displayLabel = label || '';
  const mobileLabel = label ? label.slice(0, 3) : '';
  
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="inline-flex items-center gap-1 text-gray-900 font-semibold uppercase tracking-wide text-[11px]">
        <SlidersHorizontal size={14} className="sm:size-4" />
        <span className="hidden sm:inline">{displayLabel}</span>
        <span className="sm:hidden">{mobileLabel}</span>
      </span>
      <select
        className="w-full px-2.5 py-1.5 sm:py-2 bg-white border border-gray-300 rounded-md text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-150 appearance-none cursor-pointer text-xs sm:text-sm [&>option]:bg-white [&>option]:text-gray-900"
        value={value}
        onChange={(e) => onChange(e.target.value || "")}
      >
        <option value="" className="bg-white text-gray-900">Усі</option>
        {options.map((opt) => (
          <option key={opt} value={opt} className="bg-white text-gray-900">
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}
