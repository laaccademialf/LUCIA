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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lightTheme, setLightTheme] = useState(() => {
    const savedPlatform = localStorage.getItem("lucia_platform_light_theme");
    if (savedPlatform !== null) return JSON.parse(savedPlatform);
    const savedLegacy = localStorage.getItem("lucia_notification_light_theme");
    return savedLegacy !== null ? JSON.parse(savedLegacy) : false;
  });

  const isLight = lightTheme;

  // Зберігай наслідки
  useEffect(() => {
    localStorage.setItem("lucia_notification_volume", String(audioVolume));
  }, [audioVolume]);

  useEffect(() => {
    localStorage.setItem("lucia_notification_audio_enabled", JSON.stringify(audioEnabled));
  }, [audioEnabled]);

  useEffect(() => {
    localStorage.setItem("lucia_notification_light_theme", JSON.stringify(lightTheme));
    localStorage.setItem("lucia_platform_light_theme", JSON.stringify(lightTheme));
    document.body.classList.toggle("lucia-platform-light", lightTheme);
    document.documentElement.style.colorScheme = lightTheme ? "light" : "dark";
    window.dispatchEvent(new CustomEvent("lucia:platform-theme-changed", { detail: { light: lightTheme } }));
  }, [lightTheme]);

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
          isLight ? "bg-slate-50" : "bg-slate-900",
          "shadow-2xl flex flex-col",
          "transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Заголовок */}
        <div
          className={clsx(
            "flex items-center justify-between px-6 py-4 border-b",
            isLight
              ? "border-slate-200 bg-gradient-to-r from-slate-100 to-slate-50"
              : "border-slate-700 bg-gradient-to-r from-slate-800 to-slate-900"
          )}
        >
          <div>
            <h2 className={clsx("text-lg font-bold", isLight ? "text-slate-800" : "text-white")}>Сповіщення</h2>
            {unreadCount > 0 && (
              <p className={clsx("text-xs mt-0.5", isLight ? "text-slate-500" : "text-slate-400")}>{unreadCount} непрочитаних</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleFullscreen}
              className={clsx(
                "p-2 rounded-lg transition-colors",
                isLight ? "hover:bg-slate-200 text-slate-600" : "hover:bg-slate-700 text-slate-300"
              )}
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
              className={clsx(
                "p-2 rounded-lg transition-colors",
                isLight ? "hover:bg-slate-200 text-slate-600" : "hover:bg-slate-700 text-slate-300"
              )}
              title="Закрити"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Список сповіщень */}
        <div className={clsx("flex-1 overflow-y-auto divide-y", isLight ? "divide-slate-200" : "divide-slate-700")}>
          {visibleNotifications.length === 0 ? (
            <div className="p-6 text-center">
              <div className="text-5xl mb-3">🔔</div>
              <p className={clsx("text-sm", isLight ? "text-slate-500" : "text-slate-400")}>Немає сповіщень</p>
            </div>
          ) : (
            visibleNotifications.map((notification) => {
              const isRead = readIds.has(notification.key || notification.id);
              const priority = notification.priority || "normal";
              const priorityColors = isLight ? {
                high: "bg-red-50 border-l-4 border-red-500",
                normal: "bg-white border-l-4 border-blue-500",
                low: "bg-white border-l-4 border-slate-300",
              } : {
                high: "bg-red-900/30 border-l-4 border-red-500",
                normal: "bg-slate-800 border-l-4 border-blue-400",
                low: "bg-slate-800 border-l-4 border-slate-600",
              };

              return (
                <div
                  key={notification.key || notification.id}
                  className={clsx(
                    "p-4 cursor-pointer transition-all",
                    isLight ? "hover:bg-slate-100" : "hover:bg-slate-700/50",
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
                        <p className={clsx("text-sm break-words", isRead ? (isLight ? "text-slate-500" : "text-slate-400") : (isLight ? "text-slate-900" : "text-white"))}>
                          {notification.title}
                        </p>
                        {notification.body && (
                          <p className={clsx("text-xs mt-1 line-clamp-2", isLight ? "text-slate-600" : "text-slate-500")}>
                            {notification.body}
                          </p>
                        )}
                        <p className={clsx("text-xs mt-2", isLight ? "text-slate-500" : "text-slate-500")}>
                          {notification.time || notification.createdAt}
                        </p>
                      </div>
                      {!isRead && (
                        <div className="flex-shrink-0 w-2.5 h-2.5 rounded-full bg-blue-500 mt-1" />
                      )}
                    </div>
                  </div>

                  {/* Дії */}
                  <div className={clsx("flex gap-2 mt-3 pt-3 border-t", isLight ? "border-slate-200" : "border-slate-700/50")}>
                    {!isRead && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkAsRead(notification);
                        }}
                        className={clsx(
                          "text-xs px-2 py-1 rounded transition-colors",
                          isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-700" : "bg-slate-700 hover:bg-slate-600 text-slate-200"
                        )}
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
                      className={clsx(
                        "text-xs px-2 py-1 rounded transition-colors ml-auto",
                        isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-700" : "bg-slate-700 hover:bg-slate-600 text-slate-300"
                      )}
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

        {/* Нижня зона: плитка швидкої дії + налаштування по кліку */}
        <div className={clsx("border-t p-4 space-y-3", isLight ? "border-slate-200 bg-slate-50" : "border-slate-700 bg-slate-900")}>
          {settingsOpen && (
            <div className={clsx("rounded-xl border p-3 space-y-3", isLight ? "border-slate-200 bg-white" : "border-slate-700 bg-slate-800/70")}>
              <div className="flex items-center justify-between">
                <h4 className={clsx("text-xs font-semibold", isLight ? "text-slate-700" : "text-slate-200")}>Налаштування сповіщень</h4>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className={clsx("text-xs", isLight ? "text-slate-500 hover:text-slate-700" : "text-slate-400 hover:text-slate-200")}
                >
                  Згорнути
                </button>
              </div>

              <div className="space-y-2">
                <div className={clsx("flex items-center justify-between text-xs font-semibold", isLight ? "text-slate-600" : "text-slate-300")}>
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
                    className={clsx("flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-blue-500", isLight ? "bg-slate-200" : "bg-slate-700")}
                  />
                  <button
                    onClick={() => setAudioEnabled(!audioEnabled)}
                    className={clsx(
                      "p-1.5 rounded-lg transition-colors",
                      audioEnabled
                        ? (isLight ? "bg-blue-100 text-blue-700 hover:bg-blue-200" : "bg-blue-900/50 text-blue-300 hover:bg-blue-900/70")
                        : (isLight ? "bg-slate-200 text-slate-500 hover:bg-slate-300" : "bg-slate-700 text-slate-400 hover:bg-slate-600")
                    )}
                    title={audioEnabled ? "Вимкнути звук" : "Увімкнути звук"}
                  >
                    {audioEnabled ? "🔊" : "🔇"}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={clsx("text-xs font-semibold", isLight ? "text-slate-600" : "text-slate-300")}>Push-сповіщення</span>
                  <button
                    onClick={handleTogglePush}
                    disabled={pushPermission === "denied"}
                    className={clsx(
                      "px-2 py-1 rounded text-xs font-medium transition-colors",
                      pushEnabled && pushPermission === "granted"
                        ? (isLight ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-green-900/50 text-green-300 hover:bg-green-900/70")
                        : pushPermission === "denied"
                        ? (isLight ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-slate-700 text-slate-500 cursor-not-allowed")
                        : (isLight ? "bg-slate-200 text-slate-700 hover:bg-slate-300" : "bg-slate-700 text-slate-300 hover:bg-slate-600")
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
                  <p className={clsx("text-xs italic", isLight ? "text-slate-500" : "text-slate-500")}>
                    Push-сповіщення заблоковані. Змініть налаштування браузера.
                  </p>
                )}
              </div>

              <button
                onClick={handleClearAll}
                disabled={visibleNotifications.length === 0}
                className={clsx(
                  "w-full py-2 px-3 rounded-lg text-sm font-medium transition-colors",
                  visibleNotifications.length === 0
                    ? (isLight ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-slate-700 text-slate-500 cursor-not-allowed")
                    : (isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-700" : "bg-slate-700 hover:bg-slate-600 text-slate-200")
                )}
              >
                Очистити всі
              </button>
            </div>
          )}

          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => setSettingsOpen((prev) => !prev)}
              className={clsx(
                "col-span-1 aspect-square rounded-xl border transition-all",
                "flex flex-col items-center justify-center gap-1",
                settingsOpen
                  ? (isLight ? "border-blue-500 bg-blue-100 text-blue-700" : "border-blue-500 bg-blue-900/40 text-blue-200")
                  : (isLight ? "border-slate-300 bg-white text-slate-600 hover:bg-slate-100" : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700")
              )}
              title="Налаштування сповіщень"
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0m6 0H9" />
              </svg>
              <span className="text-[11px] font-semibold">Сповіщення</span>
            </button>

            <button
              onClick={() => setLightTheme((prev) => !prev)}
              className={clsx(
                "col-span-1 aspect-square rounded-xl border transition-all",
                "flex flex-col items-center justify-center gap-1",
                isLight
                  ? "border-amber-400 bg-amber-50 text-amber-700"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
              )}
              title="Перемкнути тему"
            >
              {isLight ? (
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="4" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2m0 16v2m10-10h-2M4 12H2m17.66 7.66-1.41-1.41M5.75 5.75 4.34 4.34m15.32 0-1.41 1.41M5.75 18.25l-1.41 1.41" />
                </svg>
              ) : (
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
                </svg>
              )}
              <span className="text-[11px] font-semibold">Тема</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
