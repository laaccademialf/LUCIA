import { useEffect, useMemo, useState } from "react";
import DatePickerPopover from "./DatePickerPopover";
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
import { buildMonthlyPlan } from "../utils/salesPlanDistribution";
import { fetchKyivWeather, weatherLabel } from "../api/weatherApi";

// Погодинні рядки з 08:00 до 23:00 включно, як у паперовому шаблоні планування.
const HOURS = Array.from({ length: 16 }, (_, i) => `${String(i + 8).padStart(2, "0")}:00:00`);

const FIELDS = ["planTo", "factTo", "planGosti", "factGosti"];

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
  if (!from || !to) return HOURS;

  const [openHour] = from.split(":").map(Number);
  const [closeHour, closeMinute] = to.split(":").map(Number);
  if (!Number.isFinite(openHour) || !Number.isFinite(closeHour)) return HOURS;
  if (closeHour <= openHour && !(closeMinute > 0)) return HOURS; // цілодобово або некоректний графік — показуємо всі години

  // Рядок з міткою "hh:00" відображає годину роботи, що завершується о цій годині,
  // тож перший рядок — це openHour+1 (перша повна робоча година), а останній — closeHour.
  const lastHour = closeHour;
  return HOURS.filter((hour) => {
    const hh = Number(hour.split(":")[0]);
    return hh > openHour && hh <= lastHour;
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

const toNumber = (value) => {
  const n = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const formatNumber = (value) => (value ? new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value) : "");
const averageCheck = (turnover, guests) => (guests > 0 ? Math.round(turnover / guests) : 0);
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
  const [status, setStatus] = useState("");
  const [servioMapping, setServioMapping] = useState({});
  const [fetchingFact, setFetchingFact] = useState(false);
  const [monthlyModalOpen, setMonthlyModalOpen] = useState(false);
  const [monthlyGenerating, setMonthlyGenerating] = useState(false);
  const [monthlyStatus, setMonthlyStatus] = useState("");
  const [viewMode, setViewMode] = useState("day"); // "day" | "week"
  const [weekData, setWeekData] = useState({}); // { iso: hoursObject }
  const [weekLoading, setWeekLoading] = useState(false);

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

  const currentRestaurant = restaurantOptions.find((r) => String(r.id) === selectedRestaurantId);
  const canEdit = Boolean(selectedRestaurantId) && (isAdmin || userRestaurantIds.includes(selectedRestaurantId));

  const visibleHours = useMemo(
    () => getVisibleHours(currentRestaurant?.schedule, date),
    [currentRestaurant?.schedule, date]
  );
  const dayKey = getDayKeyFromDate(date);
  const daySchedule = dayKey ? currentRestaurant?.schedule?.[dayKey] : null;
  const scheduleHint = daySchedule?.from && daySchedule?.to
    ? `Графік роботи на цей день: ${daySchedule.from}–${daySchedule.to}`
    : "Графік роботи закладу не налаштовано — показані всі години. Задайте його в Налаштування → Ресторани → Графік роботи.";

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!selectedRestaurantId || !date) return;
      setLoading(true);
      setStatus("");
      try {
        if (isCollectionsApiEnabled()) {
          const saved = await getCollectionItemApi("salesHourlyPlans", buildDocId(selectedRestaurantId, date)).catch(() => null);
          if (!cancelled) {
            const savedHours = saved?.hours && typeof saved.hours === "object" ? saved.hours : {};
            setHourlyData({ ...emptyHours(), ...savedHours });
          }
        } else if (!cancelled) {
          setHourlyData(emptyHours());
        }
      } catch (error) {
        if (!cancelled) setStatus(`Не вдалося завантажити дані: ${error?.message || error}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [selectedRestaurantId, date]);

  // Тижневий режим: вантажимо 7 днів (Пн–Нд) обраного тижня.
  const weekDates = useMemo(() => getWeekDates(date), [date]);
  useEffect(() => {
    if (viewMode !== "week" || !selectedRestaurantId) return;
    let cancelled = false;
    const load = async () => {
      setWeekLoading(true);
      try {
        if (!isCollectionsApiEnabled()) {
          if (!cancelled) setWeekData({});
          return;
        }
        const docs = await Promise.all(
          weekDates.map((iso) =>
            getCollectionItemApi("salesHourlyPlans", buildDocId(selectedRestaurantId, iso)).catch(() => null)
          )
        );
        if (cancelled) return;
        const next = {};
        weekDates.forEach((iso, i) => {
          const saved = docs[i];
          next[iso] = saved?.hours && typeof saved.hours === "object" ? saved.hours : {};
        });
        setWeekData(next);
      } finally {
        if (!cancelled) setWeekLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [viewMode, selectedRestaurantId, weekDates]);

  // Денні підсумки тижня (сума по робочих годинах кожного дня).
  const weekRows = useMemo(() => {
    return weekDates.map((iso) => {
      const hours = weekData[iso] || {};
      const dayHours = getVisibleHours(currentRestaurant?.schedule, iso);
      const acc = dayHours.reduce((a, hour) => {
        const row = hours[hour] || {};
        a.planTo += toNumber(row.planTo);
        a.factTo += toNumber(row.factTo);
        a.planGosti += toNumber(row.planGosti);
        a.factGosti += toNumber(row.factGosti);
        if (!a.weather && row.weather) a.weather = row.weather;
        return a;
      }, { planTo: 0, factTo: 0, planGosti: 0, factGosti: 0, weather: "" });
      const dow = (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
      return { iso, weekdayLabel: WEEKDAY_LABELS[dow], ...acc };
    });
  }, [weekDates, weekData, currentRestaurant?.schedule]);

  const weekTotals = useMemo(
    () => weekRows.reduce(
      (a, r) => {
        a.planTo += r.planTo; a.factTo += r.factTo; a.planGosti += r.planGosti; a.factGosti += r.factGosti;
        return a;
      },
      { planTo: 0, factTo: 0, planGosti: 0, factGosti: 0 }
    ),
    [weekRows]
  );

  const totals = useMemo(() => visibleHours.reduce((acc, hour) => {
    const row = hourlyData[hour] || emptyHourRow();
    acc.planTo += toNumber(row.planTo);
    acc.factTo += toNumber(row.factTo);
    acc.planGosti += toNumber(row.planGosti);
    acc.factGosti += toNumber(row.factGosti);
    return acc;
  }, { planTo: 0, factTo: 0, planGosti: 0, factGosti: 0 }), [hourlyData, visibleHours]);

  const handleFieldChange = (hour, field, value) => {
    setHourlyData((prev) => ({
      ...prev,
      [hour]: { ...(prev[hour] || emptyHourRow()), [field]: value },
    }));
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

  const handleSave = async () => {
    if (!canEdit) return;
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
      setStatus("Збережено");
    } catch (error) {
      setStatus(`Помилка збереження: ${error?.message || error}`);
    }
  };

  // Підтягує погодинний факт продажів безпосередньо з бази Servio за обрану дату.
  const handleFetchFactFromServio = async () => {
    if (!selectedRestaurantId) return;
    const restCode = String(servioMapping[String(selectedRestaurantId)] ?? "").trim();
    if (!restCode) {
      setStatus("Заклад не зіставлено з рестораном Servio. Налаштуйте відповідність у «Налаштуваннях продажів».");
      return;
    }
    setFetchingFact(true);
    setStatus("Завантаження факту з Servio...");
    try {
      const rows = await fetchServioSales({
        startDate: date,
        endDate: `${date} 23:59:59`,
        restCode,
      });
      const byHour = {};
      for (const row of rows) {
        // Рядок «hh:00» позначає годину, що завершується о hh — це HourTo із запиту.
        const key = `${String(row.hourTo).padStart(2, "0")}:00:00`;
        byHour[key] = {
          factTo: row.totalSales ? String(Math.round(row.totalSales)) : "",
          factGosti: row.guestCount ? String(row.guestCount) : "",
        };
      }
      setHourlyData((prev) => {
        const next = { ...prev };
        for (const hour of Object.keys(next)) {
          const fact = byHour[hour];
          next[hour] = {
            ...(next[hour] || emptyHourRow()),
            factTo: fact ? fact.factTo : "",
            factGosti: fact ? fact.factGosti : "",
          };
        }
        return next;
      });
      const matched = Object.keys(byHour).length;
      setStatus(matched ? `Факт завантажено (годин: ${matched}). Натисніть «Зберегти».` : "За цю дату Servio не повернув даних.");
    } catch (error) {
      setStatus(`Помилка завантаження факту: ${error?.message || error}`);
    } finally {
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
      const all = await listCollectionItemsApi("salesHourlyPlans").catch(() => []);
      const history = (Array.isArray(all) ? all : []).filter(
        (rec) => String(rec?.restaurantId || "") === String(selectedRestaurantId)
      );
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
        history,
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
        const currentDoc = await getCollectionItemApi("salesHourlyPlans", buildDocId(selectedRestaurantId, date)).catch(() => null);
        const savedHours = currentDoc?.hours && typeof currentDoc.hours === "object" ? currentDoc.hours : {};
        setHourlyData({ ...emptyHours(), ...savedHours });
      }
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Продажі — план / факт по годинах</h2>
          <p className="text-sm text-slate-600">{currentRestaurant?.name || "Оберіть заклад"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
              className={`px-3 py-2 text-sm font-semibold transition ${viewMode === "week" ? "bg-indigo-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              Тиждень
            </button>
          </div>
          {restaurantOptions.length > 1 && (
            <select
              value={selectedRestaurantId}
              onChange={(e) => setSelectedRestaurantId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {restaurantOptions.map((r) => (
                <option key={r.id} value={String(r.id)}>{r.name}</option>
              ))}
            </select>
          )}
          <DatePickerPopover value={date} onChange={setDate} />
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
          {viewMode === "day" && canEdit && isServioApiEnabled() && (
            <button
              type="button"
              onClick={handleFetchFactFromServio}
              disabled={fetchingFact || loading}
              title="Завантажити погодинний факт продажів безпосередньо з бази Servio"
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {fetchingFact ? "Завантаження..." : "Підтягнути факт із Servio"}
            </button>
          )}
          {viewMode === "day" && canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Зберегти
            </button>
          )}
        </div>
      </div>

      {status && <p className="mb-3 text-sm text-slate-600">{status}</p>}
      {viewMode === "day" && currentRestaurant && <p className="mb-3 text-sm text-slate-500">{scheduleHint}</p>}

      {restaurantOptions.length === 0 ? (
        <p className="text-sm text-slate-500">Немає закладів, доступних для перегляду.</p>
      ) : viewMode === "week" ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="font-semibold text-slate-700">
              Тиждень: {formatDayLabel(weekDates[0] || date)}–{formatDayLabel(weekDates[6] || date)}
            </span>
            {weekLoading && <span className="text-slate-500">Завантаження…</span>}
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">День</th>
                <th className="px-2 py-2 text-right">План ТО</th>
                <th className="px-2 py-2 text-right">Факт ТО</th>
                <th className="px-2 py-2 text-right">План Гості</th>
                <th className="px-2 py-2 text-right">Факт Гості</th>
                <th className="px-2 py-2 text-right">План Сер. чек</th>
                <th className="px-2 py-2 text-right">Факт Сер. чек</th>
                <th className="px-3 py-2 text-left">Погода</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-200 bg-amber-50 font-semibold">
                <td className="px-3 py-2">Тотал</td>
                <td className="px-2 py-2 text-right">{formatNumber(weekTotals.planTo)}</td>
                <td className="px-2 py-2 text-right">{formatNumber(weekTotals.factTo)}</td>
                <td className="px-2 py-2 text-right">{formatNumber(weekTotals.planGosti)}</td>
                <td className="px-2 py-2 text-right">{formatNumber(weekTotals.factGosti)}</td>
                <td className="px-2 py-2 text-right">{formatNumber(averageCheck(weekTotals.planTo, weekTotals.planGosti))}</td>
                <td className="px-2 py-2 text-right">{formatNumber(averageCheck(weekTotals.factTo, weekTotals.factGosti))}</td>
                <td className="px-3 py-2"></td>
              </tr>
              {weekRows.map((r) => (
                <tr
                  key={r.iso}
                  onClick={() => { setDate(r.iso); setViewMode("day"); }}
                  title="Відкрити день"
                  className={`cursor-pointer border-t border-slate-200 hover:bg-indigo-50 ${r.iso === date ? "bg-indigo-50/50" : ""}`}
                >
                  <td className="px-3 py-2 font-medium text-slate-700">
                    {r.weekdayLabel} · {formatDayLabel(r.iso)}
                  </td>
                  <td className="px-2 py-2 text-right">{formatNumber(r.planTo)}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(r.factTo)}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(r.planGosti)}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(r.factGosti)}</td>
                  <td className="px-2 py-2 text-right text-slate-600">{formatNumber(averageCheck(r.planTo, r.planGosti))}</td>
                  <td className="px-2 py-2 text-right text-slate-600">{formatNumber(averageCheck(r.factTo, r.factGosti))}</td>
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
              <col className="w-16" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[11%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-16" />
            </colgroup>
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-2 py-1.5 text-left"></th>
                <th className="px-1.5 py-1.5 text-right whitespace-normal leading-tight">План ТО</th>
                <th className="px-1.5 py-1.5 text-right whitespace-normal leading-tight">Факт ТО</th>
                <th className="px-1.5 py-1.5 text-right whitespace-normal leading-tight">План Гості</th>
                <th className="px-1.5 py-1.5 text-right whitespace-normal leading-tight">Факт Гості</th>
                <th className="px-1.5 py-1.5 text-right whitespace-normal leading-tight">План Сер. чек</th>
                <th className="px-1.5 py-1.5 text-right whitespace-normal leading-tight">Факт Сер. чек</th>
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
                    disabled={!canEdit}
                    title="Введіть загальний план — розподілиться по годинах автоматично"
                    className="w-full min-w-0 rounded border border-amber-300 bg-white px-1.5 py-1 text-right text-xs font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
                  />
                </td>
                <td className="px-1.5 py-1.5 text-right">{formatNumber(totals.factTo)}</td>
                <td className="px-1.5 py-1.5 text-right">
                  <input
                    type="number"
                    value={totals.planGosti || ""}
                    onChange={(e) => handleTotalPlanChange("planGosti", e.target.value)}
                    onBlur={handleSave}
                    disabled={!canEdit}
                    title="Введіть загальний план — розподілиться по годинах автоматично"
                    className="w-full min-w-0 rounded border border-amber-300 bg-white px-1.5 py-1 text-right text-xs font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
                  />
                </td>
                <td className="px-1.5 py-1.5 text-right">{formatNumber(totals.factGosti)}</td>
                <td className="px-1.5 py-1.5 text-right">
                  <input
                    type="number"
                    value={averageCheck(totals.planTo, totals.planGosti) || ""}
                    onChange={(e) => handleTotalPlanAvgCheckChange(e.target.value)}
                    onBlur={handleSave}
                    disabled={!canEdit}
                    title="Введіть плановий сер. чек — план ТО перерахується та розподілиться по годинах"
                    className="w-full min-w-0 rounded border border-amber-300 bg-white px-1.5 py-1 text-right text-xs font-semibold text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
                  />
                </td>
                <td className="px-1.5 py-1.5 text-right">{formatNumber(averageCheck(totals.factTo, totals.factGosti))}</td>
                <td className="px-1.5 py-1.5"></td>
              </tr>
              {visibleHours.map((hour) => {
                const row = hourlyData[hour] || emptyHourRow();
                const planCheck = averageCheck(toNumber(row.planTo), toNumber(row.planGosti));
                const factCheck = averageCheck(toNumber(row.factTo), toNumber(row.factGosti));
                return (
                  <tr key={hour} className="border-t border-slate-200">
                    <td className="px-2 py-1 font-medium text-slate-700">{hour}</td>
                    {FIELDS.map((field) => (
                      <td key={field} className="px-1 py-1 text-right">
                        <input
                          type="number"
                          value={row[field]}
                          onChange={(e) => handleFieldChange(hour, field, e.target.value)}
                          onBlur={handleSave}
                          disabled={!canEdit}
                          className="w-full min-w-0 rounded border border-slate-200 bg-white px-1.5 py-1 text-right text-xs text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
                        />
                      </td>
                    ))}
                    <td className="px-1.5 py-1 text-right text-slate-600">{formatNumber(planCheck)}</td>
                    <td className="px-1.5 py-1 text-right text-slate-600">{formatNumber(factCheck)}</td>
                    <td className="px-1 py-1 text-center">
                      {/* Поле для майбутньої синхронізації з погодним API */}
                      <input
                        type="text"
                        value={row.weather}
                        onChange={(e) => handleFieldChange(hour, "weather", e.target.value)}
                        onBlur={handleSave}
                        disabled={!canEdit}
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
        />
      )}
    </div>
  );
}
