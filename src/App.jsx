import { useEffect, useMemo, useState, useRef } from "react";
import {
  Box,
  ChevronDown,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Package,
  Plus,
  Settings as SettingsIcon,
  ShieldCheck,
  User as UserIcon,
  Users,
  Wrench,
  Download,
  Upload,
  FileDown,
} from "lucide-react";
import clsx from "clsx";
import { AssetTable } from "./components/AssetTable";
import { AssetForm } from "./components/AssetForm";
import { AddUserForm } from "./components/AddUserForm";
import { UsersTable } from "./components/UsersTable";
import { RolesPositionsManager } from "./components/RolesPositionsManager";
import { RolePermissionsManager } from "./components/RolePermissionsManager";
import { FieldPermissionsManager } from "./components/FieldPermissionsManager";
import { AssetFieldsManager } from "./components/AssetFieldsManager";
import { MaterialResponsibilityManager } from "./components/MaterialResponsibilityManager";
import { FinancialAssetsReport } from "./components/FinancialAssetsReport";
import { mockAssets } from "./data/mockAssets";
import { useRestaurants } from "./hooks/useRestaurants";
import { useAssets } from "./hooks/useAssets";
import { useAssetFields } from "./hooks/useAssetFields";
import { useAuth } from "./hooks/useAuth";
import { LoginModal } from "./components/LoginModal";
import { RegisterModal } from "./components/RegisterModal";
import { AuthSetupWarning } from "./components/AuthSetupWarning";
import { logoutUser } from "./firebase/auth";
import { getRolePermissions } from "./firebase/permissions";
import { getRestaurant } from "./firebase/firestore";
import {
  exportRestaurantsToExcel,
  importRestaurantsFromExcel,
  downloadRestaurantTemplate,
} from "./utils/excelHelpers";

// Початкові дані для ресторанів (якщо база порожня)
const initialRestaurants = [
  {
    regNumber: "001",
    name: "Ресторан А",
    address: "Вул. Хрещатик, 1",
    seatsTotal: "50",
    seatsSummer: "",
    seatsWinter: "",
    hasTerrace: false,
    areaTotal: "100",
    areaSummer: "",
    areaWinter: "",
    country: "Україна",
    region: "Київська",
    city: "Київ",
    street: "Хрещатик, 1",
    postalCode: "01001",
    notes: "",
    schedule: {
      mon: { from: "09:00", to: "22:00" },
      tue: { from: "09:00", to: "22:00" },
      wed: { from: "09:00", to: "22:00" },
      thu: { from: "09:00", to: "22:00" },
      fri: { from: "09:00", to: "22:00" },
      sat: { from: "10:00", to: "23:00" },
      sun: { from: "10:00", to: "23:00" },
    },
  },
  {
    regNumber: "002",
    name: "Ресторан Б",
    address: "Вул. Шевченка, 5",
    seatsTotal: "80",
    seatsSummer: "",
    seatsWinter: "",
    hasTerrace: false,
    areaTotal: "150",
    areaSummer: "",
    areaWinter: "",
    country: "Україна",
    region: "Львівська",
    city: "Львів",
    street: "Шевченка, 5",
    postalCode: "79000",
    notes: "",
    schedule: {
      mon: { from: "08:00", to: "21:00" },
      tue: { from: "08:00", to: "21:00" },
      wed: { from: "08:00", to: "21:00" },
      thu: { from: "08:00", to: "21:00" },
      fri: { from: "08:00", to: "21:00" },
      sat: { from: "09:00", to: "22:00" },
      sun: { from: "09:00", to: "22:00" },
    },
  },
];

function App() {
  // Authentication
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showAuthWarning, setShowAuthWarning] = useState(false);
  const [userPermissions, setUserPermissions] = useState({});

  // Завантаження прав доступу для робочої ролі користувача
  useEffect(() => {
    const loadPermissions = async () => {
      if (user?.workRole) {
        try {
          const rolePerms = await getRolePermissions(user.workRole);
          setUserPermissions(rolePerms.permissions || {});
          console.log("📋 Права користувача завантажені:");
          console.log("- Роль:", user.workRole);
          console.log("- Права:", rolePerms.permissions);
          console.log("- Деталі прав:");
          Object.entries(rolePerms.permissions || {}).forEach(([key, value]) => {
            if (Array.isArray(value)) {
              console.log(`  ${key}: [${value.join(", ")}]`);
            } else {
              console.log(`  ${key}: ${value}`);
            }
          });
        } catch (error) {
          console.error("Помилка завантаження прав:", error);
          setUserPermissions({});
        }
      } else {
        console.log("⚠️ У користувача немає workRole");
        setUserPermissions({});
      }
    };
    
    loadPermissions();
  }, [user?.workRole]);

  // Автоматично показувати вікно входу для неавторизованих користувачів
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setShowLoginModal(true);
    }
  }, [authLoading, isAuthenticated]);

  // Автоматично показувати вікно входу для неавторизованих користувачів
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setShowLoginModal(true);
    }
  }, [authLoading, isAuthenticated]);

  // Автоматично показувати вікно входу для неавторизованих користувачів
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setShowLoginModal(true);
    }
  }, [authLoading, isAuthenticated]);

  // Firebase hooks
  const {
    restaurants: firebaseRestaurants,
    loading: restaurantsLoading,
    addRestaurant: addRestaurantToFirebase,
    updateRestaurant: updateRestaurantInFirebase,
    deleteRestaurant: deleteRestaurantFromFirebase,
  } = useRestaurants();

  const {
    assets: firebaseAssets,
    loading: assetsLoading,
    addAsset: addAssetToFirebase,
    updateAsset: updateAssetInFirebase,
    deleteAsset: deleteAssetFromFirebase,
  } = useAssets();

  const {
    businessUnits,
    categories,
    subcategories,
    accountingTypes,
    statuses,
    conditions,
    decisions,
    placementZones,
  } = useAssetFields();

  // Local state
  const [assets, setAssets] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({
    category: "",
    status: "",
    decision: "",
    location: "",
  });
  const [activeNav, setActiveNav] = useState(() => {
    // Відновлення збереженої сторінки з localStorage
    return localStorage.getItem('lucia_activeNav') || "dashboard-overview";
  });
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
  const [topTab, setTopTab] = useState(() => {
    // Відновлення збереженої вкладки з localStorage
    return localStorage.getItem('lucia_topTab') || "test1";
  });
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [restaurantFilter, setRestaurantFilter] = useState("");
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

  // Sync Firebase data with local state
  useEffect(() => {
    if (!restaurantsLoading) {
      console.log("🔍 Фільтрація ресторанів:");
      console.log("- user:", user);
      console.log("- user.role:", user?.role);
      console.log("- user.restaurant:", user?.restaurant);
      console.log("- firebaseRestaurants:", firebaseRestaurants);
      
      // Фільтрація ресторанів на основі ролі користувача
      if (user?.role === 'admin') {
        // Адмін бачить всі ресторани
        console.log("✅ Адмін - показуємо всі ресторани");
        setRestaurants(firebaseRestaurants);
      } else if (user?.restaurant) {
        // Керуючий бачить тільки свій ресторан
        console.log("👤 Керуючий - показуємо тільки свій ресторан");
        const userRestaurant = firebaseRestaurants.filter(r => r.id === user.restaurant);
        setRestaurants(userRestaurant);
      } else {
        // Якщо немає прив'язки - показуємо порожній список
        console.log("⚠️ Немає ролі або ресторану - порожній список");
        setRestaurants([]);
      }
    }
  }, [firebaseRestaurants, restaurantsLoading, user]);

  useEffect(() => {
    if (!assetsLoading && firebaseAssets.length > 0) {
      setAssets(firebaseAssets);
    } else if (!assetsLoading && firebaseAssets.length === 0) {
      // Якщо база порожня, використовуємо mockAssets
      setAssets(mockAssets);
    }
  }, [firebaseAssets, assetsLoading]);

  // Автоматично заповнюємо форму даними ресторану керуючого
  useEffect(() => {
    if (!restaurantsLoading && user?.role !== 'admin' && user?.restaurant && firebaseRestaurants.length > 0) {
      const userRestaurant = firebaseRestaurants.find(r => r.id === user.restaurant);
      if (userRestaurant) {
        setRestaurantForm({
          regNumber: userRestaurant.regNumber || "",
          name: userRestaurant.name || "",
          address: userRestaurant.address || "",
          seatsTotal: userRestaurant.seatsTotal || "",
          seatsSummer: userRestaurant.seatsSummer || "",
          seatsWinter: userRestaurant.seatsWinter || "",
          hasTerrace: userRestaurant.hasTerrace || false,
          areaTotal: userRestaurant.areaTotal || "",
          areaSummer: userRestaurant.areaSummer || "",
          areaWinter: userRestaurant.areaWinter || "",
          country: userRestaurant.country || "",
          region: userRestaurant.region || "",
          city: userRestaurant.city || "",
          street: userRestaurant.street || "",
          postalCode: userRestaurant.postalCode || "",
          notes: userRestaurant.notes || "",
        });
        if (userRestaurant.schedule) {
          setSchedule(userRestaurant.schedule);
        }
      }
    }
  }, [restaurantsLoading, user, firebaseRestaurants]);

  const topTabs = useMemo(() => {
    // Адміни бачать все
    const isAdmin = user?.role === 'admin';
    
    // Універсальна функція фільтрації вкладок
    const filterTabsByPermissions = (navId, allTabs) => {
      if (isAdmin) {
        console.log(`👑 Адмін - всі вкладки для ${navId} доступні`);
        return allTabs;
      }
      
      // Перевіряємо права на цей розділ
      const sectionPermissions = userPermissions[navId];
      console.log(`🔍 Права на ${navId}:`, sectionPermissions);
      
      if (!sectionPermissions || sectionPermissions === false) {
        console.log(`❌ Немає прав на ${navId}`);
        return [];
      }
      
      // Якщо права є масив - фільтруємо вкладки
      if (Array.isArray(sectionPermissions)) {
        const filteredTabs = allTabs.filter(tab => sectionPermissions.includes(tab.id));
        console.log(`✅ Доступні вкладки для ${navId}:`, filteredTabs.map(t => t.id));
        return filteredTabs;
      }
      
      // Якщо права не масив (наприклад true) - показуємо всі вкладки
      console.log(`✅ Повний доступ до всіх вкладок ${navId}`);
      return allTabs;
    };
    
    if (activeNav === "settings-restaurant") {
      const allTabs = [
        { id: "main", label: "Головні" },
        { id: "schedule", label: "Графік роботи" },
        { id: "projects", label: "Управління проєктами" },
      ];
      return filterTabsByPermissions("settings-restaurant", allTabs);
    }
    
    if (activeNav === "settings-accounts") {
      const allTabs = [
        { id: "add", label: "Додати" },
        { id: "edit", label: "Редагувати" },
      ];
      return filterTabsByPermissions("settings-accounts", allTabs);
    }
    
    if (activeNav === "settings-permissions") {
      const allTabs = [
        { id: "roles", label: "Ролі та Посади" },
        { id: "permissions", label: "Доступи ролей" },
      ];
      return filterTabsByPermissions("settings-permissions", allTabs);
    }
    
    if (activeNav.startsWith("inventory-")) {
      const allTabs = [
        { id: "test1", label: "Додати" },
        { id: "test2", label: "Редагувати" },
        { id: "test3", label: "Типові поля" },
        { id: "test4", label: "Права редагування" },
        { id: "responsibility", label: "Матеріальна відповідальність" },
      ];
      return filterTabsByPermissions(activeNav, allTabs);
    }
    
    return [
      { id: "test1", label: "Тест 1" },
      { id: "test2", label: "Тест 2" },
      { id: "test3", label: "Тест 3" },
    ];
  }, [activeNav, user?.role, userPermissions]);

  // Генеруємо структуру меню для RolePermissionsManager на основі реальної навігації
  const menuStructureForPermissions = useMemo(() => {
    // Допоміжна функція для отримання вкладок для конкретного розділу
    const getTabsForSection = (navId) => {
      if (navId === "settings-restaurant") {
        return [
          { id: "main", label: "Головні" },
          { id: "schedule", label: "Графік роботи" },
          { id: "projects", label: "Управління проєктами" },
        ];
      }
      if (navId === "settings-accounts") {
        return [
          { id: "add", label: "Додати" },
          { id: "edit", label: "Редагувати" },
        ];
      }
      if (navId === "settings-permissions") {
        return [
          { id: "roles", label: "Ролі та Посади" },
          { id: "permissions", label: "Доступи ролей" },
        ];
      }
      if (navId.startsWith("inventory-")) {
        return [
          { id: "test1", label: "Додати" },
          { id: "test2", label: "Редагувати" },
          { id: "test3", label: "Типові поля" },
          { id: "test4", label: "Права редагування" },
          { id: "responsibility", label: "Матеріальна відповідальність" },
        ];
      }
      return [];
    };

    // Базова структура навігації (без фільтрації прав)
    const baseNavItems = [
      {
        id: "dashboard",
        label: "Дашборд",
        children: [
          { id: "dashboard-ops", label: "Операційний огляд" },
        ],
      },
      {
        id: "settings",
        label: "Налаштування",
        children: [
          { id: "settings-restaurant", label: "Дані ресторану" },
          { id: "settings-accounts", label: "Облікові записи" },
          { id: "settings-permissions", label: "Права доступу" },
        ],
      },
      {
        id: "operations",
        label: "Операції",
        children: [
          { id: "ops-checklists", label: "Чек-листи" },
          { id: "ops-haccp", label: "HACCP журнали" },
          { id: "ops-maintenance", label: "Сервісні заявки" },
        ],
      },
      {
        id: "inventory",
        label: "Облік",
        children: [
          { id: "inventory-products", label: "Продукти" },
          { id: "inventory-utilities", label: "Утиліти" },
          { id: "inventory-assets", label: "Основні засоби" },
        ],
      },
      {
        id: "reports",
        label: "Звіти",
        children: [
          { id: "reports-products", label: "Інвентаризація продуктів" },
          { id: "reports-assets", label: "Основні засоби" },
        ],
      },
      {
        id: "security",
        label: "Безпека",
        children: [
          { id: "security-audit", label: "Аудит дій" },
        ],
      },
      {
        id: "team",
        label: "Команда",
        children: [
          { id: "team-roles", label: "Ролі та доступи" },
        ],
      },
      {
        id: "maintenance",
        label: "Сервіс",
        children: [
          { id: "maintenance-plan", label: "Планові роботи" },
        ],
      },
    ];

    // Додаємо вкладки до кожного пункту меню
    return baseNavItems.map(section => ({
      ...section,
      children: section.children.map(child => {
        const tabs = getTabsForSection(child.id);
        return tabs.length > 0 
          ? { ...child, tabs: tabs.map(t => t.id), tabLabels: tabs }
          : child;
      })
    }));
  }, []);

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

  const handleSubmit = async (asset) => {
    try {
      const exists = assets.find((a) => a.invNumber === asset.invNumber);
      if (exists) {
        // Оновлення існуючого активу
        await updateAssetInFirebase(exists.id, asset);
      } else {
        // Додавання нового активу
        await addAssetToFirebase(asset);
      }
      setSelected(null);
    } catch (error) {
      console.error("Помилка збереження активу:", error);
      alert("Помилка збереження активу. Перевірте консоль.");
    }
  };

  const handleDeleteAsset = async (assetId) => {
    try {
      const { success, error } = await deleteAssetFromFirebase(assetId);
      if (success) {
        setSelected(null);
        alert("Актив успішно видалений!");
      } else {
        alert("Помилка видалення активу: " + error);
      }
    } catch (error) {
      console.error("Помилка видалення активу:", error);
      alert("Помилка видалення активу. Перевірте консоль.");
    }
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

  const navItems = useMemo(() => {
    const isAdmin = user?.role === 'admin';
    
    const allNavItems = [
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

    // Адміни бачать все
    if (isAdmin) {
      return allNavItems;
    }

    // Якщо немає прав взагалі (не завантажилися або користувач без workRole) - показуємо все
    if (!user?.workRole || Object.keys(userPermissions).length === 0) {
      console.log("⚠️ Немає прав або workRole, показуємо все");
      return allNavItems;
    }

    console.log("🔍 Фільтруємо навігацію на основі прав:", userPermissions);

    // Фільтруємо навігацію на основі прав користувача
    return allNavItems.map(group => {
      const filteredChildren = group.children.filter(child => {
        // Перевіряємо чи є доступ до цього пункту меню
        // Права можуть бути як boolean (true/false) так і масив вкладок
        const hasAccess = userPermissions[child.id] !== undefined && userPermissions[child.id] !== false;
        console.log(`- ${child.id}: ${hasAccess ? '✅' : '❌'}`, userPermissions[child.id]);
        return hasAccess;
      });

      return {
        ...group,
        children: filteredChildren,
      };
    }).filter(group => group.children.length > 0); // Приховуємо порожні групи
  }, [user?.role, user?.workRole, userPermissions]);

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

      // Фільтруємо ресторани або показуємо всі
      const currentSchedule = restaurantFilter
        ? restaurants.find((r) => r.id === parseInt(restaurantFilter))?.schedule || schedule
        : schedule;

      const currentRestaurantName = restaurantFilter
        ? restaurants.find((r) => r.id === parseInt(restaurantFilter))?.name || ""
        : "";

      return (
        <div className="card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-900">
              Графік роботи{currentRestaurantName ? ` - ${currentRestaurantName}` : ""}
            </h2>
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold text-slate-700">Ресторан:</label>
              <select
                className={`${baseInput} w-64`}
                value={restaurantFilter}
                onChange={(e) => setRestaurantFilter(e.target.value)}
              >
                <option value="">Всі ресторани</option>
                {restaurants.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {days.map((d) => (
              <div key={d.key} className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                <p className="text-sm font-semibold text-slate-800 mb-2">{d.label}</p>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    className={baseInput}
                    value={currentSchedule[d.key].from}
                    onChange={async (e) => {
                      if (restaurantFilter) {
                        const restId = restaurantFilter;
                        const restaurant = restaurants.find((r) => r.id === restId);
                        if (restaurant) {
                          const updatedSchedule = {
                            ...restaurant.schedule,
                            [d.key]: { ...restaurant.schedule[d.key], from: e.target.value },
                          };
                          try {
                            await updateRestaurantInFirebase(restId, {
                              ...restaurant,
                              schedule: updatedSchedule,
                            });
                          } catch (error) {
                            console.error("Помилка оновлення графіка:", error);
                          }
                        }
                      } else {
                        setSchedule((p) => ({
                          ...p,
                          [d.key]: { ...p[d.key], from: e.target.value },
                        }));
                      }
                    }}
                  />
                  <span className="text-xs text-slate-500">до</span>
                  <input
                    type="time"
                    className={baseInput}
                    value={currentSchedule[d.key].to}
                    onChange={async (e) => {
                      if (restaurantFilter) {
                        const restId = restaurantFilter;
                        const restaurant = restaurants.find((r) => r.id === restId);
                        if (restaurant) {
                          const updatedSchedule = {
                            ...restaurant.schedule,
                            [d.key]: { ...restaurant.schedule[d.key], to: e.target.value },
                          };
                          try {
                            await updateRestaurantInFirebase(restId, {
                              ...restaurant,
                              schedule: updatedSchedule,
                            });
                          } catch (error) {
                            console.error("Помилка оновлення графіка:", error);
                          }
                        }
                      } else {
                        setSchedule((p) => ({
                          ...p,
                          [d.key]: { ...p[d.key], to: e.target.value },
                        }));
                      }
                    }}
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

      if (topTab === "projects") {
        const handleAddRestaurant = () => {
          setSelectedRestaurant({
            id: null,
            regNumber: "",
            name: "",
            businessUnit: "",
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
            schedule: {
              mon: { from: "", to: "" },
              tue: { from: "", to: "" },
              wed: { from: "", to: "" },
              thu: { from: "", to: "" },
              fri: { from: "", to: "" },
              sat: { from: "", to: "" },
              sun: { from: "", to: "" },
            },
          });
        };

        const handleEditRestaurant = async (restaurant) => {
          try {
            // Завантажуємо ПОВНІ дані ресторану з Firestore, щоб мати всі поля
            const fullRestaurant = await getRestaurant(restaurant.id);
            if (fullRestaurant) {
              setSelectedRestaurant(fullRestaurant);
            } else {
              console.error("Не вдалося завантажити дані ресторану");
              alert("Помилка завантаження даних ресторану");
            }
          } catch (error) {
            console.error("Помилка завантаження ресторану для редагування:", error);
            alert("Помилка завантаження даних ресторану");
          }
        };

        const handleDeleteRestaurant = async (id) => {
          if (!confirm("Ви впевнені, що хочете видалити цей ресторан?")) {
            return;
          }
          
          try {
            console.log("Видалення ресторану з ID:", id);
            console.log("Поточний користувач:", user);
            console.log("Роль користувача:", user?.role);
            
            await deleteRestaurantFromFirebase(id);
            console.log("Ресторан успішно видалено");
            alert("✅ Ресторан успішно видалено!");
          } catch (error) {
            console.error("Помилка видалення ресторану:", error);
            console.error("Код помилки:", error.code);
            console.error("Повідомлення:", error.message);
            
            if (error.code === "permission-denied") {
              alert("❌ Відмовлено в доступі!\n\nТільки адміністратори можуть видаляти ресторани.\nВаша роль: " + (user?.role || "невідомо"));
            } else {
              alert(`❌ Помилка видалення ресторану: ${error.message}`);
            }
          }
        };

        const handleSaveRestaurant = async () => {
          try {
            if (selectedRestaurant.id) {
              // Оновлення існуючого
              await updateRestaurantInFirebase(selectedRestaurant.id, selectedRestaurant);
            } else {
              // Додавання нового
              await addRestaurantToFirebase(selectedRestaurant);
            }
            setSelectedRestaurant(null);
          } catch (error) {
            console.error("Помилка збереження ресторану:", error);
            alert("Помилка збереження ресторану. Перевірте консоль.");
          }
        };

        const handleCancelEdit = () => {
          setSelectedRestaurant(null);
        };

        if (selectedRestaurant) {
          // Форма редагування/додавання
          return (
            <div className="card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">
                  {selectedRestaurant.id ? "Редагування ресторану" : "Додавання ресторану"}
                </h2>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300"
                >
                  Скасувати
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="text-sm font-semibold text-slate-800">Обліковий номер</label>
                  <input
                    className={baseInput}
                    value={selectedRestaurant.regNumber}
                    onChange={(e) =>
                      setSelectedRestaurant((p) => ({ ...p, regNumber: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-800">Назва</label>
                  <input
                    className={baseInput}
                    value={selectedRestaurant.name}
                    onChange={(e) =>
                      setSelectedRestaurant((p) => ({ ...p, name: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-800">Бізнес-напрям</label>
                  <select
                    className={baseInput}
                    value={selectedRestaurant.businessUnit || ""}
                    onChange={(e) =>
                      setSelectedRestaurant((p) => ({ ...p, businessUnit: e.target.value }))
                    }
                  >
                    <option value="">Оберіть бізнес-напрям</option>
                    {businessUnits.map((bu) => (
                      <option key={bu} value={bu}>
                        {bu}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-700">Адреса</p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Країна</label>
                    <input
                      className={baseInput}
                      value={selectedRestaurant.country}
                      onChange={(e) =>
                        setSelectedRestaurant((p) => ({ ...p, country: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Область</label>
                    <input
                      className={baseInput}
                      value={selectedRestaurant.region}
                      onChange={(e) =>
                        setSelectedRestaurant((p) => ({ ...p, region: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Місто / Село</label>
                    <input
                      className={baseInput}
                      value={selectedRestaurant.city}
                      onChange={(e) =>
                        setSelectedRestaurant((p) => ({ ...p, city: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Вулиця</label>
                    <input
                      className={baseInput}
                      value={selectedRestaurant.street}
                      onChange={(e) =>
                        setSelectedRestaurant((p) => ({ ...p, street: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Поштовий індекс</label>
                    <input
                      className={baseInput}
                      value={selectedRestaurant.postalCode}
                      onChange={(e) =>
                        setSelectedRestaurant((p) => ({ ...p, postalCode: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="editHasTerrace"
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    checked={selectedRestaurant.hasTerrace}
                    onChange={(e) =>
                      setSelectedRestaurant((p) => ({ ...p, hasTerrace: e.target.checked }))
                    }
                  />
                  <label htmlFor="editHasTerrace" className="text-sm font-semibold text-slate-800">
                    Розділяти літо / зима
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-semibold text-slate-800">
                      Посадкові місця (всього)
                    </label>
                    <input
                      className={baseInput}
                      value={selectedRestaurant.seatsTotal}
                      onChange={(e) =>
                        setSelectedRestaurant((p) => ({ ...p, seatsTotal: e.target.value }))
                      }
                      disabled={selectedRestaurant.hasTerrace}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-800">
                      Посадкові місця (літо)
                    </label>
                    <input
                      className={baseInput}
                      value={selectedRestaurant.seatsSummer}
                      onChange={(e) =>
                        setSelectedRestaurant((p) => ({ ...p, seatsSummer: e.target.value }))
                      }
                      disabled={!selectedRestaurant.hasTerrace}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-800">
                      Посадкові місця (зима)
                    </label>
                    <input
                      className={baseInput}
                      value={selectedRestaurant.seatsWinter}
                      onChange={(e) =>
                        setSelectedRestaurant((p) => ({ ...p, seatsWinter: e.target.value }))
                      }
                      disabled={!selectedRestaurant.hasTerrace}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Площа, м² (всього)</label>
                    <input
                      className={baseInput}
                      value={selectedRestaurant.areaTotal}
                      onChange={(e) =>
                        setSelectedRestaurant((p) => ({ ...p, areaTotal: e.target.value }))
                      }
                      disabled={selectedRestaurant.hasTerrace}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Площа, м² (літо)</label>
                    <input
                      className={baseInput}
                      value={selectedRestaurant.areaSummer}
                      onChange={(e) =>
                        setSelectedRestaurant((p) => ({ ...p, areaSummer: e.target.value }))
                      }
                      disabled={!selectedRestaurant.hasTerrace}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Площа, м² (зима)</label>
                    <input
                      className={baseInput}
                      value={selectedRestaurant.areaWinter}
                      onChange={(e) =>
                        setSelectedRestaurant((p) => ({ ...p, areaWinter: e.target.value }))
                      }
                      disabled={!selectedRestaurant.hasTerrace}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-800">Нотатки</label>
                <textarea
                  className={`${baseInput} min-h-[100px]`}
                  value={selectedRestaurant.notes}
                  onChange={(e) =>
                    setSelectedRestaurant((p) => ({ ...p, notes: e.target.value }))
                  }
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-5 py-2 rounded-lg bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 shadow"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  onClick={handleSaveRestaurant}
                  className="px-5 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 shadow"
                >
                  Зберегти
                </button>
              </div>
            </div>
          );
        }

        // Список ресторанів
        return (
          <div className="card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-900">
                {user?.role === 'admin' ? 'Управління проєктами' : 'Мій ресторан'}
              </h2>
              {user?.role === 'admin' && (
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    ref={(input) => (window.restaurantImportInput = input)}
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      if (file) {
                        try {
                          const importedRestaurants = await importRestaurantsFromExcel(file);
                          for (const restaurant of importedRestaurants) {
                            await addRestaurantToFirebase(restaurant);
                          }
                          alert(`Успішно імпортовано ${importedRestaurants.length} ресторанів`);
                        } catch (error) {
                          console.error("Помилка імпорту:", error);
                          alert("Помилка імпорту файлу. Перевірте формат файлу.");
                        }
                        e.target.value = "";
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => downloadRestaurantTemplate()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-600 text-white font-semibold hover:bg-slate-500 shadow text-sm"
                  >
                    <FileDown size={16} />
                    Шаблон
                  </button>
                  <button
                    type="button"
                    onClick={() => window.restaurantImportInput?.click()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-500 shadow text-sm"
                  >
                    <Upload size={16} />
                    Імпорт
                  </button>
                  <button
                    type="button"
                    onClick={() => exportRestaurantsToExcel(restaurants)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 shadow text-sm"
                  >
                    <Download size={16} />
                    Експорт
                  </button>
                  <button
                    type="button"
                    onClick={handleAddRestaurant}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 shadow"
                  >
                    <Plus size={18} />
                    Додати ресторан
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Обліковий №
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Назва
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Бізнес-напрям
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Адреса
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Посадкові місця
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Площа, м²
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">
                      Дії
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {restaurants.map((restaurant) => (
                    <tr key={restaurant.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 text-sm text-slate-800">
                        {restaurant.regNumber}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-800 font-medium">
                        {restaurant.name}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600">
                        {restaurant.businessUnit || "-"}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600">
                        {restaurant.street}, {restaurant.city}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600">
                        {restaurant.hasTerrace
                          ? `Літо: ${restaurant.seatsSummer}, Зима: ${restaurant.seatsWinter}`
                          : restaurant.seatsTotal}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-600">
                        {restaurant.hasTerrace
                          ? `Літо: ${restaurant.areaSummer}, Зима: ${restaurant.areaWinter}`
                          : restaurant.areaTotal}
                      </td>
                      <td className="py-3 px-4 text-sm text-right">
                        {user?.role === 'admin' && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditRestaurant(restaurant)}
                              className="px-3 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium text-xs"
                            >
                              Редагувати
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRestaurant(restaurant.id)}
                              className="px-3 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium text-xs"
                            >
                              Видалити
                            </button>
                          </div>
                        )}
                        {user?.role !== 'admin' && (
                          <span className="text-xs text-slate-500">Тільки перегляд</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {restaurants.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  Немає ресторанів. Натисніть "Додати ресторан" щоб створити новий.
                </div>
              )}
            </div>
          </div>
        );
      }
    }

    if (activeNav === "settings-accounts") {
      if (topTab === "add") {
        return (
          <div className="grid grid-cols-1">
            <AddUserForm currentUser={user} onSuccess={() => setTopTab("edit")} />
          </div>
        );
      }

      if (topTab === "edit") {
        return (
          <div className="grid grid-cols-1">
            <UsersTable currentUser={user} />
          </div>
        );
      }
    }

    if (activeNav === "settings-permissions") {
      if (topTab === "roles") {
        return (
          <div className="grid grid-cols-1">
            <RolesPositionsManager />
          </div>
        );
      }
      if (topTab === "permissions") {
        return (
          <div className="grid grid-cols-1">
            <RolePermissionsManager menuStructure={menuStructureForPermissions} />
          </div>
        );
      }
    }

    if (activeNav === "inventory-assets" || activeNav.startsWith("reports-assets")) {
      if (topTab === "test1") {
        // Якщо це розділ звітів - показуємо фінансовий звіт
        if (activeNav.startsWith("reports-assets")) {
          return (
            <div className="grid grid-cols-1">
              <FinancialAssetsReport assets={assets} restaurants={restaurants} responsibilityCenters={businessUnits} />
            </div>
          );
        }
        // Якщо це розділ облікування активів - показуємо форму додавання
        return (
          <div className="grid grid-cols-1">
            <AssetForm selectedAsset={null} onSubmit={handleSubmit} currentUser={user} restaurants={restaurants} assets={assets} />
          </div>
        );
      }

      if (topTab === "test2") {
        // Якщо вибрано актив для редагування - показуємо форму
        if (selected) {
          return (
            <div className="grid grid-cols-1">
              <AssetForm selectedAsset={selected} onSubmit={handleSubmit} currentUser={user} restaurants={restaurants} assets={assets} />
            </div>
          );
        }
        
        // Інакше показуємо таблицю активів з кнопками редагування
        return (
          <div className="grid grid-cols-1">
            {(() => {
              // Фільтруємо активи на основі ролі користувача
              let assetsToShow = assets;
              if (user?.role !== 'admin' && user?.restaurant) {
                // Керуючий бачить тільки активи свого ресторану
                const userRestaurantName = restaurants.find(r => r.id === user.restaurant)?.name;
                assetsToShow = assets.filter(a => a.locationName === userRestaurantName);
              }
              
              return (
                <AssetTable
                  data={assetsToShow}
                  onEdit={setSelected}
                  onDelete={user?.role === 'admin' ? handleDeleteAsset : null}
                  filters={filters}
                  setFilters={setFilters}
                  onExport={handleExport}
                  headerTitle="Редагування активів"
                  headerSubtitle="Вибери актив для редагування"
                  hideLocationFilter={user?.role !== 'admin'}
                  isAdminOnly={user?.role === 'admin'}
                />
              );
            })()}
          </div>
        );
      }

      if (topTab === "test3") {
        return (
          <div className="grid grid-cols-1">
            <AssetFieldsManager />
          </div>
        );
      }

      if (topTab === "test4") {
        return (
          <div className="grid grid-cols-1">
            <FieldPermissionsManager />
          </div>
        );
      }

      if (topTab === "responsibility") {
        return (
          <div className="grid grid-cols-1">
            <MaterialResponsibilityManager />
          </div>
        );
      }

      return (
        <div className="grid grid-cols-1">
          {(() => {
            // Фільтруємо активи на основі ролі користувача
            let assetsToShow = assets;
            if (user?.role !== 'admin' && user?.restaurant) {
              // Керуючий бачить тільки активи свого ресторану
              const userRestaurantName = restaurants.find(r => r.id === user.restaurant)?.name;
              assetsToShow = assets.filter(a => a.locationName === userRestaurantName);
            }
            
            return (
              <AssetTable
                data={assetsToShow}
                onEdit={setSelected}
                filters={filters}
                setFilters={setFilters}
                onExport={handleExport}
                headerTitle="Редагування"
                headerSubtitle="Експорт / Імпорт"
                hideLocationFilter={user?.role !== 'admin'}
              />
            );
          })()}
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
      {authLoading && (
        <div className="fixed inset-0 bg-slate-900 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <p className="text-slate-900 font-semibold">Завантаження...</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Блокування доступу для неавторизованих користувачів */}
      {!authLoading && !isAuthenticated ? (
        <div className="fixed inset-0 bg-slate-900 flex items-center justify-center z-40">
          <div className="max-w-md w-full mx-4">
            <div className="bg-slate-800 rounded-lg p-8 shadow-2xl border border-slate-700">
              <div className="text-center mb-6">
                <p className="text-4xl font-bold text-indigo-400 mb-2">LUCI</p>
                <p className="text-xs uppercase tracking-wider text-slate-400">
                  La Famiglia Unified Control & Intelligence
                </p>
              </div>
              <div className="space-y-4">
                <p className="text-slate-300 text-center">
                  Для доступу до системи необхідно авторизуватися
                </p>
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="w-full px-6 py-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition text-lg font-semibold"
                >
                  Увійти
                </button>
                <button
                  onClick={() => setShowRegisterModal(true)}
                  className="w-full px-6 py-3 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition text-lg font-medium"
                >
                  Зареєструватися
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-screen gap-0">
        {/* Top Header Bar */}
        <div className="fixed top-0 left-72 right-0 h-14 bg-slate-900/95 border-b border-slate-700 z-30 flex items-center justify-between px-6">
          {isAuthenticated ? (
            <>
              {/* Плашки ліворуч */}
              <div className="flex items-center gap-3">
                {/* Назва ресторану для всіх */}
                {user?.restaurant && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-900/30 border border-emerald-700/50 text-emerald-300">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span className="text-sm font-semibold">
                      {restaurants.find(r => r.id === user.restaurant)?.name || 'Невідомий ресторан'}
                    </span>
                  </div>
                )}
                
                {/* Робоча роль */}
                {user?.workRole && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-900/30 border border-indigo-700/50 text-indigo-300">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm font-semibold">
                      {user.workRole}
                    </span>
                  </div>
                )}
              </div>
              
              {/* Користувач та вихід - праворуч */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <UserIcon size={16} />
                  <span>{user?.displayName || user?.email}</span>
                  {user?.role === "admin" && (
                    <span className="px-2 py-1 rounded bg-indigo-600 text-white text-xs font-semibold">
                      Admin
                    </span>
                  )}
                </div>
                <button
                  onClick={async () => {
                    try {
                      await logoutUser();
                    } catch (error) {
                      console.error("Помилка виходу:", error);
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition text-sm font-medium"
                >
                  <LogOut size={16} />
                  Вийти
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setShowLoginModal(true);
                  setShowAuthWarning(false);
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition text-sm font-medium"
              >
                Увійти
              </button>
              <button
                onClick={() => {
                  setShowRegisterModal(true);
                  setShowAuthWarning(false);
                }}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition text-sm font-semibold"
              >
                Реєстрація
              </button>
            </div>
          )}
        </div>

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
                            localStorage.setItem('lucia_activeNav', item.id);
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
        <main className="flex-1 ml-72 mt-14 overflow-auto transition-all duration-300">
          {topTabs.length > 0 && (
            <div className="sticky top-0 z-30 bg-slate-900/95 border-b border-slate-800 shadow-lg shadow-slate-900/40">
              <div className="w-full px-0 lg:px-0 h-10 flex gap-0 overflow-x-auto items-stretch justify-start">
                {topTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setTopTab(tab.id);
                      localStorage.setItem('lucia_topTab', tab.id);
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
      )}

      {/* Auth Modals */}
      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onSwitchToRegister={() => {
            setShowLoginModal(false);
            setShowRegisterModal(true);
          }}
          onLoginSuccess={() => {
            // Перенаправлення на дашборд після успішного входу
            setActiveNav("dashboard-overview");
            localStorage.setItem('lucia_activeNav', "dashboard-overview");
          }}
        />
      )}

      {showRegisterModal && (
        <RegisterModal
          onClose={() => setShowRegisterModal(false)}
          onSwitchToLogin={() => {
            setShowRegisterModal(false);
            setShowLoginModal(true);
          }}
        />
      )}
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
