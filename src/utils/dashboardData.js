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

const monthDates = (iso, offset = 0) => {
  const [year, month] = iso.split("-").map(Number);
  // Зсуваємо перший день місяця: 31 березня має порівнюватись із лютим.
  const start = new Date(Date.UTC(year, month - 1 + offset, 1));
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  const prefix = start.toISOString().slice(0, 7);
  return Array.from({ length: lastDay }, (_, day) => `${prefix}-${String(day + 1).padStart(2, "0")}`);
};

export const buildDashboardSalesForecast = (index, restaurants, fromIso, toIso) => {
  const curDates = monthDates(toIso);
  const pyDates = monthDates(toIso, -12);
  const pmDates = monthDates(toIso, -1);
  const selectedDates = [];
  const cursor = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  while (cursor <= end && selectedDates.length < 3660) {
    selectedDates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  // Прогноз залишається місячним, але не використовує факт після дати фільтра.
  const monthFactDates = curDates.filter((iso) => iso <= toIso);
  const sumMetric = (rid, dates, kind) => dates.reduce((total, iso) => {
    const pair = index.get(`${rid}__${iso}`)?.totals[kind];
    total.to += pair?.to || 0;
    total.gosti += pair?.gosti || 0;
    return total;
  }, { to: 0, gosti: 0 });

  const perRestaurant = restaurants.map((r) => {
    const factDates = monthFactDates.filter((iso) => {
      const pair = index.get(`${r.id}__${iso}`)?.totals.fact;
      return pair && (pair.to !== 0 || pair.gosti !== 0);
    });
    const lastFactIso = factDates.at(-1) || null;
    const monthFact = sumMetric(r.id, monthFactDates, "fact");
    const remainingDates = curDates.filter((iso) => !lastFactIso || iso > lastFactIso);
    const remainingPlan = sumMetric(r.id, remainingDates, "plan");
    return {
      id: r.id,
      name: r.name || r.regNumber || "—",
      opPlan: sumMetric(r.id, curDates, "plan"),
      py: sumMetric(r.id, pyDates, "fact"),
      pm: sumMetric(r.id, pmDates, "fact"),
      // Остання колонка відповідає ОБОМ межам періоду, включно з кінцевим днем.
      factToDate: sumMetric(r.id, selectedDates, "fact"),
      forecast: { to: monthFact.to + remainingPlan.to, gosti: monthFact.gosti + remainingPlan.gosti },
      lastFactIso,
    };
  });
  const total = Object.fromEntries(FORECAST_FIELDS.map((field) => [field, perRestaurant.reduce(
    (sum, row) => ({ to: sum.to + row[field].to, gosti: sum.gosti + row[field].gosti }),
    { to: 0, gosti: 0 }
  )]));
  return { fromIso, toIso, perRestaurant, total };
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
