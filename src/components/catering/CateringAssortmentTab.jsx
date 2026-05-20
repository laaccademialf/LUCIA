import { useMemo, useRef, useState } from "react";
import { Download, FileDown, Pencil, Plus, Trash2, Upload } from "lucide-react";
import {
  downloadCateringAssortmentTemplate,
  exportCateringAssortmentToExcel,
  importCateringAssortmentFromExcel,
} from "../../utils/cateringExcel";

const baseInput = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

const emptyItem = {
  id: "",
  category: "",
  subcategory: "",
  productName: "",
  output: "",
  unitPrice: "",
  costPrice: "",
};

const formatMoney = (value) => new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "UAH",
  maximumFractionDigits: 0,
}).format(Number(value || 0));

export default function CateringAssortmentTab({ items, saving, onSaveItem, onDeleteItem }) {
  const [form, setForm] = useState(emptyItem);
  const [query, setQuery] = useState("");
  const importRef = useRef(null);

  const filteredItems = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      String(item.productName || "").toLowerCase().includes(q) ||
      String(item.category || "").toLowerCase().includes(q) ||
      String(item.subcategory || "").toLowerCase().includes(q),
    );
  }, [items, query]);

  const handleDownloadTemplate = () => {
    downloadCateringAssortmentTemplate();
  };

  const handleExport = () => {
    exportCateringAssortmentToExcel(items);
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const importedRows = await importCateringAssortmentFromExcel(file);
      if (!Array.isArray(importedRows) || importedRows.length === 0) {
        window.alert("У файлі не знайдено позицій асортименту для імпорту.");
        return;
      }

      let importedCount = 0;
      for (const row of importedRows) {
        // eslint-disable-next-line no-await-in-loop
        const result = await onSaveItem(row);
        if (result?.success) importedCount += 1;
      }

      window.alert(`Імпорт завершено. Додано/оновлено позицій: ${importedCount}.`);
    } catch (error) {
      console.error("Помилка імпорту асортименту:", error);
      window.alert("Не вдалося імпортувати асортимент з Excel.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Plus size={18} className="text-indigo-600" />
            <h3 className="text-base font-semibold text-slate-900">Позиція асортименту</h3>
          </div>

          <div className="space-y-3">
            <input className={baseInput} value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="Категорія страви" />
            <input className={baseInput} value={form.subcategory} onChange={(event) => setForm((prev) => ({ ...prev, subcategory: event.target.value }))} placeholder="Підкатегорія" />
            <input className={baseInput} value={form.productName} onChange={(event) => setForm((prev) => ({ ...prev, productName: event.target.value }))} placeholder="Назва продукту/страви" />
            <input className={baseInput} value={form.output} onChange={(event) => setForm((prev) => ({ ...prev, output: event.target.value }))} placeholder="Вихід (напр. 250 г)" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input className={baseInput} value={form.unitPrice} onChange={(event) => setForm((prev) => ({ ...prev, unitPrice: event.target.value }))} placeholder="Ціна продажу" />
              <input className={baseInput} value={form.costPrice} onChange={(event) => setForm((prev) => ({ ...prev, costPrice: event.target.value }))} placeholder="Собівартість" />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving || !form.productName.trim()}
                onClick={async () => {
                  const result = await onSaveItem(form);
                  if (result?.success) setForm(emptyItem);
                }}
              >
                {form.id ? "Оновити" : "Додати"}
              </button>
              {form.id && (
                <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setForm(emptyItem)}>
                  Скасувати
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">Керування асортиментом кейтерингу</h3>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
              <input className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Пошук..." />
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={handleDownloadTemplate}>
                <FileDown size={15} /> Шаблон
              </button>
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={handleExport}>
                <Download size={15} /> Експорт
              </button>
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => importRef.current?.click()}>
                <Upload size={15} /> Імпорт
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">Категорія</th>
                  <th className="px-3 py-2">Підкатегорія</th>
                  <th className="px-3 py-2">Позиція</th>
                  <th className="px-3 py-2">Вихід</th>
                  <th className="px-3 py-2">Ціна</th>
                  <th className="px-3 py-2">Собівартість</th>
                  <th className="px-3 py-2">Дії</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id} className="border-t border-slate-200 align-top">
                    <td className="px-3 py-3 text-slate-700">{item.category || "—"}</td>
                    <td className="px-3 py-3 text-slate-700">{item.subcategory || "—"}</td>
                    <td className="px-3 py-3 font-medium text-slate-900">{item.productName || "—"}</td>
                    <td className="px-3 py-3 text-slate-700">{item.output || "—"}</td>
                    <td className="px-3 py-3 text-slate-700">{formatMoney(item.unitPrice)}</td>
                    <td className="px-3 py-3 text-slate-700">{formatMoney(item.costPrice)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50"
                          onClick={() => setForm({
                            id: item.id,
                            category: item.category || "",
                            subcategory: item.subcategory || "",
                            productName: item.productName || "",
                            output: item.output || "",
                            unitPrice: String(item.unitPrice || ""),
                            costPrice: String(item.costPrice || ""),
                          })}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                          onClick={() => {
                            if (!window.confirm("Видалити позицію асортименту?")) return;
                            void onDeleteItem(item.id);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">Позиції не знайдено.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
