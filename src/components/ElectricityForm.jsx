import { useState } from "react";
import { Zap } from "lucide-react";

// Компонент для введення та перегляду історії показників електроенергії
const ElectricityForm = ({ meters = [], onSubmit, history = [], responsible = "", reportDate = "", energoRows = [], onDeleteHistory }) => {
  const [meterValues, setMeterValues] = useState(
    meters.map(m => ({
      meterId: m.id,
      meterNumber: m.number,
      prevValue: m.prevValue || "",
      currValue: "",
      consumption: 0,
    }))
  );

  // Місяць історії, що відображається (YYYY-MM). За замовчуванням — поточний.
  const [historyMonth, setHistoryMonth] = useState(() => new Date().toISOString().slice(0, 7));

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
  // Доступні місяці (YYYY-MM) за спаданням.
  const availableMonths = [...new Set(
    sortedHistory.map((row) => rowDateIso(row?.date).slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m))
  )];
  // Якщо у поточному місяці немає записів — показуємо найновіший доступний.
  const effectiveMonth = availableMonths.includes(historyMonth)
    ? historyMonth
    : (availableMonths[0] || historyMonth);
  const monthIndex = availableMonths.indexOf(effectiveMonth);
  const hasOlderMonth = monthIndex >= 0 && monthIndex < availableMonths.length - 1;
  const hasNewerMonth = monthIndex > 0;
  const monthLabel = (m) => {
    const mm = /^(\d{4})-(\d{2})$/.exec(m || "");
    if (!mm) return m || "";
    const names = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
    return `${names[Number(mm[2]) - 1] || ""} ${mm[1]}`.trim();
  };
  // Записи лише обраного місяця (вже відсортовані за спаданням дати).
  const visibleHistory = sortedHistory.filter((row) => rowDateIso(row?.date).slice(0, 7) === effectiveMonth);

  return (
    <div className="space-y-8">
      {existingForDate && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Для дати {reportDate} вже існує запис в історії. Збереження створить ще один.
        </p>
      )}

      {meterValues.length === 0 && energoRows.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Немає даних для збереження: спершу отримайте показники з EnergoCenter або налаштуйте лічильники в розділі «Управління утилітами».
        </div>
      )}

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
              <div key={group.key} className="bg-slate-50 border border-slate-200 rounded-xl p-6 mt-8">
                <h4 className="font-semibold text-slate-800 mb-4 text-lg flex items-center gap-2">
                  <Zap size={18} className="text-yellow-400" /> Історія показників — {group.title}
                </h4>
                <p className="text-slate-500 text-sm">Немає даних</p>
              </div>
            );
          }

          return (
            <div key={group.key} className="bg-slate-50 border border-slate-200 rounded-xl p-6 mt-8">
              <h4 className="font-semibold text-slate-800 mb-4 text-lg flex items-center gap-2">
                <Zap size={18} className="text-yellow-400" /> Історія показників — {group.title}
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 text-left whitespace-nowrap">Дата</th>
                      {columns.map((c) => (
                        <th key={c} className="px-3 py-2 text-right whitespace-nowrap">{c}</th>
                      ))}
                      <th className="px-3 py-2 text-left whitespace-nowrap">Відповідальний</th>
                      {onDeleteHistory && <th className="px-3 py-2"></th>}
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
                      return (
                        <tr key={row?.id || idx} className="border-t border-slate-100">
                          <td className="px-3 py-2 whitespace-nowrap">{fmtDate(row?.date)}</td>
                          {columns.map((c) => {
                            const m = byCol.get(c);
                            return (
                              <td key={c} className="px-3 py-2 text-right tabular-nums">
                                {m ? (m.consumption ?? m.currValue ?? "—") : "—"}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 whitespace-nowrap">{row?.responsible || ""}</td>
                          {onDeleteHistory && (
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => onDeleteHistory(row?.id)}
                                className="text-rose-600 hover:text-rose-800 text-xs font-semibold"
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
          <div className="mt-8 space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2">
              <button
                type="button"
                disabled={!hasOlderMonth}
                onClick={() => { if (hasOlderMonth) setHistoryMonth(availableMonths[monthIndex + 1]); }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >← Старіші</button>
              <span className="text-sm font-semibold text-slate-800">{monthLabel(effectiveMonth)}</span>
              <button
                type="button"
                disabled={!hasNewerMonth}
                onClick={() => { if (hasNewerMonth) setHistoryMonth(availableMonths[monthIndex - 1]); }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >Новіші →</button>
            </div>
            {groups.map(renderGroup)}
          </div>
        );
      })() : (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mt-8">
          <h4 className="font-semibold text-slate-800 mb-4 text-lg flex items-center gap-2"><Zap size={18} className="text-yellow-400" /> Історія показників</h4>
          <p className="text-slate-500">Немає даних</p>
        </div>
      )}
    </div>
  );
};

export default ElectricityForm;
