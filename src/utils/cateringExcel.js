import * as XLSX from "xlsx";

const normalizeHeader = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/\s+/g, " ")
  .replace(/[^a-zа-яіїєґ0-9 ]/gi, "");

const getCellValue = (row, keys, fallbackIndex = null) => {
  for (const key of keys) {
    const normalizedKey = normalizeHeader(key);
    const matchKey = Object.keys(row || {}).find((candidate) => normalizeHeader(candidate) === normalizedKey);
    if (matchKey) return row[matchKey];
  }

  if (Number.isInteger(fallbackIndex) && fallbackIndex >= 0) {
    const columns = Object.keys(row || {});
    if (fallbackIndex < columns.length) {
      return row[columns[fallbackIndex]];
    }
  }

  return "";
};

const getRowsFromFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();

  reader.onload = (event) => {
    try {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheet = workbook.SheetNames?.[0];
      if (!firstSheet) {
        reject(new Error("Файл не містить аркушів"));
        return;
      }
      const worksheet = workbook.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      resolve(rows);
    } catch (error) {
      reject(error);
    }
  };

  reader.onerror = () => reject(new Error("Не вдалося прочитати файл"));
  reader.readAsArrayBuffer(file);
});

const writeWorkbook = (rows, fileName, sheetName) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}]);
  ws["!cols"] = Object.keys(rows[0] || rows[1] || {}).map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
};

const asText = (value) => String(value ?? "").trim();
const asMoney = (value) => {
  const normalized = Number(String(value ?? "").replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(normalized) ? normalized : 0;
};

export const exportCateringContactsToExcel = (contacts = [], filename = "catering_contacts.xlsx") => {
  const rows = (Array.isArray(contacts) ? contacts : []).map((item) => ({
    "Ім'я": asText(item.name),
    "Компанія": asText(item.company),
    "Промисловість / бізнес напрям": asText(item.industry),
    "Джерело ліда": asText(item.leadSource),
    "Адреса": asText(item.address),
    "Телефон": asText(item.phone),
    "Email": asText(item.email),
    "Закріплений менеджер за цим контактом": asText(item.assignedManager),
    "Нотатки": asText(item.notes),
  }));

  writeWorkbook(rows.length > 0 ? rows : [{ "Im'\u044f": "", "Компанія": "", "Промисловість / бізнес напрям": "", "Джерело ліда": "", "Адреса": "", "Телефон": "", "Email": "", "Закріплений менеджер за цим контактом": "", "Нотатки": "" }], filename, "Контакти");
};

export const downloadCateringContactsTemplate = (filename = "catering_contacts_template.xlsx") => {
  const rows = [
    {
      "Ім'я": "Іван Петренко",
      "Компанія": "ТОВ Приклад",
      "Промисловість / бізнес напрям": "Виробництво харчових продуктів",      "Джерело ліда": "Рекомендація",      "Адреса": "Київ, вул. Хрещатик, 10",
      "Телефон": "+380XXXXXXXXX",
      "Email": "name@example.com",
      "Закріплений менеджер за цим контактом": "Діша Андрій",
      "Нотатки": "Приклад контакту",
    },
  ];
  writeWorkbook(rows, filename, "Контакти");
};

export const importCateringContactsFromExcel = (file) =>
  getRowsFromFile(file).then((rows) =>
    rows
      .map((row) => ({
        name: asText(getCellValue(row, ["Ім'я", "Ім’я", "Name", "Контакт", "Контактна особа", "ПІБ"])),
        company: asText(getCellValue(row, ["Компанія", "Company", "Назва компанії", "Організація"])),
        industry: asText(getCellValue(row, ["Промисловість / бізнес напрям", "Промисловість", "Бізнес напрям", "Industry"])),        leadSource: asText(getCellValue(row, ["Джерело ліда", "Джерело", "Lead Source", "Source"])),        address: asText(getCellValue(row, ["Адреса", "Address", "Локація"])),
        phone: asText(getCellValue(row, ["Телефон", "Phone", "Мобільний"])),
        email: asText(getCellValue(row, ["Email", "E-mail", "Пошта"])),
        assignedManager: asText(getCellValue(row, ["Закріплений менеджер за цим контактом", "Закріплений менеджер", "Менеджер", "Manager"])),
        notes: asText(getCellValue(row, ["Нотатки", "Notes", "Коментар"])),
      }))
      .filter((item) => item.name || item.company || item.phone || item.email || item.address || item.industry)
  );

export const exportCateringAssortmentToExcel = (items = [], filename = "catering_assortment.xlsx") => {
  const rows = (Array.isArray(items) ? items : []).map((item) => ({
    "Категорія": asText(item.category),
    "Підкатегорія": asText(item.subcategory),
    "Назва продукту": asText(item.productName),
    "Вихід": asText(item.output),
    "Ціна": asMoney(item.unitPrice),
    "Собівартість": asMoney(item.costPrice),
  }));

  writeWorkbook(rows.length > 0 ? rows : [{ "Категорія": "", "Підкатегорія": "", "Назва продукту": "", "Вихід": "", "Ціна": "", "Собівартість": "" }], filename, "Асортимент");
};

export const downloadCateringAssortmentTemplate = (filename = "catering_assortment_template.xlsx") => {
  const rows = [
    {
      "Категорія": "Основне меню",
      "Підкатегорія": "Гарячі страви",
      "Назва продукту": "Запечена курка",
      "Вихід": "250 г",
      "Ціна": 180,
      "Собівартість": 95,
    },
  ];
  writeWorkbook(rows, filename, "Асортимент");
};

export const importCateringAssortmentFromExcel = (file) =>
  getRowsFromFile(file).then((rows) =>
    rows
      .map((row) => ({
        category: asText(getCellValue(row, ["Категорія", "Category", "Група"])),
        subcategory: asText(getCellValue(row, ["Підкатегорія", "Subcategory", "Підгрупа"])),
        productName: asText(getCellValue(row, ["Назва продукту", "Product name", "Назва", "Позиція"])),
        output: asText(getCellValue(row, ["Вихід", "Output", "Порція", "Вихід в грамах", "Выход в граммах"], 2)),
        unitPrice: asMoney(getCellValue(row, ["Ціна", "Unit price", "Продажна ціна"])),
        costPrice: asMoney(getCellValue(row, ["Собівартість", "Cost price", "Закупівельна ціна"])),
      }))
      .filter((item) => item.productName)
  );
