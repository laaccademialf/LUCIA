import { useCallback, useEffect, useRef, useState } from "react";
import {
  addLegalNotificationApi,
  addLegalTaskApi,
  deleteLegalTaskApi,
  getLegalTasksApi,
  isLegalApiEnabled,
  updateLegalTaskApi,
} from "../api/legalTasksApi";
import {
  LEGAL_ARCHIVED_STATUS,
  LEGAL_PROCESS_TAB,
  LEGAL_REQUEST_TAB,
  getLegalStatusMeta,
  isBackwardTransition,
} from "../data/legalConstants";

const DEFAULT_POLL_INTERVAL_MS = 8000;

const actorLabel = (user) => user?.displayName || user?.fullName || user?.name || user?.email || "Користувач";
const actorId = (user) => String(user?.uid || user?.id || user?.userId || user?.email || "").trim();

// Створення запису сповіщення у власній БД (для центру сповіщень інших користувачів).
const pushLegalNotification = async ({ task, title, body, targetUserId, targetRole, actionTab, actorUserId }) => {
  if (!isLegalApiEnabled()) return;
  try {
    await addLegalNotificationApi({
      taskId: String(task?.id || ""),
      taskTitle: String(task?.title || ""),
      title: String(title || "Юридична задача"),
      body: String(body || ""),
      targetUserId: String(targetUserId || ""),
      targetRole: String(targetRole || ""),
      actorUserId: String(actorUserId || ""),
      actionTab: String(actionTab || LEGAL_REQUEST_TAB),
      source: "legal",
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("Не вдалося створити юридичне сповіщення:", error);
  }
};

export const useLegalTasks = (user, { pollIntervalMs = DEFAULT_POLL_INTERVAL_MS } = {}) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMountedRef = useRef(true);

  const reload = useCallback(async () => {
    if (!isLegalApiEnabled()) {
      setLoading(false);
      return [];
    }
    try {
      const data = await getLegalTasksApi();
      if (isMountedRef.current) {
        setTasks(Array.isArray(data) ? data : []);
        setError(null);
      }
      return data;
    } catch (err) {
      console.error("Помилка завантаження юридичних задач:", err);
      if (isMountedRef.current) setError(err);
      return [];
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    reload();
    if (!isLegalApiEnabled() || !pollIntervalMs) {
      return () => {
        isMountedRef.current = false;
      };
    }
    const timer = setInterval(() => {
      reload();
    }, pollIntervalMs);
    return () => {
      isMountedRef.current = false;
      clearInterval(timer);
    };
  }, [reload, pollIntervalMs]);

  // Створення задачі користувачем (вкладка "Запит до Юриста").
  const createTask = useCallback(
    async (formData) => {
      if (!isLegalApiEnabled()) {
        return { success: false, error: new Error("Legal API disabled") };
      }
      const nowIso = new Date().toISOString();
      const payload = {
        title: String(formData.title || "").trim(),
        description: String(formData.description || "").trim(),
        attachments: Array.isArray(formData.attachments) ? formData.attachments : [],
        preferredDeadline: formData.preferredDeadline || "",
        priority: formData.priority || "normal",
        restaurantId: formData.restaurantId || user?.restaurant || "",
        restaurantName: formData.restaurantName || "",
        contact: String(formData.contact || "").trim(),
        status: "received",
        archived: false,
        createdById: actorId(user),
        createdByName: actorLabel(user),
        assignedToId: "",
        assignedToName: "",
        order: Date.now(),
        createdAt: nowIso,
        updatedAt: nowIso,
        statusHistory: [
          {
            status: "received",
            by: actorLabel(user),
            byId: actorId(user),
            at: nowIso,
            comment: "Задачу створено та передано юридичному відділу",
          },
        ],
      };

      try {
        const id = await addLegalTaskApi(payload);
        const created = { ...payload, id };
        await pushLegalNotification({
          task: created,
          title: "Нова юридична задача",
          body: `${payload.title} — від ${payload.createdByName}`,
          targetRole: "legal",
          actorUserId: actorId(user),
          actionTab: LEGAL_PROCESS_TAB,
        });
        await reload();
        return { success: true, id };
      } catch (err) {
        console.error("Помилка створення юридичної задачі:", err);
        setError(err);
        return { success: false, error: err };
      }
    },
    [user, reload]
  );

  const updateTask = useCallback(
    async (id, data) => {
      if (!isLegalApiEnabled()) return { success: false };
      try {
        await updateLegalTaskApi(id, { ...data, updatedAt: new Date().toISOString() });
        await reload();
        return { success: true };
      } catch (err) {
        console.error("Помилка оновлення юридичної задачі:", err);
        setError(err);
        return { success: false, error: err };
      }
    },
    [reload]
  );

  const removeTask = useCallback(
    async (id) => {
      if (!isLegalApiEnabled()) return { success: false };
      try {
        await deleteLegalTaskApi(id);
        await reload();
        return { success: true };
      } catch (err) {
        console.error("Помилка видалення юридичної задачі:", err);
        setError(err);
        return { success: false, error: err };
      }
    },
    [reload]
  );

  // Зміна статусу задачі юристом (канбан / таблиця / архів).
  const moveTaskStatus = useCallback(
    async (task, nextStatus, { comment = "" } = {}) => {
      if (!isLegalApiEnabled() || !task?.id) return { success: false };
      const prevStatus = task.archived ? LEGAL_ARCHIVED_STATUS.value : task.status;
      const isArchive = nextStatus === LEGAL_ARCHIVED_STATUS.value;
      const nowIso = new Date().toISOString();

      const historyEntry = {
        status: nextStatus,
        by: actorLabel(user),
        byId: actorId(user),
        at: nowIso,
        comment: comment || "",
      };

      const patch = {
        ...task,
        status: isArchive ? task.status : nextStatus,
        archived: isArchive ? true : nextStatus === LEGAL_ARCHIVED_STATUS.value,
        assignedToId: task.assignedToId || actorId(user),
        assignedToName: task.assignedToName || actorLabel(user),
        updatedAt: nowIso,
        statusHistory: [...(Array.isArray(task.statusHistory) ? task.statusHistory : []), historyEntry],
      };
      // archived стає false тільки якщо явно повертаємо з архіву в робочий статус
      if (!isArchive) {
        patch.archived = false;
      }

      try {
        await updateLegalTaskApi(task.id, patch);

        // Сповіщення замовнику — лише для руху "вперед" та архівації,
        // НЕ для зворотних ітерацій (погодження -> в процесі).
        const backward = isBackwardTransition(prevStatus, nextStatus);
        if (!backward && task.createdById) {
          const statusMeta = getLegalStatusMeta(isArchive ? LEGAL_ARCHIVED_STATUS.value : nextStatus);
          await pushLegalNotification({
            task,
            title: isArchive ? "Юридичну задачу завершено" : "Оновлено статус юридичної задачі",
            body: `${task.title} — ${statusMeta.label}`,
            targetUserId: task.createdById,
            actorUserId: actorId(user),
            actionTab: LEGAL_REQUEST_TAB,
          });
        }

        await reload();
        return { success: true };
      } catch (err) {
        console.error("Помилка зміни статусу юридичної задачі:", err);
        setError(err);
        return { success: false, error: err };
      }
    },
    [user, reload]
  );

  return {
    tasks,
    loading,
    error,
    reload,
    createTask,
    updateTask,
    removeTask,
    moveTaskStatus,
  };
};
