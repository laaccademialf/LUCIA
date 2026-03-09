import { useEffect, useState } from "react";
import { getMenuStructure, saveMenuStructure } from "../firebase/menuStructure";
import {
  createCollectionItemApi,
  getCollectionItemApi,
  isCollectionsApiEnabled,
  updateCollectionItemApi,
} from "../api/collectionsApi";

// Хук для роботи зі структурою меню з Firestore
export function useMenuStructure() {
  const [menuStructure, setMenuStructure] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let unsub = false;
    async function fetchMenu() {
      setLoading(true);
      try {
        let data;
        if (isCollectionsApiEnabled()) {
          const doc = await getCollectionItemApi("menuStructure", "main");
          data = doc?.structure || [];
        } else {
          data = await getMenuStructure();
        }
        if (!unsub) setMenuStructure(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!unsub) setError("Не вдалося завантажити структуру меню");
      } finally {
        if (!unsub) setLoading(false);
      }
    }
    fetchMenu();
    return () => { unsub = true; };
  }, []);

  // Збереження структури меню
  const save = async (newStructure) => {
    setLoading(true);
    try {
      if (isCollectionsApiEnabled()) {
        const current = await getCollectionItemApi("menuStructure", "main");
        if (current) {
          await updateCollectionItemApi("menuStructure", "main", {
            ...current,
            structure: newStructure,
          });
        } else {
          await createCollectionItemApi("menuStructure", {
            id: "main",
            structure: newStructure,
          });
        }
      } else {
        await saveMenuStructure(newStructure);
      }
      setMenuStructure(newStructure);
      setError("");
    } catch (e) {
      setError("Не вдалося зберегти структуру меню");
    } finally {
      setLoading(false);
    }
  };

  return { menuStructure, setMenuStructure, save, loading, error };
}
