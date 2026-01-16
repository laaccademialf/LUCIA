import { useState } from "react";
import { Zap, Thermometer, Users, User, CalendarDays } from "lucide-react";

// Компонент для введення та перегляду історії показників електроенергії
const ElectricityForm = ({ meters = [], onSubmit, history = [], responsible = "" }) => {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [temperature, setTemperature] = useState("");
  const [guests, setGuests] = useState("");
  const [meterValues, setMeterValues] = useState(
    meters.map(m => ({
      meterId: m.id,
      meterNumber: m.number,
      prevValue: m.prevValue || "",
      currValue: "",
      consumption: 0,
    }))
  );

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
    if (onSubmit) {
      onSubmit({
        date,
        temperature,
        guests,
        meters: meterValues,
        responsible,
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* Заголовок */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
          <Zap size={32} className="text-yellow-400" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Введення показників електроенергії</h2>
            <p className="text-slate-500 text-sm">Внесіть дані за поточний день для всіх лічильників</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1">
            <CalendarDays size={18} className="text-indigo-500" />
            <input type="date" className="bg-transparent outline-none font-semibold" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1">
            <Thermometer size={18} className="text-sky-500" />
            <input type="number" className="bg-transparent outline-none w-12 text-right font-semibold" value={temperature} onChange={e => setTemperature(e.target.value)} placeholder="°C" />
            <span className="text-xs text-slate-500">°C</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1">
            <Users size={18} className="text-emerald-500" />
            <input type="number" className="bg-transparent outline-none w-12 text-right font-semibold" value={guests} onChange={e => setGuests(e.target.value)} placeholder="Гості" />
            <span className="text-xs text-slate-500">гостей</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1">
            <User size={18} className="text-indigo-500" />
            <span className="font-semibold text-slate-700">{responsible}</span>
          </div>
        </div>
      </div>

      {/* Лічильники */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {meterValues.map((m, idx) => (
          <div key={m.meterId} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col gap-4">
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

      <div className="flex justify-end mt-6">
        <button type="button" onClick={handleSubmit} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-lg shadow-lg transition">
          Зберегти показники
        </button>
      </div>

      {/* Історія */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mt-8">
        <h4 className="font-semibold text-slate-800 mb-4 text-lg flex items-center gap-2"><Zap size={18} className="text-yellow-400" /> Історія показників</h4>
        {history.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2">Дата</th>
                  <th className="px-4 py-2">Темп.</th>
                  <th className="px-4 py-2">Гості</th>
                  <th className="px-4 py-2">№ лічильника</th>
                  <th className="px-4 py-2">Попередні</th>
                  <th className="px-4 py-2">Поточні</th>
                  <th className="px-4 py-2">Споживання</th>
                  <th className="px-4 py-2">Відповідальний</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row, idx) => (
                  row.meters.map((m, mIdx) => (
                    <tr key={idx + "-" + m.meterId}>
                      <td className="px-4 py-2">{row.date}</td>
                      <td className="px-4 py-2">{row.temperature}</td>
                      <td className="px-4 py-2">{row.guests}</td>
                      <td className="px-4 py-2">{m.meterNumber}</td>
                      <td className="px-4 py-2">{m.prevValue}</td>
                      <td className="px-4 py-2">{m.currValue}</td>
                      <td className="px-4 py-2">{m.consumption}</td>
                      <td className="px-4 py-2">{row.responsible}</td>
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500">Немає даних</p>
        )}
      </div>
    </div>
  );
};

export default ElectricityForm;
