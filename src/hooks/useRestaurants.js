import { useState, useEffect } from "react";
import {
  getRestaurants,
  addRestaurant,
  updateRestaurant,
  deleteRestaurant,
  subscribeToRestaurants,
} from "../firebase/firestore";

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
      const id = await addRestaurant(restaurant);
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const update = async (id, data) => {
    try {
      await updateRestaurant(id, data);
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const remove = async (id) => {
    try {
      await deleteRestaurant(id);
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
