import { describe, it, expect, beforeEach, vi } from "vitest";
import { readJsonFromStorage, writeJsonToStorage, removeStorageKey } from "./storage.js";

// Простий in-memory мок localStorage у глобальному window.
const createMemoryStorage = () => {
  let store = {};
  return {
    getItem: vi.fn((key) => (key in store ? store[key] : null)),
    setItem: vi.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    _dump: () => store,
  };
};

beforeEach(() => {
  const storage = createMemoryStorage();
  globalThis.window = { localStorage: storage };
});

describe("writeJsonToStorage / readJsonFromStorage", () => {
  it("зберігає й читає об'єкт назад", () => {
    writeJsonToStorage("k1", { a: 1, b: "два" });
    expect(readJsonFromStorage("k1", null)).toEqual({ a: 1, b: "два" });
  });

  it("повертає fallback за відсутності ключа", () => {
    expect(readJsonFromStorage("missing", "fb")).toBe("fb");
  });

  it("повертає fallback для пошкодженого JSON", () => {
    window.localStorage.setItem("bad", "{not json");
    expect(readJsonFromStorage("bad", "fb")).toBe("fb");
  });

  it("повертає fallback для null-значення в JSON", () => {
    writeJsonToStorage("nullish", null);
    expect(readJsonFromStorage("nullish", "fb")).toBe("fb");
  });

  it("нічого не робить без ключа", () => {
    expect(() => writeJsonToStorage("", { a: 1 })).not.toThrow();
    expect(readJsonFromStorage("", "fb")).toBe("fb");
  });
});

describe("removeStorageKey", () => {
  it("видаляє раніше збережений ключ", () => {
    writeJsonToStorage("k2", { x: 1 });
    expect(readJsonFromStorage("k2", null)).toEqual({ x: 1 });
    removeStorageKey("k2");
    expect(readJsonFromStorage("k2", "gone")).toBe("gone");
  });
});

describe("стійкість до відсутності window", () => {
  it("readJsonFromStorage повертає fallback без window", () => {
    const saved = globalThis.window;
    delete globalThis.window;
    expect(readJsonFromStorage("k", "fb")).toBe("fb");
    expect(() => writeJsonToStorage("k", 1)).not.toThrow();
    expect(() => removeStorageKey("k")).not.toThrow();
    globalThis.window = saved;
  });
});
