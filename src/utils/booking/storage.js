// Безпечні обгортки над localStorage для модуля замовлень.
// Стійкі до SSR (typeof window === "undefined") та винятків (quota/JSON).
// НЕ містять залежностей від React.

// Читає й парсить JSON зі сховища; повертає fallbackValue за відсутності/помилки.
export const readJsonFromStorage = (key, fallbackValue) => {
  if (typeof window === "undefined" || !key) return fallbackValue;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallbackValue;
    const parsed = JSON.parse(raw);
    return parsed ?? fallbackValue;
  } catch {
    return fallbackValue;
  }
};

// Серіалізує значення в JSON і зберігає; помилки сховища ігноруються.
export const writeJsonToStorage = (key, value) => {
  if (typeof window === "undefined" || !key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota/errors; save flow will still work online.
  }
};

// Видаляє ключ зі сховища; помилки ігноруються.
export const removeStorageKey = (key) => {
  if (typeof window === "undefined" || !key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage errors.
  }
};
