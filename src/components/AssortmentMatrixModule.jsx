import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Download,
  Upload,
  FileDown,
  X,
  Save,
  Search,
  ChevronDown,
  ChevronUp,
  Edit3,
  Copy,
  Filter,
} from "lucide-react";
import { useAssortmentMatrix } from "../hooks/useAssortmentMatrix";

const loadExcelHelpers = () => import("../utils/assortmentMatrixExcel");

/* ─── tab normalizer ─── */
const normalizeTabKind = (tabId = "") => {
  const v = String(tabId).toLowerCase();
  if (v.includes("типов") || v.includes("typical") || v.includes("field") || v.includes("tipical")) return "typicalFields";
  if (v.includes("специф") || v.includes("spec") || v.includes("stific") || v.includes("notic")) return "specifications";
  return "matrix";
};

/* ─── styling ─── */
const cardClass = "card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl";
const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";
const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 transition";
const btnSecondary =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition";
const btnDanger =
  "inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-red-700 transition";

const toNumber = (value) => {
  const normalized = String(value ?? "").replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatPrice = (value) => {
  const num = toNumber(value);
  return num === 0 ? "" : num.toFixed(2);
};

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */

const AssortmentMatrixModule = ({ topTab = "matrix", restaurants = [], user = null }) => {
  const kind = normalizeTabKind(topTab);

  const {
    items,
    typicalFields,
    specifications,
    loading,
    error,
    addItem,
    updateItem,
    deleteItem,
    addField,
    updateField,
    deleteField,
    addSpec,
    updateSpec,
    deleteSpec,
  } = useAssortmentMatrix();

  if (loading) {
    return (
      <div className={cardClass}>
        <p className="text-sm text-slate-500 animate-pulse">Завантаження даних асортиментної матриці…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cardClass}>
        <p className="text-sm text-red-600">Помилка: {String(error?.message || error)}</p>
      </div>
    );
  }

  if (kind === "typicalFields") {
    return (
      <TypicalFieldsView
        typicalFields={typicalFields}
        addField={addField}
        updateField={updateField}
        deleteField={deleteField}
      />
    );
  }

  if (kind === "specifications") {
    return (
      <SpecificationsView
        specifications={specifications}
        items={items}
        typicalFields={typicalFields}
        addSpec={addSpec}
        updateSpec={updateSpec}
        deleteSpec={deleteSpec}
      />
    );
  }

  return (
    <MatrixView
      items={items}
      typicalFields={typicalFields}
      addItem={addItem}
      updateItem={updateItem}
      deleteItem={deleteItem}
    />
  );
};

export default AssortmentMatrixModule;

/* ═══════════════════════════════════════════════════
   MATRIX VIEW
   ═══════════════════════════════════════════════════ */

const MatrixView = ({ items, typicalFields, addItem, updateItem, deleteItem }) => {
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const fileInputRef = useRef(null);

  const categories = useMemo(() => {
    const set = new Set();
    items.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set).sort();
  }, [items]);

  const defaultCategories = useMemo(() => {
    const cats = new Set();
    typicalFields
      .filter((f) => f.type === "category" || f.name?.toLowerCase().includes("категорі"))
      .forEach((f) => {
        if (Array.isArray(f.options)) f.options.forEach((o) => cats.add(o));
        if (f.defaultValue) cats.add(f.defaultValue);
      });
    return Array.from(cats);
  }, [typicalFields]);

  const defaultUnits = useMemo(() => {
    const units = new Set();
    typicalFields
      .filter((f) => f.type === "unit" || f.name?.toLowerCase().includes("одиниц"))
      .forEach((f) => {
        if (Array.isArray(f.options)) f.options.forEach((o) => units.add(o));
        if (f.defaultValue) units.add(f.defaultValue);
      });
    return Array.from(units);
  }, [typicalFields]);

  const filtered = useMemo(() => {
    let result = [...items];
    const q = search.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (item) =>
          (item.name || "").toLowerCase().includes(q) ||
          (item.category || "").toLowerCase().includes(q) ||
          (item.code1C || "").toLowerCase().includes(q) ||
          (item.supplier || "").toLowerCase().includes(q)
      );
    }
    if (filterCategory) {
      result = result.filter((item) => item.category === filterCategory);
    }
    result.sort((a, b) => {
      const av = String(a[sortField] || "").toLowerCase();
      const bv = String(b[sortField] || "").toLowerCase();
      const cmp = av.localeCompare(bv, "uk");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [items, search, filterCategory, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }) =>
    sortField === field ? (
      sortDir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />
    ) : null;

  const handleExport = async () => {
    const { exportAssortmentMatrixToExcel } = await loadExcelHelpers();
    exportAssortmentMatrixToExcel(items, [], typicalFields);
  };

  const handleImport = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    try {
      const { importAssortmentMatrixFromExcel } = await loadExcelHelpers();
      const imported = await importAssortmentMatrixFromExcel(file);
      let count = 0;
      for (const item of imported) {
        await addItem(item);
        count++;
      }
      alert(`Імпортовано ${count} позицій`);
    } catch (err) {
      alert("Помилка імпорту: " + (err?.message || err));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleTemplate = async () => {
    const { downloadAssortmentMatrixTemplate } = await loadExcelHelpers();
    downloadAssortmentMatrixTemplate();
  };

  const handleDelete = async (id) => {
    if (!confirm("Видалити цю позицію?")) return;
    await deleteItem(id);
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* toolbar */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук за назвою, категорією, кодом…"
              className={inputClass + " !pl-9"}
            />
          </div>

          {categories.length > 0 && (
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className={inputClass + " !mt-0 !w-auto min-w-[160px]"}
            >
              <option value="">Усі категорії</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          )}

          <button type="button" className={btnPrimary} onClick={() => { setEditItem(null); setShowForm(true); }}>
            <Plus size={16} /> Додати
          </button>

          <button type="button" className={btnSecondary} onClick={handleExport}>
            <Download size={16} /> Експорт
          </button>

          <button type="button" className={btnSecondary} onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} /> Імпорт
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />

          <button type="button" className={btnSecondary} onClick={handleTemplate}>
            <FileDown size={16} /> Шаблон
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          Знайдено: {filtered.length} з {items.length}
        </p>
      </div>

      {/* form modal */}
      {showForm && (
        <MatrixItemForm
          item={editItem}
          categories={[...new Set([...categories, ...defaultCategories])]}
          units={defaultUnits}
          onSave={async (data) => {
            if (editItem?.id) {
              await updateItem(editItem.id, data);
            } else {
              await addItem(data);
            }
            setShowForm(false);
            setEditItem(null);
          }}
          onClose={() => { setShowForm(false); setEditItem(null); }}
        />
      )}

      {/* table */}
      <div className={cardClass + " overflow-x-auto"}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="px-3 py-2 cursor-pointer" onClick={() => handleSort("name")}>
                <span className="inline-flex items-center gap-1">Назва <SortIcon field="name" /></span>
              </th>
              <th className="px-3 py-2 cursor-pointer" onClick={() => handleSort("category")}>
                <span className="inline-flex items-center gap-1">Категорія <SortIcon field="category" /></span>
              </th>
              <th className="px-3 py-2">Од.</th>
              <th className="px-3 py-2">Постачальник</th>
              <th className="px-3 py-2">Код 1С</th>
              <th className="px-3 py-2 text-right">Закупівля</th>
              <th className="px-3 py-2 text-right">Націнка %</th>
              <th className="px-3 py-2 text-right">Продаж</th>
              <th className="px-3 py-2 text-right">Собіварт.</th>
              <th className="px-3 py-2 text-center">Активн.</th>
              <th className="px-3 py-2 text-center">Дії</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-slate-400">
                  Позицій не знайдено
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td className="px-3 py-2 font-medium">{item.name || "—"}</td>
                  <td className="px-3 py-2">{item.category || "—"}</td>
                  <td className="px-3 py-2">{item.unit || "—"}</td>
                  <td className="px-3 py-2">{item.supplier || "—"}</td>
                  <td className="px-3 py-2">{item.code1C || "—"}</td>
                  <td className="px-3 py-2 text-right">{formatPrice(item.purchasePrice)}</td>
                  <td className="px-3 py-2 text-right">{toNumber(item.markup) || "—"}</td>
                  <td className="px-3 py-2 text-right">{formatPrice(item.salePrice)}</td>
                  <td className="px-3 py-2 text-right">{formatPrice(item.costPrice)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${item.isActive === false ? "bg-red-400" : "bg-emerald-400"}`} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        className="p-1 hover:bg-slate-100 rounded"
                        title="Редагувати"
                        onClick={() => { setEditItem(item); setShowForm(true); }}
                      >
                        <Edit3 size={15} className="text-slate-500" />
                      </button>
                      <button
                        type="button"
                        className="p-1 hover:bg-red-50 rounded"
                        title="Видалити"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 size={15} className="text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ─── Matrix Item Form ─── */
const MatrixItemForm = ({ item, categories, units, onSave, onClose }) => {
  const [form, setForm] = useState({
    name: item?.name || "",
    category: item?.category || "",
    subCategory: item?.subCategory || "",
    unit: item?.unit || "",
    supplier: item?.supplier || "",
    code1C: item?.code1C || "",
    purchasePrice: item?.purchasePrice ?? "",
    markup: item?.markup ?? "",
    salePrice: item?.salePrice ?? "",
    costPrice: item?.costPrice ?? "",
    minStock: item?.minStock ?? "",
    maxStock: item?.maxStock ?? "",
    isActive: item?.isActive !== false,
    notes: item?.notes || "",
  });
  const [saving, setSaving] = useState(false);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  /* auto-calc sale price when purchase + markup change */
  useEffect(() => {
    const purchase = toNumber(form.purchasePrice);
    const markup = toNumber(form.markup);
    if (purchase > 0 && markup > 0) {
      const computed = purchase * (1 + markup / 100);
      set("salePrice", computed.toFixed(2));
    }
  }, [form.purchasePrice, form.markup]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert("Назва обов'язкова");
    setSaving(true);
    try {
      await onSave({
        ...form,
        purchasePrice: toNumber(form.purchasePrice),
        markup: toNumber(form.markup),
        salePrice: toNumber(form.salePrice),
        costPrice: toNumber(form.costPrice),
        minStock: toNumber(form.minStock),
        maxStock: toNumber(form.maxStock),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">{item ? "Редагування позиції" : "Нова позиція"}</h3>
        <button type="button" onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-600">Назва *</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Категорія</label>
          <input
            list="am-categories"
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
            className={inputClass}
          />
          <datalist id="am-categories">
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Підкатегорія</label>
          <input value={form.subCategory} onChange={(e) => set("subCategory", e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Одиниця виміру</label>
          <input
            list="am-units"
            value={form.unit}
            onChange={(e) => set("unit", e.target.value)}
            className={inputClass}
          />
          <datalist id="am-units">
            {units.map((u) => <option key={u} value={u} />)}
          </datalist>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Постачальник</label>
          <input value={form.supplier} onChange={(e) => set("supplier", e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Код 1С</label>
          <input value={form.code1C} onChange={(e) => set("code1C", e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Ціна закупівлі</label>
          <input
            type="number"
            step="0.01"
            value={form.purchasePrice}
            onChange={(e) => set("purchasePrice", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Націнка %</label>
          <input
            type="number"
            step="0.1"
            value={form.markup}
            onChange={(e) => set("markup", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Ціна продажу</label>
          <input
            type="number"
            step="0.01"
            value={form.salePrice}
            onChange={(e) => set("salePrice", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Собівартість</label>
          <input
            type="number"
            step="0.01"
            value={form.costPrice}
            onChange={(e) => set("costPrice", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Мін. залишок</label>
          <input
            type="number"
            step="1"
            value={form.minStock}
            onChange={(e) => set("minStock", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Макс. залишок</label>
          <input
            type="number"
            step="1"
            value={form.maxStock}
            onChange={(e) => set("maxStock", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Примітки</label>
          <input value={form.notes} onChange={(e) => set("notes", e.target.value)} className={inputClass} />
        </div>

        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
              className="rounded border-slate-300"
            />
            Активний
          </label>
        </div>

        <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className={btnPrimary}>
            <Save size={16} /> {saving ? "Зберігаю…" : "Зберегти"}
          </button>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Скасувати
          </button>
        </div>
      </form>
    </div>
  );
};

/* ═══════════════════════════════════════════════════
   TYPICAL FIELDS VIEW
   ═══════════════════════════════════════════════════ */

const FIELD_TYPES = [
  { value: "category", label: "Категорія" },
  { value: "unit", label: "Одиниця виміру" },
  { value: "supplier", label: "Постачальник" },
  { value: "text", label: "Текстове поле" },
  { value: "number", label: "Числове поле" },
  { value: "select", label: "Вибір (список)" },
];

const TypicalFieldsView = ({ typicalFields, addField, updateField, deleteField }) => {
  const [showForm, setShowForm] = useState(false);
  const [editField, setEditField] = useState(null);

  const handleDelete = async (id) => {
    if (!confirm("Видалити це типове поле?")) return;
    await deleteField(id);
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className={cardClass}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">Типові поля асортиментної матриці</h3>
          <button
            type="button"
            className={btnPrimary}
            onClick={() => { setEditField(null); setShowForm(true); }}
          >
            <Plus size={16} /> Додати поле
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Типові поля визначають категорії, одиниці виміру, постачальників та інші параметри, які підтягуються у форму матриці.
        </p>
      </div>

      {showForm && (
        <TypicalFieldForm
          field={editField}
          onSave={async (data) => {
            if (editField?.id) {
              await updateField(editField.id, data);
            } else {
              await addField(data);
            }
            setShowForm(false);
            setEditField(null);
          }}
          onClose={() => { setShowForm(false); setEditField(null); }}
        />
      )}

      <div className={cardClass + " overflow-x-auto"}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="px-3 py-2">Назва поля</th>
              <th className="px-3 py-2">Тип</th>
              <th className="px-3 py-2">Значення / Опції</th>
              <th className="px-3 py-2 text-center">Обов'язк.</th>
              <th className="px-3 py-2 text-center">Дії</th>
            </tr>
          </thead>
          <tbody>
            {typicalFields.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-400">Типових полів ще немає</td>
              </tr>
            ) : (
              typicalFields.map((field) => (
                <tr key={field.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td className="px-3 py-2 font-medium">{field.name || "—"}</td>
                  <td className="px-3 py-2">
                    {FIELD_TYPES.find((t) => t.value === field.type)?.label || field.type || "—"}
                  </td>
                  <td className="px-3 py-2 max-w-[300px] truncate">
                    {Array.isArray(field.options) ? field.options.join(", ") : (field.defaultValue || "—")}
                  </td>
                  <td className="px-3 py-2 text-center">{field.required ? "✓" : "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        className="p-1 hover:bg-slate-100 rounded"
                        title="Редагувати"
                        onClick={() => { setEditField(field); setShowForm(true); }}
                      >
                        <Edit3 size={15} className="text-slate-500" />
                      </button>
                      <button
                        type="button"
                        className="p-1 hover:bg-red-50 rounded"
                        title="Видалити"
                        onClick={() => handleDelete(field.id)}
                      >
                        <Trash2 size={15} className="text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ─── Typical Field Form ─── */
const TypicalFieldForm = ({ field, onSave, onClose }) => {
  const [form, setForm] = useState({
    name: field?.name || "",
    type: field?.type || "text",
    defaultValue: field?.defaultValue || "",
    required: field?.required || false,
    options: Array.isArray(field?.options) ? field.options.join("\n") : "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const showOptions = ["category", "unit", "supplier", "select"].includes(form.type);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert("Назва обов'язкова");
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        type: form.type,
        defaultValue: form.defaultValue.trim(),
        required: form.required,
        options: showOptions
          ? form.options.split("\n").map((s) => s.trim()).filter(Boolean)
          : [],
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">{field ? "Редагування поля" : "Нове типове поле"}</h3>
        <button type="button" onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-600">Назва поля *</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Тип</label>
          <select value={form.type} onChange={(e) => set("type", e.target.value)} className={inputClass}>
            {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Значення за замовчуванням</label>
          <input value={form.defaultValue} onChange={(e) => set("defaultValue", e.target.value)} className={inputClass} />
        </div>

        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.required}
              onChange={(e) => set("required", e.target.checked)}
              className="rounded border-slate-300"
            />
            Обов'язкове
          </label>
        </div>

        {showOptions && (
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-600">
              Опції (кожна з нового рядка)
            </label>
            <textarea
              rows={5}
              value={form.options}
              onChange={(e) => set("options", e.target.value)}
              className={inputClass + " !h-auto"}
              placeholder={"Опція 1\nОпція 2\nОпція 3"}
            />
          </div>
        )}

        <div className="sm:col-span-2 flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className={btnPrimary}>
            <Save size={16} /> {saving ? "Зберігаю…" : "Зберегти"}
          </button>
          <button type="button" className={btnSecondary} onClick={onClose}>Скасувати</button>
        </div>
      </form>
    </div>
  );
};

/* ═══════════════════════════════════════════════════
   SPECIFICATIONS VIEW
   ═══════════════════════════════════════════════════ */

const SpecificationsView = ({ specifications, items, typicalFields, addSpec, updateSpec, deleteSpec }) => {
  const [search, setSearch] = useState("");
  const [filterDish, setFilterDish] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editSpec, setEditSpec] = useState(null);
  const fileInputRef = useRef(null);

  const dishNames = useMemo(() => {
    const set = new Set();
    specifications.forEach((s) => { if (s.dishName) set.add(s.dishName); });
    return Array.from(set).sort();
  }, [specifications]);

  const ingredientOptions = useMemo(() => {
    return items.map((item) => ({ name: item.name, unit: item.unit, id: item.id }));
  }, [items]);

  const filtered = useMemo(() => {
    let result = [...specifications];
    const q = search.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (s) =>
          (s.dishName || "").toLowerCase().includes(q) ||
          (s.ingredientName || "").toLowerCase().includes(q) ||
          (s.category || "").toLowerCase().includes(q)
      );
    }
    if (filterDish) {
      result = result.filter((s) => s.dishName === filterDish);
    }
    return result;
  }, [specifications, search, filterDish]);

  /* group by dish */
  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((spec) => {
      const key = spec.dishName || "(Без назви)";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(spec);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, "uk"));
  }, [filtered]);

  const handleDelete = async (id) => {
    if (!confirm("Видалити цей рядок специфікації?")) return;
    await deleteSpec(id);
  };

  const handleExport = async () => {
    const { exportAssortmentMatrixToExcel } = await loadExcelHelpers();
    exportAssortmentMatrixToExcel(items, specifications, typicalFields, "assortment_specifications.xlsx");
  };

  const handleImport = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    try {
      const { importAssortmentSpecsFromExcel } = await loadExcelHelpers();
      const imported = await importAssortmentSpecsFromExcel(file);
      let count = 0;
      for (const spec of imported) {
        await addSpec(spec);
        count++;
      }
      alert(`Імпортовано ${count} рядків специфікацій`);
    } catch (err) {
      alert("Помилка імпорту: " + (err?.message || err));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* toolbar */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук за стравою, інгредієнтом…"
              className={inputClass + " !pl-9"}
            />
          </div>

          {dishNames.length > 0 && (
            <select
              value={filterDish}
              onChange={(e) => setFilterDish(e.target.value)}
              className={inputClass + " !mt-0 !w-auto min-w-[160px]"}
            >
              <option value="">Усі страви</option>
              {dishNames.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}

          <button type="button" className={btnPrimary} onClick={() => { setEditSpec(null); setShowForm(true); }}>
            <Plus size={16} /> Додати
          </button>

          <button type="button" className={btnSecondary} onClick={handleExport}>
            <Download size={16} /> Експорт
          </button>

          <button type="button" className={btnSecondary} onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} /> Імпорт
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
        </div>

        <p className="mt-2 text-xs text-slate-500">
          Специфікацій: {filtered.length} з {specifications.length} | Страв: {grouped.length}
        </p>
      </div>

      {/* form */}
      {showForm && (
        <SpecificationForm
          spec={editSpec}
          ingredientOptions={ingredientOptions}
          onSave={async (data) => {
            if (editSpec?.id) {
              await updateSpec(editSpec.id, data);
            } else {
              await addSpec(data);
            }
            setShowForm(false);
            setEditSpec(null);
          }}
          onClose={() => { setShowForm(false); setEditSpec(null); }}
        />
      )}

      {/* grouped cards */}
      {grouped.length === 0 ? (
        <div className={cardClass}>
          <p className="text-center text-slate-400 py-6">Специфікацій ще немає</p>
        </div>
      ) : (
        grouped.map(([dishName, specs]) => {
          const totalCost = specs.reduce((s, sp) => s + toNumber(sp.portionCost), 0);
          return (
            <div key={dishName} className={cardClass}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-slate-800">{dishName}</h4>
                <span className="text-xs text-slate-500">
                  Собівартість порції: <strong>{totalCost.toFixed(2)} грн</strong>
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-2 py-1">Інгредієнт</th>
                    <th className="px-2 py-1">Категорія</th>
                    <th className="px-2 py-1 text-right">Кількість</th>
                    <th className="px-2 py-1">Од.</th>
                    <th className="px-2 py-1 text-right">Вихід (г)</th>
                    <th className="px-2 py-1 text-right">Собіварт.</th>
                    <th className="px-2 py-1 text-center">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {specs.map((spec) => (
                    <tr key={spec.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                      <td className="px-2 py-1">{spec.ingredientName || "—"}</td>
                      <td className="px-2 py-1">{spec.category || "—"}</td>
                      <td className="px-2 py-1 text-right">{toNumber(spec.qty) || "—"}</td>
                      <td className="px-2 py-1">{spec.unit || "—"}</td>
                      <td className="px-2 py-1 text-right">{toNumber(spec.portionOutput) || "—"}</td>
                      <td className="px-2 py-1 text-right">{formatPrice(spec.portionCost)}</td>
                      <td className="px-2 py-1 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            className="p-1 hover:bg-slate-100 rounded"
                            title="Редагувати"
                            onClick={() => { setEditSpec(spec); setShowForm(true); }}
                          >
                            <Edit3 size={14} className="text-slate-500" />
                          </button>
                          <button
                            type="button"
                            className="p-1 hover:bg-red-50 rounded"
                            title="Видалити"
                            onClick={() => handleDelete(spec.id)}
                          >
                            <Trash2 size={14} className="text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </div>
  );
};

/* ─── Specification Form ─── */
const SpecificationForm = ({ spec, ingredientOptions, onSave, onClose }) => {
  const [form, setForm] = useState({
    dishName: spec?.dishName || "",
    category: spec?.category || "",
    ingredientName: spec?.ingredientName || "",
    qty: spec?.qty ?? "",
    unit: spec?.unit || "",
    portionOutput: spec?.portionOutput ?? "",
    portionCost: spec?.portionCost ?? "",
    notes: spec?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleIngredientSelect = (name) => {
    const match = ingredientOptions.find((i) => i.name === name);
    set("ingredientName", name);
    if (match?.unit) set("unit", match.unit);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.dishName.trim() && !form.ingredientName.trim()) {
      return alert("Вкажіть назву страви або інгредієнт");
    }
    setSaving(true);
    try {
      await onSave({
        dishName: form.dishName.trim(),
        category: form.category.trim(),
        ingredientName: form.ingredientName.trim(),
        qty: toNumber(form.qty),
        unit: form.unit.trim(),
        portionOutput: toNumber(form.portionOutput),
        portionCost: toNumber(form.portionCost),
        notes: form.notes.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">{spec ? "Редагування специфікації" : "Нова специфікація"}</h3>
        <button type="button" onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X size={18} /></button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-600">Назва страви *</label>
          <input value={form.dishName} onChange={(e) => set("dishName", e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Категорія</label>
          <input value={form.category} onChange={(e) => set("category", e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Інгредієнт</label>
          <input
            list="am-ingredients"
            value={form.ingredientName}
            onChange={(e) => handleIngredientSelect(e.target.value)}
            className={inputClass}
          />
          <datalist id="am-ingredients">
            {ingredientOptions.map((i) => <option key={i.id} value={i.name} />)}
          </datalist>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Кількість</label>
          <input
            type="number"
            step="0.001"
            value={form.qty}
            onChange={(e) => set("qty", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Одиниця</label>
          <input value={form.unit} onChange={(e) => set("unit", e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Вихід порції (г)</label>
          <input
            type="number"
            step="0.1"
            value={form.portionOutput}
            onChange={(e) => set("portionOutput", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Собівартість порції</label>
          <input
            type="number"
            step="0.01"
            value={form.portionCost}
            onChange={(e) => set("portionCost", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Примітки</label>
          <input value={form.notes} onChange={(e) => set("notes", e.target.value)} className={inputClass} />
        </div>

        <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className={btnPrimary}>
            <Save size={16} /> {saving ? "Зберігаю…" : "Зберегти"}
          </button>
          <button type="button" className={btnSecondary} onClick={onClose}>Скасувати</button>
        </div>
      </form>
    </div>
  );
};
