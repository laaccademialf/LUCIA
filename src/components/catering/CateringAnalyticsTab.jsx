import { useMemo, useState } from "react";
import { BarChart3, Goal, TrendingUp, Trash2 } from "lucide-react";

const CRM_STAGE_LABELS = {
  new: "Новий / Інтерес",
  brief: "Бриф",
  proposal: "Пропозиція",
  work: "В роботі",
  tender: "Тендер",
  confirmed: "Підтверджено",
  cancelled: "Втрачено",
};

const formatMoney = (value) => new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "UAH",
  maximumFractionDigits: 0,
}).format(Number(value || 0));

const currentMonth = new Date().toISOString().slice(0, 7);
const baseInput = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

export default function CateringAnalyticsTab({ orders, plans, managers, saving, onSavePlan, onDeletePlan, activeNav, topTab }) {
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [planForm, setPlanForm] = useState({ id: "", managerName: "", month: currentMonth, targetAmount: "", notes: "" });

  // Визначаємо режим: звіт (читай-тільки) чи планування (редагування)
  const isReportMode = useMemo(() => {
    const navKey = String(activeNav || "").toLowerCase();
    const tabKey = String(topTab || "").toLowerCase();
    const probe = `${navKey} ${tabKey}`;
    return probe.includes("salescateringreport") || 
           probe.includes("report") || 
           probe.includes("analytics") && !probe.includes("plan") &&
           !probe.includes("managment") && !probe.includes("management");
  }, [activeNav, topTab]);

  const monthOrders = useMemo(() => {
    return orders.filter((item) => String(item.eventDate || item.createdAt || "").slice(0, 7) === selectedMonth);
  }, [orders, selectedMonth]);

  const stageStats = useMemo(() => {
    return Object.keys(CRM_STAGE_LABELS).map((stage) => {
      const stageOrders = monthOrders.filter((item) => item.status === stage);
      return {
        stage,
        label: CRM_STAGE_LABELS[stage],
        count: stageOrders.length,
        amount: stageOrders.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      };
    });
  }, [monthOrders]);

  const managerStats = useMemo(() => {
    const managerList = Array.from(new Set([
      ...managers,
      ...monthOrders.map((item) => String(item.managerName || "").trim()),
      ...plans.filter((item) => item.month === selectedMonth).map((item) => String(item.managerName || "").trim()),
    ].filter(Boolean)));

    return managerList.map((managerName) => {
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
    }).sort((left, right) => right.actualAmount - left.actualAmount);
  }, [managers, monthOrders, plans, selectedMonth]);

  const summary = useMemo(() => {
    const confirmedAmount = monthOrders.filter((item) => item.status === "confirmed").reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const pipelineAmount = monthOrders.filter((item) => item.status !== "confirmed" && item.status !== "cancelled").reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const avgDeal = monthOrders.length > 0 ? monthOrders.reduce((sum, item) => sum + Number(item.amount || 0), 0) / monthOrders.length : 0;
    return { confirmedAmount, pipelineAmount, avgDeal };
  }, [monthOrders]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-700"><TrendingUp size={16} /> Продажі місяця</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-900">{formatMoney(summary.confirmedAmount)}</div>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sky-700"><BarChart3 size={16} /> Pipeline</div>
            <div className="mt-2 text-2xl font-semibold text-sky-900">{formatMoney(summary.pipelineAmount)}</div>
          </div>
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-violet-700"><Goal size={16} /> Середній чек</div>
            <div className="mt-2 text-2xl font-semibold text-violet-900">{formatMoney(summary.avgDeal)}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Місяць аналітики</label>
          <input type="month" className={baseInput} value={selectedMonth} onChange={(event) => {
            setSelectedMonth(event.target.value);
            setPlanForm((prev) => ({ ...prev, month: event.target.value }));
          }} />
          <p className="mt-2 text-xs text-slate-500">Аналітика рахується за датою події або створення CRM-угоди.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 size={18} className="text-indigo-600" />
            <h3 className="text-base font-semibold text-slate-900">Продажі по стадіях</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">Стадія</th>
                  <th className="px-3 py-2">К-сть угод</th>
                  <th className="px-3 py-2">Сума</th>
                </tr>
              </thead>
              <tbody>
                {stageStats.map((item) => (
                  <tr key={item.stage} className="border-t border-slate-200">
                    <td className="px-3 py-3 font-medium text-slate-900">{item.label}</td>
                    <td className="px-3 py-3 text-slate-700">{item.count}</td>
                    <td className="px-3 py-3 text-slate-700">{formatMoney(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Goal size={18} className="text-amber-600" />
            <h3 className="text-base font-semibold text-slate-900">План менеджера</h3>
          </div>
          {isReportMode ? (
            <p className="text-sm text-slate-600">У режимі звіту редагування планів недоступне. Використовуйте розділ «Планування».</p>
          ) : (
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
          )}
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
                    {isReportMode ? (
                      item.targetAmount > 0 ? <span className="text-slate-700">{formatMoney(item.targetAmount)}</span> : "—"
                    ) : (
                      <div className="flex items-center gap-2">
                        {item.plan && (
                          <>
                            <button type="button" className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setPlanForm({ id: item.plan.id, managerName: item.plan.managerName, month: item.plan.month, targetAmount: String(item.plan.targetAmount || ""), notes: item.plan.notes || "" })}>
                              Редагувати
                            </button>
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
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {managerStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">За цей місяць ще немає даних.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}