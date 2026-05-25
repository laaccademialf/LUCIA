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
import { subscribeToAuthChanges } from "../firebase/auth";

/**
 * Хук для роботи з ресторанами з Firestore
 * Підтримує realtime оновлення
 */
export const useRestaurants = (enableRealtime = true) => {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const normalizeRestaurant = (item) => {
    if (!item || typeof item !== "object") return item;

    const id = String(item.id || item.restaurant_id || "").trim();
    const regNumber = String(item.regNumber || item.reg_number || "").trim();
    const name = String(item.name || item.restaurant_name || "").trim();

    return {
      ...item,
      id,
      regNumber,
      name,
      businessUnit: String(item.businessUnit || item.business_unit || "").trim(),
      address: String(item.address || item.full_address || "").trim(),
      country: String(item.country || "").trim(),
      region: String(item.region || "").trim(),
      city: String(item.city || "").trim(),
      street: String(item.street || "").trim(),
      postalCode: String(item.postalCode || item.postal_code || "").trim(),
      notes: String(item.notes || item.note || "").trim(),
      printerIp: String(item.printerIp || item.printer_ip || "").trim(),
      printerPort: String(item.printerPort || item.printer_port || "").trim(),
      createdAt: item.createdAt || item.created_at || "",
      updatedAt: item.updatedAt || item.updated_at || "",
    };
  };

  const dedupeRestaurants = (items) => {
    const list = (Array.isArray(items) ? items : []).map(normalizeRestaurant);
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
      let isStopped = false;
      let lastAuthUserId = null;
      const fetchData = async () => {
        try {
          const data = await listCollectionItemsApi("restaurants");
          if (isStopped) return;
          // Do not wipe an already-populated list with an empty response from
          // a request made without a valid session token (right after logout).
          let hasToken = true;
          try {
            hasToken = Boolean(
              typeof localStorage !== "undefined" &&
                localStorage.getItem("lucia_auth_session_token")
            );
          } catch { /* noop */ }
          if (!hasToken && Array.isArray(data) && data.length === 0) {
            setLoading(false);
            return;
          }
          setRestaurants(dedupeRestaurants(data));
        } catch (err) {
          console.error("Помилка завантаження ресторанів через API:", err);
          setError(err);
        } finally {
          if (!isStopped) setLoading(false);
        }
      };
      fetchData();

      // Re-fetch when the user logs in so the restaurants list is populated
      // immediately instead of waiting for the next user action.
      let unsubscribeAuth = () => {};
      try {
        unsubscribeAuth = subscribeToAuthChanges((authUser) => {
          const nextId = authUser?.uid || authUser?.id || null;
          const prevId = lastAuthUserId;
          lastAuthUserId = nextId;
          if (nextId && nextId !== prevId) {
            void fetchData();
          }
        });
      } catch { /* noop */ }

      return () => {
        isStopped = true;
        try { unsubscribeAuth(); } catch { /* noop */ }
      };
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
