// Збережені ключі позначають КІНЕЦЬ інтервалу: 12:00:00 = 11:00–11:59.
// 24:00:00 зберігає останню годину тієї самої звітної дати.
export const SALES_HOURS = Array.from({ length: 24 }, (_, i) => `${String(i + 1).padStart(2, "0")}:00:00`);
export const DEFAULT_SALES_HOURS = SALES_HOURS.slice(7, 23);
export const salesNumber = (value) => {
  const n = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const hasValue = (value) => value !== "" && value !== null && value !== undefined;
const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export const sumSalesRows = (rows) => {
  const total = { planTo: 0, planGosti: 0, factTo: "", factGosti: "", factBillCount: 0, weather: "" };
  let missingBillCount = false;
  for (const row of rows) {
    for (const field of ["planTo", "planGosti", "factTo", "factGosti"]) {
      if (hasValue(row?.[field])) total[field] = salesNumber(total[field]) + salesNumber(row[field]);
    }
    if (hasValue(row?.factBillCount)) total.factBillCount += salesNumber(row.factBillCount);
    else if (salesNumber(row?.factTo) !== 0 || salesNumber(row?.factGosti) !== 0) missingBillCount = true;
    if (!total.weather && row?.weather) total.weather = row.weather;
  }
  total.planTo = money(total.planTo);
  if (hasValue(total.factTo)) total.factTo = money(total.factTo);
  if (missingBillCount) total.factBillCount = "";
  return total;
};

// У план/факті середній чек = оборот / гості. Для підсумків передаємо
// суми обороту й гостей, щоб години, дні та заклади мали правильну вагу.
export const factAverageCheck = (row) => hasValue(row?.factTo) && salesNumber(row?.factGosti) > 0
  ? salesNumber(row.factTo) / salesNumber(row.factGosti)
  : null;

export const groupServioSales = (rows) => {
  const groups = new Map();
  for (const row of rows) {
    const date = String(row.date || "").slice(0, 10);
    const hourTo = Number(row.hourTo ?? (Number(row.hourFrom) + 1));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(hourTo) || hourTo < 1 || hourTo > 24) {
      throw new Error("Servio повернув некоректну дату або годину");
    }
    const key = `${String(row.baseExternalId)}__${date}`;
    const hour = `${String(hourTo).padStart(2, "0")}:00:00`;
    if (!groups.has(key)) groups.set(key, {});
    const hours = groups.get(key);
    const previous = hours[hour] || { factTo: 0, factGosti: 0, factBillCount: 0, factChildCount: 0 };
    hours[hour] = {
      factTo: previous.factTo + salesNumber(row.totalSales),
      factGosti: previous.factGosti + salesNumber(row.guestCount),
      factBillCount: previous.factBillCount + salesNumber(row.billCount),
      factChildCount: previous.factChildCount + salesNumber(row.childCount),
    };
  }
  return groups;
};

// Один і той самий merge для ручного й нічного імпорту. Нуль є фактом,
// порожнє значення означає, що факт ще не завантажували.
export const mergeServioFactHours = (existingHours = {}, facts = {}) => {
  const result = {};
  for (const hour of new Set([...SALES_HOURS, ...Object.keys(existingHours), ...Object.keys(facts)])) {
    const fact = facts[hour];
    result[hour] = {
      planTo: "", planGosti: "", weather: "",
      ...existingHours[hour],
      factTo: String(money(salesNumber(fact?.factTo))),
      factGosti: String(salesNumber(fact?.factGosti)),
      factBillCount: String(salesNumber(fact?.factBillCount)),
      factChildCount: String(salesNumber(fact?.factChildCount)),
    };
  }
  return result;
};

export const hoursWithSales = (scheduledHours, hours = {}) => SALES_HOURS.filter((hour) =>
  scheduledHours.includes(hour) || ["planTo", "planGosti", "factTo", "factGosti", "factBillCount"].some((field) => salesNumber(hours[hour]?.[field]) !== 0)
);
