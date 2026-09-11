import { describe, expect, it } from "vitest";
import { buildDashboardSalesForecast, groupDashboardRows, indexDashboardEnergy, indexDashboardSales, visibleDashboardRows } from "./dashboardData.js";

const restaurants = [
  { id: "a", businessUnit: "Ресторан" },
  { id: "b", businessUnit: " Ресторан " },
  { id: "c", business_unit: "Кав’ярня" },
  { id: "d", businessUnit: " " },
];
const salesRow = (id, to, gosti) => ({
  id, name: id,
  ...Object.fromEntries(["py", "pm", "opPlan", "forecast", "factToDate"].map((key) => [key, { to, gosti }])),
});

describe("dashboard forecast date boundaries", () => {
  const doc = (date, factTo, planTo = 0, restaurantId = "a") => ({
    restaurantId, date,
    hours: { "12:00:00": { factTo, factGosti: factTo / 10, planTo, planGosti: planTo / 10 } },
  });
  const history = [
    doc("2026-09-01", 100), doc("2026-09-09", 200), doc("2026-09-10", 300),
    doc("2026-09-11", 9999, 50), doc("2026-09-30", 8888, 70),
    doc("2026-08-31", 400), doc("2025-09-30", 500), doc("2026-09-10", 99999, 0, "outside"),
  ];

  it("includes the selected final day and excludes later facts from the column and forecast", () => {
    const result = buildDashboardSalesForecast(indexDashboardSales(history), [restaurants[0]], "2026-09-01", "2026-09-10");
    expect(result.total.factToDate).toEqual({ to: 600, gosti: 60 });
    expect(result.total.forecast).toEqual({ to: 720, gosti: 72 });
    expect(result.perRestaurant[0].lastFactIso).toBe("2026-09-10");
    expect(result.total.pm.to).toBe(400);
    expect(result.total.py.to).toBe(500);
    expect(result.total.opPlan.to).toBe(120);
  });

  it("respects the start date while retaining the monthly forecast", () => {
    const index = indexDashboardSales(history);
    const result = buildDashboardSalesForecast(index, [restaurants[0]], "2026-09-09", "2026-09-10");
    expect(result.total.factToDate.to).toBe(500);
    expect(result.total.forecast.to).toBe(720);
    expect(buildDashboardSalesForecast(index, [restaurants[0]], "2026-09-10", "2026-09-10").total.factToDate.to).toBe(300);
  });

  it("handles cross-month ranges and correct comparison months on the 31st", () => {
    const result = buildDashboardSalesForecast(indexDashboardSales([
      doc("2026-03-31", 100), doc("2026-02-28", 200), doc("2025-03-31", 300),
    ]), [restaurants[0]], "2026-02-28", "2026-03-31");
    expect(result.total.factToDate.to).toBe(300);
    expect(result.total.pm.to).toBe(200);
    expect(result.total.py.to).toBe(300);
  });

  it("does not use future data when selected days have no facts", () => {
    const result = buildDashboardSalesForecast(indexDashboardSales([doc("2026-09-11", 999, 100)]), [restaurants[0]], "2026-09-01", "2026-09-10");
    expect(result.total.factToDate).toEqual({ to: 0, gosti: 0 });
    expect(result.total.forecast.to).toBe(100);
    expect(result.perRestaurant[0].lastFactIso).toBeNull();
  });

  it("carries the same cutoff through business direction and overall totals", () => {
    const result = buildDashboardSalesForecast(indexDashboardSales([
      ...history, doc("2026-09-10", 70, 0, "b"), doc("2026-09-11", 555, 0, "b"),
    ]), restaurants.slice(0, 2), "2026-09-01", "2026-09-10");
    const [group] = groupDashboardRows(result.perRestaurant, restaurants, "sales");
    expect(group.factToDate).toEqual({ to: 670, gosti: 67 });
    expect(group.factToDate).toEqual(result.total.factToDate);
  });
});

describe("dashboard business directions", () => {
  it("sums all forecast columns and retains the weights for average checks", () => {
    const groups = groupDashboardRows([salesRow("a", 100, 1), salesRow("b", 900, 3), salesRow("c", 50, 2)], restaurants, "sales");
    const group = groups.find((g) => g.name === "Ресторан");
    for (const key of ["py", "pm", "opPlan", "forecast", "factToDate"]) {
      expect(group[key]).toEqual({ to: 1000, gosti: 4 });
      expect(group[key].to / group[key].gosti).toBe(250);
    }
    expect(group.children.map((r) => r.id)).toEqual(["a", "b"]);
    expect(groups).toHaveLength(2);
  });

  it("uses restaurant management metadata and handles missing directions", () => {
    const rows = [salesRow("c", 10, 1), salesRow("d", 20, 2)];
    expect(groupDashboardRows(rows, restaurants, "sales").map((g) => g.name)).toEqual(["Без бізнес-напряму", "Кав’ярня"]);
    const changed = restaurants.map((r) => ({ ...r, businessUnit: "Новий напрям" }));
    expect(groupDashboardRows(rows, changed, "sales")).toHaveLength(1);
  });

  it("respects the supplied restaurant scope, including negative and zero-turnover values", () => {
    const [group] = groupDashboardRows([salesRow("b", "-10,5", 1), salesRow("a", 0, 3)], restaurants, "sales");
    expect(group.forecast).toEqual({ to: -10.5, gosti: 4 });
    expect(group.children).toHaveLength(2);
    expect(groupDashboardRows([], restaurants, "sales")).toEqual([]);
  });

  it("expands children without modifying group totals or including them twice", () => {
    const groups = groupDashboardRows([salesRow("a", 100, 1), salesRow("b", 200, 2)], restaurants, "sales");
    expect(visibleDashboardRows(groups, new Set())).toEqual(groups);
    expect(visibleDashboardRows(groups, new Set([groups[0].id])).map((r) => r.id)).toEqual([groups[0].id, "a", "b"]);
    expect(groups[0].forecast.to).toBe(300);
    expect(visibleDashboardRows(groups, new Set())).toHaveLength(1);
  });

  it("includes generator-only restaurants in energy subtotals", () => {
    const [group] = groupDashboardRows([
      { id: "a", mains: 10, gen: 0, genHours: 0 },
      { id: "b", mains: 0, gen: 5.5, genHours: 1.5 },
    ], restaurants, "energy");
    expect(group).toMatchObject({ mains: 10, gen: 5.5, genHours: 1.5 });
  });
});

describe("dashboard history indices", () => {
  it("aggregates daily sales once while retaining hourly data and first-record semantics", () => {
    const plan = { restaurantId: "a", date: "2026-09-10", hours: {
      "12:00:00": { factTo: "100,25", factGosti: 2, planTo: 150, planGosti: 3 },
      "13:00:00": { factTo: -10, factGosti: 1, planTo: 50, planGosti: 1 },
    } };
    const index = indexDashboardSales([plan, { ...plan, hours: {} }, { restaurantId: "b", date: plan.date }]);
    expect(index.get("a__2026-09-10")).toMatchObject({ totals: {
      fact: { to: 90.25, gosti: 3 }, plan: { to: 200, gosti: 4 },
    } });
    expect(index.get("a__2026-09-10").hours).toBe(plan.hours);
    expect(index.get("b__2026-09-10").totals.fact.to).toBe(0);
    expect(plan).not.toHaveProperty("totals");
  });

  it("indexes mains by restaurant/day, excluding generators and reactive readings", () => {
    const records = [
      { restaurantId: "a", date: "2026-09-10", meters: [
        { meterNumber: "Ввід A+", consumption: 10 },
        { meterNumber: "Ввід R+", consumption: 500 },
        { meterNumber: "Генератор: 1 A+", consumption: 50 },
        { meterNumber: "Ввід A+", consumption: "invalid" },
      ] },
      { restaurantId: "a", date: "2026-09-10T12:00:00", meters: [{ meterId: "2 A+", currValue: 5 }] },
      { restaurantId: "b", date: "2026-09-10", meters: [{ meterNumber: "A+", consumption: 30 }] },
    ];
    const index = indexDashboardEnergy(records);
    expect(index.readingsByRestaurant.get("a")).toEqual(records.slice(0, 2));
    expect(index.mainsByRestaurantDate.get("a").get("2026-09-10")).toBe(15);
    expect(index.mainsByRestaurantDate.get("b").get("2026-09-10")).toBe(30);
  });
});
