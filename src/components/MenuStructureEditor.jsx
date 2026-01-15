import React, { useState, useEffect } from "react";

// Повна стандартна структура меню (відповідає навігації App.jsx)
const initialMenuStructure = [
  {
    id: "dashboard",
    label: "Дашборд",
    children: [
      { id: "dashboard-ops", label: "Операційний огляд", tabs: [], tabLabels: [] }
    ]
  },
  {
    id: "settings",
    label: "Налаштування",
    children: [
      {
        id: "settings-restaurant",
        label: "Ресторани",
        tabs: ["main", "schedule", "projects"],
        tabLabels: [
          { id: "main", label: "Головні" },
          { id: "schedule", label: "Графік роботи" },
          { id: "projects", label: "Управління проєктами" }
        ]
      },
      {
        id: "settings-accounts",
        label: "Облікові записи",
        tabs: ["add", "edit"],
        tabLabels: [
          { id: "add", label: "Додати" },
          { id: "edit", label: "Редагувати" }
        ]
      },
      {
        id: "settings-permissions",
        label: "Права доступу",
        tabs: ["roles", "permissions"],
        tabLabels: [
          { id: "roles", label: "Ролі та Посади" },
          { id: "permissions", label: "Доступи ролей" }
        ]
      }
    ]
  },
  {
    id: "operations",
    label: "Операції",
    children: [
      { id: "ops-checklists", label: "Чек-листи", tabs: [], tabLabels: [] },
      { id: "ops-haccp", label: "HACCP журнали", tabs: [], tabLabels: [] },
      { id: "ops-maintenance", label: "Сервісні заявки", tabs: [], tabLabels: [] }
    ]
  },
  {
    id: "inventory",
    label: "Облік",
    children: [
      { id: "inventory-products", label: "Продукти", tabs: [], tabLabels: [] },
      { id: "inventory-utilities", label: "Утиліти", tabs: [], tabLabels: [] },
      {
        id: "inventory-assets",
        label: "Основні засоби",
        tabs: ["search", "test1", "test2", "test3", "test4", "responsibility"],
        tabLabels: [
          { id: "search", label: "Пошук" },
          { id: "test1", label: "Додати" },
          { id: "test2", label: "Редагувати" },
          { id: "test3", label: "Типові поля" },
          { id: "test4", label: "Права редагування" },
          { id: "responsibility", label: "Матеріальна відповідальність" }
        ]
      }
    ]
  },
  {
    id: "reports",
    label: "Звіти",
    children: [
      { id: "reports-products", label: "Інвентаризація продуктів", tabs: [], tabLabels: [] },
      { id: "reports-assets", label: "Основні засоби", tabs: [], tabLabels: [] }
    ]
  },
  {
    id: "security",
    label: "Безпека",
    children: [
      { id: "security-audit", label: "Аудит дій", tabs: [], tabLabels: [] }
    ]
  },
  {
    id: "team",
    label: "Команда",
    children: [
      { id: "team-roles", label: "Ролі та доступи", tabs: [], tabLabels: [] }
    ]
  },
  {
    id: "maintenance",
    label: "Сервіс",
    children: [
      { id: "maintenance-plan", label: "Планові роботи", tabs: [], tabLabels: [] },
      { id: "menu-admin", label: "Управління меню", tabs: [], tabLabels: [] }
    ]
  }
];

function MenuStructureEditor({ menuStructure, saveMenuStructure, loading, error }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(menuStructure)));
  useEffect(() => { setDraft(JSON.parse(JSON.stringify(menuStructure))); }, [menuStructure]);

  const deleteSection = (sectionIdx) => {
    if (window.confirm('Видалити розділ?')) {
      setDraft(draft.filter((_, i) => i !== sectionIdx));
    }
  };
  const deleteChild = (sectionIdx, childIdx) => {
    if (window.confirm('Видалити підрозділ?')) {
      setDraft(draft.map((s, i) => i === sectionIdx ? { ...s, children: s.children.filter((_, j) => j !== childIdx) } : s));
    }
  };
  const deleteTab = (sectionIdx, childIdx, tabIdx) => {
    if (window.confirm('Видалити вкладку?')) {
      setDraft(draft.map((s, i) => i === sectionIdx ? {
        ...s,
        children: s.children.map((c, j) => j === childIdx ? {
          ...c,
          tabs: c.tabs.filter((_, k) => k !== tabIdx),
          tabLabels: c.tabLabels.filter((_, k) => k !== tabIdx)
        } : c)
      } : s));
    }
  };

  // Переміщення розділів
  const moveSection = (from, to) => {
    if (to < 0 || to >= draft.length) return;
    const updated = [...draft];
    const [item] = updated.splice(from, 1);
    updated.splice(to, 0, item);
    setDraft(updated);
  };
  // Переміщення підрозділів
  const moveChild = (sectionIdx, from, to) => {
    const children = draft[sectionIdx].children;
    if (to < 0 || to >= children.length) return;
    const updatedChildren = [...children];
    const [item] = updatedChildren.splice(from, 1);
    updatedChildren.splice(to, 0, item);
    setDraft(draft.map((s, i) => i === sectionIdx ? { ...s, children: updatedChildren } : s));
  };
  // Переміщення вкладок
  const moveTab = (sectionIdx, childIdx, from, to) => {
    const child = draft[sectionIdx].children[childIdx];
    if (to < 0 || to >= child.tabLabels.length) return;
    const updatedTabs = [...child.tabs];
    const updatedTabLabels = [...child.tabLabels];
    const [tabId] = updatedTabs.splice(from, 1);
    const [tabLabel] = updatedTabLabels.splice(from, 1);
    updatedTabs.splice(to, 0, tabId);
    updatedTabLabels.splice(to, 0, tabLabel);
    setDraft(draft.map((s, i) => i === sectionIdx ? {
      ...s,
      children: s.children.map((c, j) => j === childIdx ? {
        ...c,
        tabs: updatedTabs,
        tabLabels: updatedTabLabels
      } : c)
    } : s));
  };

  const addSection = () => {
    const id = prompt("ID розділу (латиницею, без пробілів):");
    if (!id) return;
    const label = prompt("Назва розділу:");
    if (!label) return;
    setDraft([...draft, { id, label, children: [] }]);
  };
  const addChild = (sectionIdx) => {
    const id = prompt("ID підрозділу (латиницею, без пробілів):");
    if (!id) return;
    const label = prompt("Назва підрозділу:");
    if (!label) return;
    setDraft(draft.map((s, i) => i === sectionIdx ? { ...s, children: [...s.children, { id, label, tabs: [], tabLabels: [] }] } : s));
  };
  const addTab = (sectionIdx, childIdx) => {
    const id = prompt("ID вкладки (латиницею, без пробілів):");
    if (!id) return;
    const label = prompt("Назва вкладки:");
    if (!label) return;
    setDraft(draft.map((s, i) => i === sectionIdx ? {
      ...s,
      children: s.children.map((c, j) => j === childIdx ? {
        ...c,
        tabs: [...(c.tabs || []), id],
        tabLabels: [...(c.tabLabels || []), { id, label }]
      } : c)
    } : s));
  };
  const handleSave = () => {
    console.log("Спроба зберегти структуру меню:", draft);
    saveMenuStructure(draft);
  };
  const handleInitStandard = () => saveMenuStructure(initialMenuStructure);

  return (
    <div className="card p-6 bg-white border border-slate-200 shadow-xl">
      <h2 className="text-xl font-bold mb-4">Управління структурою меню</h2>
      {/* Кнопка заливки стандартної структури видалена */}
      <button className="mb-4 px-4 py-2 rounded bg-emerald-600 text-white font-semibold" onClick={addSection}>Додати розділ</button>
      {draft.map((section, i) => (
        <div key={section.id} className="mb-4 border rounded p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-bold text-lg">{section.label} <span className="text-xs text-slate-400">({section.id})</span></span>
            <button className="ml-1 px-2 py-1 rounded bg-slate-300 text-slate-700 text-xs" onClick={() => moveSection(i, i-1)} disabled={i===0}>↑</button>
            <button className="ml-1 px-2 py-1 rounded bg-slate-300 text-slate-700 text-xs" onClick={() => moveSection(i, i+1)} disabled={i===draft.length-1}>↓</button>
            <button className="ml-2 px-2 py-1 rounded bg-red-600 text-white text-xs" onClick={() => deleteSection(i)}>Видалити</button>
          </div>
          <button className="mb-2 px-3 py-1 rounded bg-blue-600 text-white text-xs" onClick={() => addChild(i)}>Додати підрозділ</button>
          {section.children.map((child, j) => (
            <div key={child.id} className="ml-4 mb-2 border-l-2 pl-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{child.label} <span className="text-xs text-slate-400">({child.id})</span></span>
                <button className="ml-1 px-2 py-0.5 rounded bg-slate-300 text-slate-700 text-xs" onClick={() => moveChild(i, j, j-1)} disabled={j===0}>↑</button>
                <button className="ml-1 px-2 py-0.5 rounded bg-slate-300 text-slate-700 text-xs" onClick={() => moveChild(i, j, j+1)} disabled={j===section.children.length-1}>↓</button>
                <button className="ml-2 px-2 py-0.5 rounded bg-red-500 text-white text-xs" onClick={() => deleteChild(i, j)}>Видалити</button>
              </div>
              <button className="mb-1 px-2 py-0.5 rounded bg-indigo-600 text-white text-xs" onClick={() => addTab(i, j)}>Додати вкладку</button>
              <div className="ml-4 text-xs text-slate-700 flex flex-wrap gap-1">
                {child.tabLabels && child.tabLabels.map((tab, k) => (
                  <span key={tab.id} className="inline-flex items-center bg-slate-200 rounded px-2 py-0.5 mr-1 mb-1">
                    {tab.label} <span className="text-slate-400">({tab.id})</span>
                    <button className="ml-1 px-1 rounded bg-slate-300 text-slate-700 text-xs" onClick={() => moveTab(i, j, k, k-1)} disabled={k===0}>↑</button>
                    <button className="ml-1 px-1 rounded bg-slate-300 text-slate-700 text-xs" onClick={() => moveTab(i, j, k, k+1)} disabled={k===child.tabLabels.length-1}>↓</button>
                    <button className="ml-1 px-1 rounded bg-red-400 text-white text-xs" onClick={() => deleteTab(i, j, k)} title="Видалити вкладку">×</button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
      <button className="mt-4 px-6 py-2 rounded bg-indigo-600 text-white font-bold" onClick={handleSave} disabled={loading}>Зберегти структуру меню</button>
      {error && <div className="mt-2 text-red-600 font-semibold">{error}</div>}
      <pre className="bg-slate-100 p-3 rounded text-xs overflow-x-auto max-h-96 mt-4">{JSON.stringify(draft, null, 2)}</pre>
    </div>
  );
}

export default MenuStructureEditor;