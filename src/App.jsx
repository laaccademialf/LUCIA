import { useMemo, useState } from "react";
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

  const toggleGroup = (id) => {
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
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
    if (activeNav === "inventory-assets" || activeNav.startsWith("reports-assets")) {
      return (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <AssetTable
                data={assets}
                onEdit={setSelected}
                filters={filters}
                setFilters={setFilters}
                onExport={handleExport}
              />
            </div>
            <div className="lg:col-span-1 flex flex-col gap-4">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="btn btn-secondary justify-center"
              >
                <Plus size={18} /> Новий актив
              </button>
              <AssetForm selectedAsset={selected} onSubmit={handleSubmit} />
            </div>
          </div>
        </>
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
          <div className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
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
