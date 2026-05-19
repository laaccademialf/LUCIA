import { useMemo } from "react";
import { ChefHat, Clock3, PackageCheck } from "lucide-react";

const KITCHEN_COLUMNS = [
  { id: "queue", label: "Черга", tone: "border-slate-200 bg-slate-50 text-slate-700" },
  { id: "preparing", label: "Готується", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  { id: "ready", label: "Готово до видачі", tone: "border-sky-200 bg-sky-50 text-sky-700" },
  { id: "completed", label: "Видано", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
];

const formatMoney = (value) => new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "UAH",
  maximumFractionDigits: 0,
}).format(Number(value || 0));

export default function CateringKitchenTab({ orders, contacts, saving, onSaveOrder }) {
  const confirmedOrders = useMemo(() => {
    return orders
      .filter((item) => item.status === "confirmed")
      .sort((left, right) => String(left.eventDate || "").localeCompare(String(right.eventDate || "")));
  }, [orders]);

  const contactsById = useMemo(() => {
    return contacts.reduce((acc, item) => {
      acc[String(item.id)] = item;
      return acc;
    }, {});
  }, [contacts]);

  const totals = useMemo(() => ({
    queue: confirmedOrders.filter((item) => item.kitchenStatus === "queue").length,
    preparing: confirmedOrders.filter((item) => item.kitchenStatus === "preparing").length,
    ready: confirmedOrders.filter((item) => item.kitchenStatus === "ready").length,
    completed: confirmedOrders.filter((item) => item.kitchenStatus === "completed").length,
  }), [confirmedOrders]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-600"><ChefHat size={16} /> Підтверджені замовлення</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{confirmedOrders.length}</div>
          <p className="mt-1 text-xs text-slate-500">Усі замовлення з CRM у статусі “Підтверджено”.</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-amber-700"><Clock3 size={16} /> У роботі кухні</div>
          <div className="mt-2 text-2xl font-semibold text-amber-900">{totals.preparing + totals.ready}</div>
          <p className="mt-1 text-xs text-amber-700">Готуються або чекають видачі.</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-700"><PackageCheck size={16} /> Виконані</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-900">{totals.completed}</div>
          <p className="mt-1 text-xs text-emerald-700">Замовлення, які кухня вже закрила.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
        {KITCHEN_COLUMNS.map((column, columnIndex) => {
          const columnOrders = confirmedOrders.filter((item) => (item.kitchenStatus || "queue") === column.id);
          return (
            <div key={column.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className={`mb-3 rounded-xl border px-3 py-2 text-xs font-semibold ${column.tone}`}>
                {column.label}: {columnOrders.length}
              </div>
              <div className="space-y-2">
                {columnOrders.map((item) => {
                  const contact = contactsById[String(item.contactId)] || null;
                  return (
                    <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-sm font-semibold text-slate-900">{item.title || item.customerName}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.customerName || "—"}</div>
                      <div className="mt-3 space-y-1 text-xs text-slate-600">
                        <div>Подія: <span className="font-medium text-slate-800">{item.eventDate || "—"}</span></div>
                        <div>Менеджер: <span className="font-medium text-slate-800">{item.managerName || "—"}</span></div>
                        <div>Сума: <span className="font-medium text-slate-800">{formatMoney(item.amount)}</span></div>
                        <div>Гостей: <span className="font-medium text-slate-800">{item.guestCount || "—"}</span></div>
                        <div>Контакт: <span className="font-medium text-slate-800">{contact?.phone || contact?.email || "—"}</span></div>
                      </div>
                      {item.notes && (
                        <div className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
                          {item.notes}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {columnIndex > 0 && (
                          <button
                            type="button"
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-50"
                            disabled={saving}
                            onClick={() => {
                              const previous = KITCHEN_COLUMNS[columnIndex - 1];
                              void onSaveOrder({ ...item, kitchenStatus: previous.id });
                            }}
                          >
                            Назад
                          </button>
                        )}
                        {columnIndex < KITCHEN_COLUMNS.length - 1 && (
                          <button
                            type="button"
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                            disabled={saving}
                            onClick={() => {
                              const next = KITCHEN_COLUMNS[columnIndex + 1];
                              void onSaveOrder({ ...item, kitchenStatus: next.id });
                            }}
                          >
                            Далі
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {columnOrders.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-xs text-slate-400">
                    Немає заявок у цій колонці
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}