import { describe, it, expect } from "vitest";
import {
  getInventoryEndedByLabel,
  getMergedFromIds,
  getMergedIntoId,
  getMergedSourceDocuments,
} from "./inventoryMerge.js";

describe("getInventoryEndedByLabel", () => {
  it("бере перше доступне поле (camel/snake)", () => {
    expect(getInventoryEndedByLabel({ inventorySessionEndedBy: "Іван" })).toBe("Іван");
    expect(getInventoryEndedByLabel({ inventory_session_ended_by: "Олена" })).toBe("Олена");
    expect(getInventoryEndedByLabel({ sessionEndedBy: "Петро" })).toBe("Петро");
  });

  it("повертає '-' за відсутності даних", () => {
    expect(getInventoryEndedByLabel({})).toBe("-");
    expect(getInventoryEndedByLabel(null)).toBe("-");
  });
});

describe("getMergedFromIds", () => {
  it("повертає масив як є", () => {
    expect(getMergedFromIds({ mergedFromIds: ["a", "b"] })).toEqual(["a", "b"]);
    expect(getMergedFromIds({ merged_from_ids: ["c"] })).toEqual(["c"]);
  });

  it("парсить JSON-масив із рядка", () => {
    expect(getMergedFromIds({ mergedFromIds: '["x","y"]' })).toEqual(["x", "y"]);
  });

  it("розбиває CSV-рядок при невалідному JSON", () => {
    expect(getMergedFromIds({ mergedFromIds: "a, b ,c" })).toEqual(["a", "b", "c"]);
  });

  it("повертає [] для порожніх/відсутніх значень", () => {
    expect(getMergedFromIds({})).toEqual([]);
    expect(getMergedFromIds({ mergedFromIds: "" })).toEqual([]);
    expect(getMergedFromIds(null)).toEqual([]);
  });
});

describe("getMergedIntoId", () => {
  it("повертає тримлений id або ''", () => {
    expect(getMergedIntoId({ mergedIntoId: " 42 " })).toBe("42");
    expect(getMergedIntoId({ merged_into_id: "7" })).toBe("7");
    expect(getMergedIntoId({})).toBe("");
  });
});

describe("getMergedSourceDocuments", () => {
  it("повертає масив або парсить JSON", () => {
    expect(getMergedSourceDocuments({ mergedSourceDocuments: [{ id: 1 }] })).toEqual([{ id: 1 }]);
    expect(getMergedSourceDocuments({ mergedSourceDocuments: '[{"id":2}]' })).toEqual([{ id: 2 }]);
  });

  it("повертає [] для невалідного JSON або порожнього", () => {
    expect(getMergedSourceDocuments({ mergedSourceDocuments: "{зламано" })).toEqual([]);
    expect(getMergedSourceDocuments({})).toEqual([]);
  });
});
