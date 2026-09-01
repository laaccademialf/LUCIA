import { createElement, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CircleDot,
  Clock3,
  Download,
  FileText,
  Flag,
  LayoutList,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { getUsers } from "../firebase/users";
import { getPositions, getWorkRoles } from "../firebase/rolesPositions";
import { useLegalTasks } from "../hooks/useLegalTasks";
import LegalRequestModal from "./LegalRequestModal";
import DatePickerPopover from "./DatePickerPopover";
import { addLegalNotificationApi, isLegalApiEnabled } from "../api/legalTasksApi";
import {
  PAGINATION_OPTIONS,
  displayName,
  getAssignableUsers,
  getUserTaskScope,
  idOf,
  paginateItems,
  shiftDateByDays,
} from "./projectManagementUtils";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import {
  createCollectionItemApi,
  isCollectionsApiEnabled,
  listCollectionItemsApi,
  updateCollectionItemApi,
} from "../api/collectionsApi";
const COLLECTION = "projectTasks";
const LOCAL_KEY = "lucia_project_tasks";
const pdfMakeApi = pdfMake?.createPdf ? pdfMake : pdfMake?.default?.createPdf ? pdfMake.default : null;
const pdfFontMap = pdfFonts?.default || pdfFonts?.pdfMake?.vfs || pdfFonts;
if (pdfMakeApi) {
  if (typeof pdfMakeApi.addVirtualFileSystem === "function") pdfMakeApi.addVirtualFileSystem(pdfFontMap);
  else pdfMakeApi.vfs = pdfFontMap;
}
const STATUS = [
  {
    id: "todo",
    label: "До виконання",
    color: "bg-slate-100 text-slate-700",
    dot: "bg-slate-400",
  },
  {
    id: "in_progress",
    label: "В роботі",
    color: "bg-amber-100 text-amber-800",
    dot: "bg-amber-500",
  },
  {
    id: "review",
    label: "На перевірці",
    color: "bg-blue-100 text-blue-800",
    dot: "bg-blue-500",
  },
  {
    id: "done",
    label: "Виконано",
    color: "bg-emerald-100 text-emerald-800",
    dot: "bg-emerald-500",
  },
];
const PRIORITY = [
  { id: "low", label: "Низький", color: "text-slate-500" },
  { id: "normal", label: "Звичайний", color: "text-blue-600" },
  { id: "high", label: "Високий", color: "text-orange-600" },
  { id: "critical", label: "Критичний", color: "text-red-600" },
];
const DEPARTMENTS = [
  "Власник",
  "Керівництво",
  "Експлуатація",
  "Юридичний відділ",
  "Фінанси",
  "Маркетинг",
  "HR",
];
const today = () => new Date().toISOString().slice(0, 10);
const calendarDateKey = (value) => {
  if (!value) return "";
  if (value instanceof Date) return toDateKey(value);
  if (typeof value === "object" && typeof value.toDate === "function") return toDateKey(value.toDate());
  if (typeof value === "object" && Number.isFinite(value.seconds)) return toDateKey(new Date(value.seconds * 1000));
  const text = String(value);
  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return isoMatch[0];
  const europeanMatch = text.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);
  return europeanMatch ? `${europeanMatch[3]}-${europeanMatch[2]}-${europeanMatch[1]}` : text.slice(0, 10);
};
const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("uk-UA", {
        day: "2-digit",
        month: "short",
      }).format(new Date(`${calendarDateKey(value)}T12:00:00`))
    : "—";
const formatFullDate = (value) =>
  value
    ? new Intl.DateTimeFormat("uk-UA", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(new Date(`${calendarDateKey(value)}T12:00:00`))
    : "—";
const isLate = (task) =>
  task.status !== "done" &&
  task.dueDate &&
  new Date(`${calendarDateKey(task.dueDate)}T23:59:59`) < new Date();
const isDueWithin48Hours = (task) => {
  if (task.status === "done" || !task.dueDate) return false;
  const hoursUntilDeadline = (new Date(`${calendarDateKey(task.dueDate)}T23:59:59`) - new Date()) / 3600000;
  return hoursUntilDeadline >= 0 && hoursUntilDeadline <= 48;
};
const ganttTaskColor = (task) => {
  if (task.priority === "critical") return "bg-purple-500";
  if (isLate(task)) return "bg-rose-500";
  if (isDueWithin48Hours(task)) return "bg-amber-400";
  return task.status === "done" ? "bg-emerald-400" : "bg-blue-500";
};
const formatDuration = (hours) =>
  hours < 24
    ? `${Math.max(1, Math.round(hours))} год`
    : `${Math.round(hours / 24)} дн`;
const readLocalTasks = () => {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const toDateKey = (date) => date.toISOString().slice(0, 10);
const fromDateKey = (value) => new Date(`${calendarDateKey(value)}T12:00:00`);
const ganttDate = (task, type) => {
  if (type === "start") return task.startDate || task.start || "";
  return task.dueDate || task.deadline || task.endDate || "";
};
const flattenTaskHierarchy = (tasks) => {
  const taskIds = new Set(tasks.map((task) => String(task.id)));
  const childrenMap = tasks.reduce((map, task) => {
    const parentId = String(task.parentTaskId || "");
    if (!map.has(parentId)) map.set(parentId, []);
    map.get(parentId).push(task);
    return map;
  }, new Map());
  const ordered = [];
  const addBranch = (task, level, visited) => {
    const taskId = String(task.id);
    if (visited.has(taskId)) return;
    const nextVisited = new Set(visited).add(taskId);
    ordered.push({ task, level });
    (childrenMap.get(taskId) || []).forEach((child) => addBranch(child, level + 1, nextVisited));
  };
  tasks.filter((task) => !taskIds.has(String(task.parentTaskId || ""))).forEach((task) => addBranch(task, 0, new Set()));
  return ordered;
};
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1, 12);
const calendarDays = (month) => {
  const first = startOfMonth(month);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day < 1 || day > daysInMonth ? null : new Date(month.getFullYear(), month.getMonth(), day, 12);
  });
};
const downloadTaskPdf = ({ filters, stats, byAssignee, criticalTasks, averageCompletionTime }) => {
  if (!pdfMakeApi) return;
  const filterLabels = { period: { all: "Увесь період", today: "Сьогодні", week: "Цей тиждень", month: "Цей місяць", quarter: "Цей квартал" }, department: filters.department === "all" ? "Усі підрозділи" : filters.department, location: filters.location === "all" ? "Усі об'єкти" : filters.location, priority: filters.priority === "all" ? "Усі пріоритети" : PRIORITY.find((item) => item.id === filters.priority)?.label };
  pdfMakeApi.createPdf({
    pageSize: "A4",
    pageMargins: [32, 36, 32, 36],
    defaultStyle: { font: "Roboto", fontSize: 9, color: "#172033" },
    content: [
      { text: "Звіт із задач", style: "title" },
      { text: `Сформовано: ${new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`, color: "#64748b", margin: [0, 3, 0, 12] },
      { table: { widths: ["*", "*"], body: [["Період", filterLabels.period[filters.period]], ["Підрозділ", filterLabels.department], ["Заклад / філія", filterLabels.location], ["Пріоритет", filterLabels.priority]] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 14] },
      { columns: [{ text: `Всього\n${stats.total}`, style: "metric" }, { text: `В роботі\n${stats.open}`, style: "metric" }, { text: `Виконано\n${stats.done}`, style: "metric" }, { text: `Прострочено\n${stats.late}`, style: "metric" }] },
      { text: "Навантаження за адресатами", style: "section" },
      { table: { headerRows: 1, widths: ["*", 60, 70, 80], body: [["Адресат", "Виконано", "Прострочено", "Сер. час"], ...byAssignee.map((row) => [row.name, `${row.done}/${row.total}`, String(row.late), row.averageHours == null ? "—" : formatDuration(row.averageHours)])] }, layout: "lightHorizontalLines" },
      { text: "Топ задач, що потребують уваги", style: "section" },
      { table: { headerRows: 1, widths: ["*", 85, 70], body: [["Задача / відповідальний", "Статус", "Дедлайн"], ...criticalTasks.map((task) => [`${task.title}\n${task.target || "—"}`, isLate(task) ? "Прострочено" : PRIORITY.find((item) => item.id === task.priority)?.label || "—", formatDate(task.dueDate)])] }, layout: "lightHorizontalLines" },
      { text: `Середній час виконання всіх задач: ${averageCompletionTime}`, margin: [0, 14, 0, 0], bold: true },
    ],
    styles: { title: { fontSize: 20, bold: true, color: "#111827" }, section: { fontSize: 13, bold: true, color: "#312e81", margin: [0, 16, 0, 7] }, metric: { fontSize: 10, bold: true, color: "#4338ca", alignment: "center" } },
  }).download(`zvit-zadach-${today()}.pdf`);
};

const initialForm = {
  title: "",
  description: "",
  targetType: "person",
  assigneeId: "",
  assigneeName: "",
  department: "",
  startDate: today(),
  dueDate: "",
  priority: "normal",
  attachments: [],
};
const MAX_TASK_ATTACHMENTS = 6;
const MAX_TASK_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
const formatFileSize = (bytes) => {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
};

function StatusBadge({ status }) {
  const meta = STATUS.find((item) => item.id === status) || STATUS[0];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.color}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function TaskStatCard({ label, value, detail, icon, accentClass }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
          {label}
        </p>
        <span className={`rounded-lg p-1.5 ${accentClass}`}>
          {createElement(icon, { size: 16 })}
        </span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5 whitespace-nowrap">
        <p className={`text-2xl font-black leading-tight ${accentClass.split(" ").find((className) => className.startsWith("text-")) || "text-slate-900"}`}>{value}</p>
        <span className="text-[11px] font-bold leading-tight text-slate-600">/ {detail}</span>
      </div>
    </div>
  );
}

function ReportTaskDialog({ tasks, onClose }) {
  if (!tasks) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="late-tasks-title" className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-600">Потребують уваги</p><h2 id="late-tasks-title" className="mt-1 text-xl font-bold text-slate-950">Прострочені задачі</h2></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" title="Закрити"><X size={20} /></button>
        </div>
        <div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto">
          {tasks.length ? tasks.map((task) => <div key={task.id} className="rounded-xl border border-rose-100 bg-rose-50/50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-slate-900">{task.title}</span><span className="text-xs font-bold text-rose-700">Дедлайн: {formatDate(task.dueDate)}</span></div><p className="mt-1 text-xs text-slate-600">Відповідальний: {task.target || "—"} · Призначив: {task.createdByName || "—"}</p></div>) : <p className="py-8 text-center text-sm text-slate-400">Прострочених задач немає.</p>}
        </div>
      </div>
    </div>
  );
}

function AssigneeCombobox({ people, value, valueName, onSelect }) {
  const [query, setQuery] = useState(valueName || "");
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    setQuery(valueName || "");
  }, [valueName]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const filtered = people.filter((row) =>
    displayName(row).toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div ref={rootRef} className="relative mt-1.5">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (value) onSelect(null);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Пошук за іменем..."
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {filtered.length ? (
            filtered.map((row) => (
              <button
                key={idOf(row)}
                type="button"
                onClick={() => {
                  onSelect(row);
                  setQuery(displayName(row));
                  setOpen(false);
                }}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-normal hover:bg-indigo-50 ${String(value) === idOf(row) ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-700"}`}
              >
                {displayName(row)}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-slate-400">Нікого не знайдено</p>
          )}
        </div>
      )}
    </div>
  );
}

function TaskComposer({ users, user, onClose, onCreate, onLegalSelect, workRoles = [], positions = [], usersLoadError = false }) {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [attachError, setAttachError] = useState("");
  const people = getAssignableUsers(users, user, workRoles, positions);
  const set = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "department" && value === "Юридичний відділ") onLegalSelect?.();
  };
  const selectAttachments = async (event) => {
    const selected = Array.from(event.target.files || []).slice(
      0,
      MAX_TASK_ATTACHMENTS - form.attachments.length,
    );
    if (!selected.length) return;
    if (selected.some((file) => file.size > MAX_TASK_ATTACHMENT_SIZE)) {
      setAttachError("Кожен файл має бути до 5 MB.");
      return;
    }
    try {
      const encoded = await Promise.all(
        selected.map(async (file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: await readFileAsDataUrl(file),
        })),
      );
      setForm((current) => ({ ...current, attachments: [...current.attachments, ...encoded] }));
      setAttachError("");
      event.target.value = "";
    } catch {
      setAttachError("Не вдалося додати файл.");
    }
  };
  const removeAttachment = (index) => {
    setForm((current) => ({
      ...current,
      attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index),
    }));
  };
  const submit = async (event) => {
    event.preventDefault();
    if (
      !form.title.trim() ||
      !form.dueDate ||
      (form.targetType === "person" ? !form.assigneeId : !form.department)
    )
      return;
    setSaving(true);
    await onCreate({
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      createdBy: idOf(user),
      createdByName: displayName(user),
    });
    setSaving(false);
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 sm:p-8"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
              Нова задача
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
              Сформулюйте результат
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Адресат отримає задачу разом із дедлайном і контекстом.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Закрити"
          >
            <X size={20} />
          </button>
        </div>
        <label className="mb-4 block text-sm font-semibold text-slate-700">
          Назва задачі
          <input
            autoFocus
            value={form.title}
            onChange={(event) => set("title", event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            placeholder="Наприклад: Підготувати план закупівель на вересень"
          />
        </label>
        <label className="mb-2 block text-sm font-semibold text-slate-700">
          Що потрібно зробити?
          <textarea
            value={form.description}
            onChange={(event) => set("description", event.target.value)}
            className="mt-1.5 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            placeholder="Опишіть очікуваний результат, критерії готовності або важливі посилання"
          />
        </label>
        <div className="mb-5">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm font-semibold text-slate-500 hover:border-indigo-400 hover:bg-indigo-50">
            <Paperclip size={16} />
            Додати файли або фото (до {MAX_TASK_ATTACHMENTS}, кожен до 5 MB)
            <input type="file" multiple accept="*/*" className="hidden" onChange={selectAttachments} />
          </label>
          {attachError && <p className="mt-1.5 text-xs font-semibold text-rose-600">{attachError}</p>}
          {form.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {form.attachments.map((file, index) => (
                <span
                  key={`${file.name}-${index}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600"
                >
                  {file.type?.startsWith("image/") ? (
                    <img src={file.dataUrl} alt={file.name} className="h-5 w-5 rounded object-cover" />
                  ) : (
                    <FileText size={14} className="text-slate-400" />
                  )}
                  {file.name} · {formatFileSize(file.size)}
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    className="text-slate-400 hover:text-rose-600"
                    title="Прибрати файл"
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">
              Кому поставити?
            </p>
            <div className="flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => set("targetType", "person")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${form.targetType === "person" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}
              >
                Конкретній людині
              </button>
              <button
                type="button"
                onClick={() => set("targetType", "department")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${form.targetType === "department" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}
              >
                Департаменту
              </button>
            </div>
          </div>
          <div>
            {form.targetType === "person" ? (
              <label className="text-sm font-semibold text-slate-700">
                Виконавець
                <AssigneeCombobox
                  people={people}
                  value={form.assigneeId}
                  valueName={form.assigneeName}
                  onSelect={(row) =>
                    setForm((current) => ({
                      ...current,
                      assigneeId: row ? idOf(row) : "",
                      assigneeName: row ? displayName(row) : "",
                    }))
                  }
                />
              </label>
            ) : (
              <label className="text-sm font-semibold text-slate-700">
                Департамент
                <select
                  value={form.department}
                  onChange={(event) => set("department", event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-indigo-500"
                >
                  <option value="">Оберіть адресата</option>
                  {DEPARTMENTS.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {form.targetType === "person" && people.length === 0 && (
              <p className="mt-1.5 text-xs font-semibold text-rose-600">
                {usersLoadError
                  ? "Не вдалося завантажити список користувачів. Натисніть «Оновити» вгорі сторінки і спробуйте ще раз."
                  : "Немає доступних людей для призначення за поточною ієрархією посад."}
              </p>
            )}
          </div>
        </div>
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-slate-700">Початок</p>
            <DatePickerPopover
              value={form.startDate}
              onChange={(iso) => set("startDate", iso)}
              label=""
              className="mt-1.5"
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Дедлайн</p>
            <DatePickerPopover
              value={form.dueDate}
              min={form.startDate}
              onChange={(iso) => set("dueDate", iso)}
              label=""
              className="mt-1.5"
            />
          </div>
          <label className="text-sm font-semibold text-slate-700">
            Пріоритет
            <select
              value={form.priority}
              onChange={(event) => set("priority", event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"
            >
              {PRIORITY.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Скасувати
          </button>
          <button
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-60"
          >
            <Plus size={17} />
            {saving ? "Зберігаємо..." : "Поставити задачу"}
          </button>
        </div>
      </form>
    </div>
  );
}

function DateRangePopover({ rangeStart, rangeEnd, onChange }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const days = calendarDays(month);
  const chooseDate = (date) => {
    const value = toDateKey(date);
    if (!rangeStart || rangeEnd || value < rangeStart) onChange(value, "");
    else onChange(rangeStart, value);
  };
  const isInRange = (value) => value && rangeStart && rangeEnd && value >= rangeStart && value <= rangeEnd;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`rounded-lg p-1.5 transition ${open ? "bg-indigo-100 text-indigo-700" : "text-indigo-500 hover:bg-indigo-50"}`}
        title="Вибрати період"
        aria-label="Вибрати період"
        aria-expanded={open}
      >
        <CalendarDays size={20} />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-[60] w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12))} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" title="Попередній місяць"><ChevronLeft size={16} /></button>
            <span className="text-sm font-bold text-slate-800">{new Intl.DateTimeFormat("uk-UA", { month: "long", year: "numeric" }).format(month)}</span>
            <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12))} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" title="Наступний місяць"><ChevronRight size={16} /></button>
          </div>
          <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-bold uppercase text-slate-400">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((date, index) => {
              if (!date) return <span key={`empty-${index}`} className="h-8" />;
              const value = toDateKey(date);
              const selected = value === rangeStart || value === rangeEnd;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => chooseDate(date)}
                  className={`h-8 rounded-md text-xs font-semibold transition ${selected ? "bg-indigo-600 text-white" : isInRange(value) ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-100"}`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <div className="flex justify-between"><span>Початок</span><strong>{rangeStart ? formatDate(rangeStart) : "Оберіть дату"}</strong></div>
            <div className="mt-1 flex justify-between"><span>Кінець</span><strong>{rangeEnd ? formatDate(rangeEnd) : "Оберіть дату"}</strong></div>
          </div>
          {(rangeStart || rangeEnd) && <button type="button" onClick={() => onChange("", "")} className="mt-3 w-full rounded-lg bg-slate-50 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">Очистити період</button>}
        </div>
      )}
    </div>
  );
}

const GANTT_PERIODS = [
  { id: "today", label: "Сьогодні" },
  { id: "week", label: "Тиждень" },
  { id: "month", label: "Місяць" },
  { id: "quarter", label: "Квартал" },
  { id: "halfYear", label: "Пів року" },
  { id: "year", label: "Рік" },
];
const GANTT_ROW_HEIGHT = 40;
const startOfGanttPeriod = (date, period) => {
  if (period === "week") return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  if (period === "quarter") return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1, 12);
  if (period === "halfYear") return new Date(date.getFullYear(), date.getMonth() < 6 ? 0 : 6, 1, 12);
  if (period === "year") return new Date(date.getFullYear(), 0, 1, 12);
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
};
const shiftGanttPeriod = (date, period, amount) => {
  if (period === "week") return shiftDateByDays(date, amount * 7);
  const months = period === "quarter" ? 3 : period === "halfYear" ? 6 : period === "year" ? 12 : 1;
  return new Date(date.getFullYear(), date.getMonth() + amount * months, 1, 12);
};

function Gantt({ tasks, onTaskClick }) {
  const currentDate = new Date();
  currentDate.setHours(12, 0, 0, 0);
  const [ganttPeriod, setGanttPeriod] = useState("week");
  const [periodStart, setPeriodStart] = useState(startOfGanttPeriod(currentDate, "week"));
  const [pageSize, setPageSize] = useState(PAGINATION_OPTIONS[0]);
  const [currentPage, setCurrentPage] = useState(1);
  const timelineStart = periodStart;
  const periodEnd = shiftGanttPeriod(periodStart, ganttPeriod, 1);
  const timelineEnd = shiftDateByDays(periodEnd, -1);
  const timelineDuration = Math.max(1, (timelineEnd - timelineStart) / 86400000 + 1);
  const timelineUsesDays = ganttPeriod === "week" || ganttPeriod === "month";
  const timelineDays = timelineUsesDays
    ? Array.from({ length: Math.ceil(timelineDuration) }, (_, index) => shiftDateByDays(timelineStart, index))
    : Array.from({ length: ganttPeriod === "quarter" ? 3 : ganttPeriod === "halfYear" ? 6 : 12 }, (_, index) => new Date(timelineStart.getFullYear(), timelineStart.getMonth() + index, 1, 12));
  const total = timelineDays.length;
  const isCurrentPeriod = currentDate >= timelineStart && currentDate <= timelineEnd;
  const selectedMonth = periodStart.getMonth();
  const selectedYear = periodStart.getFullYear();
  const years = Array.from(new Set([
    currentDate.getFullYear() - 1,
    currentDate.getFullYear(),
    currentDate.getFullYear() + 1,
    ...tasks.map((task) => ganttDate(task, "start") ? fromDateKey(ganttDate(task, "start")).getFullYear() : null),
    ...tasks.map((task) => ganttDate(task, "end") ? fromDateKey(ganttDate(task, "end")).getFullYear() : null),
  ].filter(Boolean))).sort((left, right) => left - right);
  const periodTasks = tasks
    .filter((task) => {
      const startDate = ganttDate(task, "start");
      const endDate = ganttDate(task, "end");
      if (!startDate || !endDate) return false;
      const taskStart = fromDateKey(startDate);
      const taskEnd = fromDateKey(endDate);
      return taskStart <= timelineEnd && taskEnd >= timelineStart;
    })
    .sort((left, right) => Number(left.status === "done") - Number(right.status === "done") || String(ganttDate(left, "end")).localeCompare(String(ganttDate(right, "end"))));
  const matchingIds = new Set(periodTasks.map((task) => String(task.id)));
  const matchingTasks = tasks.filter((task) => {
    if (matchingIds.has(String(task.id))) return true;
    let parentId = String(task.parentTaskId || "");
    while (parentId) {
      if (matchingIds.has(parentId)) return true;
      parentId = String(tasks.find((candidate) => String(candidate.id) === parentId)?.parentTaskId || "");
    }
    return false;
  });
  const orderedTasks = flattenTaskHierarchy(matchingTasks);
  const { items: visible, totalPages, currentPage: safePage } = paginateItems(orderedTasks, currentPage, pageSize);
  const goToNextWeek = () => {
    setPeriodStart((date) => shiftGanttPeriod(date, ganttPeriod, 1));
    setCurrentPage(1);
  };
  const goToPreviousWeek = () => {
    setPeriodStart((date) => shiftGanttPeriod(date, ganttPeriod, -1));
    setCurrentPage(1);
  };
  const goToToday = () => {
    setGanttPeriod("week");
    setPeriodStart(startOfGanttPeriod(currentDate, "week"));
    setCurrentPage(1);
  };
  const handlePeriodChange = (event) => {
    const nextPeriod = event.target.value;
    if (nextPeriod === "today") {
      goToToday();
      return;
    }
    setGanttPeriod(nextPeriod);
    setPeriodStart(startOfGanttPeriod(periodStart, nextPeriod));
    setCurrentPage(1);
  };
  const todayPosition = isCurrentPeriod ? `${((((currentDate - timelineStart) / 86400000) + 0.5) / timelineDuration) * 100}%` : null;
  const monthLabel = `${formatDate(timelineStart)} — ${formatDate(timelineEnd)}`;
  return (
    <div className="relative z-20" style={{ minHeight: `${Math.max(100, visible.length * 36 + 12)}px` }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">План виконання</h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-1 text-xs font-semibold capitalize text-slate-500">{monthLabel}</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={goToPreviousWeek} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50" title="Попередній період"><ChevronLeft size={14} /></button>
          <button type="button" onClick={goToNextWeek} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50" title="Наступний період"><ChevronRight size={14} /></button>
        </div>
        <select value={ganttPeriod} onChange={handlePeriodChange} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700" aria-label="Період ґанта">
          {GANTT_PERIODS.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}
        </select>
        <select value={selectedMonth} onChange={(event) => { setPeriodStart(startOfGanttPeriod(new Date(selectedYear, Number(event.target.value), 1, 12), ganttPeriod)); setCurrentPage(1); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700" aria-label="Місяць ґанта">
          {Array.from({ length: 12 }, (_, month) => <option key={month} value={month}>{new Intl.DateTimeFormat("uk-UA", { month: "long" }).format(new Date(2020, month, 1))}</option>)}
        </select>
        <select value={selectedYear} onChange={(event) => { setPeriodStart(startOfGanttPeriod(new Date(Number(event.target.value), selectedMonth, 1, 12), ganttPeriod)); setCurrentPage(1); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700" aria-label="Рік ґанта">
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
        <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setCurrentPage(1); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700" aria-label="Кількість задач у Ганті">
          {PAGINATION_OPTIONS.map((option) => <option key={option} value={option}>{option} задач</option>)}
        </select>
        </div>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-[170px_1fr] items-end gap-3 border-b border-slate-200 pb-2">
          <span className="pl-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Задача</span>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
            {timelineDays.map((date, index) => (
              <div key={toDateKey(date)} className={`text-center text-[10px] font-bold ${date.getDay() === 0 || date.getDay() === 6 ? "text-indigo-700" : "text-slate-700"}`}>
                <span className="block">{timelineUsesDays ? date.getDate() : new Intl.DateTimeFormat("uk-UA", { month: "short" }).format(date)}</span>
                {(timelineUsesDays && (index === 0 || date.getDate() === 1 || total <= 14)) && <span className="block text-[9px] font-semibold text-slate-600">{new Intl.DateTimeFormat("uk-UA", { month: "short" }).format(date)}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="relative" style={{ minHeight: `${Math.max(200, visible.length * GANTT_ROW_HEIGHT + 24)}px` }}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-[182px] right-0 z-0 grid overflow-hidden rounded-lg border border-slate-200"
            style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
          >
            {timelineDays.map((date, index) => (
              <div
                key={toDateKey(date)}
                className={`border-r border-slate-200 last:border-r-0 ${date.getDay() === 0 || date.getDay() === 6 ? "bg-slate-100/70" : "bg-white"}`}
              />
            ))}
          </div>
          {todayPosition && (
            <div className="pointer-events-none absolute inset-y-0 left-[182px] right-0 z-20">
              <div className="absolute inset-y-0" style={{ left: todayPosition }}>
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white">Сьогодні</div>
                <div className="h-full border-l-2 border-dashed border-rose-500" />
              </div>
            </div>
          )}
          <div className="relative z-10">
          {!visible.length ? (
            <div className="flex h-24 items-center justify-center text-sm text-slate-400">
              У цьому періоді задач із датами немає
            </div>
          ) : (
            <>
            <svg
              className="pointer-events-none absolute left-0 top-0 z-20 overflow-visible"
              width="170"
              height={visible.length * GANTT_ROW_HEIGHT}
              aria-hidden="true"
            >
              <defs>
                <marker id="gantt-subtask-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="#a5b4fc" />
                </marker>
              </defs>
              {visible.map(({ task, level }, index) => {
                if (!level) return null;
                const parentIndex = visible.findIndex((row) => String(row.task.id) === String(task.parentTaskId || ""));
                if (parentIndex === -1) return null;
                const originX = (level - 1) * 14 + 12;
                const targetX = level * 14 + 12;
                const originY = parentIndex * GANTT_ROW_HEIGHT + GANTT_ROW_HEIGHT / 2;
                const targetY = index * GANTT_ROW_HEIGHT + GANTT_ROW_HEIGHT / 2;
                return (
                  <path
                    key={`arrow-${task.id}`}
                    d={`M ${originX} ${originY} V ${targetY} H ${targetX}`}
                    fill="none"
                    stroke="#a5b4fc"
                    strokeWidth="1.5"
                    markerEnd="url(#gantt-subtask-arrow)"
                  />
                );
              })}
            </svg>
            {visible.map(({ task, level }) => {
              const startDate = ganttDate(task, "start");
              const endDate = ganttDate(task, "end");
              const taskStart = fromDateKey(startDate);
              const taskEnd = fromDateKey(endDate);
              const clippedStart = taskStart < timelineStart ? timelineStart : taskStart;
              const clippedEnd = taskEnd > timelineEnd ? timelineEnd : taskEnd;
              const startRatio = Math.max(0, (clippedStart - timelineStart) / 86400000 / timelineDuration);
              const endRatio = Math.min(1, Math.max(startRatio + 1 / timelineDuration, (clippedEnd - timelineStart) / 86400000 / timelineDuration));
              const parentTask = level > 0 ? tasks.find((candidate) => String(candidate.id) === String(task.parentTaskId || "")) : null;
              const barColorClass = parentTask ? ganttTaskColor(parentTask) : ganttTaskColor(task);
              return (
                <div
                  key={task.id}
                  className="grid cursor-pointer grid-cols-[170px_1fr] items-center gap-3 border-b border-slate-100 last:border-b-0 hover:bg-indigo-50/30"
                  style={{ height: `${GANTT_ROW_HEIGHT}px` }}
                  role="button"
                  tabIndex={0}
                  onClick={() => onTaskClick?.(task)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onTaskClick?.(task);
                    }
                  }}
                >
                  <div
                    className="truncate pl-3 text-xs font-semibold text-slate-700"
                    title={task.title}
                    style={{ paddingLeft: `${14 + level * 14}px` }}
                  >
                    {task.title}
                  </div>
                  <div
                    className="relative h-8"
                    style={{
                      marginLeft: `${level * 18}px`,
                      width: `calc(100% - ${level * 18}px)`,
                    }}
                  >
                    <div
                      className={`absolute top-1.5 h-6 rounded shadow-sm transition-all ${barColorClass} ${level > 0 ? "opacity-60" : ""}`}
                      title={`${formatDate(startDate)} — ${formatDate(endDate)}`}
                      aria-label={`${task.title}: ${formatDate(startDate)} — ${formatDate(endDate)}`}
                      style={{
                        left: `${startRatio * 100}%`,
                        right: `${Math.max(0, 100 - endRatio * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            </>
          )}
          </div>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-500">Сторінка {safePage} з {totalPages}</span>
            <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safePage === 1} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40">Назад</button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => <button key={page} type="button" onClick={() => setCurrentPage(page)} className={`h-7 min-w-7 rounded-lg border px-2 text-xs font-semibold ${page === safePage ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{page}</button>)}
            <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safePage === totalPages} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40">Далі</button>
          </div>
        )}
      </div>
    </div>
  );
}


function SubtaskForm({ task, people, onCreateSubtask, onDone, usersLoadError = false }) {
  const [subtask, setSubtask] = useState(() => {
    const fallbackAssignee =
      people.find((row) => idOf(row) === String(task?.assigneeId || "")) ||
      people.find((row) => displayName(row) === String(task?.assigneeName || task?.target || ""));

    return {
      title: "",
      startDate: today(),
      dueDate: "",
      priority: "normal",
      assigneeId: fallbackAssignee ? idOf(fallbackAssignee) : String(task?.assigneeId || ""),
      assigneeName: fallbackAssignee ? displayName(fallbackAssignee) : String(task?.assigneeName || task?.target || ""),
      attachments: [],
    };
  });
  const [attachError, setAttachError] = useState("");

  const selectAttachments = async (event) => {
    const selected = Array.from(event.target.files || []).slice(
      0,
      MAX_TASK_ATTACHMENTS - subtask.attachments.length,
    );
    if (!selected.length) return;
    if (selected.some((file) => file.size > MAX_TASK_ATTACHMENT_SIZE)) {
      setAttachError("Кожен файл має бути до 5 MB.");
      return;
    }
    try {
      const encoded = await Promise.all(
        selected.map(async (file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: await readFileAsDataUrl(file),
        })),
      );
      setSubtask((current) => ({ ...current, attachments: [...current.attachments, ...encoded] }));
      setAttachError("");
      event.target.value = "";
    } catch {
      setAttachError("Не вдалося додати файл.");
    }
  };
  const removeAttachment = (index) => {
    setSubtask((current) => ({
      ...current,
      attachments: current.attachments.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const submitSubtask = async (event) => {
    event.preventDefault();
    if (!subtask.title.trim() || !subtask.dueDate || !subtask.assigneeId) return;
    await onCreateSubtask?.(task, subtask);
    onDone?.();
  };

  return (
    <form onSubmit={submitSubtask} className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
      <input value={subtask.title} onChange={(event) => setSubtask((current) => ({ ...current, title: event.target.value }))} placeholder="Назва підзадачі" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:col-span-2" />
      <label className="text-xs font-bold text-slate-600 sm:col-span-2">Відповідальний<select value={subtask.assigneeId} onChange={(event) => {
        const assignee = people.find((row) => idOf(row) === event.target.value);
        setSubtask((current) => ({
          ...current,
          assigneeId: event.target.value,
          assigneeName: assignee ? displayName(assignee) : "",
        }));
      }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        <option value="">Оберіть відповідального</option>
        {people.map((row) => <option key={idOf(row)} value={idOf(row)}>{displayName(row)}</option>)}
      </select>
      {people.length === 0 && (
        <p className="mt-1 text-xs font-semibold text-rose-600">
          {usersLoadError
            ? "Не вдалося завантажити список користувачів. Натисніть «Оновити» вгорі сторінки."
            : "Немає доступних людей для призначення за поточною ієрархією посад."}
        </p>
      )}
      </label>
      <label className="text-xs font-bold text-slate-600">Початок<input type="date" value={subtask.startDate} onChange={(event) => setSubtask((current) => ({ ...current, startDate: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label>
      <label className="text-xs font-bold text-slate-600">Дедлайн<input type="date" min={subtask.startDate} value={subtask.dueDate} onChange={(event) => setSubtask((current) => ({ ...current, dueDate: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label>
      <label className="text-xs font-bold text-slate-600 sm:col-span-2">Пріоритет<select value={subtask.priority} onChange={(event) => setSubtask((current) => ({ ...current, priority: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">{PRIORITY.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <div className="sm:col-span-2">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-500 hover:border-indigo-400 hover:bg-indigo-50">
          <Paperclip size={14} />
          Додати фото або файли (до {MAX_TASK_ATTACHMENTS})
          <input type="file" multiple accept="*/*" className="hidden" onChange={selectAttachments} />
        </label>
        {attachError && <p className="mt-1 text-xs font-semibold text-rose-600">{attachError}</p>}
        {subtask.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {subtask.attachments.map((file, index) => (
              <span key={`${file.name}-${index}`} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200">
                {file.type?.startsWith("image/") ? (
                  <img src={file.dataUrl} alt={file.name} className="h-5 w-5 rounded object-cover" />
                ) : (
                  <FileText size={14} className="text-slate-400" />
                )}
                {file.name}
                <button type="button" onClick={() => removeAttachment(index)} className="text-slate-400 hover:text-rose-600" title="Прибрати файл">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white sm:col-span-2">Створити підзадачу</button>
    </form>
  );
}

function TaskDetailsDialog({ task, onClose, updateStatus, onCreateSubtask, users = [], user, workRoles = [], positions = [], usersLoadError = false }) {
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const people = getAssignableUsers(users, user, workRoles, positions).filter(Boolean);

  if (!task) return null;
  const comments = Array.isArray(task.comments)
    ? task.comments
    : task.comment
      ? [task.comment]
      : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4 sm:p-8"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-details-title"
        className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">
              Деталі задачі
            </p>
            <h2 id="task-details-title" className="mt-0.5 text-base font-bold tracking-tight text-slate-950">
              {task.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">Призначив: {task.createdByName || "—"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Закрити"
          >
            <X size={20} />
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Дедлайн</p>
            <p className="mt-1 font-semibold text-slate-900">{formatFullDate(task.dueDate)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Статус</p>
            <select
              value={task.status}
              onChange={(event) => updateStatus(task, event.target.value)}
              className="mt-1 w-full rounded-lg border-none bg-transparent p-0 font-semibold text-slate-900 outline-none"
            >
              <option value="todo">До виконання</option>
              <option value="in_progress">В роботі</option>
              <option value="review">На перевірці</option>
              <option value="done">Виконано</option>
            </select>
          </div>
        </div>
        <div className="mt-5">
          <h3 className="text-sm font-bold text-slate-900">Опис</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
            {task.description || "Опис не додано."}
          </p>
          {Array.isArray(task.attachments) && task.attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {task.attachments.map((file, index) => (
                <a
                  key={`${file.name}-${index}`}
                  href={file.dataUrl || file.url}
                  download={file.name}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                >
                  {String(file.type || "").startsWith("image/") ? (
                    <img src={file.dataUrl || file.url} alt={file.name} className="h-5 w-5 rounded object-cover" />
                  ) : (
                    <FileText size={14} className="text-slate-400" />
                  )}
                  {file.name}
                </a>
              ))}
            </div>
          )}
        </div>
        {onCreateSubtask && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <button type="button" onClick={() => setShowSubtaskForm((current) => !current)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100">
              <Plus size={16} /> Додати підзадачу
            </button>
            {showSubtaskForm && (
              <SubtaskForm key={task.id} task={task} people={people} onCreateSubtask={onCreateSubtask} onDone={() => setShowSubtaskForm(false)} usersLoadError={usersLoadError} />
            )}
          </div>
        )}
        <div className="mt-5 border-t border-slate-100 pt-5">
          <h3 className="text-sm font-bold text-slate-900">Коментарі</h3>
          {comments.length ? (
            <div className="mt-2 space-y-2">
              {comments.map((comment, index) => (
                <div key={comment.id || index} className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                  {typeof comment === "string" ? comment : comment.text || comment.comment || "—"}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-400">Коментарів немає.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskList({ loading, activeTasks, filter, setFilter, updateStatus, onCreateSubtask, users = [], user, workRoles = [], positions = [], usersLoadError = false }) {
  const [selectedTask, setSelectedTask] = useState(null);
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [deadlineFilter, setDeadlineFilter] = useState("all");
  const [pageSize, setPageSize] = useState(PAGINATION_OPTIONS[0]);
  const [currentPage, setCurrentPage] = useState(1);
  const handleStatusChange = async (task, status) => {
    setSelectedTask((current) => current?.id === task.id ? { ...current, status } : current);
    await updateStatus(task, status);
  };
  const filteredTasks = activeTasks.filter((task) =>
    (priorityFilter === "all" || task.priority === priorityFilter) &&
    (deadlineFilter === "all" || (deadlineFilter === "late" && isLate(task)) || (deadlineFilter === "soon" && isDueWithin48Hours(task))),
  );
  const hierarchicalTasks = flattenTaskHierarchy(filteredTasks);
  const { items: paginatedTasks, totalPages, currentPage: safePage } = paginateItems(hierarchicalTasks, currentPage, pageSize);
  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LayoutList size={18} className="text-indigo-500" />
          <h2 className="font-bold">Список задач</h2>
        </div>
      </div>
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">
          Завантаження портфеля...
        </div>
      ) : filteredTasks.length ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b-2 border-slate-300 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2">Задача</th><th className="px-3 py-2">Відповідальний</th><th className="px-3 py-2"><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold normal-case tracking-normal text-slate-700" aria-label="Фільтр пріоритету"><option value="all">Усі пріоритети</option>{PRIORITY.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></th><th className="px-3 py-2"><select value={deadlineFilter} onChange={(event) => setDeadlineFilter(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold normal-case tracking-normal text-slate-700" aria-label="Фільтр дедлайну"><option value="all">Усі дедлайни</option><option value="late">Прострочені</option><option value="soon">До 48 годин</option></select></th><th className="px-3 py-2"><select value={filter} onChange={(event) => setFilter(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold normal-case tracking-normal text-slate-700" aria-label="Фільтр статусу"><option value="all">Усі статуси</option>{STATUS.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}<option value="late">Прострочені</option></select></th></tr></thead>
              <tbody>{paginatedTasks.map(({ task, level }) => <tr
                key={task.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedTask(task)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedTask(task);
                  }
                }}
                className="cursor-pointer border-b-2 border-slate-200 transition hover:bg-indigo-50/30"
              >
                <td className="px-3 py-2.5"><div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${level * 18}px` }}>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${task.priority === "critical" ? "bg-red-500" : task.priority === "high" ? "bg-orange-500" : task.priority === "normal" ? "bg-blue-500" : "bg-slate-400"}`} title={`Пріоритет: ${PRIORITY.find((priority) => priority.id === task.priority)?.label || "Низький"}`} />
                    <span className="shrink-0 font-semibold">{task.title}</span><StatusBadge status={task.status} /><span className="min-w-0 truncate text-xs text-slate-500" title={task.description || "Без опису"}>{task.description || "Без опису"}</span>
                  </div></td>
              <td className="px-3 py-2.5 text-slate-600">{task.target || "—"}</td>
                <td className="px-3 py-2.5">{PRIORITY.find((item) => item.id === task.priority)?.label || "Низький"}</td>
                <td className={`px-3 py-2.5 font-semibold ${isLate(task) ? "text-rose-600" : "text-slate-600"}`}>{formatFullDate(task.dueDate)}</td>
                <td className="px-3 py-2.5 text-xs font-bold">{isLate(task) ? "Прострочено" : task.status === "done" ? "Завершено" : "В терміні"}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-3">
            <div className="mr-auto flex items-center gap-2 text-xs text-slate-500">
              <span>Показати</span>
              <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setCurrentPage(1); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-semibold text-slate-700" aria-label="Кількість задач на сторінці">
                {PAGINATION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <span>· Сторінка {safePage} з {totalPages}</span>
            </div>
            {totalPages > 1 && (
              <>
              <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safePage === 1} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Назад</button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                <button key={page} type="button" onClick={() => setCurrentPage(page)} className={`h-8 min-w-8 rounded-lg border px-2 text-xs font-semibold ${page === safePage ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                  {page}
                </button>
              ))}
              <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safePage === totalPages} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Далі</button>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-xl bg-slate-50 py-12 text-center">
          <CheckCircle2 className="mx-auto text-indigo-400" size={28} />
          <p className="mt-2 text-sm font-semibold text-slate-600">Поки що задач немає</p>
          <p className="mt-1 text-xs text-slate-400">Призначені вам задачі з'являться тут.</p>
        </div>
      )}
      </div>
      <TaskDetailsDialog task={selectedTask} onClose={() => setSelectedTask(null)} updateStatus={handleStatusChange} onCreateSubtask={onCreateSubtask} users={users} user={user} workRoles={workRoles} positions={positions} usersLoadError={usersLoadError} />
    </>
  );
}

export default function ProjectManagementModule({
  topTab = "newtask",
  user,
  restaurants = [],
}) {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersLoadError, setUsersLoadError] = useState(false);
  const [workRoles, setWorkRoles] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [showLegalRequest, setShowLegalRequest] = useState(false);
  const [filters, setFilters] = useState({ newtask: "all", mytask: "all", report: "all" });
  const [reportFilters, setReportFilters] = useState({ period: "all", department: "all", location: "all", priority: "all" });
  const [drillDownTasks, setDrillDownTasks] = useState(null);
  const [selectedGanttTask, setSelectedGanttTask] = useState(null);
  const legal = useLegalTasks(user);
  const isReports = String(topTab).toLowerCase().includes("report");
  const isMyTasks = /my.?task/i.test(String(topTab));
  const isNewTask = !isReports && !isMyTasks;
  const filterKey = isReports ? "report" : isMyTasks ? "mytask" : "newtask";
  const filter = filters[filterKey];
  const setFilter = (value) => setFilters((current) => ({ ...current, [filterKey]: value }));

  const load = async () => {
    setLoading(true);
    setUsersLoadError(false);
    try {
      const [remote, people, roles, rolePositions] = await Promise.all([
        isCollectionsApiEnabled()
          ? listCollectionItemsApi(COLLECTION)
          : Promise.resolve(readLocalTasks()),
        getUsers().catch((error) => {
          console.error("Не вдалося завантажити користувачів для призначення відповідальних:", error);
          setUsersLoadError(true);
          return [];
        }),
        getWorkRoles().catch(() => []),
        getPositions().catch(() => []),
      ]);
      setTasks(
        (Array.isArray(remote) ? remote : []).sort((a, b) =>
          String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
        ),
      );
      setUsers(Array.isArray(people) ? people : []);
      setWorkRoles(Array.isArray(roles) ? roles : []);
      setPositions(Array.isArray(rolePositions) ? rolePositions : []);
    } catch {
      setTasks(readLocalTasks());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  // Пише сповіщення одразу в БД і будить локальний центр сповіщень поточної
  // вкладки; отримувач бачить задачу без очікування наступного циклу опитування.
  const notifyTaskAssignee = (task) => {
    if (!task || task.targetType !== "person" || !task.assigneeId) return;
    if (!isLegalApiEnabled()) return;
    addLegalNotificationApi({
      taskId: String(task.id || ""),
      taskTitle: String(task.title || ""),
      title: "Нова задача",
      body: `${displayName(user)} доручив(-ла) вам задачу «${task.title}»${task.dueDate ? ` · дедлайн ${formatDate(task.dueDate)}` : ""}`,
      targetUserId: String(task.assigneeId || ""),
      targetRole: "",
      actorUserId: idOf(user),
      actionUrl: "projectmanagment",
      actionTab: "mytask",
      source: "project",
      createdAt: new Date().toISOString(),
    })
      .then(() => window.dispatchEvent(new CustomEvent("lucia:notifications-updated")))
      .catch((error) => console.warn("Не вдалося надіслати сповіщення про нову задачу:", error));
  };
  const createTask = async (form) => {
    const task = {
      ...form,
      id: `task_${Date.now()}`,
      status: "todo",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      target:
        form.targetType === "person" ? form.assigneeName : form.department,
    };
    try {
      if (isCollectionsApiEnabled()) {
        const id = await createCollectionItemApi(COLLECTION, task);
        task.id = id || task.id;
      }
    } catch {
      /* keep the task locally when the API is temporarily unavailable */
    }
    const next = [task, ...tasks];
    setTasks(next);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    setShowComposer(false);
    notifyTaskAssignee(task);
  };
  const openLegalRequest = () => {
    setShowComposer(false);
    setShowLegalRequest(true);
  };
  const createLegalLinkedTask = async (legalResult, form = {}) => {
    const legalTask = legal.tasks.find(
      (task) => String(task.id) === String(legalResult?.id),
    );
    const task = {
      id: `task_${Date.now()}`,
      title: legalTask?.title || form.title || "Запит до Юриста",
      description:
        legalTask?.description || form.description || "Юридичний запит",
      targetType: "department",
      department: "Юридичний відділ",
      target: "Юридичний відділ",
      priority: legalTask?.priority || form.priority || "normal",
      startDate: today(),
      dueDate:
        legalTask?.preferredDeadline || form.preferredDeadline || today(),
      status: "todo",
      source: "legal",
      sourceTaskId: String(legalResult?.id || ""),
      createdBy: idOf(user),
      createdByName: displayName(user),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      if (isCollectionsApiEnabled()) {
        const id = await createCollectionItemApi(COLLECTION, task);
        task.id = id || task.id;
      }
    } catch {
      /* Legal TODO remains the source of truth if the linked mirror fails. */
    }
    const next = [task, ...tasks];
    setTasks(next);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    setShowLegalRequest(false);
  };
  const updateStatus = async (task, status) => {
    const nextTask = { ...task, status, updatedAt: new Date().toISOString() };
    const next = tasks.map((item) => (item.id === task.id ? nextTask : item));
    setTasks(next);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    try {
      if (isCollectionsApiEnabled())
        await updateCollectionItemApi(COLLECTION, task.id, {
          status,
          updatedAt: nextTask.updatedAt,
        });
    } catch {
      /* optimistic UI remains usable */
    }
  };
  const createSubtask = async (parentTask, form) => {
    const assigneeId = String(form.assigneeId || parentTask.assigneeId || "");
    const assigneeName = String(form.assigneeName || parentTask.assigneeName || parentTask.target || "").trim();
    const targetType = form.targetType === "department" ? "department" : "person";
    const target = targetType === "person" ? assigneeName : String(form.department || parentTask.department || parentTask.target || "").trim();

    const subtask = {
      ...form,
      title: form.title.trim(),
      id: `task_${Date.now()}`,
      parentTaskId: parentTask.id,
      parentTaskTitle: parentTask.title,
      targetType,
      assigneeId,
      assigneeName,
      target,
      department: targetType === "department" ? target : parentTask.department || "",
      status: "todo",
      createdBy: idOf(user),
      createdByName: displayName(user),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      if (isCollectionsApiEnabled()) {
        const id = await createCollectionItemApi(COLLECTION, subtask);
        subtask.id = id || subtask.id;
      }
    } catch {
      /* keep the subtask locally when the API is temporarily unavailable */
    }
    const next = [subtask, ...tasks];
    setTasks(next);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    notifyTaskAssignee(subtask);
  };
  const visibleTaskIds = useMemo(() => getUserTaskScope(tasks, user), [tasks, user]);
  const assignedTasks = isMyTasks
    ? tasks.filter((task) => visibleTaskIds.has(String(task.id)))
    : tasks;
  const reportDepartments = useMemo(() => Array.from(new Set(tasks.map((task) => task.department).filter(Boolean))).sort(), [tasks]);
  const reportLocations = useMemo(() => Array.from(new Set(tasks.map((task) => task.restaurant || task.branch || task.location).filter(Boolean))).sort(), [tasks]);
  const reportTasks = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    const periodStart = reportFilters.period === "today" ? start : reportFilters.period === "week" ? new Date(start.getTime() - ((start.getDay() + 6) % 7) * 86400000) : reportFilters.period === "month" ? new Date(now.getFullYear(), now.getMonth(), 1, 12) : reportFilters.period === "quarter" ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1, 12) : null;
    const periodEnd = reportFilters.period === "today" ? start : reportFilters.period === "week" ? new Date(periodStart.getTime() + 6 * 86400000) : reportFilters.period === "month" ? new Date(now.getFullYear(), now.getMonth() + 1, 0, 12) : reportFilters.period === "quarter" ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0, 12) : null;
    return tasks.filter((task) => {
      const taskDate = task.dueDate ? fromDateKey(task.dueDate) : null;
      const location = task.restaurant || task.branch || task.location || "";
      return (!periodStart || (taskDate && taskDate >= periodStart && taskDate <= periodEnd)) &&
        (reportFilters.department === "all" || task.department === reportFilters.department) &&
        (reportFilters.location === "all" || location === reportFilters.location) &&
        (reportFilters.priority === "all" || task.priority === reportFilters.priority);
    });
  }, [tasks, reportFilters]);
  const dashboardTasks = isReports ? reportTasks : assignedTasks;
  const activeTasks = dashboardTasks.filter(
    (task) =>
      filter === "all" ||
      task.status === filter ||
      (filter === "late" && isLate(task)),
  );
  const stats = useMemo(
    () => ({
      total: dashboardTasks.length,
      done: dashboardTasks.filter((task) => task.status === "done").length,
      late: dashboardTasks.filter(isLate).length,
      open: dashboardTasks.filter((task) => task.status !== "done").length,
    }),
    [dashboardTasks],
  );
  const completionRate = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const averageCompletionTime = useMemo(() => {
    const completed = dashboardTasks
      .filter(
        (task) => task.status === "done" && task.createdAt && task.updatedAt,
      )
      .map(
        (task) =>
          (new Date(task.updatedAt) - new Date(task.createdAt)) / 3600000,
      )
      .filter((hours) => Number.isFinite(hours) && hours >= 0);
    return completed.length
      ? formatDuration(
          completed.reduce((sum, hours) => sum + hours, 0) / completed.length,
        )
      : "—";
  }, [dashboardTasks]);
  const byAssignee = useMemo(() => {
    const rows = Object.values(
      reportTasks.reduce((result, task) => {
          const key = task.target || "Без адресата";
          result[key] = result[key] || {
            name: key,
            total: 0,
            done: 0,
            late: 0,
            completionHours: [],
          };
          result[key].total += 1;
          if (task.status === "done") result[key].done += 1;
          if (isLate(task)) result[key].late += 1;
          if (task.status === "done" && task.createdAt && task.updatedAt) {
            const hours = (new Date(task.updatedAt) - new Date(task.createdAt)) / 3600000;
            if (Number.isFinite(hours) && hours >= 0) result[key].completionHours.push(hours);
          }
          return result;
        }, {}),
    );
    return rows
      .map((row) => ({
        ...row,
        averageHours: row.completionHours.length
          ? row.completionHours.reduce((sum, hours) => sum + hours, 0) / row.completionHours.length
          : null,
      }))
      .sort((left, right) => right.total - left.total);
  }, [reportTasks]);
  const criticalTasks = useMemo(() => reportTasks.filter((task) => task.status !== "done").sort((left, right) => {
    const score = (task) => (isLate(task) ? 10 : 0) + ({ critical: 4, high: 3, normal: 2, low: 1 }[task.priority] || 0);
    return score(right) - score(left) || String(left.dueDate || "9999").localeCompare(String(right.dueDate || "9999"));
  }).slice(0, 5), [reportTasks]);
  const longestAssigneeCompletionTime = Math.max(1, ...byAssignee.map((row) => row.averageHours || 0));

  return (
    <section className="min-h-[680px] rounded-2xl bg-[#f5f7fb] p-4 text-slate-900 sm:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
            <CircleDot size={14} /> Центр управління
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 hover:text-indigo-600"
            title="Оновити"
          >
            <RefreshCw size={18} />
          </button>
          {isReports && (
            <button type="button" onClick={() => downloadTaskPdf({ filters: reportFilters, stats, byAssignee, criticalTasks, averageCompletionTime })} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <Download size={18} /> Експорт PDF
            </button>
          )}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-4">
          <TaskStatCard
          label="Всього задач"
          value={stats.total}
          detail={stats.open ? `${stats.open} відкрито зараз` : "Усі задачі завершено"}
          icon={ClipboardList}
          accentClass="bg-indigo-50 text-indigo-600"
        />
        <TaskStatCard
          label="В роботі"
          value={stats.open}
          detail={stats.total ? `${Math.round((stats.open / stats.total) * 100)}% від усіх задач` : "Немає активних задач"}
          icon={Clock3}
          accentClass="bg-amber-50 text-amber-600"
        />
        <TaskStatCard
          label="Виконано"
          value={stats.done}
          detail={stats.total ? `${completionRate}% завершено` : "Ще немає задач"}
          icon={CheckCircle2}
          accentClass="bg-emerald-50 text-emerald-600"
        />
        <TaskStatCard
          label="Потрібна увага"
          value={stats.late}
          detail={stats.late ? "Є прострочені задачі" : "Прострочень немає"}
          icon={TriangleAlert}
          accentClass="bg-rose-50 text-rose-600"
        />
        </div>
        {isNewTask && (
          <div className="flex shrink-0 flex-col items-stretch justify-center gap-2">
            <button
              type="button"
              onClick={() => setShowComposer(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700"
            >
              <Plus size={18} /> Нова задача
            </button>
            <button
              type="button"
              onClick={() => setFilter("late")}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50"
            >
              Показати прострочені <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
      {isReports ? (
        <>
          <div className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-bold text-slate-600">Період<select value={reportFilters.period} onChange={(event) => setReportFilters((current) => ({ ...current, period: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold"><option value="all">Увесь період</option><option value="today">Сьогодні</option><option value="week">Цей тиждень</option><option value="month">Цей місяць</option><option value="quarter">Цей квартал</option></select></label>
            <label className="text-xs font-bold text-slate-600">Підрозділ<select value={reportFilters.department} onChange={(event) => setReportFilters((current) => ({ ...current, department: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold"><option value="all">Усі підрозділи</option>{reportDepartments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-600">Заклад / філія<select value={reportFilters.location} onChange={(event) => setReportFilters((current) => ({ ...current, location: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold"><option value="all">Усі об'єкти</option>{reportLocations.map((location) => <option key={location} value={location}>{location}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-600">Пріоритетність<select value={reportFilters.priority} onChange={(event) => setReportFilters((current) => ({ ...current, priority: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold"><option value="all">Усі пріоритети</option>{PRIORITY.map((priority) => <option key={priority.id} value={priority.id}>{priority.label}</option>)}</select></label>
          </div>
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-bold">Навантаження за адресатами</h2>
                <p className="mt-1 text-xs text-slate-400">
                  Розподіл задач і прострочень
                </p>
              </div>
              <BarChart3 className="text-indigo-500" size={20} />
            </div>
            <div className="space-y-4">
              {byAssignee.length ? (
                byAssignee.map((row) => (
                  <div key={row.name}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-semibold">{row.name}</span>
                      <span className="text-slate-400">
                        {row.done}/{row.total} виконано
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${(row.done / row.total) * 100}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                      <Clock3 size={14} className="text-indigo-500" />
                      <span className="w-28 shrink-0">Сер. час: <strong className="text-slate-700">{row.averageHours == null ? "—" : formatDuration(row.averageHours)}</strong></span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-sky-500" style={{ width: `${row.averageHours == null ? 0 : Math.max(8, (row.averageHours / longestAssigneeCompletionTime) * 100)}%` }} />
                      </div>
                    </div>
                    {row.late > 0 && (
                      <button type="button" onClick={() => setDrillDownTasks(reportTasks.filter((task) => (task.target || "Без адресата") === row.name && isLate(task)))} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-200">
                        <TriangleAlert size={14} />
                        {row.late} прострочено
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="py-10 text-center text-sm text-slate-400">
                  Дані з'являться після постановки задач.
                </p>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between"><div><h2 className="font-bold">Топ задач, що потребують уваги</h2><p className="mt-1 text-xs text-slate-400">Прострочені та високопріоритетні задачі</p></div><TriangleAlert className="text-rose-500" size={20} /></div>
            <div className="mt-4 divide-y divide-slate-100">{criticalTasks.length ? criticalTasks.map((task) => <div key={task.id} className="py-3"><p className="font-semibold text-slate-900">{task.title}</p><div className="mt-1 flex items-center justify-between gap-2 text-xs"><span className="text-slate-500">{task.target || "—"}</span><span className={`font-bold ${isLate(task) ? "text-rose-600" : "text-orange-600"}`}>{isLate(task) ? "Прострочено" : PRIORITY.find((priority) => priority.id === task.priority)?.label}</span></div><p className="mt-1 text-xs font-semibold text-slate-500">{formatDate(task.dueDate)}</p></div>) : <p className="py-8 text-center text-sm text-slate-400">За поточними фільтрами критичних задач немає.</p>}</div>
          </div>
        </div>
        </>
      ) : (
        <>
          {isMyTasks ? (
            <div className="mb-5 space-y-5">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <Gantt tasks={assignedTasks} onTaskClick={setSelectedGanttTask} />
              </div>
              <TaskList
                loading={loading}
                activeTasks={activeTasks}
                filter={filter}
                setFilter={setFilter}
                updateStatus={updateStatus}
                onCreateSubtask={createSubtask}
                users={users}
                user={user}
                workRoles={workRoles}
                positions={positions}
                usersLoadError={usersLoadError}
              />
            </div>
          ) : (
            <>
              <div className="mb-5 space-y-5">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <Gantt tasks={assignedTasks} onTaskClick={setSelectedGanttTask} />
                </div>
                <TaskList
                  loading={loading}
                  activeTasks={activeTasks}
                  filter={filter}
                  setFilter={setFilter}
                  updateStatus={updateStatus}
                  onCreateSubtask={createSubtask}
                  users={users}
                  user={user}
                  workRoles={workRoles}
                  positions={positions}
                  usersLoadError={usersLoadError}
                />
              </div>
            </>
          )}
        </>
      )}
      {showComposer && (
        <TaskComposer
          users={users}
          user={user}
          workRoles={workRoles}
          positions={positions}
          usersLoadError={usersLoadError}
          onClose={() => setShowComposer(false)}
          onCreate={createTask}
          onLegalSelect={openLegalRequest}
        />
      )}
      {showLegalRequest && (
        <LegalRequestModal
          user={user}
          restaurants={restaurants}
          createTask={legal.createTask}
          onClose={() => setShowLegalRequest(false)}
          onSuccess={createLegalLinkedTask}
        />
      )}
      <ReportTaskDialog tasks={drillDownTasks} onClose={() => setDrillDownTasks(null)} />
      <TaskDetailsDialog task={selectedGanttTask} onClose={() => setSelectedGanttTask(null)} updateStatus={updateStatus} onCreateSubtask={createSubtask} />
    </section>
  );
}
