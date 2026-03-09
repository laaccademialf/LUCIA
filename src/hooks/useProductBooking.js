import { useEffect, useState } from "react";
import {
  addSupplierDispatch,
  addBookingSupplier,
  addBookingTypicalField,
  addBookingProduct,
  upsertProductInventoryByRestaurantDate,
  addProductOrder,
  deleteBookingSupplier,
  deleteBookingTypicalField,
  deleteBookingProduct,
  getBookingSuppliers,
  getBookingTypicalFields,
  getBookingProducts,
  getProductInventories,
  getProductOrders,
  subscribeToBookingSuppliers,
  subscribeToBookingTypicalFields,
  subscribeToBookingProducts,
  subscribeToProductInventories,
  subscribeToProductOrders,
  updateBookingSupplier,
  updateBookingTypicalField,
  updateBookingProduct,
  updateProductInventory,
  updateProductOrder,
} from "../firebase/firestore";
import {
  createCollectionItemApi,
  getCollectionItemApi,
  isCollectionsApiEnabled,
  listCollectionItemsApi,
  updateCollectionItemApi,
  deleteCollectionItemApi,
} from "../api/collectionsApi";

export const useProductBooking = (enableRealtime = true) => {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [typicalFields, setTypicalFields] = useState([]);
  const [inventories, setInventories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reloadAllApi = async () => {
    const [productsData, ordersData, suppliersData, typicalFieldsData, inventoriesData] =
      await Promise.all([
        listCollectionItemsApi("bookingProducts"),
        listCollectionItemsApi("productOrders"),
        listCollectionItemsApi("bookingSuppliers"),
        listCollectionItemsApi("bookingTypicalFields"),
        listCollectionItemsApi("productInventories"),
      ]);

    setProducts(productsData);
    setOrders(ordersData);
    setSuppliers(suppliersData);
    setTypicalFields(typicalFieldsData);
    setInventories(inventoriesData);
  };

  useEffect(() => {
    let unsubscribeProducts;
    let unsubscribeOrders;
    let unsubscribeSuppliers;
    let unsubscribeTypicalFields;
    let unsubscribeInventories;
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
      return () => {};
    }

    if (enableRealtime) {
      try {
        unsubscribeProducts = subscribeToBookingProducts((data) => {
          setProducts(data);
          setLoading(false);
        });

        unsubscribeOrders = subscribeToProductOrders((data) => {
          setOrders(data);
          setLoading(false);
        });

        unsubscribeSuppliers = subscribeToBookingSuppliers((data) => {
          setSuppliers(data);
          setLoading(false);
        });

        unsubscribeTypicalFields = subscribeToBookingTypicalFields((data) => {
          setTypicalFields(data);
          setLoading(false);
        });

        unsubscribeInventories = subscribeToProductInventories((data) => {
          setInventories(data);
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
          const [productsData, ordersData, suppliersData, typicalFieldsData, inventoriesData] = await Promise.all([
            getBookingProducts(),
            getProductOrders(),
            getBookingSuppliers(),
            getBookingTypicalFields(),
            getProductInventories(),
          ]);
          setProducts(productsData);
          setOrders(ordersData);
          setSuppliers(suppliersData);
          setTypicalFields(typicalFieldsData);
          setInventories(inventoriesData);
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
      if (unsubscribeOrders) unsubscribeOrders();
      if (unsubscribeSuppliers) unsubscribeSuppliers();
      if (unsubscribeTypicalFields) unsubscribeTypicalFields();
      if (unsubscribeInventories) unsubscribeInventories();
    };
  }, [enableRealtime]);

  const addProduct = async (product) => {
    try {
      const id = isCollectionsApiEnabled()
        ? await createCollectionItemApi("bookingProducts", product)
        : await addBookingProduct(product);
      if (isCollectionsApiEnabled()) await reloadAllApi();
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const updateProduct = async (id, data) => {
    try {
      if (isCollectionsApiEnabled()) {
        await updateCollectionItemApi("bookingProducts", id, data);
        await reloadAllApi();
      } else {
        await updateBookingProduct(id, data);
      }
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const deleteProduct = async (id) => {
    try {
      if (isCollectionsApiEnabled()) {
        await deleteCollectionItemApi("bookingProducts", id);
        await reloadAllApi();
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

  const createSupplier = async (supplier) => {
    try {
      const id = isCollectionsApiEnabled()
        ? await createCollectionItemApi("bookingSuppliers", supplier)
        : await addBookingSupplier(supplier);
      if (isCollectionsApiEnabled()) await reloadAllApi();
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const updateSupplier = async (id, data) => {
    try {
      if (isCollectionsApiEnabled()) {
        await updateCollectionItemApi("bookingSuppliers", id, data);
        await reloadAllApi();
      } else {
        await updateBookingSupplier(id, data);
      }
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const removeSupplier = async (id) => {
    try {
      if (isCollectionsApiEnabled()) {
        await deleteCollectionItemApi("bookingSuppliers", id);
        await reloadAllApi();
      } else {
        await deleteBookingSupplier(id);
      }
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const createTypicalField = async (field) => {
    try {
      const id = isCollectionsApiEnabled()
        ? await createCollectionItemApi("bookingTypicalFields", field)
        : await addBookingTypicalField(field);
      if (isCollectionsApiEnabled()) await reloadAllApi();
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const updateTypicalField = async (id, data) => {
    try {
      if (isCollectionsApiEnabled()) {
        await updateCollectionItemApi("bookingTypicalFields", id, data);
        await reloadAllApi();
      } else {
        await updateBookingTypicalField(id, data);
      }
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const removeTypicalField = async (id) => {
    try {
      if (isCollectionsApiEnabled()) {
        await deleteCollectionItemApi("bookingTypicalFields", id);
        await reloadAllApi();
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
        const docId = sessionId || `${restaurantId}__${datePart}`;
        const existing = await getCollectionItemApi("productInventories", docId);
        if (existing) {
          await updateCollectionItemApi("productInventories", docId, {
            ...existing,
            ...inventory,
          });
        } else {
          await createCollectionItemApi("productInventories", {
            id: docId,
            ...inventory,
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

  return {
    products,
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
    createSupplier,
    updateSupplier,
    removeSupplier,
    createTypicalField,
    updateTypicalField,
    removeTypicalField,
    createSupplierDispatch,
    createInventory,
    updateInventory,
  };
};
