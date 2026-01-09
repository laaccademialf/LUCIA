import { useMemo } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDownZA, ArrowUpAZ, Download, Pencil, SlidersHorizontal } from "lucide-react";
import clsx from "clsx";

const decisionColors = {
  "Залишити": "bg-gradient-to-r from-emerald-600 to-emerald-700 text-white border-2 border-emerald-500 font-bold shadow-lg shadow-emerald-500/40",
  "Списати": "bg-gradient-to-r from-rose-600 to-rose-700 text-white border-2 border-rose-500 font-bold shadow-lg shadow-rose-500/40",
  "Продати": "bg-gradient-to-r from-amber-600 to-amber-700 text-white border-2 border-amber-500 font-bold shadow-lg shadow-amber-500/40",
  "Перемістити": "bg-gradient-to-r from-sky-600 to-sky-700 text-white border-2 border-sky-500 font-bold shadow-lg shadow-sky-500/40",
};

const columnHelper = createColumnHelper();

export function AssetTable({ data, onEdit, filters, setFilters, onExport }) {
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
          <div className="font-bold text-indigo-400 text-base">{info.getValue()}</div>
        ),
      }),
      columnHelper.accessor("name", {
        header: "Назва активу",
        cell: (info) => (
          <div>
            <div className="font-bold text-white text-base">{info.getValue()}</div>
            <div className="text-sm text-slate-300 font-semibold">{info.row.original.brand}</div>
          </div>
        ),
      }),
      columnHelper.accessor("category", {
        header: "Категорія",
        cell: (info) => (
          <div className="text-sm text-white font-semibold">{info.getValue()}</div>
        ),
      }),
      columnHelper.accessor("businessUnit", {
        header: "Локація",
        cell: (info) => (
          <div className="text-sm text-white font-semibold">{info.getValue()}</div>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Статус",
        cell: (info) => (
          <span className="inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-bold bg-indigo-700 border-2 border-indigo-500 text-white shadow-lg shadow-indigo-500/30">{info.getValue()}</span>
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
          <button
            type="button"
            onClick={() => onEdit(info.row.original)}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-700 border-2 border-indigo-500 px-4 py-2 text-sm font-bold text-white hover:from-indigo-500 hover:to-indigo-600 hover:border-indigo-400 transition-all duration-200 shadow-lg shadow-indigo-500/40 hover:shadow-indigo-400/60"
          >
            <Pencil size={16} /> Редагувати
          </button>
        ),
      }),
    ],
    [onEdit]
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
    <div className="card p-5 bg-slate-800/60 border-slate-700 text-slate-50 shadow-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-indigo-400 font-semibold">Дашборд</p>
          <h2 className="text-xl font-semibold text-slate-50">Облік активів</h2>
          <p className="text-sm text-slate-300">Швидкі фільтри та експорт</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onExport} className="inline-flex items-center gap-2 px-5 py-3 rounded-lg font-bold text-sm bg-slate-700 border-2 border-slate-600 text-white hover:bg-slate-600 hover:border-slate-500 transition-all duration-200 shadow-lg shadow-slate-700/50 hover:shadow-slate-600/60">
            <Download size={18} /> Експорт CSV
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <FilterSelect
          label="Локація"
          value={filters.location}
          options={[
            "Ресторан",
            "Кав’ярня",
            "Кейтеринг",
            "Офіс",
            "Склад",
          ]}
          onChange={(val) => setFilters((f) => ({ ...f, location: val }))}
        />
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

      <div className="mt-4 overflow-x-auto rounded-lg border-2 border-indigo-700">
        <table className="min-w-full text-sm">
          <thead className="bg-gradient-to-r from-indigo-900/80 to-indigo-800/80 border-b-2 border-indigo-500">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-4 font-bold text-white uppercase tracking-wide cursor-pointer hover:bg-indigo-700/60 transition-colors"
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
              <tr key={row.id} className="border-b border-slate-700/50 last:border-0 hover:bg-indigo-900/30 transition-colors">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-4 align-top text-white font-semibold">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {filteredData.length === 0 && (
          <div className="py-6 text-center text-sm text-slate-400">Немає записів за вибраними фільтрами</div>
        )}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <label className="flex flex-col gap-2.5 text-sm">
      <span className="inline-flex items-center gap-2 text-white font-bold uppercase tracking-wide">
        <SlidersHorizontal size={16} /> {label}
      </span>
      <select
        className="w-full px-4 py-3.5 bg-slate-800 border-2 border-indigo-600 rounded-lg text-white font-semibold focus:outline-none focus:ring-4 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all duration-200 hover:border-indigo-500 shadow-lg shadow-indigo-600/20 appearance-none cursor-pointer [&>option]:bg-slate-800 [&>option]:text-white [&>option]:py-3 [&>option]:font-semibold"
        value={value}
        onChange={(e) => onChange(e.target.value || "")}
      >
        <option value="" className="bg-slate-800 text-white">Усі</option>
        {options.map((opt) => (
          <option key={opt} value={opt} className="bg-slate-800 text-white">
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}
