import { useState, useEffect } from "react";
import {
  getAssets,
  addAsset,
  updateAsset,
  deleteAsset,
  subscribeToAssets,
} from "../firebase/firestore";
import {
  addAssetApi,
  deleteAssetApi,
  getAssetsApi,
  isAssetsApiEnabled,
  updateAssetApi,
} from "../api/assetsApi";

/**
 * Хук для роботи з активами (основними засобами) з Firestore
 * Підтримує realtime оновлення
 */
export const useAssets = (enableRealtime = true) => {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let unsubscribe;
    const apiMode = isAssetsApiEnabled();

    if (apiMode) {
      const fetchViaApi = async () => {
        try {
          const data = await getAssetsApi();
          setAssets(data);
          setLoading(false);
        } catch (err) {
          console.error("Помилка завантаження активів через API:", err);
          setError(err);
          setLoading(false);
        }
      };

      fetchViaApi();
      return () => {};
    }
    
    if (enableRealtime) {
      // Realtime підписка
      try {
        unsubscribe = subscribeToAssets((data) => {
          setAssets(data);
          setLoading(false);
        });
      } catch (err) {
        console.error("Помилка підписки на активи:", err);
        setError(err);
        setLoading(false);
      }
    } else {
      // Одноразове завантаження
      const fetchData = async () => {
        try {
          const data = await getAssets();
          setAssets(data);
          setLoading(false);
        } catch (err) {
          console.error("Помилка завантаження активів:", err);
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

  const add = async (asset) => {
    try {
      const id = isAssetsApiEnabled() ? await addAssetApi(asset) : await addAsset(asset);
      return { success: true, id };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const update = async (id, data) => {
    try {
      if (isAssetsApiEnabled()) {
        await updateAssetApi(id, data);
      } else {
        await updateAsset(id, data);
      }
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  const remove = async (id) => {
    try {
      if (isAssetsApiEnabled()) {
        await deleteAssetApi(id);
      } else {
        await deleteAsset(id);
      }
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  };

  return {
    assets,
    loading,
    error,
    addAsset: add,
    updateAsset: update,
    deleteAsset: remove,
  };
};
