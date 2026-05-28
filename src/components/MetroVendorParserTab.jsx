import { useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCcw, Search, X } from "lucide-react";
import { fetchMetroProducts, isMetroApiEnabled } from "../api/metroApi";

const cardClass = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";

const normalizeKey = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const isMetroSupplierName = (value) => {
  const normalized = normalizeKey(value);
  return normalized.includes("metro");
};

const toNumber = (value) => {
  const normalized = String(value ?? "").replace(/\s+/g, "").replace(/,/g, ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoney = (value) => {
  const amount = typeof value === "number" ? value : toNumber(value);
  return amount.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDateTime = (value) => {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("uk-UA");
  } catch {
    return String(value);
  }
};

function CredentialsModal({ open, onClose, onSubmit, defaults }) {
  const [email, setEmail] = useState(defaults?.email || "");
  const [password, setPassword] = useState(defaults?.password || "");
  const [query, setQuery] = useState(defaults?.query || "");
  const [limit, setLimit] = useState(defaults?.limit || 50);
  const [manualMode, setManualMode] = useState(Boolean(defaults?.manualMode));

  useEffect(() => {
    if (!open) return;
    setEmail(defaults?.email || "");
    setPassword(defaults?.password || "");
    setQuery(defaults?.query || "");
    setLimit(defaults?.limit || 50);
    setManualMode(Boolean(defaults?.manualMode));
  }, [open, defaults]);

  if (!open) return null;

  const submit = (event) => {
    event.preventDefault();
    onSubmit({
      email: email.trim(),
      password,
      query: query.trim(),
      limit: Number(limit) || 50,
      manualMode,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Вхід у Metro</h3>
            <p className="mt-1 text-xs text-slate-500">Дані не зберігаються — використовуються лише для одного запиту.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              autoComplete="off"
              disabled={manualMode}
              required={!manualMode}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Пароль</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              autoComplete="new-password"
              disabled={manualMode}
              required={!manualMode}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Пошук / артикул (опційно)</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Напр. молоко / 123456"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Ліміт результатів</span>
            <input
              type="number"
              min="1"
              max="200"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={manualMode}
              onChange={(event) => setManualMode(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              <strong>Ручний вхід.</strong> На сервері відкриється реальне вікно Metro — ви входите там самостійно (включно з captcha/2FA). Працює лише якщо migration server запущено на машині з UI. Логін/пароль у цьому режимі не передаються.
            </span>
          </label>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Скасувати
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Search size={16} />
            Запустити парсер
          </button>
        </div>
      </form>
    </div>
  );
}

export default function MetroVendorParserTab({ products = [], updateProduct, user }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [lastRequest, setLastRequest] = useState({ email: "", password: "", query: "", limit: 50, manualMode: false });
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const abortRef = useRef(null);
  const apiEnabled = isMetroApiEnabled();

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const metroProducts = useMemo(() => {
    const source = Array.isArray(products) ? products : [];
    const fromMetro = source.filter((item) => isMetroSupplierName(item?.supplier));
    return fromMetro.length > 0 ? fromMetro : source;
  }, [products]);

  const productIndexes = useMemo(() => {
    const byCode = new Map();
    const byName = new Map();

    metroProducts.forEach((product) => {
      const code = normalizeKey(product?.code1C);
      const name = normalizeKey(product?.name);
      if (code && !byCode.has(code)) byCode.set(code, product);
      if (name && !byName.has(name)) byName.set(name, product);
    });

    return { byCode, byName };
  }, [metroProducts]);

  const rowsWithMatches = useMemo(() => {
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    return rows.map((row, index) => {
      const matchedProduct = productIndexes.byCode.get(normalizeKey(row?.code1C))
        || productIndexes.byName.get(normalizeKey(row?.name))
        || null;
      const rowKey = String(row?.id || row?.sku || row?.code1C || row?.name || `row_${index}`);
      const nextPrice = toNumber(row?.price);
      const currentPrice = toNumber(matchedProduct?.unitPrice);
      const delta = matchedProduct ? Number((nextPrice - currentPrice).toFixed(2)) : null;
      return {
        ...row,
        rowKey,
        matchedProduct,
        nextPrice,
        currentPrice,
        delta,
      };
    });
  }, [productIndexes, result]);

  useEffect(() => {
    setSelectedRowKeys((prev) => prev.filter((rowKey) => rowsWithMatches.some((row) => row.rowKey === rowKey)));
  }, [rowsWithMatches]);

  const selectedRows = useMemo(() => {
    const selectedSet = new Set(selectedRowKeys);
    return rowsWithMatches.filter((row) => selectedSet.has(row.rowKey));
  }, [rowsWithMatches, selectedRowKeys]);

  const runRequest = async (request) => {
    setLastRequest(request);
    setModalOpen(false);

    if (!apiEnabled) {
      setError("API не налаштовано. Перевірте runtime custom API.");
      return;
    }
    if (!request.manualMode && (!request.email || !request.password)) {
      setError("Введіть логін і пароль Metro або увімкніть ручний вхід.");
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");

    try {
      const response = await fetchMetroProducts({
        email: request.email,
        password: request.password,
        query: request.query,
        limit: request.limit,
        manual: request.manualMode,
        signal: controller.signal,
      });
      setResult(response);
      setSelectedRowKeys([]);
      if (!response?.ok) {
        setError(response?.error || "Не вдалося отримати дані Metro.");
      }
    } catch (fetchError) {
      if (fetchError?.name === "AbortError") return;
      setResult(null);
      setError(fetchError?.message || String(fetchError));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  };

  const toggleSelectAllMatched = () => {
    const selectable = rowsWithMatches.filter((row) => row.matchedProduct);
    const selectableKeys = selectable.map((row) => row.rowKey);
    const selectedSet = new Set(selectedRowKeys);
    const allSelected = selectableKeys.length > 0 && selectableKeys.every((key) => selectedSet.has(key));
    if (allSelected) {
      setSelectedRowKeys((prev) => prev.filter((key) => !selectableKeys.includes(key)));
      return;
    }
    setSelectedRowKeys(Array.from(new Set([...selectedRowKeys, ...selectableKeys])));
  };

  const toggleRow = (rowKey) => {
    setSelectedRowKeys((prev) => (
      prev.includes(rowKey) ? prev.filter((key) => key !== rowKey) : [...prev, rowKey]
    ));
  };

  const importSelected = async () => {
    if (selectedRows.length === 0) {
      alert("Немає вибраних рядків для імпорту.");
      return;
    }

    setImporting(true);
    let success = 0;
    let failed = 0;

    for (const row of selectedRows) {
      const matchedProduct = row.matchedProduct;
      if (!matchedProduct?.id) {
        failed += 1;
        continue;
      }
      const { id, ...payload } = matchedProduct;
      const resultUpdate = await updateProduct(id, {
        ...payload,
        unitPrice: row.nextPrice,
        supplier: String(payload?.supplier || row?.supplierName || "Metro Cash & Carry").trim(),
      }, { skipReload: true });
      if (resultUpdate?.success) success += 1;
      else failed += 1;
    }

    setImporting(false);
    alert(`Імпорт цін Metro завершено. Успішно: ${success}. Помилок: ${failed}.`);
  };

  const matchedCount = rowsWithMatches.filter((row) => row.matchedProduct).length;
  const changedCount = rowsWithMatches.filter((row) => row.matchedProduct && Math.abs(row.delta || 0) > 0.001).length;
  const allMatchedSelected = matchedCount > 0 && rowsWithMatches.filter((row) => row.matchedProduct).every((row) => selectedRowKeys.includes(row.rowKey));
  const diagnostics = result?.diagnostics || null;

  return (
    <div className="space-y-4">
      <CredentialsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={runRequest}
        defaults={lastRequest}
      />

      <section className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Парсер постачальника Metro</h2>
            <p className="mt-1 text-sm text-slate-500">
              Завантажує ціни з Metro, показує збіги з локальним довідником і дозволяє масово оновити unit price.
            </p>
          </div>
          {result?.fetchedAt && (
            <div className="text-xs text-slate-500">
              Остання спроба: {formatDateTime(result.fetchedAt)}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? <RefreshCcw size={16} className="animate-spin" /> : <Search size={16} />}
            {loading ? "Завантаження..." : "Запустити Metro парсер"}
          </button>
          <button
            type="button"
            onClick={importSelected}
            disabled={importing || selectedRows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            <Download size={16} />
            {importing ? "Імпорт..." : `Імпортувати вибране (${selectedRows.length})`}
          </button>
          {lastRequest?.email || lastRequest?.manualMode ? (
            <span className="text-xs text-slate-500">
              Остання сесія: {lastRequest.manualMode ? "ручний вхід" : lastRequest.email}
            </span>
          ) : (
            <span className="text-xs text-slate-500">Логін і пароль вводяться у модальному вікні, не зберігаються.</span>
          )}
        </div>

        {!apiEnabled && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Custom API не налаштовано. Для Metro-парсера потрібен backend migration server.
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </div>
        )}

        {diagnostics && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div>Діагностика: {diagnostics.stage || "невідомо"}</div>
            {diagnostics.reason && <div>Причина: {diagnostics.reason}</div>}
          </div>
        )}
      </section>

      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="rounded-full bg-slate-100 px-2 py-1">Знайдено в Metro: {rowsWithMatches.length}</span>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Збігів у довіднику: {matchedCount}</span>
            <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">Змін цін: {changedCount}</span>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={allMatchedSelected}
              onChange={toggleSelectAllMatched}
            />
            Вибрати всі знайдені збіги
          </label>
        </div>

        {rowsWithMatches.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Натисніть «Запустити Metro парсер» — відкриється модальне вікно для введення облікових даних або вибору ручного входу.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Імпорт</th>
                  <th className="px-3 py-2 text-left font-semibold">Metro</th>
                  <th className="px-3 py-2 text-left font-semibold">Код</th>
                  <th className="px-3 py-2 text-left font-semibold">Ціна Metro</th>
                  <th className="px-3 py-2 text-left font-semibold">Локальний товар</th>
                  <th className="px-3 py-2 text-left font-semibold">Поточна ціна</th>
                  <th className="px-3 py-2 text-left font-semibold">Δ</th>
                </tr>
              </thead>
              <tbody>
                {rowsWithMatches.map((row) => {
                  const canImport = Boolean(row.matchedProduct);
                  return (
                    <tr key={row.rowKey} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedRowKeys.includes(row.rowKey)}
                          disabled={!canImport}
                          onChange={() => toggleRow(row.rowKey)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{row.name || "—"}</div>
                        <div className="text-xs text-slate-500">{row.unit || "—"}{row.packageText ? ` · ${row.packageText}` : ""}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{row.code1C || row.sku || "—"}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{formatMoney(row.nextPrice)}</td>
                      <td className="px-3 py-2">
                        {row.matchedProduct ? (
                          <>
                            <div className="font-medium text-slate-900">{row.matchedProduct.name || "—"}</div>
                            <div className="text-xs text-slate-500">{row.matchedProduct.code1C || "без коду"}</div>
                          </>
                        ) : (
                          <span className="text-xs text-rose-600">Не знайдено збіг у локальному довіднику</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {row.matchedProduct ? formatMoney(row.currentPrice) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {row.matchedProduct ? (
                          <span className={row.delta > 0 ? "text-rose-600" : row.delta < 0 ? "text-emerald-700" : "text-slate-500"}>
                            {row.delta > 0 ? "+" : ""}{formatMoney(row.delta || 0)}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {user?.role !== "admin" && (
          <p className="mt-3 text-xs text-slate-500">Для масового імпорту цін бажано використовувати акаунт із правом редагування продуктів.</p>
        )}
      </section>
    </div>
  );
}
