import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
  Legend,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const PRICE_FIELDS = new Set(["initialCost", "marketValueNew", "marketValueUsed", "residualValue"]);

const toNumberLoose = (value) => {
  const normalized = String(value ?? "").replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoney = (value) => new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "UAH",
  minimumFractionDigits: 2,
}).format(toNumberLoose(value));

const formatDateTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("uk-UA");
};

const CHART_COLORS = ["#4f46e5", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316"];

const FIELD_LABELS = {
  initialCost: "Початкова вартість",
  marketValueNew: "Ринкова вартість (нова)",
  marketValueUsed: "Ринкова вартість (б/в)",
  residualValue: "Залишкова вартість",
  status: "Статус",
  condition: "Стан",
  physicalWear: "Фізичний знос",
  moralWear: "Моральний знос",
  totalWear: "Загальний знос",
  decision: "Рішення",
  reason: "Причина",
  comment: "Коментар",
  created: "Створення активу",
};

const getFieldLabel = (field) => FIELD_LABELS[String(field || "")] || String(field || "-");

export default function AssetDetailedReport({ assets = [] }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [restaurantFilter, setRestaurantFilter] = useState("");
  const [fieldFilter, setFieldFilter] = useState("");
  const [fieldChartMode, setFieldChartMode] = useState("count");

  const flattenedChanges = useMemo(() => {
    const rows = [];
    assets.forEach((asset) => {
      const history = Array.isArray(asset?.inventoryChangeHistory) ? asset.inventoryChangeHistory : [];
      history.forEach((entry) => {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        changes.forEach((change) => {
          const previousValue = change?.previousValue;
          const nextValue = change?.nextValue;
          const delta = toNumberLoose(nextValue) - toNumberLoose(previousValue);
          rows.push({
            assetId: String(asset?.id || ""),
            assetInvNumber: String(asset?.invNumber || "-"),
            assetName: String(asset?.name || "-"),
            restaurant: String(asset?.locationName || "-"),
            changedAt: String(entry?.changedAt || ""),
            changedByName: String(entry?.changedByName || "-"),
            field: String(change?.field || "-"),
            previousValue,
            nextValue,
            delta,
            sessionId: String(entry?.inventorySessionId || "-"),
            source: String(entry?.source || "-"),
          });
        });
      });
    });

    return rows.sort((a, b) => String(b.changedAt || "").localeCompare(String(a.changedAt || "")));
  }, [assets]);

  const restaurantOptions = useMemo(() => {
    return Array.from(new Set(flattenedChanges.map((item) => item.restaurant).filter(Boolean))).sort((a, b) => a.localeCompare(b, "uk"));
  }, [flattenedChanges]);

  const fieldOptions = useMemo(() => {
    return Array.from(new Set(flattenedChanges.map((item) => item.field).filter(Boolean))).sort((a, b) => a.localeCompare(b, "uk"));
  }, [flattenedChanges]);

  const filteredChanges = useMemo(() => {
    const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;

    return flattenedChanges.filter((row) => {
      const ts = row.changedAt ? new Date(row.changedAt).getTime() : null;
      if (fromTs !== null && (ts === null || Number.isNaN(ts) || ts < fromTs)) return false;
      if (toTs !== null && (ts === null || Number.isNaN(ts) || ts > toTs)) return false;
      if (restaurantFilter && row.restaurant !== restaurantFilter) return false;
      if (fieldFilter && row.field !== fieldFilter) return false;
      return true;
    });
  }, [flattenedChanges, dateFrom, dateTo, restaurantFilter, fieldFilter]);

  const summary = useMemo(() => {
    const uniqueAssets = new Set(filteredChanges.map((item) => item.assetId)).size;
    const priceChanges = filteredChanges.filter((item) => PRICE_FIELDS.has(item.field));
    const increase = priceChanges.reduce((sum, item) => sum + (item.delta > 0 ? item.delta : 0), 0);
    const decrease = priceChanges.reduce((sum, item) => sum + (item.delta < 0 ? item.delta : 0), 0);
    return {
      totalChanges: filteredChanges.length,
      uniqueAssets,
      priceChangesCount: priceChanges.length,
      increase,
      decrease,
      net: increase + decrease,
    };
  }, [filteredChanges]);

  const changesByFieldData = useMemo(() => {
    const groups = {};
    filteredChanges.forEach((item) => {
      const key = item.field || "-";
      if (!groups[key]) {
        groups[key] = { field: key, fieldLabel: getFieldLabel(key), count: 0, delta: 0, impact: 0 };
      }
      groups[key].count += 1;
      if (PRICE_FIELDS.has(key)) {
        groups[key].delta += item.delta;
        groups[key].impact += Math.abs(item.delta);
      }
    });

    return Object.values(groups)
      .sort((a, b) => (fieldChartMode === "impact" ? b.impact - a.impact : b.count - a.count))
      .slice(0, 8);
  }, [filteredChanges, fieldChartMode]);

  const dailyDeltaData = useMemo(() => {
    const groups = {};
    filteredChanges.forEach((item) => {
      if (!item.changedAt) return;
      const day = item.changedAt.slice(0, 10);
      if (!groups[day]) {
        groups[day] = { day, increases: 0, decreases: 0, net: 0, count: 0 };
      }
      groups[day].count += 1;
      if (PRICE_FIELDS.has(item.field)) {
        if (item.delta > 0) groups[day].increases += item.delta;
        if (item.delta < 0) groups[day].decreases += item.delta;
        groups[day].net += item.delta;
      }
    });

    return Object.values(groups)
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((row) => ({
        ...row,
        label: row.day.split("-").reverse().join("."),
      }));
  }, [filteredChanges]);

  const restaurantDistributionData = useMemo(() => {
    const groups = {};
    filteredChanges.forEach((item) => {
      const key = item.restaurant || "-";
      if (!groups[key]) {
        groups[key] = { name: key, value: 0 };
      }
      groups[key].value += 1;
    });

    return Object.values(groups).sort((a, b) => b.value - a.value);
  }, [filteredChanges]);

  return (
    <div className="space-y-5">
      <div className="card p-5 bg-white border border-slate-200 text-slate-900 shadow-xl">
        <h2 className="text-lg font-semibold">Детальний звіт по основних засобах</h2>
        <p className="mt-1 text-sm text-slate-600">Аналітика змін по інвентаризаціях: суми, статуси, стани, рішення та інші поля.</p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
          <div>
            <label className="text-sm font-semibold">Дата з</label>
            <input type="date" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-semibold">Дата по</label>
            <input type="date" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-semibold">Ресторан</label>
            <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={restaurantFilter} onChange={(e) => setRestaurantFilter(e.target.value)}>
              <option value="">Всі</option>
              {restaurantOptions.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold">Поле змін</label>
            <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={fieldFilter} onChange={(e) => setFieldFilter(e.target.value)}>
              <option value="">Всі</option>
              {fieldOptions.map((item) => (
                <option key={item} value={item}>{getFieldLabel(item)}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setRestaurantFilter("");
                setFieldFilter("");
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Скинути фільтри
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><div className="text-xs text-slate-500">Всього змін</div><div className="text-xl font-bold text-slate-900">{summary.totalChanges}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><div className="text-xs text-slate-500">Унікальних активів</div><div className="text-xl font-bold text-slate-900">{summary.uniqueAssets}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><div className="text-xs text-slate-500">Змін по сумах</div><div className="text-xl font-bold text-slate-900">{summary.priceChangesCount}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><div className="text-xs text-slate-500">Збільшення сум</div><div className="text-xl font-bold text-emerald-700">{formatMoney(summary.increase)}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><div className="text-xs text-slate-500">Зменшення сум</div><div className="text-xl font-bold text-rose-700">{formatMoney(summary.decrease)}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"><div className="text-xs text-slate-500">Чиста дельта</div><div className="text-xl font-bold text-indigo-700">{formatMoney(summary.net)}</div></div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">
              {fieldChartMode === "impact" ? "Топ полів за фінансовим впливом" : "Топ полів за кількістю змін"}
            </h3>
            <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
              <button
                type="button"
                onClick={() => setFieldChartMode("count")}
                className={`px-2 py-1 text-xs font-semibold ${fieldChartMode === "count" ? "bg-indigo-600 text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}
              >
                Кількість
              </button>
              <button
                type="button"
                onClick={() => setFieldChartMode("impact")}
                className={`px-2 py-1 text-xs font-semibold ${fieldChartMode === "impact" ? "bg-indigo-600 text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}
              >
                Суми
              </button>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={changesByFieldData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fieldLabel" angle={-25} textAnchor="end" interval={0} height={58} />
                <YAxis allowDecimals={fieldChartMode !== "impact"} />
                <Tooltip
                  formatter={(value, name) => {
                    if (fieldChartMode === "impact") {
                      return [formatMoney(value), name];
                    }
                    return [value, name];
                  }}
                />
                <Legend />
                <Bar
                  dataKey={fieldChartMode === "impact" ? "impact" : "count"}
                  name={fieldChartMode === "impact" ? "Фінансовий вплив" : "К-сть змін"}
                  fill="#4f46e5"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Тренд дельти по днях</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyDeltaData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="net" name="Чиста дельта" stroke="#4f46e5" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="increases" name="Збільшення" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="decreases" name="Зменшення" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Розподіл змін по ресторанах</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={restaurantDistributionData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  labelLine={false}
                >
                  {restaurantDistributionData.map((entry, index) => (
                    <Cell key={`${entry.name}_${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card p-0 bg-white border border-slate-200 text-slate-900 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">Дата</th>
                <th className="px-3 py-2 text-left">Інв. номер</th>
                <th className="px-3 py-2 text-left">Актив</th>
                <th className="px-3 py-2 text-left">Ресторан</th>
                <th className="px-3 py-2 text-left">Поле</th>
                <th className="px-3 py-2 text-left">Було</th>
                <th className="px-3 py-2 text-left">Стало</th>
                <th className="px-3 py-2 text-left">Дельта</th>
                <th className="px-3 py-2 text-left">Хто змінив</th>
                <th className="px-3 py-2 text-left">Сесія</th>
              </tr>
            </thead>
            <tbody>
              {filteredChanges.map((row, index) => (
                <tr key={`${row.assetId}_${row.changedAt}_${row.field}_${index}`} className="border-t border-slate-200">
                  <td className="px-3 py-2">{formatDateTime(row.changedAt)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.assetInvNumber}</td>
                  <td className="px-3 py-2">{row.assetName}</td>
                  <td className="px-3 py-2">{row.restaurant}</td>
                  <td className="px-3 py-2">{getFieldLabel(row.field)}</td>
                  <td className="px-3 py-2">{String(row.previousValue ?? "-")}</td>
                  <td className="px-3 py-2">{String(row.nextValue ?? "-")}</td>
                  <td className={`px-3 py-2 font-semibold ${row.delta > 0 ? "text-emerald-700" : row.delta < 0 ? "text-rose-700" : "text-slate-600"}`}>
                    {PRICE_FIELDS.has(row.field) ? formatMoney(row.delta) : "-"}
                  </td>
                  <td className="px-3 py-2">{row.changedByName}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.sessionId || "-"}</td>
                </tr>
              ))}
              {filteredChanges.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-500">За обраними фільтрами змін не знайдено.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
