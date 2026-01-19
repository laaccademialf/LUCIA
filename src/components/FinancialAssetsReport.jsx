// Додаємо імпорт для іконки Clock
import { Clock } from "lucide-react";
import { useMemo } from "react";
import { TrendingUp, DollarSign, AlertTriangle, BarChart3, Download, PieChart } from "lucide-react";
import { BarChart, Bar, PieChart as PieChartComponent, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";

export const FinancialAssetsReport = ({ assets = [], restaurants = [], responsibilityCenters = [] }) => {
      // Амортизація: сума за рік/місяць, середня ставка
      const amortizationStats = useMemo(() => {
        let totalAmortPerYear = 0;
        let totalAmortPerMonth = 0;
        let count = 0;
        let avgRate = 0;
        assets.forEach(a => {
          const cost = parseFloat(a.initialCost) || 0;
          const term = parseFloat(a.normativeTerm) || 0;
          if (cost > 0 && term > 0) {
            totalAmortPerYear += cost / term;
            totalAmortPerMonth += cost / term / 12;
            avgRate += 1 / term;
            count++;
          }
        });
        return {
          totalAmortPerYear,
          totalAmortPerMonth,
          avgRate: count > 0 ? (avgRate / count * 100).toFixed(2) : 0,
        };
      }, [assets]);

      // Активи, що не використовуються
      const unusedAssets = useMemo(() => {
        return assets.filter(a => (a.status && ["Не використовується", "На складі", "Вибув"].includes(a.status)));
      }, [assets]);

      // Прогнозований термін служби (закінчують у 12 міс)
      const soonExpiredAssets = useMemo(() => {
        const now = new Date();
        return assets.filter(a => {
          if (!a.commissionDate || !a.normativeTerm) return false;
          const start = new Date(a.commissionDate);
          if (isNaN(start)) return false;
          const years = parseFloat(a.normativeTerm);
          if (!years) return false;
          const end = new Date(start);
          end.setFullYear(end.getFullYear() + years);
          const diffMonths = (end - now) / (1000 * 60 * 60 * 24 * 30.44);
          return diffMonths >= 0 && diffMonths <= 12;
        });
      }, [assets]);
    // ТОП-10 найдорожчих активів
    const topExpensiveAssets = useMemo(() => {
      return assets
        .filter(a => a.residualValue && a.name)
        .sort((a, b) => parseFloat(b.residualValue) - parseFloat(a.residualValue))
        .slice(0, 10);
    }, [assets]);

    // Структура за віком (якщо є поле commissionDate)
    const ageGroups = useMemo(() => {
      const now = new Date();
      const groups = {
        '0-3': 0,
        '3-5': 0,
        '5-10': 0,
        '10+': 0,
      };
      assets.forEach(a => {
        if (!a.commissionDate) return;
        const date = new Date(a.commissionDate);
        if (isNaN(date)) return;
        const years = (now - date) / (1000 * 60 * 60 * 24 * 365.25);
        if (years < 3) groups['0-3']++;
        else if (years < 5) groups['3-5']++;
        else if (years < 10) groups['5-10']++;
        else groups['10+']++;
      });
      return Object.entries(groups).map(([name, value]) => ({ name, value }));
    }, [assets]);
  // Розрахунки основних метрик
  const metrics = useMemo(() => {
    const totalAssets = assets.length;
    const totalInitialCost = assets.reduce((sum, a) => sum + (parseFloat(a.initialCost) || 0), 0);
    const totalResidualValue = assets.reduce((sum, a) => sum + (parseFloat(a.residualValue) || 0), 0);
    const totalDepreciation = totalInitialCost - totalResidualValue;
    const avgWear = totalAssets > 0 ? (assets.reduce((sum, a) => sum + (parseFloat(a.totalWear) || 0), 0) / totalAssets).toFixed(1) : 0;
    const assetsForDisposal = assets.filter(a => a.decision === "Списати" || a.decision === "Продати").length;
    const criticalCondition = assets.filter(a => a.condition === "Критичний" || parseFloat(a.totalWear) > 80).length;

    return {
      totalAssets,
      totalInitialCost,
      totalResidualValue,
      totalDepreciation,
      avgWear,
      assetsForDisposal,
      criticalCondition,
    };
  }, [assets]);

  // Розподіл вартості по категоріям
  const categoryDistribution = useMemo(() => {
    const groups = {};
    assets.forEach(a => {
      const category = a.category || "Без категорії";
      if (!groups[category]) {
        groups[category] = {
          name: category,
          initialCost: 0,
          residualValue: 0,
          count: 0,
        };
      }
      groups[category].initialCost += parseFloat(a.initialCost) || 0;
      groups[category].residualValue += parseFloat(a.residualValue) || 0;
      groups[category].count += 1;
    });
    return Object.values(groups).sort((a, b) => b.initialCost - a.initialCost);
  }, [assets]);

  // Активи на списання з деталями
  const disposalAssets = useMemo(() => {
    return assets
      .filter(a => a.decision === "Списати" || a.decision === "Продати")
      .map(a => ({
        ...a,
        loss: parseFloat(a.initialCost) - parseFloat(a.residualValue),
      }))
      .sort((a, b) => b.loss - a.loss);
  }, [assets]);

  // Розподіл по центрах відповідальності
  const centerDistribution = useMemo(() => {
    const groups = {};
    assets.forEach(a => {
      const center = a.respCenter || "Без центру";
      if (!groups[center]) {
        groups[center] = {
          name: center,
          count: 0,
          totalValue: 0,
          totalWear: 0,
        };
      }
      groups[center].count += 1;
      groups[center].totalValue += parseFloat(a.residualValue) || 0;
      groups[center].totalWear += parseFloat(a.totalWear) || 0;
    });
    return Object.values(groups)
      .map(g => ({
        ...g,
        avgWear: g.count > 0 ? (g.totalWear / g.count).toFixed(1) : 0,
      }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [assets]);

  // Тренд вартості по статусам
  const statusDistribution = useMemo(() => {
    const groups = {};
    assets.forEach(a => {
      const status = a.status || "Невідомо";
      if (!groups[status]) {
        groups[status] = { name: status, value: 0, count: 0 };
      }
      groups[status].value += parseFloat(a.residualValue) || 0;
      groups[status].count += 1;
    });
    return Object.values(groups).sort((a, b) => b.value - a.value);
  }, [assets]);

  // Топ активів з найбільшим знесенням
  const topWearAssets = useMemo(() => {
    return assets
      .filter(a => a.totalWear && a.initialCost)
      .sort((a, b) => parseFloat(b.totalWear) - parseFloat(a.totalWear))
      .slice(0, 10);
  }, [assets]);

  // Форматування валюти
  const formatCurrency = (value) => {
    const num = parseFloat(value) || 0;
    return new Intl.NumberFormat("uk-UA", {
      style: "currency",
      currency: "UAH",
      minimumFractionDigits: 0,
    }).format(num);
  };

  // Експорт звіту
  const handleExport = () => {
    const reportData = {
      generatedAt: new Date().toLocaleString("uk-UA"),
      metrics,
      categoryDistribution,
      centerDistribution,
      disposalAssets: disposalAssets.slice(0, 20),
    };

    const csv = [
      ["ЗВІТ ПО ОСНОВНИМ ЗАСОБАМ - ФІНАНСОВИЙ АНАЛІЗ"],
      [],
      ["ДАТА ГЕНЕРАЦІЇ", reportData.generatedAt],
      [],
      ["ЗАГАЛЬНІ ПОКАЗНИКИ"],
      ["Всього активів", metrics.totalAssets],
      ["Первісна вартість", formatCurrency(metrics.totalInitialCost)],
      ["Залишкова вартість", formatCurrency(metrics.totalResidualValue)],
      ["Загальний знос", formatCurrency(metrics.totalDepreciation)],
      ["Середній знос", metrics.avgWear + "%"],
      ["На списання/продаж", metrics.assetsForDisposal],
      ["Критичний стан", metrics.criticalCondition],
      [],
      ["РОЗПОДІЛ ПО КАТЕГОРІЯМ"],
      ["Категорія", "Кількість", "Первісна вартість", "Залишкова вартість"],
      ...categoryDistribution.map(c => [
        c.name,
        c.count,
        formatCurrency(c.initialCost),
        formatCurrency(c.residualValue),
      ]),
      [],
      ["РОЗПОДІЛ ПО ЦЕНТРАХ ВІДПОВІДАЛЬНОСТІ"],
      ["Центр", "Кількість активів", "Загальна залишкова вартість", "Середній знос"],
      ...centerDistribution.map(c => [
        c.name,
        c.count,
        formatCurrency(c.totalValue),
        c.avgWear + "%",
      ]),
    ];

    const csvContent = csv.map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `finansovyy-zvit-aktiviv-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const COLORS = ["#4f46e5", "#7c3aed", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#8b5cf6", "#ef4444"];

  return (
    <div className="space-y-6">
      {/* Амортизація */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Амортизація основних засобів</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-slate-700 text-sm">Сумарна амортизація на рік</div>
            <div className="text-2xl font-bold text-slate-900">{formatCurrency(amortizationStats.totalAmortPerYear)}</div>
          </div>
          <div>
            <div className="text-slate-700 text-sm">Сумарна амортизація на місяць</div>
            <div className="text-2xl font-bold text-slate-900">{formatCurrency(amortizationStats.totalAmortPerMonth)}</div>
          </div>
          <div>
            <div className="text-slate-700 text-sm">Середня ставка амортизації</div>
            <div className="text-2xl font-bold text-slate-900">{amortizationStats.avgRate}%</div>
          </div>
        </div>
      </div>

      {/* Активи, що не використовуються */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Активи, що не використовуються / на складі</h3>
        {unusedAssets.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-800">Назва</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-800">Категорія</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-800">Статус</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-800">Залишкова вартість</th>
                </tr>
              </thead>
              <tbody>
                {unusedAssets.map((asset, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-medium text-slate-800">{asset.name}</td>
                    <td className="px-4 py-3 text-slate-600">{asset.category}</td>
                    <td className="px-4 py-3">{asset.status}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(asset.residualValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-slate-500 py-8">Немає таких активів</p>
        )}
      </div>

      {/* Активи, у яких закінчується термін служби у 12 міс. */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Активи, у яких закінчується термін служби (12 міс.)</h3>
        {soonExpiredAssets.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-800">Назва</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-800">Категорія</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-800">Дата введення</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-800">Термін служби (років)</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-800">Залишкова вартість</th>
                </tr>
              </thead>
              <tbody>
                {soonExpiredAssets.map((asset, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-medium text-slate-800">{asset.name}</td>
                    <td className="px-4 py-3 text-slate-600">{asset.category}</td>
                    <td className="px-4 py-3">{asset.commissionDate}</td>
                    <td className="px-4 py-3 text-right">{asset.normativeTerm}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(asset.residualValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-slate-500 py-8">Немає таких активів</p>
        )}
      </div>
      {/* ТОП-10 найдорожчих активів */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">ТОП-10 найдорожчих активів (залишкова вартість)</h3>
        {topExpensiveAssets.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-800">Назва</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-800">Категорія</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-800">Залишкова вартість</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-800">Відповідальний</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-800">Дата введення</th>
                </tr>
              </thead>
              <tbody>
                {topExpensiveAssets.map((asset, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-medium text-slate-800">{asset.name}</td>
                    <td className="px-4 py-3 text-slate-600">{asset.category}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(asset.residualValue)}</td>
                    <td className="px-4 py-3">{asset.respPerson || '-'}</td>
                    <td className="px-4 py-3">{asset.commissionDate || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-slate-500 py-8">Немає даних</p>
        )}
      </div>

      {/* Структура активів за віком */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Clock size={20} className="text-indigo-600" />
          Структура активів за віком (роки з моменту введення)
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={ageGroups}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" fill="#6366f1" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Фінансовий аналіз основних засобів</h2>
          <p className="text-slate-600 mt-1">Детальний звіт вартості та стану активів</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition shadow-lg"
        >
          <Download size={18} />
          Експортувати
        </button>
      </div>

      {/* KPI Карточки */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-slate-700 font-semibold text-sm">Всього активів</h3>
            <DollarSign className="text-indigo-600" size={24} />
          </div>
          <p className="text-3xl font-bold text-slate-900">{metrics.totalAssets}</p>
          <p className="text-xs text-slate-600 mt-2">основних засобів в системі</p>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-slate-700 font-semibold text-sm">Залишкова вартість</h3>
            <TrendingUp className="text-emerald-600" size={24} />
          </div>
          <p className="text-3xl font-bold text-slate-900">{formatCurrency(metrics.totalResidualValue).split(" ")[0]}</p>
          <p className="text-xs text-slate-600 mt-2">поточна вартість активів</p>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-slate-700 font-semibold text-sm">累積знос</h3>
            <BarChart3 className="text-orange-600" size={24} />
          </div>
          <p className="text-3xl font-bold text-slate-900">{metrics.avgWear}%</p>
          <p className="text-xs text-slate-600 mt-2">середній знос активів</p>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-slate-700 font-semibold text-sm">На списання</h3>
            <AlertTriangle className="text-red-600" size={24} />
          </div>
          <p className="text-3xl font-bold text-slate-900">{metrics.assetsForDisposal}</p>
          <p className="text-xs text-slate-600 mt-2">активів чекають на списання</p>
        </div>
      </div>

      {/* Графіки */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Розподіл по категоріям */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <PieChart size={20} className="text-indigo-600" />
            Розподіл залишкової вартості по категоріям
          </h3>
          {categoryDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChartComponent>
                <Pie
                  data={categoryDistribution.map(c => ({ name: c.name, value: c.residualValue }))}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${(entry.value / metrics.totalResidualValue * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </PieChartComponent>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-slate-500 py-12">Немає даних</p>
          )}
        </div>

        {/* Розподіл по статусам */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <BarChart3 size={20} className="text-emerald-600" />
            Залишкова вартість по статусам
          </h3>
          {statusDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={statusDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="value" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-slate-500 py-12">Немає даних</p>
          )}
        </div>
      </div>

      {/* Розподіл по центрах відповідальності */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Розподіл по центрах відповідальності</h3>
        {centerDistribution.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-800">Центр відповідальності</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-800">Активів</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-800">Залишкова вартість</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-800">Середній знос</th>
                </tr>
              </thead>
              <tbody>
                {centerDistribution.map((center, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-medium text-slate-800">{center.name}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{center.count}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(center.totalValue)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`px-3 py-1 rounded-full font-medium ${
                        center.avgWear > 70 ? "bg-red-100 text-red-800" :
                        center.avgWear > 40 ? "bg-orange-100 text-orange-800" :
                        "bg-green-100 text-green-800"
                      }`}>
                        {center.avgWear}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-slate-500 py-8">Немає даних</p>
        )}
      </div>

      {/* Топ активів з найбільшим знесенням */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Топ активів з найбільшим знесенням</h3>
        {topWearAssets.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-800">Назва активу</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-800">Категорія</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-800">Знос</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-800">Залишкова вартість</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-800">Статус</th>
                </tr>
              </thead>
              <tbody>
                {topWearAssets.map((asset, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-medium text-slate-800">{asset.name}</td>
                    <td className="px-4 py-3 text-slate-600">{asset.category}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`px-3 py-1 rounded-full font-semibold text-white ${
                        asset.totalWear >= 80 ? "bg-red-600" :
                        asset.totalWear >= 60 ? "bg-orange-600" :
                        asset.totalWear >= 40 ? "bg-yellow-600" :
                        "bg-green-600"
                      }`}>
                        {parseFloat(asset.totalWear).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(asset.residualValue)}</td>
                    <td className="px-4 py-3">
                      <span className="px-3 py-1 rounded bg-slate-100 text-slate-800 text-xs font-medium">
                        {asset.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-slate-500 py-8">Немає даних</p>
        )}
      </div>

      {/* Активи на списання */}
      {disposalAssets.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-600" />
            Активи на списання / продаж
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-red-100 border-b border-red-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-800">Назва</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-800">Тип рішення</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-800">Первісна вартість</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-800">Залишкова вартість</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-800">Потенційні втрати</th>
                </tr>
              </thead>
              <tbody>
                {disposalAssets.slice(0, 15).map((asset, idx) => (
                  <tr key={idx} className="border-b border-red-100 hover:bg-red-100/50 transition">
                    <td className="px-4 py-3 font-medium text-slate-800">{asset.name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        asset.decision === "Списати" 
                          ? "bg-red-600 text-white" 
                          : "bg-orange-600 text-white"
                      }`}>
                        {asset.decision}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(asset.initialCost)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(asset.residualValue)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">{formatCurrency(asset.loss)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-red-100 border-t border-red-200">
                <tr>
                  <td colSpan="4" className="px-4 py-3 font-semibold text-slate-800 text-right">
                    Всього потенційних втрат:
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-red-600 text-lg">
                    {formatCurrency(disposalAssets.reduce((sum, a) => sum + a.loss, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Примітка */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p>
          <strong>📊 Про звіт:</strong> Цей звіт надає комплексний аналіз основних засобів з фокусом на фінансові показники.
          Регулярно переглядайте активи на списання та планіруйте заходи щодо мінімізації потенційних втрат.
        </p>
      </div>
    </div>
  );
};
export default FinancialAssetsReport;
