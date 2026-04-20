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
    "Назва": item.name || item.productName || "",
    "Категорія": item.category || "",
    "Одиниця виміру": item.measurementUnit || item.unit || "",
    "Одиниця продажу": item.saleUnit || item.unit || "",
    "Одиниця продажу порції": item.portionSaleUnit || "",
    "Об'єм пляшки, мл": toNumber(item.bottleVolumeMl),
    "Об'єм порції, мл": toNumber(item.portionVolumeMl),
    "Постачальник": item.supplier || "",
    "Код 1С": item.code1C || "",
    "ID продукції": item.specificationId || item.specification_id || item.specId || item.productId || item.product_id || "",
    "Заклади": Array.isArray(item.restaurantNames)
      ? item.restaurantNames.join(", ")
      : (Array.isArray(item.restaurantIds) ? item.restaurantIds.join(", ") : ""),
    "ID закладів": Array.isArray(item.restaurantIds) ? item.restaurantIds.join(", ") : "",
    "Ціна закупівлі": toNumber(item.purchasePrice),
    "Націнка пляшки %": toNumber(item.bottleMarkup ?? item.markup),
    "Ціна пляшки": toNumber(item.bottleSalePrice ?? item.salePrice),
    "Собівартість порції": toNumber(item.portionCostPrice ?? item.costPrice),
    "Націнка порції %": toNumber(item.portionMarkup),
    "Ціна порції": toNumber(item.portionSalePrice),
    "Активний": item.isActive === false ? "Ні" : "Так",
    "Примітки": item.notes || "",
  }));

  const specsRows = (specifications || []).map((spec, idx) => ({
    "№": idx + 1,
    "Назва продукції": spec.name || spec.productName || spec.dishName || spec.ingredientName || "",
    "Категорія": spec.category || "",
    "Одиниця виміру": spec.measurementUnit || spec.unit || "",
    "Одиниця продажу": spec.saleUnit || spec.unit || "",
    "Одиниця продажу порції": spec.portionSaleUnit || "",
    "Об'єм пляшки, мл": toNumber(spec.bottleVolumeMl),
    "Об'єм порції, мл": toNumber(spec.portionVolumeMl),
    "Постачальник": spec.supplier || "",
    "Код 1С": spec.code1C || spec.code_1c || "",
    "Ціна закупівлі": toNumber(spec.purchasePrice),
    "Націнка пляшки %": toNumber(spec.bottleMarkup ?? spec.markup),
    "Ціна пляшки": toNumber(spec.bottleSalePrice ?? spec.salePrice),
    "Собівартість порції": toNumber(spec.portionCostPrice ?? spec.costPrice ?? spec.portionCost),
    "Націнка порції %": toNumber(spec.portionMarkup),
    "Ціна порції": toNumber(spec.portionSalePrice),
    "Активний": spec.isActive === false ? "Ні" : "Так",
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
    matrixRows.length > 0 ? matrixRows : [{ "№": "", "Назва": "", "Категорія": "", "Одиниця виміру": "", "Одиниця продажу": "", "Одиниця продажу порції": "", "Об'єм пляшки, мл": "", "Об'єм порції, мл": "", "Постачальник": "", "Код 1С": "", "ID продукції": "", "Заклади": "", "ID закладів": "", "Ціна закупівлі": "", "Націнка пляшки %": "", "Ціна пляшки": "", "Собівартість порції": "", "Націнка порції %": "", "Ціна порції": "", "Активний": "", "Примітки": "" }]
  );
  XLSX.utils.book_append_sheet(wb, wsMatrix, "Матриця");

  const wsSpecs = XLSX.utils.json_to_sheet(
    specsRows.length > 0 ? specsRows : [{ "№": "", "Назва продукції": "", "Категорія": "", "Одиниця виміру": "", "Одиниця продажу": "", "Одиниця продажу порції": "", "Об'єм пляшки, мл": "", "Об'єм порції, мл": "", "Постачальник": "", "Код 1С": "", "Ціна закупівлі": "", "Націнка пляшки %": "", "Ціна пляшки": "", "Собівартість порції": "", "Націнка порції %": "", "Ціна порції": "", "Активний": "", "Примітки": "" }]
  );
  XLSX.utils.book_append_sheet(wb, wsSpecs, "Специфікації");

  const wsFields = XLSX.utils.json_to_sheet(
    fieldsRows.length > 0 ? fieldsRows : [{ "№": "", "Назва поля": "", "Тип": "", "Значення за замовчуванням": "", "Обов'язкове": "", "Опції": "" }]
  );
  XLSX.utils.book_append_sheet(wb, wsFields, "Типові поля");

  XLSX.writeFile(wb, filename);
};

/* ═══════════════  IMPORT MATRIX  ═══════════════ */

export const importAssortmentMatrixFromExcel = (file, restaurants = [], specifications = []) => {
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

        const normalizedRestaurants = (restaurants || []).map((restaurant) => ({
          id: String(restaurant?.id || "").trim(),
          name: String(restaurant?.name || "").trim(),
        }));

        const items = rows
          .map((row) => {
            const name = String(row["Назва"] || row["Name"] || row["Номенклатура"] || "").trim();
            const specificationId = String(
              row["ID продукції"] || row["Specification ID"] || row["Product ID"] || ""
            ).trim();
            if (!name && !specificationId) return null;

            const restaurantIdsRaw = String(row["ID закладів"] || row["Restaurant IDs"] || "").trim();
            const restaurantNamesRaw = String(row["Заклади"] || row["Restaurants"] || "").trim();

            const restaurantIds = restaurantIdsRaw
              ? restaurantIdsRaw.split(",").map((value) => String(value).trim()).filter(Boolean)
              : restaurantNamesRaw
                  .split(",")
                  .map((value) => String(value).trim())
                  .filter(Boolean)
                  .map((restaurantName) => {
                    const match = normalizedRestaurants.find((restaurant) => restaurant.name === restaurantName);
                    return match?.id || restaurantName;
                  });

            const restaurantNames = restaurantIds.map((restaurantId) => {
              const match = normalizedRestaurants.find((restaurant) => restaurant.id === restaurantId);
              return match?.name || restaurantId;
            });

            const matchedSpecification = specifications.find(
              (spec) => String(spec?.id || "") === specificationId || String(spec?.name || "") === name
            );

            return {
              specificationId: specificationId || matchedSpecification?.id || "",
              productName: name || matchedSpecification?.name || "",
              category: String(row["Категорія"] || row["Category"] || "").trim(),
              measurementUnit: String(row["Одиниця виміру"] || row["Одиниця"] || row["Unit"] || "").trim(),
              saleUnit: String(row["Одиниця продажу"] || row["Sale Unit"] || row["Unit Sale"] || row["Unit"] || "").trim(),
              portionSaleUnit: String(row["Одиниця продажу порції"] || row["Portion Sale Unit"] || "").trim(),
              bottleVolumeMl: toNumber(row["Об'єм пляшки, мл"] || row["Bottle Volume Ml"] || row["Bottle Volume"] || 0),
              portionVolumeMl: toNumber(row["Об'єм порції, мл"] || row["Portion Volume Ml"] || row["Portion Volume"] || 0),
              unit: String(row["Одиниця продажу"] || row["Sale Unit"] || row["Одиниця виміру"] || row["Unit"] || "").trim(),
              supplier: String(row["Постачальник"] || row["Supplier"] || "").trim(),
              code1C: String(row["Код 1С"] || row["Код"] || row["Code 1C"] || "").trim(),
              restaurantIds,
              restaurantNames,
              purchasePrice: toNumber(row["Ціна закупівлі"] || row["Purchase Price"] || 0),
              bottleMarkup: toNumber(row["Націнка пляшки %"] || row["Bottle Markup"] || row["Markup"] || 0),
              bottleSalePrice: toNumber(row["Ціна пляшки"] || row["Bottle Sale Price"] || row["Sale Price"] || 0),
              portionCostPrice: toNumber(row["Собівартість порції"] || row["Portion Cost Price"] || row["Cost Price"] || 0),
              portionMarkup: toNumber(row["Націнка порції %"] || row["Portion Markup"] || 0),
              portionSalePrice: toNumber(row["Ціна порції"] || row["Portion Sale Price"] || 0),
              markup: toNumber(row["Націнка пляшки %"] || row["Bottle Markup"] || row["Markup"] || 0),
              salePrice: toNumber(row["Ціна пляшки"] || row["Bottle Sale Price"] || row["Sale Price"] || 0),
              costPrice: toNumber(row["Собівартість порції"] || row["Portion Cost Price"] || row["Cost Price"] || 0),
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
            const name = String(
              row["Назва продукції"] || row["Назва страви"] || row["Name"] || row["Product"] || row["Dish"] || ""
            ).trim();
            if (!name) return null;

            return {
              name,
              category: String(row["Категорія"] || row["Category"] || "").trim(),
              measurementUnit: String(row["Одиниця виміру"] || row["Одиниця"] || row["Unit"] || "").trim(),
              saleUnit: String(row["Одиниця продажу"] || row["Sale Unit"] || row["Unit"] || "").trim(),
              portionSaleUnit: String(row["Одиниця продажу порції"] || row["Portion Sale Unit"] || "").trim(),
              bottleVolumeMl: toNumber(row["Об'єм пляшки, мл"] || row["Bottle Volume Ml"] || row["Bottle Volume"] || 0),
              portionVolumeMl: toNumber(row["Об'єм порції, мл"] || row["Portion Volume Ml"] || row["Portion Volume"] || 0),
              unit: String(row["Одиниця продажу"] || row["Sale Unit"] || row["Одиниця виміру"] || row["Unit"] || "").trim(),
              supplier: String(row["Постачальник"] || row["Supplier"] || "").trim(),
              code1C: String(row["Код 1С"] || row["Code 1C"] || row["Code"] || "").trim(),
              purchasePrice: toNumber(row["Ціна закупівлі"] || row["Purchase Price"] || 0),
              bottleMarkup: toNumber(row["Націнка пляшки %"] || row["Bottle Markup"] || row["Markup"] || 0),
              bottleSalePrice: toNumber(row["Ціна пляшки"] || row["Bottle Sale Price"] || row["Sale Price"] || 0),
              portionCostPrice: toNumber(row["Собівартість порції"] || row["Portion Cost"] || row["Cost Price"] || 0),
              portionMarkup: toNumber(row["Націнка порції %"] || row["Portion Markup"] || 0),
              portionSalePrice: toNumber(row["Ціна порції"] || row["Portion Sale Price"] || 0),
              markup: toNumber(row["Націнка пляшки %"] || row["Bottle Markup"] || row["Markup"] || 0),
              salePrice: toNumber(row["Ціна пляшки"] || row["Bottle Sale Price"] || row["Sale Price"] || 0),
              costPrice: toNumber(row["Собівартість порції"] || row["Portion Cost"] || row["Cost Price"] || 0),
              isActive: !(["ні", "no", "false", "0"].includes(
                String(row["Активний"] || row["Active"] || "Так").trim().toLowerCase()
              )),
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
  const matrixExample1 = {
    "Назва": "Aperol 1L",
    "Категорія": "Аперитив",
    "Постачальник": "Bacardi-Martini Ukraine",
    "Код 1С": "BW-0010",
    "Об'єм пляшки, мл": 1000,
    "Об'єм порції, мл": 50,
    "Ціна закупівлі": 610,
    "Заклади": "Ресторан 1, Ресторан 2",
    "Примітки": "Приклад — видаліть цей рядок",
  };
  const matrixExample2 = {
    "Назва": "Prosecco Extra Dry DOC 0.75L",
    "Категорія": "Ігристе",
    "Постачальник": "Wine Bureau",
    "Код 1С": "BW-0003",
    "Об'єм пляшки, мл": 750,
    "Об'єм порції, мл": 150,
    "Ціна закупівлі": 420,
    "Заклади": "Ресторан 1",
    "Примітки": "Приклад — видаліть цей рядок",
  };
  const matrixEmpty = {
    "Назва": "",
    "Категорія": "",
    "Постачальник": "",
    "Код 1С": "",
    "Об'єм пляшки, мл": "",
    "Об'єм порції, мл": "",
    "Ціна закупівлі": "",
    "Заклади": "",
    "Примітки": "",
  };

  const specsExample1 = {
    "Назва продукції": "GLENMORANGIE The Original 0.7L",
    "Категорія": "Віскі",
    "Постачальник": "GoodWine Trade",
    "Код 1С": "BW-0001",
    "Об'єм пляшки, мл": 700,
    "Об'єм порції, мл": 50,
    "Ціна закупівлі": 1180,
    "Примітки": "Приклад — видаліть цей рядок",
  };
  const specsExample2 = {
    "Назва продукції": "Sauvignon Blanc Marlborough 0.75L",
    "Категорія": "Вино",
    "Постачальник": "Wine Bureau",
    "Код 1С": "BW-0005",
    "Об'єм пляшки, мл": 750,
    "Об'єм порції, мл": 150,
    "Ціна закупівлі": 365,
    "Примітки": "Приклад — видаліть цей рядок",
  };
  const specsEmpty = {
    "Назва продукції": "",
    "Категорія": "",
    "Постачальник": "",
    "Код 1С": "",
    "Об'єм пляшки, мл": "",
    "Об'єм порції, мл": "",
    "Ціна закупівлі": "",
    "Примітки": "",
  };

  const wb = XLSX.utils.book_new();
  const wsMatrix = XLSX.utils.json_to_sheet([matrixExample1, matrixExample2, matrixEmpty]);
  XLSX.utils.book_append_sheet(wb, wsMatrix, "Матриця");
  const wsSpecs = XLSX.utils.json_to_sheet([specsExample1, specsExample2, specsEmpty]);
  XLSX.utils.book_append_sheet(wb, wsSpecs, "Специфікації");
  XLSX.writeFile(wb, "assortment_matrix_template.xlsx");
};
