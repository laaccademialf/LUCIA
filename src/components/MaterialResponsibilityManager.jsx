import { useState, useEffect } from "react";
import { Plus, Trash2, AlertCircle, Users, ChevronDown, ChevronRight } from "lucide-react";
import {
  getResponsibilityCenters,
  addResponsibilityCenter,
  deleteResponsibilityCenter,
  getResponsiblePersons,
  addResponsiblePerson,
  deleteResponsiblePerson,
} from "../firebase/assetFields";

export const MaterialResponsibilityManager = () => {
  const [centers, setCenters] = useState([]);
  const [persons, setPersons] = useState([]);
  const [expandedCenters, setExpandedCenters] = useState({});
  const [newCenterName, setNewCenterName] = useState("");
  const [newPersonName, setNewPersonName] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [centersData, personsData] = await Promise.all([
        getResponsibilityCenters(),
        getResponsiblePersons(),
      ]);
      setCenters(centersData);
      setPersons(personsData);
    } catch (error) {
      console.error("Помилка завантаження даних:", error);
      setError("Не вдалося завантажити дані");
    } finally {
      setLoading(false);
    }
  };

  const handleAddCenter = async () => {
    if (!newCenterName.trim()) return;

    try {
      const newCenter = await addResponsibilityCenter(newCenterName.trim());
      setCenters([...centers, newCenter]);
      setNewCenterName("");
    } catch (error) {
      console.error("Помилка додавання центру:", error);
    }
  };

  const handleDeleteCenter = async (centerId) => {
    // Перевіряємо чи є особи в цьому центрі
    const personsInCenter = persons.filter(p => p.centerId === centerId);
    if (personsInCenter.length > 0) {
      alert(`Не можна видалити центр, поки в ньому є відповідальні особи (${personsInCenter.length})`);
      return;
    }

    if (window.confirm("Видалити цей центр відповідальності?")) {
      try {
        await deleteResponsibilityCenter(centerId);
        setCenters(centers.filter(c => c.id !== centerId));
      } catch (error) {
        console.error("Помилка видалення центру:", error);
      }
    }
  };

  const handleAddPerson = async (centerId) => {
    const name = newPersonName[centerId]?.trim();
    if (!name) return;

    try {
      const newPerson = await addResponsiblePerson(name, centerId);
      setPersons([...persons, newPerson]);
      setNewPersonName({ ...newPersonName, [centerId]: "" });
    } catch (error) {
      console.error("Помилка додавання особи:", error);
    }
  };

  const handleDeletePerson = async (personId) => {
    if (window.confirm("Видалити цю відповідальну особу?")) {
      try {
        await deleteResponsiblePerson(personId);
        setPersons(persons.filter(p => p.id !== personId));
      } catch (error) {
        console.error("Помилка видалення особи:", error);
      }
    }
  };

  const toggleCenter = (centerId) => {
    setExpandedCenters({
      ...expandedCenters,
      [centerId]: !expandedCenters[centerId],
    });
  };

  const getPersonsForCenter = (centerId) => {
    return persons.filter(p => p.centerId === centerId);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="card p-6 bg-white border border-slate-200 shadow-xl">
      <div className="flex items-center gap-3 mb-6">
        <Users className="text-indigo-600" size={24} />
        <h2 className="text-xl font-semibold text-slate-900">Матеріальна відповідальність</h2>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Додати новий центр */}
      <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
        <h3 className="text-sm font-semibold text-indigo-900 mb-3">Додати центр відповідальності</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newCenterName}
            onChange={(e) => setNewCenterName(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleAddCenter()}
            placeholder="Наприклад: Відділ ІТ"
            className="flex-1 px-3 py-2 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
          />
          <button
            onClick={handleAddCenter}
            disabled={!newCenterName.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 text-white rounded-lg transition flex items-center gap-2 text-sm font-medium"
          >
            <Plus size={16} />
            Додати
          </button>
        </div>
      </div>

      {/* Список центрів */}
      <div className="space-y-3">
        {centers.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Users size={48} className="mx-auto mb-2 opacity-30" />
            <p>Немає центрів відповідальності</p>
          </div>
        ) : (
          centers.map((center) => {
            const isExpanded = expandedCenters[center.id];
            const centerPersons = getPersonsForCenter(center.id);

            return (
              <div
                key={center.id}
                className="border border-slate-200 rounded-lg overflow-hidden"
              >
                {/* Заголовок центру */}
                <div className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition">
                  <button
                    onClick={() => toggleCenter(center.id)}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown size={20} className="text-slate-600" />
                    ) : (
                      <ChevronRight size={20} className="text-slate-600" />
                    )}
                    <div>
                      <h3 className="font-semibold text-slate-900">{center.name}</h3>
                      <p className="text-xs text-slate-500">
                        {centerPersons.length} {centerPersons.length === 1 ? "особа" : centerPersons.length < 5 ? "особи" : "осіб"}
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={() => handleDeleteCenter(center.id)}
                    className="text-red-600 hover:text-red-800 hover:bg-red-100 p-2 rounded transition"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                {/* Список відповідальних осіб */}
                {isExpanded && (
                  <div className="p-4 bg-white border-t border-slate-200">
                    {/* Додати особу */}
                    <div className="mb-4 flex gap-2">
                      <input
                        type="text"
                        value={newPersonName[center.id] || ""}
                        onChange={(e) =>
                          setNewPersonName({
                            ...newPersonName,
                            [center.id]: e.target.value,
                          })
                        }
                        onKeyPress={(e) => e.key === "Enter" && handleAddPerson(center.id)}
                        placeholder="Наприклад: Іваненко І.П."
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                      />
                      <button
                        onClick={() => handleAddPerson(center.id)}
                        disabled={!newPersonName[center.id]?.trim()}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-300 text-white rounded-lg transition flex items-center gap-2 text-sm font-medium"
                      >
                        <Plus size={16} />
                        Додати
                      </button>
                    </div>

                    {/* Список осіб */}
                    {centerPersons.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-4">
                        Немає відповідальних осіб у цьому центрі
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {centerPersons.map((person) => (
                          <div
                            key={person.id}
                            className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition"
                          >
                            <span className="text-slate-800 font-medium">{person.name}</span>
                            <button
                              onClick={() => handleDeletePerson(person.id)}
                              className="text-red-600 hover:text-red-800 hover:bg-red-100 p-1.5 rounded transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Примітка:</strong> Створіть центри відповідальності (підрозділи) та додайте до них 
          матеріально відповідальних осіб. У формі активу спочатку обирається центр, а потім особа з цього центру.
        </p>
      </div>
    </div>
  );
};
