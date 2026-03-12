import { useMemo, useState } from "react";
import { Wrench, ClipboardList, Upload, Trash2 } from "lucide-react";
import { useServiceRequests } from "../hooks/useServiceRequests";

const cardClass = "card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl";
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";

const STATUS_OPTIONS = [
  { value: "new", label: "Нова", color: "bg-blue-100 text-blue-700" },
  { value: "in_progress", label: "В роботі", color: "bg-amber-100 text-amber-700" },
  { value: "waiting_parts", label: "Очікує запчастини", color: "bg-purple-100 text-purple-700" },
  { value: "resolved", label: "Виконано", color: "bg-emerald-100 text-emerald-700" },
  { value: "cancelled", label: "Скасовано", color: "bg-slate-200 text-slate-700" },
];

const URGENCY_OPTIONS = [
  { value: "low", label: "Низька" },
  { value: "normal", label: "Середня" },
  { value: "high", label: "Висока" },
  { value: "critical", label: "Критична" },
];

const normalizeTabKind = (tabId = "") => {
  const value = String(tabId).toLowerCase();
  if (value.includes("admin") || value.includes("process") || value.includes("оброб")) return "admin";
  return "request";
};

const hasMaintenanceAccess = (user) => {
  const roleValue = String(user?.role || "").toLowerCase();
  const workRoleValue = String(user?.workRole || "").toLowerCase();
  const terms = ["admin", "maintenance", "service", "експлуатац", "сервіс", "інженер", "facility"];
  return terms.some((term) => roleValue.includes(term) || workRoleValue.includes(term));
};

const getStatusMeta = (status) => STATUS_OPTIONS.find((item) => item.value === status) || STATUS_OPTIONS[0];
const getUrgencyLabel = (urgency) => URGENCY_OPTIONS.find((item) => item.value === urgency)?.label || "—";
const dateTimeFormatterUk = new Intl.DateTimeFormat("uk-UA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const formatDateTimeUk = (value) => {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatterUk.format(date);
};

const toDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

function RequestFormTab({ user, restaurants, createRequest }) {
  const [form, setForm] = useState({
    title: "",
    equipment: "",
    description: "",
    urgency: "normal",
    location: "",
    contact: "",
    restaurantId: user?.restaurant || "",
    preferredDate: "",
  });
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const selectedRestaurant = useMemo(
    () => restaurants.find((item) => String(item.id) === String(form.restaurantId)),
    [restaurants, form.restaurantId]
  );

  const handlePhotoSelect = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const limited = files.slice(0, Math.max(0, 4 - photos.length));
    const tooLarge = limited.find((file) => file.size > 5 * 1024 * 1024);
    if (tooLarge) {
      alert("Кожне фото має бути до 5MB.");
      return;
    }

    try {
      const encoded = await Promise.all(
        limited.map(async (file) => ({
          name: file.name,
          type: file.type,
          dataUrl: await toDataUrl(file),
        }))
      );
      setPhotos((prev) => [...prev, ...encoded]);
      event.target.value = "";
    } catch (error) {
      console.error("Помилка завантаження фото:", error);
      alert("Не вдалося обробити фото.");
    }
  };

  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.equipment.trim() || !form.description.trim()) {
      alert("Заповніть обов'язкові поля: тема, обладнання, опис.");
      return;
    }

    setSubmitting(true);
    const payload = {
      title: form.title.trim(),
      equipment: form.equipment.trim(),
      description: form.description.trim(),
      urgency: form.urgency,
      location: form.location.trim(),
      contact: form.contact.trim(),
      preferredDate: form.preferredDate || "",
      status: "new",
      photos,
      restaurantId: form.restaurantId || user?.restaurant || "",
      restaurantName: selectedRestaurant?.name || "",
      createdById: user?.uid || "",
      createdByName: user?.displayName || user?.email || "",
      assignedTo: "",
      internalComment: "",
      statusHistory: [
        {
          status: "new",
          by: user?.displayName || user?.email || "Система",
          at: new Date().toISOString(),
          comment: "Заявку створено",
        },
      ],
    };

    const result = await createRequest(payload);
    setSubmitting(false);

    if (!result.success) {
      alert("Не вдалося створити заявку.");
      return;
    }

    setForm({
      title: "",
      equipment: "",
      description: "",
      urgency: "normal",
      location: "",
      contact: "",
      restaurantId: user?.restaurant || "",
      preferredDate: "",
    });
    setPhotos([]);
    alert("Заявка успішно створена.");
  };

  return (
    <form onSubmit={handleSubmit} className={cardClass}>
      <div className="mb-4 flex items-center gap-2">
        <Wrench size={18} className="text-indigo-600" />
        <h2 className="text-lg font-semibold">Нова заявка на сервіс</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-semibold text-slate-800">Тема *</label>
          <input className={inputClass} value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Напр. Не працює холодильник" />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Обладнання *</label>
          <input className={inputClass} value={form.equipment} onChange={(e) => setForm((p) => ({ ...p, equipment: e.target.value }))} placeholder="Модель/інвентарний номер" />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Терміновість</label>
          <select className={inputClass} value={form.urgency} onChange={(e) => setForm((p) => ({ ...p, urgency: e.target.value }))}>
            {URGENCY_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Ресторан</label>
          <select
            className={inputClass}
            value={form.restaurantId}
            onChange={(e) => setForm((p) => ({ ...p, restaurantId: e.target.value }))}
            disabled={Boolean(user?.restaurant) && user?.role !== "admin"}
          >
            <option value="">Оберіть ресторан</option>
            {restaurants.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Локація в ресторані</label>
          <input className={inputClass} value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} placeholder="Кухня, бар, склад..." />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Контакт для зв'язку</label>
          <input className={inputClass} value={form.contact} onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))} placeholder="Телефон / месенджер" />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Бажана дата виконання</label>
          <input type="date" className={inputClass} value={form.preferredDate} onChange={(e) => setForm((p) => ({ ...p, preferredDate: e.target.value }))} />
        </div>
      </div>

      <div className="mt-4">
        <label className="text-sm font-semibold text-slate-800">Опис проблеми *</label>
        <textarea
          className={`${inputClass} min-h-[120px]`}
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="Що трапилось, коли почалось, як впливає на роботу"
        />
      </div>

      <div className="mt-4">
        <label className="text-sm font-semibold text-slate-800">Фото (до 4 файлів)</label>
        <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
          <Upload size={16} /> Завантажити фото
          <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
        </label>

        {photos.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {photos.map((photo, index) => (
              <div key={`${photo.name}-${index}`} className="rounded-lg border border-slate-200 p-2">
                <img src={photo.dataUrl} alt={photo.name} className="h-24 w-full rounded object-cover" />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-slate-600">{photo.name}</p>
                  <button type="button" onClick={() => removePhoto(index)} className="rounded p-1 text-red-600 hover:bg-red-50">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {submitting ? "Створення..." : "Створити заявку"}
        </button>
      </div>
    </form>
  );
}

function AdminRequestsTab({ requests, restaurants, user, canManage, updateRequest }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [restaurantFilter, setRestaurantFilter] = useState("");

  const requestSearchPoolById = useMemo(() => {
    const index = new Map();
    for (const item of requests || []) {
      index.set(
        String(item?.id || ""),
        [item?.title, item?.equipment, item?.description, item?.createdByName, item?.restaurantName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
      );
    }
    return index;
  }, [requests]);

  const requestCreatedAtById = useMemo(() => {
    const index = new Map();
    for (const item of requests || []) {
      index.set(String(item?.id || ""), formatDateTimeUk(item?.createdAt));
    }
    return index;
  }, [requests]);

  const visibleRequests = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return requests.filter((item) => {
      const byRestaurant = restaurantFilter ? String(item.restaurantId || "") === String(restaurantFilter) : true;
      const byStatus = statusFilter === "all" ? true : item.status === statusFilter;
      const byUrgency = urgencyFilter === "all" ? true : item.urgency === urgencyFilter;
      const bySearch = normalizedSearch
        ? String(requestSearchPoolById.get(String(item?.id || "")) || "").includes(normalizedSearch)
        : true;
      return byRestaurant && byStatus && byUrgency && bySearch;
    });
  }, [requests, restaurantFilter, statusFilter, urgencyFilter, search, requestSearchPoolById]);

  const changeStatus = async (item, newStatus) => {
    if (!canManage) return;
    const result = await updateRequest(item.id, {
      ...item,
      status: newStatus,
      statusHistory: [
        ...(item.statusHistory || []),
        {
          status: newStatus,
          by: user?.displayName || user?.email || "Система",
          at: new Date().toISOString(),
          comment: `Статус змінено на \"${getStatusMeta(newStatus).label}\"`,
        },
      ],
    });

    if (!result.success) {
      alert("Не вдалося змінити статус заявки.");
    }
  };

  const updateMeta = async (item, field, value) => {
    if (!canManage) return;
    const result = await updateRequest(item.id, { ...item, [field]: value });
    if (!result.success) {
      alert("Не вдалося оновити заявку.");
    }
  };

  return (
    <div className={cardClass}>
      <div className="mb-4 flex items-center gap-2">
        <ClipboardList size={18} className="text-indigo-600" />
        <h2 className="text-lg font-semibold">Адміністрування заявок</h2>
      </div>

      {!canManage && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          У вас режим перегляду. Змінювати статуси може відділ експлуатації або адміністратор.
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label className="text-sm font-semibold text-slate-800">Пошук</label>
          <input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Тема, обладнання, опис, ресторан" />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Статус</label>
          <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Всі</option>
            {STATUS_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Терміновість</label>
          <select className={inputClass} value={urgencyFilter} onChange={(e) => setUrgencyFilter(e.target.value)}>
            <option value="all">Всі</option>
            {URGENCY_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Ресторан</label>
          <select className={inputClass} value={restaurantFilter} onChange={(e) => setRestaurantFilter(e.target.value)}>
            <option value="">Всі ресторани</option>
            {restaurants.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {visibleRequests.map((item) => {
          const statusMeta = getStatusMeta(item.status);
          return (
            <div key={item.id} className="rounded-lg border border-slate-200 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{item.title || "Без теми"}</h3>
                  <p className="text-xs text-slate-500">
                    {item.restaurantName || "—"} · {item.equipment || "—"} · {requestCreatedAtById.get(String(item?.id || "")) || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusMeta.color}`}>{statusMeta.label}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{getUrgencyLabel(item.urgency)}</span>
                </div>
              </div>

              <p className="mb-3 text-sm text-slate-700">{item.description || "Опис відсутній"}</p>

              <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Контакт</label>
                  <div className="text-sm text-slate-800">{item.contact || "—"}</div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Локація</label>
                  <div className="text-sm text-slate-800">{item.location || "—"}</div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Заявник</label>
                  <div className="text-sm text-slate-800">{item.createdByName || "—"}</div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Бажана дата</label>
                  <div className="text-sm text-slate-800">{item.preferredDate || "—"}</div>
                </div>
              </div>

              {Array.isArray(item.photos) && item.photos.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {item.photos.map((photo, index) => (
                    <a key={`${item.id}-photo-${index}`} href={photo.dataUrl} target="_blank" rel="noreferrer" className="block">
                      <img src={photo.dataUrl} alt={photo.name || "photo"} className="h-16 w-16 rounded border border-slate-200 object-cover" />
                    </a>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Статус</label>
                  <select
                    className={inputClass}
                    value={item.status || "new"}
                    onChange={(e) => changeStatus(item, e.target.value)}
                    disabled={!canManage}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Виконавець</label>
                  <input
                    className={inputClass}
                    defaultValue={item.assignedTo || ""}
                    onBlur={(e) => {
                      const nextValue = e.target.value;
                      if (nextValue === (item.assignedTo || "")) return;
                      void updateMeta(item, "assignedTo", nextValue);
                    }}
                    disabled={!canManage}
                    placeholder="Ім'я відповідального"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Коментар експлуатації</label>
                  <input
                    className={inputClass}
                    defaultValue={item.internalComment || ""}
                    onBlur={(e) => {
                      const nextValue = e.target.value;
                      if (nextValue === (item.internalComment || "")) return;
                      void updateMeta(item, "internalComment", nextValue);
                    }}
                    disabled={!canManage}
                    placeholder="Що зроблено / що потрібно"
                  />
                </div>
              </div>
            </div>
          );
        })}

        {visibleRequests.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            Заявки не знайдено за поточними фільтрами.
          </div>
        )}
      </div>
    </div>
  );
}

export default function ServiceRequestsModule({ topTab, restaurants = [], user }) {
  const { requests, loading, error, createRequest, updateRequest } = useServiceRequests(true);
  const tabKind = normalizeTabKind(topTab);
  const canManage = hasMaintenanceAccess(user);

  if (loading) {
    return (
      <div className={cardClass}>
        <p className="text-sm text-slate-600">Завантаження сервісних заявок...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cardClass}>
        <p className="text-sm text-red-600">Не вдалося завантажити модуль сервісних заявок.</p>
      </div>
    );
  }

  if (tabKind === "admin") {
    return (
      <AdminRequestsTab
        requests={requests}
        restaurants={restaurants}
        user={user}
        canManage={canManage}
        updateRequest={updateRequest}
      />
    );
  }

  return <RequestFormTab user={user} restaurants={restaurants} createRequest={createRequest} />;
}
