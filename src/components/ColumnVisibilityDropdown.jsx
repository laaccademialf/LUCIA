import React, { useState, useRef, useEffect } from "react";

export default function ColumnVisibilityDropdown({ columns, visibleColumns, setVisibleColumns }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  const columnKeys = columns.map((col) => col.key).filter(Boolean);
  const selectedCount = columnKeys.filter((key) => visibleColumns.includes(key)).length;
  const isAllSelected = columnKeys.length > 0 && selectedCount === columnKeys.length;
  const isPartiallySelected = selectedCount > 0 && selectedCount < columnKeys.length;

  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  const handleToggle = (col) => {
    setVisibleColumns((prev) =>
      prev.includes(col) ? (prev.length > 1 ? prev.filter((c) => c !== col) : prev) : [...prev, col]
    );
  };

  return (
    <div className="relative inline-block text-left z-40" ref={ref}>
      <button
        type="button"
        className="inline-flex items-center px-2 py-1 border border-gray-300 bg-white rounded-md text-xs font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none"
        onClick={() => setOpen((v) => !v)}
      >
        Вибір колонок
        <svg className="ml-2 h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="origin-top-right absolute right-0 mt-2 w-64 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-[120] max-h-96 overflow-y-auto touch-manipulation">
          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                if (isAllSelected) {
                  // Не дозволяємо порожній набір колонок.
                  const safeFallback = columnKeys.includes("name")
                    ? ["name"]
                    : columnKeys.slice(0, 1);
                  setVisibleColumns(safeFallback);
                } else {
                  setVisibleColumns(columnKeys);
                }
              }}
              className="flex w-full items-center px-4 py-2.5 text-xs font-semibold text-gray-900 cursor-pointer border-b border-gray-100 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={isAllSelected}
                readOnly
                className="mr-2 h-4 w-4 pointer-events-none"
              />
              Всі
              {isPartiallySelected && !isAllSelected && (
                <span className="ml-2 text-[10px] text-slate-500">частково</span>
              )}
            </button>
            {columns.map((col) => {
              const isChecked = visibleColumns.includes(col.key);
              return (
              <button
                type="button"
                key={col.key}
                onClick={() => handleToggle(col.key)}
                className="flex w-full items-center px-4 py-2.5 text-xs text-gray-700 cursor-pointer hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  readOnly
                  className="mr-2 h-4 w-4 pointer-events-none"
                />
                {col.header}
              </button>
            );})}
          </div>
        </div>
      )}
    </div>
  );
}
