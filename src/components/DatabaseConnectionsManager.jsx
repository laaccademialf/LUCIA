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
  "positions",
  "workRoles",
  "rolePermissions",
  "fieldPermissions",
  "assetCategories",
  "assetSubcategories",
  "assetAccountingTypes",
  "assetBusinessUnits",
  "assetStatuses",
  "assetConditions",
  "assetDecisions",
  "assetPlacementZones",
  "assetResponsibilityCenters",
  "assetResponsiblePersons",
  "assetFunctionalities",
  "assetRelevances",
  "assetReasons",
  "utilityMeters",
  "electricityReadings",
  "assetInventorySessions",
  "productInventorySessions",
  "productInventories",
  "bookingProducts",
  "productOrders",
  "bookingSuppliers",
  "bookingTypicalFields",
  "supplierDispatches",
  "teamEmployees",
  "teamShiftEvents",
  "teamJobTitles",
  "teamStaffingPlans",
  "teamRecruitmentRequests",
  "checklistTemplates",
  "checklistExecutions",
  "serviceRequests",
  "platformAuditLogs",
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
  testPath: "/db/test",
  token: "",
  dbEngine: "mysql",
  dbHost: "",
  dbPort: "3306",
  dbUser: "",
  dbPassword: "",
  dbName: "",
  postgresUrl: "",
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
            testPath: customForm.testPath,
            token: customForm.token,
            dbEngine: customForm.dbEngine,
            dbHost: customForm.dbHost,
            dbPort: Number(customForm.dbPort || 3306),
            dbUser: customForm.dbUser,
            dbPassword: customForm.dbPassword,
            dbName: customForm.dbName,
            postgresUrl: customForm.postgresUrl,
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

  const buildDraftConnectionPayload = () => {
    if (connectionType === "firebase") {
      return {
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
      };
    }

    return {
      type: "custom",
      name: customForm.name,
      config: {
        apiBaseUrl: customForm.apiBaseUrl,
        migrationPath: customForm.migrationPath,
        healthPath: customForm.healthPath,
        testPath: customForm.testPath,
        token: customForm.token,
        dbEngine: customForm.dbEngine,
        dbHost: customForm.dbHost,
        dbPort: Number(customForm.dbPort || 3306),
        dbUser: customForm.dbUser,
        dbPassword: customForm.dbPassword,
        dbName: customForm.dbName,
        postgresUrl: customForm.postgresUrl,
      },
    };
  };

  const onTestCustomHealthOnly = async () => {
    if (connectionType !== "custom") return;

    setBusy(true);
    setStatus("Крок 1/3: перевіряємо доступність API (/health)...");

    try {
      const payload = buildDraftConnectionPayload();
      await testCustomConnection({
        ...payload.config,
        postgresUrl: "",
        dbHost: "",
        dbUser: "",
        dbName: "",
      });
      setStatus("Крок 1/3 успішно: API доступний.");
    } catch (error) {
      setStatus(`Крок 1/3 не пройшов: ${error?.message || error}`);
    } finally {
      setBusy(false);
    }
  };

  const onTestCustomDbOnly = async () => {
    if (connectionType !== "custom") return;

    setBusy(true);
    setStatus("Крок 2/3: перевіряємо з'єднання з цільовою БД (/db/test)...");

    try {
      const payload = buildDraftConnectionPayload();
      await testCustomConnection(payload.config);
      setStatus("Крок 2/3 успішно: підключення до БД валідне.");
    } catch (error) {
      setStatus(`Крок 2/3 не пройшов: ${error?.message || error}`);
    } finally {
      setBusy(false);
    }
  };

  const onQuickSetupCustom = async () => {
    if (connectionType !== "custom") return;

    setBusy(true);
    setStatus("Майстер: крок 1/4 health check...");

    try {
      const payload = buildDraftConnectionPayload();

      await testCustomConnection({
        ...payload.config,
        postgresUrl: "",
        dbHost: "",
        dbUser: "",
        dbName: "",
      });

      setStatus("Майстер: крок 2/4 db test...");
      await testCustomConnection(payload.config);

      setStatus("Майстер: крок 3/4 зберігаємо підключення...");
      const record = addConnection(payload);

      setStatus("Майстер: крок 4/4 встановлюємо як основну БД...");
      await setPrimaryConnectionById(record.id);

      setCustomForm(emptyCustomForm);
      refresh();
      setStatus("Майстер завершено: Custom підключення протестовано, збережено і встановлено як основне.");
    } catch (error) {
      setStatus(`Майстер зупинено: ${error?.message || error}`);
    } finally {
      setBusy(false);
    }
  };

  const onTestDraftConnection = async () => {
    setBusy(true);
    setStatus("Тестуємо введені параметри підключення...");

    try {
      if (connectionType === "custom") {
        await testCustomConnection({
          apiBaseUrl: customForm.apiBaseUrl,
          migrationPath: customForm.migrationPath,
          healthPath: customForm.healthPath,
          testPath: customForm.testPath,
          token: customForm.token,
          dbEngine: customForm.dbEngine,
          dbHost: customForm.dbHost,
          dbPort: Number(customForm.dbPort || 3306),
          dbUser: customForm.dbUser,
          dbPassword: customForm.dbPassword,
          dbName: customForm.dbName,
          postgresUrl: customForm.postgresUrl,
        });
      } else {
        await testFirebaseConnection({
          apiKey: firebaseForm.apiKey,
          authDomain: firebaseForm.authDomain,
          projectId: firebaseForm.projectId,
          storageBucket: firebaseForm.storageBucket,
          messagingSenderId: firebaseForm.messagingSenderId,
          appId: firebaseForm.appId,
        });
      }

      setStatus("Тест введених параметрів пройшов успішно.");
    } catch (error) {
      setStatus(`Тест введених параметрів не пройшов: ${error?.message || error}`);
    } finally {
      setBusy(false);
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
            <Field label="DB Test Path" value={customForm.testPath} onChange={(e) => setCustomForm((prev) => ({ ...prev, testPath: e.target.value }))} placeholder="/db/test" />
            <Field label="API Token (optional)" value={customForm.token} onChange={(e) => setCustomForm((prev) => ({ ...prev, token: e.target.value }))} placeholder="Bearer token" />
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-600">DB Engine</span>
              <select
                value={customForm.dbEngine}
                onChange={(e) => setCustomForm((prev) => ({ ...prev, dbEngine: e.target.value }))}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="mysql">MariaDB/MySQL</option>
                <option value="mariadb">MariaDB</option>
                <option value="postgres">PostgreSQL</option>
              </select>
            </label>
            {(customForm.dbEngine === "postgres") ? (
              <Field
                label="Postgres URL"
                value={customForm.postgresUrl}
                onChange={(e) => setCustomForm((prev) => ({ ...prev, postgresUrl: e.target.value }))}
                placeholder="postgres://user:pass@host:5432/db"
              />
            ) : (
              <>
                <Field label="DB Host" value={customForm.dbHost} onChange={(e) => setCustomForm((prev) => ({ ...prev, dbHost: e.target.value }))} placeholder="127.0.0.1" />
                <Field label="DB Port" value={customForm.dbPort} onChange={(e) => setCustomForm((prev) => ({ ...prev, dbPort: e.target.value }))} placeholder="3306" />
                <Field label="DB User" value={customForm.dbUser} onChange={(e) => setCustomForm((prev) => ({ ...prev, dbUser: e.target.value }))} placeholder="root" />
                <Field label="DB Password" value={customForm.dbPassword} onChange={(e) => setCustomForm((prev) => ({ ...prev, dbPassword: e.target.value }))} placeholder="password" />
                <Field label="DB Name" value={customForm.dbName} onChange={(e) => setCustomForm((prev) => ({ ...prev, dbName: e.target.value }))} placeholder="lucia" />
              </>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={busy} onClick={onTestDraftConnection} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Тестувати введені параметри</button>
          {connectionType === "custom" && (
            <>
              <button disabled={busy} onClick={onTestCustomHealthOnly} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Крок 1: Health</button>
              <button disabled={busy} onClick={onTestCustomDbOnly} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Крок 2: DB Test</button>
              <button disabled={busy} onClick={onQuickSetupCustom} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">Швидко підключити (3-4 кліки)</button>
            </>
          )}
          <button disabled={busy} onClick={onSaveConnection} className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">Додати підключення</button>
          <button disabled={busy} onClick={onClearPrimary} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Скинути основну БД (.env)</button>
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
                  <button disabled={busy} onClick={() => onBootstrap(item.id)} className="rounded border border-indigo-300 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Bootstrap</button>
                )}
                <button disabled={busy} onClick={() => onSetPrimary(item.id)} className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500">Зробити основною</button>
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
