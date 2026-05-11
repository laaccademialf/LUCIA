import { useEffect, useState } from "react";
import {
  addSupplierDispatch,
  addBookingSupplier,
  addBookingTypicalField,
  addBookingProduct,
  addInventoryListProduct,
  upsertProductInventoryByRestaurantDate,
  addProductOrder,
  deleteBookingSupplier,
  deleteBookingTypicalField,
  deleteBookingProduct,
  deleteInventoryListProduct,
  getBookingSuppliers,
  getBookingTypicalFields,
  getBookingProducts,
  getInventoryListProducts,
  getProductInventories,
  getProductOrders,
  subscribeToBookingSuppliers,
  subscribeToBookingTypicalFields,
  subscribeToBookingProducts,
  subscribeToInventoryListProducts,
  subscribeToProductInventories,
  subscribeToProductOrders,
  updateBookingSupplier,
  updateBookingTypicalField,
  updateBookingProduct,
  updateInventoryListProduct,
  updateProductInventory,
  updateProductOrder,
  deleteProductOrder,
  deleteProductInventory,
} from "../firebase/firestore";
import {
  createCollectionItemApi,
  getCollectionItemApi,
  isCollectionsApiEnabled,
  listCollectionItemsApi,
  replaceInventoryListByRestaurantApi,
  updateCollectionItemApi,
  deleteCollectionItemApi,
} from "../api/collectionsApi";

const toTrimmedString = (value) => String(value ?? "").trim();

const firstNonEmptyString = (...values) => {
  for (const candidate of values) {
    const normalized = toTrimmedString(candidate);
    if (normalized) return normalized;
  }
  return "";
};

const toBooleanWithFallback = (value, fallback = true) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = toTrimmedString(value).toLowerCase();
  if (!normalized) return fallback;
  if (["false", "0", "no", "inactive", "disabled", "off", "ні", "вимкнено"].includes(normalized)) return false;
  if (["true", "1", "yes", "active", "enabled", "on", "так", "увімкнено"].includes(normalized)) return true;
  return fallback;
};

const toNumberWithFallback = (value, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = toTrimmedString(value).replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeProductRecord = (item) => {
  if (!item || typeof item !== "object") return item;
  const normalizedCode = firstNonEmptyString(item.code1C, item.code_1c, item.code1_c, item.code1c, item.code);
  return {
    ...item,
    restaurantId: firstNonEmptyString(
      item.restaurantId,
      item.restaurant_id,
      item.restaurant,
      item.restaurantCode,
      item.restaurant_code,
      item.restaurantRegNumber,
      item.restaurant_reg_number
    ),
    restaurantName: firstNonEmptyString(item.restaurantName, item.restaurant_name, item.restaurantTitle, item.restaurant_title),
    restaurantRegNumber: firstNonEmptyString(item.restaurantRegNumber, item.restaurant_reg_number, item.regNumber, item.reg_number),
    code1C: normalizedCode,
    code_1c: normalizedCode,
    code1_c: normalizedCode,
    unitPrice: toNumberWithFallback(item.unitPrice ?? item.unit_price ?? item.price, 0),
    isActive: toBooleanWithFallback(item.isActive ?? item.is_active ?? item.active, true),
  };
};

const normalizeInventoryListProductRecord = (item) => {
  if (!item || typeof item !== "object") return item;
  const normalizedCode = firstNonEmptyString(item.code1C, item.code_1c, item.code1_c, item.code1c, item.code);
  return {
    ...item,
    restaurantId: firstNonEmptyString(
      item.restaurantId,
      item.restaurant_id,
      item.restaurant,
      item.restaurantCode,
      item.restaurant_code,
      item.restaurantRegNumber,
      item.restaurant_reg_number
    ),
    restaurantName: firstNonEmptyString(item.restaurantName, item.restaurant_name, item.restaurantTitle, item.restaurant_title),
    restaurantRegNumber: firstNonEmptyString(item.restaurantRegNumber, item.restaurant_reg_number, item.regNumber, item.reg_number),
    name: firstNonEmptyString(item.name, item.productName, item.product_name),
    code1C: normalizedCode,
    code_1c: normalizedCode,
    code1_c: normalizedCode,
    unit: firstNonEmptyString(item.unit, item.unitName, item.unit_name, item.measure),
    unitPrice: toNumberWithFallback(item.unitPrice ?? item.unit_price ?? item.price ?? item.accountingPrice ?? item.accounting_price, 0),
    fileQuantity: toNumberWithFallback(
      item.fileQuantity ?? item.file_quantity ?? item.quantity ?? item.qty ?? item.factQuantity ?? item.fact_quantity,
      0
    ),
    isActive: toBooleanWithFallback(item.isActive ?? item.is_active ?? item.active, true),
  };
};

const normalizeOrderRecord = (item) => {
  if (!item || typeof item !== "object") return item;
  return {
    ...item,
    restaurantId: firstNonEmptyString(
      item.restaurantId,
      item.restaurant_id,
      item.restaurant,
      item.restaurantCode,
      item.restaurant_code,
      item.restaurantRegNumber,
      item.restaurant_reg_number
    ),
    restaurantName: firstNonEmptyString(item.restaurantName, item.restaurant_name, item.restaurantTitle, item.restaurant_title),
    restaurantRegNumber: firstNonEmptyString(item.restaurantRegNumber, item.restaurant_reg_number, item.regNumber, item.reg_number),
    status: firstNonEmptyString(item.status, item.order_status) || "new",
    totalAmount: toNumberWithFallback(item.totalAmount ?? item.total_amount, 0),
    totalItems: toNumberWithFallback(item.totalItems ?? item.total_items, 0),
  };
};

const normalizeSupplierRecord = (item) => {
  if (!item || typeof item !== "object") return item;
  const legalEntitiesRaw = item.legalEntities ?? item.legal_entities;
  const legalEntities = Array.isArray(legalEntitiesRaw)
    ? legalEntitiesRaw.map((entry) => toTrimmedString(entry)).filter(Boolean)
    : [];

  return {
    ...item,
    name: firstNonEmptyString(item.name, item.supplierName, item.supplier_name),
    isActive: toBooleanWithFallback(item.isActive ?? item.is_active ?? item.active, true),
    legalEntities,
    legal_entities: legalEntities,
    minimumOrderAmount: toNumberWithFallback(item.minimumOrderAmount ?? item.minimum_order_amount, 0),
  };
};

const normalizeTypicalFieldRecord = (item) => {
  if (!item || typeof item !== "object") return item;
  const normalizedCode = firstNonEmptyString(item.code1C, item.code_1c, item.code1_c, item.code1c, item.code);
  return {
    ...item,
    type: firstNonEmptyString(item.type, item.fieldType, item.field_type),
    name: firstNonEmptyString(item.name, item.fieldName, item.field_name),
    categoryName: firstNonEmptyString(item.categoryName, item.category_name),
    productGroup: firstNonEmptyString(item.productGroup, item.product_group),
    supplier: firstNonEmptyString(item.supplier, item.vendor, item.vendor_name),
    unit: firstNonEmptyString(item.unit, item.unitName, item.unit_name, item.measure),
    restaurantId: firstNonEmptyString(
      item.restaurantId,
      item.restaurant_id,
      item.restaurant,
      item.restaurantCode,
      item.restaurant_code,
      item.restaurantRegNumber,
      item.restaurant_reg_number
    ),
    restaurantName: firstNonEmptyString(item.restaurantName, item.restaurant_name, item.restaurantTitle, item.restaurant_title),
    restaurantRegNumber: firstNonEmptyString(item.restaurantRegNumber, item.restaurant_reg_number, item.regNumber, item.reg_number),
    restaurantLookupKey: firstNonEmptyString(item.restaurantLookupKey, item.restaurant_lookup_key),
    whiteCardName: firstNonEmptyString(item.whiteCardName, item.white_card_name),
    greenCardName: firstNonEmptyString(item.greenCardName, item.green_card_name),
    code1C: normalizedCode,
    code_1c: normalizedCode,
    code1_c: normalizedCode,
    unitPrice: toNumberWithFallback(item.unitPrice ?? item.unit_price ?? item.price, 0),
    isActive: toBooleanWithFallback(item.isActive ?? item.is_active ?? item.active, true),
  };
};

const normalizeInventoryRecord = (item) => {
  if (!item || typeof item !== "object") return item;
  return {
    ...item,
    restaurantId: firstNonEmptyString(
      item.restaurantId,
      item.restaurant_id,
      item.restaurant,
      item.restaurantCode,
      item.restaurant_code,
      item.restaurantRegNumber,
      item.restaurant_reg_number
    ),
    restaurantName: firstNonEmptyString(item.restaurantName, item.restaurant_name, item.restaurantTitle, item.restaurant_title),
    restaurantRegNumber: firstNonEmptyString(item.restaurantRegNumber, item.restaurant_reg_number, item.regNumber, item.reg_number),
    inventoryDate: firstNonEmptyString(item.inventoryDate, item.inventory_date),
    inventorySessionId: firstNonEmptyString(item.inventorySessionId, item.inventory_session_id),
    inventorySessionEndedBy: firstNonEmptyString(
      item.inventorySessionEndedBy,
      item.inventory_session_ended_by,
      item.sessionEndedBy,
      item.session_ended_by
    ),
    inventorySessionEndedById: firstNonEmptyString(
      item.inventorySessionEndedById,
      item.inventory_session_ended_by_id,
      item.sessionEndedById,
      item.session_ended_by_id
    ),
    inventorySessionEndedAt: firstNonEmptyString(
      item.inventorySessionEndedAt,
      item.inventory_session_ended_at,
      item.sessionEndedAt,
      item.session_ended_at
    ),
    isSubmitted: toBooleanWithFallback(item.isSubmitted ?? item.is_submitted, false),
  };
};

const normalizeCollectionRecords = (items, normalizeOne) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => normalizeOne(item));
};

// Compute merged items from a per-user contributions map.
// Each key in contributionsMap is a userId, value is an array of item objects.
// Items with the same productId across different users have their qty/amount SUMMED.
const computeItemsFromContributions = (contributionsMap = {}) => {
  const productTotals = new Map();
  Object.values(contributionsMap).forEach((userItems) => {
    (Array.isArray(userItems) ? userItems : []).forEach((item) => {
      const productId = toTrimmedString(item?.productId);
      if (!productId) return;
      const existing = productTotals.get(productId);
      if (existing) {
        productTotals.set(productId, {
          ...existing,
          qty: toNumberWithFallback(existing.qty, 0) + toNumberWithFallback(item.qty, 0),
          amount: toNumberWithFallback(existing.amount, 0) + toNumberWithFallback(item.amount, 0),
        });
      } else {
        productTotals.set(productId, { ...item });
      }
    });
  });
  return Array.from(productTotals.values()).sort((a, b) =>
    String(a?.productName || "").localeCompare(String(b?.productName || ""), "uk")
  );
};

// Legacy merge: keeps last-writer-wins (used where userContributions not available).
const mergeInventoryItems = (existingItems = [], incomingItems = []) => {
  const mergedByProductId = new Map();
  (Array.isArray(existingItems) ? existingItems : []).forEach((item) => {
    const productId = toTrimmedString(item?.productId);
    if (!productId) return;
    mergedByProductId.set(productId, item);
  });
  (Array.isArray(incomingItems) ? incomingItems : []).forEach((item) => {
    const productId = toTrimmedString(item?.productId);
    if (!productId) return;
    mergedByProductId.set(productId, item);
  });
  return Array.from(mergedByProductId.values()).sort((a, b) =>
    String(a?.productName || "").localeCompare(String(b?.productName || ""), "uk")
  );
};

const runInBatches = async (items, batchSize, worker) => {
  const source = Array.isArray(items) ? items : [];
  const size = Math.max(1, Number(batchSize) || 1);
  for (let i = 0; i < source.length; i += size) {
    const batch = source.slice(i, i + size);
    await Promise.all(batch.map((entry) => worker(entry)));
  }
};

export const useProductBooking = (enableRealtime = true) => {
  const [products, setProducts] = useState([]);
  const [inventoryListProducts, setInventoryListProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [typicalFields, setTypicalFields] = useState([]);
  const [inventories, setInventories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reloadAllApi = async () => {
    const [productsData, inventoryListProductsData, ordersData, suppliersData, typicalFieldsData, inventoriesData] =
      await Promise.all([
        listCollectionItemsApi("bookingProducts"),
        listCollectionItemsApi("inventoryListProducts"),
        listCollectionItemsApi("productOrders"),
        listCollectionItemsApi("bookingSuppliers"),
        listCollectionItemsApi("bookingTypicalFields"),
        listCollectionItemsApi("productInventories"),
      ]);

    setProducts(normalizeCollectionRecords(productsData, normalizeProductRecord));
    setInventoryListProducts(normalizeCollectionRecords(inventoryListProductsData, normalizeInventoryListProductRecord));
    setOrders(normalizeCollectionRecords(ordersData, normalizeOrderRecord));
    setSuppliers(normalizeCollectionRecords(suppliersData, normalizeSupplierRecord));
    setTypicalFields(normalizeCollectionRecords(typicalFieldsData, normalizeTypicalFieldRecord));
    setInventories(normalizeCollectionRecords(inventoriesData, normalizeInventoryRecord));
  };

  const updateProductsState = (updater) => {
    setProducts((prev) => normalizeCollectionRecords(updater(Array.isArray(prev) ? prev : []), normalizeProductRecord));
  };

  const updateSuppliersState = (updater) => {
    setSuppliers((prev) => normalizeCollectionRecords(updater(Array.isArray(prev) ? prev : []), normalizeSupplierRecord));
  };

  const updateTypicalFieldsState = (updater) => {
    setTypicalFields((prev) => normalizeCollectionRecords(updater(Array.isArray(prev) ? prev : []), normalizeTypicalFieldRecord));
  };

  useEffect(() => {
    let unsubscribeProducts;
    let unsubscribeInventoryListProducts;
    let unsubscribeOrders;
    let unsubscribeSuppliers;
    let unsubscribeTypicalFields;
    let unsubscribeInventories;
    let apiRefreshIntervalId;
    const apiMode = isCollectionsApiEnabled();

    if (apiMode) {
      const fetchData = async () => {
        try {
          await reloadAllApi();
        } catch (err) {
          console.error("Помилка завантаження модуля замовлень через API:", err);
          setError(err);
        } finally {
          setLoading(false);
        }
      };

      fetchData();
      // API mode has no realtime subscriptions, so refresh periodically
      // to keep inventories synchronized across users without manual reload.
      apiRefreshIntervalId = setInterval(() => {
        void fetchData();
      }, 5000);

      return () => {
        if (apiRefreshIntervalId) clearInterval(apiRefreshIntervalId);
      };
    }

    if (enableRealtime) {
      try {
        unsubscribeProducts = subscribeToBookingProducts((data) => {
          setProducts(normalizeCollectionRecords(data, normalizeProductRecord));
          setLoading(false);
        });

        unsubscribeInventoryListProducts = subscribeToInventoryListProducts((data) => {
          setInventoryListProducts(normalizeCollectionRecords(data, normalizeInventoryListProductRecord));
          setLoading(false);
        });

        unsubscribeOrders = subscribeToProductOrders((data) => {
          setOrders(normalizeCollectionRecords(data, normalizeOrderRecord));
          setLoading(false);
        });

        unsubscribeSuppliers = subscribeToBookingSuppliers((data) => {
          setSuppliers(normalizeCollectionRecords(data, normalizeSupplierRecord));
          setLoading(false);
        });

        unsubscribeTypicalFields = subscribeToBookingTypicalFields((data) => {
          setTypicalFields(normalizeCollectionRecords(data, normalizeTypicalFieldRecord));
          setLoading(false);
        });

        unsubscribeInventories = subscribeToProductInventories((data) => {
          setInventories(normalizeCollectionRecords(data, normalizeInventoryRecord));
          setLoading(false);
        });
      } catch (err) {
        console.error("Помилка підписки на модуль замовлень:", err);
        setError(err);
        setLoading(false);
      }
    } else {
      const fetchData = async () => {
        try {
          const [productsData, inventoryListProductsData, ordersData, suppliersData, typicalFieldsData, inventoriesData] = await Promise.all([
            getBookingProducts(),
            getInventoryListProducts(),
            getProductOrders(),
            getBookingSuppliers(),
            getBookingTypicalFields(),
            getProductInventories(),
          ]);
          setProducts(normalizeCollectionRecords(productsData, normalizeProductRecord));
          setInventoryListProducts(normalizeCollectionRecords(inventoryListProductsData, normalizeInventoryListProductRecord));
          setOrders(normalizeCollectionRecords(ordersData, normalizeOrderRecord));
          setSuppliers(normalizeCollectionRecords(suppliersData, normalizeSupplierRecord));
          setTypicalFields(normalizeCollectionRecords(typicalFieldsData, normalizeTypicalFieldRecord));
          setInventories(normalizeCollectionRecords(inventoriesData, normalizeInventoryRecord));
        } catch (err) {
          console.error("Помилка завантаження модуля замовлень:", err);
          setError(err);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }

    return () => {
      if (unsubscribeProducts) unsubscribeProducts();
      if (unsubscribeInventoryListProducts) unsubscribeInventoryListProducts();
      if (unsubscribeOrders) unsubscribeOrders();
      if (unsubscribeSuppliers) unsubscribeSuppliers();
      if (unsubscribeTypicalFields) unsubscribeTypicalFields();
      if (unsubscribeInventories) unsubscribeInventories();
    };
  }, [enableRealtime]);

  const addProduct = async (product, options = {}) => {
    try {
      const skipReload = Boolean(options?.skipReload);
      const id = isCollectionsApiEnabled()
        ? await createCollectionItemApi("bookingProducts", product)
        : await addBookingProduct(product);
      if (isCollectionsApiEnabled()) {
        if (skipReload) {
          const nextId = String(id || product?.id || "").trim();
          updateProductsState((prev) => [...prev, { ...product, id: nextId || product?.id || nextId }]);
        } else {
          await reloadAllApi();
        }
      }
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const updateProduct = async (id, data, options = {}) => {
    try {
      const skipReload = Boolean(options?.skipReload);
      if (isCollectionsApiEnabled()) {
        await updateCollectionItemApi("bookingProducts", id, data);
        if (skipReload) {
          updateProductsState((prev) => prev.map((item) => (String(item.id) === String(id) ? { ...item, ...data, id: String(id) } : item)));
        } else {
          await reloadAllApi();
        }
      } else {
        await updateBookingProduct(id, data);
      }
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const deleteProduct = async (id, options = {}) => {
    try {
      const skipReload = Boolean(options?.skipReload);
      if (isCollectionsApiEnabled()) {
        await deleteCollectionItemApi("bookingProducts", id);
        if (skipReload) {
          updateProductsState((prev) => prev.filter((item) => String(item.id) !== String(id)));
        } else {
          await reloadAllApi();
        }
      } else {
        await deleteBookingProduct(id);
      }
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const createOrder = async (order) => {
    try {
      const id = isCollectionsApiEnabled()
        ? await createCollectionItemApi("productOrders", order)
        : await addProductOrder(order);
      if (isCollectionsApiEnabled()) await reloadAllApi();
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const createInventoryListProduct = async (product) => {
    try {
      const id = isCollectionsApiEnabled()
        ? await createCollectionItemApi("inventoryListProducts", product)
        : await addInventoryListProduct(product);
      if (isCollectionsApiEnabled()) await reloadAllApi();
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const editInventoryListProduct = async (id, data) => {
    try {
      if (isCollectionsApiEnabled()) {
        await updateCollectionItemApi("inventoryListProducts", id, data);
        await reloadAllApi();
      } else {
        await updateInventoryListProduct(id, data);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err };
    }
  };

  const removeInventoryListProduct = async (id) => {
    try {
      if (isCollectionsApiEnabled()) {
        await deleteCollectionItemApi("inventoryListProducts", id);
        await reloadAllApi();
      } else {
        await deleteInventoryListProduct(id);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err };
    }
  };

  const replaceInventoryListForRestaurant = async (restaurantId, items = []) => {
    try {
      const normalizedRestaurantId = toTrimmedString(restaurantId);
      if (!normalizedRestaurantId) {
        throw new Error("Не обрано заклад для заміни списку.");
      }

      const normalizedItems = (Array.isArray(items) ? items : []).map((item) => ({
        ...item,
        restaurantId: normalizedRestaurantId,
      }));

      if (isCollectionsApiEnabled()) {
        const fallbackReplaceViaClassicApi = async () => {
          const existingItems = await listCollectionItemsApi("inventoryListProducts");
          const scopedExisting = existingItems.filter(
            (entry) => firstNonEmptyString(entry?.restaurantId, entry?.restaurant_id) === normalizedRestaurantId
          );

          await runInBatches(scopedExisting, 8, async (existing) => {
            const existingId = toTrimmedString(existing?.id);
            if (!existingId) return;
            await deleteCollectionItemApi("inventoryListProducts", existingId);
          });

          await runInBatches(normalizedItems, 8, async (item) => {
            await createCollectionItemApi("inventoryListProducts", item);
          });
        };

        try {
          await replaceInventoryListByRestaurantApi(normalizedRestaurantId, normalizedItems);
        } catch (bulkErr) {
          const message = String(bulkErr?.message || bulkErr || "").toLowerCase();
          const shouldFallback = message.includes("(405)") || message.includes("method not allowed");
          if (!shouldFallback) throw bulkErr;
          await fallbackReplaceViaClassicApi();
        }

        await reloadAllApi();
      } else {
        const existingItems = await getInventoryListProducts();
        const scopedExisting = existingItems.filter(
          (entry) => firstNonEmptyString(entry?.restaurantId, entry?.restaurant_id) === normalizedRestaurantId
        );

        for (const existing of scopedExisting) {
          const existingId = toTrimmedString(existing?.id);
          if (!existingId) continue;
          await deleteInventoryListProduct(existingId);
        }

        for (const item of normalizedItems) {
          await addInventoryListProduct(item);
        }
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err };
    }
  };

  const updateOrder = async (id, data) => {
    try {
      if (isCollectionsApiEnabled()) {
        await updateCollectionItemApi("productOrders", id, data);
        await reloadAllApi();
      } else {
        await updateProductOrder(id, data);
      }
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const deleteOrder = async (id) => {
    try {
      if (isCollectionsApiEnabled()) {
        await deleteCollectionItemApi("productOrders", id);
        await reloadAllApi();
      } else {
        await deleteProductOrder(id);
      }
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const createSupplier = async (supplier, options = {}) => {
    try {
      const skipReload = Boolean(options?.skipReload);
      const id = isCollectionsApiEnabled()
        ? await createCollectionItemApi("bookingSuppliers", supplier)
        : await addBookingSupplier(supplier);
      if (isCollectionsApiEnabled()) {
        if (skipReload) {
          const nextId = String(id || supplier?.id || "").trim();
          updateSuppliersState((prev) => [...prev, { ...supplier, id: nextId || supplier?.id || nextId }]);
        } else {
          await reloadAllApi();
        }
      }
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const updateSupplier = async (id, data, options = {}) => {
    try {
      const skipReload = Boolean(options?.skipReload);
      if (isCollectionsApiEnabled()) {
        await updateCollectionItemApi("bookingSuppliers", id, data);
        if (skipReload) {
          updateSuppliersState((prev) => prev.map((item) => (String(item.id) === String(id) ? { ...item, ...data, id: String(id) } : item)));
        } else {
          await reloadAllApi();
        }
      } else {
        await updateBookingSupplier(id, data);
      }
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const removeSupplier = async (id, options = {}) => {
    try {
      const skipReload = Boolean(options?.skipReload);
      if (isCollectionsApiEnabled()) {
        await deleteCollectionItemApi("bookingSuppliers", id);
        if (skipReload) {
          updateSuppliersState((prev) => prev.filter((item) => String(item.id) !== String(id)));
        } else {
          await reloadAllApi();
        }
      } else {
        await deleteBookingSupplier(id);
      }
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const createTypicalField = async (field, options = {}) => {
    try {
      const skipReload = Boolean(options?.skipReload);
      const id = isCollectionsApiEnabled()
        ? await createCollectionItemApi("bookingTypicalFields", field)
        : await addBookingTypicalField(field);
      if (isCollectionsApiEnabled()) {
        if (skipReload) {
          const nextId = String(id || field?.id || "").trim();
          updateTypicalFieldsState((prev) => [...prev, { ...field, id: nextId || field?.id || nextId }]);
        } else {
          await reloadAllApi();
        }
      }
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const updateTypicalField = async (id, data, options = {}) => {
    try {
      const skipReload = Boolean(options?.skipReload);
      if (isCollectionsApiEnabled()) {
        await updateCollectionItemApi("bookingTypicalFields", id, data);
        if (skipReload) {
          updateTypicalFieldsState((prev) => prev.map((item) => (String(item.id) === String(id) ? { ...item, ...data, id: String(id) } : item)));
        } else {
          await reloadAllApi();
        }
      } else {
        await updateBookingTypicalField(id, data);
      }
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const removeTypicalField = async (id, options = {}) => {
    try {
      const skipReload = Boolean(options?.skipReload);
      if (isCollectionsApiEnabled()) {
        await deleteCollectionItemApi("bookingTypicalFields", id);
        if (skipReload) {
          updateTypicalFieldsState((prev) => prev.filter((item) => String(item.id) !== String(id)));
        } else {
          await reloadAllApi();
        }
      } else {
        await deleteBookingTypicalField(id);
      }
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const createSupplierDispatch = async (dispatch) => {
    try {
      const id = isCollectionsApiEnabled()
        ? await createCollectionItemApi("supplierDispatches", dispatch)
        : await addSupplierDispatch(dispatch);
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const createInventory = async (inventory) => {
    try {
      let id;
      if (isCollectionsApiEnabled()) {
        const restaurantId = String(inventory?.restaurantId || "").trim();
        const sessionId = String(inventory?.inventorySessionId || "").trim();
        const dateRaw = String(inventory?.inventoryDate || "").trim();
        const datePart = dateRaw ? dateRaw.slice(0, 10) : "";
        const userId = toTrimmedString(inventory?.createdById || inventory?.updatedById) || "unknown";
        const userName = firstNonEmptyString(inventory?.createdBy, inventory?.updatedBy, "Користувач");
        const nowIso = new Date().toISOString();

        const isMergedInventory = toBooleanWithFallback(inventory?.isMerged, false)
          && Array.isArray(inventory?.mergedFromIds)
          && inventory.mergedFromIds.length > 0;

        // Merged inventories must be stored as a separate final document,
        // without per-user contribution merge/upsert behavior.
        if (isMergedInventory) {
          const mergedDocId = `merged__${restaurantId}__${datePart || "date"}__${Date.now()}`;
          await createCollectionItemApi("productInventories", {
            id: mergedDocId,
            ...inventory,
            createdAt: nowIso,
            updatedAt: nowIso,
            createdBy: userName,
            createdById: userId,
            updatedBy: userName,
            updatedById: userId,
          });
          id = mergedDocId;
          await reloadAllApi();
          return { success: true, id };
        }

        const docId = sessionId || `${restaurantId}__${datePart}__${userId}`;
        const existing = await getCollectionItemApi("productInventories", docId);

        // Per-user contributions: each user's full item list is stored separately.
        // Merging sums qty/amount for same productId across all users, overwriting only this user's portion.
        const existingContributions =
          existing && typeof existing.userContributions === "object" && existing.userContributions !== null
            ? existing.userContributions
            : {};
        // Seed from existing items when migrating legacy records without userContributions.
        const seedContributions =
          !existing?.userContributions && Array.isArray(existing?.items) && existing.items.length > 0
            ? { ...existingContributions, __legacy__: existing.items }
            : existingContributions;
        const updatedContributions = { ...seedContributions, [userId]: inventory.items };

        const mergedItems = computeItemsFromContributions(updatedContributions);
        const totalItems = mergedItems.reduce((sum, item) => sum + toNumberWithFallback(item?.qty, 0), 0);
        const totalAmount = mergedItems.reduce((sum, item) => sum + toNumberWithFallback(item?.amount, 0), 0);

        const contributor = { userId, name: userName, at: nowIso };
        const contributorsMap = new Map();
        (Array.isArray(existing?.contributors) ? existing.contributors : []).forEach((entry) => {
          const key = toTrimmedString(entry?.userId || entry?.name);
          if (!key) return;
          contributorsMap.set(key, entry);
        });
        if (userId) contributorsMap.set(userId, contributor);

        if (existing) {
          await updateCollectionItemApi("productInventories", docId, {
            ...existing,
            ...inventory,
            createdBy: firstNonEmptyString(existing?.createdBy, inventory?.createdBy, "Користувач"),
            createdById: firstNonEmptyString(existing?.createdById, inventory?.createdById),
            items: mergedItems,
            totalItems,
            totalAmount,
            userContributions: updatedContributions,
            contributors: Array.from(contributorsMap.values()),
            lastContributorName: userName,
            lastContributorId: userId,
            updatedBy: userName,
            updatedById: userId,
            updatedAt: nowIso,
          });
        } else {
          await createCollectionItemApi("productInventories", {
            id: docId,
            userContributions: updatedContributions,
            contributors: [contributor],
            lastContributorName: userName,
            lastContributorId: userId,
            ...inventory,
            items: mergedItems,
            totalItems,
            totalAmount,
          });
        }
        id = docId;
        await reloadAllApi();
      } else {
        id = await upsertProductInventoryByRestaurantDate(inventory);
      }
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const updateInventory = async (id, data) => {
    try {
      if (isCollectionsApiEnabled()) {
        await updateCollectionItemApi("productInventories", id, data);
        await reloadAllApi();
      } else {
        await updateProductInventory(id, data);
      }
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const deleteInventory = async (id) => {
    try {
      if (isCollectionsApiEnabled()) {
        await deleteCollectionItemApi("productInventories", id);
        await reloadAllApi();
      } else {
        await deleteProductInventory(id);
      }
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  return {
    products,
    inventoryListProducts,
    orders,
    suppliers,
    typicalFields,
    inventories,
    loading,
    error,
    addProduct,
    updateProduct,
    deleteProduct,
    createOrder,
    updateOrder,
    deleteOrder,
    createSupplier,
    updateSupplier,
    removeSupplier,
    createTypicalField,
    updateTypicalField,
    removeTypicalField,
    createSupplierDispatch,
    createInventoryListProduct,
    editInventoryListProduct,
    removeInventoryListProduct,
    replaceInventoryListForRestaurant,
    createInventory,
    updateInventory,
    deleteInventory,
  };
};
