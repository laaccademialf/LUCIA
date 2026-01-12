import { useState, useEffect } from "react";
import { Plus, Trash2, Briefcase, UserCog, AlertCircle } from "lucide-react";
import { getPositions, addPosition, deletePosition, getWorkRoles, addWorkRole, deleteWorkRole } from "../firebase/rolesPositions";

export const RolesPositionsManager = () => {
  const [positions, setPositions] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newPosition, setNewPosition] = useState("");
  const [newRole, setNewRole] = useState("");
  const [addingPosition, setAddingPosition] = useState(false);
  const [addingRole, setAddingRole] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [positionsData, rolesData] = await Promise.all([
        getPositions(),
        getWorkRoles(),
      ]);
      setPositions(positionsData);
      setRoles(rolesData);
    } catch (error) {
      console.error("Помилка завантаження даних:", error);
      setError("Не вдалося завантажити дані");
    } finally {
      setLoading(false);
    }
  };

  const handleAddPosition = async () => {
    if (!newPosition.trim()) return;

    try {
      setAddingPosition(true);
      setError("");
      const id = await addPosition({ name: newPosition.trim() });
      setPositions([...positions, { id, name: newPosition.trim() }]);
      setNewPosition("");
    } catch (error) {
      console.error("Помилка додавання посади:", error);
      setError("Не вдалося додати посаду");
    } finally {
      setAddingPosition(false);
    }
  };

  const handleDeletePosition = async (id) => {
    if (!confirm("Ви впевнені, що хочете видалити цю посаду?")) return;

    try {
      await deletePosition(id);
      setPositions(positions.filter((p) => p.id !== id));
    } catch (error) {
      console.error("Помилка видалення посади:", error);
      setError("Не вдалося видалити посаду");
    }
  };

  const handleAddRole = async () => {
    if (!newRole.trim()) return;

    try {
      setAddingRole(true);
      setError("");
      const id = await addWorkRole({ name: newRole.trim() });
      setRoles([...roles, { id, name: newRole.trim() }]);
      setNewRole("");
    } catch (error) {
      console.error("Помилка додавання ролі:", error);
      setError("Не вдалося додати роль");
    } finally {
      setAddingRole(false);
    }
  };

  const handleDeleteRole = async (id) => {
    if (!confirm("Ви впевнені, що хочете видалити цю роль?")) return;

    try {
      await deleteWorkRole(id);
      setRoles(roles.filter((r) => r.id !== id));
    } catch (error) {
      console.error("Помилка видалення ролі:", error);
      setError("Не вдалося видалити роль");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Посади */}
      <div className="card p-6 bg-white border border-slate-200 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <Briefcase className="text-indigo-600" size={24} />
          <h2 className="text-xl font-semibold text-slate-900">Посади</h2>
          <span className="ml-auto text-sm text-slate-500">{positions.length} посад</span>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newPosition}
            onChange={(e) => setNewPosition(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddPosition()}
            placeholder="Назва посади (наприклад: Кухар, Офіціант)"
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <button
            onClick={handleAddPosition}
            disabled={!newPosition.trim() || addingPosition}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition shadow"
          >
            <Plus size={18} />
            Додати
          </button>
        </div>

        {positions.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50">
            <Briefcase size={48} className="mx-auto mb-2 text-slate-400" />
            <p className="text-slate-600">Немає посад</p>
            <p className="text-sm text-slate-500">Додайте першу посаду</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {positions.map((position) => (
              <div
                key={position.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-indigo-300 transition"
              >
                <span className="text-slate-800 font-medium">{position.name}</span>
                <button
                  onClick={() => handleDeletePosition(position.id)}
                  className="text-red-600 hover:text-red-800 transition"
                  title="Видалити"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ролі */}
      <div className="card p-6 bg-white border border-slate-200 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <UserCog className="text-green-600" size={24} />
          <h2 className="text-xl font-semibold text-slate-900">Робочі ролі</h2>
          <span className="ml-auto text-sm text-slate-500">{roles.length} ролей</span>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddRole()}
            placeholder="Назва ролі (наприклад: Бариста, Су-шеф)"
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-green-500 focus:ring-2 focus:ring-green-500 focus:outline-none"
          />
          <button
            onClick={handleAddRole}
            disabled={!newRole.trim() || addingRole}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-500 disabled:bg-green-400 disabled:cursor-not-allowed transition shadow"
          >
            <Plus size={18} />
            Додати
          </button>
        </div>

        {roles.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50">
            <UserCog size={48} className="mx-auto mb-2 text-slate-400" />
            <p className="text-slate-600">Немає ролей</p>
            <p className="text-sm text-slate-500">Додайте першу роль</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {roles.map((role) => (
              <div
                key={role.id}
                className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200 hover:border-green-400 transition"
              >
                <span className="text-slate-800 font-medium">{role.name}</span>
                <button
                  onClick={() => handleDeleteRole(role.id)}
                  className="text-red-600 hover:text-red-800 transition"
                  title="Видалити"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
