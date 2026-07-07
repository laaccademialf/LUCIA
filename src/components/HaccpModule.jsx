import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ClipboardCheck,
  Copy,
  Download,
  Image as ImageIcon,
  Images,
  Layers,
  ListChecks,
  Percent,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useHaccp } from "../hooks/useHaccp";
import DatePickerPopover from "./DatePickerPopover";
import DateRangePickerPopover from "./DateRangePickerPopover";
import {
  createCollectionItemApi,
  getCollectionsApiBase,
  isCollectionsApiEnabled,
  listCollectionItemsApi,
  listCollectionItemsConditionalApi,
  updateCollectionItemApi,
} from "../api/collectionsApi";
import { addLegalNotificationApi, isLegalApiEnabled } from "../api/legalTasksApi";
import {
  RATING_BY_VALUE,
  RATING_SCALE,
  buildDefaultHaccpTemplate,
  computeHaccpScores,
  flattenSectionItems,
  getSectionGroups,
  gradeBandFor,
  hasSubsections,
  isCommentRequired,
  isPhotoRequired,
  makeHaccpId,
  roundPercent,
  sumWeights,
  toPositiveNumber,
} from "../data/haccpConstants";

const pdfMakeApi =
  pdfMake && typeof pdfMake?.createPdf === "function"
    ? pdfMake
    : (pdfMake?.default && typeof pdfMake.default.createPdf === "function" ? pdfMake.default : null);

const pdfFontMap =
  (pdfFonts && typeof pdfFonts === "object" && pdfFonts.default ? pdfFonts.default : null) ||
  pdfFonts?.pdfMake?.vfs ||
  pdfFonts;

if (pdfMakeApi) {
  if (typeof pdfMakeApi.addVirtualFileSystem === "function") {
    pdfMakeApi.addVirtualFileSystem(pdfFontMap);
  } else {
    pdfMakeApi.vfs = pdfFontMap;
  }

  if (typeof pdfMakeApi.addFonts === "function") {
    pdfMakeApi.addFonts({
      Roboto: {
        normal: "Roboto-Regular.ttf",
        bold: "Roboto-Medium.ttf",
        italics: "Roboto-Italic.ttf",
        bolditalics: "Roboto-MediumItalic.ttf",
      },
    });
  }
}

const cardClass = "card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl";
const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";
const compactInputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";

const MAX_PHOTOS_PER_ITEM = 5;
const MAX_GALLERY_PHOTOS = 60;
const MAX_PHOTO_SIZE = 15 * 1024 * 1024;
const PHOTO_MAX_DIMENSION = 1280;
const PHOTO_JPEG_QUALITY = 0.68;

const todayDate = () => new Date().toISOString().slice(0, 10);

const toDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// Стискаємо фото на клієнті: зменшуємо розмір і кодуємо у JPEG,
// щоб рядок аудиту в БД залишався компактним навіть за десятків знімків.
const compressImage = (file) =>
  new Promise((resolve) => {
    if (!file?.type?.startsWith("image/") || file.type === "image/gif") {
      toDataUrl(file).then(resolve).catch(() => resolve(null));
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", PHOTO_JPEG_QUALITY);
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      } catch {
        URL.revokeObjectURL(objectUrl);
        toDataUrl(file).then(resolve).catch(() => resolve(null));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      toDataUrl(file).then(resolve).catch(() => resolve(null));
    };
    img.src = objectUrl;
  });

const snapshotAuditTemplate = (template) => {
  if (!template) return null;
  try {
    return JSON.parse(JSON.stringify(template));
  } catch {
    return {
      id: template?.id || "",
      name: template?.name || "",
      sections: Array.isArray(template?.sections) ? template.sections : [],
    };
  }
};

const formatDisplayDate = (value) => {
  if (!value) return "—";

  const text = String(value).trim();
  if (!text) return "—";

  const isoDateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateMatch) {
    const [, year, month, day] = isoDateMatch;
    return `${day}.${month}.${year}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    const day = String(parsed.getDate()).padStart(2, "0");
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const year = parsed.getFullYear();
    return `${day}.${month}.${year}`;
  }

  return text;
};

const normalizeHaccpTab = (tab = "") => {
  const value = String(tab).toLowerCase();
  if (value.includes("report") || value.includes("звіт") || value.includes("reprit")) return "report";
  if (value.includes("templ") || value.includes("шаблон") || value.includes("shablon")) return "templates";
  return "audit";
};

const parseRestaurantScope = (raw) => {
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value || "").trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return [];
    if (text.startsWith("[")) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return parsed.map((value) => String(value || "").trim()).filter(Boolean);
        }
      } catch {
        // noop
      }
    }
    return text.split(",").map((value) => value.trim()).filter(Boolean);
  }
  return [];
};

const getUserRestaurantIds = (user) =>
  Array.from(
    new Set(
      [
        ...parseRestaurantScope(user?.restaurants),
        ...parseRestaurantScope(user?.restaurant_ids),
        ...parseRestaurantScope(user?.restaurantIds),
        String(user?.restaurant || "").trim(),
        String(user?.restaurantId || "").trim(),
        String(user?.restaurant_id || "").trim(),
        String(user?.restaurantName || "").trim(),
        String(user?.restaurant_name || "").trim(),
      ].filter(Boolean)
    )
  );

const restaurantMatchesScope = (restaurant, scopeValue) => {
  const normalizedScope = String(scopeValue || "").trim().toLowerCase();
  if (!normalizedScope) return false;
  return (
    String(restaurant?.id || "").trim().toLowerCase() === normalizedScope ||
    String(restaurant?.name || "").trim().toLowerCase() === normalizedScope
  );
};

const resolveRestaurantIdFromScope = (restaurants, scopeValue) => {
  const match = (Array.isArray(restaurants) ? restaurants : []).find((restaurant) =>
    restaurantMatchesScope(restaurant, scopeValue)
  );
  return String(match?.id || "").trim();
};

const getAuditSortKey = (audit) => {
  const completedAt = Date.parse(String(audit?.completedAt || ""));
  if (Number.isFinite(completedAt)) return completedAt;
  const updatedAt = Date.parse(String(audit?.updatedAt || ""));
  if (Number.isFinite(updatedAt)) return updatedAt;
  const dateTs = Date.parse(String(audit?.date || ""));
  if (Number.isFinite(dateTs)) return dateTs;
  return 0;
};

const scoreTrafficLight = (score) => {
  const value = Number(score) || 0;
  if (value >= 90) return { label: "Зелений", className: "bg-emerald-100 text-emerald-800 border-emerald-300" };
  if (value >= 75) return { label: "Жовтий", className: "bg-amber-100 text-amber-800 border-amber-300" };
  return { label: "Червоний", className: "bg-red-100 text-red-800 border-red-300" };
};

const countCriticalViolations = (responses) =>
  Object.values(responses || {}).reduce((acc, response) => {
    const value = response?.value;
    const rating = value === null || value === undefined ? null : RATING_BY_VALUE[value];
    if (!rating) return acc;
    return rating.value === 0 || rating.value === 1 ? acc + 1 : acc;
  }, 0);

const collectIssueItemIds = (responses) => {
  const ids = new Set();
  Object.entries(responses || {}).forEach(([itemId, response]) => {
    const value = response?.value;
    const rating = value === null || value === undefined ? null : RATING_BY_VALUE[value];
    if (!rating) return;
    if (rating.value === 0 || rating.value === 1) ids.add(String(itemId));
  });
  return ids;
};

const getPhotoSrc = (photo) => String(photo?.url || photo?.dataUrl || "").trim();

// Приводимо джерело зображення (URL або dataURL) до стисненого JPEG dataURL для вставки у PDF.
// Спершу пробуємо fetch → object URL (щоб canvas не «затруївся»), із запасним варіантом через <img>.
// У разі помилки (CORS тощо) повертаємо null, і фото просто не потрапляє у PDF.
const fetchImageObjectUrl = async (src) => {
  try {
    const res = await fetch(src, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
};

const loadPdfImage = async (src, maxWidth = 700) => {
  const source = String(src || "").trim();
  if (!source) return null;

  const isData = source.startsWith("data:");
  // Відносні шляхи (/app/img/...) резолвимо до абсолютних через API base,
  // бо застосунок може працювати на іншому origin, ніж бекенд із медіа.
  let resolved = source;
  if (!isData && source.startsWith("/")) {
    const base = String(getCollectionsApiBase() || "").replace(/\/+$/, "");
    if (base) resolved = `${base}${source}`;
  }

  let objectUrl = null;
  let loadSrc = resolved;
  if (!isData) {
    objectUrl = await fetchImageObjectUrl(resolved);
    if (objectUrl) loadSrc = objectUrl;
  }

  try {
    return await new Promise((resolve) => {
      const img = new Image();
      if (!objectUrl && !isData) img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const naturalW = img.naturalWidth || maxWidth;
          const naturalH = img.naturalHeight || maxWidth;
          const scale = Math.min(1, maxWidth / naturalW);
          const w = Math.max(1, Math.round(naturalW * scale));
          const h = Math.max(1, Math.round(naturalH * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, w, h);
          resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.82), width: w, height: h });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = loadSrc;
    });
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
};

// Кольори заливки клітинки «Оцінка» у PDF за значенням рейтингу.
const PDF_RATING_FILL = {
  2: { fill: "#16a34a", color: "#ffffff" }, // Добре — зелений
  1: { fill: "#f59e0b", color: "#ffffff" }, // Задовільно — жовтий
  0: { fill: "#dc2626", color: "#ffffff" }, // Погано — червоний
  "-1": { fill: "#e2e8f0", color: "#334155" }, // N/A — сірий
};

const getCriticalPlanKey = (auditId, itemId) => `${String(auditId || "")}::${String(itemId || "")}`;
const ACTION_PLANS_COLLECTION = "haccpActionPlans";

const readLocalActionPlans = (storageKey, user) => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }

    const legacyKey = `haccp.report.actionPlan.${String(user?.id || user?.email || "default")}`;
    const legacyRaw = window.localStorage.getItem(legacyKey);
    if (!legacyRaw) return {};
    const legacyParsed = JSON.parse(legacyRaw);
    return legacyParsed && typeof legacyParsed === "object" ? legacyParsed : {};
  } catch {
    return {};
  }
};

const writeLocalActionPlans = (storageKey, plans) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(plans || {}));
  } catch {
    // ignore localStorage write errors
  }
};

const normalizeActionPlanRows = (rows) => {
  const next = {};
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const auditId = String(row?.auditId || "").trim();
    const itemId = String(row?.itemId || "").trim();
    const planKey = String(row?.planKey || getCriticalPlanKey(auditId, itemId)).trim();
    if (!planKey) return;

    next[planKey] = {
      _docId: String(row?.id || row?._docId || "").trim(),
      deadline: String(row?.deadline || "").trim(),
      responsible: String(row?.responsible || "").trim(),
      responsibles: Array.isArray(row?.responsibles)
        ? row.responsibles.map((value) => String(value || "").trim()).filter(Boolean)
        : [],
      responsibleIds: Array.isArray(row?.responsibleIds)
        ? row.responsibleIds.map((value) => String(value || "").trim()).filter(Boolean)
        : [],
      comment: String(row?.comment || "").trim(),
      status: String(row?.status || "in_progress").trim() || "in_progress",
      auditId,
      auditLabel: String(row?.auditLabel || "").trim(),
      itemId,
      itemTitle: String(row?.itemTitle || row?.title || "").trim(),
      violationComment: String(row?.violationComment || "").trim(),
      restaurantId: String(row?.restaurantId || "").trim(),
      restaurantName: String(row?.restaurantName || "").trim(),
      updatedAt: String(row?.updatedAt || "").trim(),
      createdAt: String(row?.createdAt || "").trim(),
    };
  });
  return next;
};

const buildActionPlanRowPayload = (planKey, plan) => ({
  planKey: String(planKey || "").trim(),
  deadline: String(plan?.deadline || "").trim(),
  responsible: String(plan?.responsible || "").trim(),
  responsibles: Array.isArray(plan?.responsibles) ? plan.responsibles.map((value) => String(value || "").trim()).filter(Boolean) : [],
  responsibleIds: Array.isArray(plan?.responsibleIds) ? plan.responsibleIds.map((value) => String(value || "").trim()).filter(Boolean) : [],
  comment: String(plan?.comment || "").trim(),
  status: String(plan?.status || "in_progress").trim() || "in_progress",
  auditId: String(plan?.auditId || "").trim(),
  auditLabel: String(plan?.auditLabel || "").trim(),
  itemId: String(plan?.itemId || "").trim(),
  itemTitle: String(plan?.itemTitle || "").trim(),
  violationComment: String(plan?.violationComment || "").trim(),
  restaurantId: String(plan?.restaurantId || "").trim(),
  restaurantName: String(plan?.restaurantName || "").trim(),
  updatedAt: String(plan?.updatedAt || new Date().toISOString()).trim(),
  createdAt: String(plan?.createdAt || new Date().toISOString()).trim(),
});

const parseUserRestaurantIds = (userRow) => {
  const raw = userRow?.restaurants ?? userRow?.restaurant_ids ?? userRow?.restaurantIds;
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map((value) => String(value || "").trim()).filter(Boolean)));
  }
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return [];
    if (text.startsWith("[")) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return Array.from(new Set(parsed.map((value) => String(value || "").trim()).filter(Boolean)));
        }
      } catch {
        // noop
      }
    }
    return Array.from(new Set(text.split(",").map((value) => value.trim()).filter(Boolean)));
  }
  const single = String(userRow?.restaurant || userRow?.restaurant_id || userRow?.restaurantId || "").trim();
  return single ? [single] : [];
};

const getUserDisplayLabel = (userRow) => {
  const name = String(userRow?.displayName || userRow?.display_name || userRow?.name || "").trim();
  const email = String(userRow?.email || userRow?.user_email || "").trim();
  if (name && email) return `${name} (${email})`;
  return name || email;
};

const getUserIdentity = (userRow) => {
  const id = String(userRow?.uid || userRow?.id || userRow?.userId || "").trim();
  if (id) return id;
  return String(userRow?.email || userRow?.user_email || "").trim().toLowerCase();
};

const getActorIdentity = (user) =>
  String(user?.uid || user?.id || user?.userId || user?.email || "").trim().toLowerCase();

const isEstablishmentManagerUser = (userRow) => {
  const roleValue = String(userRow?.role || "").toLowerCase();
  const workRoleValue = String(userRow?.workRole || userRow?.work_role || userRow?.work_role_name || "").toLowerCase();
  const positionValue = String(userRow?.position || userRow?.position_name || "").toLowerCase();
  const text = `${roleValue} ${workRoleValue} ${positionValue}`;
  return text.includes("керуюч") || text.includes("manager");
};

function HaccpReportTab({ user, restaurants, templates, audits }) {
  const ALL_LOCATIONS_VALUE = "__ALL__";
  const ALL_TEMPLATES_VALUE = "__ALL_TEMPLATES__";
  const isAdmin = user?.role === "admin";
  const isManager = isEstablishmentManagerUser(user);
  const canCreatePlan = isAdmin || (!isManager && Boolean(user?.role));
  const userRestaurantIds = getUserRestaurantIds(user);

  const availableRestaurants = useMemo(() => {
    const list = Array.isArray(restaurants) ? restaurants : [];
    if (isAdmin) return list;
    if (!userRestaurantIds.length) return list;
    const allowed = new Set(userRestaurantIds.map(String));
    return list.filter((item) => allowed.has(String(item?.id || "")));
  }, [restaurants, isAdmin, userRestaurantIds]);

  const [selectedRestaurantId, setSelectedRestaurantId] = useState(ALL_LOCATIONS_VALUE);
  const [showCriticalDetails, setShowCriticalDetails] = useState(false);
  const [showActionPlanDetails, setShowActionPlanDetails] = useState(false);
  const [galleryLightboxPhoto, setGalleryLightboxPhoto] = useState(null);
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState(ALL_TEMPLATES_VALUE);
  const [actionPlanByItem, setActionPlanByItem] = useState({});
  const [planDialogContext, setPlanDialogContext] = useState(null);
  const [planDialogSource, setPlanDialogSource] = useState("critical");
  const [planDialogDeadline, setPlanDialogDeadline] = useState("");
  const [planDialogResponsible, setPlanDialogResponsible] = useState("");
  const [planDialogResponsibleIds, setPlanDialogResponsibleIds] = useState([]);
  const [planDialogComment, setPlanDialogComment] = useState("");
  const [planDialogStatus, setPlanDialogStatus] = useState("in_progress");
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [selectedAuditId, setSelectedAuditId] = useState("");
  const [usersForResponsible, setUsersForResponsible] = useState([]);
  const [loadingResponsibleUsers, setLoadingResponsibleUsers] = useState(false);
  const actionPlansEtagRef = useRef("");

  const actionPlanStorageKey = useMemo(
    () => "haccp.report.actionPlan",
    []
  );

  const loadActionPlans = async ({ conditional = false, seedLocal = false } = {}) => {
    const localPlans = readLocalActionPlans(actionPlanStorageKey, user);

    if (!isCollectionsApiEnabled()) {
      setActionPlanByItem(localPlans);
      return localPlans;
    }

    try {
      let rows = [];
      if (conditional) {
        const result = await listCollectionItemsConditionalApi(ACTION_PLANS_COLLECTION, actionPlansEtagRef.current);
        if (result?.notModified) return null;
        actionPlansEtagRef.current = String(result?.etag || "").trim();
        rows = Array.isArray(result?.data) ? result.data : [];
      } else {
        rows = await listCollectionItemsApi(ACTION_PLANS_COLLECTION);
        actionPlansEtagRef.current = "";
      }

      let nextPlans = normalizeActionPlanRows(rows);

      if (seedLocal) {
        const missingLocalEntries = Object.entries(localPlans).filter(([planKey]) => !nextPlans[planKey]);
        if (missingLocalEntries.length) {
          for (const [planKey, plan] of missingLocalEntries) {
            await createCollectionItemApi(ACTION_PLANS_COLLECTION, buildActionPlanRowPayload(planKey, plan));
          }
          rows = await listCollectionItemsApi(ACTION_PLANS_COLLECTION);
          nextPlans = normalizeActionPlanRows(rows);
        }
      }

      setActionPlanByItem((prev) => {
        const prevJson = JSON.stringify(prev || {});
        const nextJson = JSON.stringify(nextPlans || {});
        return prevJson === nextJson ? prev : nextPlans;
      });
      writeLocalActionPlans(actionPlanStorageKey, nextPlans);
      return nextPlans;
    } catch (error) {
      console.error("Не вдалося завантажити плани дій HACCP:", error);
      setActionPlanByItem(localPlans);
      return localPlans;
    }
  };

  useEffect(() => {
    if (!planDialogContext) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setPlanDialogContext(null);
        setPlanDialogDeadline("");
        setPlanDialogResponsible("");
        setPlanDialogComment("");
        setPlanDialogStatus("in_progress");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [planDialogContext]);

  useEffect(() => {
    let cancelled = false;
    const loadUsersForResponsible = async () => {
      if (!isCollectionsApiEnabled()) {
        setUsersForResponsible([]);
        return;
      }
      setLoadingResponsibleUsers(true);
      try {
        const rows = await listCollectionItemsApi("users");
        if (!cancelled) setUsersForResponsible(Array.isArray(rows) ? rows : []);
      } catch (error) {
        console.error("Не вдалося завантажити користувачів для плану дій:", error);
        if (!cancelled) setUsersForResponsible([]);
      } finally {
        if (!cancelled) setLoadingResponsibleUsers(false);
      }
    };

    void loadUsersForResponsible();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncPlans = async (options = {}) => {
      const result = await loadActionPlans(options);
      if (cancelled) return;
      return result;
    };

    void syncPlans({ seedLocal: true });

    const interval = setInterval(() => {
      void syncPlans({ conditional: true });
    }, 5000);

    const handleFocus = () => {
      void syncPlans({ conditional: true });
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [actionPlanStorageKey, user]);

  useEffect(() => {
    if (selectedRestaurantId === ALL_LOCATIONS_VALUE) return;
    if (!availableRestaurants.length) {
      setSelectedRestaurantId(ALL_LOCATIONS_VALUE);
      return;
    }
    const exists = availableRestaurants.some((item) => String(item.id) === String(selectedRestaurantId));
    if (!exists) setSelectedRestaurantId(ALL_LOCATIONS_VALUE);
  }, [availableRestaurants, selectedRestaurantId]);

  const auditsByLocation = useMemo(() => {
    const allowedRestaurantIds = new Set(availableRestaurants.map((item) => String(item.id || "")).filter(Boolean));
    return (audits || [])
      .filter((audit) => {
        const auditRestaurantId = String(audit?.restaurantId || "");
        if (!isAdmin && allowedRestaurantIds.size > 0 && !allowedRestaurantIds.has(auditRestaurantId)) return false;
        if (selectedRestaurantId === ALL_LOCATIONS_VALUE) return true;
        return auditRestaurantId === String(selectedRestaurantId || "");
      })
      .sort((a, b) => getAuditSortKey(b) - getAuditSortKey(a));
  }, [audits, availableRestaurants, isAdmin, selectedRestaurantId]);

  const availableTemplateOptions = useMemo(() => {
    const templateNameById = new Map(
      (Array.isArray(templates) ? templates : []).map((template) => [
        String(template?.id || ""),
        String(template?.title || template?.name || "").trim(),
      ])
    );

    const options = new Map();
    (auditsByLocation || []).forEach((audit) => {
      const templateId = String(audit?.templateId || "").trim();
      if (!templateId) return;
      const auditTemplateName = String(audit?.templateName || "").trim();
      const templateName = auditTemplateName || templateNameById.get(templateId) || "Без назви шаблону";
      options.set(templateId, templateName);
    });

    return Array.from(options.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "uk"));
  }, [auditsByLocation, templates]);

  useEffect(() => {
    if (selectedTemplateId === ALL_TEMPLATES_VALUE) return;
    const exists = availableTemplateOptions.some((option) => String(option.id) === String(selectedTemplateId));
    if (!exists) setSelectedTemplateId(ALL_TEMPLATES_VALUE);
  }, [availableTemplateOptions, selectedTemplateId]);

  const availablePeriodBounds = useMemo(() => {
    const dates = auditsByLocation
      .map((audit) => String(audit?.date || "").slice(0, 10))
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
      .sort((a, b) => a.localeCompare(b));
    if (!dates.length) return { min: "", max: "" };
    return { min: dates[0], max: dates[dates.length - 1] };
  }, [auditsByLocation]);

  useEffect(() => {
    const { min, max } = availablePeriodBounds;
    if (!min || !max) {
      if (periodFrom) setPeriodFrom("");
      if (periodTo) setPeriodTo("");
      return;
    }
    if (!periodFrom) setPeriodFrom(min);
    if (!periodTo) setPeriodTo(max);
  }, [availablePeriodBounds, periodFrom, periodTo]);

  const filteredAudits = useMemo(() => {
    const fromCandidate = periodFrom || "";
    const toCandidate = periodTo || "";

    const auditsByLocationAndTemplate = (auditsByLocation || []).filter((audit) => {
      if (selectedTemplateId === ALL_TEMPLATES_VALUE) return true;
      return String(audit?.templateId || "") === String(selectedTemplateId || "");
    });

    if (!fromCandidate && !toCandidate) return auditsByLocationAndTemplate;

    const fromKey = fromCandidate && toCandidate && fromCandidate > toCandidate ? toCandidate : fromCandidate;
    const toKey = fromCandidate && toCandidate && fromCandidate > toCandidate ? fromCandidate : toCandidate;

    return auditsByLocationAndTemplate.filter((audit) => {
      const dayKey = String(audit?.date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return false;
      if (fromKey && dayKey < fromKey) return false;
      if (toKey && dayKey > toKey) return false;
      return true;
    });
  }, [auditsByLocation, periodFrom, periodTo, selectedTemplateId]);

  const templatesById = useMemo(() => {
    const map = new Map();
    (templates || []).forEach((template) => map.set(String(template.id), template));
    return map;
  }, [templates]);

  const auditsForMetrics = filteredAudits;

  const metrics = useMemo(
    () =>
      auditsForMetrics.map((audit) => {
        const responses = audit?.responses && typeof audit.responses === "object" ? audit.responses : {};
        const templateSnapshot = audit?.templateSnapshot && typeof audit.templateSnapshot === "object" ? audit.templateSnapshot : null;
        const template = templateSnapshot || templatesById.get(String(audit?.templateId || "")) || null;
        const computedScore = computeHaccpScores(template, responses).totalPercent;
        const scoreValue = Number(audit?.totalPercent);
        const score = templateSnapshot ? computedScore : Number.isFinite(scoreValue) ? scoreValue : computedScore;
        return {
          ...audit,
          gallery: Array.isArray(audit?.gallery) ? audit.gallery : [],
          score,
          critical: countCriticalViolations(responses),
          responses,
          sortKey: getAuditSortKey(audit),
        };
      }),
    [auditsForMetrics, templatesById]
  );

  const metricsById = useMemo(() => {
    const map = new Map();
    (metrics || []).forEach((item) => {
      map.set(String(item?.id || ""), item);
    });
    return map;
  }, [metrics]);

  const criticalDetails = useMemo(() => {
    return metrics
      .map((audit) => {
        const template = audit?.templateSnapshot && typeof audit.templateSnapshot === "object"
          ? audit.templateSnapshot
          : templatesById.get(String(audit?.templateId || "")) || null;
        const itemTitleById = new Map();
        (template?.sections || []).forEach((section) => {
          flattenSectionItems(section).forEach((item) => {
            itemTitleById.set(String(item?.id || ""), String(item?.title || ""));
          });
        });

        const items = Object.entries(audit?.responses || {})
          .filter(([, response]) => {
            const value = response?.value;
            const rating = value === null || value === undefined ? null : RATING_BY_VALUE[value];
            return Boolean(rating && (rating.value === 0 || rating.value === 1));
          })
          .map(([itemId, response]) => ({
            itemId,
            title: itemTitleById.get(String(itemId)) || `Пункт ${itemId}`,
            violationComment: String(response?.comment || "").trim(),
          }));

        if (!items.length) return null;

        return {
          auditId: String(audit?.id || ""),
          auditLabel: `${formatDisplayDate(audit?.date)} · ${String(audit?.restaurantName || "Локація")}`,
          items,
        };
      })
      .filter(Boolean);
  }, [metrics, templatesById]);

  const criticalItemsFlat = useMemo(
    () =>
      criticalDetails.flatMap((group) =>
        (group?.items || []).map((item) => ({
          planKey: getCriticalPlanKey(group.auditId, item.itemId),
          auditId: String(group.auditId || ""),
          auditLabel: String(group.auditLabel || ""),
          itemId: String(item.itemId || ""),
          itemTitle: String(item.title || "Пункт без назви"),
          violationComment: String(item.violationComment || ""),
        }))
      ),
    [criticalDetails]
  );

  const criticalDialogItems = useMemo(
    () =>
      criticalDetails.flatMap((group) =>
        (group?.items || [])
          .map((entry) => ({
            auditId: String(group.auditId || ""),
            auditLabel: String(group.auditLabel || ""),
            itemId: String(entry?.itemId || ""),
            title: String(entry?.title || "Пункт без назви"),
            violationComment: String(entry?.violationComment || ""),
            hasPlan: Boolean(String(actionPlanByItem?.[getCriticalPlanKey(group.auditId, entry?.itemId)]?.comment || "").trim()),
            status: String(actionPlanByItem?.[getCriticalPlanKey(group.auditId, entry?.itemId)]?.status || "in_progress"),
          }))
          .filter((entry) => entry.status !== "done")
      ),
    [actionPlanByItem, criticalDetails]
  );

  const trendSeries = useMemo(() => [...metrics].sort((a, b) => a.sortKey - b.sortKey), [metrics]);

  const auditOptions = useMemo(
    () =>
      [...metrics]
        .sort((a, b) => Number(b.sortKey || 0) - Number(a.sortKey || 0))
        .map((audit) => ({
          id: String(audit?.id || ""),
          label: `${formatDisplayDate(audit?.date)} · ${String(audit?.restaurantName || "Локація")} · ${String(audit?.templateName || "Без шаблону")}`,
        }))
        .filter((item) => item.id),
    [metrics]
  );

  useEffect(() => {
    if (!auditOptions.length) {
      if (selectedAuditId) setSelectedAuditId("");
      return;
    }
    const exists = auditOptions.some((item) => String(item.id) === String(selectedAuditId || ""));
    if (!exists) setSelectedAuditId(String(auditOptions[0].id));
  }, [auditOptions, selectedAuditId]);

  const selectedAudit = useMemo(
    () => metricsById.get(String(selectedAuditId || "")) || null,
    [metricsById, selectedAuditId]
  );

  const avgScore = metrics.length
    ? roundPercent(metrics.reduce((acc, item) => acc + (Number(item.score) || 0), 0) / metrics.length)
    : 0;
  const traffic = scoreTrafficLight(avgScore);
  const criticalCount = metrics.reduce((acc, item) => acc + (Number(item.critical) || 0), 0);

  const pendingCriticalCount = useMemo(() => {
    return criticalItemsFlat.reduce((acc, item) => {
      const plan = actionPlanByItem?.[item.planKey];
      const isDone = String(plan?.status || "") === "done";
      return isDone ? acc : acc + 1;
    }, 0);
  }, [criticalItemsFlat, actionPlanByItem]);

  const completedCriticalCount = Math.max(0, criticalCount - pendingCriticalCount);
  const showCompletedCriticalMetrics =
    availableRestaurants.length >= 2 &&
    selectedRestaurantId === ALL_LOCATIONS_VALUE;
  const displayedCriticalCount = showCompletedCriticalMetrics ? criticalCount : pendingCriticalCount;

  const actionPlanDynamics = useMemo(() => {
    const total = criticalItemsFlat.length;
    if (!total) return null;
    const fixed = completedCriticalCount;
    const pending = pendingCriticalCount;
    return {
      mode: "plans",
      percent: roundPercent((fixed / total) * 100),
      fixed,
      total,
      improved: fixed,
      worsened: 0,
      unchanged: pending,
    };
  }, [completedCriticalCount, criticalItemsFlat.length, pendingCriticalCount]);

  const managersByRestaurantId = useMemo(() => {
    const knownRestaurants = Array.isArray(availableRestaurants) ? availableRestaurants : [];
    const map = new Map();
    (Array.isArray(usersForResponsible) ? usersForResponsible : [])
      .filter((userRow) => isEstablishmentManagerUser(userRow))
      .forEach((userRow) => {
        const userId = getUserIdentity(userRow);
        const label = getUserDisplayLabel(userRow);
        if (!userId || !label) return;
        const restaurantIds = parseUserRestaurantIds(userRow)
          .map((scopeValue) => {
            const raw = String(scopeValue || "").trim();
            if (!raw) return "";
            const resolvedId = resolveRestaurantIdFromScope(knownRestaurants, raw);
            return String(resolvedId || raw).trim();
          })
          .filter(Boolean);

        restaurantIds.forEach((restaurantId) => {
          if (!restaurantId) return;
          const current = map.get(restaurantId) || [];
          if (!current.some((entry) => String(entry.userId) === String(userId))) {
            current.push({ userId, label });
            map.set(restaurantId, current);
          }
        });
      });

    Array.from(map.keys()).forEach((restaurantId) => {
      const sorted = (map.get(restaurantId) || []).slice().sort((a, b) => a.label.localeCompare(b.label, "uk"));
      map.set(restaurantId, sorted);
    });

    return map;
  }, [availableRestaurants, usersForResponsible]);

  const planDialogResponsibleCandidates = useMemo(() => {
    if (!planDialogContext?.auditId) return [];
    const audit = metricsById.get(String(planDialogContext.auditId || "")) || null;
    const restaurantIdFromAudit = String(audit?.restaurantId || "").trim();
    if (restaurantIdFromAudit) {
      return managersByRestaurantId.get(restaurantIdFromAudit) || [];
    }

    if (selectedRestaurantId && selectedRestaurantId !== ALL_LOCATIONS_VALUE) {
      return managersByRestaurantId.get(String(selectedRestaurantId || "")) || [];
    }
    return [];
  }, [ALL_LOCATIONS_VALUE, managersByRestaurantId, metricsById, planDialogContext, selectedRestaurantId]);

  const defaultResponsibleManagers = useMemo(
    () => (planDialogResponsibleCandidates || []).map((entry) => String(entry.label || "").trim()).filter(Boolean),
    [planDialogResponsibleCandidates]
  );

  const defaultResponsibleManagerIds = useMemo(
    () => (planDialogResponsibleCandidates || []).map((entry) => String(entry.userId || "").trim()).filter(Boolean),
    [planDialogResponsibleCandidates]
  );

  const dynamics = useMemo(() => {
    if (trendSeries.length < 2) return null;
    const base = trendSeries[0];
    const latest = trendSeries[trendSeries.length - 1];
    const prevIssues = collectIssueItemIds(base.responses);
    if (prevIssues.size === 0) return null;

    let fixed = 0;
    prevIssues.forEach((itemId) => {
      const valueNow = latest.responses?.[itemId]?.value;
      if (valueNow !== null && valueNow !== undefined && Number(valueNow) === 2) fixed += 1;
    });

    let improved = 0;
    let worsened = 0;
    let unchanged = 0;

    const allItemIds = new Set([...Object.keys(base.responses || {}), ...Object.keys(latest.responses || {})]);
    allItemIds.forEach((itemId) => {
      const from = Number(base.responses?.[itemId]?.value);
      const to = Number(latest.responses?.[itemId]?.value);
      if (!Number.isFinite(from) || !Number.isFinite(to)) return;
      if (to > from) improved += 1;
      else if (to < from) worsened += 1;
      else unchanged += 1;
    });

    return {
      percent: roundPercent((fixed / prevIssues.size) * 100),
      fixed,
      total: prevIssues.size,
      improved,
      worsened,
      unchanged,
      base,
      latest,
    };
  }, [trendSeries]);

  const displayedDynamics = actionPlanDynamics || dynamics;

  const technicalInfo = useMemo(() => {
    if (!metrics.length) {
      return {
        dateLabel: "—",
        technologistLabel: "—",
        locationLabel: "—",
      };
    }

    const dateValues = metrics.map((item) => String(item.date || "")).filter(Boolean).sort((a, b) => a.localeCompare(b));
    const firstDate = dateValues[0] || "";
    const lastDate = dateValues[dateValues.length - 1] || "";
    const dateLabel = firstDate && lastDate
      ? (firstDate === lastDate ? formatDisplayDate(firstDate) : `${formatDisplayDate(firstDate)} - ${formatDisplayDate(lastDate)}`)
      : "—";

    const technologists = Array.from(
      new Set(
        metrics
          .map((item) => String(item.completedByName || item.updatedByName || item.createdByName || "").trim())
          .filter(Boolean)
      )
    );

    const locations = Array.from(
      new Set(
        metrics
          .map((item) => String(item.restaurantName || "").trim())
          .filter(Boolean)
      )
    );

    const technologistLabel = technologists.length ? technologists.join(", ") : "—";
    const locationLabel = locations.length > 3
      ? `${locations.slice(0, 3).join(", ")} +${locations.length - 3}`
      : (locations.join(", ") || "—");

    return { dateLabel, technologistLabel, locationLabel };
  }, [metrics]);

  const selectedLocationLabel = useMemo(() => {
    if (selectedRestaurantId === ALL_LOCATIONS_VALUE) return "Всі локації";
    const match = availableRestaurants.find((item) => String(item?.id || "") === String(selectedRestaurantId || ""));
    return String(match?.name || "—");
  }, [availableRestaurants, selectedRestaurantId]);

  const selectedTemplateLabel = useMemo(() => {
    if (selectedTemplateId === ALL_TEMPLATES_VALUE) return "Всі шаблони";
    const match = availableTemplateOptions.find((item) => String(item?.id || "") === String(selectedTemplateId || ""));
    return String(match?.name || "—");
  }, [availableTemplateOptions, selectedTemplateId]);

  const scoreCardTitle = useMemo(() => {
    if (selectedTemplateId === ALL_TEMPLATES_VALUE) return "HACCP Score";
    return selectedTemplateLabel || "HACCP Score";
  }, [selectedTemplateId, selectedTemplateLabel]);

  const scoreCardSubtitle = useMemo(() => {
    return selectedTemplateId === ALL_TEMPLATES_VALUE
      ? "Середня оцінка за обраними чек-листами."
      : `Середня оцінка за шаблоном «${selectedTemplateLabel}».`;
  }, [selectedTemplateId, selectedTemplateLabel]);

  const periodFromMonth = useMemo(() => {
    const datePart = String(periodFrom || "").slice(5, 7);
    return datePart || null;
  }, [periodFrom]);

  const periodFromYear = useMemo(() => {
    const datePart = String(periodFrom || "").slice(0, 4);
    return datePart || null;
  }, [periodFrom]);

  const periodToMonth = useMemo(() => {
    const datePart = String(periodTo || "").slice(5, 7);
    return datePart || null;
  }, [periodTo]);

  const periodToYear = useMemo(() => {
    const datePart = String(periodTo || "").slice(0, 4);
    return datePart || null;
  }, [periodTo]);

  const actionPlanEntries = useMemo(() => {
    return criticalItemsFlat
      .map((item) => {
        const saved = actionPlanByItem?.[item.planKey];
        const comment = String(saved?.comment || "").trim();
        if (!comment) return null;
        return {
          ...item,
          comment,
          updatedAt: String(saved?.updatedAt || ""),
          status: String(saved?.status || "in_progress"),
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }, [actionPlanByItem, criticalItemsFlat]);

  const actionPlanMetrics = useMemo(() => {
    const total = actionPlanEntries.length;
    const done = actionPlanEntries.filter((entry) => entry.status === "done").length;
    const pending = total - done;
    return { total, done, pending };
  }, [actionPlanEntries]);

  const openPlanDialog = (auditId, auditLabel, item, source = "critical") => {
    setShowCriticalDetails(false);
    setShowActionPlanDetails(false);
    setPlanDialogSource(source === "plan" ? "plan" : "critical");

    const itemId = String(item?.itemId || "");
    const itemTitle = String(item?.itemTitle || item?.title || "Пункт без назви");
    const planKey = getCriticalPlanKey(auditId, itemId);
    const latestPlans = actionPlanByItem || {};
    const saved = latestPlans?.[planKey] || {};
    const savedResponsibleList = Array.isArray(saved?.responsibles)
      ? saved.responsibles.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    const savedResponsibleIds = Array.isArray(saved?.responsibleIds)
      ? saved.responsibleIds.map((value) => String(value || "").trim()).filter(Boolean)
      : [];

    const audit = metricsById.get(String(auditId || "")) || null;
    const restaurantId = String(audit?.restaurantId || "").trim();
    const restaurantManagers = restaurantId ? (managersByRestaurantId.get(restaurantId) || []) : [];
    const defaultResponsibleList = restaurantManagers.map((entry) => entry.label).filter(Boolean);
    const defaultResponsibleIdsList = restaurantManagers.map((entry) => entry.userId).filter(Boolean);

    setPlanDialogContext({
      planKey,
      auditId: String(auditId || ""),
      auditLabel: String(auditLabel || ""),
      itemId,
      itemTitle,
      violationComment: String(item?.violationComment || "").trim(),
    });
    setPlanDialogDeadline(String(saved?.deadline || todayDate()));
    setPlanDialogResponsible(savedResponsibleList.length
      ? savedResponsibleList.join(", ")
      : String(saved?.responsible || defaultResponsibleList.join(", ") || "")
    );
    setPlanDialogResponsibleIds(savedResponsibleIds.length ? savedResponsibleIds : defaultResponsibleIdsList);
    setPlanDialogComment(String(saved?.comment || ""));
    setPlanDialogStatus(String(saved?.status || "in_progress"));
  };

  useEffect(() => {
    if (!planDialogContext) return;
    if (String(planDialogResponsible || "").trim()) return;
    if (!defaultResponsibleManagers.length) return;
    setPlanDialogResponsible(defaultResponsibleManagers.join(", "));
    setPlanDialogResponsibleIds(defaultResponsibleManagerIds);
  }, [defaultResponsibleManagerIds, defaultResponsibleManagers, planDialogContext, planDialogResponsible]);

  const savePlanDialog = async () => {
    if (!planDialogContext?.planKey) return;
    const comment = String(planDialogComment || "").trim();
    const deadline = String(planDialogDeadline || "").trim();
    const responsible = String(planDialogResponsible || "").trim();
    const responsibleIds = Array.isArray(planDialogResponsibleIds)
      ? planDialogResponsibleIds.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    const responsibleList = responsible
      .split(",")
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (!deadline) {
      alert("Вкажіть дедлайн виконання.");
      return;
    }
    if (!responsible || !responsibleList.length || !responsibleIds.length) {
      alert("Для обраної локації не знайдено керуючого закладу.");
      return;
    }
    if (!comment) {
      alert("Вкажіть план дій перед збереженням.");
      return;
    }

    const audit = metricsById.get(String(planDialogContext.auditId || "")) || null;
    const nextPlan = {
      ...(actionPlanByItem?.[planDialogContext.planKey] || {}),
      deadline,
      responsible,
      responsibles: responsibleList,
      responsibleIds,
      comment,
      status: planDialogStatus,
      auditId: planDialogContext.auditId,
      auditLabel: planDialogContext.auditLabel,
      itemId: planDialogContext.itemId,
      itemTitle: planDialogContext.itemTitle,
      violationComment: String(planDialogContext.violationComment || "").trim(),
      restaurantId: String(audit?.restaurantId || "").trim(),
      restaurantName: String(audit?.restaurantName || "").trim(),
      updatedAt: new Date().toISOString(),
      createdAt: String(actionPlanByItem?.[planDialogContext.planKey]?.createdAt || new Date().toISOString()),
    };

    try {
      if (isCollectionsApiEnabled()) {
        const existingDocId = String(actionPlanByItem?.[planDialogContext.planKey]?._docId || "").trim();
        const payload = buildActionPlanRowPayload(planDialogContext.planKey, nextPlan);
        if (existingDocId) {
          await updateCollectionItemApi(ACTION_PLANS_COLLECTION, existingDocId, payload);
          nextPlan._docId = existingDocId;
        } else {
          const createdId = await createCollectionItemApi(ACTION_PLANS_COLLECTION, payload);
          nextPlan._docId = createdId;
        }
      }
    } catch (error) {
      console.error("Не вдалося зберегти план дій HACCP:", error);
      alert("Не вдалося зберегти план дій. Спробуйте ще раз.");
      return;
    }

    setActionPlanByItem((prev) => ({
      ...(prev || {}),
      [planDialogContext.planKey]: nextPlan,
    }));
    writeLocalActionPlans(actionPlanStorageKey, {
      ...(actionPlanByItem || {}),
      [planDialogContext.planKey]: nextPlan,
    });

    if (isLegalApiEnabled()) {
      const actorUserId = getActorIdentity(user);
      const locationName = String(audit?.restaurantName || "локація");
      const auditDate = formatDisplayDate(audit?.date);
      const title = "HACCP: новий план дій";
      const body = `${locationName} · ${auditDate}: ${planDialogContext.itemTitle}. Дедлайн: ${formatDisplayDate(deadline)}.`;

      await Promise.all(
        responsibleIds.map(async (targetUserId) => {
          try {
            await addLegalNotificationApi({
              taskId: String(planDialogContext.planKey || ""),
              taskTitle: String(planDialogContext.itemTitle || "План дій HACCP"),
              title,
              body,
              targetUserId: String(targetUserId || "").trim().toLowerCase(),
              targetRole: "",
              actorUserId,
              actionTab: "haccpmainrepirt",
              actionUrl: "haccpreport",
              source: "haccp",
              createdAt: new Date().toISOString(),
            });
          } catch (error) {
            console.warn("Не вдалося створити HACCP-сповіщення:", error);
          }
        })
      );

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("lucia:notifications-updated"));
      }
    }

    setPlanDialogContext(null);
    setPlanDialogDeadline("");
    setPlanDialogResponsible("");
    setPlanDialogResponsibleIds([]);
    setPlanDialogComment("");
    setPlanDialogStatus("in_progress");

    if (planDialogSource === "critical") {
      setShowCriticalDetails(true);
    } else {
      setShowActionPlanDetails(true);
    }
  };

  const handleExportExcel = async () => {
    try {
      setIsExportingExcel(true);

      const summaryRows = [
        { Показник: "Локація", Значення: selectedLocationLabel },
        { Показник: "Шаблон", Значення: selectedTemplateLabel },
        {
          Показник: "Період",
          Значення: `${periodFromMonth && periodFromYear ? `${periodFromMonth}.${periodFromYear}` : "—"} - ${periodToMonth && periodToYear ? `${periodToMonth}.${periodToYear}` : "—"}`,
        },
        { Показник: "Середній HACCP Score", Значення: `${roundPercent(avgScore)}%` },
        { Показник: "Порушення", Значення: criticalCount },
        { Показник: "Кількість чек-листів", Значення: auditsForMetrics.length },
        { Показник: "Технічна інформація: дати", Значення: technicalInfo.dateLabel },
        { Показник: "Технічна інформація: технолог(и)", Значення: technicalInfo.technologistLabel },
      ];

      const checklistRows = trendSeries.map((item) => ({
        Дата: formatDisplayDate(item.date),
        Локація: String(item.restaurantName || "Локація"),
        Шаблон: String(item.templateName || "Без шаблону"),
        Оцінка: `${roundPercent(item.score)}%`,
        Порушення: Number(item.critical || 0),
      }));

      const detailsRows = [];
      trendSeries.forEach((auditItem) => {
        const templateForItem = auditItem?.templateSnapshot && typeof auditItem.templateSnapshot === "object"
          ? auditItem.templateSnapshot
          : templatesById.get(String(auditItem?.templateId || "")) || null;
        const galleryById = new Map(
          (Array.isArray(auditItem?.gallery) ? auditItem.gallery : [])
            .filter((photo) => getPhotoSrc(photo))
            .map((photo) => [String(photo?.id || ""), photo])
        );
        (templateForItem?.sections || [])
          .slice()
          .sort((a, b) => Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0))
          .forEach((section) => {
            getSectionGroups(section).forEach((group) => {
              const subsectionTitle = group.isSubsection ? String(group.title || "Підрозділ") : "";
              group.items.forEach((sectionItem) => {
                const itemId = String(sectionItem?.id || "");
                const response = auditItem?.responses?.[itemId] || {};
                const rating = RATING_BY_VALUE?.[response?.value] || null;
                const photos = [
                  ...(Array.isArray(response?.photoIds) ? response.photoIds : [])
                    .map((photoId) => galleryById.get(String(photoId || "")))
                    .filter((photo) => getPhotoSrc(photo)),
                  ...(Array.isArray(response?.photos) ? response.photos : []).filter((photo) => getPhotoSrc(photo)),
                ];
                const photoLinks = Array.from(new Set(photos.map((photo) => getPhotoSrc(photo)).filter(Boolean)));

                detailsRows.push({
                  Дата: formatDisplayDate(auditItem?.date),
                  Локація: String(auditItem?.restaurantName || "Локація"),
                  Шаблон: String(auditItem?.templateName || "Без шаблону"),
                  Розділ: String(section?.title || "Без назви розділу"),
                  Підрозділ: subsectionTitle,
                  Пункт: String(sectionItem?.title || "Пункт без назви"),
                  Оцінка: rating?.label || "Не оцінено",
                  Коментар: String(response?.comment || "").trim(),
                  Фото: photoLinks.join("\n"),
                });
              });
            });
          });
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Підсумок");
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(checklistRows.length ? checklistRows : [{ Повідомлення: "Немає чек-листів у вибраному періоді" }]),
        "Чек-листи"
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(detailsRows.length ? detailsRows : [{ Повідомлення: "Немає пунктів для деталізації" }]),
        "Пункти та коментарі"
      );

      const fileStamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `HACCP_report_${fileStamp}.xlsx`);
    } catch (error) {
      console.error("Не вдалося експортувати звіт:", error);
      alert("Не вдалося експортувати звіт у Excel.");
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    if (!selectedAudit) {
      alert("Оберіть перевірку для вивантаження PDF.");
      return;
    }

    try {
      setIsExportingPdf(true);

      const templateForAudit = selectedAudit?.templateSnapshot && typeof selectedAudit.templateSnapshot === "object"
        ? selectedAudit.templateSnapshot
        : templatesById.get(String(selectedAudit?.templateId || "")) || null;

      // Заголовок звіту = назва шаблону аудиту (динамічно), а не хардкод.
      const auditTitle = String(
        selectedAudit?.templateName ||
        templateForAudit?.name ||
        selectedTemplateLabel ||
        "Звіт аудиту"
      ).trim() || "Звіт аудиту";

      const sectionResults = computeHaccpScores(templateForAudit, selectedAudit?.responses || {}).sectionResults;

      const galleryById = new Map(
        (Array.isArray(selectedAudit?.gallery) ? selectedAudit.gallery : [])
          .map((photo) => [String(photo?.id || ""), photo])
      );

      // Збираємо унікальні фото пунктів (linked + legacy) без дублікатів.
      const getItemPhotos = (response) => {
        const linked = (Array.isArray(response?.photoIds) ? response.photoIds : [])
          .map((photoId) => galleryById.get(String(photoId || "")))
          .filter((photo) => Boolean(getPhotoSrc(photo)));
        const legacy = (Array.isArray(response?.photos) ? response.photos : []).filter((photo) => Boolean(getPhotoSrc(photo)));
        const merged = [...linked, ...legacy];
        const seen = new Set();
        return merged.filter((photo) => {
          const key = String(photo?.id || getPhotoSrc(photo) || "");
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };

      // Попередньо завантажуємо всі фото в base64 (стиснуті), щоб pdfMake міг їх вставити.
      const uniqueSrcs = [];
      const seenSrc = new Set();
      (templateForAudit?.sections || []).forEach((section) => {
        flattenSectionItems(section).forEach((item) => {
          const response = selectedAudit?.responses?.[String(item?.id || "")] || {};
          getItemPhotos(response).forEach((photo) => {
            const src = getPhotoSrc(photo);
            if (src && !seenSrc.has(src)) {
              seenSrc.add(src);
              uniqueSrcs.push(src);
            }
          });
        });
      });

      const imageEntries = await Promise.all(
        uniqueSrcs.map(async (src) => [src, await loadPdfImage(src, 700)])
      );
      const imageMap = new Map(imageEntries.filter(([, value]) => Boolean(value)));

      const galleryEntries = [];

      const sectionBlocks = [];
      (templateForAudit?.sections || [])
        .slice()
        .sort((a, b) => Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0))
        .forEach((section, sectionIndex) => {
          const sectionId = String(section?.id || "");
          const percent = roundPercent(Number(sectionResults?.[sectionId]?.percent || 0));

          sectionBlocks.push({
            margin: [0, 8, 0, 4],
            columns: [
              { text: `${sectionIndex + 1}. ${String(section?.title || "Розділ без назви")}`, bold: true, fontSize: 12, color: "#0f172a", width: "*" },
              { text: `${percent}%`, alignment: "right", bold: true, color: "#0369a1", width: 56 },
            ],
          });

          const itemRows = [];
          const buildItemRow = (item, itemNumber) => {
            const itemId = String(item?.id || "");
            const response = selectedAudit?.responses?.[itemId] || {};
            const rating = response?.value !== null && response?.value !== undefined
              ? RATING_BY_VALUE?.[response?.value]
              : null;

            const itemPhotos = getItemPhotos(response);
            const loadedPhotos = itemPhotos
              .map((photo) => imageMap.get(getPhotoSrc(photo)))
              .filter(Boolean);
            const photoCount = itemPhotos.length;

            // Заливка клітинки «Оцінка» кольором за рейтингом.
            const fillDef = rating ? PDF_RATING_FILL[rating.value] : null;
            const ratingCell = {
              text: String(rating?.label || "Не оцінено"),
              fontSize: 9,
              bold: Boolean(fillDef),
              alignment: "center",
              color: fillDef ? fillDef.color : "#0f172a",
              ...(fillDef ? { fillColor: fillDef.fill } : {}),
            };

            // Міні-фото під коментарем.
            const inlineThumbs = loadedPhotos.slice(0, 4).map((im) => ({
              width: "auto",
              image: im.dataUrl,
              fit: [40, 40],
            }));
            const commentText = String(response?.comment || "").trim() || "—";
            const commentCell = inlineThumbs.length
              ? {
                  stack: [
                    { text: commentText, fontSize: 9, color: "#334155" },
                    { columns: inlineThumbs, columnGap: 4, margin: [0, 3, 0, 0] },
                  ],
                }
              : { text: commentText, fontSize: 9, color: "#334155" };

            // Фото для фінальної галереї (усі підряд, по 4 на сторінку).
            loadedPhotos.forEach((im) => {
              galleryEntries.push({ label: itemNumber, dataUrl: im.dataUrl });
            });

            return [
              { text: itemNumber, fontSize: 9, color: "#334155" },
              { text: String(item?.title || "Пункт без назви"), fontSize: 9, color: "#0f172a" },
              ratingCell,
              commentCell,
              { text: String(photoCount), fontSize: 9, alignment: "center", color: "#334155" },
            ];
          };

          getSectionGroups(section).forEach((group, groupIndex) => {
            if (group.isSubsection) {
              const subPercent = roundPercent(Number(sectionResults?.[group.id]?.percent || 0));
              // Заголовок підрозділу — рядок на всю ширину таблиці.
              itemRows.push([
                {
                  text: `${sectionIndex + 1}.${groupIndex + 1} ${String(group.title || "Підрозділ")}  ·  ${subPercent}%`,
                  colSpan: 5,
                  bold: true,
                  fontSize: 9,
                  color: "#065f46",
                  fillColor: "#dcfce7",
                  margin: [0, 1, 0, 1],
                },
                {}, {}, {}, {},
              ]);
              group.items.forEach((item, itemIndex) => {
                itemRows.push(buildItemRow(item, `${sectionIndex + 1}.${groupIndex + 1}.${itemIndex + 1}`));
              });
            } else {
              group.items.forEach((item, itemIndex) => {
                itemRows.push(buildItemRow(item, `${sectionIndex + 1}.${itemIndex + 1}`));
              });
            }
          });

          sectionBlocks.push({
            table: {
              headerRows: 1,
              widths: [28, "*", 92, "*", 44],
              body: [
                [
                  { text: "№", bold: true, fontSize: 9, fillColor: "#e2e8f0", color: "#0f172a" },
                  { text: "Пункт перевірки", bold: true, fontSize: 9, fillColor: "#e2e8f0", color: "#0f172a" },
                  { text: "Оцінка", bold: true, fontSize: 9, fillColor: "#e2e8f0", color: "#0f172a" },
                  { text: "Коментар", bold: true, fontSize: 9, fillColor: "#e2e8f0", color: "#0f172a" },
                  { text: "Фото", bold: true, fontSize: 9, alignment: "center", fillColor: "#e2e8f0", color: "#0f172a" },
                ],
                ...(itemRows.length ? itemRows : [[
                  { text: "—", fontSize: 9, color: "#334155" },
                  { text: "У розділі відсутні пункти", fontSize: 9, color: "#334155" },
                  { text: "—", fontSize: 9, color: "#334155" },
                  { text: "—", fontSize: 9, color: "#334155" },
                  { text: "0", fontSize: 9, alignment: "center", color: "#334155" },
                ]]),
              ],
            },
            layout: {
              fillColor: (rowIndex) => (rowIndex === 0 ? "#e2e8f0" : rowIndex % 2 === 0 ? "#f8fafc" : null),
              hLineColor: () => "#cbd5e1",
              vLineColor: () => "#cbd5e1",
              hLineWidth: () => 0.7,
              vLineWidth: () => 0.7,
            },
            margin: [0, 0, 0, 6],
          });
        });

      // Фінальна галерея: усі додані фото по 4 на сторінку (2×2).
      const galleryContent = [];
      if (galleryEntries.length) {
        galleryContent.push({
          text: "Додані фотографії",
          fontSize: 14,
          bold: true,
          color: "#0f172a",
          margin: [0, 0, 0, 8],
          pageBreak: "before",
        });
        for (let i = 0; i < galleryEntries.length; i += 4) {
          const group = galleryEntries.slice(i, i + 4);
          const rows = [];
          for (let r = 0; r < group.length; r += 2) {
            const pair = group.slice(r, r + 2).map((entry) => ({
              stack: [
                { image: entry.dataUrl, fit: [245, 175], alignment: "center" },
                { text: entry.label, fontSize: 8, color: "#475569", alignment: "center", margin: [0, 3, 0, 0] },
              ],
              margin: [0, 0, 0, 10],
            }));
            while (pair.length < 2) pair.push({ text: "" });
            rows.push(pair);
          }
          galleryContent.push({
            table: { widths: ["*", "*"], body: rows },
            layout: "noBorders",
            ...(i > 0 ? { pageBreak: "before" } : {}),
          });
        }
      }

      const documentDefinition = {
        pageSize: "A4",
        pageMargins: [26, 28, 26, 30],
        footer: (currentPage, pageCount) => ({
          margin: [26, 8, 26, 0],
          columns: [
            { text: `Звіт сформовано: ${new Date().toLocaleString("uk-UA")}`, fontSize: 8, color: "#64748b" },
            { text: `Сторінка ${currentPage} з ${pageCount}`, fontSize: 8, alignment: "right", color: "#64748b" },
          ],
        }),
        content: [
          {
            columns: [
              {
                width: "*",
                stack: [
                  { text: auditTitle, fontSize: 20, bold: true, color: "#0f172a" },
                  { text: "Звіт аудиту", fontSize: 10, color: "#475569", margin: [0, 2, 0, 0] },
                ],
              },
              {
                width: 180,
                table: {
                  widths: [70, "*"],
                  body: [
                    [{ text: "Дата", bold: true, fontSize: 9 }, { text: formatDisplayDate(selectedAudit?.date), fontSize: 9 }],
                    [{ text: "Локація", bold: true, fontSize: 9 }, { text: String(selectedAudit?.restaurantName || "—"), fontSize: 9 }],
                    [{ text: "Шаблон", bold: true, fontSize: 9 }, { text: String(selectedAudit?.templateName || selectedTemplateLabel || "—"), fontSize: 9 }],
                  ],
                },
                layout: "lightHorizontalLines",
              },
            ],
            margin: [0, 0, 0, 10],
          },
          {
            table: {
              widths: ["*", "*", "*"] ,
              body: [[
                { stack: [{ text: "Загальний бал", fontSize: 9, color: "#475569" }, { text: `${roundPercent(selectedAudit?.score || 0)}%`, bold: true, fontSize: 16, color: "#0f172a" }], fillColor: "#f8fafc", margin: [6, 5, 6, 5] },
                { stack: [{ text: "Порушення", fontSize: 9, color: "#475569" }, { text: String(selectedAudit?.critical || 0), bold: true, fontSize: 16, color: "#b91c1c" }], fillColor: "#f8fafc", margin: [6, 5, 6, 5] },
                { stack: [{ text: "Технолог", fontSize: 9, color: "#475569" }, { text: String(selectedAudit?.completedByName || selectedAudit?.updatedByName || selectedAudit?.createdByName || "—"), bold: true, fontSize: 12, color: "#0f172a" }], fillColor: "#f8fafc", margin: [6, 5, 6, 5] },
              ]],
            },
            layout: {
              hLineColor: () => "#cbd5e1",
              vLineColor: () => "#cbd5e1",
              hLineWidth: () => 0.7,
              vLineWidth: () => 0.7,
            },
            margin: [0, 0, 0, 8],
          },
          ...sectionBlocks,
          ...galleryContent,
        ],
        defaultStyle: {
          font: "Roboto",
        },
      };

      const safeDate = String(selectedAudit?.date || "").slice(0, 10) || todayDate();
      const safeLocation = String(selectedAudit?.restaurantName || "локація")
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^\w\u0400-\u04FF\-]/g, "");
      if (!pdfMakeApi || typeof pdfMakeApi.createPdf !== "function") {
        throw new Error("PDF engine is not initialized");
      }
      pdfMakeApi.createPdf(documentDefinition).download(`HACCP_перевірка_${safeDate}_${safeLocation || "звіт"}.pdf`);
    } catch (error) {
      console.error("Не вдалося експортувати PDF звіт:", error);
      alert("Не вдалося експортувати звіт у PDF.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card p-3 bg-white border border-slate-200 text-slate-900 shadow-xl">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-600" />
            <h2 className="text-base font-semibold whitespace-nowrap">Звіт з аудитів</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isExportingExcel}
              onClick={() => { void handleExportExcel(); }}
              className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Download size={16} /> {isExportingExcel ? "Експорт..." : "Excel"}
            </button>
            <button
              type="button"
              disabled={isExportingPdf || !selectedAudit}
              onClick={() => { void handleExportPdf(); }}
              className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-sky-600 bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Download size={16} /> {isExportingPdf ? "Експорт..." : "PDF"}
            </button>
          </div>
        </div>

        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">Локація</span>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              value={selectedRestaurantId}
              onChange={(e) => setSelectedRestaurantId(e.target.value)}
            >
              <option value="">Оберіть локацію</option>
              <option value={ALL_LOCATIONS_VALUE}>Всі локації</option>
              {availableRestaurants.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">Шаблон</span>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
            >
              <option value={ALL_TEMPLATES_VALUE}>Всі шаблони</option>
              {availableTemplateOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">Період</span>
            <DateRangePickerPopover
              from={periodFrom}
              to={periodTo}
              onChange={({ from, to }) => { setPeriodFrom(from); setPeriodTo(to); }}
              min={availablePeriodBounds.min || undefined}
              max={availablePeriodBounds.max || undefined}
            />
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">Перевірка</span>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              value={selectedAuditId}
              onChange={(e) => setSelectedAuditId(String(e.target.value || ""))}
              disabled={!auditOptions.length}
            >
              {!auditOptions.length ? <option value="">Немає перевірок</option> : null}
              {auditOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex items-baseline gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
            <p className="shrink-0 text-xs text-slate-500">Дата перевірок</p>
            <p className="truncate text-sm font-semibold text-slate-900">{technicalInfo.dateLabel}</p>
          </div>
          <div className="flex items-baseline gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
            <p className="shrink-0 text-xs text-slate-500">Технолог(и)</p>
            <p className="truncate text-sm font-semibold text-slate-900">{technicalInfo.technologistLabel}</p>
          </div>
          <div className="flex items-baseline gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
            <p className="shrink-0 text-xs text-slate-500">Локація</p>
            <p className="truncate text-sm font-semibold text-slate-900">{technicalInfo.locationLabel}</p>
          </div>
        </div>

      </div>

      {!filteredAudits.length ? (
        <div className={cardClass}>
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Немає проведених HACCP-аудитів для обраної локації в межах обраного періоду.
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className={cardClass}>
              <p className="text-sm font-semibold text-slate-800">{scoreCardTitle}</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-4xl font-extrabold text-slate-900">{roundPercent(avgScore)}%</span>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${traffic.className}`}>
                  {traffic.label}
                </span>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full transition-all ${gradeBandFor(avgScore).barClass}`} style={{ width: `${Math.min(100, Math.max(0, roundPercent(avgScore)))}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-500">{scoreCardSubtitle}</p>
            </div>

            <div className={cardClass}>
              <p className="text-sm font-semibold text-slate-800">Динаміка виправлень</p>
              {displayedDynamics ? (
                <>
                  <div className="mt-2 text-4xl font-extrabold text-slate-900">{displayedDynamics.percent}%</div>
                  <p className="mt-1 text-sm text-slate-600">
                    {displayedDynamics.mode === "plans"
                      ? `Виконано ${displayedDynamics.fixed} з ${displayedDynamics.total} порушень за статусами планів дій.`
                      : `Усунено ${displayedDynamics.fixed} з ${displayedDynamics.total} помилок від найстаршого до найновішого обраного чек-листа.`}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                      <ArrowUp size={12} /> {displayedDynamics.mode === "plans" ? `Виконано: ${displayedDynamics.improved}` : `Покращено: ${displayedDynamics.improved}`}
                    </span>
                    {displayedDynamics.mode === "plans" ? null : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-1 font-semibold text-red-700">
                        <ArrowDown size={12} /> Погіршено: {displayedDynamics.worsened}
                      </span>
                    )}
                    <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-1 font-semibold text-slate-700">
                      {displayedDynamics.mode === "plans" ? `Невиконано: ${displayedDynamics.unchanged}` : `Без змін: ${displayedDynamics.unchanged}`}
                    </span>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Недостатньо даних для розрахунку (оберіть щонайменше 2 чек-листи).</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowCriticalDetails(true)}
              className={`${cardClass} flex h-full flex-col text-left`}
            >
              <p className="text-sm font-semibold text-slate-800">Порушення</p>
              <div className="mt-2 flex items-center gap-3">
                <div className="inline-flex items-center rounded-xl border border-red-300 bg-red-600 px-3 py-2 text-3xl font-extrabold text-white shadow-sm">
                  {displayedCriticalCount}
                </div>
                {showCompletedCriticalMetrics && completedCriticalCount > 0 ? (
                  <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    {completedCriticalCount} виконано
                  </span>
                ) : null}
                <p className="text-xs text-slate-500">Натисніть, щоб переглянути перелік порушень.</p>
              </div>
            </button>

            <button
              type="button"
              onClick={async () => {
                await loadActionPlans();
                setShowActionPlanDetails(true);
              }}
              className={`${cardClass} flex h-full flex-col text-left`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">План дій</p>
                <ListChecks size={16} className="text-emerald-600" />
              </div>
              <div className="mt-2 flex items-center gap-3">
                {actionPlanMetrics.total === 0 ? (
                  <div className="inline-flex items-center rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-3xl font-extrabold text-slate-600 shadow-sm">
                    —
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {actionPlanMetrics.done > 0 ? (
                      <div className="inline-flex items-center rounded-xl border border-emerald-300 bg-emerald-600 px-2 py-1 text-lg font-extrabold text-white shadow-sm">
                        {actionPlanMetrics.done}
                      </div>
                    ) : null}
                    {actionPlanMetrics.pending > 0 ? (
                      <div className="inline-flex items-center rounded-xl border border-amber-300 bg-amber-500 px-2 py-1 text-lg font-extrabold text-white shadow-sm">
                        {actionPlanMetrics.pending}
                      </div>
                    ) : null}
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  {actionPlanMetrics.total === 0
                    ? "Активних планів дій немає."
                    : `${actionPlanMetrics.done} виконано ${actionPlanMetrics.pending > 0 ? `/ ${actionPlanMetrics.pending} невиконано` : "/ всі завершені"}`}
                </p>
              </div>
            </button>
          </div>

          <div className={cardClass}>
            <p className="text-sm font-semibold text-slate-800">Інфографіка динаміки чек-листів</p>
            <p className="mt-1 text-xs text-slate-500">Показує зміну оцінки та порушень по кожному обраному чек-листу.</p>

            {trendSeries.length ? (
              <div className="mt-3 space-y-2">
                {trendSeries.map((item, index) => {
                  const prev = index > 0 ? trendSeries[index - 1] : null;
                  const scoreDelta = prev ? roundPercent((Number(item.score) || 0) - (Number(prev.score) || 0)) : null;
                  const isUp = Number(scoreDelta) > 0;
                  const isDown = Number(scoreDelta) < 0;
                  const templateForItem = templatesById.get(String(item?.templateId || "")) || null;
                  const sectionResults = computeHaccpScores(templateForItem, item?.responses || {}).sectionResults;
                  const buildItemRow = (sectionItem) => {
                    const sectionItemId = String(sectionItem?.id || "");
                    const responseValue = item?.responses?.[sectionItemId]?.value;
                    const rating = RATING_BY_VALUE?.[responseValue];
                    const response = item?.responses?.[sectionItemId] || {};
                    const photos = (Array.isArray(response?.photoIds) ? response.photoIds : [])
                      .map((photoId) => ({ photoId, photo: (item?.gallery || []).find((entry) => String(entry?.id || "") === String(photoId || "")) || null }))
                      .map(({ photo }) => photo)
                      .filter((photo) => getPhotoSrc(photo));
                    const legacyPhotos = (Array.isArray(response?.photos) ? response.photos : []).filter((photo) => getPhotoSrc(photo));
                    const dedup = new Set();
                    const photoList = [...photos, ...legacyPhotos].filter((photo) => {
                      const key = String(photo?.id || getPhotoSrc(photo) || "");
                      if (!key || dedup.has(key)) return false;
                      dedup.add(key);
                      return true;
                    });
                    return {
                      id: sectionItemId,
                      title: String(sectionItem?.title || "Пункт без назви"),
                      comment: String(response?.comment || "").trim(),
                      ratingLabel: rating?.label || "Не оцінено",
                      ratingPercent: Number.isFinite(rating?.percent) ? rating.percent : null,
                      photos: photoList,
                    };
                  };
                  const sectionRows = (templateForItem?.sections || [])
                    .slice()
                    .sort((a, b) => Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0))
                    .map((section) => {
                      const sectionId = String(section?.id || "");
                      const persistedPercent = Number(item?.sectionScores?.[sectionId]);
                      const computedPercent = Number(sectionResults?.[sectionId]?.percent);
                      const percent = Number.isFinite(persistedPercent)
                        ? roundPercent(persistedPercent)
                        : roundPercent(Number.isFinite(computedPercent) ? computedPercent : 0);
                      const usesSub = hasSubsections(section);
                      const groups = getSectionGroups(section).map((group) => ({
                        id: group.id,
                        title: group.title,
                        isSubsection: group.isSubsection,
                        percent: group.isSubsection ? roundPercent(Number(sectionResults?.[group.id]?.percent) || 0) : percent,
                        items: group.items.map(buildItemRow),
                      }));
                      return {
                        id: sectionId,
                        title: String(section?.title || "Без назви категорії"),
                        percent,
                        usesSub,
                        groups,
                      };
                    });

                  const renderInfographicItem = (section, sectionItem) => (
                    <div key={`${section.id}_${sectionItem.id}`} className="rounded border border-slate-200 bg-white px-2 py-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-slate-700">{sectionItem.title}</span>
                        <span className="shrink-0 font-semibold text-slate-900">
                          {sectionItem.ratingLabel}
                          {sectionItem.ratingPercent !== null ? ` (${sectionItem.ratingPercent}%)` : ""}
                        </span>
                      </div>
                      <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                        <div className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                          <span className="font-semibold text-slate-700">Коментар:</span>{" "}
                          {sectionItem.comment || "Коментар відсутній"}
                        </div>
                        {sectionItem.photos.length ? (
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                            {sectionItem.photos.map((photo, photoIndex) => (
                              <button
                                key={`${section.id}_${sectionItem.id}_${photo?.id || photoIndex}`}
                                type="button"
                                onClick={() => setGalleryLightboxPhoto(photo)}
                                className="overflow-hidden rounded border border-slate-200 bg-slate-50"
                                title={photo?.name || "Фото пункту"}
                              >
                                <img
                                  src={getPhotoSrc(photo)}
                                  alt={photo?.name || "Фото пункту"}
                                  className="h-16 w-full object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400">Фото до цього пункту відсутні.</p>
                        )}
                      </div>
                    </div>
                  );

                  return (
                    <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">{formatDisplayDate(item.date)} · {String(item.restaurantName || "Локація")}</span>
                        <span>{String(item.templateName || "Без шаблону")}</span>
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                          <div className={`h-full rounded-full ${gradeBandFor(item.score).barClass}`} style={{ width: `${Math.min(100, Math.max(0, roundPercent(item.score)))}%` }} />
                        </div>
                        <span className="w-16 text-right text-sm font-bold text-slate-900">{roundPercent(item.score)}%</span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center rounded-full border border-red-300 bg-red-50 px-2 py-1 font-semibold text-red-700">
                          Порушення: {item.critical}
                        </span>
                        {scoreDelta !== null ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-semibold ${
                              isUp
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : isDown
                                  ? "border-red-300 bg-red-50 text-red-700"
                                  : "border-slate-300 bg-slate-50 text-slate-700"
                            }`}
                          >
                            {isUp ? <ArrowUp size={12} /> : isDown ? <ArrowDown size={12} /> : null}
                            Δ оцінки: {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}%
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-1 font-semibold text-slate-700">Базова точка</span>
                        )}
                      </div>

                      <details className="mt-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-700">Категорії та оцінки чек-листа</summary>
                        <div className="mt-2 space-y-1.5">
                          {sectionRows.length ? (
                            sectionRows.map((section) => (
                              <details key={`${item.id}_${section.id}`} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
                                <summary className="cursor-pointer list-none">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-slate-700">{section.title}</span>
                                    <span className="font-semibold text-slate-900">{section.percent}%</span>
                                  </div>
                                </summary>
                                <div className="mt-1.5 space-y-1">
                                  {section.groups.some((group) => group.items.length) ? (
                                    section.usesSub ? (
                                      section.groups.map((group) => (
                                        <details key={`${item.id}_${group.id}`} className="rounded border border-emerald-200 bg-emerald-50/40 px-2 py-1">
                                          <summary className="cursor-pointer list-none">
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="truncate font-semibold text-emerald-800">{group.title || "Підрозділ"}</span>
                                              <span className="font-semibold text-slate-900">{group.percent}%</span>
                                            </div>
                                          </summary>
                                          <div className="mt-1.5 space-y-1">
                                            {group.items.length ? (
                                              group.items.map((sectionItem) => renderInfographicItem(section, sectionItem))
                                            ) : (
                                              <p className="text-xs text-slate-500">У підрозділі немає пунктів.</p>
                                            )}
                                          </div>
                                        </details>
                                      ))
                                    ) : (
                                      section.groups[0].items.map((sectionItem) => renderInfographicItem(section, sectionItem))
                                    )
                                  ) : (
                                    <p className="text-xs text-slate-500">У категорії немає пунктів.</p>
                                  )}
                                </div>
                              </details>
                            ))
                          ) : (
                            <p className="text-xs text-slate-500">Для цього чек-листа немає доступних категорій.</p>
                          )}
                        </div>
                      </details>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Немає даних для побудови інфографіки.</p>
            )}
          </div>

        </>
      )}

      {showCriticalDetails ? (
        <div className="fixed inset-0 z-[68] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCriticalDetails(false)}>
          <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-base font-semibold text-slate-900">Порушення</p>
              <div className="inline-flex items-center rounded-xl border border-red-300 bg-red-600 px-3 py-1.5 text-lg font-extrabold text-white shadow-sm">
                {pendingCriticalCount}
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">Коментарі технолога та статус наявності плану дій.</p>

            <div className="mt-3 max-h-[60vh] overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3">
              {criticalDialogItems.length ? (
                <div className="space-y-2">
                  {criticalDialogItems.map((entry) => {
                    const planStatus = String(actionPlanByItem?.[getCriticalPlanKey(entry.auditId, entry.itemId)]?.status || "");
                    const isDone = planStatus === "done";
                    const hasPlan = entry.hasPlan;
                    if (canCreatePlan) {
                      return (
                        <button
                          key={`${entry.auditId}_${entry.itemId}`}
                          type="button"
                          onClick={() => openPlanDialog(entry.auditId, entry.auditLabel, entry, "critical")}
                          className={`w-full rounded border bg-white px-3 py-2 text-left hover:bg-red-50 ${isDone ? "border-emerald-200 opacity-60" : "border-red-200"}`}
                        >
                          <p className="text-xs font-semibold text-red-800">{entry.auditLabel}</p>
                          <div className="mt-1 flex items-start justify-between gap-2">
                            <p className="text-sm text-red-900">{entry.title}</p>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${isDone ? "border-emerald-300 bg-emerald-50 text-emerald-700" : hasPlan ? "border-amber-300 bg-amber-50 text-amber-700" : "border-red-300 bg-white text-red-700"}`}>
                              {isDone ? "Виконано" : hasPlan ? "План в процесі" : "Потребує плану"}
                            </span>
                          </div>
                          <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-800">
                            {entry.violationComment || "Коментар порушення відсутній"}
                          </p>
                        </button>
                      );
                    }
                    return (
                      <div
                        key={`${entry.auditId}_${entry.itemId}`}
                        className={`w-full rounded border bg-white px-3 py-2 ${isDone ? "border-emerald-200 opacity-60" : "border-red-200"}`}
                      >
                        <p className="text-xs font-semibold text-red-800">{entry.auditLabel}</p>
                        <div className="mt-1 flex items-start justify-between gap-2">
                          <p className="text-sm text-red-900">{entry.title}</p>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${isDone ? "border-emerald-300 bg-emerald-50 text-emerald-700" : hasPlan ? "border-amber-300 bg-amber-50 text-amber-700" : "border-red-300 bg-white text-red-700"}`}>
                            {isDone ? "Виконано" : hasPlan ? "В процесі" : "Потребує плану"}
                          </span>
                        </div>
                        <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-800">
                          {entry.violationComment || "Коментар порушення відсутній"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-600">Порушень не знайдено.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showActionPlanDetails ? (
        <div className="fixed inset-0 z-[68] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowActionPlanDetails(false)}>
          <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-base font-semibold text-slate-900">План дій</p>
              <div className="inline-flex items-center rounded-xl border border-emerald-300 bg-emerald-600 px-3 py-1.5 text-lg font-extrabold text-white shadow-sm">
                {actionPlanEntries.length}
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">Натисніть на запис, щоб переглянути або відредагувати план дій.</p>

            <div className="mt-3 max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
              {actionPlanEntries.length ? (
                <div className="space-y-2">
                  {actionPlanEntries.map((entry) => (
                    <button
                      key={entry.planKey}
                      type="button"
                      onClick={() => openPlanDialog(entry.auditId, entry.auditLabel, entry, "plan")}
                      className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-500">{entry.auditLabel} · {entry.itemTitle}</p>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${entry.status === "done" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"}`}>
                          {entry.status === "done" ? "Виконано" : "В процесі"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        Дедлайн: {actionPlanByItem?.[entry.planKey]?.deadline ? formatDisplayDate(actionPlanByItem[entry.planKey].deadline) : "—"} · Відповідальний: {actionPlanByItem?.[entry.planKey]?.responsible || "—"}
                      </p>
                      <p className="mt-1 text-sm text-slate-800">{entry.comment}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600">Плани дій ще не додані.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {planDialogContext ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            setPlanDialogContext(null);
            setPlanDialogDeadline("");
            setPlanDialogResponsible("");
            setPlanDialogResponsibleIds([]);
            setPlanDialogComment("");
            setPlanDialogStatus("in_progress");
          }}
        >
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <p className="text-base font-semibold text-slate-900">План дій для порушення</p>
            <p className="mt-1 text-xs text-slate-500">{planDialogContext.auditLabel}</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">{planDialogContext.itemTitle}</p>

            {String(planDialogContext?.violationComment || "").trim() ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Порушення / коментар технолога</p>
                <p className="mt-1 text-sm text-amber-900">{planDialogContext.violationComment}</p>
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-slate-800">Дедлайн виконання</label>
                <div className="mt-1">
                  <DatePickerPopover
                    value={planDialogDeadline}
                    onChange={setPlanDialogDeadline}
                    min={todayDate()}
                    label=""
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800">Відповідальний</label>
                <input
                  type="text"
                  value={planDialogResponsible}
                  readOnly
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  placeholder="Керуючого не знайдено"
                />
                {loadingResponsibleUsers ? <p className="mt-1 text-xs text-slate-500">Завантаження користувачів...</p> : null}
                {!loadingResponsibleUsers && !defaultResponsibleManagers.length ? <p className="mt-1 text-xs text-amber-600">Для цієї локації не знайдено керуючого.</p> : null}
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-sm font-semibold text-slate-800">Статус</label>
              <select
                value={planDialogStatus}
                onChange={(event) => setPlanDialogStatus(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              >
                <option value="in_progress">В процесі</option>
                <option value="done">Виконано</option>
              </select>
            </div>

            <label className="mt-3 block text-sm font-semibold text-slate-800">План дій керуючого</label>
            <textarea
              value={planDialogComment}
              onChange={(event) => setPlanDialogComment(event.target.value)}
              rows={5}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              placeholder="Опишіть конкретні дії: що зробити, хто відповідальний, термін виконання."
            />

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPlanDialogContext(null);
                  setPlanDialogDeadline("");
                  setPlanDialogResponsible("");
                  setPlanDialogResponsibleIds([]);
                  setPlanDialogComment("");
                  setPlanDialogStatus("in_progress");
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={savePlanDialog}
                className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Зберегти
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <PhotoLightbox photo={galleryLightboxPhoto} onClose={() => setGalleryLightboxPhoto(null)} />
    </div>
  );
}

const findAuditFor = (audits, restaurantId, templateId, date) =>
  (audits || []).find(
    (audit) =>
      String(audit.restaurantId || "") === String(restaurantId || "") &&
      String(audit.templateId || "") === String(templateId || "") &&
      String(audit.date || "") === String(date || "")
  ) || null;

const distributeEqually = (count) => {
  if (count <= 0) return [];
  const base = Math.floor((100 / count) * 10) / 10;
  const weights = Array.from({ length: count }, () => base);
  const used = base * count;
  weights[count - 1] = Math.round((weights[count - 1] + (100 - used)) * 10) / 10;
  return weights;
};

// Нормалізація фото аудиту: галерея — єдине джерело зображень,
// а пункти лише посилаються на них через photoIds. Підтримуємо
// зворотну сумісність зі старим форматом (фото прямо в пункті).
const migrateAuditPhotos = (rawGallery, rawResponses) => {
  const gallery = [];
  const knownIds = new Set();
  const pushPhoto = (photo) => {
    const src = getPhotoSrc(photo);
    if (!photo || !src) return null;
    let id = photo.id;
    if (id && knownIds.has(id)) return id;
    if (!id) id = makeHaccpId();
    gallery.push({
      id,
      name: photo.name || "Фото",
      type: photo.type || "image/jpeg",
      dataUrl: photo.dataUrl,
      url: photo.url,
      addedAt: photo.addedAt || "",
    });
    knownIds.add(id);
    return id;
  };

  (Array.isArray(rawGallery) ? rawGallery : []).forEach(pushPhoto);

  const responses = {};
  Object.entries(rawResponses || {}).forEach(([itemId, resp]) => {
    if (!resp || typeof resp !== "object") {
      responses[itemId] = resp;
      return;
    }
    const next = { ...resp };
    if (Array.isArray(resp.photos) && resp.photos.length) {
      const migratedIds = resp.photos.map(pushPhoto).filter(Boolean);
      const existing = Array.isArray(resp.photoIds) ? resp.photoIds.filter((id) => knownIds.has(id)) : [];
      next.photoIds = Array.from(new Set([...existing, ...migratedIds]));
      delete next.photos;
    } else {
      next.photoIds = Array.isArray(resp.photoIds) ? resp.photoIds.filter((id) => knownIds.has(id)) : [];
    }
    responses[itemId] = next;
  });

  return { gallery, responses };
};

function WeightSumBadge({ sum, target = 100, label }) {
  const value = roundPercent(sum);
  const ok = Math.abs(value - target) < 0.5;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        ok ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"
      }`}
    >
      <Percent size={11} /> {label}: {value}%{ok ? "" : ` / ${target}%`}
    </span>
  );
}

function ScoreBadge({ percent }) {
  const band = gradeBandFor(percent);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${band.badgeClass}`}>
      {roundPercent(percent)}% · {band.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Перегляд фото на повний екран                                       */
/* ------------------------------------------------------------------ */

function PhotoLightbox({ photo, onClose }) {
  useEffect(() => {
    if (!photo) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photo, onClose]);

  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
      >
        <X size={20} />
      </button>
      <figure className="max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <img src={getPhotoSrc(photo)} alt={photo.name || "фото"} className="max-h-[80vh] w-auto rounded-lg object-contain" />
        {photo.name ? <figcaption className="mt-2 text-center text-sm text-white/80">{photo.name}</figcaption> : null}
      </figure>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Галерея фото аудиту (спільний пул знімків сесії)                    */
/* ------------------------------------------------------------------ */

function PhotoGalleryPanel({ photos, assignmentCount, collapsed, onToggle, onAddFiles, onRemove, onPreview, disabled }) {
  const total = photos.length;
  const assigned = photos.filter((photo) => (assignmentCount[photo.id] || 0) > 0).length;
  const unassigned = total - assigned;

  return (
    <div className={cardClass}>
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="flex min-w-0 items-center gap-2">
          <ImageIcon size={17} className="shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">Галерея фото</p>
            <p className="text-xs text-slate-500">Зробіть усі знімки під час обходу, а потім прикріпіть їх до пунктів нижче.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {total > 0 ? (
            <div className="hidden items-center gap-1.5 text-[11px] font-semibold sm:flex">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{total}</span>
              {unassigned > 0 ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">не призначено: {unassigned}</span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">усі прикріплені</span>
              )}
            </div>
          ) : null}
          {collapsed ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronUp size={18} className="text-slate-400" />}
        </div>
      </button>

      {!collapsed ? (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <label
              className={`inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 ${
                disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
              }`}
            >
              <Camera size={15} /> Зробити фото
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                disabled={disabled}
                className="hidden"
                onChange={(e) => {
                  onAddFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <label
              className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 ${
                disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
              }`}
            >
              <Upload size={15} /> Завантажити
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={disabled}
                className="hidden"
                onChange={(e) => {
                  onAddFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="text-xs text-slate-400">{total}/{MAX_GALLERY_PHOTOS}</span>
          </div>

          {total > 0 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {photos.map((photo) => {
                const count = assignmentCount[photo.id] || 0;
                return (
                  <div key={photo.id} className="relative shrink-0">
                    <button type="button" onClick={() => onPreview(photo)} className="block">
                      <img
                        src={getPhotoSrc(photo)}
                        alt={photo.name || "фото"}
                        className="h-24 w-24 rounded-lg border border-slate-200 object-cover"
                      />
                    </button>
                    <span
                      className={`absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white ${
                        count > 0 ? "bg-emerald-600" : "bg-amber-500"
                      }`}
                    >
                      {count > 0 ? `×${count}` : "—"}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(photo.id)}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-0.5 text-white shadow transition hover:bg-red-500"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-xs text-slate-400">
              Фото ще не додані. Зробіть знімки під час обходу — потім прикріпите їх до виявлених невідповідностей.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Пікер: вибір фото з галереї для конкретного пункту                  */
/* ------------------------------------------------------------------ */

function PhotoPickerModal({ open, itemLabel, photos, selectedIds, max, onToggle, onAddFiles, onClose }) {
  if (!open) return null;
  const selectedSet = new Set(selectedIds);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">Прикріпити фото</p>
            {itemLabel ? <p className="truncate text-xs text-slate-500">{itemLabel}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
          <span className="text-xs text-slate-500">Обрано {selectedIds.length}/{max}</span>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
            <Plus size={13} /> Додати нові
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                onAddFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {photos.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((photo) => {
                const selected = selectedSet.has(photo.id);
                const blocked = !selected && selectedIds.length >= max;
                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => (blocked ? null : onToggle(photo.id))}
                    className={`group relative overflow-hidden rounded-lg border-2 transition ${
                      selected ? "border-emerald-500" : "border-transparent"
                    } ${blocked ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}
                  >
                    <img src={getPhotoSrc(photo)} alt={photo.name || "фото"} className="h-24 w-full object-cover" />
                    <span
                      className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full ${
                        selected ? "bg-emerald-600 text-white" : "bg-black/40 text-transparent"
                      }`}
                    >
                      <Check size={12} />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
              Галерея порожня. Додайте фото кнопкою «Додати нові».
            </p>
          )}
        </div>

        <div className="border-t border-slate-200 px-4 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Вкладка заповнення аудиту                                           */
/* ------------------------------------------------------------------ */

function AuditTab({ user, restaurants, templates, audits, createAudit, updateAudit, removeAudit }) {
  const isAdmin = user?.role === "admin";
  const [selectedDate, setSelectedDate] = useState(todayDate());
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [responses, setResponses] = useState({});
  const [currentAuditId, setCurrentAuditId] = useState(null);
  const [status, setStatus] = useState("draft");
  const [auditStartedAt, setAuditStartedAt] = useState("");
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [showHistory, setShowHistory] = useState(false);
  const [gallery, setGallery] = useState([]);
  const [galleryCollapsed, setGalleryCollapsed] = useState(false);
  const [picker, setPicker] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [historyAuditPreview, setHistoryAuditPreview] = useState(null);

  const submitLockRef = useRef(false);

  const userRestaurantScope = useMemo(() => getUserRestaurantIds(user), [user]);

  const availableRestaurants = useMemo(() => {
    const list = Array.isArray(restaurants) ? restaurants : [];
    if (isAdmin) return list;
    if (!userRestaurantScope.length) return list;
    return list.filter((restaurant) =>
      userRestaurantScope.some((scopeValue) => restaurantMatchesScope(restaurant, scopeValue))
    );
  }, [isAdmin, restaurants, userRestaurantScope]);

  useEffect(() => {
    if (isAdmin) return;
    if (!availableRestaurants.length) {
      if (selectedRestaurantId) setSelectedRestaurantId("");
      return;
    }

    const matchedSelection = availableRestaurants.some((item) => String(item?.id || "") === String(selectedRestaurantId || ""));
    if (matchedSelection) return;

    if (availableRestaurants.length === 1) {
      const onlyId = String(availableRestaurants[0]?.id || "").trim();
      if (onlyId !== String(selectedRestaurantId || "")) setSelectedRestaurantId(onlyId);
      return;
    }

    const fallbackScope = userRestaurantScope.find((scopeValue) => resolveRestaurantIdFromScope(availableRestaurants, scopeValue));
    const fallbackId = fallbackScope ? resolveRestaurantIdFromScope(availableRestaurants, fallbackScope) : "";
    if (fallbackId && fallbackId !== String(selectedRestaurantId || "")) {
      setSelectedRestaurantId(fallbackId);
      return;
    }

    if (selectedRestaurantId) setSelectedRestaurantId("");
  }, [availableRestaurants, isAdmin, selectedRestaurantId, userRestaurantScope]);

  const effectiveRestaurantId = String(selectedRestaurantId || "").trim();

  const selectedRestaurant = useMemo(
    () => availableRestaurants.find((item) => String(item.id) === String(effectiveRestaurantId)),
    [availableRestaurants, effectiveRestaurantId]
  );

  const applicableTemplates = useMemo(() => {
    const restaurantId = String(effectiveRestaurantId || "");
    return (templates || [])
      .filter((template) => {
        if (template?.isActive === false) return false;
        const assigned = Array.isArray(template?.restaurantIds) ? template.restaurantIds.map(String) : [];
        if (assigned.length > 0 && restaurantId && !assigned.includes(restaurantId)) return false;
        return true;
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "uk"));
  }, [templates, effectiveRestaurantId]);

  const selectedTemplate = useMemo(
    () => (templates || []).find((template) => String(template.id) === String(selectedTemplateId)) || null,
    [templates, selectedTemplateId]
  );

  // Підтримуємо валідний вибір шаблону: якщо поточний недоступний — беремо перший.
  useEffect(() => {
    if (!applicableTemplates.length) {
      if (selectedTemplateId) setSelectedTemplateId("");
      return;
    }
    const stillValid = applicableTemplates.some((template) => String(template.id) === String(selectedTemplateId));
    if (!stillValid) setSelectedTemplateId(String(applicableTemplates[0].id));
  }, [applicableTemplates, selectedTemplateId]);

  // Завантаження відповідей з наявного аудиту (якщо немає незбережених правок).
  useEffect(() => {
    if (dirty) return;
    const match = findAuditFor(audits, effectiveRestaurantId, selectedTemplateId, selectedDate);
    if (match) {
      const migrated = migrateAuditPhotos(match.gallery, match.responses);
      setResponses(migrated.responses);
      setGallery(migrated.gallery);
      setCurrentAuditId(match.id);
      setStatus(match.status || "draft");
      setAuditStartedAt(String(match.startedAt || ""));
    } else {
      setResponses({});
      setGallery([]);
      setCurrentAuditId(null);
      setStatus("draft");
      setAuditStartedAt("");
    }
  }, [effectiveRestaurantId, selectedTemplateId, selectedDate, audits, dirty]);

  const scores = useMemo(() => computeHaccpScores(selectedTemplate, responses), [selectedTemplate, responses]);
  const sectionWeightSum = useMemo(() => sumWeights(selectedTemplate?.sections), [selectedTemplate]);

  const galleryById = useMemo(() => {
    const map = new Map();
    gallery.forEach((photo) => map.set(photo.id, photo));
    return map;
  }, [gallery]);

  const assignmentCount = useMemo(() => {
    const counts = {};
    Object.values(responses).forEach((resp) => {
      (Array.isArray(resp?.photoIds) ? resp.photoIds : []).forEach((id) => {
        counts[id] = (counts[id] || 0) + 1;
      });
    });
    return counts;
  }, [responses]);

  const sortedSections = useMemo(() => {
    const sections = Array.isArray(selectedTemplate?.sections) ? [...selectedTemplate.sections] : [];
    return sections.sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
  }, [selectedTemplate]);

  useEffect(() => {
    const next = {};
    sortedSections.forEach((section) => {
      next[section.id] = true;
    });
    setCollapsedSections(next);
  }, [selectedDate, selectedTemplateId, effectiveRestaurantId, sortedSections]);

  const updateResponse = (itemId, patch) => {
    setDirty(true);
    setResponses((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] || {}), ...patch } }));
  };

  const handleRating = (itemId, value) => updateResponse(itemId, { value });
  const handleComment = (itemId, comment) => updateResponse(itemId, { comment });

  // Перетворюємо файли на стиснені фото та додаємо їх у спільну галерею аудиту.
  const addPhotosToGallery = async (fileList) => {
    const files = Array.from(fileList || []).filter((file) => file.type?.startsWith("image/"));
    if (!files.length) return [];
    const room = Math.max(0, MAX_GALLERY_PHOTOS - gallery.length);
    if (room <= 0) {
      alert(`У галереї може бути не більше ${MAX_GALLERY_PHOTOS} фото.`);
      return [];
    }
    if (files.some((file) => file.size > MAX_PHOTO_SIZE)) {
      alert("Кожне фото має бути до 15 МБ.");
      return [];
    }
    const limited = files.slice(0, room);
    try {
      const encoded = [];
      for (const file of limited) {
        const dataUrl = await compressImage(file);
        if (dataUrl) {
          encoded.push({
            id: makeHaccpId(),
            name: file.name || "Фото",
            type: "image/jpeg",
            dataUrl,
            addedAt: new Date().toISOString(),
          });
        }
      }
      if (encoded.length) {
        setDirty(true);
        setGallery((prev) => [...prev, ...encoded]);
      }
      return encoded.map((photo) => photo.id);
    } catch (error) {
      console.error("Помилка обробки фото:", error);
      alert("Не вдалося обробити фото.");
      return [];
    }
  };

  // Зйомка/завантаження одразу під конкретний пункт: додаємо в галерею та прикріплюємо.
  const captureForItem = async (itemId, fileList) => {
    const ids = await addPhotosToGallery(fileList);
    if (!ids.length) return;
    const existing = responses[itemId]?.photoIds || [];
    const room = Math.max(0, MAX_PHOTOS_PER_ITEM - existing.length);
    if (room <= 0) {
      alert(`До пункту можна прикріпити не більше ${MAX_PHOTOS_PER_ITEM} фото (інші залишаться в галереї).`);
      return;
    }
    updateResponse(itemId, { photoIds: [...existing, ...ids.slice(0, room)] });
  };

  // Прикріпити/відкріпити фото галереї до пункту.
  const toggleAttach = (itemId, photoId) => {
    const existing = responses[itemId]?.photoIds || [];
    const attached = existing.includes(photoId);
    if (!attached && existing.length >= MAX_PHOTOS_PER_ITEM) {
      alert(`До пункту можна прикріпити не більше ${MAX_PHOTOS_PER_ITEM} фото.`);
      return;
    }
    updateResponse(itemId, {
      photoIds: attached ? existing.filter((id) => id !== photoId) : [...existing, photoId],
    });
  };

  const detachFromItem = (itemId, photoId) => {
    const existing = responses[itemId]?.photoIds || [];
    updateResponse(itemId, { photoIds: existing.filter((id) => id !== photoId) });
  };

  // Видалення фото з галереї: прибираємо його і з усіх пунктів, де воно прикріплене.
  const removeFromGallery = (photoId) => {
    setDirty(true);
    setGallery((prev) => prev.filter((photo) => photo.id !== photoId));
    setResponses((prev) => {
      let changed = false;
      const next = {};
      Object.entries(prev).forEach(([itemId, resp]) => {
        const ids = Array.isArray(resp?.photoIds) ? resp.photoIds : null;
        if (ids && ids.includes(photoId)) {
          changed = true;
          next[itemId] = { ...resp, photoIds: ids.filter((id) => id !== photoId) };
        } else {
          next[itemId] = resp;
        }
      });
      return changed ? next : prev;
    });
  };

  const getItemPhotos = (response) => {
    const ids = Array.isArray(response?.photoIds) ? response.photoIds : [];
    return ids.map((id) => galleryById.get(id)).filter(Boolean);
  };

  const isCompleted = status === "completed";
  const hasAuditStarted = Boolean(auditStartedAt);
  const isAuditInProgress = hasAuditStarted && !isCompleted;
  const isReadOnlyAudit = isCompleted || !isAuditInProgress;

  useEffect(() => {
    if (isAuditInProgress) return;
    setCollapsedSections((prev) => {
      let changed = false;
      const next = { ...prev };
      sortedSections.forEach((section) => {
        if (!next[section.id]) {
          next[section.id] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [isAuditInProgress, sortedSections]);

  const toggleSection = (sectionId) => {
    if (!isAuditInProgress) return;
    setCollapsedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const collectIssues = () => {
    const issues = [];
    sortedSections.forEach((section, sectionIndex) => {
      getSectionGroups(section).forEach((group, groupIndex) => {
        const usesSub = hasSubsections(section);
        group.items.forEach((item, itemIndex) => {
          const prefix = usesSub
            ? `${sectionIndex + 1}.${groupIndex + 1}.${itemIndex + 1} ${item.title}`
            : `${sectionIndex + 1}.${itemIndex + 1} ${item.title}`;
          const response = responses[item.id];
          if (!response || response.value === null || response.value === undefined || !RATING_BY_VALUE[response.value]) {
            issues.push(`${prefix} — не оцінено`);
            return;
          }
          if (isCommentRequired(response.value) && !String(response.comment || "").trim()) {
            issues.push(`${prefix} — потрібен коментар`);
          }
          const photoIds = Array.isArray(response?.photoIds) ? response.photoIds.filter((id) => galleryById.has(id)) : [];
          if (isPhotoRequired(response.value) && !photoIds.length) issues.push(`${prefix} — додайте фото`);
        });
      });
    });
    return issues;
  };

  const buildPayload = (nextStatus, startAt) => {
    const computed = computeHaccpScores(selectedTemplate, responses);
    const sectionScores = {};
    Object.entries(computed.sectionResults).forEach(([sectionId, result]) => {
      sectionScores[sectionId] = roundPercent(result.percent);
    });
    const nowIso = new Date().toISOString();
    const actorId = user?.uid || "";
    const actorName = user?.displayName || user?.email || "";

    const payload = {
      templateId: selectedTemplateId,
      templateName: selectedTemplate?.name || "",
      templateSnapshot: snapshotAuditTemplate(selectedTemplate),
      restaurantId: effectiveRestaurantId,
      restaurantName: selectedRestaurant?.name || "",
      date: selectedDate,
      status: nextStatus,
      responses,
      gallery,
      totalPercent: roundPercent(computed.totalPercent),
      sectionScores,
      assessedItems: computed.assessedItems,
      totalItems: computed.totalItems,
      updatedAt: nowIso,
      updatedById: actorId,
      updatedByName: actorName,
    };

    if (startAt) payload.startedAt = startAt;

    if (nextStatus === "completed") {
      payload.completedAt = nowIso;
      payload.completedById = actorId;
      payload.completedByName = actorName;
    }

    return payload;
  };

  const persist = async (nextStatus, options = {}) => {
    if (submitLockRef.current) return;
    if (!effectiveRestaurantId) {
      alert("Оберіть заклад.");
      return false;
    }
    if (!selectedTemplate) {
      alert("Оберіть шаблон аудиту.");
      return false;
    }

    const startAt = options.startAt || auditStartedAt || "";

    if (nextStatus === "completed") {
      const issues = collectIssues();
      if (issues.length) {
        const preview = issues.slice(0, 8).join("\n");
        const more = issues.length > 8 ? `\n…та ще ${issues.length - 8}` : "";
        alert(`Неможливо завершити аудит. Виправте:\n\n${preview}${more}`);
        return false;
      }
    }

    submitLockRef.current = true;
    setSubmitting(true);
    const payload = buildPayload(nextStatus, startAt);

    let result;
    if (currentAuditId) {
      const existing = (audits || []).find((audit) => String(audit.id) === String(currentAuditId)) || {};
      result = await updateAudit(currentAuditId, { ...existing, ...payload });
    } else {
      result = await createAudit({
        ...payload,
        createdAt: new Date().toISOString(),
        createdById: user?.uid || "",
        createdByName: user?.displayName || user?.email || "",
      });
    }

    submitLockRef.current = false;
    setSubmitting(false);

    if (!result?.success) {
      alert("Не вдалося зберегти аудит.");
      return false;
    }

    setDirty(false);
    if (!currentAuditId && result.id) setCurrentAuditId(result.id);
    setStatus(nextStatus);
    setAuditStartedAt(startAt);
    return true;
  };

  const completionIssues = useMemo(() => collectIssues(), [responses, sortedSections, galleryById]);
  const canCompleteAudit = isAuditInProgress && completionIssues.length === 0;

  const handleStartAudit = async () => {
    if (hasAuditStarted || isCompleted) return;
    const startedAtIso = new Date().toISOString();
    setAuditStartedAt(startedAtIso);
    setStatus("draft");
  };

  const restaurantAudits = useMemo(() => {
    const restaurantId = String(effectiveRestaurantId || "").trim();
    const templateId = String(selectedTemplateId || "").trim();
    const allowedRestaurantIds = new Set(
      (Array.isArray(availableRestaurants) ? availableRestaurants : []).map((item) => String(item?.id || "").trim())
    );

    // Показуємо всю історію аудитів (усі статуси, без прив'язки до вибраної дати),
    // обмежуючись лише доступними для користувача закладами.
    return (audits || [])
      .filter((audit) => {
        const auditRestaurantId = String(audit?.restaurantId || "").trim();
        if (restaurantId) return auditRestaurantId === restaurantId;
        if (isAdmin) return true;
        return allowedRestaurantIds.has(auditRestaurantId);
      })
      .filter((audit) => {
        if (!templateId) return true;
        return String(audit?.templateId || "").trim() === templateId;
      })
      .sort((a, b) => getAuditSortKey(b) - getAuditSortKey(a));
  }, [audits, availableRestaurants, effectiveRestaurantId, isAdmin, selectedTemplateId]);

  const openHistoryAuditPreview = (audit) => {
    setHistoryAuditPreview(audit || null);
  };

  const historyPreviewTemplate = useMemo(() => {
    if (!historyAuditPreview) return null;
    if (historyAuditPreview?.templateSnapshot && typeof historyAuditPreview.templateSnapshot === "object") {
      return historyAuditPreview.templateSnapshot;
    }
    return (templates || []).find((template) => String(template?.id || "") === String(historyAuditPreview?.templateId || "")) || null;
  }, [historyAuditPreview, templates]);

  const historyPreviewSections = useMemo(() => {
    const list = Array.isArray(historyPreviewTemplate?.sections) ? [...historyPreviewTemplate.sections] : [];
    return list.sort((a, b) => Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0));
  }, [historyPreviewTemplate]);

  const historyPreviewGalleryById = useMemo(() => {
    const map = new Map();
    (Array.isArray(historyAuditPreview?.gallery) ? historyAuditPreview.gallery : []).forEach((photo) => {
      const id = String(photo?.id || "");
      if (id) map.set(id, photo);
    });
    return map;
  }, [historyAuditPreview]);

  const handleDeleteAudit = async (audit) => {
    if (!isAdmin) return;
    if (!confirm(`Видалити аудит від ${formatDisplayDate(audit.date)}?`)) return;
    const result = await removeAudit(audit.id);
    if (!result.success) alert("Не вдалося видалити аудит.");
  };

  return (
    <div className="space-y-4">
      <div className="card border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-xl sticky top-0 z-20">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} className="text-emerald-600" />
            <h2 className="text-base font-semibold">Аудит</h2>
            {isCompleted ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 size={12} /> Завершено
              </span>
            ) : currentAuditId ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                Чернетка
              </span>
            ) : null}
          </div>

          {effectiveRestaurantId && selectedTemplate ? (
            <div className="flex flex-wrap items-center gap-2">
              {dirty ? <span className="text-xs font-medium text-amber-600">• незбережені зміни</span> : null}
              {!isAuditInProgress && !isCompleted ? (
                <span className="text-xs text-slate-500">• оцінка після старту</span>
              ) : null}
              {isAuditInProgress && !canCompleteAudit ? (
                <span className="text-xs text-red-600">• залишилось заповнити: {completionIssues.length}</span>
              ) : null}
              <button
                type="button"
                onClick={() => persist("draft")}
                disabled={submitting || isCompleted}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <Save size={14} /> Зберегти чернетку
              </button>
              {!hasAuditStarted ? (
                <button
                  type="button"
                  onClick={handleStartAudit}
                  disabled={submitting || isCompleted}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  <CheckCircle2 size={14} /> Розпочати аудит
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => persist("completed")}
                  disabled={submitting || !canCompleteAudit}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  <CheckCircle2 size={14} /> Завершити аудит
                </button>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <div className="min-w-0 xl:basis-[520px] xl:flex-none">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-[150px_220px_auto]">
            <div>
              <label className="text-xs font-semibold text-slate-700">Заклад</label>
              <select
                className={compactInputClass}
                value={effectiveRestaurantId || ""}
                onChange={(e) => { setSelectedRestaurantId(e.target.value); setDirty(false); }}
                disabled={!isAdmin && availableRestaurants.length <= 1}
              >
                <option value="">Оберіть заклад</option>
                {availableRestaurants.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Шаблон аудиту</label>
              <select
                className={compactInputClass}
                value={selectedTemplateId || ""}
                onChange={(e) => { setSelectedTemplateId(e.target.value); setDirty(false); }}
              >
                <option value="">Оберіть шаблон</option>
                {applicableTemplates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Дата</label>
              <div className="mt-1">
                <DatePickerPopover
                  value={selectedDate}
                  onChange={(nextDate) => {
                    setSelectedDate(nextDate);
                    setDirty(false);
                  }}
                  max={todayDate()}
                  label=""
                />
              </div>
            </div>
          </div>
          </div>

          {effectiveRestaurantId && selectedTemplate ? (
            <div className="min-w-0 flex-1 xl:min-w-[420px]">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-3xl font-extrabold leading-none text-slate-900">{roundPercent(scores.totalPercent)}%</span>
                    <ScoreBadge percent={scores.totalPercent} />
                  </div>
                  <div className="text-right text-xs text-slate-600">
                    <p>Оцінено: <span className="font-semibold text-slate-900">{scores.assessedItems} з {scores.totalItems}</span></p>
                    <div className="mt-0.5"><WeightSumBadge sum={sectionWeightSum} label="Ваги розділів" /></div>
                  </div>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white">
                  <div className={`h-full rounded-full transition-all ${gradeBandFor(scores.totalPercent).barClass}`} style={{ width: `${Math.min(100, Math.max(0, roundPercent(scores.totalPercent)))}%` }} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                  {RATING_SCALE.map((rating) => (
                    <span key={rating.value} className="inline-flex items-center gap-1">
                      <span className={`h-2 w-2 rounded-full ${rating.dotClass}`} /> {rating.label} — {Number.isFinite(rating.percent) ? `${rating.percent}%` : "n/a"}
                    </span>
                  ))}
                  {hasAuditStarted ? (
                    <span className="text-slate-400">· старт: {new Date(auditStartedAt).toLocaleString("uk-UA")}</span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {!effectiveRestaurantId || !selectedTemplate ? (
        <div className={cardClass}>
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            {applicableTemplates.length === 0
              ? "Для цього закладу немає призначених шаблонів аудиту. Створіть або призначте шаблон у вкладці «Шаблони Аудитів»."
              : "Оберіть заклад і шаблон, щоб почати аудит."}
          </div>
        </div>
      ) : (
        <>
          <PhotoGalleryPanel
            photos={gallery}
            assignmentCount={assignmentCount}
            collapsed={galleryCollapsed}
            onToggle={() => setGalleryCollapsed((prev) => !prev)}
            onAddFiles={(files) => { void addPhotosToGallery(files); }}
            onRemove={removeFromGallery}
            onPreview={setLightbox}
            disabled={isReadOnlyAudit}
          />

          <div className="space-y-3">
            {sortedSections.map((section, sectionIndex) => {
              const sectionResult = scores.sectionResults[section.id] || { percent: 0, assessed: 0, total: flattenSectionItems(section).length };
              const collapsed = Boolean(collapsedSections[section.id]);
              const groups = getSectionGroups(section);
              const usesSubsections = hasSubsections(section);
              const renderItem = (item, label) => {
                const response = responses[item.id] || {};
                return (
                  <AuditItemCard
                    key={item.id}
                    item={item}
                    label={label}
                    response={response}
                    photos={getItemPhotos(response)}
                    isReadOnlyAudit={isReadOnlyAudit}
                    onRate={(value) => handleRating(item.id, value)}
                    onComment={(text) => handleComment(item.id, text)}
                    onCaptureFiles={(files) => captureForItem(item.id, files)}
                    onOpenPicker={() => setPicker({ itemId: item.id, itemLabel: `${label} ${item.title}` })}
                    onDetach={(photoId) => detachFromItem(item.id, photoId)}
                    onPreview={(photo) => setLightbox(photo)}
                  />
                );
              };
              return (
                <div key={section.id} className={cardClass}>
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    disabled={!isAuditInProgress}
                    className={`flex w-full items-center justify-between gap-3 text-left ${isAuditInProgress ? "" : "cursor-not-allowed opacity-80"}`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Layers size={16} className="shrink-0 text-emerald-600" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{sectionIndex + 1}. {section.title}</p>
                        <p className="text-xs text-slate-500">Вага розділу: {roundPercent(section.weight)}% · оцінено {sectionResult.assessed}/{sectionResult.total}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ScoreBadge percent={sectionResult.percent} />
                      {collapsed ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronUp size={18} className="text-slate-400" />}
                    </div>
                  </button>

                  {!collapsed ? (
                    <div className="mt-3 space-y-2.5">
                      {usesSubsections ? (
                        groups.map((group, subIndex) => {
                          const subResult = scores.sectionResults[group.id] || { percent: 0, assessed: 0, total: group.items.length };
                          return (
                            <div key={group.id} className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="min-w-0 truncate text-sm font-semibold text-emerald-800">
                                  {sectionIndex + 1}.{subIndex + 1} {group.title || "Підрозділ"}
                                  <span className="ml-1 font-normal text-emerald-600/70">· вага {roundPercent(group.weight)}% · оцінено {subResult.assessed}/{subResult.total}</span>
                                </p>
                                <ScoreBadge percent={subResult.percent} />
                              </div>
                              <div className="space-y-2.5">
                                {group.items.map((item, itemIndex) => renderItem(item, `${sectionIndex + 1}.${subIndex + 1}.${itemIndex + 1}`))}
                                {!group.items.length ? <p className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">У цьому підрозділі немає пунктів.</p> : null}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <>
                          {groups[0].items.map((item, itemIndex) => renderItem(item, `${sectionIndex + 1}.${itemIndex + 1}`))}
                          {!groups[0].items.length ? <p className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">У цьому розділі немає пунктів.</p> : null}
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}

      <PhotoPickerModal
        open={Boolean(picker)}
        itemLabel={picker?.itemLabel || ""}
        photos={gallery}
        selectedIds={Array.isArray(responses?.[picker?.itemId]?.photoIds) ? responses?.[picker?.itemId]?.photoIds : []}
        max={MAX_PHOTOS_PER_ITEM}
        onToggle={(photoId) => {
          if (!picker?.itemId) return;
          toggleAttach(picker.itemId, photoId);
        }}
        onAddFiles={(files) => {
          if (!picker?.itemId) return;
          void captureForItem(picker.itemId, files);
        }}
        onClose={() => setPicker(null)}
      />

      <div className={cardClass}>
        <button type="button" onClick={() => setShowHistory((prev) => !prev)} className="flex w-full items-center justify-between gap-2 text-left">
          <div className="flex items-center gap-2">
            <ListChecks size={17} className="text-emerald-600" />
            <h3 className="font-semibold">Історія аудитів {selectedRestaurant ? `· ${selectedRestaurant.name}` : ""}</h3>
          </div>
          {showHistory ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
        </button>

        {showHistory ? (
          <div className="mt-3 overflow-x-auto">
            {restaurantAudits.length ? (
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="py-2 pr-3">Дата</th>
                    <th className="py-2 pr-3">Локація</th>
                    <th className="py-2 pr-3">Шаблон</th>
                    <th className="py-2 pr-3">Результат</th>
                    <th className="py-2 pr-3">Статус</th>
                    <th className="py-2 pr-3 text-right">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {restaurantAudits.map((audit) => (
                    <tr key={audit.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium text-slate-900">{formatDisplayDate(audit.date)}</td>
                      <td className="py-2 pr-3 text-slate-600">{audit.restaurantName || "—"}</td>
                      <td className="py-2 pr-3 text-slate-600">{audit.templateName || "—"}</td>
                      <td className="py-2 pr-3"><ScoreBadge percent={audit.totalPercent || 0} /></td>
                      <td className="py-2 pr-3">
                        {audit.status === "completed" ? (
                          <span className="text-emerald-700">Завершено</span>
                        ) : (
                          <span className="text-amber-600">Чернетка</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => openHistoryAuditPreview(audit)} className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200">
                            Відкрити
                          </button>
                          {isAdmin ? (
                            <button type="button" onClick={() => handleDeleteAudit(audit)} className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200">
                              <Trash2 size={13} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">Для обраних фільтрів (локація, тип аудиту) аудитів не знайдено.</p>
            )}
          </div>
        ) : null}
      </div>

      {historyAuditPreview ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-4" onClick={() => setHistoryAuditPreview(null)}>
          <div className="w-full max-w-5xl rounded-xl border border-slate-200 bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-900">Перегляд аудиту з історії</p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDisplayDate(historyAuditPreview?.date)} · {String(historyAuditPreview?.restaurantName || selectedRestaurant?.name || "Заклад")}
                </p>
                <p className="mt-1 text-xs text-slate-500">{String(historyAuditPreview?.templateName || historyPreviewTemplate?.name || "Шаблон")}</p>
              </div>
              <div className="flex items-center gap-2">
                <ScoreBadge percent={Number(historyAuditPreview?.totalPercent || 0)} />
                <button
                  type="button"
                  onClick={() => setHistoryAuditPreview(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Закрити
                </button>
              </div>
            </div>

            <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
              {historyPreviewSections.length ? (
                historyPreviewSections.map((section, sectionIndex) => {
                  const groups = getSectionGroups(section);
                  const usesSub = hasSubsections(section);
                  const renderPreviewItem = (sectionItem, label) => {
                    const itemId = String(sectionItem?.id || "");
                    const response = historyAuditPreview?.responses?.[itemId] || {};
                    const rating = RATING_BY_VALUE?.[response?.value] || null;
                    const photoIds = Array.isArray(response?.photoIds) ? response.photoIds : [];
                    const linkedPhotos = photoIds.map((id) => historyPreviewGalleryById.get(String(id || ""))).filter((photo) => getPhotoSrc(photo));
                    const legacyPhotos = (Array.isArray(response?.photos) ? response.photos : []).filter((photo) => getPhotoSrc(photo));
                    const mergedPhotos = [...linkedPhotos, ...legacyPhotos];
                    const seen = new Set();
                    const photos = mergedPhotos.filter((photo) => {
                      const key = String(photo?.id || getPhotoSrc(photo) || "");
                      if (!key || seen.has(key)) return false;
                      seen.add(key);
                      return true;
                    });

                    return (
                      <div key={`${itemId || label}`} className="rounded-md border border-slate-200 bg-white p-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-slate-800">{label} {String(sectionItem?.title || "Пункт")}</p>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${rating ? rating.idleClass : "border-slate-300 bg-slate-100 text-slate-600"}`}>
                            {rating ? rating.label : "Не оцінено"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          <span className="font-semibold text-slate-700">Коментар:</span> {String(response?.comment || "").trim() || "Коментар відсутній"}
                        </p>
                        {photos.length ? (
                          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                            {photos.map((photo, photoIndex) => (
                              <button
                                key={`${itemId}_${photo?.id || photoIndex}`}
                                type="button"
                                onClick={() => setLightbox(photo)}
                                className="overflow-hidden rounded border border-slate-200 bg-slate-50"
                                title={photo?.name || "Фото пункту"}
                              >
                                <img src={getPhotoSrc(photo)} alt={photo?.name || "Фото пункту"} className="h-16 w-full object-cover" />
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  };

                  return (
                    <div key={String(section?.id || sectionIndex)} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="font-semibold text-slate-900">{sectionIndex + 1}. {String(section?.title || "Розділ")}</p>
                      <div className="mt-2 space-y-2">
                        {usesSub
                          ? groups.map((group, subIndex) => (
                              <div key={group.id} className="rounded-md border border-emerald-200 bg-emerald-50/40 p-2">
                                <p className="mb-1.5 text-sm font-semibold text-emerald-800">{sectionIndex + 1}.{subIndex + 1} {group.title || "Підрозділ"}</p>
                                <div className="space-y-2">
                                  {group.items.map((sectionItem, itemIndex) => renderPreviewItem(sectionItem, `${sectionIndex + 1}.${subIndex + 1}.${itemIndex + 1}`))}
                                </div>
                              </div>
                            ))
                          : groups[0].items.map((sectionItem, itemIndex) => renderPreviewItem(sectionItem, `${sectionIndex + 1}.${itemIndex + 1}`))}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">Для цього аудиту не знайдено структуру шаблону.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Картка пункту аудиту (спільна для розділів і підрозділів)           */
/* ------------------------------------------------------------------ */

function AuditItemCard({ item, label, response, photos, isReadOnlyAudit, onRate, onComment, onCaptureFiles, onOpenPicker, onDetach, onPreview }) {
  const currentValue = response?.value;
  const needsComment = isCommentRequired(currentValue);
  const needsPhotos = isPhotoRequired(currentValue);
  const canAttachPhotos = currentValue !== null && currentValue !== undefined && (Number(currentValue) === 1 || Number(currentValue) === 0);
  const showEvidenceBlock = needsComment || canAttachPhotos;
  const commentMissing = needsComment && !String(response?.comment || "").trim();
  const photosMissing = needsPhotos && photos.length === 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {label} {item.title}
            <span className="ml-1 font-normal text-slate-400">· вага {roundPercent(toPositiveNumber(item.weight, 1))}</span>
          </p>
          {item.description ? <p className="mt-0.5 text-xs text-slate-500">{item.description}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {RATING_SCALE.map((rating) => {
            const active = currentValue === rating.value;
            return (
              <button
                key={rating.value}
                type="button"
                onClick={() => onRate(rating.value)}
                disabled={isReadOnlyAudit}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${active ? rating.selectedClass : rating.idleClass}`}
                title={rating.short}
              >
                {rating.label}
              </button>
            );
          })}
        </div>
      </div>

      {showEvidenceBlock ? (
        <div className="mt-2.5 space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
          {needsComment ? (
            <div>
              <label className="flex items-center gap-1 text-xs font-semibold text-amber-800">
                <AlertTriangle size={12} /> Коментар обовʼязковий
              </label>
              <textarea
                className={`${inputClass} min-h-[56px] ${commentMissing ? "border-red-400 focus:border-red-500 focus:ring-red-100" : ""}`}
                value={String(response?.comment || "")}
                onChange={(e) => onComment(e.target.value)}
                disabled={isReadOnlyAudit}
                placeholder="Опишіть результат перевірки по пункту"
              />
            </div>
          ) : null}

          {canAttachPhotos ? (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <label className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 ${isReadOnlyAudit ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                  <Camera size={13} /> Додати фото
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={isReadOnlyAudit}
                    className="hidden"
                    onChange={(e) => {
                      void onCaptureFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={onOpenPicker}
                  disabled={isReadOnlyAudit}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Images size={13} /> З галереї
                </button>
                <span className={`text-[11px] ${photosMissing ? "text-red-500" : "text-slate-400"}`}>{photos.length}/{MAX_PHOTOS_PER_ITEM}</span>
              </div>
              {photos.length > 0 ? (
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {photos.map((photo, photoIndex) => (
                    <div key={`${item.id}_${photo.id || photoIndex}`} className="relative">
                      <button type="button" onClick={() => onPreview(photo)} className="w-full">
                        <img src={getPhotoSrc(photo)} alt={photo.name || "фото"} className="h-20 w-full rounded-lg border border-slate-200 object-cover" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDetach(photo.id)}
                        disabled={isReadOnlyAudit}
                        className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-0.5 text-white shadow hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={`mt-2 text-xs ${needsPhotos ? "text-red-500" : "text-slate-500"}`}>
                  {needsPhotos
                    ? "Для оцінки «Погано» додайте щонайменше одне фото."
                    : "Фото можна додати за бажанням для оцінки «Задовільно»."}
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Редактор розділу шаблону                                            */
/* ------------------------------------------------------------------ */

function SectionEditor({ section, index, totalSections, isAdmin, onChange, onRemove, onMove }) {
  const usesSubsections = hasSubsections(section);
  const directItems = Array.isArray(section.items) ? section.items : [];
  const subsections = Array.isArray(section.subsections) ? section.subsections : [];

  const makeItem = (order) => ({ id: makeHaccpId(), title: "", description: "", weight: 1, sortOrder: order });

  // --- Прямі пункти розділу (legacy режим) ---
  const addDirectItem = () => onChange({ ...section, items: [...directItems, makeItem(directItems.length)] });
  const updateDirectItem = (itemId, patch) =>
    onChange({ ...section, items: directItems.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) });
  const removeDirectItem = (itemId) =>
    onChange({ ...section, items: directItems.filter((item) => item.id !== itemId) });
  const distributeDirectItems = () => {
    const weights = distributeEqually(directItems.length);
    onChange({ ...section, items: directItems.map((item, idx) => ({ ...item, weight: weights[idx] })) });
  };

  // --- Підрозділи ---
  const addSubsection = () => {
    let subs = [...subsections];
    let items = directItems;
    // Якщо у розділі вже є прямі пункти — загортаємо їх у "Підрозділ 1",
    // щоб нічого не втратити при переході в режим підрозділів.
    if (!subsections.length && directItems.length) {
      subs.push({
        id: makeHaccpId(),
        title: "Підрозділ 1",
        weight: 0,
        sortOrder: 0,
        items: directItems.map((item, i) => ({ ...item, sortOrder: i })),
      });
      items = [];
    }
    subs.push({ id: makeHaccpId(), title: "", weight: 0, sortOrder: subs.length, items: [] });
    onChange({ ...section, items, subsections: subs });
  };

  const updateSubsection = (subId, patch) =>
    onChange({ ...section, subsections: subsections.map((sub) => (sub.id === subId ? { ...sub, ...patch } : sub)) });

  const removeSubsection = (subId) => {
    const next = subsections.filter((sub) => sub.id !== subId).map((sub, idx) => ({ ...sub, sortOrder: idx }));
    // Якщо підрозділів не лишилось — повертаємось у режим прямих пунктів.
    onChange({ ...section, subsections: next.length ? next : undefined });
  };

  const moveSubsection = (subIndex, direction) => {
    const next = [...subsections].sort((a, b) => Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0));
    const target = subIndex + direction;
    if (target < 0 || target >= next.length) return;
    [next[subIndex], next[target]] = [next[target], next[subIndex]];
    onChange({ ...section, subsections: next.map((sub, idx) => ({ ...sub, sortOrder: idx })) });
  };

  const distributeSubsectionWeights = () => {
    const weights = distributeEqually(subsections.length);
    onChange({ ...section, subsections: subsections.map((sub, idx) => ({ ...sub, weight: weights[idx] })) });
  };

  const addSubItem = (subId) =>
    onChange({
      ...section,
      subsections: subsections.map((sub) =>
        sub.id === subId ? { ...sub, items: [...(sub.items || []), makeItem((sub.items || []).length)] } : sub
      ),
    });
  const updateSubItem = (subId, itemId, patch) =>
    onChange({
      ...section,
      subsections: subsections.map((sub) =>
        sub.id === subId ? { ...sub, items: (sub.items || []).map((item) => (item.id === itemId ? { ...item, ...patch } : item)) } : sub
      ),
    });
  const removeSubItem = (subId, itemId) =>
    onChange({
      ...section,
      subsections: subsections.map((sub) =>
        sub.id === subId ? { ...sub, items: (sub.items || []).filter((item) => item.id !== itemId) } : sub
      ),
    });
  const distributeSubItemWeights = (subId) =>
    onChange({
      ...section,
      subsections: subsections.map((sub) => {
        if (sub.id !== subId) return sub;
        const weights = distributeEqually((sub.items || []).length);
        return { ...sub, items: (sub.items || []).map((item, idx) => ({ ...item, weight: weights[idx] })) };
      }),
    });

  const sortedSubsections = [...subsections].sort((a, b) => Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-1 pt-1">
          <button type="button" onClick={() => onMove(index, -1)} disabled={!isAdmin || index === 0} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
            <ArrowUp size={14} />
          </button>
          <button type="button" onClick={() => onMove(index, 1)} disabled={!isAdmin || index === totalSections - 1} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
            <ArrowDown size={14} />
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px]">
            <div>
              <label className="text-xs font-semibold text-slate-700">Розділ {index + 1} *</label>
              <input className={inputClass} value={section.title} onChange={(e) => onChange({ ...section, title: e.target.value })} disabled={!isAdmin} placeholder="Назва розділу" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Вага розділу, %</label>
              <input
                type="number"
                min="0"
                step="0.1"
                className={inputClass}
                value={section.weight ?? 0}
                onChange={(e) => onChange({ ...section, weight: Number(e.target.value || 0) })}
                disabled={!isAdmin}
              />
            </div>
          </div>

          {usesSubsections ? (
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-emerald-700">Підрозділи ({sortedSubsections.length})</p>
                <div className="flex items-center gap-1.5">
                  <WeightSumBadge sum={sumWeights(subsections)} label="Ваги підрозділів" />
                  <button type="button" onClick={distributeSubsectionWeights} disabled={!isAdmin || !subsections.length} className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                    Рівні ваги
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {sortedSubsections.map((sub, subIndex) => (
                  <div key={sub.id} className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5">
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col gap-1 pt-1">
                        <button type="button" onClick={() => moveSubsection(subIndex, -1)} disabled={!isAdmin || subIndex === 0} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
                          <ArrowUp size={12} />
                        </button>
                        <button type="button" onClick={() => moveSubsection(subIndex, 1)} disabled={!isAdmin || subIndex === sortedSubsections.length - 1} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30">
                          <ArrowDown size={12} />
                        </button>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px]">
                          <div>
                            <label className="text-[11px] font-semibold text-slate-600">Підрозділ {index + 1}.{subIndex + 1} *</label>
                            <input className={inputClass} value={sub.title || ""} onChange={(e) => updateSubsection(sub.id, { title: e.target.value })} disabled={!isAdmin} placeholder="Назва підрозділу" />
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold text-slate-600">Вага, %</label>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              className={inputClass}
                              value={sub.weight ?? 0}
                              onChange={(e) => updateSubsection(sub.id, { weight: Number(e.target.value || 0) })}
                              disabled={!isAdmin}
                            />
                          </div>
                        </div>
                        <div className="mt-2">
                          <ItemsBlock
                            items={sub.items || []}
                            numberPrefix={`${index + 1}.${subIndex + 1}`}
                            isAdmin={isAdmin}
                            onAdd={() => addSubItem(sub.id)}
                            onUpdate={(itemId, patch) => updateSubItem(sub.id, itemId, patch)}
                            onRemove={(itemId) => removeSubItem(sub.id, itemId)}
                            onDistribute={() => distributeSubItemWeights(sub.id)}
                          />
                        </div>
                      </div>
                      <button type="button" onClick={() => removeSubsection(sub.id)} disabled={!isAdmin} className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-40">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button type="button" onClick={addSubsection} disabled={!isAdmin} className="mt-2 inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40">
                <Plus size={12} /> Підрозділ
              </button>
            </div>
          ) : (
            <div className="mt-3">
              <ItemsBlock
                items={directItems}
                numberPrefix={`${index + 1}`}
                isAdmin={isAdmin}
                onAdd={addDirectItem}
                onUpdate={updateDirectItem}
                onRemove={removeDirectItem}
                onDistribute={distributeDirectItems}
              />
              <button type="button" onClick={addSubsection} disabled={!isAdmin} className="mt-2 inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40">
                <Plus size={12} /> Додати підрозділ
              </button>
            </div>
          )}
        </div>

        <button type="button" onClick={() => onRemove(section.id)} disabled={!isAdmin} className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-40">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

// Блок редагування пунктів (спільний для розділу та підрозділу).
function ItemsBlock({ items, numberPrefix, isAdmin, onAdd, onUpdate, onRemove, onDistribute }) {
  const list = Array.isArray(items) ? items : [];
  const itemsWeightSum = sumWeights(list);
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-slate-700">Пункти ({list.length})</p>
          <WeightSumBadge sum={itemsWeightSum} label="Ваги пунктів" />
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onDistribute} disabled={!isAdmin || !list.length} className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
            Рівні ваги
          </button>
          <button type="button" onClick={onAdd} disabled={!isAdmin} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40">
            <Plus size={12} /> Пункт
          </button>
        </div>
      </div>

      <div className="mt-2 space-y-2">
        {list.map((item, itemIndex) => (
          <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-2">
            <div className="flex items-start gap-2">
              <span className="pt-2 text-xs font-semibold text-slate-400">{numberPrefix}.{itemIndex + 1}</span>
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 md:grid-cols-[1fr_90px]">
                <input className={inputClass} value={item.title} onChange={(e) => onUpdate(item.id, { title: e.target.value })} disabled={!isAdmin} placeholder="Критерій відповідності" />
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className={inputClass}
                  value={item.weight ?? 1}
                  onChange={(e) => onUpdate(item.id, { weight: Number(e.target.value || 0) })}
                  disabled={!isAdmin}
                  title="Вага пункту"
                />
              </div>
              <button type="button" onClick={() => onRemove(item.id)} disabled={!isAdmin} className="mt-1.5 rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-40">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        {!list.length ? <p className="rounded-md border border-dashed border-slate-300 p-2 text-[11px] text-slate-400">Додайте пункти.</p> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Вкладка шаблонів                                                    */
/* ------------------------------------------------------------------ */

const emptyTemplateForm = () => ({ name: "", description: "", isActive: true, restaurantIds: [], sections: [] });

function TemplatesTab({ user, restaurants, templates, createTemplate, updateTemplate, removeTemplate, userPermissions = {} }) {
  const isAdmin = user?.role === "admin";
  // Користувач може редагувати шаблони, якщо він адміністратор або має дозвіл на вкладку редагування шаблонів
  const hasTemplateEditAccess = isAdmin || Boolean(userPermissions["ops-checklists"]);
  const availableRestaurants = restaurants || [];

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyTemplateForm());
  const [saving, setSaving] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const restaurantNameById = useMemo(() => {
    const map = new Map();
    availableRestaurants.forEach((item) => map.set(String(item.id), item.name));
    return map;
  }, [availableRestaurants]);

  const sectionWeightSum = useMemo(() => sumWeights(form.sections), [form.sections]);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyTemplateForm());
    setIsEditorOpen(true);
  };

  const startCreateFromDefault = () => {
    setEditingId(null);
    setForm(buildDefaultHaccpTemplate());
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setEditingId(null);
    setForm(emptyTemplateForm());
    setIsEditorOpen(false);
  };

  const startEdit = (template) => {
    const mapItems = (items) =>
      (Array.isArray(items) ? items : []).map((item, itemIndex) => ({
        id: item.id || makeHaccpId(),
        title: item.title || "",
        description: item.description || "",
        weight: Number(item.weight ?? 1),
        sortOrder: Number(item.sortOrder ?? itemIndex),
      }));

    const sections = (template.sections || []).map((section, sectionIndex) => {
      const base = {
        id: section.id || makeHaccpId(),
        title: section.title || "",
        weight: Number(section.weight ?? 0),
        sortOrder: Number(section.sortOrder ?? sectionIndex),
      };
      if (Array.isArray(section.subsections) && section.subsections.length) {
        return {
          ...base,
          subsections: section.subsections.map((sub, subIndex) => ({
            id: sub.id || makeHaccpId(),
            title: sub.title || "",
            weight: Number(sub.weight ?? 0),
            sortOrder: Number(sub.sortOrder ?? subIndex),
            items: mapItems(sub.items),
          })),
        };
      }
      return { ...base, items: mapItems(section.items) };
    });
    setEditingId(template.id);
    setForm({
      name: template.name || "",
      description: template.description || "",
      isActive: template.isActive !== false,
      restaurantIds: (template.restaurantIds || []).map(String),
      sections,
    });
    setIsEditorOpen(true);
  };

  const addSection = () => {
    setForm((prev) => ({
      ...prev,
      sections: [...prev.sections, { id: makeHaccpId(), title: "", weight: 0, sortOrder: prev.sections.length, items: [] }],
    }));
  };

  const updateSection = (nextSection) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((section) => (section.id === nextSection.id ? nextSection : section)),
    }));
  };

  const removeSection = (sectionId) => {
    setForm((prev) => ({ ...prev, sections: prev.sections.filter((section) => section.id !== sectionId) }));
  };

  const moveSection = (index, direction) => {
    setForm((prev) => {
      const next = [...prev.sections];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, sections: next.map((section, idx) => ({ ...section, sortOrder: idx })) };
    });
  };

  const distributeSectionWeights = () => {
    setForm((prev) => {
      const weights = distributeEqually(prev.sections.length);
      return { ...prev, sections: prev.sections.map((section, idx) => ({ ...section, weight: weights[idx] })) };
    });
  };

  const toggleRestaurant = (restaurantId) => {
    setForm((prev) => {
      const exists = prev.restaurantIds.map(String).includes(String(restaurantId));
      return {
        ...prev,
        restaurantIds: exists
          ? prev.restaurantIds.filter((id) => String(id) !== String(restaurantId))
          : [...prev.restaurantIds, String(restaurantId)],
      };
    });
  };

  const saveTemplate = async () => {
    if (!hasTemplateEditAccess || saving) return;
    if (!form.name.trim()) {
      alert("Вкажіть назву шаблону.");
      return;
    }

    const cleanItems = (items) =>
      (Array.isArray(items) ? items : [])
        .filter((item) => item.title?.trim())
        .map((item, itemIndex) => ({
          id: item.id || makeHaccpId(),
          title: item.title.trim(),
          description: item.description?.trim() || "",
          weight: toPositiveNumber(item.weight, 1),
          sortOrder: itemIndex,
        }));

    const sections = form.sections
      .map((section, sectionIndex) => {
        const base = {
          id: section.id || makeHaccpId(),
          title: section.title.trim(),
          weight: toPositiveNumber(section.weight, 0),
          sortOrder: sectionIndex,
        };
        if (Array.isArray(section.subsections) && section.subsections.length) {
          const subsections = section.subsections
            .map((sub, subIndex) => ({
              id: sub.id || makeHaccpId(),
              title: (sub.title || "").trim(),
              weight: toPositiveNumber(sub.weight, 0),
              sortOrder: subIndex,
              items: cleanItems(sub.items),
            }))
            .filter((sub) => sub.title || sub.items.length);
          if (subsections.length) {
            return { ...base, subsections };
          }
        }
        return { ...base, items: cleanItems(section.items) };
      })
      .filter((section) => section.title && (section.subsections?.length || section.items?.length));

    if (!sections.length) {
      alert("Додайте хоча б один розділ з пунктами.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      isActive: Boolean(form.isActive),
      restaurantIds: form.restaurantIds.map(String),
      sections,
    };

    setSaving(true);
    const result = editingId ? await updateTemplate(editingId, payload) : await createTemplate(payload);
    setSaving(false);

    if (!result.success) {
      alert("Не вдалося зберегти шаблон.");
      return;
    }
    closeEditor();
  };

  const deleteTemplate = async (template) => {
    if (!isAdmin) return;
    if (!confirm(`Видалити шаблон "${template.name}"?`)) return;
    const result = await removeTemplate(template.id);
    if (!result.success) alert("Не вдалося видалити шаблон.");
  };

  const sortedFormSections = useMemo(
    () => [...form.sections].sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)),
    [form.sections]
  );

  return (
    <div>
      {!isEditorOpen ? (
        <div className={cardClass}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-emerald-600" />
              <h2 className="text-lg font-semibold">Шаблони Аудитів</h2>
            </div>
          </div>

          {!hasTemplateEditAccess ? (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Редагування шаблонів доступне лише для адміністраторів та користувачів з дозволом на управління аудитами.
            </div>
          ) : (
            <div className="mb-4 flex flex-wrap gap-2">
              <button type="button" onClick={startCreate} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
                <Plus size={15} /> Новий шаблон
              </button>
              <button type="button" onClick={startCreateFromDefault} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
                <Copy size={15} /> Зі стандартного
              </button>
            </div>
          )}

          <div className="space-y-2">
            {templates.map((template) => {
              const assigned = Array.isArray(template.restaurantIds) ? template.restaurantIds : [];
              const sectionsCount = (template.sections || []).length;
              const itemsCount = (template.sections || []).reduce((acc, section) => acc + flattenSectionItems(section).length, 0);
              return (
                <div key={template.id} className={`rounded-lg border p-3 ${editingId === template.id ? "border-emerald-300 bg-emerald-50" : "border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{template.name}</p>
                      <p className="text-xs text-slate-500">
                        розділів: {sectionsCount} · пунктів: {itemsCount} · {assigned.length ? `закладів: ${assigned.length}` : "усі заклади"}
                      </p>
                      {assigned.length ? (
                        <p className="mt-0.5 truncate text-[11px] text-slate-400">
                          {assigned.map((id) => restaurantNameById.get(String(id)) || id).join(", ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {template.isActive === false ? <span className="rounded bg-slate-200 px-2 py-1 text-[11px] text-slate-700">Неактивний</span> : null}
                      <button type="button" onClick={() => startEdit(template)} disabled={!hasTemplateEditAccess} className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-60 disabled:cursor-not-allowed">
                        {hasTemplateEditAccess ? "Редагувати" : "Переглянути"}
                      </button>
                      {isAdmin ? (
                        <button type="button" onClick={() => deleteTemplate(template)} className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200">
                          <Trash2 size={13} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {!templates.length ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                Шаблони ще не створені. {hasTemplateEditAccess ? "Натисніть «Зі стандартного», щоб почати швидко." : ""}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className={cardClass}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={closeEditor}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                <ChevronLeft size={16} /> До списку
              </button>
              <Layers size={17} className="shrink-0 text-emerald-600" />
              <h3 className="truncate font-semibold">{editingId ? "Редагування шаблону" : "Новий шаблон"}</h3>
            </div>
            <WeightSumBadge sum={sectionWeightSum} label="Сума ваг розділів" />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-slate-800">Назва шаблону *</label>
              <input className={inputClass} value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} disabled={!hasTemplateEditAccess} placeholder="Напр. Аудит безпечності харчових продуктів" />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-slate-800">Опис</label>
              <input className={inputClass} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} disabled={!hasTemplateEditAccess} placeholder="Короткий опис призначення аудиту" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={Boolean(form.isActive)} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} disabled={!hasTemplateEditAccess} />
              Активний
            </label>
          </div>

          <div className="mt-4">
            <p className="text-sm font-semibold text-slate-800">Призначення закладам</p>
            <p className="text-xs text-slate-500">Якщо не обрати жоден заклад — шаблон доступний для всіх.</p>
            <div className="mt-2 grid max-h-32 grid-cols-1 gap-1 overflow-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
              {availableRestaurants.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.restaurantIds.map(String).includes(String(item.id))} onChange={() => toggleRestaurant(item.id)} disabled={!hasTemplateEditAccess} />
                  <span className="truncate">{item.name}</span>
                </label>
              ))}
              {!availableRestaurants.length ? <p className="text-xs text-slate-400">Немає доступних закладів.</p> : null}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Розділи та пункти</p>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={distributeSectionWeights} disabled={!hasTemplateEditAccess || !form.sections.length} className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                  Рівні ваги розділів
                </button>
                <button type="button" onClick={addSection} disabled={!hasTemplateEditAccess} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40">
                  <Plus size={13} /> Розділ
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {sortedFormSections.map((section, index) => (
                <SectionEditor
                  key={section.id}
                  section={section}
                  index={index}
                  totalSections={sortedFormSections.length}
                  isAdmin={hasTemplateEditAccess}
                  onChange={updateSection}
                  onRemove={removeSection}
                  onMove={moveSection}
                />
              ))}
              {!form.sections.length ? <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">Додайте розділи аудиту.</p> : null}
            </div>
          </div>

          {hasTemplateEditAccess ? (
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={closeEditor} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Скасувати
              </button>
              <button type="button" onClick={saveTemplate} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
                <Save size={15} /> Зберегти шаблон
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Кореневий компонент модуля                                          */
/* ------------------------------------------------------------------ */

export default function HaccpModule({ topTab, user, restaurants, forceMode = "", userPermissions = {} }) {
  const mode = forceMode || normalizeHaccpTab(topTab);
  const {
    templates,
    audits,
    loading,
    apiEnabled,
    createTemplate,
    updateTemplate,
    removeTemplate,
    createAudit,
    updateAudit,
    removeAudit,
  } = useHaccp();

  if (!apiEnabled) {
    return (
      <div className={cardClass}>
        <div className="flex items-center gap-2 text-amber-700">
          <AlertTriangle size={18} />
          <p className="font-semibold">Модуль HACCP потребує підключення до бази даних (API).</p>
        </div>
        <p className="mt-2 text-sm text-slate-600">Перевірте налаштування зʼєднання у розділі «Налаштування».</p>
      </div>
    );
  }

  if (loading) {
    return <div className={cardClass}>Завантаження HACCP...</div>;
  }

  if (mode === "templates") {
    return (
      <TemplatesTab
        user={user}
        restaurants={restaurants}
        templates={templates}
        createTemplate={createTemplate}
        updateTemplate={updateTemplate}
        removeTemplate={removeTemplate}
        userPermissions={userPermissions}
      />
    );
  }

  if (mode === "report") {
    return (
      <HaccpReportTab
        user={user}
        restaurants={restaurants}
        templates={templates}
        audits={audits}
      />
    );
  }

  return (
    <AuditTab
      user={user}
      restaurants={restaurants}
      templates={templates}
      audits={audits}
      createAudit={createAudit}
      updateAudit={updateAudit}
      removeAudit={removeAudit}
    />
  );
}
