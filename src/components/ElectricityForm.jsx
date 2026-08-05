import { Fragment, useState } from "react";
import { Zap } from "lucide-react";

// Компонент для введення та перегляду історії показників електроенергії
const ElectricityForm = ({
  meters = [],
  onSubmit,
  history = [],
  responsible = "",
  reportDate = "",
  energoRows = [],
  onDeleteHistory,
  coefficients = {},
  canEditCoefficients = false,
  canEditReadings = false,
  onCoefficientChange,
  onReadingOverride,
}) => {
  const [meterValues, setMeterValues] = useState(
    meters.map(m => ({
      meterId: m.id,
      meterNumber: m.number,
      prevValue: m.prevValue || "",
      currValue: "",
      consumption: 0,
    }))
  );

  // Проміжок дат для перегляду історії (YYYY-MM-DD). Дефолт — поточний місяць.
  const toIsoDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const [rangeFrom, setRangeFrom] = useState(() => {
    const now = new Date();
    return toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [rangeTo, setRangeTo] = useState(() => toIsoDate(new Date()));
  const setQuickRange = (kind) => {
    const now = new Date();
    if (kind === "thisMonth") {
      setRangeFrom(toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)));
      setRangeTo(toIsoDate(now));
    } else if (kind === "prevMonth") {
      setRangeFrom(toIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
      setRangeTo(toIsoDate(new Date(now.getFullYear(), now.getMonth(), 0)));
    } else if (kind === "last7") {
      const s = new Date(now); s.setDate(s.getDate() - 6);
      setRangeFrom(toIsoDate(s)); setRangeTo(toIsoDate(now));
    } else if (kind === "last30") {
      const s = new Date(now); s.setDate(s.getDate() - 29);
      setRangeFrom(toIsoDate(s)); setRangeTo(toIsoDate(now));
    }
  };

  // Оновлення значень лічильника
  const handleMeterChange = (idx, field, value) => {
    setMeterValues(meterValues => {
      const updated = [...meterValues];
      updated[idx][field] = value;
      // Автоматичний розрахунок споживання
      if (field === "currValue") {
        const prev = parseFloat(updated[idx].prevValue) || 0;
        const curr = parseFloat(value) || 0;
        updated[idx].consumption = curr - prev;
      }
      return updated;
    });
  };

  // Відправка форми
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reportDate) return;
    if (onSubmit) {
      onSubmit({
        date: reportDate,
        meters: meterValues,
        responsible,
      });
    }
  };

  const existingForDate = history.find((row) => String(row?.date || "") === reportDate);

  // Нормалізація дати запису у вигляд YYYY-MM-DD для сортування/фільтра по місяцю.
  const rowDateIso = (v) => {
    const s = String(v || "");
    return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 10) : s;
  };
  // Сортуємо історію від найновішої дати до найстаршої.
  const sortedHistory = [...history].sort((a, b) =>
    String(rowDateIso(b?.date) || b?.createdAt || "").localeCompare(String(rowDateIso(a?.date) || a?.createdAt || ""))
  );
  // Записи в обраному проміжку дат (вже відсортовані за спаданням дати).
  const inSelectedRange = (iso) => {
    if (!iso) return false;
    if (rangeFrom && iso < rangeFrom) return false;
    if (rangeTo && iso > rangeTo) return false;
    return true;
  };
  const visibleHistory = sortedHistory.filter((row) => inSelectedRange(rowDateIso(row?.date)));

  return (
    <div className="space-y-2">
      {existingForDate && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
          Для дати {reportDate} вже існує запис в історії. Збереження створить ще один.
        </p>
      )}

      {meterValues.length === 0 && energoRows.length === 0 && null}

      {/* Лічильники */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {meterValues.map((m, idx) => (          <div key={m.meterId} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-2">
              <Zap size={22} className="text-yellow-400" />
              <span className="font-semibold text-slate-800 text-lg">Лічильник {m.meterNumber}</span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Попередні показники:</span>
                <span className="font-semibold text-slate-700">{m.prevValue}</span>
              </div>
              <div className="flex flex-col gap-1 mt-2">
                <label htmlFor={`currValue-${m.meterId}`} className="text-xs text-slate-500">Поточні показники</label>
                <input
                  id={`currValue-${m.meterId}`}
                  type="number"
                  className="w-full text-right px-4 py-3 rounded-lg border-2 border-indigo-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 bg-slate-50 font-bold text-slate-900 text-lg placeholder-slate-400 transition shadow"
                  value={m.currValue}
                  onChange={e => handleMeterChange(idx, "currValue", e.target.value)}
                  placeholder="Введіть поточні..."
                  required
                />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-slate-500">Споживання за добу:</span>
                <span className="font-semibold text-indigo-600 text-lg">{m.consumption}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {meterValues.length > 0 && (
        <div className="flex justify-end mt-6">
          <button type="button" onClick={handleSubmit} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-lg shadow-lg transition">
            Зберегти показники
          </button>
        </div>
      )}

      {/* Історія */}
      {history.length > 0 ? (() => {
        const fmtDate = (v) => {
          const s = String(v || "");
          const iso = /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 10) : s;
          const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
          return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
        };

        const isGenerator = (label = "") => /генератор/i.test(String(label));

        // Коефіцієнт трансформації лічильника (за замовчуванням 1).
        const coeffOf = (key) => {
          const c = Number(coefficients?.[key]);
          return Number.isFinite(c) && c > 0 ? c : 1;
        };
        // Округлення лише для ВІДОБРАЖЕННЯ: розрахунки лишають повну точність.
        const fmtNum = (n) => {
          if (!Number.isFinite(n)) return "—";
          return Number(n).toFixed(2);
        };
        // Ланцюжок показників: за зростанням дати накопичуємо споживання/коефіцієнт.
        // Якщо є ручна правка (readingOverride) — показник = правці, а наступні
        // дати продовжують додаватись уже від виправленого значення.
        const ascHistory = [...history].sort((a, b) =>
          String(rowDateIso(a?.date) || a?.createdAt || "").localeCompare(String(rowDateIso(b?.date) || b?.createdAt || ""))
        );
        const readingMap = new Map(); // recordId -> Map(meterKey -> reading)
        const running = new Map();    // meterKey -> last reading
        for (const rec of ascHistory) {
          const ms = Array.isArray(rec?.meters) ? rec.meters : [];
          const perRec = new Map();
          for (const m of ms) {
            const key = String(m?.meterNumber || m?.meterId || "");
            if (!key) continue;
            const override = Number(m?.readingOverride);
            const prev = running.has(key) ? running.get(key) : null;
            let reading;
            if (Number.isFinite(override)) {
              // Ручна правка: показник = правці, а наступні дати
              // продовжують накопичуватись уже від виправленого значення.
              reading = override;
            } else {
              // Показник = попередній показник + споживання / коеф трансформації.
              const consumption = Number(m?.consumption ?? m?.currValue) || 0;
              reading = (prev == null ? 0 : prev) + consumption / coeffOf(key);
            }
            perRec.set(key, reading);
            running.set(key, reading);
          }
          readingMap.set(String(rec?.id), perRec);
        }

        // Розділяємо групи: «Мережа» та «Генератор» на основі назви точки.
        const groups = [
          { key: "grid", title: "Мережа", match: (label) => !isGenerator(label) },
          { key: "gen", title: "Генератор", match: (label) => isGenerator(label) },
        ];

        const renderGroup = (group) => {
          // Збираємо колонки лише для цієї групи у порядку першої появи.
          const columns = [];
          const seen = new Set();
          for (const row of visibleHistory) {
            const ms = Array.isArray(row?.meters) ? row.meters : [];
            for (const m of ms) {
              const key = String(m?.meterNumber || m?.meterId || "");
              if (!key || seen.has(key)) continue;
              if (!group.match(key)) continue;
              seen.add(key);
              columns.push(key);
            }
          }

          if (columns.length === 0) {
            return (
              <div key={group.key} className="bg-slate-50 border border-slate-200 rounded-xl p-3 mt-2">
                <h4 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                  <span className="flex items-center gap-2"><Zap size={14} className="text-yellow-400" /> Історія показників — {group.title}</span>
                </h4>
                <p className="text-slate-500 text-sm mt-1">Немає даних</p>
              </div>
            );
          }

          // Підсумок споживання за місяць по кожному лічильнику (колонці).
          const monthTotals = new Map();
          for (const row of visibleHistory) {
            const ms = Array.isArray(row?.meters) ? row.meters : [];
            for (const m of ms) {
              const key = String(m?.meterNumber || m?.meterId || "");
              if (!key || !group.match(key)) continue;
              const val = Number(m?.consumption ?? m?.currValue);
              if (!Number.isFinite(val)) continue;
              monthTotals.set(key, (monthTotals.get(key) || 0) + val);
            }
          }

          return (
            <div key={group.key} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 mt-2">
              <h4 className="font-semibold text-slate-800 mb-2 text-sm flex items-center gap-2">
                <span className="flex items-center gap-1.5"><Zap size={14} className="text-yellow-400" /> Історія показників — {group.title}</span>
              </h4>
              {canEditReadings && !canEditCoefficients && (
                <p className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                  Оберіть конкретний заклад угорі, щоб редагувати коефіцієнти трансформації (вони індивідуальні для кожного лічильника закладу).
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-slate-100 border-b border-slate-200">
                    <tr>
                      <th className="px-2 py-1 text-left whitespace-nowrap align-bottom border border-slate-200" rowSpan={2}>Дата</th>
                      {columns.map((c) => (
                        <th key={c} className="px-2 py-1 text-center whitespace-nowrap border border-slate-200" colSpan={2}>
                          <div className="font-semibold">{c}</div>
                          <div className="flex items-center justify-center gap-1 text-[10px] font-normal text-slate-500">
                            <span>К-т трансформації:</span>
                            {canEditCoefficients ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                defaultValue={coefficients?.[c] ?? ""}
                                placeholder="1"
                                onBlur={(e) => onCoefficientChange?.(c, e.target.value)}
                                className="w-12 rounded border border-slate-300 px-1 py-0 text-right text-[10px]"
                                title="Коефіцієнт трансформації (індивідуальний для лічильника цього закладу)"
                              />
                            ) : (
                              <span className="font-semibold text-slate-700">{coefficients?.[c] ?? 1}</span>
                            )}
                          </div>
                        </th>
                      ))}
                      {onDeleteHistory && <th className="px-2 py-1 border border-slate-200" rowSpan={2}></th>}
                    </tr>
                    <tr>
                      {columns.map((c) => (
                        <Fragment key={`sub-${c}`}>
                          <th className="min-w-[7rem] px-2 py-0.5 text-right whitespace-nowrap text-[10px] font-medium text-slate-500 border border-slate-200">Показник</th>
                          <th className="min-w-[7rem] px-2 py-0.5 text-right whitespace-nowrap text-[10px] font-medium text-slate-500 border border-slate-200">Споживання</th>
                        </Fragment>
                      ))}
                    </tr>
                    <tr className="bg-indigo-50 font-semibold text-indigo-900">
                      <td className="px-2 py-0.5 whitespace-nowrap border border-slate-200">Разом за період</td>
                      {columns.map((c) => (
                        <Fragment key={`tot-${c}`}>
                          <td className="min-w-[7rem] px-2 py-0.5 text-right tabular-nums border border-slate-200 text-slate-400">—</td>
                          <td className="min-w-[7rem] px-2 py-0.5 text-right tabular-nums border border-slate-200">{fmtNum(monthTotals.get(c) || 0)}</td>
                        </Fragment>
                      ))}
                      {onDeleteHistory && <td className="px-2 py-0.5 border border-slate-200"></td>}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleHistory.map((row, idx) => {
                      const ms = Array.isArray(row?.meters) ? row.meters : [];
                      const byCol = new Map();
                      for (const m of ms) {
                        const key = String(m?.meterNumber || m?.meterId || "");
                        if (!key || !group.match(key)) continue;
                        byCol.set(key, m);
                      }
                      // Пропускаємо записи, які не мають жодного значення в цій групі.
                      if (byCol.size === 0) return null;
                      const recReadings = readingMap.get(String(row?.id));
                      return (
                        <tr key={row?.id || idx} className="border-t border-slate-100">
                          <td className="px-2 py-0.5 whitespace-nowrap border border-slate-200">{fmtDate(row?.date)}</td>
                          {columns.map((c) => {
                            const m = byCol.get(c);
                            if (!m) {
                              return (
                                <Fragment key={c}>
                                  <td className="min-w-[7rem] px-2 py-0.5 text-right tabular-nums border border-slate-200">—</td>
                                  <td className="min-w-[7rem] px-2 py-0.5 text-right tabular-nums border border-slate-200">—</td>
                                </Fragment>
                              );
                            }
                            const readingStr = fmtNum(recReadings?.get(c));
                            const overridden = Number.isFinite(Number(m?.readingOverride));
                            return (
                              <Fragment key={c}>
                                <td className="min-w-[7rem] px-2 py-0.5 text-right tabular-nums border border-slate-200">
                                  {canEditReadings ? (
                                    <input
                                      key={`${row?.id}|${c}|${readingStr}|${overridden ? "o" : ""}`}
                                      type="number"
                                      step="0.01"
                                      defaultValue={readingStr === "—" ? "" : readingStr}
                                      onBlur={(e) => {
                                        const v = String(e.target.value || "").trim().replace(",", ".");
                                        const current = Number(recReadings?.get(c));
                                        if (v === "") {
                                          if (Number.isFinite(current)) onReadingOverride?.(row?.id, c, "");
                                          return;
                                        }
                                        const next = Number(v);
                                        if (!Number.isFinite(next)) return;
                                        if (Number.isFinite(current) && Math.abs(next - current) < 1e-9) return;
                                        onReadingOverride?.(row?.id, c, v);
                                      }}
                                      className={`w-24 rounded border px-1 py-0 text-right text-[11px] ${overridden ? "border-amber-400 bg-amber-50 font-semibold text-amber-700" : "border-slate-300"}`}
                                      title="Показник (натисніть, щоб відредагувати; правка перерахує наступні дати)"
                                    />
                                  ) : (
                                    <span className={overridden ? "font-semibold text-amber-700" : ""}>{readingStr}</span>
                                  )}
                                </td>
                                <td className="min-w-[7rem] px-2 py-0.5 text-right tabular-nums border border-slate-200">
                                  {fmtNum(Number(m?.consumption ?? m?.currValue))}
                                </td>
                              </Fragment>
                            );
                          })}
                          {onDeleteHistory && (
                            <td className="px-2 py-0.5 text-right border border-slate-200">
                              <button
                                type="button"
                                onClick={() => onDeleteHistory(row?.id)}
                                className="text-rose-600 hover:text-rose-800 text-[11px] font-semibold"
                              >Видалити</button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        };

        return (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
              <span className="text-xs font-semibold text-slate-700">Проміжок:</span>
              <label className="flex items-center gap-1 text-xs text-slate-600">
                з
                <input
                  type="date"
                  value={rangeFrom}
                  max={rangeTo || undefined}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
                />
              </label>
              <label className="flex items-center gap-1 text-xs text-slate-600">
                по
                <input
                  type="date"
                  value={rangeTo}
                  min={rangeFrom || undefined}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
                />
              </label>
              <span className="mx-1 h-4 w-px bg-slate-200" />
              <button type="button" onClick={() => setQuickRange("thisMonth")} className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Цей місяць</button>
              <button type="button" onClick={() => setQuickRange("prevMonth")} className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Минулий місяць</button>
              <button type="button" onClick={() => setQuickRange("last7")} className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">7 днів</button>
              <button type="button" onClick={() => setQuickRange("last30")} className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">30 днів</button>
            </div>
            {groups.map(renderGroup)}
          </div>
        );
      })() : (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mt-2">
          <h4 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><Zap size={14} className="text-yellow-400" /> Історія показників</h4>
          <p className="text-slate-500 text-sm mt-1">Немає даних</p>
        </div>
      )}
    </div>
  );
};

export default ElectricityForm;
