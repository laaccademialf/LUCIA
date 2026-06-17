import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Copy,
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
import {
  RATING_BY_VALUE,
  RATING_SCALE,
  buildDefaultHaccpTemplate,
  computeHaccpScores,
  gradeBandFor,
  isCommentRequired,
  makeHaccpId,
  roundPercent,
  sumWeights,
  toPositiveNumber,
} from "../data/haccpConstants";

const cardClass = "card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl";
const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100";

const MAX_PHOTOS_PER_ITEM = 5;
const MAX_GALLERY_PHOTOS = 60;
const MAX_PHOTO_SIZE = 15 * 1024 * 1024;
const PHOTO_MAX_DIMENSION = 1600;
const PHOTO_JPEG_QUALITY = 0.72;

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

const formatDisplayDate = (value) => {
  if (!value || typeof value !== "string") return "—";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}.${m}.${y}`;
};

const normalizeHaccpTab = (tab = "") => {
  const value = String(tab).toLowerCase();
  if (value.includes("report") || value.includes("звіт") || value.includes("reprit")) return "report";
  if (value.includes("templ") || value.includes("шаблон") || value.includes("shablon")) return "templates";
  return "audit";
};

const getUserRestaurantIds = (user) => {
  if (Array.isArray(user?.restaurants) && user.restaurants.length > 0) {
    return user.restaurants.map((id) => String(id || "").trim()).filter(Boolean);
  }
  const single = String(user?.restaurant || user?.restaurantId || user?.restaurant_id || "").trim();
  return single ? [single] : [];
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
  Object.values(responses || {}).reduce((acc, response) => (Number(response?.value) === 0 ? acc + 1 : acc), 0);

const collectIssueItemIds = (responses) => {
  const ids = new Set();
  Object.entries(responses || {}).forEach(([itemId, response]) => {
    const value = response?.value;
    if (value === null || value === undefined) return;
    if (Number(value) < 2) ids.add(String(itemId));
  });
  return ids;
};

const MONTH_OPTIONS_UA = [
  { value: "01", label: "Січень" },
  { value: "02", label: "Лютий" },
  { value: "03", label: "Березень" },
  { value: "04", label: "Квітень" },
  { value: "05", label: "Травень" },
  { value: "06", label: "Червень" },
  { value: "07", label: "Липень" },
  { value: "08", label: "Серпень" },
  { value: "09", label: "Вересень" },
  { value: "10", label: "Жовтень" },
  { value: "11", label: "Листопад" },
  { value: "12", label: "Грудень" },
];

const getPhotoSrc = (photo) => String(photo?.url || photo?.dataUrl || "").trim();

function HaccpReportTab({ user, restaurants, templates, audits }) {
  const ALL_LOCATIONS_VALUE = "__ALL__";
  const isAdmin = user?.role === "admin";
  const userRestaurantIds = getUserRestaurantIds(user);

  const availableRestaurants = useMemo(() => {
    const list = Array.isArray(restaurants) ? restaurants : [];
    if (isAdmin) return list;
    if (!userRestaurantIds.length) return list;
    const allowed = new Set(userRestaurantIds.map(String));
    return list.filter((item) => allowed.has(String(item?.id || "")));
  }, [restaurants, isAdmin, userRestaurantIds]);

  const [selectedRestaurantId, setSelectedRestaurantId] = useState(ALL_LOCATIONS_VALUE);
  const [selectedAuditIds, setSelectedAuditIds] = useState([]);
  const [selectionInitialized, setSelectionInitialized] = useState(false);
  const [showCriticalDetails, setShowCriticalDetails] = useState(false);
  const [galleryLightboxPhoto, setGalleryLightboxPhoto] = useState(null);
  const [periodFromMonth, setPeriodFromMonth] = useState("");
  const [periodFromYear, setPeriodFromYear] = useState("");
  const [periodToMonth, setPeriodToMonth] = useState("");
  const [periodToYear, setPeriodToYear] = useState("");

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

  const availablePeriodYears = useMemo(() => {
    return Array.from(
      new Set(
        auditsByLocation
          .map((audit) => String(audit?.date || "").slice(0, 4))
          .filter((year) => /^\d{4}$/.test(year))
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [auditsByLocation]);

  useEffect(() => {
    const monthValues = auditsByLocation
      .map((audit) => String(audit?.date || "").slice(0, 7))
      .filter((value) => /^\d{4}-\d{2}$/.test(value))
      .sort((a, b) => a.localeCompare(b));
    if (!monthValues.length) {
      if (periodFromMonth) setPeriodFromMonth("");
      if (periodFromYear) setPeriodFromYear("");
      if (periodToMonth) setPeriodToMonth("");
      if (periodToYear) setPeriodToYear("");
      return;
    }

    const [firstYear, firstMonth] = monthValues[0].split("-");
    const [lastYear, lastMonth] = monthValues[monthValues.length - 1].split("-");

    if (!periodFromYear) setPeriodFromYear(firstYear);
    if (!periodFromMonth) setPeriodFromMonth(firstMonth);
    if (!periodToYear) setPeriodToYear(lastYear);
    if (!periodToMonth) setPeriodToMonth(lastMonth);
  }, [auditsByLocation, periodFromMonth, periodFromYear, periodToMonth, periodToYear]);

  const filteredAudits = useMemo(() => {
    const fromCandidate = periodFromYear && periodFromMonth ? `${periodFromYear}-${periodFromMonth}` : "";
    const toCandidate = periodToYear && periodToMonth ? `${periodToYear}-${periodToMonth}` : "";

    if (!fromCandidate && !toCandidate) return auditsByLocation;

    const fromKey = fromCandidate && toCandidate && fromCandidate > toCandidate ? toCandidate : fromCandidate;
    const toKey = fromCandidate && toCandidate && fromCandidate > toCandidate ? fromCandidate : toCandidate;

    return auditsByLocation.filter((audit) => {
      const monthKey = String(audit?.date || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(monthKey)) return false;
      if (fromKey && monthKey < fromKey) return false;
      if (toKey && monthKey > toKey) return false;
      return true;
    });
  }, [auditsByLocation, periodFromMonth, periodFromYear, periodToMonth, periodToYear]);

  useEffect(() => {
    if (!filteredAudits.length) {
      if (selectedAuditIds.length) setSelectedAuditIds([]);
      if (selectionInitialized) setSelectionInitialized(false);
      return;
    }

    const allowed = new Set(filteredAudits.map((audit) => String(audit.id)));
    const sanitized = selectedAuditIds.filter((id) => allowed.has(String(id)));
    if (sanitized.length !== selectedAuditIds.length) {
      setSelectedAuditIds(sanitized);
      return;
    }

    if (!selectionInitialized) {
      setSelectionInitialized(true);
      setSelectedAuditIds(filteredAudits.slice(0, 5).map((audit) => String(audit.id)));
    }
  }, [filteredAudits, selectedAuditIds, selectionInitialized]);

  const templatesById = useMemo(() => {
    const map = new Map();
    (templates || []).forEach((template) => map.set(String(template.id), template));
    return map;
  }, [templates]);

  const selectedAudits = useMemo(() => {
    const selected = new Set(selectedAuditIds.map(String));
    return filteredAudits.filter((audit) => selected.has(String(audit.id)));
  }, [filteredAudits, selectedAuditIds]);

  const galleryAudits = useMemo(() => {
    return selectedAudits.map((audit) => {
      const template = templatesById.get(String(audit?.templateId || "")) || null;
      const responses = audit?.responses && typeof audit.responses === "object" ? audit.responses : {};
      const galleryById = new Map(
        (Array.isArray(audit?.gallery) ? audit.gallery : [])
          .filter((photo) => getPhotoSrc(photo))
          .map((photo) => [String(photo?.id || ""), photo])
      );

      const mapItemPhotos = (itemId) => {
        const response = responses?.[itemId] || {};
        const byIds = (Array.isArray(response?.photoIds) ? response.photoIds : [])
          .map((photoId) => galleryById.get(String(photoId || "")))
          .filter(Boolean);
        const legacy = (Array.isArray(response?.photos) ? response.photos : []).filter((photo) => getPhotoSrc(photo));
        const dedup = new Set();
        return [...byIds, ...legacy].filter((photo) => {
          const key = String(photo?.id || getPhotoSrc(photo) || "");
          if (!key || dedup.has(key)) return false;
          dedup.add(key);
          return true;
        });
      };

      const blocks = (template?.sections || [])
        .slice()
        .sort((a, b) => Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0))
        .map((section) => {
          const categories = (section?.items || [])
            .slice()
            .sort((a, b) => Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0))
            .map((sectionItem) => {
              const photos = mapItemPhotos(String(sectionItem?.id || ""));
              return {
                id: String(sectionItem?.id || ""),
                title: String(sectionItem?.title || "Категорія без назви"),
                photos,
              };
            })
            .filter((category) => category.photos.length > 0);

          return {
            id: String(section?.id || ""),
            title: String(section?.title || "Блок без назви"),
            categories,
          };
        })
        .filter((block) => block.categories.length > 0);

      const totalPhotos = blocks.reduce(
        (sum, block) => sum + block.categories.reduce((acc, category) => acc + category.photos.length, 0),
        0
      );

      return {
        auditId: String(audit?.id || ""),
        label: `${formatDisplayDate(audit?.date)} · ${String(audit?.restaurantName || "Локація")}`,
        blocks,
        totalPhotos,
      };
    });
  }, [selectedAudits, templatesById]);

  const auditsForMetrics = selectedAudits.length ? selectedAudits : filteredAudits;

  const metrics = useMemo(
    () =>
      auditsForMetrics.map((audit) => {
        const responses = audit?.responses && typeof audit.responses === "object" ? audit.responses : {};
        const template = templatesById.get(String(audit?.templateId || "")) || null;
        const scoreValue = Number(audit?.totalPercent);
        const fallbackScore = computeHaccpScores(template, responses).totalPercent;
        const score = Number.isFinite(scoreValue) ? scoreValue : fallbackScore;
        return {
          ...audit,
          score,
          critical: countCriticalViolations(responses),
          responses,
          sortKey: getAuditSortKey(audit),
        };
      }),
    [auditsForMetrics, templatesById]
  );

  const criticalDetails = useMemo(() => {
    return metrics
      .map((audit) => {
        const template = templatesById.get(String(audit?.templateId || "")) || null;
        const itemTitleById = new Map();
        (template?.sections || []).forEach((section) => {
          (section?.items || []).forEach((item) => {
            itemTitleById.set(String(item?.id || ""), String(item?.title || ""));
          });
        });

        const items = Object.entries(audit?.responses || {})
          .filter(([, response]) => Number(response?.value) === 0)
          .map(([itemId]) => ({
            itemId,
            title: itemTitleById.get(String(itemId)) || `Пункт ${itemId}`,
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

  const trendSeries = useMemo(() => [...metrics].sort((a, b) => a.sortKey - b.sortKey), [metrics]);

  const avgScore = metrics.length
    ? roundPercent(metrics.reduce((acc, item) => acc + (Number(item.score) || 0), 0) / metrics.length)
    : 0;
  const traffic = scoreTrafficLight(avgScore);
  const criticalCount = metrics.reduce((acc, item) => acc + (Number(item.critical) || 0), 0);

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

  const toggleAuditSelection = (auditId) => {
    const id = String(auditId || "");
    if (!id) return;
    setSelectedAuditIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      return [id, ...prev];
    });
  };

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck size={18} className="text-emerald-600" />
          <h2 className="text-lg font-semibold">HACCP звіт</h2>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-sm font-semibold text-slate-800">Локація</label>
            <select className={inputClass} value={selectedRestaurantId} onChange={(e) => setSelectedRestaurantId(e.target.value)}>
              <option value="">Оберіть локацію</option>
              <option value={ALL_LOCATIONS_VALUE}>Всі локації</option>
              {availableRestaurants.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-800">Період від</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <select className={inputClass.replace("mt-1 ", "")} value={periodFromMonth} onChange={(e) => setPeriodFromMonth(e.target.value)}>
                <option value="">Місяць</option>
                {MONTH_OPTIONS_UA.map((month) => (
                  <option key={month.value} value={month.value}>{month.label}</option>
                ))}
              </select>
              <select className={inputClass.replace("mt-1 ", "")} value={periodFromYear} onChange={(e) => setPeriodFromYear(e.target.value)}>
                <option value="">Рік</option>
                {availablePeriodYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Період до</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <select className={inputClass.replace("mt-1 ", "")} value={periodToMonth} onChange={(e) => setPeriodToMonth(e.target.value)}>
                <option value="">Місяць</option>
                {MONTH_OPTIONS_UA.map((month) => (
                  <option key={month.value} value={month.value}>{month.label}</option>
                ))}
              </select>
              <select className={inputClass.replace("mt-1 ", "")} value={periodToYear} onChange={(e) => setPeriodToYear(e.target.value)}>
                <option value="">Рік</option>
                {availablePeriodYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800">
            Меню вибору чек-листів для інфографіки
            <span className="ml-2 text-xs font-medium text-slate-500">(обрано: {auditsForMetrics.length})</span>
          </summary>

          <div className="mt-3">
            <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedAuditIds(filteredAudits.map((audit) => String(audit.id)))}
                className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-white"
              >
                Обрати всі
              </button>
              <button
                type="button"
                onClick={() => setSelectedAuditIds([])}
                className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-white"
              >
                Очистити
              </button>
            </div>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
              <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
                {filteredAudits.map((audit) => {
                  const auditId = String(audit.id || "");
                  const checked = selectedAuditIds.includes(auditId);
                  return (
                    <label key={auditId} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                      <input type="checkbox" checked={checked} onChange={() => toggleAuditSelection(auditId)} className="mt-0.5" />
                      <span className="leading-relaxed">
                        {formatDisplayDate(audit?.date)} · {String(audit?.restaurantName || "Локація")} · {String(audit?.templateName || "Без шаблону")}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </details>
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
              <p className="text-sm font-semibold text-slate-800">HACCP Score</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-4xl font-extrabold text-slate-900">{roundPercent(avgScore)}%</span>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${traffic.className}`}>
                  {traffic.label}
                </span>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full transition-all ${gradeBandFor(avgScore).barClass}`} style={{ width: `${Math.min(100, Math.max(0, roundPercent(avgScore)))}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-500">Середня оцінка за обраними чек-листами.</p>
            </div>

            <div className={cardClass}>
              <p className="text-sm font-semibold text-slate-800">Технічна інформація</p>
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">Дата перевірок</p>
                  <p className="font-semibold text-slate-900">{technicalInfo.dateLabel}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">Технолог(и)</p>
                  <p className="font-semibold text-slate-900">{technicalInfo.technologistLabel}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 md:col-span-2">
                  <p className="text-xs text-slate-500">Локація</p>
                  <p className="font-semibold text-slate-900">{technicalInfo.locationLabel}</p>
                </div>
              </div>
            </div>

            <div className={cardClass}>
              <button
                type="button"
                onClick={() => setShowCriticalDetails((prev) => !prev)}
                className="w-full text-left"
              >
                <p className="text-sm font-semibold text-slate-800">Критичні порушення</p>
                <div className="mt-2 inline-flex items-center rounded-xl border border-red-300 bg-red-600 px-3 py-2 text-3xl font-extrabold text-white shadow-sm">
                  {criticalCount}
                </div>
                <p className="mt-2 text-xs text-slate-500">Сумарна кількість пунктів з оцінкою «Погано» у вибраних чек-листах. Натисніть, щоб переглянути деталі.</p>
              </button>

              {showCriticalDetails && (
                <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                  {criticalDetails.length ? (
                    <div className="space-y-2">
                      {criticalDetails.map((group) => (
                        <div key={group.auditId} className="rounded border border-red-200 bg-white p-2">
                          <p className="font-semibold text-red-800">{group.auditLabel}</p>
                          <ul className="mt-1 list-disc pl-4">
                            {group.items.map((item) => (
                              <li key={`${group.auditId}_${item.itemId}`}>{item.title}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>Критичних порушень не знайдено у вибраних чек-листах.</p>
                  )}
                </div>
              )}
            </div>

            <div className={cardClass}>
              <p className="text-sm font-semibold text-slate-800">Динаміка виправлень</p>
              {dynamics ? (
                <>
                  <div className="mt-2 text-4xl font-extrabold text-slate-900">{dynamics.percent}%</div>
                  <p className="mt-1 text-sm text-slate-600">Усунено {dynamics.fixed} з {dynamics.total} помилок від найстаршого до найновішого обраного чек-листа.</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                      <ArrowUp size={12} /> Покращено: {dynamics.improved}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-1 font-semibold text-red-700">
                      <ArrowDown size={12} /> Погіршено: {dynamics.worsened}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-1 font-semibold text-slate-700">
                      Без змін: {dynamics.unchanged}
                    </span>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Недостатньо даних для розрахунку (оберіть щонайменше 2 чек-листи).</p>
              )}
            </div>
          </div>

          <div className={cardClass}>
            <p className="text-sm font-semibold text-slate-800">Інфографіка динаміки чек-листів</p>
            <p className="mt-1 text-xs text-slate-500">Показує зміну оцінки та критичних порушень по кожному обраному чек-листу.</p>

            {trendSeries.length ? (
              <div className="mt-3 space-y-2">
                {trendSeries.map((item, index) => {
                  const prev = index > 0 ? trendSeries[index - 1] : null;
                  const scoreDelta = prev ? roundPercent((Number(item.score) || 0) - (Number(prev.score) || 0)) : null;
                  const isUp = Number(scoreDelta) > 0;
                  const isDown = Number(scoreDelta) < 0;
                  const templateForItem = templatesById.get(String(item?.templateId || "")) || null;
                  const sectionResults = computeHaccpScores(templateForItem, item?.responses || {}).sectionResults;
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
                      const items = (section?.items || [])
                        .slice()
                        .sort((a, b) => Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0))
                        .map((sectionItem) => {
                          const sectionItemId = String(sectionItem?.id || "");
                          const responseValue = item?.responses?.[sectionItemId]?.value;
                          const rating = RATING_BY_VALUE?.[responseValue];
                          return {
                            id: sectionItemId,
                            title: String(sectionItem?.title || "Пункт без назви"),
                            ratingLabel: rating?.label || "Не оцінено",
                            ratingPercent: Number.isFinite(rating?.percent) ? rating.percent : null,
                          };
                        });
                      return {
                        id: sectionId,
                        title: String(section?.title || "Без назви категорії"),
                        percent,
                        items,
                      };
                    });

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
                          Критичні: {item.critical}
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
                                  {section.items.length ? (
                                    section.items.map((sectionItem) => (
                                      <div key={`${section.id}_${sectionItem.id}`} className="flex items-start justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1">
                                        <span className="text-slate-700">{sectionItem.title}</span>
                                        <span className="shrink-0 font-semibold text-slate-900">
                                          {sectionItem.ratingLabel}
                                          {sectionItem.ratingPercent !== null ? ` (${sectionItem.ratingPercent}%)` : ""}
                                        </span>
                                      </div>
                                    ))
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

          <div className={cardClass}>
            <div className="flex items-center gap-2">
              <Images size={16} className="text-emerald-600" />
              <p className="text-sm font-semibold text-slate-800">Галерея фото чек-листів</p>
            </div>
            <p className="mt-1 text-xs text-slate-500">Показує фото, які були додані під час проведення вибраних чек-листів.</p>

            {!selectedAudits.length ? (
              <p className="mt-3 text-sm text-slate-500">Оберіть чек-лист у меню вибору, щоб переглянути фото.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {galleryAudits.map((auditGroup) => (
                  <div key={auditGroup.auditId} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-700">{auditGroup.label}</p>
                      <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        Фото: {auditGroup.totalPhotos}
                      </span>
                    </div>

                    {auditGroup.blocks.length ? (
                      <div className="mt-2 space-y-2">
                        {auditGroup.blocks.map((block) => (
                          <details key={`${auditGroup.auditId}_${block.id}`} className="rounded border border-slate-200 bg-white px-2 py-1.5">
                            <summary className="cursor-pointer list-none text-xs font-semibold text-slate-700">
                              {block.title}
                            </summary>

                            <div className="mt-2 space-y-2">
                              {block.categories.map((category) => (
                                <details key={`${auditGroup.auditId}_${block.id}_${category.id}`} className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                                  <summary className="cursor-pointer list-none text-xs text-slate-700">
                                    {category.title}
                                    <span className="ml-1 text-slate-500">({category.photos.length})</span>
                                  </summary>

                                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                                    {category.photos.map((photo, index) => (
                                      <button
                                        key={`${auditGroup.auditId}_${block.id}_${category.id}_${photo?.id || index}`}
                                        type="button"
                                        onClick={() => setGalleryLightboxPhoto(photo)}
                                        className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white"
                                        title={photo?.name || "Фото чек-листа"}
                                      >
                                        <img
                                          src={getPhotoSrc(photo)}
                                          alt={photo?.name || "Фото чек-листа"}
                                          className="h-24 w-full object-cover transition group-hover:scale-[1.02]"
                                        />
                                      </button>
                                    ))}
                                  </div>
                                </details>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">У цьому чек-листі немає фото, прив'язаних до блоків/категорій.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

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
  const availableRestaurants = restaurants || [];

  const [selectedDate, setSelectedDate] = useState(todayDate());
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(user?.restaurant || "");
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

  const submitLockRef = useRef(false);

  const effectiveRestaurantId = isAdmin ? selectedRestaurantId : user?.restaurant || selectedRestaurantId;

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
      (section.items || []).forEach((item, itemIndex) => {
        const prefix = `${sectionIndex + 1}.${itemIndex + 1} ${item.title}`;
        const response = responses[item.id];
        if (!response || response.value === null || response.value === undefined || !RATING_BY_VALUE[response.value]) {
          issues.push(`${prefix} — не оцінено`);
          return;
        }
        if (isCommentRequired(response.value) && !String(response.comment || "").trim()) {
          issues.push(`${prefix} — потрібен коментар`);
        }
        const photoIds = Array.isArray(response?.photoIds) ? response.photoIds.filter((id) => galleryById.has(id)) : [];
        if (!photoIds.length) issues.push(`${prefix} — додайте фото`);
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
    const restaurantId = String(effectiveRestaurantId || "");
    return (audits || [])
      .filter((audit) => String(audit.restaurantId || "") === restaurantId)
      .filter((audit) => String(audit.status || "") === "completed")
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [audits, effectiveRestaurantId]);

  const loadAudit = (audit) => {
    setSelectedRestaurantId(audit.restaurantId || "");
    setSelectedTemplateId(audit.templateId || "");
    setSelectedDate(audit.date || todayDate());
    setDirty(false);
    setShowHistory(false);
  };

  const handleDeleteAudit = async (audit) => {
    if (!isAdmin) return;
    if (!confirm(`Видалити аудит від ${formatDisplayDate(audit.date)}?`)) return;
    const result = await removeAudit(audit.id);
    if (!result.success) alert("Не вдалося видалити аудит.");
  };

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} className="text-emerald-600" />
            <h2 className="text-lg font-semibold">Аудит HACCP</h2>
          </div>
          {isCompleted ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 size={13} /> Завершено
            </span>
          ) : currentAuditId ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              Чернетка
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="text-sm font-semibold text-slate-800">Дата</label>
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
          <div>
            <label className="text-sm font-semibold text-slate-800">Заклад</label>
            <select
              className={inputClass}
              value={effectiveRestaurantId || ""}
              onChange={(e) => { setSelectedRestaurantId(e.target.value); setDirty(false); }}
              disabled={Boolean(user?.restaurant) && !isAdmin}
            >
              <option value="">Оберіть заклад</option>
              {availableRestaurants.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-800">Шаблон аудиту</label>
            <select
              className={inputClass}
              value={selectedTemplateId || ""}
              onChange={(e) => { setSelectedTemplateId(e.target.value); setDirty(false); }}
            >
              <option value="">Оберіть шаблон</option>
              {applicableTemplates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!effectiveRestaurantId || !selectedTemplate ? (
        <div className={cardClass}>
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            {applicableTemplates.length === 0
              ? "Для цього закладу немає призначених шаблонів аудиту. Створіть або призначте шаблон у вкладці «Шаблони HACCP»."
              : "Оберіть заклад і шаблон, щоб почати аудит."}
          </div>
        </div>
      ) : (
        <>
          <div className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Підсумкова оцінка</p>
                <div className="mt-1 flex items-center gap-3">
                  <span className="text-3xl font-extrabold text-slate-900">{roundPercent(scores.totalPercent)}%</span>
                  <ScoreBadge percent={scores.totalPercent} />
                </div>
              </div>
              <div className="text-right text-sm text-slate-600">
                <p>Оцінено пунктів: <span className="font-semibold text-slate-900">{scores.assessedItems} з {scores.totalItems}</span></p>
                <div className="mt-1"><WeightSumBadge sum={sectionWeightSum} label="Ваги розділів" /></div>
              </div>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full transition-all ${gradeBandFor(scores.totalPercent).barClass}`} style={{ width: `${Math.min(100, Math.max(0, roundPercent(scores.totalPercent)))}%` }} />
            </div>

            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
              {RATING_SCALE.map((rating) => (
                <span key={rating.value} className="inline-flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${rating.dotClass}`} /> {rating.label} — {rating.percent}%
                </span>
              ))}
            </div>
          </div>

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
              const sectionResult = scores.sectionResults[section.id] || { percent: 0, assessed: 0, total: (section.items || []).length };
              const collapsed = Boolean(collapsedSections[section.id]);
              const items = [...(section.items || [])].sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
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
                      {items.map((item, itemIndex) => {
                        const response = responses[item.id] || {};
                        const currentValue = response.value;
                        const needsComment = isCommentRequired(currentValue);
                        const commentMissing = needsComment && !String(response.comment || "").trim();
                        const photos = getItemPhotos(response);
                        const photosMissing = photos.length === 0;
                        return (
                          <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900">
                                  {sectionIndex + 1}.{itemIndex + 1} {item.title}
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
                                      onClick={() => handleRating(item.id, rating.value)}
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

                            <div className="mt-2.5 space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                              <div>
                                <label className="flex items-center gap-1 text-xs font-semibold text-amber-800">
                                  <AlertTriangle size={12} /> {needsComment ? "Коментар обовʼязковий" : "Коментар (необовʼязково)"}
                                </label>
                                <textarea
                                  className={`${inputClass} min-h-[56px] ${commentMissing ? "border-red-400 focus:border-red-500 focus:ring-red-100" : ""}`}
                                  value={String(response.comment || "")}
                                  onChange={(e) => handleComment(item.id, e.target.value)}
                                  disabled={isReadOnlyAudit}
                                  placeholder="Опишіть результат перевірки по пункту"
                                />
                              </div>

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
                                        void captureForItem(item.id, e.target.files);
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => setPicker({ itemId: item.id, itemLabel: `${sectionIndex + 1}.${itemIndex + 1} ${item.title}` })}
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
                                        <button type="button" onClick={() => setLightbox(photo)} className="w-full">
                                          <img src={getPhotoSrc(photo)} alt={photo.name || "фото"} className="h-20 w-full rounded-lg border border-slate-200 object-cover" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => detachFromItem(item.id, photo.id)}
                                          disabled={isReadOnlyAudit}
                                          className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-0.5 text-white shadow hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                          <X size={12} />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="mt-2 text-xs text-red-500">Додайте щонайменше одне фото до цього пункту.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {!items.length ? <p className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">У цьому розділі немає пунктів.</p> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className={`${cardClass} sticky bottom-0 z-10`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                Результат: <span className="font-bold text-slate-900">{roundPercent(scores.totalPercent)}%</span> · оцінено {scores.assessedItems}/{scores.totalItems}
                {dirty ? <span className="ml-2 text-amber-600">• є незбережені зміни</span> : null}
                {!isAuditInProgress && !isCompleted ? (
                  <span className="ml-2 text-slate-500">• блоки оцінки стануть доступні після старту аудиту</span>
                ) : null}
                {isAuditInProgress && !canCompleteAudit ? (
                  <span className="ml-2 text-red-600">• для завершення залишилось заповнити: {completionIssues.length}</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => persist("draft")}
                  disabled={submitting || isCompleted}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <Save size={15} /> Зберегти чернетку
                </button>
                {!hasAuditStarted ? (
                  <button
                    type="button"
                    onClick={handleStartAudit}
                    disabled={submitting || isCompleted}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                  >
                    <CheckCircle2 size={15} /> Розпочати аудит
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => persist("completed")}
                    disabled={submitting || !canCompleteAudit}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                  >
                    <CheckCircle2 size={15} /> Завершити аудит
                  </button>
                )}
              </div>
            </div>
            {hasAuditStarted ? (
              <p className="mt-2 text-xs text-slate-500">Початок аудиту: {new Date(auditStartedAt).toLocaleString("uk-UA")}</p>
            ) : null}
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
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="py-2 pr-3">Дата</th>
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
                          <button type="button" onClick={() => loadAudit(audit)} className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200">
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
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">Для цього закладу ще немає аудитів.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Редактор розділу шаблону                                            */
/* ------------------------------------------------------------------ */

function SectionEditor({ section, index, totalSections, isAdmin, onChange, onRemove, onMove, onAddItem, onUpdateItem, onRemoveItem, onDistributeItems }) {
  const items = section.items || [];
  const itemsWeightSum = sumWeights(items);

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

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-slate-700">Пункти ({items.length})</p>
              <WeightSumBadge sum={itemsWeightSum} label="Ваги пунктів" />
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => onDistributeItems(section.id)} disabled={!isAdmin || !items.length} className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                Рівні ваги
              </button>
              <button type="button" onClick={() => onAddItem(section.id)} disabled={!isAdmin} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40">
                <Plus size={12} /> Пункт
              </button>
            </div>
          </div>

          <div className="mt-2 space-y-2">
            {items.map((item, itemIndex) => (
              <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <div className="flex items-start gap-2">
                  <span className="pt-2 text-xs font-semibold text-slate-400">{index + 1}.{itemIndex + 1}</span>
                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 md:grid-cols-[1fr_90px]">
                    <input className={inputClass} value={item.title} onChange={(e) => onUpdateItem(section.id, item.id, { title: e.target.value })} disabled={!isAdmin} placeholder="Критерій відповідності" />
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      className={inputClass}
                      value={item.weight ?? 1}
                      onChange={(e) => onUpdateItem(section.id, item.id, { weight: Number(e.target.value || 0) })}
                      disabled={!isAdmin}
                      title="Вага пункту в розділі"
                    />
                  </div>
                  <button type="button" onClick={() => onRemoveItem(section.id, item.id)} disabled={!isAdmin} className="mt-1.5 rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-40">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
            {!items.length ? <p className="rounded-md border border-dashed border-slate-300 p-2 text-[11px] text-slate-400">Додайте пункти розділу.</p> : null}
          </div>
        </div>

        <button type="button" onClick={() => onRemove(section.id)} disabled={!isAdmin} className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-40">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Вкладка шаблонів                                                    */
/* ------------------------------------------------------------------ */

const emptyTemplateForm = () => ({ name: "", description: "", isActive: true, restaurantIds: [], sections: [] });

function TemplatesTab({ user, restaurants, templates, createTemplate, updateTemplate, removeTemplate }) {
  const isAdmin = user?.role === "admin";
  const availableRestaurants = restaurants || [];

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyTemplateForm());
  const [saving, setSaving] = useState(false);

  const restaurantNameById = useMemo(() => {
    const map = new Map();
    availableRestaurants.forEach((item) => map.set(String(item.id), item.name));
    return map;
  }, [availableRestaurants]);

  const sectionWeightSum = useMemo(() => sumWeights(form.sections), [form.sections]);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyTemplateForm());
  };

  const startCreateFromDefault = () => {
    setEditingId(null);
    setForm(buildDefaultHaccpTemplate());
  };

  const startEdit = (template) => {
    const sections = (template.sections || []).map((section, sectionIndex) => ({
      id: section.id || makeHaccpId(),
      title: section.title || "",
      weight: Number(section.weight ?? 0),
      sortOrder: Number(section.sortOrder ?? sectionIndex),
      items: (section.items || []).map((item, itemIndex) => ({
        id: item.id || makeHaccpId(),
        title: item.title || "",
        description: item.description || "",
        weight: Number(item.weight ?? 1),
        sortOrder: Number(item.sortOrder ?? itemIndex),
      })),
    }));
    setEditingId(template.id);
    setForm({
      name: template.name || "",
      description: template.description || "",
      isActive: template.isActive !== false,
      restaurantIds: (template.restaurantIds || []).map(String),
      sections,
    });
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

  const addItem = (sectionId) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((section) =>
        section.id === sectionId
          ? { ...section, items: [...section.items, { id: makeHaccpId(), title: "", description: "", weight: 1, sortOrder: section.items.length }] }
          : section
      ),
    }));
  };

  const updateItem = (sectionId, itemId, patch) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((section) =>
        section.id === sectionId
          ? { ...section, items: section.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) }
          : section
      ),
    }));
  };

  const removeItem = (sectionId, itemId) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((section) =>
        section.id === sectionId ? { ...section, items: section.items.filter((item) => item.id !== itemId) } : section
      ),
    }));
  };

  const distributeItemWeights = (sectionId) => {
    setForm((prev) => ({
      ...prev,
      sections: prev.sections.map((section) => {
        if (section.id !== sectionId) return section;
        const weights = distributeEqually(section.items.length);
        return { ...section, items: section.items.map((item, idx) => ({ ...item, weight: weights[idx] })) };
      }),
    }));
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
    if (!isAdmin || saving) return;
    if (!form.name.trim()) {
      alert("Вкажіть назву шаблону.");
      return;
    }

    const sections = form.sections
      .map((section, sectionIndex) => ({
        id: section.id || makeHaccpId(),
        title: section.title.trim(),
        weight: toPositiveNumber(section.weight, 0),
        sortOrder: sectionIndex,
        items: (section.items || [])
          .filter((item) => item.title?.trim())
          .map((item, itemIndex) => ({
            id: item.id || makeHaccpId(),
            title: item.title.trim(),
            description: item.description?.trim() || "",
            weight: toPositiveNumber(item.weight, 1),
            sortOrder: itemIndex,
          })),
      }))
      .filter((section) => section.title);

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
    setEditingId(null);
    setForm(emptyTemplateForm());
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
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <div className="xl:col-span-2">
        <div className={cardClass}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-emerald-600" />
              <h2 className="text-lg font-semibold">Шаблони HACCP</h2>
            </div>
          </div>

          {!isAdmin ? (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Налаштування шаблонів доступне лише адміністратору.
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
              const itemsCount = (template.sections || []).reduce((acc, section) => acc + (section.items || []).length, 0);
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
                      <button type="button" onClick={() => startEdit(template)} className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200">
                        {isAdmin ? "Редагувати" : "Переглянути"}
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
                Шаблони ще не створені. {isAdmin ? "Натисніть «Зі стандартного», щоб почати швидко." : ""}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="xl:col-span-3">
        <div className={cardClass}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers size={17} className="text-emerald-600" />
              <h3 className="font-semibold">{editingId ? "Редагування шаблону" : "Новий шаблон"}</h3>
            </div>
            <WeightSumBadge sum={sectionWeightSum} label="Сума ваг розділів" />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-slate-800">Назва шаблону *</label>
              <input className={inputClass} value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} disabled={!isAdmin} placeholder="Напр. Аудит безпечності харчових продуктів" />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-slate-800">Опис</label>
              <input className={inputClass} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} disabled={!isAdmin} placeholder="Короткий опис призначення аудиту" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={Boolean(form.isActive)} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} disabled={!isAdmin} />
              Активний
            </label>
          </div>

          <div className="mt-4">
            <p className="text-sm font-semibold text-slate-800">Призначення закладам</p>
            <p className="text-xs text-slate-500">Якщо не обрати жоден заклад — шаблон доступний для всіх.</p>
            <div className="mt-2 grid max-h-32 grid-cols-1 gap-1 overflow-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
              {availableRestaurants.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.restaurantIds.map(String).includes(String(item.id))} onChange={() => toggleRestaurant(item.id)} disabled={!isAdmin} />
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
                <button type="button" onClick={distributeSectionWeights} disabled={!isAdmin || !form.sections.length} className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                  Рівні ваги розділів
                </button>
                <button type="button" onClick={addSection} disabled={!isAdmin} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40">
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
                  isAdmin={isAdmin}
                  onChange={updateSection}
                  onRemove={removeSection}
                  onMove={moveSection}
                  onAddItem={addItem}
                  onUpdateItem={updateItem}
                  onRemoveItem={removeItem}
                  onDistributeItems={distributeItemWeights}
                />
              ))}
              {!form.sections.length ? <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">Додайте розділи аудиту.</p> : null}
            </div>
          </div>

          {isAdmin ? (
            <div className="mt-4 flex justify-end gap-2">
              {editingId ? (
                <button type="button" onClick={startCreate} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Скасувати
                </button>
              ) : null}
              <button type="button" onClick={saveTemplate} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
                <Save size={15} /> Зберегти шаблон
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Кореневий компонент модуля                                          */
/* ------------------------------------------------------------------ */

export default function HaccpModule({ topTab, user, restaurants, forceMode = "" }) {
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
