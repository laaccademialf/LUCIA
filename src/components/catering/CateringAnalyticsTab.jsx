import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Goal, Trash2 } from "lucide-react";

const CRM_STAGE_LABELS = {
  new: "Новий / Інтерес",
  brief: "Бриф",
  proposal: "Пропозиція",
  work: "В роботі",
  tender: "Тендер",
  confirmed: "Підтверджено",
  cancelled: "Втрачено",
};

const currentMonth = new Date().toISOString().slice(0, 7);
const baseInput = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
const MONTH_KEYS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const MONTH_LABELS_UA = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];

const formatMoney = (value) => new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "UAH",
  maximumFractionDigits: 0,
}).format(Number(value || 0));

const formatCompactNumber = (value) => new Intl.NumberFormat("uk-UA", {
  maximumFractionDigits: 0,
}).format(Number(value || 0));

const formatPercent = (value) => `${Math.round(Number(value || 0))}%`;

export default function CateringAnalyticsTab({ orders, plans, managers, saving, onSavePlan, onDeletePlan, activeNav, topTab }) {
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [planForm, setPlanForm] = useState({ id: "", managerName: "", month: currentMonth, targetAmount: "", notes: "" });
  const [collapsedSections, setCollapsedSections] = useState({});

  const toggleSection = (key) => setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const isReportMode = useMemo(() => {
    const navKey = String(activeNav || "").toLowerCase();
    const tabKey = String(topTab || "").toLowerCase();
    const probe = `${navKey} ${tabKey}`;

    const isManagementMode =
      probe.includes("managment")
      || probe.includes("management")
      || probe.includes("managementpnl")
      || probe.includes("managmentpnl")
      || probe.includes("plan");

    if (isManagementMode) return false;

    return (
      probe.includes("salescateringreport")
      || probe.includes("report")
      || probe.includes("analytics")
    );
  }, [activeNav, topTab]);

  const monthOrders = useMemo(
    () => orders.filter((item) => String(item.eventDate || item.createdAt || "").slice(0, 7) === selectedMonth),
    [orders, selectedMonth],
  );

  const managerStats = useMemo(() => {
    const managerList = Array.from(new Set([
      ...managers,
      ...monthOrders.map((item) => String(item.managerName || "").trim()),
      ...plans.filter((item) => item.month === selectedMonth).map((item) => String(item.managerName || "").trim()),
    ].filter(Boolean)));

    return managerList
      .map((managerName) => {
        const actualAmount = monthOrders
          .filter((item) => item.status === "confirmed" && String(item.managerName || "").trim() === managerName)
          .reduce((sum, item) => sum + Number(item.amount || 0), 0);

        const activeDeals = monthOrders.filter((item) => String(item.managerName || "").trim() === managerName && item.status !== "cancelled").length;
        const plan = plans.find((item) => item.month === selectedMonth && String(item.managerName || "").trim() === managerName) || null;
        const targetAmount = Number(plan?.targetAmount || 0);
        const progress = targetAmount > 0 ? Math.min(999, Math.round((actualAmount / targetAmount) * 100)) : 0;

        return {
          managerName,
          actualAmount,
          activeDeals,
          targetAmount,
          plan,
          progress,
        };
      })
      .sort((left, right) => right.actualAmount - left.actualAmount);
  }, [managers, monthOrders, plans, selectedMonth]);

  const monthPlanSummary = useMemo(() => {
    const totalActual = managerStats.reduce((sum, item) => sum + Number(item.actualAmount || 0), 0);
    const totalTarget = managerStats.reduce((sum, item) => sum + Number(item.targetAmount || 0), 0);
    const totalGap = totalActual - totalTarget;
    const completion = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;
    const plannedManagers = managerStats.filter((item) => item.targetAmount > 0).length;

    return {
      totalActual,
      totalTarget,
      totalGap,
      completion,
      plannedManagers,
      totalManagers: managerStats.length,
    };
  }, [managerStats]);

  const reportTableData = useMemo(() => {
    const year = String(selectedMonth || currentMonth).slice(0, 4);
    const yearOrders = orders.filter((item) => String(item.eventDate || item.createdAt || "").slice(0, 4) === year);
    const getOrderMonthKey = (item) => String(item.eventDate || item.createdAt || "").slice(5, 7);

    const sumOrdersByMonth = (rows) => MONTH_KEYS.map((monthKey) => rows
      .filter((item) => getOrderMonthKey(item) === monthKey)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0));

    const confirmedRows = yearOrders.filter((item) => item.status === "confirmed");
    const activeRows = yearOrders.filter((item) => item.status !== "cancelled");

    const statusRows = ["work", "proposal", "tender", "new", "brief", "cancelled"].map((status) => {
      const rows = yearOrders.filter((item) => item.status === status);
      return {
        key: status,
        label: CRM_STAGE_LABELS[status] || status,
        monthly: sumOrdersByMonth(rows),
      };
    });

    const allManagers = Array.from(new Set([
      ...managers,
      ...plans.map((item) => String(item.managerName || "").trim()),
      ...yearOrders.map((item) => String(item.managerName || "").trim()),
    ].filter(Boolean)));

    const managerSections = allManagers.map((managerName) => {
      const managerOrders = yearOrders.filter((item) => String(item.managerName || "").trim() === managerName);
      const managerConfirmed = managerOrders.filter((item) => item.status === "confirmed");
      const managerWork = managerOrders.filter((item) => item.status === "work");
      const managerProposal = managerOrders.filter((item) => item.status === "proposal");
      const managerTender = managerOrders.filter((item) => item.status === "tender");
      const managerInterest = managerOrders.filter((item) => item.status === "new" || item.status === "brief");
      const managerCancelled = managerOrders.filter((item) => item.status === "cancelled");
      const managerPlans = plans.filter((item) => String(item.managerName || "").trim() === managerName && String(item.month || "").slice(0, 4) === year);

      const planByMonth = MONTH_KEYS.map((monthKey) => managerPlans
        .filter((item) => String(item.month || "").slice(5, 7) === monthKey)
        .reduce((sum, item) => sum + Number(item.targetAmount || 0), 0));

      const confirmedByMonth = sumOrdersByMonth(managerConfirmed);
      const completionByMonth = MONTH_KEYS.map((_, index) => {
        const planValue = Number(planByMonth[index] || 0);
        const factValue = Number(confirmedByMonth[index] || 0);
        return planValue > 0 ? Math.round((factValue / planValue) * 100) : 0;
      });

      return {
        managerName,
        planByMonth,
        completionByMonth,
        confirmedByMonth,
        workByMonth: sumOrdersByMonth(managerWork),
        proposalByMonth: sumOrdersByMonth(managerProposal),
        tenderByMonth: sumOrdersByMonth(managerTender),
        interestByMonth: sumOrdersByMonth(managerInterest),
        cancelledByMonth: sumOrdersByMonth(managerCancelled),
      };
    });

    const totalIncomeByMonth = sumOrdersByMonth(yearOrders);
    const activeIncomeByMonth = sumOrdersByMonth(activeRows);
    const confirmedByMonth = sumOrdersByMonth(confirmedRows);

    const totalPlanByMonth = MONTH_KEYS.map((monthKey) => plans
      .filter((item) => String(item.month || "").slice(0, 4) === year && String(item.month || "").slice(5, 7) === monthKey)
      .reduce((sum, item) => sum + Number(item.targetAmount || 0), 0));

    const totalCompletionByMonth = MONTH_KEYS.map((_, index) => {
      const planValue = Number(totalPlanByMonth[index] || 0);
      const factValue = Number(confirmedByMonth[index] || 0);
      return planValue > 0 ? Math.round((factValue / planValue) * 100) : 0;
    });

    return {
      year,
      totalIncomeByMonth,
      activeIncomeByMonth,
      statusRows,
      totalPlanByMonth,
      totalCompletionByMonth,
      managerSections,
    };
  }, [selectedMonth, orders, plans, managers]);

  return (
    <div className="space-y-4">
      {isReportMode ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">Звіт з продажів (табличний формат)</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  const allKeys = ["income", "plan", ...reportTableData.managerSections.map((section) => `mgr_${section.managerName}`)];
                  const anyOpen = allKeys.some((key) => !collapsedSections[key]);
                  const next = {};
                  allKeys.forEach((key) => { next[key] = anyOpen; });
                  setCollapsedSections(next);
                }}
              >
                {Object.values(collapsedSections).some((value) => !value) ? "Згорнути все" : "Розгорнути все"}
              </button>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Рік</label>
              <input
                type="month"
                className={`${baseInput} h-9 w-[190px] py-1.5 text-xs`}
                value={selectedMonth}
                onChange={(event) => {
                  setSelectedMonth(event.target.value);
                  setPlanForm((prev) => ({ ...prev, month: event.target.value }));
                }}
              />
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full table-fixed text-xs">
              <colgroup>
                <col style={{ width: "16%" }} />
                {MONTH_KEYS.map((monthKey) => <col key={`col_${monthKey}`} style={{ width: `${(100 - 16 - 8) / 12}%` }} />)}
                <col style={{ width: "8%" }} />
              </colgroup>
              <thead>
                <tr className="bg-[#0b2a66] text-white">
                  <th className="sticky left-0 z-10 bg-[#0b2a66] px-2 py-2 text-left">{reportTableData.year}</th>
                  {MONTH_LABELS_UA.map((label) => (
                    <th key={`head_month_${label}`} className="px-1.5 py-2 text-right text-[10px] uppercase tracking-tight">{label}</th>
                  ))}
                  <th className="px-1.5 py-2 text-right text-[10px]">Всього, Рік</th>
                </tr>
              </thead>
              <tbody>
                <tr className="cursor-pointer border-b border-slate-200 bg-slate-50" onClick={() => toggleSection("income")}>
                  <td className="sticky left-0 bg-slate-50 px-2 py-1.5 font-semibold text-slate-900">
                    <span className="inline-flex items-center gap-1">
                      {collapsedSections.income ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      Всього дохід
                    </span>
                  </td>
                  {reportTableData.totalIncomeByMonth.map((value, index) => <td key={`total_income_${MONTH_KEYS[index]}`} className="px-1.5 py-1.5 text-right font-semibold text-slate-900">{formatCompactNumber(value)}</td>)}
                  <td className="px-1.5 py-1.5 text-right font-bold text-slate-900">{formatCompactNumber(reportTableData.totalIncomeByMonth.reduce((sum, value) => sum + value, 0))}</td>
                </tr>

                {!collapsedSections.income && (
                  <>
                    <tr className="border-b border-slate-200 bg-emerald-50/70">
                      <td className="sticky left-0 bg-emerald-50/70 px-2 py-1.5 pl-6 font-semibold text-emerald-900">Кейтеринг ТО</td>
                      {reportTableData.activeIncomeByMonth.map((value, index) => <td key={`active_income_${MONTH_KEYS[index]}`} className="px-1.5 py-1.5 text-right font-semibold text-emerald-900">{formatCompactNumber(value)}</td>)}
                      <td className="px-1.5 py-1.5 text-right font-bold text-emerald-900">{formatCompactNumber(reportTableData.activeIncomeByMonth.reduce((sum, value) => sum + value, 0))}</td>
                    </tr>

                    {reportTableData.statusRows.map((row) => (
                      <tr key={`status_row_${row.key}`} className="border-b border-slate-200">
                        <td className="sticky left-0 bg-white px-2 py-1.5 pl-6 text-slate-800">{row.label}</td>
                        {row.monthly.map((value, index) => <td key={`status_cell_${row.key}_${MONTH_KEYS[index]}`} className="px-1.5 py-1.5 text-right text-slate-700">{formatCompactNumber(value)}</td>)}
                        <td className="px-1.5 py-1.5 text-right font-semibold text-slate-900">{formatCompactNumber(row.monthly.reduce((sum, value) => sum + value, 0))}</td>
                      </tr>
                    ))}
                  </>
                )}

                <tr className="cursor-pointer border-b-2 border-[#0b2a66] bg-[#0b2a66] text-white" onClick={() => toggleSection("plan")}>
                  <td className="sticky left-0 bg-[#0b2a66] px-2 py-1.5 font-semibold">
                    <span className="inline-flex items-center gap-1">
                      {collapsedSections.plan ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      ЗАГАЛЬНИЙ ПЛАН
                    </span>
                  </td>
                  {reportTableData.totalPlanByMonth.map((value, index) => <td key={`total_plan_${MONTH_KEYS[index]}`} className="px-1.5 py-1.5 text-right font-semibold">{formatCompactNumber(value)}</td>)}
                  <td className="px-1.5 py-1.5 text-right font-bold">{formatCompactNumber(reportTableData.totalPlanByMonth.reduce((sum, value) => sum + value, 0))}</td>
                </tr>

                {!collapsedSections.plan && (
                  <tr className="border-b border-slate-200 bg-indigo-50/60">
                    <td className="sticky left-0 bg-indigo-50/60 px-2 py-1.5 pl-6 font-semibold text-indigo-900">Виконання плану, %</td>
                    {reportTableData.totalCompletionByMonth.map((value, index) => <td key={`total_completion_${MONTH_KEYS[index]}`} className="px-1.5 py-1.5 text-right font-semibold text-indigo-900">{formatPercent(value)}</td>)}
                    <td className="px-1.5 py-1.5 text-right font-bold text-indigo-900">{formatPercent((reportTableData.totalPlanByMonth.reduce((sum, value) => sum + value, 0) > 0)
                      ? (reportTableData.activeIncomeByMonth.reduce((sum, value) => sum + value, 0) / reportTableData.totalPlanByMonth.reduce((sum, value) => sum + value, 0)) * 100
                      : 0)}</td>
                  </tr>
                )}

                {reportTableData.managerSections.map((managerSection) => {
                  const managerKey = `mgr_${managerSection.managerName}`;
                  const managerCollapsed = !!collapsedSections[managerKey];
                  const managerPlanTotal = managerSection.planByMonth.reduce((sum, value) => sum + value, 0);
                  const managerConfirmedTotal = managerSection.confirmedByMonth.reduce((sum, value) => sum + value, 0);
                  const managerCompletionTotal = managerPlanTotal > 0 ? (managerConfirmedTotal / managerPlanTotal) * 100 : 0;

                  const rows = [
                    <tr key={`manager_head_${managerSection.managerName}`} className="cursor-pointer border-b-2 border-[#0b2a66] bg-[#0b2a66] text-white" onClick={() => toggleSection(managerKey)}>
                      <td className="sticky left-0 bg-[#0b2a66] px-2 py-1.5 font-semibold">
                        <span className="inline-flex items-center gap-1">
                          {managerCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          {managerSection.managerName}
                        </span>
                      </td>
                      {managerSection.planByMonth.map((value, index) => <td key={`manager_head_cell_${managerSection.managerName}_${MONTH_KEYS[index]}`} className="px-1.5 py-1.5 text-right">{formatCompactNumber(value)}</td>)}
                      <td className="px-1.5 py-1.5 text-right font-bold">{formatCompactNumber(managerPlanTotal)}</td>
                    </tr>,
                  ];

                  if (!managerCollapsed) {
                    rows.push(
                      <tr key={`manager_completion_${managerSection.managerName}`} className="border-b border-slate-200 bg-rose-50/60">
                        <td className="sticky left-0 bg-rose-50/60 px-2 py-1.5 pl-6 font-semibold text-rose-900">Виконання плану</td>
                        {managerSection.completionByMonth.map((value, index) => <td key={`manager_completion_cell_${managerSection.managerName}_${MONTH_KEYS[index]}`} className="px-1.5 py-1.5 text-right text-rose-900">{formatPercent(value)}</td>)}
                        <td className="px-1.5 py-1.5 text-right font-bold text-rose-900">{formatPercent(managerCompletionTotal)}</td>
                      </tr>,
                      <tr key={`manager_confirmed_${managerSection.managerName}`} className="border-b border-slate-200 bg-emerald-50/60">
                        <td className="sticky left-0 bg-emerald-50/60 px-2 py-1.5 pl-6 text-emerald-900">Підтверджено</td>
                        {managerSection.confirmedByMonth.map((value, index) => <td key={`manager_confirmed_cell_${managerSection.managerName}_${MONTH_KEYS[index]}`} className="px-1.5 py-1.5 text-right text-emerald-900">{formatCompactNumber(value)}</td>)}
                        <td className="px-1.5 py-1.5 text-right font-semibold text-emerald-900">{formatCompactNumber(managerConfirmedTotal)}</td>
                      </tr>,
                      <tr key={`manager_work_${managerSection.managerName}`} className="border-b border-slate-200 bg-amber-50/50">
                        <td className="sticky left-0 bg-amber-50/50 px-2 py-1.5 pl-6 text-slate-700">В роботі</td>
                        {managerSection.workByMonth.map((value, index) => <td key={`manager_work_cell_${managerSection.managerName}_${MONTH_KEYS[index]}`} className="px-1.5 py-1.5 text-right text-slate-700">{formatCompactNumber(value)}</td>)}
                        <td className="px-1.5 py-1.5 text-right font-semibold text-slate-900">{formatCompactNumber(managerSection.workByMonth.reduce((sum, value) => sum + value, 0))}</td>
                      </tr>,
                      <tr key={`manager_proposal_${managerSection.managerName}`} className="border-b border-slate-200">
                        <td className="sticky left-0 bg-white px-2 py-1.5 pl-6 text-slate-700">Пропозиція відправлена</td>
                        {managerSection.proposalByMonth.map((value, index) => <td key={`manager_proposal_cell_${managerSection.managerName}_${MONTH_KEYS[index]}`} className="px-1.5 py-1.5 text-right text-slate-700">{formatCompactNumber(value)}</td>)}
                        <td className="px-1.5 py-1.5 text-right font-semibold text-slate-900">{formatCompactNumber(managerSection.proposalByMonth.reduce((sum, value) => sum + value, 0))}</td>
                      </tr>,
                      <tr key={`manager_tender_${managerSection.managerName}`} className="border-b border-slate-200">
                        <td className="sticky left-0 bg-white px-2 py-1.5 pl-6 text-slate-700">Тендер</td>
                        {managerSection.tenderByMonth.map((value, index) => <td key={`manager_tender_cell_${managerSection.managerName}_${MONTH_KEYS[index]}`} className="px-1.5 py-1.5 text-right text-slate-700">{formatCompactNumber(value)}</td>)}
                        <td className="px-1.5 py-1.5 text-right font-semibold text-slate-900">{formatCompactNumber(managerSection.tenderByMonth.reduce((sum, value) => sum + value, 0))}</td>
                      </tr>,
                      <tr key={`manager_interest_${managerSection.managerName}`} className="border-b border-slate-200">
                        <td className="sticky left-0 bg-white px-2 py-1.5 pl-6 text-slate-700">Інтерес / Бриф</td>
                        {managerSection.interestByMonth.map((value, index) => <td key={`manager_interest_cell_${managerSection.managerName}_${MONTH_KEYS[index]}`} className="px-1.5 py-1.5 text-right text-slate-700">{formatCompactNumber(value)}</td>)}
                        <td className="px-1.5 py-1.5 text-right font-semibold text-slate-900">{formatCompactNumber(managerSection.interestByMonth.reduce((sum, value) => sum + value, 0))}</td>
                      </tr>,
                      <tr key={`manager_cancelled_${managerSection.managerName}`} className="border-b border-slate-300 bg-rose-50/50">
                        <td className="sticky left-0 bg-rose-50/50 px-2 py-1.5 pl-6 text-rose-800">Відмова / Скасовано нами</td>
                        {managerSection.cancelledByMonth.map((value, index) => <td key={`manager_cancelled_cell_${managerSection.managerName}_${MONTH_KEYS[index]}`} className="px-1.5 py-1.5 text-right text-rose-800">{formatCompactNumber(value)}</td>)}
                        <td className="px-1.5 py-1.5 text-right font-semibold text-rose-900">{formatCompactNumber(managerSection.cancelledByMonth.reduce((sum, value) => sum + value, 0))}</td>
                      </tr>,
                    );
                  }

                  return rows;
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Місяць планування</label>
            <input
              type="month"
              className={baseInput}
              value={selectedMonth}
              onChange={(event) => {
                setSelectedMonth(event.target.value);
                setPlanForm((prev) => ({ ...prev, month: event.target.value }));
              }}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Goal size={18} className="text-amber-600" />
              <h3 className="text-base font-semibold text-slate-900">План менеджера</h3>
            </div>
            <div className="space-y-3">
              <input className={baseInput} list="catering-plan-managers" value={planForm.managerName} onChange={(event) => setPlanForm((prev) => ({ ...prev, managerName: event.target.value }))} placeholder="Менеджер" />
              <input type="month" className={baseInput} value={planForm.month} onChange={(event) => setPlanForm((prev) => ({ ...prev, month: event.target.value }))} />
              <input className={baseInput} value={planForm.targetAmount} onChange={(event) => setPlanForm((prev) => ({ ...prev, targetAmount: event.target.value }))} placeholder="Планова сума" />
              <textarea className={`${baseInput} min-h-[84px]`} value={planForm.notes} onChange={(event) => setPlanForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Коментар до плану" />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={saving || !planForm.managerName.trim() || !planForm.month}
                  onClick={async () => {
                    const result = await onSavePlan(planForm);
                    if (result?.success) {
                      setPlanForm({ id: "", managerName: "", month: selectedMonth, targetAmount: "", notes: "" });
                    }
                  }}
                >
                  {planForm.id ? "Оновити план" : "Зберегти план"}
                </button>
                {planForm.id && (
                  <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setPlanForm({ id: "", managerName: "", month: selectedMonth, targetAmount: "", notes: "" })}>
                    Скасувати
                  </button>
                )}
              </div>
              <datalist id="catering-plan-managers">
                {managers.map((manager) => <option key={manager} value={manager} />)}
              </datalist>
            </div>
          </div>
        </div>
      )}

      {!isReportMode && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">План місяця</p>
              <p className="mt-2 text-xl font-semibold text-indigo-900">{formatMoney(monthPlanSummary.totalTarget)}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Факт місяця</p>
              <p className="mt-2 text-xl font-semibold text-emerald-900">{formatMoney(monthPlanSummary.totalActual)}</p>
            </div>
            <div className={`rounded-2xl border p-4 shadow-sm ${monthPlanSummary.totalGap >= 0 ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
              <p className={`text-xs font-semibold uppercase tracking-wide ${monthPlanSummary.totalGap >= 0 ? "text-emerald-700" : "text-rose-700"}`}>Відхилення</p>
              <p className={`mt-2 text-xl font-semibold ${monthPlanSummary.totalGap >= 0 ? "text-emerald-900" : "text-rose-900"}`}>{formatMoney(monthPlanSummary.totalGap)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Виконання плану</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{monthPlanSummary.completion}%</p>
              <p className="mt-1 text-xs text-slate-500">З планом: {monthPlanSummary.plannedManagers}/{monthPlanSummary.totalManagers}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Goal size={18} className="text-emerald-600" />
              <h3 className="text-base font-semibold text-slate-900">Виконання плану менеджерів</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Менеджер</th>
                    <th className="px-3 py-2">Активні угоди</th>
                    <th className="px-3 py-2">Факт</th>
                    <th className="px-3 py-2">План</th>
                    <th className="px-3 py-2">Відхилення</th>
                    <th className="px-3 py-2">Виконання</th>
                    <th className="px-3 py-2">Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {managerStats.map((item) => (
                    <tr key={`${selectedMonth}_${item.managerName}`} className="border-t border-slate-200">
                      <td className="px-3 py-3 font-medium text-slate-900">{item.managerName}</td>
                      <td className="px-3 py-3 text-slate-700">{item.activeDeals}</td>
                      <td className="px-3 py-3 text-slate-700">{formatMoney(item.actualAmount)}</td>
                      <td className="px-3 py-3 text-slate-700">{item.targetAmount > 0 ? formatMoney(item.targetAmount) : "—"}</td>
                      <td className="px-3 py-3">
                        {item.targetAmount > 0 ? (
                          <span className={item.actualAmount - item.targetAmount >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
                            {formatMoney(item.actualAmount - item.targetAmount)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {item.targetAmount > 0 ? (
                          <div className="min-w-[160px]">
                            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                              <span>{item.progress}%</span>
                              <span>{formatMoney(item.actualAmount)}</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100">
                              <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, item.progress)}%` }} />
                            </div>
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => {
                              if (item.plan) {
                                setPlanForm({ id: item.plan.id, managerName: item.plan.managerName, month: item.plan.month, targetAmount: String(item.plan.targetAmount || ""), notes: item.plan.notes || "" });
                                return;
                              }
                              setPlanForm({ id: "", managerName: item.managerName, month: selectedMonth, targetAmount: "", notes: "" });
                            }}
                          >
                            {item.plan ? "Редагувати" : "Додати план"}
                          </button>
                          {item.plan && (
                            <button
                              type="button"
                              className="rounded-md border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                              onClick={() => {
                                if (!window.confirm("Видалити план менеджера?")) return;
                                void onDeletePlan(item.plan.id);
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {managerStats.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-slate-500">За цей місяць ще немає даних.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
