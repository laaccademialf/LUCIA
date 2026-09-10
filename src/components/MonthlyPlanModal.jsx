import { useEffect, useMemo, useState } from "react";

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

// Сума План/Факт ТО та Гостей закладу за конкретний місяць.
const sumMonth = (history, y, m) => {
  const prefix = `${y}-${String(m).padStart(2, "0")}`;
  let planTo = 0, factTo = 0, planGosti = 0, factGosti = 0;
  for (const rec of Array.isArray(history) ? history : []) {
    if (!String(rec?.date || "").slice(0, 10).startsWith(prefix)) continue;
    const hours = rec?.hours && typeof rec.hours === "object" ? rec.hours : {};
    for (const h of Object.values(hours)) {
      planTo += toNum(h?.planTo);
      factTo += toNum(h?.factTo);
      planGosti += toNum(h?.planGosti);
      factGosti += toNum(h?.factGosti);
    }
  }
  return { planTo, factTo, planGosti, factGosti };
};

// Вікно вводу місячного плану ТО/Гості з авто-розрахунком середнього чека.
// Монтується заново при кожному відкритті (key/умовний рендер у батьку),
// тож поля завжди чисті — навіть після зміни закладу.
export default function MonthlyPlanModal({ open, onClose, defaultMonth, onGenerate, generating, status, history = [] }) {
  const initial = parseDefaultMonth(defaultMonth);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [avgCheckInput, setAvgCheckInput] = useState("");   // Середній чек (грн)
  const [guestsPerDay, setGuestsPerDay] = useState("");     // Гості на день
  const [useWeather, setUseWeather] = useState(true);
  const [forecastBase, setForecastBase] = useState(null); // { avgCheck, guestsPerDay } — базовий прогноз до коригування
  const [avgCheckAdjustPct, setAvgCheckAdjustPct] = useState(0);
  const [guestAdjustPct, setGuestAdjustPct] = useState(0);
  const [adjustField, setAdjustField] = useState("guests");
  const adjustPct = adjustField === "guests" ? guestAdjustPct : avgCheckAdjustPct;

  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);

  // Похідні місячні цілі: ТО = середній чек × гості на місяць; гості на місяць = гості на день × дні місяця.
  const monthlyGuests = useMemo(() => Math.round(toNum(guestsPerDay) * daysInMonth), [guestsPerDay, daysInMonth]);
  const monthlyTo = useMemo(() => Math.round(toNum(avgCheckInput) * monthlyGuests), [avgCheckInput, monthlyGuests]);

  // Передзаповнюємо поля раніше введеним планом обраного місяця (та скидаємо прогноз при зміні місяця).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const agg = sumMonth(history, year, month);
    const avg = agg.planGosti > 0 ? Math.round(agg.planTo / agg.planGosti) : 0;
    const gpd = daysInMonth > 0 ? Math.round(agg.planGosti / daysInMonth) : 0;
    setAvgCheckInput(avg ? String(avg) : "");
    setGuestsPerDay(gpd ? String(gpd) : "");
    setForecastBase(null);
    setAvgCheckAdjustPct(0);
    setGuestAdjustPct(0);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [year, month, history, daysInMonth]);

  const yearOptions = useMemo(() => [initial.year - 1, initial.year, initial.year + 1], [initial.year]);

  // Прогноз середнього чека та гостей на день будується лише за фактичними показниками.
  const handleForecast = () => {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevMonthYear = month === 1 ? year - 1 : year;
    const A = sumMonth(history, prevMonthYear, prevMonth);       // минулий місяць (цей рік)
    const B = sumMonth(history, year - 1, month);                // цей місяць торік
    const C = sumMonth(history, prevMonthYear - 1, prevMonth);   // минулий місяць торік
    const toOf = (v) => v.factTo;
    const guOf = (v) => v.factGosti;
    // Похідні по місяцю: середній чек = ТО / гості; гості на день = гості / дні того місяця.
    const avgOf = (v) => (guOf(v) > 0 ? toOf(v) / guOf(v) : 0);
    const gpdOf = (v, y, m) => guOf(v) / new Date(y, m, 0).getDate();
    const project = (a, b, c) => {
      if (b > 0 && a > 0 && c > 0) return b * (a / c);
      if (b > 0) return b;
      if (a > 0) return a;
      return 0;
    };
    const avg = Math.round(project(avgOf(A), avgOf(B), avgOf(C)));
    const gpd = Math.round(project(
      gpdOf(A, prevMonthYear, prevMonth),
      gpdOf(B, year - 1, month),
      gpdOf(C, prevMonthYear - 1, prevMonth),
    ));
    setForecastBase({ avgCheck: avg, guestsPerDay: gpd });
    setAvgCheckAdjustPct(0);
    setGuestAdjustPct(0);
    setAvgCheckInput(avg ? String(avg) : "");
    setGuestsPerDay(gpd ? String(gpd) : "");
  };

  const sliderTrackStyle = (pct) => {
    const value = Math.max(-50, Math.min(50, Number(pct) || 0));
    const center = 50;
    const left = value < 0 ? center + value : center;
    const right = value >= 0 ? center + value : center;
    return {
      background: `linear-gradient(90deg, #e2e8f0 ${left}%, ${value < -30 ? "#dc2626" : value < -15 ? "#f97316" : value < 0 ? "#eab308" : value > 25 ? "#16a34a" : "#84cc16"} ${left}%, ${value < -30 ? "#dc2626" : value < -15 ? "#f97316" : value < 0 ? "#eab308" : value > 25 ? "#16a34a" : "#84cc16"} ${right}%, #e2e8f0 ${right}%)`,
    };
  };

  // Коригування ±% застосовується незалежно до гостей та до середнього чека.
  const handleAdjust = (field, pct) => {
    if (!forecastBase) return;
    const factor = 1 + pct / 100;
    if (field === "guests") {
      setGuestAdjustPct(pct);
      setGuestsPerDay(forecastBase.guestsPerDay ? String(Math.round(forecastBase.guestsPerDay * factor)) : "");
      return;
    }
    setAvgCheckAdjustPct(pct);
    setAvgCheckInput(forecastBase.avgCheck ? String(Math.round(forecastBase.avgCheck * factor)) : "");
  };

  if (!open) return null;

  const canGenerate = monthlyTo > 0 && !generating;

  const handleGenerate = () => {
    if (!canGenerate) return;
    onGenerate({ year, month, monthlyTo, monthlyGuests, useWeather });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">План на місяць</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <p className="mb-4 text-sm text-slate-600">
          Введіть цілі на місяць.
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
            <span className="text-xs font-semibold text-slate-600">Середній чек</span>
            <input type="number" inputMode="numeric" className={inputClass} value={avgCheckInput} onFocus={() => setAdjustField("avgCheck")} onChange={(e) => setAvgCheckInput(e.target.value)} placeholder="0" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">Гості на день</span>
            <input type="number" inputMode="numeric" className={inputClass} value={guestsPerDay} onFocus={() => setAdjustField("guests")} onChange={(e) => setGuestsPerDay(e.target.value)} placeholder="0" />
          </label>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-600">ТО на місяць</span>
            <span className="text-lg font-bold text-slate-900">{formatNumber(monthlyTo)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-600">Гості на місяць</span>
            <span className="text-lg font-bold text-slate-900">{formatNumber(monthlyGuests)}</span>
          </div>
        </div>

        <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={useWeather}
            onChange={(e) => setUseWeather(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
          />
          <span>
            Врахувати прогноз погоди (Київ)
            <span className="block text-xs text-slate-500">
              Коригує розподіл по днях за прогнозом і заповнює колонку «Погода» (діє на найближчі ~16 днів).
            </span>
          </span>
        </label>

        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <button
            type="button"
            onClick={handleForecast}
            className="w-full rounded-lg border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
          >
            Спрогнозувати план
          </button>
          <p className="mt-2 text-xs text-slate-500">
            Прогноз за історією: цей місяць торік × тренд минулого місяця (цей рік ÷ торік) по середньому чеку та гостях.
          </p>
          {forecastBase && (
            <div className="mt-3">
              {forecastBase.avgCheck === 0 && forecastBase.guestsPerDay === 0 ? (
                <p className="text-xs text-amber-600">
                  Недостатньо фактичних історичних даних для прогнозу — заповніть факт за попередні місяці.
                </p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Показник прогнозу">
                    {[ ["guests", "Гості на день"], ["avgCheck", "Середній чек"] ].map(([field, label]) => (
                      <button key={field} type="button" aria-pressed={adjustField === field} onClick={() => setAdjustField(field)}
                        className={`rounded border px-3 py-2 text-sm ${adjustField === field ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-300 text-slate-600"}`}>
                        {label}
                      </button>
                    ))}
                    <output className="ml-auto text-sm font-semibold">{adjustPct > 0 ? "+" : ""}{adjustPct}%</output>
                  </div>
                  <input type="range" min={-50} max={50} step={1} value={adjustPct}
                    aria-label={adjustField === "guests" ? "Коригування гостей" : "Коригування середнього чека"}
                    onChange={(event) => handleAdjust(adjustField, Number(event.target.value))}
                    style={sliderTrackStyle(adjustPct)}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-slate-600 [&::-webkit-slider-thumb]:bg-white [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-slate-600 [&::-moz-range-thumb]:bg-white" />
                  <div className="mt-2 flex justify-between text-xs text-slate-500"><span>−50%</span><span>0</span><span>+50%</span></div>
                </>
              )}
            </div>
          )}
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
