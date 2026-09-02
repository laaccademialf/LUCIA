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
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

const MONTH_NAMES = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];
const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

const buildMonthGrid = (year, month) => {
  const first = new Date(year, month, 1);
  const dayOfWeekSun0 = first.getDay();
  const offset = (dayOfWeekSun0 + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
};

// Календар з вибором діапазону: перший клік — початок, другий — кінець.
const DateRangePickerPopover = ({ from, to, onChange, min, max, label = "Період:" }) => {
  const [open, setOpen] = useState(false);
  const [pendingFrom, setPendingFrom] = useState(null); // ISO під час вибору
  const anchor = useMemo(() => isoToDate(from || to || dateToIso(new Date())), [from, to]);
  const [viewYear, setViewYear] = useState(anchor.getFullYear());
  const [viewMonth, setViewMonth] = useState(anchor.getMonth());
  const rootRef = useRef(null);

  useEffect(() => {
    if (open) {
      setViewYear(anchor.getFullYear());
      setViewMonth(anchor.getMonth());
      setPendingFrom(null);
    }
  }, [open, anchor]);

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

  const isDisabled = (d) => {
    if (maxDate && d > maxDate) return true;
    if (minDate && d < minDate) return true;
    return false;
  };

  const todayQuickIso = dateToIso(new Date());
  const yesterdayQuickIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return dateToIso(d);
  })();
  // Швидкий вибір одноденного періоду (Вчора/Сьогодні) — щоб повернутись до поточних показників.
  const selectQuickDay = (iso) => {
    if (isDisabled(isoToDate(iso))) return;
    onChange?.({ from: iso, to: iso });
    setPendingFrom(null);
    setOpen(false);
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
    const iso = dateToIso(d);
    if (!pendingFrom) {
      // Перший клік — фіксуємо початок
      setPendingFrom(iso);
      return;
    }
    // Другий клік — формуємо діапазон
    let start = pendingFrom;
    let end = iso;
    if (start > end) [start, end] = [end, start];
    onChange?.({ from: start, to: end });
    setPendingFrom(null);
    setOpen(false);
  };

  const triggerLabel = (() => {
    if (from && to) return `${formatDateUk(from)} – ${formatDateUk(to)}`;
    if (from) return formatDateUk(from);
    return "Оберіть період";
  })();

  return (
    <div ref={rootRef} className="relative inline-block w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-indigo-400 transition"
      >
        <CalendarIcon size={16} className="text-indigo-500" />
        <span className="truncate">{triggerLabel}</span>
      </button>
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
          <div className="text-center text-xs text-slate-500 mb-2">
            {pendingFrom
              ? `Початок: ${formatDateUk(pendingFrom)} — оберіть кінець`
              : "Оберіть початкову дату"}
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
              const iso = dateToIso(d);
              const rangeStart = pendingFrom || from;
              const rangeEnd = pendingFrom ? null : to;
              const isStart = rangeStart && iso === rangeStart;
              const isEnd = rangeEnd && iso === rangeEnd;
              const inRange = rangeStart && rangeEnd && iso > rangeStart && iso < rangeEnd;
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
                    inRange ? "bg-indigo-100 rounded-none" : "",
                    isStart || isEnd ? "bg-indigo-600 text-white hover:bg-indigo-600" : "",
                  ].join(" ")}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={isDisabled(isoToDate(yesterdayQuickIso))}
                onClick={() => selectQuickDay(yesterdayQuickIso)}
                className="rounded px-2 py-1 font-semibold text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
              >
                Вчора
              </button>
              <button
                type="button"
                disabled={isDisabled(isoToDate(todayQuickIso))}
                onClick={() => selectQuickDay(todayQuickIso)}
                className="rounded px-2 py-1 font-semibold text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
              >
                Сьогодні
              </button>
            </div>
            <button
              type="button"
              onClick={() => { setPendingFrom(null); setOpen(false); }}
              className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
            >
              Закрити
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangePickerPopover;
