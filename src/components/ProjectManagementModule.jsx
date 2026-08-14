import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Filter,
  Flag,
  LayoutList,
  Plus,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import { getUsers } from "../firebase/users";
import {
  createCollectionItemApi,
  isCollectionsApiEnabled,
  listCollectionItemsApi,
  updateCollectionItemApi,
} from "../api/collectionsApi";

const COLLECTION = "projectTasks";
const LOCAL_KEY = "lucia_project_tasks";
const STATUS = [
  { id: "todo", label: "До виконання", color: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  { id: "in_progress", label: "В роботі", color: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  { id: "review", label: "На перевірці", color: "bg-blue-100 text-blue-800", dot: "bg-blue-500" },
  { id: "done", label: "Виконано", color: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
];
const PRIORITY = [
  { id: "low", label: "Низький", color: "text-slate-500" },
  { id: "normal", label: "Звичайний", color: "text-blue-600" },
  { id: "high", label: "Високий", color: "text-orange-600" },
  { id: "critical", label: "Критичний", color: "text-red-600" },
];
const DEPARTMENTS = ["Власник", "Керівництво", "Експлуатація", "Юридичний відділ", "Фінанси", "Маркетинг", "HR"];
const today = () => new Date().toISOString().slice(0, 10);
const displayName = (user) => String(user?.displayName || user?.name || user?.fullName || user?.email || "Без імені").trim();
const idOf = (user) => String(user?.id || user?.uid || user?.userId || user?.email || "").trim();
const formatDate = (value) => value ? new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`)) : "—";
const daysBetween = (start, end) => Math.max(1, Math.round((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000) + 1);
const isLate = (task) => task.status !== "done" && task.dueDate && new Date(`${task.dueDate}T23:59:59`) < new Date();
const formatDuration = (hours) => hours < 24 ? `${Math.max(1, Math.round(hours))} год` : `${Math.round(hours / 24)} дн`;
const readLocalTasks = () => {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
};

const initialForm = { title: "", description: "", targetType: "person", assigneeId: "", assigneeName: "", department: "", startDate: today(), dueDate: "", priority: "normal" };

function StatusBadge({ status }) {
  const meta = STATUS.find((item) => item.id === status) || STATUS[0];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.color}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>;
}

function TaskComposer({ users, user, onClose, onCreate }) {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const people = users.filter((row) => idOf(row) !== idOf(user));
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.dueDate || (form.targetType === "person" ? !form.assigneeId : !form.department)) return;
    setSaving(true);
    await onCreate({ ...form, title: form.title.trim(), description: form.description.trim(), createdBy: idOf(user), createdByName: displayName(user) });
    setSaving(false);
  };
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 sm:p-8" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form onSubmit={submit} className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="mb-6 flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Нова задача</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Сформулюйте результат</h2><p className="mt-1 text-sm text-slate-500">Адресат отримає задачу разом із дедлайном і контекстом.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Закрити"><X size={20} /></button></div>
      <label className="mb-4 block text-sm font-semibold text-slate-700">Назва задачі<input autoFocus value={form.title} onChange={(event) => set("title", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" placeholder="Наприклад: Підготувати план закупівель на вересень" /></label>
      <label className="mb-5 block text-sm font-semibold text-slate-700">Що потрібно зробити?<textarea value={form.description} onChange={(event) => set("description", event.target.value)} className="mt-1.5 min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" placeholder="Опишіть очікуваний результат, критерії готовності або важливі посилання" /></label>
      <div className="mb-5 grid gap-4 sm:grid-cols-2"><div><p className="mb-2 text-sm font-semibold text-slate-700">Кому поставити?</p><div className="flex rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => set("targetType", "person")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${form.targetType === "person" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}>Конкретній людині</button><button type="button" onClick={() => set("targetType", "department")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${form.targetType === "department" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}>Департаменту</button></div></div><div><label className="text-sm font-semibold text-slate-700">{form.targetType === "person" ? "Виконавець" : "Департамент"}<select value={form.targetType === "person" ? form.assigneeId : form.department} onChange={(event) => form.targetType === "person" ? setForm((current) => ({ ...current, assigneeId: event.target.value, assigneeName: displayName(people.find((row) => idOf(row) === event.target.value)) })) : set("department", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-indigo-500"><option value="">Оберіть адресата</option>{form.targetType === "person" ? people.map((row) => <option key={idOf(row)} value={idOf(row)}>{displayName(row)}</option>) : DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}</select></label></div></div>
      <div className="mb-5 grid gap-4 sm:grid-cols-3"><label className="text-sm font-semibold text-slate-700">Початок<input type="date" value={form.startDate} onChange={(event) => set("startDate", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label><label className="text-sm font-semibold text-slate-700">Дедлайн<input type="date" min={form.startDate} value={form.dueDate} onChange={(event) => set("dueDate", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal" /></label><label className="text-sm font-semibold text-slate-700">Пріоритет<select value={form.priority} onChange={(event) => set("priority", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal">{PRIORITY.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div>
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-5"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Скасувати</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-60"><Plus size={17} />{saving ? "Зберігаємо..." : "Поставити задачу"}</button></div>
    </form>
  </div>;
}

function Gantt({ tasks }) {
  const visible = tasks.filter((task) => task.startDate && task.dueDate).slice(0, 8);
  if (!visible.length) return <div className="flex h-44 items-center justify-center text-sm text-slate-400">Задачі з датами з'являться тут</div>;
  const minDate = new Date(Math.min(...visible.map((task) => new Date(`${task.startDate}T12:00:00`))));
  const maxDate = new Date(Math.max(...visible.map((task) => new Date(`${task.dueDate}T12:00:00`))));
  const total = Math.max(1, Math.round((maxDate - minDate) / 86400000) + 1);
  return <div className="overflow-x-auto"><div className="min-w-[620px] space-y-2">{visible.map((task) => { const start = Math.max(0, Math.round((new Date(`${task.startDate}T12:00:00`) - minDate) / 86400000)); const width = daysBetween(task.startDate, task.dueDate); return <div key={task.id} className="grid grid-cols-[170px_1fr] items-center gap-3"><div className="truncate text-xs font-semibold text-slate-600" title={task.title}>{task.title}</div><div className="relative h-7 rounded-md bg-slate-50"><div className={`absolute top-1 h-5 rounded-md ${task.status === "done" ? "bg-emerald-400" : "bg-indigo-500"}`} style={{ left: `${(start / total) * 100}%`, width: `${Math.max(8, (width / total) * 100)}%` }} /><span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-500">{formatDate(task.startDate)} — {formatDate(task.dueDate)}</span></div></div>; })}</div></div>;
}

export default function ProjectManagementModule({ topTab = "newtask", user }) {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [filter, setFilter] = useState("all");
  const isReports = String(topTab).toLowerCase().includes("report");

  const load = async () => {
    setLoading(true);
    try {
      const [remote, people] = await Promise.all([isCollectionsApiEnabled() ? listCollectionItemsApi(COLLECTION) : Promise.resolve(readLocalTasks()), getUsers().catch(() => [])]);
      setTasks((Array.isArray(remote) ? remote : []).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
      setUsers(Array.isArray(people) ? people : []);
    } catch { setTasks(readLocalTasks()); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const createTask = async (form) => {
    const task = { ...form, id: `task_${Date.now()}`, status: "todo", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), target: form.targetType === "person" ? form.assigneeName : form.department };
    try { if (isCollectionsApiEnabled()) { const id = await createCollectionItemApi(COLLECTION, task); task.id = id || task.id; } } catch { /* keep the task locally when the API is temporarily unavailable */ }
    const next = [task, ...tasks]; setTasks(next); localStorage.setItem(LOCAL_KEY, JSON.stringify(next)); setShowComposer(false);
  };
  const updateStatus = async (task, status) => {
    const nextTask = { ...task, status, updatedAt: new Date().toISOString() }; const next = tasks.map((item) => item.id === task.id ? nextTask : item); setTasks(next); localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    try { if (isCollectionsApiEnabled()) await updateCollectionItemApi(COLLECTION, task.id, { status, updatedAt: nextTask.updatedAt }); } catch { /* optimistic UI remains usable */ }
  };
  const activeTasks = tasks.filter((task) => filter === "all" || task.status === filter || (filter === "late" && isLate(task)));
  const stats = useMemo(() => ({ total: tasks.length, done: tasks.filter((task) => task.status === "done").length, late: tasks.filter(isLate).length, open: tasks.filter((task) => task.status !== "done").length }), [tasks]);
  const averageCompletionTime = useMemo(() => {
    const completed = tasks
      .filter((task) => task.status === "done" && task.createdAt && task.updatedAt)
      .map((task) => (new Date(task.updatedAt) - new Date(task.createdAt)) / 3600000)
      .filter((hours) => Number.isFinite(hours) && hours >= 0);
    return completed.length ? formatDuration(completed.reduce((sum, hours) => sum + hours, 0) / completed.length) : "—";
  }, [tasks]);
  const byAssignee = useMemo(() => Object.values(tasks.reduce((result, task) => { const key = task.target || "Без адресата"; result[key] = result[key] || { name: key, total: 0, done: 0, late: 0 }; result[key].total += 1; if (task.status === "done") result[key].done += 1; if (isLate(task)) result[key].late += 1; return result; }, {})).sort((a, b) => b.total - a.total), [tasks]);

  return <section className="min-h-[680px] rounded-2xl bg-[#f5f7fb] p-4 text-slate-900 sm:p-6"><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-600"><CircleDot size={14} /> Центр управління</div><h1 className="text-3xl font-black tracking-tight text-slate-950">Задачі команди</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Одна картина для рішень: хто відповідає, що блокує рух і де потрібна увага.</p></div><div className="flex items-center gap-2"><button type="button" onClick={load} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 hover:text-indigo-600" title="Оновити"><RefreshCw size={18} /></button><button type="button" onClick={() => setShowComposer(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700"><Plus size={18} /> Нова задача</button></div></div>
    <div className="mb-6 grid gap-3 sm:grid-cols-4"><div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Всього задач</p><p className="mt-2 text-2xl font-black">{stats.total}</p></div><div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">В роботі</p><p className="mt-2 text-2xl font-black text-amber-600">{stats.open}</p></div><div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Виконано</p><p className="mt-2 text-2xl font-black text-emerald-600">{stats.done}</p></div><div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Потрібна увага</p><p className="mt-2 text-2xl font-black text-rose-600">{stats.late}</p></div></div>
    {isReports ? <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]"><div className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold">Навантаження за адресатами</h2><p className="mt-1 text-xs text-slate-400">Розподіл задач і прострочень</p></div><BarChart3 className="text-indigo-500" size={20} /></div><div className="space-y-4">{byAssignee.length ? byAssignee.map((row) => <div key={row.name}><div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{row.name}</span><span className="text-slate-400">{row.done}/{row.total} виконано</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${(row.done / row.total) * 100}%` }} /></div>{row.late > 0 && <p className="mt-1 text-xs font-semibold text-rose-600">{row.late} прострочено</p>}</div>) : <p className="py-10 text-center text-sm text-slate-400">Дані з'являться після постановки задач.</p>}</div></div><div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-bold">Стан портфеля</h2><div className="mt-5 space-y-3">{STATUS.map((status) => { const count = tasks.filter((task) => task.status === status.id).length; return <div key={status.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3"><span className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2 w-2 rounded-full ${status.dot}`} />{status.label}</span><span className="font-black">{count}</span></div>; })}</div><div className="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-500"><Clock3 size={16} className="mr-2 inline text-indigo-500" />Середній час виконання: <strong className="text-slate-900">{averageCompletionTime}</strong></div></div></div> : <><div className="mb-5 grid gap-5 lg:grid-cols-[1.35fr_1fr]"><div className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold">План виконання</h2><p className="mt-1 text-xs text-slate-400">Гант за найближчими задачами</p></div><CalendarDays className="text-indigo-500" size={20} /></div><Gantt tasks={tasks} /></div><div className="rounded-xl border border-slate-200 bg-slate-950 p-5 text-white"><p className="text-xs font-bold uppercase tracking-wider text-indigo-300">Фокус керівника</p><h2 className="mt-2 text-xl font-bold">Не втратити важливе</h2><p className="mt-2 text-sm leading-6 text-slate-300">Прострочені задачі та високі пріоритети зібрані в одному списку для швидкого рішення.</p><button type="button" onClick={() => setFilter("late")} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-900">Показати прострочені <ChevronRight size={16} /></button></div></div><div className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><LayoutList size={18} className="text-indigo-500" /><h2 className="font-bold">Список задач</h2></div><div className="flex items-center gap-2"><Filter size={15} className="text-slate-400" /><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold"><option value="all">Усі задачі</option>{STATUS.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}<option value="late">Прострочені</option></select></div></div>{loading ? <div className="py-12 text-center text-sm text-slate-400">Завантаження портфеля...</div> : activeTasks.length ? <div className="space-y-2">{activeTasks.map((task) => <div key={task.id} className="grid gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/30 sm:grid-cols-[1fr_auto_auto]"><div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{task.title}</span><StatusBadge status={task.status} />{task.priority === "critical" && <Flag size={14} className="text-red-500" />}</div><p className="mt-1 text-xs text-slate-500">{task.targetType === "department" ? "Департамент" : "Виконавець"}: {task.target || "—"} · Дедлайн: {formatDate(task.dueDate)}</p></div><span className={`self-center text-xs font-bold ${isLate(task) ? "text-rose-600" : "text-slate-400"}`}>{isLate(task) ? "Прострочено" : task.status === "done" ? "Завершено" : "В терміні"}</span><select value={task.status} onChange={(event) => updateStatus(task, event.target.value)} className="self-center rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold"><option value="todo">До виконання</option><option value="in_progress">В роботі</option><option value="review">На перевірці</option><option value="done">Виконано</option></select></div>)}</div> : <div className="rounded-xl bg-slate-50 py-12 text-center"><CheckCircle2 className="mx-auto text-indigo-400" size={28} /><p className="mt-2 text-sm font-semibold text-slate-600">Поки що задач немає</p><p className="mt-1 text-xs text-slate-400">Створіть першу задачу для команди.</p></div>}</div></>}
    {showComposer && <TaskComposer users={users} user={user} onClose={() => setShowComposer(false)} onCreate={createTask} />}
  </section>;
}