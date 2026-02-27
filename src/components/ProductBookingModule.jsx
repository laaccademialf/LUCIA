import { useEffect, useMemo, useState } from "react";
import { Package, ShoppingCart, ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { useProductBooking } from "../hooks/useProductBooking";

const normalizeTabKind = (tabId = "") => {
  const value = String(tabId).toLowerCase();
  if (value.includes("vendor") || value.includes("supplier") || value.includes("постач")) return "suppliers";
  if (
    value.includes("typical") ||
    value.includes("typcal") ||
    value.includes("field") ||
    value.includes("category") ||
    value.includes("unit") ||
    value.includes("типов") ||
    (value.includes("typ") && value.includes("cal"))
  ) return "typicalFields";
  if (value.includes("product") || value.includes("admin") && value.includes("prod")) return "products";
  if (value.includes("order") || value.includes("manage")) return "orders";
  return "booking";
};

const cardClass = "card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl";
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoney = (value) => `${toNumber(value).toFixed(2)} грн`;

const hasProcurementAccess = (user) => {
  const roleValue = String(user?.role || "").toLowerCase();
  const workRoleValue = String(user?.workRole || "").toLowerCase();
  const terms = ["admin", "procurement", "purchasing", "закуп", "закупівл", "постач"];
  return terms.some((term) => roleValue.includes(term) || workRoleValue.includes(term));
};

function ProductAdminTab({ products, suppliers, categories, units, canManageProducts, addProduct, updateProduct, deleteProduct }) {
  const [draft, setDraft] = useState({ name: "", category: "", unit: "", supplier: "", unitPrice: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return products.filter((item) => {
      const bySearch = normalizedSearch
        ? [item.name, item.category, item.unit, item.supplier]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch)
        : true;
      const byCategory = categoryFilter ? item.category === categoryFilter : true;
      const bySupplier = supplierFilter ? item.supplier === supplierFilter : true;
      const byStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "active"
            ? item.isActive !== false
            : item.isActive === false;

      return bySearch && byCategory && bySupplier && byStatus;
    });
  }, [products, searchTerm, categoryFilter, supplierFilter, statusFilter]);

  const handleAdd = async () => {
    if (!draft.name.trim() || !draft.category.trim() || !draft.unit.trim() || !draft.supplier.trim()) return;
    const unitPrice = toNumber(draft.unitPrice);
    const newProduct = {
      name: draft.name.trim(),
      category: draft.category.trim(),
      unit: draft.unit.trim(),
      supplier: draft.supplier.trim(),
      unitPrice,
      isActive: true,
    };
    const result = await addProduct(newProduct);
    if (!result.success) {
      alert("Не вдалося додати продукт у базу.");
      return;
    }
    setDraft({ name: "", category: "", unit: "", supplier: "", unitPrice: "" });
  };

  const toggleActive = async (item) => {
    const { id, ...payload } = item;
    const result = await updateProduct(id, { ...payload, isActive: !item.isActive });
    if (!result.success) {
      alert("Не вдалося оновити статус продукту.");
    }
  };

  const removeProduct = async (id) => {
    const result = await deleteProduct(id);
    if (!result.success) {
      alert("Не вдалося видалити продукт.");
    }
  };

  return (
    <div className={cardClass}>
      <div className="flex items-center gap-2 mb-4">
        <Package size={18} className="text-indigo-600" />
        <h2 className="text-lg font-semibold">Адміністрування продуктів</h2>
      </div>

      {!canManageProducts && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Лише адміністратор або відділ закупівель може змінювати довідник продуктів.
        </div>
      )}

      {canManageProducts && (
        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
          <div>
            <label className="text-sm font-semibold text-slate-800">Назва</label>
            <input className={inputClass} value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Категорія</label>
            <select className={inputClass} value={draft.category} onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))}>
              <option value="">Оберіть категорію</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Одиниця</label>
            <select className={inputClass} value={draft.unit} onChange={(e) => setDraft((p) => ({ ...p, unit: e.target.value }))}>
              <option value="">Оберіть одиницю</option>
              {units.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Постачальник</label>
            <select className={inputClass} value={draft.supplier} onChange={(e) => setDraft((p) => ({ ...p, supplier: e.target.value }))}>
              <option value="">Оберіть постачальника</option>
              {suppliers.map((supplier) => (
                <option key={supplier} value={supplier}>{supplier}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Ціна за одиницю (грн)</label>
            <input type="number" min="0" step="0.01" className={inputClass} value={draft.unitPrice} onChange={(e) => setDraft((p) => ({ ...p, unitPrice: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleAdd}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              <Plus size={16} /> Додати продукт
            </button>
          </div>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label className="text-sm font-semibold text-slate-800">Пошук по продуктах</label>
          <input
            className={inputClass}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Назва, категорія, постачальник, од. вим."
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Фільтр категорії</label>
          <select className={inputClass} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Всі категорії</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Фільтр постачальника</label>
          <select className={inputClass} value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
            <option value="">Всі постачальники</option>
            {suppliers.map((supplier) => (
              <option key={supplier} value={supplier}>{supplier}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col justify-end gap-2">
          <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Всі статуси</option>
            <option value="active">Активні</option>
            <option value="inactive">Вимкнені</option>
          </select>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            onClick={() => {
              setSearchTerm("");
              setCategoryFilter("");
              setSupplierFilter("");
              setStatusFilter("all");
            }}
          >
            Скинути фільтри
          </button>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between text-xs font-semibold text-slate-600">
        <span>Показано {filteredProducts.length} з {products.length}</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left">Назва</th>
              <th className="px-3 py-2 text-left">Категорія</th>
              <th className="px-3 py-2 text-left">Одиниця</th>
              <th className="px-3 py-2 text-left">Ціна за од.</th>
              <th className="px-3 py-2 text-left">Постачальник</th>
              <th className="px-3 py-2 text-left">Статус</th>
              {canManageProducts && <th className="px-3 py-2 text-left">Дії</th>}
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((item) => (
              <tr key={item.id} className="border-t border-slate-200">
                <td className="px-3 py-2 font-medium text-slate-900">{item.name}</td>
                <td className="px-3 py-2">{item.category}</td>
                <td className="px-3 py-2">{item.unit}</td>
                <td className="px-3 py-2">{formatMoney(item.unitPrice)}</td>
                <td className="px-3 py-2">{item.supplier || "-"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                    {item.isActive ? "Активний" : "Вимкнений"}
                  </span>
                </td>
                {canManageProducts && (
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button type="button" className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-100" onClick={() => toggleActive(item)}>
                        {item.isActive ? "Вимкнути" : "Увімкнути"}
                      </button>
                      <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-500" onClick={() => removeProduct(item.id)}>
                        <Trash2 size={14} /> Видалити
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={canManageProducts ? 7 : 6} className="px-3 py-6 text-center text-slate-500">
                  За поточними фільтрами продукти не знайдено.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SuppliersAdminTab({ suppliers, canManage, createSupplier, updateSupplier, removeSupplier }) {
  const [newSupplierName, setNewSupplierName] = useState("");

  const addSupplier = async () => {
    const name = newSupplierName.trim();
    if (!name) return;
    const exists = suppliers.some((item) => String(item.name || "").trim().toLowerCase() === name.toLowerCase());
    if (exists) {
      alert("Такий постачальник вже існує.");
      return;
    }
    const result = await createSupplier({ name, isActive: true });
    if (!result.success) {
      alert(`Не вдалося додати постачальника: ${result?.error?.message || "невідома помилка"}`);
      return;
    }
    setNewSupplierName("");
  };

  const toggleActive = async (item) => {
    const { id, ...payload } = item;
    const result = await updateSupplier(id, { ...payload, isActive: !item.isActive });
    if (!result.success) {
      alert("Не вдалося оновити статус постачальника.");
    }
  };

  return (
    <div className={cardClass}>
      <div className="flex items-center gap-2 mb-4">
        <Package size={18} className="text-indigo-600" />
        <h2 className="text-lg font-semibold">Постачальники</h2>
      </div>

      {canManage && (
        <div className="mb-4 flex flex-col gap-2 md:flex-row">
          <input className={inputClass} value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} placeholder="Назва постачальника" />
          <button type="button" onClick={addSupplier} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
            Додати
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left">Назва</th>
              <th className="px-3 py-2 text-left">Статус</th>
              {canManage && <th className="px-3 py-2 text-left">Дії</th>}
            </tr>
          </thead>
          <tbody>
            {suppliers.map((item) => (
              <tr key={item.id} className="border-t border-slate-200">
                <td className="px-3 py-2 font-medium text-slate-900">{item.name}</td>
                <td className="px-3 py-2">{item.isActive ? "Активний" : "Вимкнений"}</td>
                {canManage && (
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button type="button" className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-100" onClick={() => toggleActive(item)}>
                        {item.isActive ? "Вимкнути" : "Увімкнути"}
                      </button>
                      <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-500" onClick={() => removeSupplier(item.id)}>
                        <Trash2 size={14} /> Видалити
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={canManage ? 3 : 2} className="px-3 py-6 text-center text-slate-500">Постачальники ще не додані.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TypicalFieldsTab({ fields, canManage, createTypicalField, updateTypicalField, removeTypicalField }) {
  const [type, setType] = useState("category");
  const [name, setName] = useState("");

  const addField = async () => {
    const value = name.trim();
    if (!value) return;
    const exists = fields.some(
      (item) => item.type === type && String(item.name || "").trim().toLowerCase() === value.toLowerCase()
    );
    if (exists) {
      alert("Таке типове поле вже існує.");
      return;
    }
    const result = await createTypicalField({ type, name: value, isActive: true });
    if (!result.success) {
      alert(`Не вдалося додати типове поле: ${result?.error?.message || "невідома помилка"}`);
      return;
    }
    setName("");
  };

  const grouped = useMemo(() => {
    return {
      category: fields.filter((item) => item.type === "category"),
      unit: fields.filter((item) => item.type === "unit"),
    };
  }, [fields]);

  const toggleActive = async (item) => {
    const { id, ...payload } = item;
    const result = await updateTypicalField(id, { ...payload, isActive: !item.isActive });
    if (!result.success) {
      alert("Не вдалося оновити типове поле.");
    }
  };

  return (
    <div className={cardClass}>
      <div className="flex items-center gap-2 mb-4">
        <Package size={18} className="text-indigo-600" />
        <h2 className="text-lg font-semibold">Типові поля</h2>
      </div>

      {canManage && (
        <div className="mb-4 flex flex-col gap-2 md:flex-row">
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="category">Категорія</option>
            <option value="unit">Одиниця вимірювання</option>
          </select>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Напр. Овочі або кг" />
          <button type="button" onClick={addField} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
            Додати
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[{ key: "category", label: "Категорії" }, { key: "unit", label: "Одиниці вимірювання" }].map((group) => (
          <div key={group.key} className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 font-semibold text-slate-900">{group.label}</p>
            <div className="space-y-2">
              {grouped[group.key].map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded border border-slate-200 px-2 py-1">
                  <span className="text-sm">{item.name}</span>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <button type="button" className="rounded border border-slate-300 px-2 py-0.5 text-xs font-semibold" onClick={() => toggleActive(item)}>
                        {item.isActive ? "Вимкнути" : "Увімкнути"}
                      </button>
                      <button type="button" className="rounded border border-red-200 px-2 py-0.5 text-xs font-semibold text-red-700" onClick={() => removeTypicalField(item.id)}>
                        Видалити
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {grouped[group.key].length === 0 && <div className="text-sm text-slate-500">Поки порожньо.</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookingTab({ products, orders, createOrder, restaurants, user }) {
  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);
  const pageSizeOptions = [12, 25, 50];
  const [restaurantId, setRestaurantId] = useState(user?.role === "admin" ? "" : String(user?.restaurant || ""));
  const [requiredDate, setRequiredDate] = useState("");
  const [comment, setComment] = useState("");
  const [quantities, setQuantities] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(12);

  const availableRestaurants = useMemo(() => {
    if (user?.role === "admin") return restaurants;
    return restaurants.filter((r) => String(r.id) === String(user?.restaurant));
  }, [restaurants, user]);

  const myOrders = useMemo(() => {
    if (user?.role === "admin") return orders;
    return orders.filter((order) => String(order.restaurantId) === String(user?.restaurant));
  }, [orders, user]);

  const availableCategories = useMemo(() => {
    return Array.from(new Set(activeProducts.map((product) => product.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "uk"));
  }, [activeProducts]);

  const availableSuppliers = useMemo(() => {
    return Array.from(new Set(activeProducts.map((product) => product.supplier).filter(Boolean))).sort((a, b) => a.localeCompare(b, "uk"));
  }, [activeProducts]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return activeProducts.filter((product) => {
      const bySearch = normalizedSearch
        ? [product.name, product.category, product.supplier, product.unit]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch)
        : true;
      const byCategory = categoryFilter ? product.category === categoryFilter : true;
      const bySupplier = supplierFilter ? product.supplier === supplierFilter : true;
      const bySelected = showOnlySelected ? toNumber(quantities[product.id]) > 0 : true;
      return bySearch && byCategory && bySupplier && bySelected;
    });
  }, [activeProducts, searchTerm, categoryFilter, supplierFilter, showOnlySelected, quantities]);

  const keywordPool = useMemo(() => {
    return Array.from(
      new Set(
        activeProducts
          .flatMap((product) => [product.name, product.category, product.supplier, product.unit])
          .filter(Boolean)
      )
    );
  }, [activeProducts]);

  const keywordSuggestions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    return keywordPool
      .filter((keyword) => keyword.toLowerCase().includes(term))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(term) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(term) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.localeCompare(b, "uk");
      })
      .slice(0, 8);
  }, [keywordPool, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / rowsPerPage));

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredProducts.slice(start, start + rowsPerPage);
  }, [filteredProducts, currentPage, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, supplierFilter, showOnlySelected]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [rowsPerPage]);

  const selectedItems = useMemo(() => {
    return activeProducts
      .map((product) => {
        const qty = toNumber(quantities[product.id]);
        if (qty <= 0) return null;
        const unitPrice = toNumber(product.unitPrice);
        return {
          id: product.id,
          name: product.name,
          category: product.category,
          supplier: product.supplier,
          unit: product.unit,
          qty,
          unitPrice,
          amount: qty * unitPrice,
        };
      })
      .filter(Boolean);
  }, [activeProducts, quantities]);

  const draftTotalAmount = useMemo(() => {
    return activeProducts.reduce((sum, product) => {
      const qty = toNumber(quantities[product.id]);
      const unitPrice = toNumber(product.unitPrice);
      return sum + qty * unitPrice;
    }, 0);
  }, [activeProducts, quantities]);

  const handleSubmitOrder = async () => {
    const orderItems = activeProducts
      .map((product) => {
        const raw = quantities[product.id];
        const qty = Number(raw);
        if (!raw || Number.isNaN(qty) || qty <= 0) return null;
        return {
          productId: product.id,
          productName: product.name,
          category: product.category,
          unit: product.unit,
          qty,
          unitPrice: toNumber(product.unitPrice),
          amount: qty * toNumber(product.unitPrice),
          supplier: product.supplier || "",
        };
      })
      .filter(Boolean);

    if (!restaurantId || !requiredDate || orderItems.length === 0) {
      alert("Оберіть ресторан, дату поставки та введіть хоча б одну кількість.");
      return;
    }

    const restaurantName = restaurants.find((r) => String(r.id) === String(restaurantId))?.name || "Невідомий ресторан";
    const totalItems = orderItems.reduce((sum, item) => sum + item.qty, 0);
    const totalAmount = orderItems.reduce((sum, item) => sum + toNumber(item.amount), 0);

    const newOrder = {
      createdBy: user?.displayName || user?.fullName || user?.email || "Користувач",
      createdById: user?.uid || "",
      restaurantId: String(restaurantId),
      restaurantName,
      requiredDate,
      comment: comment.trim(),
      status: "new",
      items: orderItems,
      totalItems,
      totalAmount,
    };

    const result = await createOrder(newOrder);
    if (!result.success) {
      alert("Не вдалося зберегти заявку в базу.");
      return;
    }
    setQuantities({});
    setComment("");
    alert("Замовлення сформовано та передано у відділ закупівель.");
  };

  return (
    <div className="space-y-5">
      <div className={cardClass}>
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart size={18} className="text-indigo-600" />
          <h2 className="text-lg font-semibold">Формування замовлення продукції</h2>
        </div>

        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-900">Реквізити заявки</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="text-sm font-semibold text-slate-800">Ресторан</label>
              <select
                className={inputClass}
                value={restaurantId}
                onChange={(e) => setRestaurantId(e.target.value)}
                disabled={user?.role !== "admin"}
              >
                <option value="">Оберіть ресторан</option>
                {availableRestaurants.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800">Потрібна дата поставки</label>
              <input type="date" className={inputClass} value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800">Коментар</label>
              <input className={inputClass} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Напр. терміново до обіду" />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label className="text-sm font-semibold text-slate-800">Пошук</label>
            <input
              className={inputClass}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Назва, категорія, постачальник, од. вим."
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Категорія</label>
            <select className={inputClass} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Всі категорії</option>
              {availableCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Постачальник</label>
            <select className={inputClass} value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
              <option value="">Всі постачальники</option>
              {availableSuppliers.map((supplier) => (
                <option key={supplier} value={supplier}>{supplier}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={showOnlySelected} onChange={(e) => setShowOnlySelected(e.target.checked)} />
              Лише вибрані
            </label>
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              onClick={() => {
                setSearchTerm("");
                setCategoryFilter("");
                setSupplierFilter("");
                setShowOnlySelected(false);
              }}
            >
              Скинути фільтри
            </button>
          </div>
        </div>

        {keywordSuggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Підказки:</span>
            {keywordSuggestions.map((keyword) => (
              <button
                key={keyword}
                type="button"
                className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                onClick={() => setSearchTerm(keyword)}
              >
                {keyword}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">Продукт</th>
                <th className="px-3 py-2 text-left">Категорія</th>
                <th className="px-3 py-2 text-left">Постачальник</th>
                <th className="px-3 py-2 text-left">Од. вим.</th>
                <th className="px-3 py-2 text-left">Ціна за од.</th>
                <th className="px-3 py-2 text-left">Кількість</th>
                <th className="px-3 py-2 text-left">Сума</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map((product) => (
                <tr key={product.id} className="border-t border-slate-200">
                  <td className="px-3 py-2 font-medium text-slate-900">{product.name}</td>
                  <td className="px-3 py-2">{product.category}</td>
                  <td className="px-3 py-2">{product.supplier || "-"}</td>
                  <td className="px-3 py-2">{product.unit || "-"}</td>
                  <td className="px-3 py-2">{formatMoney(product.unitPrice)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                        value={quantities[product.id] || ""}
                        onChange={(e) => setQuantities((p) => ({ ...p, [product.id]: e.target.value }))}
                      />
                      <span className="text-xs text-slate-500">{product.unit}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {formatMoney(toNumber(quantities[product.id]) * toNumber(product.unitPrice))}
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    За поточними фільтрами продукти не знайдено.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredProducts.length > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 text-sm text-slate-700">
            <span>
              Показано {(currentPage - 1) * rowsPerPage + 1}-{Math.min(currentPage * rowsPerPage, filteredProducts.length)} з {filteredProducts.length}
            </span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                На сторінку
                <select
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                  value={rowsPerPage}
                  onChange={(e) => setRowsPerPage(Number(e.target.value))}
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              >
                Назад
              </button>
              <span className="text-xs text-slate-600">Сторінка {currentPage} / {totalPages}</span>
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Вперед
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">Моє замовлення перед відправкою</p>
            <p className="text-xs text-slate-600">Позицій: {selectedItems.length}</p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-2 py-2 text-left">Продукт</th>
                  <th className="px-2 py-2 text-left">Од. вим.</th>
                  <th className="px-2 py-2 text-left">Ціна</th>
                  <th className="px-2 py-2 text-left">К-сть</th>
                  <th className="px-2 py-2 text-left">Сума</th>
                  <th className="px-2 py-2 text-left">Дія</th>
                </tr>
              </thead>
              <tbody>
                {selectedItems.map((item) => (
                  <tr key={item.id} className="border-t border-slate-200">
                    <td className="px-2 py-2 font-medium text-slate-900">{item.name}</td>
                    <td className="px-2 py-2">{item.unit || "-"}</td>
                    <td className="px-2 py-2">{formatMoney(item.unitPrice)}</td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                        value={quantities[item.id] || ""}
                        onChange={(e) => setQuantities((p) => ({ ...p, [item.id]: e.target.value }))}
                      />
                    </td>
                    <td className="px-2 py-2 font-semibold text-slate-900">{formatMoney(item.amount)}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                        onClick={() => setQuantities((p) => ({ ...p, [item.id]: "" }))}
                      >
                        <Trash2 size={13} /> Прибрати
                      </button>
                    </td>
                  </tr>
                ))}
                {selectedItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-2 py-5 text-center text-slate-500">Ще не обрано жодної позиції.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-3 flex justify-end text-sm font-semibold text-slate-800">
          Загальна сума заявки: {formatMoney(draftTotalAmount)}
        </div>

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={handleSubmitOrder} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
            Сформувати заявку
          </button>
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="text-base font-semibold text-slate-900 mb-3">Мої заявки</h3>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">Дата</th>
                <th className="px-3 py-2 text-left">Ресторан</th>
                <th className="px-3 py-2 text-left">Позицій</th>
                <th className="px-3 py-2 text-left">Поставка</th>
                <th className="px-3 py-2 text-left">Сума</th>
                <th className="px-3 py-2 text-left">Статус</th>
              </tr>
            </thead>
            <tbody>
              {myOrders.map((order) => (
                <tr key={order.id} className="border-t border-slate-200">
                  <td className="px-3 py-2">{new Date(order.createdAt).toLocaleString("uk-UA")}</td>
                  <td className="px-3 py-2">{order.restaurantName}</td>
                  <td className="px-3 py-2">{order.items.length}</td>
                  <td className="px-3 py-2">{order.requiredDate}</td>
                  <td className="px-3 py-2 font-medium">{formatMoney(order.totalAmount)}</td>
                  <td className="px-3 py-2">{statusLabel(order.status)}</td>
                </tr>
              ))}
              {myOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">Заявок поки немає.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const statusLabel = (status) => {
  if (status === "new") return "Нова";
  if (status === "processing") return "В обробці";
  if (status === "sent") return "Надіслано постачальнику";
  if (status === "completed") return "Закрито";
  return status;
};

function OrdersManagementTab({ orders, updateOrder, canManageOrders, user }) {
  const [statusFilter, setStatusFilter] = useState("");

  const visibleOrders = useMemo(() => {
    const filteredByRole = canManageOrders
      ? orders
      : orders.filter((order) => String(order.restaurantId) === String(user?.restaurant || ""));
    return filteredByRole.filter((order) => (statusFilter ? order.status === statusFilter : true));
  }, [orders, statusFilter, canManageOrders, user]);

  const groupedBySupplier = useMemo(() => {
    const map = {};
    for (const order of visibleOrders) {
      for (const item of order.items || []) {
        const supplier = item.supplier || "Без постачальника";
        if (!map[supplier]) map[supplier] = [];
        map[supplier].push({
          orderId: order.id,
          restaurantName: order.restaurantName,
          requiredDate: order.requiredDate,
          productName: item.productName,
          qty: item.qty,
          unit: item.unit,
          unitPrice: toNumber(item.unitPrice),
          amount: toNumber(item.amount),
        });
      }
    }
    return map;
  }, [visibleOrders]);

  const overallSuppliersAmount = useMemo(() => {
    return Object.values(groupedBySupplier)
      .flat()
      .reduce((sum, item) => sum + toNumber(item.amount), 0);
  }, [groupedBySupplier]);

  const updateStatus = async (order, status) => {
    const { id, ...payload } = order;
    const result = await updateOrder(id, { ...payload, status });
    if (!result.success) {
      alert("Не вдалося оновити статус заявки.");
    }
  };

  return (
    <div className="space-y-5">
      <div className={cardClass}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} className="text-indigo-600" />
            <h2 className="text-lg font-semibold">Управління замовленнями</h2>
          </div>
          <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Всі статуси</option>
            <option value="new">Нові</option>
            <option value="processing">В обробці</option>
            <option value="sent">Надіслані постачальнику</option>
            <option value="completed">Закриті</option>
          </select>
        </div>

        {!canManageOrders && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Для повного управління заявками потрібна роль адміністратора/закупівель.
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">Створено</th>
                <th className="px-3 py-2 text-left">Ресторан</th>
                <th className="px-3 py-2 text-left">Поставка</th>
                <th className="px-3 py-2 text-left">Позицій</th>
                <th className="px-3 py-2 text-left">Одиниці</th>
                <th className="px-3 py-2 text-left">Сума</th>
                <th className="px-3 py-2 text-left">Статус</th>
                {canManageOrders && <th className="px-3 py-2 text-left">Дія</th>}
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((order) => (
                <tr key={order.id} className="border-t border-slate-200 align-top">
                  <td className="px-3 py-2">{new Date(order.createdAt).toLocaleString("uk-UA")}</td>
                  <td className="px-3 py-2">{order.restaurantName}</td>
                  <td className="px-3 py-2">{order.requiredDate}</td>
                  <td className="px-3 py-2">{order.items.length}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{Array.from(new Set((order.items || []).map((item) => item.unit).filter(Boolean))).join(", ") || "-"}</td>
                  <td className="px-3 py-2 font-medium">{formatMoney(order.totalAmount)}</td>
                  <td className="px-3 py-2">{statusLabel(order.status)}</td>
                  {canManageOrders && (
                    <td className="px-3 py-2">
                      <select
                        className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        value={order.status}
                        onChange={(e) => updateStatus(order, e.target.value)}
                      >
                        <option value="new">Нова</option>
                        <option value="processing">В обробці</option>
                        <option value="sent">Надіслано постачальнику</option>
                        <option value="completed">Закрито</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))}
              {visibleOrders.length === 0 && (
                <tr>
                  <td colSpan={canManageOrders ? 8 : 7} className="px-3 py-6 text-center text-slate-500">Заявок не знайдено.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="text-base font-semibold text-slate-900 mb-3">Зведення для постачальників</h3>
        <div className="space-y-3">
          {Object.entries(groupedBySupplier).map(([supplier, items]) => (
            <div key={supplier} className="rounded-lg border border-slate-200 p-3">
              <p className="font-semibold text-slate-900 mb-2">{supplier}</p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-slate-600">
                    <tr>
                      <th className="px-2 py-1 text-left">Ресторан</th>
                      <th className="px-2 py-1 text-left">Продукт</th>
                      <th className="px-2 py-1 text-left">Ціна</th>
                      <th className="px-2 py-1 text-left">К-сть</th>
                      <th className="px-2 py-1 text-left">Сума</th>
                      <th className="px-2 py-1 text-left">Поставка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={`${item.orderId}_${index}`} className="border-t border-slate-100">
                        <td className="px-2 py-1">{item.restaurantName}</td>
                        <td className="px-2 py-1">{item.productName}</td>
                        <td className="px-2 py-1">{formatMoney(item.unitPrice)}</td>
                        <td className="px-2 py-1">{item.qty} {item.unit}</td>
                        <td className="px-2 py-1 font-medium">{formatMoney(item.amount)}</td>
                        <td className="px-2 py-1">{item.requiredDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-right text-sm font-semibold text-slate-800">
                Разом по постачальнику: {formatMoney(items.reduce((sum, item) => sum + toNumber(item.amount), 0))}
              </p>
            </div>
          ))}
          {Object.keys(groupedBySupplier).length === 0 && (
            <div className="text-sm text-slate-500">Немає даних для формування замовлення постачальникам.</div>
          )}
          {Object.keys(groupedBySupplier).length > 0 && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-right text-base font-semibold text-indigo-900">
              Разом по всіх постачальниках: {formatMoney(overallSuppliersAmount)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProductBookingModule({ topTab, restaurants = [], user }) {
  const {
    products,
    orders,
    suppliers,
    typicalFields,
    loading,
    error,
    addProduct,
    updateProduct,
    deleteProduct,
    createOrder,
    updateOrder,
    createSupplier,
    updateSupplier,
    removeSupplier,
    createTypicalField,
    updateTypicalField,
    removeTypicalField,
  } = useProductBooking(true);

  const tabKind = normalizeTabKind(topTab);
  const canManageProducts = hasProcurementAccess(user);
  const canManageOrders = hasProcurementAccess(user);
  const availableSuppliers = useMemo(
    () => suppliers.filter((item) => item.isActive !== false).map((item) => item.name),
    [suppliers]
  );
  const availableCategories = useMemo(
    () => typicalFields.filter((item) => item.type === "category" && item.isActive !== false).map((item) => item.name),
    [typicalFields]
  );
  const availableUnits = useMemo(
    () => typicalFields.filter((item) => item.type === "unit" && item.isActive !== false).map((item) => item.name),
    [typicalFields]
  );

  if (loading) {
    return <div className={`${cardClass} text-sm text-slate-600`}>Завантаження даних з бази...</div>;
  }

  if (error) {
    return <div className={`${cardClass} text-sm text-red-600`}>Помилка завантаження даних модуля замовлень.</div>;
  }

  if (tabKind === "products") {
    return (
      <ProductAdminTab
        products={products}
        suppliers={availableSuppliers}
        categories={availableCategories}
        units={availableUnits}
          canManageProducts={canManageProducts}
        addProduct={addProduct}
        updateProduct={updateProduct}
        deleteProduct={deleteProduct}
      />
    );
  }

  if (tabKind === "suppliers") {
    return (
      <SuppliersAdminTab
        suppliers={suppliers}
        canManage={canManageProducts}
        createSupplier={createSupplier}
        updateSupplier={updateSupplier}
        removeSupplier={removeSupplier}
      />
    );
  }

  if (tabKind === "typicalFields") {
    return (
      <TypicalFieldsTab
        fields={typicalFields}
        canManage={canManageProducts}
        createTypicalField={createTypicalField}
        updateTypicalField={updateTypicalField}
        removeTypicalField={removeTypicalField}
      />
    );
  }

  if (tabKind === "orders") {
    return <OrdersManagementTab orders={orders} updateOrder={updateOrder} canManageOrders={canManageOrders} user={user} />;
  }

  return <BookingTab products={products} orders={orders} createOrder={createOrder} restaurants={restaurants} user={user} />;
}
