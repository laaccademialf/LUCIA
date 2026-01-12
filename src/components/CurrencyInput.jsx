import { forwardRef } from "react";

const CurrencyInput = forwardRef(({ label, error, ...props }, ref) => {
  const formatCurrency = (value) => {
    if (!value) return "";
    // Видаляємо всі нецифрові символи
    const numericValue = value.toString().replace(/\D/g, "");
    // Додаємо пробіли кожні 3 цифри з кінця
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };

  const handleChange = (e) => {
    const rawValue = e.target.value.replace(/\s/g, ""); // Видаляємо пробіли
    const formattedValue = formatCurrency(rawValue);
    e.target.value = formattedValue;
    if (props.onChange) {
      // Передаємо числове значення без пробілів
      const syntheticEvent = {
        ...e,
        target: {
          ...e.target,
          value: rawValue,
        },
      };
      props.onChange(syntheticEvent);
    }
  };

  const handleBlur = (e) => {
    if (props.onBlur) {
      props.onBlur(e);
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
        <input
          {...props}
          ref={ref}
          type="text"
          onChange={handleChange}
          onBlur={handleBlur}
          className={`
            w-full px-3 py-2 border rounded-lg
            ${error ? "border-red-500 focus:ring-red-500" : "border-slate-300 focus:ring-indigo-500"}
            focus:outline-none focus:ring-2 transition
          `}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">
          ₴
        </span>
      </div>
      {error && (
        <span className="text-xs text-red-600 mt-1 block">{error.message}</span>
      )}
    </div>
  );
});

CurrencyInput.displayName = "CurrencyInput";

export default CurrencyInput;
