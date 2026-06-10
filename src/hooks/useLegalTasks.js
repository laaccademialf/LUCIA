import { useCallback, useEffect, useRef, useState } from "react";
import {
  addLegalNotificationApi,
  addLegalTaskApi,
  deleteLegalTaskApi,
  getLegalModuleSettingsApi,
  getLegalTasksApi,
  isLegalApiEnabled,
  saveLegalModuleSettingsApi,
  uploadLegalAttachmentApi,
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
const DEFAULT_LEGAL_SETTINGS = {
  lawyerUserIds: [],
  updatedAt: "",
};

const actorLabel = (user) => user?.displayName || user?.fullName || user?.name || user?.email || "Користувач";
const actorId = (user) => String(user?.uid || user?.id || user?.userId || user?.email || "").trim();

const pushLocalCenterNotification = ({ title, body, targetUserId, targetRole, actorUserId, actionTab }) => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    const key = `lnotify_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const payload = {
      key,
      title,
      body,
      createdAt: new Date().toISOString(),
      source: "legal",
      targetUserId: String(targetUserId || ""),
      targetRole: String(targetRole || ""),
      actorUserId: String(actorUserId || ""),
      actionUrl: "ops-maintenance",
      actionTab: String(actionTab || LEGAL_REQUEST_TAB),
    };
    const storageKey = "lucia_center_notifications";
    const current = JSON.parse(localStorage.getItem(storageKey) || "[]");
    const next = [payload, ...(Array.isArray(current) ? current : [])].slice(0, 200);
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // ignore local storage notification errors
  }
};

// Створення запису сповіщення у власній БД (для центру сповіщень інших користувачів).
const pushLegalNotification = async ({ task, title, body, targetUserId, targetRole, actionTab, actorUserId }) => {
  if (!isLegalApiEnabled()) return;
  try {
    pushLocalCenterNotification({ title, body, targetUserId, targetRole, actorUserId, actionTab });

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
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("lucia:notifications-updated"));
    }
  } catch (error) {
    console.warn("Не вдалося створити юридичне сповіщення:", error);
  }
};

export const useLegalTasks = (user, { pollIntervalMs = DEFAULT_POLL_INTERVAL_MS } = {}) => {
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_LEGAL_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMountedRef = useRef(true);

  const reloadSettings = useCallback(async () => {
    if (!isLegalApiEnabled()) {
      setSettings(DEFAULT_LEGAL_SETTINGS);
      setSettingsLoading(false);
      return DEFAULT_LEGAL_SETTINGS;
    }
    try {
      const doc = await getLegalModuleSettingsApi();
      const normalized = {
        ...DEFAULT_LEGAL_SETTINGS,
        ...(doc || {}),
        lawyerUserIds: Array.isArray(doc?.lawyerUserIds)
          ? doc.lawyerUserIds.map((id) => String(id || "").trim()).filter(Boolean)
          : [],
      };
      if (isMountedRef.current) setSettings(normalized);
      return normalized;
    } catch (err) {
      if (isMountedRef.current) setSettings(DEFAULT_LEGAL_SETTINGS);
      return DEFAULT_LEGAL_SETTINGS;
    } finally {
      if (isMountedRef.current) setSettingsLoading(false);
    }
  }, []);

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
    reloadSettings();
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
  }, [reload, reloadSettings, pollIntervalMs]);

  const saveSettings = useCallback(async (nextSettings = {}) => {
    if (!isLegalApiEnabled()) return { success: false };
    const payload = {
      ...DEFAULT_LEGAL_SETTINGS,
      ...settings,
      ...nextSettings,
      lawyerUserIds: Array.isArray(nextSettings?.lawyerUserIds)
        ? nextSettings.lawyerUserIds.map((id) => String(id || "").trim()).filter(Boolean)
        : Array.isArray(settings?.lawyerUserIds)
          ? settings.lawyerUserIds
          : [],
    };

    try {
      await saveLegalModuleSettingsApi(payload);
      if (isMountedRef.current) setSettings(payload);
      return { success: true };
    } catch (err) {
      setError(err);
      return { success: false, error: err };
    }
  }, [settings]);

  const resolveNotificationTargets = useCallback((notifyRole, notifyUserId) => {
    const userId = String(notifyUserId || "").trim();
    if (userId) {
      return [{ targetUserId: userId, targetRole: "" }];
    }

    const role = String(notifyRole || "").trim();
    if (role !== "legal") {
      return role ? [{ targetUserId: "", targetRole: role }] : [];
    }

    const selectedLawyers = Array.isArray(settings?.lawyerUserIds)
      ? settings.lawyerUserIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    if (selectedLawyers.length > 0) {
      return selectedLawyers.map((id) => ({ targetUserId: id, targetRole: "" }));
    }

    return [{ targetUserId: "", targetRole: "legal" }];
  }, [settings?.lawyerUserIds]);

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
        const uploadedAttachments = await Promise.all(
          (Array.isArray(payload.attachments) ? payload.attachments : []).map(async (file) => {
            const hasDataUrl = typeof file?.dataUrl === "string" && file.dataUrl.startsWith("data:");
            if (!hasDataUrl) return file;
            try {
              return await uploadLegalAttachmentApi({
                fileName: String(file?.name || "file"),
                dataUrl: file.dataUrl,
                size: Number(file?.size || 0),
                type: String(file?.type || ""),
              });
            } catch (uploadError) {
              // Fallback: do not block task creation if filesystem upload is not available yet.
              // IMPORTANT: never keep huge base64 in DB payload for legalTasks.
              // Store only metadata, otherwise MySQL _flat TEXT columns can overflow.
              console.warn("Legal attachment upload failed, fallback to inline payload:", uploadError);
              return {
                name: String(file?.name || "file"),
                size: Number(file?.size || 0),
                type: String(file?.type || ""),
                url: "",
                uploadFailed: true,
              };
            }
          })
        );

        const payloadWithUploadedFiles = {
          ...payload,
          attachments: uploadedAttachments,
        };

        const id = await addLegalTaskApi(payloadWithUploadedFiles);
        const created = { ...payloadWithUploadedFiles, id };

        const targets = resolveNotificationTargets("legal", "");
        await Promise.all(
          targets.map((target) =>
            pushLegalNotification({
              task: created,
              title: "Нова юридична задача",
              body: `${payload.title} — від ${payload.createdByName}`,
              targetUserId: target.targetUserId,
              targetRole: target.targetRole,
              actorUserId: actorId(user),
              actionTab: LEGAL_PROCESS_TAB,
            })
          )
        );
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

  const addTaskComment = useCallback(
    async (
      task,
      text,
      { notifyRole = "", notifyUserId = "", actionTab = LEGAL_REQUEST_TAB, replyTo = null, attachments = [] } = {}
    ) => {
      if (!isLegalApiEnabled() || !task?.id) return { success: false };
      const message = String(text || "").trim();
      const rawAttachments = Array.isArray(attachments) ? attachments : [];
      if (!message && rawAttachments.length === 0) return { success: false, error: new Error("Message is empty") };

      const nowIso = new Date().toISOString();
      const uploadedAttachments = await Promise.all(
        rawAttachments.map(async (file) => {
          const hasDataUrl = typeof file?.dataUrl === "string" && file.dataUrl.startsWith("data:");
          if (!hasDataUrl) {
            return {
              name: String(file?.name || "file"),
              size: Number(file?.size || 0),
              type: String(file?.type || ""),
              url: String(file?.url || ""),
              uploadFailed: Boolean(file?.uploadFailed),
            };
          }

          try {
            return await uploadLegalAttachmentApi({
              fileName: String(file?.name || "file"),
              dataUrl: file.dataUrl,
              size: Number(file?.size || 0),
              type: String(file?.type || ""),
            });
          } catch (uploadError) {
            console.warn("Legal comment attachment upload failed, fallback to metadata:", uploadError);
            return {
              name: String(file?.name || "file"),
              size: Number(file?.size || 0),
              type: String(file?.type || ""),
              url: "",
              uploadFailed: true,
            };
          }
        })
      );

      const entry = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        text: message,
        by: actorLabel(user),
        byId: actorId(user),
        at: nowIso,
        attachments: uploadedAttachments,
        replyToId: String(replyTo?.id || "").trim(),
        replyToText: String(replyTo?.text || "")
          .trim()
          .slice(0, 160),
        replyToBy: String(replyTo?.by || "").trim(),
      };

      const patch = {
        ...task,
        updatedAt: nowIso,
        threadMessages: [...(Array.isArray(task.threadMessages) ? task.threadMessages : []), entry],
      };

      try {
        await updateLegalTaskApi(task.id, patch);

        if (notifyRole || notifyUserId) {
          const targets = resolveNotificationTargets(notifyRole, notifyUserId);
          await Promise.all(
            targets.map((target) =>
              pushLegalNotification({
                task,
                title: "Нове повідомлення по юридичній задачі",
                body:
                  message
                    ? `${task.title}: ${message.slice(0, 160)}`
                    : `${task.title}: Додано вкладення до коментаря`,
                targetUserId: target.targetUserId,
                targetRole: target.targetRole,
                actorUserId: actorId(user),
                actionTab,
              })
            )
          );
        }

        await reload();
        return { success: true };
      } catch (err) {
        console.error("Помилка додавання коментаря до юридичної задачі:", err);
        setError(err);
        return { success: false, error: err };
      }
    },
    [user, reload, resolveNotificationTargets]
  );

  const updateTaskDeadline = useCallback(
    async (task, nextDeadline, { historyComment = "" } = {}) => {
      if (!isLegalApiEnabled() || !task?.id) return { success: false };

      const nowIso = new Date().toISOString();
      const normalizedDeadline = String(nextDeadline || "").trim();
      const patch = {
        ...task,
        preferredDeadline: normalizedDeadline,
        updatedAt: nowIso,
        statusHistory: [
          ...(Array.isArray(task.statusHistory) ? task.statusHistory : []),
          {
            status: task.archived ? LEGAL_ARCHIVED_STATUS.value : task.status,
            by: actorLabel(user),
            byId: actorId(user),
            at: nowIso,
            comment: historyComment || (normalizedDeadline ? "Оновлено дедлайн" : "Дедлайн очищено"),
          },
        ],
      };

      try {
        await updateLegalTaskApi(task.id, patch);

        if (task.createdById) {
          await pushLegalNotification({
            task,
            title: "Оновлено дедлайн юридичної задачі",
            body: normalizedDeadline
              ? `${task.title} — новий дедлайн: ${normalizedDeadline}`
              : `${task.title} — дедлайн прибрано`,
            targetUserId: task.createdById,
            actorUserId: actorId(user),
            actionTab: LEGAL_REQUEST_TAB,
          });
        }

        await reload();
        return { success: true };
      } catch (err) {
        console.error("Помилка оновлення дедлайну юридичної задачі:", err);
        setError(err);
        return { success: false, error: err };
      }
    },
    [user, reload]
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
    settings,
    settingsLoading,
    loading,
    error,
    reload,
    reloadSettings,
    saveSettings,
    createTask,
    updateTask,
    removeTask,
    moveTaskStatus,
    addTaskComment,
    updateTaskDeadline,
  };
};
