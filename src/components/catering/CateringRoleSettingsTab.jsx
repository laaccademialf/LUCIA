import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Users } from "lucide-react";
import { getUsers } from "../../firebase/users";

const baseInput = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

const normalizeText = (value) => String(value || "").trim().toLowerCase();

export default function CateringRoleSettingsTab({
  roleSettings,
  saving,
  onSaveRoleSetting,
  onDeleteRoleSetting,
}) {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const rows = await getUsers();
        if (!cancelled) {
          setUsers(Array.isArray(rows) ? rows : []);
        }
      } catch {
        if (!cancelled) {
          setUsers([]);
        }
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    };

    void loadUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  const settingsByUserId = useMemo(() => {
    const map = new Map();
    (Array.isArray(roleSettings) ? roleSettings : []).forEach((item) => {
      map.set(String(item.userId || ""), item);
    });
    return map;
  }, [roleSettings]);

  const visibleUsers = useMemo(() => {
    const q = normalizeText(query);
    const baseList = (Array.isArray(users) ? users : []).filter((item) => {
      const id = String(item?.id || "").trim();
      const email = String(item?.email || "").trim();
      return Boolean(id || email);
    });

    if (!q) return baseList;

    return baseList.filter((item) => {
      const haystack = [
        item.displayName,
        item.email,
        item.position,
        item.workRole,
      ].map(normalizeText).join(" ");
      return haystack.includes(q);
    });
  }, [users, query]);

  const activeManagersCount = useMemo(() => {
    return (Array.isArray(roleSettings) ? roleSettings : []).filter((item) => item.isManager).length;
  }, [roleSettings]);

  const activeServiceManagersCount = useMemo(() => {
    return (Array.isArray(roleSettings) ? roleSettings : []).filter((item) => item.isServiceManager).length;
  }, [roleSettings]);

  const handleToggle = async (userRow, fieldName) => {
    const userId = String(userRow?.id || "").trim();
    if (!userId) return;

    const current = settingsByUserId.get(userId);
    const nextValue = !Boolean(current?.[fieldName]);

    const payload = {
      id: String(current?.id || userId),
      userId,
      userName: String(userRow?.displayName || "").trim(),
      userEmail: String(userRow?.email || "").trim(),
      isManager: fieldName === "isManager" ? nextValue : Boolean(current?.isManager),
      isServiceManager: fieldName === "isServiceManager" ? nextValue : Boolean(current?.isServiceManager),
    };

    if (!payload.isManager && !payload.isServiceManager && current?.id) {
      await onDeleteRoleSetting(current.id);
      return;
    }

    await onSaveRoleSetting(payload);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Акаунти</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{visibleUsers.length}</p>
          <p className="mt-1 text-xs text-slate-500">Доступні для призначення ролей</p>
        </div>
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Менеджери</p>
          <p className="mt-2 text-2xl font-semibold text-indigo-900">{activeManagersCount}</p>
          <p className="mt-1 text-xs text-indigo-700">Призначені через акаунти</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Сервіс менеджери</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-900">{activeServiceManagersCount}</p>
          <p className="mt-1 text-xs text-emerald-700">Призначені через акаунти</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-indigo-600" />
            <h3 className="text-base font-semibold text-slate-900">Управління ролями кейтерингу</h3>
          </div>
          <div className="w-full sm:w-72">
            <input
              className={baseInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Пошук акаунта"
            />
          </div>
        </div>

        <p className="mb-3 text-xs text-slate-600">
          Оберіть ролі для акаунтів. Ці призначення використовуються в CRM для вибору менеджера та сервіс менеджера,
          і можуть бути основою для правил доступу.
        </p>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Акаунт</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Посада</th>
                <th className="px-3 py-2">Менеджер</th>
                <th className="px-3 py-2">Сервіс менеджер</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((userRow) => {
                const userId = String(userRow?.id || "").trim();
                const current = settingsByUserId.get(userId);
                return (
                  <tr key={userId || userRow.email} className="border-t border-slate-200">
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">{userRow.displayName || "Без імені"}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{userRow.email || "—"}</td>
                    <td className="px-3 py-3 text-slate-700">{userRow.position || userRow.workRole || "—"}</td>
                    <td className="px-3 py-3">
                      <label className="inline-flex items-center gap-2 text-slate-700">
                        <input
                          type="checkbox"
                          checked={Boolean(current?.isManager)}
                          disabled={saving}
                          onChange={() => {
                            void handleToggle(userRow, "isManager");
                          }}
                        />
                        <span>Так</span>
                      </label>
                    </td>
                    <td className="px-3 py-3">
                      <label className="inline-flex items-center gap-2 text-slate-700">
                        <input
                          type="checkbox"
                          checked={Boolean(current?.isServiceManager)}
                          disabled={saving}
                          onChange={() => {
                            void handleToggle(userRow, "isServiceManager");
                          }}
                        />
                        <span>Так</span>
                      </label>
                    </td>
                  </tr>
                );
              })}
              {!loadingUsers && visibleUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">Акаунтів не знайдено.</td>
                </tr>
              )}
              {loadingUsers && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                    <span className="inline-flex items-center gap-2"><Users size={14} /> Завантаження акаунтів...</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
