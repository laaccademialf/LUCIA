import { useEffect, useMemo, useState } from "react";
import { Package, ShoppingCart, ClipboardCheck, Plus, Trash2, Download, Upload, FileDown } from "lucide-react";
import { useProductBooking } from "../hooks/useProductBooking";
import { downloadProductsTemplate, exportInventoriesToExcel, exportProductsAndInventoriesToExcel, importProductsFromExcel } from "../utils/productInventoryExcel";

const normalizeTabKind = (tabId = "") => {
  const value = String(tabId).toLowerCase();
  if (value.includes("vendor") || value.includes("supplier") || value.includes("постач")) return "suppliers";
  if (
    value.includes("inventar") ||
    value.includes("inventory") ||
    value.includes("інвентар") ||
    value.includes("залишк")
  ) return "inventory";
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
  const normalized = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoney = (value) => `${toNumber(value).toFixed(2)} грн`;

const hasProcurementAccess = (user) => {
  const roleValue = String(user?.role || "").toLowerCase();
  const workRoleValue = String(user?.workRole || "").toLowerCase();
  const terms = ["admin", "procurement", "purchasing", "закуп", "закупівл", "постач"];
  return terms.some((term) => roleValue.includes(term) || workRoleValue.includes(term));
};

function ProductAdminTab({ products, suppliers, categories, units, inventories, canManageProducts, addProduct, updateProduct }) {
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
    if (!draft.name.trim() || !draft.category.trim() || !draft.unit.trim() || !draft.supplier.trim()) {
      alert("Заповніть обов'язкові поля: Назва, Категорія, Одиниця, Постачальник.");
      return;
    }
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

  const handleExportProductsAndInventories = () => {
    exportProductsAndInventoriesToExcel(products, inventories);
  };

  const handleImportProducts = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const importedProducts = await importProductsFromExcel(file);
      if (importedProducts.length === 0) {
        alert("У файлі не знайдено валідних продуктів для імпорту.");
        return;
      }

      let successCount = 0;
      let failCount = 0;

      for (const product of importedProducts) {
        const exists = products.some(
          (item) => String(item.name || "").trim().toLowerCase() === String(product.name || "").trim().toLowerCase()
        );

        if (exists) continue;

        const result = await addProduct(product);
        if (result.success) successCount += 1;
        else failCount += 1;
      }

      alert(`Імпорт завершено. Додано: ${successCount}. Помилок: ${failCount}.`);
    } catch (error) {
      console.error("Помилка імпорту продуктів:", error);
      alert("Не вдалося імпортувати файл продуктів.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className={cardClass}>
      <div className="flex items-center gap-2 mb-4">
        <Package size={18} className="text-indigo-600" />
        <h2 className="text-lg font-semibold">Адміністрування продуктів</h2>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".xlsx,.xls"
          ref={(input) => {
            window.productImportInput = input;
          }}
          style={{ display: "none" }}
          onChange={handleImportProducts}
        />
        {canManageProducts && (
          <>
            <button
              type="button"
              onClick={() => downloadProductsTemplate()}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-600 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-500"
            >
              <FileDown size={15} /> Шаблон
            </button>
            <button
              type="button"
              onClick={() => window.productImportInput?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              <Upload size={15} /> Імпорт продуктів
            </button>
          </>
        )}
        <button
          type="button"
          onClick={handleExportProductsAndInventories}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
        >
          <Download size={15} /> Експорт Ексель
        </button>
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

function InventoryTab({ products, inventories, restaurants, user, createInventory }) {
  const activeProducts = useMemo(() => products.filter((item) => item.isActive !== false), [products]);
  const [restaurantId, setRestaurantId] = useState(user?.role === "admin" ? "" : String(user?.restaurant || ""));
  const [quantities, setQuantities] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const inventoryDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const availableCategories = useMemo(() => {
    return Array.from(new Set(activeProducts.map((item) => item.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "uk"));
  }, [activeProducts]);

  const keywordSuggestions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    return activeProducts
      .map((item) => String(item.name || "").trim())
      .filter(Boolean)
      .filter((name) => name.toLowerCase().includes(term))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(term) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(term) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.localeCompare(b, "uk");
      })
      .slice(0, 8);
  }, [activeProducts, searchTerm]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return activeProducts.filter((item) => {
      const bySearch = normalizedSearch ? String(item.name || "").toLowerCase().includes(normalizedSearch) : true;
      const byCategory = categoryFilter ? String(item.category || "") === categoryFilter : true;
      return bySearch && byCategory;
    });
  }, [activeProducts, searchTerm, categoryFilter]);

  const adjustQuantity = (productId, delta) => {
    setQuantities((prev) => {
      const current = toNumber(prev[productId]);
      const next = Math.max(0, current + delta);
      return {
        ...prev,
        [productId]: next === 0 ? "" : String(next),
      };
    });
  };

  const availableRestaurants = useMemo(() => {
    if (user?.role === "admin") return restaurants;
    return restaurants.filter((item) => String(item.id) === String(user?.restaurant));
  }, [restaurants, user]);

  const visibleInventories = useMemo(() => {
    if (user?.role === "admin") return inventories;
    return inventories.filter((item) => String(item.restaurantId || "") === String(user?.restaurant || ""));
  }, [inventories, user]);

  const filledLines = useMemo(() => {
    return activeProducts
      .map((product) => {
        const qty = toNumber(quantities[product.id]);
        if (qty <= 0) return null;
        const unitPrice = toNumber(product.unitPrice);
        return {
          productId: product.id,
          productName: product.name,
          category: product.category,
          unit: product.unit,
          qty,
          unitPrice,
          amount: qty * unitPrice,
        };
      })
      .filter(Boolean);
  }, [activeProducts, quantities]);

  const handleSaveInventory = async () => {
    if (!restaurantId) {
      alert("Оберіть ресторан для інвентаризації.");
      return;
    }

    if (filledLines.length === 0) {
      alert("Введіть хоча б одну кількість більше 0.");
      return;
    }

    const restaurantName = restaurants.find((item) => String(item.id) === String(restaurantId))?.name || "Невідомий ресторан";
    const totalItems = filledLines.reduce((sum, item) => sum + toNumber(item.qty), 0);
    const totalAmount = filledLines.reduce((sum, item) => sum + toNumber(item.amount), 0);

    const payload = {
      restaurantId: String(restaurantId),
      restaurantName,
      inventoryDate,
      items: filledLines,
      totalItems,
      totalAmount,
      createdBy: user?.displayName || user?.fullName || user?.email || "Користувач",
      createdById: user?.uid || "",
    };

    const result = await createInventory(payload);
    if (!result.success) {
      alert("Не вдалося зберегти інвентаризацію.");
      return;
    }

    setQuantities({});
    alert("Інвентаризацію успішно збережено.");
  };

  const handleExportSingleInventory = (inventory) => {
    const safeDate = String(inventory?.inventoryDate || "inventory").replace(/[^0-9-]/g, "");
    const safeRestaurant = String(inventory?.restaurantName || "restaurant")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9а-яА-ЯіїєІЇЄґҐ_-]/g, "");
    const fileName = `inventory_${safeDate || "date"}_${safeRestaurant || "restaurant"}.xlsx`;
    exportInventoriesToExcel([inventory], fileName);
  };

  return (
    <div className="space-y-5">
      <div className={cardClass}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
          <ClipboardCheck size={18} className="text-indigo-600" />
          <h2 className="text-sm sm:text-lg font-semibold">Інвентаризація продуктів</h2>
          </div>
          <p className="text-xs sm:text-sm font-semibold text-slate-600">Дата: {inventoryDate}</p>
        </div>

        {user?.role === "admin" && (
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-1">
            <div>
              <label className="text-sm font-semibold text-slate-800">Ресторан</label>
              <select
                className={inputClass}
                value={restaurantId}
                onChange={(e) => setRestaurantId(e.target.value)}
              >
                <option value="">Оберіть ресторан</option>
                {availableRestaurants.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-2 sm:gap-3">
          <div>
            <label className="text-xs sm:text-sm font-semibold text-slate-800">Фільтр по категорії</label>
            <select
              className="mt-1 h-8 sm:h-9 w-full rounded-lg border border-slate-300 bg-white px-2 sm:px-3 py-1 text-xs sm:text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">Всі категорії</option>
              {availableCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs sm:text-sm font-semibold text-slate-800">Пошук по назві</label>
            <input
              className="mt-1 h-8 sm:h-9 w-full rounded-lg border border-slate-300 bg-white px-2 sm:px-3 py-1 text-xs sm:text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Введіть назву продукту"
              list="inventory-product-suggestions"
            />
            <datalist id="inventory-product-suggestions">
              {keywordSuggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="mb-0.5 grid grid-cols-[1fr_auto] items-center gap-2 px-2 py-0.5 leading-none text-[10px] sm:text-[11px] font-semibold text-slate-700 sm:grid-cols-[1.2fr_0.8fr_0.5fr_1fr]">
          <div>Продукт</div>
          <div className="hidden sm:block">Категорія</div>
          <div className="hidden sm:block">Одиниця</div>
          <div className="text-left">Кількість</div>
        </div>

        <div className="overflow-x-auto overflow-y-auto max-h-[300px] sm:max-h-[420px] rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id} className="border-t border-slate-200">
                  <td className="px-2 py-1 font-medium text-slate-900 text-[11px] sm:text-xs leading-tight whitespace-normal break-words">{product.name}</td>
                  <td className="hidden sm:table-cell px-2 py-1 text-xs">{product.category || "-"}</td>
                  <td className="hidden sm:table-cell px-2 py-1 text-xs">{product.unit || "-"}</td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                        onClick={() => adjustQuantity(product.id, -1)}
                        aria-label={`Зменшити кількість ${product.name}`}
                      >
                        −
                      </button>
                      <input
                        type="text"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        className="h-6 w-12 sm:w-16 rounded border border-slate-300 bg-white px-1 py-0 text-[11px] sm:text-xs"
                        value={quantities[product.id] || ""}
                        onChange={(e) => {
                          const rawValue = String(e.target.value || "");
                          const sanitized = rawValue.replace(/[^0-9.,]/g, "");
                          setQuantities((prev) => ({ ...prev, [product.id]: sanitized }));
                        }}
                      />
                      <button
                        type="button"
                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                        onClick={() => adjustQuantity(product.id, 1)}
                        aria-label={`Збільшити кількість ${product.name}`}
                      >
                        +
                      </button>
                      <span className="text-xs text-slate-500">{product.unit || "од."}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">За поточними фільтрами продукти не знайдено.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-700">Заповнених позицій: <span className="font-semibold">{filledLines.length}</span></p>
          <button
            type="button"
            onClick={handleSaveInventory}
            className="w-full sm:w-auto rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Зберегти інвентаризацію
          </button>
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="mb-3 text-base font-semibold text-slate-900">Проведені інвентаризації</h3>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">Дата</th>
                <th className="px-3 py-2 text-left">Ресторан</th>
                <th className="px-3 py-2 text-left">Позицій</th>
                <th className="px-3 py-2 text-left">Сума</th>
                <th className="px-3 py-2 text-left">Хто створив</th>
                <th className="px-3 py-2 text-left">Дії</th>
              </tr>
            </thead>
            <tbody>
              {visibleInventories.map((inventory) => (
                <tr key={inventory.id} className="border-t border-slate-200">
                  <td className="px-3 py-2">{inventory.inventoryDate || "-"}</td>
                  <td className="px-3 py-2">{inventory.restaurantName || "-"}</td>
                  <td className="px-3 py-2">{Array.isArray(inventory.items) ? inventory.items.length : 0}</td>
                  <td className="px-3 py-2 font-medium">{formatMoney(inventory.totalAmount)}</td>
                  <td className="px-3 py-2">{inventory.createdBy || "-"}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => handleExportSingleInventory(inventory)}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                    >
                      <Download size={14} /> Ексель
                    </button>
                  </td>
                </tr>
              ))}
              {visibleInventories.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">Інвентаризацій поки немає.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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

function OrdersManagementTab({ orders, updateOrder, createSupplierDispatch, canManageOrders, user }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [orderDateFrom, setOrderDateFrom] = useState("");
  const [orderDateTo, setOrderDateTo] = useState("");
  const [deliveryDateFrom, setDeliveryDateFrom] = useState("");
  const [deliveryDateTo, setDeliveryDateTo] = useState("");
  const [lineEdits, setLineEdits] = useState({});
  const [sendingSupplier, setSendingSupplier] = useState("");
  const [expandedSuppliers, setExpandedSuppliers] = useState({});
  const [expandedSummarySuppliers, setExpandedSummarySuppliers] = useState({});
  const [expandedRestaurants, setExpandedRestaurants] = useState({});

  const visibleOrders = useMemo(() => {
    const filteredByRole = canManageOrders
      ? orders
      : orders.filter((order) => String(order.restaurantId) === String(user?.restaurant || ""));

    return filteredByRole.filter((order) => {
      const byStatus = statusFilter ? order.status === statusFilter : true;

      const orderDate = String(order.createdAt || "").slice(0, 10);
      const byOrderDateFrom = orderDateFrom ? orderDate && orderDate >= orderDateFrom : true;
      const byOrderDateTo = orderDateTo ? orderDate && orderDate <= orderDateTo : true;

      const deliveryDate = String(order.requiredDate || "");
      const byDeliveryFrom = deliveryDateFrom ? deliveryDate && deliveryDate >= deliveryDateFrom : true;
      const byDeliveryTo = deliveryDateTo ? deliveryDate && deliveryDate <= deliveryDateTo : true;

      return byStatus && byOrderDateFrom && byOrderDateTo && byDeliveryFrom && byDeliveryTo;
    });
  }, [
    orders,
    statusFilter,
    canManageOrders,
    user,
    orderDateFrom,
    orderDateTo,
    deliveryDateFrom,
    deliveryDateTo,
  ]);

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

  const consolidatedBySupplier = useMemo(() => {
    const supplierMap = {};

    for (const order of visibleOrders) {
      for (const item of order.items || []) {
        if (item.sentToSupplier || order.status === "completed") continue;

        const supplier = item.supplier || "Без постачальника";
        if (!supplierMap[supplier]) supplierMap[supplier] = {};

        const productKey = item.productId || item.productName || "Без назви";
        const key = [productKey, item.unit || "", order.requiredDate || ""].join("|");

        if (!supplierMap[supplier][key]) {
          supplierMap[supplier][key] = {
            supplier,
            productId: item.productId || "",
            productName: item.productName || "Без назви",
            unit: item.unit || "",
            requiredDate: order.requiredDate || "",
            totalQty: 0,
            totalAmount: 0,
            restaurants: [],
            orderIds: new Set(),
          };
        }

        const lineKey = `${order.id}::${item.productId || item.productName || "line"}`;
        const editedQty = lineEdits[lineKey];
        const effectiveQty = editedQty === undefined ? toNumber(item.qty) : toNumber(editedQty);
        const effectiveAmount = effectiveQty * toNumber(item.unitPrice);

        supplierMap[supplier][key].totalQty += effectiveQty;
        supplierMap[supplier][key].totalAmount += effectiveAmount;
        supplierMap[supplier][key].restaurants.push({
          lineKey,
          restaurantId: order.restaurantId,
          restaurantName: order.restaurantName,
          qty: effectiveQty,
          requiredDate: order.requiredDate,
          orderId: order.id,
          productId: item.productId || "",
          productName: item.productName || "Без назви",
          unit: item.unit || "",
          unitPrice: toNumber(item.unitPrice),
        });
        supplierMap[supplier][key].orderIds.add(order.id);
      }
    }

    return Object.fromEntries(
      Object.entries(supplierMap).map(([supplier, keyed]) => [
        supplier,
        Object.values(keyed).map((row) => ({
          ...row,
          orderIds: Array.from(row.orderIds),
        })),
      ])
    );
  }, [visibleOrders, lineEdits]);

  const dispatchableSuppliers = useMemo(() => Object.keys(consolidatedBySupplier), [consolidatedBySupplier]);

  const isSupplierExpanded = (supplier) => {
    if (expandedSuppliers[supplier] === undefined) return false;
    return expandedSuppliers[supplier];
  };

  const toggleSupplierExpanded = (supplier) => {
    setExpandedSuppliers((prev) => ({
      ...prev,
      [supplier]: !(prev[supplier] === undefined ? false : prev[supplier]),
    }));
  };

  const dispatchableOrdersCount = useMemo(() => {
    const ids = new Set();
    Object.values(consolidatedBySupplier).forEach((rows) => {
      rows.forEach((row) => row.orderIds.forEach((id) => ids.add(id)));
    });
    return ids.size;
  }, [consolidatedBySupplier]);

  const overallSuppliersAmount = useMemo(() => {
    return Object.values(groupedBySupplier)
      .flat()
      .reduce((sum, item) => sum + toNumber(item.amount), 0);
  }, [groupedBySupplier]);

  const groupedByRestaurant = useMemo(() => {
    const map = {};

    for (const order of visibleOrders) {
      const restaurant = order.restaurantName || "Невідомий ресторан";
      if (!map[restaurant]) map[restaurant] = [];

      for (const item of order.items || []) {
        map[restaurant].push({
          orderId: order.id,
          supplier: item.supplier || "Без постачальника",
          productName: item.productName || "Без назви",
          qty: toNumber(item.qty),
          unit: item.unit || "",
          unitPrice: toNumber(item.unitPrice),
          amount: toNumber(item.amount),
          requiredDate: order.requiredDate || "",
        });
      }
    }

    return map;
  }, [visibleOrders]);

  const isRestaurantExpanded = (restaurant) => {
    if (expandedRestaurants[restaurant] === undefined) return false;
    return expandedRestaurants[restaurant];
  };

  const toggleRestaurantExpanded = (restaurant) => {
    setExpandedRestaurants((prev) => ({
      ...prev,
      [restaurant]: !(prev[restaurant] === undefined ? false : prev[restaurant]),
    }));
  };

  const isSummarySupplierExpanded = (supplier) => {
    if (expandedSummarySuppliers[supplier] === undefined) return false;
    return expandedSummarySuppliers[supplier];
  };

  const toggleSummarySupplierExpanded = (supplier) => {
    setExpandedSummarySuppliers((prev) => ({
      ...prev,
      [supplier]: !(prev[supplier] === undefined ? false : prev[supplier]),
    }));
  };

  const deriveOrderStatus = (items, currentStatus) => {
    if (currentStatus === "completed") return "completed";
    const hasItems = items.length > 0;
    const hasUnsent = items.some((item) => !item.sentToSupplier);
    const hasSent = items.some((item) => item.sentToSupplier);

    if (!hasItems) return "new";
    if (!hasUnsent) return "sent";
    if (hasSent && hasUnsent) return "processing";
    return "new";
  };

  const updateStatus = async (order, status) => {
    const { id, ...payload } = order;
    const result = await updateOrder(id, { ...payload, status });
    if (!result.success) {
      alert("Не вдалося оновити статус заявки.");
    }
  };

  const applyLineCorrection = async (entry) => {
    if (!canManageOrders) return;

    const editedQty = lineEdits[entry.lineKey];
    if (editedQty === undefined) return;

    const qty = toNumber(editedQty);
    if (qty <= 0) {
      alert("Кількість має бути більше 0.");
      return;
    }

    const order = orders.find((item) => item.id === entry.orderId);
    if (!order) {
      alert("Не вдалося знайти заявку для коригування.");
      return;
    }

    const updatedItems = (order.items || []).map((item) => {
      const sameProduct = (item.productId || item.productName) === (entry.productId || entry.productName);
      if (!sameProduct) return item;
      return {
        ...item,
        qty,
        amount: qty * toNumber(item.unitPrice),
        sentToSupplier: false,
      };
    });

    const totalItems = updatedItems.reduce((sum, item) => sum + toNumber(item.qty), 0);
    const totalAmount = updatedItems.reduce((sum, item) => sum + toNumber(item.amount), 0);
    const { id, ...payload } = order;

    const result = await updateOrder(id, {
      ...payload,
      items: updatedItems,
      totalItems,
      totalAmount,
      status: deriveOrderStatus(updatedItems, order.status),
      correctedAt: new Date().toISOString(),
    });

    if (!result.success) {
      alert("Не вдалося зберегти коригування.");
      return;
    }

    setLineEdits((prev) => {
      const next = { ...prev };
      delete next[entry.lineKey];
      return next;
    });
  };

  const sendToSpecificSuppliers = async (suppliersToSend) => {
    if (!canManageOrders) return;

    const normalizedSuppliers = suppliersToSend.filter((supplier) => consolidatedBySupplier[supplier]?.length > 0);
    if (normalizedSuppliers.length === 0) {
      alert("Немає нових даних для відправки.");
      return;
    }

    const dispatchBatchId = `dispatch_${Date.now()}`;
    const managerName = user?.displayName || user?.fullName || user?.email || "Закупівлі";
    const managerId = user?.uid || "";
    const now = new Date().toISOString();

    try {
      const ordersMap = new Map(orders.map((order) => [order.id, { ...order, items: [...(order.items || [])] }]));
      const patchedOrders = new Map();

      for (const supplier of normalizedSuppliers) {
        const rows = consolidatedBySupplier[supplier] || [];
        const dispatchPayload = {
          supplier,
          dispatchBatchId,
          status: "sent",
          sentBy: managerName,
          sentById: managerId,
          orderIds: Array.from(new Set(rows.flatMap((row) => row.orderIds))),
          lines: rows.map((row) => ({
            productName: row.productName,
            unit: row.unit,
            requiredDate: row.requiredDate,
            totalQty: row.totalQty,
            totalAmount: row.totalAmount,
            restaurants: row.restaurants,
          })),
        };

        const dispatchResult = await createSupplierDispatch(dispatchPayload);
        if (!dispatchResult.success) {
          throw dispatchResult.error || new Error("Не вдалося створити відправку постачальнику");
        }

        const affectedOrderIds = dispatchPayload.orderIds;
        for (const orderId of affectedOrderIds) {
          const workingOrder = patchedOrders.get(orderId) || ordersMap.get(orderId);
          if (!workingOrder) continue;

          const nextItems = (workingOrder.items || []).map((item) => {
            const itemSupplier = item.supplier || "Без постачальника";
            if (itemSupplier !== supplier || item.sentToSupplier) return item;
            return {
              ...item,
              sentToSupplier: true,
              sentAt: now,
            };
          });

          const totalItems = nextItems.reduce((sum, item) => sum + toNumber(item.qty), 0);
          const totalAmount = nextItems.reduce((sum, item) => sum + toNumber(item.amount), 0);

          patchedOrders.set(orderId, {
            ...workingOrder,
            items: nextItems,
            totalItems,
            totalAmount,
            status: deriveOrderStatus(nextItems, workingOrder.status),
            dispatchBatchId,
            sentBy: managerName,
            sentById: managerId,
            sentAt: now,
          });
        }
      }

      for (const [orderId, payload] of patchedOrders.entries()) {
        const { id, ...orderData } = payload;
        const updateResult = await updateOrder(orderId, orderData);
        if (!updateResult.success) {
          throw updateResult.error || new Error(`Не вдалося оновити заявку ${orderId}`);
        }
      }

      alert(`Відправлено постачальникам: ${normalizedSuppliers.length}. Оновлено заявок: ${patchedOrders.size}.`);
    } catch (error) {
      console.error("Помилка відправки постачальникам:", error);
      alert(`Не вдалося відправити постачальникам: ${error?.message || "невідома помилка"}`);
    } finally {
      setSendingSupplier("");
    }
  };

  const sendAllSuppliers = async () => {
    setSendingSupplier("ALL");
    await sendToSpecificSuppliers(dispatchableSuppliers);
  };

  const sendOneSupplier = async (supplier) => {
    setSendingSupplier(supplier);
    await sendToSpecificSuppliers([supplier]);
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

        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-900">Фільтр по датах</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="text-xs font-semibold text-slate-700">Замовлення від</label>
              <input type="date" className={inputClass} value={orderDateFrom} onChange={(e) => setOrderDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Замовлення до</label>
              <input type="date" className={inputClass} value={orderDateTo} onChange={(e) => setOrderDateTo(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Поставка від</label>
              <input type="date" className={inputClass} value={deliveryDateFrom} onChange={(e) => setDeliveryDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Поставка до</label>
              <input type="date" className={inputClass} value={deliveryDateTo} onChange={(e) => setDeliveryDateTo(e.target.value)} />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                onClick={() => {
                  setOrderDateFrom("");
                  setOrderDateTo("");
                  setDeliveryDateFrom("");
                  setDeliveryDateTo("");
                }}
              >
                Скинути дати
              </button>
            </div>
          </div>
        </div>

        {canManageOrders && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
            <p className="text-sm font-semibold text-indigo-900">
              Готово до відправки: {dispatchableOrdersCount} заявок / {dispatchableSuppliers.length} постачальників
            </p>
            <button
              type="button"
              onClick={sendAllSuppliers}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={dispatchableSuppliers.length === 0 || sendingSupplier === "ALL"}
            >
              {sendingSupplier === "ALL" ? "Відправлення..." : "Відправити всім постачальникам"}
            </button>
          </div>
        )}

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
        <h3 className="text-base font-semibold text-slate-900 mb-3">Зведення по ресторанах</h3>
        <div className="space-y-3">
          {Object.entries(groupedByRestaurant).map(([restaurant, items]) => (
            <div key={`restaurant_${restaurant}`} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleRestaurantExpanded(restaurant)}
                  className="flex flex-1 items-start gap-3 text-left"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-700">
                    {isRestaurantExpanded(restaurant) ? "−" : "+"}
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{restaurant}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">Рядків: {items.length}</span>
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">
                        Постачальників: {new Set(items.map((item) => item.supplier)).size}
                      </span>
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">
                        Разом: {items.reduce((sum, item) => sum + toNumber(item.qty), 0).toFixed(2)}
                      </span>
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">
                        Сума: {formatMoney(items.reduce((sum, item) => sum + toNumber(item.amount), 0))}
                      </span>
                    </div>
                  </div>
                </button>
              </div>
              {isRestaurantExpanded(restaurant) && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-slate-600">
                      <tr>
                        <th className="px-2 py-1 text-left">Постачальник</th>
                        <th className="px-2 py-1 text-left">Продукт</th>
                        <th className="px-2 py-1 text-left">Ціна</th>
                        <th className="px-2 py-1 text-left">К-сть</th>
                        <th className="px-2 py-1 text-left">Сума</th>
                        <th className="px-2 py-1 text-left">Поставка</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => (
                        <tr key={`${restaurant}_${item.orderId}_${index}`} className="border-t border-slate-100">
                          <td className="px-2 py-1">{item.supplier}</td>
                          <td className="px-2 py-1">{item.productName}</td>
                          <td className="px-2 py-1">{formatMoney(item.unitPrice)}</td>
                          <td className="px-2 py-1">{item.qty} {item.unit}</td>
                          <td className="px-2 py-1 font-medium">{formatMoney(item.amount)}</td>
                          <td className="px-2 py-1">{item.requiredDate || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {Object.keys(groupedByRestaurant).length === 0 && (
            <div className="text-sm text-slate-500">Немає даних для зведення по ресторанах.</div>
          )}
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="text-base font-semibold text-slate-900 mb-3">Зведення для постачальників</h3>
        <div className="space-y-3">
          {Object.entries(groupedBySupplier).map(([supplier, items]) => (
            <div key={supplier} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleSummarySupplierExpanded(supplier)}
                  className="flex flex-1 items-start gap-3 text-left"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-700">
                    {isSummarySupplierExpanded(supplier) ? "−" : "+"}
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{supplier}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">Рядків: {items.length}</span>
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">
                        Ресторанів: {new Set(items.map((item) => item.restaurantName)).size}
                      </span>
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">
                        Разом: {items.reduce((sum, item) => sum + toNumber(item.qty), 0).toFixed(2)}
                      </span>
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">
                        Сума: {formatMoney(items.reduce((sum, item) => sum + toNumber(item.amount), 0))}
                      </span>
                    </div>
                  </div>
                </button>
              </div>
              {isSummarySupplierExpanded(supplier) && (
                <>
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
                </>
              )}
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

      <div className={cardClass}>
        <h3 className="text-base font-semibold text-slate-900 mb-3">Консолідоване замовлення (по ресторанах)</h3>
        <div className="space-y-3">
          {Object.entries(consolidatedBySupplier).map(([supplier, rows]) => (
            <div key={`consolidated_${supplier}`} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleSupplierExpanded(supplier)}
                  className="flex flex-1 items-start gap-3 text-left"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-700">
                    {isSupplierExpanded(supplier) ? "−" : "+"}
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{supplier}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">Позицій: {rows.length}</span>
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">
                        Ресторанів: {new Set(rows.flatMap((row) => row.restaurants.map((r) => r.restaurantName))).size}
                      </span>
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">
                        Разом: {rows.reduce((sum, row) => sum + toNumber(row.totalQty), 0).toFixed(2)}
                      </span>
                      <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200">
                        Сума: {formatMoney(rows.reduce((sum, row) => sum + toNumber(row.totalAmount), 0))}
                      </span>
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-2 pt-0.5">
                  {canManageOrders && (
                    <button
                      type="button"
                      onClick={() => sendOneSupplier(supplier)}
                      className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={rows.length === 0 || sendingSupplier === supplier || sendingSupplier === "ALL"}
                    >
                      {sendingSupplier === supplier ? "Відправлення..." : "Відправити цьому постачальнику"}
                    </button>
                  )}
                </div>
              </div>
              {isSupplierExpanded(supplier) && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        <th className="px-2 py-1 text-left">Продукт</th>
                        <th className="px-2 py-1 text-left">Дата</th>
                        <th className="px-2 py-1 text-left">Разом</th>
                        <th className="px-2 py-1 text-left">Сума</th>
                        <th className="px-2 py-1 text-left">Коригування по ресторанах</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr key={`${supplier}_${row.productName}_${row.requiredDate}_${index}`} className="border-t border-slate-100 align-top">
                          <td className="px-2 py-1 font-medium text-slate-900">{row.productName}</td>
                          <td className="px-2 py-1">{row.requiredDate || "-"}</td>
                          <td className="px-2 py-1">{row.totalQty} {row.unit}</td>
                          <td className="px-2 py-1 font-semibold">{formatMoney(row.totalAmount)}</td>
                          <td className="px-2 py-1">
                            <div className="space-y-2">
                              {row.restaurants.map((entry, entryIndex) => (
                                <div key={`${entry.orderId}_${entry.restaurantId}_${entryIndex}`} className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                                  <span className="min-w-[200px]">{entry.restaurantName} ({entry.requiredDate || "без дати"})</span>
                                  <input
                                    type="number"
                                    min="0.1"
                                    step="0.1"
                                    className="w-24 rounded border border-slate-300 px-2 py-1"
                                    value={lineEdits[entry.lineKey] ?? entry.qty}
                                    onChange={(e) => setLineEdits((prev) => ({ ...prev, [entry.lineKey]: e.target.value }))}
                                  />
                                  <span>{row.unit}</span>
                                  {canManageOrders && (
                                    <button
                                      type="button"
                                      className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                                      onClick={() => applyLineCorrection(entry)}
                                    >
                                      Зберегти
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {Object.keys(consolidatedBySupplier).length === 0 && (
            <div className="text-sm text-slate-500">Немає нових даних для консолідації або все вже відправлено постачальникам.</div>
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
    inventories,
    loading,
    error,
    addProduct,
    updateProduct,
    deleteProduct,
    createOrder,
    updateOrder,
    createSupplierDispatch,
    createSupplier,
    updateSupplier,
    removeSupplier,
    createTypicalField,
    updateTypicalField,
    removeTypicalField,
    createInventory,
  } = useProductBooking(true);

  const tabKind = normalizeTabKind(topTab);
  const canManageProducts = hasProcurementAccess(user);
  const canManageOrders = hasProcurementAccess(user);
  const availableSuppliers = useMemo(() => {
    const fromDirectory = suppliers
      .filter((item) => item.isActive !== false)
      .map((item) => String(item.name || "").trim())
      .filter(Boolean);

    const fromProducts = products
      .map((item) => String(item.supplier || "").trim())
      .filter(Boolean);

    return Array.from(new Set([...fromDirectory, ...fromProducts])).sort((a, b) => a.localeCompare(b, "uk"));
  }, [suppliers, products]);

  const availableCategories = useMemo(() => {
    const fromDirectory = typicalFields
      .filter((item) => item.type === "category" && item.isActive !== false)
      .map((item) => String(item.name || "").trim())
      .filter(Boolean);

    const fromProducts = products
      .map((item) => String(item.category || "").trim())
      .filter(Boolean);

    return Array.from(new Set([...fromDirectory, ...fromProducts])).sort((a, b) => a.localeCompare(b, "uk"));
  }, [typicalFields, products]);

  const availableUnits = useMemo(() => {
    const fromDirectory = typicalFields
      .filter((item) => item.type === "unit" && item.isActive !== false)
      .map((item) => String(item.name || "").trim())
      .filter(Boolean);

    const fromProducts = products
      .map((item) => String(item.unit || "").trim())
      .filter(Boolean);

    return Array.from(new Set([...fromDirectory, ...fromProducts])).sort((a, b) => a.localeCompare(b, "uk"));
  }, [typicalFields, products]);

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
        inventories={inventories}
          canManageProducts={canManageProducts}
        addProduct={addProduct}
        updateProduct={updateProduct}
      />
    );
  }

  if (tabKind === "inventory") {
    return (
      <InventoryTab
        products={products}
        inventories={inventories}
        restaurants={restaurants}
        user={user}
        createInventory={createInventory}
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
    return (
      <OrdersManagementTab
        orders={orders}
        updateOrder={updateOrder}
        createSupplierDispatch={createSupplierDispatch}
        canManageOrders={canManageOrders}
        user={user}
      />
    );
  }

  return <BookingTab products={products} orders={orders} createOrder={createOrder} restaurants={restaurants} user={user} />;
}
