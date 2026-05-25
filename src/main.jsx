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
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
