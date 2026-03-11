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

  const normalizeAsset = (item) => {
    if (!item || typeof item !== "object") return item;

    const invNumber = String(item.invNumber || item.inv_number || "").trim();
    const invNumber1C = String(item.invNumber1C || item.inv_number_1c || item.inv_number1_c || "").trim();

    return {
      ...item,
      id: String(item.id || "").trim(),
      invNumber,
      invNumber1C,
      name: String(item.name || item.assetName || item.asset_name || "").trim(),
      category: String(item.category || "").trim(),
      subCategory: String(item.subCategory || item.sub_category || "").trim(),
      type: String(item.type || "").trim(),
      serialNumber: String(item.serialNumber || item.serial_number || "").trim(),
      brand: String(item.brand || "").trim(),
      businessUnit: String(item.businessUnit || item.business_unit || "").trim(),
      locationName: String(item.locationName || item.location_name || "").trim(),
      zone: String(item.zone || "").trim(),
      respCenter: String(item.respCenter || item.resp_center || "").trim(),
      respPerson: String(item.respPerson || item.resp_person || "").trim(),
      status: String(item.status || "").trim(),
      condition: String(item.condition || item.assetCondition || item.asset_condition || "").trim(),
      functionality: String(item.functionality || "").trim(),
      relevance: String(item.relevance || "").trim(),
      comment: String(item.comment || "").trim(),
      purchaseYear: item.purchaseYear ?? item.purchase_year ?? "",
      commissionDate: item.commissionDate || item.commission_date || "",
      normativeTerm: item.normativeTerm ?? item.normative_term ?? "",
      physicalWear: item.physicalWear ?? item.physical_wear ?? "",
      moralWear: item.moralWear ?? item.moral_wear ?? "",
      totalWear: item.totalWear ?? item.total_wear ?? "",
      initialCost: item.initialCost ?? item.initial_cost ?? "",
      marketValueNew: item.marketValueNew ?? item.market_value_new ?? "",
      marketValueUsed: item.marketValueUsed ?? item.market_value_used ?? "",
      residualValuePerUnit: item.residualValuePerUnit ?? item.residual_value_per_unit ?? "",
      residualValue: item.residualValue ?? item.residual_value ?? "",
      decision: String(item.decision || "").trim(),
      reason: String(item.reason || "").trim(),
      newLocation: String(item.newLocation || item.new_location || "").trim(),
      auditDate: item.auditDate || item.audit_date || "",
      auditors: String(item.auditors || "").trim(),
      createdAt: item.createdAt || item.created_at || "",
      updatedAt: item.updatedAt || item.updated_at || "",
      inventoryQuantity: item.inventoryQuantity ?? item.inventory_quantity ?? "",
      nextInventoryQuantity: item.nextInventoryQuantity ?? item.next_inventory_quantity ?? "",
      inventoryChangeHistory: item.inventoryChangeHistory || item.inventory_change_history || [],
    };
  };

  const normalizeAssets = (items) => (Array.isArray(items) ? items.map(normalizeAsset) : []);

  useEffect(() => {
    let unsubscribe;
    const apiMode = isAssetsApiEnabled();

    if (apiMode) {
      const fetchViaApi = async () => {
        try {
          const data = await getAssetsApi();
          setAssets(normalizeAssets(data));
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
          setAssets(normalizeAssets(data));
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
          setAssets(normalizeAssets(data));
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

  const refreshAssetsFromApi = async () => {
    if (!isAssetsApiEnabled()) return;
    const data = await getAssetsApi();
    setAssets(normalizeAssets(data));
  };

  const add = async (asset) => {
    try {
      const id = isAssetsApiEnabled() ? await addAssetApi(asset) : await addAsset(asset);
      if (isAssetsApiEnabled()) {
        await refreshAssetsFromApi();
      }
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
        await refreshAssetsFromApi();
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
        await refreshAssetsFromApi();
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
