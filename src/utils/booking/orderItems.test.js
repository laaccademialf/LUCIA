import { describe, it, expect } from "vitest";
import { buildOrderItemKeys } from "./orderItems";

describe("buildOrderItemKeys", () => {
  it("повертає порожній масив для не-масиву", () => {
    expect(buildOrderItemKeys(null)).toEqual([]);
    expect(buildOrderItemKeys(undefined)).toEqual([]);
    expect(buildOrderItemKeys({})).toEqual([]);
  });

  it("використовує productId як ключ", () => {
    const keys = buildOrderItemKeys([{ productId: "p1" }, { productId: "p2" }]);
    expect(keys).toEqual(["p1", "p2"]);
  });

  it("повертається до code1C, потім до назви, потім до індексу", () => {
    const keys = buildOrderItemKeys([
      { code1C: "c1" },
      { productName: "Молоко" },
      {},
    ]);
    expect(keys).toEqual(["c1", "Молоко", "idx-2"]);
  });

  it("розрізняє повтори того самого товару лічильником", () => {
    const keys = buildOrderItemKeys([
      { productId: "p1" },
      { productId: "p1" },
      { productId: "p1" },
    ]);
    expect(keys).toEqual(["p1", "p1#1", "p1#2"]);
  });

  it("ключі стабільні при зміні порядку масиву (головна мета)", () => {
    const items = [{ productId: "a" }, { productId: "b" }, { productId: "c" }];
    const reordered = [items[2], items[0], items[1]];

    const keysOriginal = buildOrderItemKeys(items);
    const keysReordered = buildOrderItemKeys(reordered);

    // Ключ кожного товару не залежить від позиції в масиві.
    expect(keysOriginal[0]).toBe("a");
    expect(keysReordered[1]).toBe("a"); // той самий товар "a" після переупорядкування
    expect(keysReordered).toEqual(["c", "a", "b"]);
  });
});
