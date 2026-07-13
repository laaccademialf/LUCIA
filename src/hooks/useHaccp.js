import { useCallback, useEffect, useRef, useState } from "react";
import {
  createCollectionItemApi,
  deleteCollectionItemApi,
  isCollectionsApiEnabled,
  listCollectionItemsApi,
  updateCollectionItemApi,
} from "../api/collectionsApi";
import { uploadHaccpPhotosApi } from "../api/haccpPhotosApi";

const TEMPLATES_COLLECTION = "haccpTemplates";
const AUDITS_COLLECTION = "haccpAudits";

// Клієнтський кеш коротких довідкових даних (шаблони) у localStorage,
// щоб не робити повторних запитів до БД при кожному рендері/перемиканні вкладок.
const HACCP_TEMPLATES_CACHE_KEY = "lucia.haccp.templates.v1";

const readTemplatesCache = () => {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(HACCP_TEMPLATES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.data)) return parsed.data;
    return null;
  } catch {
    return null;
  }
};

const writeTemplatesCache = (data) => {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(HACCP_TEMPLATES_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // ігноруємо помилки запису кешу
  }
};

const collectUploadTargets = (payload) => {
  const targets = [];

  (Array.isArray(payload?.gallery) ? payload.gallery : []).forEach((photo, index) => {
    if (photo?.dataUrl && !photo?.url) {
      targets.push({ scope: "gallery", index, photo });
    }
  });

  Object.entries(payload?.responses || {}).forEach(([itemId, response]) => {
    (Array.isArray(response?.photos) ? response.photos : []).forEach((photo, index) => {
      if (photo?.dataUrl && !photo?.url) {
        targets.push({ scope: "response", itemId, index, photo });
      }
    });
  });

  return targets;
};

const rewriteUploadedPhotos = (payload, uploadedPhotos = []) => {
  const next = {
    ...payload,
    gallery: Array.isArray(payload?.gallery) ? [...payload.gallery] : [],
    responses: payload?.responses && typeof payload.responses === "object" ? { ...payload.responses } : {},
  };

  const uploadMap = new Map(
    (Array.isArray(uploadedPhotos) ? uploadedPhotos : [])
      .filter((item) => item?.id)
      .map((item) => [String(item.id), item])
  );

  next.gallery = next.gallery.map((photo, index) => {
    if (!photo?.dataUrl || photo?.url) return photo;
    const saved = uploadMap.get(`gallery:${index}`);
    if (!saved?.url) return photo;
    const normalized = { ...photo, name: String(saved.name || photo.name || "Фото"), url: String(saved.url || "") };
    delete normalized.dataUrl;
    return normalized;
  });

  Object.entries(next.responses).forEach(([itemId, response]) => {
    if (!response || typeof response !== "object") return;
    if (!Array.isArray(response.photos)) return;
    next.responses[itemId] = {
      ...response,
      photos: response.photos.map((photo, index) => {
        if (!photo?.dataUrl || photo?.url) return photo;
        const saved = uploadMap.get(`response:${itemId}:${index}`);
        if (!saved?.url) return photo;
        const normalized = { ...photo, name: String(saved.name || photo.name || "Фото"), url: String(saved.url || "") };
        delete normalized.dataUrl;
        return normalized;
      }),
    };
  });

  return next;
};

const uploadAuditPhotosIfNeeded = async (payload) => {
  const targets = collectUploadTargets(payload);
  if (!targets.length) return payload;

  const uploadedPhotos = await uploadHaccpPhotosApi(
    targets.map((target) => ({
      id:
        target.scope === "gallery"
          ? `gallery:${target.index}`
          : `response:${target.itemId}:${target.index}`,
      fileName: target.photo?.name || target.photo?.fileName || "Фото",
      dataUrl: target.photo?.dataUrl,
    }))
  );

  return rewriteUploadedPhotos(payload, uploadedPhotos);
};

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
    writeTemplatesCache(list);
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
        // Спочатку показуємо закешовані шаблони (короткі довідкові дані),
        // щоб уникнути «миготіння» та повторних запитів.
        const cachedTemplates = readTemplatesCache();
        if (cachedTemplates && !cancelled) {
          setTemplates(cachedTemplates);
          setLoading(false);
        }
        const [templatesData, auditsData] = await Promise.all([
          listCollectionItemsApi(TEMPLATES_COLLECTION),
          listCollectionItemsApi(AUDITS_COLLECTION),
        ]);
        if (cancelled) return;
        const list = Array.isArray(templatesData) ? templatesData : [];
        writeTemplatesCache(list);
        setTemplates(list);
        setAudits(Array.isArray(auditsData) ? auditsData : []);
      } catch (err) {
        console.error("Помилка завантаження даних HACCP:", err);
        // За наявності кешу не скидаємо шаблони у порожній список.
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
      const nextPayload = await uploadAuditPhotosIfNeeded(payload);
      const id = await createCollectionItemApi(AUDITS_COLLECTION, nextPayload);
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
      const nextPayload = await uploadAuditPhotosIfNeeded(payload);
      await updateCollectionItemApi(AUDITS_COLLECTION, id, nextPayload);
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
