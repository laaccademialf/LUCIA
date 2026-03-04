import * as XLSX from "xlsx";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const importProductsFromExcel = (file) => {
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

        const products = rows
          .map((row) => {
            const name = String(row["Назва"] || row["Name"] || "").trim();
            const category = String(row["Категорія"] || row["Category"] || "").trim();
            const unit = String(row["Одиниця"] || row["Од. вим."] || row["Unit"] || "").trim();
            const supplier = String(row["Постачальник"] || row["Supplier"] || "").trim();
            const unitPrice = toNumber(row["Ціна за одиницю"] || row["Ціна"] || row["Price"] || 0);
            const activeRaw = String(row["Активний"] || row["Active"] || "так").trim().toLowerCase();
            const isActive = !(activeRaw === "ні" || activeRaw === "no" || activeRaw === "false" || activeRaw === "0");

            return {
              name,
              category,
              unit,
              supplier,
              unitPrice,
              isActive,
            };
          })
          .filter((item) => item.name && item.category && item.unit);

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
      "Назва": "",
      "Категорія": "",
      "Одиниця": "",
      "Постачальник": "",
      "Ціна за одиницю": "",
      "Активний": "Так",
    },
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(templateRows);
  XLSX.utils.book_append_sheet(wb, ws, "Продукти_шаблон");
  XLSX.writeFile(wb, "products_template.xlsx");
};

export const exportProductsAndInventoriesToExcel = (
  products,
  inventories,
  filename = "products_and_inventories.xlsx"
) => {
  const productsData = (products || []).map((item) => ({
    "Назва": item.name || "",
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
      "Коментар": inventory.comment || "",
    };

    const lines = Array.isArray(inventory.items) ? inventory.items : [];
    return lines.map((line) => ({
      ...header,
      "Продукт": line.productName || "",
      "Категорія": line.category || "",
      "Одиниця": line.unit || "",
      "Кількість": toNumber(line.qty),
      "Ціна за одиницю": toNumber(line.unitPrice),
      "Сума": toNumber(line.amount),
    }));
  });

  const wb = XLSX.utils.book_new();

  const productsSheet = XLSX.utils.json_to_sheet(productsData.length > 0 ? productsData : [{ "Назва": "", "Категорія": "", "Одиниця": "", "Постачальник": "", "Ціна за одиницю": "", "Активний": "" }]);
  const inventoriesSheet = XLSX.utils.json_to_sheet(
    inventoriesData.length > 0
      ? inventoriesData
      : [{ "Дата інвентаризації": "", "Створено": "", "Ресторан": "", "Відповідальний": "", "Коментар": "", "Продукт": "", "Категорія": "", "Одиниця": "", "Кількість": "", "Ціна за одиницю": "", "Сума": "" }]
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
      "Відповідальний": inventory.createdBy || "",
    };

    const lines = Array.isArray(inventory.items) ? inventory.items : [];
    return lines.map((line) => ({
      ...header,
      "Продукт": line.productName || "",
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
          "Відповідальний": "",
          "Продукт": "",
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
