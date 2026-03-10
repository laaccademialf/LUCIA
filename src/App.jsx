import { useEffect, useMemo, useState, useRef } from "react";
import * as LucideIcons from "lucide-react";
import clsx from "clsx";
import { AssetTable } from "./components/AssetTable";
import AssetSearch from "./components/AssetSearch";
import { AssetForm } from "./components/AssetForm";
import { AddUserForm } from "./components/AddUserForm";
import { LoginModal } from "./components/LoginModal";
import { RegisterModal } from "./components/RegisterModal";
import { UsersTable } from "./components/UsersTable";
import { RolesPositionsManager } from "./components/RolesPositionsManager";
import { RolePermissionsManager } from "./components/RolePermissionsManager";
import { FieldPermissionsManager } from "./components/FieldPermissionsManager";
import UtilityMetersManager from "./components/UtilityMetersManager";
import ElectricityTab from "./components/ElectricityTab";
import { MaterialResponsibilityManager } from "./components/MaterialResponsibilityManager";
import AssetTransferWriteoffManager from "./components/AssetTransferWriteoffManager";
import { AssetFieldsManager } from "./components/AssetFieldsManager";
import FinancialAssetsReport from "./components/FinancialAssetsReport";
import AssetDetailedReport from "./components/AssetDetailedReport";
import { useAuth } from "./hooks/useAuth";
import NotificationPanel from "./components/NotificationPanel";
import { logoutUser } from "./firebase/auth";
import { useMenuStructure } from "./hooks/useMenuStructure";
import { getRolePermissions } from "./firebase/permissions";
import {
  startAssetInventorySession as startAssetInventorySessionInFirestore,
  endAssetInventorySession as endAssetInventorySessionInFirestore,
  subscribeToActiveAssetInventorySession,
  subscribeToAssetInventorySessions,
} from "./firebase/firestore";
import { activeFirebaseConfig, isRuntimeFirebaseConfig } from "./firebase/config";
import { useRestaurants } from "./hooks/useRestaurants";
import { useAssets } from "./hooks/useAssets";
import { useAssetFields } from "./hooks/useAssetFields";
import {
  getUtilityMeters,
  addUtilityMeter,
  updateUtilityMeterPrice,
  deleteUtilityMeter,
} from "./firebase/utilityMeters";
import MenuStructureEditor from "./components/MenuStructureEditor";
import ProductBookingModule from "./components/ProductBookingModule";
import ServiceRequestsModule from "./components/ServiceRequestsModule";
import ChecklistModule from "./components/ChecklistModule";
import TeamHiringModule from "./components/TeamHiringModule";
import SecurityAuditModule from "./components/SecurityAuditModule";
import DatabaseConnectionsManager from "./components/DatabaseConnectionsManager";
import { useChecklists } from "./hooks/useChecklists";
import { useServiceRequests } from "./hooks/useServiceRequests";
import { logAuditEvent } from "./firebase/audit";
import { getCurrentRuntimeCustomConfig, getPrimaryConnection } from "./data/firebaseConnections";
import {
  downloadAssetTemplate,
  downloadRestaurantTemplate,
  exportAssetsToExcel,
  exportRestaurantsToExcel,
  importAssetsFromExcel,
  importRestaurantsFromExcel,
} from "./utils/excelHelpers";

const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const ADMIN_ONLY_NAV_IDS = new Set(["settings-permissions", "menu-admin", "security-audit"]);
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

function App() {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const runtimeCustomConfig = useMemo(() => getCurrentRuntimeCustomConfig(), []);
  const primaryConnection = useMemo(() => getPrimaryConnection(), []);

  const activeDbBadge = useMemo(() => {
    if (runtimeCustomConfig) {
      return {
        label: primaryConnection?.name || runtimeCustomConfig.apiBaseUrl || "custom-api",
        tag: "custom",
      };
    }

    return {
      label: activeFirebaseConfig?.projectId || "default",
      tag: isRuntimeFirebaseConfig ? "runtime" : "firebase",
    };
  }, [runtimeCustomConfig, primaryConnection]);

  useEffect(() => {
    const timerId = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timerId);
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
                              // Модальне вікно реєстрації
                              const [showRegisterModal, setShowRegisterModal] = useState(false);
                            // Модальне вікно логіну
                            const [showLoginModal, setShowLoginModal] = useState(false);
                          // Стан бокового меню
                          const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
                          const [sidebarOpen, setSidebarOpen] = useState(false);
                        // Мобільний режим
                        const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
                      // Активи
                      const [assets, setAssets] = useState([]);
                      // Стан для вибраного активу (редагування)
                      const [selected, setSelected] = useState(null);
                      // Стан для фільтрів таблиці активів
                      const [filters, setFilters] = useState({});
                      // Стан для центрів відповідальності (business units)
                      const [businessUnits, setBusinessUnits] = useState([]);
                      // Стан для фільтрації ресторану у графіку
                      const [restaurantFilter, setRestaurantFilter] = useState("");
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
                  // Структура меню
                  const { menuStructure, save, loading: menuLoading, error: menuError } = useMenuStructure();
                // Firebase активи
                const {
                  assets: firebaseAssets,
                  loading: assetsLoading,
                  addAsset: addAssetToFirebase,
                  updateAsset: updateAssetInFirebase,
                  deleteAsset: deleteAssetFromFirebase,
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
      // Головна вкладка
      const [topTab, setTopTab] = useState(() => {
        // Відновлення збереженої вкладки з localStorage
        return localStorage.getItem('lucia_topTab') || "test1";
      });

      const [assetInventorySession, setAssetInventorySession] = useState(null);
      const [assetInventorySessionLoading, setAssetInventorySessionLoading] = useState(true);
      const [assetInventorySessionsHistory, setAssetInventorySessionsHistory] = useState([]);
    // Головна навігація
    const [activeNav, setActiveNav] = useState(() => {
      // Відновлення збереженої сторінки з localStorage
      return localStorage.getItem('lucia_activeNav') || "reports-assets";
    });
  // --- Notification Center state ---
  const [notifications, setNotifications] = useState([]);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [checklistReminderTick, setChecklistReminderTick] = useState(0);
  const seenMissedChecklistKeysRef = useRef(new Set());
  const userInteractedRef = useRef(false);

  const writeAuditLog = (payload) => {
    if (!user) return;

    const actorName = user?.displayName || user?.fullName || user?.name || "";
    const actorEmail = user?.email || "";

    void logAuditEvent({
      actorId: user?.uid || "",
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
    const id = setInterval(() => {
      setChecklistReminderTick((v) => v + 1);
    }, 30000);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user || !Array.isArray(restaurants) || restaurants.length === 0) {
      setNotifications([]);
      seenMissedChecklistKeysRef.current = new Set();
      return;
    }

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const dayKey = dayKeys[new Date(`${today}T00:00:00`).getDay()];
    const missedItems = [];

    for (const restaurant of restaurants) {
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

    missedItems.sort((a, b) => a.time.localeCompare(b.time));
    const nextNotifications = missedItems.slice(0, 50);
    setNotifications(nextNotifications);

    const seen = seenMissedChecklistKeysRef.current;
    const currentKeys = new Set(nextNotifications.map((item) => item.key));
    const newKeys = nextNotifications.filter((item) => !seen.has(item.key));

    if (newKeys.length > 0 && userInteractedRef.current) {
      playChecklistAlertTone();
    }

    seenMissedChecklistKeysRef.current = currentKeys;
  }, [
    user,
    restaurants,
    checklistTemplates,
    checklistExecutions,
    checklistReminderTick,
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
      console.log("DEBUG FirebaseRestaurants:", firebaseRestaurants);
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
      if (!user) {
        setUserPermissions({});
        return;
      }

      // адміністратор не потребує фільтрації, зберігаємо порожній об'єкт
      if (user.role === 'admin') {
        setUserPermissions({});
        return;
      }

      // беремо з workRole або role як універсальний ідентифікатор
      const roleIdOrName = user.workRole || user.role;
      if (!roleIdOrName) {
        setUserPermissions({});
        return;
      }

      try {
        const rolePerms = await getRolePermissions(roleIdOrName);
        console.log("DEBUG завантажено дозволи для ролі/робочої ролі:", roleIdOrName, rolePerms);
        setUserPermissions(rolePerms.permissions || {});
      } catch (err) {
        console.error("Помилка отримання прав доступу для користувача:", err);
        setUserPermissions({});
      }
    };
    loadPermissions();
  }, [user]);

  // DEBUG: завантаження лічильників
  useEffect(() => {
    if (activeNav === "inventory-utilities" && topTab === "utilityservice") {
      console.log("DEBUG utilityMeters state:", utilityMeters);
    }
  }, [activeNav, topTab, utilityMeters]);

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

  // Допоміжна функція для отримання вкладок для конкретного підрозділу з menuStructure
  const getTabsForSection = (navId) => {
    if (!navId || !Array.isArray(menuStructure)) return [];
    for (const section of menuStructure) {
      if (!Array.isArray(section.children)) continue;
      for (const child of section.children) {
        if (child.id === navId) {
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
    const allTabs = getTabsForSection(activeNav).map((tab) => {
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
    // Fallback: для ролі керуючого не блокуємо вкладки повністю, якщо права не знайшлись/застаріли.
    if (isManagerLikeUser(user) && !ADMIN_ONLY_NAV_IDS.has(activeNav)) {
      return allTabs;
    }
    // Якщо доступу немає — не показувати вкладки
    return [];
  }, [activeNav, menuStructure, user, userPermissions]);

  const dashboardData = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const totalRestaurants = restaurants.length;
    const totalAssets = assets.length;
    const activeAssets = assets.filter((item) =>
      String(item?.status || "").toLowerCase().includes("експлуата")
    ).length;

    const totalChecklistTemplates = checklistTemplates.length;
    const todayExecutions = checklistExecutions.filter((item) => String(item?.date || "") === today);
    const overdueChecklistCount = notifications.length;

    const totalServiceRequests = serviceRequests.length;
    const openServiceRequests = serviceRequests.filter((item) => {
      const status = String(item?.status || "").toLowerCase();
      return status !== "resolved" && status !== "closed";
    }).length;

    const getMinutes = (timeValue) => {
      if (!timeValue || !String(timeValue).includes(":")) return null;
      const [hours, minutes] = String(timeValue).split(":").map(Number);
      if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
      return hours * 60 + minutes;
    };

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const dayKey = dayMap[now.getDay()];

    const currentlyOpenRestaurants = restaurants.filter((restaurant) => {
      const daySchedule = restaurant?.schedule?.[dayKey];
      const from = getMinutes(daySchedule?.from);
      const to = getMinutes(daySchedule?.to);
      if (from === null || to === null) return false;
      return nowMinutes >= from && nowMinutes <= to;
    }).length;

    return {
      totalRestaurants,
      totalAssets,
      activeAssets,
      totalChecklistTemplates,
      todayExecutions: todayExecutions.length,
      overdueChecklistCount,
      totalServiceRequests,
      openServiceRequests,
      currentlyOpenRestaurants,
      totalBusinessUnits: businessUnits.length,
    };
  }, [
    restaurants,
    assets,
    checklistTemplates,
    checklistExecutions,
    notifications,
    serviceRequests,
    businessUnits,
  ]);

  const menuStructureForPermissions = useMemo(() => {

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

  const assetInventorySessionScopeId = useMemo(() => {
    if (user?.role === "admin") return "global";
    if (user?.restaurant) return `restaurant:${String(user.restaurant)}`;
    return "global";
  }, [user]);

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

    const unsubscribe = subscribeToAssetInventorySessions(assetInventorySessionScopeId, (sessions) => {
      setAssetInventorySessionsHistory(Array.isArray(sessions) ? sessions : []);
    });

    return () => {
      unsubscribe?.();
    };
  }, [user, assetInventorySessionScopeId]);

  const isAssetInventorySessionActive = Boolean(assetInventorySession?.isActive);

  const recentlyInventoriedAssetIds = useMemo(() => {
    const activeSessionId = String(assetInventorySession?.id || "");
    if (!activeSessionId || !isAssetInventorySessionActive) return new Set();
    const ids = new Set();
    assets.forEach((asset) => {
      const history = Array.isArray(asset?.inventoryChangeHistory) ? asset.inventoryChangeHistory : [];
      const hasChangeInLastSession = history.some(
        (entry) => String(entry?.inventorySessionId || "") === activeSessionId
      );
      if (hasChangeInLastSession && asset?.id) {
        ids.add(String(asset.id));
      }
    });
    return ids;
  }, [assets, assetInventorySession, isAssetInventorySessionActive]);

  const getSessionRestaurantLabel = (session) => {
    const sessionRestaurantId = String(session?.startedForRestaurantId || "");
    if (sessionRestaurantId) {
      return restaurants.find((item) => String(item.id) === sessionRestaurantId)?.name || sessionRestaurantId;
    }

    const scopeId = String(session?.scopeId || "");
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
      h1 { margin: 0 0 8px; font-size: 20px; }
      .meta { margin-bottom: 10px; font-size: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 18px; }
      table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
      th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; vertical-align: top; }
      th { background: #f8fafc; font-weight: 700; }
      .asset-block { margin-top: 10px; break-inside: avoid; }
      .asset-header {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 2px 14px;
        padding: 6px 8px;
        margin-bottom: 4px;
        border: 1px solid #cbd5e1;
        background: #f8fafc;
        font-size: 11px;
      }
      .hint { margin-top: 8px; font-size: 11px; color: #475569; }
      .signatures { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
      .line { margin-top: 28px; border-bottom: 1px solid #334155; }
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

    <div class="signatures">
      <div><div>Відповідальний за інвентаризацію:</div><div class="line"></div></div>
      <div><div>Підтвердження керівника:</div><div class="line"></div></div>
    </div>

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

    const rowsHtml = assetInventorySessionsHistory.map((session, index) => {
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
      h1 { margin: 0 0 8px; font-size: 20px; }
      .meta { margin-bottom: 10px; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; }
      th { background: #f8fafc; font-weight: 700; }
      .hint { margin-top: 8px; font-size: 11px; color: #475569; }
    </style>
  </head>
  <body>
    <h1>Журнал інвентаризацій основних засобів</h1>
    <div class="meta">
      Сформовано: ${new Date().toLocaleString("uk-UA")}<br/>
      Scope: ${assetInventorySessionScopeId}<br/>
      К-сть записів: ${assetInventorySessionsHistory.length}
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

  const startAssetInventorySession = async () => {
    if (isAssetInventorySessionActive || !user) return;
    const startedByName = user?.displayName || user?.fullName || user?.email || "Користувач";
    try {
      await startAssetInventorySessionInFirestore(assetInventorySessionScopeId, {
        startedById: user?.uid || "",
        startedByName,
        startedForRestaurantId: user?.restaurant || "",
      });
      writeAuditLog({
        action: "asset_inventory_session_start",
        entityType: "asset_inventory_session",
        entityId: assetInventorySessionScopeId,
        description: `Запущено сесію інвентаризації ОЗ (${assetInventorySessionScopeId})`,
      });
    } catch (error) {
      alert(`Не вдалося запустити сесію інвентаризації: ${error?.message || "невідома помилка"}`);
    }
  };

  const endAssetInventorySession = async () => {
    if (!isAssetInventorySessionActive || !assetInventorySession?.id || !user) return;
    const endedByName = user?.displayName || user?.fullName || user?.email || "Користувач";
    try {
      await endAssetInventorySessionInFirestore(assetInventorySession.id, {
        endedById: user?.uid || "",
        endedByName,
      });
      writeAuditLog({
        action: "asset_inventory_session_end",
        entityType: "asset_inventory_session",
        entityId: assetInventorySession?.id || assetInventorySessionScopeId,
        description: `Завершено сесію інвентаризації ОЗ (${assetInventorySession?.id || "-"})`,
      });
      setSelected(null);
    } catch (error) {
      alert(`Не вдалося завершити сесію інвентаризації: ${error?.message || "невідома помилка"}`);
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
          const historyEntry = {
            changedAt: new Date().toISOString(),
            changedById: user?.uid || "",
            changedByName: user?.displayName || user?.fullName || user?.email || "Користувач",
            source: "inventory_edit",
            inventorySessionId: assetInventorySession?.id || "",
            inventorySessionScopeId: assetInventorySessionScopeId,
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

        sanitizedAsset.inventoryChangeHistory = [
          {
            changedAt: new Date().toISOString(),
            changedById: user?.uid || "",
            changedByName: user?.displayName || user?.fullName || user?.email || "Користувач",
            source: "asset_created",
            inventorySessionId: assetInventorySession?.id || "",
            inventorySessionScopeId: assetInventorySessionScopeId,
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

  const handleExport = () => {
    exportAssetsToExcel(assets);
  };

  const handleImportAssets = async (file) => {
    try {
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

      for (const row of validRows) {
        const importedAsset = row.asset;
        const invNumber = row.invNumber;
        const name = row.name;
        const existing = existingByInvNumber.get(invNumber);

        try {
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

  const summary = useMemo(() => {
    const total = assets.length;
    const toWriteOff = assets.filter((a) => a.decision === "Списати").length;
    const toMove = assets.filter((a) => a.decision === "Перемістити").length;
    return { total, toWriteOff, toMove };
  }, [assets]);

  // Використовуємо menuStructure з Firestore для побудови меню
  const navItems = useMemo(() => {
      console.log('DEBUG navItems (перед фільтрацією):', menuStructure);
    console.log('DEBUG current user:', user, 'userPermissions:', userPermissions);
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
        const hasExplicitAccess = userPermissions[child.id] !== undefined && userPermissions[child.id] !== false;
        const hasManagerFallbackAccess = !isAdmin && isManagerLikeUser(user) && !ADMIN_ONLY_NAV_IDS.has(child.id);
        const hasAccess = isAdmin || hasExplicitAccess || hasManagerFallbackAccess;
        return hasAccess;
      });
      return { ...group, children: filteredChildren };
    }).filter(group => group.children.length > 0);

    // Додаємо іконки
    const result = filtered.map(group => ({
      ...group,
      icon: LucideIcons[group.icon || "Folder"] || LucideIcons.Folder
    }));
    console.log('DEBUG navItems (після фільтрації):', result);
    return result;
  }, [menuStructure, user?.role, user?.workRole, userPermissions]);

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
        const isGlobalAdmin = user?.role === 'admin' && !user?.restaurant;
        const userRestaurantName = user?.restaurant
          ? restaurants.find((r) => r.id === user.restaurant)?.name
          : "";
        const assetsForReports = !isGlobalAdmin && user?.restaurant
          ? assets.filter((asset) => String(asset?.locationName || "") === String(userRestaurantName || ""))
          : assets;

        // ...existing code...
        if (
          activeNav === "dashboard" ||
          activeNav === "dashboard-ops" ||
          topTab === "maindashboard" ||
          topTab === "dashboard-ops"
        ) {
          const statCards = [
            { label: "Ресторани", value: dashboardData.totalRestaurants, hint: `Відкрито зараз: ${dashboardData.currentlyOpenRestaurants}` },
            { label: "Активи", value: dashboardData.totalAssets, hint: `В експлуатації: ${dashboardData.activeAssets}` },
            { label: "Чеклисти", value: dashboardData.totalChecklistTemplates, hint: `Виконання сьогодні: ${dashboardData.todayExecutions}` },
            { label: "Сервісні заявки", value: dashboardData.totalServiceRequests, hint: `Відкритих: ${dashboardData.openServiceRequests}` },
            { label: "Прострочені задачі", value: dashboardData.overdueChecklistCount, hint: "На основі нагадувань" },
            { label: "Бізнес-напрями", value: dashboardData.totalBusinessUnits, hint: "З довідника активів" },
          ];

          return (
            <div className="space-y-5">
              <div className="rounded-2xl border border-indigo-300/40 bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-600 p-5 text-white shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold">Огляд системи</h2>
                    <p className="text-indigo-100 text-sm mt-1">Ключові показники по модулях у реальному часі</p>
                  </div>
                  <div className="rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold">
                    Оновлено: {currentTime.toLocaleString("uk-UA")}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {statCards.map((card) => (
                  <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
                    <p className="text-sm font-semibold text-slate-600">{card.label}</p>
                    <p className="text-3xl font-bold text-slate-900 mt-1">{card.value}</p>
                    <p className="text-xs text-slate-500 mt-2">{card.hint}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
                  <h3 className="text-base font-semibold text-slate-900 mb-3">Фокус на сьогодні</h3>
                  <ul className="space-y-2 text-sm text-slate-700">
                    <li className="flex items-center justify-between"><span>Прострочені чеклисти</span><span className="font-bold text-rose-600">{dashboardData.overdueChecklistCount}</span></li>
                    <li className="flex items-center justify-between"><span>Активні сервісні заявки</span><span className="font-bold text-amber-600">{dashboardData.openServiceRequests}</span></li>
                    <li className="flex items-center justify-between"><span>Заклади, що працюють зараз</span><span className="font-bold text-emerald-600">{dashboardData.currentlyOpenRestaurants}</span></li>
                  </ul>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
                  <h3 className="text-base font-semibold text-slate-900 mb-3">Швидка аналітика</h3>
                  <div className="space-y-3 text-sm text-slate-700">
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">Система містить <span className="font-semibold">{dashboardData.totalAssets}</span> активів у <span className="font-semibold">{dashboardData.totalRestaurants}</span> закладах.</div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">Сформовано <span className="font-semibold">{dashboardData.totalChecklistTemplates}</span> шаблонів чеклистів.</div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">У сервісному модулі всього <span className="font-semibold">{dashboardData.totalServiceRequests}</span> заявок.</div>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        if (activeNav === "database") {
          return <DatabaseConnectionsManager />;
        }

        // Вкладка управління утилітами
        if (activeNav === "inventory-utilities" && topTab === "utilityservice") {
          console.log("DEBUG renderContent: activeNav:", activeNav, "topTab:", topTab);
          return (
            <div className="p-4">
              <div className="mb-4 p-3 bg-blue-100 border border-blue-300 text-blue-700 rounded-lg text-sm">
                <div>DEBUG renderContent:</div>
                <div>activeNav: {String(activeNav)}</div>
                <div>topTab: {String(topTab)}</div>
              </div>
              {/* Далі йде реальний інтерфейс */}
              {/* ...старий код повернення UtilityMetersManager... */}
            </div>
          );
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
            <div className="p-4">
              {/* DEBUG: вкладка утиліти */}
              <div className="mb-4 p-3 bg-yellow-100 border border-yellow-300 text-yellow-700 rounded-lg text-sm">
                <div>DEBUG UtilityMetersManager:</div>
                <div>restaurants: {JSON.stringify(restaurants)}</div>
                <div>meters: {JSON.stringify(utilityMeters)}</div>
              </div>
              <UtilityMetersManager
                restaurants={restaurants}
                meters={utilityMeters}
                onAddMeter={handleAddMeter}
                onUpdateMeter={handleUpdateMeter}
                onDeleteMeter={handleDeleteMeter}
              />
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
            console.log("Видалення ресторану з ID:", id);
            console.log("Поточний користувач:", user);
            console.log("Роль користувача:", user?.role);
            
            const result = await deleteRestaurantFromFirebase(id);
            if (!result?.success) {
              throw result?.error || new Error("Не вдалося видалити ресторан");
            }
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
                    className="flex items-center gap-1 px-2 sm:px-4 py-2 rounded-lg bg-slate-600 text-white font-semibold hover:bg-slate-500 shadow text-xs sm:text-sm"
                  >
                    <LucideIcons.FileDown size={16} />
                    <span className="hidden sm:inline">Шаблон</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.restaurantImportInput?.click()}
                    className="flex items-center gap-1 px-2 sm:px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-500 shadow text-xs sm:text-sm"
                  >
                    <LucideIcons.Upload size={16} />
                    <span className="hidden sm:inline">Імпорт</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportRestaurantsToExcel(restaurants)}
                    className="flex items-center gap-1 px-2 sm:px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500 shadow text-xs sm:text-sm"
                  >
                    <LucideIcons.Download size={16} />
                    <span className="hidden sm:inline">Експорт</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddRestaurant()}
                    className="flex items-center gap-1 px-2 sm:px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 shadow text-xs sm:text-sm"
                  >
                    <LucideIcons.Plus size={18} />
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
            <RolePermissionsManager menuStructure={menuStructure} />
          </div>
        );
      }
    }

    if (activeNav === "ops-maintenance" || activeNav.includes("ops-maintenance")) {
      return (
        <div className="grid grid-cols-1">
          <ServiceRequestsModule topTab={topTab} restaurants={restaurants} user={user} />
        </div>
      );
    }

    if (activeNav === "ops-checklists" || activeNav.includes("ops-checklists")) {
      return (
        <div className="grid grid-cols-1">
          <ChecklistModule topTab={topTab} restaurants={restaurants} user={user} />
        </div>
      );
    }

    if (
      activeNav === "inventory-products" ||
      activeNav.includes("inventory-products") ||
      activeNav === "productbooking" ||
      activeNav.includes("productbooking")
    ) {
      return (
        <div className="grid grid-cols-1">
          <ProductBookingModule topTab={topTab} restaurants={restaurants} user={user} />
        </div>
      );
    }

    const activeNavKey = String(activeNav || "").toLowerCase();
    const topTabKey = String(topTab || "").toLowerCase();

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
            <AssetSearch assets={assets} user={user} restaurants={restaurants} onEdit={(asset) => { setSelected(asset); setTopTab('test2'); }} />
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
          if (!isAssetInventorySessionActive) {
            return (
              <div className="card p-6 text-sm text-slate-700">
                <p className="text-base font-semibold text-slate-900">Редагування тимчасово заблоковано</p>
                <p className="mt-1 text-slate-600">Перегляд активів доступний завжди, але для редагування потрібно активувати сесію інвентаризації.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={startAssetInventorySession}
                    className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                  >
                    Почати інвентаризацію
                  </button>
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
                  mobileCardMode={true}
                  canEdit={isAssetInventorySessionActive}
                  editDisabledReason="Запустіть сесію інвентаризації, щоб редагувати активи"
                  getRowClassName={(assetRow) =>
                    recentlyInventoriedAssetIds.has(String(assetRow?.id || ""))
                      ? "bg-emerald-100/60"
                      : ""
                  }
                  onDelete={user?.role === 'admin' ? handleDeleteAsset : null}
                  filters={filters}
                  setFilters={setFilters}
                  onExport={handleExport}
                  onImport={user?.role === 'admin' ? handleImportAssets : null}
                  onDownloadTemplate={user?.role === 'admin' ? downloadAssetTemplate : null}
                  headerTitle="Редагування активів"
                  headerSubtitle={
                    isAssetInventorySessionActive
                      ? "Вибери актив для редагування"
                      : "Перегляд доступний. Для редагування запустіть сесію інвентаризації"
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
                <p className="text-sm text-slate-600">Історія запуску та завершення сесій інвентаризації ({assetInventorySessionScopeId})</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-slate-100 border border-slate-200 px-2 py-1 text-xs text-slate-700">
                  Записів: {assetInventorySessionsHistory.length}
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
                  {assetInventorySessionsHistory.map((session) => (
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
                        <button
                          type="button"
                          onClick={() => printSingleAssetInventorySession(session)}
                          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Друк інвентаризації
                        </button>
                      </td>
                    </tr>
                  ))}
                  {assetInventorySessionsHistory.length === 0 && (
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
                mobileCardMode={true}
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

    // Глобальний debug-блок для всіх вкладок
    return (
      <div className="mb-4 p-3 bg-blue-100 border border-blue-300 text-blue-700 rounded-lg text-sm">
        <div>DEBUG renderContent:</div>
        <div>activeNav: {activeNav}</div>
        <div>topTab: {topTab}</div>
      </div>
    );
  };

  const mobileMenuButton = isMobile ? (
    <button type="button" onClick={() => setSidebarOpen(false)} className="absolute right-2 top-4 p-1 hover:bg-slate-700 rounded transition">
      <LucideIcons.ChevronLeft size={18} className="text-slate-300" />
    </button>
  ) : null;

  const desktopCollapseButton = !isMobile ? (
    <button type="button" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="absolute right-2 top-4 p-1 hover:bg-slate-700 rounded transition">
      {sidebarCollapsed ? <LucideIcons.ChevronRight size={18} className="text-slate-300" /> : <LucideIcons.ChevronLeft size={18} className="text-slate-300" />}
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
            <LucideIcons.ChevronDown size={14} style={{transition: "transform 150ms", transform: expandedGroups[group.id] ? "rotate(0deg)" : "rotate(-90deg)"}} />
          </button>
          {expandedGroups[group.id] && (
            <div style={{display: "flex", flexDirection: "column", gap: "0.25rem", paddingBottom: "0.5rem"}}>
              {group.children.map(item => (
                <button key={item.id} type="button" onClick={() => {setActiveNav(item.id); localStorage.setItem('lucia_activeNav', item.id); if (isMobile) setSidebarOpen(false);}} style={{margin: "0 0.5rem", display: "flex", alignItems: "flex-start", gap: "0.5rem", borderRadius: "0.5rem", padding: "0.5rem 0.75rem", fontSize: "0.875rem", fontWeight: "500", transition: "all 150ms", whiteSpace: "nowrap", backgroundColor: activeNav === item.id ? "#4f46e5" : "transparent", color: activeNav === item.id ? "white" : "#e2e8f0", border: "none", cursor: "pointer"}}>
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
      <aside style={{position: "fixed", left: 0, top: 0, height: "100vh", overflowY: "auto", borderRight: "1px solid #334155", backgroundColor: "rgba(15, 23, 42, 0.95)", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)", transition: "all 300ms", zIndex: isMobile ? 50 : 40, width: "288px", transform: isMobile && !sidebarOpen ? "translateX(-100%)" : "translateX(0)", ...(sidebarCollapsed && !isMobile && {width: "80px"})}}>
        <div style={{padding: "1rem", position: "relative"}}>
          {mobileMenuButton}
          {desktopCollapseButton}
          {sidebarHeader}
          {(isMobile || !sidebarCollapsed) && SidebarNav()}
        </div>
      </aside>
    </>
  );

  const topTabsElement = topTabs.length > 0 ? (
    <div className="sticky top-0 z-30 bg-slate-900/95 border-b border-slate-800 shadow-lg" style={{boxShadow: "0 4px 6px -1px rgba(15, 23, 42, 0.4)"}}>
      <div className={clsx("w-full px-0 lg:px-0 min-h-10", isMobile ? "flex flex-col" : "flex items-stretch justify-between") }>
        <div className="flex gap-0 items-stretch overflow-x-auto">
        {topTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setTopTab(tab.id);
              localStorage.setItem('lucia_topTab', tab.id);
              setSelected(null);
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
              isAssetInventorySessionActive
                ? "bg-emerald-900/15 text-emerald-200 border-emerald-700/30"
                : "bg-slate-800 text-slate-300 border-slate-600"
            )}>
              {assetInventorySessionLoading
                ? "Завантаження статусу сесії..."
                : isAssetInventorySessionActive
                ? (isMobile
                  ? "Сесія активна"
                  : `Сесія активна з ${new Date(assetInventorySession?.startedAt || Date.now()).toLocaleString("uk-UA")}`)
                : (isMobile ? "Сесія не активна" : "Сесія інвентаризації не активна")}
            </span>
            {!isAssetInventorySessionActive ? (
              <button
                type="button"
                onClick={startAssetInventorySession}
                disabled={assetInventorySessionLoading}
                className={clsx(
                  "rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60",
                  isMobile && "ml-auto"
                )}
              >
                Почати інвентаризацію
              </button>
            ) : (
              <button
                type="button"
                onClick={endAssetInventorySession}
                disabled={assetInventorySessionLoading}
                className={clsx(
                  "rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60",
                  isMobile && "ml-auto"
                )}
              >
                Завершити інвентаризацію
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  ) : null;

  const handleSwitchToRegister = () => {
    setShowLoginModal(false);
    setShowRegisterModal(true);
  };

  const handleSwitchToLogin = () => {
    setShowRegisterModal(false);
    setShowLoginModal(true);
  };

  const handleLoginSuccess = () => {
    // на момент закриття модалки user ще не встановлений, тому переходимо у useEffect нижче
    console.log("DEBUG: handleLoginSuccess invoked");
  };

  const loginModalElement = showLoginModal ? (
    <LoginModal onClose={() => setShowLoginModal(false)} onSwitchToRegister={handleSwitchToRegister} onLoginSuccess={handleLoginSuccess} />
  ) : null;

  const registerModalElement = showRegisterModal ? (
    <RegisterModal onClose={() => setShowRegisterModal(false)} onSwitchToLogin={handleSwitchToLogin} />
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
    const allowedIds = navItems.flatMap(g => g.children.map(c => c.id));
    if (allowedIds.length === 0) return;
    if (!allowedIds.includes(activeNav)) {
      const defaultNav = allowedIds[0];
      console.log("DEBUG: switch activeNav to first allowed", defaultNav);
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
                <button
                  onClick={() => setShowRegisterModal(true)}
                  className="w-full px-6 py-3 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition text-base sm:text-lg font-medium"
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
                  <LucideIcons.Menu size={22} className="text-slate-300" />
                </button>
              )}
              {/* Плашки ліворуч */}
              <div className={clsx("flex items-center gap-3", isMobile ? "flex-1 justify-center md:justify-start ml-2" : "")}>
                {/* Назва ресторану для всіх */}
                {user?.restaurant && (
                  <div className={clsx("flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-emerald-900/30 border border-emerald-700/50 text-emerald-300", isMobile ? "text-xs max-w-[160px]" : "")}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span className={clsx("font-semibold truncate", isMobile ? "text-xs" : "text-sm")}>
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
              
              {/* Користувач, сповіщення та вихід - праворуч */}
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300">
                  <LucideIcons.Database size={16} />
                  <span className="text-xs font-semibold">
                    БД: {activeDbBadge.label}
                  </span>
                  {(isRuntimeFirebaseConfig || runtimeCustomConfig) && (
                    <span className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">custom</span>
                  )}
                </div>
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300">
                  <LucideIcons.Clock3 size={16} />
                  <span className="text-sm font-medium tabular-nums">
                    {currentTime.toLocaleTimeString("uk-UA", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </div>
                {/* Дзвоник сповіщень */}
                <button
                  type="button"
                  className="relative p-2 rounded-full hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  title="Сповіщення"
                  onClick={() => setNotificationPanelOpen((v) => !v)}
                >
                  <LucideIcons.Bell size={20} className="text-slate-300" />
                  {/* Badge для непрочитаних */}
                  {notifications && notifications.length > 0 && (
                    <span className="absolute top-1 right-1 block h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white animate-pulse"></span>
                  )}
                </button>
                {/* NotificationPanel popover */}
                <NotificationPanel
                  open={notificationPanelOpen}
                  onClose={() => setNotificationPanelOpen(false)}
                  notifications={notifications}
                />
                <div className="hidden sm:flex items-center gap-2 text-sm text-slate-300">
                  <LucideIcons.UserIcon size={16} />
                  <span className="max-w-xs truncate">{user?.displayName || user?.email}</span>
                  {user?.role === "admin" && (
                    <span className="px-2 py-1 rounded bg-indigo-600 text-white text-xs font-semibold">
                      Admin
                    </span>
                  )}
                </div>
                <button
                  onClick={async () => {
                    try {
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
                  <LucideIcons.LogOut size={16} />
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
              <button
                onClick={() => {
                  setShowRegisterModal(true);
                }}
                className="px-2 sm:px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition text-xs sm:text-sm font-semibold"
              >
                Реєстрація
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
              "mx-auto max-w-screen-2xl px-3 sm:px-6 lg:px-8",
              activeNav === "inventory-products" ? "pt-1 pb-4 sm:pt-2 sm:pb-6" : "py-4 sm:py-8"
            )}
          >
            <div className={clsx(activeNav === "inventory-products" ? "mt-0" : "mt-4")}>
              {renderContent()}
            </div>
          </div>
        </main>
      </div>
      )}

      {/* Auth Modals */}
      {loginModalElement}
      {registerModalElement}
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
