import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import {
  ArrowDown,
  ArrowUp,
  Download,
  FileText,
  Loader2,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  RATING_BY_VALUE,
  RATING_SCALE,
  computeHaccpScores,
  flattenSectionItems,
  getSectionGroups,
  roundPercent,
} from "../data/haccpConstants";

const pdfMakeApi =
  pdfMake && typeof pdfMake?.createPdf === "function"
    ? pdfMake
    : pdfMake?.default && typeof pdfMake.default.createPdf === "function"
    ? pdfMake.default
    : null;

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

const getPeriodLabel = (periodFrom, periodTo) => {
  const from = periodFrom ? formatDisplayDate(periodFrom) : "—";
  const to = periodTo ? formatDisplayDate(periodTo) : "—";
  return `${from} - ${to}`;
};

const scoreTrafficLight = (score) => {
  const value = Number(score) || 0;
  if (value >= 90) return { label: "Добре", className: "bg-emerald-100 text-emerald-800" };
  if (value >= 75) return { label: "Задовільно", className: "bg-amber-100 text-amber-800" };
  if (value >= 70) return { label: "Незадовільно", className: "bg-orange-100 text-orange-800" };
  return { label: "Погано", className: "bg-red-100 text-red-800" };
};

const RATING_LABELS = {
  2: "Добре",
  1: "Задовільно",
  0: "Погано",
  "-1": "Н/Д",
};

const RATING_COLORS = {
  2: { bg: "#dcfce7", text: "#166534" },
  1: { bg: "#fef3c7", text: "#92400e" },
  0: { bg: "#fee2e2", text: "#991b1b" },
  "-1": { bg: "#f1f5f9", text: "#64748b" },
};

const getRatingFill = (value) => {
  const rating = RATING_BY_VALUE?.[value];
  if (!rating) return { fill: "#f1f5f9", color: "#64748b" };
  return RATING_COLORS[rating.value] || { fill: "#f1f5f9", color: "#64748b" };
};

function HaccpReportAllRestaurantsTab({ user, restaurants, templates, audits, periodFrom, periodTo, selectedTemplateId }) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");

  const isAllTemplates = selectedTemplateId === "__ALL_TEMPLATES__";

  const availableRestaurants = useMemo(() => {
    if (!user || user.role === "admin") return restaurants || [];
    const userRestaurantIds = new Set(
      [
        ...(user.restaurants || []),
        ...(user.restaurant_ids || []),
        ...(user.restaurantIds || []),
        user.restaurant,
        user.restaurantId,
        user.restaurant_id,
      ]
        .map(String)
        .filter(Boolean)
    );
    return (restaurants || []).filter((r) => userRestaurantIds.has(String(r.id)));
  }, [restaurants, user]);

  const templateById = useMemo(() => {
    const map = new Map();
    (templates || []).forEach((t) => map.set(String(t.id), t));
    return map;
  }, [templates]);

  const filteredAudits = useMemo(() => {
    let result = (audits || []).filter((audit) => {
      const auditDate = String(audit?.date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(auditDate)) return false;
      if (periodFrom && auditDate < periodFrom) return false;
      if (periodTo && auditDate > periodTo) return false;
      if (!isAllTemplates && String(audit?.templateId) !== String(selectedTemplateId)) return false;
      return availableRestaurants.some((r) => String(r.id) === String(audit?.restaurantId));
    });

    result.sort((a, b) => {
      const dateA = Date.parse(String(a?.date || ""));
      const dateB = Date.parse(String(b?.date || ""));
      return dateA - dateB;
    });

    return result;
  }, [audits, availableRestaurants, periodFrom, periodTo, selectedTemplateId, isAllTemplates]);

  const auditsByRestaurant = useMemo(() => {
    const map = new Map();
    filteredAudits.forEach((audit) => {
      const rid = String(audit?.restaurantId || "");
      if (!rid) return;
      if (!map.has(rid)) map.set(rid, []);
      map.get(rid).push(audit);
    });
    return map;
  }, [filteredAudits]);

  const restaurantSummaries = useMemo(() => {
    const summaries = [];
    availableRestaurants.forEach((restaurant) => {
      const audits = auditsByRestaurant.get(String(restaurant.id)) || [];
      if (!audits.length) return;

      const latestAudit = audits[audits.length - 1];
      const responses = latestAudit?.responses || {};
      const templateSnapshot = latestAudit?.templateSnapshot;
      const template = templateSnapshot || templateById.get(String(latestAudit?.templateId || "")) || null;
      const scores = computeHaccpScores(template, responses);
      const sectionResults = scores.sectionResults || {};

      const sectionScores = {};
      Object.entries(sectionResults).forEach(([sectionId, data]) => {
        sectionScores[sectionId] = roundPercent(Number(data?.percent || 0));
      });

      summaries.push({
        restaurant,
        auditCount: audits.length,
        latestAudit,
        totalScore: roundPercent(scores.totalPercent || 0),
        sectionScores,
        trafficLight: scoreTrafficLight(scores.totalPercent || 0),
      });
    });

    summaries.sort((a, b) => b.totalScore - a.totalScore);
    return summaries;
  }, [availableRestaurants, auditsByRestaurant, templateById]);

  const sectionStats = useMemo(() => {
    const stats = new Map();
    restaurantSummaries.forEach((summary) => {
      Object.entries(summary.sectionScores || {}).forEach(([sectionId, score]) => {
        if (!stats.has(sectionId)) {
          const template = templateById.get(String(summary.latestAudit?.templateId || ""));
          const section = template?.sections?.find((s) => String(s.id) === sectionId);
          stats.set(sectionId, { title: section?.title || `Розділ ${sectionId}`, scores: [] });
        }
        stats.get(sectionId).scores.push({ restaurant: summary.restaurant.name, score });
      });
    });

    const result = [];
    stats.forEach((data, sectionId) => {
      data.scores.sort((a, b) => b.score - a.score);
      const avg = data.scores.length
        ? roundPercent(data.scores.reduce((s, v) => s + v.score, 0) / data.scores.length)
        : 0;
      result.push({ sectionId, title: data.title, scores: data.scores, avg });
    });
    return result;
  }, [restaurantSummaries, templateById]);

  const handleExportPdf = async () => {
    if (!restaurantSummaries.length) {
      alert("Немає даних для експорту за обраний період.");
      return;
    }

    if (!pdfMakeApi || typeof pdfMakeApi.createPdf !== "function") {
      alert("PDF двигун не ініціалізовано.");
      return;
    }

    try {
      setIsExporting(true);
      setExportProgress("Формування звіту...");

      const templateForReport = isAllTemplates
        ? null
        : templateById.get(String(selectedTemplateId || ""));

      const templateName = isAllTemplates
        ? "Усі шаблони"
        : templateForReport?.title || templateForReport?.name || "Шаблон аудиту";

      const auditorName = user?.displayName || user?.name || user?.email || "Аудитор";

      const docDefinition = buildReportDocument({
        restaurantSummaries,
        sectionStats,
        templateName,
        periodFrom,
        periodTo,
        auditorName,
        user,
      });

      setExportProgress("Генерація PDF...");
      pdfMakeApi.createPdf(docDefinition).download(`HACCP_звіт_усі_локації_${formatDisplayDate(new Date())}.pdf`);
    } catch (error) {
      console.error("Помилка експорту PDF:", error);
      alert("Не вдалося експортувати звіт у PDF.");
    } finally {
      setIsExporting(false);
      setExportProgress("");
    }
  };

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      setExportProgress("Формування Excel...");

      const wb = XLSX.utils.book_new();

      const summaryRows = [
        { Показник: "Період", Значення: getPeriodLabel(periodFrom, periodTo) },
        { Показник: "Шаблон", Значення: isAllTemplates ? "Усі шаблони" : (templateById.get(String(selectedTemplateId || ""))?.title || "—") },
        { Показник: "Аудитор", Значення: user?.displayName || user?.name || user?.email || "—" },
        { Показник: "Дата формування", Значення: formatDisplayDate(new Date()) },
        { Показник: "Кількість локацій", Значення: restaurantSummaries.length },
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Підсумок");

      const restaurantRows = restaurantSummaries.map((s, idx) => ({
        No: idx + 1,
        Локація: s.restaurant.name,
        "Кількість аудитів": s.auditCount,
        "Остання перевірка": formatDisplayDate(s.latestAudit?.date),
        "Загальний бал": `${s.totalScore}%`,
        Статус: s.trafficLight.label,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(restaurantRows), "Локації");

      const sectionRows = [];
      sectionStats.forEach((section) => {
        sectionRows.push({ Розділ: section.title, "Середній бал": `${section.avg}%` });
        section.scores.forEach((s) => {
          sectionRows.push({ Розділ: "", Локація: s.restaurant, Бал: `${s.score}%` });
        });
        sectionRows.push({ Розділ: "", Локація: "", Бал: "" });
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sectionRows), "Розділи");

      XLSX.writeFile(wb, `HACCP_звіт_усі_локації_${formatDisplayDate(new Date())}.xlsx`);
    } catch (error) {
      console.error("Помилка експорту Excel:", error);
      alert("Не вдалося експортувати звіт у Excel.");
    } finally {
      setIsExporting(false);
      setExportProgress("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-600" />
            <h2 className="text-base font-semibold whitespace-nowrap">Звіт по всіх ресторанах (PDF/Excel)</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isExporting || !restaurantSummaries.length}
              onClick={handleExportExcel}
              className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Download size={16} /> {isExporting ? "Експорт..." : "Excel"}
            </button>
            <button
              type="button"
              disabled={isExporting || !restaurantSummaries.length}
              onClick={handleExportPdf}
              className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-sky-600 bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <FileText size={16} /> {isExporting ? "Експорт..." : "PDF"}
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
            <p className="text-xs text-slate-500">Період</p>
            <p className="text-sm font-semibold text-slate-900">{getPeriodLabel(periodFrom, periodTo)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
            <p className="text-xs text-slate-500">Шаблон</p>
            <p className="text-sm font-semibold text-slate-900 truncate">{isAllTemplates ? "Усі шаблони" : (templateById.get(String(selectedTemplateId || ""))?.title || "—")}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
            <p className="text-xs text-slate-500">Аудитор</p>
            <p className="text-sm font-semibold text-slate-900 truncate">{user?.displayName || user?.name || user?.email || "—"}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
            <p className="text-xs text-slate-500">Локацій у звіті</p>
            <p className="text-sm font-semibold text-slate-900">{restaurantSummaries.length}</p>
          </div>
        </div>

        {!restaurantSummaries.length ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Немає проведених HACCP-аудитів для обраних локацій у межах обраного періоду.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-3 py-2 font-semibold text-slate-700">№</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-700">Локація</th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-700">Аудитів</th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-700">Остання перевірка</th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-700">Загальний бал</th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-700">Статус</th>
                </tr>
              </thead>
              <tbody>
                {restaurantSummaries.map((summary, idx) => (
                  <tr key={summary.restaurant.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-600">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{summary.restaurant.name}</td>
                    <td className="px-3 py-2 text-center text-slate-600">{summary.auditCount}</td>
                    <td className="px-3 py-2 text-center text-slate-600">{formatDisplayDate(summary.latestAudit?.date)}</td>
                    <td className="px-3 py-2 text-center font-bold text-slate-900">{summary.totalScore}%</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${summary.trafficLight.className}`}>
                        {summary.trafficLight.label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {sectionStats.length && (
          <div className="mt-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-800">Розділи за шаблоном</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sectionStats.map((section) => (
                <div key={section.sectionId} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="font-medium text-slate-800 truncate">{section.title}</p>
                  <p className="mt-1 text-2xl font-extrabold text-slate-900">{section.avg}%</p>
                  <p className="mt-1 text-xs text-slate-500">Середній бал по {section.scores.length} локаціях</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function buildReportDocument({ restaurantSummaries, sectionStats, templateName, periodFrom, periodTo, auditorName, user }) {
  const today = new Date();
  const periodLabel = getPeriodLabel(periodFrom, periodTo);

  const ratingScaleRows = [
    { text: "0-69%", style: "tableHeader", fillColor: "#fee2e2", color: "#991b1b" },
    { text: "Погано", style: "tableHeader", fillColor: "#fee2e2", color: "#991b1b" },
    { text: "70-79%", style: "tableHeader", fillColor: "#ffedd5", color: "#9a3412" },
    { text: "Незадовільно", style: "tableHeader", fillColor: "#ffedd5", color: "#9a3412" },
    { text: "80-89%", style: "tableHeader", fillColor: "#fef3c7", color: "#92400e" },
    { text: "Задовільно", style: "tableHeader", fillColor: "#fef3c7", color: "#92400e" },
    { text: "90-100%", style: "tableHeader", fillColor: "#dcfce7", color: "#166534" },
    { text: "Добре", style: "tableHeader", fillColor: "#dcfce7", color: "#166534" },
  ];

  const summaryTableBody = [
    [
      { text: "№", style: "tableHeader", fillColor: "#e2e8f0" },
      { text: "Локація", style: "tableHeader", fillColor: "#e2e8f0" },
      { text: "Аудитів", style: "tableHeader", fillColor: "#e2e8f0", alignment: "center" },
      { text: "Остання перевірка", style: "tableHeader", fillColor: "#e2e8f0", alignment: "center" },
      { text: "Загальний бал", style: "tableHeader", fillColor: "#e2e8f0", alignment: "center" },
      { text: "Рівень", style: "tableHeader", fillColor: "#e2e8f0", alignment: "center" },
    ],
    ...restaurantSummaries.map((summary, idx) => {
      const traffic = summary.trafficLight;
      return [
        { text: String(idx + 1), style: "tableCell", alignment: "center" },
        { text: summary.restaurant.name, style: "tableCell" },
        { text: String(summary.auditCount), style: "tableCell", alignment: "center" },
        { text: formatDisplayDate(summary.latestAudit?.date), style: "tableCell", alignment: "center" },
        { text: `${summary.totalScore}%`, style: "tableCell", alignment: "center", bold: true },
        {
          text: traffic.label,
          style: "tableCell",
          alignment: "center",
          fillColor: traffic.className.includes("emerald") ? "#dcfce7" : traffic.className.includes("amber") ? "#fef3c7" : traffic.className.includes("orange") ? "#ffedd5" : "#fee2e2",
          color: traffic.className.includes("emerald") ? "#166534" : traffic.className.includes("amber") ? "#92400e" : traffic.className.includes("orange") ? "#9a3412" : "#991b1b",
        },
      ];
    }),
  ];

  const sectionTables = sectionStats.map((section) => {
    const sectionBody = [
      [
        { text: "№", style: "tableHeader", fillColor: "#e2e8f0", alignment: "center", width: 30 },
        { text: "Локація", style: "tableHeader", fillColor: "#e2e8f0" },
        { text: "Бал (%)", style: "tableHeader", fillColor: "#e2e8f0", alignment: "center", width: 60 },
      ],
      ...section.scores.map((s, idx) => [
        { text: String(idx + 1), style: "tableCell", alignment: "center" },
        { text: s.restaurant, style: "tableCell" },
        { text: `${s.score}%`, style: "tableCell", alignment: "center", bold: true },
      ]),
      [
        { text: "Середнє", style: "tableCell", bold: true, colSpan: 2, fillColor: "#f8fafc" },
        {},
        { text: `${section.avg}%`, style: "tableCell", alignment: "center", bold: true, fillColor: "#f8fafc" },
      ],
    ];

    return {
      margin: [0, 12, 0, 4],
      table: {
        headerRows: 1,
        widths: [30, "*", 60],
        body: sectionBody,
      },
      layout: {
        fillColor: (rowIndex) => (rowIndex === 0 ? "#e2e8f0" : rowIndex === sectionBody.length - 1 ? "#f8fafc" : rowIndex % 2 === 0 ? "#f8fafc" : null),
        hLineColor: () => "#cbd5e1",
        vLineColor: () => "#cbd5e1",
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        paddingTop: () => 3,
        paddingBottom: () => 3,
      },
    };
  });

  return {
    pageSize: "A4",
    pageMargins: [30, 30, 30, 30],
    footer: (currentPage, pageCount) => ({
      margin: [30, 10, 30, 0],
      columns: [
        { text: `Звіт сформовано: ${today.toLocaleString("uk-UA")}`, fontSize: 8, color: "#64748b" },
        { text: `Сторінка ${currentPage} з ${pageCount}`, fontSize: 8, alignment: "right", color: "#64748b" },
      ],
    }),
    content: [
      // Title page
      {
        stack: [
          { text: "Зовнішній аудит з безпечності харчових продуктів", fontSize: 22, bold: true, color: "#0f172a", alignment: "center", margin: [0, 40, 0, 8] },
          { text: templateName, fontSize: 16, color: "#475569", alignment: "center", margin: [0, 0, 0, 20] },
          { text: `Період: ${periodLabel}`, fontSize: 12, color: "#64748b", alignment: "center", margin: [0, 0, 0, 30] },
          {
            table: {
              widths: ["*", "*"],
              body: [
                [{ text: "Аудитор:", bold: true, fontSize: 11, color: "#334155" }, { text: auditorName, fontSize: 11, color: "#0f172a" }],
                [{ text: "Дата формування:", bold: true, fontSize: 11, color: "#334155" }, { text: today.toLocaleString("uk-UA"), fontSize: 11, color: "#0f172a" }],
                [{ text: "Кількість локацій:", bold: true, fontSize: 11, color: "#334155" }, { text: String(restaurantSummaries.length), fontSize: 11, color: "#0f172a" }],
              ],
            },
            layout: "noBorders",
            margin: [0, 0, 0, 30],
          },
          {
            table: {
              headerRows: 1,
              widths: ["*", "*", "*", "*"],
              body: [
                [
                  { text: "Діапазон", style: "tableHeader", fillColor: "#e2e8f0", alignment: "center" },
                  { text: "Рівень", style: "tableHeader", fillColor: "#e2e8f0", alignment: "center" },
                  { text: "Діапазон", style: "tableHeader", fillColor: "#e2e8f0", alignment: "center" },
                  { text: "Рівень", style: "tableHeader", fillColor: "#e2e8f0", alignment: "center" },
                ],
                [
                  { text: "0-69%", style: "tableCell", alignment: "center", fillColor: "#fee2e2", color: "#991b1b" },
                  { text: "Погано", style: "tableCell", alignment: "center", fillColor: "#fee2e2", color: "#991b1b" },
                  { text: "80-89%", style: "tableCell", alignment: "center", fillColor: "#fef3c7", color: "#92400e" },
                  { text: "Задовільно", style: "tableCell", alignment: "center", fillColor: "#fef3c7", color: "#92400e" },
                ],
                [
                  { text: "70-79%", style: "tableCell", alignment: "center", fillColor: "#ffedd5", color: "#9a3412" },
                  { text: "Незадовільно", style: "tableCell", alignment: "center", fillColor: "#ffedd5", color: "#9a3412" },
                  { text: "90-100%", style: "tableCell", alignment: "center", fillColor: "#dcfce7", color: "#166534" },
                  { text: "Добре", style: "tableCell", alignment: "center", fillColor: "#dcfce7", color: "#166534" },
                ],
              ],
            },
            layout: {
              hLineColor: () => "#cbd5e1",
              vLineColor: () => "#cbd5e1",
              hLineWidth: () => 0.5,
              vLineWidth: () => 0.5,
              paddingTop: () => 4,
              paddingBottom: () => 4,
            },
            margin: [0, 0, 0, 20],
          },
        ],
        pageBreak: "after",
      },

      // Summary table
      {
        text: "Підсумковий результат",
        fontSize: 16,
        bold: true,
        color: "#0f172a",
        margin: [0, 0, 0, 8],
      },
      {
        table: {
          headerRows: 1,
          widths: [30, "*", 50, 70, 70, 70],
          body: summaryTableBody,
        },
        layout: {
          fillColor: (rowIndex) => (rowIndex === 0 ? "#e2e8f0" : rowIndex % 2 === 0 ? "#f8fafc" : null),
          hLineColor: () => "#cbd5e1",
          vLineColor: () => "#cbd5e1",
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
        margin: [0, 0, 0, 16],
      },

      // Section breakdowns
      { text: "Результати по розділах", fontSize: 16, bold: true, color: "#0f172a", margin: [0, 16, 0, 8], pageBreak: "before" },
      ...sectionTables,
    ],
    defaultStyle: {
      font: "Roboto",
      fontSize: 9,
    },
    styles: {
      tableHeader: {
        bold: true,
        fontSize: 9,
        color: "#0f172a",
        alignment: "center",
      },
      tableCell: {
        fontSize: 9,
        color: "#0f172a",
      },
    },
  };
}

export default HaccpReportAllRestaurantsTab;