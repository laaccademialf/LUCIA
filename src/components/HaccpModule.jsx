import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Copy,
  Layers,
  ListChecks,
  Percent,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useHaccp } from "../hooks/useHaccp";
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
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

const todayDate = () => new Date().toISOString().slice(0, 10);

const toDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const formatDisplayDate = (value) => {
  if (!value || typeof value !== "string") return "—";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}.${m}.${y}`;
};

const normalizeHaccpTab = (tab = "") => {
  const value = String(tab).toLowerCase();
  if (value.includes("templ") || value.includes("шаблон") || value.includes("shablon")) return "templates";
  return "audit";
};

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
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [showHistory, setShowHistory] = useState(false);

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
      setResponses(match.responses || {});
      setCurrentAuditId(match.id);
      setStatus(match.status || "draft");
    } else {
      setResponses({});
      setCurrentAuditId(null);
      setStatus("draft");
    }
  }, [effectiveRestaurantId, selectedTemplateId, selectedDate, audits, dirty]);

  const scores = useMemo(() => computeHaccpScores(selectedTemplate, responses), [selectedTemplate, responses]);
  const sectionWeightSum = useMemo(() => sumWeights(selectedTemplate?.sections), [selectedTemplate]);

  const sortedSections = useMemo(() => {
    const sections = Array.isArray(selectedTemplate?.sections) ? [...selectedTemplate.sections] : [];
    return sections.sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
  }, [selectedTemplate]);

  const updateResponse = (itemId, patch) => {
    setDirty(true);
    setResponses((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] || {}), ...patch } }));
  };

  const handleRating = (itemId, value) => updateResponse(itemId, { value });
  const handleComment = (itemId, comment) => updateResponse(itemId, { comment });

  const handleAddPhotos = async (itemId, fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const existing = responses[itemId]?.photos || [];
    const room = Math.max(0, MAX_PHOTOS_PER_ITEM - existing.length);
    if (room <= 0) {
      alert(`Можна додати не більше ${MAX_PHOTOS_PER_ITEM} фото до пункту.`);
      return;
    }
    const limited = files.slice(0, room);
    if (limited.some((file) => file.size > MAX_PHOTO_SIZE)) {
      alert("Кожне фото має бути до 5 МБ.");
      return;
    }
    try {
      const encoded = await Promise.all(
        limited.map(async (file) => ({ name: file.name, type: file.type, dataUrl: await toDataUrl(file) }))
      );
      updateResponse(itemId, { photos: [...existing, ...encoded] });
    } catch (error) {
      console.error("Помилка завантаження фото:", error);
      alert("Не вдалося обробити фото.");
    }
  };

  const handleRemovePhoto = (itemId, index) => {
    const existing = responses[itemId]?.photos || [];
    updateResponse(itemId, { photos: existing.filter((_, idx) => idx !== index) });
  };

  const toggleSection = (sectionId) => {
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
      });
    });
    return issues;
  };

  const buildPayload = (nextStatus) => {
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
      totalPercent: roundPercent(computed.totalPercent),
      sectionScores,
      assessedItems: computed.assessedItems,
      totalItems: computed.totalItems,
      updatedAt: nowIso,
      updatedById: actorId,
      updatedByName: actorName,
    };

    if (nextStatus === "completed") {
      payload.completedAt = nowIso;
      payload.completedById = actorId;
      payload.completedByName = actorName;
    }

    return payload;
  };

  const persist = async (nextStatus) => {
    if (submitLockRef.current) return;
    if (!effectiveRestaurantId) {
      alert("Оберіть заклад.");
      return;
    }
    if (!selectedTemplate) {
      alert("Оберіть шаблон аудиту.");
      return;
    }

    if (nextStatus === "completed") {
      const issues = collectIssues();
      if (issues.length) {
        const preview = issues.slice(0, 8).join("\n");
        const more = issues.length > 8 ? `\n…та ще ${issues.length - 8}` : "";
        alert(`Неможливо завершити аудит. Виправте:\n\n${preview}${more}`);
        return;
      }
    }

    submitLockRef.current = true;
    setSubmitting(true);
    const payload = buildPayload(nextStatus);

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
      return;
    }

    setDirty(false);
    if (!currentAuditId && result.id) setCurrentAuditId(result.id);
    setStatus(nextStatus);
  };

  const restaurantAudits = useMemo(() => {
    const restaurantId = String(effectiveRestaurantId || "");
    return (audits || [])
      .filter((audit) => String(audit.restaurantId || "") === restaurantId)
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

  const isCompleted = status === "completed";

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
            <input type="date" className={inputClass} value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); setDirty(false); }} />
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

          <div className="space-y-3">
            {sortedSections.map((section, sectionIndex) => {
              const sectionResult = scores.sectionResults[section.id] || { percent: 0, assessed: 0, total: (section.items || []).length };
              const collapsed = Boolean(collapsedSections[section.id]);
              const items = [...(section.items || [])].sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
              return (
                <div key={section.id} className={cardClass}>
                  <button type="button" onClick={() => toggleSection(section.id)} className="flex w-full items-center justify-between gap-3 text-left">
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
                        const photos = response.photos || [];
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
                                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${active ? rating.selectedClass : rating.idleClass}`}
                                      title={rating.short}
                                    >
                                      {rating.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {needsComment ? (
                              <div className="mt-2.5 space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                                <div>
                                  <label className="flex items-center gap-1 text-xs font-semibold text-amber-800">
                                    <AlertTriangle size={12} /> Коментар обовʼязковий
                                  </label>
                                  <textarea
                                    className={`${inputClass} min-h-[56px] ${commentMissing ? "border-red-400 focus:border-red-500 focus:ring-red-100" : ""}`}
                                    value={String(response.comment || "")}
                                    onChange={(e) => handleComment(item.id, e.target.value)}
                                    placeholder="Опишіть виявлену невідповідність та пропозиції"
                                  />
                                </div>

                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                      <Camera size={13} /> Додати фото
                                      <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => { void handleAddPhotos(item.id, e.target.files); e.target.value = ""; }}
                                      />
                                    </label>
                                    <span className="text-[11px] text-slate-400">{photos.length}/{MAX_PHOTOS_PER_ITEM}</span>
                                  </div>
                                  {photos.length > 0 ? (
                                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                                      {photos.map((photo, photoIndex) => (
                                        <div key={`${item.id}_${photoIndex}`} className="relative">
                                          <img src={photo.dataUrl} alt={photo.name || "фото"} className="h-20 w-full rounded-lg border border-slate-200 object-cover" />
                                          <button
                                            type="button"
                                            onClick={() => handleRemovePhoto(item.id, photoIndex)}
                                            className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-0.5 text-white shadow hover:bg-red-500"
                                          >
                                            <X size={12} />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
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
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => persist("draft")}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <Save size={15} /> Зберегти чернетку
                </button>
                <button
                  type="button"
                  onClick={() => persist("completed")}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  <CheckCircle2 size={15} /> Завершити аудит
                </button>
              </div>
            </div>
          </div>
        </>
      )}

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

export default function HaccpModule({ topTab, user, restaurants }) {
  const mode = normalizeHaccpTab(topTab);
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
