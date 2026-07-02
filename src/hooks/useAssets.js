import { useState, useEffect, useCallback, useRef } from "react";
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
import { subscribeToAuthChanges } from "../firebase/auth";

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
  const lastAssetsSignatureRef = useRef("");
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

  // Lightweight signature to skip identical updates from polling/SSE.
  // Significantly reduces re-renders of heavy memos (filters, counters, columns)
  // in AssetTable when the server returns unchanged data.
  const computeAssetsSignature = (items) => {
    if (!Array.isArray(items) || items.length === 0) return `0:`;
    let sig = `${items.length}:`;
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i] || {};
      // Include heavy-array lengths so the lite payload (which strips them)
      // does not produce the same signature as the full payload — otherwise
      // the full response would be silently deduped and history fields
      // (e.g. inventoryChangeHistory) would never reach the UI.
      const invLen = Array.isArray(it.inventoryChangeHistory)
        ? it.inventoryChangeHistory.length
        : Array.isArray(it.inventory_change_history)
          ? it.inventory_change_history.length
          : 0;
      const trLen = Array.isArray(it.transferHistory)
        ? it.transferHistory.length
        : Array.isArray(it.transfer_history)
          ? it.transfer_history.length
          : 0;
      const euLen = Array.isArray(it.employeeUsageHistory)
        ? it.employeeUsageHistory.length
        : Array.isArray(it.employee_usage_history)
          ? it.employee_usage_history.length
          : 0;
      sig += `${it.id || ""}|${it.updatedAt || it.updated_at || ""}|${invLen}.${trLen}.${euLen};`;
    }
    return sig;
  };

  const setAssetsAndCache = (items) => {
    const normalized = normalizeAssets(items);
    const nextSig = computeAssetsSignature(normalized);
    if (nextSig === lastAssetsSignatureRef.current) {
      // No structural change — skip state update to avoid downstream re-renders.
      return;
    }
    lastAssetsSignatureRef.current = nextSig;
    setAssets(normalized);
    try {
      sessionStorage.setItem("lucia_assets_cache", JSON.stringify(normalized));
    } catch { /* quota exceeded — ignore */ }
  };

  const mutateAssetsAndCache = useCallback((updater) => {
    setAssets((prev) => {
      const base = Array.isArray(prev) ? prev : [];
      const nextItems = typeof updater === "function" ? updater(base) : updater;
      const normalized = normalizeAssets(nextItems);
      try {
        sessionStorage.setItem("lucia_assets_cache", JSON.stringify(normalized));
      } catch { /* quota exceeded — ignore */ }
      return normalized;
    });
  }, []);

  useEffect(() => {
    let unsubscribe;
    let unsubscribeAssetsEvents;
    let unsubscribeAuthForRefresh;
    let lastAuthUserId = null;
    let pollTimer;
    let isStopped = false;
    // Independent locks so an initial lite fetch and a parallel full fetch
    // (or a polling refresh) don't block each other.
    const inFlight = { lite: false, full: false };
    // Once a full payload has been applied, ignore any later lite response
    // (e.g. from a race during the initial parallel load) so we don't replace
    // history-rich data with the stripped lite version.
    let fullEverApplied = false;
    const apiMode = isAssetsApiEnabled();

    if (apiMode) {
      const startPollingFallback = () => {
        if (!enableRealtime || pollTimer) return;
        pollTimer = setInterval(() => {
          void fetchViaApi();
        }, Math.max(apiPollIntervalMs, 5000));
      };

      const fetchViaApi = async ({ lite = false } = {}) => {
        const key = lite ? "lite" : "full";
        if (isStopped || inFlight[key]) return;
        inFlight[key] = true;
        try {
          const data = await getAssetsApi({ lite });
          if (isStopped) return;
          // Do not wipe cached assets with an empty response that may come back
          // from the server while the session token is missing (e.g. right after
          // logout but before re-login completes).
          const hasToken = (() => {
            try {
              return Boolean(
                typeof localStorage !== "undefined" &&
                  localStorage.getItem("lucia_auth_session_token")
              );
            } catch { return true; }
          })();
          if (!hasToken && Array.isArray(data) && data.length === 0) {
            setLoading(false);
            return;
          }
          // When the lite and full requests race, don't let a late lite
          // response overwrite the richer full payload with stripped data.
          if (lite && fullEverApplied) {
            setLoading(false);
            return;
          }
          setAssetsAndCache(data);
          if (!lite) fullEverApplied = true;
          setError(null);
          setLoading(false);
        } catch (err) {
          if (isStopped) return;
          console.error("Помилка завантаження активів через API:", err);
          setError(err);
          setLoading(false);
        } finally {
          inFlight[key] = false;
        }
      };

      // Fast initial load: lite first for instant first paint, full fetch
      // started in parallel so the inventory-history-dependent UI (counters,
      // "проінвентаризовані" filter) lights up as soon as possible.
      (async () => {
        const fullPromise = fetchViaApi({ lite: false });
        try {
          await fetchViaApi({ lite: true });
        } catch { /* errors already logged by fetchViaApi */ }
        // Ensure full fetch finishes / errors are awaited so cleanup is clean.
        await fullPromise.catch(() => {});
      })();

      if (enableRealtime) {
        const canUseSse = typeof window !== "undefined" && typeof EventSource !== "undefined";
        const startSse = () => {
          if (!canUseSse) {
            startPollingFallback();
            return;
          }
          if (unsubscribeAssetsEvents) {
            unsubscribeAssetsEvents();
            unsubscribeAssetsEvents = null;
          }
          unsubscribeAssetsEvents = subscribeToAssetsEventsApi({
            onChange: () => {
              void fetchViaApi();
            },
            onError: () => {
              // Network/proxy issues may break SSE; fallback keeps data fresh.
              startPollingFallback();
            },
          });
        };
        startSse();

        // Re-fetch immediately when the user logs in (token becomes available).
        // Without this, the list stays empty until the next poll cycle (~5s+)
        // because the previous fetch was made with an empty token.
        try {
          unsubscribeAuthForRefresh = subscribeToAuthChanges((authUser) => {
            const nextId = authUser?.uid || authUser?.id || null;
            const prevId = lastAuthUserId;
            lastAuthUserId = nextId;
            if (nextId && nextId !== prevId) {
              // Force a fresh signature so the change-detection bail-out does
              // not swallow the first post-login response.
              lastAssetsSignatureRef.current = "";
              void fetchViaApi({ lite: true });
              // Перестворюємо SSE-підписку: попередня була відкрита З СТАРИМ/порожнім
              // сесійним токеном і отримувала 401 до перезавантаження сторінки.
              startSse();
            }
          });
        } catch { /* noop */ }
      }

      return () => {
        isStopped = true;
        if (unsubscribeAssetsEvents) {
          unsubscribeAssetsEvents();
        }
        if (unsubscribeAuthForRefresh) {
          unsubscribeAuthForRefresh();
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
      mutateAssetsAndCache((prev) => [
        ...prev,
        {
          ...(asset || {}),
          id,
          createdAt: asset?.createdAt || new Date().toISOString(),
          updatedAt: asset?.updatedAt || new Date().toISOString(),
        },
      ]);
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
        mutateAssetsAndCache((prev) => prev.map((item) => (
          String(item?.id || "") === String(id || "")
            ? {
                ...item,
                ...(data || {}),
                id: String(id || item?.id || ""),
                updatedAt: new Date().toISOString(),
              }
            : item
        )));
      } else {
        await updateAsset(id, data);
        mutateAssetsAndCache((prev) => prev.map((item) => (
          String(item?.id || "") === String(id || "")
            ? {
                ...item,
                ...(data || {}),
                id: String(id || item?.id || ""),
                updatedAt: new Date().toISOString(),
              }
            : item
        )));
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
      mutateAssetsAndCache((prev) => prev.filter((item) => String(item?.id || "") !== String(id || "")));
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
