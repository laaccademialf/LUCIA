// Чисті функції обчислення статусів замовлень/позицій постачальника.
// Винесені з ProductBookingModule.jsx для повторного використання та юніт-тестів.
// НЕ містять залежностей від React — лише чиста логіка.

// Локальна копія toNumber (тривіальна, самодостатня — без ризику розбіжності).
const toNumber = (value) => {
  const normalized = String(value ?? "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Статус відповіді постачальника по одній позиції.
export const getSupplierResponseStatus = (item) => {
  const status = String(item?.supplierResponseStatus || item?.vendorResponseStatus || "").trim().toLowerCase();
  if (status) return status;
  return item?.sentToSupplier ? "pending" : "draft";
};

// Підсумковий статус усього замовлення на основі його позицій.
export const deriveOrderStatus = (items, currentStatus) => {
  if (currentStatus === "completed") return "completed";
  const normalizedItems = Array.isArray(items) ? items : [];
  const hasItems = normalizedItems.length > 0;
  const allZeroQty = hasItems && normalizedItems.every((item) => toNumber(item?.qty) <= 0);
  const hasUnsent = normalizedItems.some((item) => !item.sentToSupplier);
  const hasSent = normalizedItems.some((item) => item.sentToSupplier);
  const hasPendingSupplierResponses = normalizedItems.some((item) => item.sentToSupplier && getSupplierResponseStatus(item) === "pending");
  const hasSupplierIssues = normalizedItems.some((item) => {
    if (!item.sentToSupplier) return false;
    const responseStatus = getSupplierResponseStatus(item);
    return responseStatus === "partial" || responseStatus === "unavailable";
  });

  if (!hasItems) return "new";
  if (allZeroQty) return "completed";
  if (hasSupplierIssues) return "processing";
  if (hasPendingSupplierResponses) return "sent";
  if (!hasUnsent) return "confirmed";
  if (hasSent && hasUnsent) return "processing";
  return "new";
};

// Статус у розрізі позицій ОДНОГО постачальника (для порталу постачальника),
// щоб бейдж не залежав від позицій інших постачальників у тому ж замовленні.
export const getSupplierScopedStatus = (summary = {}) => {
  const total = toNumber(summary.total);
  const pending = toNumber(summary.pending);
  const accepted = toNumber(summary.accepted);
  const partial = toNumber(summary.partial);
  const unavailable = toNumber(summary.unavailable);
  if (total <= 0) return { key: "pending", label: "Очікує відповіді", badge: "bg-slate-100 text-slate-700" };
  if (partial + unavailable > 0) return { key: "issues", label: "Є проблемні позиції", badge: "bg-rose-100 text-rose-700" };
  if (pending > 0) {
    if (accepted > 0) return { key: "partial", label: "Частково опрацьовано", badge: "bg-amber-100 text-amber-700" };
    return { key: "sent", label: "Надіслано постачальнику", badge: "bg-slate-100 text-slate-700" };
  }
  return { key: "confirmed", label: "Підтверджено постачальником", badge: "bg-emerald-100 text-emerald-700" };
};

export const getSupplierResponseLabel = (status) => {
  if (status === "accepted") return "Підтверджено";
  if (status === "partial") return "Частково";
  if (status === "unavailable") return "Немає в наявності";
  if (status === "pending") return "Очікує відповіді";
  if (status === "cancelled_by_supplier") return "Скасовано постачальником";
  return "Чернетка";
};

export const getSupplierResponseBadgeClass = (status) => {
  if (status === "accepted") return "bg-emerald-100 text-emerald-700";
  if (status === "partial") return "bg-amber-100 text-amber-700";
  if (status === "unavailable") return "bg-rose-100 text-rose-700";
  if (status === "pending") return "bg-indigo-100 text-indigo-700";
  if (status === "cancelled_by_supplier") return "bg-slate-200 text-slate-500 line-through";
  return "bg-slate-100 text-slate-600";
};
