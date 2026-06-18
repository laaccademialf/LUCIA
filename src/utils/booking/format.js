// Чисті утиліти форматування/парсингу для модуля замовлень.
// Винесені з ProductBookingModule.jsx для повторного використання й юніт-тестів.
// НЕ містять залежностей від React.

// Безпечне приведення до числа: підтримує кому як десятковий роздільник
// і пробіли-роздільники тисяч. Повертає 0 для нечислових значень.
export const toNumber = (value) => {
  const normalized = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Форматує суму у вигляді "1234.56 грн".
export const formatMoney = (value) => `${toNumber(value).toFixed(2)} грн`;

// Формує текст помилки з опціональним повідомленням від винятку.
export const getErrorMessage = (error, fallbackMessage) => {
  const message = String(error?.message || error || "").trim();
  return message ? `${fallbackMessage}\n\n${message}` : fallbackMessage;
};

// Нормалізує назву продукту для нечіткого порівняння:
// нижній регістр, прибирання дужок та пунктуації, стиснення пробілів.
export const normalizeProductIdentity = (value) => {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
};

// Дата+час у локальному форматі uk-UA (повний). "-" для порожнього.
export const formatDateTimeSafe = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleString("uk-UA");
  }
  return raw;
};

// Дата+час у компактному форматі ДД.ММ.РРРР ГГ:ХХ (без секунд, 24г).
export const formatDateTimeCompact = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleString("uk-UA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return raw;
};

// Витягує дату створення замовлення з можливих варіантів полів.
export const resolveOrderCreatedAt = (order) => {
  if (!order || typeof order !== "object") return "";
  return String(
    order.createdAt ||
    order.created_at ||
    order.submittedAt ||
    order.updatedAt ||
    order.updated_at ||
    ""
  ).trim();
};
