import { useEffect, useState } from "react";
import {
  addBookingSupplier,
  addBookingTypicalField,
  addBookingProduct,
  addProductOrder,
  deleteBookingSupplier,
  deleteBookingTypicalField,
  deleteBookingProduct,
  getBookingSuppliers,
  getBookingTypicalFields,
  getBookingProducts,
  getProductOrders,
  subscribeToBookingSuppliers,
  subscribeToBookingTypicalFields,
  subscribeToBookingProducts,
  subscribeToProductOrders,
  updateBookingSupplier,
  updateBookingTypicalField,
  updateBookingProduct,
  updateProductOrder,
} from "../firebase/firestore";

export const useProductBooking = (enableRealtime = true) => {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [typicalFields, setTypicalFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let unsubscribeProducts;
    let unsubscribeOrders;
    let unsubscribeSuppliers;
    let unsubscribeTypicalFields;

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
      } catch (err) {
        console.error("Помилка підписки на модуль замовлень:", err);
        setError(err);
        setLoading(false);
      }
    } else {
      const fetchData = async () => {
        try {
          const [productsData, ordersData, suppliersData, typicalFieldsData] = await Promise.all([
            getBookingProducts(),
            getProductOrders(),
            getBookingSuppliers(),
            getBookingTypicalFields(),
          ]);
          setProducts(productsData);
          setOrders(ordersData);
          setSuppliers(suppliersData);
          setTypicalFields(typicalFieldsData);
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

  return {
    products,
    orders,
    suppliers,
    typicalFields,
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
  };
};
