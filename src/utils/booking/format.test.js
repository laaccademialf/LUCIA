import { describe, it, expect } from "vitest";
import {
  toNumber,
  formatMoney,
  getErrorMessage,
  normalizeProductIdentity,
  formatDateTimeSafe,
  formatDateTimeCompact,
  resolveOrderCreatedAt,
} from "./format.js";

describe("toNumber", () => {
  it("парсить звичайні числа й рядки", () => {
    expect(toNumber(5)).toBe(5);
    expect(toNumber("12")).toBe(12);
    expect(toNumber("12.5")).toBe(12.5);
  });

  it("підтримує кому як десятковий роздільник", () => {
    expect(toNumber("12,5")).toBe(12.5);
    expect(toNumber("1 234,75")).toBe(1234.75);
  });

  it("ігнорує пробіли-роздільники тисяч", () => {
    expect(toNumber("1 000")).toBe(1000);
  });

  it("повертає 0 для нечислових / порожніх значень", () => {
    expect(toNumber("")).toBe(0);
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber("abc")).toBe(0);
  });
});

describe("formatMoney", () => {
  it("форматує суму з двома знаками й 'грн'", () => {
    expect(formatMoney(0)).toBe("0.00 грн");
    expect(formatMoney("12,5")).toBe("12.50 грн");
    expect(formatMoney(1234.567)).toBe("1234.57 грн");
  });
});

describe("getErrorMessage", () => {
  it("повертає лише fallback за відсутності деталей", () => {
    expect(getErrorMessage(null, "Сталася помилка")).toBe("Сталася помилка");
    expect(getErrorMessage(undefined, "Сталася помилка")).toBe("Сталася помилка");
    expect(getErrorMessage("", "Сталася помилка")).toBe("Сталася помилка");
  });

  it("додає повідомлення помилки до fallback", () => {
    expect(getErrorMessage(new Error("збій мережі"), "Сталася помилка")).toBe(
      "Сталася помилка\n\nзбій мережі"
    );
    expect(getErrorMessage("текст", "Сталася помилка")).toBe("Сталася помилка\n\nтекст");
  });
});

describe("normalizeProductIdentity", () => {
  it("приводить до нижнього регістру й прибирає пунктуацію", () => {
    expect(normalizeProductIdentity("Молоко 2.5%")).toBe("молоко 2 5");
  });

  it("прибирає вміст дужок", () => {
    expect(normalizeProductIdentity("Сир (твердий)")).toBe("сир");
  });

  it("стискає пробіли й тримить", () => {
    expect(normalizeProductIdentity("  Хліб   білий  ")).toBe("хліб білий");
  });

  it("повертає порожній рядок для порожнього входу", () => {
    expect(normalizeProductIdentity("")).toBe("");
    expect(normalizeProductIdentity(null)).toBe("");
  });
});

describe("formatDateTimeSafe / formatDateTimeCompact", () => {
  it("повертають '-' для порожнього значення", () => {
    expect(formatDateTimeSafe("")).toBe("-");
    expect(formatDateTimeCompact(null)).toBe("-");
  });

  it("повертають вихідний рядок для нерозпізнаваної дати", () => {
    expect(formatDateTimeSafe("не дата")).toBe("не дата");
    expect(formatDateTimeCompact("не дата")).toBe("не дата");
  });

  it("компактний формат дає ДД.ММ.РРРР, ГГ:ХХ", () => {
    const result = formatDateTimeCompact("2026-06-18T09:05:00");
    expect(result).toMatch(/18\.06\.2026/);
    expect(result).toMatch(/09:05/);
    expect(result).not.toMatch(/:00$/);
  });
});

describe("resolveOrderCreatedAt", () => {
  it("повертає '' для невалідного входу", () => {
    expect(resolveOrderCreatedAt(null)).toBe("");
    expect(resolveOrderCreatedAt("рядок")).toBe("");
    expect(resolveOrderCreatedAt({})).toBe("");
  });

  it("бере перше доступне поле дати у пріоритетному порядку", () => {
    expect(resolveOrderCreatedAt({ createdAt: "2026-06-01" })).toBe("2026-06-01");
    expect(resolveOrderCreatedAt({ created_at: "2026-06-02" })).toBe("2026-06-02");
    expect(resolveOrderCreatedAt({ submittedAt: "2026-06-03" })).toBe("2026-06-03");
    expect(
      resolveOrderCreatedAt({ createdAt: "2026-06-01", updatedAt: "2026-06-05" })
    ).toBe("2026-06-01");
  });
});
