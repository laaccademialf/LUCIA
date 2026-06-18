// Чисті утиліти роботи з графіком доставок постачальників та форматуванням дат.
// Винесені з ProductBookingModule.jsx для повторного використання й юніт-тестів.
// НЕ містять залежностей від React.

// Локальна копія toNumber (тривіальна, самодостатня — без ризику розбіжності).
const toNumber = (value) => {
  const normalized = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Форматує дату у вигляд ДД.ММ.РРРР (підтримує ISO YYYY-MM-DD без зсуву зони).
export const formatDateUk = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const shortMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (shortMatch) {
    return `${shortMatch[3]}.${shortMatch[2]}.${shortMatch[1]}`;
  }
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString("uk-UA");
  }
  return raw;
};

export const DELIVERY_WEEK_DAYS = [
  { id: "mon", label: "Пн" },
  { id: "tue", label: "Вт" },
  { id: "wed", label: "Ср" },
  { id: "thu", label: "Чт" },
  { id: "fri", label: "Пт" },
  { id: "sat", label: "Сб" },
  { id: "sun", label: "Нд" },
];

export const DELIVERY_WEEK_DAY_IDS = DELIVERY_WEEK_DAYS.map((day) => day.id);

export const DELIVERY_WEEK_DAY_INDEX = DELIVERY_WEEK_DAY_IDS.reduce((acc, dayId, index) => {
  acc[dayId] = index;
  return acc;
}, {});

// Повертає id дня тижня (mon..sun) для переданої дати (за замовчуванням — сьогодні).
export const getDeliveryWeekdayId = (date = new Date()) => {
  const jsDay = date.getDay(); // 0 = неділя ... 6 = субота
  return DELIVERY_WEEK_DAY_IDS[(jsDay + 6) % 7];
};

export const normalizeContractDeliverySchedule = (contract = {}) => {
  const deliveryDays = Array.isArray(contract?.deliveryDays)
    ? contract.deliveryDays.map((day) => String(day || "").trim()).filter(Boolean)
    : [];
  const scheduleRaw = contract?.deliverySchedule && typeof contract.deliverySchedule === "object" && !Array.isArray(contract.deliverySchedule)
    ? contract.deliverySchedule
    : {};

  const normalized = {};
  DELIVERY_WEEK_DAY_IDS.forEach((dayId) => {
    const included = deliveryDays.includes(dayId) || Object.prototype.hasOwnProperty.call(scheduleRaw, dayId);
    if (!included) return;
    const rawTime = String(scheduleRaw?.[dayId] || "").trim();
    normalized[dayId] = /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : "";
  });
  return normalized;
};

// Обчислює дні тижня, у які потрібно оформляти замовлення для контракту:
// день замовлення = день доставки − термін поставки (deliveryLeadDays), з переходом через тиждень.
// Напр.: доставка Чт+Нд, термін 1 день → замовлення Ср+Сб.
export const computeContractOrderWeekdays = (contract = {}) => {
  const schedule = normalizeContractDeliverySchedule(contract);
  const deliveryDayIds = Object.keys(schedule);
  if (deliveryDayIds.length === 0) return new Set();

  const leadDays = Math.max(0, Math.round(toNumber(contract?.deliveryLeadDays)));
  const orderDays = new Set();
  deliveryDayIds.forEach((dayId) => {
    const deliveryIndex = DELIVERY_WEEK_DAY_INDEX[dayId];
    if (deliveryIndex === undefined) return;
    const orderIndex = ((deliveryIndex - leadDays) % 7 + 7) % 7;
    orderDays.add(DELIVERY_WEEK_DAY_IDS[orderIndex]);
  });
  return orderDays;
};

// Дні тижня доставки для контракту (де реально привозять товар).
export const computeContractDeliveryWeekdays = (contract = {}) => {
  const schedule = normalizeContractDeliverySchedule(contract);
  return new Set(Object.keys(schedule));
};

// Форматує Date у локальний рядок YYYY-MM-DD (без зсуву часового поясу).
export const formatLocalIsoDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Обчислює найближчу дату доставки: від (сьогодні + термін поставки) шукаємо
// найближчий день, що входить у графік доставок постачальника.
export const computeNextDeliveryDate = (deliveryWeekdays, leadDays, fromDate = new Date()) => {
  if (!deliveryWeekdays || deliveryWeekdays.size === 0) return "";
  const lead = Math.max(0, Math.round(toNumber(leadDays)));
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  start.setDate(start.getDate() + lead);
  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(start);
    candidate.setDate(start.getDate() + offset);
    if (deliveryWeekdays.has(getDeliveryWeekdayId(candidate))) {
      return formatLocalIsoDate(candidate);
    }
  }
  return "";
};
