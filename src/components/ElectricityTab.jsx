import { useState, useEffect } from "react";
import ElectricityForm from "./ElectricityForm";

const ElectricityTab = ({ user, restaurants, utilityMeters }) => {
  // Для адміна: вибір ресторану, для керуючого — його ресторан
  const [selectedRestaurant, setSelectedRestaurant] = useState("");
  const [electricityHistory, setElectricityHistory] = useState([]);

  // Скидання вибору ресторану при зміні списку ресторанів
  useEffect(() => {
    setSelectedRestaurant("");
  }, [restaurants.length]);

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

  const handleElectricitySubmit = (data) => {
    // TODO: інтеграція з Firestore для історії
    alert("Збережено показники електроенергії: " + JSON.stringify(data));
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
            {restaurants.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      )}
      <ElectricityForm
        meters={electricityMeters.map(m => ({
          id: m.id,
          number: m.number,
          prevValue: m.prevValue || "",
        }))}
        history={electricityHistory}
        onSubmit={handleElectricitySubmit}
        responsible={user?.displayName || user?.fullName || ""}
      />
    </div>
  );
};

export default ElectricityTab;
