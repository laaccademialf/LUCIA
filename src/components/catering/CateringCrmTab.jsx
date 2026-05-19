import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ClipboardList, ContactRound, FileText, Pencil, Plus, Trash2, Users } from "lucide-react";

const ORDER_STATUSES = [
  { id: "new", label: "Новий / Інтерес", tone: "border-slate-200 bg-slate-50 text-slate-700" },
  { id: "brief", label: "Бриф", tone: "border-sky-200 bg-sky-50 text-sky-700" },
  { id: "proposal", label: "Пропозиція", tone: "border-violet-200 bg-violet-50 text-violet-700" },
  { id: "work", label: "В роботі", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  { id: "tender", label: "Тендер", tone: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700" },
  { id: "confirmed", label: "Підтверджено", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { id: "cancelled", label: "Втрачено", tone: "border-rose-200 bg-rose-50 text-rose-700" },
];

const FIELD_TYPES = ["text", "textarea", "number", "date", "select", "checkbox"];

const formatMoney = (value) => new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "UAH",
  maximumFractionDigits: 0,
}).format(Number(value || 0));

const emptyOrder = {
  id: "",
  title: "",
  customerName: "",
  contactId: "",
  managerName: "",
  amount: "",
  guestCount: "",
  eventDate: "",
  status: "new",
  notes: "",
  tags: "",
};

const emptyContact = {
  id: "",
  name: "",
  company: "",
  phone: "",
  email: "",
  assignedManager: "",
  notes: "",
};

const emptyField = {
  id: "",
  label: "",
  key: "",
  type: "text",
  required: false,
  placeholder: "",
};

const baseInput = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

export default function CateringCrmTab({
  mode,
  orders,
  contacts,
  fieldTemplates,
  managers,
  saving,
  onSaveOrder,
  onDeleteOrder,
  onSaveContact,
  onDeleteContact,
  onSaveField,
  onDeleteField,
}) {
  const [orderForm, setOrderForm] = useState(emptyOrder);
  const [contactForm, setContactForm] = useState(emptyContact);
  const [fieldForm, setFieldForm] = useState(emptyField);
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);

  useEffect(() => {
    setOrderForm(emptyOrder);
    setContactForm(emptyContact);
    setFieldForm(emptyField);
  }, [mode]);

  const boardOrders = useMemo(() => orders.filter((item) => item.status !== "cancelled"), [orders]);
  const wonAmount = useMemo(() => orders.filter((item) => item.status === "confirmed").reduce((sum, item) => sum + Number(item.amount || 0), 0), [orders]);
  const pipelineAmount = useMemo(() => orders.filter((item) => item.status !== "confirmed" && item.status !== "cancelled").reduce((sum, item) => sum + Number(item.amount || 0), 0), [orders]);

  const orderCards = (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Plus size={18} className="text-indigo-600" />
              <h3 className="text-base font-semibold text-slate-900">Нове замовлення CRM</h3>
            </div>
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              onClick={() => {
                setOrderForm(emptyOrder);
                setShowNewOrderModal(true);
              }}
            >
              <Plus size={16} className="inline mr-1" />
              Нова угода
            </button>
          </div>
          <>
            {showNewOrderModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
                <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900">Нова CRM угода</h3>
                  <div className="space-y-3 max-h-[70vh] overflow-y-auto">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Назва угоди</label>
                      <input className={baseInput} value={orderForm.title} onChange={(event) => setOrderForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Напр. Фуршет для Softsvit" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Клієнт</label>
                      <input className={baseInput} value={orderForm.customerName} onChange={(event) => setOrderForm((prev) => ({ ...prev, customerName: event.target.value }))} placeholder="Назва компанії або контакт" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Контакт</label>
                      <select className={baseInput} value={orderForm.contactId} onChange={(event) => setOrderForm((prev) => ({ ...prev, contactId: event.target.value }))}>  
                        <option value="">Без прив'язки</option>
                        {contacts.map((item) => (
                          <option key={item.id} value={item.id}>{item.name}{item.company ? ` • ${item.company}` : ""}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Менеджер</label>
                        <input className={baseInput} list="catering-sales-managers" value={orderForm.managerName} onChange={(event) => setOrderForm((prev) => ({ ...prev, managerName: event.target.value }))} placeholder="Прізвище менеджера" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Стадія</label>
                        <select className={baseInput} value={orderForm.status} onChange={(event) => setOrderForm((prev) => ({ ...prev, status: event.target.value }))}>  
                          {ORDER_STATUSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Сума</label>
                        <input className={baseInput} value={orderForm.amount} onChange={(event) => setOrderForm((prev) => ({ ...prev, amount: event.target.value }))} placeholder="125000" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Дата події</label>
                        <input type="date" className={baseInput} value={orderForm.eventDate} onChange={(event) => setOrderForm((prev) => ({ ...prev, eventDate: event.target.value }))} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Гостей</label>
                        <input className={baseInput} value={orderForm.guestCount} onChange={(event) => setOrderForm((prev) => ({ ...prev, guestCount: event.target.value }))} placeholder="80" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Теги</label>
                        <input className={baseInput} value={orderForm.tags} onChange={(event) => setOrderForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="Весілля, Foodbox" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Нотатки</label>
                      <textarea className={`${baseInput} min-h-[96px]`} value={orderForm.notes} onChange={(event) => setOrderForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Короткий опис запиту, джерело ліда, деталі брифу" />
                    </div>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-200 pt-4">
                    <button
                      type="button"
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={saving || !orderForm.title.trim() || !orderForm.customerName.trim()}
                      onClick={async () => {
                        const result = await onSaveOrder(orderForm);
                        if (result?.success) {
                          setShowNewOrderModal(false);
                          setOrderForm(emptyOrder);
                        }
                      }}
                    >
                      {orderForm.id ? "Оновити угоду" : "Додати угоду"}
                    </button>
                    <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => {
                      setShowNewOrderModal(false);
                      setOrderForm(emptyOrder);
                    }}>
                      Скасувати
                    </button>
                  </div>
                  <datalist id="catering-sales-managers">
                    {managers.map((manager) => <option key={manager} value={manager} />)}
                  </datalist>
                </div>
              </div>
            )}
          </>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Активний pipeline</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{formatMoney(pipelineAmount)}</p>
            <p className="mt-1 text-xs text-slate-500">Угод у роботі: {boardOrders.length}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Підтверджено</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-900">{formatMoney(wonAmount)}</p>
            <p className="mt-1 text-xs text-emerald-700">Кухня бачить ці замовлення в моніторі</p>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Контакти</p>
            <p className="mt-2 text-2xl font-semibold text-sky-900">{contacts.length}</p>
            <p className="mt-1 text-xs text-sky-700">Усі контакти закріплені за менеджером</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-6">
          {ORDER_STATUSES.filter((item) => item.id !== "cancelled").map((column) => {
            const columnOrders = boardOrders.filter((item) => item.status === column.id);
            return (
              <div key={column.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className={`mb-3 rounded-xl border px-3 py-2 text-xs font-semibold ${column.tone}`}>
                  {column.label}: {columnOrders.length}
                </div>
                <div className="space-y-2">
                  {columnOrders.map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{item.title || "Без назви"}</div>
                          <div className="text-xs text-slate-500">{item.customerName || "Без клієнта"}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="button" className="rounded-md border border-slate-300 p-1 text-slate-600 hover:bg-white" onClick={() => setOrderForm({ ...item, tags: (item.tags || []).join(", ") })}>
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-rose-200 p-1 text-rose-600 hover:bg-rose-50"
                            onClick={() => {
                              if (!window.confirm("Видалити CRM-угоду?")) return;
                              void onDeleteOrder(item.id);
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-slate-600">
                        <div>Менеджер: <span className="font-medium text-slate-800">{item.managerName || "—"}</span></div>
                        <div>Сума: <span className="font-medium text-slate-800">{formatMoney(item.amount)}</span></div>
                        <div>Подія: <span className="font-medium text-slate-800">{item.eventDate || "—"}</span></div>
                        <div>Гостей: <span className="font-medium text-slate-800">{item.guestCount || "—"}</span></div>
                      </div>
                      {(item.tags || []).length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {(item.tags || []).map((tag) => (
                            <span key={`${item.id}_${tag}`} className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-3">
                        <select
                          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
                          value={item.status}
                          onChange={(event) => {
                            void onSaveOrder({ ...item, status: event.target.value });
                          }}
                        >
                          {ORDER_STATUSES.map((statusItem) => <option key={statusItem.id} value={statusItem.id}>{statusItem.label}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                  {columnOrders.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                      Поки порожньо
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const contactsView = (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <ContactRound size={18} className="text-indigo-600" />
          <h3 className="text-base font-semibold text-slate-900">Контакт клієнта</h3>
        </div>
        <div className="space-y-3">
          <input className={baseInput} value={contactForm.name} onChange={(event) => setContactForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Ім'я або назва компанії" />
          <input className={baseInput} value={contactForm.company} onChange={(event) => setContactForm((prev) => ({ ...prev, company: event.target.value }))} placeholder="Компанія" />
          <input className={baseInput} value={contactForm.phone} onChange={(event) => setContactForm((prev) => ({ ...prev, phone: event.target.value }))} placeholder="Телефон" />
          <input className={baseInput} value={contactForm.email} onChange={(event) => setContactForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="Email" />
          <input className={baseInput} list="catering-contact-managers" value={contactForm.assignedManager} onChange={(event) => setContactForm((prev) => ({ ...prev, assignedManager: event.target.value }))} placeholder="Закріплений менеджер" />
          <textarea className={`${baseInput} min-h-[96px]`} value={contactForm.notes} onChange={(event) => setContactForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Коментар, джерело контакту, особливості клієнта" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving || !contactForm.name.trim() || !contactForm.assignedManager.trim()}
              onClick={async () => {
                const result = await onSaveContact(contactForm);
                if (result?.success) setContactForm(emptyContact);
              }}
            >
              {contactForm.id ? "Оновити контакт" : "Додати контакт"}
            </button>
            {contactForm.id && (
              <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setContactForm(emptyContact)}>
                Скасувати
              </button>
            )}
          </div>
          <datalist id="catering-contact-managers">
            {managers.map((manager) => <option key={manager} value={manager} />)}
          </datalist>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Users size={18} className="text-sky-600" />
          <h3 className="text-base font-semibold text-slate-900">Контакти клієнтів</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Контакт</th>
                <th className="px-3 py-2">Компанія</th>
                <th className="px-3 py-2">Менеджер</th>
                <th className="px-3 py-2">Телефон</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Дії</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((item) => (
                <tr key={item.id} className="border-t border-slate-200 align-top">
                  <td className="px-3 py-3 font-medium text-slate-900">{item.name}</td>
                  <td className="px-3 py-3 text-slate-700">{item.company || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{item.assignedManager || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{item.phone || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{item.email || "—"}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <button type="button" className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50" onClick={() => setContactForm(item)}>
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                        onClick={() => {
                          if (!window.confirm("Видалити контакт?")) return;
                          void onDeleteContact(item.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">Контактів ще немає.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const fieldsView = (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <FileText size={18} className="text-violet-600" />
          <h3 className="text-base font-semibold text-slate-900">Типове поле CRM</h3>
        </div>
        <div className="space-y-3">
          <input className={baseInput} value={fieldForm.label} onChange={(event) => setFieldForm((prev) => ({ ...prev, label: event.target.value }))} placeholder="Назва поля" />
          <input className={baseInput} value={fieldForm.key} onChange={(event) => setFieldForm((prev) => ({ ...prev, key: event.target.value }))} placeholder="Ключ, напр. event_format" />
          <select className={baseInput} value={fieldForm.type} onChange={(event) => setFieldForm((prev) => ({ ...prev, type: event.target.value }))}>
            {FIELD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <input className={baseInput} value={fieldForm.placeholder} onChange={(event) => setFieldForm((prev) => ({ ...prev, placeholder: event.target.value }))} placeholder="Плейсхолдер або підказка" />
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input type="checkbox" checked={fieldForm.required} onChange={(event) => setFieldForm((prev) => ({ ...prev, required: event.target.checked }))} />
            Обов'язкове поле
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving || !fieldForm.label.trim() || !fieldForm.key.trim()}
              onClick={async () => {
                const result = await onSaveField(fieldForm);
                if (result?.success) setFieldForm(emptyField);
              }}
            >
              {fieldForm.id ? "Оновити поле" : "Додати поле"}
            </button>
            {fieldForm.id && (
              <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setFieldForm(emptyField)}>
                Скасувати
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardList size={18} className="text-violet-600" />
          <h3 className="text-base font-semibold text-slate-900">Набір типових полів</h3>
        </div>
        <div className="space-y-3">
          {fieldTemplates.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900">{item.label}</p>
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">{item.type}</span>
                  {item.required && <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-700">обов'язкове</span>}
                </div>
                <p className="mt-1 text-xs text-slate-500">{item.key}</p>
                {item.placeholder && <p className="mt-1 text-sm text-slate-600">{item.placeholder}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-white" onClick={() => setFieldForm(item)}>
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="rounded-md border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                  onClick={() => {
                    if (!window.confirm("Видалити типове поле?")) return;
                    void onDeleteField(item.id);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {fieldTemplates.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
              Типові поля ще не налаштовані.
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {mode === "crm-contacts" ? contactsView : mode === "crm-fields" ? fieldsView : orderCards}
    </div>
  );
}
