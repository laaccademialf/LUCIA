import { useEffect, useMemo, useRef, useState } from "react";
import { Wrench, ClipboardList, Upload, Trash2, Send, Inbox, LayoutGrid, Table2, Search, Archive, User2, X, CalendarDays } from "lucide-react";
import { useServiceRequests } from "../hooks/useServiceRequests";
import { getUsers } from "../firebase/users";

const cardClass = "card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl";
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";

const STATUS_OPTIONS = [
  { value: "new", label: "Нова", color: "bg-blue-100 text-blue-700" },
  { value: "in_progress", label: "Прийнято в роботу", color: "bg-amber-100 text-amber-700" },
  { value: "waiting_parts", label: "В процесі виконання", color: "bg-purple-100 text-purple-700" },
  { value: "resolved", label: "Виконано", color: "bg-emerald-100 text-emerald-700" },
  { value: "cancelled", label: "Скасовано", color: "bg-slate-200 text-slate-700" },
];

const URGENCY_OPTIONS = [
  { value: "low", label: "Низька" },
  { value: "normal", label: "Середня" },
  { value: "high", label: "Висока" },
  { value: "critical", label: "Критична" },
];

// Колонки канбан-дошки (активні статуси). Скасовані заявки потрапляють до архіву.
const KANBAN_COLUMNS = [
  { value: "new", short: "Нова", color: "bg-sky-100 text-sky-700 border-sky-200", dot: "bg-sky-500", accent: "border-t-sky-400" },
  { value: "in_progress", short: "Прийнято в роботу", color: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500", accent: "border-t-amber-400" },
  { value: "waiting_parts", short: "В процесі виконання", color: "bg-violet-100 text-violet-700 border-violet-200", dot: "bg-violet-500", accent: "border-t-violet-400" },
  { value: "resolved", short: "Виконано", color: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", accent: "border-t-emerald-400" },
];

const ARCHIVE_STATUS = { value: "cancelled", short: "Скасовано" };

const URGENCY_BADGE = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-sky-100 text-sky-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

// Посади користувачів, доступні як контакт для зв'язку (Керуючий, Менеджер, Зав.госп).
const isAllowedContactPositionValue = (rawValue) => {
  const value = String(rawValue || "").trim().toLowerCase();
  if (!value) return false;
  if (value === "менеджер" || value === "manager") return true;
  if (value.startsWith("керуюч")) return true; // керуючий / керуюча
  const compact = value.replace(/[.\s]/g, ""); // "зав. госп" -> "завгосп"
  if (compact === "завгосп" || compact === "завгоспа") return true;
  return false;
};

const getUserPositionLabel = (userRow) => {
  const workRole = String(userRow?.workRole || userRow?.work_role || userRow?.work_role_name || "").trim();
  const position = String(userRow?.position || userRow?.position_name || "").trim();
  return workRole || position || String(userRow?.role || "").trim();
};

const matchesContactPosition = (userRow) =>
  [
    userRow?.role,
    userRow?.workRole,
    userRow?.work_role,
    userRow?.work_role_name,
    userRow?.position,
    userRow?.position_name,
  ].some((value) => isAllowedContactPositionValue(value));

const userBelongsToRestaurant = (userRow, restaurantId, restaurantName) => {
  const wanted = new Set(
    [restaurantId, restaurantName]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
  if (!wanted.size) return false;
  const scopes = [
    ...(Array.isArray(userRow?.restaurants) ? userRow.restaurants : []),
    userRow?.restaurant,
    userRow?.restaurant_id,
    userRow?.restaurantId,
    userRow?.restaurantName,
    userRow?.restaurant_name,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  return scopes.some((scope) => wanted.has(scope));
};

const getUserDisplayName = (userRow) =>
  String(userRow?.displayName || userRow?.display_name || userRow?.name || userRow?.email || userRow?.user_email || "").trim();

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

function DateInputField({ value, onChange, placeholder = "дд.мм.рррр", className = inputClass }) {
  const inputRef = useRef(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  };

  return (
    <div className="relative">
      <input ref={inputRef} type="date" className={className} value={value} onChange={onChange} placeholder={placeholder} />
      <button
        type="button"
        onClick={openPicker}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-indigo-600"
        title="Відкрити календар"
      >
        <CalendarDays size={16} />
      </button>
    </div>
  );
}

function RequestFormTab({ user, restaurants, createRequest, requests = [] }) {
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
  const [users, setUsers] = useState([]);

  useEffect(() => {
    let cancelled = false;
    getUsers()
      .then((list) => {
        if (!cancelled) setUsers(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRestaurant = useMemo(
    () => restaurants.find((item) => String(item.id) === String(form.restaurantId)),
    [restaurants, form.restaurantId]
  );

  const contactOptions = useMemo(() => {
    if (!form.restaurantId) return [];
    const restaurantName = selectedRestaurant?.name || "";
    return users
      .filter((userRow) => matchesContactPosition(userRow))
      .filter((userRow) => userBelongsToRestaurant(userRow, form.restaurantId, restaurantName))
      .map((userRow) => {
        const name = getUserDisplayName(userRow);
        const position = getUserPositionLabel(userRow);
        return {
          value: name,
          label: position ? `${name} · ${position}` : name,
        };
      })
      .filter((option) => option.value)
      .sort((a, b) => a.label.localeCompare(b.label, "uk"));
  }, [users, form.restaurantId, selectedRestaurant]);

  useEffect(() => {
    if (form.contact && !contactOptions.some((option) => option.value === form.contact)) {
      setForm((p) => ({ ...p, contact: "" }));
    }
  }, [contactOptions, form.contact]);

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

  const [showArchive, setShowArchive] = useState(false);

  const myRequests = useMemo(() => {
    const uid = String(user?.uid || "");
    return (requests || []).filter((item) => String(item?.createdById || "") === uid);
  }, [requests, user?.uid]);

  const myActiveRequests = useMemo(
    () => myRequests.filter((item) => !["resolved", "cancelled"].includes(item?.status)),
    [myRequests]
  );

  const myArchivedRequests = useMemo(
    () => myRequests.filter((item) => ["resolved", "cancelled"].includes(item?.status)),
    [myRequests]
  );

  const renderRequestRow = (item) => {
    const statusMeta = getStatusMeta(item?.status);
    return (
      <div
        key={item.id}
        className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-indigo-300"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">{item?.title || "Без теми"}</p>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${statusMeta.color}`}>
            {statusMeta.label}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{item?.description || "—"}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {item?.equipment && <span>🛠 {item.equipment}</span>}
          {item?.restaurantName && <span>📍 {item.restaurantName}</span>}
          <span>⏱ {formatDateTimeUk(item?.createdAt)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:items-start">
      <form onSubmit={handleSubmit} className={`${cardClass} col-span-1 self-start overflow-hidden p-0 lg:col-span-2`}>
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 text-white">
          <div className="flex items-center gap-2">
            <Wrench size={20} />
            <h2 className="text-lg font-semibold">Нова заявка на сервіс</h2>
          </div>
          <p className="mt-1 text-sm text-indigo-100">Опишіть проблему — сервісний відділ візьме її в роботу.</p>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="text-sm font-semibold text-slate-800">Тема *</label>
            <input className={inputClass} value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Напр. Не працює холодильник" />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Обладнання *</label>
            <input className={inputClass} value={form.equipment} onChange={(e) => setForm((p) => ({ ...p, equipment: e.target.value }))} placeholder="Модель/інвентарний номер" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-800">Контакт для зв'язку</label>
            <select
              className={inputClass}
              value={form.contact}
              onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))}
              disabled={!form.restaurantId || contactOptions.length === 0}
            >
              <option value="">
                {!form.restaurantId
                  ? "Спочатку оберіть ресторан"
                  : contactOptions.length === 0
                    ? "Немає доступних контактів"
                    : "Оберіть контакт"}
              </option>
              {contactOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-800">Бажана дата виконання</label>
            <DateInputField value={form.preferredDate} onChange={(e) => setForm((p) => ({ ...p, preferredDate: e.target.value }))} />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-800">Опис проблеми *</label>
            <textarea
              className={`${inputClass} min-h-[120px] resize-y`}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Що трапилось, коли почалось, як впливає на роботу"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-800">Фото (до 4 файлів)</label>
            <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Upload size={16} /> Завантажити фото
              <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
            </label>

            {photos.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
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

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
          >
            <Send size={16} />
            {submitting ? "Створення..." : "Створити заявку"}
          </button>
        </div>
      </form>

      <div className="col-span-1 space-y-4 lg:col-span-3">
        <div className={`${cardClass} overflow-hidden`}>
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList size={18} className="text-indigo-600" />
            <h3 className="text-base font-semibold text-slate-900">Мої заявки (активні)</h3>
            <span className="ml-auto rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
              {myActiveRequests.length}
            </span>
          </div>
          {myActiveRequests.length > 0 ? (
            <div className="space-y-3">{myActiveRequests.map(renderRequestRow)}</div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-slate-500">
              <Inbox size={28} className="text-slate-300" />
              У вас немає активних сервісних заявок.
            </div>
          )}
        </div>

        <div className={`${cardClass} overflow-hidden`}>
          <button
            type="button"
            onClick={() => setShowArchive((prev) => !prev)}
            className="flex w-full items-center gap-2 text-left"
          >
            <Wrench size={16} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-800">Архів моїх заявок ({myArchivedRequests.length})</span>
            <span className="ml-auto text-xs text-slate-500">{showArchive ? "сховати" : "показати"}</span>
          </button>
          {showArchive && (
            <div className="mt-3 space-y-3">
              {myArchivedRequests.length > 0 ? (
                myArchivedRequests.map(renderRequestRow)
              ) : (
                <p className="py-4 text-center text-sm text-slate-500">Архів порожній.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RequestKanbanCard({ request, onOpen, onDragStart, draggable }) {
  const urgencyClass = URGENCY_BADGE[request.urgency] || URGENCY_BADGE.normal;
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => onDragStart(e, request)}
      onClick={() => onOpen(request)}
      className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-[13px] font-semibold text-slate-900">{request.title || "Без теми"}</p>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${urgencyClass}`}>
          {getUrgencyLabel(request.urgency)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
        {request.equipment ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5">
            <Wrench size={10} />
            <span className="max-w-[120px] truncate">{request.equipment}</span>
          </span>
        ) : null}
        {Array.isArray(request.photos) && request.photos.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5">
            📷 {request.photos.length}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-center gap-1 border-t border-slate-100 pt-1.5 text-[10px] text-slate-400">
        <User2 size={11} />
        <span className="truncate">{request.createdByName || "—"}</span>
        {request.restaurantName ? <span className="truncate">· {request.restaurantName}</span> : null}
      </div>
    </div>
  );
}

function RequestKanbanBoard({ requests, onOpen, onDrop, onDragStart, dragOverStatus, setDragOverStatus, canManage }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {KANBAN_COLUMNS.map((column) => {
        const columnRequests = requests.filter((item) => (item.status || "new") === column.value);
        const isOver = dragOverStatus === column.value;
        return (
          <div
            key={column.value}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStatus(column.value);
            }}
            onDragLeave={() => setDragOverStatus((prev) => (prev === column.value ? null : prev))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverStatus(null);
              onDrop(e, column.value);
            }}
            className={`flex flex-col rounded-2xl border bg-slate-50 transition ${
              isOver ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200" : "border-slate-200"
            }`}
          >
            <div className={`flex items-center justify-between rounded-t-2xl border-t-4 ${column.accent} px-3 py-2.5`}>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${column.dot}`} />
                <span className="text-sm font-semibold text-slate-700">{column.short}</span>
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">{columnRequests.length}</span>
            </div>

            <div className="flex-1 space-y-2.5 p-2.5">
              {columnRequests.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                  {canManage ? "Перетягніть сюди заявку" : "Немає заявок"}
                </div>
              ) : (
                columnRequests.map((item) => (
                  <RequestKanbanCard
                    key={item.id}
                    request={item}
                    onOpen={onOpen}
                    onDragStart={onDragStart}
                    draggable={canManage}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RequestDetailModal({ request, onClose, canManage, onChangeStatus, onUpdateMeta }) {
  const statusMeta = getStatusMeta(request.status);
  const urgencyClass = URGENCY_BADGE[request.urgency] || URGENCY_BADGE.normal;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 text-white">
          <div>
            <h3 className="text-lg font-semibold">{request.title || "Без теми"}</h3>
            <p className="mt-0.5 text-sm text-indigo-100">
              {request.restaurantName || "—"} · {request.equipment || "—"} · {formatDateTimeUk(request.createdAt)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-white/80 hover:bg-white/10 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusMeta.color}`}>{statusMeta.label}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${urgencyClass}`}>{getUrgencyLabel(request.urgency)}</span>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Опис проблеми</label>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{request.description || "Опис відсутній"}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs font-semibold text-slate-600">Контакт</label>
              <div className="text-sm text-slate-800">{request.contact || "—"}</div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Локація</label>
              <div className="text-sm text-slate-800">{request.location || "—"}</div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Заявник</label>
              <div className="text-sm text-slate-800">{request.createdByName || "—"}</div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Бажана дата</label>
              <div className="text-sm text-slate-800">{request.preferredDate || "—"}</div>
            </div>
          </div>

          {Array.isArray(request.photos) && request.photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {request.photos.map((photo, index) => (
                <a key={`${request.id}-photo-${index}`} href={photo.dataUrl} target="_blank" rel="noreferrer" className="block">
                  <img src={photo.dataUrl} alt={photo.name || "photo"} className="h-20 w-20 rounded border border-slate-200 object-cover" />
                </a>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 md:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">Статус</label>
              <select
                className={inputClass}
                value={request.status || "new"}
                onChange={(e) => onChangeStatus(request, e.target.value)}
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
                defaultValue={request.assignedTo || ""}
                onBlur={(e) => {
                  const nextValue = e.target.value;
                  if (nextValue === (request.assignedTo || "")) return;
                  void onUpdateMeta(request, "assignedTo", nextValue);
                }}
                disabled={!canManage}
                placeholder="Ім'я відповідального"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Коментар експлуатації</label>
              <input
                className={inputClass}
                defaultValue={request.internalComment || ""}
                onBlur={(e) => {
                  const nextValue = e.target.value;
                  if (nextValue === (request.internalComment || "")) return;
                  void onUpdateMeta(request, "internalComment", nextValue);
                }}
                disabled={!canManage}
                placeholder="Що зроблено / що потрібно"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminRequestsTab({ requests, restaurants, user, canManage, updateRequest }) {
  const [search, setSearch] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [restaurantFilter, setRestaurantFilter] = useState("");
  const [view, setView] = useState("kanban");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [archiveDragOver, setArchiveDragOver] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const draggedRef = useRef(null);

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

  const filteredRequests = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return (requests || []).filter((item) => {
      const byRestaurant = restaurantFilter ? String(item.restaurantId || "") === String(restaurantFilter) : true;
      const byUrgency = urgencyFilter === "all" ? true : item.urgency === urgencyFilter;
      const bySearch = normalizedSearch
        ? String(requestSearchPoolById.get(String(item?.id || "")) || "").includes(normalizedSearch)
        : true;
      return byRestaurant && byUrgency && bySearch;
    });
  }, [requests, restaurantFilter, urgencyFilter, search, requestSearchPoolById]);

  const activeRequests = useMemo(
    () => filteredRequests.filter((item) => (item.status || "new") !== ARCHIVE_STATUS.value),
    [filteredRequests]
  );

  const archivedRequests = useMemo(
    () => filteredRequests.filter((item) => (item.status || "new") === ARCHIVE_STATUS.value),
    [filteredRequests]
  );

  const stats = useMemo(() => {
    const map = {};
    for (const column of KANBAN_COLUMNS) map[column.value] = 0;
    for (const item of activeRequests) {
      const key = item.status || "new";
      if (map[key] !== undefined) map[key] += 1;
    }
    return map;
  }, [activeRequests]);

  const changeStatus = async (item, newStatus) => {
    if (!canManage || (item.status || "new") === newStatus) return;
    const result = await updateRequest(item.id, {
      ...item,
      status: newStatus,
      statusHistory: [
        ...(item.statusHistory || []),
        {
          status: newStatus,
          by: user?.displayName || user?.email || "Система",
          at: new Date().toISOString(),
          comment: `Статус змінено на "${getStatusMeta(newStatus).label}"`,
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

  const handleDragStart = (event, item) => {
    draggedRef.current = item;
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };

  const handleDropToStatus = async (event, status) => {
    const item = draggedRef.current;
    draggedRef.current = null;
    if (!item || !canManage) return;
    await changeStatus(item, status);
  };

  const handleDropToArchive = async (event) => {
    event.preventDefault();
    setArchiveDragOver(false);
    const item = draggedRef.current;
    draggedRef.current = null;
    if (!item || !canManage || (item.status || "new") === ARCHIVE_STATUS.value) return;
    await changeStatus(item, ARCHIVE_STATUS.value);
  };

  return (
    <div className="space-y-5">
      <div className={`${cardClass} overflow-hidden p-0`}>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white">
              <ClipboardList size={22} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Адміністрування заявок</h2>
              <p className="text-sm text-slate-500">Керування сервісними заявками</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setView("kanban")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  view === "kanban" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                }`}
              >
                <LayoutGrid size={15} />
                Канбан
              </button>
              <button
                type="button"
                onClick={() => setView("table")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  view === "table" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                }`}
              >
                <Table2 size={15} />
                Таблиця
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {KANBAN_COLUMNS.map((column) => (
              <span
                key={column.value}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${column.color}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${column.dot}`} />
                {column.short}: {stats[column.value] || 0}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="w-52 rounded-xl border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="Пошук заявок..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value)}
            >
              <option value="all">Уся терміновість</option>
              {URGENCY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <select
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              value={restaurantFilter}
              onChange={(e) => setRestaurantFilter(e.target.value)}
            >
              <option value="">Всі ресторани</option>
              {restaurants.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!canManage && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          У вас режим перегляду. Змінювати статуси може відділ експлуатації або адміністратор.
        </div>
      )}

      {view === "kanban" ? (
        <RequestKanbanBoard
          requests={activeRequests}
          onOpen={setSelectedRequest}
          onDrop={handleDropToStatus}
          onDragStart={handleDragStart}
          dragOverStatus={dragOverStatus}
          setDragOverStatus={setDragOverStatus}
          canManage={canManage}
        />
      ) : (
        <div className={`${cardClass} space-y-2`}>
          {activeRequests.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Заявки не знайдено за поточними фільтрами.
            </div>
          ) : (
            activeRequests.map((item) => {
              const statusMeta = getStatusMeta(item.status);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedRequest(item)}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left transition hover:border-indigo-300 hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.title || "Без теми"}</p>
                    <p className="truncate text-xs text-slate-500">
                      {item.restaurantName || "—"} · {item.equipment || "—"} · {item.createdByName || "—"}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${statusMeta.color}`}>{statusMeta.label}</span>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${URGENCY_BADGE[item.urgency] || URGENCY_BADGE.normal}`}>
                    {getUrgencyLabel(item.urgency)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArchiveDragOver(true);
        }}
        onDragLeave={() => setArchiveDragOver(false)}
        onDrop={handleDropToArchive}
        className={`flex items-center justify-between gap-3 rounded-2xl border-2 border-dashed px-5 py-4 transition ${
          archiveDragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-slate-50"
        }`}
      >
        <button
          type="button"
          onClick={() => setShowArchive((prev) => !prev)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"
        >
          <Archive size={18} />
          Архів / скасовані ({archivedRequests.length})
          <span className="text-xs font-normal text-slate-400">{showArchive ? "сховати" : "показати"}</span>
        </button>
        <span className="hidden text-xs text-slate-400 sm:block">Перетягніть заявку сюди, щоб скасувати</span>
      </div>

      {showArchive && (
        <div className={`${cardClass} space-y-2`}>
          {archivedRequests.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">В архіві поки немає заявок.</p>
          ) : (
            archivedRequests.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedRequest(item)}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left transition hover:border-indigo-300 hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{item.title || "Без теми"}</p>
                  <p className="truncate text-xs text-slate-500">
                    {item.restaurantName || "—"} · {item.equipment || "—"} · {item.createdByName || "—"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">Скасовано</span>
              </button>
            ))
          )}
        </div>
      )}

      {selectedRequest && (
        <RequestDetailModal
          request={requests.find((item) => item.id === selectedRequest.id) || selectedRequest}
          onClose={() => setSelectedRequest(null)}
          canManage={canManage}
          onChangeStatus={changeStatus}
          onUpdateMeta={updateMeta}
        />
      )}
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

  return <RequestFormTab user={user} restaurants={restaurants} createRequest={createRequest} requests={requests} />;
}
