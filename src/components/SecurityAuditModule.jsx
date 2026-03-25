import { useEffect, useMemo, useState } from "react";
import { subscribeToAuditLogs } from "../firebase/audit";

const cardClass = "card p-4 sm:p-5 bg-white border border-slate-200 text-slate-900 shadow-xl";
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100";

const ACTION_LABELS = {
  login: "Вхід у платформу",
  logout: "Вихід із платформи",
  navigation_change: "Перехід між вкладками (старий запис)",
  asset_create: "Створення активу",
  asset_update: "Редагування активу",
  asset_delete: "Видалення активу",
  transfer_request_create: "Створення заявки на переміщення",
  transfer_request_approve: "Погодження переміщення",
  transfer_request_reject: "Відхилення переміщення",
  writeoff_request_create: "Створення заявки на списання",
  writeoff_request_approve: "Погодження списання",
  writeoff_request_reject: "Відхилення списання",
  employee_assignment_create: "Передача у користування",
  asset_inventory_session_start: "Запуск сесії інвентаризації",
  asset_inventory_session_end: "Завершення сесії інвентаризації",
  asset_inventory_session_delete: "Видалення сесії інвентаризації",
};

const ENTITY_LABELS = {
  auth: "Авторизація",
  asset: "Актив",
  transfer_request: "Заявка на переміщення",
  writeoff_request: "Заявка на списання",
  employee_usage: "Користування активом",
  asset_inventory_session: "Сесія інвентаризації",
  navigation: "Навігація",
};

const getActionLabel = (action) => ACTION_LABELS[String(action || "")] || String(action || "—");
const getEntityLabel = (entityType) => ENTITY_LABELS[String(entityType || "")] || String(entityType || "—");

const getFirstNonEmpty = (...values) => {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
};

const resolveAction = (item) => getFirstNonEmpty(item?.action, item?.action_name, item?.event, item?.event_name);

const resolveEntityType = (item) => getFirstNonEmpty(item?.entityType, item?.entity_type, item?.objectType, item?.object_type);

const resolveEntityId = (item) => getFirstNonEmpty(item?.entityId, item?.entity_id, item?.objectId, item?.object_id);

const resolveDescription = (item) => getFirstNonEmpty(item?.description, item?.details?.description, item?.message, item?.details?.message);

const resolveActiveNav = (item) => getFirstNonEmpty(item?.activeNav, item?.active_nav, item?.nav, item?.nav_id);

const resolveTopTab = (item) => getFirstNonEmpty(item?.topTab, item?.top_tab, item?.tab, item?.tab_id);

const resolveActorLabel = (item) => {
  const details = item?.details || {};
  return getFirstNonEmpty(
    item?.actorName,
    item?.actorEmail,
    item?.actorId,
    item?.actor_name,
    item?.actor_email,
    item?.actor_id,
    details?.actorName,
    details?.actorEmail,
    details?.actorId,
    details?.actor_name,
    details?.actor_email,
    details?.actor_id,
    item?.requestedByName,
    item?.approvedByName,
    item?.rejectedByName,
    item?.assignedByName,
    item?.changedByName,
    item?.requested_by_name,
    item?.approved_by_name,
    item?.rejected_by_name,
    item?.assigned_by_name,
    item?.changed_by_name,
    details?.requestedByName,
    details?.approvedByName,
    details?.rejectedByName,
    details?.assignedByName,
    details?.changedByName,
    details?.requested_by_name,
    details?.approved_by_name,
    details?.rejected_by_name,
    details?.assigned_by_name,
    details?.changed_by_name,
    item?.userName,
    item?.userEmail,
    item?.userId,
    item?.user_name,
    item?.user_email,
    item?.user_id
  );
};

const resolveCreatedAt = (item) => {
  const details = item?.details || {};
  const candidates = [
    item?.createdAt,
    item?.created_at,
    item?.timestamp,
    item?.time,
    item?.at,
    details?.lastLoginAt,
    item?.requestedAt,
    item?.approvedAt,
    item?.rejectedAt,
    item?.assignedAt,
    item?.changedAt,
    details?.requestedAt,
    details?.approvedAt,
    details?.rejectedAt,
    details?.assignedAt,
    details?.changedAt,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString("uk-UA");
    }
  }

  return "—";
};

export default function SecurityAuditModule({ user }) {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");

  useEffect(() => {
    const unsub = subscribeToAuditLogs(setLogs);
    return () => unsub?.();
  }, []);

  const actionOptions = useMemo(() => {
    return Array.from(new Set(logs.map((item) => resolveAction(item)).filter(Boolean))).sort();
  }, [logs]);

  const entityOptions = useMemo(() => {
    return Array.from(new Set(logs.map((item) => resolveEntityType(item)).filter(Boolean))).sort();
  }, [logs]);

  const userOptions = useMemo(() => {
    return Array.from(
      new Set(
        logs
          .map((item) => resolveActorLabel(item))
          .filter(Boolean)
      )
    ).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const query = String(search || "").trim().toLowerCase();

    return logs.filter((item) => {
      const action = resolveAction(item);
      const entityType = resolveEntityType(item);

      if (actionFilter && action !== actionFilter) return false;
      if (entityFilter && entityType !== entityFilter) return false;

      const actor = resolveActorLabel(item);
      if (userFilter && actor !== userFilter) return false;

      if (!query) return true;

      const pool = [
        action,
        entityType,
        resolveEntityId(item),
        item.actorName,
        item.actorEmail,
        item.actorId,
        item.actor_name,
        item.actor_email,
        item.actor_id,
        item.requestedByName,
        item.approvedByName,
        item.rejectedByName,
        item.assignedByName,
        item.changedByName,
        item.details?.actorName,
        item.details?.actorEmail,
        item.details?.actorId,
        item.requested_by_name,
        item.approved_by_name,
        item.rejected_by_name,
        item.assigned_by_name,
        item.changed_by_name,
        resolveDescription(item),
        resolveActiveNav(item),
        resolveTopTab(item),
        item.restaurantId,
        item.restaurantName,
        item.restaurant_id,
        item.restaurant_name,
      ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase())
        .join(" ");

      return pool.includes(query);
    });
  }, [logs, search, actionFilter, entityFilter, userFilter]);

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <h2 className="text-lg font-semibold">Аудит дій на платформі</h2>
        <p className="text-sm text-slate-600 mt-1">
          Логується хто, яку дію зробив, коли, у якому розділі та над якою сутністю.
        </p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-sm font-semibold text-slate-800">Пошук</label>
            <input
              className={inputClass}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Дія, користувач, сутність..."
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Дія</label>
            <select className={inputClass} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="">Усі</option>
              {actionOptions.map((item) => (
                <option key={item} value={item}>{getActionLabel(item)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Сутність</label>
            <select className={inputClass} value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
              <option value="">Усі</option>
              {entityOptions.map((item) => (
                <option key={item} value={item}>{getEntityLabel(item)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Користувач</label>
            <select className={inputClass} value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
              <option value="">Усі</option>
              {userOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-base font-semibold">Журнал</h3>
          <span className="text-xs text-slate-500">Записів: {filtered.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600 border-b border-slate-200">
                <th className="py-2 pr-3">Коли</th>
                <th className="py-2 pr-3">Користувач</th>
                <th className="py-2 pr-3">Дія</th>
                <th className="py-2 pr-3">Сутність</th>
                <th className="py-2 pr-3">Розділ</th>
                <th className="py-2">Опис</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{resolveCreatedAt(item)}</td>
                  <td className="py-2 pr-3">
                    <div className="font-semibold">{resolveActorLabel(item) || "Невідомий користувач"}</div>
                    {(item.actorRole || item.actorWorkRole || item.actor_role || item.actor_work_role) && (
                      <div className="text-xs text-slate-500">{item.actorRole || item.actor_role || ""} {(item.actorWorkRole || item.actor_work_role) ? `· ${item.actorWorkRole || item.actor_work_role}` : ""}</div>
                    )}
                  </td>
                  <td className="py-2 pr-3">{getActionLabel(resolveAction(item))}</td>
                  <td className="py-2 pr-3">
                    <div>{getEntityLabel(resolveEntityType(item))}</div>
                    {resolveEntityId(item) && <div className="text-xs text-slate-500">{resolveEntityId(item)}</div>}
                  </td>
                  <td className="py-2 pr-3">
                    <div>{resolveActiveNav(item) || "—"}</div>
                    {resolveTopTab(item) && <div className="text-xs text-slate-500">{resolveTopTab(item)}</div>}
                  </td>
                  <td className="py-2">{resolveDescription(item) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <p className="text-sm text-slate-500 mt-3">Поки немає записів за вибраними фільтрами.</p>
        )}
      </div>

      <div className="text-xs text-slate-400">
        Поточний користувач: {user?.displayName || user?.email || user?.uid || "—"}
      </div>
    </div>
  );
}
