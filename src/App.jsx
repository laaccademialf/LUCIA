import { useEffect, useMemo, useState } from "react";
import {
  Box,
  ChevronDown,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Package,
  Plus,
  Settings as SettingsIcon,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import clsx from "clsx";
import { AssetTable } from "./components/AssetTable";
import { AssetForm } from "./components/AssetForm";
import { mockAssets } from "./data/mockAssets";

function App() {
  const [assets, setAssets] = useState(mockAssets);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({
    category: "",
    status: "",
    decision: "",
    location: "",
  });
  const [activeNav, setActiveNav] = useState("inventory-assets");
  const [expandedGroups, setExpandedGroups] = useState({
    dashboard: false,
    settings: false,
    operations: false,
    inventory: false,
    reports: false,
    security: false,
    team: false,
    maintenance: false,
  });
  const [topTab, setTopTab] = useState("test1");
  const [restaurantForm, setRestaurantForm] = useState({
    regNumber: "",
    name: "",
    address: "",
    seatsTotal: "",
    seatsSummer: "",
    seatsWinter: "",
    hasTerrace: false,
    areaTotal: "",
    areaSummer: "",
    areaWinter: "",
    country: "",
    region: "",
    city: "",
    street: "",
    postalCode: "",
    notes: "",
  });
  const [schedule, setSchedule] = useState({
    mon: { from: "", to: "" },
    tue: { from: "", to: "" },
    wed: { from: "", to: "" },
    thu: { from: "", to: "" },
    fri: { from: "", to: "" },
    sat: { from: "", to: "" },
    sun: { from: "", to: "" },
  });

  const topTabs = useMemo(() => {
    if (activeNav === "settings-restaurant") {
      return [
        { id: "main", label: "Головні" },
        { id: "schedule", label: "Графік роботи" },
      ];
    }
    if (activeNav.startsWith("inventory-")) {
      return [
        { id: "test1", label: "Додати" },
        { id: "test2", label: "Редагувати" },
        { id: "test3", label: "Тест 3" },
      ];
    }
    return [
      { id: "test1", label: "Тест 1" },
      { id: "test2", label: "Тест 2" },
      { id: "test3", label: "Тест 3" },
    ];
  }, [activeNav]);

  useEffect(() => {
    if (topTabs.length > 0) {
      setTopTab(topTabs[0].id);
    }
  }, [activeNav, topTabs]);

  const toggleGroup = (id) => {
    setExpandedGroups((prev) => {
      const isCurrentlyExpanded = prev[id];
      if (isCurrentlyExpanded) {
        return { ...prev, [id]: false };
      } else {
        const allCollapsed = Object.keys(prev).reduce((acc, key) => ({ ...acc, [key]: false }), {});
        return { ...allCollapsed, [id]: true };
      }
    });
  };

  const handleSubmit = (asset) => {
    setAssets((prev) => {
      const exists = prev.find((a) => a.invNumber === asset.invNumber);
      if (exists) {
        return prev.map((a) => (a.invNumber === asset.invNumber ? { ...exists, ...asset } : a));
      }
      const newAsset = { ...asset, id: crypto.randomUUID() };
      return [newAsset, ...prev];
    });
    setSelected(null);
  };

  const handleExport = () => {
    const header = [
      "invNumber",
      "name",
      "category",
      "subCategory",
      "type",
      "serialNumber",
      "brand",
      "businessUnit",
      "locationName",
      "zone",
      "respCenter",
      "respPerson",
      "status",
      "condition",
      "functionality",
      "relevance",
      "comment",
      "purchaseYear",
      "commissionDate",
      "normativeTerm",
      "physicalWear",
      "moralWear",
      "totalWear",
      "initialCost",
      "marketValueNew",
      "marketValueUsed",
      "residualValue",
      "decision",
      "reason",
      "newLocation",
      "auditDate",
      "auditors",
    ];

    const rows = assets.map((a) => header.map((key) => a[key] ?? ""));
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "assets.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const summary = useMemo(() => {
    const total = assets.length;
    const toWriteOff = assets.filter((a) => a.decision === "Списати").length;
    const toMove = assets.filter((a) => a.decision === "Перемістити").length;
    return { total, toWriteOff, toMove };
  }, [assets]);

  const navItems = [
    {
      id: "dashboard",
      label: "Дашборд",
      icon: LayoutDashboard,
      children: [
        { id: "dashboard-ops", label: "Операційний огляд" },
      ],
    },
    {
      id: "settings",
      label: "Налаштування",
      icon: SettingsIcon,
      children: [
        { id: "settings-restaurant", label: "Дані ресторану" },
        { id: "settings-accounts", label: "Облікові записи" },
        { id: "settings-permissions", label: "Права доступу" },
      ],
    },
    {
      id: "operations",
      label: "Операції",
      icon: ClipboardList,
      children: [
        { id: "ops-checklists", label: "Чек-листи" },
        { id: "ops-haccp", label: "HACCP журнали" },
        { id: "ops-maintenance", label: "Сервісні заявки" },
      ],
    },
    {
      id: "inventory",
      label: "Облік",
      icon: Package,
      children: [
        { id: "inventory-products", label: "Продукти" },
        { id: "inventory-utilities", label: "Утиліти" },
        { id: "inventory-assets", label: "Основні засоби" },
      ],
    },
    {
      id: "reports",
      label: "Звіти",
      icon: FileText,
      children: [
        { id: "reports-products", label: "Інвентаризація продуктів" },
        { id: "reports-assets", label: "Основні засоби" },
      ],
    },
    {
      id: "security",
      label: "Безпека",
      icon: ShieldCheck,
      children: [
        { id: "security-audit", label: "Аудит дій" },
      ],
    },
    {
      id: "team",
      label: "Команда",
      icon: Users,
      children: [
        { id: "team-roles", label: "Ролі та доступи" },
      ],
    },
    {
      id: "maintenance",
      label: "Сервіс",
      icon: Wrench,
      children: [
        { id: "maintenance-plan", label: "Планові роботи" },
      ],
    },
  ];

  const renderContent = () => {
    const baseInput = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed";

    const renderAddressFields = () => (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="text-sm font-semibold text-slate-800">Країна</label>
          <input className={baseInput} value={restaurantForm.country} onChange={(e) => setRestaurantForm((p) => ({ ...p, country: e.target.value }))} />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Область</label>
          <input className={baseInput} value={restaurantForm.region} onChange={(e) => setRestaurantForm((p) => ({ ...p, region: e.target.value }))} />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Місто / Село</label>
          <input className={baseInput} value={restaurantForm.city} onChange={(e) => setRestaurantForm((p) => ({ ...p, city: e.target.value }))} />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Вулиця</label>
          <input className={baseInput} value={restaurantForm.street} onChange={(e) => setRestaurantForm((p) => ({ ...p, street: e.target.value }))} />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Поштовий індекс</label>
          <input className={baseInput} value={restaurantForm.postalCode} onChange={(e) => setRestaurantForm((p) => ({ ...p, postalCode: e.target.value }))} />
        </div>
      </div>
    );

    const renderSeatingFields = () => (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="hasTerrace"
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            checked={restaurantForm.hasTerrace}
            onChange={(e) => setRestaurantForm((p) => ({ ...p, hasTerrace: e.target.checked }))}
          />
          <label htmlFor="hasTerrace" className="text-sm font-semibold text-slate-800">Розділяти літо / зима</label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-semibold text-slate-800">Посадкові місця (всього)</label>
            <input
              className={baseInput}
              value={restaurantForm.seatsTotal}
              onChange={(e) => setRestaurantForm((p) => ({ ...p, seatsTotal: e.target.value }))}
              disabled={restaurantForm.hasTerrace}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Посадкові місця (літо)</label>
            <input
              className={baseInput}
              value={restaurantForm.seatsSummer}
              onChange={(e) => setRestaurantForm((p) => ({ ...p, seatsSummer: e.target.value }))}
              disabled={!restaurantForm.hasTerrace}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Посадкові місця (зима)</label>
            <input
              className={baseInput}
              value={restaurantForm.seatsWinter}
              onChange={(e) => setRestaurantForm((p) => ({ ...p, seatsWinter: e.target.value }))}
              disabled={!restaurantForm.hasTerrace}
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-800">Площа, м² (всього)</label>
            <input
              className={baseInput}
              value={restaurantForm.areaTotal}
              onChange={(e) => setRestaurantForm((p) => ({ ...p, areaTotal: e.target.value }))}
              disabled={restaurantForm.hasTerrace}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Площа, м² (літо)</label>
            <input
              className={baseInput}
              value={restaurantForm.areaSummer}
              onChange={(e) => setRestaurantForm((p) => ({ ...p, areaSummer: e.target.value }))}
              disabled={!restaurantForm.hasTerrace}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Площа, м² (зима)</label>
            <input
              className={baseInput}
              value={restaurantForm.areaWinter}
              onChange={(e) => setRestaurantForm((p) => ({ ...p, areaWinter: e.target.value }))}
              disabled={!restaurantForm.hasTerrace}
            />
          </div>
        </div>
      </div>
    );

    const renderSchedule = () => {
      const days = [
        { key: "mon", label: "Пн" },
        { key: "tue", label: "Вт" },
        { key: "wed", label: "Ср" },
        { key: "thu", label: "Чт" },
        { key: "fri", label: "Пт" },
        { key: "sat", label: "Сб" },
        { key: "sun", label: "Нд" },
      ];
      return (
        <div className="card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Графік роботи</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {days.map((d) => (
              <div key={d.key} className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                <p className="text-sm font-semibold text-slate-800 mb-2">{d.label}</p>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    className={baseInput}
                    value={schedule[d.key].from}
                    onChange={(e) => setSchedule((p) => ({ ...p, [d.key]: { ...p[d.key], from: e.target.value } }))}
                  />
                  <span className="text-xs text-slate-500">до</span>
                  <input
                    type="time"
                    className={baseInput}
                    value={schedule[d.key].to}
                    onChange={(e) => setSchedule((p) => ({ ...p, [d.key]: { ...p[d.key], to: e.target.value } }))}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    };

    if (activeNav === "settings-restaurant") {
      if (topTab === "main") {
        return (
          <div className="card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Головні дані ресторану</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="text-sm font-semibold text-slate-800">Обліковий номер</label>
                <input className={baseInput} value={restaurantForm.regNumber} onChange={(e) => setRestaurantForm((p) => ({ ...p, regNumber: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-800">Назва</label>
                <input className={baseInput} value={restaurantForm.name} onChange={(e) => setRestaurantForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">Адреса</p>
              {renderAddressFields()}
            </div>
            {renderSeatingFields()}

            <div>
              <label className="text-sm font-semibold text-slate-800">Нотатки</label>
              <textarea
                className={`${baseInput} min-h-[100px]`}
                value={restaurantForm.notes}
                onChange={(e) => setRestaurantForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                className="px-5 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 shadow"
              >
                Зберегти
              </button>
            </div>
          </div>
        );
      }

      if (topTab === "schedule") {
        return renderSchedule();
      }
    }

    if (activeNav === "inventory-assets" || activeNav.startsWith("reports-assets")) {
      if (topTab === "test1") {
        return (
          <div className="grid grid-cols-1">
            <AssetForm selectedAsset={null} onSubmit={handleSubmit} />
          </div>
        );
      }

      return (
        <div className="grid grid-cols-1">
          <AssetTable
            data={assets}
            onEdit={setSelected}
            filters={filters}
            setFilters={setFilters}
            onExport={handleExport}
            headerTitle="Редагування"
            headerSubtitle="Експорт / Імпорт"
          />
        </div>
      );
    }

    return (
      <div className="card p-6 text-sm text-slate-600">
        <p className="text-base font-semibold text-slate-900">Розділ у розробці</p>
        <p className="mt-1 text-slate-600">
          Оберіть «Основні засоби» щоб працювати з інвентаризацією, або зафіксуйте вимоги для цього розділу.
        </p>
      </div>
    );
  };

  return (
    <div className="app-shell min-h-screen bg-slate-900 text-slate-50">
      <div className="flex h-screen gap-0">
        {/* Sidebar */}
        <aside className="fixed left-0 top-0 h-screen w-72 overflow-y-auto border-r border-slate-700 bg-slate-900/95 shadow-lg z-40">
          <div className="p-4">
            <div className="mb-6 mt-2">
              <p className="text-3xl font-bold text-indigo-400">LUCI</p>
              <p className="text-xs uppercase tracking-wider text-slate-400 mt-1">
                La Famiglia Unified Control &amp; Intelligence
              </p>
            </div>
            <nav className="flex flex-col gap-2">
              {navItems.map((group) => (
                <div key={group.id} className="rounded-xl bg-slate-800/50 border border-slate-700 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300 hover:bg-slate-700/50 transition"
                  >
                    <div className="flex items-center gap-2">
                      <group.icon size={16} /> {group.label}
                    </div>
                    <ChevronDown
                      size={14}
                      className={clsx(
                        "transition-transform",
                        expandedGroups[group.id] ? "rotate-0" : "-rotate-90"
                      )}
                    />
                  </button>

                  {expandedGroups[group.id] && (
                    <div className="flex flex-col gap-1 pb-2">
                      {group.children.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setActiveNav(item.id);

                          }}
                          className={clsx(
                            "mx-2 flex items-start gap-2 rounded-lg px-3 py-2 text-sm font-medium transition whitespace-nowrap",
                            activeNav === item.id
                              ? "bg-indigo-600 text-white shadow"
                              : "text-slate-200 hover:bg-slate-700/60"
                          )}
                        >
                          <span className="inline-block h-2 w-2 rounded-full bg-indigo-400 mt-1 shrink-0" />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 ml-72 overflow-auto transition-all duration-300">
          {topTabs.length > 0 && (
            <div className="sticky top-0 z-30 bg-slate-900/95 border-b border-slate-800 shadow-lg shadow-slate-900/40">
              <div className="w-full px-0 lg:px-0 h-10 flex gap-0 overflow-x-auto items-stretch justify-start">
                {topTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setTopTab(tab.id);
                      setSelected(null);
                    }}
                    className={clsx(
                      "flex-none px-3 py-2 rounded-none text-sm font-semibold border border-slate-700 transition text-center first:rounded-none last:rounded-r-lg",
                      topTab === tab.id
                        ? "bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-500/40"
                        : "bg-slate-800 text-slate-200 border-slate-700 hover:border-indigo-400 hover:text-white hover:bg-slate-700"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mx-auto max-w-screen-2xl px-6 py-8 lg:px-8">
            <div className="mt-4">
              {renderContent()}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value, pill = false, tone = "emerald" }) {
  const toneMap = {
    emerald: "bg-emerald-500/20 text-emerald-300",
    rose: "bg-rose-500/20 text-rose-300",
    sky: "bg-sky-500/20 text-sky-300",
  };
  return (
    <div className={clsx("rounded-full px-4 py-2 text-sm font-semibold border", toneMap[tone], "border-current border-opacity-30")}>
      {label}: {value}
    </div>
  );
}

export default App;
