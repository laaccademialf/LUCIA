import { useState, useEffect } from "react";
import { Plus, Trash2, Briefcase, UserCog, AlertCircle, CornerDownRight } from "lucide-react";
import { getPositions, addPosition, deletePosition, getWorkRoles, addWorkRole, deleteWorkRole, updatePosition, updateWorkRole } from "../firebase/rolesPositions";
import { useAuth } from "../hooks/useAuth";

export const RolesPositionsManager = () => {
  const [positions, setPositions] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newPosition, setNewPosition] = useState("");
  const [newPositionParent, setNewPositionParent] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newRoleParent, setNewRoleParent] = useState("");
  const [addingPosition, setAddingPosition] = useState(false);
  const [addingRole, setAddingRole] = useState(false);
  const { user } = useAuth();

  // Визначаємо, чи користувач керуючий (або інша роль з обмеженнями)
  const isManager = user && (user.role === "manager" || user.workRole === "Керуючий");

  // Знаходимо id ролі керуючиго серед roles
  const managerRole = roles.find(r => r.name === "Керуючий");
  const managerRoleId = managerRole ? managerRole.id : null;

  // Знаходимо всі id дочірніх ролей для керуючого (включаючи вкладені)
  function getAllDescendantIds(rootId, items) {
    const map = {};
    items.forEach((item) => (map[item.id] = { ...item, children: [] }));
    items.forEach((item) => {
      if (item.parentId && map[item.parentId]) {
        map[item.parentId].children.push(map[item.id]);
      }
    });
    function collectIds(node) {
      let ids = [node.id];
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          ids = ids.concat(collectIds(child));
        });
      }
      return ids;
    }
    return rootId && map[rootId] ? collectIds(map[rootId]) : [];
  }

  // id ролей, які керуючий може редагувати (тільки нижчі по дереву)
  const managerEditableRoleIds = isManager && managerRoleId ? getAllDescendantIds(managerRoleId, roles).filter(id => id !== managerRoleId) : [];

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
      const id = await addPosition({ name: newPosition.trim(), parentId: newPositionParent || null });
      setPositions([...positions, { id, name: newPosition.trim(), parentId: newPositionParent || null }]);
      setNewPosition("");
      setNewPositionParent("");
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
      const id = await addWorkRole({ name: newRole.trim(), parentId: newRoleParent || null });
      setRoles([...roles, { id, name: newRole.trim(), parentId: newRoleParent || null }]);
      setNewRole("");
      setNewRoleParent("");
    } catch (error) {
      console.error("Помилка додавання ролі:", error);
      setError("Не вдалося додати роль");
    } finally {
      setAddingRole(false);
    }
  };
  // Побудова дерева з flat array
  function buildTree(items) {
    const map = {};
    const roots = [];
    items.forEach((item) => (map[item.id] = { ...item, children: [] }));
    items.forEach((item) => {
      // Якщо parentId не існує серед ролей — робимо кореневим
      if (item.parentId && map[item.parentId]) {
        map[item.parentId].children.push(map[item.id]);
      } else {
        roots.push(map[item.id]);
      }
    });
    return roots;
  }

  // Пошук усіх нащадків (для заборони циклів)
  function getDescendantIds(node) {
    let ids = [];
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        ids.push(child.id);
        ids = ids.concat(getDescendantIds(child));
      });
    }
    return ids;
  }

  // Окремий компонент для вузла дерева
  function TreeNode({ node, type, allItems, onChangeParent, onDelete, children, level = 0, isLast = false }) {
    const descendants = getDescendantIds(node);
    const forbidden = [node.id, ...descendants];
    const options = allItems.filter(i => !forbidden.includes(i.id));
    const parentId = node.parentId || "";
    const [updating, setUpdating] = useState(false);
    const [selectedParent, setSelectedParent] = useState(parentId);

    const handleChangeParent = async (e) => {
      const newParentId = e.target.value || null;
      setSelectedParent(e.target.value);
      setUpdating(true);
      try {
        await onChangeParent(node, newParentId, type, setUpdating);
      } catch (err) {
        setError("Не вдалося змінити батьківську");
      } finally {
        setUpdating(false);
      }
    };

    // Відступ для рівня
    const indent = level * 20;

    return (
      <li className="relative group">
        <div
          className="flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-100 transition"
          style={{ marginLeft: indent }}
        >
          {/* Вертикальна лінія для дерева */}
          {level > 0 && (
            <span
              className="absolute left-0 top-0 h-full border-l border-slate-300"
              style={{ height: '100%', marginLeft: (level - 1) * 20 + 9 }}
            />
          )}
          {/* Гілка */}
          {level > 0 && (
            <span
              className="w-4 h-4 flex items-center justify-center text-slate-400"
              style={{ marginLeft: -20 }}
            >
              <CornerDownRight size={14} />
            </span>
          )}
          <span className="text-slate-800 font-medium whitespace-nowrap">{node.name}</span>
          {/* Обмеження для керуючого: може змінювати лише ролі нижчі по ієрархії */}
          <select
            value={selectedParent}
            onChange={handleChangeParent}
            disabled={updating || (isManager && type === "role" && !managerEditableRoleIds.includes(node.id))}
            className="ml-2 rounded border border-gray-300 px-1 py-0.5 text-xs"
            title="Змінити батьківську"
          >
            <option value="">Без батьківської</option>
            {options.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.name}</option>
            ))}
          </select>
          <button
            onClick={() => onDelete(node.id, type)}
            className="text-red-600 hover:text-red-800 transition ml-2"
            title="Видалити"
            disabled={isManager && type === "role" && !managerEditableRoleIds.includes(node.id)}
          >
            <Trash2 size={16} />
          </button>
        </div>
        {/* Діти */}
        {node.children && node.children.length > 0 && (
          <ul>
            {node.children.map((child, idx) => (
              <TreeNode
                key={child.id}
                node={child}
                type={type}
                allItems={allItems}
                onChangeParent={onChangeParent}
                onDelete={onDelete}
                level={level + 1}
                isLast={idx === node.children.length - 1}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  // Рекурсивний рендер дерева через TreeNode
  function renderTree(nodes, type = "position", allItems = [], level = 0) {
    return (
      <ul className="tree-list">
        {nodes.map((node, idx) => (
          <TreeNode
            key={node.id}
            node={node}
            type={type}
            allItems={allItems}
            onChangeParent={handleChangeParentUniversal}
            onDelete={handleDeleteUniversal}
            level={level}
            isLast={idx === nodes.length - 1}
          />
        ))}
      </ul>
    );
  }

  // Оновлення parentId для вузла
  const handleChangeParentUniversal = async (node, newParentId, type, setUpdating) => {
    if (type === "position") {
      await updatePosition(node.id, { ...node, parentId: newParentId });
      setPositions(positions => positions.map(p => p.id === node.id ? { ...p, parentId: newParentId } : p));
    } else {
      await updateWorkRole(node.id, { ...node, parentId: newParentId });
      setRoles(roles => roles.map(r => r.id === node.id ? { ...r, parentId: newParentId } : r));
    }
    setUpdating(false);
  };

  // Видалення вузла
  const handleDeleteUniversal = (id, type) => {
    if (type === "position") {
      handleDeletePosition(id);
    } else {
      handleDeleteRole(id);
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
          <select
            value={newPositionParent}
            onChange={e => setNewPositionParent(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="">Без батьківської</option>
            {positions.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
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
          <div className="pt-2 overflow-x-auto">
            {renderTree(buildTree(positions), "position", positions)}
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
            disabled={isManager}
          />
          <select
            value={newRoleParent}
            onChange={e => setNewRoleParent(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 focus:border-green-500 focus:ring-2 focus:ring-green-500 focus:outline-none"
            disabled={isManager}
          >
            <option value="">Без батьківської</option>
            {roles.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button
            onClick={handleAddRole}
            disabled={!newRole.trim() || addingRole || isManager}
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
          <div className="pt-2 overflow-x-auto">
            {renderTree(buildTree(roles), "role", roles)}
          </div>
        )}
      </div>
    </div>
  );
};
