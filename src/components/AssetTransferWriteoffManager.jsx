import { useMemo, useState } from "react";
import { Check, Download, Printer, X } from "lucide-react";

const cardClass = "card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl";
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";

const toPositiveNumber = (value, fallback = 1) => {
  const normalized = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) && num > 0 ? num : fallback;
};

const toNonNegativeNumber = (value, fallback = 0) => {
  const normalized = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  const num = Number.parseFloat(normalized);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
};

const formatQuantity = (value) => {
  const num = toPositiveNumber(value, 0);
  if (!Number.isFinite(num)) return "0";
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
};

const formatDateTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("uk-UA");
};

const hasFinanceApprovalRole = (user) => {
  const role = String(user?.role || "").toLowerCase();
  const workRole = String(user?.workRole || "").toLowerCase();
  const terms = ["finance", "financial", "фін", "директор", "cfo"];
  return user?.role === "admin" || terms.some((term) => role.includes(term) || workRole.includes(term));
};

const toNormalizedId = (value) => String(value || "");
const toLower = (value) => String(value || "").trim().toLowerCase();

const VALID_TRANSFER_STATUSES = new Set(["pending", "approved", "rejected"]);
const VALID_WRITEOFF_STATUSES = new Set(["pending", "approved", "rejected"]);
const VALID_USAGE_STATUSES = new Set(["active", "returned"]);

const hasValidTransferRequest = (request) => {
  if (!request || typeof request !== "object") return false;
  const status = toLower(request?.status);
  if (!VALID_TRANSFER_STATUSES.has(status)) return false;
  return Boolean(request?.requestedAt || request?.approvedAt || request?.rejectedAt);
};

const hasValidWriteOffRequest = (request) => {
  if (!request || typeof request !== "object") return false;
  const status = toLower(request?.status);
  if (!VALID_WRITEOFF_STATUSES.has(status)) return false;
  return Boolean(request?.requestedAt || request?.approvedAt || request?.rejectedAt);
};

const hasValidEmployeeUsage = (usage) => {
  if (!usage || typeof usage !== "object") return false;
  const status = toLower(usage?.status || "active");
  if (!VALID_USAGE_STATUSES.has(status)) return false;
  return Boolean(usage?.assignedAt || usage?.returnedAt);
};

const generateInvNumberByRestaurant = (restaurant, allAssets) => {
  const prefix = String(restaurant?.regNumber || "").substring(0, 3);
  if (!prefix) return "";

  const destinationAssets = allAssets.filter((item) => String(item?.locationName || "") === String(restaurant?.name || ""));
  let maxSuffix = 0;

  destinationAssets.forEach((item) => {
    const inv = String(item?.invNumber || "");
    if (!inv.startsWith(prefix)) return;
    const suffix = Number.parseInt(inv.slice(prefix.length), 10);
    if (Number.isFinite(suffix) && suffix > maxSuffix) {
      maxSuffix = suffix;
    }
  });

  return `${prefix}${String(maxSuffix + 1).padStart(6, "0")}`;
};

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&#39;");

function openPrintDocument({ title, bodyHtml }) {
  const printWindow = window.open("", "_blank", "width=980,height=760");
  if (!printWindow) {
    throw new Error("Не вдалося відкрити вікно друку. Дозвольте pop-up у браузері.");
  }

  const html = `
<!doctype html>
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 20px; margin-bottom: 10px; font-size: 13px; }
      .meta > div { word-break: break-word; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
      th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; word-break: break-word; }
      th { background: #f8fafc; }
      .signatures { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
      .line { margin-top: 28px; border-bottom: 1px solid #334155; }
      .hint { margin-top: 8px; font-size: 11px; color: #475569; }
    </style>
  </head>
  <body>
    ${bodyHtml}
    <div class="hint">Якщо друк не стартував — натисніть Ctrl/Cmd+P</div>
    <script>
      setTimeout(() => { window.focus(); window.print(); }, 120);
    </script>
  </body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

export default function AssetTransferWriteoffManager({ assets, restaurants, user, updateAsset, addAsset, deleteAsset, onAuditEvent }) {
  const [assetId, setAssetId] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [isAssetSearchOpen, setIsAssetSearchOpen] = useState(false);
  const [requestType, setRequestType] = useState("transfer");
  const [targetRestaurantId, setTargetRestaurantId] = useState("");
  const [transferQuantity, setTransferQuantity] = useState("1");
  const [employeeName, setEmployeeName] = useState("");
  const [employeePosition, setEmployeePosition] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [processingActionId, setProcessingActionId] = useState("");
  const [hiddenPendingKeys, setHiddenPendingKeys] = useState([]);

  const writeAudit = (payload) => {
    if (typeof onAuditEvent !== "function") return;
    onAuditEvent(payload);
  };

  const myRestaurantId = toNormalizedId(user?.restaurant);
  const myUserIds = useMemo(() => {
    return new Set(
      [user?.uid, user?.id, user?.userId]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    );
  }, [user?.uid, user?.id, user?.userId]);

  const myUserEmails = useMemo(() => {
    return new Set(
      [user?.email]
        .map((value) => toLower(value))
        .filter(Boolean)
    );
  }, [user?.email]);

  const myRestaurantIdentity = useMemo(() => {
    const rawCandidates = [
      user?.restaurant,
      user?.restaurantId,
      user?.restaurant_id,
      user?.restaurantName,
      user?.restaurant_name,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    const matched = restaurants.find((item) => {
      const itemId = String(item?.id || "").trim();
      const itemName = String(item?.name || "").trim();
      return rawCandidates.some((candidate) => candidate === itemId || toLower(candidate) === toLower(itemName));
    });

    const idSet = new Set(rawCandidates);
    const nameSet = new Set(rawCandidates.map((value) => toLower(value)).filter(Boolean));

    if (matched) {
      const matchedId = String(matched?.id || "").trim();
      const matchedName = String(matched?.name || "").trim();
      if (matchedId) idSet.add(matchedId);
      if (matchedName) {
        nameSet.add(toLower(matchedName));
      }
    }

    return { idSet, nameSet };
  }, [restaurants, user?.restaurant, user?.restaurantId, user?.restaurant_id, user?.restaurantName, user?.restaurant_name]);

  const assetsForRequest = useMemo(() => {
    if (user?.role === "admin") return assets;
    const myRestaurantName = restaurants.find((item) => toNormalizedId(item.id) === myRestaurantId)?.name;
    return assets.filter((item) => String(item?.locationName || "") === String(myRestaurantName || ""));
  }, [assets, restaurants, user, myRestaurantId]);

  const selectedAsset = useMemo(() => assets.find((item) => toNormalizedId(item.id) === toNormalizedId(assetId)) || null, [assets, assetId]);

  const filteredAssetsForRequest = useMemo(() => {
    const query = toLower(assetSearch);
    if (!query) return assetsForRequest;

    return assetsForRequest.filter((item) => {
      const pool = [
        item?.invNumber,
        item?.name,
        item?.category,
        item?.subCategory,
        item?.locationName,
        item?.serialNumber,
      ]
        .map((value) => toLower(value))
        .filter(Boolean)
        .join(" ");

      return pool.includes(query);
    });
  }, [assetsForRequest, assetSearch]);

  const handleAssetSelect = (value) => {
    setAssetId(String(value || ""));
  };

  const handleAssetSuggestionPick = (asset) => {
    if (!asset) return;
    handleAssetSelect(asset.id);
    const invNumber = String(asset?.invNumber || "").trim();
    const assetName = String(asset?.name || "").trim();
    setAssetSearch(invNumber && assetName ? `${invNumber} — ${assetName}` : invNumber || assetName);
    setIsAssetSearchOpen(false);
  };

  const clearAssetSearch = () => {
    setAssetSearch("");
    setAssetId("");
    setIsAssetSearchOpen(false);
  };

  const selectedAssetQuantity = useMemo(() => {
    const raw = selectedAsset?.inventoryQuantity;
    return toNonNegativeNumber(raw, 0);
  }, [selectedAsset]);

  const resolvePrimaryRequest = (asset) => {
    const candidates = [];

    if (hasValidTransferRequest(asset?.transferRequest)) {
      const req = asset.transferRequest;
      candidates.push({
        type: "transfer",
        request: req,
        ts: new Date(req?.approvedAt || req?.rejectedAt || req?.requestedAt || 0).getTime() || 0,
      });
    }

    if (hasValidWriteOffRequest(asset?.writeOffRequest)) {
      const req = asset.writeOffRequest;
      candidates.push({
        type: "writeoff",
        request: req,
        ts: new Date(req?.approvedAt || req?.rejectedAt || req?.requestedAt || 0).getTime() || 0,
      });
    }

    if (hasValidEmployeeUsage(asset?.employeeUsage)) {
      const req = asset.employeeUsage;
      candidates.push({
        type: "usage",
        request: req,
        ts: new Date(req?.returnedAt || req?.assignedAt || 0).getTime() || 0,
      });
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.ts - a.ts);
    return candidates[0];
  };

  const pendingForApproval = useMemo(() => {
    const canFinanceApprove = hasFinanceApprovalRole(user);

    const getPendingKey = (asset) => {
      const transfer = asset?.transferRequest;
      const writeOff = asset?.writeOffRequest;

      if (transfer?.status === "pending") {
        return [
          "transfer",
          String(transfer?.requestedById || ""),
          String(transfer?.requestedAt || ""),
          String(transfer?.fromRestaurantId || transfer?.fromRestaurantName || ""),
          String(transfer?.toRestaurantId || transfer?.toRestaurantName || ""),
          String(transfer?.quantity || ""),
          String(asset?.name || ""),
        ].join("|");
      }

      return [
        "writeoff",
        String(asset?.id || ""),
        String(writeOff?.requestedAt || ""),
        String(writeOff?.status || ""),
      ].join("|");
    };

    const items = assets.filter((asset) => {
      const transfer = asset?.transferRequest;
      const writeOff = asset?.writeOffRequest;

      // Бізнес-правило: всі переміщення та списання погоджує фінансовий директор (або admin).
      const transferPendingForMe = transfer?.status === "pending" && canFinanceApprove;

      const writeOffPendingForMe = writeOff?.status === "pending" && canFinanceApprove;

      return transferPendingForMe || writeOffPendingForMe;
    });

    const seen = new Set();
    return items.filter((asset) => {
      const key = getPendingKey(asset);

      if (seen.has(key)) return false;
      if (hiddenPendingKeys.includes(key)) return false;
      seen.add(key);
      return true;
    });
  }, [assets, user, hiddenPendingKeys]);

  const markPendingAsHandled = (asset) => {
    const transfer = asset?.transferRequest;
    const writeOff = asset?.writeOffRequest;
    const key = transfer?.status === "pending"
      ? [
          "transfer",
          String(transfer?.requestedById || ""),
          String(transfer?.requestedAt || ""),
          String(transfer?.fromRestaurantId || transfer?.fromRestaurantName || ""),
          String(transfer?.toRestaurantId || transfer?.toRestaurantName || ""),
          String(transfer?.quantity || ""),
          String(asset?.name || ""),
        ].join("|")
      : [
          "writeoff",
          String(asset?.id || ""),
          String(writeOff?.requestedAt || ""),
          String(writeOff?.status || ""),
        ].join("|");

    if (!key) return;
    setHiddenPendingKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const myRequests = useMemo(() => {
    const canFinanceViewAllTransfers = hasFinanceApprovalRole(user);

    if (canFinanceViewAllTransfers) {
      const allRequests = assets.filter((asset) => Boolean(resolvePrimaryRequest(asset)));
      const seen = new Set();
      return allRequests.filter((asset) => {
        const primary = resolvePrimaryRequest(asset);
        const req = primary?.request || {};
        const key = [
          String(primary?.type || ""),
          String(req?.requestedById || req?.assignedById || ""),
          String(req?.requestedAt || req?.assignedAt || ""),
          String(req?.fromRestaurantId || req?.fromRestaurantName || ""),
          String(req?.toRestaurantId || req?.toRestaurantName || ""),
          String(req?.approvedQuantity || req?.quantity || ""),
          String(asset?.name || ""),
        ].join("|");

        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    const isMineById = (value) => {
      const normalized = String(value || "").trim();
      return Boolean(normalized) && myUserIds.has(normalized);
    };

    const isMineByEmail = (value) => {
      const normalized = toLower(value);
      return Boolean(normalized) && myUserEmails.has(normalized);
    };

    return assets.filter((asset) => {
      const transferByMe = hasValidTransferRequest(asset?.transferRequest)
        && (isMineById(asset?.transferRequest?.requestedById) || isMineByEmail(asset?.transferRequest?.requestedByEmail));
      const writeOffByMe = hasValidWriteOffRequest(asset?.writeOffRequest)
        && (isMineById(asset?.writeOffRequest?.requestedById) || isMineByEmail(asset?.writeOffRequest?.requestedByEmail));
      const usageByMe = hasValidEmployeeUsage(asset?.employeeUsage)
        && (isMineById(asset?.employeeUsage?.assignedById) || isMineByEmail(asset?.employeeUsage?.assignedByEmail));
      return transferByMe || writeOffByMe || usageByMe;
    });
  }, [assets, myUserIds, myUserEmails, user]);

  const activeRestaurants = useMemo(() => {
    if (!selectedAsset) return restaurants;
    return restaurants.filter((item) => String(item.name || "") !== String(selectedAsset.locationName || ""));
  }, [restaurants, selectedAsset]);

  const executeTransfer = async ({ asset, request, actor }) => {
    if (!asset || !request) {
      return { success: false, error: "Некоректні дані переміщення." };
    }

    const destinationRestaurant = restaurants.find((item) => toNormalizedId(item.id) === toNormalizedId(request.toRestaurantId));
    if (!destinationRestaurant) {
      return { success: false, error: "Не знайдено заклад-отримувач." };
    }

    const approverName = actor?.name || user?.displayName || user?.fullName || user?.email || "Користувач";
    const approverId = String(actor?.id || user?.uid || user?.id || user?.userId || "").trim();
    const nowIso = new Date().toISOString();

    const sourceQuantity = toPositiveNumber(asset?.inventoryQuantity, 1);
    const requestedQuantity = Math.min(toPositiveNumber(request?.quantity, sourceQuantity), sourceQuantity);
    const isFullTransfer = requestedQuantity >= sourceQuantity;

    const isMergeCompatibleAsset = (left, right) => {
      const leftSerial = toLower(left?.serialNumber || left?.serial_number);
      const rightSerial = toLower(right?.serialNumber || right?.serial_number);
      if (leftSerial || rightSerial) {
        return Boolean(leftSerial) && leftSerial === rightSerial;
      }

      const comparableKeys = ["name", "category", "subCategory", "type", "brand"];
      return comparableKeys.every((key) => toLower(left?.[key]) === toLower(right?.[key]));
    };

    const destinationMergeCandidate = assets.find((candidate) => {
      if (!candidate || String(candidate?.id || "") === String(asset?.id || "")) return false;
      if (String(candidate?.locationName || "") !== String(request?.toRestaurantName || "")) return false;
      if (candidate?.transferRequest?.status === "pending" || candidate?.writeOffRequest?.status === "pending") return false;
      return isMergeCompatibleAsset(asset, candidate);
    });

    const mergedInvNumber = destinationMergeCandidate?.invNumber || "";
    const newInvNumber = mergedInvNumber || generateInvNumberByRestaurant(destinationRestaurant, assets.filter((item) => item.id !== asset.id));
    if (!newInvNumber) {
      return { success: false, error: "Не вдалося згенерувати новий інвентарний номер для закладу-отримувача." };
    }

    const transferHistoryEntry = {
      fromRestaurantId: request.fromRestaurantId,
      fromRestaurantName: request.fromRestaurantName,
      toRestaurantId: request.toRestaurantId,
      toRestaurantName: request.toRestaurantName,
      movedAt: nowIso,
      movedById: approverId,
      movedByName: approverName,
      oldInvNumber: asset.invNumber,
      newInvNumber,
      quantityMoved: requestedQuantity,
      mergedWithAssetId: destinationMergeCandidate?.id || "",
    };

    if (destinationMergeCandidate) {
      const destinationCurrentQuantity = toPositiveNumber(destinationMergeCandidate?.inventoryQuantity, 1);

      const destinationUpdateResult = await updateAsset(destinationMergeCandidate.id, {
        inventoryQuantity: destinationCurrentQuantity + requestedQuantity,
        transferHistory: [
          ...(Array.isArray(destinationMergeCandidate.transferHistory) ? destinationMergeCandidate.transferHistory : []),
          transferHistoryEntry,
        ],
      });

      if (!destinationUpdateResult?.success) {
        return { success: false, error: "Не вдалося оновити кількість у закладі-отримувачі." };
      }

      if (!isFullTransfer) {
        const sourceUpdateResult = await updateAsset(asset.id, {
          inventoryQuantity: sourceQuantity - requestedQuantity,
          transferRequest: {
            ...request,
            status: "approved",
            approvedAt: nowIso,
            approvedById: approverId,
            approvedByName: approverName,
            acceptedInvNumber: destinationMergeCandidate.invNumber,
            approvedQuantity: requestedQuantity,
            transferMode: "partial-merge",
            mergedIntoAssetId: destinationMergeCandidate.id,
            oldInvNumber: asset.invNumber,
            newInvNumber: destinationMergeCandidate.invNumber,
          },
          transferHistory: [...(Array.isArray(asset.transferHistory) ? asset.transferHistory : []), transferHistoryEntry],
        });

        if (!sourceUpdateResult?.success) {
          return {
            success: false,
            error: "Кількість у закладі-отримувачі оновлено, але не вдалося оновити залишок у закладі-відправнику. Перевірте дані.",
          };
        }

        return {
          success: true,
          message: `Переміщення виконано: ${requestedQuantity} шт. додано до існуючого активу (${destinationMergeCandidate.invNumber}).`,
        };
      }

      const sourceFinalizeResult = await updateAsset(asset.id, {
        transferRequest: {
          ...request,
          status: "approved",
          approvedAt: nowIso,
          approvedById: approverId,
          approvedByName: approverName,
          acceptedInvNumber: destinationMergeCandidate.invNumber,
          approvedQuantity: requestedQuantity,
          transferMode: "full-merge",
          mergedIntoAssetId: destinationMergeCandidate.id,
          oldInvNumber: asset.invNumber,
          newInvNumber: destinationMergeCandidate.invNumber,
        },
        transferHistory: [...(Array.isArray(asset.transferHistory) ? asset.transferHistory : []), transferHistoryEntry],
      });

      if (!sourceFinalizeResult?.success) {
        return { success: false, error: "Кількість у закладі-отримувачі оновлено, але не вдалося зафіксувати стан джерела." };
      }

      if (typeof deleteAsset === "function") {
        const deleteResult = await deleteAsset(asset.id);
        if (!deleteResult?.success) {
          return {
            success: false,
            error: "Кількість об'єднано, але не вдалося видалити вихідний актив. Його можна прибрати вручну.",
          };
        }
      }

      return {
        success: true,
        message: `Переміщення виконано. Кількість об'єднано з існуючим активом (${destinationMergeCandidate.invNumber}).`,
      };
    }

    if (!isFullTransfer) {
      const destinationAssetPayload = {
        ...asset,
        invNumber: newInvNumber,
        locationName: request.toRestaurantName,
        businessUnit: destinationRestaurant.businessUnit || asset.businessUnit || "",
        inventoryQuantity: requestedQuantity,
        transferHistory: [...(Array.isArray(asset.transferHistory) ? asset.transferHistory : []), transferHistoryEntry],
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      delete destinationAssetPayload.id;
      delete destinationAssetPayload.transferRequest;
      delete destinationAssetPayload.writeOffRequest;
      delete destinationAssetPayload.employeeUsage;
      delete destinationAssetPayload.employeeUsageHistory;

      if (typeof addAsset !== "function") {
        return { success: false, error: "Неможливо виконати часткове переміщення: функція створення активу недоступна." };
      }

      const addResult = await addAsset(destinationAssetPayload);
      if (!addResult?.success) {
        return { success: false, error: "Не вдалося створити актив у закладі-отримувачі для часткового переміщення." };
      }

      const sourceUpdateResult = await updateAsset(asset.id, {
        inventoryQuantity: sourceQuantity - requestedQuantity,
        transferRequest: {
          ...request,
          status: "approved",
          approvedAt: nowIso,
          approvedById: approverId,
          approvedByName: approverName,
          acceptedInvNumber: newInvNumber,
          approvedQuantity: requestedQuantity,
          transferMode: "partial",
          oldInvNumber: asset.invNumber,
          newInvNumber,
        },
        transferHistory: [...(Array.isArray(asset.transferHistory) ? asset.transferHistory : []), transferHistoryEntry],
      });

      if (!sourceUpdateResult?.success) {
        return {
          success: false,
          error: "Актив у закладі-отримувачі створено, але не вдалося оновити залишок у закладі-відправнику. Перевірте дані.",
        };
      }

      return {
        success: true,
        message: `Часткове переміщення виконано: ${requestedQuantity} шт. Новий інвентарний номер у закладі-отримувачі: ${newInvNumber}`,
      };
    }

    const result = await updateAsset(asset.id, {
      invNumber: newInvNumber,
      locationName: request.toRestaurantName,
      businessUnit: destinationRestaurant.businessUnit || asset.businessUnit || "",
      transferRequest: {
        ...request,
        status: "approved",
        approvedAt: nowIso,
        approvedById: approverId,
        approvedByName: approverName,
        acceptedInvNumber: newInvNumber,
        approvedQuantity: requestedQuantity,
        transferMode: "full",
        oldInvNumber: asset.invNumber,
        newInvNumber,
      },
      transferHistory: [...(Array.isArray(asset.transferHistory) ? asset.transferHistory : []), transferHistoryEntry],
    });

    if (!result?.success) {
      return { success: false, error: "Не вдалося виконати переміщення." };
    }

    return {
      success: true,
      message: `Переміщення виконано (${requestedQuantity} шт.). Новий інвентарний номер: ${newInvNumber}`,
    };
  };

  const executeWriteOff = async ({ asset, request, actor }) => {
    if (!asset || !request) {
      return { success: false, error: "Некоректні дані списання." };
    }

    const approverName = actor?.name || user?.displayName || user?.fullName || user?.email || "Користувач";
    const approverId = String(actor?.id || user?.uid || user?.id || user?.userId || "").trim();
    const nowIso = new Date().toISOString();

    const sourceQuantity = toPositiveNumber(asset?.inventoryQuantity, 1);
    const requestedQuantity = Math.min(toPositiveNumber(request?.quantity, sourceQuantity), sourceQuantity);
    const remainingQuantity = Math.max(0, sourceQuantity - requestedQuantity);
    const isFullWriteOff = remainingQuantity <= 0;

    const historyEntry = {
      writtenOffAt: nowIso,
      writtenOffById: approverId,
      writtenOffByName: approverName,
      quantityWrittenOff: requestedQuantity,
      sourceQuantity,
      remainingQuantity,
      reason: String(request?.reason || ""),
    };

    const payload = {
      writeOffRequest: {
        ...request,
        status: "approved",
        approvedAt: nowIso,
        approvedById: approverId,
        approvedByName: approverName,
        approvedQuantity: requestedQuantity,
        sourceQuantity,
        remainingQuantity,
        writeOffMode: isFullWriteOff ? "full" : "partial",
      },
      writeOffHistory: [
        ...(Array.isArray(asset?.writeOffHistory) ? asset.writeOffHistory : []),
        historyEntry,
      ],
      inventoryQuantity: remainingQuantity,
    };

    if (isFullWriteOff) {
      payload.status = "Списано";
      payload.decision = "Списати";
    }

    const result = await updateAsset(asset.id, payload);
    if (!result?.success) {
      return { success: false, error: "Не вдалося підтвердити списання." };
    }

    return {
      success: true,
      message: isFullWriteOff
        ? `Списання погоджено: списано весь актив (${formatQuantity(requestedQuantity)} шт.).`
        : `Списання погоджено: списано ${formatQuantity(requestedQuantity)} шт., залишок ${formatQuantity(remainingQuantity)} шт.`,
    };
  };

  const submitRequest = async () => {
    if (!selectedAsset) {
      alert("Оберіть актив.");
      return;
    }

    if ((requestType === "transfer" || requestType === "writeoff" || requestType === "assign") && selectedAssetQuantity <= 0) {
      alert("Цей актив має нульову доступну кількість. Операція недоступна.");
      return;
    }

    const requestedByName = user?.displayName || user?.fullName || user?.email || "Користувач";
    const requestedById = String(user?.uid || user?.id || user?.userId || "").trim();
    const requestedByEmail = String(user?.email || "").trim();
    const nowIso = new Date().toISOString();

    if (requestType === "transfer") {
      if (!targetRestaurantId) {
        alert("Оберіть заклад, куди переміщуємо актив.");
        return;
      }

      const requestedQuantity = Number.parseInt(String(transferQuantity || ""), 10);
      if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
        alert("Вкажіть коректну кількість для переміщення (ціле число більше 0).");
        return;
      }

      if (requestedQuantity > selectedAssetQuantity) {
        alert(`Неможливо перемістити ${requestedQuantity} шт. Доступно: ${selectedAssetQuantity} шт.`);
        return;
      }

      const toRestaurant = restaurants.find((item) => toNormalizedId(item.id) === toNormalizedId(targetRestaurantId));
      if (!toRestaurant) {
        alert("Не вдалося визначити заклад-отримувач.");
        return;
      }

      const fromRestaurant = restaurants.find((item) => String(item.name || "") === String(selectedAsset.locationName || ""));
      const payload = {
        transferRequest: {
          status: "pending",
          requestedAt: nowIso,
          requestedById,
          requestedByEmail,
          requestedByName,
          reason: reason.trim(),
          fromRestaurantId: toNormalizedId(fromRestaurant?.id),
          fromRestaurantName: String(selectedAsset.locationName || ""),
          toRestaurantId: toNormalizedId(toRestaurant.id),
          toRestaurantName: String(toRestaurant.name || ""),
          quantity: requestedQuantity,
          sourceQuantity: selectedAssetQuantity,
          oldInvNumber: String(selectedAsset?.invNumber || ""),
        },
      };

      setSubmitting(true);
      const result = await updateAsset(selectedAsset.id, payload);
      setSubmitting(false);
      if (!result?.success) {
        alert("Не вдалося створити запит на переміщення.");
        return;
      }

      setAssetId("");
      setAssetSearch("");
      setReason("");
      setTransferQuantity("1");
      setTargetRestaurantId("");
      writeAudit({
        action: "transfer_request_create",
        entityType: "transfer_request",
        entityId: String(selectedAsset?.id || ""),
        description: `Створено запит на переміщення (${requestedQuantity} шт.) для активу ${String(selectedAsset?.invNumber || selectedAsset?.name || "")}`,
      });
      alert(`Запит на переміщення (${requestedQuantity} шт.) відправлено на погодження.`);
      return;
    }

    if (requestType === "assign") {
      const normalizedEmployeeName = employeeName.trim();
      if (!normalizedEmployeeName) {
        alert("Вкажіть ПІБ співробітника.");
        return;
      }

      const requestedAssignQuantity = Number.parseInt(String(transferQuantity || ""), 10);
      if (!Number.isFinite(requestedAssignQuantity) || requestedAssignQuantity <= 0) {
        alert("Вкажіть коректну кількість для передачі у користування (ціле число більше 0).");
        return;
      }

      if (requestedAssignQuantity > selectedAssetQuantity) {
        alert(`Неможливо передати ${requestedAssignQuantity} шт. Доступно: ${selectedAssetQuantity} шт.`);
        return;
      }

      const sourceQuantity = toPositiveNumber(selectedAsset?.inventoryQuantity, selectedAssetQuantity);
      const isFullAssign = requestedAssignQuantity >= sourceQuantity;

      const assignmentPayloadBase = {
        status: "active",
        assignedAt: nowIso,
        assignedById: requestedById,
        assignedByEmail: requestedByEmail,
        assignedByName: requestedByName,
        employeeName: normalizedEmployeeName,
        employeePosition: employeePosition.trim(),
        comment: reason.trim(),
        quantity: requestedAssignQuantity,
        sourceQuantity,
      };

      const isMergeCompatibleAsset = (left, right) => {
        const leftSerial = toLower(left?.serialNumber || left?.serial_number);
        const rightSerial = toLower(right?.serialNumber || right?.serial_number);
        if (leftSerial || rightSerial) {
          return Boolean(leftSerial) && leftSerial === rightSerial;
        }

        const comparableKeys = ["name", "category", "subCategory", "type", "brand"];
        return comparableKeys.every((key) => toLower(left?.[key]) === toLower(right?.[key]));
      };

      const usageMergeCandidate = assets.find((candidate) => {
        if (!candidate || String(candidate?.id || "") === String(selectedAsset?.id || "")) return false;
        if (String(candidate?.locationName || "") !== String(selectedAsset?.locationName || "")) return false;
        if (candidate?.transferRequest?.status === "pending" || candidate?.writeOffRequest?.status === "pending") return false;
        if (String(candidate?.employeeUsage?.status || "") !== "active") return false;
        if (toLower(candidate?.employeeUsage?.employeeName) !== toLower(normalizedEmployeeName)) return false;
        if (toLower(candidate?.employeeUsage?.employeePosition) !== toLower(employeePosition.trim())) return false;
        return isMergeCompatibleAsset(selectedAsset, candidate);
      });

      if (usageMergeCandidate) {
        const usageCurrentQuantity = toPositiveNumber(usageMergeCandidate?.inventoryQuantity, 1);
        const mergedResult = await updateAsset(usageMergeCandidate.id, {
          inventoryQuantity: usageCurrentQuantity + requestedAssignQuantity,
          employeeUsage: {
            ...(usageMergeCandidate?.employeeUsage || {}),
            ...assignmentPayloadBase,
            quantity: usageCurrentQuantity + requestedAssignQuantity,
          },
          employeeUsageHistory: [
            ...(Array.isArray(usageMergeCandidate?.employeeUsageHistory) ? usageMergeCandidate.employeeUsageHistory : []),
            assignmentPayloadBase,
          ],
          respPerson: normalizedEmployeeName,
        });

        if (!mergedResult?.success) {
          alert("Не вдалося додати кількість до активу, що вже переданий цьому співробітнику.");
          return;
        }

        if (isFullAssign && typeof deleteAsset === "function") {
          const deleteResult = await deleteAsset(selectedAsset.id);
          if (!deleteResult?.success) {
            alert("Кількість передано, але не вдалося прибрати вихідний актив. Видаліть його вручну.");
            return;
          }
        } else {
          const sourceUpdate = await updateAsset(selectedAsset.id, {
            inventoryQuantity: Math.max(0, sourceQuantity - requestedAssignQuantity),
            respPerson: sourceQuantity - requestedAssignQuantity > 0 ? String(selectedAsset?.respPerson || "") : "",
          });
          if (!sourceUpdate?.success) {
            alert("Кількість передано, але не вдалося оновити залишок вихідного активу.");
            return;
          }
        }

        setAssetId("");
        setAssetSearch("");
        setReason("");
        setTransferQuantity("1");
        setEmployeeName("");
        setEmployeePosition("");
        writeAudit({
          action: "employee_assignment_create",
          entityType: "employee_usage",
          entityId: String(selectedAsset?.id || ""),
          description: `Передано у користування (${requestedAssignQuantity} шт.) для ${normalizedEmployeeName}`,
        });
        alert(`Передано у користування ${requestedAssignQuantity} шт. (додано до існуючого запису співробітника).`);
        return;
      }

      if (isFullAssign) {
        const assignmentPayload = {
          employeeUsage: {
            ...assignmentPayloadBase,
            quantity: sourceQuantity,
          },
          employeeUsageHistory: [
            ...(Array.isArray(selectedAsset?.employeeUsageHistory) ? selectedAsset.employeeUsageHistory : []),
            assignmentPayloadBase,
          ],
          respPerson: normalizedEmployeeName,
        };

        setSubmitting(true);
        const result = await updateAsset(selectedAsset.id, assignmentPayload);
        setSubmitting(false);
        if (!result?.success) {
          alert("Не вдалося передати актив у користування співробітнику.");
          return;
        }
      } else {
        const destinationUsageAsset = {
          ...selectedAsset,
          inventoryQuantity: requestedAssignQuantity,
          employeeUsage: assignmentPayloadBase,
          employeeUsageHistory: [
            ...(Array.isArray(selectedAsset?.employeeUsageHistory) ? selectedAsset.employeeUsageHistory : []),
            assignmentPayloadBase,
          ],
          respPerson: normalizedEmployeeName,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        delete destinationUsageAsset.id;
        delete destinationUsageAsset.transferRequest;
        delete destinationUsageAsset.writeOffRequest;

        if (typeof addAsset !== "function") {
          alert("Неможливо виконати часткову передачу: функція створення активу недоступна.");
          return;
        }

        setSubmitting(true);
        const addResult = await addAsset(destinationUsageAsset);
        if (!addResult?.success) {
          setSubmitting(false);
          alert("Не вдалося створити актив для передачі у користування.");
          return;
        }

        const sourceUpdate = await updateAsset(selectedAsset.id, {
          inventoryQuantity: Math.max(0, sourceQuantity - requestedAssignQuantity),
          respPerson: sourceQuantity - requestedAssignQuantity > 0 ? String(selectedAsset?.respPerson || "") : "",
        });
        setSubmitting(false);
        if (!sourceUpdate?.success) {
          alert("Актив передано у користування частково, але не вдалося оновити залишок джерела.");
          return;
        }
      }

      setAssetId("");
      setAssetSearch("");
      setReason("");
      setTransferQuantity("1");
      setEmployeeName("");
      setEmployeePosition("");
      writeAudit({
        action: "employee_assignment_create",
        entityType: "employee_usage",
        entityId: String(selectedAsset?.id || ""),
        description: `Передано у користування (${requestedAssignQuantity} шт.) для ${normalizedEmployeeName}`,
      });
      alert(`Актив передано у користування співробітнику (${requestedAssignQuantity} шт.).`);
      return;
    }

    const requestedWriteOffQuantity = Number.parseInt(String(transferQuantity || ""), 10);
    if (!Number.isFinite(requestedWriteOffQuantity) || requestedWriteOffQuantity <= 0) {
      alert("Вкажіть коректну кількість для списання (ціле число більше 0).");
      return;
    }

    if (requestedWriteOffQuantity > selectedAssetQuantity) {
      alert(`Неможливо списати ${requestedWriteOffQuantity} шт. Доступно: ${selectedAssetQuantity} шт.`);
      return;
    }

    const writeOffPayload = {
      writeOffRequest: {
        status: "pending",
        requestedAt: nowIso,
        requestedById,
        requestedByEmail,
        requestedByName,
        reason: reason.trim(),
        quantity: requestedWriteOffQuantity,
        sourceQuantity: selectedAssetQuantity,
      },
    };

    setSubmitting(true);
    const result = await updateAsset(selectedAsset.id, writeOffPayload);
    setSubmitting(false);
    if (!result?.success) {
      alert("Не вдалося створити запит на списання.");
      return;
    }

    setAssetId("");
    setAssetSearch("");
    setReason("");
    setEmployeeName("");
    setEmployeePosition("");
    setTransferQuantity("1");
    writeAudit({
      action: "writeoff_request_create",
      entityType: "writeoff_request",
      entityId: String(selectedAsset?.id || ""),
      description: `Створено запит на списання (${requestedWriteOffQuantity} шт.) для активу ${String(selectedAsset?.invNumber || selectedAsset?.name || "")}`,
    });
    alert(`Запит на списання (${requestedWriteOffQuantity} шт.) відправлено на погодження фінансовому директору.`);
  };

  const approveTransfer = async (asset) => {
    const request = asset?.transferRequest;
    if (!request || request.status !== "pending") return;
    const actionKey = `transfer-approve-${String(asset?.id || "")}`;
    if (processingActionId) return;
    setProcessingActionId(actionKey);
    const approverName = user?.displayName || user?.fullName || user?.email || "Користувач";
    const approverId = String(user?.uid || user?.id || user?.userId || "").trim();
    try {
      const result = await executeTransfer({
        asset,
        request,
        actor: {
          id: approverId,
          name: approverName,
          email: user?.email || "",
        },
      });

      if (!result?.success) {
        alert(result?.error || "Не вдалося виконати переміщення.");
        return;
      }

      markPendingAsHandled(asset);
      writeAudit({
        action: "transfer_request_approve",
        entityType: "transfer_request",
        entityId: String(asset?.id || ""),
        description: `Погоджено переміщення для активу ${String(asset?.invNumber || asset?.name || "")}`,
      });
      alert(result?.message || "Переміщення виконано.");
    } finally {
      setProcessingActionId("");
    }
  };

  const rejectTransfer = async (asset) => {
    const request = asset?.transferRequest;
    if (!request || request.status !== "pending") return;
    const actionKey = `transfer-reject-${String(asset?.id || "")}`;
    if (processingActionId) return;
    setProcessingActionId(actionKey);

    const approverName = user?.displayName || user?.fullName || user?.email || "Користувач";
    const nowIso = new Date().toISOString();

    try {
      const result = await updateAsset(asset.id, {
        transferRequest: {
          ...request,
          status: "rejected",
          rejectedAt: nowIso,
          rejectedById: toNormalizedId(user?.uid),
          rejectedByName: approverName,
        },
      });

      if (!result?.success) {
        alert("Не вдалося відхилити переміщення.");
        return;
      }

      markPendingAsHandled(asset);
      writeAudit({
        action: "transfer_request_reject",
        entityType: "transfer_request",
        entityId: String(asset?.id || ""),
        description: `Відхилено переміщення для активу ${String(asset?.invNumber || asset?.name || "")}`,
      });
      alert("Запит на переміщення відхилено.");
    } finally {
      setProcessingActionId("");
    }
  };

  const approveWriteOff = async (asset) => {
    const request = asset?.writeOffRequest;
    if (!request || request.status !== "pending") return;
    const actionKey = `writeoff-approve-${String(asset?.id || "")}`;
    if (processingActionId) return;
    setProcessingActionId(actionKey);

    const approverName = user?.displayName || user?.fullName || user?.email || "Користувач";

    try {
      const result = await executeWriteOff({
        asset,
        request,
        actor: {
          id: toNormalizedId(user?.uid || user?.id || user?.userId),
          name: approverName,
          email: user?.email || "",
        },
      });

      if (!result?.success) {
        alert(result?.error || "Не вдалося підтвердити списання.");
        return;
      }

      markPendingAsHandled(asset);
      writeAudit({
        action: "writeoff_request_approve",
        entityType: "writeoff_request",
        entityId: String(asset?.id || ""),
        description: `Погоджено списання для активу ${String(asset?.invNumber || asset?.name || "")}`,
      });
      alert(result?.message || "Списання підтверджено.");
    } finally {
      setProcessingActionId("");
    }
  };

  const rejectWriteOff = async (asset) => {
    const request = asset?.writeOffRequest;
    if (!request || request.status !== "pending") return;
    const actionKey = `writeoff-reject-${String(asset?.id || "")}`;
    if (processingActionId) return;
    setProcessingActionId(actionKey);

    const approverName = user?.displayName || user?.fullName || user?.email || "Користувач";
    const nowIso = new Date().toISOString();

    try {
      const result = await updateAsset(asset.id, {
        writeOffRequest: {
          ...request,
          status: "rejected",
          rejectedAt: nowIso,
          rejectedById: toNormalizedId(user?.uid),
          rejectedByName: approverName,
        },
      });

      if (!result?.success) {
        alert("Не вдалося відхилити списання.");
        return;
      }

      markPendingAsHandled(asset);
      writeAudit({
        action: "writeoff_request_reject",
        entityType: "writeoff_request",
        entityId: String(asset?.id || ""),
        description: `Відхилено списання для активу ${String(asset?.invNumber || asset?.name || "")}`,
      });
      alert("Запит на списання відхилено.");
    } finally {
      setProcessingActionId("");
    }
  };

  const printTransferAct = (asset) => {
    const request = asset?.transferRequest;
    if (!request) {
      alert("Для цього активу немає запиту на переміщення.");
      return;
    }

    if (String(request?.status || "") !== "approved") {
      alert("Акт переміщення доступний після погодження запиту.");
      return;
    }

    const latestTransfer = Array.isArray(asset?.transferHistory)
      ? [...asset.transferHistory].sort((a, b) => new Date(b?.movedAt || 0).getTime() - new Date(a?.movedAt || 0).getTime())[0]
      : null;

    const oldInvNumber = request?.oldInvNumber || latestTransfer?.oldInvNumber || asset?.invNumber || "-";
    const newInvNumber = request?.acceptedInvNumber || request?.newInvNumber || latestTransfer?.newInvNumber || asset?.invNumber || "-";
    const movedQuantity = toPositiveNumber(
      request?.approvedQuantity || request?.quantity || latestTransfer?.quantityMoved || asset?.inventoryQuantity || 1,
      1
    );

    const unitInitialCost = Number.parseFloat(String(asset?.initialCost || "").replace(/\s+/g, "").replace(",", "."));
    const unitResidualCost = Number.parseFloat(String(asset?.residualValuePerUnit || asset?.residualValue || "").replace(/\s+/g, "").replace(",", "."));
    const quantityNum = Number.parseFloat(String(movedQuantity || "0"));

    const transferValue = Number.isFinite(unitResidualCost) && Number.isFinite(quantityNum)
      ? unitResidualCost * quantityNum
      : Number.isFinite(unitInitialCost) && Number.isFinite(quantityNum)
        ? unitInitialCost * quantityNum
        : null;

    const transferDate = request?.approvedAt || request?.requestedAt || latestTransfer?.movedAt || new Date().toISOString();
    const fromRestaurant = request?.fromRestaurantName || latestTransfer?.fromRestaurantName || "-";
    const toRestaurant = request?.toRestaurantName || latestTransfer?.toRestaurantName || "-";

    const bodyHtml = `
      <h1>Акт приймання-передачі основного засобу</h1>
      <div class="meta">
        <div><strong>Дата:</strong> ${escapeHtml(formatDateTime(transferDate))}</div>
        <div><strong>Актив:</strong> ${escapeHtml(asset?.name || "-")}</div>
        <div><strong>Старий інв. №:</strong> ${escapeHtml(oldInvNumber)}</div>
        <div><strong>Новий інв. №:</strong> ${escapeHtml(newInvNumber)}</div>
        <div><strong>Серійний №:</strong> ${escapeHtml(asset?.serialNumber || "-")}</div>
        <div><strong>Передає:</strong> ${escapeHtml(fromRestaurant)}</div>
        <div><strong>Приймає:</strong> ${escapeHtml(toRestaurant)}</div>
        <div><strong>Кількість:</strong> ${escapeHtml(formatQuantity(movedQuantity))} шт.</div>
        <div><strong>Первісна вартість за од.:</strong> ${escapeHtml(asset?.initialCost || "-")}</div>
        <div><strong>Залишкова вартість за од.:</strong> ${escapeHtml(asset?.residualValuePerUnit || asset?.residualValue || "-")}</div>
        <div><strong>Сума передачі:</strong> ${escapeHtml(transferValue !== null ? transferValue.toFixed(2) : "-")}</div>
        <div><strong>Ініціатор:</strong> ${escapeHtml(request?.requestedByName || "-")}</div>
        <div><strong>Погодив:</strong> ${escapeHtml(request?.approvedByName || "-")}</div>
        <div><strong>Статус:</strong> ${escapeHtml(localizeRequestStatus(request?.status))}</div>
      </div>
      <table>
        <thead><tr><th>Назва</th><th>Категорія</th><th>Стан</th><th>Коментар</th></tr></thead>
        <tbody>
          <tr>
            <td>${escapeHtml(asset?.name || "-")}</td>
            <td>${escapeHtml(asset?.category || "-")}</td>
            <td>${escapeHtml(asset?.condition || "-")}</td>
            <td>${escapeHtml(request?.reason || "")}</td>
          </tr>
        </tbody>
      </table>
      <div class="signatures">
        <div><div>Передав (ПІБ, підпис):</div><div class="line"></div></div>
        <div><div>Прийняв (ПІБ, підпис):</div><div class="line"></div></div>
      </div>
    `;

    openPrintDocument({
      title: "Акт приймання-передачі ОЗ",
      bodyHtml,
    });
  };

  const printWriteOffAct = (asset) => {
    const request = asset?.writeOffRequest;
    if (!request) {
      alert("Для цього активу немає запиту на списання.");
      return;
    }

    const approvedQuantity = toPositiveNumber(request?.approvedQuantity || request?.quantity || asset?.inventoryQuantity || 1, 1);
    const sourceQuantity = toPositiveNumber(request?.sourceQuantity || asset?.inventoryQuantity || approvedQuantity, approvedQuantity);
    const remainingQuantity = Math.max(0, toPositiveNumber(request?.remainingQuantity, Math.max(0, sourceQuantity - approvedQuantity)));

    const unitInitialCost = Number.parseFloat(String(asset?.initialCost || "").replace(/\s+/g, "").replace(",", "."));
    const unitResidualCost = Number.parseFloat(String(asset?.residualValuePerUnit || asset?.residualValue || "").replace(/\s+/g, "").replace(",", "."));
    const writeOffValue = Number.isFinite(unitResidualCost)
      ? unitResidualCost * approvedQuantity
      : Number.isFinite(unitInitialCost)
        ? unitInitialCost * approvedQuantity
        : null;

    const writeOffDate = request?.approvedAt || request?.requestedAt || new Date().toISOString();

    const bodyHtml = `
      <h1>Акт списання основного засобу</h1>
      <div class="meta">
        <div><strong>Дата:</strong> ${escapeHtml(formatDateTime(writeOffDate))}</div>
        <div><strong>Актив:</strong> ${escapeHtml(asset?.name || "-")}</div>
        <div><strong>Інв. №:</strong> ${escapeHtml(asset?.invNumber || "-")}</div>
        <div><strong>Локація:</strong> ${escapeHtml(asset?.locationName || "-")}</div>
        <div><strong>Кількість до списання:</strong> ${escapeHtml(formatQuantity(approvedQuantity))} шт.</div>
        <div><strong>Було в активі:</strong> ${escapeHtml(formatQuantity(sourceQuantity))} шт.</div>
        <div><strong>Залишок після списання:</strong> ${escapeHtml(formatQuantity(remainingQuantity))} шт.</div>
        <div><strong>Первісна вартість за од.:</strong> ${escapeHtml(asset?.initialCost || "-")}</div>
        <div><strong>Залишкова вартість за од.:</strong> ${escapeHtml(asset?.residualValuePerUnit || asset?.residualValue || "-")}</div>
        <div><strong>Сума списання:</strong> ${escapeHtml(writeOffValue !== null ? writeOffValue.toFixed(2) : "-")}</div>
        <div><strong>Ініціатор:</strong> ${escapeHtml(request?.requestedByName || "-")}</div>
        <div><strong>Погодив:</strong> ${escapeHtml(request?.approvedByName || "-")}</div>
        <div><strong>Статус:</strong> ${escapeHtml(localizeRequestStatus(request?.status))}</div>
        <div><strong>Причина:</strong> ${escapeHtml(request?.reason || "-")}</div>
      </div>
      <table>
        <thead><tr><th>Назва</th><th>Категорія</th><th>Серійний номер</th><th>Стан</th></tr></thead>
        <tbody>
          <tr>
            <td>${escapeHtml(asset?.name || "-")}</td>
            <td>${escapeHtml(asset?.category || "-")}</td>
            <td>${escapeHtml(asset?.serialNumber || "-")}</td>
            <td>${escapeHtml(asset?.condition || "-")}</td>
          </tr>
        </tbody>
      </table>
      <div class="signatures">
        <div><div>Комісія (підпис):</div><div class="line"></div></div>
        <div><div>Фінансовий директор (підпис):</div><div class="line"></div></div>
      </div>
    `;

    openPrintDocument({
      title: "Акт списання ОЗ",
      bodyHtml,
    });
  };

  const printEmployeeUsageAct = (asset) => {
    const usage = asset?.employeeUsage;
    if (!usage) {
      alert("Для цього активу немає передачі у користування співробітнику.");
      return;
    }

    const usageQuantity = toPositiveNumber(usage?.quantity || asset?.inventoryQuantity || 1, 1);
    const sourceQuantity = toPositiveNumber(usage?.sourceQuantity || usageQuantity, usageQuantity);
    const unitInitialCost = Number.parseFloat(String(asset?.initialCost || "").replace(/\s+/g, "").replace(",", "."));
    const unitResidualCost = Number.parseFloat(String(asset?.residualValuePerUnit || asset?.residualValue || "").replace(/\s+/g, "").replace(",", "."));
    const usageValue = Number.isFinite(unitResidualCost)
      ? unitResidualCost * usageQuantity
      : Number.isFinite(unitInitialCost)
        ? unitInitialCost * usageQuantity
        : null;

    const bodyHtml = `
      <h1>Акт передачі активу у користування</h1>
      <div class="meta">
        <div><strong>Дата:</strong> ${escapeHtml(formatDateTime(usage?.assignedAt || new Date().toISOString()))}</div>
        <div><strong>Актив:</strong> ${escapeHtml(asset?.name || "-")}</div>
        <div><strong>Інв. №:</strong> ${escapeHtml(asset?.invNumber || "-")}</div>
        <div><strong>Локація:</strong> ${escapeHtml(asset?.locationName || "-")}</div>
        <div><strong>Передав:</strong> ${escapeHtml(usage?.assignedByName || "-")}</div>
        <div><strong>Отримав:</strong> ${escapeHtml(usage?.employeeName || "-")}</div>
        <div><strong>Посада:</strong> ${escapeHtml(usage?.employeePosition || "-")}</div>
        <div><strong>Кількість в акті:</strong> ${escapeHtml(formatQuantity(usageQuantity))} шт.</div>
        <div><strong>Кількість у джерелі:</strong> ${escapeHtml(formatQuantity(sourceQuantity))} шт.</div>
        <div><strong>Первісна вартість за од.:</strong> ${escapeHtml(asset?.initialCost || "-")}</div>
        <div><strong>Залишкова вартість за од.:</strong> ${escapeHtml(asset?.residualValuePerUnit || asset?.residualValue || "-")}</div>
        <div><strong>Сума передачі:</strong> ${escapeHtml(usageValue !== null ? usageValue.toFixed(2) : "-")}</div>
        <div><strong>Статус:</strong> ${escapeHtml(localizeRequestStatus(usage?.status || "active"))}</div>
      </div>
      <table>
        <thead><tr><th>Назва</th><th>Категорія</th><th>Серійний номер</th><th>Кількість</th><th>Коментар</th></tr></thead>
        <tbody>
          <tr>
            <td>${escapeHtml(asset?.name || "-")}</td>
            <td>${escapeHtml(asset?.category || "-")}</td>
            <td>${escapeHtml(asset?.serialNumber || "-")}</td>
            <td>${escapeHtml(formatQuantity(usageQuantity))}</td>
            <td>${escapeHtml(usage?.comment || "-")}</td>
          </tr>
        </tbody>
      </table>
      <div class="signatures">
        <div><div>Передав (ПІБ, підпис):</div><div class="line"></div></div>
        <div><div>Отримав (ПІБ, підпис):</div><div class="line"></div></div>
      </div>
    `;

    openPrintDocument({
      title: "Акт передачі у користування",
      bodyHtml,
    });
  };

  const returnFromEmployeeUsage = async (asset) => {
    const usage = asset?.employeeUsage;
    if (!usage || usage.status !== "active") {
      alert("Актив вже не перебуває в активному користуванні співробітника.");
      return;
    }

    if (!window.confirm(`Повернути актив "${asset?.name || "-"}" з користування співробітника ${usage?.employeeName || "-"}?`)) {
      return;
    }

    const nowIso = new Date().toISOString();
    const returnedByName = user?.displayName || user?.fullName || user?.email || "Користувач";

    const result = await updateAsset(asset.id, {
      employeeUsage: {
        ...usage,
        status: "returned",
        returnedAt: nowIso,
        returnedById: toNormalizedId(user?.uid),
        returnedByName,
      },
      employeeUsageHistory: [
        ...(Array.isArray(asset?.employeeUsageHistory) ? asset.employeeUsageHistory : []),
        {
          ...usage,
          status: "returned",
          returnedAt: nowIso,
          returnedById: toNormalizedId(user?.uid),
          returnedByName,
        },
      ],
      respPerson: "",
    });

    if (!result?.success) {
      alert("Не вдалося оформити повернення з користування.");
      return;
    }

    alert("Актив успішно повернено з користування співробітника.");
  };

  const localizeRequestStatus = (rawStatus) => {
    const status = String(rawStatus || "").trim().toLowerCase();
    if (!status) return "-";
    if (status === "pending") return "Очікує погодження";
    if (status === "approved") return "Погоджено";
    if (status === "rejected") return "Відхилено";
    if (status === "active") return "Активне";
    if (status === "returned") return "Повернено";
    return String(rawStatus || "-");
  };

  const renderRequestStatus = (asset) => {
    const primary = resolvePrimaryRequest(asset);
    if (!primary) return "-";
    if (primary.type === "transfer") return `Переміщення: ${localizeRequestStatus(primary.request?.status)}`;
    if (primary.type === "writeoff") return `Списання: ${localizeRequestStatus(primary.request?.status)}`;
    if (primary.type === "usage") return `Користування: ${localizeRequestStatus(primary.request?.status || "active")}`;
    return "-";
  };

  return (
    <div className="space-y-5">
      <div className={cardClass}>
        <h2 className="text-lg font-semibold">Управління активами: переміщення, списання, користування</h2>
        <p className="mt-1 text-sm text-slate-600">
          Керуючий може переміщати, списувати або передавати актив у користування співробітнику з друком відповідного акту.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-semibold">Актив</label>
            <div className="relative">
              <input
                className={`${inputClass} pr-9`}
                value={assetSearch}
                onFocus={() => setIsAssetSearchOpen(true)}
                onBlur={() => setTimeout(() => setIsAssetSearchOpen(false), 120)}
                onChange={(e) => {
                  setAssetSearch(e.target.value);
                  setAssetId("");
                  setIsAssetSearchOpen(true);
                }}
                placeholder="Пошук: інв. №, назва, категорія..."
              />
              {assetSearch.trim() && (
                <button
                  type="button"
                  aria-label="Очистити пошук активу"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={clearAssetSearch}
                >
                  <X size={14} />
                </button>
              )}
              {isAssetSearchOpen && assetSearch.trim() && (
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-300 bg-white shadow-xl">
                  {filteredAssetsForRequest.length > 0 ? (
                    filteredAssetsForRequest.slice(0, 60).map((item) => (
                      <button
                        key={String(item.id || item.invNumber || item.name)}
                        type="button"
                        className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                        onMouseDown={() => handleAssetSuggestionPick(item)}
                      >
                        <span className="font-semibold">{item.invNumber || "-"}</span>
                        <span className="text-slate-500"> — {item.name || "Без назви"}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-slate-500">Нічого не знайдено</div>
                  )}
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">Знайдено: {filteredAssetsForRequest.length}</p>
            {selectedAsset && (
              <p className="mt-1 text-xs text-emerald-700">Обрано: {selectedAsset.invNumber} — {selectedAsset.name}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-semibold">Дія</label>
            <select className={inputClass} value={requestType} onChange={(e) => setRequestType(e.target.value)}>
              <option value="transfer">Переміщення між закладами</option>
              <option value="writeoff">Списання ОС</option>
              <option value="assign">Передача у користування співробітнику</option>
            </select>
          </div>

          {requestType === "transfer" && (
            <div>
              <label className="text-sm font-semibold">Заклад-отримувач</label>
              <select className={inputClass} value={targetRestaurantId} onChange={(e) => setTargetRestaurantId(e.target.value)}>
                <option value="">Оберіть заклад</option>
                {activeRestaurants.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
          )}

          {(requestType === "transfer" || requestType === "writeoff" || requestType === "assign") && (
            <div>
              <label className="text-sm font-semibold">
                {requestType === "transfer"
                  ? "Кількість до переміщення, шт."
                  : requestType === "assign"
                    ? "Кількість до передачі у користування, шт."
                    : "Кількість до списання, шт."}
              </label>
              <input
                type="number"
                min={1}
                max={selectedAssetQuantity}
                step={1}
                className={inputClass}
                value={transferQuantity}
                onChange={(e) => setTransferQuantity(e.target.value)}
                placeholder="Наприклад: 2"
              />
              <p className="mt-1 text-xs text-slate-500">Доступно в активі: {selectedAssetQuantity} шт.</p>
            </div>
          )}

          {requestType === "assign" && (
            <div>
              <label className="text-sm font-semibold">ПІБ співробітника</label>
              <input
                className={inputClass}
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder="Наприклад: Іваненко Іван"
              />
            </div>
          )}

          {requestType === "assign" && (
            <div>
              <label className="text-sm font-semibold">Посада співробітника</label>
              <input
                className={inputClass}
                value={employeePosition}
                onChange={(e) => setEmployeePosition(e.target.value)}
                placeholder="Наприклад: Офіціант"
              />
            </div>
          )}

          <div className={requestType === "writeoff" ? "md:col-span-2" : ""}>
            <label className="text-sm font-semibold">Причина / коментар</label>
            <textarea
              className={`${inputClass} min-h-[84px]`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                requestType === "transfer"
                  ? "Причина переміщення"
                  : requestType === "assign"
                    ? "Коментар до передачі у користування"
                    : "Підстава для списання"
              }
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={submitRequest}
            className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {submitting ? "Збереження..." : requestType === "assign" ? "Передати у користування" : "Відправити на погодження"}
          </button>
        </div>
      </div>

      <div className={cardClass}>
        <h3 className="text-base font-semibold">Потребують мого погодження</h3>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">Актив</th>
                <th className="px-3 py-2 text-left">Тип</th>
                <th className="px-3 py-2 text-left">Звідки</th>
                <th className="px-3 py-2 text-left">Куди</th>
                <th className="px-3 py-2 text-left">К-сть</th>
                <th className="px-3 py-2 text-left">Ініціатор</th>
                <th className="px-3 py-2 text-left">Коли</th>
                <th className="px-3 py-2 text-left">Дії</th>
              </tr>
            </thead>
            <tbody>
              {pendingForApproval.map((asset) => {
                const transferPending = asset?.transferRequest?.status === "pending";
                const writeOffPending = asset?.writeOffRequest?.status === "pending";
                const transferQuantityLabel = transferPending ? ` (${asset?.transferRequest?.quantity ?? asset?.inventoryQuantity ?? 0} шт.)` : "";
                const writeOffQuantityLabel = writeOffPending ? ` (${asset?.writeOffRequest?.quantity ?? asset?.inventoryQuantity ?? 0} шт.)` : "";
                const typeLabel = transferPending ? `Переміщення${transferQuantityLabel}` : writeOffPending ? `Списання${writeOffQuantityLabel}` : "-";
                const request = transferPending ? asset.transferRequest : asset.writeOffRequest;
                const approveTransferAction = `transfer-approve-${String(asset?.id || "")}`;
                const approveWriteoffAction = `writeoff-approve-${String(asset?.id || "")}`;

                return (
                  <tr key={asset.id} className="border-t border-slate-200">
                    <td className="px-3 py-2">{asset.invNumber} — {asset.name}</td>
                    <td className="px-3 py-2">{typeLabel}</td>
                    <td className="px-3 py-2">{request?.fromRestaurantName || "-"}</td>
                    <td className="px-3 py-2">{request?.toRestaurantName || "-"}</td>
                    <td className="px-3 py-2">{request?.approvedQuantity || request?.quantity || "-"}</td>
                    <td className="px-3 py-2">{request?.requestedByName || "-"}</td>
                    <td className="px-3 py-2">{formatDateTime(request?.requestedAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {transferPending && (
                          <>
                            <button type="button" disabled={Boolean(processingActionId)} onClick={() => approveTransfer(asset)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
                              <Check size={14} /> {processingActionId === approveTransferAction ? "Обробка..." : "Погодити"}
                            </button>
                            <button type="button" disabled={Boolean(processingActionId)} onClick={() => rejectTransfer(asset)} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60">
                              <X size={14} /> Відхилити
                            </button>
                          </>
                        )}
                        {writeOffPending && (
                          <>
                            <button type="button" disabled={Boolean(processingActionId)} onClick={() => approveWriteOff(asset)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
                              <Check size={14} /> {processingActionId === approveWriteoffAction ? "Обробка..." : "Погодити"}
                            </button>
                            <button type="button" disabled={Boolean(processingActionId)} onClick={() => rejectWriteOff(asset)} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60">
                              <X size={14} /> Відхилити
                            </button>
                            <button type="button" onClick={() => printWriteOffAct(asset)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                              <Printer size={14} /> Акт
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pendingForApproval.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">Немає запитів, що очікують вашого погодження.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={cardClass}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Рух активів</h3>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <Download size={14} /> Друк сторінки
          </button>
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">Актив</th>
                <th className="px-3 py-2 text-left">Статус</th>
                <th className="px-3 py-2 text-left">Звідки</th>
                <th className="px-3 py-2 text-left">Куди</th>
                <th className="px-3 py-2 text-left">К-сть</th>
                <th className="px-3 py-2 text-left">Оновлено</th>
                <th className="px-3 py-2 text-left">Документ</th>
              </tr>
            </thead>
            <tbody>
              {myRequests.map((asset) => {
                const primary = resolvePrimaryRequest(asset);
                const isTransfer = primary?.type === "transfer";
                const isWriteOff = primary?.type === "writeoff";
                const isUsage = primary?.type === "usage";
                const request = primary?.request || null;
                const isActiveEmployeeUsage = isUsage && String(asset?.employeeUsage?.status || "") === "active";
                const transferApproved = isTransfer && String(asset?.transferRequest?.status || "") === "approved";
                const canPrintTransferAct = !isTransfer || transferApproved;
                return (
                  <tr key={asset.id} className="border-t border-slate-200">
                    <td className="px-3 py-2">{asset.invNumber} — {asset.name}</td>
                    <td className="px-3 py-2">{renderRequestStatus(asset)}</td>
                    <td className="px-3 py-2">{isTransfer ? (request?.fromRestaurantName || "-") : isUsage ? (asset?.locationName || "-") : "-"}</td>
                    <td className="px-3 py-2">{isTransfer ? (request?.toRestaurantName || "-") : isUsage ? (request?.employeeName || "-") : "-"}</td>
                    <td className="px-3 py-2">{isTransfer ? (request?.approvedQuantity ?? request?.quantity ?? "-") : isWriteOff ? (request?.approvedQuantity ?? request?.quantity ?? "-") : isUsage ? (request?.quantity ?? asset?.inventoryQuantity ?? "-") : "-"}</td>
                    <td className="px-3 py-2">{formatDateTime(request?.approvedAt || request?.rejectedAt || request?.requestedAt || request?.assignedAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {canPrintTransferAct && (
                          <button
                            type="button"
                            onClick={() => (isTransfer ? printTransferAct(asset) : isUsage ? printEmployeeUsageAct(asset) : printWriteOffAct(asset))}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            <Printer size={14} /> Друк акту
                          </button>
                        )}
                        {isActiveEmployeeUsage && (
                          <button
                            type="button"
                            onClick={() => returnFromEmployeeUsage(asset)}
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500"
                          >
                            Повернути з користування
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {myRequests.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">Даних по руху активів поки немає.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
