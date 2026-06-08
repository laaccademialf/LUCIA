import { useEffect, useState, useMemo, useCallback } from "react";
import { Zap, Save, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Settings, Bug, Building2, Eye, EyeOff } from "lucide-react";
import {
  getVikSoftSettings,
  saveVikSoftSettings,
  testVikSoftConnection,
  getVikSoftDebug,
  getVikSoftApiClientContext,
} from "../api/vikSoftSettingsApi";

const baseInput =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition";
const btnPrimary =
  "inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition";
const btnGhost =
  "inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition";

// Лишає тільки origin (scheme+host+port), якщо вставили повний URL логіну.
const normalizeApiBase = (raw) => {
  let s = String(raw || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`.replace(/\/+$/, "");
  } catch {
    return s.replace(/\/+api\/.*$/i, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
};

const Section = ({ icon, title, subtitle, children }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <header className="mb-3 flex items-start gap-3">
      <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">{icon}</div>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
    </header>
    {children}
  </section>
);

const StatusBadge = ({ status, text }) => {
  const map = {
    ok: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    error: { cls: "bg-rose-50 text-rose-700 border-rose-200", Icon: XCircle },
    warn: { cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: AlertTriangle },
    idle: { cls: "bg-slate-50 text-slate-600 border-slate-200", Icon: AlertTriangle },
  };
  const { cls, Icon } = map[status] || map.idle;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>
      <Icon size={14} />
      {text}
    </span>
  );
};

const UtilitiesManagementModule = ({ restaurants = [], onUpdateRestaurant }) => {
  // ---- API config ----
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [settingsError, setSettingsError] = useState("");
  const [savedInfo, setSavedInfo] = useState(null);
  const [effective, setEffective] = useState(null);
  const [apiBase, setApiBase] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [clientCtx, setClientCtx] = useState(() => getVikSoftApiClientContext());

  const loadSettings = useCallback(async () => {
    setLoadingSettings(true);
    setSettingsError("");
    setClientCtx(getVikSoftApiClientContext());
    try {
      const data = await getVikSoftSettings();
      setSavedInfo(data.saved || null);
      setEffective(data.effective || null);
      setApiBase(String(data.saved?.apiBase || data.effective?.apiBase || ""));
      setUser(String(data.saved?.user || data.effective?.user || ""));
      setPassword("");
      setPasswordChanged(false);
    } catch (e) {
      setSettingsError(e?.message || String(e));
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      await saveVikSoftSettings({
        apiBase: apiBase.trim(),
        user: user.trim(),
        // Передаємо password лише якщо користувач його змінив (інакше — сервер залишить попередній).
        password: passwordChanged ? password : undefined,
      });
      setSaveMsg("Збережено");
      setPassword("");
      setPasswordChanged(false);
      await loadSettings();
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (e) {
      setSaveMsg(`Помилка: ${e?.message || String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (useFormValues) => {
    setTesting(true);
    setTestResult(null);
    setClientCtx(getVikSoftApiClientContext());
    try {
      // Якщо useFormValues=true і пароль введено → тестуємо те, що в формі.
      // Інакше — тестуємо те, що збережено на сервері.
      const override = useFormValues && passwordChanged
        ? { apiBase: apiBase.trim(), user: user.trim(), password }
        : undefined;
      const r = await testVikSoftConnection(override);
      setTestResult(r);
    } catch (e) {
      setTestResult({ ok: false, error: e?.message || String(e) });
    } finally {
      setTesting(false);
    }
  };

  // ---- EIC codes per restaurant ----
  const [eicDraft, setEicDraft] = useState({}); // {restaurantId: string}
  const [eicSaving, setEicSaving] = useState({}); // {restaurantId: bool}
  const [eicMsg, setEicMsg] = useState({}); // {restaurantId: string}

  const getEicValue = (r) =>
    eicDraft[r.id] !== undefined ? eicDraft[r.id] : String(r.vikSoftEics || "");

  const handleEicChange = (rid, val) => {
    setEicDraft((p) => ({ ...p, [rid]: val }));
  };

  const handleEicSave = async (r) => {
    if (!onUpdateRestaurant) {
      setEicMsg((p) => ({ ...p, [r.id]: "Помилка: немає функції збереження" }));
      return;
    }
    setEicSaving((p) => ({ ...p, [r.id]: true }));
    setEicMsg((p) => ({ ...p, [r.id]: "" }));
    try {
      const nextValue = String(eicDraft[r.id] ?? r.vikSoftEics ?? "").trim();
      await onUpdateRestaurant(r.id, { ...r, vikSoftEics: nextValue });
      setEicMsg((p) => ({ ...p, [r.id]: "Збережено" }));
      setEicDraft((p) => {
        const copy = { ...p };
        delete copy[r.id];
        return copy;
      });
      setTimeout(() => setEicMsg((p) => ({ ...p, [r.id]: "" })), 2500);
    } catch (e) {
      setEicMsg((p) => ({ ...p, [r.id]: `Помилка: ${e?.message || String(e)}` }));
    } finally {
      setEicSaving((p) => ({ ...p, [r.id]: false }));
    }
  };

  // ---- Diagnostics ----
  const allEics = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const r of restaurants) {
      const v = String(r.vikSoftEics || "");
      const codes = v.split(/[,\s;]+/).map((s) => s.trim()).filter(Boolean);
      for (const c of codes) {
        if (seen.has(c)) continue;
        seen.add(c);
        list.push({ eic: c, restaurant: r.name });
      }
    }
    return list;
  }, [restaurants]);

  const [debugEic, setDebugEic] = useState("");
  const [debugDate, setDebugDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugOut, setDebugOut] = useState(null);
  const [debugErr, setDebugErr] = useState("");

  const handleDebug = async () => {
    setDebugLoading(true);
    setDebugErr("");
    setDebugOut(null);
    try {
      const out = await getVikSoftDebug({ eic: debugEic || undefined, date: debugDate || undefined });
      setDebugOut(out);
    } catch (e) {
      setDebugErr(e?.message || String(e));
    } finally {
      setDebugLoading(false);
    }
  };

  // ---- Render ----
  const sourceLabel = !effective
    ? null
    : effective.source === "runtime"
      ? <StatusBadge status="ok" text="Активне джерело: налаштування з UI" />
      : effective.source === "env"
        ? <StatusBadge status="warn" text="Активне джерело: змінні оточення (env)" />
        : <StatusBadge status="error" text="Креденшели не задано" />;

  return (
    <div className="space-y-4 p-4">
      {/* API config */}
      <Section
        icon={<Settings size={20} />}
        title="Підключення до Vik-Soft API"
        subtitle="Один обліковий запис обслуговує всі ресторани. Лічильники прив’язуються до закладу через EIC коди (секція нижче)."
      >
        {loadingSettings ? (
          <div className="text-sm text-slate-500">Завантаження…</div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {sourceLabel}
              {clientCtx?.resolvedBase ? (
                <span className="text-xs text-slate-500">
                  Backend API: {clientCtx.resolvedBase} ({clientCtx.source})
                </span>
              ) : null}
              {savedInfo?.updatedAt ? (
                <span className="text-xs text-slate-500">
                  Збережено: {new Date(savedInfo.updatedAt).toLocaleString("uk-UA")}
                </span>
              ) : null}
            </div>

            {settingsError ? (
              <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {settingsError}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">API URL</span>
                <input
                  className={baseInput}
                  type="text"
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  onBlur={(e) => setApiBase(normalizeApiBase(e.target.value))}
                  placeholder="http://194.183.165.59:8765"
                  spellCheck={false}
                />
                <span className="mt-1 block text-xs text-slate-400">
                  Лише адреса сервера (без /api/v1/login та параметрів).
                </span>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Логін</span>
                <input
                  className={baseInput}
                  type="text"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">
                  Пароль{" "}
                  {savedInfo?.hasPassword && !passwordChanged ? (
                    <span className="text-xs font-normal text-slate-400">(збережено)</span>
                  ) : null}
                </span>
                <div className="relative">
                  <input
                    className={`${baseInput} pr-10`}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordChanged(true);
                    }}
                    placeholder={savedInfo?.hasPassword ? "•••••••• (лишити старий)" : ""}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" className={btnPrimary} onClick={handleSave} disabled={saving || !apiBase.trim() || !user.trim()}>
                <Save size={16} />
                {saving ? "Збереження…" : "Зберегти"}
              </button>
              <button type="button" className={btnGhost} onClick={() => handleTest(true)} disabled={testing}>
                <RefreshCw size={16} className={testing ? "animate-spin" : ""} />
                {testing ? "Перевірка…" : "Перевірити підключення"}
              </button>
              {saveMsg ? (
                <span className={`text-sm ${saveMsg.startsWith("Помилка") ? "text-rose-600" : "text-emerald-600"}`}>
                  {saveMsg}
                </span>
              ) : null}
            </div>

            {testResult ? (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                  testResult.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {testResult.ok ? (
                  <>
                    <CheckCircle2 size={16} className="mr-1 inline" />
                    Підключення успішне. Токен: <code className="font-mono">{testResult.tokenPreview}</code>
                    {testResult.tokenTransport ? (
                      <> · транспорт: <code className="font-mono">{testResult.tokenTransport}</code></>
                    ) : null}
                    {testResult.loginMethod ? (
                      <> · логін: <code className="font-mono">{testResult.loginMethod}</code></>
                    ) : null}
                  </>
                ) : (
                  <>
                    <XCircle size={16} className="mr-1 inline" />
                    {testResult.stage === "backend_route"
                      ? `Бекенд платформи ще не оновлено: ${testResult.error}`
                      : `Не вдалося підключитись${testResult.stage ? ` (етап: ${testResult.stage})` : ""}: ${testResult.error}`}
                  </>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs opacity-80 hover:opacity-100">Деталі діагностики</summary>
                  <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-emerald-200">
{JSON.stringify(testResult, null, 2)}
                  </pre>
                </details>
              </div>
            ) : null}
          </>
        )}
      </Section>

      {/* EIC per restaurant */}
      <Section
        icon={<Zap size={20} />}
        title="EIC коди лічильників по ресторанах"
        subtitle="Перелічіть EIC коди (через кому) для кожного закладу. Один EIC = одна точка обліку у Vik-Soft."
      >
        {restaurants.length === 0 ? (
          <div className="text-sm text-slate-500">Немає ресторанів.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="py-2 pr-3 font-semibold text-slate-700">
                    <Building2 size={14} className="mr-1 inline" />
                    Ресторан
                  </th>
                  <th className="py-2 pr-3 font-semibold text-slate-700">EIC коди (через кому)</th>
                  <th className="w-40 py-2 font-semibold text-slate-700">Дії</th>
                </tr>
              </thead>
              <tbody>
                {restaurants.map((r) => {
                  const cur = getEicValue(r);
                  const dirty = eicDraft[r.id] !== undefined && String(eicDraft[r.id]) !== String(r.vikSoftEics || "");
                  const msg = eicMsg[r.id];
                  return (
                    <tr key={r.id} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-3 font-medium text-slate-900">{r.name || "—"}</td>
                      <td className="py-2 pr-3">
                        <textarea
                          rows={2}
                          className={`${baseInput} font-mono text-xs`}
                          value={cur}
                          placeholder="62Z00000000123U7, 62Z00000000456U2"
                          onChange={(e) => handleEicChange(r.id, e.target.value)}
                          spellCheck={false}
                        />
                        {msg ? (
                          <div className={`mt-1 text-xs ${msg.startsWith("Помилка") ? "text-rose-600" : "text-emerald-600"}`}>{msg}</div>
                        ) : null}
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          className={btnPrimary}
                          disabled={!dirty || !!eicSaving[r.id]}
                          onClick={() => handleEicSave(r)}
                        >
                          <Save size={14} />
                          {eicSaving[r.id] ? "…" : "Зберегти"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Debug / диагностика */}
      <Section
        icon={<Bug size={20} />}
        title="Діагностика API"
        subtitle="Тестовий запит — повертає raw payload з Vik-Soft (дерево обʼєктів + дані по EIC за добу). Корисно якщо парсинг не розпізнає поля."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">EIC (опційно)</span>
            {allEics.length ? (
              <select className={baseInput} value={debugEic} onChange={(e) => setDebugEic(e.target.value)}>
                <option value="">— тільки дерево обʼєктів —</option>
                {allEics.map((e) => (
                  <option key={e.eic} value={e.eic}>{e.eic} ({e.restaurant})</option>
                ))}
              </select>
            ) : (
              <input
                className={baseInput}
                type="text"
                value={debugEic}
                onChange={(e) => setDebugEic(e.target.value)}
                placeholder="EIC код"
                spellCheck={false}
              />
            )}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Дата</span>
            <input className={baseInput} type="date" value={debugDate} onChange={(e) => setDebugDate(e.target.value)} />
          </label>
          <div className="flex items-end">
            <button type="button" className={btnPrimary} disabled={debugLoading} onClick={handleDebug}>
              <RefreshCw size={16} className={debugLoading ? "animate-spin" : ""} />
              {debugLoading ? "Запит…" : "Виконати запит"}
            </button>
          </div>
        </div>

        {debugErr ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{debugErr}</div>
        ) : null}

        {debugOut ? (
          <pre className="mt-3 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-900 p-3 text-xs text-emerald-200">
{JSON.stringify(debugOut, null, 2)}
          </pre>
        ) : null}
      </Section>
    </div>
  );
};

export default UtilitiesManagementModule;
