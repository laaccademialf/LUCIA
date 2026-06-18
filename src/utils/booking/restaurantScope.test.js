import { describe, it, expect } from "vitest";
import {
  normalizeComparableToken,
  sameRestaurant,
  collectRestaurantTokens,
  buildRestaurantLookupKey,
  hasRestaurantTokenOverlap,
  buildUserRestaurantTokens,
  isInventoryVisibleForUserRestaurant,
  findRestaurantByAnyReference,
  normalizeRestaurantScopedRecord,
  buildDerivedRestaurants,
} from "./restaurantScope.js";

describe("normalizeComparableToken / sameRestaurant", () => {
  it("нормалізує до нижнього регістру з тримом", () => {
    expect(normalizeComparableToken("  Ресторан  ")).toBe("ресторан");
    expect(normalizeComparableToken(null)).toBe("");
  });

  it("sameRestaurant порівнює без врахування регістру/пробілів", () => {
    expect(sameRestaurant(" ABC ", "abc")).toBe(true);
    expect(sameRestaurant("abc", "xyz")).toBe(false);
  });
});

describe("collectRestaurantTokens", () => {
  it("збирає всі ідентифікатори в Set", () => {
    const tokens = collectRestaurantTokens({ restaurantId: "10", name: "Лучія", code: "L1" });
    expect(tokens).toBeInstanceOf(Set);
    expect(tokens.has("10")).toBe(true);
    expect(tokens.has("лучія")).toBe(true);
    expect(tokens.has("l1")).toBe(true);
  });

  it("ігнорує порожні значення", () => {
    expect(collectRestaurantTokens({}).size).toBe(0);
  });
});

describe("buildRestaurantLookupKey", () => {
  it("дає стабільний відсортований ключ незалежно від порядку полів", () => {
    const a = buildRestaurantLookupKey({ id: "2", name: "Бета" });
    const b = buildRestaurantLookupKey({ name: "Бета", id: "2" });
    expect(a).toBe(b);
    expect(a).toContain("::");
  });
});

describe("hasRestaurantTokenOverlap", () => {
  it("true якщо є спільний токен", () => {
    expect(hasRestaurantTokenOverlap(new Set(["a", "b"]), new Set(["b", "c"]))).toBe(true);
  });
  it("false для порожніх або без перетину", () => {
    expect(hasRestaurantTokenOverlap(new Set(["a"]), new Set(["x"]))).toBe(false);
    expect(hasRestaurantTokenOverlap(new Set(), new Set(["x"]))).toBe(false);
    expect(hasRestaurantTokenOverlap(null, new Set(["x"]))).toBe(false);
  });
});

describe("buildUserRestaurantTokens", () => {
  it("розширює токени користувача даними знайденого ресторану", () => {
    const restaurants = [{ id: "5", name: "Лучія", regNumber: "RN5" }];
    const tokens = buildUserRestaurantTokens({ restaurantId: "5" }, restaurants);
    expect(tokens.has("5")).toBe(true);
    expect(tokens.has("лучія")).toBe(true);
    expect(tokens.has("rn5")).toBe(true);
  });

  it("повертає порожній Set без токенів користувача", () => {
    expect(buildUserRestaurantTokens({}, []).size).toBe(0);
  });
});

describe("isInventoryVisibleForUserRestaurant", () => {
  const restaurants = [{ id: "5", name: "Лучія" }];

  it("адмін бачить усе", () => {
    expect(isInventoryVisibleForUserRestaurant({ restaurantId: "999" }, {}, restaurants, true)).toBe(true);
  });

  it("видно інвентаризацію свого ресторану", () => {
    expect(
      isInventoryVisibleForUserRestaurant({ restaurantId: "5" }, { restaurantId: "5" }, restaurants, false)
    ).toBe(true);
  });

  it("не видно чужий ресторан", () => {
    expect(
      isInventoryVisibleForUserRestaurant({ restaurantId: "777" }, { restaurantId: "5" }, restaurants, false)
    ).toBe(false);
  });
});

describe("findRestaurantByAnyReference", () => {
  const restaurants = [
    { id: "1", name: "Альфа", regNumber: "RN1" },
    { id: "2", name: "Бета", code: "B2" },
  ];

  it("знаходить за будь-яким посиланням", () => {
    expect(findRestaurantByAnyReference(restaurants, ["RN1"])?.id).toBe("1");
    expect(findRestaurantByAnyReference(restaurants, ["бета"])?.id).toBe("2");
    expect(findRestaurantByAnyReference(restaurants, ["B2"])?.id).toBe("2");
  });

  it("null коли немає збігу або порожньо", () => {
    expect(findRestaurantByAnyReference(restaurants, ["немає"])).toBe(null);
    expect(findRestaurantByAnyReference([], ["RN1"])).toBe(null);
  });
});

describe("normalizeRestaurantScopedRecord", () => {
  const restaurants = [{ id: "1", name: "Альфа", regNumber: "RN1" }];

  it("доповнює канонічні поля ресторану", () => {
    const result = normalizeRestaurantScopedRecord({ restaurantId: "1", value: 10 }, restaurants);
    expect(result.restaurantName).toBe("Альфа");
    expect(result.restaurantRegNumber).toBe("RN1");
    expect(result.value).toBe(10);
  });

  it("повертає запис без змін, якщо ресторан не знайдено", () => {
    const record = { restaurantId: "999" };
    expect(normalizeRestaurantScopedRecord(record, restaurants)).toBe(record);
  });
});

describe("buildDerivedRestaurants", () => {
  it("будує унікальний відсортований список", () => {
    const records = [
      { restaurantId: "2", restaurantName: "Бета" },
      { restaurantId: "1", restaurantName: "Альфа" },
      { restaurantId: "1", restaurantName: "Альфа" },
    ];
    const result = buildDerivedRestaurants(records);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Альфа");
    expect(result[1].name).toBe("Бета");
  });

  it("ігнорує записи без ідентифікаторів", () => {
    expect(buildDerivedRestaurants([{}, null, { value: 1 }])).toEqual([]);
  });
});
