import { useMemo, useState, useRef } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDownZA, ArrowUpAZ, Download, Pencil, Trash2, SlidersHorizontal } from "lucide-react";
import ColumnVisibilityDropdown from "./ColumnVisibilityDropdown";
import clsx from "clsx";

// High-contrast badges on light backgrounds for readability
const decisionColors = {
  "Залишити": "bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold",
  "Списати": "bg-rose-100 text-rose-800 border border-rose-300 font-semibold",
  "Продати": "bg-amber-100 text-amber-800 border border-amber-300 font-semibold",
  "Перемістити": "bg-sky-100 text-sky-800 border border-sky-300 font-semibold",
};

const columnHelper = createColumnHelper();

export function AssetTable({ data, onEdit, onDelete, filters, setFilters, onExport, headerTitle = "Облік активів", headerSubtitle = "Швидкі фільтри та експорт", hideLocationFilter = false, isAdminOnly = false }) {
  // Стан для видимих колонок
  // Додаємо всі можливі поля з mockAssets
  const allFieldDefs = [
    { key: "invNumber", header: "Інв. номер" },
    { key: "name", header: "Назва активу" },
    { key: "category", header: "Категорія" },
    { key: "subCategory", header: "Підкатегорія" },
    { key: "type", header: "Тип" },
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
    { key: "residualValue", header: "Залишкова вартість" },
    { key: "decision", header: "Рішення" },
    { key: "reason", header: "Причина" },
    { key: "newLocation", header: "Нова локація" },
    { key: "auditDate", header: "Дата аудиту" },
    { key: "auditors", header: "Аудитори" },
    { key: "actions", header: "Дії" },
  ];
  const defaultVisible = ["invNumber", "name", "category", "businessUnit", "status", "decision", "actions"];
  const [visibleColumns, setVisibleColumns] = useState(defaultVisible);
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const byCategory = filters.category ? item.category === filters.category : true;
      const byStatus = filters.status ? item.status === filters.status : true;
      const byDecision = filters.decision ? item.decision === filters.decision : true;
      const byLocation = filters.location ? item.businessUnit === filters.location : true;
      return byCategory && byStatus && byDecision && byLocation;
    });
  }, [data, filters]);

  // Динамічно будуємо всі колонки для таблиці
  const allColumns = allFieldDefs.map((def) => {
    if (def.key === "actions") {
      return columnHelper.display({
        id: "actions",
        header: def.header,
        cell: (info) => (
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={() => onEdit(info.row.original)}
              className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 border-2 border-indigo-500 px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm font-bold text-white hover:from-indigo-500 hover:to-indigo-600 hover:border-indigo-400 transition-all duration-200 shadow-lg shadow-indigo-500/40 hover:shadow-indigo-400/60 whitespace-nowrap"
            >
              <Pencil size={14} /> <span className="hidden sm:inline">Редагувати</span><span className="sm:hidden">Ред.</span>
            </button>
            {isAdminOnly && onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Ви впевнені що хочете видалити актив "${info.row.original.name}"?`)) {
                    onDelete(info.row.original.id);
                  }
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-red-600 to-red-700 border-2 border-red-500 px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm font-bold text-white hover:from-red-500 hover:to-red-600 hover:border-red-400 transition-all duration-200 shadow-lg shadow-red-500/40 hover:shadow-red-400/60 whitespace-nowrap"
              >
                <Trash2 size={14} /> <span className="hidden sm:inline">Видалити</span><span className="sm:hidden">Вид.</span>
              </button>
            )}
          </div>
        ),
      });
    }
    return columnHelper.accessor(def.key, {
      header: def.header,
      cell: (info) => {
        // Спеціальні стилі для деяких колонок
        if (def.key === "status") {
          return <span className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">{info.getValue()}</span>;
        }
        if (def.key === "decision") {
          return <span className={clsx("badge", decisionColors[info.getValue()] || "bg-slate-100 text-slate-700")}>{info.getValue()}</span>;
        }
        if (def.key === "initialCost" || def.key === "marketValueNew" || def.key === "marketValueUsed" || def.key === "residualValue") {
          return info.getValue() ? info.getValue().toLocaleString("uk-UA") + " ₴" : "";
        }
        return <span>{info.getValue() ?? ""}</span>;
      },
    });
  });

  const columns = useMemo(() => {
    return allColumns.filter((col) => visibleColumns.includes(col.id || col.accessorKey));
  }, [visibleColumns, onEdit, onDelete, isAdminOnly, allColumns]);

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const renderSortIcon = (column) => {
    const dir = column.getIsSorted();
    if (!dir) return null;
    return dir === "asc" ? <ArrowUpAZ size={14} className="text-slate-500" /> : <ArrowDownZA size={14} className="text-slate-500" />;
  };

  return (
    <div className="card p-4 sm:p-5 bg-white border border-slate-200 text-slate-900 shadow-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-slate-900">{headerTitle}</h2>
          <p className="text-xs sm:text-sm text-slate-600">{headerSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ColumnVisibilityDropdown
            columns={allFieldDefs}
            visibleColumns={visibleColumns}
            setVisibleColumns={setVisibleColumns}
          />
          <button type="button" onClick={onExport} className="inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold text-xs bg-indigo-600 text-white hover:bg-indigo-500 transition-all duration-200 shadow whitespace-nowrap">
            <Download size={14} /> <span className="hidden sm:inline">Експорт CSV</span><span className="sm:hidden">Експ.</span>
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-4">
        {!hideLocationFilter && (
          <FilterSelect
            label="Локація"
            value={filters.location}
            options={[
              "Ресторан",
              "Кав'ярня",
              "Кейтеринг",
              "Офіс",
              "Склад",
            ]}
            onChange={(val) => setFilters((f) => ({ ...f, location: val }))}
          />
        )}
        <FilterSelect
          label="Категорія"
          value={filters.category}
          options={["Кухня", "Бар", "IT", "Меблі", "Транспорт"]}
          onChange={(val) => setFilters((f) => ({ ...f, category: val }))}
        />
        <FilterSelect
          label="Статус"
          value={filters.status}
          options={["В експлуатації", "Не використовується", "Законсервований"]}
          onChange={(val) => setFilters((f) => ({ ...f, status: val }))}
        />
        <FilterSelect
          label="Рішення"
          value={filters.decision}
          options={["Залишити", "Списати", "Продати", "Перемістити"]}
          onChange={(val) => setFilters((f) => ({ ...f, decision: val }))}
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white -mx-4 sm:-mx-0">
        <div className="inline-block min-w-full sm:min-w-0">
        <table className="min-w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 font-semibold text-slate-800 uppercase tracking-wide cursor-pointer hover:bg-slate-100 transition-colors"
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
              <tr key={row.id} className="border-b border-slate-200 last:border-0 hover:bg-slate-50 transition-colors">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-top text-slate-800 font-medium">
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
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  const displayLabel = label || '';
  const mobileLabel = label ? label.slice(0, 3) : '';
  
  return (
    <label className="flex flex-col gap-1 text-xs sm:text-sm">
      <span className="inline-flex items-center gap-1 sm:gap-2 text-gray-900 font-semibold uppercase tracking-wide">
        <SlidersHorizontal size={14} className="sm:size-4" />
        <span className="hidden sm:inline">{displayLabel}</span>
        <span className="sm:hidden">{mobileLabel}</span>
      </span>
      <select
        className="w-full px-2 sm:px-4 py-2 sm:py-3 bg-white border border-gray-300 rounded-lg text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-150 appearance-none cursor-pointer text-xs sm:text-base [&>option]:bg-white [&>option]:text-gray-900"
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
