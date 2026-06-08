import { useState, useEffect } from "react";
import ElectricityForm from "./ElectricityForm";
import EnergoCenterMetersPanel from "./EnergoCenterMetersPanel";
import {
  createCollectionItemApi,
  deleteCollectionItemApi,
  isCollectionsApiEnabled,
  listCollectionItemsApi,
} from "../api/collectionsApi";

const ElectricityTab = ({ user, restaurants, utilityMeters }) => {
  // Для адміна: вибір ресторану, для керуючого — його ресторан
  const [selectedRestaurant, setSelectedRestaurant] = useState("");
  const [electricityHistory, setElectricityHistory] = useState([]);
  const [status, setStatus] = useState("");
  const [localFallbackHistory, setLocalFallbackHistory] = useState([]);
  const [reportDate, setReportDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [energoData, setEnergoData] = useState(null);

  // Скидання вибору ресторану при зміні списку ресторанів
  useEffect(() => {
    setSelectedRestaurant("");
  }, [restaurants.length]);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      if (!isCollectionsApiEnabled()) {
        if (!cancelled) {
          setElectricityHistory(localFallbackHistory);
        }
        return;
      }

      try {
        const readings = await listCollectionItemsApi("electricityReadings");
        const normalized = readings
          .map((item) => ({
            ...item,
            meters: Array.isArray(item?.meters) ? item.meters : [],
          }))
          .sort((a, b) => String(b?.date || b?.createdAt || "").localeCompare(String(a?.date || a?.createdAt || "")));

        if (!cancelled) {
          setElectricityHistory(normalized);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(`Не вдалося завантажити історію: ${error?.message || error}`);
        }
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [localFallbackHistory]);

  // Визначаємо список ресторанів для селектора
  const restaurantOptions = user?.role === "admin" ? restaurants : restaurants.filter(r => r.id === user?.restaurant);
  // Вибраний ресторан: для адміна — з селектора, для керуючого — його ресторан
  const currentRestaurantId = user?.role === "admin" ? selectedRestaurant : user?.restaurant;
  const currentRestaurant = restaurants.find((r) => String(r?.id || "") === String(currentRestaurantId || ""));
  const energoEics = currentRestaurant
    ? String(currentRestaurant.vikSoftEics || "")
        .split(/[,\s;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  // Фільтруємо лічильники електроенергії для поточного ресторану
  const electricityMeters = utilityMeters.filter(m => {
    if (m.utilityType !== "electricity") return false;
    if (!currentRestaurantId || currentRestaurantId === "") return true; // Всі ресторани
    return m.restaurantId === currentRestaurantId;
  });

  const resolvePrevValue = (meter) => {
    const meterId = String(meter?.id || "");
    const latest = electricityHistory.find((entry) =>
      Array.isArray(entry?.meters) && entry.meters.some((m) => String(m?.meterId || "") === meterId)
    );

    if (!latest) return meter?.prevValue || "";

    const latestMeter = latest.meters.find((m) => String(m?.meterId || "") === meterId);
    return String(latestMeter?.currValue || meter?.prevValue || "");
  };

  const filteredHistory = electricityHistory.filter((entry) => {
    if (!currentRestaurantId) return true;
    return String(entry?.restaurantId || "") === String(currentRestaurantId);
  });

  const handleElectricitySubmit = async (data) => {
    const restaurantId = String(currentRestaurantId || "").trim();
    const restaurant = restaurants.find((item) => String(item?.id || "") === restaurantId);

    // Якщо форма не передала лічильники (немає налаштованих utilityMeters),
    // беремо рядки з EnergoCenter як показники.
    let meters = Array.isArray(data?.meters) ? data.meters.filter((m) => m && (m.currValue !== "" || m.consumption)) : [];
    if (meters.length === 0) {
      const rows = Array.isArray(energoData?.rows) ? energoData.rows : [];
      meters = rows
        .filter((row) => {
          const n = Number(row?.consumption);
          return Number.isFinite(n) && n !== 0;
        })
        .map((row, idx) => ({
          meterId: `energo:${row.point}|${row.direction}|${idx}`,
          meterNumber: `${row.point || ""} ${row.direction || ""}`.trim(),
          prevValue: "",
          currValue: row.consumption,
          consumption: row.consumption,
          source: "energocenter",
        }));
    }

    if (meters.length === 0) {
      setStatus("Немає даних для збереження. Отримайте показники EnergoCenter або введіть значення вручну.");
      return;
    }

    const payload = {
      restaurantId,
      restaurantName: String(restaurant?.name || ""),
      date: data?.date || reportDate,
      meters,
      responsible: data?.responsible || "",
      source: meters.some((m) => m.source === "energocenter") ? "energocenter" : "manual",
      createdAt: new Date().toISOString(),
    };

    try {
      if (isCollectionsApiEnabled()) {
        const id = await createCollectionItemApi("electricityReadings", payload);
        setElectricityHistory((prev) => [{ id, ...payload }, ...prev]);
      } else {
        const id = `local_${Date.now()}`;
        setLocalFallbackHistory((prev) => [{ id, ...payload }, ...prev]);
      }
      setStatus(`Показники збережено за ${payload.date}.`);
    } catch (error) {
      setStatus(`Помилка збереження: ${error?.message || error}`);
    }
  };

  const handleDeleteHistory = async (id) => {
    if (!id) return;
    if (!window.confirm("Видалити запис із історії показників?")) return;
    try {
      if (isCollectionsApiEnabled() && !String(id).startsWith("local_")) {
        await deleteCollectionItemApi("electricityReadings", id);
        setElectricityHistory((prev) => prev.filter((row) => String(row?.id) !== String(id)));
      } else {
        setLocalFallbackHistory((prev) => prev.filter((row) => String(row?.id) !== String(id)));
      }
      setStatus("Запис видалено.");
    } catch (error) {
      setStatus(`Помилка видалення: ${error?.message || error}`);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      {user?.role === "admin" && (
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm font-semibold text-slate-700">Заклад:</label>
          <select
            className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
            value={selectedRestaurant}
            onChange={e => setSelectedRestaurant(e.target.value)}
          >
            <option value="">Всі ресторани</option>
            {restaurantOptions.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      )}
      {status && <p className="text-sm text-slate-600">{status}</p>}
      {user?.role === "admin" && !currentRestaurantId && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Оберіть заклад, щоб завантажити показники з його облікового запису EnergoCenter.
        </p>
      )}
      {currentRestaurantId && energoEics.length === 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          У картці закладу не задано EIC коди лічильників. Додайте їх у «Управління ресторанами».
        </p>
      )}
      <EnergoCenterMetersPanel
        reportDate={reportDate}
        onReportDateChange={setReportDate}
        onDataChange={setEnergoData}
        eics={energoEics}
        onSave={() => handleElectricitySubmit({
          date: reportDate,
          meters: [],
          responsible: user?.displayName || user?.fullName || "",
        })}
        canSave={!user || user.role !== "admin" || Boolean(currentRestaurantId)}
      />
      <ElectricityForm
        meters={electricityMeters.map(m => ({
          id: m.id,
          number: m.number,
          prevValue: resolvePrevValue(m),
        }))}
        history={filteredHistory}
        onSubmit={handleElectricitySubmit}
        responsible={user?.displayName || user?.fullName || ""}
        reportDate={reportDate}
        energoRows={Array.isArray(energoData?.rows) ? energoData.rows : []}
        onDeleteHistory={handleDeleteHistory}
      />
    </div>
  );
};

export default ElectricityTab;
