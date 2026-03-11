import { useState, useEffect } from "react";
import {
  getRestaurants,
  addRestaurant,
  updateRestaurant,
  deleteRestaurant,
  subscribeToRestaurants,
} from "../firebase/firestore";
import {
  createCollectionItemApi,
  deleteCollectionItemApi,
  isCollectionsApiEnabled,
  listCollectionItemsApi,
  updateCollectionItemApi,
} from "../api/collectionsApi";

/**
 * Хук для роботи з ресторанами з Firestore
 * Підтримує realtime оновлення
 */
export const useRestaurants = (enableRealtime = true) => {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const dedupeRestaurants = (items) => {
    const list = Array.isArray(items) ? items : [];
    const pickTimestamp = (item) => {
      const updated = Date.parse(String(item?.updatedAt || item?.updated_at || ""));
      const created = Date.parse(String(item?.createdAt || item?.created_at || ""));
      if (!Number.isNaN(updated)) return updated;
      if (!Number.isNaN(created)) return created;
      return 0;
    };

    const keyFor = (item) => {
      const reg = String(item?.regNumber || "").trim().toLowerCase();
      if (reg) return `reg:${reg}`;

      const name = String(item?.name || "").trim().toLowerCase();
      const city = String(item?.city || "").trim().toLowerCase();
      const street = String(item?.street || "").trim().toLowerCase();
      const fallback = `${name}|${city}|${street}`;
      if (fallback.replace(/\|/g, "")) return `fallback:${fallback}`;

      return `id:${String(item?.id || "")}`;
    };

    const map = new Map();
    for (const item of list) {
      const key = keyFor(item);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, item);
        continue;
      }

      const prevTs = pickTimestamp(prev);
      const nextTs = pickTimestamp(item);
      if (nextTs >= prevTs) {
        map.set(key, item);
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      String(a?.regNumber || "").localeCompare(String(b?.regNumber || ""), "uk", { numeric: true })
    );
  };

  useEffect(() => {
    let unsubscribe;
    const apiMode = isCollectionsApiEnabled();

    if (apiMode) {
      const fetchData = async () => {
        try {
          const data = await listCollectionItemsApi("restaurants");
          setRestaurants(dedupeRestaurants(data));
        } catch (err) {
          console.error("Помилка завантаження ресторанів через API:", err);
          setError(err);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
      return () => {};
    }
    
    if (enableRealtime) {
      // Realtime підписка
      try {
        unsubscribe = subscribeToRestaurants((data) => {
          setRestaurants(dedupeRestaurants(data));
          setLoading(false);
        });
      } catch (err) {
        console.error("Помилка підписки на ресторани:", err);
        setError(err);
        setLoading(false);
      }
    } else {
      // Одноразове завантаження
      const fetchData = async () => {
        try {
          const data = await getRestaurants();
          setRestaurants(dedupeRestaurants(data));
          setLoading(false);
        } catch (err) {
          console.error("Помилка завантаження ресторанів:", err);
          setError(err);
          setLoading(false);
        }
      };
      fetchData();
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [enableRealtime]);

  const add = async (restaurant) => {
    try {
      const id = isCollectionsApiEnabled()
        ? await createCollectionItemApi("restaurants", restaurant)
        : await addRestaurant(restaurant);
      if (isCollectionsApiEnabled()) {
        const data = await listCollectionItemsApi("restaurants");
        setRestaurants(dedupeRestaurants(data));
      }
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const update = async (id, data) => {
    try {
      if (isCollectionsApiEnabled()) {
        await updateCollectionItemApi("restaurants", id, data);
        const items = await listCollectionItemsApi("restaurants");
        setRestaurants(dedupeRestaurants(items));
      } else {
        await updateRestaurant(id, data);
      }
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const remove = async (id) => {
    try {
      if (isCollectionsApiEnabled()) {
        await deleteCollectionItemApi("restaurants", id);
        const items = await listCollectionItemsApi("restaurants");
        setRestaurants(dedupeRestaurants(items));
      } else {
        await deleteRestaurant(id);
      }
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  return {
    restaurants,
    loading,
    error,
    addRestaurant: add,
    updateRestaurant: update,
    deleteRestaurant: remove,
  };
};
