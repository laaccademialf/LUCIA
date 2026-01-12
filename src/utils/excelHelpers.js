import * as XLSX from "xlsx";

/**
 * Експорт ресторанів у Excel файл
 * @param {Array} restaurants - Масив ресторанів
 * @param {string} filename - Назва файлу
 */
export const exportRestaurantsToExcel = (restaurants, filename = "restaurants.xlsx") => {
  // Підготовка даних для експорту
  const data = restaurants.map((restaurant) => ({
    "Обліковий номер": restaurant.regNumber || "",
    "Назва": restaurant.name || "",
    "Країна": restaurant.country || "",
    "Область": restaurant.region || "",
    "Місто/Село": restaurant.city || "",
    "Вулиця": restaurant.street || "",
    "Поштовий індекс": restaurant.postalCode || "",
    "Загальна площа (м²)": restaurant.areaTotal || "",
    "Площа літня (м²)": restaurant.areaSummer || "",
    "Площа зимова (м²)": restaurant.areaWinter || "",
    "Місць загалом": restaurant.seatsTotal || "",
    "Місць літо": restaurant.seatsSummer || "",
    "Місць зима": restaurant.seatsWinter || "",
    "Є тераса": restaurant.hasTerrace ? "Так" : "Ні",
    "Понеділок з": restaurant.schedule?.mon?.from || "",
    "Понеділок до": restaurant.schedule?.mon?.to || "",
    "Вівторок з": restaurant.schedule?.tue?.from || "",
    "Вівторок до": restaurant.schedule?.tue?.to || "",
    "Середа з": restaurant.schedule?.wed?.from || "",
    "Середа до": restaurant.schedule?.wed?.to || "",
    "Четвер з": restaurant.schedule?.thu?.from || "",
    "Четвер до": restaurant.schedule?.thu?.to || "",
    "П'ятниця з": restaurant.schedule?.fri?.from || "",
    "П'ятниця до": restaurant.schedule?.fri?.to || "",
    "Субота з": restaurant.schedule?.sat?.from || "",
    "Субота до": restaurant.schedule?.sat?.to || "",
    "Неділя з": restaurant.schedule?.sun?.from || "",
    "Неділя до": restaurant.schedule?.sun?.to || "",
    "Нотатки": restaurant.notes || "",
  }));

  // Створення робочої книги
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);

  // Встановлення ширини колонок
  const columnWidths = [
    { wch: 15 }, // Обліковий номер
    { wch: 25 }, // Назва
    { wch: 15 }, // Країна
    { wch: 20 }, // Область
    { wch: 20 }, // Місто
    { wch: 30 }, // Вулиця
    { wch: 12 }, // Індекс
    { wch: 15 }, // Площа
    { wch: 15 }, // Площа літо
    { wch: 15 }, // Площа зима
    { wch: 12 }, // Місць всього
    { wch: 12 }, // Місць літо
    { wch: 12 }, // Місць зима
    { wch: 10 }, // Тераса
  ];
  ws["!cols"] = columnWidths;

  XLSX.utils.book_append_sheet(wb, ws, "Ресторани");

  // Збереження файлу
  XLSX.writeFile(wb, filename);
};

/**
 * Імпорт ресторанів з Excel файлу
 * @param {File} file - Excel файл
 * @returns {Promise<Array>} Масив ресторанів
 */
export const importRestaurantsFromExcel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });

        // Читання першого листа
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Конвертація в JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // Перетворення даних у формат для додатку
        const restaurants = jsonData.map((row) => ({
          regNumber: row["Обліковий номер"] || "",
          name: row["Назва"] || "",
          country: row["Країна"] || "",
          region: row["Область"] || "",
          city: row["Місто/Село"] || "",
          street: row["Вулиця"] || "",
          postalCode: row["Поштовий індекс"] || "",
          areaTotal: row["Загальна площа (м²)"] || "",
          areaSummer: row["Площа літня (м²)"] || "",
          areaWinter: row["Площа зимова (м²)"] || "",
          seatsTotal: row["Місць загалом"] || "",
          seatsSummer: row["Місць літо"] || "",
          seatsWinter: row["Місць зима"] || "",
          hasTerrace: row["Є тераса"] === "Так",
          schedule: {
            mon: {
              from: row["Понеділок з"] || "",
              to: row["Понеділок до"] || "",
            },
            tue: {
              from: row["Вівторок з"] || "",
              to: row["Вівторок до"] || "",
            },
            wed: {
              from: row["Середа з"] || "",
              to: row["Середа до"] || "",
            },
            thu: {
              from: row["Четвер з"] || "",
              to: row["Четвер до"] || "",
            },
            fri: {
              from: row["П'ятниця з"] || "",
              to: row["П'ятниця до"] || "",
            },
            sat: {
              from: row["Субота з"] || "",
              to: row["Субота до"] || "",
            },
            sun: {
              from: row["Неділя з"] || "",
              to: row["Неділя до"] || "",
            },
          },
          notes: row["Нотатки"] || "",
        }));

        resolve(restaurants);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Створення шаблону Excel для імпорту
 */
export const downloadRestaurantTemplate = () => {
  const template = [
    {
      "Обліковий номер": "001",
      "Назва": "Приклад ресторану",
      "Країна": "Україна",
      "Область": "Київська",
      "Місто/Село": "Київ",
      "Вулиця": "Хрещатик, 1",
      "Поштовий індекс": "01001",
      "Загальна площа (м²)": "100",
      "Площа літня (м²)": "30",
      "Площа зимова (м²)": "70",
      "Місць загалом": "50",
      "Місць літо": "20",
      "Місць зима": "30",
      "Є тераса": "Так",
      "Понеділок з": "09:00",
      "Понеділок до": "22:00",
      "Вівторок з": "09:00",
      "Вівторок до": "22:00",
      "Середа з": "09:00",
      "Середа до": "22:00",
      "Четвер з": "09:00",
      "Четвер до": "22:00",
      "П'ятниця з": "09:00",
      "П'ятниця до": "23:00",
      "Субота з": "10:00",
      "Субота до": "23:00",
      "Неділя з": "10:00",
      "Неділя до": "22:00",
      "Нотатки": "Приклад нотаток",
    },
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(template);

  // Встановлення ширини колонок
  const columnWidths = [
    { wch: 15 },
    { wch: 25 },
    { wch: 15 },
    { wch: 20 },
    { wch: 20 },
    { wch: 30 },
    { wch: 12 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
  ];
  ws["!cols"] = columnWidths;

  XLSX.utils.book_append_sheet(wb, ws, "Ресторани");
  XLSX.writeFile(wb, "restaurant_template.xlsx");
};
