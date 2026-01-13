import React, { useState } from "react";
import QRScanner from "./QRScanner";

// Можна замінити на @zxing/browser або html5-qrcode для сканування QR-кодів
// Для початку реалізуємо простий інтерфейс з ручним вводом і місцем для сканера

export default function AssetSearch({ assets }) {
  const [input, setInput] = useState("");
  const [found, setFound] = useState(null);
  const [error, setError] = useState("");
  const [showScanner, setShowScanner] = useState(false);

  const handleSearch = () => {
    setError("");
    setFound(null);
    if (!input.trim()) {
      setError("Введіть інвентарний номер або QR-код");
      return;
    }
    const asset = assets.find(
      (a) => a.invNumber === input.trim() || a.qrCode === input.trim()
    );
    if (asset) {
      setFound(asset);
    } else {
      setError("Актив не знайдено");
    }
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

  return (
    <div className="flex flex-col md:flex-row gap-8 w-full justify-center">
      {/* Ліва колонка — пошук */}
      <div className="card p-6 bg-white border border-slate-200 text-slate-900 shadow-xl w-full" style={{ maxWidth: 340, minWidth: 280 }}>
        <h2 className="text-xl font-semibold mb-4">Пошук активу</h2>
        <div className="flex flex-col gap-3 mb-4">
          <input
            className="border rounded px-3 py-2 text-sm"
            placeholder="Введіть інвентарний номер або QR-код"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="bg-indigo-600 text-white rounded px-4 py-2 font-semibold hover:bg-indigo-500"
              onClick={handleSearch}
            >
              Знайти
            </button>
            <button
              className="bg-slate-200 text-slate-800 rounded px-4 py-2 font-semibold hover:bg-slate-300"
              type="button"
              onClick={() => {
                setError("");
                setShowScanner((v) => !v);
              }}
            >
              {showScanner ? "Сховати камеру" : "Сканувати QR"}
            </button>
          </div>
          {showScanner && (
            <div className="mt-2">
              <QRScanner
                onResult={(code) => {
                  setInput(code);
                  setTimeout(() => {
                    handleSearch();
                    setShowScanner(false);
                  }, 100);
                }}
                onError={(err) => setError("Помилка сканування: " + err.message)}
              />
            </div>
          )}
        </div>
        {error && <div className="text-red-600 mb-2">{error}</div>}
      </div>
      {/* Права колонка — інформація */}
      <div className="flex-1">
        {found && (
          <div className="card p-6 bg-white border border-slate-200 text-slate-900 shadow-xl w-full">
            <h3 className="text-lg font-semibold mb-4">Інформація про актив</h3>
            {renderAssetInfo(found)}
          </div>
        )}
      </div>
    </div>
  );
}
