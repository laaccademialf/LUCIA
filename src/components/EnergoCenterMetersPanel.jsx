import { useCallback, useEffect, useRef, useState } from "react";
import {
  ENERGOCENTER_DIRECTIONS,
  fetchEnergoCenterConsumption,
  isEnergoCenterApiEnabled,
  summarizeRowsByDirection,
} from "../api/energoCenterApi";
import DatePickerPopover from "./DatePickerPopover";

const formatNumber = (value) => {
  if (value == null) return "—";
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString("uk-UA", { maximumFractionDigits: 2 });
};

const formatDateTime = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("uk-UA");
  } catch {
    return String(iso);
  }
};

const DIRECTION_COLORS = {
  "A+": "bg-emerald-50 border-emerald-200 text-emerald-800",
  "A-": "bg-amber-50 border-amber-200 text-amber-800",
  "R+": "bg-sky-50 border-sky-200 text-sky-800",
  "R-": "bg-rose-50 border-rose-200 text-rose-800",
};

const getYesterdayIso = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

const formatDateUk = (iso) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

const EnergoCenterMetersPanel = ({ autoLoad = false } = {}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [reportDate, setReportDate] = useState(getYesterdayIso());
  const abortRef = useRef(null);

  const apiEnabled = isEnergoCenterApiEnabled();

  const load = useCallback(async ({ force = false } = {}) => {
    if (!apiEnabled) {
      setError("API не налаштовано (VITE_DATA_API_BASE_URL).");
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    try {
      const result = await fetchEnergoCenterConsumption({ signal: controller.signal, date: reportDate, force });
      setData(result);
      if (!result?.ok) {
        setError(result?.error || "Не вдалося отримати дані");
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
      setError(err?.message || String(err));
      setData((prev) => prev || { ok: false, fetchedAt: new Date().toISOString(), rows: [] });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  }, [apiEnabled, reportDate]);

  // Автопідвантаження при зміні дати — бере з кешу (миттєво якщо є).
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportDate]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const totals = summarizeRowsByDirection(rows);
  const hasNoData = !loading && !error && rows.length === 0 && data && data.ok;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Лічильники EnergoCenter</h3>
          {data?.fetchedAt && (
            <p className="text-xs text-slate-500">
              Останнє оновлення: {formatDateTime(data.fetchedAt)}
              {data?.reportDate ? ` · дані за ${formatDateUk(data.reportDate)}` : ""}
              {data?.sourceUrl ? ` · ${data.sourceUrl}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DatePickerPopover
            value={reportDate}
            max={getYesterdayIso()}
            onChange={(iso) => setReportDate(iso)}
          />
          <button
            type="button"
            onClick={() => load({ force: true })}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400 transition"
          >
            {loading ? "Оновлюю..." : "Оновити дані"}
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {ENERGOCENTER_DIRECTIONS.map((dir) => (
          <div
            key={dir}
            className={`rounded-lg border px-3 py-2 ${DIRECTION_COLORS[dir] || "bg-slate-50 border-slate-200 text-slate-700"}`}
          >
            <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{dir}</div>
            <div className="text-lg font-bold">{formatNumber(totals[dir])}</div>
          </div>
        ))}
      </div>

      {hasNoData ? (
        <p className="text-sm text-slate-500">Дані відсутні для вибраних параметрів.</p>
      ) : rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Точка обліку</th>
                <th className="text-left px-3 py-2 font-semibold">Напрямок</th>
                <th className="text-right px-3 py-2 font-semibold">Споживання</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={`${row.point}-${row.direction}-${idx}`} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-800">{row.point || "—"}</td>
                  <td className="px-3 py-2 text-slate-800">{row.direction || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                    {formatNumber(row.consumption)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !loading && !error ? (
        <p className="text-sm text-slate-500">
          Натисніть «Оновити дані», щоб завантажити поточні показники з EnergoCenter.
        </p>
      ) : null}
    </section>
  );
};

export default EnergoCenterMetersPanel;
