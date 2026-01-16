import React, { useEffect, useState } from 'react';
import { mockAssets } from '../data/mockAssets';
import { PieByCategory } from './PieByCategory';

const unique = (arr, key) => Array.from(new Set(arr.map(a => a[key]))).filter(Boolean);

const MainAssetsReport = () => {
  const [assets, setAssets] = useState([]);
  const [filters, setFilters] = useState({
    category: '',
    status: '',
    respPerson: '',
    locationName: '',
  });

  useEffect(() => {
    setAssets(mockAssets);
  }, []);

  const filtered = assets.filter(a =>
    (!filters.category || a.category === filters.category) &&
    (!filters.status || a.status === filters.status) &&
    (!filters.respPerson || a.respPerson === filters.respPerson) &&
    (!filters.locationName || a.locationName === filters.locationName)
  );

  return (
    <div style={{ color: '#fff' }}>
      <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Основний звіт по основних засобах</h2>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ background: '#232946', borderRadius: 12, padding: 16, minWidth: 180 }}>
          <div style={{ fontSize: 14, color: '#a5b4fc' }}>Всього активів</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{filtered.length}</div>
        </div>
        <div style={{ background: '#232946', borderRadius: 12, padding: 16, minWidth: 180 }}>
          <div style={{ fontSize: 14, color: '#a5b4fc' }}>Загальна залишкова вартість</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{filtered.reduce((s, a) => s + (a.residualValue || 0), 0).toLocaleString()} ₴</div>
        </div>
        <div style={{ flex: 1, minWidth: 320 }}>
          <PieByCategory data={filtered} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))} style={{ padding: 8, borderRadius: 8 }}>
          <option value="">Категорія: всі</option>
          {unique(assets, 'category').map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} style={{ padding: 8, borderRadius: 8 }}>
          <option value="">Статус: всі</option>
          {unique(assets, 'status').map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.respPerson} onChange={e => setFilters(f => ({ ...f, respPerson: e.target.value }))} style={{ padding: 8, borderRadius: 8 }}>
          <option value="">Відповідальний: всі</option>
          {unique(assets, 'respPerson').map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filters.locationName} onChange={e => setFilters(f => ({ ...f, locationName: e.target.value }))} style={{ padding: 8, borderRadius: 8 }}>
          <option value="">Локація: всі</option>
          {unique(assets, 'locationName').map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <div style={{ overflowX: 'auto', borderRadius: 12, background: '#181e2a' }}>
        <table style={{ width: '100%', color: '#fff', borderRadius: 8 }}>
          <thead>
            <tr>
              <th>Назва</th>
              <th>Інвентарний номер</th>
              <th>Відповідальний</th>
              <th>Локація</th>
              <th>Статус</th>
              <th>Категорія</th>
              <th>Серійний номер</th>
              <th>Рік придбання</th>
              <th>Залишкова вартість</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(asset => (
              <tr key={asset.id}>
                <td>{asset.name}</td>
                <td>{asset.invNumber}</td>
                <td>{asset.respPerson}</td>
                <td>{asset.locationName}</td>
                <td>{asset.status}</td>
                <td>{asset.category}</td>
                <td>{asset.serialNumber}</td>
                <td>{asset.purchaseYear}</td>
                <td>{asset.residualValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MainAssetsReport;
