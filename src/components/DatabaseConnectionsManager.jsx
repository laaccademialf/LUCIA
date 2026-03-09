import { useMemo, useState } from "react";
import {
  addConnection,
  bootstrapFirebaseConnection,
  clearPrimaryConnection,
  deleteConnectionById,
  getConnections,
  getCurrentRuntimeConfig,
  getPrimaryConnectionId,
  migrateFirebaseData,
  migrateFirebaseToCustomData,
  setPrimaryConnectionById,
  testCustomConnection,
  testFirebaseConnection,
} from "../data/firebaseConnections";

const DEFAULT_COLLECTIONS = [
  "assets",
  "restaurants",
  "menuStructure",
  "users",
  "rolesPositions",
  "rolePermissions",
  "assetFields",
  "utilityMeters",
  "assetInventorySessions",
  "teamEmployees",
  "teamShiftEvents",
  "serviceRequests",
  "checklists",
];

const emptyFirebaseForm = {
  name: "",
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

const emptyCustomForm = {
  name: "",
  apiBaseUrl: "",
  migrationPath: "/migration/import",
  healthPath: "/health",
  token: "",
};

const Field = ({ label, value, onChange, placeholder }) => (
  <label className="flex flex-col gap-1">
    <span className="text-xs font-semibold text-slate-600">{label}</span>
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
    />
  </label>
);

export default function DatabaseConnectionsManager() {
  const [connections, setConnections] = useState(() => getConnections());
  const [primaryId, setPrimaryId] = useState(() => getPrimaryConnectionId());
  const [connectionType, setConnectionType] = useState("firebase");
  const [firebaseForm, setFirebaseForm] = useState(emptyFirebaseForm);
  const [customForm, setCustomForm] = useState(emptyCustomForm);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [selectedCollections, setSelectedCollections] = useState(DEFAULT_COLLECTIONS);

  const firebaseConnections = useMemo(
    () => connections.filter((item) => item.type === "firebase"),
    [connections]
  );

  const connectionMap = useMemo(() => {
    const map = new Map();
    connections.forEach((item) => map.set(item.id, item));
    return map;
  }, [connections]);

  const refresh = () => {
    setConnections(getConnections());
    setPrimaryId(getPrimaryConnectionId());
  };

  const onSaveConnection = () => {
    try {
      if (connectionType === "firebase") {
        addConnection({
          type: "firebase",
          name: firebaseForm.name,
          config: {
            apiKey: firebaseForm.apiKey,
            authDomain: firebaseForm.authDomain,
            projectId: firebaseForm.projectId,
            storageBucket: firebaseForm.storageBucket,
            messagingSenderId: firebaseForm.messagingSenderId,
            appId: firebaseForm.appId,
          },
        });
        setFirebaseForm(emptyFirebaseForm);
      } else {
        addConnection({
          type: "custom",
          name: customForm.name,
          config: {
            apiBaseUrl: customForm.apiBaseUrl,
            migrationPath: customForm.migrationPath,
            healthPath: customForm.healthPath,
            token: customForm.token,
          },
        });
        setCustomForm(emptyCustomForm);
      }

      setStatus("Підключення збережено.");
      refresh();
    } catch (error) {
      setStatus(`Помилка збереження: ${error?.message || error}`);
    }
  };

  const onSetPrimary = async (id) => {
    setBusy(true);
    try {
      await setPrimaryConnectionById(id);
      setStatus("Основну БД змінено. Сторінка перезавантажиться.");
      setTimeout(() => window.location.reload(), 400);
    } catch (error) {
      setStatus(`Не вдалося змінити основну БД: ${error?.message || error}`);
    } finally {
      setBusy(false);
    }
  };

  const onClearPrimary = async () => {
    setBusy(true);
    try {
      await clearPrimaryConnection();
      setStatus("Повернуто підключення за замовчуванням з .env. Сторінка перезавантажиться.");
      setTimeout(() => window.location.reload(), 400);
    } catch (error) {
      setStatus(`Не вдалося скинути основну БД: ${error?.message || error}`);
    } finally {
      setBusy(false);
    }
  };

  const onTest = async (id) => {
    const connection = connectionMap.get(id);
    if (!connection) return;
    setBusy(true);
    setStatus(`Тестуємо: ${connection.name}...`);
    try {
      if (connection.type === "custom") {
        await testCustomConnection(connection.config);
      } else {
        await testFirebaseConnection(connection.config);
      }
      setStatus(`Підключення ${connection.name} успішне.`);
    } catch (error) {
      setStatus(`Тест ${connection.name} не пройшов: ${error?.message || error}`);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id) => {
    setBusy(true);
    try {
      await deleteConnectionById(id);
      setStatus("Підключення видалено.");
      refresh();
    } catch (error) {
      setStatus(`Помилка видалення: ${error?.message || error}`);
    } finally {
      setBusy(false);
    }
  };

  const onBootstrap = async (id) => {
    const target = connectionMap.get(id);
    if (!target || target.type !== "firebase") return;

    setBusy(true);
    setStatus(`Ініціалізація БД: ${target.name}...`);
    try {
      const currentPrimary = connections.find((item) => item.id === primaryId);
      const sourceConfig = currentPrimary?.config || getCurrentRuntimeConfig();
      const result = await bootstrapFirebaseConnection({
        targetConfig: target.config,
        sourceConfig,
      });
      setStatus(`Bootstrap завершено. Скопійовано пунктів меню: ${result.structureCount}.`);
    } catch (error) {
      setStatus(`Помилка bootstrap: ${error?.message || error}`);
    } finally {
      setBusy(false);
    }
  };

  const toggleCollection = (name) => {
    setSelectedCollections((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const onMigrate = async () => {
    if (!sourceId || !targetId) {
      setStatus("Оберіть джерело та ціль для міграції.");
      return;
    }
    if (sourceId === targetId) {
      setStatus("Джерело та ціль не можуть бути однаковими.");
      return;
    }

    const source = connectionMap.get(sourceId);
    const target = connectionMap.get(targetId);
    if (!source || !target) {
      setStatus("Не знайдено вибрані підключення.");
      return;
    }
    if (source.type !== "firebase") {
      setStatus("Джерелом для міграції поки може бути тільки Firebase.");
      return;
    }

    setBusy(true);
    setStatus("Запускаємо міграцію...");

    try {
      let result;
      if (target.type === "custom") {
        result = await migrateFirebaseToCustomData({
          sourceConfig: source.config,
          targetConfig: target.config,
          collections: selectedCollections,
        });
      } else {
        result = await migrateFirebaseData({
          sourceConfig: source.config,
          targetConfig: target.config,
          collections: selectedCollections,
        });
      }

      const statText = Object.entries(result.stats)
        .map(([name, count]) => `${name}: ${count}`)
        .join(" | ");

      if (target.type === "custom") {
        setStatus(`Міграцію в Custom DB завершено. ${statText}`);
      } else {
        setStatus(`Міграцію завершено. ${statText}`);
      }
    } catch (error) {
      setStatus(`Помилка міграції: ${error?.message || error}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow">
        <h2 className="text-lg font-semibold text-slate-900">Підключення до БД</h2>
        <p className="mt-1 text-sm text-slate-600">Збережіть кілька Firebase або Custom API підключень, оберіть основну Firebase БД і мігруйте дані між ними.</p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">Тип підключення</span>
            <select
              value={connectionType}
              onChange={(e) => setConnectionType(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="firebase">Firebase</option>
              <option value="custom">Custom Server DB (API)</option>
            </select>
          </label>
        </div>

        {connectionType === "firebase" ? (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Назва" value={firebaseForm.name} onChange={(e) => setFirebaseForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Напр. PROD Кувшин" />
            <Field label="API Key" value={firebaseForm.apiKey} onChange={(e) => setFirebaseForm((prev) => ({ ...prev, apiKey: e.target.value }))} placeholder="AIza..." />
            <Field label="Auth Domain" value={firebaseForm.authDomain} onChange={(e) => setFirebaseForm((prev) => ({ ...prev, authDomain: e.target.value }))} placeholder="project.firebaseapp.com" />
            <Field label="Project ID" value={firebaseForm.projectId} onChange={(e) => setFirebaseForm((prev) => ({ ...prev, projectId: e.target.value }))} placeholder="project-id" />
            <Field label="Storage Bucket" value={firebaseForm.storageBucket} onChange={(e) => setFirebaseForm((prev) => ({ ...prev, storageBucket: e.target.value }))} placeholder="project.appspot.com" />
            <Field label="Messaging Sender ID" value={firebaseForm.messagingSenderId} onChange={(e) => setFirebaseForm((prev) => ({ ...prev, messagingSenderId: e.target.value }))} placeholder="123456789" />
            <Field label="App ID" value={firebaseForm.appId} onChange={(e) => setFirebaseForm((prev) => ({ ...prev, appId: e.target.value }))} placeholder="1:...:web:..." />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Назва" value={customForm.name} onChange={(e) => setCustomForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Напр. My Postgres API" />
            <Field label="API Base URL" value={customForm.apiBaseUrl} onChange={(e) => setCustomForm((prev) => ({ ...prev, apiBaseUrl: e.target.value }))} placeholder="https://my-server.com" />
            <Field label="Migration Path" value={customForm.migrationPath} onChange={(e) => setCustomForm((prev) => ({ ...prev, migrationPath: e.target.value }))} placeholder="/migration/import" />
            <Field label="Health Path" value={customForm.healthPath} onChange={(e) => setCustomForm((prev) => ({ ...prev, healthPath: e.target.value }))} placeholder="/health" />
            <Field label="API Token (optional)" value={customForm.token} onChange={(e) => setCustomForm((prev) => ({ ...prev, token: e.target.value }))} placeholder="Bearer token" />
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={onSaveConnection} className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500">Додати підключення</button>
          <button onClick={onClearPrimary} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Скинути основну БД (.env)</button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow">
        <h3 className="text-base font-semibold text-slate-900">Список підключень</h3>
        <div className="mt-3 space-y-2">
          {connections.length === 0 && <div className="text-sm text-slate-500">Поки немає збережених підключень.</div>}
          {connections.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">{item.name}</div>
                <div className="text-xs text-slate-500">
                  type: {item.type || "firebase"}
                  {item.type === "custom"
                    ? ` | api: ${item.config?.apiBaseUrl || "-"}`
                    : ` | projectId: ${item.config?.projectId || "-"}`}
                </div>
                {primaryId === item.id && <div className="mt-1 inline-flex rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Основна БД</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => onTest(item.id)} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Тест</button>
                {item.type === "firebase" && (
                  <>
                    <button disabled={busy} onClick={() => onBootstrap(item.id)} className="rounded border border-indigo-300 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Bootstrap</button>
                    <button disabled={busy} onClick={() => onSetPrimary(item.id)} className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500">Зробити основною</button>
                  </>
                )}
                <button disabled={busy} onClick={() => onDelete(item.id)} className="rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-500">Видалити</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow">
        <h3 className="text-base font-semibold text-slate-900">Міграція база to база</h3>
        <p className="mt-1 text-sm text-slate-600">Підтримується Firebase to Firebase або Firebase to Custom API (виклик серверного імпорт-ендпоінта).</p>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">Джерело (Firebase)</span>
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">Оберіть джерело</option>
              {firebaseConnections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">Ціль (Firebase або Custom)</span>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">Оберіть ціль</option>
              {connections.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.type || "firebase"})</option>)}
            </select>
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {DEFAULT_COLLECTIONS.map((name) => (
            <label key={name} className="inline-flex items-center gap-2 rounded border border-slate-200 px-2 py-1 text-xs text-slate-700">
              <input type="checkbox" checked={selectedCollections.includes(name)} onChange={() => toggleCollection(name)} />
              {name}
            </label>
          ))}
        </div>

        <div className="mt-4">
          <button disabled={busy} onClick={onMigrate} className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">Запустити міграцію</button>
        </div>
      </div>

      {status && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{status}</div>
      )}
    </div>
  );
}
