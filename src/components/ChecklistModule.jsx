import { useMemo, useState } from "react";
import { CheckSquare, Clock3, ListChecks, Plus, Settings, Trash2 } from "lucide-react";
import { useChecklists } from "../hooks/useChecklists";

const cardClass = "card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl";
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";

const KIND_OPTIONS = [
  { value: "opening", label: "Відкриття" },
  { value: "shift", label: "Під час зміни" },
];

const TIME_MODE_OPTIONS = [
  { value: "before_open", label: "До відкриття (хв)" },
  { value: "after_open", label: "Після відкриття (хв)" },
  { value: "before_close", label: "До закриття (хв)" },
  { value: "exact", label: "Фіксований час" },
];

const DAY_OPTIONS = [
  { key: "mon", label: "Пн" },
  { key: "tue", label: "Вт" },
  { key: "wed", label: "Ср" },
  { key: "thu", label: "Чт" },
  { key: "fri", label: "Пт" },
  { key: "sat", label: "Сб" },
  { key: "sun", label: "Нд" },
];

const normalizeTopTab = (tab = "") => {
  const value = String(tab).toLowerCase();
  if (value.includes("setting") || value.includes("налашт")) return "settings";
  return "execution";
};

const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const uid = () => `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

const todayDate = () => new Date().toISOString().slice(0, 10);

const timeToMinutes = (value) => {
  if (!value || typeof value !== "string" || !value.includes(":")) return null;
  const [h, m] = value.split(":").map((item) => Number(item));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const minutesToTime = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  const normalized = ((value % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const getDeadlineLabel = (item, scheduleByDay, date) => {
  const mode = item?.timeMode || "before_open";
  const dayKey = dayKeys[new Date(`${date}T00:00:00`).getDay()];
  const daySchedule = scheduleByDay?.[dayKey] || { from: "", to: "" };
  const fromMinutes = timeToMinutes(daySchedule.from);
  const toMinutes = timeToMinutes(daySchedule.to);

  if (mode === "exact") return item?.exactTime || "—";

  const offset = Number(item?.offsetMinutes || 0);
  if (mode === "before_open" && fromMinutes !== null) return minutesToTime(fromMinutes - offset);
  if (mode === "after_open" && fromMinutes !== null) return minutesToTime(fromMinutes + offset);
  if (mode === "before_close" && toMinutes !== null) return minutesToTime(toMinutes - offset);
  return "—";
};

function ExecutionTab({ user, restaurants, templates, executions, createExecution, updateExecution }) {
  const [selectedDate, setSelectedDate] = useState(todayDate());
  const [selectedKind, setSelectedKind] = useState("opening");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(user?.restaurant || "");
  const [expandedNotes, setExpandedNotes] = useState({});

  const availableRestaurants = restaurants || [];
  const effectiveRestaurantId = user?.role === "admin" ? selectedRestaurantId : user?.restaurant || selectedRestaurantId;

  const selectedRestaurant = useMemo(
    () => availableRestaurants.find((item) => String(item.id) === String(effectiveRestaurantId)),
    [availableRestaurants, effectiveRestaurantId]
  );

  const applicableTemplates = useMemo(() => {
    const selectedDayKey = dayKeys[new Date(`${selectedDate}T00:00:00`).getDay()];

    return templates
      .filter((item) => item.isActive !== false)
      .filter((item) => item.kind === selectedKind)
      .filter((item) => {
        if (!Array.isArray(item.activeDays) || item.activeDays.length === 0) return true;
        return item.activeDays.includes(selectedDayKey);
      })
      .filter((item) => {
        if (!effectiveRestaurantId) return true;
        if (!Array.isArray(item.restaurantIds) || item.restaurantIds.length === 0) return true;
        return item.restaurantIds.map(String).includes(String(effectiveRestaurantId));
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "uk"));
  }, [templates, selectedKind, effectiveRestaurantId, selectedDate]);

  const activeExecution = useMemo(() => {
    return executions.find(
      (item) =>
        String(item.restaurantId || "") === String(effectiveRestaurantId || "") &&
        String(item.date || "") === String(selectedDate) &&
        String(item.kind || "") === String(selectedKind)
    );
  }, [executions, effectiveRestaurantId, selectedDate, selectedKind]);

  const tasks = useMemo(() => {
    const list = [];
    applicableTemplates.forEach((template) => {
      (template.items || []).forEach((task) => {
        list.push({
          ...task,
          templateId: template.id,
          templateName: template.name,
        });
      });
    });

    return list.sort((a, b) => {
      const first = Number(a.sortOrder ?? 9999);
      const second = Number(b.sortOrder ?? 9999);
      if (first !== second) return first - second;
      return String(a.title || "").localeCompare(String(b.title || ""), "uk");
    });
  }, [applicableTemplates]);

  const doneCount = useMemo(() => {
    if (!tasks.length) return 0;
    const checks = activeExecution?.checks || {};
    return tasks.filter((item) => Boolean(checks[item.id]?.done)).length;
  }, [tasks, activeExecution]);

  const toggleTask = async (task, checked) => {
    if (!effectiveRestaurantId) {
      alert("Оберіть ресторан.");
      return;
    }

    const checks = {
      ...(activeExecution?.checks || {}),
      [task.id]: {
        ...(activeExecution?.checks?.[task.id] || {}),
        done: checked,
        doneAt: checked ? new Date().toISOString() : "",
        doneById: checked ? user?.uid || "" : "",
        doneByName: checked ? user?.displayName || user?.email || "" : "",
      },
    };

    if (!activeExecution?.id) {
      const result = await createExecution({
        restaurantId: effectiveRestaurantId,
        restaurantName: selectedRestaurant?.name || "",
        date: selectedDate,
        kind: selectedKind,
        checks,
      });
      if (!result.success) alert("Не вдалося зберегти виконання чек-листа.");
      return;
    }

    const result = await updateExecution(activeExecution.id, {
      ...activeExecution,
      checks,
    });
    if (!result.success) alert("Не вдалося оновити чек-ліст.");
  };

  const updateTaskNote = async (taskId, note) => {
    if (!activeExecution?.id) return;

    const checks = {
      ...(activeExecution?.checks || {}),
      [taskId]: {
        ...(activeExecution?.checks?.[taskId] || {}),
        note,
      },
    };

    await updateExecution(activeExecution.id, {
      ...activeExecution,
      checks,
    });
  };

  const toggleTaskNotePanel = (taskId) => {
    setExpandedNotes((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  return (
    <div className={cardClass}>
      <div className="mb-4 flex items-center gap-2">
        <CheckSquare size={18} className="text-indigo-600" />
        <h2 className="text-lg font-semibold">Чеклист виконання</h2>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <label className="text-sm font-semibold text-slate-800">Дата</label>
          <input type="date" className={inputClass} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Тип</label>
          <select className={inputClass} value={selectedKind} onChange={(e) => setSelectedKind(e.target.value)}>
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-semibold text-slate-800">Ресторан</label>
          <select
            className={inputClass}
            value={effectiveRestaurantId || ""}
            onChange={(e) => setSelectedRestaurantId(e.target.value)}
            disabled={Boolean(user?.restaurant) && user?.role !== "admin"}
          >
            <option value="">Оберіть ресторан</option>
            {availableRestaurants.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
        Виконано {doneCount} з {tasks.length}. {tasks.length ? `Прогрес: ${Math.round((doneCount / tasks.length) * 100)}%` : "Немає задач для обраних умов."}
      </div>

      <div className="space-y-2">
        {tasks.map((task) => {
          const checked = Boolean(activeExecution?.checks?.[task.id]?.done);
          const note = activeExecution?.checks?.[task.id]?.note || "";
          const deadline = getDeadlineLabel(task, selectedRestaurant?.schedule, selectedDate);
          const isNoteOpen = Boolean(expandedNotes[task.id]);
          return (
            <div key={`${task.templateId}_${task.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <div className="flex items-start gap-2">
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    checked={checked}
                    onChange={(e) => toggleTask(task, e.target.checked)}
                  />
                  <span className="min-w-0">
                    <span className={`block truncate text-sm font-semibold ${checked ? "text-emerald-700 line-through" : "text-slate-900"}`}>
                      {task.title}
                      {task.description ? <span className="font-normal text-slate-500"> · {task.description}</span> : null}
                      {task.estimatedMinutes ? <span className="font-normal text-slate-500"> · ~{task.estimatedMinutes} хв</span> : null}
                      <span className="font-normal text-slate-500"> · План: {deadline || "—"}</span>
                      <span className="font-normal text-slate-500"> · {task.templateName}</span>
                    </span>
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => toggleTaskNotePanel(task.id)}
                  className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  {isNoteOpen ? "Сховати" : note ? "Комент. •" : "Комент."}
                </button>
              </div>

              {isNoteOpen ? (
                <textarea
                  className={`${inputClass} min-h-[56px]`}
                  value={note}
                  onChange={(e) => updateTaskNote(task.id, e.target.value)}
                  placeholder="Коментар до пункту"
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TemplateItemEditor({ item, onChange, onDelete }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">Пункт</p>
        <button type="button" onClick={onDelete} className="rounded p-1 text-red-600 hover:bg-red-50">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="text-sm font-semibold text-slate-800">Назва *</label>
          <input className={inputClass} value={item.title} onChange={(e) => onChange({ ...item, title: e.target.value })} />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Відповідальний</label>
          <input className={inputClass} value={item.responsibleRole || ""} onChange={(e) => onChange({ ...item, responsibleRole: e.target.value })} placeholder="Напр. Керуючий" />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm font-semibold text-slate-800">Опис</label>
          <input className={inputClass} value={item.description || ""} onChange={(e) => onChange({ ...item, description: e.target.value })} />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Тип часу</label>
          <select className={inputClass} value={item.timeMode || "before_open"} onChange={(e) => onChange({ ...item, timeMode: e.target.value })}>
            {TIME_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        {item.timeMode === "exact" ? (
          <div>
            <label className="text-sm font-semibold text-slate-800">Фіксований час</label>
            <input type="time" className={inputClass} value={item.exactTime || ""} onChange={(e) => onChange({ ...item, exactTime: e.target.value })} />
          </div>
        ) : (
          <div>
            <label className="text-sm font-semibold text-slate-800">Зсув, хв</label>
            <input
              type="number"
              className={inputClass}
              value={item.offsetMinutes ?? 0}
              onChange={(e) => onChange({ ...item, offsetMinutes: Number(e.target.value || 0) })}
            />
          </div>
        )}
        <div>
          <label className="text-sm font-semibold text-slate-800">Орієнтовно, хв</label>
          <input
            type="number"
            className={inputClass}
            value={item.estimatedMinutes ?? 0}
            onChange={(e) => onChange({ ...item, estimatedMinutes: Number(e.target.value || 0) })}
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Порядок</label>
          <input
            type="number"
            className={inputClass}
            value={item.sortOrder ?? 0}
            onChange={(e) => onChange({ ...item, sortOrder: Number(e.target.value || 0) })}
          />
        </div>
      </div>
    </div>
  );
}

function SettingsTab({ user, restaurants, templates, createTemplate, updateTemplate, removeTemplate }) {
  const [editingId, setEditingId] = useState(null);
  const [activeItemId, setActiveItemId] = useState(null);
  const isAdmin = user?.role === "admin";

  const emptyTemplate = {
    name: "",
    kind: "opening",
    isActive: true,
    restaurantIds: [],
    activeDays: [],
    items: [],
  };

  const [form, setForm] = useState(emptyTemplate);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyTemplate);
    setActiveItemId(null);
  };

  const startEdit = (template) => {
    const mappedItems = (template.items || []).map((item, index) => ({
      id: item.id || uid(),
      title: item.title || "",
      description: item.description || "",
      timeMode: item.timeMode || "before_open",
      offsetMinutes: Number(item.offsetMinutes || 0),
      exactTime: item.exactTime || "",
      responsibleRole: item.responsibleRole || "",
      estimatedMinutes: Number(item.estimatedMinutes || 0),
      sortOrder: Number(item.sortOrder ?? index),
    }));

    setEditingId(template.id);
    setForm({
      ...template,
      restaurantIds: template.restaurantIds || [],
      activeDays: template.activeDays || [],
      items: mappedItems,
    });
    setActiveItemId(mappedItems[0]?.id || null);
  };

  const activeItem = useMemo(
    () => (form.items || []).find((item) => item.id === activeItemId) || null,
    [form.items, activeItemId]
  );

  const addItem = () => {
    const nextItem = {
      id: uid(),
      title: "",
      description: "",
      timeMode: "before_open",
      offsetMinutes: 15,
      exactTime: "",
      responsibleRole: "",
      estimatedMinutes: 5,
      sortOrder: (form.items || []).length,
    };
    setForm((prev) => ({
      ...prev,
      items: [...(prev.items || []), nextItem],
    }));
    setActiveItemId(nextItem.id);
  };

  const updateItem = (itemId, nextItem) => {
    setForm((prev) => ({
      ...prev,
      items: (prev.items || []).map((current) => (current.id === itemId ? nextItem : current)),
    }));
  };

  const deleteItem = (itemId) => {
    setForm((prev) => ({
      ...prev,
      items: (prev.items || []).filter((current) => current.id !== itemId),
    }));

    if (activeItemId === itemId) {
      const next = (form.items || []).filter((current) => current.id !== itemId);
      setActiveItemId(next[0]?.id || null);
    }
  };

  const toggleRestaurant = (restaurantId) => {
    const exists = form.restaurantIds.map(String).includes(String(restaurantId));
    setForm((prev) => ({
      ...prev,
      restaurantIds: exists
        ? prev.restaurantIds.filter((id) => String(id) !== String(restaurantId))
        : [...prev.restaurantIds, restaurantId],
    }));
  };

  const toggleActiveDay = (dayKey) => {
    const exists = (form.activeDays || []).includes(dayKey);
    setForm((prev) => ({
      ...prev,
      activeDays: exists
        ? (prev.activeDays || []).filter((key) => key !== dayKey)
        : [...(prev.activeDays || []), dayKey],
    }));
  };

  const saveTemplate = async () => {
    if (!isAdmin) return;
    if (!form.name.trim()) {
      alert("Вкажіть назву чек-листа.");
      return;
    }

    const sanitizedItems = (form.items || [])
      .filter((item) => item.title?.trim())
      .map((item, index) => ({
        ...item,
        title: item.title.trim(),
        description: item.description?.trim() || "",
        responsibleRole: item.responsibleRole?.trim() || "",
        sortOrder: Number(item.sortOrder ?? index),
      }));

    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      isActive: Boolean(form.isActive),
      restaurantIds: form.restaurantIds || [],
      activeDays: form.activeDays || [],
      items: sanitizedItems,
    };

    const result = editingId ? await updateTemplate(editingId, payload) : await createTemplate(payload);
    if (!result.success) {
      alert("Не вдалося зберегти шаблон чек-листа.");
      return;
    }

    setEditingId(null);
    setForm(emptyTemplate);
  };

  const deleteTemplate = async (template) => {
    if (!isAdmin) return;
    if (!confirm(`Видалити чек-лист "${template.name}"?`)) return;
    const result = await removeTemplate(template.id);
    if (!result.success) alert("Не вдалося видалити чек-лист.");
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <div className="xl:col-span-3">
        <div className={cardClass}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings size={18} className="text-indigo-600" />
              <h2 className="text-lg font-semibold">Налаштування чеклистів</h2>
            </div>
            <button type="button" onClick={startCreate} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
              Новий шаблон
            </button>
          </div>

          {!isAdmin && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Налаштування шаблонів доступне лише адміністратору.
            </div>
          )}

          <div className="space-y-3">
            {templates.map((template) => (
              <div key={template.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{template.name}</p>
                    <p className="text-xs text-slate-500">
                      {KIND_OPTIONS.find((option) => option.value === template.kind)?.label || template.kind} · пунктів: {(template.items || []).length}
                      {Array.isArray(template.activeDays) && template.activeDays.length > 0
                        ? ` · дні: ${DAY_OPTIONS.filter((day) => template.activeDays.includes(day.key)).map((day) => day.label).join(", ")}`
                        : " · щодня"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!template.isActive ? <span className="rounded bg-slate-200 px-2 py-1 text-xs text-slate-700">Неактивний</span> : null}
                    <button type="button" onClick={() => startEdit(template)} className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200">
                      Редагувати
                    </button>
                    {isAdmin ? (
                      <button type="button" onClick={() => deleteTemplate(template)} className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200">
                        Видалити
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            {!templates.length ? <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">Шаблони ще не створені.</div> : null}
          </div>
        </div>
      </div>

      <div className="xl:col-span-2">
        <div className={cardClass}>
          <div className="mb-3 flex items-center gap-2">
            <ListChecks size={17} className="text-indigo-600" />
            <h3 className="font-semibold">{editingId ? "Редагування шаблону" : "Новий шаблон"}</h3>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-800">Назва *</label>
            <input className={inputClass} value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} disabled={!isAdmin} />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-800">Тип</label>
              <select className={inputClass} value={form.kind} onChange={(e) => setForm((prev) => ({ ...prev, kind: e.target.value }))} disabled={!isAdmin}>
                {KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <label className="mt-7 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={Boolean(form.isActive)} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} disabled={!isAdmin} />
              Активний
            </label>
          </div>

          <div className="mt-4">
            <p className="text-sm font-semibold text-slate-800">Ресторани</p>
            <p className="text-xs text-slate-500">Якщо не обрати жоден, шаблон буде для всіх ресторанів.</p>
            <div className="mt-2 max-h-32 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">
              {restaurants.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.restaurantIds.map(String).includes(String(item.id))}
                    onChange={() => toggleRestaurant(item.id)}
                    disabled={!isAdmin}
                  />
                  {item.name}
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-sm font-semibold text-slate-800">Дні тижня</p>
            <p className="text-xs text-slate-500">Якщо не обрати жоден день, шаблон буде працювати щодня.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DAY_OPTIONS.map((day) => {
                const isSelected = (form.activeDays || []).includes(day.key);
                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => toggleActiveDay(day.key)}
                    disabled={!isAdmin}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-slate-300 bg-white text-slate-700"
                    } disabled:opacity-60`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Пункти чеклиста</p>
              <button
                type="button"
                onClick={addItem}
                disabled={!isAdmin}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                <Plus size={14} /> Додати пункт
              </button>
            </div>

            <div className="max-h-[220px] space-y-2 overflow-auto pr-1">
              {(form.items || []).map((item, index) => (
                <div
                  key={item.id}
                  className={`rounded-lg border p-2 ${activeItemId === item.id ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveItemId(item.id)}
                      className="flex min-w-0 flex-1 flex-col items-start text-left"
                    >
                      <span className="truncate text-sm font-semibold text-slate-900">
                        {index + 1}. {item.title || "Новий пункт"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {TIME_MODE_OPTIONS.find((option) => option.value === item.timeMode)?.label || "Час не задано"}
                        {item.timeMode === "exact" ? ` ${item.exactTime || ""}` : ` · ${item.offsetMinutes ?? 0} хв`}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteItem(item.id)}
                      className="rounded p-1 text-red-600 hover:bg-red-50"
                      disabled={!isAdmin}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {!form.items?.length ? <div className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">Додайте пункти чеклиста.</div> : null}
            </div>

            {activeItem ? (
              <div className="mt-3">
                <TemplateItemEditor
                  item={activeItem}
                  onChange={(nextItem) => updateItem(activeItem.id, nextItem)}
                  onDelete={() => deleteItem(activeItem.id)}
                />
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={saveTemplate}
              disabled={!isAdmin}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              Зберегти шаблон
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChecklistModule({ topTab, user, restaurants }) {
  const mode = normalizeTopTab(topTab);
  const { templates, executions, loading, createTemplate, updateTemplate, removeTemplate, createExecution, updateExecution } = useChecklists(true);

  if (loading) {
    return <div className={cardClass}>Завантаження чеклистів...</div>;
  }

  if (mode === "settings") {
    return (
      <SettingsTab
        user={user}
        restaurants={restaurants}
        templates={templates}
        createTemplate={createTemplate}
        updateTemplate={updateTemplate}
        removeTemplate={removeTemplate}
      />
    );
  }

  return (
    <ExecutionTab
      user={user}
      restaurants={restaurants}
      templates={templates}
      executions={executions}
      createExecution={createExecution}
      updateExecution={updateExecution}
    />
  );
}
