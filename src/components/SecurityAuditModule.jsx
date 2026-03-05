import { useEffect, useMemo, useState } from "react";
import { subscribeToAuditLogs } from "../firebase/audit";

const cardClass = "card p-4 sm:p-5 bg-white border border-slate-200 text-slate-900 shadow-xl";
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100";

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
    return Array.from(new Set(logs.map((item) => String(item.action || "").trim()).filter(Boolean))).sort();
  }, [logs]);

  const entityOptions = useMemo(() => {
    return Array.from(new Set(logs.map((item) => String(item.entityType || "").trim()).filter(Boolean))).sort();
  }, [logs]);

  const userOptions = useMemo(() => {
    return Array.from(
      new Set(
        logs
          .map((item) => String(item.actorName || item.actorEmail || item.actorId || "").trim())
          .filter(Boolean)
      )
    ).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const query = String(search || "").trim().toLowerCase();

    return logs.filter((item) => {
      if (actionFilter && String(item.action || "") !== actionFilter) return false;
      if (entityFilter && String(item.entityType || "") !== entityFilter) return false;

      const actor = String(item.actorName || item.actorEmail || item.actorId || "").trim();
      if (userFilter && actor !== userFilter) return false;

      if (!query) return true;

      const pool = [
        item.action,
        item.entityType,
        item.entityId,
        item.actorName,
        item.actorEmail,
        item.actorId,
        item.description,
        item.activeNav,
        item.topTab,
        item.restaurantId,
        item.restaurantName,
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
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Сутність</label>
            <select className={inputClass} value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
              <option value="">Усі</option>
              {entityOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
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
                  <td className="py-2 pr-3 whitespace-nowrap">{item.createdAt ? new Date(item.createdAt).toLocaleString("uk-UA") : "—"}</td>
                  <td className="py-2 pr-3">
                    <div className="font-semibold">{item.actorName || item.actorEmail || item.actorId || "—"}</div>
                    {(item.actorRole || item.actorWorkRole) && (
                      <div className="text-xs text-slate-500">{item.actorRole || ""} {item.actorWorkRole ? `· ${item.actorWorkRole}` : ""}</div>
                    )}
                  </td>
                  <td className="py-2 pr-3">{item.action || "—"}</td>
                  <td className="py-2 pr-3">
                    <div>{item.entityType || "—"}</div>
                    {item.entityId && <div className="text-xs text-slate-500">{item.entityId}</div>}
                  </td>
                  <td className="py-2 pr-3">
                    <div>{item.activeNav || "—"}</div>
                    {item.topTab && <div className="text-xs text-slate-500">{item.topTab}</div>}
                  </td>
                  <td className="py-2">{item.description || "—"}</td>
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
