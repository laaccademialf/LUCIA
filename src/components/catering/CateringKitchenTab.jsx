import { useMemo, useState } from "react";
import { Archive, ChefHat, Clock3, PackageCheck, X } from "lucide-react";
import DateRangePicker from "./DateRangePicker";

const ARCHIVE_STATUS = "archived";

const KITCHEN_COLUMNS = [
  { id: "queue", label: "Нові", tone: "border-slate-200 bg-slate-50 text-slate-700" },
  { id: "preparing", label: "Готується", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  { id: "ready", label: "Готово до видачі", tone: "border-sky-200 bg-sky-50 text-sky-700" },
  { id: "completed", label: "Видано", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
];

const ORDER_STATUS_FILTERS = [
  { id: "all", label: "Усі" },
  { id: "work", label: "В роботі", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  { id: "confirmed", label: "Підтверджено", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
];

const ORDER_STATUS_LABELS = {
  work: "В роботі",
  confirmed: "Підтверджено",
};

const formatDateUk = (value) => {
  const raw = String(value || "").slice(0, 10);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || "—";
  return `${raw.slice(8, 10)}.${raw.slice(5, 7)}.${raw.slice(0, 4)}`;
};

const inRange = (value, start, end) => {
  const raw = String(value || "").slice(0, 10);
  if (!raw) return false;
  if (start && raw < start) return false;
  if (end && raw > end) return false;
  return true;
};

export default function CateringKitchenTab({ orders, contacts, proposals = [], saving, onSaveOrder }) {
  const [view, setView] = useState("table");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kitchenFilter, setKitchenFilter] = useState("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [detailsOrderId, setDetailsOrderId] = useState(null);

  const proposalsByOrder = useMemo(() => {
    const map = new Map();
    (Array.isArray(proposals) ? proposals : []).forEach((proposal) => {
      const orderId = String(proposal?.orderId || "");
      if (!orderId) return;
      const list = map.get(orderId) || [];
      list.push(proposal);
      map.set(orderId, list);
    });
    return map;
  }, [proposals]);

  const kitchenOrders = useMemo(() => {
    return orders
      .filter((item) => item.status === "work" || item.status === "confirmed")
      .filter((item) => (item.kitchenStatus || "queue") !== ARCHIVE_STATUS)
      .sort((left, right) => String(left.eventDate || "").localeCompare(String(right.eventDate || "")));
  }, [orders]);

  const archivedOrders = useMemo(() => {
    return orders
      .filter((item) => (item.status === "work" || item.status === "confirmed") && (item.kitchenStatus || "") === ARCHIVE_STATUS)
      .sort((left, right) => String(right.eventDate || "").localeCompare(String(left.eventDate || "")));
  }, [orders]);

  const contactsById = useMemo(() => {
    return contacts.reduce((acc, item) => {
      acc[String(item.id)] = item;
      return acc;
    }, {});
  }, [contacts]);

  const visibleOrders = useMemo(() => {
    return kitchenOrders.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (kitchenFilter !== "all" && (item.kitchenStatus || "queue") !== kitchenFilter) return false;
      if (dateStart || dateEnd) {
        if (!inRange(item.eventDate, dateStart, dateEnd)) return false;
      }
      return true;
    });
  }, [kitchenOrders, statusFilter, kitchenFilter, dateStart, dateEnd]);

  const totals = useMemo(() => ({
    queue: kitchenOrders.filter((item) => (item.kitchenStatus || "queue") === "queue").length,
    preparing: kitchenOrders.filter((item) => item.kitchenStatus === "preparing").length,
    ready: kitchenOrders.filter((item) => item.kitchenStatus === "ready").length,
    completed: kitchenOrders.filter((item) => item.kitchenStatus === "completed").length,
    work: kitchenOrders.filter((item) => item.status === "work").length,
    confirmed: kitchenOrders.filter((item) => item.status === "confirmed").length,
  }), [kitchenOrders]);

  const renderOrderCard = (item, columnIndex) => {
    const contact = contactsById[String(item.contactId)] || null;
    const customer = item.customerName || contact?.name || "—";
    const company = item.companyName || contact?.company || "";
    return (
      <div
        key={item.id}
        className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:border-indigo-300 hover:bg-white"
        onClick={() => setDetailsOrderId(String(item.id))}
      >
        <div className="text-sm font-semibold text-slate-900">{item.title || customer}</div>
        <div className="mt-1 text-xs text-slate-500">{[company, customer].filter(Boolean).join(" — ") || "—"}</div>
        <div className="mt-3 space-y-1 text-xs text-slate-600">
          <div>Подія: <span className="font-medium text-slate-800">{formatDateUk(item.eventDate)}{item.eventTime ? ` • ${item.eventTime}${item.eventEndTime ? `–${item.eventEndTime}` : ""}` : ""}</span></div>
          <div>Менеджер: <span className="font-medium text-slate-800">{item.managerName || "—"}</span></div>
          <div>Тип заходу: <span className="font-medium text-slate-800">{item.eventType || "—"}</span></div>
          <div>Гостей: <span className="font-medium text-slate-800">{item.guestCount || "—"}</span></div>
          <div>Стадія: <span className="font-medium text-slate-800">{ORDER_STATUS_LABELS[item.status] || item.status}</span></div>
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
              onClick={(event) => {
                event.stopPropagation();
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
              onClick={(event) => {
                event.stopPropagation();
                const next = KITCHEN_COLUMNS[columnIndex + 1];
                void onSaveOrder({ ...item, kitchenStatus: next.id });
              }}
            >
              Далі
            </button>
          )}
          {columnIndex === KITCHEN_COLUMNS.length - 1 && (
            <button
              type="button"
              className="rounded-lg border border-slate-400 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              disabled={saving}
              onClick={(event) => {
                event.stopPropagation();
                void onSaveOrder({ ...item, kitchenStatus: ARCHIVE_STATUS });
              }}
            >
              В архів
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-600"><ChefHat size={16} /> Замовлення на кухню</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{kitchenOrders.length}</div>
          <p className="mt-1 text-xs text-slate-500">Угоди зі стадією «В роботі» або «Підтверджено».</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-amber-700"><Clock3 size={16} /> У роботі кухні</div>
          <div className="mt-2 text-2xl font-semibold text-amber-900">{totals.preparing + totals.ready}</div>
          <p className="mt-1 text-xs text-amber-700">Готуються або чекають видачі.</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-700"><PackageCheck size={16} /> Виконані</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-900">{totals.completed + archivedOrders.length}</div>
          <p className="mt-1 text-xs text-emerald-700">Замовлення, які кухня вже закрила.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => setView("board")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === "board" ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-700"}`}
          >
            Борд
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === "table" ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-700"}`}
          >
            Таблиця
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {ORDER_STATUS_FILTERS.map((filter) => {
            const active = statusFilter === filter.id;
            const count = filter.id === "all" ? kitchenOrders.length : (totals[filter.id] || 0);
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setStatusFilter(filter.id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${active ? "border-indigo-400 bg-indigo-50 text-indigo-700" : (filter.tone || "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}`}
              >
                {filter.label}: {count}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[{ id: "all", label: "Усі етапи" }, ...KITCHEN_COLUMNS].map((column) => {
            const active = kitchenFilter === column.id;
            const count = column.id === "all" ? kitchenOrders.length : (totals[column.id] || 0);
            return (
              <button
                key={column.id}
                type="button"
                onClick={() => setKitchenFilter(column.id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${active ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {column.label}: {count}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Дата</span>
          <div className="w-[260px]">
            <DateRangePicker
              startDate={dateStart}
              endDate={dateEnd}
              onChange={({ start, end }) => {
                setDateStart(start || "");
                setDateEnd(end || "");
              }}
            />
          </div>
        </div>
      </div>

      {view === "board" ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
          {KITCHEN_COLUMNS.map((column, columnIndex) => {
            const columnOrders = visibleOrders.filter((item) => (item.kitchenStatus || "queue") === column.id);
            return (
              <div key={column.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className={`mb-3 rounded-xl border px-3 py-2 text-xs font-semibold ${column.tone}`}>
                  {column.label}: {columnOrders.length}
                </div>
                <div className="space-y-2">
                  {columnOrders.map((item) => renderOrderCard(item, columnIndex))}
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
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="px-3 py-2.5">Дата події</th>
                <th className="px-3 py-2.5">Час</th>
                <th className="px-3 py-2.5">Клієнт</th>
                <th className="px-3 py-2.5">Тип заходу</th>
                <th className="px-3 py-2.5">Гостей</th>
                <th className="px-3 py-2.5">Менеджер</th>
                <th className="px-3 py-2.5">Стадія</th>
                <th className="px-3 py-2.5">Етап кухні</th>
                <th className="px-3 py-2.5">Дії</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((item) => {
                const contact = contactsById[String(item.contactId)] || null;
                const customer = item.customerName || contact?.name || "";
                const company = item.companyName || contact?.company || "";
                const currentIndex = KITCHEN_COLUMNS.findIndex((column) => column.id === (item.kitchenStatus || "queue"));
                const currentColumn = KITCHEN_COLUMNS[currentIndex] || KITCHEN_COLUMNS[0];
                const timeLabel = item.eventTime
                  ? `${item.eventTime}${item.eventEndTime ? `–${item.eventEndTime}` : ""}`
                  : "—";
                return (
                  <tr key={item.id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => setDetailsOrderId(String(item.id))}>
                    <td className="px-3 py-2.5 font-medium text-slate-900">{formatDateUk(item.eventDate)}</td>
                    <td className="px-3 py-2.5 text-slate-700">{timeLabel}</td>
                    <td className="px-3 py-2.5 text-slate-700">{[company, customer].filter(Boolean).join(" — ") || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-700">{item.eventType || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-700">{item.guestCount || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-700">{item.managerName || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-700">{ORDER_STATUS_LABELS[item.status] || item.status}</td>
                    <td className="px-3 py-2.5 text-slate-700">{currentColumn.label}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {currentIndex > 0 && (
                          <button
                            type="button"
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            disabled={saving}
                            onClick={(event) => {
                              event.stopPropagation();
                              const previous = KITCHEN_COLUMNS[currentIndex - 1];
                              void onSaveOrder({ ...item, kitchenStatus: previous.id });
                            }}
                          >
                            Назад
                          </button>
                        )}
                        {currentIndex < KITCHEN_COLUMNS.length - 1 && (
                          <button
                            type="button"
                            className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                            disabled={saving}
                            onClick={(event) => {
                              event.stopPropagation();
                              const next = KITCHEN_COLUMNS[currentIndex + 1];
                              void onSaveOrder({ ...item, kitchenStatus: next.id });
                            }}
                          >
                            Далі
                          </button>
                        )}
                        {currentIndex === KITCHEN_COLUMNS.length - 1 && (
                          <button
                            type="button"
                            className="rounded-md border border-slate-400 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            disabled={saving}
                            onClick={(event) => {
                              event.stopPropagation();
                              void onSaveOrder({ ...item, kitchenStatus: ARCHIVE_STATUS });
                            }}
                          >
                            В архів
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleOrders.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">
                    Немає замовлень для відображення.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Archive size={16} /> Архів
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{archivedOrders.length}</span>
        </div>
        {archivedOrders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
            Архів порожній.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-2">Дата події</th>
                  <th className="px-3 py-2">Клієнт</th>
                  <th className="px-3 py-2">Тип заходу</th>
                  <th className="px-3 py-2">Гостей</th>
                  <th className="px-3 py-2">Менеджер</th>
                  <th className="px-3 py-2">Стадія</th>
                  <th className="px-3 py-2">Дії</th>
                </tr>
              </thead>
              <tbody>
                {archivedOrders.map((item) => {
                  const contact = contactsById[String(item.contactId)] || null;
                  const customer = item.customerName || contact?.name || "";
                  const company = item.companyName || contact?.company || "";
                  return (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900">{formatDateUk(item.eventDate)}</td>
                      <td className="px-3 py-2 text-slate-700">{[company, customer].filter(Boolean).join(" — ") || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{item.eventType || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{item.guestCount || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{item.managerName || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{ORDER_STATUS_LABELS[item.status] || item.status}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                          disabled={saving}
                          onClick={() => void onSaveOrder({ ...item, kitchenStatus: "completed" })}
                        >
                          Повернути
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {(() => {
        if (!detailsOrderId) return null;
        const detailsOrder = orders.find((order) => String(order.id) === String(detailsOrderId));
        if (!detailsOrder) return null;
        const detailContact = contactsById[String(detailsOrder.contactId)] || null;
        const detailCustomer = detailsOrder.customerName || detailContact?.name || "—";
        const detailCompany = detailsOrder.companyName || detailContact?.company || "";
        const relatedProposals = proposalsByOrder.get(String(detailsOrder.id)) || [];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setDetailsOrderId(null)}>
            <div className="max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="text-base font-semibold text-slate-900">{detailsOrder.title || detailCustomer}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{[detailCompany, detailCustomer].filter(Boolean).join(" — ") || "—"}</div>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                  onClick={() => setDetailsOrderId(null)}
                  aria-label="Закрити"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="max-h-[calc(88vh-64px)] overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-2 gap-3 text-xs text-slate-600 sm:grid-cols-3">
                  <div>Подія: <span className="font-medium text-slate-800">{formatDateUk(detailsOrder.eventDate)}{detailsOrder.eventTime ? ` • ${detailsOrder.eventTime}${detailsOrder.eventEndTime ? `–${detailsOrder.eventEndTime}` : ""}` : ""}</span></div>
                  <div>Тип заходу: <span className="font-medium text-slate-800">{detailsOrder.eventType || "—"}</span></div>
                  <div>Гостей: <span className="font-medium text-slate-800">{detailsOrder.guestCount || "—"}</span></div>
                  <div>Менеджер: <span className="font-medium text-slate-800">{detailsOrder.managerName || "—"}</span></div>
                  <div>Стадія: <span className="font-medium text-slate-800">{ORDER_STATUS_LABELS[detailsOrder.status] || detailsOrder.status}</span></div>
                </div>
                {detailsOrder.notes && (
                  <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {detailsOrder.notes}
                  </div>
                )}
                <div className="mt-5">
                  <div className="text-sm font-semibold text-slate-900">Меню з комерційної пропозиції</div>
                  {relatedProposals.length === 0 && (
                    <div className="mt-2 rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500">
                      Немає комерційних пропозицій для цього замовлення.
                    </div>
                  )}
                  {relatedProposals.map((proposal) => {
                    const items = Array.isArray(proposal.items) ? proposal.items : [];
                    return (
                      <div key={proposal.id} className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                        <div className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          <div className="font-semibold text-slate-800">{proposal.title || "Комерційна пропозиція"}</div>
                          {proposal.proposalDate && (
                            <div>Дата КП: <span className="font-medium text-slate-800">{formatDateUk(proposal.proposalDate)}</span></div>
                          )}
                        </div>
                        {items.length === 0 ? (
                          <div className="px-3 py-4 text-center text-xs text-slate-500">У пропозиції немає позицій.</div>
                        ) : (
                          <table className="min-w-full text-sm">
                            <thead className="bg-white text-left text-xs uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-3 py-2">Позиція</th>
                                <th className="px-3 py-2">Вихід</th>
                                <th className="px-3 py-2 text-right">К-сть</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((entry) => (
                                <tr key={entry.id} className="border-t border-slate-100">
                                  <td className="px-3 py-2 text-slate-800">
                                    <div className="font-medium">{entry.productName || "—"}</div>
                                    {entry.comment && (
                                      <div className="mt-0.5 text-xs text-slate-500">{entry.comment}</div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-slate-700">{entry.output || "—"}</td>
                                  <td className="px-3 py-2 text-right text-slate-800">{entry.quantity || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
