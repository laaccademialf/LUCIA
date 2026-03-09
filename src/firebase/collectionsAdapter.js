import {
  createCollectionItemApi,
  deleteCollectionItemApi,
  getCollectionItemApi,
  isCollectionsApiEnabled,
  listCollectionItemsApi,
  updateCollectionItemApi,
} from "../api/collectionsApi";

export const isApiDataModeEnabled = () => isCollectionsApiEnabled();

export const listByField = async (collectionName, fieldName, fieldValue) => {
  const items = await listCollectionItemsApi(collectionName);
  return items.filter((item) => String(item?.[fieldName] || "") === String(fieldValue || ""));
};

export const upsertCollectionItemById = async (collectionName, id, payload) => {
  const itemId = String(id || "").trim();
  if (!itemId) throw new Error("Item id is required");

  const existing = await getCollectionItemApi(collectionName, itemId).catch(() => null);
  if (existing) {
    await updateCollectionItemApi(collectionName, itemId, payload || {});
    return itemId;
  }

  await createCollectionItemApi(collectionName, { ...(payload || {}), id: itemId });
  return itemId;
};

export const subscribeByPolling = (loader, callback, intervalMs = 5000) => {
  let stopped = false;

  const load = async () => {
    try {
      const data = await loader();
      if (!stopped) {
        callback(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      if (!stopped) {
        console.warn("Polling subscription load failed:", error);
      }
    }
  };

  void load();
  const timer = setInterval(load, intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
};

export {
  createCollectionItemApi,
  deleteCollectionItemApi,
  getCollectionItemApi,
  listCollectionItemsApi,
  updateCollectionItemApi,
};
