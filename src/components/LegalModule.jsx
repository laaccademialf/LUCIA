import { useEffect, useMemo, useRef, useState } from "react";
import {
  Scale,
  FileText,
  Paperclip,
  Trash2,
  CalendarClock,
  Send,
  LayoutGrid,
  Table2,
  Archive,
  ArchiveRestore,
  X,
  History,
  User2,
  Search,
  Download,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useLegalTasks } from "../hooks/useLegalTasks";
import {
  LEGAL_PROCESS_TAB,
  LEGAL_REQUEST_TAB,
  LEGAL_STATUSES,
  LEGAL_ARCHIVED_STATUS,
  LEGAL_PRIORITIES,
  getLegalStatusMeta,
  getLegalPriorityMeta,
  isLegalUser,
  formatLegalDateTime,
  formatLegalDate,
  getDeadlineDaysLeft,
} from "../data/legalConstants";
import { isLegalApiEnabled } from "../api/legalTasksApi";
import { getUsers } from "../firebase/users";

const cardClass = "rounded-2xl bg-white border border-slate-200 text-slate-900 shadow-sm";
const inputClass =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition";

const MAX_FILES = 6;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const PAGE_SIZE = 10;

const actorId = (user) => String(user?.uid || user?.id || user?.userId || user?.email || "").trim();

const toDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const formatBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (!value) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

function StatusBadge({ status, archived, compact = false }) {
  const meta = getLegalStatusMeta(archived ? LEGAL_ARCHIVED_STATUS.value : status);
  const sizeClass = compact
    ? "px-2 py-0.5 text-[11px] gap-1"
    : "px-2.5 py-1 text-xs gap-1.5";
  return (
    <span className={`inline-flex items-center rounded-full border font-semibold ${sizeClass} ${meta.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function PriorityBadge({ priority, compact = false }) {
  const meta = getLegalPriorityMeta(priority);
  const sizeClass = compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]";
  return <span className={`rounded-full font-semibold ${sizeClass} ${meta.color}`}>{meta.label}</span>;
}

function DeadlinePill({ value, compact = false }) {
  if (!value) return null;
  const daysLeft = getDeadlineDaysLeft(value);
  let tone = "bg-slate-100 text-slate-600";
  if (daysLeft !== null) {
    if (daysLeft < 0) tone = "bg-rose-100 text-rose-700";
    else if (daysLeft <= 2) tone = "bg-amber-100 text-amber-700";
    else tone = "bg-emerald-100 text-emerald-700";
  }
  const label =
    daysLeft === null
      ? formatLegalDate(value)
      : daysLeft < 0
        ? `Прострочено ${Math.abs(daysLeft)} дн.`
        : daysLeft === 0
          ? "Сьогодні"
          : `${daysLeft} дн.`;
  const sizeClass = compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${sizeClass} ${tone}`}>
      <CalendarClock size={compact ? 11 : 12} />
      {label}
    </span>
  );
}

function AttachmentChips({ attachments }) {
  if (!Array.isArray(attachments) || attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {attachments.map((file, idx) => (
        <a
          key={`${file.name}-${idx}`}
          href={file.dataUrl}
          download={file.name}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-200"
          title={file.name}
        >
          <Paperclip size={12} />
          <span className="max-w-[120px] truncate">{file.name}</span>
          <Download size={11} className="text-slate-400" />
        </a>
      ))}
    </div>
  );
}

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

function FilePicker({ files, setFiles }) {
  const handleSelect = async (event) => {
    const picked = Array.from(event.target.files || []);
    if (!picked.length) return;
    const room = Math.max(0, MAX_FILES - files.length);
    const limited = picked.slice(0, room);
    const tooLarge = limited.find((file) => file.size > MAX_FILE_SIZE);
    if (tooLarge) {
      alert(`Кожен файл має бути до ${formatBytes(MAX_FILE_SIZE)}.`);
      return;
    }

    try {
      const encoded = await Promise.all(
        limited.map(async (file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: await toDataUrl(file),
        }))
      );
      setFiles((prev) => [...prev, ...encoded]);
      event.target.value = "";
    } catch (err) {
      console.error("Помилка обробки файлів:", err);
      alert("Не вдалося обробити файли.");
    }
  };

  return (
    <div>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50">
        <Paperclip size={16} />
        Додати файли (до {MAX_FILES}, кожен до {formatBytes(MAX_FILE_SIZE)})
        <input type="file" multiple className="hidden" onChange={handleSelect} />
      </label>
      {files.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {files.map((file, idx) => (
            <div key={`${file.name}-${idx}`} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 truncate text-slate-700">
                <FileText size={14} className="text-indigo-500" />
                <span className="truncate">{file.name}</span>
                <span className="text-xs text-slate-400">{formatBytes(file.size)}</span>
              </span>
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                className="text-slate-400 hover:text-rose-500"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PaginationControls({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 disabled:opacity-40"
      >
        <ChevronLeft size={14} /> Назад
      </button>
      <span>
        Сторінка {page} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 disabled:opacity-40"
      >
        Далі <ChevronRight size={14} />
      </button>
    </div>
  );
}

function TaskRowsTable({
  title,
  tasks,
  emptyLabel,
  onRowClick,
  draggable = false,
  onDragStart = () => {},
  rowTone = "hover:bg-indigo-50/40",
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = tasks.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (tasks.length === 0) {
    return <div className={`${cardClass} px-6 py-12 text-center text-sm text-slate-400`}>{emptyLabel}</div>;
  }

  return (
    <div className={`${cardClass} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <p className="text-xs text-slate-400">Показано {paged.length} з {tasks.length}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-semibold">Задача</th>
              <th className="px-4 py-2 font-semibold">Замовник</th>
              <th className="px-4 py-2 font-semibold">Статус</th>
              <th className="px-4 py-2 font-semibold">Пріоритет</th>
              <th className="px-4 py-2 font-semibold">Дедлайн</th>
              <th className="px-4 py-2 font-semibold">Оновлено</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((task) => (
              <tr
                key={task.id}
                draggable={draggable}
                onDragStart={(e) => onDragStart(e, task)}
                onClick={() => onRowClick(task)}
                className={`cursor-pointer border-b border-slate-100 transition last:border-b-0 ${rowTone}`}
              >
                <td className="px-4 py-2 align-top">
                  <p className="font-semibold text-slate-900">{task.title}</p>
                  {Array.isArray(task.attachments) && task.attachments.length > 0 ? (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-slate-400">
                      <Paperclip size={11} /> {task.attachments.length} файлів
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-slate-600 align-top">{task.createdByName || "—"}</td>
                <td className="px-4 py-2 align-top">
                  <StatusBadge status={task.status} archived={task.archived} compact />
                </td>
                <td className="px-4 py-2 align-top">
                  <PriorityBadge priority={task.priority} compact />
                </td>
                <td className="px-4 py-2 align-top">
                  <DeadlinePill value={task.preferredDeadline} compact />
                </td>
                <td className="px-4 py-2 whitespace-nowrap align-top text-xs text-slate-400">{formatLegalDateTime(task.updatedAt || task.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationControls page={safePage} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

function RequestView({ user, restaurants, legal }) {
  const { tasks, createTask } = legal;
  const [form, setForm] = useState({
    title: "",
    description: "",
    preferredDeadline: "",
    priority: "normal",
    restaurantId: user?.restaurant || "",
    contact: "",
  });
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  const currentUserId = actorId(user);
  const myTasks = useMemo(
    () =>
      tasks
        .filter((task) => String(task.createdById || "") === currentUserId)
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
    [tasks, currentUserId]
  );

  const myActiveTasks = useMemo(() => myTasks.filter((task) => !task.archived), [myTasks]);
  const myArchivedTasks = useMemo(() => myTasks.filter((task) => task.archived), [myTasks]);

  const selectedRestaurant = useMemo(
    () => (restaurants || []).find((item) => String(item.id) === String(form.restaurantId)),
    [restaurants, form.restaurantId]
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.description.trim()) {
      alert("Заповніть тему задачі та опис.");
      return;
    }

    setSubmitting(true);
    const result = await createTask({
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      attachments: files,
      restaurantName: selectedRestaurant?.name || "",
    });
    setSubmitting(false);

    if (!result.success) {
      alert("Не вдалося надіслати задачу. Спробуйте ще раз.");
      return;
    }

    setForm({
      title: "",
      description: "",
      preferredDeadline: "",
      priority: "normal",
      restaurantId: user?.restaurant || "",
      contact: "",
    });
    setFiles([]);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:items-start">
      <form onSubmit={handleSubmit} className={`${cardClass} col-span-1 self-start overflow-hidden lg:col-span-2`}>
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 text-white">
          <div className="flex items-center gap-2">
            <Scale size={20} />
            <h2 className="text-lg font-semibold">Запит до Юриста</h2>
          </div>
          <p className="mt-1 text-sm text-indigo-100">Опишіть задачу — юридичний відділ візьме її в роботу.</p>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="text-sm font-semibold text-slate-800">Тема задачі *</label>
            <input
              className={inputClass}
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Напр. Перевірити договір оренди"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-800">Опис *</label>
            <textarea
              className={`${inputClass} min-h-[110px] resize-y`}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Стисло опишіть суть запиту, сторони, контекст..."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-800">Бажаний дедлайн</label>
              <DateInputField
                value={form.preferredDeadline}
                onChange={(e) => setForm((p) => ({ ...p, preferredDeadline: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800">Пріоритет</label>
              <select
                className={inputClass}
                value={form.priority}
                onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
              >
                {LEGAL_PRIORITIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-800">Ресторан / підрозділ</label>
              <select
                className={inputClass}
                value={form.restaurantId}
                onChange={(e) => setForm((p) => ({ ...p, restaurantId: e.target.value }))}
              >
                <option value="">Не вказано</option>
                {(restaurants || []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-800">Контакт для звʼязку</label>
              <input
                className={inputClass}
                value={form.contact}
                onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))}
                placeholder="Телефон / e-mail"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-800">Файли</label>
            <div className="mt-1">
              <FilePicker files={files} setFiles={setFiles} />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
          >
            <Send size={16} />
            {submitting ? "Надсилання..." : "Надіслати юристу"}
          </button>
        </div>
      </form>

      <div className="col-span-1 space-y-4 lg:col-span-3">
        <TaskRowsTable
          title={`Мої заявки (активні) · ${myActiveTasks.length}`}
          tasks={myActiveTasks}
          emptyLabel="У вас немає активних юридичних заявок."
          onRowClick={setSelectedTask}
        />

        <div className={`${cardClass} overflow-hidden`}>
          <button
            type="button"
            onClick={() => setShowArchive((prev) => !prev)}
            className="flex w-full items-center justify-between bg-slate-50 px-4 py-3 text-left"
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Archive size={16} /> Архів моїх заявок ({myArchivedTasks.length})
            </span>
            <span className="text-xs text-slate-400">{showArchive ? "сховати" : "показати"}</span>
          </button>
          {showArchive ? (
            <div className="p-3">
              <TaskRowsTable
                title="Архів"
                tasks={myArchivedTasks}
                emptyLabel="В архіві поки немає заявок."
                onRowClick={setSelectedTask}
                rowTone="hover:bg-slate-50"
              />
            </div>
          ) : null}
        </div>
      </div>

      {selectedTask ? (
        <TaskDetailModal
          task={tasks.find((t) => t.id === selectedTask.id) || selectedTask}
          onClose={() => setSelectedTask(null)}
          legal={legal}
          canManage={false}
          canMessageLegal
        />
      ) : null}
    </div>
  );
}

function LegalSettingsView({ user, legal }) {
  const { settings, saveSettings, settingsLoading } = legal;
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lawyerUserIdsDraft, setLawyerUserIdsDraft] = useState(() =>
    Array.isArray(settings?.lawyerUserIds) ? settings.lawyerUserIds : []
  );

  const canEdit = String(user?.role || "") === "admin" || isLegalUser(user);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const data = await getUsers();
        if (!mounted) return;
        setUsers(Array.isArray(data) ? data : []);
      } finally {
        if (mounted) setLoadingUsers(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setLawyerUserIdsDraft(Array.isArray(settings?.lawyerUserIds) ? settings.lawyerUserIds : []);
  }, [settings?.lawyerUserIds]);

  const toggleLawyer = (id) => {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return;
    setLawyerUserIdsDraft((prev) => {
      const exists = prev.includes(normalizedId);
      if (exists) return prev.filter((item) => item !== normalizedId);
      return [...prev, normalizedId];
    });
  };

  const save = async () => {
    setSaving(true);
    const result = await saveSettings({ lawyerUserIds: lawyerUserIdsDraft });
    setSaving(false);
    if (!result.success) {
      alert("Не вдалося зберегти налаштування юридичного модуля.");
      return;
    }
    alert("Налаштування збережено.");
  };

  return (
    <div className="space-y-4">
      <div className={`${cardClass} overflow-hidden`}>
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 text-white">
          <div className="flex items-center gap-2">
            <Scale size={20} />
            <h2 className="text-lg font-semibold">Базові налаштування юридичного модуля</h2>
          </div>
          <p className="mt-1 text-sm text-indigo-100">
            Оберіть акаунти юристів: їм приходитимуть сповіщення і вони матимуть доступ до Legal TODO.
          </p>
        </div>

        <div className="space-y-4 p-5">
          {settingsLoading || loadingUsers ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
              Завантаження налаштувань...
            </div>
          ) : (
            <div className="space-y-2">
              {users.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                  Не знайдено жодного акаунту.
                </div>
              ) : (
                users.map((account) => {
                  const id = String(account?.id || account?.uid || "").trim();
                  const checked = lawyerUserIdsDraft.includes(id);
                  return (
                    <label
                      key={id || Math.random().toString(36).slice(2)}
                      className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 hover:border-indigo-300"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {account?.displayName || account?.name || account?.email || "Без імені"}
                        </p>
                        <p className="truncate text-xs text-slate-500">{account?.email || "—"}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleLawyer(id)}
                        disabled={!canEdit || !id}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </label>
                  );
                })
              )}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Обрано юристів: {lawyerUserIdsDraft.length}
          </div>

          <button
            type="button"
            onClick={save}
            disabled={!canEdit || saving}
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? "Збереження..." : "Зберегти налаштування"}
          </button>
        </div>
      </div>
    </div>
  );
}

function KanbanCard({ task, onOpen, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={() => onOpen(task)}
      className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-[13px] font-semibold text-slate-900">{task.title}</p>
        <PriorityBadge priority={task.priority} compact />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <DeadlinePill value={task.preferredDeadline} compact />
        {Array.isArray(task.attachments) && task.attachments.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
            <Paperclip size={10} />
            {task.attachments.length}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-center gap-1 border-t border-slate-100 pt-1.5 text-[10px] text-slate-400">
        <User2 size={11} />
        <span className="truncate">{task.createdByName || "—"}</span>
      </div>
    </div>
  );
}

function KanbanBoard({ tasks, onOpen, onDrop, onDragStart, dragOverStatus, setDragOverStatus }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {LEGAL_STATUSES.map((column) => {
        const columnTasks = tasks
          .filter((task) => !task.archived && task.status === column.value)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
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
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">{columnTasks.length}</span>
            </div>

            <div className="flex-1 space-y-2.5 p-2.5">
              {columnTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                  Перетягніть сюди задачу
                </div>
              ) : (
                columnTasks.map((task) => (
                  <KanbanCard key={task.id} task={task} onOpen={onOpen} onDragStart={onDragStart} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskDetailModal({ task, onClose, legal, canManage, canMessageLegal = false }) {
  const { moveTaskStatus, removeTask, updateTask, addTaskComment } = legal;
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [deadlineDraft, setDeadlineDraft] = useState(task?.preferredDeadline || "");
  const deadlineInputRef = useRef(null);
  const [messageDraft, setMessageDraft] = useState("");

  if (!task) return null;

  const isArchived = Boolean(task.archived);
  const currentStatus = isArchived ? LEGAL_ARCHIVED_STATUS.value : task.status;

  const handleMove = async (nextStatus) => {
    setBusy(true);
    await moveTaskStatus(task, nextStatus, { comment: comment.trim() });
    setBusy(false);
    setComment("");
    onClose();
  };

  const handleDelete = async () => {
    if (!window.confirm("Видалити задачу безповоротно?")) return;
    setBusy(true);
    await removeTask(task.id);
    setBusy(false);
    onClose();
  };

  const handleDeadlineSave = async (nextDeadline) => {
    setBusy(true);
    const valueToSave = nextDeadline ?? deadlineDraft;
    await updateTask(task.id, {
      ...task,
      preferredDeadline: valueToSave || "",
      statusHistory: [
        ...(Array.isArray(task.statusHistory) ? task.statusHistory : []),
        {
          status: task.archived ? LEGAL_ARCHIVED_STATUS.value : task.status,
          by: "Юрист",
          byId: "",
          at: new Date().toISOString(),
          comment: valueToSave ? `Оновлено дедлайн: ${formatLegalDate(valueToSave)}` : "Дедлайн очищено",
        },
      ],
    });
    setBusy(false);
  };

  const openDeadlinePicker = () => {
    const input = deadlineInputRef.current;
    if (!input || !canManage || busy) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  };

  const handleDeadlineChange = async (event) => {
    const nextValue = String(event?.target?.value || "");
    setDeadlineDraft(nextValue);
    await handleDeadlineSave(nextValue);
  };

  const handleSendMessageToLegal = async () => {
    const text = String(messageDraft || "").trim();
    if (!text) return;
    setBusy(true);
    const result = await addTaskComment(task, text, {
      notifyRole: "legal",
      actionTab: LEGAL_PROCESS_TAB,
    });
    setBusy(false);
    if (!result.success) {
      alert("Не вдалося надіслати повідомлення юристу.");
      return;
    }
    setMessageDraft("");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 text-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Scale size={18} />
              <h3 className="truncate text-lg font-semibold">{task.title}</h3>
            </div>
            <p className="mt-0.5 text-xs text-indigo-100">
              Від {task.createdByName || "—"} · {formatLegalDateTime(task.createdAt)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-indigo-100 hover:bg-white/10 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} archived={task.archived} />
            <PriorityBadge priority={task.priority} />
            <DeadlinePill value={deadlineDraft || task.preferredDeadline} />
            {canManage ? (
              <>
                <input
                  ref={deadlineInputRef}
                  type="date"
                  className="sr-only"
                  value={deadlineDraft || ""}
                  onChange={handleDeadlineChange}
                />
                <button
                  type="button"
                  onClick={openDeadlinePicker}
                  disabled={busy}
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50"
                  title="Змінити дедлайн"
                >
                  <CalendarDays size={14} />
                </button>
              </>
            ) : null}
            {task.restaurantName ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{task.restaurantName}</span>
            ) : null}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Опис</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{task.description || "—"}</p>
          </div>

          {task.contact ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Контакт</p>
              <p className="mt-1 text-sm text-slate-700">{task.contact}</p>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Коментарі</p>
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              {(Array.isArray(task.threadMessages) ? task.threadMessages : []).length === 0 ? (
                <p className="text-xs text-slate-400">Повідомлень поки немає.</p>
              ) : (
                (task.threadMessages || []).map((entry) => (
                  <div key={entry.id || `${entry.at}_${entry.by}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                    <p className="text-sm text-slate-700">{entry.text}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {entry.by || "Користувач"} · {formatLegalDateTime(entry.at)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {canMessageLegal && !canManage ? (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-500">Написати юристу</p>
              <textarea
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                rows={3}
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value)}
                placeholder="Додайте уточнення або коментар до задачі"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  disabled={busy || !String(messageDraft || "").trim()}
                  onClick={handleSendMessageToLegal}
                  className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  Надіслати юристу
                </button>
              </div>
            </div>
          ) : null}

          {Array.isArray(task.attachments) && task.attachments.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Файли</p>
              <AttachmentChips attachments={task.attachments} />
            </div>
          ) : null}

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <History size={13} />
              Історія
            </p>
            <div className="space-y-2">
              {(Array.isArray(task.statusHistory) ? task.statusHistory : []).map((entry, idx) => {
                const meta = getLegalStatusMeta(entry.status);
                return (
                  <div key={idx} className="flex gap-2.5">
                    <div className="flex flex-col items-center">
                      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                      {idx < task.statusHistory.length - 1 ? <span className="w-px flex-1 bg-slate-200" /> : null}
                    </div>
                    <div className="pb-1">
                      <p className="text-sm font-medium text-slate-700">{meta.label}</p>
                      {entry.comment ? <p className="text-xs text-slate-500">{entry.comment}</p> : null}
                      <p className="text-[11px] text-slate-400">
                        {entry.by} · {formatLegalDateTime(entry.at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {canManage ? (
          <div className="border-t border-slate-200 bg-slate-50 p-4">
            <input
              className={`${inputClass} mt-0`}
              placeholder="Коментар до зміни статусу (необовʼязково)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {LEGAL_STATUSES.filter((status) => status.value !== currentStatus).map((status) => (
                <button
                  key={status.value}
                  type="button"
                  disabled={busy}
                  onClick={() => handleMove(status.value)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition hover:brightness-95 disabled:opacity-50 ${status.color}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                  {status.short}
                </button>
              ))}
              {isArchived ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleMove("final")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-700 hover:brightness-95 disabled:opacity-50"
                >
                  <ArchiveRestore size={14} />
                  Повернути з архіву
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleMove(LEGAL_ARCHIVED_STATUS.value)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:brightness-95 disabled:opacity-50"
                >
                  <Archive size={14} />
                  В архів
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={handleDelete}
                className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                <Trash2 size={14} />
                Видалити
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TodoView({ user, legal }) {
  const { tasks, loading, settings } = legal;
  const [view, setView] = useState("kanban");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [showArchive, setShowArchive] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [archiveDragOver, setArchiveDragOver] = useState(false);
  const draggedTaskRef = useRef(null);

  const currentUserId = String(user?.uid || user?.id || user?.userId || user?.email || "").trim();
  const selectedLawyerIds = Array.isArray(settings?.lawyerUserIds)
    ? settings.lawyerUserIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const canManage = isLegalUser(user) || selectedLawyerIds.includes(currentUserId);

  const filteredActive = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (task.archived) return false;
      if (priorityFilter && task.priority !== priorityFilter) return false;
      if (!term) return true;
      return (
        String(task.title || "").toLowerCase().includes(term) ||
        String(task.description || "").toLowerCase().includes(term) ||
        String(task.createdByName || "").toLowerCase().includes(term)
      );
    });
  }, [tasks, search, priorityFilter]);

  const archivedTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.archived)
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))),
    [tasks]
  );

  const handleDragStart = (event, task) => {
    draggedTaskRef.current = task;
    event.dataTransfer.effectAllowed = "move";
    try {
      event.dataTransfer.setData("text/plain", String(task.id));
    } catch {
      // ignore
    }
  };

  const handleDropToStatus = async (event, nextStatus) => {
    const task = draggedTaskRef.current;
    draggedTaskRef.current = null;
    if (!task || !canManage) return;
    if (!task.archived && task.status === nextStatus) return;
    await legal.moveTaskStatus(task, nextStatus, {});
  };

  const handleDropToArchive = async (event) => {
    event.preventDefault();
    setArchiveDragOver(false);
    const task = draggedTaskRef.current;
    draggedTaskRef.current = null;
    if (!task || !canManage || task.archived) return;
    await legal.moveTaskStatus(task, LEGAL_ARCHIVED_STATUS.value, {});
  };

  const stats = useMemo(() => {
    const map = { received: 0, in_progress: 0, partner_approval: 0, final: 0 };
    tasks.forEach((task) => {
      if (task.archived) return;
      if (map[task.status] !== undefined) map[task.status] += 1;
    });
    return map;
  }, [tasks]);

  return (
    <div className="space-y-5">
      <div className={`${cardClass} overflow-hidden`}>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white">
              <Scale size={22} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Legal TODO</h2>
              <p className="text-sm text-slate-500">Керування юридичними задачами</p>
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
            {LEGAL_STATUSES.map((status) => (
              <span
                key={status.value}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${status.color}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                {status.short}: {stats[status.value] || 0}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="w-48 rounded-xl border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="Пошук задач..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="">Усі пріоритети</option>
              {LEGAL_PRIORITIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!canManage ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          У вас немає прав керувати задачами — доступний лише перегляд. Зміна статусів доступна співробітникам юридичного відділу.
        </div>
      ) : null}

      {loading ? (
        <div className={`${cardClass} px-6 py-12 text-center text-sm text-slate-400`}>Завантаження задач...</div>
      ) : view === "kanban" ? (
        <KanbanBoard
          tasks={filteredActive}
          onOpen={setSelectedTask}
          onDrop={handleDropToStatus}
          onDragStart={handleDragStart}
          dragOverStatus={dragOverStatus}
          setDragOverStatus={setDragOverStatus}
        />
      ) : (
        <TaskRowsTable
          title="Активні задачі"
          tasks={filteredActive}
          emptyLabel="Немає активних задач."
          onRowClick={setSelectedTask}
          draggable={canManage}
          onDragStart={handleDragStart}
        />
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
          Архів ({archivedTasks.length})
          <span className="text-xs font-normal text-slate-400">{showArchive ? "сховати" : "показати"}</span>
        </button>
        <span className="hidden text-xs text-slate-400 sm:block">Перетягніть задачу сюди, щоб архівувати</span>
      </div>

      {showArchive ? (
        <TaskRowsTable
          title="Архівні задачі"
          tasks={archivedTasks}
          emptyLabel="В архіві задач поки немає."
          onRowClick={setSelectedTask}
          rowTone="hover:bg-slate-50"
        />
      ) : null}

      {selectedTask ? (
        <TaskDetailModal
          task={tasks.find((t) => t.id === selectedTask.id) || selectedTask}
          onClose={() => setSelectedTask(null)}
          legal={legal}
          canManage={canManage}
        />
      ) : null}
    </div>
  );
}

export default function LegalModule({ topTab, restaurants = [], user }) {
  const legal = useLegalTasks(user);

  if (!isLegalApiEnabled()) {
    return (
      <div className={`${cardClass} px-6 py-12 text-center`}>
        <Scale size={32} className="mx-auto mb-3 text-slate-300" />
        <p className="text-sm text-slate-500">
          Модуль юриста потребує підключення до бази даних (API). Зверніться до адміністратора.
        </p>
      </div>
    );
  }

  const tabKey = String(topTab || "").toLowerCase();
  if (tabKey.includes("settingslegal") || tabKey.includes("modulemainsettingslegal")) {
    return <LegalSettingsView user={user} legal={legal} />;
  }
  if (tabKey.includes("process") || tabKey.includes("todo")) {
    return <TodoView user={user} legal={legal} />;
  }
  return <RequestView user={user} restaurants={restaurants} legal={legal} />;
}
