import { useEffect, useMemo, useRef, useState } from "react";
import DateRangePickerPopover from "./DateRangePickerPopover";
import ServioSalesSettings from "./ServioSalesSettings";
import MonthlyPlanModal from "./MonthlyPlanModal";
import {
  createCollectionItemApi,
  getCollectionItemApi,
  listCollectionItemsApi,
  isCollectionsApiEnabled,
} from "../api/collectionsApi";
import {
  fetchServioSales,
  getServioSettings,
  isServioApiEnabled,
} from "../api/servioSettingsApi";
import { buildMonthlyPlan, largestRemainderDistribute } from "../utils/salesPlanDistribution";
import { fetchKyivWeather, weatherLabel } from "../api/weatherApi";
import { SALES_HOURS, DEFAULT_SALES_HOURS, groupServioSales, mergeServioFactHours, hoursWithSales, sumSalesRows, factAverageCheck } from "../utils/salesFacts.js";
const HOURS = SALES_HOURS;

const emptyHourRow = () => ({ planTo: "", factTo: "", planGosti: "", factGosti: "", weather: "" });
const emptyHours = () => Object.fromEntries(HOURS.map((hour) => [hour, emptyHourRow()]));

const DAY_KEYS_BY_INDEX = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const getDayKeyFromDate = (isoDate) => {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return DAY_KEYS_BY_INDEX[parsed.getDay()];
};

// Обчислює список годин, що потрапляють у графік роботи закладу для обраного дня.
const getVisibleHours = (schedule, isoDate) => {
  const dayKey = getDayKeyFromDate(isoDate);
  const daySchedule = dayKey ? schedule?.[dayKey] : null;
  const from = daySchedule?.from;
  const to = daySchedule?.to;
  if (!from || !to) return DEFAULT_SALES_HOURS;

  const [openHour, openMinute = 0] = from.split(":").map(Number);
  const [closeHour, closeMinute = 0] = to.split(":").map(Number);
  const open = openHour * 60 + openMinute;
  let close = closeHour * 60 + closeMinute;
  if (!Number.isFinite(open) || !Number.isFinite(close)) return DEFAULT_SALES_HOURS;
  if (close <= open) close += 24 * 60;
  return HOURS.filter((hour) => {
    const end = Number(hour.split(":")[0]) * 60;
    return [0, 24 * 60].some((offset) => end + offset > open && end - 60 + offset < close);
  });
};

const toIsoDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// 7 дат тижня (Пн–Нд), що містить задану дату.
const getWeekDates = (isoDate) => {
  const base = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(base.getTime())) return [];
  const dow = (base.getDay() + 6) % 7; // 0 = понеділок
  const monday = new Date(base);
  monday.setDate(base.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toIsoDate(d);
  });
};

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const formatDayLabel = (iso) => {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
};
const formatHourRange = (hourKey) => {
  const endHour = Number(String(hourKey).split(":")[0]);
  if (!Number.isFinite(endHour)) return hourKey;
  const startHour = String((endHour + 23) % 24).padStart(2, "0");
  return `${startHour}:00 - ${startHour}:59`;
};

// Усі дати місяця, що містить задану дату.
const getMonthDates = (isoDate) => {
  const [y, m] = isoDate.split("-").map(Number);
  if (!y || !m) return [];
  const total = new Date(y, m, 0).getDate();
  return Array.from({ length: total }, (_, i) => `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
};

const getDatesInRange = (from, to) => {
  if (!from || !to) return [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (start > end) return getDatesInRange(to, from);
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const MONTHS_UK_GEN = [
  "січня", "лютого", "березня", "квітня", "травня", "червня",
  "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
];
const formatMonthLabel = (isoDate) => {
  const [y, m] = isoDate.split("-").map(Number);
  return `${MONTHS_UK_GEN[(m || 1) - 1]} ${y}`;
};

const toNumber = (value) => {
  const n = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const formatNumber = (value) => (value !== null && value !== undefined && value !== "" ? new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(value) : "");
const averageCheck = (turnover, guests) => (guests > 0 ? Math.round(turnover / guests) : 0);

// Відсоток відхилення факту від плану: (факт/план − 1) × 100. null — коли плану немає.
const deviationPct = (fact, plan) => (fact !== null && fact !== "" && plan > 0 ? (fact / plan - 1) * 100 : null);
const formatPct = (pct) => {
  if (pct === null || pct === undefined) return "—";
  const rounded = Math.round(pct);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
};
// 4 відтінки заливки за відхиленням: + зелене, до −5 жовте, −5…−10 рожеве, нижче −10 темно-рожеве.
const deviationCellClass = (pct) => {
  if (pct === null || pct === undefined) return "";
  if (pct >= 0) return "bg-green-100 text-green-800";
  if (pct >= -5) return "bg-amber-100 text-amber-800";
  if (pct >= -10) return "bg-pink-100 text-pink-700";
  return "bg-pink-300 text-pink-900";
};

const buildDocId = (restaurantId, date) => `${restaurantId}__${date}`;

// Розподіляє введене вручну загальне значення порівну на кількість робочих годин
// (залишок додається до перших годин), точно зберігаючи суму, що дорівнює введеному тоталу.
const distributeTotalAcrossHours = (hours, targetTotal) => {
  const n = hours.length;
  if (n === 0) return {};
  const total = Math.round(targetTotal);
  const base = Math.floor(total / n);
  const remainder = total - base * n;

  return Object.fromEntries(
    hours.map((hour, i) => [hour, String(base + (i < remainder ? 1 : 0))])
  );
};

export default function SalesPlanningModule({ user, restaurants = [], topTab }) {
  const isAdmin = user?.role === "admin";
  const userRestaurantIds = (Array.isArray(user?.restaurants) && user.restaurants.length
    ? user.restaurants
    : (user?.restaurant ? [user.restaurant] : [])
  ).map((id) => String(id));

  const restaurantOptions = isAdmin
    ? restaurants
    : restaurants.filter((r) => userRestaurantIds.includes(String(r.id)));

  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [hourlyData, setHourlyData] = useState(emptyHours);
  const [loading, setLoading] = useState(false);
  const [dataLoadError, setDataLoadError] = useState(false);
  const [status, setStatus] = useState("");
  const [servioMapping, setServioMapping] = useState({});
  const [fetchingFact, setFetchingFact] = useState(false);
  const [monthlyModalOpen, setMonthlyModalOpen] = useState(false);
  const [monthlyGenerating, setMonthlyGenerating] = useState(false);
  const [monthlyStatus, setMonthlyStatus] = useState("");
  const [monthlyHistory, setMonthlyHistory] = useState([]);
  const [viewMode, setViewMode] = useState("day"); // "day" | "week" | "month"
  const [periodData, setPeriodData] = useState({}); // { iso: hoursObject }
  const [periodLoading, setPeriodLoading] = useState(false);
  // Bulk-підтягування факту: діапазон дат + мультивибір закладів (доступно в усіх режимах).
  const [factFrom, setFactFrom] = useState(() => toIsoDate(new Date()));
  const [factTo, setFactTo] = useState(() => toIsoDate(new Date()));
  const [factRestaurantIds, setFactRestaurantIds] = useState([]);
  const [factRangeData, setFactRangeData] = useState({});
  const [factRangeLoading, setFactRangeLoading] = useState(false);
  const [factRangeReload, setFactRangeReload] = useState(0);
  const [factRestaurantPickerOpen, setFactRestaurantPickerOpen] = useState(false);
  const factRestaurantPickerRef = useRef(null);

  const mappedFactRestaurantOptions = useMemo(
    () => restaurantOptions.filter((restaurant) => Boolean(String(servioMapping[String(restaurant.id)] ?? "").trim())),
    [restaurantOptions, servioMapping]
  );
  const mappedFactRestaurantIdsKey = mappedFactRestaurantOptions.map((restaurant) => String(restaurant.id)).join(",");

  const isSettingsTab = /setting|налашт/.test(String(topTab || "").toLowerCase());

  // Мапінг «заклад LUCIA → BaseExternalID Servio» для підстановки в @RestCode.
  useEffect(() => {
    if (isSettingsTab || !isServioApiEnabled()) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getServioSettings();
        if (!cancelled) setServioMapping(res?.saved?.mapping && typeof res.saved.mapping === "object" ? res.saved.mapping : {});
      } catch {
        // ignore — факт із Servio просто буде недоступний
      }
    })();
    return () => { cancelled = true; };
  }, [isSettingsTab]);

  useEffect(() => {
    if (selectedRestaurantId && restaurantOptions.some((r) => String(r.id) === selectedRestaurantId)) return;
    setSelectedRestaurantId(restaurantOptions[0] ? String(restaurantOptions[0].id) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantOptions.map((r) => r.id).join(",")]);

  useEffect(() => {
    setFactRestaurantIds((prev) => {
      const available = mappedFactRestaurantIdsKey ? mappedFactRestaurantIdsKey.split(",") : [];
      const retained = prev.filter((id) => available.includes(id));
      const next = retained.length > 0
        ? retained
        : selectedRestaurantId && available.includes(selectedRestaurantId)
        ? [selectedRestaurantId]
        : available.slice(0, 1);
      return next.length === prev.length && next.every((id, index) => id === prev[index]) ? prev : next;
    });
  }, [mappedFactRestaurantIdsKey, selectedRestaurantId]);

  useEffect(() => {
    if (factRestaurantIds.length !== 1) return;
    const [restaurantId] = factRestaurantIds;
    if (String(selectedRestaurantId) !== String(restaurantId)) {
      setSelectedRestaurantId(String(restaurantId));
    }
  }, [factRestaurantIds, selectedRestaurantId]);

  useEffect(() => {
    if (!factRestaurantPickerOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!factRestaurantPickerRef.current?.contains(event.target)) setFactRestaurantPickerOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setFactRestaurantPickerOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [factRestaurantPickerOpen]);

  const currentRestaurant = restaurantOptions.find((r) => String(r.id) === selectedRestaurantId);
  const selectedRestaurants = restaurantOptions.filter((restaurant) => factRestaurantIds.includes(String(restaurant.id)));
  const canEdit = factRestaurantIds.length === 1 && Boolean(selectedRestaurantId) && (isAdmin || userRestaurantIds.includes(selectedRestaurantId));
  const canImportFact = isServioApiEnabled() && mappedFactRestaurantOptions.length > 0;
  const factRangeDates = useMemo(() => getDatesInRange(factFrom, factTo), [factFrom, factTo]);

  const visibleHours = useMemo(
    () => hoursWithSales(getVisibleHours(currentRestaurant?.schedule, date), hourlyData),
    [currentRestaurant?.schedule, date, hourlyData]
  );
  const dayKey = getDayKeyFromDate(date);
  const daySchedule = dayKey ? currentRestaurant?.schedule?.[dayKey] : null;
  const scheduleHint = daySchedule?.from && daySchedule?.to
    ? `Графік роботи на цей день: ${daySchedule.from}–${daySchedule.to}`
    : "Графік роботи закладу не налаштовано — показані всі години. Задайте його в Налаштування → Ресторани → Графік роботи.";

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!selectedRestaurantId || !date) {
        setHourlyData(emptyHours());
        return;
      }
      setLoading(true);
      setDataLoadError(false);
      setHourlyData(emptyHours());
      try {
        if (isCollectionsApiEnabled()) {
          const saved = await getCollectionItemApi("salesHourlyPlans", buildDocId(selectedRestaurantId, date));
          if (!cancelled) {
            const savedHours = saved?.hours && typeof saved.hours === "object" ? saved.hours : {};
            setHourlyData({ ...emptyHours(), ...savedHours });
          }
        } else if (!cancelled) {
          setHourlyData(emptyHours());
        }
      } catch (error) {
        if (!cancelled) { setDataLoadError(true); setStatus(`Не вдалося завантажити дані: ${error?.message || error}`); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [selectedRestaurantId, date, factRangeReload]);

  // Огляд періоду (тиждень/місяць): вантажимо всі дні періоду.
  const periodDates = useMemo(() => {
    if (viewMode === "week") return getWeekDates(date);
    if (viewMode === "month") return getMonthDates(date);
    return [];
  }, [viewMode, date]);

  useEffect(() => {
    if (viewMode === "day" || periodDates.length === 0) return;
    let cancelled = false;
    const load = async () => {
      setPeriodLoading(true);
      try {
        if (!isCollectionsApiEnabled()) {
          if (!cancelled) setPeriodData({});
          return;
        }
        const requests = factRestaurantIds.flatMap((restaurantId) => periodDates.map((iso) => ({ restaurantId, iso })));
        const docs = await Promise.all(requests.map(({ restaurantId, iso }) =>
          getCollectionItemApi("salesHourlyPlans", buildDocId(restaurantId, iso))
        ));
        if (cancelled) return;
        const next = {};
        requests.forEach(({ restaurantId, iso }, i) => {
          next[buildDocId(restaurantId, iso)] = docs[i]?.hours || {};
        });
        setPeriodData(next);
      } catch (error) {
        if (!cancelled) { setPeriodData({}); setStatus(`Помилка завантаження періоду: ${error?.message || error}`); }
      } finally {
        if (!cancelled) setPeriodLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [viewMode, factRestaurantIds, periodDates, factRangeReload]);

  // Дані вибраних закладів за верхній діапазон для погодинної агрегації.
  useEffect(() => {
    if (factRestaurantIds.length === 0 || factRangeDates.length === 0 || !isCollectionsApiEnabled()) {
      setFactRangeData({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      setFactRangeLoading(true);
      try {
        const requests = factRestaurantIds.flatMap((restaurantId) => factRangeDates.map((iso) => ({ restaurantId, iso })));
        const docs = await Promise.all(requests.map(({ restaurantId, iso }) =>
          getCollectionItemApi("salesHourlyPlans", buildDocId(restaurantId, iso))
        ));
        if (cancelled) return;
        const next = {};
        requests.forEach(({ restaurantId, iso }, index) => {
          const saved = docs[index];
          next[buildDocId(restaurantId, iso)] = saved?.hours && typeof saved.hours === "object" ? saved.hours : {};
        });
        setFactRangeData(next);
      } catch (error) {
        if (!cancelled) { setFactRangeData({}); setStatus(`Помилка завантаження факту: ${error?.message || error}`); }
      } finally {
        if (!cancelled) setFactRangeLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [factRestaurantIds, factRangeDates, factRangeReload, selectedRestaurantId, date]);

  // Історія плану/факту закладу для передзаповнення й прогнозу у вікні «План на місяць».
  useEffect(() => {
    if (!monthlyModalOpen || !selectedRestaurantId || !isCollectionsApiEnabled()) return;
    let cancelled = false;
    (async () => {
      const all = await listCollectionItemsApi("salesHourlyPlans").catch(() => []);
      if (cancelled) return;
      const hist = (Array.isArray(all) ? all : []).filter(
        (rec) => String(rec?.restaurantId || "") === String(selectedRestaurantId)
      );
      setMonthlyHistory(hist);
    })();
    return () => { cancelled = true; };
  }, [monthlyModalOpen, selectedRestaurantId]);

  // Денні підсумки періоду (сума по робочих годинах кожного дня).
  // Відсоток рахується ПО КОЖНОМУ ДНЮ окремо (факт/план − 1), а не накопичувально —
  // інакше день, де факт > плану, міг показувати «мінус» через відставання попередніх днів.
  const periodRows = useMemo(() => {
    return periodDates.map((iso) => {
      const rows = factRestaurantIds.flatMap((restaurantId) => Object.values(periodData[buildDocId(restaurantId, iso)] || {}));
      const acc = sumSalesRows(rows);
      const dow = (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
      return { iso, weekdayLabel: WEEKDAY_LABELS[dow], ...acc };
    });
  }, [periodDates, periodData, factRestaurantIds]);

  const periodTotals = useMemo(() => sumSalesRows(periodRows), [periodRows]);

  const isAggregateView = factRangeDates.length > 1 || factRestaurantIds.length !== 1;
  const isSelectedSingleDayFactView = factRangeDates.length === 1
    && factRestaurantIds.length === 1
    && String(factRestaurantIds[0]) === String(selectedRestaurantId)
    && factRangeDates[0] === date;
  const factRangeHours = useMemo(() => {
    const hours = new Set();
    selectedRestaurants.forEach((restaurant) => {
      factRangeDates.forEach((iso) => hoursWithSales(getVisibleHours(restaurant.schedule, iso), factRangeData[buildDocId(restaurant.id, iso)]).forEach((hour) => hours.add(hour)));
    });
    return HOURS.filter((hour) => hours.has(hour));
  }, [factRangeDates, selectedRestaurants, factRangeData]);

  const factRangeHourlyData = useMemo(() => {
    return Object.fromEntries(factRangeHours.map((hour) => [hour, sumSalesRows(
      factRestaurantIds.flatMap((restaurantId) => factRangeDates.map((iso) => factRangeData[buildDocId(restaurantId, iso)]?.[hour] || {}))
    )]));
  }, [factRestaurantIds, factRangeDates, factRangeData, factRangeHours]);

  const tableHours = isAggregateView ? factRangeHours : visibleHours;
  // Редагування й таблиця одного дня мають єдине джерело даних.
  const tableHourlyData = isAggregateView ? factRangeHourlyData : hourlyData;
  const totals = useMemo(() => sumSalesRows(tableHours.map((hour) => tableHourlyData[hour] || {})), [tableHourlyData, tableHours]);

  const handleFieldChange = (hour, field, value) => {
    setHourlyData((prev) => ({
      ...prev,
      [hour]: { ...(prev[hour] || emptyHourRow()), [field]: value, ...(field === "factTo" ? { factBillCount: "" } : {}) },
    }));
    if (isSelectedSingleDayFactView) {
      const docId = buildDocId(selectedRestaurantId, date);
      setFactRangeData((prev) => ({
        ...prev,
        [docId]: {
          ...(prev[docId] || {}),
          [hour]: { ...(prev[docId]?.[hour] || emptyHourRow()), [field]: value, ...(field === "factTo" ? { factBillCount: "" } : {}) },
        },
      }));
    }
  };

  const toggleFactRestaurant = (restaurantId) => {
    const id = String(restaurantId);
    const next = factRestaurantIds.includes(id)
      ? factRestaurantIds.filter((value) => value !== id)
      : [...factRestaurantIds, id];
    setFactRestaurantIds(next);
    if (next.includes(id)) setSelectedRestaurantId(id);
    else if (selectedRestaurantId === id) setSelectedRestaurantId(next[0] || "");
  };

  const selectAllFactRestaurants = () => {
    const ids = mappedFactRestaurantOptions.map((restaurant) => String(restaurant.id));
    setFactRestaurantIds(ids);
    if (!selectedRestaurantId && ids[0]) setSelectedRestaurantId(ids[0]);
  };

  const clearFactRestaurants = () => {
    setFactRestaurantIds([]);
    setSelectedRestaurantId("");
  };

  // Ручне введення тотала по "План ТО" / "План Гості" автоматично розносить значення по годинах.
  const handleTotalPlanChange = (field, value) => {
    const targetTotal = toNumber(value);
    setHourlyData((prev) => {
      const distributed = distributeTotalAcrossHours(visibleHours, targetTotal);
      const next = { ...prev };
      visibleHours.forEach((hour) => {
        next[hour] = { ...(next[hour] || emptyHourRow()), [field]: distributed[hour] };
      });
      return next;
    });
  };

  // Ручне введення тотала "План Сер. чек" перераховує потрібний тотал "План ТО" (за поточною
  // кількістю Гостей) і розносить його по годинах пропорційно.
  const handleTotalPlanAvgCheckChange = (value) => {
    if (totals.planGosti <= 0) {
      setStatus("Спочатку вкажіть План Гості, щоб розрахувати План Сер. чек.");
      return;
    }
    const targetAvgCheck = toNumber(value);
    const targetTotalPlanTo = targetAvgCheck * totals.planGosti;
    handleTotalPlanChange("planTo", targetTotalPlanTo);
  };

  // Ручне введення тотала "Факт ТО" / "Факт Гості" розносить значення по годинах
  // пропорційно до відповідного плану (План ТО / План Гості); без плану — рівномірно.
  const handleTotalFactChange = (field, value) => {
    const planField = field === "factTo" ? "planTo" : "planGosti";
    const targetTotal = toNumber(value);
    setHourlyData((prev) => {
      const weights = visibleHours.map((hour) => toNumber((prev[hour] || {})[planField]));
      const scale = field === "factTo" ? 100 : 1;
      const distributed = largestRemainderDistribute(weights, targetTotal * scale);
      const next = { ...prev };
      visibleHours.forEach((hour, i) => {
        next[hour] = { ...(next[hour] || emptyHourRow()), [field]: String(distributed[i] / scale), ...(field === "factTo" ? { factBillCount: "" } : {}) };
      });
      return next;
    });
  };

  const handleSave = async () => {
    if (!canEdit || isAggregateView || loading || dataLoadError || fetchingFact) return;
    if (!isCollectionsApiEnabled()) {
      setStatus("Збереження недоступне: не налаштований API даних.");
      return;
    }
    setStatus("Збереження...");
    try {
      await createCollectionItemApi("salesHourlyPlans", {
        id: buildDocId(selectedRestaurantId, date),
        restaurantId: selectedRestaurantId,
        date,
        hours: hourlyData,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.displayName || user?.email || "",
      });
      setFactRangeData((prev) => ({ ...prev, [buildDocId(selectedRestaurantId, date)]: hourlyData }));
      setStatus("Збережено");
    } catch (error) {
      setStatus(`Помилка збереження: ${error?.message || error}`);
    }
  };

  // Підтягує факт Servio за діапазон дат і всі вибрані заклади, не змінюючи план.
  const handleFetchFactFromServio = async () => {
    const from = factFrom > factTo ? factTo : factFrom;
    const to = factFrom > factTo ? factFrom : factTo;
    const selectedIds = factRestaurantIds.length ? factRestaurantIds : [selectedRestaurantId].filter(Boolean);
    const pairs = selectedIds
      .map((restaurantId) => ({ restaurantId, restCode: String(servioMapping[String(restaurantId)] ?? "").trim() }))
      .filter((pair) => pair.restCode);
    if (!from || !to || !pairs.length) {
      setStatus("Виберіть період і хоча б один зіставлений заклад Servio.");
      return;
    }
    setFetchingFact(true);
    setStatus(`Завантаження факту з Servio: ${from} — ${to}...`);
    try {
      const rows = await fetchServioSales({
        startDate: from,
        endDate: `${to} 23:59:59`,
        restCode: [...new Set(pairs.map((pair) => pair.restCode))].join(","),
      });
      const groupedFacts = groupServioSales(rows);
      const dates = getDatesInRange(from, to);
      let savedCount = 0;
      let matchedHours = 0;
      for (const { restaurantId } of pairs) {
        for (const iso of dates) {
          const restCode = String(servioMapping[String(restaurantId)]).trim();
          const factByHour = groupedFacts.get(`${restCode}__${iso}`) || {};
          const existing = await getCollectionItemApi("salesHourlyPlans", buildDocId(restaurantId, iso));
          const nextHours = mergeServioFactHours(existing?.hours || {}, factByHour);
          matchedHours += Object.keys(factByHour).length;
          await createCollectionItemApi("salesHourlyPlans", {
            id: buildDocId(restaurantId, iso),
            restaurantId,
            date: iso,
            hours: nextHours,
            updatedAt: new Date().toISOString(),
            updatedBy: user?.displayName || user?.email || "",
          });
          savedCount += 1;
        }
      }
      setStatus(matchedHours ? `Факт завантажено: ${matchedHours} годин, збережено ${savedCount} днів.` : "Servio не повернув даних за вибраний період.");
    } catch (error) {
      setStatus(`Помилка завантаження факту: ${error?.message || error}`);
    } finally {
      setFactRangeReload((value) => value + 1);
      setFetchingFact(false);
    }
  };

  // Розкладає місячний план ТО/Гості по днях і годинах за історичними частками,
  // зберігаючи наявний факт у кожному дні.
  const handleGenerateMonthlyPlan = async ({ year, month, monthlyTo, monthlyGuests, useWeather }) => {
    if (!canEdit || !selectedRestaurantId) return;
    if (!isCollectionsApiEnabled()) {
      setMonthlyStatus("Збереження недоступне: не налаштований API даних.");
      return;
    }
    setMonthlyGenerating(true);
    setMonthlyStatus("Аналіз історії та розрахунок...");
    try {
      const all = await listCollectionItemsApi("salesHourlyPlans");
      const history = (Array.isArray(all) ? all : []).filter(
        (rec) => String(rec?.restaurantId || "") === String(selectedRestaurantId)
      );
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevMonthYear = month === 1 ? year - 1 : year;
      const profilePrefixes = [
        `${prevMonthYear}-${String(prevMonth).padStart(2, "0")}`,
        `${year - 1}-${String(month).padStart(2, "0")}`,
        `${prevMonthYear - 1}-${String(prevMonth).padStart(2, "0")}`,
      ];
      const forecastHistory = history.filter((rec) => profilePrefixes.some(
        (prefix) => String(rec?.date || "").slice(0, 7) === prefix
      ));
      const existingByDate = new Map(
        history.map((rec) => [String(rec?.date || "").slice(0, 10), rec])
      );

      // Прогноз погоди для Києва на місяць (для найближчих днів у межах горизонту).
      let weatherByDate = {};
      if (useWeather) {
        setMonthlyStatus("Завантаження прогнозу погоди...");
        const lastDay = new Date(year, month, 0).getDate();
        const pad = (n) => String(n).padStart(2, "0");
        try {
          weatherByDate = await fetchKyivWeather({
            startDate: `${year}-${pad(month)}-01`,
            endDate: `${year}-${pad(month)}-${pad(lastDay)}`,
          });
        } catch (e) {
          setMonthlyStatus(`Погода недоступна (${e?.message || e}). Продовжую без неї...`);
          weatherByDate = {};
        }
      }

      const plan = buildMonthlyPlan({
        year,
        month,
        monthlyTo,
        monthlyGuests,
        history: forecastHistory,
        getHoursForDate: (iso) => getVisibleHours(currentRestaurant?.schedule, iso),
        weatherByDate,
      });

      let saved = 0;
      for (const day of plan.days) {
        const existing = existingByDate.get(day.date);
        const existingHours = existing?.hours && typeof existing.hours === "object" ? existing.hours : {};
        const mergedHours = { ...existingHours };
        const weatherText = weatherLabel(day.weather);
        for (const [hour, values] of Object.entries(day.hours)) {
          mergedHours[hour] = {
            ...(existingHours[hour] || emptyHourRow()),
            planTo: String(values.planTo || ""),
            planGosti: String(values.planGosti || ""),
            ...(weatherText ? { weather: weatherText } : {}),
          };
        }
        await createCollectionItemApi("salesHourlyPlans", {
          id: buildDocId(selectedRestaurantId, day.date),
          restaurantId: selectedRestaurantId,
          date: day.date,
          hours: mergedHours,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.displayName || user?.email || "",
        });
        saved += 1;
        if (saved % 5 === 0) setMonthlyStatus(`Збереження... ${saved}/${plan.days.length}`);
      }

      const histNote = plan.meta.hasHistory
        ? `на основі історії (${plan.meta.historyDays} дн.)`
        : "рівномірно (історія відсутня)";
      const weatherNote = useWeather && Object.keys(weatherByDate).length
        ? `, погода: ${Object.keys(weatherByDate).length} дн.`
        : "";
      setMonthlyStatus(`Готово: розподілено ${saved} днів ${histNote}${weatherNote}.`);

      // Оновлюємо поточну відкриту дату, якщо вона в цьому місяці.
      const [curY, curM] = date.split("-").map(Number);
      if (curY === year && curM === month) {
        const currentDoc = await getCollectionItemApi("salesHourlyPlans", buildDocId(selectedRestaurantId, date));
        const savedHours = currentDoc?.hours && typeof currentDoc.hours === "object" ? currentDoc.hours : {};
        setHourlyData({ ...emptyHours(), ...savedHours });
      }
      setFactRangeReload((value) => value + 1);
      setMonthlyModalOpen(false);
      setStatus("Місячний план збережено.");
    } catch (error) {
      setMonthlyStatus(`Помилка: ${error?.message || error}`);
    } finally {
      setMonthlyGenerating(false);
    }
  };

  if (isSettingsTab) {
    return <ServioSalesSettings restaurants={restaurantOptions} />;
  }

  return (
    <div className="card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl">
      <div className="mb-4">
        <div className="min-h-[44px]">
          <h2 className="text-lg font-semibold">Продажі — план / факт по годинах</h2>
          <p className="text-sm text-slate-600">
            {selectedRestaurants.length === 1
              ? selectedRestaurants[0].name
              : selectedRestaurants.length > 1
                ? `Обрано закладів: ${selectedRestaurants.length}`
                : "Оберіть заклади"}
          </p>
        </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-300">
            <button
              type="button"
              onClick={() => setViewMode("day")}
              className={`px-3 py-2 text-sm font-semibold transition ${viewMode === "day" ? "bg-indigo-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              День
            </button>
            <button
              type="button"
              onClick={() => setViewMode("week")}
              className={`border-l border-slate-300 px-3 py-2 text-sm font-semibold transition ${viewMode === "week" ? "bg-indigo-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              Тиждень
            </button>
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={`border-l border-slate-300 px-3 py-2 text-sm font-semibold transition ${viewMode === "month" ? "bg-indigo-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              Місяць
            </button>
          </div>
          <div className="w-64">
            <DateRangePickerPopover
              from={factFrom}
              to={factTo}
              onChange={({ from, to }) => { setFactFrom(from); setFactTo(to); setDate(from); }}
            />
          </div>
          {canImportFact && (
            <details ref={factRestaurantPickerRef} open={factRestaurantPickerOpen} onToggle={(event) => setFactRestaurantPickerOpen(event.currentTarget.open)} className="relative w-56">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-indigo-400">
                <span>Заклади для факту</span>
                <span className="text-xs font-medium text-indigo-700">{factRestaurantIds.length}/{mappedFactRestaurantOptions.length}</span>
              </summary>
              <div className="absolute right-0 z-40 mt-1 max-h-64 w-80 overflow-y-auto rounded-lg border border-slate-300 bg-white p-3 shadow-lg">
                <div className="mb-2 flex justify-end gap-3 text-xs font-semibold">
                  <button type="button" onClick={selectAllFactRestaurants} className="text-indigo-700 hover:underline">Всі</button>
                  <button type="button" onClick={clearFactRestaurants} className="text-slate-600 hover:underline">Жоден</button>
                </div>
                <div className="space-y-1.5">
                  {mappedFactRestaurantOptions.map((restaurant) => {
                    const id = String(restaurant.id);
                    const checked = factRestaurantIds.includes(id);
                    return (
                      <label key={id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={checked} onChange={() => toggleFactRestaurant(id)} className="h-4 w-4 accent-indigo-600" />
                        <span>{restaurant.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </details>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => { setMonthlyStatus(""); setMonthlyModalOpen(true); }}
              title="Ввести план на місяць і розкласти його по днях/годинах за історією"
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              План на місяць
            </button>
          )}
          {canImportFact && (
            <button
              type="button"
              onClick={handleFetchFactFromServio}
              disabled={fetchingFact || loading || !factRestaurantIds.length}
              title="Завантажити факт із Servio за вибраний період і всі позначені заклади"
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {fetchingFact ? "Завантаження..." : "Підтягнути факт із Servio"}
            </button>
          )}
          {viewMode === "day" && canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={loading || dataLoadError || fetchingFact || isAggregateView}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Зберегти
            </button>
          )}
        </div>
      </div>

      {status && <p className="mb-3 text-sm text-slate-600">{status}</p>}
      {viewMode === "day" && selectedRestaurants.length > 0 && <p className="mb-3 min-h-5 truncate text-sm text-slate-500">{isAggregateView ? (factRangeLoading ? "Завантаження погодинного підсумку за вибраним фільтром..." : `Погодинний підсумок: ${factRangeDates.length} дн., закладів: ${selectedRestaurants.length}. Редагування доступне для одного дня й одного закладу.`) : scheduleHint}</p>}

      {restaurantOptions.length === 0 ? (
        <p className="text-sm text-slate-500">Немає закладів, доступних для перегляду.</p>
      ) : viewMode !== "day" ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="font-semibold text-slate-700">
              {viewMode === "week"
                ? `Тиждень: ${formatDayLabel(periodDates[0] || date)}–${formatDayLabel(periodDates[periodDates.length - 1] || date)}`
                : formatMonthLabel(date)}
            </span>
            {periodLoading && <span className="text-slate-500">Завантаження…</span>}
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">День</th>
                <th className="px-2 py-2 text-right">План ТО</th>
                <th className="px-2 py-2 text-right">Факт ТО</th>
                <th className="px-2 py-2 text-right">% ТО</th>
                <th className="px-2 py-2 text-right">План Гості</th>
                <th className="px-2 py-2 text-right">Факт Гості</th>
                <th className="px-2 py-2 text-right">% Гості</th>
                <th className="px-2 py-2 text-right">План Сер. чек</th>
                <th className="px-2 py-2 text-right">Факт Сер. чек</th>
                <th className="px-2 py-2 text-right">% Сер. чек</th>
                <th className="px-3 py-2 text-left">Погода</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-200 bg-amber-50 font-semibold">
                <td className="px-3 py-2">Тотал</td>
                <td className="px-2 py-2 text-right">{formatNumber(periodTotals.planTo)}</td>
                <td className="px-2 py-2 text-right">{formatNumber(periodTotals.factTo)}</td>
                <td className={`px-2 py-2 text-right ${deviationCellClass(deviationPct(periodTotals.factTo, periodTotals.planTo))}`}>{formatPct(deviationPct(periodTotals.factTo, periodTotals.planTo))}</td>
                <td className="px-2 py-2 text-right">{formatNumber(periodTotals.planGosti)}</td>
                <td className="px-2 py-2 text-right">{formatNumber(periodTotals.factGosti)}</td>
                <td className={`px-2 py-2 text-right ${deviationCellClass(deviationPct(periodTotals.factGosti, periodTotals.planGosti))}`}>{formatPct(deviationPct(periodTotals.factGosti, periodTotals.planGosti))}</td>
                <td className="px-2 py-2 text-right">{formatNumber(averageCheck(periodTotals.planTo, periodTotals.planGosti))}</td>
                <td className="px-2 py-2 text-right">{formatNumber(factAverageCheck(periodTotals))}</td>
                <td className={`px-2 py-2 text-right ${deviationCellClass(deviationPct(factAverageCheck(periodTotals), averageCheck(periodTotals.planTo, periodTotals.planGosti)))}`}>{formatPct(deviationPct(factAverageCheck(periodTotals), averageCheck(periodTotals.planTo, periodTotals.planGosti)))}</td>
                <td className="px-3 py-2"></td>
              </tr>
              {periodRows.map((r) => (
                <tr
                  key={r.iso}
                  onClick={() => { setDate(r.iso); setFactFrom(r.iso); setFactTo(r.iso); setViewMode("day"); }}
                  title="Відкрити день"
                  className={`cursor-pointer border-t border-slate-200 hover:bg-indigo-50 ${r.iso === date ? "bg-indigo-50/50" : ""}`}
                >
                  <td className="px-3 py-2 font-medium text-slate-700">
                    {formatDayLabel(r.iso)} · {r.weekdayLabel}
                  </td>
                  <td className="px-2 py-2 text-right">{formatNumber(r.planTo)}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(r.factTo)}</td>
                  <td className={`px-2 py-2 text-right ${deviationCellClass(deviationPct(r.factTo, r.planTo))}`}>{formatPct(deviationPct(r.factTo, r.planTo))}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(r.planGosti)}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(r.factGosti)}</td>
                  <td className={`px-2 py-2 text-right ${deviationCellClass(deviationPct(r.factGosti, r.planGosti))}`}>{formatPct(deviationPct(r.factGosti, r.planGosti))}</td>
                  <td className="px-2 py-2 text-right text-slate-600">{formatNumber(averageCheck(r.planTo, r.planGosti))}</td>
                  <td className="px-2 py-2 text-right text-slate-600">{formatNumber(factAverageCheck(r))}</td>
                  <td className={`px-2 py-2 text-right ${deviationCellClass(deviationPct(factAverageCheck(r), averageCheck(r.planTo, r.planGosti)))}`}>{formatPct(deviationPct(factAverageCheck(r), averageCheck(r.planTo, r.planGosti)))}</td>
                  <td className="px-3 py-2 text-slate-500">{r.weather || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full table-fixed text-xs">
            <colgroup>
              <col className="w-12" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[7%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[7%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[7%]" />
              <col className="w-12" />
            </colgroup>
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-2 py-1.5 text-left"></th>
                <th className="px-1.5 py-1.5 text-right whitespace-normal leading-tight">План ТО</th>
                <th className="px-1.5 py-1.5 text-right whitespace-normal leading-tight">Факт ТО</th>
                <th className="px-1.5 py-1.5 text-right whitespace-normal leading-tight">% ТО</th>
                <th className="px-1.5 py-1.5 text-right whitespace-normal leading-tight">План Гості</th>
                <th className="px-1.5 py-1.5 text-right whitespace-normal leading-tight">Факт Гості</th>
                <th className="px-1.5 py-1.5 text-right whitespace-normal leading-tight">% Гості</th>
                <th className="px-1.5 py-1.5 text-right whitespace-normal leading-tight">План Сер. чек</th>
                <th className="px-1.5 py-1.5 text-right whitespace-normal leading-tight">Факт Сер. чек</th>
                <th className="px-1.5 py-1.5 text-right whitespace-normal leading-tight">% Сер. чек</th>
                <th className="px-1.5 py-1.5 text-center whitespace-normal leading-tight">Погода</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-200 bg-amber-50 font-semibold">
                <td className="px-2 py-1.5">Тотал</td>
                <td className="px-1.5 py-1.5 text-right">
                  <input
                    type="number"
                    value={totals.planTo || ""}
                    onChange={(e) => handleTotalPlanChange("planTo", e.target.value)}
                    onBlur={handleSave}
                    disabled={!canEdit || isAggregateView || loading || dataLoadError || fetchingFact}
                    title="Введіть загальний план — розподілиться по годинах автоматично"
                    className="w-full min-w-0 rounded border border-amber-300 bg-white px-1.5 py-1 text-right text-xs font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
                  />
                </td>
                <td className="px-1.5 py-1.5 text-right">
                  <input
                    type="number"
                    value={totals.factTo ?? ""}
                    onChange={(e) => handleTotalFactChange("factTo", e.target.value)}
                    onBlur={handleSave}
                    disabled={!canEdit || isAggregateView || loading || dataLoadError || fetchingFact}
                    title="Введіть загальний факт — розподілиться по годинах (пропорційно плану)"
                    className="w-full min-w-0 rounded border border-amber-300 bg-white px-1.5 py-1 text-right text-xs font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
                  />
                </td>
                <td className={`px-1.5 py-1.5 text-right ${deviationCellClass(deviationPct(totals.factTo, totals.planTo))}`}>{formatPct(deviationPct(totals.factTo, totals.planTo))}</td>
                <td className="px-1.5 py-1.5 text-right">
                  <input
                    type="number"
                    value={totals.planGosti || ""}
                    onChange={(e) => handleTotalPlanChange("planGosti", e.target.value)}
                    onBlur={handleSave}
                    disabled={!canEdit || isAggregateView || loading || dataLoadError || fetchingFact}
                    title="Введіть загальний план — розподілиться по годинах автоматично"
                    className="w-full min-w-0 rounded border border-amber-300 bg-white px-1.5 py-1 text-right text-xs font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
                  />
                </td>
                <td className="px-1.5 py-1.5 text-right">
                  <input
                    type="number"
                    value={totals.factGosti ?? ""}
                    onChange={(e) => handleTotalFactChange("factGosti", e.target.value)}
                    onBlur={handleSave}
                    disabled={!canEdit || isAggregateView || loading || dataLoadError || fetchingFact}
                    title="Введіть загальний факт — розподілиться по годинах (пропорційно плану)"
                    className="w-full min-w-0 rounded border border-amber-300 bg-white px-1.5 py-1 text-right text-xs font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
                  />
                </td>
                <td className={`px-1.5 py-1.5 text-right ${deviationCellClass(deviationPct(totals.factGosti, totals.planGosti))}`}>{formatPct(deviationPct(totals.factGosti, totals.planGosti))}</td>
                <td className="px-1.5 py-1.5 text-right">
                  <input
                    type="number"
                    value={averageCheck(totals.planTo, totals.planGosti) || ""}
                    onChange={(e) => handleTotalPlanAvgCheckChange(e.target.value)}
                    onBlur={handleSave}
                    disabled={!canEdit || isAggregateView || loading || dataLoadError || fetchingFact}
                    title="Введіть плановий сер. чек — план ТО перерахується та розподілиться по годинах"
                    className="w-full min-w-0 rounded border border-amber-300 bg-white px-1.5 py-1 text-right text-xs font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
                  />
                </td>
                <td className="px-1.5 py-1.5 text-right">{formatNumber(factAverageCheck(totals))}</td>
                <td className={`px-1.5 py-1.5 text-right ${deviationCellClass(deviationPct(factAverageCheck(totals), averageCheck(totals.planTo, totals.planGosti)))}`}>{formatPct(deviationPct(factAverageCheck(totals), averageCheck(totals.planTo, totals.planGosti)))}</td>
                <td className="px-1.5 py-1.5"></td>
              </tr>
              {tableHours.map((hour) => {
                const row = tableHourlyData[hour] || emptyHourRow();
                const planTo = toNumber(row.planTo);
                const factTo = toNumber(row.factTo);
                const planGosti = toNumber(row.planGosti);
                const factGosti = toNumber(row.factGosti);
                const planCheck = averageCheck(planTo, planGosti);
                const factCheck = factAverageCheck(row);
                // % рахуємо по цій самій годині (факт/план цієї години), без накопичення.
                const toPct = deviationPct(row.factTo == null || row.factTo === "" ? null : factTo, planTo);
                const gostiPct = deviationPct(row.factGosti == null || row.factGosti === "" ? null : factGosti, planGosti);
                const checkPct = deviationPct(factCheck, planCheck);
                const cellInput = (field) => (
                  <td key={field} className="px-1 py-1 text-right">
                    <input
                      type="number"
                      value={row[field] ?? ""}
                      onChange={(e) => handleFieldChange(hour, field, e.target.value)}
                      onBlur={handleSave}
                      disabled={!canEdit || isAggregateView || loading || dataLoadError || fetchingFact}
                      className="w-full min-w-0 rounded border border-slate-200 bg-white px-1.5 py-1 text-right text-xs text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
                    />
                  </td>
                );
                return (
                  <tr key={hour} className="border-t border-slate-200">
                    <td className="px-2 py-1 font-medium text-slate-700">{formatHourRange(hour)}</td>
                    {cellInput("planTo")}
                    {cellInput("factTo")}
                    <td className={`px-1 py-1 text-right ${deviationCellClass(toPct)}`}>{formatPct(toPct)}</td>
                    {cellInput("planGosti")}
                    {cellInput("factGosti")}
                    <td className={`px-1 py-1 text-right ${deviationCellClass(gostiPct)}`}>{formatPct(gostiPct)}</td>
                    <td className="px-1.5 py-1 text-right text-slate-600">{formatNumber(planCheck)}</td>
                    <td className="px-1.5 py-1 text-right text-slate-600">{formatNumber(factCheck)}</td>
                    <td className={`px-1 py-1 text-right ${deviationCellClass(checkPct)}`}>{formatPct(checkPct)}</td>
                    <td className="px-1 py-1 text-center">
                      {/* Поле для майбутньої синхронізації з погодним API */}
                      <input
                        type="text"
                        value={row.weather}
                        onChange={(e) => handleFieldChange(hour, "weather", e.target.value)}
                        onBlur={handleSave}
                        disabled={!canEdit || isAggregateView || loading || dataLoadError || fetchingFact}
                        placeholder="—"
                        className="w-full min-w-0 rounded border border-slate-200 bg-white px-1.5 py-1 text-center text-xs text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {monthlyModalOpen && (
        <MonthlyPlanModal
          key={selectedRestaurantId}
          open={monthlyModalOpen}
          onClose={() => { if (!monthlyGenerating) setMonthlyModalOpen(false); }}
          defaultMonth={date.slice(0, 7)}
          onGenerate={handleGenerateMonthlyPlan}
          generating={monthlyGenerating}
          status={monthlyStatus}
          history={monthlyHistory}
        />
      )}
    </div>
  );
}
