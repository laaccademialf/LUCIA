import { useState } from "react";
import { Building2, Zap, Droplets, Flame, Plus, Edit2, Trash2, Save } from "lucide-react";

// Типи утиліт
const UTILITY_TYPES = [
  { key: "electricity", label: "Електроенергія", icon: <Zap className="inline text-yellow-500" size={18} /> },
  { key: "water", label: "Вода", icon: <Droplets className="inline text-sky-500" size={18} /> },
  { key: "gas", label: "Газ", icon: <Flame className="inline text-orange-500" size={18} /> },
];

const UtilityMetersManager = ({ restaurants = [], meters = [], onAddMeter, onUpdateMeter, onDeleteMeter }) => {
  const [selectedRestaurant, setSelectedRestaurant] = useState(restaurants[0]?.id || "");
  const [selectedUtility, setSelectedUtility] = useState(UTILITY_TYPES[0].key);
  const [editId, setEditId] = useState(null);
  const [editPrice, setEditPrice] = useState("");
  const [newMeter, setNewMeter] = useState({ number: "", price: "" });

  // Фільтр лічильників по ресторану та утиліті
  const filteredMeters = meters.filter(
    m => m.restaurantId === selectedRestaurant && m.utilityType === selectedUtility
  );

  const handleAddMeter = () => {
    if (!newMeter.number || !newMeter.price) return;
    onAddMeter && onAddMeter({
      ...newMeter,
      restaurantId: selectedRestaurant,
      utilityType: selectedUtility,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    });
    setNewMeter({ number: "", price: "" });
  };

  const handleEdit = (meter) => {
    setEditId(meter.id);
    setEditPrice(meter.price);
  };

  const handleSave = (meter) => {
    onUpdateMeter && onUpdateMeter({ ...meter, price: editPrice });
    setEditId(null);
    setEditPrice("");
  };

  return (
    <div className="card p-4 sm:p-5 bg-white border border-slate-200 text-slate-900 shadow-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex items-center gap-2">
          <Building2 size={20} className="text-indigo-600" />
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            value={selectedRestaurant}
            onChange={e => setSelectedRestaurant(e.target.value)}
          >
            {restaurants.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700">Утиліта:</span>
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 font-semibold focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
            value={selectedUtility}
            onChange={e => setSelectedUtility(e.target.value)}
          >
            {UTILITY_TYPES.map(u => (
              <option key={u.key} value={u.key}>{u.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-800 uppercase tracking-wide">№ лічильника</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-800 uppercase tracking-wide">Тип</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-800 uppercase tracking-wide">Ціна (грн)</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-800 uppercase tracking-wide">Дата встановлення</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-800 uppercase tracking-wide">Дії</th>
            </tr>
          </thead>
          <tbody>
            {filteredMeters.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-slate-400 italic bg-slate-50">Немає лічильників для цієї утиліти</td>
              </tr>
            )}
            {filteredMeters.map(meter => (
              <tr key={meter.id} className="border-b border-slate-200 last:border-0 hover:bg-slate-50 transition-colors">
                <td className="px-4 py-2 font-semibold text-slate-900">{meter.number}</td>
                <td className="px-4 py-2 flex items-center gap-2">
                  {UTILITY_TYPES.find(u => u.key === meter.utilityType)?.icon}
                  <span>{UTILITY_TYPES.find(u => u.key === meter.utilityType)?.label}</span>
                </td>
                <td className="px-4 py-2">
                  {editId === meter.id ? (
                    <input
                      type="number"
                      className="border border-emerald-300 rounded-lg px-2 py-1 w-24 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                      value={editPrice}
                      onChange={e => setEditPrice(e.target.value)}
                    />
                  ) : (
                    <span className="text-slate-800 font-medium">{meter.price}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-500">{meter.createdAt?.slice(0, 10) || "-"}</td>
                <td className="px-4 py-2 flex gap-2">
                  {editId === meter.id ? (
                    <button className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-bold text-white hover:bg-emerald-500 transition-all duration-200 shadow" title="Зберегти" onClick={() => handleSave(meter)}><Save size={16} />Зберегти</button>
                  ) : (
                    <button className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-xs font-bold text-white hover:bg-indigo-500 transition-all duration-200 shadow" title="Редагувати" onClick={() => handleEdit(meter)}><Edit2 size={16} />Редагувати</button>
                  )}
                  <button className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2 py-1 text-xs font-bold text-white hover:bg-red-500 transition-all duration-200 shadow" title="Видалити" onClick={() => onDeleteMeter && onDeleteMeter(meter.id)}><Trash2 size={16} />Видалити</button>
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50">
              <td className="px-4 py-2">
                <input
                  type="text"
                  className="border border-indigo-200 rounded-lg px-2 py-1 w-32 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                  placeholder="Новий лічильник"
                  value={newMeter.number}
                  onChange={e => setNewMeter(n => ({ ...n, number: e.target.value }))}
                />
              </td>
              <td className="px-4 py-2 flex items-center gap-2">
                {UTILITY_TYPES.find(u => u.key === selectedUtility)?.icon}
                <span>{UTILITY_TYPES.find(u => u.key === selectedUtility)?.label}</span>
              </td>
              <td className="px-4 py-2">
                <input
                  type="number"
                  className="border border-emerald-200 rounded-lg px-2 py-1 w-24 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                  placeholder="Ціна"
                  value={newMeter.price}
                  onChange={e => setNewMeter(n => ({ ...n, price: e.target.value }))}
                />
              </td>
              <td className="px-4 py-2 text-slate-400">{new Date().toISOString().slice(0, 10)}</td>
              <td className="px-4 py-2">
                <button className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-bold text-white hover:bg-emerald-500 transition-all duration-200 shadow" title="Додати" onClick={handleAddMeter}><Plus size={16} />Додати</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UtilityMetersManager;
