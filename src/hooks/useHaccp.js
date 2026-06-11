import { useCallback, useEffect, useRef, useState } from "react";
import {
  createCollectionItemApi,
  deleteCollectionItemApi,
  isCollectionsApiEnabled,
  listCollectionItemsApi,
  updateCollectionItemApi,
} from "../api/collectionsApi";

const TEMPLATES_COLLECTION = "haccpTemplates";
const AUDITS_COLLECTION = "haccpAudits";

// Хук для роботи з шаблонами аудиту HACCP та самими аудитами.
// Дані зберігаються у власній БД (MariaDB) через generic collections API,
// як і чек-листи. Firebase навмисно не використовується.
export const useHaccp = () => {
  const [templates, setTemplates] = useState([]);
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isMountedRef = useRef(true);
  const apiEnabled = isCollectionsApiEnabled();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshTemplates = useCallback(async () => {
    if (!apiEnabled) return [];
    const data = await listCollectionItemsApi(TEMPLATES_COLLECTION);
    const list = Array.isArray(data) ? data : [];
    if (isMountedRef.current) setTemplates(list);
    return list;
  }, [apiEnabled]);

  const refreshAudits = useCallback(async () => {
    if (!apiEnabled) return [];
    const data = await listCollectionItemsApi(AUDITS_COLLECTION);
    const list = Array.isArray(data) ? data : [];
    if (isMountedRef.current) setAudits(list);
    return list;
  }, [apiEnabled]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!apiEnabled) {
        setLoading(false);
        return;
      }
      try {
        const [templatesData, auditsData] = await Promise.all([
          listCollectionItemsApi(TEMPLATES_COLLECTION),
          listCollectionItemsApi(AUDITS_COLLECTION),
        ]);
        if (cancelled) return;
        setTemplates(Array.isArray(templatesData) ? templatesData : []);
        setAudits(Array.isArray(auditsData) ? auditsData : []);
      } catch (err) {
        console.error("Помилка завантаження даних HACCP:", err);
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [apiEnabled]);

  const createTemplate = useCallback(async (payload) => {
    if (!apiEnabled) return { success: false, error: new Error("API недоступний") };
    try {
      const id = await createCollectionItemApi(TEMPLATES_COLLECTION, payload);
      await refreshTemplates();
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  }, [apiEnabled, refreshTemplates]);

  const updateTemplate = useCallback(async (id, payload) => {
    if (!apiEnabled) return { success: false, error: new Error("API недоступний") };
    try {
      await updateCollectionItemApi(TEMPLATES_COLLECTION, id, payload);
      await refreshTemplates();
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  }, [apiEnabled, refreshTemplates]);

  const removeTemplate = useCallback(async (id) => {
    if (!apiEnabled) return { success: false, error: new Error("API недоступний") };
    try {
      await deleteCollectionItemApi(TEMPLATES_COLLECTION, id);
      await refreshTemplates();
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  }, [apiEnabled, refreshTemplates]);

  const createAudit = useCallback(async (payload) => {
    if (!apiEnabled) return { success: false, error: new Error("API недоступний") };
    try {
      const id = await createCollectionItemApi(AUDITS_COLLECTION, payload);
      await refreshAudits();
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  }, [apiEnabled, refreshAudits]);

  const updateAudit = useCallback(async (id, payload) => {
    if (!apiEnabled) return { success: false, error: new Error("API недоступний") };
    try {
      await updateCollectionItemApi(AUDITS_COLLECTION, id, payload);
      await refreshAudits();
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  }, [apiEnabled, refreshAudits]);

  const removeAudit = useCallback(async (id) => {
    if (!apiEnabled) return { success: false, error: new Error("API недоступний") };
    try {
      await deleteCollectionItemApi(AUDITS_COLLECTION, id);
      await refreshAudits();
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  }, [apiEnabled, refreshAudits]);

  return {
    templates,
    audits,
    loading,
    error,
    apiEnabled,
    createTemplate,
    updateTemplate,
    removeTemplate,
    createAudit,
    updateAudit,
    removeAudit,
    refreshTemplates,
    refreshAudits,
  };
};
