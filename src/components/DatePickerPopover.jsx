import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";

// Парсить "YYYY-MM-DD" у локальну Date (без зсуву на UTC опівночі).
const isoToDate = (iso) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date();
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const dateToIso = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const formatDateUk = (iso) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

const MONTH_NAMES = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];
// Понеділок = 0
const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

// Повертає масив з 42 клітинок (6 тижнів × 7 днів) для місяця.
const buildMonthGrid = (year, month) => {
  // monthFirstDay.getDay(): 0=нд..6=сб. Перетворюємо на 0=пн..6=нд
  const first = new Date(year, month, 1);
  const dayOfWeekSun0 = first.getDay();
  const offset = (dayOfWeekSun0 + 6) % 7; // понеділок як початок
  const start = new Date(year, month, 1 - offset);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
};

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const DatePickerPopover = ({ value, onChange, max, min, label = "Дата:", className = "", triggerClassName = "" }) => {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => isoToDate(value), [value]);
  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());
  const rootRef = useRef(null);

  useEffect(() => {
    if (open) {
      setViewYear(selected.getFullYear());
      setViewMonth(selected.getMonth());
    }
  }, [open, selected]);

  // Закриття по кліку поза та по Esc
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const maxDate = max ? isoToDate(max) : null;
  const minDate = min ? isoToDate(min) : null;
  const todayIso = dateToIso(new Date());
  const yesterdayIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return dateToIso(d);
  })();

  const isDisabled = (d) => {
    if (maxDate && d > maxDate) return true;
    if (minDate && d < minDate) return true;
    return false;
  };

  const goPrevMonth = () => {
    const m = viewMonth - 1;
    if (m < 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(m);
  };
  const goNextMonth = () => {
    const m = viewMonth + 1;
    if (m > 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(m);
  };

  const cells = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const pick = (d) => {
    if (isDisabled(d)) return;
    onChange?.(dateToIso(d));
    setOpen(false);
  };

  const hasLabel = Boolean(String(label || "").trim());
  const triggerBaseClass = "inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:border-indigo-400 transition";

  return (
    <div ref={rootRef} className={["relative", className].filter(Boolean).join(" ")}>
      {hasLabel ? (
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          {label}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={[triggerBaseClass, "px-2 py-1", triggerClassName].filter(Boolean).join(" ")}
          >
            <CalendarIcon size={16} className="text-indigo-500" />
            <span>{formatDateUk(value)}</span>
          </button>
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Обрати дату"
          className={[triggerBaseClass, "w-full justify-between px-2 py-1", triggerClassName].filter(Boolean).join(" ")}
        >
          <span className="inline-flex items-center gap-2">
            <CalendarIcon size={16} className="text-indigo-500" />
            <span>{formatDateUk(value)}</span>
          </span>
        </button>
      )}
      {open && (
        <div className="absolute z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={goPrevMonth} className="p-1 rounded hover:bg-slate-100">
              <ChevronLeft size={18} />
            </button>
            <div className="text-sm font-semibold text-slate-800">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </div>
            <button type="button" onClick={goNextMonth} className="p-1 rounded hover:bg-slate-100">
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="grid grid-cols-7 text-xs text-slate-500 mb-1">
            {WEEKDAY_SHORT.map((w) => (
              <div key={w} className="text-center py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d) => {
              const inMonth = d.getMonth() === viewMonth;
              const disabled = isDisabled(d);
              const isSelected = sameDay(d, selected);
              const iso = dateToIso(d);
              const isToday = iso === todayIso;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => pick(d)}
                  disabled={disabled}
                  className={[
                    "h-8 rounded text-sm",
                    disabled ? "text-slate-300 cursor-not-allowed" : "hover:bg-indigo-50",
                    inMonth ? "text-slate-800" : "text-slate-400",
                    isSelected ? "bg-indigo-600 text-white hover:bg-indigo-600" : "",
                    !isSelected && isToday ? "ring-1 ring-indigo-300" : "",
                  ].join(" ")}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={() => { if (!isDisabled(isoToDate(yesterdayIso))) { onChange?.(yesterdayIso); setOpen(false); } }}
              className="rounded px-2 py-1 hover:bg-slate-100 text-slate-700"
            >
              Вчора
            </button>
            <button
              type="button"
              onClick={() => { if (!isDisabled(isoToDate(todayIso))) { onChange?.(todayIso); setOpen(false); } }}
              className="rounded px-2 py-1 hover:bg-slate-100 text-slate-700"
            >
              Сьогодні
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100 ml-auto"
            >
              Закрити
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatePickerPopover;
