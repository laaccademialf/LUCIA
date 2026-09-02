import { useEffect, useMemo, useState } from "react";
import DatePickerPopover from "./DatePickerPopover";
import {
  createCollectionItemApi,
  getCollectionItemApi,
  isCollectionsApiEnabled,
} from "../api/collectionsApi";

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

  // Годину закриття теж показуємо, щоб графік роботи повністю відображався у таблиці.
  const lastHour = closeHour;
  return HOURS.filter((hour) => {
    const hh = Number(hour.split(":")[0]);
    return hh >= openHour && hh <= lastHour;
  });
};

const toIsoDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const toNumber = (value) => {
  const n = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const formatNumber = (value) => (value ? new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value) : "");
const averageCheck = (turnover, guests) => (guests > 0 ? Math.round(turnover / guests) : 0);
const buildDocId = (restaurantId, date) => `${restaurantId}__${date}`;

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

  const isSettingsTab = /setting|налашт/.test(String(topTab || "").toLowerCase());

  if (isSettingsTab) {
    return (
      <div className="card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl">
        <h2 className="text-lg font-semibold">Налаштування продажів</h2>
        <p className="mt-2 text-sm text-slate-600">Розділ у розробці. План і факт по годинах вводяться на вкладці «Планування».</p>
      </div>
    );
  }

  return (
    <div className="card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Продажі — план / факт по годинах</h2>
          <p className="text-sm text-slate-600">{currentRestaurant?.name || "Оберіть заклад"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
      {currentRestaurant && <p className="mb-3 text-sm text-slate-500">{scheduleHint}</p>}

      {restaurantOptions.length === 0 ? (
        <p className="text-sm text-slate-500">Немає закладів, доступних для перегляду.</p>
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
                <td className="px-1.5 py-1.5 text-right">{formatNumber(totals.planTo)}</td>
                <td className="px-1.5 py-1.5 text-right">{formatNumber(totals.factTo)}</td>
                <td className="px-1.5 py-1.5 text-right">{formatNumber(totals.planGosti)}</td>
                <td className="px-1.5 py-1.5 text-right">{formatNumber(totals.factGosti)}</td>
                <td className="px-1.5 py-1.5 text-right">{formatNumber(averageCheck(totals.planTo, totals.planGosti))}</td>
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
    </div>
  );
}
