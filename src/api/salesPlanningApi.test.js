import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCollectionItemApi } from "./collectionsApi.js";
import { loadSalesPlanDays } from "./salesPlanningApi.js";

vi.mock("./collectionsApi.js", () => ({ getCollectionItemApi: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
const dates = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
const restaurantIds = Array.from({ length: 15 }, (_, i) => String(i + 1));

describe("завантаження великих періодів продажів", () => {
  it("завантажує всі 450 документів максимум шістьма запитами одночасно", async () => {
    let active = 0;
    let peak = 0;
    getCollectionItemApi.mockImplementation(async (_, id) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active--;
      return { hours: { "12:00:00": { factTo: id } } };
    });
    const result = await loadSalesPlanDays({ restaurantIds, dates });
    expect(Object.keys(result)).toHaveLength(450);
    expect(result["15__2026-09-30"]["12:00:00"].factTo).toBe("15__2026-09-30");
    expect(peak).toBe(6);
  });

  it("після зміни фільтра не запускає решту старої черги", async () => {
    const controller = new AbortController();
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    getCollectionItemApi.mockImplementation(() => pending);
    const result = loadSalesPlanDays({ restaurantIds, dates, signal: controller.signal });
    expect(getCollectionItemApi).toHaveBeenCalledTimes(6);
    controller.abort();
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    release({ hours: {} });
    await rejected;
    expect(getCollectionItemApi).toHaveBeenCalledTimes(6);
  });

  it("зупиняє чергу при помилці без підміни даних порожнім звітом", async () => {
    getCollectionItemApi.mockRejectedValue(new Error("HTTP 500"));
    await expect(loadSalesPlanDays({ restaurantIds, dates })).rejects.toThrow("HTTP 500");
    expect(getCollectionItemApi).toHaveBeenCalledTimes(6);
  });
});
