import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from "lucide-react";

const MONTH_NAMES_UA = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];
const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

const toISO = (d) => {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const fromISO = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const formatUA = (s) => {
  const d = fromISO(s);
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};

const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const buildMonthGrid = (year, month) => {
  const firstDay = new Date(year, month, 1);
  const jsDow = firstDay.getDay(); // 0=Sun..6=Sat
  const mondayOffset = (jsDow + 6) % 7; // make Monday=0
  const start = new Date(year, month, 1 - mondayOffset);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
};

export default function DateRangePicker({ startDate, endDate, onChange, placeholder = "дд.мм.рррр – дд.мм.рррр", className = "" }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0, openUp: false });

  const startObj = useMemo(() => fromISO(startDate), [startDate]);
  const endObj = useMemo(() => fromISO(endDate), [endDate]);

  const initial = startObj || new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [hoverDate, setHoverDate] = useState(null);

  useEffect(() => {
    if (open) {
      const base = startObj || new Date();
      setViewYear(base.getFullYear());
      setViewMonth(base.getMonth());
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const popHeight = 320;
        const popWidth = 300;
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUp = spaceBelow < popHeight + 8 && rect.top > popHeight + 8;
        const top = openUp ? rect.top - popHeight - 4 : rect.bottom + 4;
        const left = Math.min(rect.left, window.innerWidth - popWidth - 8);
        setPopoverPos({ top, left: Math.max(8, left), openUp });
      }
    }
  }, [open, startObj]);

  useEffect(() => {
    const handleClick = (event) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handlePickDay = (d) => {
    if (!startObj || (startObj && endObj)) {
      onChange?.({ start: toISO(d), end: "" });
      setHoverDate(null);
      return;
    }
    if (d < startObj) {
      onChange?.({ start: toISO(d), end: toISO(startObj) });
    } else {
      onChange?.({ start: toISO(startObj), end: toISO(d) });
    }
    setHoverDate(null);
    setOpen(false);
  };

  const handleClear = (event) => {
    event.stopPropagation();
    onChange?.({ start: "", end: "" });
  };

  const goPrev = () => {
    const d = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };
  const goNext = () => {
    const d = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const cells = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const previewEnd = !endObj && hoverDate && startObj && hoverDate >= startObj ? hoverDate : endObj;
  const previewStart = !endObj && hoverDate && startObj && hoverDate < startObj ? hoverDate : startObj;

  const labelText = startDate && endDate
    ? `${formatUA(startDate)} – ${formatUA(endDate)}`
    : startDate
      ? `${formatUA(startDate)} – …`
      : "";

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-[42px] w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      >
        <CalendarIcon size={16} className="shrink-0 text-slate-500" />
        <span className={`flex-1 truncate ${labelText ? "" : "text-slate-400"}`}>{labelText || placeholder}</span>
        {labelText && (
          <span
            role="button"
            tabIndex={-1}
            onClick={handleClear}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Очистити"
          >
            <X size={14} />
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed z-[60] w-[300px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
          style={{ top: popoverPos.top, left: popoverPos.left }}
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="rounded-md p-1 text-slate-600 hover:bg-slate-100" onClick={goPrev}>
              <ChevronLeft size={16} />
            </button>
            <div className="text-sm font-semibold text-slate-800">
              {MONTH_NAMES_UA[viewMonth]} {viewYear}
            </div>
            <button type="button" className="rounded-md p-1 text-slate-600 hover:bg-slate-100" onClick={goNext}>
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold uppercase text-slate-400">
            {WEEKDAY_LABELS.map((w) => <div key={w}>{w}</div>)}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cell, idx) => {
              const inMonth = cell.getMonth() === viewMonth;
              const isStart = sameDay(cell, previewStart);
              const isEnd = sameDay(cell, previewEnd);
              const inRange = previewStart && previewEnd && cell > previewStart && cell < previewEnd;
              const today = sameDay(cell, new Date());

              let classes = "h-8 rounded-md text-xs transition ";
              if (!inMonth) classes += "text-slate-300 ";
              else classes += "text-slate-700 ";

              if (isStart || isEnd) classes += "bg-indigo-600 text-white font-semibold ";
              else if (inRange) classes += "bg-indigo-100 text-indigo-900 ";
              else classes += "hover:bg-slate-100 ";

              if (today && !isStart && !isEnd) classes += "ring-1 ring-indigo-300 ";

              return (
                <button
                  key={idx}
                  type="button"
                  className={classes}
                  onClick={() => handlePickDay(cell)}
                  onMouseEnter={() => setHoverDate(cell)}
                  onMouseLeave={() => setHoverDate(null)}
                >
                  {cell.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              {startDate && !endDate ? "Оберіть дату завершення" : startDate && endDate ? "Натисніть, щоб обрати інший діапазон" : "Оберіть дату початку"}
            </span>
            <button
              type="button"
              className="rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              onClick={() => onChange?.({ start: "", end: "" })}
            >
              Скинути
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
