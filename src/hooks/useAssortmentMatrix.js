import { useEffect, useState } from "react";
import {
  getAssortmentMatrixItems,
  addAssortmentMatrixItem,
  updateAssortmentMatrixItem,
  deleteAssortmentMatrixItem,
  getAssortmentTypicalFields,
  addAssortmentTypicalField,
  updateAssortmentTypicalField,
  deleteAssortmentTypicalField,
  getAssortmentSpecifications,
  addAssortmentSpecification,
  updateAssortmentSpecification,
  deleteAssortmentSpecification,
} from "../firebase/assortmentMatrix";
import {
  isCollectionsApiEnabled,
  listCollectionItemsApi,
  createCollectionItemApi,
  updateCollectionItemApi,
  deleteCollectionItemApi,
} from "../api/collectionsApi";

export const useAssortmentMatrix = () => {
  const [items, setItems] = useState([]);
  const [typicalFields, setTypicalFields] = useState([]);
  const [specifications, setSpecifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reloadAll = async () => {
    const [itemsData, fieldsData, specsData] = await Promise.all([
      getAssortmentMatrixItems(),
      getAssortmentTypicalFields(),
      getAssortmentSpecifications(),
    ]);
    setItems(itemsData);
    setTypicalFields(fieldsData);
    setSpecifications(specsData);
  };

  useEffect(() => {
    const load = async () => {
      try {
        await reloadAll();
      } catch (err) {
        console.error("Помилка завантаження асортиментної матриці:", err);
        setError(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  /* ─── matrix items ─── */
  const addItem = async (item) => {
    try {
      const id = await addAssortmentMatrixItem(item);
      await reloadAll();
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const updateItem = async (id, data) => {
    try {
      await updateAssortmentMatrixItem(id, data);
      await reloadAll();
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const deleteItem = async (id) => {
    try {
      await deleteAssortmentMatrixItem(id);
      await reloadAll();
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  /* ─── typical fields ─── */
  const addField = async (field) => {
    try {
      const id = await addAssortmentTypicalField(field);
      await reloadAll();
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const updateField = async (id, data) => {
    try {
      await updateAssortmentTypicalField(id, data);
      await reloadAll();
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const deleteField = async (id) => {
    try {
      await deleteAssortmentTypicalField(id);
      await reloadAll();
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  /* ─── specifications ─── */
  const addSpec = async (spec) => {
    try {
      const id = await addAssortmentSpecification(spec);
      await reloadAll();
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const updateSpec = async (id, data) => {
    try {
      await updateAssortmentSpecification(id, data);
      await reloadAll();
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const deleteSpec = async (id) => {
    try {
      await deleteAssortmentSpecification(id);
      await reloadAll();
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  return {
    items,
    typicalFields,
    specifications,
    loading,
    error,
    reloadAll,
    addItem,
    updateItem,
    deleteItem,
    addField,
    updateField,
    deleteField,
    addSpec,
    updateSpec,
    deleteSpec,
  };
};
