import { bulkAdd } from "../firebase/firestore";

// Початкові дані для міграції
const initialRestaurants = [
  {
    regNumber: "001",
    name: "Ресторан А",
    address: "Вул. Хрещатик, 1",
    seatsTotal: "50",
    seatsSummer: "",
    seatsWinter: "",
    hasTerrace: false,
    areaTotal: "100",
    areaSummer: "",
    areaWinter: "",
    country: "Україна",
    region: "Київська",
    city: "Київ",
    street: "Хрещатик, 1",
    postalCode: "01001",
    notes: "",
    schedule: {
      mon: { from: "09:00", to: "22:00" },
      tue: { from: "09:00", to: "22:00" },
      wed: { from: "09:00", to: "22:00" },
      thu: { from: "09:00", to: "22:00" },
      fri: { from: "09:00", to: "22:00" },
      sat: { from: "10:00", to: "23:00" },
      sun: { from: "10:00", to: "23:00" },
    },
  },
  {
    regNumber: "002",
    name: "Ресторан Б",
    address: "Вул. Шевченка, 5",
    seatsTotal: "80",
    seatsSummer: "",
    seatsWinter: "",
    hasTerrace: false,
    areaTotal: "150",
    areaSummer: "",
    areaWinter: "",
    country: "Україна",
    region: "Львівська",
    city: "Львів",
    street: "Шевченка, 5",
    postalCode: "79000",
    notes: "",
    schedule: {
      mon: { from: "08:00", to: "21:00" },
      tue: { from: "08:00", to: "21:00" },
      wed: { from: "08:00", to: "21:00" },
      thu: { from: "08:00", to: "21:00" },
      fri: { from: "08:00", to: "21:00" },
      sat: { from: "09:00", to: "22:00" },
      sun: { from: "09:00", to: "22:00" },
    },
  },
];

/**
 * Міграція початкових даних до Firestore
 * Викликайте цю функцію один раз після налаштування Firebase
 */
export const migrateInitialData = async () => {
  try {
    console.log("🚀 Початок міграції даних...");
    
    // Міграція ресторанів
    console.log("📝 Додавання ресторанів...");
    const restaurantIds = await bulkAdd("restaurants", initialRestaurants);
    console.log(`✅ Додано ${restaurantIds.length} ресторанів`);
    
    // Тут можна додати міграцію активів, якщо потрібно
    // const assetIds = await bulkAdd("assets", mockAssets);
    
    console.log("✅ Міграція завершена успішно!");
    return { success: true, restaurantIds };
  } catch (error) {
    console.error("❌ Помилка міграції:", error);
    return { success: false, error };
  }
};

/**
 * Перевірка, чи є дані в Firestore
 */
export const checkDataExists = async () => {
  try {
    const { getRestaurants } = await import("../firebase/firestore");
    const restaurants = await getRestaurants();
    return restaurants.length > 0;
  } catch (error) {
    console.error("Помилка перевірки даних:", error);
    return false;
  }
};

// Експорт для використання в консолі браузера
if (typeof window !== "undefined") {
  window.migrateData = migrateInitialData;
  window.checkData = checkDataExists;
}
