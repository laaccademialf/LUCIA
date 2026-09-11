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
  it("рахує середній чек за кількістю чеків, зважено по всіх годинах та закладах", () => {
    const total = sumSalesRows([{ factTo: "100", factGosti: "10", factBillCount: "2" }, { factTo: "900", factGosti: "20", factBillCount: "3" }]);
    expect(total.factGosti).toBe(30);
    expect(factAverageCheck(total)).toBe(200);
  });

  it("не видає старі дані без кількості чеків за достовірний середній чек", () => {
    const total = sumSalesRows([{ factTo: "100", factGosti: "5" }, { factTo: "900", factBillCount: "3" }]);
    expect(factAverageCheck(total)).toBeNull();
    expect(factAverageCheck(sumSalesRows([total]))).toBeNull();
  });

  it("розрізняє відсутній факт і підтверджений нуль", () => {
    expect(sumSalesRows([{ planTo: "500", factTo: "" }]).factTo).toBe("");
    expect(sumSalesRows([{ planTo: "500", factTo: "0" }]).factTo).toBe(0);
  });
});
