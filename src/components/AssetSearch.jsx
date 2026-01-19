import React, { useState } from "react";
import QRScanner from "./QRScanner";

export default function AssetSearch({ assets, user, restaurants, onEdit }) {
  const [input, setInput] = useState("");
  const [found, setFound] = useState(null);
  const [error, setError] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [highlighted, setHighlighted] = useState(-1);

  const handleSearch = (customInput) => {
    setError("");
    const value = typeof customInput === 'string' ? customInput : input;
    if (!value.trim()) {
      setError("Введіть інвентарний номер або назву активу");
      setFound(null);
      return;
    }
    // Пошук точного збігу по номеру або QR
    const asset = assets.find(
      (a) => a.invNumber === value.trim() || a.qrCode === value.trim()
    );
    if (asset) {
      setFound(asset);
      setError("");
      setSuggestions([]);
    } else {
      setFound(null);
      setError("Актив не знайдено");
    }
  };

  // Автопідказки по номеру або назві
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    setError("");
    setFound(null);
    if (!val.trim()) {
      setSuggestions([]);
      return;
    }
    const lower = val.trim().toLowerCase();
    const matches = assets.filter(a =>
      a.invNumber?.toLowerCase().includes(lower) ||
      a.name?.toLowerCase().includes(lower)
    ).slice(0, 10);
    setSuggestions(matches);
    setHighlighted(-1);
  };

  // Форматований вивід інформації про актив у 3 стовпчики
  const renderAssetInfo = (asset) => {
    if (!asset) return null;
    return (
      <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div><span className="font-semibold">Інвентарний №:</span> {asset.invNumber}</div>
            <div><span className="font-semibold">Назва:</span> {asset.name}</div>
            <div><span className="font-semibold">Категорія:</span> {asset.category}</div>
            <div><span className="font-semibold">Підкатегорія:</span> {asset.subCategory}</div>
            <div><span className="font-semibold">Тип:</span> {asset.type}</div>
            <div><span className="font-semibold">Серійний №:</span> {asset.serialNumber}</div>
            <div><span className="font-semibold">Бренд:</span> {asset.brand}</div>
            <div><span className="font-semibold">Бізнес-напрям:</span> {asset.businessUnit}</div>
            <div><span className="font-semibold">Розташування:</span> {asset.locationName}</div>
            <div><span className="font-semibold">Зона:</span> {asset.zone}</div>
          </div>
          <div className="space-y-2">
            <div><span className="font-semibold">Відповідальний центр:</span> {asset.respCenter}</div>
            <div><span className="font-semibold">Відповідальний:</span> {asset.respPerson}</div>
            <div><span className="font-semibold">Статус:</span> {asset.status}</div>
            <div><span className="font-semibold">Стан:</span> {asset.condition}</div>
            <div><span className="font-semibold">Функціональність:</span> {asset.functionality}</div>
            <div><span className="font-semibold">Актуальність:</span> {asset.relevance}</div>
            <div><span className="font-semibold">Рік придбання:</span> {asset.purchaseYear}</div>
            <div><span className="font-semibold">Дата введення:</span> {asset.commissionDate}</div>
            <div><span className="font-semibold">Нормативний термін:</span> {asset.normativeTerm}</div>
            <div><span className="font-semibold">Знос фізичний:</span> {asset.physicalWear}%</div>
            <div><span className="font-semibold">Знос моральний:</span> {asset.moralWear}%</div>
            <div><span className="font-semibold">Знос загальний:</span> {asset.totalWear}%</div>
          </div>
          <div className="space-y-2">
            <div><span className="font-semibold">Вартість (початкова):</span> {asset.initialCost}</div>
            <div><span className="font-semibold">Ринкова (нова):</span> {asset.marketValueNew}</div>
            <div><span className="font-semibold">Ринкова (б/в):</span> {asset.marketValueUsed}</div>
            <div><span className="font-semibold">Залишкова вартість:</span> {asset.residualValue}</div>
            <div><span className="font-semibold">Рішення:</span> {asset.decision}</div>
            <div><span className="font-semibold">Причина:</span> {asset.reason}</div>
            <div><span className="font-semibold">Нова локація:</span> {asset.newLocation}</div>
            <div><span className="font-semibold">Дата аудиту:</span> {asset.auditDate}</div>
            <div><span className="font-semibold">Аудитори:</span> {asset.auditors}</div>
            <div><span className="font-semibold">Коментар:</span> {asset.comment}</div>
          </div>
        </div>
      </div>
    );
  };

  // Визначаємо, чи може користувач редагувати знайдений актив
  let canEdit = false;
  if (user && found) {
    if (user.role === 'admin') {
      canEdit = true;
    } else if (user.restaurant && restaurants && restaurants.length > 0) {
      // Знаходимо ресторан користувача
      const userRest = restaurants.find(r => r.id === user.restaurant);
      // Дозволяємо редагування, якщо назва ресторану співпадає з locationName активу
      if (userRest && found.locationName === userRest.name) {
        canEdit = true;
      }
    }
  }
  return (
    <div className="w-full flex flex-col gap-3">
      <div className="card p-4 bg-white border border-slate-200 text-slate-900 shadow-xl w-full">
        <div className="flex flex-row items-center gap-2 mb-2">
          <label className="text-base font-semibold whitespace-nowrap mr-2" htmlFor="asset-search-input">Пошук активу:</label>
          <input
            id="asset-search-input"
            className="border rounded px-3 py-1.5 text-sm flex-1 w-full"
            placeholder="Введіть інвентарний номер або назву активу"
            value={input}
            onChange={handleInputChange}
            onKeyDown={e => {
              if (suggestions.length > 0) {
                if (e.key === 'ArrowDown') {
                  setHighlighted(h => Math.min(h + 1, suggestions.length - 1));
                } else if (e.key === 'ArrowUp') {
                  setHighlighted(h => Math.max(h - 1, 0));
                } else if (e.key === 'Enter' && highlighted >= 0) {
                  setFound(suggestions[highlighted]);
                  setInput(suggestions[highlighted].invNumber);
                  setSuggestions([]);
                  setError("");
                  e.preventDefault();
                }
              }
              if (e.key === 'Enter' && highlighted === -1) {
                handleSearch();
              }
            }}
            autoFocus
          />
          <button
            className="bg-indigo-600 text-white rounded px-3 py-1.5 font-semibold hover:bg-indigo-500 whitespace-nowrap"
            onClick={() => handleSearch()}
          >
            Знайти
          </button>
          <button
            className="bg-slate-200 text-slate-800 rounded px-3 py-1.5 font-semibold hover:bg-slate-300 whitespace-nowrap"
            type="button"
            onClick={() => {
              setError("");
              setShowScanner((v) => !v);
            }}
          >
            {showScanner ? "Сховати камеру" : "Сканувати QR"}
          </button>
        </div>
        <div className="relative">
          {suggestions.length > 0 && (
            <ul className="absolute z-10 top-full left-0 right-0 bg-white border border-slate-200 rounded shadow max-h-60 overflow-auto mt-1">
              {suggestions.map((a, i) => (
                <li
                  key={a.invNumber}
                  className={`px-3 py-2 cursor-pointer hover:bg-indigo-100 ${i === highlighted ? 'bg-indigo-50' : ''}`}
                  onMouseDown={() => {
                    setFound(a);
                    setInput(a.invNumber);
                    setSuggestions([]);
                    setError("");
                  }}
                >
                  <span className="font-semibold">{a.invNumber}</span> — {a.name}
                </li>
              ))}
            </ul>
          )}
          {showScanner && (
            <div className="mt-2">
              <QRScanner
                onResult={(code) => {
                  if (!code) return;
                  setInput(code);
                  setTimeout(() => {
                    handleSearch(code);
                    setShowScanner(false);
                  }, 100);
                }}
                onError={(err) => setError("Помилка сканування: " + err.message)}
              />
            </div>
          )}
        </div>
        {error && <div className="text-red-600 mt-2 mb-0.5">{error}</div>}
      </div>
      <div className="w-full">
        {found && (
          <div className="card p-4 bg-white border border-slate-200 text-slate-900 shadow-xl w-full mt-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Інформація про актив</h3>
              {onEdit && canEdit && (
                <button
                  className="bg-emerald-600 text-white rounded px-4 py-1.5 font-semibold hover:bg-emerald-500 text-sm"
                  onClick={() => onEdit(found)}
                >
                  Редагувати
                </button>
              )}
            </div>
            {renderAssetInfo(found)}
            {onEdit && !canEdit && (
              <div className="mt-2 text-rose-600 text-sm font-semibold">Редагування доступне лише для активів вашого ресторану</div>
            )}
          </div>
        )}
        {!found && error && (
          <div className="card p-4 bg-white border border-rose-200 text-rose-700 shadow-xl w-full flex items-center justify-center min-h-[100px] mt-2">
            <span className="font-semibold">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
