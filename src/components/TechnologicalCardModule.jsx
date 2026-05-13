import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Edit2, Save, X, GripVertical } from "lucide-react";
import { useProductBooking } from "../hooks/useProductBooking";
import {
  createCollectionItemApi,
  updateCollectionItemApi,
  deleteCollectionItemApi,
  listCollectionItemsApi,
} from "../api/collectionsApi";

const cardClass = "card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl";
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";

const formatMoney = (value) => `${(Number(value) || 0).toFixed(2)} грн`;

export default function TechnologicalCardModule() {
  const { products } = useProductBooking();
  const [cards, setCards] = useState([]);
  const [editingCard, setEditingCard] = useState(null);
  const [formData, setFormData] = useState({ name: "", description: "", ingredients: [], recommendedPrice: "" });
  const [dragOverIndex, setDragOverIndex] = useState(null);
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

  const productsForDragDrop = (Array.isArray(products) ? products : []).filter(
    (p) => !formData.ingredients.some((ing) => ing.productId === p.id)
  );

  return (
    <div className="space-y-5">
      <div className={cardClass}>
        <h2 className="text-lg font-semibold text-slate-900">Технологічні карти</h2>
        <p className="mt-1 text-sm text-slate-500">Створюйте та керуйте рецептами страв з автоматичним розрахунком собівартості</p>
      </div>

      <div className={cardClass}>
        <h3 className="mb-4 text-base font-semibold text-slate-900">{editingCard ? "Редагування картки" : "Нова технологічна карта"}</h3>

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
              className={inputClass + " min-h-20"}
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Опис приготування, особливості, поради..."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-800">Собівартість</label>
              <input
                type="text"
                className={inputClass}
                value={formatMoney(costPrice)}
                disabled
                readOnly
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800">Рекомендована ціна продажу</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
                value={formData.recommendedPrice}
                onChange={(e) => setFormData((prev) => ({ ...prev, recommendedPrice: e.target.value }))}
                placeholder="0.00"
              />
            </div>
          </div>

          {formData.recommendedPrice && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-semibold text-emerald-900">
                Маржа прибутку: {formatMoney(Number(formData.recommendedPrice || 0) - costPrice)} 
                ({((Number(formData.recommendedPrice || 0) / costPrice - 1) * 100).toFixed(0)}%)
              </p>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-800">Доступні продукти для добавлення</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {productsForDragDrop.length > 0 ? (
                productsForDragDrop.map((product) => (
                  <div
                    key={product.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "copy";
                      e.dataTransfer.setData("product", JSON.stringify(product));
                    }}
                    className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white p-2 cursor-move hover:bg-slate-50 transition"
                  >
                    <GripVertical size={14} className="text-slate-400" />
                    <span className="text-sm font-medium text-slate-900 flex-1">{product.name}</span>
                    <span className="text-xs text-slate-500">{(Number(product.unitPrice) || 0).toFixed(2)} грн/{product.unit}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">Усі доступні продукти вже додані</p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-800">Інгредієнти</p>
            {formData.ingredients.length > 0 ? (
              <div className="space-y-3">
                {formData.ingredients.map((ingredient, index) => (
                  <div key={index} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-900">{ingredient.productName}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveIngredient(index)}
                        className="rounded border border-red-300 text-red-600 px-2 py-1 text-xs hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-slate-600">Кількість</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                          value={ingredient.quantity}
                          onChange={(e) => handleUpdateIngredient(index, "quantity", Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-600">Одиниця</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                          value={ingredient.unit}
                          onChange={(e) => handleUpdateIngredient(index, "unit", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-600">Вартість</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1 text-xs bg-slate-100"
                          value={formatMoney(ingredient.quantity * ingredient.unitPrice)}
                          disabled
                          readOnly
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">Перетягніть продукти сюди або натисніть на них вище</p>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            {editingCard && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <X size={14} className="inline mr-1" /> Скасувати
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveCard}
              disabled={loading}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              <Save size={14} className="inline mr-1" /> {editingCard ? "Оновити" : "Зберегти"}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-base font-semibold text-slate-900">Існуючі картки ({cards.length})</h3>
        {cards.length > 0 ? (
          cards.map((card) => (
            <div key={card.id} className={cardClass}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h4 className="text-base font-semibold text-slate-900">{card.name}</h4>
                  {card.description && <p className="mt-1 text-sm text-slate-600">{card.description}</p>}
                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <p className="text-xs text-slate-600">Інгредієнти</p>
                      <p className="mt-1 font-semibold text-slate-900">{card.ingredients?.length || 0}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <p className="text-xs text-slate-600">Собівартість</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatMoney(card.costPrice || 0)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <p className="text-xs text-slate-600">Ціна продажу</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatMoney(card.recommendedPrice || 0)}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                      <p className="text-xs text-emerald-600">Маржа</p>
                      <p className="mt-1 font-semibold text-emerald-700">
                        {card.recommendedPrice ? `${((card.profitMargin / card.recommendedPrice) * 100).toFixed(0)}%` : "—"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleEditCard(card)}
                    disabled={loading}
                    className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCard(card.id)}
                    disabled={loading}
                    className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className={cardClass + " text-center text-slate-500"}>
            <p>Технологічні карти ще не створені</p>
          </div>
        )}
      </div>
    </div>
  );
}
