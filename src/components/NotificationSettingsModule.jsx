import { useEffect, useState } from "react";
import {
  getNotificationSettings,
  saveNotificationSettings,
  testNotificationSettings,
} from "../api/notificationSettingsApi";

const initialForm = {
  provider: "graph",
  host: "smtp.office365.com",
  port: 587,
  secure: false,
  user: "",
  password: "",
  from: "",
  tenantId: "",
  clientId: "",
  clientSecret: "",
};

export const NotificationSettingsModule = () => {
  const [form, setForm] = useState(initialForm);
  const [hasPassword, setHasPassword] = useState(false);
  const [hasClientSecret, setHasClientSecret] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getNotificationSettings()
      .then((data) => {
        setForm((current) => ({
          ...current,
          provider: data.provider || current.provider,
          host: data.host || current.host,
          port: data.port || current.port,
          secure: Boolean(data.secure),
          user: data.user || "",
          from: data.from || data.user || "",
          tenantId: data.tenantId || "",
          clientId: data.clientId || "",
        }));
        setHasPassword(Boolean(data.hasPassword));
        setHasClientSecret(Boolean(data.hasClientSecret));
        setConfigured(Boolean(data.configured));
      })
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, []);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const data = await saveNotificationSettings(form);
      setConfigured(Boolean(data.configured));
      setHasPassword(true);
      update("password", "");
      setStatus("Налаштування пошти збережено в MariaDB.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const data = await testNotificationSettings(testRecipient || form.user);
      setStatus(`Тестовий лист надіслано на ${data.sentTo}.`);
    } catch (testError) {
      setError(testError.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="rounded-lg bg-white p-6 text-slate-600">Завантаження налаштувань...</div>;

  return (
    <div className="max-w-3xl rounded-lg bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Пошта платформи</h2>
          <p className="mt-1 text-sm text-slate-500">
            Дані Office 365 зберігаються в MariaDB у зашифрованому вигляді. Вони не потрапляють у frontend або env.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${configured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          {configured ? "Налаштовано" : "Не налаштовано"}
        </span>
      </div>

      {error && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {status && <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{status}</div>}

      <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700 md:col-span-2">
          Провайдер відправки
          <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.provider} onChange={(e) => update("provider", e.target.value)}>
            <option value="graph">Microsoft Graph OAuth2 (рекомендовано для Office 365)</option>
            <option value="smtp">SMTP</option>
          </select>
        </label>
        {form.provider === "graph" ? (
          <>
            <label className="text-sm font-medium text-slate-700">
              Microsoft Tenant ID
              <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.tenantId} onChange={(e) => update("tenantId", e.target.value)} required />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Application Client ID
              <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.clientId} onChange={(e) => update("clientId", e.target.value)} required />
            </label>
            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              Client Secret {hasClientSecret && <span className="font-normal text-slate-400">(залиште порожнім, щоб не змінювати)</span>}
              <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" type="password" value={form.clientSecret} onChange={(e) => update("clientSecret", e.target.value)} autoComplete="new-password" required={!hasClientSecret} />
            </label>
            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              From email
              <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" type="email" value={form.from} onChange={(e) => update("from", e.target.value)} placeholder="luci@lafamiglia.ua" autoComplete="email" required />
            </label>
          </>
        ) : null}
        {form.provider === "smtp" ? (
          <>
        <label className="text-sm font-medium text-slate-700">
          SMTP сервер
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.host} onChange={(e) => update("host", e.target.value)} placeholder="smtp.office365.com" required />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Порт
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" type="number" value={form.port} onChange={(e) => update("port", e.target.value)} required />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Поштова скринька / логін
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" type="email" value={form.user} onChange={(e) => update("user", e.target.value)} placeholder="platform@company.com" autoComplete="username" required />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Адреса відправника
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" type="email" value={form.from} onChange={(e) => update("from", e.target.value)} placeholder="platform@company.com" autoComplete="email" required />
        </label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">
          Пароль пошти {hasPassword && <span className="font-normal text-slate-400">(залиште порожнім, щоб не змінювати)</span>}
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" type="password" value={form.password} onChange={(e) => update("password", e.target.value)} autoComplete="new-password" required={!hasPassword} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
          <input type="checkbox" checked={form.secure} onChange={(e) => update("secure", e.target.checked)} />
          Використовувати SSL без STARTTLS (зазвичай для Office 365 залишити вимкненим)
        </label>
          </>
        ) : null}
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{saving ? "Збереження..." : "Зберегти налаштування"}</button>
        </div>
      </form>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <h3 className="font-semibold text-slate-900">Перевірка відправки</h3>
        <p className="mt-1 text-sm text-slate-500">Спочатку збережіть налаштування, потім надішліть тестовий лист.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input className="flex-1 rounded-lg border border-slate-300 px-3 py-2" type="email" value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} placeholder="Куди надіслати тестовий лист" />
          <button type="button" onClick={handleTest} disabled={saving || !configured} className="rounded-lg bg-slate-800 px-4 py-2 font-semibold text-white disabled:opacity-50">Надіслати тест</button>
        </div>
      </div>
    </div>
  );
};
