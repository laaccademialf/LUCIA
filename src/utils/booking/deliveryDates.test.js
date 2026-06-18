import { describe, it, expect } from "vitest";
import {
  formatDateUk,
  DELIVERY_WEEK_DAYS,
  DELIVERY_WEEK_DAY_IDS,
  DELIVERY_WEEK_DAY_INDEX,
  getDeliveryWeekdayId,
  normalizeContractDeliverySchedule,
  computeContractOrderWeekdays,
  computeContractDeliveryWeekdays,
  formatLocalIsoDate,
  computeNextDeliveryDate,
} from "./deliveryDates.js";

describe("formatDateUk", () => {
  it("повертає '-' для порожнього значення", () => {
    expect(formatDateUk("")).toBe("-");
    expect(formatDateUk(null)).toBe("-");
    expect(formatDateUk(undefined)).toBe("-");
  });

  it("конвертує ISO YYYY-MM-DD у ДД.ММ.РРРР без зсуву зони", () => {
    expect(formatDateUk("2026-06-18")).toBe("18.06.2026");
    expect(formatDateUk("2026-01-05")).toBe("05.01.2026");
  });

  it("повертає вихідний рядок, якщо дата нерозпізнавана", () => {
    expect(formatDateUk("не дата")).toBe("не дата");
  });
});

describe("структура днів тижня", () => {
  it("DELIVERY_WEEK_DAYS містить 7 днів від Пн до Нд", () => {
    expect(DELIVERY_WEEK_DAYS).toHaveLength(7);
    expect(DELIVERY_WEEK_DAY_IDS).toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
    expect(DELIVERY_WEEK_DAYS[0]).toEqual({ id: "mon", label: "Пн" });
    expect(DELIVERY_WEEK_DAYS[6]).toEqual({ id: "sun", label: "Нд" });
  });

  it("DELIVERY_WEEK_DAY_INDEX правильно мапить id у позицію", () => {
    expect(DELIVERY_WEEK_DAY_INDEX.mon).toBe(0);
    expect(DELIVERY_WEEK_DAY_INDEX.thu).toBe(3);
    expect(DELIVERY_WEEK_DAY_INDEX.sun).toBe(6);
  });
});

describe("getDeliveryWeekdayId", () => {
  it("повертає правильний id для конкретних дат", () => {
    // 2026-06-15 — понеділок
    expect(getDeliveryWeekdayId(new Date(2026, 5, 15))).toBe("mon");
    // 2026-06-18 — четвер
    expect(getDeliveryWeekdayId(new Date(2026, 5, 18))).toBe("thu");
    // 2026-06-21 — неділя
    expect(getDeliveryWeekdayId(new Date(2026, 5, 21))).toBe("sun");
  });
});

describe("normalizeContractDeliverySchedule", () => {
  it("повертає порожній об'єкт за відсутності розкладу", () => {
    expect(normalizeContractDeliverySchedule({})).toEqual({});
    expect(normalizeContractDeliverySchedule()).toEqual({});
  });

  it("формує розклад з масиву deliveryDays", () => {
    const result = normalizeContractDeliverySchedule({ deliveryDays: ["mon", "thu"] });
    expect(Object.keys(result).sort()).toEqual(["mon", "thu"]);
    expect(result.mon).toBe("");
    expect(result.thu).toBe("");
  });

  it("бере час з deliverySchedule, якщо валідний", () => {
    const result = normalizeContractDeliverySchedule({
      deliverySchedule: { wed: "09:30", fri: "bad" },
    });
    expect(result.wed).toBe("09:30");
    expect(result.fri).toBe("");
  });
});

describe("computeContractDeliveryWeekdays", () => {
  it("повертає Set днів доставки", () => {
    const set = computeContractDeliveryWeekdays({ deliveryDays: ["thu", "sun"] });
    expect(set).toBeInstanceOf(Set);
    expect([...set].sort()).toEqual(["sun", "thu"]);
  });
});

describe("computeContractOrderWeekdays", () => {
  it("без графіка повертає порожній Set", () => {
    expect(computeContractOrderWeekdays({}).size).toBe(0);
  });

  it("доставка Чт+Нд, термін 1 день → замовлення Ср+Сб", () => {
    const set = computeContractOrderWeekdays({
      deliveryDays: ["thu", "sun"],
      deliveryLeadDays: 1,
    });
    expect([...set].sort()).toEqual(["sat", "wed"]);
  });

  it("термін 0 днів → день замовлення = день доставки", () => {
    const set = computeContractOrderWeekdays({
      deliveryDays: ["mon"],
      deliveryLeadDays: 0,
    });
    expect([...set]).toEqual(["mon"]);
  });

  it("перехід через початок тижня: доставка Пн, термін 2 → замовлення Сб", () => {
    const set = computeContractOrderWeekdays({
      deliveryDays: ["mon"],
      deliveryLeadDays: 2,
    });
    expect([...set]).toEqual(["sat"]);
  });
});

describe("formatLocalIsoDate", () => {
  it("форматує Date у YYYY-MM-DD без зсуву зони", () => {
    expect(formatLocalIsoDate(new Date(2026, 5, 18))).toBe("2026-06-18");
    expect(formatLocalIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("computeNextDeliveryDate", () => {
  it("повертає '' за відсутності днів доставки", () => {
    expect(computeNextDeliveryDate(new Set(), 0, new Date(2026, 5, 15))).toBe("");
    expect(computeNextDeliveryDate(null, 0)).toBe("");
  });

  it("знаходить найближчий день доставки з урахуванням терміну", () => {
    // Понеділок 2026-06-15, доставка по четвергах, термін 0 → найближчий Чт 2026-06-18
    const result = computeNextDeliveryDate(new Set(["thu"]), 0, new Date(2026, 5, 15));
    expect(result).toBe("2026-06-18");
  });

  it("враховує термін поставки (lead days) при старті відліку", () => {
    // Понеділок, доставка по вівторках, термін 2 дні → старт зі Ср, найближчий Вт = наступний тиждень 2026-06-23
    const result = computeNextDeliveryDate(new Set(["tue"]), 2, new Date(2026, 5, 15));
    expect(result).toBe("2026-06-23");
  });

  it("якщо сьогодні день доставки і термін 0 — повертає сьогодні", () => {
    // Четвер 2026-06-18, доставка по четвергах, термін 0
    const result = computeNextDeliveryDate(new Set(["thu"]), 0, new Date(2026, 5, 18));
    expect(result).toBe("2026-06-18");
  });
});
