import { useEffect, useState } from "react";
import {
  addSupplierDispatch,
  addBookingSupplier,
  addBookingTypicalField,
  addBookingProduct,
  addProductInventory,
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

export const useProductBooking = (enableRealtime = true) => {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [typicalFields, setTypicalFields] = useState([]);
  const [inventories, setInventories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let unsubscribeProducts;
    let unsubscribeOrders;
    let unsubscribeSuppliers;
    let unsubscribeTypicalFields;
    let unsubscribeInventories;

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
      const id = await addBookingProduct(product);
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const updateProduct = async (id, data) => {
    try {
      await updateBookingProduct(id, data);
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const deleteProduct = async (id) => {
    try {
      await deleteBookingProduct(id);
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const createOrder = async (order) => {
    try {
      const id = await addProductOrder(order);
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const updateOrder = async (id, data) => {
    try {
      await updateProductOrder(id, data);
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const createSupplier = async (supplier) => {
    try {
      const id = await addBookingSupplier(supplier);
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const updateSupplier = async (id, data) => {
    try {
      await updateBookingSupplier(id, data);
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const removeSupplier = async (id) => {
    try {
      await deleteBookingSupplier(id);
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const createTypicalField = async (field) => {
    try {
      const id = await addBookingTypicalField(field);
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const updateTypicalField = async (id, data) => {
    try {
      await updateBookingTypicalField(id, data);
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const removeTypicalField = async (id) => {
    try {
      await deleteBookingTypicalField(id);
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const createSupplierDispatch = async (dispatch) => {
    try {
      const id = await addSupplierDispatch(dispatch);
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const createInventory = async (inventory) => {
    try {
      const id = await addProductInventory(inventory);
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const updateInventory = async (id, data) => {
    try {
      await updateProductInventory(id, data);
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
