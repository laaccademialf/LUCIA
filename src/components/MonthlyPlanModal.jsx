import { useMemo, useState } from "react";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

const MONTHS_UK = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

const toNum = (v) => {
  const n = Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const formatNumber = (value) =>
  value ? new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value) : "0";

const parseDefaultMonth = (value) => {
  const m = String(value || "").match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  return {
    year: m ? Number(m[1]) : now.getFullYear(),
    month: m ? Number(m[2]) : now.getMonth() + 1,
  };
};

// Вікно вводу місячного плану ТО/Гості з авто-розрахунком середнього чека.
// Монтується заново при кожному відкритті (key/умовний рендер у батьку),
// тож поля завжди чисті — навіть після зміни закладу.
export default function MonthlyPlanModal({ open, onClose, defaultMonth, onGenerate, generating, status }) {
  const initial = parseDefaultMonth(defaultMonth);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [monthlyTo, setMonthlyTo] = useState("");
  const [monthlyGuests, setMonthlyGuests] = useState("");

  const avgCheck = useMemo(() => {
    const to = toNum(monthlyTo);
    const guests = toNum(monthlyGuests);
    return guests > 0 ? Math.round(to / guests) : 0;
  }, [monthlyTo, monthlyGuests]);

  const yearOptions = useMemo(() => [initial.year - 1, initial.year, initial.year + 1], [initial.year]);

  if (!open) return null;

  const canGenerate = toNum(monthlyTo) > 0 && !generating;

  const handleGenerate = () => {
    if (!canGenerate) return;
    onGenerate({ year, month, monthlyTo: toNum(monthlyTo), monthlyGuests: toNum(monthlyGuests) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">План на місяць</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <p className="mb-4 text-sm text-slate-600">
          Введіть цілі на місяць — план розкладеться по днях і годинах за історичними частками
          (той самий день тижня, сезонність рік тому).
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">Місяць</span>
            <select className={inputClass} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS_UK.map((name, idx) => (
                <option key={name} value={idx + 1}>{name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">Рік</span>
            <select className={inputClass} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">ТО на місяць</span>
            <input type="number" inputMode="numeric" className={inputClass} value={monthlyTo} onChange={(e) => setMonthlyTo(e.target.value)} placeholder="0" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">Гості на місяць</span>
            <input type="number" inputMode="numeric" className={inputClass} value={monthlyGuests} onChange={(e) => setMonthlyGuests(e.target.value)} placeholder="0" />
          </label>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-600">Середній чек (план)</span>
            <span className="text-lg font-bold text-slate-900">{formatNumber(avgCheck)}</span>
          </div>
        </div>

        {status && <p className="mt-3 text-sm text-slate-600">{status}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {generating ? "Розрахунок..." : "Згенерувати план"}
          </button>
        </div>
      </div>
    </div>
  );
}
