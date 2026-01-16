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
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center mb-4">
        <div className="flex items-center gap-2">
          <Building2 size={20} className="text-indigo-600" />
          <select
            className="border rounded px-3 py-2 font-semibold"
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
            className="border rounded px-3 py-2 font-semibold"
            value={selectedUtility}
            onChange={e => setSelectedUtility(e.target.value)}
          >
            {UTILITY_TYPES.map(u => (
              <option key={u.key} value={u.key}>{u.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border rounded-xl">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-2 text-left">№ лічильника</th>
              <th className="px-4 py-2 text-left">Тип</th>
              <th className="px-4 py-2 text-left">Ціна (грн)</th>
              <th className="px-4 py-2 text-left">Дата встановлення</th>
              <th className="px-4 py-2 text-left">Дії</th>
            </tr>
          </thead>
          <tbody>
            {filteredMeters.map(meter => (
              <tr key={meter.id} className="border-b">
                <td className="px-4 py-2 font-semibold">{meter.number}</td>
                <td className="px-4 py-2">{UTILITY_TYPES.find(u => u.key === meter.utilityType)?.label}</td>
                <td className="px-4 py-2">
                  {editId === meter.id ? (
                    <input
                      type="number"
                      className="border rounded px-2 py-1 w-24"
                      value={editPrice}
                      onChange={e => setEditPrice(e.target.value)}
                    />
                  ) : (
                    <span>{meter.price}</span>
                  )}
                </td>
                <td className="px-4 py-2">{meter.createdAt?.slice(0, 10) || "-"}</td>
                <td className="px-4 py-2 flex gap-2">
                  {editId === meter.id ? (
                    <button className="text-emerald-600" onClick={() => handleSave(meter)}><Save size={18} /></button>
                  ) : (
                    <button className="text-indigo-600" onClick={() => handleEdit(meter)}><Edit2 size={18} /></button>
                  )}
                  <button className="text-red-500" onClick={() => onDeleteMeter && onDeleteMeter(meter.id)}><Trash2 size={18} /></button>
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50">
              <td className="px-4 py-2">
                <input
                  type="text"
                  className="border rounded px-2 py-1 w-32"
                  placeholder="Новий лічильник"
                  value={newMeter.number}
                  onChange={e => setNewMeter(n => ({ ...n, number: e.target.value }))}
                />
              </td>
              <td className="px-4 py-2">{UTILITY_TYPES.find(u => u.key === selectedUtility)?.label}</td>
              <td className="px-4 py-2">
                <input
                  type="number"
                  className="border rounded px-2 py-1 w-24"
                  placeholder="Ціна"
                  value={newMeter.price}
                  onChange={e => setNewMeter(n => ({ ...n, price: e.target.value }))}
                />
              </td>
              <td className="px-4 py-2">{new Date().toISOString().slice(0, 10)}</td>
              <td className="px-4 py-2">
                <button className="text-emerald-600" onClick={handleAddMeter}><Plus size={18} /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UtilityMetersManager;
