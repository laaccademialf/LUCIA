import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ config: null, params: {}, query: vi.fn(), close: vi.fn(), connect: vi.fn() }));
vi.mock("mssql", () => ({ default: {
  DateTime: "datetime", MAX: -1, NVarChar: () => "nvarchar",
  ConnectionPool: class {
    constructor(config) { mock.config = config; }
    connect() { return mock.connect(); }
    close() { return mock.close(); }
    request() {
      return { input(name, type, value) { mock.params[name] = value; }, query: mock.query };
    }
  },
} }));
import { fetchServioHourlySales } from "./servioApi.js";
const config = { host: "test", user: "test", password: "test" };

beforeEach(() => { vi.clearAllMocks(); mock.params = {}; });

describe("контракт SQL Servio", () => {
  it("передає дати без зміщення часу і всі поля ручного звіту", async () => {
    mock.query.mockResolvedValue({ recordset: [{ ReportDate: "2026-08-29", BillClosedDate: "2026-08-29", BaseExternalID: 106, BaseExternalName: "Кувшин", HourFrom: 11, HourTo: 12, BillCount: 2, TotalSales: 100.25, GuestCount: 5, ChildCount: 1, AverageBill: 50.125 }] });
    const rows = await fetchServioHourlySales({ startDate: "20260829", endDate: "20260829 23:59:59", restCode: "106" }, config);
    expect(mock.params.StartDate.toISOString()).toBe("2026-08-29T00:00:00.000Z");
    expect(mock.params.EndDate.toISOString()).toBe("2026-08-29T23:59:59.000Z");
    expect(mock.params.RestCode).toBe("106");
    expect(mock.config.options.useUTC).toBe(true);
    expect(rows[0]).toMatchObject({ date: "2026-08-29", closedDate: "2026-08-29", hourFrom: 11, hourTo: 12, totalSales: 100.25, guestCount: 5, billCount: 2, averageBill: 50.125 });
    expect(mock.close).toHaveBeenCalledTimes(1);
  });

  it("закриває з'єднання при помилці та не повертає хибний нульовий факт", async () => {
    mock.query.mockRejectedValue(new Error("SQL timeout"));
    await expect(fetchServioHourlySales({ startDate: "2026-08-29", endDate: "2026-08-29" }, config)).rejects.toThrow("SQL timeout");
    expect(mock.close).toHaveBeenCalledTimes(1);
  });

  it("відхиляє зворотний період до підключення", async () => {
    await expect(fetchServioHourlySales({ startDate: "2026-08-30", endDate: "2026-08-29" }, config)).rejects.toThrow("пізніша");
    expect(mock.connect).not.toHaveBeenCalled();
  });
});
