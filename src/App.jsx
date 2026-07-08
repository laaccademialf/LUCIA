import { useCallback, useEffect, useMemo, useState, useRef, lazy, Suspense } from "react";
import DeployInfo from "./components/DeployInfo";
import { ClockBadgeTime } from "./components/ClockBadge";
import {
  Archive,
  BarChart3,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Download,
  FileDown,
  Folder,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings,
  Shield,
  Truck,
  TrendingDown,
  TrendingUp,
  Upload,
  UserIcon,
  Users,
  Wifi,
  WifiOff,
  Wrench,
} from "lucide-react";
import clsx from "clsx";
import { AssetTable } from "./components/AssetTable";
import AssetSearch from "./components/AssetSearch";
import { AssetForm } from "./components/AssetForm";
import { AddUserForm } from "./components/AddUserForm";
import { LoginModal } from "./components/LoginModal";
import { UsersTable } from "./components/UsersTable";
import UtilityMetersManager from "./components/UtilityMetersManager";
import UtilitiesManagementModule from "./components/UtilitiesManagementModule";
import ElectricityTab from "./components/ElectricityTab";
import DatePickerPopover from "./components/DatePickerPopover";
import { MaterialResponsibilityManager } from "./components/MaterialResponsibilityManager";
import AssetTransferWriteoffManager from "./components/AssetTransferWriteoffManager";
import { useAuth } from "./hooks/useAuth";
import NotificationPanel from "./components/NotificationPanel";
import { logoutUser } from "./firebase/auth";
import { useMenuStructure } from "./hooks/useMenuStructure";
import { getRolePermissions } from "./firebase/permissions";
import {
  startAssetInventorySession as startAssetInventorySessionInFirestore,
  endAssetInventorySession as endAssetInventorySessionInFirestore,
  deleteAssetInventorySession as deleteAssetInventorySessionInFirestore,
  subscribeToActiveAssetInventorySession,
  subscribeToAssetInventorySessions,
} from "./firebase/firestore";
import { useRestaurants } from "./hooks/useRestaurants";
import { useAssets } from "./hooks/useAssets";
import { useAssetFields } from "./hooks/useAssetFields";
import {
  getUtilityMeters,
  addUtilityMeter,
  updateUtilityMeterPrice,
  deleteUtilityMeter,
} from "./firebase/utilityMeters";
import { useChecklists } from "./hooks/useChecklists";
import { useServiceRequests } from "./hooks/useServiceRequests";
import { logAuditEvent } from "./firebase/audit";
import { isCollectionsApiEnabled, getCollectionItemApi, listCollectionItemsApi } from "./api/collectionsApi";
import { batchImportAssetsApi, isAssetsApiEnabled } from "./api/assetsApi";
import { getLegalNotificationsApi, isLegalApiEnabled } from "./api/legalTasksApi";
import { isLegalUser, LEGAL_NAV_ID, getLegalUserIdentityKeys, normalizeLegalIdentity } from "./data/legalConstants";


const loadExcelHelpers = () => import("./utils/excelHelpers");

const RolesPositionsManager = lazy(() =>
  import("./components/RolesPositionsManager").then((module) => ({ default: module.RolesPositionsManager }))
);
const RolePermissionsManager = lazy(() =>
  import("./components/RolePermissionsManager").then((module) => ({ default: module.RolePermissionsManager }))
);
const FieldPermissionsManager = lazy(() =>
  import("./components/FieldPermissionsManager").then((module) => ({ default: module.FieldPermissionsManager }))
);
const AssetFieldsManager = lazy(() =>
  import("./components/AssetFieldsManager").then((module) => ({ default: module.AssetFieldsManager }))
);
const FinancialAssetsReport = lazy(() => import("./components/FinancialAssetsReport"));
const AssetDetailedReport = lazy(() => import("./components/AssetDetailedReport"));
const MenuStructureEditor = lazy(() => import("./components/MenuStructureEditor"));
const ProductBookingModule = lazy(() => import("./components/ProductBookingModule"));
const CateringOperationsModule = lazy(() => import("./components/CateringOperationsModule"));
const TechnologicalCardModule = lazy(() => import("./components/TechnologicalCardModule"));
const ServiceRequestsModule = lazy(() => import("./components/ServiceRequestsModule"));
const LegalModule = lazy(() => import("./components/LegalModule"));
const ChecklistModule = lazy(() => import("./components/ChecklistModule"));
const HaccpModule = lazy(() => import("./components/HaccpModule"));
const TeamHiringModule = lazy(() => import("./components/TeamHiringModule"));
const SecurityAuditModule = lazy(() => import("./components/SecurityAuditModule"));
const PaymentRegistryModule = lazy(() => import("./components/PaymentRegistryModule"));
const AssortmentMatrixModule = lazy(() => import("./components/AssortmentMatrixModule"));
const DatabaseConnectionsManager = lazy(() => import("./components/DatabaseConnectionsManager"));
const ProfileSettingsModal = lazy(() => import("./components/ProfileSettingsModal"));

const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "1.0.3";
const LOGIN_AUDIT_MARKER_KEY = "lucia_login_audit_marker";
const ADMIN_ONLY_NAV_IDS = new Set(["settings-permissions", "menu-admin", "security-audit"]);
const NAV_ICON_MAP = {
  LayoutDashboard,
  Settings,
  ClipboardList,
  Archive,
  BarChart3,
  Shield,
  Truck,
  Users,
  Wrench,
  Folder,
};
const NAV_SECTION_ICON_BY_ID = {
  dashboard: "LayoutDashboard",
  settings: "Settings",
  operations: "ClipboardList",
  inventory: "Archive",
  reports: "BarChart3",
  security: "Shield",
  supplier: "Truck",
  suppliers: "Truck",
  vendor: "Truck",
  team: "Users",
  maintenance: "Wrench",
};

const normalizeIconKey = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]/g, "")
  .replace(/icon$/, "");

const resolveNavIconComponent = (group) => {
  const rawIcon = String(group?.icon || "").trim();
  if (rawIcon && NAV_ICON_MAP[rawIcon]) {
    return NAV_ICON_MAP[rawIcon];
  }

  const normalizedRawIcon = normalizeIconKey(rawIcon);
  if (normalizedRawIcon) {
    const matched = Object.entries(NAV_ICON_MAP).find(([key]) => normalizeIconKey(key) === normalizedRawIcon);
    if (matched?.[1]) {
      return matched[1];
    }
  }

  const fallbackKey = NAV_SECTION_ICON_BY_ID[String(group?.id || "").trim()] || "Folder";
  return NAV_ICON_MAP[fallbackKey] || Folder;
};
const DEFAULT_FALLBACK_MENU_STRUCTURE = [
  {
    id: "dashboard",
    label: "Дашборд",
    icon: "LayoutDashboard",
    children: [{ id: "dashboard-ops", label: "Операційний огляд" }],
  },
  {
    id: "settings",
    label: "Налаштування",
    icon: "Settings",
    children: [
      { id: "settings-restaurant", label: "Дані ресторану" },
      { id: "settings-accounts", label: "Облікові записи" },
      { id: "settings-permissions", label: "Права доступу" },
      { id: "database", label: "Підключення до БД" },
    ],
  },
  {
    id: "operations",
    label: "Операції",
    icon: "ClipboardList",
    children: [
      { id: "ops-checklists", label: "Чек-листи" },
      { id: "ops-haccp", label: "HACCP журнали" },
      { id: "ops-maintenance", label: "Сервісні заявки" },
    ],
  },
  {
    id: "inventory",
    label: "Облік",
    icon: "Archive",
    children: [
      { id: "inventory-products", label: "Продукти" },
      {
        id: "inventory-technolog",
        label: "Технологічні карти",
        children: [
          { id: "newtechnologicalcard", label: "Нова карта" },
        ],
      },
      { id: "inventory-utilities", label: "Утиліти" },
      { id: "inventory-assets", label: "Основні засоби" },
    ],
  },
  {
    id: "reports",
    label: "Звіти",
    icon: "BarChart3",
    children: [
      { id: "reports-products", label: "Інвентаризація продуктів" },
      { id: "reports-assets", label: "Основні засоби" },
    ],
  },
  {
    id: "security",
    label: "Безпека",
    icon: "Shield",
    children: [{ id: "security-audit", label: "Аудит дій" }],
  },
  {
    id: "team",
    label: "Команда",
    icon: "Users",
    children: [{ id: "team-roles", label: "Ролі та доступи" }],
  },
  {
    id: "maintenance",
    label: "Сервіс",
    icon: "Wrench",
    children: [{ id: "maintenance-plan", label: "Планові роботи" }],
  },
];

const isManagerLikeUser = (user) => {
  const roleValue = String(user?.role || "").toLowerCase();
  const workRoleValue = String(user?.workRole || "").toLowerCase();
  return roleValue.includes("manager") || roleValue.includes("керуюч") || workRoleValue.includes("manager") || workRoleValue.includes("керуюч");
};

const isFinanceLikeUser = (user) => {
  const roleValue = String(user?.role || "").toLowerCase();
  const workRoleValue = String(user?.workRole || "").toLowerCase();
  const terms = ["finance", "financial", "фін", "директор", "cfo"];
  return roleValue === "admin" || terms.some((term) => roleValue.includes(term) || workRoleValue.includes(term));
};

const toMinutes = (value) => {
  if (!value || typeof value !== "string" || !value.includes(":")) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

const fromMinutes = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  const normalized = ((value % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const ASSET_FIELD_LABELS = {
  invNumber: "Інв. номер",
  invNumber1C: "Інв. номер 1С",
  name: "Назва активу",
  category: "Категорія",
  subCategory: "Підкатегорія",
  type: "Тип обліку",
  inventoryQuantity: "Первинна інв. к-сть",
  nextInventoryQuantity: "Наступна інв. к-сть",
  serialNumber: "Серійний номер",
  brand: "Бренд",
  businessUnit: "Локація",
  locationName: "Локація (детально)",
  zone: "Зона",
  respCenter: "Відповідальний підрозділ",
  respPerson: "Відповідальна особа",
  functionality: "Працездатність",
  relevance: "Актуальність",
  purchaseYear: "Дата придбання",
  commissionDate: "Дата введення",
  normativeTerm: "Нормативний строк",
  residualValuePerUnit: "Залишкова за 1 шт",
  marketValue: "Ринкова вартість",
  auditDate: "Дата інвентаризації",
  auditors: "Члени комісії",
  reasonComment: "Коментар до причини",
  newLocation: "Нова локація",
  initialCost: "Початкова вартість",
  marketValueNew: "Ринкова вартість (нова)",
  marketValueUsed: "Ринкова вартість (б/в)",
  residualValue: "Залишкова вартість",
  status: "Статус",
  condition: "Стан",
  physicalWear: "Фізичний знос",
  moralWear: "Моральний знос",
  totalWear: "Загальний знос",
  decision: "Рішення",
  reason: "Причина",
  comment: "Коментар",
  created: "Створення активу",
};

const getAssetFieldLabel = (field) => ASSET_FIELD_LABELS[String(field || "")] || String(field || "-");
const normalizeLowerText = (value) => String(value || "").trim().toLowerCase();
const NAVIGATION_QUERY_NAV_KEY = "nav";
const NAVIGATION_QUERY_TAB_KEY = "tab";

const NAV_ID_ALIASES = {
  technologicalcard: "inventory-technolog",
  "technological-card": "inventory-technolog",
  technologicalcards: "inventory-technolog",
  "technological-cards": "inventory-technolog",
  technologcard: "inventory-technolog",
};

const normalizeNavigationId = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return NAV_ID_ALIASES[normalized.toLowerCase()] || normalized;
};

const getNavigationStateFromLocation = () => {
  if (typeof window === "undefined") {
    return { activeNav: "", topTab: "" };
  }

  const url = new URL(window.location.href);

  return {
    activeNav: normalizeNavigationId(url.searchParams.get(NAVIGATION_QUERY_NAV_KEY)),
    topTab: String(url.searchParams.get(NAVIGATION_QUERY_TAB_KEY) || "").trim(),
  };
};

const buildNavigationUrl = (activeNav, topTab) => {
  if (typeof window === "undefined") return "";

  const url = new URL(window.location.href);
  const normalizedActiveNav = normalizeNavigationId(activeNav);
  const normalizedTopTab = String(topTab || "").trim();

  if (normalizedActiveNav) {
    url.searchParams.set(NAVIGATION_QUERY_NAV_KEY, normalizedActiveNav);
  } else {
    url.searchParams.delete(NAVIGATION_QUERY_NAV_KEY);
  }

  if (normalizedTopTab) {
    url.searchParams.set(NAVIGATION_QUERY_TAB_KEY, normalizedTopTab);
  } else {
    url.searchParams.delete(NAVIGATION_QUERY_TAB_KEY);
  }

  return `${url.pathname}${url.search}${url.hash}`;
};



const getPlannedTime = (item, scheduleByDay, dayKey) => {
  const mode = item?.timeMode || "before_open";
  const daySchedule = scheduleByDay?.[dayKey] || { from: "", to: "" };
  const openMinutes = toMinutes(daySchedule.from);
  const closeMinutes = toMinutes(daySchedule.to);
  const offset = Number(item?.offsetMinutes || 0);

  if (mode === "exact") return item?.exactTime || "";
  if (mode === "before_open" && openMinutes !== null) return fromMinutes(openMinutes - offset);
  if (mode === "after_open" && openMinutes !== null) return fromMinutes(openMinutes + offset);
  if (mode === "before_close" && closeMinutes !== null) return fromMinutes(closeMinutes - offset);
  return "";
};

const getOverdueText = (plannedDate, nowDate) => {
  const diffMinutes = Math.max(1, Math.floor((nowDate.getTime() - plannedDate.getTime()) / 60000));
  if (diffMinutes < 60) return `Прострочено на ${diffMinutes} хв`;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return `Прострочено на ${hours} год ${minutes} хв`;
};

const playChecklistAlertTone = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const audioContext = new AudioCtx();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.25);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.26);
    oscillator.onended = () => {
      audioContext.close();
    };
  } catch (error) {
    console.warn("Не вдалося відтворити сигнал сповіщення:", error);
  }
};

// Чи має користувач доступ до вкладки "Адміністрування заявок" (Сервісні заявки).
// Тільки таким користувачам приходять сповіщення про нові сервісні заявки.
const isServiceAdminUser = (user, userPermissions) => {
  if (!user) return false;
  if (String(user?.role || "").toLowerCase() === "admin") return true;
  const allowed = userPermissions?.["ops-maintenance"];
  if (allowed === true) return true;
  if (Array.isArray(allowed)) {
    return allowed.some((tabId) => {
      const value = String(tabId || "").toLowerCase();
      return value.includes("admin") || value.includes("process") || value.includes("оброб");
    });
  }
  return false;
};

const getNotificationReadAndDismissedSets = () => {
  try {
    const readRaw = JSON.parse(localStorage.getItem("lucia_notification_read_ids") || "[]");
    const dismissedRaw = JSON.parse(localStorage.getItem("lucia_notification_dismissed_ids") || "[]");
    const readSet = new Set(Array.isArray(readRaw) ? readRaw.map((id) => String(id)) : []);
    const dismissedSet = new Set(Array.isArray(dismissedRaw) ? dismissedRaw.map((id) => String(id)) : []);
    return { readSet, dismissedSet };
  } catch {
    return { readSet: new Set(), dismissedSet: new Set() };
  }
};

const getUnreadNotificationsCount = (items) => {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return 0;
  const { readSet, dismissedSet } = getNotificationReadAndDismissedSets();
  return list.reduce((count, item) => {
    const id = String(item?.key || item?.id || "");
    if (!id) return count;
    if (dismissedSet.has(id)) return count;
    if (readSet.has(id)) return count;
    return count + 1;
  }, 0);
};

const buildStableNotificationKey = (prefix, parts = []) => {
  const normalizedParts = Array.isArray(parts) ? parts : [parts];
  const body = normalizedParts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("|");
  return `${String(prefix || "n").trim() || "n"}_${body || "unknown"}`;
};

const playCenterAlertTone = () => {
  try {
    const audioEnabledRaw = localStorage.getItem("lucia_notification_audio_enabled");
    const audioEnabled = audioEnabledRaw === null ? true : Boolean(JSON.parse(audioEnabledRaw));
    if (!audioEnabled) return;

    const volumeRaw = parseFloat(localStorage.getItem("lucia_notification_volume") || "0.5");
    const volume = Number.isFinite(volumeRaw) ? Math.max(0, Math.min(1, volumeRaw)) : 0.5;
    if (volume <= 0) return;

    const audio = new Audio("/oh-oh-icq-sound.mp3");
    audio.volume = volume;
    audio.play().catch(() => {});
  } catch {
    // ignore audio errors
  }
};

function App() {
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  });

  useEffect(() => {
    let isDisposed = false;

    const probeConnectivity = async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!isDisposed) setIsOnline(false);
        return;
      }

      const probeTargets = [
        `https://api.ipify.org?format=json&net_probe=${Date.now()}`,
        `https://httpbin.org/ip?net_probe=${Date.now()}`,
      ];

      let hasSuccess = false;

      for (const probeUrl of probeTargets) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        try {
          const response = await fetch(probeUrl, {
            method: "GET",
            cache: "no-store",
            credentials: "omit",
            headers: {
              Accept: "application/json",
            },
            signal: controller.signal,
          });

          if (!response.ok) {
            continue;
          }

          const payload = await response.json();
          const ipValue = String(payload?.ip || payload?.origin || "").trim();
          if (ipValue) {
            hasSuccess = true;
            break;
          }
        } catch {
          // Try the next probe target.
        } finally {
          clearTimeout(timeoutId);
        }
      }

      if (!isDisposed) {
        setIsOnline(hasSuccess);
      }
    };

    const handleOnline = () => {
      void probeConnectivity();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleVisibilityOrFocus = () => {
      void probeConnectivity();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    const intervalId = setInterval(() => {
      void probeConnectivity();
    }, 10000);

    void probeConnectivity();

    return () => {
      isDisposed = true;
      clearInterval(intervalId);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, []);

                                  // --- Функція для завантаження всіх лічильників ---
                                  const fetchAllMeters = async () => {
                                    if (!user || user.role !== "admin" || !restaurants.length) return;
                                    setUtilityLoading(true);
                                    let all = [];
                                    for (const r of restaurants) {
                                      for (const type of ["electricity", "water_cold", "water_hot", "gas"]) {
                                        try {
                                          const meters = await getUtilityMeters(r.id, type);
                                          all = all.concat(meters);
                                        } catch (e) { /* ignore */ }
                                      }
                                    }
                                    setUtilityMeters(all);
                                    setUtilityLoading(false);
                                  };
                                // Стан розгортання груп меню
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
                            // Модальне вікно логіну
                            const [showLoginModal, setShowLoginModal] = useState(false);
                            const [showProfileModal, setShowProfileModal] = useState(false);
                          // Стан бокового меню
                          const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
                          const [sidebarOpen, setSidebarOpen] = useState(false);
                        // Мобільний режим
                        const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
                      // Активи
                      const [assets, setAssets] = useState([]);
                      // Стан для вибраного активу (редагування)
                      const [selected, setSelected] = useState(null);
                      const submitAssetLockRef = useRef(false);
                      // Стан для фільтрів таблиці активів
                      const [filters, setFilters] = useState({});
                      const [assetTableSearchQuery, setAssetTableSearchQuery] = useState("");
                      const [assetTableInventoryStateFilter, setAssetTableInventoryStateFilter] = useState("all");
                      // Стан для центрів відповідальності (business units)
                      const [businessUnits, setBusinessUnits] = useState([]);
                      // Стан для фільтрації ресторану у графіку
                      const [restaurantFilter, setRestaurantFilter] = useState("");
                      // Фільтр закладу для дашборду утиліт ("" = всі доступні заклади).
                      const [dashboardRestaurantFilter, setDashboardRestaurantFilter] = useState("");
                      // Фільтр дати для дашборду утиліт ("" = вчора).
                      const [dashboardDateFilter, setDashboardDateFilter] = useState("");
                      // Модальне вікно «Загальна інформація» по всіх закладах.
                      const [showDashboardSummaryModal, setShowDashboardSummaryModal] = useState(false);
                      // Стан для вибраного ресторану (редагування)
                      const [selectedRestaurant, setSelectedRestaurant] = useState(null);
                      // Стан для форми ресторану
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
                      // Стан для графіку роботи ресторану (schedule)
                      const [schedule, setSchedule] = useState({
                        mon: { from: "09:00", to: "18:00" },
                        tue: { from: "09:00", to: "18:00" },
                        wed: { from: "09:00", to: "18:00" },
                        thu: { from: "09:00", to: "18:00" },
                        fri: { from: "09:00", to: "18:00" },
                        sat: { from: "09:00", to: "18:00" },
                        sun: { from: "09:00", to: "18:00" },
                      });
                    // Права користувача
                    const [userPermissions, setUserPermissions] = useState({});
                    const [roleRestaurantIds, setRoleRestaurantIds] = useState([]);
                    const [roleRestaurantsConfigured, setRoleRestaurantsConfigured] = useState(false);
                  // Структура меню
                  const { menuStructure, save, loading: menuLoading, error: menuError } = useMenuStructure();
                // Firebase активи
                const {
                  assets: firebaseAssets,
                  loading: assetsLoading,
                  addAsset: addAssetToFirebase,
                  updateAsset: updateAssetInFirebase,
                  deleteAsset: deleteAssetFromFirebase,
                  refreshAssets: refreshAssetsFromApi,
                } = useAssets();
              // Лічильники утиліт
              const [utilityMeters, setUtilityMeters] = useState([]);
              // Стан завантаження лічильників утиліт
              const [utilityLoading, setUtilityLoading] = useState(false);
            // Firebase ресторани
            const {
              restaurants: firebaseRestaurants,
              loading: restaurantsLoading,
              addRestaurant: addRestaurantToFirebase,
              updateRestaurant: updateRestaurantInFirebase,
              deleteRestaurant: deleteRestaurantFromFirebase,
            } = useRestaurants();
            const { businessUnits: assetBusinessUnits } = useAssetFields();
          const { templates: checklistTemplates, executions: checklistExecutions } = useChecklists(true);
          const { requests: serviceRequests } = useServiceRequests(true);
          // Користувач
          const { user, loading: authLoading, isAuthenticated } = useAuth();
        // Список ресторанів
        const [restaurants, setRestaurants] = useState([]);
        // Показники електроенергії (для огляду системи на дашборді)
        const [electricityReadings, setElectricityReadings] = useState([]);
      const initialNavigationRef = useRef(null);
      if (initialNavigationRef.current === null) {
        initialNavigationRef.current = getNavigationStateFromLocation();
      }
      // Головна вкладка
      const [topTab, setTopTab] = useState(() => {
        const urlTopTab = String(initialNavigationRef.current?.topTab || "").trim();
        if (urlTopTab) return urlTopTab;
        return localStorage.getItem('lucia_topTab') || "test1";
      });

      const [assetInventorySession, setAssetInventorySession] = useState(null);
      const [assetInventorySessionLoading, setAssetInventorySessionLoading] = useState(true);
      const [assetInventorySessionsHistory, setAssetInventorySessionsHistory] = useState([]);
    // Головна навігація
    const [activeNav, setActiveNav] = useState(() => {
      const urlActiveNav = normalizeNavigationId(initialNavigationRef.current?.activeNav);
      if (urlActiveNav) return urlActiveNav;
      return normalizeNavigationId(localStorage.getItem('lucia_activeNav')) || "reports-assets";
    });
  // --- Notification Center state ---
  const [notifications, setNotifications] = useState([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [externalNotificationTick, setExternalNotificationTick] = useState(0);
  const [checklistReminderTick, setChecklistReminderTick] = useState(0);
  const [legalCenterNotifications, setLegalCenterNotifications] = useState([]);
  const seenMissedChecklistKeysRef = useRef(new Set());
  const seenNotificationKeysRef = useRef(new Set());
  const notificationSoundInitializedRef = useRef(false);
  const userInteractedRef = useRef(false);
  const authAuditRef = useRef("");
  const hasSyncedBrowserHistoryRef = useRef(false);
  const isApplyingBrowserHistoryRef = useRef(false);
  const lastNavigationSnapshotRef = useRef("");

  const getLoginAuditMarker = useCallback(() => {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return "";

    const sessionToken = String(localStorage.getItem("lucia_auth_session_token") || "").trim();
    if (sessionToken) {
      return `session:${sessionToken}`;
    }

    const actorKey = String(user?.uid || user?.id || user?.userId || user?.email || "").trim();
    return actorKey ? `user:${actorKey}` : "";
  }, [user?.uid, user?.id, user?.userId, user?.email]);

  const writeAuditLog = (payload) => {
    if (!user) return;

    const actorId = String(user?.uid || user?.id || user?.userId || user?.email || "").trim();
    const actorName = user?.displayName || user?.fullName || user?.name || user?.email || actorId || "";
    const actorEmail = user?.email || "";

    void logAuditEvent({
      actorId,
      actorName,
      actorEmail,
      actorRole: user?.role || "",
      actorWorkRole: user?.workRole || "",
      activeNav,
      topTab,
      ...payload,
    }).catch((error) => {
      console.warn("Audit log write failed:", error);
    });
  };

  const persistNavigationState = useCallback((nextActiveNav, nextTopTab, historyMode = "push") => {
    if (typeof window === "undefined") return;

    const normalizedActiveNav = normalizeNavigationId(nextActiveNav);
    const normalizedTopTab = String(nextTopTab || "").trim();

    if (normalizedActiveNav) {
      localStorage.setItem("lucia_activeNav", normalizedActiveNav);
    } else {
      localStorage.removeItem("lucia_activeNav");
    }

    if (normalizedTopTab) {
      localStorage.setItem("lucia_topTab", normalizedTopTab);
    } else {
      localStorage.removeItem("lucia_topTab");
    }

    const nextUrl = buildNavigationUrl(normalizedActiveNav, normalizedTopTab);
    const nextState = {
      activeNav: normalizedActiveNav,
      topTab: normalizedTopTab,
    };

    if (historyMode === "replace") {
      window.history.replaceState(nextState, "", nextUrl);
      return;
    }

    window.history.pushState(nextState, "", nextUrl);
  }, []);

  const handleActiveNavChange = useCallback((nextActiveNav) => {
    setActiveNav(normalizeNavigationId(nextActiveNav));
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  const handleTopTabChange = useCallback((nextTopTab) => {
    setTopTab(nextTopTab);
    setSelected(null);
  }, []);

  useEffect(() => {
    if (!user) return;

    const actorKey = String(user?.uid || user?.id || user?.email || "").trim();
    if (!actorKey) return;
    if (authAuditRef.current === actorKey) return;

    const marker = getLoginAuditMarker();
    if (marker && typeof window !== "undefined" && typeof sessionStorage !== "undefined") {
      const existingMarker = String(sessionStorage.getItem(LOGIN_AUDIT_MARKER_KEY) || "").trim();
      if (existingMarker === marker) {
        authAuditRef.current = actorKey;
        return;
      }
      sessionStorage.setItem(LOGIN_AUDIT_MARKER_KEY, marker);
    }

    authAuditRef.current = actorKey;

    writeAuditLog({
      action: "login",
      entityType: "auth",
      entityId: actorKey,
      description: "Користувач увійшов у платформу",
      details: {
        lastLoginAt: new Date().toISOString(),
      },
    });
  }, [user?.uid, user?.id, user?.email, getLoginAuditMarker]);

  const baseInput =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";





  // --- Далі всі useEffect, useMemo, ... ---

  useEffect(() => {
    const markInteracted = () => {
      userInteractedRef.current = true;
    };

    window.addEventListener("pointerdown", markInteracted, { once: true });
    window.addEventListener("keydown", markInteracted, { once: true });

    return () => {
      window.removeEventListener("pointerdown", markInteracted);
      window.removeEventListener("keydown", markInteracted);
    };
  }, []);

  useEffect(() => {
    const onExternalNotifications = () => setExternalNotificationTick((v) => v + 1);
    window.addEventListener("lucia:notifications-updated", onExternalNotifications);
    return () => window.removeEventListener("lucia:notifications-updated", onExternalNotifications);
  }, []);

  useEffect(() => {
    const syncUnread = () => {
      setNotificationUnreadCount(getUnreadNotificationsCount(notifications));
    };

    syncUnread();
    window.addEventListener("lucia:notification-state-updated", syncUnread);
    window.addEventListener("storage", syncUnread);

    return () => {
      window.removeEventListener("lucia:notification-state-updated", syncUnread);
      window.removeEventListener("storage", syncUnread);
    };
  }, [notifications]);

  useEffect(() => {
    const id = setInterval(() => {
      setChecklistReminderTick((v) => v + 1);
    }, 30000);

    return () => clearInterval(id);
  }, []);

  // Серверні сповіщення (центр сповіщень): polling колекції legalNotifications,
  // фільтрація за поточним користувачем (персональні/рольові) для legal+haccp джерел.
  useEffect(() => {
    if (!user || !isLegalApiEnabled()) {
      setLegalCenterNotifications([]);
      return;
    }

    const currentUserIdentityKeys = getLegalUserIdentityKeys(user);
    const userIsLegal = isLegalUser(user);
    const userIsServiceAdmin = isServiceAdminUser(user, userPermissions);
    let cancelled = false;

    const loadLegal = async () => {
      try {
        const items = await getLegalNotificationsApi();
        if (cancelled) return;
        // Не показуємо сповіщення старші 7 днів — інакше після логіну на новому
        // пристрої/браузері вся історія виглядає як «нові» непрочитані.
        const notificationMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
        const nowTs = Date.now();
        const mapped = (Array.isArray(items) ? items : [])
          .filter((item) => {
            const createdTs = Date.parse(String(item?.createdAt || ""));
            if (Number.isFinite(createdTs) && nowTs - createdTs > notificationMaxAgeMs) return false;
            const source = String(item?.source || "").trim();
            if (source && source !== "legal" && source !== "haccp" && source !== "service") return false;
            const targetUserId = normalizeLegalIdentity(item?.targetUserId);
            const targetRole = String(item?.targetRole || "");
            if (targetUserId && currentUserIdentityKeys.includes(targetUserId)) return true;
            if (targetRole === "legal" && userIsLegal) return true;
            if (targetRole === "serviceadmin" && userIsServiceAdmin) return true;
            return false;
          })
          .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
          .slice(0, 50)
          .map((item) => {
            const key = buildStableNotificationKey("legal", [
              item.id,
              item.createdAt,
              item.targetUserId,
              item.targetRole,
              item.title,
              item.body,
            ]);
            const source = String(item?.source || "legal").trim() || "legal";
            const isHaccp = source === "haccp";
            const isService = source === "service";
            const fallbackTitle = isHaccp ? "HACCP сповіщення" : isService ? "Сервісна заявка" : "Юридична задача";
            return {
              key,
              id: key,
              type: source,
              title: String(item.title || fallbackTitle),
              time: item.createdAt
                ? new Date(item.createdAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })
                : "щойно",
              body: String(item.body || ""),
              createdAt: String(item.createdAt || ""),
              read: false,
              actionUrl: String(item.actionUrl || (isHaccp ? "haccpreport" : isService ? "ops-maintenance" : LEGAL_NAV_ID)),
              actionTab: String(item.actionTab || (isHaccp ? "haccpmainrepirt" : isService ? "Processingofapplications" : "legalrequest")),
              targetRequestId: isService ? String(item.taskId || "") : "",
              priority: "normal",
            };
          });
        setLegalCenterNotifications(mapped);
      } catch (error) {
        if (!cancelled) console.warn("Не вдалося завантажити юридичні сповіщення:", error);
      }
    };

    loadLegal();
    window.addEventListener("lucia:notifications-updated", loadLegal);
    const timer = setInterval(loadLegal, 20000);
    return () => {
      cancelled = true;
      window.removeEventListener("lucia:notifications-updated", loadLegal);
      clearInterval(timer);
    };
  }, [user, userPermissions]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setNotificationUnreadCount(0);
      seenMissedChecklistKeysRef.current = new Set();
      seenNotificationKeysRef.current = new Set();
      notificationSoundInitializedRef.current = false;
      return;
    }
    const currentUserIdentityKeys = getLegalUserIdentityKeys(user);
    const userIsLegal = isLegalUser(user);

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const dayKey = dayKeys[new Date(`${today}T00:00:00`).getDay()];
    const missedItems = [];

    const safeRestaurants = Array.isArray(restaurants) ? restaurants : [];

    for (const restaurant of safeRestaurants) {
      const restaurantTemplates = (checklistTemplates || []).filter((template) => {
        if (template?.isActive === false) return false;
        if (!Array.isArray(template?.items) || template.items.length === 0) return false;
        if (Array.isArray(template?.activeDays) && template.activeDays.length > 0 && !template.activeDays.includes(dayKey)) {
          return false;
        }
        if (!Array.isArray(template?.restaurantIds) || template.restaurantIds.length === 0) return true;
        return template.restaurantIds.map(String).includes(String(restaurant.id));
      });

      for (const template of restaurantTemplates) {
        const execution = (checklistExecutions || []).find(
          (item) =>
            String(item.restaurantId || "") === String(restaurant.id) &&
            String(item.date || "") === today &&
            String(item.kind || "") === String(template.kind || "opening")
        );

        for (const task of template.items || []) {
          const plannedTime = getPlannedTime(task, restaurant.schedule, dayKey);
          if (!plannedTime) continue;

          const plannedDate = new Date(`${today}T${plannedTime}:00`);
          if (Number.isNaN(plannedDate.getTime()) || plannedDate > now) continue;

          const done = Boolean(execution?.checks?.[task.id]?.done);
          if (done) continue;

          const reminderKey = `${today}_${restaurant.id}_${template.id}_${task.id}`;
          missedItems.push({
            key: reminderKey,
            title: `Пропущено чеклист: ${task.title || "Без назви"}`,
            time: getOverdueText(plannedDate, now),
            body: `${restaurant.name || "Ресторан"} · План: ${plannedTime} · ${template.kind === "shift" ? "Під час зміни" : "Відкриття"}`,
          });
        }
      }
    }

    const centerStorageNotifications = (() => {
      try {
        const raw = JSON.parse(localStorage.getItem("lucia_center_notifications") || "[]");
        if (!Array.isArray(raw)) return [];
        return raw
          .slice(0, 100)
          .filter((item) => {
            const targetUserId = normalizeLegalIdentity(item?.targetUserId);
            const targetRole = String(item?.targetRole || "");
            if (targetUserId && !currentUserIdentityKeys.includes(targetUserId)) return false;
            if (targetRole === "legal" && !userIsLegal) return false;
            return true;
          })
          .map((item) => {
            const source = String(item?.source || "payment").trim() || "payment";
            const fallbackTitle = source === "legal" ? "Юридична задача" : "Платіжне сповіщення";
            const stableKey = String(item.key || item.id || buildStableNotificationKey(source, [
              item.createdAt,
              item.targetUserId,
              item.targetRole,
              item.title,
              item.body,
              item.actionTab,
            ]));
            return {
              key: stableKey,
              id: String(item.id || stableKey),
              type: source,
              title: String(item.title || fallbackTitle),
              time: item.createdAt ? new Date(item.createdAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) : "щойно",
              body: String(item.body || ""),
              createdAt: String(item.createdAt || ""),
              read: false,
              actionUrl: String(item.actionUrl || (source === "legal" ? LEGAL_NAV_ID : "payments-registry")),
              actionTab: String(item.actionTab || (source === "legal" ? "legalrequest" : "")),
              priority: item.priority || "normal",
            };
          });
      } catch {
        return [];
      }
    })();

    missedItems.sort((a, b) => a.time.localeCompare(b.time));
    const checklistNotifications = missedItems.slice(0, 50).map((item) => ({
      ...item,
      key: item.key || buildStableNotificationKey("c", [item.title, item.body, item.createdAt]),
      id: item.key || buildStableNotificationKey("c", [item.title, item.body, item.createdAt]),
      type: "checklist",
      read: false,
      actionUrl: "checklists",
      priority: "high",
    }));
    const dedupedByIdentity = [];
    const seen = new Set();
    for (const item of [...centerStorageNotifications, ...checklistNotifications, ...legalCenterNotifications]) {
      const identity = `${String(item.type || "")}|${String(item.title || "")}|${String(item.body || "")}|${String(item.createdAt || "")}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      dedupedByIdentity.push(item);
    }

    const nextNotifications = dedupedByIdentity
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 50);
    setNotifications(nextNotifications);
    setNotificationUnreadCount(getUnreadNotificationsCount(nextNotifications));

    const currentNotificationKeys = new Set(
      nextNotifications
        .map((item) => String(item?.key || item?.id || ""))
        .filter(Boolean)
    );

    // Звук — лише для СПРАВДІ нових сповіщень:
    //  - ключ ще не бачений за цю сесію (накопичувальний set, щоб тимчасове
    //    випадання з топ-50 не давало повторний сигнал при поверненні)
    //  - не приховане/не прочитане користувачем
    //  - створене нещодавно (старі записи з БД не будять звуком; без createdAt —
    //    напр. чеклисти — дозволяємо, бо їх ключі стабільні в межах дня)
    const { readSet: soundReadSet, dismissedSet: soundDismissedSet } = getNotificationReadAndDismissedSets();
    const nowTs = Date.now();
    const NOTIFICATION_SOUND_FRESHNESS_MS = 3 * 60 * 1000;
    const hasNewNotifications = nextNotifications.some((item) => {
      const key = String(item?.key || item?.id || "");
      if (!key) return false;
      if (seenNotificationKeysRef.current.has(key)) return false;
      if (soundDismissedSet.has(key) || soundReadSet.has(key)) return false;
      const createdTs = Date.parse(String(item?.createdAt || ""));
      if (Number.isFinite(createdTs) && nowTs - createdTs > NOTIFICATION_SOUND_FRESHNESS_MS) return false;
      return true;
    });

    if (!notificationSoundInitializedRef.current) {
      notificationSoundInitializedRef.current = true;
    } else if (hasNewNotifications && userInteractedRef.current) {
      playCenterAlertTone();
    }

    // Накопичуємо ключі (не замінюємо), з м'яким лімітом розміру.
    for (const key of currentNotificationKeys) {
      seenNotificationKeysRef.current.add(key);
    }
    if (seenNotificationKeysRef.current.size > 2000) {
      seenNotificationKeysRef.current = new Set(currentNotificationKeys);
    }

    seenMissedChecklistKeysRef.current = new Set(checklistNotifications.map((item) => item.key));
  }, [
    user,
    restaurants,
    checklistTemplates,
    checklistExecutions,
    checklistReminderTick,
    externalNotificationTick,
    legalCenterNotifications,
  ]);

  // ...існуючий код App...

  // --- Utility meters effect ---
  useEffect(() => {
    if (
      activeNav === "inventory-utilities" &&
      topTab === "utilityservice" &&
      user &&
      restaurants.length > 0
    ) {
      fetchAllMeters();
    }
  }, [activeNav, topTab, restaurants, user]);


  // Sync Firebase data with local state
  useEffect(() => {
    if (!restaurantsLoading) {
      const normalizeText = (value) => String(value || "").trim().toLowerCase();
      const parseRestaurantList = (raw) => {
        if (Array.isArray(raw)) {
          return raw.map((value) => String(value || "").trim()).filter(Boolean);
        }
        if (typeof raw === "string") {
          const text = raw.trim();
          if (!text) return [];
          if (text.startsWith("[")) {
            try {
              const parsed = JSON.parse(text);
              if (Array.isArray(parsed)) {
                return parsed.map((value) => String(value || "").trim()).filter(Boolean);
              }
            } catch {
              // fallback to CSV parsing
            }
          }
          return text.split(",").map((value) => value.trim()).filter(Boolean);
        }
        return [];
      };
      const profileRestaurantCandidates = Array.from(
        new Set(
          [
            ...parseRestaurantList(user?.restaurants),
            ...parseRestaurantList(user?.restaurant_ids),
            ...parseRestaurantList(user?.restaurantIds),
            user?.restaurant,
            user?.restaurantId,
            user?.restaurant_id,
            user?.restaurantName,
            user?.restaurant_name,
          ]
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        )
      );
      const userRestaurantKey = String(profileRestaurantCandidates[0] || "").trim();
      const isRestaurantMatchedByProfile = (restaurant) => {
        const candidateId = String(restaurant?.id || "").trim();
        const candidateName = normalizeText(restaurant?.name);
        const candidateRegNumber = String(restaurant?.regNumber || restaurant?.reg_number || "").trim();

        if (profileRestaurantCandidates.length === 0) return false;
        for (const rawTarget of profileRestaurantCandidates) {
          const target = normalizeText(rawTarget);
          if (!target) continue;
          if (candidateId && candidateId === rawTarget) return true;
          if (candidateRegNumber && candidateRegNumber === rawTarget) return true;
          if (candidateName && candidateName === target) return true;
        }
        return false;
      };

      const matchRestaurantsByProfile = () => {
        let matched = firebaseRestaurants.filter(isRestaurantMatchedByProfile);

        // Conservative fallback: if exact match failed, allow a fuzzy name match
        // only when there is exactly one candidate.
        if (matched.length === 0) {
          for (const rawTarget of profileRestaurantCandidates) {
            const target = normalizeText(rawTarget);
            const fuzzyCandidates = firebaseRestaurants.filter((r) => {
              const name = normalizeText(r?.name);
              return Boolean(name) && Boolean(target) && (name.includes(target) || target.includes(name));
            });
            if (fuzzyCandidates.length === 1) {
              matched = fuzzyCandidates;
              break;
            }
          }
        }

        if (matched.length === 0 && profileRestaurantCandidates.length > 0) {
          const preferredProfileLabel = String(
            user?.restaurantName || user?.restaurant_name || userRestaurantKey
          ).trim();
          // Last fallback for migrated profiles: keep profile restaurant value visible/usable
          // even if it is not found in restaurant dictionary by id/name/regNumber.
          matched = [
            {
              id: userRestaurantKey || preferredProfileLabel,
              name: preferredProfileLabel || userRestaurantKey,
              regNumber: "",
            },
          ];
        }

        return matched;
      };

      // Фільтрація ресторанів на основі ролі користувача
      if (user?.role === 'admin') {
        // Адмін бачить всі ресторани
        setRestaurants(firebaseRestaurants);
      } else if (Array.isArray(roleRestaurantIds) && roleRestaurantIds.length > 0) {
        // Доступи користувача можуть містити id, назву або regNumber.
        // Тому матчимо гнучко, а не тільки по id.
        const allowedKeys = new Set(
          roleRestaurantIds
            .map((value) => String(value || "").trim().toLowerCase())
            .filter(Boolean)
        );
        const allowed = firebaseRestaurants.filter((restaurant) => {
          const id = String(restaurant?.id || "").trim().toLowerCase();
          const name = String(restaurant?.name || "").trim().toLowerCase();
          const regNumber = String(restaurant?.regNumber || restaurant?.reg_number || "").trim().toLowerCase();
          return allowedKeys.has(id) || allowedKeys.has(name) || allowedKeys.has(regNumber);
        });

        if (allowed.length > 0) {
          setRestaurants(allowed);
        } else if (profileRestaurantCandidates.length > 0) {
          // Якщо формат у профілі/дозволах не співпав зі словником, тримаємо фолбек по профілю.
          setRestaurants(matchRestaurantsByProfile());
        } else {
          setRestaurants([]);
        }
      } else if (roleRestaurantsConfigured) {
        // Якщо у ролі явно налаштовано доступи, але список порожній,
        // використовуємо ресторан з профілю користувача як fallback.
        setRestaurants(matchRestaurantsByProfile());
      } else if (profileRestaurantCandidates.length > 0) {
        // Якщо у користувача є один ресторан
        setRestaurants(matchRestaurantsByProfile());
      } else {
        setRestaurants([]);
      }
    }
  }, [firebaseRestaurants, restaurantsLoading, user, roleRestaurantIds, roleRestaurantsConfigured]);

  useEffect(() => {
    const normalizedFromDictionary = Array.isArray(assetBusinessUnits)
      ? assetBusinessUnits.map((item) => String(item || "").trim()).filter(Boolean)
      : [];

    const normalizedFromRestaurants = Array.isArray(firebaseRestaurants)
      ? firebaseRestaurants
          .map((restaurant) => String(restaurant?.businessUnit || "").trim())
          .filter(Boolean)
      : [];

    const merged = Array.from(new Set([...normalizedFromDictionary, ...normalizedFromRestaurants]));
    setBusinessUnits(merged);
  }, [assetBusinessUnits, firebaseRestaurants]);

  // --- Завантаження прав для поточного користувача (за роллю/робочою роллю)
  useEffect(() => {
    const loadPermissions = async () => {
      const parseRestaurantList = (raw) => {
        if (Array.isArray(raw)) {
          return raw.map((value) => String(value || "").trim()).filter(Boolean);
        }
        if (typeof raw === "string") {
          const text = raw.trim();
          if (!text) return [];
          if (text.startsWith("[")) {
            try {
              const parsed = JSON.parse(text);
              if (Array.isArray(parsed)) {
                return parsed.map((value) => String(value || "").trim()).filter(Boolean);
              }
            } catch {
              // fallback to CSV parsing
            }
          }
          return text.split(",").map((value) => value.trim()).filter(Boolean);
        }
        return [];
      };

      if (!user) {
        setUserPermissions({});
        setRoleRestaurantIds([]);
        setRoleRestaurantsConfigured(false);
        return;
      }

      // адміністратор не потребує фільтрації, зберігаємо порожній об'єкт
      if (user.role === 'admin') {
        setUserPermissions({});
        setRoleRestaurantIds([]);
        setRoleRestaurantsConfigured(false);
        return;
      }

      // беремо з workRole або role як універсальний ідентифікатор
      const roleIdOrName = user.workRole || user.role;
      if (!roleIdOrName) {
        setUserPermissions({});
        setRoleRestaurantIds([]);
        setRoleRestaurantsConfigured(false);
        return;
      }

      try {
        const rolePerms = await getRolePermissions(roleIdOrName);
        setUserPermissions(rolePerms.permissions || {});
        // Доступ до ресторанів більше НЕ береться з ролі: він визначається індивідуально
        // по користувачу (user.restaurants[]). Нижче заповнюємо roleRestaurantIds з профілю як єдине джерело істини.
        setRoleRestaurantsConfigured(false);
        const userRestaurantIds = Array.from(
          new Set(
            [
              ...parseRestaurantList(user?.restaurants),
              ...parseRestaurantList(user?.restaurant_ids),
              ...parseRestaurantList(user?.restaurantIds),
              String(user?.restaurant || "").trim(),
              String(user?.restaurantId || "").trim(),
              String(user?.restaurant_id || "").trim(),
              String(user?.restaurantName || "").trim(),
              String(user?.restaurant_name || "").trim(),
            ].filter(Boolean)
          )
        );
        setRoleRestaurantIds(userRestaurantIds);
      } catch (err) {
        console.error("Помилка отримання прав доступу для користувача:", err);
        setUserPermissions({});
        setRoleRestaurantIds([]);
        setRoleRestaurantsConfigured(false);
      }
    };
    loadPermissions();
  }, [user]);

  useEffect(() => {
    if (!assetsLoading && firebaseAssets.length > 0) {
      setAssets(firebaseAssets);
    } else if (!assetsLoading && firebaseAssets.length === 0) {
      // Якщо база порожня, працюємо з порожнім списком без демо-даних.
      setAssets([]);
    }
  }, [firebaseAssets, assetsLoading]);

  // Автоматично заповнюємо форму даними ресторану керуючого
  useEffect(() => {
    if (!restaurantsLoading && user?.role !== 'admin' && firebaseRestaurants.length > 0) {
      const effectiveRestaurantId =
        roleRestaurantIds.length === 1
          ? roleRestaurantIds[0]
          : roleRestaurantsConfigured && roleRestaurantIds.length > 1
            ? ""
            : (user?.restaurant || user?.restaurantId || user?.restaurant_id || user?.restaurantName || user?.restaurant_name)
              ? String(user?.restaurant || user?.restaurantId || user?.restaurant_id || user?.restaurantName || user?.restaurant_name)
              : "";
      if (!effectiveRestaurantId) return;
      const normalizedEffectiveRestaurant = String(effectiveRestaurantId || "").trim().toLowerCase();
      const userRestaurant = firebaseRestaurants.find((r) => {
        const byId = String(r?.id || "").trim().toLowerCase() === normalizedEffectiveRestaurant;
        const byName = String(r?.name || "").trim().toLowerCase() === normalizedEffectiveRestaurant;
        return byId || byName;
      });
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
        // Автосинхронізація принтера закладу → localStorage (для не-адмінів)
        if (userRestaurant.printerIp) {
          localStorage.setItem("lucia_printer_ip", String(userRestaurant.printerIp).trim());
          if (userRestaurant.printerPort) {
            localStorage.setItem("lucia_printer_port", String(userRestaurant.printerPort).trim());
          }
        } else {
          localStorage.removeItem("lucia_printer_ip");
          localStorage.removeItem("lucia_printer_port");
        }
      }
    }
  }, [restaurantsLoading, user, firebaseRestaurants, roleRestaurantIds, roleRestaurantsConfigured]);

  // Синхронізація принтера по фільтру локації (для не-адмінів; адмін бере з settings)
  useEffect(() => {
    if (user?.role === 'admin') return;
    const locName = filters?.locationName;
    if (!locName || !firebaseRestaurants.length) return;
    const rest = firebaseRestaurants.find((r) =>
      String(r?.name || "").trim().toLowerCase() === String(locName).trim().toLowerCase()
    );
    if (rest?.printerIp) {
      localStorage.setItem("lucia_printer_ip", String(rest.printerIp).trim());
      if (rest.printerPort) {
        localStorage.setItem("lucia_printer_port", String(rest.printerPort).trim());
      }
    } else {
      localStorage.removeItem("lucia_printer_ip");
      localStorage.removeItem("lucia_printer_port");
    }
  }, [filters?.locationName, firebaseRestaurants, user?.role]);

  // Синхронізація принтера для адмінів з колекції settings (спільна для всіх адмінів)
  useEffect(() => {
    if (user?.role !== 'admin') return;
    if (!isCollectionsApiEnabled()) return;
    let cancelled = false;
    (async () => {
      try {
        const item = await getCollectionItemApi("settings", "adminPrinter");
        if (cancelled || !item) return;
        if (item.printerIp) {
          localStorage.setItem("lucia_printer_ip", String(item.printerIp).trim());
        }
        if (item.printerPort) {
          localStorage.setItem("lucia_printer_port", String(item.printerPort).trim());
        }
        if (item.printerOffsetX) {
          localStorage.setItem("lucia_printer_offset_x", String(item.printerOffsetX).trim());
        }
        if (item.printerProxyUrl) {
          localStorage.setItem("lucia_print_proxy_url", String(item.printerProxyUrl).trim());
        }
      } catch { /* settings may not exist yet */ }
    })();
    return () => { cancelled = true; };
  }, [user?.role]);

  // Завантаження показників електроенергії для огляду системи на дашборді.
  useEffect(() => {
    if (!isCollectionsApiEnabled()) return;
    let cancelled = false;
    (async () => {
      try {
        const readings = await listCollectionItemsApi("electricityReadings");
        if (cancelled) return;
        setElectricityReadings(Array.isArray(readings) ? readings : []);
      } catch { /* колекція може бути порожньою */ }
    })();
    return () => { cancelled = true; };
  }, [user?.uid, user?.id]);

  // Допоміжна функція для отримання вкладок для конкретного підрозділу з menuStructure
  const getTabsForSection = (navId) => {
    if (!navId || !Array.isArray(menuStructure)) return [];
    const normalizedNavId = normalizeNavigationId(navId);
    for (const section of menuStructure) {
      if (!Array.isArray(section.children)) continue;
      for (const child of section.children) {
        const childId = normalizeNavigationId(child.id);
        if (child.id === navId || childId === normalizedNavId) {
          if (Array.isArray(child.tabLabels) && child.tabLabels.length > 0) {
            return child.tabLabels;
          } else if (Array.isArray(child.tabs) && child.tabs.length > 0) {
            return child.tabs.map(id => ({ id, label: id }));
          }
        }
      }
    }
    return [];
  };

  // Вкладки для поточного activeNav — з menuStructure, але фільтруються згідно з userPermissions
  const topTabs = useMemo(() => {
    const tabsFromMenu = getTabsForSection(activeNav);
    const allTabs = tabsFromMenu.map((tab) => {
      const normalizedTabId = String(tab?.id || "").toLowerCase();
      const rawLabel = String(tab?.label || "").trim();
      if (normalizedTabId.includes("cateringrolesettings") || rawLabel.toLowerCase().includes("cateringrolesettings")) {
        return { ...tab, label: "Управління ролями" };
      }
      if (String(tab?.label || "").trim().toLowerCase() === "управління надцінками") {
        return { ...tab, label: "Управління націнками" };
      }
      if (activeNav === "ops-checklists" && tab.id === "openingchecklist") {
        return { ...tab, label: "Чеклисти" };
      }
      if (activeNav === "inventory-assets" && tab.id === "test2") {
        return { ...tab, label: "Інвентаризація" };
      }
      return tab;
    });

    if (!user || user.role === 'admin') return allTabs;
    const allowed = userPermissions[activeNav];
    if (allowed === true) return allTabs;
    if (Array.isArray(allowed)) {
      return allTabs.filter(tab => allowed.includes(tab.id));
    }
    // Якщо доступу немає — не показувати вкладки
    return [];
  }, [activeNav, menuStructure, user, userPermissions]);

  // Огляд спожитої електроенергії за обрану дату (типово вчора, A+) по доступних закладах.
  const electricityOverview = useMemo(() => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterdayIso = y.toISOString().slice(0, 10);
    const pickedIso = /^\d{4}-\d{2}-\d{2}$/.test(String(dashboardDateFilter || "").trim())
      ? String(dashboardDateFilter).trim()
      : "";
    const yIso = pickedIso || yesterdayIso;
    const isGen = (label) => /генератор/i.test(String(label || ""));
    const isAplus = (label) => /a\+/i.test(String(label || ""));
    // Генераторний лічильник реєструє виробіток у ЗВОРОТНОМУ напрямку (A-),
    // залежно від схеми підключення. Тому для генератора враховуємо A+ ТА A-.
    const isAminus = (label) => /a-/i.test(String(label || ""));
    const generatorGroupKey = (meter) => {
      const explicit = String(meter?.sourcePoint || "").trim();
      if (explicit) return explicit;
      const label = String(meter?.meterNumber || meter?.meterId || "").trim();
      const match = /^Генератор:\s*(.+?)\s+[AR][+-]$/.exec(label);
      if (match) return match[1].trim();
      return label.replace(/^Генератор:\s*/i, "").replace(/\s+[AR][+-]$/i, "").trim() || label;
    };
    const targetRestaurantId = String(dashboardRestaurantFilter || "").trim();

    const sumFor = (restaurantId) => {
      let mains = 0;
      let gen = 0;
      let genRuntimeMinutesByPoint = new Map();
      let hasData = false;
      for (const rec of electricityReadings) {
        if (String(rec?.restaurantId || "") !== String(restaurantId)) continue;
        if (String(rec?.date || "").slice(0, 10) !== yIso) continue;
        const meters = Array.isArray(rec?.meters) ? rec.meters : [];
        for (const m of meters) {
          const label = String(m?.meterNumber || m?.meterId || "");
          const v = Number(m?.consumption ?? m?.currValue);
          if (!Number.isFinite(v)) continue;
          if (isGen(label)) {
            // Виробіток генератора: A+ або A- (яка з активних енергій ненульова).
            if (!isAplus(label) && !isAminus(label)) continue;
            hasData = true;
            gen += v;
            const runtimeMinutes = Number(
              m?.activeRuntimeMinutes ?? (
                Number.isFinite(Number(m?.activeHalfHours)) ? Number(m.activeHalfHours) * 30 : 0
              )
            );
            if (Number.isFinite(runtimeMinutes) && runtimeMinutes > 0) {
              const groupKey = generatorGroupKey(m);
              if (groupKey) {
                const current = genRuntimeMinutesByPoint.get(groupKey) || 0;
                genRuntimeMinutesByPoint.set(groupKey, Math.max(current, runtimeMinutes));
              }
            }
          } else {
            if (!isAplus(label)) continue;
            hasData = true;
            mains += v;
          }
        }
      }
      const genRuntimeMinutes = [...genRuntimeMinutesByPoint.values()].reduce((a, b) => a + b, 0);
      return { mains, gen, genHours: genRuntimeMinutes / 60, hasData };
    };

    const perRestaurantAll = restaurants.map((r) => {
      const s = sumFor(r.id);
      return {
        id: r.id,
        name: r.name || "—",
        mains: s.mains,
        gen: s.gen,
        genHours: s.genHours,
        total: s.mains + s.gen,
        hasData: s.hasData,
      };
    });

    const perRestaurant = targetRestaurantId
      ? perRestaurantAll.filter((r) => String(r?.id || "") === targetRestaurantId)
      : perRestaurantAll;

    const totalMains = perRestaurant.reduce((a, b) => a + b.mains, 0);
    const totalGen = perRestaurant.reduce((a, b) => a + b.gen, 0);
    const totalGenHours = perRestaurant.reduce((a, b) => a + (Number(b.genHours) || 0), 0);
    return {
      yIso,
      isYesterday: yIso === yesterdayIso,
      perRestaurantAll,
      perRestaurant,
      totalMains,
      totalGen,
      totalGenHours,
      total: totalMains + totalGen,
      multiRestaurant: perRestaurant.length > 1,
    };
  }, [electricityReadings, restaurants, dashboardRestaurantFilter, dashboardDateFilter]);

  useEffect(() => {
    if (!dashboardRestaurantFilter) return;
    const exists = restaurants.some((r) => String(r?.id || "") === String(dashboardRestaurantFilter));
    if (!exists) setDashboardRestaurantFilter("");
  }, [restaurants, dashboardRestaurantFilter]);

  const menuStructureForPermissions = useMemo(() => {
    // Базова структура навігації
    const baseNavItems = [
      // ...existing code...
    ];
    // Додаємо вкладки до кожного пункту меню
    const navWithTabs = baseNavItems.map(section => ({
      ...section,
      children: section.children.map(child => {
        const tabs = getTabsForSection(child.id);
        return tabs.length > 0 
          ? { ...child, tabs: tabs.map(t => t.id), tabLabels: tabs }
          : child;
      })
    }));
    // Якщо користувач адмін — показуємо все
    if (user?.role === 'admin') return navWithTabs;
    // Фільтруємо children згідно з userPermissions
    return navWithTabs.map(section => ({
      ...section,
      children: section.children.filter(child => {
        const perm = userPermissions[child.id];
        // Якщо немає права — не показуємо
        if (perm === undefined) return false;
        return perm === true || (Array.isArray(perm) && perm.length > 0);
      })
    }));
  }, [user, userPermissions]);

  useEffect(() => {
    if (topTabs.length === 0) {
      if (topTab !== "") {
        setTopTab("");
      }
      localStorage.removeItem('lucia_topTab');
      return;
    }

    const hasCurrentTopTab = topTabs.some((tab) => tab.id === topTab);
    if (hasCurrentTopTab) {
      return;
    }

    const nextTopTab = topTabs[0].id;
    setTopTab(nextTopTab);
    localStorage.setItem('lucia_topTab', nextTopTab);
  }, [activeNav, topTabs, topTab]);

  const isNavigationStateStable = useMemo(() => {
    if (!activeNav) return false;
    if (topTabs.length === 0) return topTab === "";
    return topTabs.some((tab) => tab.id === topTab);
  }, [activeNav, topTabs, topTab]);

  useEffect(() => {
    if (!isNavigationStateStable) return;

    const normalizedTopTab = topTabs.length === 0 ? "" : topTab;
    const snapshot = JSON.stringify({ activeNav, topTab: normalizedTopTab });
    if (lastNavigationSnapshotRef.current === snapshot) {
      return;
    }

    lastNavigationSnapshotRef.current = snapshot;
    const historyMode = !hasSyncedBrowserHistoryRef.current || isApplyingBrowserHistoryRef.current ? "replace" : "push";
    hasSyncedBrowserHistoryRef.current = true;
    persistNavigationState(activeNav, normalizedTopTab, historyMode);
    if (isApplyingBrowserHistoryRef.current) {
      isApplyingBrowserHistoryRef.current = false;
    }
  }, [activeNav, topTab, topTabs.length, isNavigationStateStable, persistNavigationState]);

  useEffect(() => {
    const handlePopState = (event) => {
      const historyState = event.state && typeof event.state === "object" ? event.state : null;
      const locationState = getNavigationStateFromLocation();
      const nextActiveNav = normalizeNavigationId(historyState?.activeNav || locationState.activeNav);
      const nextTopTab = String(historyState?.topTab || locationState.topTab || "").trim();

      if (!nextActiveNav) return;

      isApplyingBrowserHistoryRef.current = true;
      setActiveNav(nextActiveNav);
      setTopTab(nextTopTab);
      setSelected(null);
      if (isMobile) setSidebarOpen(false);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isMobile]);

  const normalizedRoleRestaurantIds = useMemo(() => (
    Array.isArray(roleRestaurantIds)
      ? roleRestaurantIds.map((id) => String(id || "").trim()).filter(Boolean)
      : []
  ), [roleRestaurantIds]);

  const assetInventorySessionScopeId = useMemo(() => {
    if (user?.role === "admin") return "global";

    if (normalizedRoleRestaurantIds.length === 1) {
      return `restaurant:${normalizedRoleRestaurantIds[0]}`;
    }

    const userRestaurantKey = String(
      user?.restaurant || user?.restaurantId || user?.restaurant_id || user?.restaurantName || user?.restaurant_name || ""
    ).trim();

    if (userRestaurantKey) {
      const normalizedKey = userRestaurantKey.toLowerCase();
      const matched = (restaurants || []).find((item) => {
        const byId = String(item?.id || "").trim().toLowerCase() === normalizedKey;
        const byName = String(item?.name || "").trim().toLowerCase() === normalizedKey;
        const byReg = String(item?.regNumber || item?.reg_number || "").trim().toLowerCase() === normalizedKey;
        return byId || byName || byReg;
      });
      if (matched?.id) {
        return `restaurant:${String(matched.id)}`;
      }

      return `restaurant:${userRestaurantKey}`;
    }

    if (normalizedRoleRestaurantIds.length > 1) {
      return `restaurant:${normalizedRoleRestaurantIds[0]}`;
    }

    if (Array.isArray(restaurants) && restaurants.length === 1 && restaurants[0]?.id) {
      return `restaurant:${String(restaurants[0].id)}`;
    }

    return "global";
  }, [user, normalizedRoleRestaurantIds, restaurants]);

  const hasMultiRestaurantRoleAccess = user?.role !== "admin" && normalizedRoleRestaurantIds.length > 1;

  const assetInventoryHistoryScopeId = useMemo(() => {
    if (user?.role === "admin") return "*";
    if (hasMultiRestaurantRoleAccess) return "*";
    return assetInventorySessionScopeId;
  }, [user, hasMultiRestaurantRoleAccess, assetInventorySessionScopeId]);

  useEffect(() => {
    if (!user) {
      setAssetInventorySession(null);
      setAssetInventorySessionLoading(false);
      return;
    }

    setAssetInventorySessionLoading(true);
    const unsubscribe = subscribeToActiveAssetInventorySession(assetInventorySessionScopeId, (session) => {
      setAssetInventorySession(session);
      setAssetInventorySessionLoading(false);
    });

    return () => {
      unsubscribe?.();
    };
  }, [user, assetInventorySessionScopeId]);

  useEffect(() => {
    if (!user) {
      setAssetInventorySessionsHistory([]);
      return;
    }

    const unsubscribe = subscribeToAssetInventorySessions(assetInventoryHistoryScopeId, (sessions) => {
      setAssetInventorySessionsHistory(Array.isArray(sessions) ? sessions : []);
    });

    return () => {
      unsubscribe?.();
    };
  }, [user, assetInventoryHistoryScopeId]);

  const accessibleAssetInventoryScopeIds = useMemo(() => {
    if (user?.role === "admin") return null;

    const scopeIds = new Set();
    (restaurants || []).forEach((restaurant) => {
      const restaurantId = String(restaurant?.id || "").trim();
      if (restaurantId) {
        scopeIds.add(`restaurant:${restaurantId}`);
      }
    });

    if (scopeIds.size === 0 && assetInventorySessionScopeId && assetInventorySessionScopeId !== "global") {
      scopeIds.add(assetInventorySessionScopeId);
    }

    return scopeIds;
  }, [user?.role, restaurants, assetInventorySessionScopeId]);

  const assetInventorySessionsForCurrentUser = useMemo(() => {
    if (user?.role === "admin") return assetInventorySessionsHistory;
    if (assetInventoryHistoryScopeId !== "*") return assetInventorySessionsHistory;
    if (!accessibleAssetInventoryScopeIds || accessibleAssetInventoryScopeIds.size === 0) return [];

    return (assetInventorySessionsHistory || []).filter((session) => {
      const scopeId = String(session?.scopeId || session?.scope_id || "global");
      return accessibleAssetInventoryScopeIds.has(scopeId);
    });
  }, [
    user?.role,
    assetInventoryHistoryScopeId,
    assetInventorySessionsHistory,
    accessibleAssetInventoryScopeIds,
  ]);

  const isAssetInventorySessionActive = Boolean(assetInventorySession?.isActive);

  const activeAssetInventorySessionsByScope = useMemo(() => {
    const map = new Map();
    (assetInventorySessionsForCurrentUser || []).forEach((session) => {
      if (!session?.isActive) return;
      const scopeId = String(session?.scopeId || session?.scope_id || "global");
      if (!map.has(scopeId)) {
        map.set(scopeId, session);
      }
    });
    return map;
  }, [assetInventorySessionsForCurrentUser]);

  const hasAnyActiveAssetInventorySession = useMemo(() => {
    return activeAssetInventorySessionsByScope.size > 0;
  }, [activeAssetInventorySessionsByScope]);

  const currentAccessibleAssetInventorySession = useMemo(() => {
    const activeSessions = Array.from(activeAssetInventorySessionsByScope.values());
    if (activeSessions.length > 0) {
      return activeSessions.sort((left, right) =>
        String(right?.startedAt || "").localeCompare(String(left?.startedAt || ""))
      )[0] || null;
    }
    return isAssetInventorySessionActive ? assetInventorySession : null;
  }, [activeAssetInventorySessionsByScope, assetInventorySession, isAssetInventorySessionActive]);

  const isAnyAccessibleAssetInventorySessionActive = user?.role === "admin"
    ? hasAnyActiveAssetInventorySession
    : (hasAnyActiveAssetInventorySession || isAssetInventorySessionActive);

  const canOverrideWrittenOffEdit = isFinanceLikeUser(user);

  const isAssetWrittenOff = useCallback((asset) => {
    const status = String(asset?.status || "").trim().toLowerCase();
    const decision = String(asset?.decision || "").trim().toLowerCase();
    const writeOffStatus = String(asset?.writeOffRequest?.status || "").trim().toLowerCase();
    const remainingAfterWriteOff = Number(asset?.writeOffRequest?.remainingQuantity);

    if (status === "списано") return true;
    if (decision === "списати") return true;
    if (writeOffStatus === "approved" && Number.isFinite(remainingAfterWriteOff) && remainingAfterWriteOff <= 0) {
      return true;
    }

    return false;
  }, []);

  const getAssetInventoryScopeId = useCallback((asset) => {
    const normalizedText = (value) => String(value || "").trim().toLowerCase();
    const assetRestaurantIds = [
      asset?.restaurantId,
      asset?.restaurant_id,
      asset?.locationId,
      asset?.location_id,
      asset?.restaurant,
      asset?.location,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    for (const candidateId of assetRestaurantIds) {
      const matchedById = (restaurants || []).find((restaurant) => String(restaurant?.id || "").trim() === candidateId);
      if (matchedById?.id) {
        return `restaurant:${String(matchedById.id)}`;
      }
    }

    const assetRestaurantNames = [
      asset?.locationName,
      asset?.location_name,
      asset?.restaurantName,
      asset?.restaurant_name,
      asset?.restaurant,
      asset?.location,
    ]
      .map((value) => normalizedText(value))
      .filter(Boolean);

    for (const candidateName of assetRestaurantNames) {
      const matchedByName = (restaurants || []).find((restaurant) => {
        const restaurantName = normalizedText(restaurant?.name);
        const restaurantRegNumber = normalizedText(restaurant?.regNumber || restaurant?.reg_number);
        return candidateName === restaurantName || candidateName === restaurantRegNumber;
      });
      if (matchedByName?.id) {
        return `restaurant:${String(matchedByName.id)}`;
      }
    }

    if (restaurants.length === 1 && restaurants[0]?.id) {
      return `restaurant:${String(restaurants[0].id)}`;
    }

    return assetInventorySessionScopeId;
  }, [restaurants, assetInventorySessionScopeId]);

  const getActiveAssetInventorySessionForAsset = useCallback((asset) => {
    const scopeId = String(getAssetInventoryScopeId(asset) || "").trim();
    if (!scopeId) return null;

    if (activeAssetInventorySessionsByScope.has(scopeId)) {
      return activeAssetInventorySessionsByScope.get(scopeId) || null;
    }

    if (scopeId === assetInventorySessionScopeId && isAssetInventorySessionActive) {
      return assetInventorySession || null;
    }

    return null;
  }, [
    getAssetInventoryScopeId,
    activeAssetInventorySessionsByScope,
    assetInventorySessionScopeId,
    isAssetInventorySessionActive,
    assetInventorySession,
  ]);

  const isAssetEditAllowedForCurrentUser = user?.role === "admin" || isAnyAccessibleAssetInventorySessionActive;

  const canEditAssetRow = useCallback((asset) => {
    if (isAssetWrittenOff(asset) && !canOverrideWrittenOffEdit) return false;
    if (user?.role === "admin") return true;
    return Boolean(getActiveAssetInventorySessionForAsset(asset)?.isActive);
  }, [user?.role, isAssetWrittenOff, canOverrideWrittenOffEdit, getActiveAssetInventorySessionForAsset]);

  const getAssetEditDisabledReason = useCallback((asset) => {
    if (isAssetWrittenOff(asset) && !canOverrideWrittenOffEdit) {
      return "Актив зі статусом 'Списано' не редагується";
    }
    if (!canEditAssetRow(asset)) {
      return "Запустіть сесію інвентаризації для закладу цього активу, щоб редагувати його";
    }
    return "Редагування тимчасово недоступне";
  }, [canEditAssetRow, isAssetWrittenOff, canOverrideWrittenOffEdit]);

  const [optimisticallyUnmarkedIds, setOptimisticallyUnmarkedIds] = useState(new Set());

  const recentlyInventoriedAssetIds = useMemo(() => {
    const activeSessionIds = new Set(
      Array.from(activeAssetInventorySessionsByScope.values())
        .map((session) => String(session?.id || ""))
        .filter(Boolean)
    );

    if (activeSessionIds.size === 0 && isAssetInventorySessionActive && assetInventorySession?.id) {
      activeSessionIds.add(String(assetInventorySession.id));
    }

    if (activeSessionIds.size === 0) return new Set();

    const ids = new Set();
    assets.forEach((asset) => {
      const id = String(asset?.id || "");
      if (!id || optimisticallyUnmarkedIds.has(id)) return;
      const history = Array.isArray(asset?.inventoryChangeHistory) ? asset.inventoryChangeHistory : [];
      const hasChangeInLastSession = history.some(
        (entry) => activeSessionIds.has(String(entry?.inventorySessionId || ""))
      );
      if (hasChangeInLastSession) {
        ids.add(id);
      }
    });
    return ids;
  }, [assets, assetInventorySession, isAssetInventorySessionActive, activeAssetInventorySessionsByScope, optimisticallyUnmarkedIds]);

  // Stable callbacks for AssetTable so its heavy memoized filters/counters/columns
  // do not rebuild on every parent render (only when the underlying Set changes).
  const isAssetInventorizedInSession = useCallback(
    (assetRow) => recentlyInventoriedAssetIds.has(String(assetRow?.id || "")),
    [recentlyInventoriedAssetIds]
  );
  const getInventoryRowClassName = useCallback(
    (assetRow) => (recentlyInventoriedAssetIds.has(String(assetRow?.id || "")) ? "bg-emerald-100/60" : ""),
    [recentlyInventoriedAssetIds]
  );

  const shouldShowInventoryStateFilter = user?.role === "admin"
    ? hasAnyActiveAssetInventorySession
    : isAnyAccessibleAssetInventorySessionActive;

  const handleUnmarkInventorized = useCallback(async (asset) => {
    if (user?.role !== "admin") return;
    const assetId = String(asset?.id || "");
    if (!assetId) return;

    // Optimistic: immediately hide green highlight
    setOptimisticallyUnmarkedIds((prev) => {
      const next = new Set(prev);
      next.add(assetId);
      return next;
    });

    const activeSessionIds = new Set(
      Array.from(activeAssetInventorySessionsByScope.values())
        .map((s) => String(s?.id || ""))
        .filter(Boolean)
    );
    if (activeSessionIds.size === 0 && isAssetInventorySessionActive && assetInventorySession?.id) {
      activeSessionIds.add(String(assetInventorySession.id));
    }
    if (activeSessionIds.size === 0) return;

    const currentHistory = Array.isArray(asset?.inventoryChangeHistory) ? asset.inventoryChangeHistory : [];
    const filteredHistory = currentHistory.filter(
      (entry) => !activeSessionIds.has(String(entry?.inventorySessionId || ""))
    );

    if (filteredHistory.length === currentHistory.length) {
      return;
    }

    const result = await updateAssetInFirebase(assetId, { inventoryChangeHistory: filteredHistory });
    if (!result?.success) {
      // Revert optimistic update on failure
      setOptimisticallyUnmarkedIds((prev) => {
        const next = new Set(prev);
        next.delete(assetId);
        return next;
      });
      alert("Не вдалося зняти мітку інвентаризації.");
    } else {
      // Clean up optimistic set once Firebase data arrives
      setOptimisticallyUnmarkedIds((prev) => {
        const next = new Set(prev);
        next.delete(assetId);
        return next;
      });
    }
  }, [user?.role, activeAssetInventorySessionsByScope, isAssetInventorySessionActive, assetInventorySession, updateAssetInFirebase]);

  const assetInventoryHistoryScopeLabel = assetInventoryHistoryScopeId === "*"
    ? (user?.role === "admin" ? "всі заклади" : "доступні заклади")
    : assetInventorySessionScopeId;

  const getSessionRestaurantLabel = (session) => {
    const sessionRestaurantId = String(
      session?.startedForRestaurantId || session?.started_for_restaurant_id || session?.restaurantId || session?.restaurant_id || ""
    );
    if (sessionRestaurantId) {
      return restaurants.find((item) => String(item.id) === sessionRestaurantId)?.name || sessionRestaurantId;
    }

    const scopeId = String(session?.scopeId || session?.scope_id || "");
    if (scopeId.startsWith("restaurant:")) {
      const restaurantIdFromScope = scopeId.slice("restaurant:".length);
      return restaurants.find((item) => String(item.id) === restaurantIdFromScope)?.name || restaurantIdFromScope;
    }

    return "Всі заклади";
  };

  const getSessionChangeRows = (session) => {
    const sessionId = String(session?.id || "");
    if (!sessionId) return [];

    const rows = [];
    assets.forEach((asset) => {
      const history = Array.isArray(asset?.inventoryChangeHistory) ? asset.inventoryChangeHistory : [];
      history.forEach((entry) => {
        if (String(entry?.inventorySessionId || "") !== sessionId) return;
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        changes.forEach((change) => {
          rows.push({
            assetInvNumber: asset?.invNumber || "-",
            assetName: asset?.name || "-",
            restaurant: asset?.locationName || "-",
            changedAt: entry?.changedAt || "",
            changedBy: entry?.changedByName || "-",
            field: change?.field || "-",
            previousValue: change?.previousValue,
            nextValue: change?.nextValue,
          });
        });
      });
    });

    return rows.sort((a, b) => String(a.changedAt || "").localeCompare(String(b.changedAt || "")));
  };

  const printSingleAssetInventorySession = (session) => {
    const printWindow = window.open("", "_blank", "width=1200,height=820");
    if (!printWindow) {
      alert("Не вдалося відкрити вікно друку. Дозвольте pop-up у браузері.");
      return;
    }

    const escapeHtml = (value) => String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

    const sessionRows = getSessionChangeRows(session);

    const groupedByAsset = sessionRows.reduce((acc, row) => {
      const key = `${row.assetInvNumber}__${row.assetName}__${row.restaurant}`;
      if (!acc[key]) {
        acc[key] = {
          assetInvNumber: row.assetInvNumber,
          assetName: row.assetName,
          restaurant: row.restaurant,
          changes: [],
        };
      }
      acc[key].changes.push(row);
      return acc;
    }, {});

    const groupedAssets = Object.values(groupedByAsset).sort((a, b) =>
      String(a.assetInvNumber || "").localeCompare(String(b.assetInvNumber || ""), "uk", { numeric: true })
    );

    const groupedBlocksHtml = groupedAssets.map((group, blockIndex) => {
      const changesHtml = group.changes.map((change, changeIndex) => `
        <tr>
          <td>${changeIndex + 1}</td>
          <td>${escapeHtml(getAssetFieldLabel(change.field))}</td>
          <td>${escapeHtml(change.previousValue ?? "-")}</td>
          <td>${escapeHtml(change.nextValue ?? "-")}</td>
          <td>${escapeHtml(change.changedBy)}</td>
          <td>${change.changedAt ? new Date(change.changedAt).toLocaleString("uk-UA") : "-"}</td>
        </tr>
      `).join("");

      return `
        <section class="asset-block">
          <div class="asset-header">
            <div><strong>${blockIndex + 1}. Актив:</strong> ${escapeHtml(group.assetName)}</div>
            <div><strong>Інв. номер:</strong> ${escapeHtml(group.assetInvNumber)}</div>
            <div><strong>Ресторан:</strong> ${escapeHtml(group.restaurant)}</div>
            <div><strong>К-сть змін:</strong> ${group.changes.length}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 34px;">#</th>
                <th>Поле</th>
                <th>Було</th>
                <th>Стало</th>
                <th>Хто змінив</th>
                <th>Коли</th>
              </tr>
            </thead>
            <tbody>
              ${changesHtml || '<tr><td colspan="6">Змін не зафіксовано</td></tr>'}
            </tbody>
          </table>
        </section>
      `;
    }).join("");

    const html = `
<!doctype html>
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <title>Акт інвентаризації ОЗ</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; }
      h1 { margin: 0 0 6px; font-size: 16px; }
      .meta { margin-bottom: 8px; font-size: 11px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 9.5px; table-layout: fixed; }
      th, td { border: 1px solid #cbd5e1; padding: 3px 4px; text-align: left; vertical-align: top; word-break: break-word; }
      th { background: #f8fafc; font-weight: 700; }
      .asset-block { margin-top: 8px; break-inside: avoid; }
      .asset-header {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1px 10px;
        padding: 4px 6px;
        margin-bottom: 4px;
        border: 1px solid #cbd5e1;
        background: #f8fafc;
        font-size: 10px;
      }
      .hint { margin-top: 8px; font-size: 11px; color: #475569; }
    </style>
  </head>
  <body>
    <h1>Акт інвентаризації основних засобів</h1>
    <div class="meta">
      <div><strong>ID сесії:</strong> ${escapeHtml(session?.id || "-")}</div>
      <div><strong>Ресторан:</strong> ${escapeHtml(getSessionRestaurantLabel(session))}</div>
      <div><strong>Початок:</strong> ${session?.startedAt ? new Date(session.startedAt).toLocaleString("uk-UA") : "-"}</div>
      <div><strong>Завершення:</strong> ${session?.endedAt ? new Date(session.endedAt).toLocaleString("uk-UA") : "-"}</div>
      <div><strong>Хто почав:</strong> ${escapeHtml(session?.startedByName || "-")}</div>
      <div><strong>Хто завершив:</strong> ${escapeHtml(session?.endedByName || "-")}</div>
      <div><strong>К-сть змін:</strong> ${sessionRows.length}</div>
      <div><strong>Сформовано:</strong> ${new Date().toLocaleString("uk-UA")}</div>
    </div>

    ${groupedBlocksHtml || '<table><tbody><tr><td>У цій інвентаризації зміни не зафіксовані</td></tr></tbody></table>'}

    <div class="hint">Якщо друк не стартував — натисніть Ctrl/Cmd+P</div>
    <script>
      setTimeout(() => { window.focus(); window.print(); }, 120);
    </script>
  </body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const printAssetInventoryJournal = () => {
    const printWindow = window.open("", "_blank", "width=1100,height=780");
    if (!printWindow) {
      alert("Не вдалося відкрити вікно друку. Дозвольте pop-up у браузері.");
      return;
    }

    const rowsHtml = assetInventorySessionsForCurrentUser.map((session, index) => {
      const startedAt = session?.startedAt ? new Date(session.startedAt).toLocaleString("uk-UA") : "-";
      const endedAt = session?.endedAt ? new Date(session.endedAt).toLocaleString("uk-UA") : "-";
      const status = session?.isActive ? "Активна" : "Завершена";
      const restaurant = getSessionRestaurantLabel(session);
      const startedBy = String(session?.startedByName || "-")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const endedBy = String(session?.endedByName || "-")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${startedAt}</td>
          <td>${endedAt}</td>
          <td>${restaurant}</td>
          <td>${status}</td>
          <td>${startedBy}</td>
          <td>${endedBy}</td>
          <td>${session?.id || "-"}</td>
        </tr>
      `;
    }).join("");

    const html = `
<!doctype html>
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <title>Журнал інвентаризацій ОЗ</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; }
      h1 { margin: 0 0 6px; font-size: 16px; }
      .meta { margin-bottom: 8px; font-size: 11px; line-height: 1.35; }
      table { width: 100%; border-collapse: collapse; font-size: 9.5px; table-layout: fixed; }
      th, td { border: 1px solid #cbd5e1; padding: 3px 4px; text-align: left; vertical-align: top; word-break: break-word; }
      th { background: #f8fafc; font-weight: 700; }
      .hint { margin-top: 8px; font-size: 11px; color: #475569; }
    </style>
  </head>
  <body>
    <h1>Журнал інвентаризацій основних засобів</h1>
    <div class="meta">
      Сформовано: ${new Date().toLocaleString("uk-UA")}<br/>
      Область: ${assetInventoryHistoryScopeLabel}<br/>
      К-сть записів: ${assetInventorySessionsForCurrentUser.length}
    </div>
    <table>
      <thead>
        <tr>
          <th style="width: 36px;">#</th>
          <th>Початок</th>
          <th>Завершення</th>
          <th>Ресторан</th>
          <th>Статус</th>
          <th>Хто почав</th>
          <th>Хто завершив</th>
          <th>ID сесії</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="8">Записів немає</td></tr>'}
      </tbody>
    </table>
    <div class="hint">Якщо друк не стартував — натисніть Ctrl/Cmd+P</div>
    <script>
      setTimeout(() => { window.focus(); window.print(); }, 120);
    </script>
  </body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const startAssetInventorySession = async ({ scopeId, restaurantId, restaurantName } = {}) => {
    if (assetInventorySessionLoading || !user) return;

    const targetScopeId = String(scopeId || assetInventorySessionScopeId || "").trim();
    if (!targetScopeId) return;

    if (activeAssetInventorySessionsByScope.has(targetScopeId)) return;

    const targetRestaurantId = String(
      restaurantId ||
      user?.restaurant ||
      user?.restaurantId ||
      user?.restaurant_id ||
      ""
    ).trim();

    const startedByName = user?.displayName || user?.fullName || user?.email || "Користувач";
    const nowIso = new Date().toISOString();
    try {
      setAssetInventorySessionLoading(true);
      const sessionId = await startAssetInventorySessionInFirestore(targetScopeId, {
        startedById: user?.uid || "",
        startedByName,
        startedForRestaurantId: targetRestaurantId,
        startedForRestaurantName: String(restaurantName || "").trim(),
      });
      if (targetScopeId === assetInventorySessionScopeId) {
        setAssetInventorySession({
          id: String(sessionId || ""),
          scopeId: targetScopeId,
          isActive: true,
          startedAt: nowIso,
          startedById: user?.uid || "",
          startedByName,
          startedForRestaurantId: targetRestaurantId,
          startedForRestaurantName: String(restaurantName || "").trim(),
        });
      }
      writeAuditLog({
        action: "asset_inventory_session_start",
        entityType: "asset_inventory_session",
        entityId: targetScopeId,
        description: `Запущено сесію інвентаризації ОЗ (${targetScopeId})`,
      });
    } catch (error) {
      alert(`Не вдалося запустити сесію інвентаризації: ${error?.message || "невідома помилка"}`);
    } finally {
      setAssetInventorySessionLoading(false);
    }
  };

  const endAssetInventorySession = async (sessionOverride = null) => {
    if (assetInventorySessionLoading || !user) return;

    const targetSession = sessionOverride || assetInventorySession;
    const targetSessionId = String(targetSession?.id || "").trim();
    if (!targetSessionId) return;

    const targetScopeId = String(
      targetSession?.scopeId || targetSession?.scope_id || assetInventorySessionScopeId || ""
    ).trim();

    const endedByName = user?.displayName || user?.fullName || user?.email || "Користувач";
    const nowIso = new Date().toISOString();
    try {
      setAssetInventorySessionLoading(true);
      await endAssetInventorySessionInFirestore(targetSessionId, {
        endedById: user?.uid || "",
        endedByName,
      }, targetScopeId);

      if (targetSessionId === String(assetInventorySession?.id || "")) {
        setAssetInventorySession((prev) => ({
          ...(prev || {}),
          isActive: false,
          endedAt: nowIso,
          endedById: user?.uid || "",
          endedByName,
        }));
      }

      writeAuditLog({
        action: "asset_inventory_session_end",
        entityType: "asset_inventory_session",
        entityId: targetSessionId || targetScopeId,
        description: `Завершено сесію інвентаризації ОЗ (${targetSessionId || "-"})`,
      });
      setSelected(null);
    } catch (error) {
      alert(`Не вдалося завершити сесію інвентаризації: ${error?.message || "невідома помилка"}`);
    } finally {
      setAssetInventorySessionLoading(false);
    }
  };

  const deleteAssetInventorySession = async (session) => {
    if (assetInventorySessionLoading || !user || user?.role !== "admin") return;

    const targetSessionId = String(session?.id || "").trim();
    if (!targetSessionId) return;

    if (session?.isActive) {
      alert("Неможливо видалити активну сесію. Спочатку завершіть її.");
      return;
    }

    const startedAtLabel = session?.startedAt ? new Date(session.startedAt).toLocaleString("uk-UA") : "-";
    const restaurantLabel = getSessionRestaurantLabel(session);
    const confirmed = window.confirm(
      `Видалити запис сесії інвентаризації?\n\nРесторан: ${restaurantLabel}\nПочаток: ${startedAtLabel}\nID: ${targetSessionId}`
    );
    if (!confirmed) return;

    try {
      setAssetInventorySessionLoading(true);
      await deleteAssetInventorySessionInFirestore(targetSessionId);

      setAssetInventorySessionsHistory((prev) =>
        Array.isArray(prev) ? prev.filter((item) => String(item?.id || "") !== targetSessionId) : prev
      );

      if (String(assetInventorySession?.id || "") === targetSessionId) {
        setAssetInventorySession(null);
      }

      writeAuditLog({
        action: "asset_inventory_session_delete",
        entityType: "asset_inventory_session",
        entityId: targetSessionId,
        description: `Видалено запис сесії інвентаризації ОЗ (${targetSessionId})`,
      });
    } catch (error) {
      alert(`Не вдалося видалити запис сесії: ${error?.message || "невідома помилка"}`);
    } finally {
      setAssetInventorySessionLoading(false);
    }
  };

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
    if (submitAssetLockRef.current) {
      return false;
    }

    submitAssetLockRef.current = true;

    const sanitizeFirestoreValue = (value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;

      const valueType = typeof value;
      if (valueType === "string" || valueType === "boolean") return value;
      if (valueType === "number") return Number.isFinite(value) ? value : null;

      if (value instanceof Date) return value.toISOString();

      if (Array.isArray(value)) {
        return value
          .map((item) => sanitizeFirestoreValue(item))
          .map((item) => (Array.isArray(item) ? item.join(", ") : item))
          .filter((item) => item !== undefined);
      }

      if (valueType === "object") {
        return Object.entries(value).reduce((acc, [key, nestedValue]) => {
          const sanitized = sanitizeFirestoreValue(nestedValue);
          if (sanitized !== undefined) {
            acc[key] = sanitized;
          }
          return acc;
        }, {});
      }

      return String(value);
    };

    const sanitizedAsset = sanitizeFirestoreValue(asset);
    const normalizedInvNumber = String(asset?.invNumber || "").trim();

    try {
      const exists = asset?.id
        ? assets.find((a) => String(a?.id || "") === String(asset.id))
        : assets.find((a) => String(a?.invNumber || "").trim() === normalizedInvNumber);
      let result;

      if (exists) {
        const ignoredFields = new Set([
          "id",
          "createdAt",
          "updatedAt",
          "inventoryChangeHistory",
        ]);

        const comparableFields = Array.from(
          new Set([
            ...Object.keys(exists || {}),
            ...Object.keys(sanitizedAsset || {}),
          ])
        ).filter((field) => !ignoredFields.has(field));

        const normalizeComparable = (value) => {
          if (value === undefined || value === null) return "";
          if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
          if (typeof value === "boolean") return value ? "true" : "false";
          if (Array.isArray(value)) return JSON.stringify(value);
          if (typeof value === "object") return JSON.stringify(value);
          return String(value).trim();
        };

        const changes = comparableFields
          .map((field) => {
            const previousValue = exists?.[field] ?? null;
            const nextValue = sanitizedAsset?.[field] ?? null;

            if (normalizeComparable(previousValue) === normalizeComparable(nextValue)) {
              return null;
            }

            return {
              field,
              previousValue,
              nextValue,
            };
          })
          .filter(Boolean);

        if (changes.length > 0) {
          const targetInventorySession = getActiveAssetInventorySessionForAsset(sanitizedAsset);
          const targetInventoryScopeId = String(
            targetInventorySession?.scopeId || targetInventorySession?.scope_id || getAssetInventoryScopeId(sanitizedAsset) || assetInventorySessionScopeId || ""
          ).trim();
          const historyEntry = {
            changedAt: new Date().toISOString(),
            changedById: user?.uid || "",
            changedByName: user?.displayName || user?.fullName || user?.email || "Користувач",
            source: "inventory_edit",
            inventorySessionId: targetInventorySession?.id || "",
            inventorySessionScopeId: targetInventoryScopeId,
            changes,
          };

          sanitizedAsset.inventoryChangeHistory = [
            ...(Array.isArray(exists?.inventoryChangeHistory) ? exists.inventoryChangeHistory : []),
            historyEntry,
          ];
        }

        const { id: _ignoredId, ...updatePayload } = sanitizedAsset || {};

        // Оновлення існуючого активу
        result = await updateAssetInFirebase(exists.id, updatePayload);
        writeAuditLog({
          action: "asset_update",
          entityType: "asset",
          entityId: exists.id,
          description: `Оновлено актив ${String(updatePayload?.invNumber || exists?.invNumber || "")}`,
          details: {
            changedFieldsCount: (() => {
              if (!Array.isArray(sanitizedAsset?.inventoryChangeHistory) || sanitizedAsset.inventoryChangeHistory.length === 0) {
                return 0;
              }
              const lastEntry = sanitizedAsset.inventoryChangeHistory[sanitizedAsset.inventoryChangeHistory.length - 1];
              return Array.isArray(lastEntry?.changes) ? lastEntry.changes.length : 0;
            })(),
          },
        });
      } else {
        const { id: _ignoredId, ...addPayload } = sanitizedAsset || {};

        const targetInventorySession = getActiveAssetInventorySessionForAsset(sanitizedAsset);
        const targetInventoryScopeId = String(
          targetInventorySession?.scopeId || targetInventorySession?.scope_id || getAssetInventoryScopeId(sanitizedAsset) || assetInventorySessionScopeId || ""
        ).trim();

        sanitizedAsset.inventoryChangeHistory = [
          {
            changedAt: new Date().toISOString(),
            changedById: user?.uid || "",
            changedByName: user?.displayName || user?.fullName || user?.email || "Користувач",
            source: "asset_created",
            inventorySessionId: targetInventorySession?.id || "",
            inventorySessionScopeId: targetInventoryScopeId,
            changes: [
              {
                field: "created",
                previousValue: null,
                nextValue: "created",
              },
            ],
          },
        ];

        // Додавання нового активу
        result = await addAssetToFirebase({
          ...addPayload,
          inventoryChangeHistory: sanitizedAsset.inventoryChangeHistory,
        });
        writeAuditLog({
          action: "asset_create",
          entityType: "asset",
          entityId: String(result?.id || ""),
          description: `Створено актив ${String(addPayload?.invNumber || "")}`,
        });
      }

      if (result?.success === false) {
        throw result.error || new Error("Не вдалося зберегти актив");
      }

      setSelected(null);
      return true;
    } catch (error) {
      console.error("Помилка збереження активу:", error);
      alert(`Помилка збереження активу: ${error?.message || "невідома помилка"}`);
      return false;
    } finally {
      submitAssetLockRef.current = false;
    }
  };

  const handleDeleteAsset = async (assetId) => {
    try {
      const assetToDelete = assets.find((item) => String(item?.id || "") === String(assetId));
      const { success, error } = await deleteAssetFromFirebase(assetId);
      if (success) {
        writeAuditLog({
          action: "asset_delete",
          entityType: "asset",
          entityId: String(assetId || ""),
          description: `Видалено актив ${String(assetToDelete?.invNumber || "")}`,
        });
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

  const handleExport = (exportPayload = null) => {
    void (async () => {
      try {
        const { exportAssetsToExcel, exportCustomRowsToExcel, getAssetFieldExportType } = await loadExcelHelpers();

        const rows = Array.isArray(exportPayload?.rows) ? exportPayload.rows : null;
        if (rows && rows.length > 0) {
          const columnTypes = {};
          const exportedColumns = Array.isArray(exportPayload?.visibleColumns) ? exportPayload.visibleColumns : [];
          exportedColumns.forEach((column) => {
            if (!column || !column.header) return;
            const type = getAssetFieldExportType(column.key);
            if (type) columnTypes[column.header] = type;
          });
          exportCustomRowsToExcel(rows, "assets.xlsx", "Активи", columnTypes);
          return;
        }

        exportAssetsToExcel(assets);
      } catch (error) {
        console.error("Помилка експорту активів:", error);
        alert("Помилка експорту активів. Спробуйте ще раз.");
      }
    })();
  };

  const handleDownloadAssetTemplate = async () => {
    try {
      const { downloadAssetTemplate } = await loadExcelHelpers();
      downloadAssetTemplate();
    } catch (error) {
      console.error("Помилка завантаження шаблону активів:", error);
      alert("Помилка завантаження шаблону активів. Спробуйте ще раз.");
    }
  };

  const handleImportAssets = async (file) => {
    try {
      const { importAssetsFromExcel } = await loadExcelHelpers();
      const importedAssets = await importAssetsFromExcel(file);
      if (!Array.isArray(importedAssets) || importedAssets.length === 0) {
        alert("Файл не містить даних для імпорту.");
        return;
      }

      const normalizeInvNumber = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();

      const existingByInvNumber = new Map();
      const duplicatedInDb = new Set();
      for (const asset of assets) {
        const normalized = normalizeInvNumber(asset?.invNumber);
        if (!normalized) continue;
        if (existingByInvNumber.has(normalized)) {
          duplicatedInDb.add(normalized);
          continue;
        }
        existingByInvNumber.set(normalized, asset);
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;
      const errors = [];
      const seenInFile = new Map();

      const rows = importedAssets.map((asset, index) => ({
        rowNumber: index + 2,
        asset,
      }));

      const validRows = [];

      for (const row of rows) {
        const rawInvNumber = String(row.asset?.invNumber ?? "").trim();
        const rawName = String(row.asset?.name ?? "").trim();
        const invNumber = normalizeInvNumber(rawInvNumber);

        if (!invNumber) {
          skipped += 1;
          errors.push(`Рядок ${row.rowNumber}: порожній інвентарний номер.`);
          continue;
        }

        if (!rawName) {
          skipped += 1;
          errors.push(`Рядок ${row.rowNumber}: порожня назва активу.`);
          continue;
        }

        if (seenInFile.has(invNumber)) {
          const firstRow = seenInFile.get(invNumber);
          skipped += 1;
          errors.push(`Рядок ${row.rowNumber}: дубль інвентарного номера "${invNumber}" (перший у рядку ${firstRow}).`);
          continue;
        }

        seenInFile.set(invNumber, row.rowNumber);
        validRows.push({
          ...row,
          invNumber,
          name: rawName,
        });
      }

      const sanitizeFirestoreValue = (value) => {
        if (value === undefined) return undefined;
        if (value === null) return null;
        const valueType = typeof value;
        if (valueType === "string" || valueType === "boolean") return value;
        if (valueType === "number") return Number.isFinite(value) ? value : null;
        if (value instanceof Date) return value.toISOString();
        if (Array.isArray(value)) {
          return value
            .map((item) => sanitizeFirestoreValue(item))
            .map((item) => (Array.isArray(item) ? item.join(", ") : item))
            .filter((item) => item !== undefined);
        }
        if (valueType === "object") {
          return Object.entries(value).reduce((acc, [key, nestedValue]) => {
            const sanitized = sanitizeFirestoreValue(nestedValue);
            if (sanitized !== undefined) { acc[key] = sanitized; }
            return acc;
          }, {});
        }
        return String(value);
      };

      // --- Batch import via API (one request for all rows) ---
      if (isAssetsApiEnabled()) {
        const batchItems = validRows.map((row) => {
          const existing = existingByInvNumber.get(row.invNumber);
          const mergedPayload = { ...existing, ...row.asset, invNumber: row.invNumber, name: row.name };
          const sanitizedPayload = sanitizeFirestoreValue(mergedPayload);
          return {
            existingId: existing?.id || "",
            payload: sanitizedPayload,
          };
        });

        try {
          const result = await batchImportAssetsApi(batchItems);
          created = result.created || 0;
          updated = result.updated || 0;
          failed = result.failed || 0;
          if (Array.isArray(result.errors)) {
            errors.push(...result.errors);
          }
        } catch (batchErr) {
          console.error("Batch import failed:", batchErr);
          alert(`Помилка пакетного імпорту: ${batchErr.message}`);
          return;
        }

        // Single refresh after entire batch
        try { await refreshAssetsFromApi(); } catch { /* ignore */ }
      } else {
      // --- Fallback: sequential writes (Firebase / non-API mode) ---
      for (const row of validRows) {
        const importedAsset = row.asset;
        const invNumber = row.invNumber;
        const name = row.name;
        const existing = existingByInvNumber.get(invNumber);

        try {
          const mergedPayload = { ...existing, ...importedAsset, invNumber, name };
          const sanitizedPayload = sanitizeFirestoreValue(mergedPayload);
          let result;
          if (existing?.id) {
            result = await updateAssetInFirebase(existing.id, sanitizedPayload);
            updated += 1;
          } else {
            result = await addAssetToFirebase(sanitizedPayload);
            created += 1;
          }

          if (result?.success === false) {
            throw result.error || new Error("помилка запису");
          }
        } catch (rowError) {
          if (existing?.id) {
            updated = Math.max(0, updated - 1);
          } else {
            created = Math.max(0, created - 1);
          }
          failed += 1;
          errors.push(`Рядок ${row.rowNumber}: не вдалося імпортувати (${rowError?.message || "невідома помилка"}).`);
        }
      }
      }

      const dbDuplicatesWarning = duplicatedInDb.size > 0
        ? `\nУвага: в базі вже є дублікати інвентарних номерів (${Array.from(duplicatedInDb).slice(0, 5).join(", ")}${duplicatedInDb.size > 5 ? "..." : ""}).`
        : "";

      const errorPreview = errors.length > 0
        ? `\n\nПроблемні рядки:\n- ${errors.slice(0, 10).join("\n- ")}${errors.length > 10 ? "\n- ..." : ""}`
        : "";

      alert(
        `Імпорт завершено.\nДодано: ${created}\nОновлено: ${updated}\nПропущено: ${skipped}\nПомилки запису: ${failed}${dbDuplicatesWarning}${errorPreview}`
      );
    } catch (error) {
      console.error("Помилка імпорту активів:", error);
      alert("Помилка імпорту файлу активів. Перевірте формат Excel.");
    }
  };

  const handleImportRestaurants = async (file) => {
    try {
      const { importRestaurantsFromExcel } = await loadExcelHelpers();
      const importedRestaurants = await importRestaurantsFromExcel(file);
      for (const restaurant of importedRestaurants) {
        await addRestaurantToFirebase(restaurant);
      }
      alert(`Успішно імпортовано ${importedRestaurants.length} ресторанів`);
    } catch (error) {
      console.error("Помилка імпорту ресторанів:", error);
      alert("Помилка імпорту файлу. Перевірте формат файлу.");
    }
  };

  const handleDownloadRestaurantTemplate = async () => {
    try {
      const { downloadRestaurantTemplate } = await loadExcelHelpers();
      downloadRestaurantTemplate();
    } catch (error) {
      console.error("Помилка завантаження шаблону ресторанів:", error);
      alert("Помилка завантаження шаблону ресторанів. Спробуйте ще раз.");
    }
  };

  const handleExportRestaurants = async () => {
    try {
      const { exportRestaurantsToExcel } = await loadExcelHelpers();
      exportRestaurantsToExcel(restaurants);
    } catch (error) {
      console.error("Помилка експорту ресторанів:", error);
      alert("Помилка експорту ресторанів. Спробуйте ще раз.");
    }
  };

  const summary = useMemo(() => {
    const total = assets.length;
    const toWriteOff = assets.filter((a) => a.decision === "Списати").length;
    const toMove = assets.filter((a) => a.decision === "Перемістити").length;
    return { total, toWriteOff, toMove };
  }, [assets]);

  // Використовуємо menuStructure з Firestore для побудови меню
  const navItems = useMemo(() => {
    const isAdmin = user?.role === 'admin';
    // Якщо menuStructure порожній, fallback на стандартну структуру
    const structure = (Array.isArray(menuStructure) && menuStructure.length > 0)
      ? menuStructure
      : DEFAULT_FALLBACK_MENU_STRUCTURE;

    // Додаємо пункт "Управління меню" для адміна
    const structureWithAdmin = structure.map(section => {
      if (section.id === "maintenance" && isAdmin) {
        const hasMenuAdmin = section.children.some(child => child.id === "menu-admin");
        return {
          ...section,
          children: hasMenuAdmin
            ? section.children
            : [...section.children, { id: "menu-admin", label: "Управління меню" }]
        };
      }
      return section;
    });

    // Фільтрація за правами
    const filtered = structureWithAdmin.map(group => {
      const filteredChildren = group.children.filter(child => {
        const perm = userPermissions[child.id];
        const hasExplicitAccess = perm === true || (Array.isArray(perm) && perm.length > 0);
        const hasAccess = isAdmin || hasExplicitAccess;
        return hasAccess;
      });
      return { ...group, children: filteredChildren };
    }).filter(group => group.children.length > 0);

    // Додаємо іконки
    const result = filtered.map(group => ({
      ...group,
      icon: resolveNavIconComponent(group)
    }));
    return result;
  }, [menuStructure, user?.role, user?.workRole, userPermissions]);

  const isGlobalAdmin = useMemo(() => user?.role === "admin" && !user?.restaurant, [user?.role, user?.restaurant]);

  const allowedRestaurantNames = useMemo(() => {
    return new Set(
      (restaurants || [])
        .map((restaurant) => normalizeLowerText(restaurant?.name))
        .filter(Boolean)
    );
  }, [restaurants]);

  const allowedRestaurantIds = useMemo(() => {
    return new Set(
      (restaurants || [])
        .map((restaurant) => String(restaurant?.id || "").trim())
        .filter(Boolean)
    );
  }, [restaurants]);

  const isAssetVisibleForCurrentRestaurants = useCallback((asset) => {
    if (isGlobalAdmin) return true;
    if (restaurants.length === 0) return false;

    const assetRestaurantIds = [
      asset?.restaurantId,
      asset?.restaurant_id,
      asset?.locationId,
      asset?.location_id,
      asset?.restaurant,
      asset?.location,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (assetRestaurantIds.some((id) => allowedRestaurantIds.has(id))) {
      return true;
    }

    const assetRestaurantNames = [
      asset?.locationName,
      asset?.location_name,
      asset?.restaurantName,
      asset?.restaurant_name,
      asset?.restaurant,
      asset?.location,
    ]
      .map((value) => normalizeLowerText(value))
      .filter(Boolean);

    for (const candidate of assetRestaurantNames) {
      if (allowedRestaurantNames.has(candidate)) return true;
    }

    return false;
  }, [isGlobalAdmin, restaurants.length, allowedRestaurantIds, allowedRestaurantNames]);

  const visibleAssetsForCurrentUser = useMemo(() => {
    if (isGlobalAdmin) return assets;
    return assets.filter((asset) => isAssetVisibleForCurrentRestaurants(asset));
  }, [assets, isGlobalAdmin, isAssetVisibleForCurrentRestaurants]);

  const renderAddressFields = () => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div>
        <label className="text-sm font-semibold text-slate-800">Країна</label>
        <input
          className={baseInput}
          value={restaurantForm.country}
          onChange={(e) => setRestaurantForm((p) => ({ ...p, country: e.target.value }))}
        />
      </div>
      <div>
        <label className="text-sm font-semibold text-slate-800">Область</label>
        <input
          className={baseInput}
          value={restaurantForm.region}
          onChange={(e) => setRestaurantForm((p) => ({ ...p, region: e.target.value }))}
        />
      </div>
      <div>
        <label className="text-sm font-semibold text-slate-800">Місто</label>
        <input
          className={baseInput}
          value={restaurantForm.city}
          onChange={(e) => setRestaurantForm((p) => ({ ...p, city: e.target.value }))}
        />
      </div>
      <div>
        <label className="text-sm font-semibold text-slate-800">Вулиця</label>
        <input
          className={baseInput}
          value={restaurantForm.street}
          onChange={(e) => setRestaurantForm((p) => ({ ...p, street: e.target.value }))}
        />
      </div>
      <div>
        <label className="text-sm font-semibold text-slate-800">Поштовий індекс</label>
        <input
          className={baseInput}
          value={restaurantForm.postalCode}
          onChange={(e) => setRestaurantForm((p) => ({ ...p, postalCode: e.target.value }))}
        />
      </div>
      <div>
        <label className="text-sm font-semibold text-slate-800">Адреса (рядок)</label>
        <input
          className={baseInput}
          value={restaurantForm.address}
          onChange={(e) => setRestaurantForm((p) => ({ ...p, address: e.target.value }))}
        />
      </div>
    </div>
  );

  const renderSeatingFields = () => (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-700">Посадкові місця та площа</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="text-sm font-semibold text-slate-800">Посадкові (всього)</label>
          <input
            type="number"
            className={baseInput}
            value={restaurantForm.seatsTotal}
            onChange={(e) => setRestaurantForm((p) => ({ ...p, seatsTotal: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Посадкові (літо)</label>
          <input
            type="number"
            className={baseInput}
            value={restaurantForm.seatsSummer}
            onChange={(e) => setRestaurantForm((p) => ({ ...p, seatsSummer: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Посадкові (зима)</label>
          <input
            type="number"
            className={baseInput}
            value={restaurantForm.seatsWinter}
            onChange={(e) => setRestaurantForm((p) => ({ ...p, seatsWinter: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Площа (всього)</label>
          <input
            type="number"
            className={baseInput}
            value={restaurantForm.areaTotal}
            onChange={(e) => setRestaurantForm((p) => ({ ...p, areaTotal: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Площа (літо)</label>
          <input
            type="number"
            className={baseInput}
            value={restaurantForm.areaSummer}
            onChange={(e) => setRestaurantForm((p) => ({ ...p, areaSummer: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-800">Площа (зима)</label>
          <input
            type="number"
            className={baseInput}
            value={restaurantForm.areaWinter}
            onChange={(e) => setRestaurantForm((p) => ({ ...p, areaWinter: e.target.value }))}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-800">
        <input
          type="checkbox"
          checked={restaurantForm.hasTerrace}
          onChange={(e) => setRestaurantForm((p) => ({ ...p, hasTerrace: e.target.checked }))}
        />
        Наявна тераса
      </label>
    </div>
  );

  const renderContent = () => {
        const assetsForReports = visibleAssetsForCurrentUser;

        // ...existing code...
        const isDashboardNav =
          activeNav === "dashboard" ||
          activeNav === "dashboard-ops" ||
          String(activeNav || "").includes("dashboard");
        const isDashboardTopTab = topTab === "maindashboard" || topTab === "dashboard-ops";

        if (isDashboardNav || (!String(activeNav || "").trim() && isDashboardTopTab)) {
          const fmtKwh = (n) => `${Number(n || 0).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} кВт·год`;
          const fmtHours = (n) => {
            const value = Number(n || 0);
            if (!Number.isFinite(value) || value <= 0) return "0 год";
            const totalMinutes = Math.round(value * 60);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            if (hours === 0) return `${minutes} хв`;
            if (minutes === 0) return `${hours} год`;
            return `${hours} год ${minutes} хв`;
          };
          const ov = electricityOverview;
          const dashboardRestaurantOptions = Array.isArray(restaurants) ? restaurants : [];
          const showDashboardRestaurantSelector = user?.role === "admin" || dashboardRestaurantOptions.length > 1;
          const fmtDateUk = (iso) => {
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
            return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso || "");
          };

          const allTotalMains = (ov.perRestaurantAll || []).reduce((sum, row) => sum + Number(row?.mains || 0), 0);
          const allTotalGen = (ov.perRestaurantAll || []).reduce((sum, row) => sum + Number(row?.gen || 0), 0);
          const allTotalGenHours = (ov.perRestaurantAll || []).reduce((sum, row) => sum + Number(row?.genHours || 0), 0);
          const toIso = (dateObj) => {
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, "0");
            const d = String(dateObj.getDate()).padStart(2, "0");
            return `${y}-${m}-${d}`;
          };
          const shiftIso = (iso, days) => {
            const d = new Date(`${String(iso)}T00:00:00`);
            d.setDate(d.getDate() + days);
            return toIso(d);
          };
          const pctDiff = (current, baseline) => {
            const c = Number(current || 0);
            const b = Number(baseline || 0);
            if (!Number.isFinite(c) || !Number.isFinite(b) || b <= 0) return null;
            return ((c - b) / b) * 100;
          };
          const collectMainsByRestaurantAndDate = () => {
            const byRestaurant = new Map();
            for (const rec of electricityReadings || []) {
              const rid = String(rec?.restaurantId || "");
              const iso = String(rec?.date || "").slice(0, 10);
              if (!rid || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
              const meters = Array.isArray(rec?.meters) ? rec.meters : [];
              let mains = 0;
              for (const m of meters) {
                const label = String(m?.meterNumber || m?.meterId || "");
                if (/генератор/i.test(label)) continue;
                if (!/a\+/i.test(label)) continue;
                const v = Number(m?.consumption ?? m?.currValue);
                if (Number.isFinite(v)) mains += v;
              }
              let dateMap = byRestaurant.get(rid);
              if (!dateMap) {
                dateMap = new Map();
                byRestaurant.set(rid, dateMap);
              }
              dateMap.set(iso, (dateMap.get(iso) || 0) + mains);
            }
            return byRestaurant;
          };
          const mainsByRestaurantDate = collectMainsByRestaurantAndDate();
          const targetIso = ov.yIso;
          const yesterdayIso = shiftIso(targetIso, -1);
          const sameWeekdayLastIso = shiftIso(targetIso, -7);
          const sameWeekday4Isos = [7, 14, 21, 28].map((d) => shiftIso(targetIso, -d));
          const getRestaurantMainsForDate = (restaurantId, iso) => {
            const dateMap = mainsByRestaurantDate.get(String(restaurantId || ""));
            return Number(dateMap?.get(iso) || 0);
          };
          const getAllMainsForDate = (iso) => {
            let total = 0;
            for (const r of dashboardRestaurantOptions) {
              total += getRestaurantMainsForDate(r.id, iso);
            }
            return total;
          };
          const avgSameWeekday4 = (getter) => {
            const values = sameWeekday4Isos.map((iso) => Number(getter(iso) || 0)).filter((v) => Number.isFinite(v) && v > 0);
            if (!values.length) return 0;
            return values.reduce((a, b) => a + b, 0) / values.length;
          };
          const trendLabel = (pct) => {
            if (!Number.isFinite(pct)) return "н/д";
            const abs = Math.abs(pct);
            return `${pct > 0 ? "+" : "-"}${abs.toFixed(1)}%`;
          };
          const TrendBadge = ({ pct, label }) => {
            const isUp = Number.isFinite(pct) && pct > 0;
            const isDown = Number.isFinite(pct) && pct < 0;
            const toneClass = isUp
              ? "text-rose-700 bg-rose-50 border-rose-200"
              : isDown
                ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                : "text-slate-500 bg-slate-50 border-slate-200";

            return (
              <span
                className={`inline-flex items-center justify-center gap-0.5 rounded-md border px-1 py-0.5 text-[9px] leading-none font-semibold whitespace-nowrap ${toneClass}`}
                title={label}
                aria-label={`${label}: ${trendLabel(pct)}`}
              >
                {isUp ? <TrendingUp size={10} /> : isDown ? <TrendingDown size={10} /> : <span className="inline-block h-[10px] w-[10px]" />}
                <span>{trendLabel(pct)}</span>
              </span>
            );
          };
          const getTrendPackForRestaurant = (row) => {
            const current = Number(row?.mains || 0);
            const rid = row?.id;
            const baselineYesterday = getRestaurantMainsForDate(rid, yesterdayIso);
            const baselineSameDay = getRestaurantMainsForDate(rid, sameWeekdayLastIso);
            const baseline4Avg = avgSameWeekday4((iso) => getRestaurantMainsForDate(rid, iso));
            return {
              vsYesterday: pctDiff(current, baselineYesterday),
              vsSameWeekday: pctDiff(current, baselineSameDay),
              vs4Avg: pctDiff(current, baseline4Avg),
            };
          };
          const totalTrendPack = (() => {
            const current = allTotalMains;
            const baselineYesterday = getAllMainsForDate(yesterdayIso);
            const baselineSameDay = getAllMainsForDate(sameWeekdayLastIso);
            const baseline4Avg = avgSameWeekday4((iso) => getAllMainsForDate(iso));
            return {
              vsYesterday: pctDiff(current, baselineYesterday),
              vsSameWeekday: pctDiff(current, baselineSameDay),
              vs4Avg: pctDiff(current, baseline4Avg),
            };
          })();

          return (
            <>
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3">
                  <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
                    <div className="min-w-0">
                      {showDashboardRestaurantSelector ? (
                        <select
                          value={dashboardRestaurantFilter}
                          onChange={(e) => setDashboardRestaurantFilter(e.target.value)}
                          className="h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none sm:min-w-[15rem]"
                          aria-label="Обрати заклад"
                        >
                          <option value="">Всі доступні</option>
                          {dashboardRestaurantOptions.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
                          {dashboardRestaurantOptions[0]?.name || "—"}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <DatePickerPopover
                        label=""
                        className="w-full"
                        triggerClassName="h-10 px-3 py-2"
                        value={dashboardDateFilter || ov.yIso}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={(nextIso) => {
                          const fallback = (() => {
                            const d = new Date();
                            d.setDate(d.getDate() - 1);
                            return d.toISOString().slice(0, 10);
                          })();
                          setDashboardDateFilter(String(nextIso || "") === fallback ? "" : String(nextIso || ""));
                        }}
                      />
                    </div>
                    <div className="w-auto justify-self-end">
                      <button
                        type="button"
                        onClick={() => setShowDashboardSummaryModal(true)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                        aria-label="Зведені дані"
                        title="Зведені дані"
                      >
                        <BarChart3 size={18} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Загальний підсумок: «Спожито», «З генератора», «Годин роботи генератора» */}
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 shadow-sm sm:p-3">
                    <p className="text-[10px] leading-tight font-semibold text-emerald-700 sm:text-xs">Спожито {ov.isYesterday ? "за вчора" : `за ${fmtDateUk(ov.yIso)}`}</p>
                    <p className="mt-0.5 text-base leading-none font-bold text-emerald-900 sm:text-2xl">{fmtKwh(ov.total)}</p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 shadow-sm sm:p-3">
                    <p className="text-[10px] leading-tight font-semibold text-amber-700 sm:text-xs">З генератора {ov.isYesterday ? "за вчора" : `за ${fmtDateUk(ov.yIso)}`}</p>
                    <p className="mt-0.5 text-base leading-none font-bold text-amber-900 sm:text-2xl">{fmtKwh(ov.totalGen)}</p>
                  </div>
                  <div className="rounded-lg border border-sky-200 bg-sky-50 p-2 shadow-sm sm:p-3">
                    <p className="text-[10px] leading-tight font-semibold text-sky-700 sm:text-xs">Годин роботи генератора (орієнтовно)</p>
                    <p className="mt-0.5 text-base leading-none font-bold text-sky-900 sm:text-2xl">{fmtHours(ov.totalGenHours)}</p>
                  </div>
                </div>
              </div>
              {showDashboardSummaryModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 p-2 sm:p-4">
                  <button
                    type="button"
                    className="absolute inset-0"
                    aria-label="Закрити"
                    onClick={() => setShowDashboardSummaryModal(false)}
                  />
                  <div className="relative z-10 mx-auto my-3 w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-2xl sm:my-6">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Загальна інформація по закладах</h3>
                        <p className="text-sm text-slate-600">Дата: {fmtDateUk(ov.yIso)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDashboardSummaryModal(false)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Закрити
                      </button>
                    </div>
                    <div className="px-3 py-3 sm:px-4">
                      <div className="hidden sm:block">
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700">
                              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Ресторан</th>
                              <th className="border border-slate-200 px-3 py-2 text-right font-semibold">Спожито з мережі / тренд</th>
                              <th className="border border-slate-200 px-3 py-2 text-right font-semibold">Спожито з генератора</th>
                              <th className="border border-slate-200 px-3 py-2 text-right font-semibold">Години роботи генератора</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(ov.perRestaurantAll || []).filter((row) => Number(row?.mains || 0) > 0).map((row) => {
                              const trend = getTrendPackForRestaurant(row);
                              return (
                              <tr key={row.id} className="odd:bg-white even:bg-slate-50">
                                <td className="border border-slate-200 px-3 py-2 text-slate-900">{row.name}</td>
                                <td className="border border-slate-200 px-3 py-2 text-right">
                                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                                    <span className="text-right tabular-nums">{fmtKwh(row.mains)}</span>
                                    <div className="flex flex-nowrap items-center justify-end gap-1 border-l border-slate-200 pl-2">
                                      <TrendBadge pct={trend.vsYesterday} label="До вчора" />
                                      <TrendBadge pct={trend.vsSameWeekday} label="До цього ж дня тижня" />
                                      <TrendBadge pct={trend.vs4Avg} label="До середнього 4 останніх таких днів" />
                                    </div>
                                  </div>
                                </td>
                                <td className="border border-slate-200 px-3 py-2 text-right tabular-nums">{fmtKwh(row.gen)}</td>
                                <td className="border border-slate-200 px-3 py-2 text-right tabular-nums">{fmtHours(row.genHours)}</td>
                              </tr>
                              );
                            })}
                            <tr className="bg-indigo-50 font-semibold text-indigo-900">
                              <td className="border border-slate-200 px-3 py-2">Разом</td>
                              <td className="border border-slate-200 px-3 py-2 text-right">
                                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                                  <span className="text-right tabular-nums">{fmtKwh(allTotalMains)}</span>
                                  <div className="flex flex-nowrap items-center justify-end gap-1 border-l border-indigo-200 pl-2">
                                    <TrendBadge pct={totalTrendPack.vsYesterday} label="До вчора" />
                                    <TrendBadge pct={totalTrendPack.vsSameWeekday} label="До цього ж дня тижня" />
                                    <TrendBadge pct={totalTrendPack.vs4Avg} label="До середнього 4 останніх таких днів" />
                                  </div>
                                </div>
                              </td>
                              <td className="border border-slate-200 px-3 py-2 text-right tabular-nums">{fmtKwh(allTotalGen)}</td>
                              <td className="border border-slate-200 px-3 py-2 text-right tabular-nums">{fmtHours(allTotalGenHours)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div className="space-y-2 sm:hidden">
                        {(ov.perRestaurantAll || []).filter((row) => Number(row?.mains || 0) > 0).map((row) => {
                          const trend = getTrendPackForRestaurant(row);
                          return (
                          <div key={`m-${row.id}`} className="rounded-xl border border-slate-200 bg-white p-3">
                            <p className="text-sm font-bold text-slate-900">{row.name}</p>
                            <div className="mt-2 grid grid-cols-1 gap-1 text-xs">
                              <p className="flex items-center justify-between gap-3">
                                <span className="text-slate-600">Спожито з мережі</span>
                                <span className="font-semibold text-slate-900">{fmtKwh(row.mains)}</span>
                              </p>
                              <p className="flex items-center justify-between gap-3"><span className="text-slate-600">Спожито з генератора</span><span className="font-semibold text-slate-900">{fmtKwh(row.gen)}</span></p>
                              <p className="flex items-center justify-between gap-3"><span className="text-slate-600">Години роботи генератора</span><span className="font-semibold text-slate-900">{fmtHours(row.genHours)}</span></p>
                              <div className="mt-1 flex flex-wrap justify-end gap-1 border-t border-slate-100 pt-1">
                                <TrendBadge pct={trend.vsYesterday} label="До вчора" />
                                <TrendBadge pct={trend.vsSameWeekday} label="До цього ж дня тижня" />
                                <TrendBadge pct={trend.vs4Avg} label="До середнього 4 останніх таких днів" />
                              </div>
                            </div>
                          </div>
                          );
                        })}
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                          <p className="text-sm font-bold text-indigo-900">Разом</p>
                          <div className="mt-2 grid grid-cols-1 gap-1 text-xs">
                            <p className="flex items-center justify-between gap-3">
                              <span className="text-indigo-700">Спожито з мережі</span>
                              <span className="font-semibold text-indigo-900">{fmtKwh(allTotalMains)}</span>
                            </p>
                            <p className="flex items-center justify-between gap-3"><span className="text-indigo-700">Спожито з генератора</span><span className="font-semibold text-indigo-900">{fmtKwh(allTotalGen)}</span></p>
                            <p className="flex items-center justify-between gap-3"><span className="text-indigo-700">Години роботи генератора</span><span className="font-semibold text-indigo-900">{fmtHours(allTotalGenHours)}</span></p>
                            <div className="mt-1 flex flex-wrap justify-end gap-1 border-t border-indigo-100 pt-1">
                              <TrendBadge pct={totalTrendPack.vsYesterday} label="До вчора" />
                              <TrendBadge pct={totalTrendPack.vsSameWeekday} label="До цього ж дня тижня" />
                              <TrendBadge pct={totalTrendPack.vs4Avg} label="До середнього 4 останніх таких днів" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        }

        if (activeNav === "database") {
          return <DatabaseConnectionsManager />;
        }

        // Вкладка управління утилітами
        // Підтримуємо обидва написання: `utilityservice` (правильне) та `utilytyservice` (типова друкарська помилка в збереженому меню).
        if (activeNav === "inventory-utilities" && (topTab === "utilityservice" || topTab === "utilytyservice")) {
          const handleAddMeter = async (meter) => {
            await addUtilityMeter(meter);
            // Оновити список після додавання
            const all = [];
            for (const r of restaurants) {
              for (const type of ["electricity", "water_cold", "water_hot", "gas"]) {
                try {
                  const meters = await getUtilityMeters(r.id, type);
                  all.push(...meters);
                } catch {}
              }
            }
            setUtilityMeters(all);
          };
          const handleUpdateMeter = async (meter) => {
            await updateUtilityMeterPrice(meter.id, meter.price);
            setUtilityMeters((prev) => prev.map(m => m.id === meter.id ? { ...m, price: meter.price } : m));
          };
          const handleDeleteMeter = async (id) => {
            await deleteUtilityMeter(id);
            setUtilityMeters((prev) => prev.filter(m => m.id !== id));
          };
          return (
            <div className="space-y-4">
              <UtilitiesManagementModule
                restaurants={restaurants}
                onUpdateRestaurant={updateRestaurantInFirebase}
              />
              <div className="p-4">
                <UtilityMetersManager
                  restaurants={restaurants}
                  meters={utilityMeters}
                  onAddMeter={handleAddMeter}
                  onUpdateMeter={handleUpdateMeter}
                  onDeleteMeter={handleDeleteMeter}
                />
              </div>
            </div>
          );
        }

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

    // Вкладка електроенергії
    if (activeNav === "inventory-utilities" && topTab === "electricityinv") {
      return (
        <div className="grid grid-cols-1">
          <ElectricityTab user={user} restaurants={restaurants} utilityMeters={utilityMeters} />
        </div>
      );
    }
    if (activeNav === "settings-restaurant") {
      const restaurantTopTab = String(topTab || "projects");

      if (restaurantTopTab === "main") {
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

      if (restaurantTopTab === "schedule") {
        return renderSchedule();
      }

      if (restaurantTopTab === "projects") {
        const handleAddRestaurant = () => {
          const defaultBusinessUnit = businessUnits[0] || "";
          setSelectedRestaurant({
            id: null,
            regNumber: "",
            name: "",
            businessUnit: defaultBusinessUnit,
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

        const handleEditRestaurant = (restaurant) => {
          const fullRestaurant =
            firebaseRestaurants.find((item) => String(item.id) === String(restaurant.id)) ||
            restaurant;

          if (!fullRestaurant) {
            console.error("Не вдалося завантажити дані ресторану");
            alert("Помилка завантаження даних ресторану");
            return;
          }

          const fallbackBusinessUnit =
            String(fullRestaurant.businessUnit || "").trim() ||
            businessUnits[0] ||
            "";

          setSelectedRestaurant({
            ...fullRestaurant,
            businessUnit: fallbackBusinessUnit,
          });
        };

        const handleDeleteRestaurant = async (id) => {
          if (!confirm("Ви впевнені, що хочете видалити цей ресторан?")) {
            return;
          }
          
          try {
            const result = await deleteRestaurantFromFirebase(id);
            if (!result?.success) {
              throw result?.error || new Error("Не вдалося видалити ресторан");
            }
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
            const restaurantToSave = {
              ...selectedRestaurant,
              businessUnit: String(selectedRestaurant.businessUnit || "").trim() || businessUnits[0] || "",
            };

            if (selectedRestaurant.id) {
              // Оновлення існуючого
              const result = await updateRestaurantInFirebase(selectedRestaurant.id, restaurantToSave);
              if (!result?.success) {
                throw result?.error || new Error("Не вдалося оновити ресторан");
              }
            } else {
              // Додавання нового
              const result = await addRestaurantToFirebase(restaurantToSave);
              if (!result?.success) {
                throw result?.error || new Error("Не вдалося додати ресторан");
              }
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

              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-700">🖨️ Принтер етикеток</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-semibold text-slate-800">IP принтера (публічна або локальна)</label>
                    <input
                      className={baseInput}
                      value={selectedRestaurant.printerIp || ""}
                      onChange={(e) =>
                        setSelectedRestaurant((p) => ({ ...p, printerIp: e.target.value }))
                      }
                      placeholder="напр. 192.168.22.59 або публічна IP"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-800">Порт принтера</label>
                    <input
                      className={baseInput}
                      value={selectedRestaurant.printerPort || ""}
                      onChange={(e) =>
                        setSelectedRestaurant((p) => ({ ...p, printerPort: e.target.value }))
                      }
                      placeholder="9100"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-700">⚡ Лічильники електроенергії (Vik-Soft API)</p>
                <div>
                  <label className="text-sm font-semibold text-slate-800">EIC коди основних вводів</label>
                  <textarea
                    className={baseInput}
                    rows={2}
                    value={selectedRestaurant.vikSoftEics || ""}
                    onChange={(e) =>
                      setSelectedRestaurant((p) => ({ ...p, vikSoftEics: e.target.value }))
                    }
                    placeholder="один або кілька EIC через кому, напр. 62Z00000000123U7, 62Z00000000456U2"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-800">EIC коди генератора</label>
                  <textarea
                    className={baseInput}
                    rows={2}
                    value={selectedRestaurant.vikSoftGeneratorEics || ""}
                    onChange={(e) =>
                      setSelectedRestaurant((p) => ({ ...p, vikSoftGeneratorEics: e.target.value }))
                    }
                    placeholder="EIC лічильників генератора через кому"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  EIC код можна отримати з адмінки Vik-Soft (відповідає лічильнику ресторану).
                  Дані будуть запитані через офіційне API за обраний день.
                </p>
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
          <div className="card p-4 sm:p-5 bg-white border border-slate-200 text-slate-900 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
              <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
                {user?.role === 'admin' ? 'Управління проєктами' : 'Мій ресторан'}
              </h2>
              {user?.role === 'admin' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    ref={(input) => (window.restaurantImportInput = input)}
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      if (file) {
                        await handleImportRestaurants(file);
                        e.target.value = "";
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void handleDownloadRestaurantTemplate();
                    }}
                    className="flex items-center gap-1 px-2 sm:px-4 py-2 rounded-lg bg-slate-600 text-white font-semibold hover:bg-slate-500 shadow text-xs sm:text-sm"
                  >
                    <FileDown size={16} />
                    <span className="hidden sm:inline">Шаблон</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.restaurantImportInput?.click()}
                    className="flex items-center gap-1 px-2 sm:px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-500 shadow text-xs sm:text-sm"
                  >
                    <Upload size={16} />
                    <span className="hidden sm:inline">Імпорт</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleExportRestaurants();
                    }}
                    className="flex items-center gap-1 px-2 sm:px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 shadow text-xs sm:text-sm"
                  >
                    <Download size={16} />
                    <span className="hidden sm:inline">Експорт</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddRestaurant()}
                    className="flex items-center gap-1 px-2 sm:px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 shadow text-xs sm:text-sm"
                  >
                    <Plus size={18} />
                    <span className="hidden sm:inline">Додати ресторан</span>
                    <span className="sm:hidden">+</span>
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold text-slate-700">
                      Обліковий №
                    </th>
                    <th className="text-left py-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold text-slate-700">
                      Назва
                    </th>
                    <th className="hidden sm:table-cell text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Бізнес-напрям
                    </th>
                    <th className="hidden md:table-cell text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Адреса
                    </th>
                    <th className="hidden lg:table-cell text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Посадкові місця
                    </th>
                    <th className="hidden lg:table-cell text-left py-3 px-4 text-sm font-semibold text-slate-700">
                      Площа, м²
                    </th>
                    <th className="text-right py-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold text-slate-700">
                      Дії
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {restaurants.map((restaurant) => (
                    <tr key={restaurant.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-2 sm:px-4 text-xs sm:text-sm text-slate-800 font-medium">
                        {restaurant.regNumber}
                      </td>
                      <td className="py-3 px-2 sm:px-4 text-xs sm:text-sm text-slate-800 font-medium">
                        {restaurant.name}
                      </td>
                      <td className="hidden sm:table-cell py-3 px-4 text-sm text-slate-600">
                        {restaurant.businessUnit || "-"}
                      </td>
                      <td className="hidden md:table-cell py-3 px-4 text-sm text-slate-600">
                        {restaurant.street}, {restaurant.city}
                      </td>
                      <td className="hidden lg:table-cell py-3 px-4 text-sm text-slate-600">
                        {restaurant.hasTerrace
                          ? `Літо: ${restaurant.seatsSummer}, Зима: ${restaurant.seatsWinter}`
                          : restaurant.seatsTotal}
                      </td>
                      <td className="hidden lg:table-cell py-3 px-4 text-sm text-slate-600">
                        {restaurant.hasTerrace
                          ? `Літо: ${restaurant.areaSummer}, Зима: ${restaurant.areaWinter}`
                          : restaurant.areaTotal}
                      </td>
                      <td className="py-3 px-2 sm:px-4 text-sm text-right">
                        {user?.role === 'admin' && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditRestaurant(restaurant)}
                              className="px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium text-xs"
                            >
                              Ред.
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRestaurant(restaurant.id)}
                              className="px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium text-xs"
                            >
                              Вид.
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
            <AddUserForm currentUser={user} onSuccess={() => handleTopTabChange("edit")} />
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
            <RolePermissionsManager menuStructure={menuStructure} />
          </div>
        );
      }
    }

    if (activeNav === "ops-maintenance" || activeNav.includes("ops-maintenance")) {
      const legalTabKey = String(topTab || "").toLowerCase();
      if (legalTabKey.includes("legal")) {
        return (
          <div className="grid grid-cols-1">
            <LegalModule topTab={topTab} restaurants={restaurants} user={user} />
          </div>
        );
      }
      return (
        <div className="grid grid-cols-1">
          <ServiceRequestsModule topTab={topTab} restaurants={restaurants} user={user} />
        </div>
      );
    }

    if (activeNav === "ops-checklists" || activeNav.includes("ops-checklists")) {
      const checklistTabKey = String(topTab || "").toLowerCase();
      if (checklistTabKey.includes("haccp")) {
        return (
          <div className="grid grid-cols-1">
            <HaccpModule topTab={topTab} restaurants={restaurants} user={user} userPermissions={userPermissions} />
          </div>
        );
      }
      return (
        <div className="grid grid-cols-1">
          <ChecklistModule topTab={topTab} restaurants={restaurants} user={user} />
        </div>
      );
    }

    if (
      activeNav === "ops-haccp" ||
      activeNav.includes("ops-haccp") ||
      String(activeNav || "").toLowerCase().includes("haccpreport") ||
      String(activeNav || "").toLowerCase().includes("haccp-report")
    ) {
      return (
        <div className="grid grid-cols-1">
          <HaccpModule topTab={topTab} restaurants={restaurants} user={user} userPermissions={userPermissions} forceMode="report" />
        </div>
      );
    }

    const activeNavKey = String(activeNav || "").toLowerCase();
    const topTabKey = String(topTab || "").toLowerCase();
    const isProductBookingNav =
      activeNavKey.includes("productbooking") ||
      activeNavKey.includes("inventory-products");
    const isCateringActiveNav =
      activeNavKey.includes("catering") ||
      activeNavKey.includes("cattering") ||
      activeNavKey.includes("crmcatering") ||
      activeNavKey.includes("kitchencatering") ||
      activeNavKey.includes("reportcatering");
    const isCateringNav =
      !isProductBookingNav && (
        isCateringActiveNav ||
        topTabKey.includes("catering") ||
        topTabKey.includes("cattering") ||
        topTabKey.includes("chefmonitor") ||
        topTabKey.includes("salescateringreport") ||
        topTabKey.includes("managmentpnl") ||
        topTabKey.includes("managementpnl") ||
        topTabKey.includes("ordercrm") ||
        topTabKey.includes("contactcrm") ||
        topTabKey.includes("typycalform") ||
        topTabKey.includes("typicalform") ||
        topTabKey.includes("rolesettings") ||
        topTabKey.includes("cateringrolesettings")
      );

    if (isCateringNav) {
      return (
        <div className="grid grid-cols-1">
          <CateringOperationsModule
            user={user}
            activeNav={activeNav}
            topTab={topTab}
          />
        </div>
      );
    }

    const isSupplierPortalNav =
      activeNavKey.includes("ordersupplier") ||
      activeNavKey.includes("ordersuplayer") ||
      activeNavKey.includes("supplierportal") ||
      activeNavKey.includes("suplayerportal") ||
      activeNavKey.includes("vendorportal") ||
      ((activeNavKey.includes("supplier") || activeNavKey.includes("suplayer") || activeNavKey.includes("vendor") || activeNavKey.includes("постач")) &&
        (topTabKey.includes("order") || topTabKey.includes("замов"))) ||
      topTabKey.includes("ordersupplier") ||
      topTabKey.includes("ordersuplayer") ||
      topTabKey.includes("supplierportal") ||
      topTabKey.includes("suplayerportal") ||
      topTabKey.includes("vendorportal");

    if (
      activeNav === "inventory-products" ||
      activeNav.includes("inventory-products") ||
      activeNav === "productbooking" ||
      activeNav.includes("productbooking") ||
      isSupplierPortalNav
    ) {
      const currentTopTabLabel = (() => {
        const match = topTabs.find((tab) => tab?.id === topTab);
        return String(match?.label || "").trim();
      })();
      return (
        <div className="grid grid-cols-1">
          <ProductBookingModule topTab={topTab} topTabLabel={currentTopTabLabel} restaurants={restaurants} user={user} />
        </div>
      );
    }

    const isTechnologicalCardNav =
      activeNavKey.includes("inventory-technolog") ||
      activeNavKey.includes("technologicalcard") ||
      (activeNavKey.includes("technolog") && !activeNavKey.includes("inventory-products")) ||
      topTabKey.includes("newtechnologicalcard") ||
      topTabKey.includes("technologicalcard");

    if (isTechnologicalCardNav) {
      return (
        <div className="grid grid-cols-1">
          <TechnologicalCardModule />
        </div>
      );
    }

    const isAssetManagementNav =
      activeNavKey.includes("capexmang") ||
      activeNavKey.includes("assetmanag") ||
      activeNavKey.includes("управл") ||
      activeNavKey.includes("керув");
    const isAssetManagementTab =
      topTabKey.includes("capexway") ||
      topTabKey.includes("assetmanag") ||
      topTabKey.includes("transfer") ||
      topTabKey.includes("move") ||
      topTabKey.includes("writeoff");

    if (isAssetManagementNav || isAssetManagementTab) {
      return (
        <div className="grid grid-cols-1">
          <AssetTransferWriteoffManager
            assets={assets}
            restaurants={firebaseRestaurants}
            user={user}
            updateAsset={updateAssetInFirebase}
            addAsset={addAssetToFirebase}
            deleteAsset={deleteAssetFromFirebase}
            onAuditEvent={writeAuditLog}
          />
        </div>
      );
    }

    const teamNavIds = new Set(["stafing", "workhoursemployee", "employeekeeper"]);
    const teamTabIds = new Set(["mystafing", "myrequest", "jobtitlesettings", "recrutment", "workhoursemployee", "employeekeeper"]);
    const isTeamHiringNav = teamNavIds.has(activeNavKey);
    const isTeamHiringTab = teamTabIds.has(topTabKey);

    if (isTeamHiringNav || isTeamHiringTab) {
      return (
        <div className="grid grid-cols-1">
          <TeamHiringModule topTab={topTab} activeNav={activeNav} restaurants={restaurants} user={user} />
        </div>
      );
    }

    if (
      activeNavKey === "security-audit" ||
      topTabKey === "sitelogtab" ||
      topTabKey.includes("sitelog") ||
      topTabKey.includes("audit")
    ) {
      return (
        <div className="grid grid-cols-1">
          <SecurityAuditModule user={user} />
        </div>
      );
    }

    if (activeNav === "menu-admin" && user?.role === 'admin') {
      return (
        <div className="grid grid-cols-1">
          <MenuStructureEditor menuStructure={menuStructure} saveMenuStructure={save} loading={menuLoading} error={menuError} />
        </div>
      );
    }

    // Підтримка нової структури меню для основних засобів (capexreport)
    if (
      activeNav === "inventory-assets" ||
      activeNav.startsWith("reports-assets") ||
      activeNav === "capexreport"
    ) {
      // Основний звіт по основних засобах (нова структура)
      if (
        (activeNav.startsWith("reports-assets") && topTab === "main") ||
        (activeNav === "capexreport" && topTab === "maincapexreport")
      ) {
        return (
          <div className="grid grid-cols-1">
            <FinancialAssetsReport assets={assetsForReports} restaurants={restaurants} responsibilityCenters={businessUnits} />
          </div>
        );
      }
      // Детальний звіт — розділ у розробці
      if (activeNav === "capexreport" && topTab === "detailcapexreport") {
        return (
          <div className="grid grid-cols-1">
            <AssetDetailedReport assets={assetsForReports} />
          </div>
        );
      }
      if (topTab === "search") {
        return (
          <div className="grid grid-cols-1">
            <AssetSearch assets={assets} user={user} restaurants={restaurants} onEdit={(asset) => {
              if (!canEditAssetRow(asset)) {
                alert(getAssetEditDisabledReason(asset));
                return;
              }
              setSelected(asset);
              handleTopTabChange('test2');
            }} />
          </div>
        );
      }

      if (topTab === "test1") {
        // Якщо це розділ звітів - показуємо фінансовий звіт
        if (activeNav.startsWith("reports-assets")) {
          return (
            <div className="grid grid-cols-1">
              <FinancialAssetsReport assets={assetsForReports} restaurants={restaurants} responsibilityCenters={businessUnits} />
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
          if (!canEditAssetRow(selected)) {
            return (
              <div className="card p-6 text-sm text-slate-700">
                <p className="text-base font-semibold text-slate-900">Редагування тимчасово заблоковано</p>
                <p className="mt-1 text-slate-600">Перегляд активів доступний завжди, але для редагування потрібна активна сесія інвентаризації саме для закладу цього активу.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700">
                    {getAssetEditDisabledReason(selected)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Повернутись до списку
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div className="grid grid-cols-1">
              <AssetForm
                selectedAsset={selected}
                onSubmit={handleSubmit}
                onCancel={() => setSelected(null)}
                currentUser={user}
                restaurants={restaurants}
                assets={assets}
              />
            </div>
          );
        }
        
        // Інакше показуємо таблицю активів з кнопками редагування
        return (
          <div className="grid grid-cols-1">
            {(() => {
              const assetsToShow = visibleAssetsForCurrentUser;
              
              return (
                <AssetTable
                  data={assetsToShow}
                  onEdit={setSelected}
                  mobileCardMode={true}
                  canEdit={isAssetEditAllowedForCurrentUser}
                  canEditAsset={canEditAssetRow}
                  editDisabledReason="Запустіть сесію інвентаризації, щоб редагувати активи"
                  getEditDisabledReason={getAssetEditDisabledReason}
                  isAssetInventorizedInSession={isAssetInventorizedInSession}
                  showInventoryStateFilter={shouldShowInventoryStateFilter}
                  inventoryStateFilterValue={assetTableInventoryStateFilter}
                  onInventoryStateFilterChange={setAssetTableInventoryStateFilter}
                  searchQueryValue={assetTableSearchQuery}
                  onSearchQueryChange={setAssetTableSearchQuery}
                  getRowClassName={getInventoryRowClassName}
                  onDelete={user?.role === 'admin' ? handleDeleteAsset : null}
                  onUnmarkInventorized={user?.role === 'admin' ? handleUnmarkInventorized : null}
                  filters={filters}
                  setFilters={setFilters}
                  onExport={handleExport}
                  onImport={user?.role === 'admin' ? handleImportAssets : null}
                  onDownloadTemplate={user?.role === 'admin' ? handleDownloadAssetTemplate : null}
                  headerTitle="Редагування активів"
                  headerSubtitle={
                    isAnyAccessibleAssetInventorySessionActive
                      ? "Вибери актив для редагування"
                      : "Перегляд доступний. Для редагування запустіть сесію інвентаризації для потрібного закладу"
                  }
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

      if (topTab.includes("capexinventory") || topTab.includes("journal") || topTab.includes("jornial")) {
        return (
          <div className="card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-lg font-semibold">Журнал інвентаризацій ОЗ</h2>
                <p className="text-sm text-slate-600">Історія запуску та завершення сесій інвентаризації ({assetInventoryHistoryScopeLabel})</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-slate-100 border border-slate-200 px-2 py-1 text-xs text-slate-700">
                  Записів: {assetInventorySessionsForCurrentUser.length}
                </span>
                <button
                  type="button"
                  onClick={printAssetInventoryJournal}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Друк журналу
                </button>
              </div>
            </div>

            {user?.role === "admin" && (
              <div className="mb-4 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left">Заклад</th>
                      <th className="px-3 py-2 text-left">Активна сесія</th>
                      <th className="px-3 py-2 text-left">Початок</th>
                      <th className="px-3 py-2 text-left">Хто почав</th>
                      <th className="px-3 py-2 text-left">Дія</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(restaurants || []).map((restaurant) => {
                      const restaurantId = String(restaurant?.id || "").trim();
                      const scopeId = `restaurant:${restaurantId}`;
                      const activeSession = activeAssetInventorySessionsByScope.get(scopeId) || null;

                      return (
                        <tr key={scopeId} className="border-t border-slate-200">
                          <td className="px-3 py-2 font-medium text-slate-900">{restaurant?.name || restaurantId}</td>
                          <td className="px-3 py-2">
                            {activeSession ? (
                              <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">Активна</span>
                            ) : (
                              <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">Не активна</span>
                            )}
                          </td>
                          <td className="px-3 py-2">{activeSession?.startedAt ? new Date(activeSession.startedAt).toLocaleString("uk-UA") : "-"}</td>
                          <td className="px-3 py-2">{activeSession?.startedByName || "-"}</td>
                          <td className="px-3 py-2">
                            {!activeSession ? (
                              <button
                                type="button"
                                onClick={() => startAssetInventorySession({
                                  scopeId,
                                  restaurantId,
                                  restaurantName: String(restaurant?.name || ""),
                                })}
                                disabled={assetInventorySessionLoading}
                                className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                              >
                                Почати інвентаризацію
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => endAssetInventorySession(activeSession)}
                                disabled={assetInventorySessionLoading}
                                className="rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
                              >
                                Завершити інвентаризацію
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {(!restaurants || restaurants.length === 0) && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-slate-500">Немає закладів для керування інвентаризацією.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left">Початок</th>
                    <th className="px-3 py-2 text-left">Завершення</th>
                    <th className="px-3 py-2 text-left">Ресторан</th>
                    <th className="px-3 py-2 text-left">Статус</th>
                    <th className="px-3 py-2 text-left">Хто почав</th>
                    <th className="px-3 py-2 text-left">Хто завершив</th>
                    <th className="px-3 py-2 text-left">ID сесії</th>
                    <th className="px-3 py-2 text-left">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {assetInventorySessionsForCurrentUser.map((session) => (
                    <tr key={session.id} className="border-t border-slate-200">
                      <td className="px-3 py-2">{session?.startedAt ? new Date(session.startedAt).toLocaleString("uk-UA") : "-"}</td>
                      <td className="px-3 py-2">{session?.endedAt ? new Date(session.endedAt).toLocaleString("uk-UA") : "-"}</td>
                      <td className="px-3 py-2">{getSessionRestaurantLabel(session)}</td>
                      <td className="px-3 py-2">
                        <span className={clsx(
                          "inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold",
                          session?.isActive ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-slate-100 text-slate-700 border border-slate-300"
                        )}>
                          {session?.isActive ? "Активна" : "Завершена"}
                        </span>
                      </td>
                      <td className="px-3 py-2">{session?.startedByName || "-"}</td>
                      <td className="px-3 py-2">{session?.endedByName || "-"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">{session?.id || "-"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => printSingleAssetInventorySession(session)}
                            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Друк інвентаризації
                          </button>
                          {user?.role === "admin" && (
                            <button
                              type="button"
                              onClick={() => deleteAssetInventorySession(session)}
                              disabled={assetInventorySessionLoading || Boolean(session?.isActive)}
                              className="rounded border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Видалити
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {assetInventorySessionsForCurrentUser.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-slate-500">Сесій інвентаризації поки немає.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      return (
        <div className="grid grid-cols-1">
          {(() => {
            const assetsToShow = visibleAssetsForCurrentUser;
            
            return (
              <AssetTable
                data={assetsToShow}
                onEdit={setSelected}
                mobileCardMode={true}
                canEditAsset={canEditAssetRow}
                getEditDisabledReason={getAssetEditDisabledReason}
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

    // Бар та вино / Асортиментна матриця
    const activeNavLabel = String(
      navItems.flatMap((g) => g.children || []).find((c) => c.id === activeNav)?.label || ""
    ).toLowerCase();

    const isBarWineNav =
      activeNavKey.includes("barvino") ||
      activeNavKey.includes("asortment") ||
      activeNavKey.includes("assortment") ||
      activeNavLabel.includes("бар") ||
      activeNavLabel.includes("вин") ||
      activeNavLabel.includes("асортимент");
    const isBarWineTab =
      topTabKey.includes("asortment") ||
      topTabKey.includes("assortment") ||
      topTabKey.includes("barvino") ||
      topTabKey.includes("markup") ||
      topTabKey.includes("nadc") ||
      topTabKey.includes("цінк");

    const currentTopTabLabel = String(topTabs.find((tab) => tab.id === topTab)?.label || "");

    const normalizedBarWineTopTab = (() => {
      const value = String(topTab || "").toLowerCase().trim();
      const label = currentTopTabLabel.toLowerCase().trim();
      if (label.includes("надцін") || label.includes("націн") || label.includes("цінк")) return "markups";
      if (value === "assortmentmatrix" || value === "test1" || value.includes("assortmentmatrix")) return "matrix";
      if (
        value === "barvinositifications" ||
        value === "barvinospecifications" ||
        value === "barvinospecification" ||
        value === "test2" ||
        (value.includes("barvino") && (value.includes("spec") || value.includes("sitif") || value.includes("stif") || value.includes("notic")))
      ) {
        return "specifications";
      }
      if (
        value === "barvinotipicalform" ||
        value === "test3" ||
        (value.includes("barvino") && (value.includes("tipical") || value.includes("typical") || value.includes("field") || value.includes("form")))
      ) {
        return "typicalFields";
      }
      if (
        value.includes("markup") ||
        value.includes("markups") ||
        value.includes("nadc") ||
        value.includes("nacink") ||
        value.includes("nacinka") ||
        value.includes("цінк")
      ) {
        return "markups";
      }
      return topTab;
    })();

    if (isBarWineNav || isBarWineTab) {
      return (
        <div className="grid grid-cols-1">
          <AssortmentMatrixModule
            topTab={normalizedBarWineTopTab}
            topTabLabel={currentTopTabLabel}
            restaurants={restaurants}
            user={user}
          />
        </div>
      );
    }

    // Реєстр платежів
    const isPaymentNav =
      activeNavKey.includes("payment") ||
      activeNavKey.includes("platezh") ||
      activeNavKey.includes("platі") ||
      activeNavKey.includes("paymentreg");
    const isPaymentTab =
      topTabKey.includes("payment") ||
      topTabKey.includes("platezh") ||
      topTabKey.includes("platі") ||
      topTabKey.includes("mypayment") ||
      topTabKey.includes("paymenttypical") ||
      topTabKey.includes("typovi") ||
      topTabKey.includes("paymentfields") ||
      topTabKey.includes("paymentsbase") ||
      topTabKey.includes("baseofplatniki") ||
      topTabKey.includes("approvalpeople") ||
      topTabKey.includes("kaznachey") ||
      topTabKey.includes("treasury");

    if (isPaymentNav || isPaymentTab) {
      return (
        <div className="grid grid-cols-1">
          <PaymentRegistryModule
            topTab={topTab}
            restaurants={firebaseRestaurants}
            user={user}
            onAuditEvent={writeAuditLog}
          />
        </div>
      );
    }

    // Fallback для невідомих комбінацій nav/tab
    return (
      <div className="card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl">
        <h2 className="text-lg font-semibold">Розділ тимчасово недоступний</h2>
        <p className="mt-2 text-sm text-slate-600">Спробуйте обрати іншу вкладку в меню або перезавантажити сторінку.</p>
      </div>
    );
  };

  const mobileMenuButton = isMobile ? (
    <button type="button" onClick={() => setSidebarOpen(false)} className="absolute right-2 top-4 p-1 hover:bg-slate-700 rounded transition">
      <ChevronLeft size={18} className="text-slate-300" />
    </button>
  ) : null;

  const desktopCollapseButton = !isMobile ? (
    <button type="button" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="absolute right-2 top-4 p-1 hover:bg-slate-700 rounded transition">
      {sidebarCollapsed ? <ChevronRight size={18} className="text-slate-300" /> : <ChevronLeft size={18} className="text-slate-300" />}
    </button>
  ) : null;

  const sidebarHeader = !sidebarCollapsed ? (
    <div className="mb-6 mt-2">
      <p className="text-3xl font-bold text-indigo-400">LUCI</p>
      <p style={{fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#cbd5e1"}}>La Famiglia Unified Control &amp; Intelligence</p>
    </div>
  ) : null;

  const SidebarNav = () => (
    <nav style={{display: "flex", flexDirection: "column", gap: "0.5rem"}}>
      {navItems.map(group => (
        <div key={group.id} style={{borderRadius: "0.75rem", backgroundColor: "rgba(71, 85, 105, 0.3)", border: "1px solid #475569", overflow: "hidden"}}>
          <button type="button" onClick={() => toggleGroup(group.id)} style={{width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", padding: "0.5rem 0.75rem", fontSize: "0.75rem", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", color: "#cbd5e1", backgroundColor: "transparent", border: "none", cursor: "pointer"}}>
            <div style={{display: "flex", alignItems: "center", gap: "0.5rem"}}>
              <group.icon size={16} /> {group.label}
            </div>
            <ChevronDown size={14} style={{transition: "transform 150ms", transform: expandedGroups[group.id] ? "rotate(0deg)" : "rotate(-90deg)"}} />
          </button>
          {expandedGroups[group.id] && (
            <div style={{display: "flex", flexDirection: "column", gap: "0.25rem", paddingBottom: "0.5rem"}}>
              {group.children.map(item => (
                <button key={item.id} type="button" onClick={() => handleActiveNavChange(item.id)} style={{margin: "0 0.5rem", display: "flex", alignItems: "flex-start", gap: "0.5rem", borderRadius: "0.5rem", padding: "0.5rem 0.75rem", fontSize: "0.875rem", fontWeight: "500", transition: "all 150ms", whiteSpace: "nowrap", backgroundColor: activeNav === item.id ? "#4f46e5" : "transparent", color: activeNav === item.id ? "white" : "#e2e8f0", border: "none", cursor: "pointer"}}>
                  <span style={{display: "inline-block", height: "0.5rem", width: "0.5rem", borderRadius: "9999px", backgroundColor: "#818cf8", marginTop: "0.25rem", flexShrink: 0}} />
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );

  const sidebarElement = (
    <>
      {/* Backdrop для мобільного меню */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(30,41,59,0.5)",
            zIndex: 49,
            transition: "background 300ms"
          }}
        />
      )}
      <aside style={{position: "fixed", left: 0, top: 0, height: "100vh", overflowY: "auto", borderRight: "1px solid #334155", backgroundColor: "rgba(15, 23, 42, 0.95)", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)", transition: "all 300ms", zIndex: isMobile ? 50 : 40, width: "288px", transform: isMobile && !sidebarOpen ? "translateX(-100%)" : "translateX(0)", display: "flex", flexDirection: "column", justifyContent: "space-between", ...(sidebarCollapsed && !isMobile && {width: "80px"})}}>
        <div style={{padding: "1rem", position: "relative", flex: 1, minHeight: 0}}>
          {mobileMenuButton}
          {desktopCollapseButton}
          {sidebarHeader}
          {(isMobile || !sidebarCollapsed) && SidebarNav()}
        </div>
        {!sidebarCollapsed && (
          <div style={{padding: "0 1rem 0.5rem 1rem", fontSize: "0.75rem", color: "#94a3b8"}}>
            Версія {APP_VERSION}
          </div>
        )}
        <DeployInfo />
      </aside>
    </>
  );

  const topTabsElement = topTabs.length > 0 ? (
    <div className={clsx("sticky top-0 z-30 bg-slate-900/95 border-b border-slate-800 shadow-lg", notificationPanelOpen && "pointer-events-none")} style={{boxShadow: "0 4px 6px -1px rgba(15, 23, 42, 0.4)"}}>
      <div className={clsx("w-full px-0 lg:px-0 min-h-10", isMobile ? "flex flex-col" : "flex items-stretch justify-between") }>
        <div className="flex gap-0 items-stretch overflow-x-auto">
        {topTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              handleTopTabChange(tab.id);
            }}
            style={{
              padding: "0.5rem 0.75rem",
              fontSize: "0.875rem",
              fontWeight: "600",
              border: "1px solid #475569",
              transition: "all 150ms",
              textAlign: "center",
              whiteSpace: "nowrap",
              borderRadius: "0",
              flexShrink: 0,
              backgroundColor: topTab === tab.id ? "#4f46e5" : "#1e293b",
              color: topTab === tab.id ? "white" : "#e2e8f0",
              borderColor: topTab === tab.id ? "#818cf8" : "#475569",
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
        </div>
        {activeNav === "inventory-assets" && (
          <div className={clsx(
            "flex items-center gap-2 py-1",
            isMobile ? "px-2 pb-2 flex-wrap border-t border-slate-800" : "pr-3"
          )}>
            <span className={clsx(
              "rounded px-2 py-0.5 text-[11px] font-medium border whitespace-nowrap",
              isMobile && "max-w-[150px] truncate",
              assetInventorySessionLoading
                ? "bg-slate-800 text-slate-300 border-slate-600"
                :
              isAnyAccessibleAssetInventorySessionActive
                ? "bg-emerald-900/15 text-emerald-200 border-emerald-700/30"
                : "bg-slate-800 text-slate-300 border-slate-600"
            )}>
              {assetInventorySessionLoading
                ? "Завантаження статусу сесії..."
                : isAnyAccessibleAssetInventorySessionActive
                ? (isMobile
                  ? "Сесія активна"
                  : `Сесія активна з ${new Date(currentAccessibleAssetInventorySession?.startedAt || Date.now()).toLocaleString("uk-UA")}`)
                : (isMobile ? "Сесія не активна" : "Сесія інвентаризації не активна")}
            </span>
            {user?.role === "admin" ? (
              <span className={clsx("text-[11px] text-slate-300", isMobile && "ml-auto")}>Керування запуском: вкладка "Журнал інвентаризацій"</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  ) : null;

  const handleLoginSuccess = () => {
    // на момент закриття модалки user ще не встановлений, тому переходимо у useEffect нижче
  };

  const loginModalElement = showLoginModal ? (
    <LoginModal onClose={() => setShowLoginModal(false)} onLoginSuccess={handleLoginSuccess} />
  ) : null;

  // -- side effects for layout / navigation helpers --
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // якщо активна вкладка недоступна, переключаємо на першу дозволену
  useEffect(() => {
    if (!user) return;
    const allowedIds = navItems.flatMap((group) => group.children.map((child) => normalizeNavigationId(child.id)));
    if (allowedIds.length === 0) return;
    const normalizedActiveNav = normalizeNavigationId(activeNav);
    if (!allowedIds.includes(normalizedActiveNav)) {
      const defaultNav = allowedIds[0];
      setActiveNav(defaultNav);
      localStorage.setItem('lucia_activeNav', defaultNav);
    }
  }, [user, navItems, activeNav]);

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
        <div className="fixed inset-0 bg-slate-900 flex items-center justify-center z-40 p-4">
          <div className="max-w-md w-full">
            <div className="bg-slate-800 rounded-lg p-6 sm:p-8 shadow-2xl border border-slate-700">
              <div className="text-center mb-6">
                <p className="text-3xl sm:text-4xl font-bold text-indigo-400 mb-2">LUCI</p>
                <p className="text-xs uppercase tracking-wider text-slate-400">
                  La Famiglia Unified Control & Intelligence
                </p>
              </div>
              <div className="space-y-4">
                <p className="text-slate-300 text-center text-sm sm:text-base">
                  Для доступу до системи необхідно авторизуватися
                </p>
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="w-full px-6 py-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition text-base sm:text-lg font-semibold"
                >
                  Увійти
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-screen gap-0">
        {/* Top Header Bar */}
        <div className={clsx(
          "fixed top-0 right-0 h-14 bg-slate-900/95 border-b border-slate-700 z-30 flex items-center justify-between px-4 sm:px-6",
          isMobile ? "left-0" : "left-72"
        )}>
          {isAuthenticated ? (
            <>
              {/* Гамбургер-меню на мобільному */}
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="p-1 hover:bg-slate-700 rounded transition"
                  title="Відкрити меню"
                >
                  <Menu size={22} className="text-slate-300" />
                </button>
              )}
              {/* Плашки ліворуч */}
              <div className={clsx("flex items-center gap-3", isMobile ? "flex-1 justify-center md:justify-start ml-2" : "")}>
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
              
              {/* Користувач, сповіщення та вихід - праворуч */}
              <div className="flex items-center gap-2 sm:gap-4">
                <div className={clsx(
                  "hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-100",
                  isOnline ? "bg-emerald-800/70" : "bg-rose-800/70"
                )}>
                  {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    {isOnline ? "Онлайн" : "Офлайн"}
                  </span>
                </div>
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300">
                  <Clock3 size={16} />
                  <ClockBadgeTime className="text-sm font-medium tabular-nums" />
                </div>
                {/* Дзвоник сповіщень */}
                <button
                  type="button"
                  className="relative p-2 rounded-full hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  title="Сповіщення"
                  onClick={() => setNotificationPanelOpen((v) => !v)}
                >
                  <Bell size={20} className="text-slate-300" />
                  {/* Badge для непрочитаних */}
                  {notificationUnreadCount > 0 && (
                    <span className="absolute top-1 right-1 block h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white animate-pulse"></span>
                  )}
                </button>
                {/* NotificationPanel - now rendered at top level */}
                <button
                  type="button"
                  onClick={() => setShowProfileModal(true)}
                  className="flex items-center gap-2 text-sm text-slate-300 rounded-lg px-2 py-1.5 hover:bg-slate-800"
                  title="Налаштування профілю"
                >
                  <UserIcon size={16} />
                  <span className="max-w-xs truncate hidden sm:inline">{user?.displayName || user?.email}</span>
                  {user?.role === "admin" && (
                    <span className="px-2 py-1 rounded bg-indigo-600 text-white text-xs font-semibold hidden sm:inline">
                      Admin
                    </span>
                  )}
                </button>
                <button
                  onClick={async () => {
                    try {
                      if (typeof window !== "undefined" && typeof sessionStorage !== "undefined") {
                        sessionStorage.removeItem(LOGIN_AUDIT_MARKER_KEY);
                      }
                      await logAuditEvent({
                        actorId: user?.uid || "",
                        actorName: user?.displayName || user?.fullName || user?.name || "",
                        actorEmail: user?.email || "",
                        actorRole: user?.role || "",
                        actorWorkRole: user?.workRole || "",
                        action: "logout",
                        entityType: "auth",
                        entityId: user?.uid || "",
                        activeNav,
                        topTab,
                        description: "Користувач вийшов з платформи",
                      });
                      await logoutUser();
                    } catch (error) {
                      console.error("Помилка виходу:", error);
                    }
                  }}
                  className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition text-xs sm:text-sm font-medium"
                >
                  <LogOut size={16} />
                  <span className="hidden sm:inline">Вийти</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => {
                  setShowLoginModal(true);
                }}
                className="px-2 sm:px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition text-xs sm:text-sm font-medium"
              >
                Увійти
              </button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        {sidebarElement}

        {/* Main Content */}
        <main className={clsx("flex-1 mt-14 overflow-auto transition-all duration-300", isMobile ? "ml-0" : sidebarCollapsed ? "ml-20" : "ml-72")}>
          {topTabsElement}
          {/* show loader while menu/permissions are loading */}
          {menuLoading && (
            <div className="p-6 text-center text-slate-300">Завантаження меню...</div>
          )}
          {!menuLoading && user && navItems.length === 0 && (
            <div className="p-6 text-center text-slate-300">
              Немає доступних розділів для вашої ролі.
            </div>
          )}

          <div
            className={clsx(
              (
                String(activeNav || "").toLowerCase().includes("catering") ||
                String(activeNav || "").toLowerCase().includes("cattering") ||
                String(activeNav || "").toLowerCase().includes("crmcatering") ||
                String(activeNav || "").toLowerCase().includes("kitchencatering") ||
                String(activeNav || "").toLowerCase().includes("reportcatering") ||
                String(activeNav || "").toLowerCase().includes("asortiment") ||
                String(activeNav || "").toLowerCase().includes("assortment") ||
                String(activeNav || "").toLowerCase().includes("кейтеринг") ||
                String(topTab || "").toLowerCase().includes("catering") ||
                String(topTab || "").toLowerCase().includes("cattering") ||
                String(topTab || "").toLowerCase().includes("chefmonitor") ||
                String(topTab || "").toLowerCase().includes("salescateringreport") ||
                String(topTab || "").toLowerCase().includes("managmentpnl") ||
                String(topTab || "").toLowerCase().includes("managementpnl") ||
                String(topTab || "").toLowerCase().includes("ordercrm") ||
                String(topTab || "").toLowerCase().includes("contactcrm") ||
                String(topTab || "").toLowerCase().includes("typycalform") ||
                String(topTab || "").toLowerCase().includes("typicalform") ||
                String(topTab || "").toLowerCase().includes("rolesettings") ||
                String(topTab || "").toLowerCase().includes("cateringrolesettings") ||
                String(topTab || "").toLowerCase().includes("asortiment") ||
                String(topTab || "").toLowerCase().includes("assortment")
              )
                ? "w-full max-w-none px-0 sm:px-1 lg:px-2"
                : "mx-auto max-w-screen-2xl px-3 sm:px-6 lg:px-8",
              (activeNav.includes("productbooking") || activeNav.includes("inventory-products"))
                ? "pt-1 pb-4 sm:pt-2 sm:pb-6"
                : "py-4 sm:py-8"
            )}
          >
            <div className={clsx((activeNav.includes("productbooking") || activeNav.includes("inventory-products")) ? "mt-0" : "mt-4")}>
              <Suspense fallback={<div className="p-4 text-sm text-slate-500">Завантаження модуля...</div>}>
                {renderContent()}
              </Suspense>
            </div>
          </div>
        </main>
      </div>
      )}

      {/* Auth Modals */}
      {loginModalElement}
      <Suspense fallback={null}>
        <ProfileSettingsModal
          open={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          user={user}
        />
      </Suspense>

      {/* Notification Center - Top Level */}
      <NotificationPanel
        open={notificationPanelOpen}
        onClose={() => setNotificationPanelOpen(false)}
        notifications={notifications}
        onNotificationAction={(notification) => {
          // Обробка дій сповіщень
          if (notification.actionUrl) {
            handleActiveNavChange(notification.actionUrl);
            if (notification.actionTab) {
              handleTopTabChange(notification.actionTab);
            }
          }
          // Сервісна заявка — відкрити деталі заявки діалоговим вікном
          if (notification.targetRequestId) {
            const requestId = String(notification.targetRequestId);
            setTimeout(() => {
              window.dispatchEvent(
                new CustomEvent("lucia:open-service-request", { detail: { requestId } })
              );
            }, 300);
          }
          // Закрити панель при кліцінні
          setNotificationPanelOpen(false);
        }}
      />
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
