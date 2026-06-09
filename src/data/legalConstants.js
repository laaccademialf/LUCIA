// Спільні константи та хелпери для Юридичного модуля (Запит до Юриста / Legal TODO).

export const LEGAL_NAV_ID = "ops-maintenance";
export const LEGAL_REQUEST_TAB = "legalrequest";
export const LEGAL_PROCESS_TAB = "legalprocess";

// Робочий конвеєр задачі. archived — окрема "колонка"/зона, рухається перетягуванням.
export const LEGAL_STATUSES = [
  {
    value: "received",
    label: "Отримано в роботу",
    short: "Отримано",
    color: "bg-sky-100 text-sky-700 border-sky-200",
    dot: "bg-sky-500",
    accent: "border-t-sky-400",
  },
  {
    value: "in_progress",
    label: "В процесі виконання",
    short: "В процесі",
    color: "bg-amber-100 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    accent: "border-t-amber-400",
  },
  {
    value: "partner_approval",
    label: "Погодження з партнером / контрагентом",
    short: "Погодження",
    color: "bg-violet-100 text-violet-700 border-violet-200",
    dot: "bg-violet-500",
    accent: "border-t-violet-400",
  },
  {
    value: "final",
    label: "Фінальна стадія",
    short: "Фінал",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    accent: "border-t-emerald-400",
  },
];

export const LEGAL_ARCHIVED_STATUS = {
  value: "archived",
  label: "Архів",
  short: "Архів",
  color: "bg-slate-200 text-slate-600 border-slate-300",
  dot: "bg-slate-400",
  accent: "border-t-slate-300",
};

export const ALL_LEGAL_STATUSES = [...LEGAL_STATUSES, LEGAL_ARCHIVED_STATUS];

const STATUS_ORDER = LEGAL_STATUSES.map((item) => item.value);

export const getLegalStatusMeta = (status) =>
  ALL_LEGAL_STATUSES.find((item) => item.value === status) || LEGAL_STATUSES[0];

export const getLegalStatusIndex = (status) => STATUS_ORDER.indexOf(status);

// Чи перехід "назад" по конвеєру (напр. погодження -> в процесі).
// Такі переходи не повинні породжувати сповіщення.
export const isBackwardTransition = (fromStatus, toStatus) => {
  if (toStatus === LEGAL_ARCHIVED_STATUS.value) return false;
  const fromIndex = getLegalStatusIndex(fromStatus);
  const toIndex = getLegalStatusIndex(toStatus);
  if (fromIndex < 0 || toIndex < 0) return false;
  return toIndex < fromIndex;
};

export const LEGAL_PRIORITIES = [
  { value: "low", label: "Низький", color: "bg-slate-100 text-slate-600" },
  { value: "normal", label: "Середній", color: "bg-blue-100 text-blue-700" },
  { value: "high", label: "Високий", color: "bg-orange-100 text-orange-700" },
  { value: "urgent", label: "Терміновий", color: "bg-rose-100 text-rose-700" },
];

export const getLegalPriorityMeta = (priority) =>
  LEGAL_PRIORITIES.find((item) => item.value === priority) || LEGAL_PRIORITIES[1];

// Визначення, чи користувач належить до юридичного відділу / має керувати TODO.
export const isLegalUser = (user) => {
  const roleValue = String(user?.role || "").toLowerCase();
  const workRoleValue = String(user?.workRole || "").toLowerCase();
  const terms = ["admin", "legal", "lawyer", "юрист", "правов", "юридич"];
  return terms.some((term) => roleValue.includes(term) || workRoleValue.includes(term));
};

const dateTimeFormatterUk = new Intl.DateTimeFormat("uk-UA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatterUk = new Intl.DateTimeFormat("uk-UA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const formatLegalDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatterUk.format(date);
};

export const formatLegalDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormatterUk.format(date);
};

// Кількість днів до дедлайну (від'ємне — прострочено).
export const getDeadlineDaysLeft = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};
