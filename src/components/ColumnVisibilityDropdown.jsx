import React, { useState, useRef, useEffect } from "react";

export default function ColumnVisibilityDropdown({ columns, visibleColumns, setVisibleColumns }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const allCheckboxRef = useRef(null);

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
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!allCheckboxRef.current) return;
    allCheckboxRef.current.indeterminate = isPartiallySelected;
  }, [isPartiallySelected]);

  const handleToggle = (col) => {
    setVisibleColumns((prev) =>
      prev.includes(col) ? (prev.length > 1 ? prev.filter((c) => c !== col) : prev) : [...prev, col]
    );
  };

  return (
    <div className="relative inline-block text-left" ref={ref}>
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
        <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10 max-h-96 overflow-y-auto">
          <div className="py-1">
            {/* Чекбокс "Всі" */}
            <label className="flex items-center px-4 py-2 text-xs font-semibold text-gray-900 cursor-pointer border-b border-gray-100">
              <input
                ref={allCheckboxRef}
                type="checkbox"
                checked={isAllSelected}
                onChange={() => {
                  if (isAllSelected) {
                    // Не дозволяємо порожній набір колонок.
                    setVisibleColumns(columnKeys.slice(0, 1));
                  } else {
                    setVisibleColumns(columnKeys);
                  }
                }}
                className="mr-2"
              />
              Всі
            </label>
            {columns.map((col) => (
              <label key={col.key} className="flex items-center px-4 py-2 text-xs text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(col.key)}
                  onChange={() => handleToggle(col.key)}
                  className="mr-2"
                />
                {col.header}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
