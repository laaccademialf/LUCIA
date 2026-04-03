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
  subscribeToAssetsEventsApi,
  updateAssetApi,
} from "../api/assetsApi";

/**
 * Хук для роботи з активами (основними засобами) з Firestore
 * Підтримує realtime оновлення
 */
export const useAssets = (enableRealtime = true) => {
  const [assets, setAssets] = useState(() => {
    try {
      const cached = sessionStorage.getItem("lucia_assets_cache");
      if (cached) return JSON.parse(cached);
    } catch { /* ignore */ }
    return [];
  });
  const [loading, setLoading] = useState(() => {
    try { return !sessionStorage.getItem("lucia_assets_cache"); } catch { return true; }
  });
  const [error, setError] = useState(null);
  const apiPollIntervalMs = Math.max(
    1000,
    Number(import.meta.env.VITE_ASSETS_API_POLL_INTERVAL_MS || 1000) || 1000
  );

  const snakeToCamel = (value) => String(value || "").replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());

  const parseJsonIfNeeded = (value) => {
    if (typeof value !== "string") return value;
    const text = value.trim();
    if (!text) return value;
    if (!(text.startsWith("{") || text.startsWith("["))) return value;
    try {
      return JSON.parse(text);
    } catch {
      return value;
    }
  };

  const buildNestedFromFlat = (item, camelKey, snakePrefix) => {
    const direct = item?.[camelKey];
    if (direct && typeof direct === "object") return direct;

    const flatContainer = parseJsonIfNeeded(item?.[snakePrefix]);
    if (flatContainer && typeof flatContainer === "object") return flatContainer;

    const nested = {};
    const prefix = `${snakePrefix}_`;
    Object.entries(item || {}).forEach(([key, rawValue]) => {
      if (!String(key || "").startsWith(prefix)) return;
      const nestedKey = snakeToCamel(String(key).slice(prefix.length));
      nested[nestedKey] = parseJsonIfNeeded(rawValue);
    });

    return Object.keys(nested).length > 0 ? nested : null;
  };

  const normalizeAsset = (item) => {
    if (!item || typeof item !== "object") return item;

    const invNumber = String(item.invNumber || item.inv_number || "").trim();
    const invNumber1C = String(item.invNumber1C || item.inv_number_1c || item.inv_number1_c || "").trim();

    const transferRequest = buildNestedFromFlat(item, "transferRequest", "transfer_request");
    const writeOffRequest = buildNestedFromFlat(item, "writeOffRequest", "write_off_request");
    const employeeUsage = buildNestedFromFlat(item, "employeeUsage", "employee_usage");

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
      transferRequest,
      writeOffRequest,
      employeeUsage,
      transferHistory: item.transferHistory || item.transfer_history || [],
      employeeUsageHistory: item.employeeUsageHistory || item.employee_usage_history || [],
    };
  };

  const normalizeAssets = (items) => (Array.isArray(items) ? items.map(normalizeAsset) : []);

  const setAssetsAndCache = (items) => {
    const normalized = normalizeAssets(items);
    setAssets(normalized);
    try {
      sessionStorage.setItem("lucia_assets_cache", JSON.stringify(normalized));
    } catch { /* quota exceeded — ignore */ }
  };

  useEffect(() => {
    let unsubscribe;
    let unsubscribeAssetsEvents;
    let pollTimer;
    let isStopped = false;
    let isRequestInFlight = false;
    const apiMode = isAssetsApiEnabled();

    if (apiMode) {
      const startPollingFallback = () => {
        if (!enableRealtime || pollTimer) return;
        pollTimer = setInterval(() => {
          void fetchViaApi();
        }, Math.max(apiPollIntervalMs, 5000));
      };

      const fetchViaApi = async ({ lite = false } = {}) => {
        if (isStopped || isRequestInFlight) return;
        isRequestInFlight = true;
        try {
          const data = await getAssetsApi({ lite });
          if (isStopped) return;
          setAssetsAndCache(data);
          setError(null);
          setLoading(false);
        } catch (err) {
          if (isStopped) return;
          console.error("Помилка завантаження активів через API:", err);
          setError(err);
          setLoading(false);
        } finally {
          isRequestInFlight = false;
        }
      };

      // Fast initial load: lite first, then full in background
      (async () => {
        await fetchViaApi({ lite: true });
        if (!isStopped) {
          await fetchViaApi({ lite: false });
        }
      })();

      if (enableRealtime) {
        const canUseSse = typeof window !== "undefined" && typeof EventSource !== "undefined";
        if (canUseSse) {
          unsubscribeAssetsEvents = subscribeToAssetsEventsApi({
            onChange: () => {
              void fetchViaApi();
            },
            onError: () => {
              // Network/proxy issues may break SSE; fallback keeps data fresh.
              startPollingFallback();
            },
          });
        } else {
          startPollingFallback();
        }
      }

      return () => {
        isStopped = true;
        if (unsubscribeAssetsEvents) {
          unsubscribeAssetsEvents();
        }
        if (pollTimer) {
          clearInterval(pollTimer);
        }
      };
    }
    
    if (enableRealtime) {
      // Realtime підписка
      try {
        unsubscribe = subscribeToAssets((data) => {
          setAssetsAndCache(data);
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
          setAssetsAndCache(data);
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
      isStopped = true;
      if (pollTimer) {
        clearInterval(pollTimer);
      }
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [enableRealtime, apiPollIntervalMs]);

  const refreshAssetsFromApi = async () => {
    if (!isAssetsApiEnabled()) return;
    const data = await getAssetsApi();
    setAssetsAndCache(data);
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
    refreshAssets: refreshAssetsFromApi,
  };
};
