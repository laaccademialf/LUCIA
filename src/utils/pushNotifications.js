/**
 * Утіліта для управління браузерними push-сповіщеннями
 */

/**
 * Запросити дозвіл на push-сповіщення
 */
export async function requestPushPermission() {
  if (!("Notification" in window)) {
    console.warn("Browser не підтримує Notification API");
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  return false;
}

/**
 * Відправити push-сповіщення
 */
export function sendPushNotification(title, options = {}) {
  if (!("Notification" in window)) return;

  if (Notification.permission !== "granted") {
    return;
  }

  const defaultOptions = {
    icon: "/vite.svg",
    badge: "/vite.svg",
    vibrate: [200, 100, 200],
    tag: "lucia-notification",
    requireInteraction: false,
    ...options,
  };

  const notification = new Notification(title, defaultOptions);

  return notification;
}

/**
 * Отримати статус push-сповіщень
 */
export function getPushPermissionStatus() {
  if (!("Notification" in window)) {
    return "unavailable";
  }
  return Notification.permission;
}

/**
 * Включити/відключити push-сповіщення в localStorage
 */
export function setPushEnabled(enabled) {
  localStorage.setItem("lucia_push_enabled", JSON.stringify(enabled));
}

export function getPushEnabled() {
  const saved = localStorage.getItem("lucia_push_enabled");
  return saved !== null ? JSON.parse(saved) : true;
}

/**
 * Запустити Service Worker для push-сповіщень
 */
export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.warn("Service Workers не підтримуються");
    return null;
  }

  try {
    const swCode = `
      self.addEventListener("push", (event) => {
        if (!event.data) return;

        const data = event.data.json();
        const options = {
          body: data.body,
          icon: data.icon || "/vite.svg",
          badge: data.badge || "/vite.svg",
          tag: data.tag || "lucia-notification",
          requireInteraction: data.requireInteraction || false,
          data: data.data || {},
        };

        event.waitUntil(
          self.registration.showNotification(data.title || "LUCIA", options)
        );
      });

      self.addEventListener("notificationclick", (event) => {
        event.notification.close();
        
        const urlToOpen = event.notification.data.actionUrl || "/";
        
        event.waitUntil(
          clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
            for (let i = 0; i < clientList.length; i++) {
              const client = clientList[i];
              if (client.url === urlToOpen && "focus" in client) {
                return client.focus();
              }
            }
            if (clients.openWindow) {
              return clients.openWindow(urlToOpen);
            }
          })
        );
      });
    `;

    // Створити blob для Service Worker
    const blob = new Blob([swCode], { type: "application/javascript" });
    const swUrl = URL.createObjectURL(blob);

    const registration = await navigator.serviceWorker.register(swUrl, {
      scope: "/",
    });

    return registration;
  } catch (error) {
    console.warn("Service Worker реєстрація не вдалась:", error);
    return null;
  }
}

export default {
  requestPushPermission,
  sendPushNotification,
  getPushPermissionStatus,
  setPushEnabled,
  getPushEnabled,
  registerServiceWorker,
};
