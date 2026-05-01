import * as XLSX from "xlsx";

const normalize = (value) => String(value || "").trim().toLowerCase();

const toNumber = (value, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(",", ".")
    .trim();
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const firstNonEmptyString = (...values) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
};

const findHeaderRowIndex = (rows = []) => {
  for (let i = 0; i < rows.length; i += 1) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    const text = row.map((cell) => normalize(cell)).join("|");
    const hasName = text.includes("номенклатура") || text.includes("назва") || text.includes("name");
    const hasCode = text.includes("код") || text.includes("1c");
    if (hasName || hasCode) return i;
  }
  return 0;
};

const isOneCPositionalHeader = (row = []) => {
  const safeRow = Array.isArray(row) ? row : [];
  const codeColumn = normalize(safeRow[1]);
  const nameColumn = normalize(safeRow[3]);
  const unitColumn = normalize(safeRow[5]);

  return codeColumn.includes("код")
    && (nameColumn.includes("номенклатур") || nameColumn.includes("назва") || nameColumn.includes("name"))
    && (unitColumn.includes("единиц") || unitColumn.includes("одиниц") || unitColumn.includes("unit"));
};

const parseOneCPositionalRows = (rows, headerRowIndex, restaurantData) => {
  const { restaurantId, restaurantName, restaurantRegNumber } = restaurantData;
  return rows
    .slice(headerRowIndex + 1)
    .map((row) => {
      const safeRow = Array.isArray(row) ? row : [];

      // 1C fixed layout: A-№, B-code1C, D-name, F-unit, G-price, H-quantity.
      const code1C = firstNonEmptyString(safeRow[1]);
      const name = firstNonEmptyString(safeRow[3]);
      const unit = firstNonEmptyString(safeRow[5]);
      const unitPrice = toNumber(safeRow[6], 0);
      const fileQuantity = toNumber(safeRow[7], 0);

      return {
        restaurantId,
        restaurantName,
        restaurantRegNumber,
        name,
        code1C,
        unit,
        unitPrice,
        fileQuantity,
        isActive: true,
      };
    })
    .filter((item) => item.name || item.code1C);
};

const parseHeaderMappedRows = (worksheet, headerRowIndex, restaurantData) => {
  const { restaurantId, restaurantName, restaurantRegNumber } = restaurantData;
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", range: headerRowIndex });

  return rows
    .map((row) => {
      const name = firstNonEmptyString(row["Назва"], row["Номенклатура"], row["Name"]);
      const code1C = firstNonEmptyString(
        row["Код 1С"],
        row["Код1С"],
        row["Code 1C"],
        row["1C Code"],
        row["Код"]
      );
      const unit = firstNonEmptyString(
        row["Одиниця"],
        row["Од. вим."],
        row["Unit"],
        row["Единица измерения"]
      );
      const unitPrice = toNumber(
        row["Ціна"] ?? row["Цена"] ?? row["Учетная цена"] ?? row["Price"],
        0
      );
      const fileQuantity = toNumber(
        row["Кількість"] ?? row["Количество"] ?? row["Количество (факт)"] ?? row["Qty"],
        0
      );

      return {
        restaurantId,
        restaurantName,
        restaurantRegNumber,
        name,
        code1C,
        unit,
        unitPrice,
        fileQuantity,
        isActive: true,
      };
    })
    .filter((item) => item.name || item.code1C);
};

export const importInventoryListFromExcel = (file, restaurant) => {
  const restaurantId = String(restaurant?.id || "").trim();
  const restaurantName = String(restaurant?.name || "").trim();
  const restaurantRegNumber = String(restaurant?.regNumber || "").trim();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.SheetNames?.[0];
        if (!firstSheet) {
          reject(new Error("Файл не містить аркушів"));
          return;
        }

        const worksheet = workbook.Sheets[firstSheet];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        const headerRowIndex = findHeaderRowIndex(rawRows);

        const restaurantData = {
          restaurantId,
          restaurantName,
          restaurantRegNumber,
        };

        const parsed = isOneCPositionalHeader(rawRows[headerRowIndex])
          ? parseOneCPositionalRows(rawRows, headerRowIndex, restaurantData)
          : parseHeaderMappedRows(worksheet, headerRowIndex, restaurantData);

        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Не вдалося прочитати файл"));
    reader.readAsArrayBuffer(file);
  });
};

export const downloadInventoryListTemplate = () => {
  const templateRows = [
    ["№", "Код", "", "Номенклатура", "", "Единица измерения", "Учетная цена", "Количество (факт)", "Колонка 1", "Колонка 2", "Колонка 3"],
    [1, "_00000000001", "", "Приклад товару", "", "кг", 0, 0, "", "", ""],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(templateRows);
  XLSX.utils.book_append_sheet(wb, ws, "Список_інвентаризації");
  XLSX.writeFile(wb, "inventory_list_1c_template.xlsx");
};
