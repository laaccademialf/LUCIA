import { useState, useEffect } from "react";
import ElectricityForm from "./ElectricityForm";
import {
  createCollectionItemApi,
  isCollectionsApiEnabled,
  listCollectionItemsApi,
} from "../api/collectionsApi";

const ElectricityTab = ({ user, restaurants, utilityMeters }) => {
  // Для адміна: вибір ресторану, для керуючого — його ресторан
  const [selectedRestaurant, setSelectedRestaurant] = useState("");
  const [electricityHistory, setElectricityHistory] = useState([]);
  const [status, setStatus] = useState("");
  const [localFallbackHistory, setLocalFallbackHistory] = useState([]);

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
    if (!restaurantId) {
      setStatus("Оберіть заклад перед збереженням показників.");
      return;
    }

    const restaurant = restaurants.find((item) => String(item?.id || "") === restaurantId);
    const payload = {
      restaurantId,
      restaurantName: String(restaurant?.name || ""),
      ...data,
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
      setStatus("Показники електроенергії збережено.");
    } catch (error) {
      setStatus(`Помилка збереження: ${error?.message || error}`);
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
      <ElectricityForm
        meters={electricityMeters.map(m => ({
          id: m.id,
          number: m.number,
          prevValue: resolvePrevValue(m),
        }))}
        history={filteredHistory}
        onSubmit={handleElectricitySubmit}
        responsible={user?.displayName || user?.fullName || ""}
      />
    </div>
  );
};

export default ElectricityTab;
