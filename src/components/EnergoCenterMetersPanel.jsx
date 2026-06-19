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

const EnergoCenterMetersPanel = ({ autoLoad = false, reportDate: reportDateProp, onReportDateChange, onDataChange, eics, generatorEics, onSave, saveLabel = "Автоматичне оновлення", canSave = true } = {}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [internalDate, setInternalDate] = useState(getYesterdayIso());
  const reportDate = reportDateProp ?? internalDate;
  const setReportDate = (iso) => {
    if (onReportDateChange) onReportDateChange(iso);
    if (reportDateProp === undefined) setInternalDate(iso);
  };
  const abortRef = useRef(null);
  const onDataChangeRef = useRef(onDataChange);
  useEffect(() => { onDataChangeRef.current = onDataChange; }, [onDataChange]);

  const apiEnabled = isEnergoCenterApiEnabled();
  const toEicArray = (value) => {
    let arr = [];
    if (Array.isArray(value)) arr = value;
    else if (typeof value === "string") arr = value.split(/[,\s;]+/);
    return arr.map((s) => String(s || "").trim()).filter(Boolean);
  };
  // Нормалізуємо EIC: масив, або CSV-рядок з картки ресторану.
  const eicsList = toEicArray(eics);
  const generatorEicsList = toEicArray(generatorEics);
  const eicsKey = eicsList.join("|");
  const generatorEicsKey = generatorEicsList.join("|");
  const hasEics = eicsList.length > 0 || generatorEicsList.length > 0;

  const load = useCallback(async ({ force = false } = {}) => {
    if (!apiEnabled) {
      setError("API не налаштовано (VITE_DATA_API_BASE_URL).");
      return null;
    }
    if (!hasEics) {
      setError("Не задано EIC коди лічильників. Додайте їх у картці закладу.");
      setData(null);
      if (onDataChangeRef.current) onDataChangeRef.current(null);
      return null;
    }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    try {
      // Тягнемо основні вводи та генератор ПАРАЛЕЛЬНО окремими запитами, щоб
      // коректно промаркувати рядки генератора (вони можуть мати споживання 0)
      // і при цьому не подвоювати час очікування (інакше ризик 504 від проксі).
      const [mainsResult, genResult] = await Promise.all([
        eicsList.length
          ? fetchEnergoCenterConsumption({ signal: controller.signal, date: reportDate, force, eics: eicsList })
          : Promise.resolve({ ok: true, rows: [] }),
        generatorEicsList.length
          ? fetchEnergoCenterConsumption({ signal: controller.signal, date: reportDate, force, eics: generatorEicsList })
          : Promise.resolve({ ok: true, rows: [] }),
      ]);

      const mainsRows = (Array.isArray(mainsResult?.rows) ? mainsResult.rows : [])
        .map((row) => ({ ...row, isGenerator: false }));
      const genRows = (Array.isArray(genResult?.rows) ? genResult.rows : [])
        .map((row) => ({
          ...row,
          isGenerator: true,
          point: `Генератор: ${row.point || ""}`.trim(),
        }));

      const combinedOk = (eicsList.length ? Boolean(mainsResult?.ok) : true)
        && (generatorEicsList.length ? Boolean(genResult?.ok) : true);
      const result = {
        ok: combinedOk,
        rows: [...mainsRows, ...genRows],
        fetchedAt: new Date().toISOString(),
        reportDate: mainsResult?.reportDate || genResult?.reportDate || reportDate,
        sourceUrl: mainsResult?.sourceUrl || genResult?.sourceUrl || "",
        error: mainsResult?.error || genResult?.error || "",
      };
      setData(result);
      if (onDataChangeRef.current) onDataChangeRef.current(result);
      if (!result.ok) {
        setError(result.error || "Не вдалося отримати дані");
      }
      return result;
    } catch (err) {
      if (err?.name === "AbortError") return null;
      setError(err?.message || String(err));
      setData((prev) => prev || { ok: false, fetchedAt: new Date().toISOString(), rows: [] });
      return null;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  }, [apiEnabled, reportDate, hasEics, eicsKey, generatorEicsKey]);

  // Кнопка «Оновити дані»: тягне показники з EnergoCenter за обрану дату ТА
  // зберігає їх в історію (ручний запасний варіант на випадок, якщо нічний
  // авто-запис о 03:00 не спрацював). Якщо записи за цю дату вже є —
  // onSave (skipIfExists) сам пропустить збереження й не перезапише наявні.
  const handleAutoUpdate = useCallback(async () => {
    const result = await load({ force: true });
    if (!result?.ok) {
      setError(result?.error || "Не вдалося отримати дані для збереження");
      return;
    }
    const rows = Array.isArray(result.rows) ? result.rows : [];
    if (rows.length === 0) {
      setError("Немає показників для збереження за обрану дату.");
      return;
    }
    if (!onSave) return;
    setSaving(true);
    setError("");
    try {
      await onSave({ rows, reportDate, data: result });
    } finally {
      setSaving(false);
    }
  }, [load, onSave, reportDate]);

  // При зміні закладу (EIC) або дати НЕ тягнемо дані автоматично — користувач
  // запускає оновлення сам кнопкою. Лише скидаємо застарілі дані попереднього
  // ресторану/дати, щоб не показувати чужі показники. Авто-завантаження
  // вмикається лише явно через проп autoLoad.
  useEffect(() => {
    if (!hasEics) {
      setData(null);
      setError("");
      if (onDataChangeRef.current) onDataChangeRef.current(null);
      return;
    }
    if (autoLoad) {
      void load();
      return;
    }
    // Скидаємо показники попереднього вибору — чекаємо натискання кнопки.
    setData(null);
    setError("");
    if (onDataChangeRef.current) onDataChangeRef.current(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportDate, eicsKey, generatorEicsKey, hasEics, autoLoad]);

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
      <header className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Лічильники EnergoCenter</h3>
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
            onClick={onSave ? handleAutoUpdate : () => load({ force: true })}
            disabled={loading || saving || !hasEics || (onSave && !canSave)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-400 transition"
          >
            {loading ? "Оновлюю..." : saving ? "Зберігаю..." : "Оновити дані"}
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
            className={`rounded-lg border px-2.5 py-1.5 ${DIRECTION_COLORS[dir] || "bg-slate-50 border-slate-200 text-slate-700"}`}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{dir}</div>
            <div className="text-base font-bold leading-tight">{formatNumber(totals[dir])}</div>
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
