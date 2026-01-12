import { useState, useEffect } from "react";
import { Shield, Save, AlertCircle, Check } from "lucide-react";
import { getWorkRoles } from "../firebase/rolesPositions";
import { getRolePermissions, saveRolePermissions } from "../firebase/permissions";

// Структура меню з усіма підрозділами та вкладками
const menuStructure = [
  {
    id: "dashboard",
    label: "Дашборд",
    children: [{ id: "dashboard-ops", label: "Операційний огляд" }],
  },
  {
    id: "settings",
    label: "Налаштування",
    children: [
      { id: "settings-restaurant", label: "Дані ресторану", tabs: ["main", "schedule", "projects"] },
      { id: "settings-accounts", label: "Облікові записи", tabs: ["add", "edit"] },
      { id: "settings-permissions", label: "Права доступу", tabs: ["roles", "permissions"] },
    ],
  },
  {
    id: "operations",
    label: "Операції",
    children: [
      { id: "ops-checklists", label: "Чек-листи" },
      { id: "ops-haccp", label: "HACCP журнали" },
      { id: "ops-maintenance", label: "Сервісні заявки" },
    ],
  },
  {
    id: "inventory",
    label: "Облік",
    children: [
      { id: "inventory-products", label: "Продукти", tabs: ["test1", "test2", "test3"] },
      { id: "inventory-utilities", label: "Утиліти", tabs: ["test1", "test2", "test3"] },
      { id: "inventory-assets", label: "Основні засоби", tabs: ["test1", "test2", "test3"] },
    ],
  },
  {
    id: "reports",
    label: "Звіти",
    children: [
      { id: "reports-products", label: "Інвентаризація продуктів" },
      { id: "reports-assets", label: "Основні засоби" },
    ],
  },
  {
    id: "security",
    label: "Безпека",
    children: [{ id: "security-audit", label: "Аудит дій" }],
  },
  {
    id: "team",
    label: "Команда",
    children: [{ id: "team-roles", label: "Ролі та доступи" }],
  },
  {
    id: "maintenance",
    label: "Сервіс",
    children: [{ id: "maintenance-plan", label: "Планові роботи" }],
  },
];

export const RolePermissionsManager = () => {
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      setLoading(true);
      const rolesData = await getWorkRoles();
      setRoles(rolesData);
    } catch (error) {
      console.error("Помилка завантаження ролей:", error);
      setError("Не вдалося завантажити ролі");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelect = async (role) => {
    setSelectedRole(role);
    setSuccess("");
    
    try {
      const rolePerms = await getRolePermissions(role.id);
      setPermissions(rolePerms.permissions || {});
    } catch (error) {
      console.error("Помилка завантаження дозволів:", error);
      setPermissions({});
    }
  };

  const toggleMenuItem = (menuId) => {
    setPermissions((prev) => {
      const newPerms = { ...prev };
      if (newPerms[menuId]) {
        delete newPerms[menuId];
      } else {
        newPerms[menuId] = [];
      }
      return newPerms;
    });
  };

  const toggleTab = (menuId, tabId) => {
    setPermissions((prev) => {
      const newPerms = { ...prev };
      const tabs = newPerms[menuId] || [];
      
      if (tabs.includes(tabId)) {
        newPerms[menuId] = tabs.filter((t) => t !== tabId);
      } else {
        newPerms[menuId] = [...tabs, tabId];
      }
      
      return newPerms;
    });
  };

  const handleSave = async () => {
    if (!selectedRole) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      
      await saveRolePermissions(selectedRole.id, selectedRole.name, permissions);
      
      setSuccess(`Доступи для ролі "${selectedRole.name}" успішно збережено!`);
    } catch (error) {
      console.error("Помилка збереження:", error);
      setError("Не вдалося зберегти доступи");
    } finally {
      setSaving(false);
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
    <div className="card p-6 bg-white border border-slate-200 shadow-xl">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="text-indigo-600" size={24} />
        <h2 className="text-xl font-semibold text-slate-900">Доступи ролей</h2>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-100 border border-green-300 text-green-700 rounded-lg text-sm flex items-center gap-2">
          <Check size={16} />
          {success}
        </div>
      )}

      {roles.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50">
          <Shield size={48} className="mx-auto mb-2 text-slate-400" />
          <p className="text-slate-600">Немає ролей</p>
          <p className="text-sm text-slate-500">Спочатку створіть ролі у вкладці "Ролі та Посади"</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Вибір ролі */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-2">
              Оберіть роль для налаштування доступів
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {roles.map((role) => (
                <button
                  key={role.id}
                  onClick={() => handleRoleSelect(role)}
                  className={`p-3 rounded-lg border-2 font-semibold transition ${
                    selectedRole?.id === role.id
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-slate-800 border-slate-300 hover:border-indigo-400"
                  }`}
                >
                  {role.name}
                </button>
              ))}
            </div>
          </div>

          {/* Налаштування доступів */}
          {selectedRole && (
            <div className="border-t-2 border-slate-200 pt-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                Налаштування доступів для ролі: <span className="text-indigo-600">{selectedRole.name}</span>
              </h3>

              <div className="space-y-4">
                {menuStructure.map((section) => (
                  <div key={section.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                    <h4 className="font-bold text-slate-800 mb-3">{section.label}</h4>
                    
                    <div className="space-y-2 ml-4">
                      {section.children.map((child) => (
                        <div key={child.id} className="bg-white rounded-lg p-3 border border-slate-200">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={permissions[child.id] !== undefined}
                              onChange={() => toggleMenuItem(child.id)}
                              className="w-4 h-4 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500"
                            />
                            <span className="font-semibold text-slate-800">{child.label}</span>
                          </label>

                          {/* Вкладки */}
                          {child.tabs && permissions[child.id] !== undefined && (
                            <div className="mt-3 ml-6 space-y-2">
                              <p className="text-xs font-semibold text-slate-600 mb-2">Доступні вкладки:</p>
                              {child.tabs.map((tab) => (
                                <label key={tab} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={permissions[child.id]?.includes(tab)}
                                    onChange={() => toggleTab(child.id, tab)}
                                    className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                                  />
                                  <span className="text-sm text-slate-700">{tab}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Кнопка збереження */}
              <div className="flex justify-end mt-6 pt-4 border-t border-slate-200">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition shadow-lg"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Збереження...
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      Зберегти доступи
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
