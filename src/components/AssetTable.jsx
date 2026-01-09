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
  "Залишити": "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40",
  "Списати": "bg-rose-500/20 text-rose-300 border border-rose-400/40",
  "Продати": "bg-amber-500/20 text-amber-300 border border-amber-400/40",
  "Перемістити": "bg-sky-500/20 text-sky-300 border border-sky-400/40",
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
          <div className="font-semibold text-indigo-300">{info.getValue()}</div>
        ),
      }),
      columnHelper.accessor("name", {
        header: "Назва активу",
        cell: (info) => (
          <div>
            <div className="font-medium text-slate-50">{info.getValue()}</div>
            <div className="text-xs text-slate-400">{info.row.original.brand}</div>
          </div>
        ),
      }),
      columnHelper.accessor("category", {
        header: "Категорія",
        cell: (info) => (
          <div className="text-sm text-slate-200">{info.getValue()}</div>
        ),
      }),
      columnHelper.accessor("businessUnit", {
        header: "Локація",
        cell: (info) => (
          <div className="text-sm text-slate-200">{info.getValue()}</div>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Статус",
        cell: (info) => (
          <span className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold bg-slate-700/40 border border-slate-600/40 text-slate-200">{info.getValue()}</span>
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
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600/20 border border-indigo-500/40 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/30 hover:border-indigo-400/60 transition"
          >
            <Pencil size={14} /> Редагувати
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
          <button type="button" onClick={onExport} className="btn btn-primary">
            <Download size={16} /> Експорт CSV
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

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-700">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-700/50 text-left text-xs uppercase text-slate-300">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-2 font-semibold"
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
              <tr key={row.id} className="border-b border-slate-700 last:border-0 hover:bg-slate-700/30">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-3 align-top text-slate-100">
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
    <label className="flex flex-col gap-2 text-sm">
      <span className="inline-flex items-center gap-2 text-slate-200 font-semibold text-indigo-300">
        <SlidersHorizontal size={14} /> {label}
      </span>
      <select
        className="w-full rounded-xl border border-indigo-500/40 bg-gradient-to-br from-slate-800/80 to-slate-900/90 px-4 py-3 text-sm text-slate-50 shadow-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/50 focus:outline-none transition appearance-none cursor-pointer hover:border-indigo-400/60 [&>option]:bg-slate-800 [&>option]:text-slate-50 [&>option]:py-2"
        value={value}
        onChange={(e) => onChange(e.target.value || "")}
      >
        <option value="" className="bg-slate-800 text-slate-50">Усі</option>
        {options.map((opt) => (
          <option key={opt} value={opt} className="bg-slate-800 text-slate-50">
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}
