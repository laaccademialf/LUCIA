import { randomUUID } from "node:crypto";

// Короткі HTTP-запити обходять timeout reverse proxy під час довгого SQL.
// Результат доступний лише користувачу, який запустив завдання.
export const createServioSalesJobs = ({ run, now = Date.now, ttlMs = 15 * 60_000, maxJobs = 20 }) => {
  const jobs = new Map();
  const prune = () => {
    for (const [id, job] of jobs) {
      if (job.finishedAt !== undefined && now() - job.finishedAt >= ttlMs) jobs.delete(id);
    }
  };
  return {
    start(ownerId, params) {
      prune();
      // Повторне натискання/повтор HTTP не запускає той самий дорогий SQL.
      const key = JSON.stringify([String(ownerId), params]);
      for (const [jobId, job] of jobs) {
        if (job.key === key && job.status === "pending") return { jobId, status: "pending" };
      }
      if (jobs.size >= maxJobs) {
        const finished = [...jobs].filter(([, job]) => job.status !== "pending")
          .sort((a, b) => a[1].finishedAt - b[1].finishedAt);
        if (finished.length) jobs.delete(finished[0][0]);
      }
      if (jobs.size >= maxJobs) throw new Error("Черга Servio заповнена. Спробуйте пізніше.");
      const jobId = randomUUID();
      const job = { ownerId: String(ownerId), key, status: "pending" };
      jobs.set(jobId, job);
      Promise.resolve().then(() => run(params)).then(
        (rows) => Object.assign(job, { status: "complete", rows, finishedAt: now() }),
        (error) => Object.assign(job, { status: "failed", error: error?.message || String(error), finishedAt: now() })
      );
      return { jobId, status: "pending" };
    },
    get(ownerId, jobId) {
      prune();
      const job = jobs.get(jobId);
      if (!job || job.ownerId !== String(ownerId)) return null;
      return { jobId, status: job.status, rows: job.rows, error: job.error };
    },
  };
};
