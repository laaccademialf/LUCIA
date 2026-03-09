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

  useEffect(() => {
    let unsubscribe;
    const apiMode = isCollectionsApiEnabled();

    if (apiMode) {
      const fetchData = async () => {
        try {
          const data = await listCollectionItemsApi("restaurants");
          setRestaurants(data);
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
          setRestaurants(data);
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
          setRestaurants(data);
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
        setRestaurants(data);
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
        setRestaurants(items);
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
        setRestaurants(items);
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
