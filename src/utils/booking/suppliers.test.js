import { describe, it, expect } from "vitest";
import {
  normalizeSupplierIdentity,
  getSupplierPortalEmails,
  resolveSupplierForUser,
  splitSupplierCandidates,
  supplierHasContractForRestaurant,
  resolveSupplierContractForRestaurant,
  getSupplierMinimumForRestaurant,
  buildProductRecommendationKey,
  parseSupplierRecommendations,
  supplierRecommendsForProductRestaurant,
  getSupplierDirectoryByName,
  resolveSupplierForRestaurantContext,
  buildSupplierPriceMap,
  summarizeSupplierResponses,
} from "./suppliers.js";

describe("normalizeSupplierIdentity", () => {
  it("lowercase + стиснені пробіли", () => {
    expect(normalizeSupplierIdentity("  ТОВ   Лучія  ")).toBe("тов лучія");
    expect(normalizeSupplierIdentity(null)).toBe("");
  });
});

describe("getSupplierPortalEmails", () => {
  it("збирає унікальні нормалізовані email", () => {
    const emails = getSupplierPortalEmails({
      portalEmails: ["A@x.com"],
      portalEmail: "a@x.com",
      contactEmail: "B@x.com",
      email: "c@x.com",
    });
    expect(emails).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
  });

  it("[] без email", () => {
    expect(getSupplierPortalEmails({})).toEqual([]);
  });
});

describe("resolveSupplierForUser", () => {
  const suppliers = [
    { name: "Альфа", email: "alpha@x.com" },
    { name: "Бета", portalEmails: ["beta@x.com"] },
  ];

  it("знаходить за email", () => {
    expect(resolveSupplierForUser({ email: "beta@x.com" }, suppliers)?.name).toBe("Бета");
  });

  it("знаходить за ім'ям, якщо email не збігся", () => {
    expect(resolveSupplierForUser({ displayName: "Альфа" }, suppliers)?.name).toBe("Альфа");
  });

  it("null коли нічого не знайдено", () => {
    expect(resolveSupplierForUser({ email: "none@x.com" }, suppliers)).toBe(null);
  });
});

describe("splitSupplierCandidates", () => {
  it("розбиває за роздільниками і дедуплікує", () => {
    expect(splitSupplierCandidates("А, Б; В | А")).toEqual(["А", "Б", "В"]);
  });
  it("[] для порожнього", () => {
    expect(splitSupplierCandidates("")).toEqual([]);
  });
});

describe("контракти під заклад", () => {
  const supplier = {
    contracts: [
      { restaurantId: "1", minimumOrderAmount: 500 },
      { restaurantId: "2", minimumOrderAmount: 800 },
    ],
  };

  it("supplierHasContractForRestaurant", () => {
    expect(supplierHasContractForRestaurant(supplier, { id: "1" })).toBe(true);
    expect(supplierHasContractForRestaurant(supplier, { id: "9" })).toBe(false);
    expect(supplierHasContractForRestaurant({}, { id: "1" })).toBe(false);
  });

  it("resolveSupplierContractForRestaurant повертає потрібний контракт", () => {
    expect(resolveSupplierContractForRestaurant(supplier, { id: "2" })?.minimumOrderAmount).toBe(800);
    expect(resolveSupplierContractForRestaurant(supplier, { id: "9" })).toBe(null);
  });

  it("getSupplierMinimumForRestaurant", () => {
    expect(getSupplierMinimumForRestaurant(supplier, { id: "1" })).toBe(500);
    expect(getSupplierMinimumForRestaurant(supplier, { id: "9" })).toBe(0);
  });
});

describe("рекомендації шефа", () => {
  it("buildProductRecommendationKey: code1C має пріоритет над назвою", () => {
    expect(buildProductRecommendationKey({ code1C: "ABC", name: "Молоко" })).toBe("abc");
    expect(buildProductRecommendationKey({ name: "Молоко" })).toBe("молоко");
    expect(buildProductRecommendationKey(null)).toBe("");
  });

  it("parseSupplierRecommendations: масив/JSON/інше", () => {
    expect(parseSupplierRecommendations({ productRecommendations: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(parseSupplierRecommendations({ productRecommendations: '[{"a":2}]' })).toEqual([{ a: 2 }]);
    expect(parseSupplierRecommendations({ productRecommendations: "ні" })).toEqual([]);
    expect(parseSupplierRecommendations({})).toEqual([]);
  });

  it("supplierRecommendsForProductRestaurant", () => {
    const supplier = {
      productRecommendations: [{ productKey: "abc", restaurantIds: ["1", "2"] }],
    };
    expect(supplierRecommendsForProductRestaurant(supplier, "abc", "1")).toBe(true);
    expect(supplierRecommendsForProductRestaurant(supplier, "abc", "9")).toBe(false);
    expect(supplierRecommendsForProductRestaurant(supplier, "", "1")).toBe(false);
  });
});

describe("getSupplierDirectoryByName", () => {
  it("будує мапу за нормалізованою назвою і кешує за посиланням", () => {
    const dir = [{ name: "Альфа" }, { name: "Бета" }];
    const map1 = getSupplierDirectoryByName(dir);
    const map2 = getSupplierDirectoryByName(dir);
    expect(map1).toBe(map2); // той самий кеш для того ж посилання
    expect(map1.get("альфа")?.name).toBe("Альфа");
  });

  it("порожня мапа для не-масиву", () => {
    expect(getSupplierDirectoryByName(null).size).toBe(0);
  });
});

describe("buildSupplierPriceMap", () => {
  it("будує мапу з whiteCards (мінімальна ціна)", () => {
    const product = {
      whiteCards: [
        { supplier: "Альфа", unitPrice: 100 },
        { supplier: "Альфа", unitPrice: 80 },
        { supplier: "Бета", unitPrice: 120 },
      ],
    };
    const map = buildSupplierPriceMap(product);
    expect(map.get("альфа")).toBe(80);
    expect(map.get("бета")).toBe(120);
  });

  it("фолбек на supplierList + unitPrice", () => {
    const product = { unitPrice: 50, supplierList: ["Альфа", "Бета"] };
    const map = buildSupplierPriceMap(product);
    expect(map.get("альфа")).toBe(50);
    expect(map.get("бета")).toBe(50);
  });
});

describe("resolveSupplierForRestaurantContext", () => {
  it("повертає єдиного кандидата без додаткової логіки", () => {
    expect(resolveSupplierForRestaurantContext("Альфа")).toBe("Альфа");
  });

  it("'' для порожнього", () => {
    expect(resolveSupplierForRestaurantContext("")).toBe("");
  });

  it("віддає пріоритет рекомендації шефа", () => {
    const directory = [
      { name: "Альфа" },
      { name: "Бета", productRecommendations: [{ productKey: "abc", restaurantIds: ["1"] }] },
    ];
    const result = resolveSupplierForRestaurantContext(
      "Альфа, Бета",
      { id: "1" },
      directory,
      { code1C: "ABC" },
      null
    );
    expect(result).toBe("Бета");
  });

  it("обирає найдешевшого серед контрактних", () => {
    const directory = [
      { name: "Альфа", contracts: [{ restaurantId: "1" }] },
      { name: "Бета", contracts: [{ restaurantId: "1" }] },
    ];
    const priceMap = new Map([
      ["альфа", 100],
      ["бета", 70],
    ]);
    const result = resolveSupplierForRestaurantContext(
      "Альфа, Бета",
      { id: "1" },
      directory,
      null,
      priceMap
    );
    expect(result).toBe("Бета");
  });
});

describe("summarizeSupplierResponses", () => {
  it("рахує статуси відповідей постачальника", () => {
    const order = {
      items: [
        { supplier: "Альфа", sentToSupplier: true },
        { supplier: "Альфа", sentToSupplier: true, supplierResponse: "accepted" },
        { supplier: "Бета", sentToSupplier: true },
        { supplier: "Альфа", sentToSupplier: false },
      ],
    };
    const summary = summarizeSupplierResponses(order, "Альфа");
    expect(summary.total).toBe(2);
    expect(summary.pending + summary.accepted + summary.partial + summary.unavailable).toBe(2);
  });

  it("порожня агрегація без позицій", () => {
    expect(summarizeSupplierResponses({ items: [] }, "Альфа").total).toBe(0);
  });
});
