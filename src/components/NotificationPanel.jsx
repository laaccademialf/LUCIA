import React from "react";
import clsx from "clsx";

/**
 * NotificationPanel - простий popover для сповіщень
 * @param {Object} props
 * @param {boolean} props.open - чи відкрита панель
 * @param {function} props.onClose - функція закриття
 * @param {Array} props.notifications - масив сповіщень
 */
export default function NotificationPanel({ open, onClose, notifications = [] }) {
  if (!open) return null;
  return (
    <div className={clsx(
      // top-24 піднімає панель ще нижче навбару, z-[200] поверх усього
      "fixed z-[200] right-4 top-24 w-80 max-w-full bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-200",
      "animate-fade-in"
    )}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <span className="font-semibold text-lg">Сповіщення</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
          <span className="sr-only">Закрити</span>
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-slate-500 text-sm">Немає нових сповіщень</div>
        ) : (
          notifications.map((n, i) => (
            <div key={i} className="p-4 hover:bg-slate-50 cursor-pointer">
              <div className="font-medium">{n.title}</div>
              <div className="text-xs text-slate-500 mt-1">{n.time}</div>
              {n.body && <div className="text-sm mt-1">{n.body}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
