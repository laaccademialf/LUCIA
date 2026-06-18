import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  Briefcase,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";

const MONTHS_UK = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];
const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const WEEKDAYS_LONG = ["Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота", "Неділя"];

const START_HOUR = 7;
const END_HOUR = 24;
const HOUR_PX = 52;

const FALLBACK_PALETTE = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899",
  "#8b5cf6", "#ef4444", "#14b8a6", "#f97316", "#3b82f6",
];

const ORDER_STATUS_LABELS = {
  new: "Новий / Інтерес",
  brief: "Бриф",
  proposal: "Пропозиція",
  work: "В роботі",
  tender: "Тендер",
  confirmed: "Підтверджено",
  cancelled: "Скасовано",
};
const ORDER_STATUS_OPTIONS = Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({ value, label }));

const EVENT_STATUS_LABELS = {
  confirmed: "Підтверджено",
  tentative: "Орієнтовно",
  cancelled: "Скасовано",
};
const EVENT_STATUS_OPTIONS = Object.entries(EVENT_STATUS_LABELS).map(([value, label]) => ({ value, label }));

const pad = (value) => String(value).padStart(2, "0");
const toDateStr = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDate = (value) => {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};
const addDays = (date, amount) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};
const addMonths = (date, amount) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
};
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const startOfWeekMonday = (date) => {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - weekday);
  return next;
};
const timeToMinutes = (value) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};
const minutesToTime = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

const hexToRgba = (hex, alpha) => {
  const clean = String(hex || "").replace("#", "");
  if (clean.length !== 6) return `rgba(99, 102, 241, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const hashString = (value) => {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const emptyEventForm = {
  id: "",
  source: "event",
  orderId: "",
  title: "",
  locationId: "",
  startDate: "",
  endDate: "",
  startTime: "",
  endTime: "",
  allDay: false,
  status: "confirmed",
  guestCount: "",
  contactName: "",
  managerName: "",
  notes: "",
};

const baseInput = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

const openNativeDatePicker = (event) => {
  const input = event.currentTarget;
  if (typeof input?.showPicker === "function") {
    try {
      input.showPicker();
    } catch {
      /* showPicker may throw if not user-activated */
    }
  }
};

export default function CateringLocationsCalendarTab({
  locations = [],
  events = [],
  orders = [],
  managers = [],
  currentUserName = "",
  saving = false,
  onSaveEvent,
  onDeleteEvent,
  onSaveOrder,
  onSaveLocation,
}) {
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedLocationIds, setSelectedLocationIds] = useState([]);
  const [search, setSearch] = useState("");
  const [showCancelled, setShowCancelled] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [eventForm, setEventForm] = useState(emptyEventForm);

  const todayStr = toDateStr(new Date());

  const locationColorById = useMemo(() => {
    const map = new Map();
    locations.forEach((location, index) => {
      map.set(String(location.id), location.color || FALLBACK_PALETTE[index % FALLBACK_PALETTE.length]);
    });
    return map;
  }, [locations]);

  const resolveColor = (item) => {
    if (item.color) return item.color;
    if (item.locationId && locationColorById.has(String(item.locationId))) {
      return locationColorById.get(String(item.locationId));
    }
    if (item.locationName) {
      return FALLBACK_PALETTE[hashString(item.locationName) % FALLBACK_PALETTE.length];
    }
    return "#64748b";
  };

  const calendarItems = useMemo(() => {
    const fromEvents = events.map((event) => ({
      key: `event_${event.id}`,
      source: "event",
      raw: event,
      title: event.title || event.locationName || "Подія",
      locationId: event.locationId,
      locationName: event.locationName,
      color: event.color,
      startDate: event.startDate,
      endDate: event.endDate || event.startDate,
      startTime: event.allDay ? "" : event.startTime,
      endTime: event.allDay ? "" : event.endTime,
      allDay: Boolean(event.allDay),
      status: event.status,
      isCancelled: event.status === "cancelled",
      guestCount: event.guestCount,
      contactName: event.contactName,
      managerName: event.managerName,
      orderId: event.orderId,
      amount: 0,
    }));

    const fromOrders = orders
      .filter((order) => order.eventDate)
      .map((order) => ({
        key: `order_${order.id}`,
        source: "order",
        raw: order,
        title: order.title || order.customerName || "Угода",
        locationId: order.locationId,
        locationName: order.locationName,
        color: "",
        startDate: order.eventDate,
        endDate: order.eventEndDate || order.eventDate,
        startTime: order.eventTime,
        endTime: order.eventEndTime,
        allDay: !order.eventTime,
        status: order.status,
        isCancelled: order.status === "cancelled",
        guestCount: order.guestCount,
        contactName: order.customerName,
        managerName: order.managerName,
        orderId: order.id,
        amount: Number(order.amount || 0),
      }));

    return [...fromOrders, ...fromEvents];
  }, [events, orders]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return calendarItems.filter((item) => {
      if (!showCancelled && item.isCancelled) return false;
      if (selectedLocationIds.length > 0) {
        if (!item.locationId || !selectedLocationIds.includes(String(item.locationId))) return false;
      }
      if (term) {
        const haystack = `${item.title} ${item.locationName} ${item.contactName} ${item.managerName}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [calendarItems, search, selectedLocationIds, showCancelled]);

  const itemsByDate = useMemo(() => {
    const map = new Map();
    filteredItems.forEach((item) => {
      const start = parseDate(item.startDate);
      if (!start) return;
      const end = parseDate(item.endDate) || start;
      let day = new Date(start);
      let guard = 0;
      while (day <= end && guard < 370) {
        const key = toDateStr(day);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
        day = addDays(day, 1);
        guard += 1;
      }
    });
    map.forEach((list) => {
      list.sort((left, right) => {
        const leftMin = timeToMinutes(left.startTime);
        const rightMin = timeToMinutes(right.startTime);
        if (leftMin === null && rightMin === null) return left.title.localeCompare(right.title, "uk");
        if (leftMin === null) return -1;
        if (rightMin === null) return 1;
        return leftMin - rightMin;
      });
    });
    return map;
  }, [filteredItems]);

  const monthMatrix = useMemo(() => {
    const gridStart = startOfWeekMonday(startOfMonth(cursor));
    const weeks = [];
    for (let week = 0; week < 6; week += 1) {
      const days = [];
      for (let day = 0; day < 7; day += 1) {
        days.push(addDays(gridStart, week * 7 + day));
      }
      weeks.push(days);
    }
    return weeks;
  }, [cursor]);

  const weekDays = useMemo(() => {
    const start = startOfWeekMonday(cursor);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [cursor]);

  const headerLabel = useMemo(() => {
    if (view === "month") return `${MONTHS_UK[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (view === "day") {
      return `${WEEKDAYS_LONG[(cursor.getDay() + 6) % 7]}, ${cursor.getDate()} ${MONTHS_UK[cursor.getMonth()].toLowerCase()} ${cursor.getFullYear()}`;
    }
    const start = weekDays[0];
    const end = weekDays[6];
    if (start.getMonth() === end.getMonth()) {
      return `${start.getDate()}–${end.getDate()} ${MONTHS_UK[start.getMonth()].toLowerCase()} ${start.getFullYear()}`;
    }
    return `${start.getDate()} ${MONTHS_UK[start.getMonth()].toLowerCase()} – ${end.getDate()} ${MONTHS_UK[end.getMonth()].toLowerCase()} ${end.getFullYear()}`;
  }, [view, cursor, weekDays]);

  const stats = useMemo(() => {
    const active = filteredItems.filter((item) => !item.isCancelled);
    const deals = active.filter((item) => item.source === "order");
    const totalAmount = deals.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const guests = active.reduce((sum, item) => sum + (Number(item.guestCount) || 0), 0);
    return {
      total: active.length,
      deals: deals.length,
      events: active.filter((item) => item.source === "event").length,
      totalAmount,
      guests,
    };
  }, [filteredItems]);

  useEffect(() => {
    if (!showModal) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape") setShowModal(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showModal]);

  const goToday = () => setCursor(new Date());
  const goPrev = () => {
    if (view === "month") setCursor((prev) => addMonths(prev, -1));
    else if (view === "week") setCursor((prev) => addDays(prev, -7));
    else setCursor((prev) => addDays(prev, -1));
  };
  const goNext = () => {
    if (view === "month") setCursor((prev) => addMonths(prev, 1));
    else if (view === "week") setCursor((prev) => addDays(prev, 7));
    else setCursor((prev) => addDays(prev, 1));
  };

  const openCreate = (dateStr, startTime = "") => {
    const endTime = startTime ? minutesToTime(Math.min(timeToMinutes(startTime) + 120, END_HOUR * 60)) : "";
    setEventForm({
      ...emptyEventForm,
      startDate: dateStr,
      endDate: dateStr,
      startTime,
      endTime,
      allDay: !startTime,
      managerName: currentUserName,
      locationId: locations.length === 1 ? String(locations[0].id) : "",
    });
    setShowModal(true);
  };

  const openEdit = (item) => {
    if (item.source === "order") {
      setEventForm({
        ...emptyEventForm,
        id: item.raw.id,
        source: "order",
        orderId: item.raw.id,
        title: item.title,
        locationId: item.locationId || "",
        startDate: item.startDate,
        endDate: item.endDate || item.startDate,
        startTime: item.startTime,
        endTime: item.endTime,
        allDay: item.allDay,
        status: item.status,
        guestCount: item.guestCount || "",
        contactName: item.contactName || "",
        managerName: item.managerName || "",
        notes: item.raw.notes || "",
      });
    } else {
      setEventForm({
        ...emptyEventForm,
        id: item.raw.id,
        source: "event",
        orderId: item.raw.orderId || "",
        title: item.title,
        locationId: item.locationId || "",
        startDate: item.startDate,
        endDate: item.endDate || item.startDate,
        startTime: item.startTime,
        endTime: item.endTime,
        allDay: item.allDay,
        status: item.status,
        guestCount: item.guestCount || "",
        contactName: item.contactName || "",
        managerName: item.managerName || "",
        notes: item.raw.notes || "",
      });
    }
    setShowModal(true);
  };

  const toggleLocationFilter = (locationId) => {
    setSelectedLocationIds((prev) => (
      prev.includes(locationId) ? prev.filter((value) => value !== locationId) : [...prev, locationId]
    ));
  };

  const handleSubmit = async () => {
    const locationName = locations.find((location) => String(location.id) === String(eventForm.locationId))?.name || "";
    const color = eventForm.locationId ? (locationColorById.get(String(eventForm.locationId)) || "") : "";
    const startDate = eventForm.startDate;
    const endDate = eventForm.endDate && eventForm.endDate >= startDate ? eventForm.endDate : startDate;

    if (eventForm.source === "order") {
      const original = orders.find((order) => String(order.id) === String(eventForm.orderId));
      if (!original) return;
      const payload = {
        ...original,
        locationId: eventForm.locationId,
        locationName,
        eventDate: startDate,
        eventEndDate: endDate,
        eventTime: eventForm.allDay ? "" : eventForm.startTime,
        eventEndTime: eventForm.allDay ? "" : eventForm.endTime,
        status: eventForm.status,
        guestCount: eventForm.guestCount,
      };
      const result = await onSaveOrder(payload);
      if (result?.success) setShowModal(false);
      return;
    }

    const payload = {
      ...(eventForm.id ? { id: eventForm.id } : {}),
      orderId: eventForm.orderId || "",
      title: eventForm.title.trim() || locationName || "Подія",
      locationId: eventForm.locationId,
      locationName,
      color,
      startDate,
      endDate,
      startTime: eventForm.allDay ? "" : eventForm.startTime,
      endTime: eventForm.allDay ? "" : eventForm.endTime,
      allDay: eventForm.allDay,
      status: eventForm.status,
      guestCount: eventForm.guestCount,
      contactName: eventForm.contactName,
      managerName: eventForm.managerName,
      notes: eventForm.notes,
    };
    const result = await onSaveEvent(payload);
    if (result?.success) setShowModal(false);
  };

  const handleToggleCancel = async () => {
    if (eventForm.source === "order") {
      const original = orders.find((order) => String(order.id) === String(eventForm.orderId));
      if (!original) return;
      const nextStatus = original.status === "cancelled" ? "work" : "cancelled";
      const result = await onSaveOrder({ ...original, status: nextStatus });
      if (result?.success) setShowModal(false);
      return;
    }
    const original = events.find((event) => String(event.id) === String(eventForm.id));
    if (!original) return;
    const nextStatus = original.status === "cancelled" ? "confirmed" : "cancelled";
    const result = await onSaveEvent({ ...original, status: nextStatus });
    if (result?.success) setShowModal(false);
  };

  const handleDuplicate = async () => {
    const locationName = locations.find((location) => String(location.id) === String(eventForm.locationId))?.name || "";
    const color = eventForm.locationId ? (locationColorById.get(String(eventForm.locationId)) || "") : "";
    const payload = {
      orderId: "",
      title: `${eventForm.title.trim() || locationName || "Подія"} (копія)`,
      locationId: eventForm.locationId,
      locationName,
      color,
      startDate: eventForm.startDate,
      endDate: eventForm.endDate || eventForm.startDate,
      startTime: eventForm.allDay ? "" : eventForm.startTime,
      endTime: eventForm.allDay ? "" : eventForm.endTime,
      allDay: eventForm.allDay,
      status: "tentative",
      guestCount: eventForm.guestCount,
      contactName: eventForm.contactName,
      managerName: eventForm.managerName,
      notes: eventForm.notes,
    };
    const result = await onSaveEvent(payload);
    if (result?.success) setShowModal(false);
  };

  const handleDelete = async () => {
    if (!eventForm.id || eventForm.source !== "event") return;
    if (!window.confirm("Видалити цю подію з календаря?")) return;
    await onDeleteEvent(eventForm.id);
    setShowModal(false);
  };

  const handleQuickAddLocation = async () => {
    const name = window.prompt("Назва нової локації:");
    if (!name || !name.trim()) return;
    const color = FALLBACK_PALETTE[locations.length % FALLBACK_PALETTE.length];
    await onSaveLocation?.({ name: name.trim(), color });
  };

  const renderItemPill = (item) => {
    const color = resolveColor(item);
    return (
      <button
        key={`${item.key}_pill`}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          openEdit(item);
        }}
        className={`group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] font-medium transition hover:shadow-sm ${item.isCancelled ? "opacity-55" : ""}`}
        style={{ backgroundColor: hexToRgba(color, 0.14), color: "#1e293b" }}
        title={`${item.title}${item.locationName ? ` · ${item.locationName}` : ""}`}
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        {item.startTime && <span className="shrink-0 tabular-nums text-slate-500">{item.startTime}</span>}
        <span className={`truncate ${item.isCancelled ? "line-through" : ""}`}>{item.title}</span>
        {item.source === "order" && <Briefcase size={10} className="ml-auto shrink-0 text-slate-400" />}
      </button>
    );
  };

  const renderMonthView = () => (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {WEEKDAYS_SHORT.map((day, index) => (
          <div
            key={day}
            className={`px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide ${index >= 5 ? "text-rose-500" : "text-slate-500"}`}
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {monthMatrix.flat().map((day) => {
          const dateStr = toDateStr(day);
          const isCurrentMonth = day.getMonth() === cursor.getMonth();
          const isToday = dateStr === todayStr;
          const isWeekend = (day.getDay() + 6) % 7 >= 5;
          const dayItems = itemsByDate.get(dateStr) || [];
          const visible = dayItems.slice(0, 3);
          const hidden = dayItems.length - visible.length;
          return (
            <div
              key={dateStr}
              onClick={() => openCreate(dateStr)}
              className={`group min-h-[118px] cursor-pointer border-b border-r border-slate-100 p-1.5 transition last:border-r-0 hover:bg-indigo-50/40 ${isCurrentMonth ? "bg-white" : "bg-slate-50/60"} ${isWeekend && isCurrentMonth ? "bg-slate-50/40" : ""}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? "bg-indigo-600 text-white" : isCurrentMonth ? "text-slate-700" : "text-slate-400"}`}
                >
                  {day.getDate()}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openCreate(dateStr);
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded-md text-slate-300 opacity-0 transition hover:bg-indigo-100 hover:text-indigo-600 group-hover:opacity-100"
                  title="Додати подію"
                >
                  <Plus size={13} />
                </button>
              </div>
              <div className="space-y-1">
                {visible.map((item) => renderItemPill(item))}
                {hidden > 0 && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setView("day");
                      setCursor(day);
                    }}
                    className="w-full rounded-md px-1.5 py-0.5 text-left text-[11px] font-semibold text-slate-500 hover:bg-slate-100"
                  >
                    +{hidden} ще
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderTimeGrid = (days) => {
    const hours = [];
    for (let hour = START_HOUR; hour < END_HOUR; hour += 1) hours.push(hour);
    const gridHeight = (END_HOUR - START_HOUR) * HOUR_PX;

    const layoutForDay = (dateStr) => {
      const dayItems = (itemsByDate.get(dateStr) || []).filter((item) => timeToMinutes(item.startTime) !== null);
      const sorted = dayItems
        .map((item) => {
          const start = timeToMinutes(item.startTime);
          const rawEnd = timeToMinutes(item.endTime);
          const end = rawEnd !== null && rawEnd > start ? rawEnd : start + 90;
          return { item, start, end };
        })
        .sort((left, right) => left.start - right.start || left.end - right.end);

      let cluster = [];
      let clusterEnd = -1;
      const placed = [];
      const flush = () => {
        const columnsEnd = [];
        cluster.forEach((entry) => {
          let assigned = false;
          for (let col = 0; col < columnsEnd.length; col += 1) {
            if (columnsEnd[col] <= entry.start) {
              entry.col = col;
              columnsEnd[col] = entry.end;
              assigned = true;
              break;
            }
          }
          if (!assigned) {
            entry.col = columnsEnd.length;
            columnsEnd.push(entry.end);
          }
        });
        const total = columnsEnd.length;
        cluster.forEach((entry) => { entry.cols = total; });
        placed.push(...cluster);
        cluster = [];
      };
      sorted.forEach((entry) => {
        if (cluster.length && entry.start >= clusterEnd) {
          flush();
          clusterEnd = -1;
        }
        cluster.push(entry);
        clusterEnd = Math.max(clusterEnd, entry.end);
      });
      if (cluster.length) flush();
      return placed;
    };

    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="border-r border-slate-200" />
          {days.map((day) => {
            const dateStr = toDateStr(day);
            const isToday = dateStr === todayStr;
            const allDayItems = (itemsByDate.get(dateStr) || []).filter((item) => timeToMinutes(item.startTime) === null);
            return (
              <div key={dateStr} className="border-r border-slate-200 last:border-r-0">
                <div className="flex items-center justify-center gap-2 px-2 py-2 text-center">
                  <span className="text-xs font-semibold uppercase text-slate-500">{WEEKDAYS_SHORT[(day.getDay() + 6) % 7]}</span>
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${isToday ? "bg-indigo-600 text-white" : "text-slate-700"}`}>
                    {day.getDate()}
                  </span>
                </div>
                {allDayItems.length > 0 && (
                  <div className="space-y-1 border-t border-slate-100 p-1">
                    {allDayItems.map((item) => renderItemPill(item))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="grid max-h-[640px] overflow-y-auto" style={{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div className="relative border-r border-slate-200" style={{ height: gridHeight }}>
            {hours.map((hour) => (
              <div key={hour} className="absolute left-0 right-1 -translate-y-1/2 text-right text-[11px] font-medium text-slate-400" style={{ top: (hour - START_HOUR) * HOUR_PX }}>
                {pad(hour)}:00
              </div>
            ))}
          </div>
          {days.map((day) => {
            const dateStr = toDateStr(day);
            const placed = layoutForDay(dateStr);
            return (
              <div key={dateStr} className="relative border-r border-slate-100 last:border-r-0" style={{ height: gridHeight }}>
                {hours.map((hour) => (
                  <div
                    key={hour}
                    onClick={() => openCreate(dateStr, `${pad(hour)}:00`)}
                    className="absolute left-0 right-0 cursor-pointer border-b border-slate-100 transition hover:bg-indigo-50/50"
                    style={{ top: (hour - START_HOUR) * HOUR_PX, height: HOUR_PX }}
                  />
                ))}
                {placed.map(({ item, start, end, col, cols }) => {
                  const color = resolveColor(item);
                  const top = ((start - START_HOUR * 60) / 60) * HOUR_PX;
                  const height = Math.max(((end - start) / 60) * HOUR_PX - 2, 22);
                  const widthPct = 100 / cols;
                  return (
                    <button
                      key={`${item.key}_block`}
                      type="button"
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        openEdit(item);
                      }}
                      className={`absolute overflow-hidden rounded-lg px-2 py-1 text-left text-[11px] font-medium text-white shadow-sm transition hover:z-10 hover:shadow-md ${item.isCancelled ? "opacity-55" : ""}`}
                      style={{
                        top,
                        height,
                        left: `calc(${col * widthPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        backgroundColor: color,
                      }}
                      title={`${item.title}${item.locationName ? ` · ${item.locationName}` : ""}`}
                    >
                      <div className={`truncate font-semibold ${item.isCancelled ? "line-through" : ""}`}>{item.title}</div>
                      <div className="truncate text-[10px] opacity-90">
                        {item.startTime}{item.endTime ? `–${item.endTime}` : ""}{item.locationName ? ` · ${item.locationName}` : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const isOrderSource = eventForm.source === "order";
  const statusOptions = isOrderSource ? ORDER_STATUS_OPTIONS : EVENT_STATUS_OPTIONS;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
        <div className="flex items-center overflow-hidden rounded-lg border border-slate-200">
          <button type="button" onClick={goPrev} className="flex h-8 w-8 items-center justify-center text-slate-500 transition hover:bg-slate-50">
            <ChevronLeft size={17} />
          </button>
          <button type="button" onClick={goToday} className="h-8 border-x border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            Сьогодні
          </button>
          <button type="button" onClick={goNext} className="flex h-8 w-8 items-center justify-center text-slate-500 transition hover:bg-slate-50">
            <ChevronRight size={17} />
          </button>
        </div>

        <h4 className="text-base font-semibold capitalize text-slate-900">{headerLabel}</h4>

        <div className="hidden items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 xl:flex">
          <span className="font-semibold text-slate-700">Активних <span className="text-indigo-600">{stats.total}</span></span>
          <span className="text-slate-300">·</span>
          <span>Угод <span className="font-semibold text-slate-800">{stats.deals}</span></span>
          <span className="text-slate-300">·</span>
          <span>Подій <span className="font-semibold text-slate-800">{stats.events}</span></span>
          {stats.guests > 0 && (
            <>
              <span className="text-slate-300">·</span>
              <span>Гостей <span className="font-semibold text-slate-800">{stats.guests}</span></span>
            </>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="h-8 w-[180px] rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Пошук"
            />
          </div>
          <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 text-xs">
            {[
              { id: "month", label: "Місяць" },
              { id: "week", label: "Тиждень" },
              { id: "day", label: "День" },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setView(option.id)}
                className={`h-8 px-3 font-semibold transition ${view === option.id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => openCreate(toDateStr(cursor))}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white shadow transition hover:bg-indigo-500"
          >
            <Plus size={15} /> Подія
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <MapPin size={12} /> Локації
        </span>
        {locations.length === 0 ? (
          <button
            type="button"
            onClick={handleQuickAddLocation}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-indigo-300 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-indigo-600 transition hover:bg-indigo-50"
          >
            <Plus size={12} /> Додати локацію
          </button>
        ) : (
          <>
            {selectedLocationIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedLocationIds([])}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Усі
              </button>
            )}
            {locations.map((location) => {
              const active = selectedLocationIds.includes(String(location.id));
              const color = locationColorById.get(String(location.id));
              return (
                <button
                  key={location.id}
                  type="button"
                  onClick={() => toggleLocationFilter(String(location.id))}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${active ? "border-transparent text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  style={active ? { backgroundColor: color } : undefined}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active ? "#ffffff" : color }} />
                  {location.name}
                </button>
              );
            })}
          </>
        )}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
            checked={showCancelled}
            onChange={(event) => setShowCancelled(event.target.checked)}
          />
          Скасовані
        </label>
      </div>

      {view === "month" && renderMonthView()}
      {view === "week" && renderTimeGrid(weekDays)}
      {view === "day" && renderTimeGrid([cursor])}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4" onClick={() => setShowModal(false)}>
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2">
                {isOrderSource ? <Briefcase size={18} className="text-indigo-600" /> : <CalendarDays size={18} className="text-indigo-600" />}
                <h3 className="text-base font-semibold text-slate-900">
                  {isOrderSource
                    ? "Угода в календарі"
                    : eventForm.id ? "Редагування події" : "Нова подія"}
                </h3>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 px-5 py-4">
              {isOrderSource && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Цю подію створено з CRM-угоди. Зміна дати, часу та локації оновить саму угоду.
                </div>
              )}

              {!isOrderSource && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Назва події</label>
                  <input
                    className={baseInput}
                    value={eventForm.title}
                    onChange={(event) => setEventForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Напр.: Весілля, Корпоратив, Дегустація"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Локація</label>
                <div className="flex gap-2">
                  <select
                    className={baseInput}
                    value={eventForm.locationId}
                    onChange={(event) => setEventForm((prev) => ({ ...prev, locationId: event.target.value }))}
                  >
                    <option value="">Без локації</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>{location.name}</option>
                    ))}
                  </select>
                  {onSaveLocation && (
                    <button
                      type="button"
                      onClick={handleQuickAddLocation}
                      className="shrink-0 rounded-lg border border-slate-300 px-2.5 text-slate-500 transition hover:bg-slate-50"
                      title="Швидко додати локацію"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
                  checked={eventForm.allDay}
                  onChange={(event) => setEventForm((prev) => ({ ...prev, allDay: event.target.checked }))}
                />
                Весь день
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Дата початку</label>
                  <input
                    type="date"
                    className={baseInput}
                    value={eventForm.startDate}
                    onFocus={openNativeDatePicker}
                    onClick={openNativeDatePicker}
                    onChange={(event) => setEventForm((prev) => ({
                      ...prev,
                      startDate: event.target.value,
                      endDate: prev.endDate && prev.endDate >= event.target.value ? prev.endDate : event.target.value,
                    }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Дата завершення</label>
                  <input
                    type="date"
                    className={baseInput}
                    value={eventForm.endDate}
                    min={eventForm.startDate}
                    onFocus={openNativeDatePicker}
                    onClick={openNativeDatePicker}
                    onChange={(event) => setEventForm((prev) => ({ ...prev, endDate: event.target.value }))}
                  />
                </div>
              </div>

              {!eventForm.allDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Час від</label>
                    <input
                      type="time"
                      className={baseInput}
                      value={eventForm.startTime}
                      onFocus={openNativeDatePicker}
                      onClick={openNativeDatePicker}
                      onChange={(event) => setEventForm((prev) => ({ ...prev, startTime: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Час до</label>
                    <input
                      type="time"
                      className={baseInput}
                      value={eventForm.endTime}
                      onFocus={openNativeDatePicker}
                      onClick={openNativeDatePicker}
                      onChange={(event) => setEventForm((prev) => ({ ...prev, endTime: event.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Статус</label>
                  <select
                    className={baseInput}
                    value={eventForm.status}
                    onChange={(event) => setEventForm((prev) => ({ ...prev, status: event.target.value }))}
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Кількість гостей</label>
                  <input
                    className={baseInput}
                    value={eventForm.guestCount}
                    onChange={(event) => setEventForm((prev) => ({ ...prev, guestCount: event.target.value }))}
                    placeholder="80"
                  />
                </div>
              </div>

              {!isOrderSource && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Контакт / клієнт</label>
                    <input
                      className={baseInput}
                      value={eventForm.contactName}
                      onChange={(event) => setEventForm((prev) => ({ ...prev, contactName: event.target.value }))}
                      placeholder="ПІБ або компанія"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Менеджер</label>
                    <input
                      className={baseInput}
                      list="catering-calendar-managers"
                      value={eventForm.managerName}
                      onChange={(event) => setEventForm((prev) => ({ ...prev, managerName: event.target.value }))}
                      placeholder="Відповідальний"
                    />
                    <datalist id="catering-calendar-managers">
                      {managers.map((manager) => <option key={manager} value={manager} />)}
                    </datalist>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Нотатки</label>
                <textarea
                  className={`${baseInput} min-h-[70px]`}
                  value={eventForm.notes}
                  onChange={(event) => setEventForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Деталі, побажання, логістика"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                disabled={saving || !eventForm.startDate}
                onClick={handleSubmit}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {eventForm.id ? "Зберегти" : "Створити подію"}
              </button>

              {eventForm.id && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleToggleCancel}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                    (isOrderSource ? eventForm.status === "cancelled" : eventForm.status === "cancelled")
                      ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      : "border-amber-300 text-amber-700 hover:bg-amber-50"
                  }`}
                >
                  {eventForm.status === "cancelled" ? <><RotateCcw size={15} /> Відновити</> : <><Ban size={15} /> Скасувати</>}
                </button>
              )}

              {!isOrderSource && eventForm.id && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleDuplicate}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  <Copy size={15} /> Дублювати
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="ml-auto rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Закрити
              </button>

              {!isOrderSource && eventForm.id && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleDelete}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                >
                  <Trash2 size={15} /> Видалити
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
