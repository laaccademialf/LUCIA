import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchServioSales } from "./servioSettingsApi.js";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const response = (body) => ({ ok: true, json: async () => ({ ok: true, ...body }) });
const setup = (responses) => {
  vi.stubGlobal("window", { location: { origin: "http://test" } });
  const fetch = vi.fn();
  responses.forEach((body) => fetch.mockResolvedValueOnce(response(body)));
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

describe("клієнт фонового завантаження факту", () => {
  it("очікує завершення завдання короткими запитами", async () => {
    vi.useFakeTimers();
    const fetch = setup([{ status: "pending", jobId: "j1" }, { status: "pending", jobId: "j1" }, { status: "complete", rows: [{ totalSales: 100.25 }] }]);
    const result = fetchServioSales({ startDate: "2026-08-29", endDate: "2026-08-29", restCode: "106" });
    await vi.runAllTimersAsync();
    expect(await result).toEqual([{ totalSales: 100.25 }]);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ async: true, restCode: "106" });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ jobId: "j1" });
  });

  it("не перетворює серверну помилку чи невалідну відповідь на порожній звіт", async () => {
    setup([{ status: "failed", error: "SQL timeout" }, {}]);
    await expect(fetchServioSales()).rejects.toThrow("SQL timeout");
    await expect(fetchServioSales()).rejects.toThrow("некоректний результат");
  });

  it("підтримує попередній синхронний сервер і справжній порожній результат", async () => {
    setup([{ rows: [] }]);
    expect(await fetchServioSales()).toEqual([]);
  });
});
