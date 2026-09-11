import { ChevronDown, ChevronRight } from "lucide-react";

export default function DashboardGroupLabel({ row, expanded, onToggle }) {
  if (!row.isGroup) return <span className={row.isTotal ? "" : "pl-6"}>{row.name}</span>;
  const open = expanded.has(row.id);
  return (
    <button
      type="button"
      onClick={() => onToggle(row.id)}
      aria-expanded={open}
      aria-label={`${open ? "Згорнути" : "Розгорнути"} напрям ${row.name}`}
      className="inline-flex items-center gap-1.5 text-left font-bold text-indigo-900"
    >
      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      <span>{row.name}</span>
      <span className="text-xs font-normal text-slate-500">({row.children.length})</span>
    </button>
  );
}
