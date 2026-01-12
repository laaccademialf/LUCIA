import { forwardRef, useState, useEffect } from "react";
import { X } from "lucide-react";

const MultiSelect = forwardRef(({ label, options = [], value, onChange, disabled, ...props }, ref) => {
  const [selectedItems, setSelectedItems] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Ініціалізуємо вибрані елементи з value
    if (value) {
      const items = typeof value === 'string' ? value.split(', ') : [];
      setSelectedItems(items.filter(item => item));
    }
  }, [value]);

  const handleToggleItem = (item) => {
    let newItems;
    if (selectedItems.includes(item)) {
      newItems = selectedItems.filter(i => i !== item);
    } else {
      newItems = [...selectedItems, item];
    }
    setSelectedItems(newItems);
    
    // Оновлюємо значення як рядок, розділений комами
    if (onChange) {
      onChange({
        target: {
          value: newItems.join(', '),
        },
      });
    }
  };

  const handleRemoveItem = (item, e) => {
    e.stopPropagation();
    const newItems = selectedItems.filter(i => i !== item);
    setSelectedItems(newItems);
    
    if (onChange) {
      onChange({
        target: {
          value: newItems.join(', '),
        },
      });
    }
  };

  return (
    <div className="form-group">
      {label && (
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <div
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={`
            w-full min-h-[42px] px-3 py-2 border rounded-lg
            ${disabled ? 'bg-slate-100 cursor-not-allowed' : 'bg-white cursor-pointer'}
            border-slate-300 focus-within:ring-2 focus-within:ring-indigo-500
            transition flex flex-wrap gap-1 items-center
          `}
        >
          {selectedItems.length === 0 ? (
            <span className="text-slate-400 text-sm">
              {disabled ? 'Спочатку оберіть центр відповідальності' : 'Оберіть особу/осіб'}
            </span>
          ) : (
            selectedItems.map((item, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-sm"
              >
                {item}
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => handleRemoveItem(item, e)}
                    className="hover:text-indigo-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </span>
            ))
          )}
        </div>

        {isOpen && !disabled && options.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-auto">
            {options.map((option, index) => (
              <div
                key={index}
                onClick={() => handleToggleItem(option)}
                className={`
                  px-3 py-2 cursor-pointer hover:bg-indigo-50 transition
                  ${selectedItems.includes(option) ? 'bg-indigo-100 text-indigo-800' : ''}
                `}
              >
                <input
                  type="checkbox"
                  checked={selectedItems.includes(option)}
                  onChange={() => {}}
                  className="mr-2"
                />
                {option}
              </div>
            ))}
          </div>
        )}

        {isOpen && !disabled && options.length === 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg p-3 text-center text-slate-500 text-sm">
            Немає доступних варіантів
          </div>
        )}
      </div>

      {/* Приховане поле для react-hook-form */}
      <input
        {...props}
        ref={ref}
        type="hidden"
        value={selectedItems.join(', ')}
      />
    </div>
  );
});

MultiSelect.displayName = "MultiSelect";

export default MultiSelect;
