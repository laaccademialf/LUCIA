import * as XLSX from "xlsx";

const toNumber = (value) => {
  const normalized = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

/* ═══════════════  EXPORT MATRIX  ═══════════════ */

export const exportAssortmentMatrixToExcel = (
  items,
  specifications,
  typicalFields,
  filename = "assortment_matrix.xlsx"
) => {
  const matrixRows = (items || []).map((item, idx) => ({
    "№": idx + 1,
    "Назва": item.name || "",
    "Категорія": item.category || "",
    "Підкатегорія": item.subCategory || "",
    "Одиниця виміру": item.unit || "",
    "Постачальник": item.supplier || "",
    "Код 1С": item.code1C || "",
    "Ціна закупівлі": toNumber(item.purchasePrice),
    "Націнка %": toNumber(item.markup),
    "Ціна продажу": toNumber(item.salePrice),
    "Собівартість": toNumber(item.costPrice),
    "Мін. залишок": toNumber(item.minStock),
    "Макс. залишок": toNumber(item.maxStock),
    "Активний": item.isActive === false ? "Ні" : "Так",
    "Примітки": item.notes || "",
  }));

  const specsRows = (specifications || []).map((spec, idx) => ({
    "№": idx + 1,
    "Назва страви": spec.dishName || "",
    "Категорія": spec.category || "",
    "Інгредієнт": spec.ingredientName || "",
    "Кількість": toNumber(spec.qty),
    "Одиниця": spec.unit || "",
    "Вихід порції (г)": toNumber(spec.portionOutput),
    "Собівартість порції": toNumber(spec.portionCost),
    "Примітки": spec.notes || "",
  }));

  const fieldsRows = (typicalFields || []).map((field, idx) => ({
    "№": idx + 1,
    "Назва поля": field.name || "",
    "Тип": field.type || "",
    "Значення за замовчуванням": field.defaultValue || "",
    "Обов'язкове": field.required ? "Так" : "Ні",
    "Опції": Array.isArray(field.options) ? field.options.join(", ") : (field.options || ""),
  }));

  const wb = XLSX.utils.book_new();

  const wsMatrix = XLSX.utils.json_to_sheet(
    matrixRows.length > 0 ? matrixRows : [{ "№": "", "Назва": "", "Категорія": "", "Підкатегорія": "", "Одиниця виміру": "", "Постачальник": "", "Код 1С": "", "Ціна закупівлі": "", "Націнка %": "", "Ціна продажу": "", "Собівартість": "", "Мін. залишок": "", "Макс. залишок": "", "Активний": "", "Примітки": "" }]
  );
  XLSX.utils.book_append_sheet(wb, wsMatrix, "Матриця");

  const wsSpecs = XLSX.utils.json_to_sheet(
    specsRows.length > 0 ? specsRows : [{ "№": "", "Назва страви": "", "Категорія": "", "Інгредієнт": "", "Кількість": "", "Одиниця": "", "Вихід порції (г)": "", "Собівартість порції": "", "Примітки": "" }]
  );
  XLSX.utils.book_append_sheet(wb, wsSpecs, "Специфікації");

  const wsFields = XLSX.utils.json_to_sheet(
    fieldsRows.length > 0 ? fieldsRows : [{ "№": "", "Назва поля": "", "Тип": "", "Значення за замовчуванням": "", "Обов'язкове": "", "Опції": "" }]
  );
  XLSX.utils.book_append_sheet(wb, wsFields, "Типові поля");

  XLSX.writeFile(wb, filename);
};

/* ═══════════════  IMPORT MATRIX  ═══════════════ */

export const importAssortmentMatrixFromExcel = (file) => {
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
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        const items = rows
          .map((row) => {
            const name = String(row["Назва"] || row["Name"] || row["Номенклатура"] || "").trim();
            if (!name) return null;

            return {
              name,
              category: String(row["Категорія"] || row["Category"] || "").trim(),
              subCategory: String(row["Підкатегорія"] || row["SubCategory"] || "").trim(),
              unit: String(row["Одиниця виміру"] || row["Одиниця"] || row["Unit"] || "").trim(),
              supplier: String(row["Постачальник"] || row["Supplier"] || "").trim(),
              code1C: String(row["Код 1С"] || row["Код"] || row["Code 1C"] || "").trim(),
              purchasePrice: toNumber(row["Ціна закупівлі"] || row["Purchase Price"] || 0),
              markup: toNumber(row["Націнка %"] || row["Markup"] || 0),
              salePrice: toNumber(row["Ціна продажу"] || row["Sale Price"] || 0),
              costPrice: toNumber(row["Собівартість"] || row["Cost Price"] || 0),
              minStock: toNumber(row["Мін. залишок"] || row["Min Stock"] || 0),
              maxStock: toNumber(row["Макс. залишок"] || row["Max Stock"] || 0),
              isActive: !(["ні", "no", "false", "0"].includes(
                String(row["Активний"] || row["Active"] || "Так").trim().toLowerCase()
              )),
              notes: String(row["Примітки"] || row["Notes"] || "").trim(),
            };
          })
          .filter(Boolean);

        resolve(items);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Не вдалося прочитати файл"));
    reader.readAsArrayBuffer(file);
  });
};

/* ═══════════════  IMPORT SPECIFICATIONS  ═══════════════ */

export const importAssortmentSpecsFromExcel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: "array" });

        const sheetName = workbook.SheetNames.find((n) =>
          n.toLowerCase().includes("специфік") || n.toLowerCase().includes("spec")
        ) || workbook.SheetNames[0];

        if (!sheetName) {
          reject(new Error("Файл не містить аркушів"));
          return;
        }

        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        const specs = rows
          .map((row) => {
            const dishName = String(row["Назва страви"] || row["Dish"] || "").trim();
            const ingredientName = String(row["Інгредієнт"] || row["Ingredient"] || "").trim();
            if (!dishName && !ingredientName) return null;

            return {
              dishName,
              category: String(row["Категорія"] || row["Category"] || "").trim(),
              ingredientName,
              qty: toNumber(row["Кількість"] || row["Qty"] || 0),
              unit: String(row["Одиниця"] || row["Unit"] || "").trim(),
              portionOutput: toNumber(row["Вихід порції (г)"] || row["Portion Output"] || 0),
              portionCost: toNumber(row["Собівартість порції"] || row["Portion Cost"] || 0),
              notes: String(row["Примітки"] || row["Notes"] || "").trim(),
            };
          })
          .filter(Boolean);

        resolve(specs);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Не вдалося прочитати файл"));
    reader.readAsArrayBuffer(file);
  });
};

/* ═══════════════  TEMPLATE  ═══════════════ */

export const downloadAssortmentMatrixTemplate = () => {
  const matrixRows = [{
    "Назва": "",
    "Категорія": "",
    "Підкатегорія": "",
    "Одиниця виміру": "",
    "Постачальник": "",
    "Код 1С": "",
    "Ціна закупівлі": "",
    "Націнка %": "",
    "Ціна продажу": "",
    "Собівартість": "",
    "Мін. залишок": "",
    "Макс. залишок": "",
    "Активний": "Так",
    "Примітки": "",
  }];

  const specsRows = [{
    "Назва страви": "",
    "Категорія": "",
    "Інгредієнт": "",
    "Кількість": "",
    "Одиниця": "",
    "Вихід порції (г)": "",
    "Собівартість порції": "",
    "Примітки": "",
  }];

  const wb = XLSX.utils.book_new();
  const wsMatrix = XLSX.utils.json_to_sheet(matrixRows);
  XLSX.utils.book_append_sheet(wb, wsMatrix, "Матриця");
  const wsSpecs = XLSX.utils.json_to_sheet(specsRows);
  XLSX.utils.book_append_sheet(wb, wsSpecs, "Специфікації");
  XLSX.writeFile(wb, "assortment_matrix_template.xlsx");
};
