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
  FileText,
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
import HaccpReportAllRestaurantsTab from "./HaccpReportAllRestaurants";
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
              fit: [70, 70],
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
            ];
          };

          getSectionGroups(section).forEach((group, groupIndex) => {
            if (group.isSubsection) {
              const subPercent = roundPercent(Number(sectionResults?.[group.id]?.percent || 0));
              // Заголовок підрозділу — рядок на всю ширину таблиці.
              itemRows.push([
                {
                  text: `${sectionIndex + 1}.${groupIndex + 1} ${String(group.title || "Підрозділ")}  ·  ${subPercent}%`,
                  colSpan: 4,
                  bold: true,
                  fontSize: 9,
                  color: "#065f46",
                  fillColor: "#dcfce7",
                  margin: [0, 1, 0, 1],
                },
                {}, {}, {},
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
              widths: [28, "*", 92, "*"],
              body: [
                [
                  { text: "№", bold: true, fontSize: 9, fillColor: "#e2e8f0", color: "#0f172a" },
                  { text: "Пункт перевірки", bold: true, fontSize: 9, fillColor: "#e2e8f0", color: "#0f172a" },
                  { text: "Оцінка", bold: true, fontSize: 9, fillColor: "#e2e8f0", color: "#0f172a" },
                  { text: "Коментар", bold: true, fontSize: 9, fillColor: "#e2e8f0", color: "#0f172a" },
                ],
                ...(itemRows.length ? itemRows : [[
                  { text: "—", fontSize: 9, color: "#334155" },
                  { text: "У розділі відсутні пункти", fontSize: 9, color: "#334155" },
                  { text: "—", fontSize: 9, color: "#334155" },
                  { text: "—", fontSize: 9, color: "#334155" },
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
                          <div
                            className={`h-full rounded-full transition-all ${gradeBandFor(item.score).barClass}`}
                            style={{ width: `${Math.min(100, Math.max(0, roundPercent(item.score)))}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-slate-700">{roundPercent(item.score)}%</span>
                        {scoreDelta !== null ? (
                          <span className={`shrink-0 text-sm font-semibold ${isUp ? "text-emerald-600" : isDown ? "text-red-600" : "text-slate-500"}`}>
                            {isUp ? "+" : ""}{scoreDelta}%
                          </span>
                        ) : null}
                        <span className="shrink-0 text-sm text-slate-500">{item.critical} поруш.</span>
                      </div>

                      <div className="mt-3 space-y-3">
                        {sectionRows.map((section) => (
                          <div key={section.id} className="space-y-2">
                            <div className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1">
                              <span className="font-semibold text-slate-800">{section.title}</span>
                              <span className="shrink-0 font-bold text-slate-900">{section.percent}%</span>
                            </div>
                            {section.groups.map((group) => (
                              <div key={group.id} className="space-y-1.5">
                                {group.isSubsection && (
                                  <div className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                                    {section.id.split("_")[1] ? `${section.id.split("_")[1]}.${group.id.split("_")[2] || ""}` : `${section.id}.${group.id}`}
                                    {group.title} · {group.percent}%
                                  </div>
                                )}
                                {group.items.map((sectionItem) => renderInfographicItem(section, sectionItem))}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-center text-sm text-slate-500">Немає чек-листів для відображення інфографіки.</p>
            )}
          </div>

          {/* New: All Restaurants Report Tab */}
          <HaccpReportAllRestaurantsTab
            user={user}
            restaurants={restaurants}
            templates={templates}
            audits={audits}
            periodFrom={periodFrom}
            periodTo={periodTo}
            selectedTemplateId={selectedTemplateId}
          />
        </>
      )}

      {showCriticalDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowCriticalDetails(false)}>
          <div className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-lg font-semibold text-slate-800">Порушення (критичні та суттєві)</h3>
              <button type="button" onClick={() => setShowCriticalDetails(false)} className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            {criticalDialogItems.length === 0 ? (
              <p className="mt-4 text-center text-slate-500">Порушень немає або всі мають статус «Виконано».</p>
            ) : (
              <div className="mt-4 space-y-3 max-h-[60vh] overflow-auto">
                {criticalDialogItems.map((entry, idx) => (
                  <div key={`${entry.auditId}_${entry.itemId}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-slate-800">{idx + 1}. {entry.title}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${entry.status === "done" ? "bg-emerald-100 text-emerald-800" : entry.hasPlan ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                        {entry.status === "done" ? "Виконано" : entry.hasPlan ? "Є план" : "Без плану"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{entry.auditLabel}</p>
                    {entry.violationComment && <p className="mt-1 text-sm text-slate-500 italic">Коментар: {entry.violationComment}</p>}
                    <button
                      type="button"
                      onClick={() => openPlanDialog(entry.auditId, entry.auditLabel, entry, "critical")}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg border border-sky-600 bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
                    >
                      <Plus size={12} /> {entry.hasPlan ? "Редагувати план" : "Створити план дій"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showActionPlanDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowActionPlanDetails(false)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-lg font-semibold text-slate-800">Плани дій</h3>
              <button type="button" onClick={() => setShowActionPlanDetails(false)} className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            {actionPlanEntries.length === 0 ? (
              <p className="mt-4 text-center text-slate-500">Планів дій ще не створено.</p>
            ) : (
              <div className="mt-4 space-y-3 max-h-[60vh] overflow-auto">
                {actionPlanEntries.map((entry) => (
                  <div key={entry.planKey} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-800">{entry.itemTitle}</p>
                        <p className="text-xs text-slate-500">{entry.auditLabel}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${entry.status === "done" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                        {entry.status === "done" ? "Виконано" : "У процесі"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{entry.comment}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                      <span>Дедлайн: {formatDisplayDate(entry.deadline)}</span>
                      <span>Відповідальний: {entry.responsible}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {planDialogContext && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setPlanDialogContext(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800">План дій</h3>
            <p className="mt-1 text-sm text-slate-600">{planDialogContext.itemTitle}</p>
            <p className="mt-1 text-xs text-slate-500">{planDialogContext.auditLabel}</p>
            {planDialogContext.violationComment && <p className="mt-1 text-sm text-slate-500 italic">Порушення: {planDialogContext.violationComment}</p>}

            <div className="mt-4 space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-600">Дедлайн *</span>
                <input
                  type="date"
                  className={inputClass}
                  value={planDialogDeadline}
                  onChange={(e) => setPlanDialogDeadline(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-600">Відповідальний *</span>
                <input
                  type="text"
                  className={inputClass}
                  value={planDialogResponsible}
                  onChange={(e) => setPlanDialogResponsible(e.target.value)}
                  placeholder="ПІБ через кому"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-600">Коментар (план дій) *</span>
                <textarea
                  className={inputClass}
                  rows={3}
                  value={planDialogComment}
                  onChange={(e) => setPlanDialogComment(e.target.value)}
                  placeholder="Опишіть заходи, які необхідно вжити"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-600">Статус</span>
                <select className={inputClass} value={planDialogStatus} onChange={(e) => setPlanDialogStatus(e.target.value)}>
                  <option value="in_progress">У процесі</option>
                  <option value="done">Виконано</option>
                </select>
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPlanDialogContext(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={savePlanDialog}
                className="rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Зберегти
              </button>
            </div>
          </div>
        </div>
      )}

      {galleryLightboxPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setGalleryLightboxPhoto(null)}>
          <div className="relative max-w-3xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setGalleryLightboxPhoto(null)}
              className="absolute -top-10 right-0 rounded-full bg-white/10 p-2 text-white backdrop-blur hover:bg-white/20"
            >
              <X size={24} />
            </button>
            <img src={getPhotoSrc(galleryLightboxPhoto)} alt="Фото пункту" className="max-w-full max-h-[90vh] rounded shadow-xl" />
            {galleryLightboxPhoto?.name && (
              <p className="mt-2 text-center text-sm text-white">{galleryLightboxPhoto.name}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HaccpModule() {
  const { user, restaurants, templates, audits } = useHaccp();

  if (!user) return <div className="flex h-full items-center justify-center text-slate-500">Завантаження...</div>;

  return <HaccpReportTab user={user} restaurants={restaurants} templates={templates} audits={audits} />;
}