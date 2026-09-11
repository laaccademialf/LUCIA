import { describe, expect, it } from "vitest";
import { groupServioSales, mergeServioFactHours, sumSalesRows, factAverageCheck, hoursWithSales } from "./salesFacts.js";

const row = (overrides = {}) => ({ date: "2026-08-29", baseExternalId: 106, hourFrom: 11, hourTo: 12, totalSales: 100.25, guestCount: 3, billCount: 2, childCount: 1, ...overrides });

describe("імпорт факту Servio", () => {
  it("відображає 11:00–11:59 під ключем 12:00:00, додає групи чеків та зберігає копійки", () => {
    const groups = groupServioSales([row(), row({ totalSales: 20.30, billCount: 1, guestCount: 2 })]);
    const hours = mergeServioFactHours({}, groups.get("106__2026-08-29"));
    expect(hours["12:00:00"]).toMatchObject({ factTo: "120.55", factGosti: "5", factBillCount: "3", factChildCount: "2" });
    expect(hours["11:00:00"].factTo).toBe("0");
    expect(sumSalesRows(Object.values(hours)).factTo).toBe(120.55);
  });

  it("розділяє ресторани та звітні дати, включно з останньою годиною доби", () => {
    const groups = groupServioSales([row(), row({ baseExternalId: 107 }), row({ date: "2026-08-30", hourFrom: 23, hourTo: 24 })]);
    expect(groups.size).toBe(3);
    const hours = mergeServioFactHours({}, groups.get("106__2026-08-30"));
    expect(hours["24:00:00"].factTo).toBe("100.25");
    expect(hoursWithSales(["12:00:00"], hours)).toEqual(["12:00:00", "24:00:00"]);
  });

  it("повторний імпорт оновлює факт, зберігає план і погоду та обнуляє старі години", () => {
    const existing = { "12:00:00": { planTo: "500", planGosti: "7", weather: "Сонячно", factTo: "999" }, "13:00:00": { factTo: "500" } };
    const facts = groupServioSales([row()]).get("106__2026-08-29");
    const hours = mergeServioFactHours(existing, facts);
    expect(hours["12:00:00"]).toMatchObject({ planTo: "500", planGosti: "7", weather: "Сонячно", factTo: "100.25" });
    expect(hours["13:00:00"].factTo).toBe("0");
    expect(mergeServioFactHours(hours, facts)).toEqual(hours);
  });

  it("не маскує некоректну годину порожнім імпортом", () => {
    expect(() => groupServioSales([row({ hourTo: 25 })])).toThrow();
  });
});

describe("підсумки план/факт", () => {
  it("ділить оборот на гостей, зважено по всіх годинах, днях та закладах", () => {
    const rows = [{ factTo: "100", factGosti: "10", factBillCount: "2" }, { factTo: "900", factGosti: "20", factBillCount: "3" }];
    const total = sumSalesRows(rows);
    expect(total.factGosti).toBe(30);
    expect(factAverageCheck(rows[0])).toBe(10);
    expect(factAverageCheck(total)).toBeCloseTo(1000 / 30);
    expect(factAverageCheck(sumSalesRows(rows.map((r) => sumSalesRows([r]))))).toBeCloseTo(1000 / 30);
  });

  it("рахує старі та вручну введені дані без кількості чеків", () => {
    const total = sumSalesRows([{ factTo: "100", factGosti: "5" }, { factTo: "900", factGosti: "15", factBillCount: "3" }]);
    expect(factAverageCheck(total)).toBe(50);
    expect(factAverageCheck(sumSalesRows([total]))).toBe(50);
  });

  it("виправляє місячний підсумок зі звіту: 6 083 350 / 3 715", () => {
    const average = factAverageCheck({ factTo: "6083350", factGosti: "3715", factBillCount: "2388" });
    expect(average).toBeCloseTo(1637.510094);
    expect(Math.round(average)).toBe(1638);
    expect(factAverageCheck({ factTo: "100,25", factGosti: "2" })).toBe(50.125);
  });

  it("показує відсутнє значення без гостей або обороту, але зберігає підтверджений нуль", () => {
    for (const factGosti of [0, "", null, undefined]) {
      expect(factAverageCheck({ factTo: "100", factGosti, factBillCount: "2" })).toBeNull();
    }
    expect(factAverageCheck({ factTo: "", factGosti: "2" })).toBeNull();
    expect(factAverageCheck({ factTo: "0", factGosti: "2" })).toBe(0);
  });

  it("розрізняє відсутній факт і підтверджений нуль", () => {
    expect(sumSalesRows([{ planTo: "500", factTo: "" }]).factTo).toBe("");
    expect(sumSalesRows([{ planTo: "500", factTo: "0" }]).factTo).toBe(0);
  });
});
