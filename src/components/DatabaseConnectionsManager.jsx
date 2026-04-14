import { useEffect, useMemo, useState } from "react";
import {
  isCollectionsApiEnabled,
  getCollectionItemApi,
  updateCollectionItemApi,
} from "../api/collectionsApi";
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
  normalizeCustomMySqlData,
  setPrimaryConnectionById,
  testCustomConnection,
  testFirebaseConnection,
} from "../data/firebaseConnections";
import {
  addRuntimePlatformAdminEmail,
  getRuntimePlatformAdminEmails,
  removeRuntimePlatformAdminEmail,
} from "../data/platformAdminSettings";

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
  "assortmentMatrixItems",
  "assortmentMatrixTypicalFields",
  "assortmentMatrixSpecifications",
];

const CURRENT_RUNTIME_SOURCE_ID = "__current_runtime_firebase__";

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
  const [platformAdminEmail, setPlatformAdminEmail] = useState("");
  const [runtimePlatformAdmins, setRuntimePlatformAdmins] = useState(() => getRuntimePlatformAdminEmails());

  // Printer settings
  const [printerIp, setPrinterIp] = useState(() => localStorage.getItem("lucia_printer_ip") || "");
  const [printerPort, setPrinterPort] = useState(() => localStorage.getItem("lucia_printer_port") || "9100");
  const [printerOffsetX, setPrinterOffsetX] = useState(() => localStorage.getItem("lucia_printer_offset_x") || "0");
  const [printerProxyUrl, setPrinterProxyUrl] = useState(() => localStorage.getItem("lucia_print_proxy_url") || "http://localhost:6101");
  const [printerSaved, setPrinterSaved] = useState(false);
  const [proxyStatus, setProxyStatus] = useState(null); // null | "checking" | "online" | "offline"

  // Load admin printer settings from DB on mount
  useEffect(() => {
    if (!isCollectionsApiEnabled()) return;
    let cancelled = false;
    (async () => {
      try {
        const item = await getCollectionItemApi("settings", "adminPrinter");
        if (cancelled || !item) return;
        if (item.printerIp) { setPrinterIp(item.printerIp); localStorage.setItem("lucia_printer_ip", item.printerIp); }
        if (item.printerPort) { setPrinterPort(item.printerPort); localStorage.setItem("lucia_printer_port", item.printerPort); }
        if (item.printerOffsetX) { setPrinterOffsetX(item.printerOffsetX); localStorage.setItem("lucia_printer_offset_x", item.printerOffsetX); }
        if (item.printerProxyUrl) { setPrinterProxyUrl(item.printerProxyUrl); localStorage.setItem("lucia_print_proxy_url", item.printerProxyUrl); }
      } catch { /* settings may not exist yet */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [selectedCollections, setSelectedCollections] = useState(DEFAULT_COLLECTIONS);

  const firebaseConnections = useMemo(
    () => connections.filter((item) => item.type === "firebase"),
    [connections]
  );

  const runtimeFirebaseSource = useMemo(() => {
    const runtimeConfig = getCurrentRuntimeConfig();
    if (!runtimeConfig) return null;

    return {
      id: CURRENT_RUNTIME_SOURCE_ID,
      name: `Поточна база (runtime/.env) · ${runtimeConfig.projectId || "без projectId"}`,
      type: "firebase",
      config: runtimeConfig,
      isRuntimeSource: true,
    };
  }, [connections, primaryId]);

  const migrationSourceOptions = useMemo(() => {
    if (!runtimeFirebaseSource) return firebaseConnections;
    return [runtimeFirebaseSource, ...firebaseConnections];
  }, [firebaseConnections, runtimeFirebaseSource]);

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

  const onNormalizeCustomSql = async () => {
    if (connectionType !== "custom") return;

    setBusy(true);
    setStatus("Крок 3/3: запускаємо нормалізацію JSON -> табличний SQL (/migration/normalize)...");

    try {
      const payload = buildDraftConnectionPayload();
      const result = await normalizeCustomMySqlData({
        targetConfig: payload.config,
        collections: DEFAULT_COLLECTIONS,
      });
      const stats = result?.serverResponse?.stats || {};
      const processedCollections = Object.keys(stats);
      if (processedCollections.length < DEFAULT_COLLECTIONS.length) {
        throw new Error(
          `Сервер повернув лише ${processedCollections.length} з ${DEFAULT_COLLECTIONS.length} колекцій (${processedCollections.join(", ")}). Ймовірно, на API розгорнуто стару версію /migration/normalize. Оновіть backend scripts/custom-db/server.js і повторіть.`
        );
      }
      const statText = Object.entries(stats)
        .map(([name, count]) => `${name}: ${typeof count === "object" && count !== null ? (count.rows ?? 0) : count}`)
        .join(" | ");
      setStatus(`Нормалізацію завершено успішно. ${statText}`);
    } catch (error) {
      setStatus(`Нормалізація не пройшла: ${error?.message || error}`);
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

  const onAddPlatformAdminEmail = () => {
    const next = addRuntimePlatformAdminEmail(platformAdminEmail);
    setRuntimePlatformAdmins(next);
    setPlatformAdminEmail("");
    setStatus("Platform admin email додано. Для поточної сесії може знадобитись перелогін або перезавантаження сторінки.");
  };

  const onRemovePlatformAdminEmail = (email) => {
    const next = removeRuntimePlatformAdminEmail(email);
    setRuntimePlatformAdmins(next);
    setStatus("Platform admin email видалено.");
  };

  const onClearRuntimeConfigAndReload = async () => {
    setBusy(true);
    try {
      await clearPrimaryConnection();
      setStatus("Runtime-конфіг очищено. Перезавантажуємо сторінку...");
      setTimeout(() => window.location.reload(), 250);
    } catch (error) {
      setStatus(`Не вдалося очистити runtime-конфіг: ${error?.message || error}`);
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

  const onUseCustomConnection = (id) => {
    const connection = connectionMap.get(id);
    if (!connection || connection.type !== "custom") return;

    const cfg = connection.config || {};
    setConnectionType("custom");
    setCustomForm({
      name: connection.name || "",
      apiBaseUrl: String(cfg.apiBaseUrl || ""),
      migrationPath: String(cfg.migrationPath || "/migration/import"),
      healthPath: String(cfg.healthPath || "/health"),
      testPath: String(cfg.testPath || "/db/test"),
      token: String(cfg.token || ""),
      dbEngine: String(cfg.dbEngine || "mysql"),
      dbHost: String(cfg.dbHost || ""),
      dbPort: String(cfg.dbPort || 3306),
      dbUser: String(cfg.dbUser || ""),
      dbPassword: String(cfg.dbPassword || ""),
      dbName: String(cfg.dbName || ""),
      postgresUrl: String(cfg.postgresUrl || ""),
    });
    setStatus(`Параметри підключення "${connection.name}" перенесено у форму.`);
  };

  const onNormalizeFromConnection = async (id) => {
    const connection = connectionMap.get(id);
    if (!connection || connection.type !== "custom") return;

    setBusy(true);
    setStatus(`Запускаємо JSON to SQL для "${connection.name}"...`);
    try {
      const result = await normalizeCustomMySqlData({
        targetConfig: connection.config || {},
        collections: DEFAULT_COLLECTIONS,
      });
      const stats = result?.serverResponse?.stats || {};
      const processedCollections = Object.keys(stats);
      if (processedCollections.length < DEFAULT_COLLECTIONS.length) {
        throw new Error(
          `Сервер повернув лише ${processedCollections.length} з ${DEFAULT_COLLECTIONS.length} колекцій (${processedCollections.join(", ")}). Ймовірно, на API розгорнуто стару версію /migration/normalize. Оновіть backend scripts/custom-db/server.js і повторіть.`
        );
      }
      const statText = Object.entries(stats)
        .map(([name, count]) => `${name}: ${typeof count === "object" && count !== null ? (count.rows ?? 0) : count}`)
        .join(" | ");
      setStatus(`Нормалізацію завершено для "${connection.name}". ${statText}`);
    } catch (error) {
      setStatus(`Нормалізація для "${connection.name}" не пройшла: ${error?.message || error}`);
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

    const source = sourceId === CURRENT_RUNTIME_SOURCE_ID
      ? runtimeFirebaseSource
      : connectionMap.get(sourceId);
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
              <button disabled={busy} onClick={onNormalizeCustomSql} className="rounded-md border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60">Крок 3: JSON to SQL</button>
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
                {item.type === "custom" && (
                  <>
                    <button disabled={busy} onClick={() => onUseCustomConnection(item.id)} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">У форму</button>
                    <button disabled={busy} onClick={() => onNormalizeFromConnection(item.id)} className="rounded border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50">JSON to SQL</button>
                  </>
                )}
                <button disabled={busy} onClick={() => onSetPrimary(item.id)} className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500">Зробити основною</button>
                <button disabled={busy} onClick={() => onDelete(item.id)} className="rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-500">Видалити</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow space-y-3">
        <h3 className="text-base font-semibold text-slate-900">Platform Admin та Runtime Reset</h3>
        <p className="text-sm text-slate-600">Додавайте email-адміністраторів через UI без змін у .env. Список зберігається у localStorage цього браузера.</p>

        <div className="flex flex-col md:flex-row gap-2 md:items-center">
          <input
            value={platformAdminEmail}
            onChange={(e) => setPlatformAdminEmail(e.target.value)}
            placeholder="admin@example.com"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onAddPlatformAdminEmail}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
            disabled={busy || !platformAdminEmail.trim()}
          >
            Додати platform admin email
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {runtimePlatformAdmins.length === 0 && (
            <span className="text-xs text-slate-500">Runtime platform-admin email поки немає.</span>
          )}
          {runtimePlatformAdmins.map((email) => (
            <div key={email} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs text-slate-700">
              <span>{email}</span>
              <button
                type="button"
                onClick={() => onRemovePlatformAdminEmail(email)}
                className="font-semibold text-rose-600 hover:text-rose-500"
                disabled={busy}
              >
                Видалити
              </button>
            </div>
          ))}
        </div>

        <div>
          <button
            type="button"
            onClick={onClearRuntimeConfigAndReload}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            disabled={busy}
          >
            Очистити runtime-конфіг БД і перезавантажити
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow">
        <h3 className="text-base font-semibold text-slate-900">🖨️ Принтер етикеток (ZPL)</h3>
        <p className="mt-1 text-sm text-slate-600">
          Мережевий принтер для друку QR-етикеток 20×30 мм. Щоб друкувати без діалогу, запустіть
          {" "}<code className="text-xs bg-slate-100 px-1 rounded">start-print-proxy.bat</code>{" "}
          на ПК у тій же мережі, що й принтер.
        </p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="IP-адреса принтера" value={printerIp} onChange={(e) => { setPrinterIp(e.target.value); setPrinterSaved(false); }} placeholder="192.168.1.100" />
          <Field label="Порт" value={printerPort} onChange={(e) => { setPrinterPort(e.target.value); setPrinterSaved(false); }} placeholder="9100" />
          <Field label="Зсув X (dots, 8 dots = 1мм)" value={printerOffsetX} onChange={(e) => { setPrinterOffsetX(e.target.value); setPrinterSaved(false); }} placeholder="0" />
          <Field label="Print Proxy URL" value={printerProxyUrl} onChange={(e) => { setPrinterProxyUrl(e.target.value); setPrinterSaved(false); }} placeholder="http://localhost:6101" />
        </div>
        {printerSaved && <p className="mt-2 text-sm text-emerald-600 font-semibold">Налаштування принтера збережено ✓</p>}
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={async () => {
              localStorage.setItem("lucia_printer_ip", printerIp.trim());
              localStorage.setItem("lucia_printer_port", String(printerPort || "9100").trim());
              localStorage.setItem("lucia_printer_offset_x", String(printerOffsetX || "0").trim());
              localStorage.setItem("lucia_print_proxy_url", printerProxyUrl.trim());
              // Save to DB for all admins
              if (isCollectionsApiEnabled()) {
                try {
                  await updateCollectionItemApi("settings", "adminPrinter", {
                    id: "adminPrinter",
                    printerIp: printerIp.trim(),
                    printerPort: String(printerPort || "9100").trim(),
                    printerOffsetX: String(printerOffsetX || "0").trim(),
                    printerProxyUrl: printerProxyUrl.trim(),
                  });
                } catch (err) {
                  console.warn("Failed to save printer settings to DB:", err);
                }
              }
              setPrinterSaved(true);
            }}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Зберегти принтер
          </button>
          <button
            type="button"
            onClick={async () => {
              setProxyStatus("checking");
              try {
                const url = printerProxyUrl.trim().replace(/\/+$/, "");
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 3000);
                const r = await fetch(`${url}/health`, { signal: ctrl.signal });
                clearTimeout(t);
                setProxyStatus(r.ok ? "online" : "offline");
              } catch {
                setProxyStatus("offline");
              }
            }}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Перевірити proxy
          </button>
          {proxyStatus === "checking" && <span className="text-sm text-slate-500">Перевіряю…</span>}
          {proxyStatus === "online" && <span className="text-sm text-emerald-600 font-semibold">● Proxy онлайн</span>}
          {proxyStatus === "offline" && <span className="text-sm text-rose-600 font-semibold">● Proxy недоступний — запустіть start-print-proxy.bat</span>}
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
              {migrationSourceOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
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
