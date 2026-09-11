import { describe, expect, it, vi } from "vitest";
import { createServioSalesJobs } from "./servioSalesJobs.js";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("фонові запити Servio", () => {
  it("повертає pending одразу, не дублює SQL і віддає результат лише автору", async () => {
    let finish;
    const run = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const jobs = createServioSalesJobs({ run });
    const params = { startDate: "2026-08-29", endDate: "2026-08-29", restCode: "106" };
    const job = jobs.start("user1", params);
    expect(job.status).toBe("pending");
    expect(jobs.start("user1", params)).toEqual(job);
    expect(jobs.get("user2", job.jobId)).toBeNull();
    await settle();
    expect(run).toHaveBeenCalledTimes(1);
    finish([{ totalSales: 100.25 }]);
    await settle();
    expect(jobs.get("user1", job.jobId)).toMatchObject({ status: "complete", rows: [{ totalSales: 100.25 }] });
  });

  it("передає SQL-помилку замість порожнього масиву", async () => {
    const jobs = createServioSalesJobs({ run: async () => { throw new Error("SQL timeout"); } });
    const job = jobs.start("user1", {});
    await settle();
    expect(jobs.get("user1", job.jobId)).toMatchObject({ status: "failed", error: "SQL timeout" });
  });

  it("обмежує чергу та звільняє місце після завершення", async () => {
    let now = 0;
    const jobs = createServioSalesJobs({ run: async () => [], maxJobs: 1, ttlMs: 100, now: () => now });
    const first = jobs.start("user1", {});
    expect(() => jobs.start("user2", {})).toThrow("Черга");
    await settle();
    const second = jobs.start("user2", {});
    expect(jobs.get("user1", first.jobId)).toBeNull();
    await settle();
    now = 101;
    expect(jobs.get("user2", second.jobId)).toBeNull();
  });
});
