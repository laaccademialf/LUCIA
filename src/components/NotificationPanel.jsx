import React, { useState, useEffect } from "react";
import clsx from "clsx";
import { requestPushPermission, getPushPermissionStatus, setPushEnabled, getPushEnabled } from "../utils/pushNotifications";

/**
 * NotificationCenter - повнофункціональний центр сповіщень типу Windows 10
 * Витискає справа на весь екран, з аудіо-контролем, інтерактивністю, читанням тощо
 */
export default function NotificationCenter({ open, onClose, notifications = [], onNotificationAction = null }) {
  const [audioVolume, setAudioVolume] = useState(() => {
    const saved = localStorage.getItem("lucia_notification_volume");
    return saved !== null ? parseFloat(saved) : 0.5;
  });
  
  const [audioEnabled, setAudioEnabled] = useState(() => {
    const saved = localStorage.getItem("lucia_notification_audio_enabled");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [readIds, setReadIds] = useState(() => {
    const saved = localStorage.getItem("lucia_notification_read_ids");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  const [dismissedIds, setDismissedIds] = useState(() => {
    const saved = localStorage.getItem("lucia_notification_dismissed_ids");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  const [pushEnabled, setPushEnabledState] = useState(() => getPushEnabled());
  const [pushPermission, setPushPermission] = useState(() => getPushPermissionStatus());
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));

  // Зберігай наслідки
  useEffect(() => {
    localStorage.setItem("lucia_notification_volume", String(audioVolume));
  }, [audioVolume]);

  useEffect(() => {
    localStorage.setItem("lucia_notification_audio_enabled", JSON.stringify(audioEnabled));
  }, [audioEnabled]);

  useEffect(() => {
    localStorage.setItem("lucia_notification_read_ids", JSON.stringify(Array.from(readIds)));
    localStorage.setItem("lucia_notification_dismissed_ids", JSON.stringify(Array.from(dismissedIds)));
    window.dispatchEvent(new CustomEvent("lucia:notification-state-updated"));
  }, [readIds, dismissedIds]);

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  // Фільтруй видалені сповіщення
  const visibleNotifications = notifications.filter((n) => !dismissedIds.has(n.key || n.id));

  // Метрика: кол-во непрочитаних
  const unreadCount = visibleNotifications.filter((n) => !readIds.has(n.key || n.id)).length;

  const handleNotificationClick = (notification) => {
    // Позначити як прочитане
    setReadIds((prev) => new Set([...prev, notification.key || notification.id]));

    // Викликати callback дії
    if (onNotificationAction && notification.actionUrl) {
      onNotificationAction(notification);
    }
  };

  const handleDismiss = (notification) => {
    setDismissedIds((prev) => new Set([...prev, notification.key || notification.id]));
  };

  const handleMarkAsRead = (notification) => {
    setReadIds((prev) => new Set([...prev, notification.key || notification.id]));
  };

  const handleClearAll = () => {
    const allIds = new Set(visibleNotifications.map((n) => n.key || n.id));
    setDismissedIds((prev) => new Set([...prev, ...allIds]));
  };

  const handleTogglePush = async () => {
    if (!pushEnabled) {
      // Спробувати включити
      const granted = await requestPushPermission();
      if (granted) {
        setPushEnabledState(true);
        setPushPermission("granted");
        setPushEnabled(true);
      } else {
        setPushPermission(getPushPermissionStatus());
      }
    } else {
      // Просто відключити
      setPushEnabledState(false);
      setPushEnabled(false);
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen();
    } catch (error) {
      console.warn("Не вдалося перемкнути повноекранний режим:", error);
    }
  };

  if (!open) return null;

  return (
    <div
      className={clsx(
        "fixed inset-0 z-[9999]",
        "transition-opacity",
        open ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
    >
      {/* Темний фон - закрити при кліцінні */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Основний центр сповіщень */}
      <div
        className={clsx(
          "absolute right-0 top-0 bottom-0 w-96 max-w-full",
          "bg-slate-900 shadow-2xl flex flex-col",
          "transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Заголовок */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-gradient-to-r from-slate-800 to-slate-900">
          <div>
            <h2 className="text-lg font-bold text-white">Сповіщення</h2>
            {unreadCount > 0 && (
              <p className="text-xs text-slate-400 mt-0.5">{unreadCount} непрочитаних</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg hover:bg-slate-700 transition-colors text-slate-300"
              title={isFullscreen ? "Вийти з повного екрана" : "Відкрити на повний екран"}
            >
              {isFullscreen ? (
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9H5V5m10 0h4v4m0 10v4h-4M9 15H5v4" />
                </svg>
              ) : (
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 3H5a2 2 0 00-2 2v3m16-5h-3m3 0v3m0 10v3a2 2 0 01-2 2h-3M8 21H5a2 2 0 01-2-2v-3" />
                </svg>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-700 transition-colors text-slate-300"
              title="Закрити"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Список сповіщень */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-700">
          {visibleNotifications.length === 0 ? (
            <div className="p-6 text-center">
              <div className="text-5xl mb-3">🔔</div>
              <p className="text-slate-400 text-sm">Немає сповіщень</p>
            </div>
          ) : (
            visibleNotifications.map((notification) => {
              const isRead = readIds.has(notification.key || notification.id);
              const priority = notification.priority || "normal";
              const priorityColors = {
                high: "bg-red-900/30 border-l-4 border-red-500",
                normal: "bg-slate-800 border-l-4 border-blue-400",
                low: "bg-slate-800 border-l-4 border-slate-600",
              };

              return (
                <div
                  key={notification.key || notification.id}
                  className={clsx(
                    "p-4 cursor-pointer transition-all hover:bg-slate-700/50",
                    priorityColors[priority],
                    !isRead && "font-semibold"
                  )}
                >
                  <div
                    onClick={() => handleNotificationClick(notification)}
                    className="mb-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={clsx("text-sm break-words", isRead ? "text-slate-400" : "text-white")}>
                          {notification.title}
                        </p>
                        {notification.body && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                            {notification.body}
                          </p>
                        )}
                        <p className="text-xs text-slate-500 mt-2">
                          {notification.time || notification.createdAt}
                        </p>
                      </div>
                      {!isRead && (
                        <div className="flex-shrink-0 w-2.5 h-2.5 rounded-full bg-blue-500 mt-1" />
                      )}
                    </div>
                  </div>

                  {/* Дії */}
                  <div className="flex gap-2 mt-3 pt-3 border-t border-slate-700/50">
                    {!isRead && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkAsRead(notification);
                        }}
                        className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                        title="Позначити як прочитане"
                      >
                        ✓ Прочитано
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDismiss(notification);
                      }}
                      className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors ml-auto"
                      title="Приховати"
                    >
                      × Приховати
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Контролі в низу */}
        <div className="border-t border-slate-700 bg-slate-900 p-4 space-y-3">
          {/* Регулятор гучності */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span>Звук</span>
              <span>{Math.round(audioVolume * 100)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="100"
                value={audioVolume * 100}
                onChange={(e) => setAudioVolume(parseFloat(e.target.value) / 100)}
                className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <button
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={clsx(
                  "p-1.5 rounded-lg transition-colors",
                  audioEnabled ? "bg-blue-900/50 text-blue-300 hover:bg-blue-900/70" : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                )}
                title={audioEnabled ? "Вимкнути звук" : "Увімкнути звук"}
              >
                {audioEnabled ? "🔊" : "🔇"}
              </button>
            </div>
          </div>

          {/* Push-сповіщення */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Push-сповіщення</span>
              <button
                onClick={handleTogglePush}
                disabled={pushPermission === "denied"}
                className={clsx(
                  "px-2 py-1 rounded text-xs font-medium transition-colors",
                  pushEnabled && pushPermission === "granted"
                    ? "bg-green-900/50 text-green-300 hover:bg-green-900/70"
                    : pushPermission === "denied"
                    ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                )}
                title={
                  pushPermission === "denied"
                    ? "Push-сповіщення заблоковані в браузері"
                    : pushEnabled
                    ? "Вимкнути push-сповіщення"
                    : "Включити push-сповіщення"
                }
              >
                {pushEnabled && pushPermission === "granted" ? "✓ Увімкнені" : "Увімкнути"}
              </button>
            </div>
            {pushPermission === "denied" && (
              <p className="text-xs text-slate-500 italic">
                Push-сповіщення заблоковані. Змініть налаштування браузера.
              </p>
            )}
          </div>

          {/* Дії */}
          <button
            onClick={handleClearAll}
            disabled={visibleNotifications.length === 0}
            className={clsx(
              "w-full py-2 px-3 rounded-lg text-sm font-medium transition-colors",
              visibleNotifications.length === 0
                ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                : "bg-slate-700 hover:bg-slate-600 text-slate-200"
            )}
          >
            Очистити всі
          </button>
        </div>
      </div>
    </div>
  );
}
