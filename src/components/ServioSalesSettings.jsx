import { useEffect, useMemo, useState } from "react";
import {
  getServioSettings,
  saveServioSettings,
  testServioConnection,
  syncServioRestaurants,
  isServioApiEnabled,
} from "../api/servioSettingsApi";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

// Налаштування прямого підключення до бази Servio (MS SQL) та мапінг ресторанів.
export default function ServioSalesSettings({ restaurants = [] }) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState(1433);
  const [database, setDatabase] = useState("Loyalty");
  const [userLogin, setUserLogin] = useState("");
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [servioRestaurants, setServioRestaurants] = useState([]);
  const [mapping, setMapping] = useState({});
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const apiEnabled = isServioApiEnabled();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!apiEnabled) {
        setStatus("API не налаштовано (VITE_DATA_API_BASE_URL).");
        return;
      }
      setLoading(true);
      try {
        const res = await getServioSettings();
        if (cancelled) return;
        const saved = res?.saved || {};
        setHost(saved.host || "");
        setPort(Number(saved.port || 1433));
        setDatabase(saved.database || "Loyalty");
        setUserLogin(saved.user || "");
        setHasPassword(Boolean(saved.hasPassword));
        setServioRestaurants(Array.isArray(saved.restaurants) ? saved.restaurants : []);
        setMapping(saved.mapping && typeof saved.mapping === "object" ? saved.mapping : {});
        setStatus("");
      } catch (error) {
        if (!cancelled) setStatus(`Не вдалося завантажити налаштування: ${error?.message || error}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [apiEnabled]);

  const handleSave = async () => {
    setStatus("Збереження...");
    try {
      const payload = { host, port, database, user: userLogin, mapping };
      if (password) payload.password = password;
      await saveServioSettings(payload);
      setPassword("");
      setHasPassword((prev) => prev || Boolean(password));
      setStatus("Збережено");
    } catch (error) {
      setStatus(`Помилка збереження: ${error?.message || error}`);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setStatus("Перевірка підключення...");
    try {
      const override = { host, port, database, user: userLogin };
      if (password) override.password = password;
      const res = await testServioConnection(override);
      if (res?.ok) {
        setStatus(`Підключення успішне${res.version ? `: ${res.version}` : ""}`);
      } else {
        setStatus(`Помилка підключення: ${res?.error || "невідома"}`);
      }
    } catch (error) {
      setStatus(`Помилка підключення: ${error?.message || error}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setStatus("Завантаження довідника ресторанів Servio...");
    try {
      const list = await syncServioRestaurants();
      setServioRestaurants(list);
      setStatus(`Завантажено ресторанів: ${list.length}`);
    } catch (error) {
      setStatus(`Помилка завантаження довідника: ${error?.message || error}`);
    } finally {
      setSyncing(false);
    }
  };

  const servioOptions = useMemo(
    () => servioRestaurants
      .slice()
      .sort((a, b) => String(a.baseExternalName || "").localeCompare(String(b.baseExternalName || ""), "uk")),
    [servioRestaurants]
  );

  return (
    <div className="card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl">
      <h2 className="text-lg font-semibold">Налаштування продажів — підключення до Servio</h2>
      <p className="mt-1 text-sm text-slate-600">
        Пряме підключення до бази Servio (MS SQL) для завантаження факту продажів по годинах.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">IP / хост</span>
          <input className={inputClass} value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.0.1" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Порт</span>
          <input className={inputClass} type="number" value={port} onChange={(e) => setPort(Number(e.target.value) || 1433)} placeholder="1433" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">База даних</span>
          <input className={inputClass} value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="Loyalty" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Login</span>
          <input className={inputClass} value={userLogin} onChange={(e) => setUserLogin(e.target.value)} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Password</span>
          <input
            className={inputClass}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={hasPassword ? "•••••••• (збережено)" : ""}
            autoComplete="new-password"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          Зберегти
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {testing ? "Перевірка..." : "Перевірити підключення"}
        </button>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {syncing ? "Завантаження..." : "Завантажити довідник ресторанів"}
        </button>
      </div>

      {status && <p className="mt-3 text-sm text-slate-600">{status}</p>}

      {servioOptions.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-800">Відповідність ресторанів</h3>
          <p className="mt-1 text-xs text-slate-500">
            Зіставте кожен заклад LUCIA з рестораном Servio (BaseExternalID). Це значення підставляється в запит факту продажів.
          </p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left">Заклад LUCIA</th>
                  <th className="px-3 py-2 text-left">Ресторан Servio</th>
                </tr>
              </thead>
              <tbody>
                {restaurants.map((r) => (
                  <tr key={r.id} className="border-t border-slate-200">
                    <td className="px-3 py-2 text-slate-800">{r.name}</td>
                    <td className="px-3 py-2">
                      <select
                        value={String(mapping[String(r.id)] ?? "")}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [String(r.id)]: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900"
                      >
                        <option value="">— не зіставлено —</option>
                        {servioOptions.map((s) => (
                          <option key={s.baseExternalId} value={String(s.baseExternalId)}>
                            {s.baseExternalName} (ID {s.baseExternalId})
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Зберегти відповідність
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
