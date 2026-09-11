import { describe, expect, it } from "vitest";
import { groupDashboardRows, indexDashboardEnergy, indexDashboardSales, visibleDashboardRows } from "./dashboardData.js";

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
