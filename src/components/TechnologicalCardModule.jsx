import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Trash2, Edit2, Save, X, GripVertical } from "lucide-react";
import { useProductBooking } from "../hooks/useProductBooking";
import {
  createCollectionItemApi,
  updateCollectionItemApi,
  deleteCollectionItemApi,
  listCollectionItemsApi,
} from "../api/collectionsApi";

const cardClass = "rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl";
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100";

const formatMoney = (value) => `${(Number(value) || 0).toFixed(2)} грн`;

const normalizeCategoryName = (product) => {
  const firstCandidate = String(product?.category || "").trim();
  if (firstCandidate) return firstCandidate;
  const secondCandidate = String(product?.productGroup || "").trim();
  if (secondCandidate) return secondCandidate;
  return "Без категорії";
};

const normalizeSubcategoryName = (product) => {
  const firstCandidate = String(product?.subcategory || "").trim();
  if (firstCandidate) return firstCandidate;
  const secondCandidate = String(product?.greenCardName || "").trim();
  if (secondCandidate) return secondCandidate;
  return "Без підкатегорії";
};

export default function TechnologicalCardModule() {
  const { products } = useProductBooking();
  const [cards, setCards] = useState([]);
  const [editingCard, setEditingCard] = useState(null);
  const [formData, setFormData] = useState({ name: "", description: "", ingredients: [], recommendedPrice: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [isDropActive, setIsDropActive] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadCards = useCallback(async () => {
    try {
      const result = await listCollectionItemsApi("technologicalCards");
      setCards(Array.isArray(result) ? result : []);
    } catch (error) {
      console.error("Error loading cards:", error);
      setCards([]);
    }
  }, []);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const handleAddProduct = (product) => {
    if (!product?.id) return;
    const alreadyAdded = formData.ingredients.some((ing) => String(ing.productId || "") === String(product.id));
    if (alreadyAdded) return;

    const newIngredient = {
      productId: product.id,
      productName: product.name,
      quantity: 1,
      unit: product.unit || "шт",
      unitPrice: Number(product.unitPrice || 0),
    };
    setFormData((prev) => ({
      ...prev,
      ingredients: [...prev.ingredients, newIngredient],
    }));
  };

  const handleRemoveIngredient = (index) => {
    setFormData((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index),
    }));
  };

  const handleUpdateIngredient = (index, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.ingredients];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, ingredients: updated };
    });
  };

  const handleDropProduct = (event) => {
    event.preventDefault();
    setIsDropActive(false);
    const payload = event.dataTransfer.getData("product");
    if (!payload) return;

    try {
      const parsed = JSON.parse(payload);
      handleAddProduct(parsed);
    } catch {
      // ignore malformed drag payload
    }
  };

  const costPrice = useMemo(() => {
    return formData.ingredients.reduce((sum, ingredient) => {
      return sum + Number(ingredient.quantity || 0) * Number(ingredient.unitPrice || 0);
    }, 0);
  }, [formData.ingredients]);

  const handleSaveCard = async () => {
    if (!formData.name.trim()) {
      alert("Введіть назву технологічної карти.");
      return;
    }
    if (formData.ingredients.length === 0) {
      alert("Додайте принаймні один інгредієнт.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        ingredients: formData.ingredients,
        costPrice,
        recommendedPrice: Number(formData.recommendedPrice || 0),
        profitMargin: formData.recommendedPrice ? Number(formData.recommendedPrice) - costPrice : 0,
        createdAt: editingCard?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (editingCard) {
        await updateCollectionItemApi("technologicalCards", editingCard.id, payload);
      } else {
        await createCollectionItemApi("technologicalCards", payload);
      }

      await loadCards();
      setFormData({ name: "", description: "", ingredients: [], recommendedPrice: "" });
      setEditingCard(null);
    } catch (error) {
      alert("Помилка при збереженні картки: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditCard = (card) => {
    setEditingCard(card);
    setFormData({
      name: card.name,
      description: card.description || "",
      ingredients: card.ingredients || [],
      recommendedPrice: card.recommendedPrice || "",
    });
  };

  const handleDeleteCard = async (cardId) => {
    if (!window.confirm("Ви впевнені, що хочете видалити цю технологічну карту?")) return;

    setLoading(true);
    try {
      await deleteCollectionItemApi("technologicalCards", cardId);
      await loadCards();
    } catch (error) {
      alert("Помилка при видаленні картки: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({ name: "", description: "", ingredients: [], recommendedPrice: "" });
    setEditingCard(null);
  };

  const productsForDragDrop = useMemo(() => {
    const safeProducts = Array.isArray(products) ? products : [];
    return safeProducts.filter((product) => !formData.ingredients.some((ing) => String(ing.productId || "") === String(product?.id || "")));
  }, [products, formData.ingredients]);

  const categoryOptions = useMemo(() => {
    return Array.from(new Set(productsForDragDrop.map((product) => normalizeCategoryName(product)))).sort((a, b) => a.localeCompare(b, "uk"));
  }, [productsForDragDrop]);

  const subcategoryOptions = useMemo(() => {
    const source = categoryFilter === "all"
      ? productsForDragDrop
      : productsForDragDrop.filter((product) => normalizeCategoryName(product) === categoryFilter);

    return Array.from(new Set(source.map((product) => normalizeSubcategoryName(product)))).sort((a, b) => a.localeCompare(b, "uk"));
  }, [productsForDragDrop, categoryFilter]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = String(searchTerm || "").trim().toLowerCase();
    return productsForDragDrop
      .filter((product) => {
        const categoryName = normalizeCategoryName(product);
        const subcategoryName = normalizeSubcategoryName(product);
        const matchesCategory = categoryFilter === "all" || categoryName === categoryFilter;
        const matchesSubcategory = subcategoryFilter === "all" || subcategoryName === subcategoryFilter;
        if (!matchesCategory || !matchesSubcategory) return false;

        if (!normalizedSearch) return true;
        const textPool = [
          String(product?.name || ""),
          String(product?.code1C || ""),
          String(product?.supplier || ""),
          categoryName,
          subcategoryName,
        ].join(" ").toLowerCase();

        return textPool.includes(normalizedSearch);
      })
      .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), "uk"));
  }, [productsForDragDrop, searchTerm, categoryFilter, subcategoryFilter]);

  useEffect(() => {
    if (categoryFilter !== "all" && !categoryOptions.includes(categoryFilter)) {
      setCategoryFilter("all");
    }
  }, [categoryFilter, categoryOptions]);

  useEffect(() => {
    if (subcategoryFilter !== "all" && !subcategoryOptions.includes(subcategoryFilter)) {
      setSubcategoryFilter("all");
    }
  }, [subcategoryFilter, subcategoryOptions]);

  const marginAmount = Number(formData.recommendedPrice || 0) - costPrice;
  const marginPercent = costPrice > 0 ? (marginAmount / costPrice) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <section className="space-y-5 xl:col-span-3">
          <div className={cardClass}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-900">{editingCard ? "Редагування картки" : "Створення картки"}</h3>
              {editingCard ? (
                <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Режим редагування</span>
              ) : (
                <span className="rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">Нова карта</span>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-800">Назва страви</label>
                <input
                  type="text"
                  className={inputClass}
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Наприклад: Болоньєз"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-800">Опис</label>
                <textarea
                  className={inputClass + " min-h-24"}
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Технологія приготування, норми подачі, примітки для кухні..."
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-cyan-700">Собівартість</p>
                  <p className="mt-1 text-lg font-bold text-cyan-900">{formatMoney(costPrice)}</p>
                </div>
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 md:col-span-2">
                  <label className="text-xs uppercase tracking-wide text-violet-700">Рекомендована ціна продажу</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1 w-full rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
                    value={formData.recommendedPrice}
                    onChange={(e) => setFormData((prev) => ({ ...prev, recommendedPrice: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {formData.recommendedPrice && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-sm font-semibold text-emerald-900">
                    Маржа: {formatMoney(marginAmount)} ({marginPercent.toFixed(0)}%)
                  </p>
                </div>
              )}
            </div>
          </div>

          <div
            className={`rounded-2xl border-2 border-dashed p-4 transition ${isDropActive ? "border-cyan-500 bg-cyan-50/80" : "border-slate-300 bg-slate-50"}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDropActive(true);
            }}
            onDragLeave={() => setIsDropActive(false)}
            onDrop={handleDropProduct}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Інгредієнти в картці ({formData.ingredients.length})</p>
              <p className="text-xs text-slate-500">Перетягніть продукт із правої колонки</p>
            </div>

            {formData.ingredients.length > 0 ? (
              <div className="space-y-3">
                {formData.ingredients.map((ingredient, index) => (
                  <div key={`${ingredient.productId}_${index}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="font-semibold text-slate-900">{ingredient.productName}</p>
                      <button
                        type="button"
                        onClick={() => handleRemoveIngredient(index)}
                        className="rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-red-600 hover:bg-red-100"
                        title="Прибрати інгредієнт"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                      <div>
                        <label className="text-xs text-slate-600">Кількість</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          value={ingredient.quantity}
                          onChange={(e) => handleUpdateIngredient(index, "quantity", Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-600">Одиниця</label>
                        <input
                          type="text"
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          value={ingredient.unit}
                          onChange={(e) => handleUpdateIngredient(index, "unit", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-600">Ціна за одиницю</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          value={Number(ingredient.unitPrice || 0)}
                          onChange={(e) => handleUpdateIngredient(index, "unitPrice", Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-600">Сума</label>
                        <div className="w-full rounded-lg border border-slate-200 bg-slate-100 px-2 py-1.5 text-sm font-semibold text-slate-700">
                          {formatMoney(Number(ingredient.quantity || 0) * Number(ingredient.unitPrice || 0))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                Інгредієнтів ще немає. Додайте продукти з каталогу праворуч.
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {editingCard && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <X size={14} className="mr-1 inline" /> Скасувати
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveCard}
              disabled={loading}
              className="rounded-xl border border-cyan-400 bg-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-cyan-600 disabled:opacity-50"
            >
              <Save size={14} className="mr-1 inline" /> {editingCard ? "Оновити карту" : "Зберегти карту"}
            </button>
          </div>
        </section>

        <aside className="space-y-4 xl:col-span-2">
          <div className={cardClass + " sticky top-4"}>
            <h3 className="mb-3 text-base font-semibold text-slate-900">Каталог продуктів</h3>

            <div className="mb-3 space-y-2">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                  placeholder="Пошук по назві, постачальнику, коду..."
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="all">Усі категорії</option>
                  {categoryOptions.map((categoryName) => (
                    <option key={categoryName} value={categoryName}>{categoryName}</option>
                  ))}
                </select>

                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
                  value={subcategoryFilter}
                  onChange={(e) => setSubcategoryFilter(e.target.value)}
                >
                  <option value="all">Усі підкатегорії</option>
                  {subcategoryOptions.map((subcategoryName) => (
                    <option key={subcategoryName} value={subcategoryName}>{subcategoryName}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategoryFilter("all")}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${categoryFilter === "all" ? "border-cyan-400 bg-cyan-100 text-cyan-800" : "border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                Усі
              </button>
              {categoryOptions.slice(0, 6).map((categoryName) => (
                <button
                  type="button"
                  key={categoryName}
                  onClick={() => {
                    setCategoryFilter(categoryName);
                    setSubcategoryFilter("all");
                  }}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${categoryFilter === categoryName ? "border-cyan-400 bg-cyan-100 text-cyan-800" : "border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {categoryName}
                </button>
              ))}
            </div>

            <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product) => (
                  <button
                    type="button"
                    key={product.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "copy";
                      event.dataTransfer.setData("product", JSON.stringify(product));
                    }}
                    onClick={() => handleAddProduct(product)}
                    className="group w-full rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md"
                    title="Натисніть або перетягніть в інгредієнти"
                  >
                    <div className="mb-1 flex items-start gap-2">
                      <GripVertical size={14} className="mt-0.5 shrink-0 text-slate-400 group-hover:text-cyan-500" />
                      <p className="line-clamp-2 text-sm font-semibold text-slate-900">{product.name}</p>
                    </div>
                    <div className="ml-6 grid grid-cols-2 gap-1 text-xs text-slate-600">
                      <p className="truncate">{normalizeCategoryName(product)}</p>
                      <p className="text-right font-semibold text-cyan-700">{formatMoney(product.unitPrice || 0)}</p>
                      <p className="truncate">{normalizeSubcategoryName(product)}</p>
                      <p className="text-right">од.: {String(product.unit || "шт")}</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
                  Нічого не знайдено за поточними фільтрами.
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <div className="space-y-3">
        <h3 className="text-base font-semibold text-slate-900">Існуючі картки ({cards.length})</h3>
        {cards.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {cards.map((card) => (
              <div key={card.id} className={cardClass + " transition hover:-translate-y-0.5 hover:shadow-2xl"}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h4 className="text-base font-semibold text-slate-900">{card.name}</h4>
                    {card.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{card.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditCard(card)}
                      disabled={loading}
                      className="rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-2 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                      title="Редагувати"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCard(card.id)}
                      disabled={loading}
                      className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-2 text-red-700 hover:bg-red-100 disabled:opacity-50"
                      title="Видалити"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <p className="text-xs text-slate-600">Інгредієнти</p>
                    <p className="mt-1 font-semibold text-slate-900">{card.ingredients?.length || 0}</p>
                  </div>
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-2">
                    <p className="text-xs text-cyan-700">Собівартість</p>
                    <p className="mt-1 font-semibold text-cyan-900">{formatMoney(card.costPrice || 0)}</p>
                  </div>
                  <div className="rounded-xl border border-violet-200 bg-violet-50 p-2">
                    <p className="text-xs text-violet-700">Ціна</p>
                    <p className="mt-1 font-semibold text-violet-900">{formatMoney(card.recommendedPrice || 0)}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2">
                    <p className="text-xs text-emerald-700">Маржа</p>
                    <p className="mt-1 font-semibold text-emerald-900">
                      {card.recommendedPrice ? `${((Number(card.recommendedPrice || 0) - Number(card.costPrice || 0)) / Math.max(Number(card.costPrice || 0), 1) * 100).toFixed(0)}%` : "—"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={cardClass + " text-center text-slate-500"}>
            <p>Технологічні карти ще не створені</p>
          </div>
        )}
      </div>
    </div>
  );
}
