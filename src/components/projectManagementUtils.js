import { isGlobalAdminUser } from "../utils/booking/access";

export const PAGINATION_OPTIONS = [10, 15, 20, 25];

export const displayName = (user) =>
  String(
    user?.displayName ||
      user?.name ||
      user?.fullName ||
      user?.email ||
      "Без імені",
  ).trim();

export const idOf = (user) =>
  String(user?.id || user?.uid || user?.userId || user?.email || "").trim();

export const getUserTaskScope = (tasks = [], user) => {
  const visibleIds = new Set();
  const userId = idOf(user);
  const userName = displayName(user);
  const taskMap = new Map(tasks.map((task) => [String(task.id), task]));

  const addAncestors = (taskId) => {
    let currentId = String(taskId || "");
    while (currentId) {
      visibleIds.add(currentId);
      const parent = taskMap.get(currentId)?.parentTaskId;
      currentId = parent ? String(parent) : "";
    }
  };

  const addDescendants = (taskId) => {
    const taskIdString = String(taskId || "");
    if (!taskIdString) return;
    const children = tasks.filter((task) => String(task.parentTaskId || "") === taskIdString);
    children.forEach((child) => {
      const childId = String(child.id);
      if (!visibleIds.has(childId)) {
        visibleIds.add(childId);
      }
      addDescendants(childId);
    });
  };

  tasks.forEach((task) => {
    const taskMatchesUser =
      String(task.createdBy || "") === userId ||
      String(task.createdByName || "") === userName ||
      String(task.assigneeId || "") === userId ||
      (task.targetType === "person" && String(task.target || "").trim() === userName);

    if (!taskMatchesUser) return;

    const taskId = String(task.id);
    visibleIds.add(taskId);
    addAncestors(taskId);
    addDescendants(taskId);
  });

  return visibleIds;
};

// Прибирає діакритику (не транслітерує кирилицю) для нечутливого до регістру порівняння назв.
const normalizeHierarchyText = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "");

const findHierarchyNode = (items = [], value) => {
  const needle = normalizeHierarchyText(value);
  if (!needle) return null;

  const exact = items.find((item) => normalizeHierarchyText(item?.name || item?.title || "") === needle);
  if (exact) return exact;

  return items.find((item) => {
    const candidate = normalizeHierarchyText(item?.name || item?.title || "");
    return candidate.includes(needle) || needle.includes(candidate);
  }) || null;
};

const getHierarchyParentMap = (items = []) => {
  const map = new Map();
  items.forEach((item) => {
    const id = String(item?.id || "").trim();
    const parentId = String(item?.parentId ?? item?.parent_id ?? "").trim();
    if (id) map.set(id, parentId || null);
  });
  return map;
};

const isWithinHierarchy = (nodeId, ancestorId, items = []) => {
  if (!nodeId || !ancestorId || nodeId === ancestorId) return nodeId === ancestorId;
  const parentMap = getHierarchyParentMap(items);
  let currentId = String(nodeId);
  while (currentId) {
    const parentId = parentMap.get(currentId);
    if (parentId === String(ancestorId)) return true;
    currentId = parentId || "";
  }
  return false;
};

// "керівн" покриває керівник/керівництво — основне позначення керівної посади в системі.
export const isManagerLikeUser = (user) => {
  const roleValue = normalizeHierarchyText(user?.role || user?.workRole || user?.position || "");
  return (
    roleValue.includes("manager") ||
    roleValue.includes("керівн") ||
    roleValue.includes("управл") ||
    roleValue.includes("директор") ||
    roleValue.includes("head")
  );
};

export const getAssignableUsers = (users = [], currentUser, workRoles = [], positions = []) => {
  const currentUserId = idOf(currentUser);

  if (!currentUser || !users.length) return [];
  if (isGlobalAdminUser(currentUser)) return users.filter((row) => idOf(row) !== currentUserId);

  const candidateUsers = users.filter((row) => idOf(row) !== currentUserId);
  if (!isManagerLikeUser(currentUser)) return [];

  const currentRoleNode = findHierarchyNode(workRoles, currentUser?.workRole || currentUser?.role || currentUser?.position || "");
  const currentPositionNode = findHierarchyNode(positions, currentUser?.position || "");

  const hasHierarchyData = workRoles.length > 0 || positions.length > 0;
  if (!hasHierarchyData) return candidateUsers;

  return candidateUsers.filter((row) => {
    const targetRoleNode = findHierarchyNode(workRoles, row?.workRole || row?.role || "");
    const targetPositionNode = findHierarchyNode(positions, row?.position || "");
    const isTargetManager = isManagerLikeUser(row);

    if (currentRoleNode && targetRoleNode) {
      return isWithinHierarchy(targetRoleNode.id, currentRoleNode.id, workRoles) || targetRoleNode.id === currentRoleNode.id || isTargetManager;
    }

    if (currentPositionNode && targetPositionNode) {
      return isWithinHierarchy(targetPositionNode.id, currentPositionNode.id, positions) || targetPositionNode.id === currentPositionNode.id || isTargetManager;
    }

    // Не вдалося зіставити роль/посаду підлеглого з деревом — не блокуємо видимість через це.
    return true;
  });
};

export const shiftDateByDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

export const paginateItems = (items, page, pageSize) => {
  const size = Number(pageSize) > 0 ? Number(pageSize) : PAGINATION_OPTIONS[0];
  const total = Math.max(1, Math.ceil(items.length / size));
  const safePage = Math.min(Math.max(1, Number(page) || 1), total);
  const startIndex = (safePage - 1) * size;

  return {
    currentPage: safePage,
    pageSize: size,
    totalPages: total,
    items: items.slice(startIndex, startIndex + size),
  };
};
