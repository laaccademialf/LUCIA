// Чисті утиліти для роботи з позиціями замовлення. Без залежностей від React.

// Будує стабільні ключі позицій замовлення на основі ідентичності товару
// (productId / code1C / назва) з лічильником повторів. Стійко до зміни порядку
// масиву items під час фонового оновлення даних — на відміну від ключів за
// індексом, які «перескакували» б на сусідню позицію після переупорядкування.
export const buildOrderItemKeys = (items) => {
  const seen = new Map();
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const base =
      String(item?.productId || item?.code1C || item?.productName || "").trim() || `idx-${index}`;
    const occurrence = seen.get(base) || 0;
    seen.set(base, occurrence + 1);
    return occurrence === 0 ? base : `${base}#${occurrence}`;
  });
};
