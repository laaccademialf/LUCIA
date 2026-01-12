import { useState, useEffect } from "react";
import { Save, AlertCircle, Check } from "lucide-react";
import { getWorkRoles } from "../firebase/rolesPositions";

// Всі поля в формі активу сгруповані за табами
const ASSET_FIELDS = {
  identification: {
    label: "Ідентифікація",
    fields: [
      { id: "invNumber", label: "Інвентарний номер" },
      { id: "name", label: "Назва активу" },
      { id: "category", label: "Категорія" },
      { id: "subCategory", label: "Підкатегорія" },
      { id: "type", label: "Тип" },
      { id: "serialNumber", label: "Серійний номер" },
      { id: "brand", label: "Марка" },
    ],
  },
  location: {
    label: "Локація",
    fields: [
      { id: "businessUnit", label: "Бізнес-напрям" },
      { id: "locationName", label: "Назва локації" },
      { id: "zone", label: "Зона" },
      { id: "respCenter", label: "Центр відповідальності" },
      { id: "respPerson", label: "Відповідальна особа" },
    ],
  },
  status: {
    label: "Статус",
    fields: [
      { id: "status", label: "Статус" },
      { id: "condition", label: "Стан" },
      { id: "functionality", label: "Функціональність" },
      { id: "relevance", label: "Релевантність" },
      { id: "comment", label: "Коментар" },
    ],
  },
  dates: {
    label: "Дати",
    fields: [
      { id: "purchaseYear", label: "Дата придбання" },
      { id: "commissionDate", label: "Дата введення в експлуатацію" },
      { id: "normativeTerm", label: "Нормативний строк" },
    ],
  },
  depreciation: {
    label: "Знос",
    fields: [
      { id: "physicalWear", label: "Фізичний знос" },
      { id: "moralWear", label: "Моральний знос" },
      { id: "totalWear", label: "Загальний знос" },
    ],
  },
  value: {
    label: "Вартість",
    fields: [
      { id: "initialCost", label: "Первісна вартість" },
      { id: "marketValueNew", label: "Ринкова вартість (нова)" },
      { id: "marketValueUsed", label: "Ринкова вартість (б/в)" },
      { id: "residualValue", label: "Залишкова вартість" },
    ],
  },
  decision: {
    label: "Рішення",
    fields: [
      { id: "decision", label: "Рішення" },
      { id: "reason", label: "Причина" },
      { id: "newLocation", label: "Нова локація" },
    ],
  },
};

export function FieldPermissionsManager() {
  const [roles, setRoles] = useState([]);
  const [fieldPermissions, setFieldPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const workRoles = await getWorkRoles();
      setRoles(workRoles);

      // Спробуємо завантажити збережені дозволи з localStorage
      const savedPermissions = localStorage.getItem("fieldPermissions");
      
      if (savedPermissions) {
        // Якщо є збережені дозволи - використовуємо їх
        setFieldPermissions(JSON.parse(savedPermissions));
        console.log("✅ Завантажено збережені дозволи з localStorage");
      } else {
        // Ініціалізуємо дозволи для кожної ролі та поля
        const permissions = {};
        workRoles.forEach(role => {
          permissions[role.id] = {};
          Object.values(ASSET_FIELDS).forEach(tab => {
            tab.fields.forEach(field => {
              permissions[role.id][field.id] = true; // За замовчуванням всі можуть редагувати
            });
          });
        });
        setFieldPermissions(permissions);
        console.log("📋 Ініціалізовано дозволи за замовчуванням");
      }

      setLoading(false);
    } catch (error) {
      console.error("Помилка завантаження ролей:", error);
      setMessage({ type: "error", text: "Помилка завантаження даних" });
      setLoading(false);
    }
  };

  const togglePermission = (roleId, fieldId) => {
    setFieldPermissions(prev => ({
      ...prev,
      [roleId]: {
        ...prev[roleId],
        [fieldId]: !prev[roleId][fieldId],
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Тут буде логіка збереження в Firestore
      // На даний момент просто зберігаємо в localStorage як приклад
      localStorage.setItem("fieldPermissions", JSON.stringify(fieldPermissions));
      
      setMessage({ type: "success", text: "✅ Дозволи успішно збережені!" });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Помилка збереження дозволів:", error);
      setMessage({ type: "error", text: "❌ Помилка при збереженні" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="card p-6 text-slate-600">Завантаження...</div>;
  }

  return (
    <div className="card p-6 bg-white border border-slate-200 shadow-xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Права редагування полів</h2>
        <p className="text-sm text-slate-600 mt-2">
          Виберіть які поля може редагувати кожна роль. ☑️ = може редагувати, ☐ = тільки читання
        </p>
      </div>

      {message && (
        <div className={`mb-4 p-4 rounded-lg flex items-center gap-3 ${message.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
          {message.type === "success" ? <Check size={20} /> : <AlertCircle size={20} />}
          {message.text}
        </div>
      )}

      <div className="space-y-8">
        {Object.entries(ASSET_FIELDS).map(([tabId, tab]) => (
          <div key={tabId} className="border-b border-slate-200 pb-6 last:border-0">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">📋 {tab.label}</h3>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-slate-800 border-b">Поле</th>
                    {roles.map(role => (
                      <th key={role.id} className="px-4 py-3 text-center text-sm font-semibold text-slate-800 border-b">
                        {role.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tab.fields.map(field => (
                    <tr key={field.id} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium text-slate-700">{field.label}</td>
                      {roles.map(role => (
                        <td key={`${role.id}-${field.id}`} className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={fieldPermissions[role.id]?.[field.id] ?? true}
                            onChange={() => togglePermission(role.id, field.id)}
                            className="w-5 h-5 rounded cursor-pointer accent-indigo-600"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 transition-all duration-200 shadow-lg disabled:opacity-50"
        >
          <Save size={18} />
          {saving ? "Збереження..." : "Зберегти дозволи"}
        </button>
      </div>

      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <p>💡 <strong>Порада:</strong> Розробляються дозволи для редагування полів за ролями. Поля помічені ☑️ дозволено редагувати цій ролі.</p>
      </div>
    </div>
  );
}
