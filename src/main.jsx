import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { syncRuntimeConfigFromServer } from "./data/firebaseConnections";

const savedPlatformTheme = localStorage.getItem("lucia_platform_light_theme");
const useLightTheme = savedPlatformTheme !== null ? JSON.parse(savedPlatformTheme) : false;
document.documentElement.lang = "uk";
document.body.classList.toggle("lucia-platform-light", useLightTheme);
document.documentElement.style.colorScheme = useLightTheme ? "light" : "dark";

await syncRuntimeConfigFromServer();
const { default: App } = await import("./App.jsx");

if (import.meta.env.DEV) {
  await Promise.all([
    import("./utils/createAdmin"),
    import("./utils/migration"),
  ]);

  // Виводимо інструкції у консоль тільки для dev-середовища.
  console.log("%c🔥 LUCI - Firebase Setup", "color: #4F46E5; font-size: 16px; font-weight: bold");
  console.log("%c📝 Доступні команди:", "color: #6366F1; font-size: 14px; font-weight: bold");
  console.log("%c  createMainAdmin() - Створити головного адміністратора", "color: #8B5CF6");
  console.log("%c  migrateData() - Завантажити тестові дані ресторанів", "color: #8B5CF6");
  console.log("");
  console.log("%c⚡ Швидке налаштування Firebase:", "color: #10B981; font-size: 14px; font-weight: bold");
  console.log("%c  1. Firestore Rules: https://console.firebase.google.com/project/luci-f1285/firestore/rules", "color: #059669");
  console.log("%c     Встановіть: allow read, write: if true;", "color: #059669");
  console.log("%c  2. Authentication: https://console.firebase.google.com/project/luci-f1285/authentication/providers", "color: #059669");
  console.log("%c     Увімкніть: Email/Password", "color: #059669");
  console.log("");
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
