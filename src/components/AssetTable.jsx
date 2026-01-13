import { useMemo } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDownZA, ArrowUpAZ, Download, Pencil, Trash2, SlidersHorizontal } from "lucide-react";
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
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const byCategory = filters.category ? item.category === filters.category : true;
      const byStatus = filters.status ? item.status === filters.status : true;
      const byDecision = filters.decision ? item.decision === filters.decision : true;
      const byLocation = filters.location ? item.businessUnit === filters.location : true;
      return byCategory && byStatus && byDecision && byLocation;
    });
  }, [data, filters]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("invNumber", {
        header: "Інв. номер",
        cell: (info) => (
          <div className="font-semibold text-slate-800">{info.getValue()}</div>
        ),
      }),
      columnHelper.accessor("name", {
        header: "Назва активу",
        cell: (info) => (
          <div>
            <div className="font-semibold text-slate-900">{info.getValue()}</div>
            <div className="text-sm text-slate-600 font-medium">{info.row.original.brand}</div>
          </div>
        ),
      }),
      columnHelper.accessor("category", {
        header: "Категорія",
        cell: (info) => (
          <div className="text-sm text-slate-800 font-medium">{info.getValue()}</div>
        ),
      }),
      columnHelper.accessor("businessUnit", {
        header: "Локація",
        cell: (info) => (
          <div className="text-sm text-slate-800 font-medium">{info.getValue()}</div>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Статус",
        cell: (info) => (
          <span className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("decision", {
        header: "Рішення",
        cell: (info) => (
          <span
            className={clsx(
              "badge",
              decisionColors[info.getValue()] || "bg-slate-100 text-slate-700"
            )}
          >
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "Дії",
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
      }),
    ],
    [onEdit, onDelete, isAdminOnly]
  );

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
          <button type="button" onClick={onExport} className="inline-flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-3 rounded-lg font-semibold text-xs sm:text-sm bg-indigo-600 text-white hover:bg-indigo-500 transition-all duration-200 shadow-md whitespace-nowrap">
            <Download size={16} className="sm:size-18" /> <span className="hidden sm:inline">Експорт CSV</span><span className="sm:hidden">Експ.</span>
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
