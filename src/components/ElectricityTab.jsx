import { useState, useEffect } from "react";
import ElectricityForm from "./ElectricityForm";
import EnergoCenterMetersPanel from "./EnergoCenterMetersPanel";
import {
  createCollectionItemApi,
  deleteCollectionItemApi,
  getCollectionItemApi,
  isCollectionsApiEnabled,
  listCollectionItemsApi,
  updateCollectionItemApi,
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
  // Коефіцієнти трансформації лічильників поточного закладу: { [meterNumber]: number }.
  const [meterCoefficients, setMeterCoefficients] = useState({});

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
  const isAdmin = user?.role === "admin";

  // Завантаження коефіцієнтів трансформації лічильників для вибраного закладу.
  useEffect(() => {
    let cancelled = false;
    setMeterCoefficients({});
    const rid = String(currentRestaurantId || "").trim();
    if (!rid || !isCollectionsApiEnabled()) return;
    (async () => {
      try {
        const doc = await getCollectionItemApi("electricitySettings", rid);
        if (cancelled) return;
        const coeffs = doc && typeof doc.coefficients === "object" && doc.coefficients ? doc.coefficients : {};
        setMeterCoefficients(coeffs);
      } catch { /* налаштувань ще немає */ }
    })();
    return () => { cancelled = true; };
  }, [currentRestaurantId]);

  // Зміна коефіцієнта трансформації лічильника (лише адмін, лише для вибраного закладу).
  const handleCoefficientChange = async (meterNumber, rawValue) => {
    const rid = String(currentRestaurantId || "").trim();
    if (!rid) return;
    const num = Number(String(rawValue).replace(",", "."));
    const next = { ...meterCoefficients };
    if (!Number.isFinite(num) || num <= 0) {
      delete next[meterNumber];
    } else {
      next[meterNumber] = num;
    }
    setMeterCoefficients(next);
    try {
      if (isCollectionsApiEnabled()) {
        // createCollectionItemApi з явним id робить upsert (перезапис за id).
        await createCollectionItemApi("electricitySettings", {
          id: rid,
          restaurantId: rid,
          coefficients: next,
        });
      }
    } catch (error) {
      setStatus(`Не вдалося зберегти коефіцієнт: ${error?.message || error}`);
    }
  };

  // Ручна правка показника лічильника за дату (лише адмін). Зберігається як
  // readingOverride на відповідному запису; наступні показники перераховуються.
  const handleReadingOverride = async (recordId, meterNumber, rawValue) => {
    const rec = electricityHistory.find((r) => String(r?.id || "") === String(recordId));
    if (!rec) return;
    const value = String(rawValue).trim().replace(",", ".");
    const override = value === "" ? null : Number(value);
    const meters = (Array.isArray(rec.meters) ? rec.meters : []).map((m) => {
      const key = String(m?.meterNumber || m?.meterId || "");
      if (key !== meterNumber) return m;
      const nextMeter = { ...m };
      if (override === null || !Number.isFinite(override)) delete nextMeter.readingOverride;
      else nextMeter.readingOverride = override;
      return nextMeter;
    });
    const updated = { ...rec, meters };
    setElectricityHistory((prev) => prev.map((r) => (String(r?.id) === String(recordId) ? updated : r)));
    try {
      if (isCollectionsApiEnabled() && !String(recordId).startsWith("local_")) {
        await updateCollectionItemApi("electricityReadings", recordId, { meters });
      } else {
        setLocalFallbackHistory((prev) => prev.map((r) => (String(r?.id) === String(recordId) ? updated : r)));
      }
    } catch (error) {
      setStatus(`Не вдалося зберегти показник: ${error?.message || error}`);
    }
  };

  const energoEics = currentRestaurant
    ? String(currentRestaurant.vikSoftEics || "")
        .split(/[,\s;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const energoGeneratorEics = currentRestaurant
    ? String(currentRestaurant.vikSoftGeneratorEics || "")
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
    const targetDate = String(data?.date || reportDate || "").trim();

    // Пропускаємо оновлення, якщо за цю дату для цього ресторану запис вже існує.
    const skipIfExists = data?.skipIfExists !== false; // авто-оновлення передає true за замовчуванням
    // Нормалізуємо дату до YYYY-MM-DD (записи можуть зберігати ISO з часом).
    const normDate = (v) => {
      const s = String(v || "");
      return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 10) : s;
    };
    const targetDateNorm = normDate(targetDate);
    if (skipIfExists && restaurantId && targetDateNorm) {
      const already = electricityHistory.some((entry) =>
        String(entry?.restaurantId || "") === restaurantId &&
        normDate(entry?.date) === targetDateNorm
      );
      if (already) {
        setStatus(`Показники за ${targetDateNorm} вже є в історії — оновлення не потрібне.`);
        return;
      }
    }

    // Якщо форма не передала лічильники (немає налаштованих utilityMeters),
    // беремо рядки з EnergoCenter як показники.
    let meters = Array.isArray(data?.meters) ? data.meters.filter((m) => m && (m.currValue !== "" || m.consumption)) : [];
    if (meters.length === 0) {
      const rows = Array.isArray(data?.energoRows) && data.energoRows.length
        ? data.energoRows
        : (Array.isArray(energoData?.rows) ? energoData.rows : []);
      meters = rows
        .filter((row) => {
          const n = Number(row?.consumption);
          if (!Number.isFinite(n)) return false;
          // Генератор зберігаємо завжди (навіть 0 — його могли не вмикати).
          if (row?.isGenerator) return true;
          // Основні вводи — лише ненульові, щоб не засмічувати історію.
          return n !== 0;
        })
        .map((row, idx) => ({
          meterId: `energo:${row.point}|${row.direction}|${idx}`,
          meterNumber: `${row.point || ""} ${row.direction || ""}`.trim(),
          prevValue: "",
          currValue: row.consumption,
          consumption: row.consumption,
          source: row?.isGenerator ? "energocenter-generator" : "energocenter",
        }));
    }

    if (meters.length === 0) {
      setStatus("Немає даних для збереження. Отримайте показники EnergoCenter або введіть значення вручну.");
      return;
    }

    const payload = {
      restaurantId,
      restaurantName: String(restaurant?.name || ""),
      date: targetDate || reportDate,
      meters,
      responsible: data?.responsible || "",
      source: meters.some((m) => String(m.source || "").startsWith("energocenter")) ? "energocenter" : "manual",
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
    <div className="grid grid-cols-1 gap-3">
      <div className="sticky top-10 z-20 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {user?.role === "admin" ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm font-semibold text-slate-700">Заклад:</label>
              <select
                className="min-w-[16rem] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition [&>option]:bg-white [&>option]:text-slate-900"
                value={selectedRestaurant}
                onChange={e => setSelectedRestaurant(e.target.value)}
              >
                <option value="" className="bg-white text-slate-900">Всі ресторани</option>
                {restaurantOptions.map(r => (
                  <option key={r.id} value={r.id} className="bg-white text-slate-900">{r.name}</option>
                ))}
              </select>
            </div>
          ) : <div />}
          <EnergoCenterMetersPanel
            controlsOnly
            reportDate={reportDate}
            onReportDateChange={setReportDate}
            onDataChange={setEnergoData}
            eics={energoEics}
            generatorEics={energoGeneratorEics}
            saveLabel="Автоматичне оновлення"
            onSave={(payload) => handleElectricitySubmit({
              date: payload?.reportDate || reportDate,
              meters: [],
              energoRows: Array.isArray(payload?.data?.rows) ? payload.data.rows : (Array.isArray(payload?.rows) ? payload.rows : []),
              responsible: user?.displayName || user?.fullName || "",
              skipIfExists: true,
            })}
            canSave={!user || user.role !== "admin" || Boolean(currentRestaurantId)}
          />
        </div>
        {status && <p className="text-sm text-slate-600 mt-2">{status}</p>}
        {user?.role === "admin" && !currentRestaurantId && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
            Оберіть заклад, щоб завантажити показники з його облікового запису EnergoCenter.
          </p>
        )}
        {currentRestaurantId && energoEics.length === 0 && energoGeneratorEics.length === 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
            У картці закладу не задано ідентифікатори лічильників (eic:/idnode:/objref:). Додайте їх у «Управління ресторанами».
          </p>
        )}
      </div>
      {isAdmin && !currentRestaurantId ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-base font-semibold text-slate-700">Оберіть ресторан</p>
          <p className="mt-1 text-sm text-slate-500">Виберіть заклад угорі, щоб переглянути показники та історію.</p>
        </div>
      ) : (
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
          onDeleteHistory={isAdmin ? handleDeleteHistory : undefined}
          coefficients={meterCoefficients}
          canEditCoefficients={isAdmin && Boolean(currentRestaurantId)}
          canEditReadings={isAdmin}
          onCoefficientChange={handleCoefficientChange}
          onReadingOverride={handleReadingOverride}
        />
      )}
    </div>
  );
};

export default ElectricityTab;
