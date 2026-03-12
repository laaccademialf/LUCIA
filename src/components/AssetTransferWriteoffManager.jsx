import { useMemo, useState } from "react";
import { Check, Download, Printer, X } from "lucide-react";

const cardClass = "card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl";
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";

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
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; margin-bottom: 10px; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; }
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

export default function AssetTransferWriteoffManager({ assets, restaurants, user, updateAsset, addAsset }) {
  const [assetId, setAssetId] = useState("");
  const [requestType, setRequestType] = useState("transfer");
  const [targetRestaurantId, setTargetRestaurantId] = useState("");
  const [transferQuantity, setTransferQuantity] = useState("1");
  const [employeeName, setEmployeeName] = useState("");
  const [employeePosition, setEmployeePosition] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  const selectedAssetQuantity = useMemo(() => {
    const raw = selectedAsset?.inventoryQuantity;
    const numeric = Number.parseInt(String(raw ?? "1"), 10);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
  }, [selectedAsset]);

  const pendingForApproval = useMemo(() => {
    const canFinanceApprove = hasFinanceApprovalRole(user);
    const isAdminUser = toLower(user?.role) === "admin";

    const isTransferForMyRestaurant = (transfer) => {
      const transferToId = String(transfer?.toRestaurantId || "").trim();
      const transferToName = toLower(transfer?.toRestaurantName);
      if (transferToId && myRestaurantIdentity.idSet.has(transferToId)) return true;
      if (transferToName && myRestaurantIdentity.nameSet.has(transferToName)) return true;
      return false;
    };

    return assets.filter((asset) => {
      const transfer = asset?.transferRequest;
      const writeOff = asset?.writeOffRequest;

      const transferPendingForMe = transfer?.status === "pending" && (
        isAdminUser || isTransferForMyRestaurant(transfer)
      );

      const writeOffPendingForMe = writeOff?.status === "pending" && canFinanceApprove;

      return transferPendingForMe || writeOffPendingForMe;
    });
  }, [assets, user, myRestaurantIdentity]);

  const myRequests = useMemo(() => {
    const isMineById = (value) => {
      const normalized = String(value || "").trim();
      return Boolean(normalized) && myUserIds.has(normalized);
    };

    const isMineByEmail = (value) => {
      const normalized = toLower(value);
      return Boolean(normalized) && myUserEmails.has(normalized);
    };

    return assets.filter((asset) => {
      const transferByMe = isMineById(asset?.transferRequest?.requestedById) || isMineByEmail(asset?.transferRequest?.requestedByEmail);
      const writeOffByMe = isMineById(asset?.writeOffRequest?.requestedById) || isMineByEmail(asset?.writeOffRequest?.requestedByEmail);
      const usageByMe = isMineById(asset?.employeeUsage?.assignedById) || isMineByEmail(asset?.employeeUsage?.assignedByEmail);
      return transferByMe || writeOffByMe || usageByMe;
    });
  }, [assets, myUserIds, myUserEmails]);

  const activeRestaurants = useMemo(() => {
    if (!selectedAsset) return restaurants;
    return restaurants.filter((item) => String(item.name || "") !== String(selectedAsset.locationName || ""));
  }, [restaurants, selectedAsset]);

  const submitRequest = async () => {
    if (!selectedAsset) {
      alert("Оберіть актив.");
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
      setReason("");
      setTransferQuantity("1");
      setTargetRestaurantId("");
      alert(`Запит на переміщення (${requestedQuantity} шт.) відправлено на погодження.`);
      return;
    }

    if (requestType === "assign") {
      const normalizedEmployeeName = employeeName.trim();
      if (!normalizedEmployeeName) {
        alert("Вкажіть ПІБ співробітника.");
        return;
      }

      const assignmentPayload = {
        employeeUsage: {
          status: "active",
          assignedAt: nowIso,
          assignedById: requestedById,
          assignedByEmail: requestedByEmail,
          assignedByName: requestedByName,
          employeeName: normalizedEmployeeName,
          employeePosition: employeePosition.trim(),
          comment: reason.trim(),
        },
        employeeUsageHistory: [
          ...(Array.isArray(selectedAsset?.employeeUsageHistory) ? selectedAsset.employeeUsageHistory : []),
          {
            status: "active",
            assignedAt: nowIso,
            assignedById: requestedById,
            assignedByEmail: requestedByEmail,
            assignedByName: requestedByName,
            employeeName: normalizedEmployeeName,
            employeePosition: employeePosition.trim(),
            comment: reason.trim(),
          },
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

      setAssetId("");
      setReason("");
      setEmployeeName("");
      setEmployeePosition("");
      alert("Актив передано у користування співробітнику.");
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
    setReason("");
    setEmployeeName("");
    setEmployeePosition("");
    alert("Запит на списання відправлено на погодження фінансовому директору.");
  };

  const approveTransfer = async (asset) => {
    const request = asset?.transferRequest;
    if (!request || request.status !== "pending") return;

    const destinationRestaurant = restaurants.find((item) => toNormalizedId(item.id) === toNormalizedId(request.toRestaurantId));
    if (!destinationRestaurant) {
      alert("Не знайдено заклад-отримувач.");
      return;
    }

    const newInvNumber = generateInvNumberByRestaurant(destinationRestaurant, assets.filter((item) => item.id !== asset.id));
    if (!newInvNumber) {
      alert("Не вдалося згенерувати новий інвентарний номер для закладу-отримувача.");
      return;
    }

    const approverName = user?.displayName || user?.fullName || user?.email || "Користувач";
    const nowIso = new Date().toISOString();
    const sourceQuantityRaw = Number.parseInt(String(asset?.inventoryQuantity ?? "1"), 10);
    const sourceQuantity = Number.isFinite(sourceQuantityRaw) && sourceQuantityRaw > 0 ? sourceQuantityRaw : 1;
    const requestedQuantityRaw = Number.parseInt(String(request?.quantity ?? sourceQuantity), 10);
    const requestedQuantity = Number.isFinite(requestedQuantityRaw) && requestedQuantityRaw > 0
      ? Math.min(requestedQuantityRaw, sourceQuantity)
      : sourceQuantity;
    const isFullTransfer = requestedQuantity >= sourceQuantity;

    const transferHistoryEntry = {
      fromRestaurantId: request.fromRestaurantId,
      fromRestaurantName: request.fromRestaurantName,
      toRestaurantId: request.toRestaurantId,
      toRestaurantName: request.toRestaurantName,
      movedAt: nowIso,
      movedById: toNormalizedId(user?.uid),
      movedByName: approverName,
      oldInvNumber: asset.invNumber,
      newInvNumber,
      quantityMoved: requestedQuantity,
    };

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
        alert("Неможливо виконати часткове переміщення: функція створення активу недоступна.");
        return;
      }

      const addResult = await addAsset(destinationAssetPayload);
      if (!addResult?.success) {
        alert("Не вдалося створити актив у закладі-отримувачі для часткового переміщення.");
        return;
      }

      const sourceUpdatePayload = {
        inventoryQuantity: sourceQuantity - requestedQuantity,
        transferRequest: {
          ...request,
          status: "approved",
          approvedAt: nowIso,
          approvedById: toNormalizedId(user?.uid),
          approvedByName: approverName,
          acceptedInvNumber: newInvNumber,
          approvedQuantity: requestedQuantity,
          transferMode: "partial",
        },
        transferHistory: [...(Array.isArray(asset.transferHistory) ? asset.transferHistory : []), transferHistoryEntry],
      };

      const sourceUpdateResult = await updateAsset(asset.id, sourceUpdatePayload);
      if (!sourceUpdateResult?.success) {
        alert("Актив у закладі-отримувачі створено, але не вдалося оновити залишок у закладі-відправнику. Перевірте дані.");
        return;
      }

      alert(`Часткове переміщення підтверджено: ${requestedQuantity} шт. Новий інвентарний номер у закладі-отримувачі: ${newInvNumber}`);
      return;
    }

    const updatePayload = {
      invNumber: newInvNumber,
      locationName: request.toRestaurantName,
      businessUnit: destinationRestaurant.businessUnit || asset.businessUnit || "",
      transferRequest: {
        ...request,
        status: "approved",
        approvedAt: nowIso,
        approvedById: toNormalizedId(user?.uid),
        approvedByName: approverName,
        acceptedInvNumber: newInvNumber,
        approvedQuantity: requestedQuantity,
        transferMode: "full",
      },
      transferHistory: [...(Array.isArray(asset.transferHistory) ? asset.transferHistory : []), transferHistoryEntry],
    };

    const result = await updateAsset(asset.id, updatePayload);
    if (!result?.success) {
      alert("Не вдалося підтвердити переміщення.");
      return;
    }

    alert(`Переміщення підтверджено (${requestedQuantity} шт.). Новий інвентарний номер: ${newInvNumber}`);
  };

  const rejectTransfer = async (asset) => {
    const request = asset?.transferRequest;
    if (!request || request.status !== "pending") return;

    const approverName = user?.displayName || user?.fullName || user?.email || "Користувач";
    const nowIso = new Date().toISOString();

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

    alert("Запит на переміщення відхилено.");
  };

  const approveWriteOff = async (asset) => {
    const request = asset?.writeOffRequest;
    if (!request || request.status !== "pending") return;

    const approverName = user?.displayName || user?.fullName || user?.email || "Користувач";
    const nowIso = new Date().toISOString();

    const result = await updateAsset(asset.id, {
      status: "Списано",
      decision: "Списати",
      writeOffRequest: {
        ...request,
        status: "approved",
        approvedAt: nowIso,
        approvedById: toNormalizedId(user?.uid),
        approvedByName: approverName,
      },
    });

    if (!result?.success) {
      alert("Не вдалося підтвердити списання.");
      return;
    }

    alert("Списання підтверджено. Статус активу змінено на 'Списано'.");
  };

  const rejectWriteOff = async (asset) => {
    const request = asset?.writeOffRequest;
    if (!request || request.status !== "pending") return;

    const approverName = user?.displayName || user?.fullName || user?.email || "Користувач";
    const nowIso = new Date().toISOString();

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

    alert("Запит на списання відхилено.");
  };

  const printTransferAct = (asset) => {
    const request = asset?.transferRequest;
    if (!request) {
      alert("Для цього активу немає запиту на переміщення.");
      return;
    }

    const bodyHtml = `
      <h1>Акт приймання-передачі основного засобу</h1>
      <div class="meta">
        <div><strong>Дата:</strong> ${escapeHtml(formatDateTime(new Date().toISOString()))}</div>
        <div><strong>Актив:</strong> ${escapeHtml(asset?.name || "-")}</div>
        <div><strong>Інв. № (поточний):</strong> ${escapeHtml(asset?.invNumber || "-")}</div>
        <div><strong>Серійний №:</strong> ${escapeHtml(asset?.serialNumber || "-")}</div>
        <div><strong>Передає:</strong> ${escapeHtml(request?.fromRestaurantName || asset?.locationName || "-")}</div>
        <div><strong>Приймає:</strong> ${escapeHtml(request?.toRestaurantName || "-")}</div>
        <div><strong>Кількість:</strong> ${escapeHtml(request?.quantity || asset?.inventoryQuantity || 1)} шт.</div>
        <div><strong>Ініціатор:</strong> ${escapeHtml(request?.requestedByName || "-")}</div>
        <div><strong>Статус погодження:</strong> ${escapeHtml(request?.status || "-")}</div>
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

    const bodyHtml = `
      <h1>Акт списання основного засобу</h1>
      <div class="meta">
        <div><strong>Дата:</strong> ${escapeHtml(formatDateTime(new Date().toISOString()))}</div>
        <div><strong>Актив:</strong> ${escapeHtml(asset?.name || "-")}</div>
        <div><strong>Інв. №:</strong> ${escapeHtml(asset?.invNumber || "-")}</div>
        <div><strong>Локація:</strong> ${escapeHtml(asset?.locationName || "-")}</div>
        <div><strong>Ініціатор:</strong> ${escapeHtml(request?.requestedByName || "-")}</div>
        <div><strong>Погодив:</strong> ${escapeHtml(request?.approvedByName || "-")}</div>
        <div><strong>Статус:</strong> ${escapeHtml(request?.status || "-")}</div>
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
        <div><strong>Статус:</strong> ${escapeHtml(usage?.status || "active")}</div>
      </div>
      <table>
        <thead><tr><th>Назва</th><th>Категорія</th><th>Серійний номер</th><th>Коментар</th></tr></thead>
        <tbody>
          <tr>
            <td>${escapeHtml(asset?.name || "-")}</td>
            <td>${escapeHtml(asset?.category || "-")}</td>
            <td>${escapeHtml(asset?.serialNumber || "-")}</td>
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

  const renderRequestStatus = (asset) => {
    const transfer = asset?.transferRequest;
    const writeOff = asset?.writeOffRequest;
    const employeeUsage = asset?.employeeUsage;

    if (transfer) return `Переміщення: ${transfer.status || "-"}`;
    if (writeOff) return `Списання: ${writeOff.status || "-"}`;
    if (employeeUsage) return `Користування: ${employeeUsage.status || "active"}`;
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
            <select className={inputClass} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value="">Оберіть актив</option>
              {assetsForRequest.map((item) => (
                <option key={item.id} value={item.id}>{item.invNumber} — {item.name}</option>
              ))}
            </select>
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

          {requestType === "transfer" && (
            <div>
              <label className="text-sm font-semibold">Кількість до переміщення, шт.</label>
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
                <th className="px-3 py-2 text-left">Ініціатор</th>
                <th className="px-3 py-2 text-left">Коли</th>
                <th className="px-3 py-2 text-left">Дії</th>
              </tr>
            </thead>
            <tbody>
              {pendingForApproval.map((asset) => {
                const transferPending = asset?.transferRequest?.status === "pending";
                const writeOffPending = asset?.writeOffRequest?.status === "pending";
                const transferQuantityLabel = transferPending ? ` (${asset?.transferRequest?.quantity || asset?.inventoryQuantity || 1} шт.)` : "";
                const typeLabel = transferPending ? `Переміщення${transferQuantityLabel}` : writeOffPending ? "Списання" : "-";
                const request = transferPending ? asset.transferRequest : asset.writeOffRequest;

                return (
                  <tr key={asset.id} className="border-t border-slate-200">
                    <td className="px-3 py-2">{asset.invNumber} — {asset.name}</td>
                    <td className="px-3 py-2">{typeLabel}</td>
                    <td className="px-3 py-2">{request?.requestedByName || "-"}</td>
                    <td className="px-3 py-2">{formatDateTime(request?.requestedAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {transferPending && (
                          <>
                            <button type="button" onClick={() => approveTransfer(asset)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500">
                              <Check size={14} /> Погодити
                            </button>
                            <button type="button" onClick={() => rejectTransfer(asset)} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100">
                              <X size={14} /> Відхилити
                            </button>
                            <button type="button" onClick={() => printTransferAct(asset)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                              <Printer size={14} /> Акт
                            </button>
                          </>
                        )}
                        {writeOffPending && (
                          <>
                            <button type="button" onClick={() => approveWriteOff(asset)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500">
                              <Check size={14} /> Погодити
                            </button>
                            <button type="button" onClick={() => rejectWriteOff(asset)} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100">
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
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">Немає запитів, що очікують вашого погодження.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={cardClass}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Мої запити</h3>
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
                <th className="px-3 py-2 text-left">Оновлено</th>
                <th className="px-3 py-2 text-left">Документ</th>
              </tr>
            </thead>
            <tbody>
              {myRequests.map((asset) => {
                const isTransfer = Boolean(asset?.transferRequest);
                const isWriteOff = Boolean(asset?.writeOffRequest);
                const isUsage = Boolean(asset?.employeeUsage);
                const request = isTransfer ? asset.transferRequest : isWriteOff ? asset.writeOffRequest : asset.employeeUsage;
                const isActiveEmployeeUsage = isUsage && String(asset?.employeeUsage?.status || "") === "active";
                return (
                  <tr key={asset.id} className="border-t border-slate-200">
                    <td className="px-3 py-2">{asset.invNumber} — {asset.name}</td>
                    <td className="px-3 py-2">{renderRequestStatus(asset)}</td>
                    <td className="px-3 py-2">{formatDateTime(request?.approvedAt || request?.rejectedAt || request?.requestedAt || request?.assignedAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => (isTransfer ? printTransferAct(asset) : isUsage ? printEmployeeUsageAct(asset) : printWriteOffAct(asset))}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          <Printer size={14} /> Друк акту
                        </button>
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
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">Ваших запитів поки немає.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
