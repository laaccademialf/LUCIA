const num = (value) => Number(String(value ?? "").replace(",", ".")) || 0;
const FORECAST_FIELDS = ["py", "pm", "opPlan", "forecast", "factToDate"];

export const indexDashboardEnergy = (readings) => {
  const readingsByRestaurant = new Map();
  const mainsByRestaurantDate = new Map();
  for (const rec of readings) {
    const id = String(rec?.restaurantId || "");
    if (!readingsByRestaurant.has(id)) readingsByRestaurant.set(id, []);
    readingsByRestaurant.get(id).push(rec);
    const date = String(rec?.date || "").slice(0, 10);
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    let mains = 0;
    for (const meter of Array.isArray(rec?.meters) ? rec.meters : []) {
      const label = String(meter?.meterNumber || meter?.meterId || "");
      if (/генератор/i.test(label) || !/a\+/i.test(label)) continue;
      const value = Number(meter?.consumption ?? meter?.currValue);
      if (Number.isFinite(value)) mains += value;
    }
    if (!mainsByRestaurantDate.has(id)) mainsByRestaurantDate.set(id, new Map());
    const dates = mainsByRestaurantDate.get(id);
    dates.set(date, (dates.get(date) || 0) + mains);
  }
  return { readingsByRestaurant, mainsByRestaurantDate };
};

export const indexDashboardSales = (plans) => {
  const index = new Map();
  for (const plan of plans) {
    const key = `${String(plan?.restaurantId || "")}__${String(plan?.date || "").slice(0, 10)}`;
    if (index.has(key)) continue;
    let to = 0, gosti = 0, planTo = 0, planGosti = 0;
    for (const row of Object.values(plan?.hours || {})) {
      to += num(row?.factTo); gosti += num(row?.factGosti);
      planTo += num(row?.planTo); planGosti += num(row?.planGosti);
    }
    index.set(key, { ...plan, totals: { fact: { to, gosti }, plan: { to: planTo, gosti: planGosti } } });
  }
  return index;
};

// Групуємо лише вже дозволені/відфільтровані рядки. Довідник визначає назву
// напряму, а підсумки рахуються із сум; відсотки та середній чек не додаються.
export const groupDashboardRows = (rows, restaurants, kind) => {
  const businessById = new Map(restaurants.map((r) => [String(r.id), String(r.businessUnit || r.business_unit || "").trim() || "Без бізнес-напряму"]));
  const groups = new Map();
  for (const row of rows) {
    const name = businessById.get(String(row.id)) || "Без бізнес-напряму";
    if (!groups.has(name)) {
      const group = { id: `business:${name}`, name, isGroup: true, children: [], mains: 0, gen: 0, genHours: 0 };
      for (const key of FORECAST_FIELDS) group[key] = { to: 0, gosti: 0 };
      groups.set(name, group);
    }
    const group = groups.get(name);
    group.children.push(row);
    if (kind === "sales") {
      for (const key of FORECAST_FIELDS) {
        group[key].to += num(row[key]?.to);
        group[key].gosti += num(row[key]?.gosti);
      }
    } else {
      for (const key of ["mains", "gen", "genHours"]) group[key] += num(row[key]);
    }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "uk"));
};

export const visibleDashboardRows = (groups, expanded) => groups.flatMap((group) =>
  expanded.has(group.id) ? [group, ...group.children] : [group]
);
