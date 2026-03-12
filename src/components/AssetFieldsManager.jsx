import { useState, useEffect } from "react";
import { Plus, Trash2, AlertCircle, List, CheckCircle, Pencil, Check, X, Download } from "lucide-react";
import {
  getCategories,
  addCategory,
  deleteCategory,
  updateCategory,
  getSubcategories,
  addSubcategory,
  deleteSubcategory,
  updateSubcategory,
  getAccountingTypes,
  addAccountingType,
  deleteAccountingType,
  updateAccountingType,
  getBusinessUnits,
  addBusinessUnit,
  deleteBusinessUnit,
  updateBusinessUnit,
  getStatuses,
  addStatus,
  deleteStatus,
  updateStatus,
  getConditions,
  addCondition,
  deleteCondition,
  updateCondition,
  getDecisions,
  addDecision,
  deleteDecision,
  updateDecision,
  getPlacementZones,
  addPlacementZone,
  deletePlacementZone,
  updatePlacementZone,
  getFunctionalities,
  addFunctionality,
  deleteFunctionality,
  updateFunctionality,
  getRelevances,
  addRelevance,
  deleteRelevance,
  updateRelevance,
  getReasons,
  addReason,
  deleteReason,
  updateReason,
} from "../firebase/assetFields";

const FieldSection = ({ title, items, onAdd, onDelete, onEdit, color = "blue", placeholder }) => {
  const [newItem, setNewItem] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editingValue, setEditingValue] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

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

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditingValue(item.name || "");
  };

  const cancelEdit = () => {
    setEditingId("");
    setEditingValue("");
  };

  const saveEdit = async () => {
    const trimmedName = editingValue.trim();
    if (!editingId || !trimmedName) return;

    setSavingEdit(true);
    try {
      await onEdit(editingId, trimmedName);
      cancelEdit();
    } catch (error) {
      console.error("Помилка редагування:", error);
    } finally {
      setSavingEdit(false);
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
              {editingId === item.id ? (
                <div className="flex items-center gap-2 w-full">
                  <input
                    type="text"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    className="flex-1 px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={saveEdit}
                    disabled={savingEdit || !editingValue.trim()}
                    className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 p-1.5 rounded transition disabled:opacity-50"
                    title="Зберегти"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="text-slate-600 hover:text-slate-800 hover:bg-slate-100 p-1.5 rounded transition"
                    title="Скасувати"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-slate-800 font-medium">{item.name}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(item)}
                      className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 p-1.5 rounded transition"
                      title="Редагувати"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Видалити "${item.name}"?`)) {
                          onDelete(item.id);
                        }
                      }}
                      className="text-red-600 hover:text-red-800 hover:bg-red-100 p-1.5 rounded transition"
                      title="Видалити"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const SubcategorySection = ({ items, categories, onAdd, onDelete, onEdit }) => {
  const [newItem, setNewItem] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editingValue, setEditingValue] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const handleAdd = async () => {
    if (!newItem.trim() || !selectedCategoryId) return;

    setLoading(true);
    try {
      await onAdd(newItem.trim(), selectedCategoryId);
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

  const startEdit = (item) => {
    const normalizedCategoryId =
      String(item.categoryId || item.category_id || "").trim() ||
      String(
        categories.find((category) =>
          String(category?.name || "").trim() === String(item.categoryName || item.category_name || "").trim()
        )?.id || ""
      ).trim();

    setEditingId(item.id);
    setEditingValue(item.name || "");
    setEditingCategoryId(normalizedCategoryId);
  };

  const cancelEdit = () => {
    setEditingId("");
    setEditingValue("");
    setEditingCategoryId("");
  };

  const saveEdit = async () => {
    const trimmedName = editingValue.trim();
    if (!editingId || !trimmedName || !editingCategoryId) return;

    setSavingEdit(true);
    try {
      await onEdit(editingId, trimmedName, editingCategoryId);
      cancelEdit();
    } catch (error) {
      console.error("Помилка редагування:", error);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="bg-cyan-50 border-2 border-cyan-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <List size={20} className="text-cyan-600" />
          <h3 className="font-bold text-slate-800">Підкатегорії</h3>
          <span className="px-2 py-0.5 rounded-full bg-cyan-200 text-cyan-800 text-xs font-semibold">
            {items.length}
          </span>
        </div>
      </div>

      <div className="space-y-2 mb-3">
        <select
          value={selectedCategoryId}
          onChange={(e) => setSelectedCategoryId(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Оберіть категорію</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Наприклад: Плита"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={handleAdd}
            disabled={loading || !newItem.trim() || !selectedCategoryId}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-300 text-white font-semibold disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Plus size={16} />
            )}
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-4">Немає елементів</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200 hover:shadow-md transition"
            >
              {editingId === item.id ? (
                <div className="w-full space-y-2">
                  <select
                    value={editingCategoryId}
                    onChange={(e) => setEditingCategoryId(e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Оберіть категорію</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className="flex-1 px-2 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      onClick={saveEdit}
                      disabled={savingEdit || !editingValue.trim() || !editingCategoryId}
                      className="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 p-1.5 rounded transition disabled:opacity-50"
                      title="Зберегти"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-slate-600 hover:text-slate-800 hover:bg-slate-100 p-1.5 rounded transition"
                      title="Скасувати"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="min-w-0">
                    <span className="text-slate-800 font-medium block truncate">{item.name}</span>
                    <span className="text-xs text-slate-500 block truncate">
                      {item.categoryName || "Без категорії"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(item)}
                      className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 p-1.5 rounded transition"
                      title="Редагувати"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Видалити "${item.name}"?`)) {
                          onDelete(item.id);
                        }
                      }}
                      className="text-red-600 hover:text-red-800 hover:bg-red-100 p-1.5 rounded transition"
                      title="Видалити"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </>
              )}
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
  const [placementZones, setPlacementZones] = useState([]);
  const [functionalities, setFunctionalities] = useState([]);
  const [relevances, setRelevances] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadAllFields();
  }, []);

  const normalizeCategoryItem = (item) => {
    if (!item || typeof item !== "object") return { id: "", name: "" };
    return {
      ...item,
      id: String(item.id || item.categoryId || item.category_id || "").trim(),
      name: String(item.name || item.categoryName || item.category_name || "").trim(),
    };
  };

  const normalizeSubcategoryItem = (item, categoryNameById) => {
    if (!item || typeof item !== "object") {
      return { id: "", name: "", categoryId: "", categoryName: "" };
    }

    const categoryId = String(item.categoryId || item.category_id || "").trim();
    const fallbackCategoryName = categoryId ? String(categoryNameById.get(categoryId) || "").trim() : "";

    return {
      ...item,
      id: String(item.id || item.subcategoryId || item.subcategory_id || "").trim(),
      name: String(item.name || item.subCategory || item.sub_category || "").trim(),
      categoryId,
      categoryName: String(item.categoryName || item.category_name || fallbackCategoryName || "").trim(),
    };
  };

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
        placementZonesData,
        functionalitiesData,
        relevancesData,
        reasonsData,
      ] = await Promise.all([
        getCategories(),
        getSubcategories(),
        getAccountingTypes(),
        getBusinessUnits(),
        getStatuses(),
        getConditions(),
        getDecisions(),
        getPlacementZones(),
        getFunctionalities(),
        getRelevances(),
        getReasons(),
      ]);

      const normalizedCategories = (Array.isArray(categoriesData) ? categoriesData : [])
        .map(normalizeCategoryItem)
        .filter((item) => item.id || item.name);
      const categoryNameById = new Map(
        normalizedCategories.map((item) => [String(item.id || "").trim(), String(item.name || "").trim()])
      );
      const normalizedSubcategories = (Array.isArray(subcategoriesData) ? subcategoriesData : [])
        .map((item) => normalizeSubcategoryItem(item, categoryNameById))
        .filter((item) => item.id || item.name);

      setCategories(normalizedCategories);
      setSubcategories(normalizedSubcategories);
      setAccountingTypes(accountingTypesData);
      setBusinessUnits(businessUnitsData);
      setStatuses(statusesData);
      setConditions(conditionsData);
      setDecisions(decisionsData);
      setPlacementZones(placementZonesData);
      setFunctionalities(functionalitiesData);
      setRelevances(relevancesData);
      setReasons(reasonsData);
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

  const handleEditCategory = async (id, name) => {
    await updateCategory(id, name);
    setCategories(categories.map((item) => (item.id === id ? { ...item, name } : item)));
  };

  const handleAddSubcategory = async (name, categoryId) => {
    const selectedCategory = categories.find((item) => String(item.id) === String(categoryId));
    const categoryName = selectedCategory?.name || "";
    const newItem = await addSubcategory(name, categoryId, categoryName);
    setSubcategories([
      ...subcategories,
      {
        ...newItem,
        id: String(newItem?.id || "").trim(),
        name: String(newItem?.name || name || "").trim(),
        categoryId: String(newItem?.categoryId || newItem?.category_id || categoryId || "").trim(),
        categoryName: String(newItem?.categoryName || newItem?.category_name || categoryName || "").trim(),
      },
    ]);
  };

  const handleDeleteSubcategory = async (id) => {
    await deleteSubcategory(id);
    setSubcategories(subcategories.filter((item) => item.id !== id));
  };

  const handleEditSubcategory = async (id, name, categoryId) => {
    const selectedCategory = categories.find((item) => String(item.id) === String(categoryId));
    const categoryName = selectedCategory?.name || "";
    await updateSubcategory(id, name, categoryId, categoryName);
    setSubcategories(
      subcategories.map((item) =>
        String(item.id) === String(id)
          ? {
              ...item,
              name,
              categoryId: String(categoryId || "").trim(),
              categoryName: String(categoryName || "").trim(),
            }
          : item
      )
    );
  };

  const handleAddAccountingType = async (name) => {
    const newItem = await addAccountingType(name);
    setAccountingTypes([...accountingTypes, newItem]);
  };

  const handleDeleteAccountingType = async (id) => {
    await deleteAccountingType(id);
    setAccountingTypes(accountingTypes.filter((item) => item.id !== id));
  };

  const handleEditAccountingType = async (id, name) => {
    await updateAccountingType(id, name);
    setAccountingTypes(accountingTypes.map((item) => (item.id === id ? { ...item, name } : item)));
  };

  const handleAddBusinessUnit = async (name) => {
    const newItem = await addBusinessUnit(name);
    setBusinessUnits([...businessUnits, newItem]);
  };

  const handleDeleteBusinessUnit = async (id) => {
    await deleteBusinessUnit(id);
    setBusinessUnits(businessUnits.filter((item) => item.id !== id));
  };

  const handleEditBusinessUnit = async (id, name) => {
    await updateBusinessUnit(id, name);
    setBusinessUnits(businessUnits.map((item) => (item.id === id ? { ...item, name } : item)));
  };

  const handleAddStatus = async (name) => {
    const newItem = await addStatus(name);
    setStatuses([...statuses, newItem]);
  };

  const handleDeleteStatus = async (id) => {
    await deleteStatus(id);
    setStatuses(statuses.filter((item) => item.id !== id));
  };

  const handleEditStatus = async (id, name) => {
    await updateStatus(id, name);
    setStatuses(statuses.map((item) => (item.id === id ? { ...item, name } : item)));
  };

  const handleAddCondition = async (name) => {
    const newItem = await addCondition(name);
    setConditions([...conditions, newItem]);
  };

  const handleDeleteCondition = async (id) => {
    await deleteCondition(id);
    setConditions(conditions.filter((item) => item.id !== id));
  };

  const handleEditCondition = async (id, name) => {
    await updateCondition(id, name);
    setConditions(conditions.map((item) => (item.id === id ? { ...item, name } : item)));
  };

  const handleAddDecision = async (name) => {
    const newItem = await addDecision(name);
    setDecisions([...decisions, newItem]);
  };

  const handleDeleteDecision = async (id) => {
    await deleteDecision(id);
    setDecisions(decisions.filter((item) => item.id !== id));
  };

  const handleEditDecision = async (id, name) => {
    await updateDecision(id, name);
    setDecisions(decisions.map((item) => (item.id === id ? { ...item, name } : item)));
  };

  const handleAddPlacementZone = async (name) => {
    const newItem = await addPlacementZone(name);
    setPlacementZones([...placementZones, newItem]);
  };

  const handleDeletePlacementZone = async (id) => {
    await deletePlacementZone(id);
    setPlacementZones(placementZones.filter((item) => item.id !== id));
  };

  const handleEditPlacementZone = async (id, name) => {
    await updatePlacementZone(id, name);
    setPlacementZones(placementZones.map((item) => (item.id === id ? { ...item, name } : item)));
  };

  const handleAddFunctionality = async (name) => {
    const newItem = await addFunctionality(name);
    setFunctionalities([...functionalities, newItem]);
  };

  const handleDeleteFunctionality = async (id) => {
    await deleteFunctionality(id);
    setFunctionalities(functionalities.filter((item) => item.id !== id));
  };

  const handleEditFunctionality = async (id, name) => {
    await updateFunctionality(id, name);
    setFunctionalities(functionalities.map((item) => (item.id === id ? { ...item, name } : item)));
  };

  const handleAddRelevance = async (name) => {
    const newItem = await addRelevance(name);
    setRelevances([...relevances, newItem]);
  };

  const handleDeleteRelevance = async (id) => {
    await deleteRelevance(id);
    setRelevances(relevances.filter((item) => item.id !== id));
  };

  const handleEditRelevance = async (id, name) => {
    await updateRelevance(id, name);
    setRelevances(relevances.map((item) => (item.id === id ? { ...item, name } : item)));
  };

  const handleAddReason = async (name) => {
    const newItem = await addReason(name);
    setReasons([...reasons, newItem]);
  };

  const handleDeleteReason = async (id) => {
    await deleteReason(id);
    setReasons(reasons.filter((item) => item.id !== id));
  };

  const handleEditReason = async (id, name) => {
    await updateReason(id, name);
    setReasons(reasons.map((item) => (item.id === id ? { ...item, name } : item)));
  };

  const handleExportTypicalFields = async () => {
    setExporting(true);
    try {
      const { exportTypicalAssetFieldsToExcel } = await import("../utils/excelHelpers");
      exportTypicalAssetFieldsToExcel({
        categories,
        subcategories,
        accountingTypes,
        businessUnits,
        statuses,
        conditions,
        decisions,
        placementZones,
        functionalities,
        relevances,
        reasons,
      });
    } catch (exportError) {
      console.error("Помилка експорту типових полів:", exportError);
      alert("Не вдалося експортувати типові поля в Excel.");
    } finally {
      setExporting(false);
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CheckCircle className="text-indigo-600" size={24} />
          <h2 className="text-xl font-semibold text-slate-900">Типові поля активів</h2>
        </div>
        <button
          type="button"
          onClick={handleExportTypicalFields}
          disabled={exporting}
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Download size={16} /> {exporting ? "Експорт..." : "Експорт в Excel"}
        </button>
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
          onEdit={handleEditCategory}
          color="blue"
          placeholder="Наприклад: Кухня"
        />

        <SubcategorySection
          items={subcategories}
          categories={categories}
          onAdd={handleAddSubcategory}
          onDelete={handleDeleteSubcategory}
          onEdit={handleEditSubcategory}
        />

        <FieldSection
          title="Типи обліку"
          items={accountingTypes}
          onAdd={handleAddAccountingType}
          onDelete={handleDeleteAccountingType}
          onEdit={handleEditAccountingType}
          color="purple"
          placeholder="Наприклад: ОС"
        />

        <FieldSection
          title="Бізнес напрями"
          items={businessUnits}
          onAdd={handleAddBusinessUnit}
          onDelete={handleDeleteBusinessUnit}
          onEdit={handleEditBusinessUnit}
          color="green"
          placeholder="Наприклад: Ресторан"
        />

        <FieldSection
          title="Статуси"
          items={statuses}
          onAdd={handleAddStatus}
          onDelete={handleDeleteStatus}
          onEdit={handleEditStatus}
          color="yellow"
          placeholder="Наприклад: В експлуатації"
        />

        <FieldSection
          title="Стан"
          items={conditions}
          onAdd={handleAddCondition}
          onDelete={handleDeleteCondition}
          onEdit={handleEditCondition}
          color="orange"
          placeholder="Наприклад: Добрий"
        />

        <FieldSection
          title="Рішення"
          items={decisions}
          onAdd={handleAddDecision}
          onDelete={handleDeleteDecision}
          onEdit={handleEditDecision}
          color="red"
          placeholder="Наприклад: Залишити"
        />

        <FieldSection
          title="Зони розміщення"
          items={placementZones}
          onAdd={handleAddPlacementZone}
          onDelete={handleDeletePlacementZone}
          onEdit={handleEditPlacementZone}
          color="blue"
          placeholder="Наприклад: Зал"
        />

        <FieldSection
          title="Працездатність"
          items={functionalities}
          onAdd={handleAddFunctionality}
          onDelete={handleDeleteFunctionality}
          onEdit={handleEditFunctionality}
          color="green"
          placeholder="Наприклад: Працює"
        />

        <FieldSection
          title="Моральна актуальність"
          items={relevances}
          onAdd={handleAddRelevance}
          onDelete={handleDeleteRelevance}
          onEdit={handleEditRelevance}
          color="purple"
          placeholder="Наприклад: Актуальний"
        />

        <FieldSection
          title="Причини"
          items={reasons}
          onAdd={handleAddReason}
          onDelete={handleDeleteReason}
          onEdit={handleEditReason}
          color="red"
          placeholder="Наприклад: Знос"
        />
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Примітка:</strong> Локація автоматично використовує список ресторанів. 
          Додавайте та редагуйте ресторани в розділі "Налаштування → Дані ресторану".
          Матеріальну відповідальність налаштовуйте у вкладці "Матеріальна відповідальність".
        </p>
      </div>
    </div>
  );
};
