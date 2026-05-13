import * as XLSX from "xlsx";

const toNumber = (value) => {
  const normalized = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/,/g, ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getInventoryEndedBy = (inventory) =>
  inventory?.inventorySessionEndedBy ||
  inventory?.inventory_session_ended_by ||
  inventory?.sessionEndedBy ||
  "";

export const importProductsFromExcel = (file, defaultRestaurant = null) => {
  const restaurants = Array.isArray(defaultRestaurant?.restaurants) ? defaultRestaurant.restaurants : [];
  const forceSingleRestaurant = Boolean(defaultRestaurant?.forceSingleRestaurant);

  const normalize = (value) => String(value || "").trim().toLowerCase();

  const findHeaderRowIndex = (rows = []) => {
    for (let i = 0; i < rows.length; i += 1) {
      const row = Array.isArray(rows[i]) ? rows[i] : [];
      const text = row.map((cell) => normalize(cell)).join("|");
      const hasName = text.includes("номенклатура") || text.includes("назва") || text.includes("name") || text.includes("товар цб");
      const hasCode = text.includes("код") || text.includes("1c") || text.includes("справочника");
      const hasUnit = text.includes("одиниц") || text.includes("единиц") || text.includes("unit");
      if (hasName && hasCode && hasUnit) {
        return i;
      }
    }
    return 0;
  };

  const extractRegFromOrganization = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const directMatch = raw.match(/(\d{2,6}[A-Za-zА-Яа-яІіЇїЄєҐґ]{0,6})$/);
    if (directMatch) return String(directMatch[1] || "").trim();
    const anyNumber = raw.match(/(\d{2,6})/);
    return anyNumber ? String(anyNumber[1] || "").trim() : "";
  };

  const resolveRestaurant = (row) => {
    if (forceSingleRestaurant && defaultRestaurant?.id) {
      return {
        id: String(defaultRestaurant.id),
        name: String(defaultRestaurant.name || ""),
        regNumber: String(defaultRestaurant.regNumber || ""),
      };
    }

    const rowId = String(row["ID закладу"] || row["Restaurant ID"] || "").trim();
    const rowName = String(
      row["Заклад"] ||
      row["Ресторан"] ||
      row["Restaurant"] ||
      row["Организация"] ||
      row["Організація"] ||
      ""
    ).trim();
    const rowRegNumber = String(
      row["Код закладу"] ||
      row["Обліковий номер"] ||
      row["RegNumber"] ||
      row["Restaurant Code"] ||
      row["Обліковий №"] ||
      ""
    ).trim();
    const organizationRegToken = extractRegFromOrganization(rowName);

    if (!restaurants.length) {
      if (defaultRestaurant?.id) {
        return {
          id: String(defaultRestaurant.id),
          name: String(defaultRestaurant.name || rowName || ""),
          regNumber: String(defaultRestaurant.regNumber || rowRegNumber || organizationRegToken || ""),
        };
      }

      if (rowId || rowName || rowRegNumber || organizationRegToken) {
        return {
          id: rowId || organizationRegToken || rowName,
          name: rowName,
          regNumber: rowRegNumber || organizationRegToken,
        };
      }

      return null;
    }

    if (rowId) {
      const byId = restaurants.find((item) => String(item.id || "") === rowId);
      if (byId) return { id: String(byId.id), name: String(byId.name || ""), regNumber: String(byId.regNumber || "") };
    }

    const targetRegToken = normalize(rowRegNumber || organizationRegToken);
    if (targetRegToken) {
      const byRegNumber = restaurants.find((item) => normalize(item.regNumber) === targetRegToken);
      if (byRegNumber) return { id: String(byRegNumber.id), name: String(byRegNumber.name || ""), regNumber: String(byRegNumber.regNumber || "") };

      const byRegContains = restaurants.find((item) => normalize(item.regNumber).includes(targetRegToken));
      if (byRegContains) return { id: String(byRegContains.id), name: String(byRegContains.name || ""), regNumber: String(byRegContains.regNumber || "") };

      const byOrgContainsReg = restaurants.find((item) => normalize(rowName).includes(normalize(item.regNumber)));
      if (byOrgContainsReg) return { id: String(byOrgContainsReg.id), name: String(byOrgContainsReg.name || ""), regNumber: String(byOrgContainsReg.regNumber || "") };
    }

    if (rowName) {
      const byName = restaurants.find((item) => normalize(item.name) === normalize(rowName));
      if (byName) return { id: String(byName.id), name: String(byName.name || ""), regNumber: String(byName.regNumber || "") };

      const byNameContains = restaurants.find((item) => {
        const left = normalize(item.name);
        const right = normalize(rowName);
        return left && right && (left.includes(right) || right.includes(left));
      });
      if (byNameContains) return { id: String(byNameContains.id), name: String(byNameContains.name || ""), regNumber: String(byNameContains.regNumber || "") };
    }

    if (defaultRestaurant?.id) {
      return {
        id: String(defaultRestaurant.id),
        name: String(defaultRestaurant.name || ""),
        regNumber: String(defaultRestaurant.regNumber || ""),
      };
    }

    return null;
  };

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
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "", range: headerRowIndex });
        const rowsByIndex = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", range: headerRowIndex + 1 });

        const parseTemplateRowByIndex = (rowByIndex = []) => {
          const organization = String(rowByIndex[0] || "").trim();
          const supplier = String(rowByIndex[2] || "").trim();
          const productGroup = String(rowByIndex[3] || "").trim();
          const code1C = String(rowByIndex[4] || "").trim();
          const whiteNamePrimary = String(rowByIndex[5] || "").trim();
          const whiteNameSecondary = String(rowByIndex[6] || "").trim();
          const greenCard = String(rowByIndex[7] || "").trim();
          const unit = String(rowByIndex[9] || "").trim();
          const unitPrice = toNumber(rowByIndex[11] || rowByIndex[18] || 0);
          const whiteCardName = whiteNameSecondary || whiteNamePrimary;
          const name = whiteCardName || whiteNamePrimary || code1C;

          return {
            organization,
            supplier,
            productGroup,
            code1C,
            whiteCardName,
            greenCard,
            unit,
            unitPrice,
            name,
          };
        };

        const products = rows
          .map((row, rowIndex) => {
            const byIndex = parseTemplateRowByIndex(rowsByIndex[rowIndex] || []);
            const templateLooksValid = Boolean(byIndex.code1C || byIndex.name || byIndex.greenCard || byIndex.productGroup || byIndex.organization);

            const name = templateLooksValid
              ? String(byIndex.name || "").trim()
              : String(row["Назва"] || row["Name"] || row["Номенклатура"] || "").trim();
            const category = templateLooksValid
              ? String(byIndex.productGroup || "").trim() || "Імпорт 1С"
              : String(row["Категорія"] || row["Category"] || row["Категория"] || "").trim() || "Імпорт 1С";
            const unit = templateLooksValid
              ? String(byIndex.unit || "").trim()
              : String(row["Одиниця"] || row["Од. вим."] || row["Unit"] || row["Единица измерения"] || "").trim();
            const supplier = templateLooksValid
              ? String(byIndex.supplier || "").trim()
              : String(row["Постачальник"] || row["Supplier"] || "").trim();
            const code1C = templateLooksValid
              ? String(byIndex.code1C || "").trim()
              : String(row["Код 1С"] || row["Код1С"] || row["1C Code"] || row["Code 1C"] || row["Код"] || "").trim();
            const unitPrice = templateLooksValid
              ? toNumber(byIndex.unitPrice || 0)
              : toNumber(row["Ціна за одиницю"] || row["Ціна"] || row["Price"] || row["Учетная цена"] || row["Облікова ціна"] || 0);
            const restaurant = resolveRestaurant({
              ...row,
              ...(templateLooksValid ? { "Организация": byIndex.organization, "Заклад": byIndex.organization } : {}),
            });
            const activeRaw = String(row["Активний"] || row["Active"] || "так").trim().toLowerCase();
            const isActive = !(activeRaw === "ні" || activeRaw === "no" || activeRaw === "false" || activeRaw === "0");

            return {
              name,
              whiteCardName: String(byIndex.whiteCardName || name || "").trim(),
              greenCardName: String(byIndex.greenCard || "").trim(),
              category,
              subcategory: String(byIndex.greenCard || row["Товарна група"] || row["Тов.группа"] || row["Підкатегорія"] || "").trim(),
              unit,
              supplier,
              code1C,
              unitPrice,
              restaurantId: String(restaurant?.id || "").trim(),
              restaurantName: String(restaurant?.name || "").trim(),
              restaurantRegNumber: String(restaurant?.regNumber || "").trim(),
              isActive,
            };
          })
          .filter((item) => item.name && item.category && item.unit && item.restaurantId);

        resolve(products);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Не вдалося прочитати файл"));
    reader.readAsArrayBuffer(file);
  });
};

export const downloadProductsTemplate = () => {
  const templateRows = [
    {
      "№": "",
      "Код 1С": "",
      "Назва": "",
      "Одиниця": "",
      "Ціна за одиницю": "",
      "Активний": "Так",
    },
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(templateRows);
  XLSX.utils.book_append_sheet(wb, ws, "Продукти_шаблон");
  XLSX.writeFile(wb, "products_template.xlsx");
};

export const downloadProductsTemplate1C = () => {
  const templateRows = [
    {
      "№": "",
      "Код": "",
      "Номенклатура": "",
      "Единица измерения": "",
      "Учетная цена": "",
    },
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(templateRows);
  XLSX.utils.book_append_sheet(wb, ws, "Импорт_1С");
  XLSX.writeFile(wb, "products_template_1c.xlsx");
};

export const exportProductsAndInventoriesToExcel = (
  products,
  inventories,
  filename = "products_and_inventories.xlsx"
) => {
  const productsData = (products || []).map((item) => ({
    "Код закладу": item.restaurantRegNumber || "",
    "Заклад": item.restaurantName || "",
    "Назва": item.name || "",
    "Код 1С": item.code1C || "",
    "Категорія": item.category || "",
    "Одиниця": item.unit || "",
    "Постачальник": item.supplier || "",
    "Ціна за одиницю": toNumber(item.unitPrice),
    "Активний": item.isActive === false ? "Ні" : "Так",
  }));

  const inventoriesData = (inventories || []).flatMap((inventory) => {
    const header = {
      "Дата інвентаризації": inventory.inventoryDate || "",
      "Створено": inventory.createdAt ? new Date(inventory.createdAt).toLocaleString("uk-UA") : "",
      "Ресторан": inventory.restaurantName || "",
      "Відповідальний": inventory.createdBy || "",
      "Хто завершив": getInventoryEndedBy(inventory),
      "Коментар": inventory.comment || "",
    };

    const lines = Array.isArray(inventory.items) ? inventory.items : [];
    return lines.map((line) => ({
      ...header,
      "Код закладу": inventory.restaurantRegNumber || "",
      "Продукт": line.productName || "",
      "Код 1С": line.code1C || "",
      "Категорія": line.category || "",
      "Одиниця": line.unit || "",
      "Кількість": toNumber(line.qty),
      "Ціна за одиницю": toNumber(line.unitPrice),
      "Сума": toNumber(line.amount),
    }));
  });

  const wb = XLSX.utils.book_new();

  const productsSheet = XLSX.utils.json_to_sheet(
    productsData.length > 0
      ? productsData
      : [{ "Код закладу": "", "Заклад": "", "Назва": "", "Код 1С": "", "Категорія": "", "Одиниця": "", "Постачальник": "", "Ціна за одиницю": "", "Активний": "" }]
  );
  const inventoriesSheet = XLSX.utils.json_to_sheet(
    inventoriesData.length > 0
      ? inventoriesData
      : [{ "Дата інвентаризації": "", "Створено": "", "Ресторан": "", "Код закладу": "", "Відповідальний": "", "Хто завершив": "", "Коментар": "", "Продукт": "", "Код 1С": "", "Категорія": "", "Одиниця": "", "Кількість": "", "Ціна за одиницю": "", "Сума": "" }]
  );

  XLSX.utils.book_append_sheet(wb, productsSheet, "Продукти");
  XLSX.utils.book_append_sheet(wb, inventoriesSheet, "Інвентаризації");

  XLSX.writeFile(wb, filename);
};

export const exportInventoriesToExcel = (
  inventories,
  filename = "inventories.xlsx"
) => {
  const inventoriesData = (inventories || []).flatMap((inventory) => {
    const header = {
      "Дата інвентаризації": inventory.inventoryDate || "",
      "Створено": inventory.createdAt ? new Date(inventory.createdAt).toLocaleString("uk-UA") : "",
      "Ресторан": inventory.restaurantName || "",
      "Код закладу": inventory.restaurantRegNumber || "",
      "Відповідальний": inventory.createdBy || "",
      "Хто завершив": getInventoryEndedBy(inventory),
    };

    const lines = Array.isArray(inventory.items) ? inventory.items : [];
    return lines.map((line) => ({
      ...header,
      "Продукт": line.productName || "",
      "Код 1С": line.code1C || "",
      "Категорія": line.category || "",
      "Одиниця": line.unit || "",
      "Кількість": toNumber(line.qty),
      "Ціна за одиницю": toNumber(line.unitPrice),
      "Сума": toNumber(line.amount),
    }));
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(
    inventoriesData.length > 0
      ? inventoriesData
      : [{
          "Дата інвентаризації": "",
          "Створено": "",
          "Ресторан": "",
          "Код закладу": "",
          "Відповідальний": "",
          "Хто завершив": "",
          "Продукт": "",
          "Код 1С": "",
          "Категорія": "",
          "Одиниця": "",
          "Кількість": "",
          "Ціна за одиницю": "",
          "Сума": "",
        }]
  );

  XLSX.utils.book_append_sheet(wb, ws, "Інвентаризації");
  XLSX.writeFile(wb, filename);
};

export const exportInventoryTo1CExcel = (inventory, filename = "inventory_1c.xlsx") => {
  const dateRaw = String(inventory?.inventoryDate || "").trim();
  const dateForTitle = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
    ? `${dateRaw.slice(8, 10)}.${dateRaw.slice(5, 7)}.${dateRaw.slice(0, 4)}`
    : (dateRaw || new Date().toLocaleDateString("uk-UA"));

  const restaurantLabel = String(inventory?.restaurantName || inventory?.restaurantRegNumber || "складу").trim();
  const title = `Инвентаризация товаров от ${dateForTitle} по складу ${restaurantLabel}`;

  const headerTop = [
    "№",
    "Код",
    "",
    "Номенклатура",
    "",
    "Единица измерения",
    "Учетная цена",
    "Количество (факт)",
    "Комментарий технолога",
    "Комментарий шеф-повара",
    "Комментарий директора",
  ];
  const headerBottom = ["", "", "", "", "", "", "", "", "", "", ""];
  const lines = Array.isArray(inventory?.items) ? inventory.items : [];

  const rows = lines.map((line, index) => ([
    index + 1,
    String(line?.code1C || ""),
    "",
    String(line?.productName || ""),
    "",
    String(line?.unit || ""),
    toNumber(line?.unitPrice),
    toNumber(line?.qty),
    "",
    "",
    "",
  ]));

  const ws = XLSX.utils.aoa_to_sheet([
    [title],
    [],
    [],
    [],
    headerTop,
    headerBottom,
    ...rows,
  ]);

  ws["!cols"] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 4 },
    { wch: 34 },
    { wch: 4 },
    { wch: 20 },
    { wch: 14 },
    { wch: 18 },
    { wch: 26 },
    { wch: 24 },
    { wch: 22 },
  ];

  const headerTopRowIndex = 4;
  const headerBottomRowIndex = 5;
  const dataStartRowIndex = 6;
  const merges = [
    // Title across A:K.
    { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
    // Header spans rows 5-6 and has grouped columns B:C and D:E.
    { s: { r: headerTopRowIndex, c: 0 }, e: { r: headerBottomRowIndex, c: 0 } },
    { s: { r: headerTopRowIndex, c: 1 }, e: { r: headerBottomRowIndex, c: 2 } },
    { s: { r: headerTopRowIndex, c: 3 }, e: { r: headerBottomRowIndex, c: 4 } },
    { s: { r: headerTopRowIndex, c: 5 }, e: { r: headerBottomRowIndex, c: 5 } },
    { s: { r: headerTopRowIndex, c: 6 }, e: { r: headerBottomRowIndex, c: 6 } },
    { s: { r: headerTopRowIndex, c: 7 }, e: { r: headerBottomRowIndex, c: 7 } },
    { s: { r: headerTopRowIndex, c: 8 }, e: { r: headerBottomRowIndex, c: 8 } },
    { s: { r: headerTopRowIndex, c: 9 }, e: { r: headerBottomRowIndex, c: 9 } },
    { s: { r: headerTopRowIndex, c: 10 }, e: { r: headerBottomRowIndex, c: 10 } },
  ];

  for (let i = 0; i < rows.length; i += 1) {
    const rowIndex = dataStartRowIndex + i;
    merges.push(
      { s: { r: rowIndex, c: 1 }, e: { r: rowIndex, c: 2 } },
      { s: { r: rowIndex, c: 3 }, e: { r: rowIndex, c: 4 } }
    );
  }

  ws["!merges"] = merges;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Инвентаризация");
  XLSX.writeFile(wb, filename);
};

export const exportSuppliersToExcel = (suppliers, filename = "suppliers.xlsx") => {
  const rows = (suppliers || []).map((item) => ({
    "Назва": String(item?.name || "").trim(),
    "Активний": item?.isActive === false ? "Ні" : "Так",
    "Мінімальна сума замовлення": toNumber(item?.minimumOrderAmount || 0),
    "Юридичні особи": Array.from(
      new Set([
        ...(Array.isArray(item?.legalEntities) ? item.legalEntities : []),
        ...((String(item?.legalEntity || "").trim() ? [String(item.legalEntity).trim()] : [])),
      ].map((entry) => String(entry || "").trim()).filter(Boolean))
    ).join(" | "),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(
    rows.length > 0
      ? rows
      : [{ "Назва": "", "Активний": "Так", "Мінімальна сума замовлення": 0, "Юридичні особи": "" }]
  );

  XLSX.utils.book_append_sheet(wb, ws, "Постачальники");
  XLSX.writeFile(wb, filename);
};

export const importSuppliersFromExcel = (file) => {
  const normalize = (value) => String(value || "").trim();

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

        const result = rows
          .map((row) => {
            const name = normalize(row["Назва"] || row["Постачальник"] || row["Supplier"] || row["name"]);
            if (!name) return null;

            const activeRaw = normalize(row["Активний"] || row["Active"] || "Так").toLowerCase();
            const isActive = !["ні", "no", "false", "0"].includes(activeRaw);

            const minimumOrderAmount = toNumber(
              row["Мінімальна сума замовлення"] ||
              row["Мінімальне замовлення"] ||
              row["Minimum Order Amount"] ||
              row["minimumOrderAmount"] ||
              0
            );

            const legalRaw = normalize(
              row["Юридичні особи"] || row["Юрособи"] || row["Legal Entities"] || row["legalEntities"] || ""
            );

            const legalEntities = legalRaw
              .split("|")
              .map((entry) => normalize(entry))
              .filter(Boolean);

            return {
              name,
              isActive,
              minimumOrderAmount,
              legalEntities: Array.from(new Set(legalEntities)),
            };
          })
          .filter(Boolean);

        resolve(result);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Не вдалося прочитати Excel файл"));
    reader.readAsArrayBuffer(file);
  });
};
