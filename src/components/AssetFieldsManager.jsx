import { useState, useEffect } from "react";
import { Plus, Trash2, AlertCircle, List, CheckCircle } from "lucide-react";
import {
  getCategories,
  addCategory,
  deleteCategory,
  getSubcategories,
  addSubcategory,
  deleteSubcategory,
  getAccountingTypes,
  addAccountingType,
  deleteAccountingType,
  getBusinessUnits,
  addBusinessUnit,
  deleteBusinessUnit,
  getStatuses,
  addStatus,
  deleteStatus,
  getConditions,
  addCondition,
  deleteCondition,
  getDecisions,
  addDecision,
  deleteDecision,
} from "../firebase/assetFields";

const FieldSection = ({ title, items, onAdd, onDelete, color = "blue", placeholder }) => {
  const [newItem, setNewItem] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!newItem.trim()) return;

    setLoading(true);
    try {
      await onAdd(newItem.trim());
      setNewItem("");
    } catch (error) {
      console.error("Помилка додавання:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleAdd();
    }
  };

  // Маппінг кольорів для уникнення динамічних класів Tailwind
  const colorClasses = {
    blue: {
      bg: "bg-blue-50",
      border: "border-blue-200",
      icon: "text-blue-600",
      badge: "bg-blue-200 text-blue-800",
      button: "bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300",
    },
    cyan: {
      bg: "bg-cyan-50",
      border: "border-cyan-200",
      icon: "text-cyan-600",
      badge: "bg-cyan-200 text-cyan-800",
      button: "bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-300",
    },
    purple: {
      bg: "bg-purple-50",
      border: "border-purple-200",
      icon: "text-purple-600",
      badge: "bg-purple-200 text-purple-800",
      button: "bg-purple-600 hover:bg-purple-500 disabled:bg-purple-300",
    },
    green: {
      bg: "bg-green-50",
      border: "border-green-200",
      icon: "text-green-600",
      badge: "bg-green-200 text-green-800",
      button: "bg-green-600 hover:bg-green-500 disabled:bg-green-300",
    },
    yellow: {
      bg: "bg-yellow-50",
      border: "border-yellow-200",
      icon: "text-yellow-600",
      badge: "bg-yellow-200 text-yellow-800",
      button: "bg-yellow-600 hover:bg-yellow-500 disabled:bg-yellow-300",
    },
    orange: {
      bg: "bg-orange-50",
      border: "border-orange-200",
      icon: "text-orange-600",
      badge: "bg-orange-200 text-orange-800",
      button: "bg-orange-600 hover:bg-orange-500 disabled:bg-orange-300",
    },
    red: {
      bg: "bg-red-50",
      border: "border-red-200",
      icon: "text-red-600",
      badge: "bg-red-200 text-red-800",
      button: "bg-red-600 hover:bg-red-500 disabled:bg-red-300",
    },
  };

  const colors = colorClasses[color] || colorClasses.blue;

  return (
    <div className={`${colors.bg} border-2 ${colors.border} rounded-lg p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <List size={20} className={colors.icon} />
          <h3 className="font-bold text-slate-800">{title}</h3>
          <span className={`px-2 py-0.5 rounded-full ${colors.badge} text-xs font-semibold`}>
            {items.length}
          </span>
        </div>
      </div>

      {/* Поле додавання */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={handleAdd}
          disabled={loading || !newItem.trim()}
          className={`px-4 py-2 rounded-lg ${colors.button} text-white font-semibold disabled:cursor-not-allowed transition flex items-center gap-2`}
        >
          {loading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            <Plus size={16} />
          )}
        </button>
      </div>

      {/* Список елементів */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-4">Немає елементів</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200 hover:shadow-md transition"
            >
              <span className="text-slate-800 font-medium">{item.name}</span>
              <button
                onClick={() => {
                  if (window.confirm(`Видалити "${item.name}"?`)) {
                    onDelete(item.id);
                  }
                }}
                className="text-red-600 hover:text-red-800 hover:bg-red-100 p-1.5 rounded transition"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const AssetFieldsManager = () => {
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [accountingTypes, setAccountingTypes] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadAllFields();
  }, []);

  const loadAllFields = async () => {
    try {
      setLoading(true);
      setError("");

      const [
        categoriesData,
        subcategoriesData,
        accountingTypesData,
        businessUnitsData,
        statusesData,
        conditionsData,
        decisionsData,
      ] = await Promise.all([
        getCategories(),
        getSubcategories(),
        getAccountingTypes(),
        getBusinessUnits(),
        getStatuses(),
        getConditions(),
        getDecisions(),
      ]);

      setCategories(categoriesData);
      setSubcategories(subcategoriesData);
      setAccountingTypes(accountingTypesData);
      setBusinessUnits(businessUnitsData);
      setStatuses(statusesData);
      setConditions(conditionsData);
      setDecisions(decisionsData);
    } catch (error) {
      console.error("Помилка завантаження полів:", error);
      setError("Не вдалося завантажити дані");
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async (name) => {
    const newItem = await addCategory(name);
    setCategories([...categories, newItem]);
  };

  const handleDeleteCategory = async (id) => {
    await deleteCategory(id);
    setCategories(categories.filter((item) => item.id !== id));
  };

  const handleAddSubcategory = async (name) => {
    const newItem = await addSubcategory(name);
    setSubcategories([...subcategories, newItem]);
  };

  const handleDeleteSubcategory = async (id) => {
    await deleteSubcategory(id);
    setSubcategories(subcategories.filter((item) => item.id !== id));
  };

  const handleAddAccountingType = async (name) => {
    const newItem = await addAccountingType(name);
    setAccountingTypes([...accountingTypes, newItem]);
  };

  const handleDeleteAccountingType = async (id) => {
    await deleteAccountingType(id);
    setAccountingTypes(accountingTypes.filter((item) => item.id !== id));
  };

  const handleAddBusinessUnit = async (name) => {
    const newItem = await addBusinessUnit(name);
    setBusinessUnits([...businessUnits, newItem]);
  };

  const handleDeleteBusinessUnit = async (id) => {
    await deleteBusinessUnit(id);
    setBusinessUnits(businessUnits.filter((item) => item.id !== id));
  };

  const handleAddStatus = async (name) => {
    const newItem = await addStatus(name);
    setStatuses([...statuses, newItem]);
  };

  const handleDeleteStatus = async (id) => {
    await deleteStatus(id);
    setStatuses(statuses.filter((item) => item.id !== id));
  };

  const handleAddCondition = async (name) => {
    const newItem = await addCondition(name);
    setConditions([...conditions, newItem]);
  };

  const handleDeleteCondition = async (id) => {
    await deleteCondition(id);
    setConditions(conditions.filter((item) => item.id !== id));
  };

  const handleAddDecision = async (name) => {
    const newItem = await addDecision(name);
    setDecisions([...decisions, newItem]);
  };

  const handleDeleteDecision = async (id) => {
    await deleteDecision(id);
    setDecisions(decisions.filter((item) => item.id !== id));
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
        <CheckCircle className="text-indigo-600" size={24} />
        <h2 className="text-xl font-semibold text-slate-900">Типові поля активів</h2>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <FieldSection
          title="Категорії"
          items={categories}
          onAdd={handleAddCategory}
          onDelete={handleDeleteCategory}
          color="blue"
          placeholder="Наприклад: Кухня"
        />

        <FieldSection
          title="Підкатегорії"
          items={subcategories}
          onAdd={handleAddSubcategory}
          onDelete={handleDeleteSubcategory}
          color="cyan"
          placeholder="Наприклад: Плита"
        />

        <FieldSection
          title="Типи обліку"
          items={accountingTypes}
          onAdd={handleAddAccountingType}
          onDelete={handleDeleteAccountingType}
          color="purple"
          placeholder="Наприклад: ОС"
        />

        <FieldSection
          title="Бізнес напрями"
          items={businessUnits}
          onAdd={handleAddBusinessUnit}
          onDelete={handleDeleteBusinessUnit}
          color="green"
          placeholder="Наприклад: Ресторан"
        />

        <FieldSection
          title="Статуси"
          items={statuses}
          onAdd={handleAddStatus}
          onDelete={handleDeleteStatus}
          color="yellow"
          placeholder="Наприклад: В експлуатації"
        />

        <FieldSection
          title="Стан"
          items={conditions}
          onAdd={handleAddCondition}
          onDelete={handleDeleteCondition}
          color="orange"
          placeholder="Наприклад: Добрий"
        />

        <FieldSection
          title="Рішення"
          items={decisions}
          onAdd={handleAddDecision}
          onDelete={handleDeleteDecision}
          color="red"
          placeholder="Наприклад: Залишити"
        />
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Примітка:</strong> Локація автоматично використовує список ресторанів. 
          Додавайте та редагуйте ресторани в розділі "Налаштування → Дані ресторану".
        </p>
      </div>
    </div>
  );
};
