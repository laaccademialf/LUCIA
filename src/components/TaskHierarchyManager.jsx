import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeftRight, Briefcase, Building2, GitBranch, GripVertical, Info, Shuffle, X, ZoomIn, ZoomOut } from "lucide-react";
import { getPositions } from "../firebase/rolesPositions";
import { createCollectionItemApi, deleteCollectionItemApi, isCollectionsApiEnabled, listCollectionItemsApi, updateCollectionItemApi } from "../api/collectionsApi";

const LOCAL_KEY = "lucia_task_hierarchy_rules";
const RELATION_TYPES = [
  { id: "vertical", label: "Вертикальна", hint: "Керівник → підлеглий (пряме підпорядкування)", color: "#3b82f6", badgeClass: "bg-blue-500", icon: ArrowDown },
  { id: "linear", label: "Лінійна", hint: "Керівник ↔ керівник (один рівень, спільна вертикаль)", color: "#6366f1", badgeClass: "bg-indigo-500", icon: ArrowLeftRight },
  { id: "cross", label: "Перекресна", hint: "Керівник одного департаменту → підлеглий іншого", color: "#f59e0b", badgeClass: "bg-amber-500", icon: Shuffle },
];
// Псевдовузол-корінь: дерево стартує порожнім, вузли з'являються лише коли їх перетягнули на "Компанію" або на інший вузол дерева.
const ROOT_TYPE = "root";
const ROOT_ID = "company";
const ROOT_KEY = `${ROOT_TYPE}:${ROOT_ID}`;
const COMPANY_NODE = { type: ROOT_TYPE, id: ROOT_ID, name: "Компанія" };
const ROOT_RELATION_TYPE = { id: "root", label: "Топ-рівень", hint: "Підпорядковується напряму компанії", color: "#94a3b8", badgeClass: "bg-slate-400", icon: Building2 };
const relationMeta = (relationType) =>
  RELATION_TYPES.find((item) => item.id === relationType) || (relationType === "root" ? ROOT_RELATION_TYPE : RELATION_TYPES[0]);
const readLocalRules = () => {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};
const nodeKey = (type, id) => `${type}:${id}`;

function NodeBox({ node, isVirtualRoot = false, draggable = false, droppable = false, onConnect }) {
  const [isOver, setIsOver] = useState(false);
  const key = nodeKey(node.type, node.id);
  const handleDragStart = (event) => {
    if (!draggable) return;
    event.dataTransfer.setData("text/plain", key);
    event.dataTransfer.effectAllowed = "link";
  };
  const handleDragOver = (event) => {
    if (!droppable) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "link";
  };
  const handleDrop = (event) => {
    if (!droppable) return;
    event.preventDefault();
    setIsOver(false);
    const draggedKey = event.dataTransfer.getData("text/plain");
    if (draggedKey) onConnect?.(draggedKey, key);
  };
  const sharedProps = {
    draggable,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDragEnter: (event) => { if (droppable) { event.preventDefault(); setIsOver(true); } },
    onDragLeave: () => setIsOver(false),
    onDrop: handleDrop,
  };
  if (isVirtualRoot) {
    return (
      <div
        {...sharedProps}
        className={`inline-flex items-center gap-2 rounded-xl border-2 bg-slate-800 px-4 py-2.5 shadow-md transition ${
          isOver ? "border-indigo-400 ring-4 ring-indigo-300" : "border-slate-700"
        }`}
      >
        <Building2 size={16} className="text-white" />
        <span className="text-sm font-bold text-white">{node.name}</span>
      </div>
    );
  }
  const isPosition = node.type === "position";
  return (
    <div
      {...sharedProps}
      className={`inline-flex items-center gap-2 rounded-xl border-2 bg-white px-3.5 py-2 shadow-sm transition border-indigo-200 ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${isOver ? "border-indigo-500 ring-4 ring-indigo-200" : ""}`}
    >
      {draggable && <GripVertical size={13} className="shrink-0 text-slate-300" />}
      {isPosition && <Briefcase size={15} className="shrink-0 text-indigo-500" />}
      <div className="text-left">
        <p className="text-sm font-bold leading-tight text-slate-800">{node.name}</p>
        <p className="text-[10px] font-semibold uppercase leading-tight text-slate-400">Посада</p>
      </div>
    </div>
  );
}

function EdgeBadge({ rule, onDelete }) {
  const meta = relationMeta(rule.relationType);
  const Icon = meta.icon;
  return (
    <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white ${meta.badgeClass}`} title={meta.hint}>
      {Icon && <Icon size={11} />}
      <button
        type="button"
        onClick={() => onDelete(rule)}
        className="rounded-full p-0.5 text-white/80 hover:bg-black/20 hover:text-white"
        title="Видалити зв'язок"
        aria-label="Видалити зв'язок"
      >
        <X size={10} />
      </button>
    </div>
  );
}

function OrgChart({ rules, byKey, onDeleteRule, onConnect }) {
  const childrenBySource = useMemo(
    () =>
      rules.reduce((map, rule) => {
        const key = nodeKey(rule.sourceType, rule.sourceId);
        map.set(key, [...(map.get(key) || []), rule]);
        return map;
      }, new Map()),
    [rules],
  );

  const renderChildBranches = (parentKey, path) => {
    const branches = path.has(parentKey) ? [] : childrenBySource.get(parentKey) || [];
    if (!branches.length) return null;
    // Якщо в батька лише одна дитина, CSS ховає її власний конектор і колір бере контейнер —
    // тож дублюємо колір першої гілки сюди, інакше єдина дитина завжди мала б сіру лінію.
    const stemColor = relationMeta(branches[0].relationType).color;
    return (
      <ul style={{ "--org-line-color": stemColor }}>
        {branches.map((rule) => {
          const child = byKey.get(nodeKey(rule.targetType, rule.targetId));
          if (!child) return null;
          const childKey = nodeKey(child.type, child.id);
          const nextPath = new Set(path).add(parentKey);
          const lineColor = relationMeta(rule.relationType).color;
          return (
            <li key={rule.id} style={{ "--org-line-color": lineColor }}>
              <div className="org-node-wrap">
                <EdgeBadge rule={rule} onDelete={onDeleteRule} />
                <NodeBox node={child} draggable droppable onConnect={onConnect} />
              </div>
              {renderChildBranches(childKey, nextPath)}
            </li>
          );
        })}
      </ul>
    );
  };

  // Дерево завжди починається з порожньої "Компанії" — вузли з'являються тільки після перетягування.
  return (
    <div className="org-tree">
      <ul>
        <li>
          <div className="org-node-wrap">
            <NodeBox node={COMPANY_NODE} isVirtualRoot droppable onConnect={onConnect} />
          </div>
          {renderChildBranches(ROOT_KEY, new Set())}
        </li>
      </ul>
    </div>
  );
}


// Обчислює масштаб "вписати по ширині" й дозволяє додатково зумити колесом/кнопками, як лупою.
function ZoomableTree({ children }) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const clampZoom = (value) => Math.max(0.4, Math.min(2.5, Math.round(value * 20) / 20));

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return undefined;
    const recompute = () => {
      const availableWidth = container.clientWidth;
      const naturalWidth = content.scrollWidth;
      const nextFitScale = availableWidth > 0 && naturalWidth > availableWidth ? availableWidth / naturalWidth : 1;
      setFitScale(Math.max(0.15, Math.min(1, nextFitScale)));
    };
    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [children]);

  const handleWheelZoom = (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    setZoom((current) => clampZoom(current + (event.deltaY > 0 ? -0.1 : 0.1)));
  };

  const effectiveScale = fitScale * zoom;

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-1">
        <button type="button" onClick={() => setZoom((current) => clampZoom(current - 0.15))} title="Зменшити масштаб" className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50">
          <ZoomOut size={16} />
        </button>
        <button type="button" onClick={() => setZoom(1)} title="Скинути до вписаного масштабу" className="min-w-[3.5rem] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" onClick={() => setZoom((current) => clampZoom(current + 0.15))} title="Збільшити масштаб" className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50">
          <ZoomIn size={16} />
        </button>
      </div>
      <div ref={containerRef} onWheel={handleWheelZoom} className="flex max-h-[70vh] w-full justify-center overflow-auto rounded-lg border border-slate-100">
        <div ref={contentRef} className="inline-block" style={{ transform: `scale(${effectiveScale})`, transformOrigin: "top center" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function TaskHierarchyManager() {
  const [positions, setPositions] = useState([]);
  const [rules, setRules] = useState([]);
  const [activeRelationType, setActiveRelationType] = useState("vertical");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [syncWarning, setSyncWarning] = useState("");
  // Ієрархія будується виключно за посадами — ролі сюди не потрапляють.
  const nodes = useMemo(() => positions.map((item) => ({ ...item, type: "position" })), [positions]);
  const byKey = useMemo(() => new Map(nodes.map((node) => [nodeKey(node.type, node.id), node])), [nodes]);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [positionItems, remoteRules] = await Promise.all([getPositions(), isCollectionsApiEnabled() ? listCollectionItemsApi("taskHierarchyRules") : Promise.resolve(readLocalRules())]);
      setPositions(Array.isArray(positionItems) ? positionItems : []);
      setRules(Array.isArray(remoteRules) ? remoteRules : []);
    } catch (loadError) {
      console.error("Помилка завантаження ієрархії задач:", loadError);
      setError("Не вдалося завантажити ієрархію задач");
      setRules(readLocalRules());
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  // Ключ керівника (батька) для вузла — перше знайдене ребро, де вузол є ціллю.
  const findParentKeyOf = (key) => {
    const parentRule = rules.find((rule) => nodeKey(rule.targetType, rule.targetId) === key);
    return parentRule ? nodeKey(parentRule.sourceType, parentRule.sourceId) : ROOT_KEY;
  };
  const updateRuleType = async (rule, relationType) => {
    setSaving(true);
    setError("");
    setSyncWarning("");
    try {
      if (isCollectionsApiEnabled()) await updateCollectionItemApi("taskHierarchyRules", rule.id, { relationType });
    } catch (apiError) {
      console.warn("Не вдалося синхронізувати тип зв'язку з сервером:", apiError);
      setSyncWarning("Зміну збережено локально. Синхронізація з сервером не вдалася.");
    } finally {
      const next = rules.map((item) => (item.id === rule.id ? { ...item, relationType } : item));
      setRules(next);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
      setSaving(false);
    }
  };
  // managerKey стає джерелом (sourceType/sourceId), subordinateKey — ціллю зв'язку
  const createRule = async (managerKey, subordinateKey, relationType) => {
    const [sourceType, sourceId] = String(managerKey || "").split(":");
    const [targetType, targetId] = String(subordinateKey || "").split(":");
    if (!sourceType || !sourceId || !targetType || !targetId || managerKey === subordinateKey) return;
    const existing = rules.find((rule) => nodeKey(rule.sourceType, rule.sourceId) === managerKey && nodeKey(rule.targetType, rule.targetId) === subordinateKey);
    if (existing) {
      if (existing.relationType !== relationType) await updateRuleType(existing, relationType);
      return;
    }
    const reachesSource = (currentKey, visited = new Set()) => {
      if (currentKey === managerKey) return true;
      if (visited.has(currentKey)) return false;
      visited.add(currentKey);
      return rules
        .filter((rule) => nodeKey(rule.sourceType, rule.sourceId) === currentKey)
        .some((rule) => reachesSource(nodeKey(rule.targetType, rule.targetId), visited));
    };
    if (reachesSource(subordinateKey)) {
      setError("Не можна створити циклічний зв'язок");
      return;
    }
    const rule = { id: `hierarchy_${Date.now()}`, sourceType, sourceId, targetType, targetId, relationType, createdAt: new Date().toISOString() };
    setSaving(true);
    setError("");
    setSyncWarning("");
    // Зв'язок завжди лишається в UI/localStorage, навіть якщо синхронізація з сервером не вдалась —
    // конструктор не має блокуватись через тимчасову недоступність/невідому колекцію на бекенді.
    try {
      if (isCollectionsApiEnabled()) rule.id = await createCollectionItemApi("taskHierarchyRules", rule) || rule.id;
    } catch (apiError) {
      console.warn("Не вдалося синхронізувати зв'язок ієрархії з сервером:", apiError);
      setSyncWarning("Зв'язок збережено локально. Синхронізація з сервером не вдалася — можливо, бекенд ще не оновлено.");
    } finally {
      const next = [...rules, rule];
      setRules(next);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
      setSaving(false);
    }
  };
  const handleConnect = (draggedKey, dropTargetKey) => {
    if (saving || !draggedKey || draggedKey === dropTargetKey) return;
    if (dropTargetKey === ROOT_KEY) {
      createRule(ROOT_KEY, draggedKey, "root");
      return;
    }
    if (activeRelationType === "linear") {
      // "Лінійна" — зв'язок між керівниками одного рівня: перетягнутий вузол стає ще однією
      // гілкою від батька того вузла, на який його кинули, а не його прямим підлеглим.
      createRule(findParentKeyOf(dropTargetKey), draggedKey, "linear");
      return;
    }
    createRule(dropTargetKey, draggedKey, activeRelationType);
  };
  const deleteRule = async (rule) => {
    setSyncWarning("");
    try {
      if (isCollectionsApiEnabled()) await deleteCollectionItemApi("taskHierarchyRules", rule.id);
    } catch (apiError) {
      console.warn("Не вдалося видалити зв'язок ієрархії на сервері:", apiError);
      setSyncWarning("Видалено локально. Синхронізація з сервером не вдалася.");
    } finally {
      const next = rules.filter((item) => item.id !== rule.id);
      setRules(next);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    }
  };
  if (loading) return <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-500">Завантаження ієрархії...</div>;
  return <div className="space-y-5">
    {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
    {syncWarning && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-700">{syncWarning}</p>}
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3"><GitBranch className="text-indigo-600" size={22} /><div><h2 className="text-lg font-bold text-slate-900">Конструктор ієрархії постановки задач</h2><p className="text-sm text-slate-500">Оберіть тип зв'язку, потім перетягніть посаду на того, хто буде для неї керівником (вертикальна), на однорівневого керівника (лінійна) або на керівника іншого департаменту (перекресна).</p></div></div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase text-slate-500">Тип зв'язку:</span>
        {RELATION_TYPES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveRelationType(item.id)}
            title={item.hint}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
              activeRelationType === item.id ? `${item.badgeClass} text-white shadow` : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <item.icon size={13} />
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-lg bg-indigo-50 p-3 text-xs font-semibold text-indigo-700">
        <Info size={15} className="mt-0.5 shrink-0" />
        Перетягніть картку посади з палітри нижче (або прямо в дереві) і відпустіть на потрібному вузлі — з'явиться стрілка обраного типу та кольору.
      </div>
      <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-bold uppercase text-slate-500">Палітра посад</p>
        <div className="flex flex-wrap gap-2">
          {nodes.map((node) => <NodeBox key={nodeKey(node.type, node.id)} node={node} draggable />)}
          {!nodes.length && <p className="text-sm text-slate-500">Спочатку додайте посади у вкладці «Права доступу».</p>}
        </div>
      </div>
    </div>
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-slate-900">Ієрархічне дерево</h3>
        <div className="flex flex-wrap items-center gap-3">
          {RELATION_TYPES.map((item) => (
            <span key={item.id} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
          <span className="text-sm text-slate-400">· {nodes.length} вузлів · {rules.length} зв'язків</span>
        </div>
      </div>
      {nodes.length ? (
        <ZoomableTree>
          <OrgChart rules={rules} byKey={byKey} onDeleteRule={deleteRule} onConnect={handleConnect} />
        </ZoomableTree>
      ) : (
        <p className="text-sm text-slate-500">Спочатку додайте посади у вкладці «Права доступу».</p>
      )}
    </div>
  </div>;
}