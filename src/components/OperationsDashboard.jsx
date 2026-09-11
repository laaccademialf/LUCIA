import { memo, useEffect, useMemo, useState } from "react";
import { BarChart3, TrendingDown, TrendingUp } from "lucide-react";
import DashboardGroupLabel from "./DashboardGroupLabel";
import { groupDashboardRows, visibleDashboardRows, indexDashboardSales, indexDashboardEnergy } from "../utils/dashboardData.js";
import DateRangePickerPopover from "./DateRangePickerPopover";
import { isCollectionsApiEnabled, listCollectionItemsApi } from "../api/collectionsApi.js";

// Погодинні рядки з 08:00 до 23:00 — узгоджено з таблицею плану/факту продажів (SalesPlanningModule).
const DASHBOARD_SALES_HOURS = Array.from({ length: 16 }, (_, i) => `${String(i + 8).padStart(2, "0")}:00:00`);
const DASHBOARD_DAY_KEYS_BY_INDEX = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const getDashboardDayKey = (isoDate) => {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return DASHBOARD_DAY_KEYS_BY_INDEX[parsed.getDay()];
};
// Годинний діапазон дашборду обмежується графіком роботи закладу на обраний день (Налаштування → Ресторани → Графік роботи).
const getDashboardScheduleHours = (schedule, isoDate) => {
  const dayKey = getDashboardDayKey(isoDate);
  const daySchedule = dayKey ? schedule?.[dayKey] : null;
  const from = daySchedule?.from;
  const to = daySchedule?.to;
  if (!from || !to) return DASHBOARD_SALES_HOURS;
  const [openHour] = from.split(":").map(Number);
  const [closeHour, closeMinute] = to.split(":").map(Number);
  if (!Number.isFinite(openHour) || !Number.isFinite(closeHour)) return DASHBOARD_SALES_HOURS;
  if (closeHour <= openHour && !(closeMinute > 0)) return DASHBOARD_SALES_HOURS; // цілодобово або некоректний графік
  return DASHBOARD_SALES_HOURS.filter((hour) => {
    const hh = Number(hour.split(":")[0]);
    return hh >= openHour && hh <= closeHour;
  });
};
// Перелік ISO-дат від fromIso до toIso включно (для сум за обраний період на дашборді).
const getDatesInRange = (fromIso, toIso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fromIso || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(toIso || ""))) return [];
  const dates = [];
  const cursor = new Date(`${fromIso}T00:00:00`);
  const end = new Date(`${toIso}T00:00:00`);
  let guard = 0;
  while (cursor <= end && guard < 3660) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return dates;
};

const intFormatter = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 });
const fmtKwh = (n) => `${decimalFormatter.format(Number(n || 0))} кВт·год`;
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
const fmtGrn = (n) => `${intFormatter.format(Number(n || 0))} грн`;
const fmtInt = (n) => intFormatter.format(Number(n || 0));
const salesPctTone = (pct) => {
  if (!Number.isFinite(pct)) return "";
  if (pct >= 0) return "bg-emerald-100";
  if (pct >= -5) return "bg-amber-100";
  if (pct >= -10) return "bg-rose-100";
  return "bg-rose-300";
};
const fmtPct = (pct) => {
  if (!Number.isFinite(pct)) return "н/д";
  const abs = Math.abs(pct);
  return `${pct > 0 ? "+" : pct < 0 ? "-" : ""}${abs.toFixed(1)}%`;
};
const ukMonthsGen = ["січень", "лютий", "березень", "квітень", "травень", "червень", "липень", "серпень", "вересень", "жовтень", "листопад", "грудень"];
const monthLabel = (iso, deltaYears = 0, deltaMonths = 0) => {
  const d = new Date(`${String(iso)}T00:00:00`);
  if (deltaYears) d.setFullYear(d.getFullYear() + deltaYears);
  if (deltaMonths) d.setMonth(d.getMonth() + deltaMonths);
  const name = ukMonthsGen[d.getMonth()] || "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${d.getFullYear()}`;
};
const metricVal = (obj, metric) => {
  if (!obj) return 0;
  if (metric === "gosti") return obj.gosti;
  if (metric === "check") return obj.gosti > 0 ? obj.to / obj.gosti : 0;
  return obj.to;
};
const fmtMetric = (val, metric) => (metric === "gosti" ? fmtInt(val) : fmtGrn(val));
const devPct = (forecastVal, refVal) => (Number(refVal) > 0 ? ((Number(forecastVal) - Number(refVal)) / Number(refVal)) * 100 : null);
const metricLabels = { to: "Оборот, грн", gosti: "Гості", check: "Середній чек" };
const salesMetricTabs = [
  { id: "to", label: "Оборот" },
  { id: "gosti", label: "Гості" },
  { id: "check", label: "Середній чек" },
];
const PlanFactBadge = ({ pct }) => {
  const isUp = Number.isFinite(pct) && pct > 0;
  const isDown = Number.isFinite(pct) && pct < 0;
  const toneClass = isUp
    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : isDown
      ? "text-rose-700 bg-rose-50 border-rose-200"
      : "text-slate-500 bg-slate-50 border-slate-200";
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-sm leading-none font-bold whitespace-nowrap sm:text-lg ${toneClass}`}>
      {isUp ? <TrendingUp size={14} className="sm:size-5" /> : isDown ? <TrendingDown size={14} className="sm:size-5" /> : null}
      {fmtPct(pct)}
    </span>
  );
};
const PlanFactTile = ({ title, plan, fact, pct, formatter, borderClass, bgClass, textClass }) => {
  const f = Number(fact || 0);
  const p = Number(plan || 0);
  const diff = f - p;
  const hasData = (fact != null || plan != null) && !(f === 0 && p === 0);
  const diffFormatted = hasData
    ? (diff > 0 ? `+${formatter(diff)}` : formatter(diff))
    : null;
  const diffColorClass = diff > 0
    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : diff < 0
      ? "text-rose-700 bg-rose-50 border-rose-200"
      : "text-slate-500 bg-slate-50 border-slate-200";

  return (
    <div className={`rounded-lg border ${borderClass} ${bgClass} p-2 shadow-sm sm:p-3`}>
      <p className={`text-sm font-bold leading-tight sm:text-lg ${textClass}`}>{title}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-base leading-none font-bold sm:text-2xl ${textClass}`}>{formatter(fact)}</p>
          <p className="mt-1.5 text-[10px] leading-none text-slate-500 sm:text-xs">План: {formatter(plan)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <PlanFactBadge pct={pct} />
          {diffFormatted && (
            <span className={`inline-flex items-center rounded-lg border px-2 py-1 text-sm leading-none font-bold whitespace-nowrap sm:text-lg ${diffColorClass}`}>
              {diffFormatted}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
const fmtDateUk = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso || "");
};
const fmtDateRangeUk = (fromIso, toIso) =>
  fromIso === toIso ? fmtDateUk(toIso) : `${fmtDateUk(fromIso)} – ${fmtDateUk(toIso)}`;
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

function OperationsDashboard({ restaurants, isAdmin, userId }) {
  // Фільтр закладу для дашборду утиліт ("" = всі доступні заклади).
  const [restaurantFilter, setDashboardRestaurantFilter] = useState("");
  // Фільтр періоду для дашборду утиліт (from/to порожні = вчора).
  const [dashboardDateFilter, setDashboardDateFilter] = useState({ from: "", to: "" });
  // Фільтр часу для плиток ТО/Гості/Сер.чек ("" = увесь робочий день за графіком).
  const [hourFilter, setDashboardHourFilter] = useState("");
  // Модальне вікно «Загальна інформація» по всіх закладах.
  const [showDashboardSummaryModal, setShowDashboardSummaryModal] = useState(false);
  // Модальне вікно «Зведені дані» продажів (ТО/Гості/Середній чек) по всіх закладах.
  const [showSalesSummaryModal, setShowSalesSummaryModal] = useState(false);
  // Обрана метрика прогнозного звіту: "to" | "gosti" | "check".
  const [salesSummaryMetric, setSalesSummaryMetric] = useState("to");
  // Показники електроенергії (для огляду системи на дашборді)
  const [electricityReadings, setElectricityReadings] = useState([]);
  // План/факт продажів по годинах (для плиток ТО/Гості/Сер.чек на дашборді)
  const [salesHourlyPlans, setSalesHourlyPlans] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expandedSalesGroups, setExpandedSalesGroups] = useState(() => new Set());
  const [expandedEnergyGroups, setExpandedEnergyGroups] = useState(() => new Set());
  const toggleGroup = (setExpanded, id) => setExpanded((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const dashboardRestaurantFilter = restaurants.some((r) => String(r.id) === restaurantFilter) ? restaurantFilter : "";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isCollectionsApiEnabled()) { setLoadingData(false); return; }
      const results = await Promise.allSettled([
        listCollectionItemsApi("electricityReadings"),
        listCollectionItemsApi("salesHourlyPlans"),
      ]);
      if (cancelled) return;
      const [energy, sales] = results;
      if (energy.status === "fulfilled") setElectricityReadings(energy.value);
      if (sales.status === "fulfilled") setSalesHourlyPlans(sales.value);
      setLoadError(results.filter((r) => r.status === "rejected").map((r) => r.reason?.message || String(r.reason)).join("; "));
      setLoadingData(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  const energyIndex = useMemo(() => indexDashboardEnergy(electricityReadings), [electricityReadings]);
  // Огляд спожитої електроенергії за обраний період (типово вчора, A+) по доступних закладах.
  const electricityOverview = useMemo(() => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterdayIso = y.toISOString().slice(0, 10);
    const isValidIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
    const pickedFrom = isValidIso(dashboardDateFilter?.from) ? String(dashboardDateFilter.from).trim() : "";
    const pickedTo = isValidIso(dashboardDateFilter?.to) ? String(dashboardDateFilter.to).trim() : "";
    const fromIso = pickedFrom || pickedTo || yesterdayIso;
    const toIso = pickedTo || pickedFrom || yesterdayIso;
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
      for (const rec of energyIndex.readingsByRestaurant.get(String(restaurantId)) || []) {
        const recIso = String(rec?.date || "").slice(0, 10);
        if (recIso < fromIso || recIso > toIso) continue;
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
      fromIso,
      toIso,
      isSingleDay: fromIso === toIso,
      isYesterday: fromIso === toIso && toIso === yesterdayIso,
      perRestaurantAll,
      perRestaurant,
      totalMains,
      totalGen,
      totalGenHours,
      total: totalMains + totalGen,
      multiRestaurant: perRestaurant.length > 1,
    };
  }, [energyIndex, restaurants, dashboardRestaurantFilter, dashboardDateFilter]);

  // Часовий діапазон для плиток ТО/Гості/Сер.чек — за графіком роботи обраного закладу на останній день обраного періоду.
  const dashboardScheduleHours = useMemo(() => {
    const targetRestaurantId = String(dashboardRestaurantFilter || "").trim();
    const scheduleRestaurant = targetRestaurantId
      ? restaurants.find((r) => String(r?.id || "") === targetRestaurantId)
      : null;
    return getDashboardScheduleHours(scheduleRestaurant?.schedule, electricityOverview.toIso);
  }, [restaurants, dashboardRestaurantFilter, electricityOverview.toIso]);

  const dashboardHourFilter = dashboardScheduleHours.includes(hourFilter) ? hourFilter : "";
  const salesPlansByRestaurantDate = useMemo(() => indexDashboardSales(salesHourlyPlans), [salesHourlyPlans]);

  // Огляд плану/факту продажів (ТО, гості, середній чек) за обрані заклад/період/час — сума по всіх днях періоду.
  const salesOverview = useMemo(() => {
    const targetDates = getDatesInRange(electricityOverview.fromIso, electricityOverview.toIso);
    const targetRestaurantId = String(dashboardRestaurantFilter || "").trim();
    const cutoffHour = dashboardHourFilter
      ? Number(String(dashboardHourFilter).split(":")[0])
      : null;

    const restaurantsToSum = targetRestaurantId
      ? restaurants.filter((r) => String(r?.id || "") === targetRestaurantId)
      : restaurants;

    const totals = { planTo: 0, factTo: 0, planGosti: 0, factGosti: 0 };
    const perRestaurant = [];
    for (const r of restaurantsToSum) {
      const rTotals = { planTo: 0, factTo: 0, planGosti: 0, factGosti: 0 };
      for (const targetIso of targetDates) {
        const hoursForRestaurant = getDashboardScheduleHours(r?.schedule, targetIso)
          .filter((hour) => cutoffHour === null || Number(hour.split(":")[0]) <= cutoffHour);
        const rec = salesPlansByRestaurantDate.get(`${r.id}__${targetIso}`);
        const hours = rec?.hours && typeof rec.hours === "object" ? rec.hours : {};
        for (const hour of hoursForRestaurant) {
          const row = hours[hour] || {};
          rTotals.planTo += Number(String(row.planTo ?? "").replace(",", ".")) || 0;
          rTotals.factTo += Number(String(row.factTo ?? "").replace(",", ".")) || 0;
          rTotals.planGosti += Number(String(row.planGosti ?? "").replace(",", ".")) || 0;
          rTotals.factGosti += Number(String(row.factGosti ?? "").replace(",", ".")) || 0;
        }
      }
      totals.planTo += rTotals.planTo;
      totals.factTo += rTotals.factTo;
      totals.planGosti += rTotals.planGosti;
      totals.factGosti += rTotals.factGosti;
      perRestaurant.push({
        id: r.id,
        name: r.name || r.regNumber || "—",
        ...rTotals,
        planCheck: rTotals.planGosti > 0 ? rTotals.planTo / rTotals.planGosti : 0,
        factCheck: rTotals.factGosti > 0 ? rTotals.factTo / rTotals.factGosti : 0,
      });
    }

    const planCheck = totals.planGosti > 0 ? totals.planTo / totals.planGosti : 0;
    const factCheck = totals.factGosti > 0 ? totals.factTo / totals.factGosti : 0;
    const pctVsPlan = (fact, plan) => (plan > 0 ? ((fact - plan) / plan) * 100 : null);

    return {
      ...totals,
      perRestaurant,
      planCheck,
      factCheck,
      pctTo: pctVsPlan(totals.factTo, totals.planTo),
      pctGosti: pctVsPlan(totals.factGosti, totals.planGosti),
      pctCheck: pctVsPlan(factCheck, planCheck),
    };
  }, [salesPlansByRestaurantDate, restaurants, dashboardRestaurantFilter, dashboardHourFilter, electricityOverview.fromIso, electricityOverview.toIso]);

  // Прогнозний звіт продажів за обраний період: факт минулого року (той самий місяць),
  // факт попереднього місяця, опер. план, прогноз і факт до поточної дати — по кожному закладу.
  const salesForecast = useMemo(() => {
    if (!showSalesSummaryModal) return null;
    const fromIso = electricityOverview.fromIso;
    const toIso = electricityOverview.toIso;
    const targetRestaurantId = String(dashboardRestaurantFilter || "").trim();
    const list = targetRestaurantId
      ? restaurants.filter((r) => String(r?.id || "") === targetRestaurantId)
      : restaurants;

    // Зсув ISO-дати на роки/місяці (для порівняльних періодів).
    const shift = (iso, { years = 0, months = 0 }) => {
      const d = new Date(`${iso}T00:00:00`);
      if (years) d.setFullYear(d.getFullYear() + years);
      if (months) d.setMonth(d.getMonth() + months);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${da}`;
    };

    const getMonthDates = (iso) => {
      const [year, month] = String(iso || "").slice(0, 7).split("-").map(Number);
      if (!year || !month) return [];
      const lastDay = new Date(year, month, 0).getDate();
      const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      return getDatesInRange(monthStart, monthEnd);
    };

    // Прогноз завжди охоплює весь місяць обраної дати, не лише поточний
    // dashboard-діапазон. Так факт до сьогодні доповнюється планом до кінця місяця.
    const curDates = getMonthDates(toIso);
    const pyDates = getMonthDates(shift(toIso, { years: -1 }));
    const pmDates = getMonthDates(shift(toIso, { months: -1 }));

    const recFor = (rid, iso) => salesPlansByRestaurantDate.get(`${rid}__${iso}`);

    // Сума метрики (план або факт) по днях діапазону для закладу.
    const sumMetric = (rid, dates, kind) => {
      let to = 0;
      let gosti = 0;
      for (const iso of dates) {
        const rec = recFor(rid, iso);
        to += rec?.totals[kind].to || 0;
        gosti += rec?.totals[kind].gosti || 0;
      }
      return { to, gosti };
    };

    // Дні з фактом (для «факт до дати» та визначення залишкових днів для прогнозу).
    const factByDay = (rid, dates) => {
      const out = [];
      for (const iso of dates) {
        const rec = recFor(rid, iso);
        const { to = 0, gosti = 0 } = rec?.totals.fact || {};
        if (to > 0 || gosti > 0) out.push({ iso, to, gosti });
      }
      return out;
    };

    const perRestaurant = list.map((r) => {
      const rid = r.id;
      const opPlan = sumMetric(rid, curDates, "plan");
      const py = sumMetric(rid, pyDates, "fact");
      const pm = sumMetric(rid, pmDates, "fact");
      const factDays = factByDay(rid, curDates);
      const factToDate = factDays.reduce(
        (a, b) => ({ to: a.to + b.to, gosti: a.gosti + b.gosti }),
        { to: 0, gosti: 0 }
      );
      const lastFactIso = factDays.length ? factDays[factDays.length - 1].iso : null;
      // Прогноз = факт до останнього дня з даними + план на дні, що залишилися.
      const remainingDates = curDates.filter((iso) => (lastFactIso ? iso > lastFactIso : true));
      const remPlan = sumMetric(rid, remainingDates, "plan");
      const forecast = { to: factToDate.to + remPlan.to, gosti: factToDate.gosti + remPlan.gosti };
      return { id: rid, name: r.name || r.regNumber || "—", opPlan, py, pm, factToDate, forecast, lastFactIso };
    });

    const acc = (sel) =>
      perRestaurant.reduce(
        (a, r) => ({ to: a.to + sel(r).to, gosti: a.gosti + sel(r).gosti }),
        { to: 0, gosti: 0 }
      );
    const total = {
      opPlan: acc((r) => r.opPlan),
      py: acc((r) => r.py),
      pm: acc((r) => r.pm),
      factToDate: acc((r) => r.factToDate),
      forecast: acc((r) => r.forecast),
    };
    const lastFactIso = perRestaurant.reduce(
      (mx, r) => (r.lastFactIso && (!mx || r.lastFactIso > mx) ? r.lastFactIso : mx),
      null
    );

    return { fromIso, toIso, perRestaurant, total, lastFactIso };
  }, [salesPlansByRestaurantDate, restaurants, dashboardRestaurantFilter, electricityOverview.fromIso, electricityOverview.toIso, showSalesSummaryModal]);

  const salesGroups = useMemo(() => groupDashboardRows(
    (salesForecast?.perRestaurant || []).filter((r) => [r.py, r.pm, r.opPlan, r.forecast, r.factToDate].some((v) => v.to !== 0 || v.gosti !== 0)),
    restaurants, "sales"
  ), [salesForecast, restaurants]);
  const energyGroups = useMemo(() => groupDashboardRows(
    electricityOverview.perRestaurantAll.filter((r) => r.mains !== 0 || r.gen !== 0 || r.genHours !== 0),
    restaurants, "energy"
  ), [electricityOverview, restaurants]);
  const salesRows = useMemo(() => visibleDashboardRows(salesGroups, expandedSalesGroups), [salesGroups, expandedSalesGroups]);
  const energyRows = useMemo(() => visibleDashboardRows(energyGroups, expandedEnergyGroups), [energyGroups, expandedEnergyGroups]);
  const ov = electricityOverview;
  const sv = salesOverview;

  // Прогнозний звіт продажів.
  const sf = salesForecast;

  const dashboardRestaurantOptions = Array.isArray(restaurants) ? restaurants : [];

  const showDashboardRestaurantSelector = isAdmin || dashboardRestaurantOptions.length > 1;

  const allTotalMains = (ov.perRestaurantAll || []).reduce((sum, row) => sum + Number(row?.mains || 0), 0);
  const allTotalGen = (ov.perRestaurantAll || []).reduce((sum, row) => sum + Number(row?.gen || 0), 0);
  const allTotalGenHours = (ov.perRestaurantAll || []).reduce((sum, row) => sum + Number(row?.genHours || 0), 0);

  const mainsByRestaurantDate = energyIndex.mainsByRestaurantDate;
  const rangeDates = useMemo(() => showDashboardSummaryModal ? getDatesInRange(ov.fromIso, ov.toIso) : [], [showDashboardSummaryModal, ov.fromIso, ov.toIso]);
  const numRangeDays = rangeDates.length || 1;
  const shiftDates = (dates, days) => dates.map((iso) => shiftIso(iso, days));
  const previousPeriodDates = shiftDates(rangeDates, -numRangeDays);
  const sameWeekdayPeriodDates = shiftDates(rangeDates, -7);
  const sameWeekday4PeriodsDates = [7, 14, 21, 28].map((d) => shiftDates(rangeDates, -d));
  const getRestaurantMainsForDate = (restaurantId, iso) => {
    const dateMap = mainsByRestaurantDate.get(String(restaurantId || ""));
    return Number(dateMap?.get(iso) || 0);
  };
  const getRestaurantMainsForDates = (restaurantId, dates) =>
    dates.reduce((sum, iso) => sum + getRestaurantMainsForDate(restaurantId, iso), 0);
  const getAllMainsForDates = (dates) => {
    let total = 0;
    for (const r of dashboardRestaurantOptions) {
      total += getRestaurantMainsForDates(r.id, dates);
    }
    return total;
  };
  const avgSameWeekday4 = (getter) => {
    const values = sameWeekday4PeriodsDates.map((dates) => Number(getter(dates) || 0)).filter((v) => Number.isFinite(v) && v > 0);
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  };
  const trendLabelPrev = ov.isSingleDay ? "До вчора" : "До попереднього періоду";
  const trendLabelWeek = ov.isSingleDay ? "До цього ж дня тижня" : "До того ж періоду тиждень тому";
  const trendLabelAvg4 = ov.isSingleDay ? "До середнього 4 останніх таких днів" : "До середнього 4 останніх таких періодів";

  const getTrendPackForRestaurant = (row) => {
    const current = Number(row?.mains || 0);
    const members = row?.isGroup ? row.children : [row];
    const sumDates = (dates) => members.reduce((sum, member) => sum + getRestaurantMainsForDates(member.id, dates), 0);
    const baselinePrevious = sumDates(previousPeriodDates);
    const baselineSameWeekday = sumDates(sameWeekdayPeriodDates);
    const baseline4Avg = avgSameWeekday4(sumDates);
    return {
      vsYesterday: pctDiff(current, baselinePrevious),
      vsSameWeekday: pctDiff(current, baselineSameWeekday),
      vs4Avg: pctDiff(current, baseline4Avg),
    };
  };
  const totalTrendPack = (() => {
    const current = allTotalMains;
    const baselinePrevious = getAllMainsForDates(previousPeriodDates);
    const baselineSameWeekday = getAllMainsForDates(sameWeekdayPeriodDates);
    const baseline4Avg = avgSameWeekday4((dates) => getAllMainsForDates(dates));
    return {
      vsYesterday: pctDiff(current, baselinePrevious),
      vsSameWeekday: pctDiff(current, baselineSameWeekday),
      vs4Avg: pctDiff(current, baseline4Avg),
    };
  })();

  return (
    <>
      {loadingData && <p role="status" className="mb-3 text-sm text-slate-500">Завантаження показників…</p>}
      {loadError && <p role="alert" className="mb-3 text-sm text-rose-600">Не вдалося завантажити частину показників: {loadError}</p>}
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-56">
              {showDashboardRestaurantSelector ? (
                <select
                  value={dashboardRestaurantFilter}
                  onChange={(e) => setDashboardRestaurantFilter(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
              <label className="text-xs font-semibold text-slate-600 whitespace-nowrap" htmlFor="dashboard-hour-filter">Час:</label>
              <select
                id="dashboard-hour-filter"
                value={dashboardHourFilter}
                onChange={(e) => setDashboardHourFilter(e.target.value)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                aria-label="Фільтр часу за графіком роботи"
              >
                <option value="">Увесь робочий день</option>
                {dashboardScheduleHours.map((hour) => (
                  <option key={hour} value={hour}>до {hour.slice(0, 5)}</option>
                ))}
              </select>
              <span className="text-[11px] text-slate-500 whitespace-nowrap">
                {dashboardScheduleHours.length
                  ? `Графік: ${dashboardScheduleHours[0].slice(0, 5)}–${dashboardScheduleHours[dashboardScheduleHours.length - 1].slice(0, 5)}`
                  : "Графік роботи не налаштовано"}
              </span>
            </div>
            <div className="shrink-0">
              <DateRangePickerPopover
                label=""
                from={dashboardDateFilter.from || ov.fromIso}
                to={dashboardDateFilter.to || ov.toIso}
                max={new Date().toISOString().slice(0, 10)}
                onChange={({ from, to }) => {
                  const fallback = (() => {
                    const d = new Date();
                    d.setDate(d.getDate() - 1);
                    return d.toISOString().slice(0, 10);
                  })();
                  const isDefault = from === fallback && to === fallback;
                  setDashboardDateFilter(isDefault ? { from: "", to: "" } : { from, to });
                }}
              />
            </div>
            <div className="shrink-0">
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

        {/* Блок «План / Факт продажів» — виділений окремою карткою з заголовком */}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-lg font-bold text-white">План / Факт продажів</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSalesSummaryModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-white"
                aria-label="Зведені дані"
                title="Зведені дані по всіх ресторанах"
              >
                <BarChart3 size={14} />
                Зведені дані
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
            <PlanFactTile
              title="ТО"
              plan={sv.planTo}
              fact={sv.factTo}
              pct={sv.pctTo}
              formatter={fmtGrn}
              borderClass="border-indigo-200"
              bgClass="bg-white"
              textClass="text-indigo-900"
            />
            <PlanFactTile
              title="Гості"
              plan={sv.planGosti}
              fact={sv.factGosti}
              pct={sv.pctGosti}
              formatter={(n) => intFormatter.format(Number(n || 0))}
              borderClass="border-fuchsia-200"
              bgClass="bg-white"
              textClass="text-fuchsia-900"
            />
            <PlanFactTile
              title="Середній чек"
              plan={sv.planCheck}
              fact={sv.factCheck}
              pct={sv.pctCheck}
              formatter={fmtGrn}
              borderClass="border-teal-200"
              bgClass="bg-white"
              textClass="text-teal-900"
            />
          </div>
        </div>

        {/* Загальний підсумок: «Спожито», «З генератора», «Годин роботи генератора» */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 shadow-sm sm:p-3">
            <p className="text-[10px] leading-tight font-semibold text-emerald-700 sm:text-xs">Спожито {ov.isYesterday ? "за вчора" : `за ${fmtDateRangeUk(ov.fromIso, ov.toIso)}`}</p>
            <p className="mt-0.5 text-base leading-none font-bold text-emerald-900 sm:text-2xl">{fmtKwh(ov.total)}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 shadow-sm sm:p-3">
            <p className="text-[10px] leading-tight font-semibold text-amber-700 sm:text-xs">З генератора {ov.isYesterday ? "за вчора" : `за ${fmtDateRangeUk(ov.fromIso, ov.toIso)}`}</p>
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
                <p className="text-sm text-slate-600">Період: {fmtDateRangeUk(ov.fromIso, ov.toIso)}</p>
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
              <div className="mb-3 flex gap-3 text-xs font-semibold text-indigo-700">
                <button type="button" onClick={() => setExpandedEnergyGroups(new Set(energyGroups.map((group) => group.id)))}>Розгорнути всі</button>
                <button type="button" onClick={() => setExpandedEnergyGroups(new Set())}>Згорнути всі</button>
              </div>
              <div className="hidden sm:block">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700">
                      <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Бізнес-напрям / ресторан</th>
                      <th className="border border-slate-200 px-3 py-2 text-right font-semibold">Спожито з мережі / тренд</th>
                      <th className="border border-slate-200 px-3 py-2 text-right font-semibold">Спожито з генератора</th>
                      <th className="border border-slate-200 px-3 py-2 text-right font-semibold">Години роботи генератора</th>
                    </tr>
                  </thead>
                  <tbody>
                    {energyRows.map((row) => {
                      const trend = getTrendPackForRestaurant(row);
                      return (
                      <tr key={row.id} className={row.isGroup ? "bg-indigo-50 font-semibold" : "odd:bg-white even:bg-slate-50"}>
                        <td className="border border-slate-200 px-3 py-2 text-slate-900"><DashboardGroupLabel row={row} expanded={expandedEnergyGroups} onToggle={(id) => toggleGroup(setExpandedEnergyGroups, id)} /></td>
                        <td className="border border-slate-200 px-3 py-2 text-right">
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                            <span className="text-right tabular-nums">{fmtKwh(row.mains)}</span>
                            <div className="flex flex-nowrap items-center justify-end gap-1 border-l border-slate-200 pl-2">
                              <TrendBadge pct={trend.vsYesterday} label={trendLabelPrev} />
                              <TrendBadge pct={trend.vsSameWeekday} label={trendLabelWeek} />
                              <TrendBadge pct={trend.vs4Avg} label={trendLabelAvg4} />
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
                            <TrendBadge pct={totalTrendPack.vsYesterday} label={trendLabelPrev} />
                            <TrendBadge pct={totalTrendPack.vsSameWeekday} label={trendLabelWeek} />
                            <TrendBadge pct={totalTrendPack.vs4Avg} label={trendLabelAvg4} />
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
                {energyRows.map((row) => {
                  const trend = getTrendPackForRestaurant(row);
                  return (
                  <div key={`m-${row.id}`} className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-sm font-bold text-slate-900"><DashboardGroupLabel row={row} expanded={expandedEnergyGroups} onToggle={(id) => toggleGroup(setExpandedEnergyGroups, id)} /></p>
                    <div className="mt-2 grid grid-cols-1 gap-1 text-xs">
                      <p className="flex items-center justify-between gap-3">
                        <span className="text-slate-600">Спожито з мережі</span>
                        <span className="font-semibold text-slate-900">{fmtKwh(row.mains)}</span>
                      </p>
                      <p className="flex items-center justify-between gap-3"><span className="text-slate-600">Спожито з генератора</span><span className="font-semibold text-slate-900">{fmtKwh(row.gen)}</span></p>
                      <p className="flex items-center justify-between gap-3"><span className="text-slate-600">Години роботи генератора</span><span className="font-semibold text-slate-900">{fmtHours(row.genHours)}</span></p>
                      <div className="mt-1 flex flex-wrap justify-end gap-1 border-t border-slate-100 pt-1">
                        <TrendBadge pct={trend.vsYesterday} label={trendLabelPrev} />
                        <TrendBadge pct={trend.vsSameWeekday} label={trendLabelWeek} />
                        <TrendBadge pct={trend.vs4Avg} label={trendLabelAvg4} />
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
                      <TrendBadge pct={totalTrendPack.vsYesterday} label={trendLabelPrev} />
                      <TrendBadge pct={totalTrendPack.vsSameWeekday} label={trendLabelWeek} />
                      <TrendBadge pct={totalTrendPack.vs4Avg} label={trendLabelAvg4} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {showSalesSummaryModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 p-2 sm:p-4">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Закрити"
            onClick={() => setShowSalesSummaryModal(false)}
          />
          <div className="relative z-10 mx-auto my-3 w-full max-w-6xl rounded-2xl border border-slate-200 bg-white shadow-2xl sm:my-6">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Прогноз продажів по закладах</h3>
                <p className="text-sm text-slate-600">
                  {metricLabels[salesSummaryMetric]} · Період: {fmtDateRangeUk(ov.fromIso, ov.toIso)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSalesSummaryModal(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Закрити
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 px-4 py-2">
              {salesMetricTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSalesSummaryMetric(tab.id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                    salesSummaryMetric === tab.id
                      ? "border-indigo-500 bg-indigo-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="px-3 py-3 sm:px-4">
              <div className="mb-3 flex gap-3 text-xs font-semibold text-indigo-700">
                <button type="button" onClick={() => setExpandedSalesGroups(new Set(salesGroups.map((group) => group.id)))}>Розгорнути всі</button>
                <button type="button" onClick={() => setExpandedSalesGroups(new Set())}>Згорнути всі</button>
              </div>
              {(() => {
                const metric = salesSummaryMetric;
                const lblPy = monthLabel(ov.toIso, -1);
                const lblPm = monthLabel(ov.toIso, 0, -1);
                const lblCur = monthLabel(ov.toIso);
                const factToLabel = sf.lastFactIso ? `Факт по ${fmtDateUk(sf.lastFactIso)} включно` : "Факт (поточний)";
                const rows = salesRows;
                const t = sf.total;
                const cell = (val) => fmtMetric(val, metric);
                const devCell = (fc, ref) => {
                  const p = devPct(fc, ref);
                  return { text: fmtPct(p), tone: salesPctTone(p) };
                };
                return (
                  <>
                    <div className="hidden overflow-x-auto lg:block">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700">
                            <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Бізнес-напрям / ресторан</th>
                            <th className="border border-slate-200 px-2 py-2 text-right font-semibold">Факт<br />{lblPy}</th>
                            <th className="border border-slate-200 px-2 py-2 text-right font-semibold">Факт<br />{lblPm}</th>
                            <th className="border border-slate-200 px-2 py-2 text-right font-semibold">Опер. план<br />{lblCur}</th>
                            <th className="border border-slate-200 bg-indigo-100 px-2 py-2 text-right font-semibold text-indigo-900">Прогноз<br />{lblCur}</th>
                            <th className="border border-slate-200 px-2 py-2 text-right font-semibold">% від<br />{lblPy}</th>
                            <th className="border border-slate-200 px-2 py-2 text-right font-semibold">% від<br />{lblPm}</th>
                            <th className="border border-slate-200 px-2 py-2 text-right font-semibold">% від<br />опер. плану</th>
                            <th className="border border-slate-200 px-2 py-2 text-right font-semibold">{factToLabel}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => {
                            const py = metricVal(r.py, metric);
                            const pm = metricVal(r.pm, metric);
                            const op = metricVal(r.opPlan, metric);
                            const fc = metricVal(r.forecast, metric);
                            const ftd = metricVal(r.factToDate, metric);
                            const dPy = devCell(fc, py);
                            const dPm = devCell(fc, pm);
                            const dOp = devCell(fc, op);
                            return (
                              <tr key={r.id} className={r.isGroup ? "bg-indigo-50 font-semibold" : "odd:bg-white even:bg-slate-50"}>
                                <td className="border border-slate-200 px-3 py-2 text-slate-900"><DashboardGroupLabel row={r} expanded={expandedSalesGroups} onToggle={(id) => toggleGroup(setExpandedSalesGroups, id)} /></td>
                                <td className="border border-slate-200 px-2 py-2 text-right tabular-nums text-slate-800">{cell(py)}</td>
                                <td className="border border-slate-200 px-2 py-2 text-right tabular-nums text-slate-800">{cell(pm)}</td>
                                <td className="border border-slate-200 px-2 py-2 text-right tabular-nums text-slate-800">{cell(op)}</td>
                                <td className="border border-slate-200 bg-indigo-50 px-2 py-2 text-right font-semibold tabular-nums text-indigo-900">{cell(fc)}</td>
                                <td className={`border border-slate-200 px-2 py-2 text-right tabular-nums ${dPy.tone}`}>{dPy.text}</td>
                                <td className={`border border-slate-200 px-2 py-2 text-right tabular-nums ${dPm.tone}`}>{dPm.text}</td>
                                <td className={`border border-slate-200 px-2 py-2 text-right tabular-nums ${dOp.tone}`}>{dOp.text}</td>
                                <td className="border border-slate-200 px-2 py-2 text-right tabular-nums text-slate-800">{cell(ftd)}</td>
                              </tr>
                            );
                          })}
                          {(() => {
                            const py = metricVal(t.py, metric);
                            const pm = metricVal(t.pm, metric);
                            const op = metricVal(t.opPlan, metric);
                            const fc = metricVal(t.forecast, metric);
                            const ftd = metricVal(t.factToDate, metric);
                            const dPy = devCell(fc, py);
                            const dPm = devCell(fc, pm);
                            const dOp = devCell(fc, op);
                            return (
                              <tr className="bg-indigo-100 font-bold text-indigo-900">
                                <td className="border border-slate-200 px-3 py-2">Разом</td>
                                <td className="border border-slate-200 px-2 py-2 text-right tabular-nums">{cell(py)}</td>
                                <td className="border border-slate-200 px-2 py-2 text-right tabular-nums">{cell(pm)}</td>
                                <td className="border border-slate-200 px-2 py-2 text-right tabular-nums">{cell(op)}</td>
                                <td className="border border-slate-200 bg-indigo-200 px-2 py-2 text-right tabular-nums">{cell(fc)}</td>
                                <td className={`border border-slate-200 px-2 py-2 text-right tabular-nums ${dPy.tone}`}>{dPy.text}</td>
                                <td className={`border border-slate-200 px-2 py-2 text-right tabular-nums ${dPm.tone}`}>{dPm.text}</td>
                                <td className={`border border-slate-200 px-2 py-2 text-right tabular-nums ${dOp.tone}`}>{dOp.text}</td>
                                <td className="border border-slate-200 px-2 py-2 text-right tabular-nums">{cell(ftd)}</td>
                              </tr>
                            );
                          })()}
                        </tbody>
                      </table>
                      <p className="mt-2 text-[11px] text-slate-500">
                        Прогноз = факт за дні з даними + опер. план на дні, що залишилися до кінця періоду.
                      </p>
                    </div>

                    <div className="space-y-2 lg:hidden">
                      {[...rows, { id: "__total__", name: "Разом", ...t, isTotal: true }].map((r) => {
                        const py = metricVal(r.py, metric);
                        const pm = metricVal(r.pm, metric);
                        const op = metricVal(r.opPlan, metric);
                        const fc = metricVal(r.forecast, metric);
                        const ftd = metricVal(r.factToDate, metric);
                        return (
                          <div key={`sf-${r.id}`} className={`rounded-xl border p-3 ${r.isTotal ? "border-indigo-200 bg-indigo-50" : "border-slate-200 bg-white"}`}>
                            <p className={`text-sm font-bold ${r.isTotal ? "text-indigo-900" : "text-slate-900"}`}><DashboardGroupLabel row={r} expanded={expandedSalesGroups} onToggle={(id) => toggleGroup(setExpandedSalesGroups, id)} /></p>
                            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                              <span className="text-slate-500">Факт {lblPy}</span>
                              <span className="text-right font-semibold tabular-nums text-slate-900">{cell(py)}</span>
                              <span className="text-slate-500">Факт {lblPm}</span>
                              <span className="text-right font-semibold tabular-nums text-slate-900">{cell(pm)}</span>
                              <span className="text-slate-500">Опер. план</span>
                              <span className="text-right font-semibold tabular-nums text-slate-900">{cell(op)}</span>
                              <span className="text-indigo-700">Прогноз {lblCur}</span>
                              <span className="text-right font-bold tabular-nums text-indigo-900">{cell(fc)}</span>
                              <span className="text-slate-500">{factToLabel}</span>
                              <span className="text-right font-semibold tabular-nums text-slate-900">{cell(ftd)}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-100 pt-2 text-[11px]">
                              <span className={`rounded px-1.5 py-0.5 font-semibold ${salesPctTone(devPct(fc, py))}`}>{lblPy}: {fmtPct(devPct(fc, py))}</span>
                              <span className={`rounded px-1.5 py-0.5 font-semibold ${salesPctTone(devPct(fc, pm))}`}>{lblPm}: {fmtPct(devPct(fc, pm))}</span>
                              <span className={`rounded px-1.5 py-0.5 font-semibold ${salesPctTone(devPct(fc, op))}`}>план: {fmtPct(devPct(fc, op))}</span>
                            </div>
                          </div>
                        );
                      })}
                      <p className="text-[11px] text-slate-500">
                        Прогноз = факт за дні з даними + опер. план на дні, що залишилися.
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default memo(OperationsDashboard);
