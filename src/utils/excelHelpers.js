import * as XLSX from "xlsx";

export const ASSET_IMPORT_FIELDS = [
  "invNumber",
  "invNumber1C",
  "name",
  "category",
  "subCategory",
  "type",
  "inventoryQuantity",
  "nextInventoryQuantity",
  "serialNumber",
  "brand",
  "businessUnit",
  "locationName",
  "zone",
  "respCenter",
  "respPerson",
  "status",
  "condition",
  "functionality",
  "relevance",
  "comment",
  "purchaseYear",
  "commissionDate",
  "normativeTerm",
  "physicalWear",
  "moralWear",
  "totalWear",
  "initialCost",
  "marketValueNew",
  "marketValueUsed",
  "residualValuePerUnit",
  "residualValue",
  "decision",
  "reason",
  "newLocation",
  "auditDate",
  "auditors",
];

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

export const exportAssetsToExcel = (assets, filename = "assets.xlsx") => {
  const rows = assets.map((asset) =>
    ASSET_IMPORT_FIELDS.reduce((acc, key) => {
      acc[key] = asset?.[key] ?? "";
      return acc;
    }, {})
  );

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [ASSET_IMPORT_FIELDS.reduce((acc, key) => ({ ...acc, [key]: "" }), {})]);
  ws["!cols"] = ASSET_IMPORT_FIELDS.map(() => ({ wch: 18 }));

  XLSX.utils.book_append_sheet(wb, ws, "Активи");
  XLSX.writeFile(wb, filename);
};

export const exportCustomRowsToExcel = (rows, filename = "assets.xlsx", sheetName = "Активи") => {
  const safeRows = Array.isArray(rows)
    ? rows
        .filter((row) => row && typeof row === "object")
        .map((row) => {
          const normalized = {};
          Object.entries(row).forEach(([key, value]) => {
            let nextValue = value;
            if (Array.isArray(nextValue)) {
              nextValue = nextValue.filter(Boolean).join(", ");
            } else if (nextValue && typeof nextValue === "object") {
              nextValue = JSON.stringify(nextValue);
            }
            normalized[key] = nextValue ?? "";
          });
          return normalized;
        })
    : [];

  const normalizedRows = safeRows.length > 0 ? safeRows : [{ "Дані": "" }];
  const headers = Object.keys(normalizedRows[0] || {});

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(normalizedRows, { header: headers });

  ws["!cols"] = headers.map((header) => {
    const maxContent = normalizedRows.reduce((maxLen, row) => {
      const length = String(row?.[header] ?? "").length;
      return Math.max(maxLen, length);
    }, header.length);
    return { wch: Math.min(40, Math.max(12, maxContent + 2)) };
  });

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
};

export const importAssetsFromExcel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        const assets = jsonData.map((row) =>
          ASSET_IMPORT_FIELDS.reduce((acc, key) => {
            acc[key] = row[key] ?? "";
            return acc;
          }, {})
        );

        resolve(assets);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

export const downloadAssetTemplate = () => {
  const sample = {
    invNumber: "A-0001",
    invNumber1C: "1C-0001",
    name: "Холодильник",
    category: "Кухня",
    subCategory: "Холодильне обладнання",
    type: "Обладнання",
    inventoryQuantity: "4",
    nextInventoryQuantity: "",
    serialNumber: "SN-001",
    brand: "SampleBrand",
    businessUnit: "Ресторан",
    locationName: "La Famiglia Kyiv",
    zone: "Кухня",
    respCenter: "Операційний відділ",
    respPerson: "Іван Іванов",
    status: "В експлуатації",
    condition: "Добрий",
    functionality: "Повна",
    relevance: "Актуальний",
    comment: "Приклад запису",
    purchaseYear: "2024",
    commissionDate: "2024-01-15",
    normativeTerm: "5",
    physicalWear: "10",
    moralWear: "5",
    totalWear: "15",
    initialCost: "50000",
    marketValueNew: "52000",
    marketValueUsed: "43000",
    residualValuePerUnit: "4250",
    residualValue: "42500",
    decision: "Залишити",
    reason: "Робочий стан",
    newLocation: "",
    auditDate: "2026-02-27",
    auditors: "Комісія",
  };

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([sample]);
  ws["!cols"] = ASSET_IMPORT_FIELDS.map(() => ({ wch: 18 }));

  XLSX.utils.book_append_sheet(wb, ws, "Активи");
  XLSX.writeFile(wb, "asset_template.xlsx");
};

export const exportTypicalAssetFieldsToExcel = (typicalFields = {}, filename = "asset_typical_fields.xlsx") => {
  const sections = [
    { key: "categories", title: "Категорії", sheet: "Категорії" },
    { key: "subcategories", title: "Підкатегорії", sheet: "Підкатегорії" },
    { key: "accountingTypes", title: "Типи обліку", sheet: "Типи обліку" },
    { key: "businessUnits", title: "Бізнес напрями", sheet: "Бізнес напрями" },
    { key: "statuses", title: "Статуси", sheet: "Статуси" },
    { key: "conditions", title: "Стан", sheet: "Стан" },
    { key: "decisions", title: "Рішення", sheet: "Рішення" },
    { key: "placementZones", title: "Зони розміщення", sheet: "Зони розміщення" },
    { key: "functionalities", title: "Працездатність", sheet: "Працездатність" },
    { key: "relevances", title: "Моральна актуальність", sheet: "Моральна акт-ть" },
    { key: "reasons", title: "Причини", sheet: "Причини" },
  ];

  const wb = XLSX.utils.book_new();

  const overviewRows = sections.map((section) => ({
    "Розділ": section.title,
    "Кількість": Array.isArray(typicalFields?.[section.key]) ? typicalFields[section.key].length : 0,
  }));

  const overviewSheet = XLSX.utils.json_to_sheet(overviewRows);
  overviewSheet["!cols"] = [{ wch: 30 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, overviewSheet, "Огляд");

  sections.forEach((section) => {
    const sourceItems = Array.isArray(typicalFields?.[section.key]) ? typicalFields[section.key] : [];

    const rows = sourceItems.map((item) => {
      const base = {
        "ID": String(item?.id || "").trim(),
        "Назва": String(item?.name || "").trim(),
      };

      if (section.key === "subcategories") {
        return {
          ...base,
          "ID категорії": String(item?.categoryId || item?.category_id || "").trim(),
          "Категорія": String(item?.categoryName || item?.category_name || "").trim(),
        };
      }

      return base;
    });

    const fallbackRow = section.key === "subcategories"
      ? [{ "ID": "", "Назва": "", "ID категорії": "", "Категорія": "" }]
      : [{ "ID": "", "Назва": "" }];

    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : fallbackRow);
    ws["!cols"] = section.key === "subcategories"
      ? [{ wch: 26 }, { wch: 38 }, { wch: 18 }, { wch: 30 }]
      : [{ wch: 26 }, { wch: 38 }];

    XLSX.utils.book_append_sheet(wb, ws, section.sheet);
  });

  XLSX.writeFile(wb, filename);
};
