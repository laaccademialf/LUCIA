import { StrictMode, Component } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { syncRuntimeConfigFromServer } from "./data/firebaseConnections";

const savedPlatformTheme = localStorage.getItem("lucia_platform_light_theme");
const useLightTheme = savedPlatformTheme !== null ? JSON.parse(savedPlatformTheme) : false;
document.documentElement.lang = "uk";
document.body.classList.toggle("lucia-platform-light", useLightTheme);
document.documentElement.style.colorScheme = useLightTheme ? "light" : "dark";

// Показує помилку замість порожнього екрану (особливо на мобільних),
// якщо React-дерево крешнулось під час рендеру.
class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Root render error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "24px", fontFamily: "system-ui, sans-serif", color: "#fff", background: "#0f172a", minHeight: "100vh" }}>
          <h2 style={{ marginBottom: "12px" }}>Сталася помилка застосунку</h2>
          <p style={{ marginBottom: "16px", opacity: 0.8 }}>
            Спробуйте оновити сторінку. Якщо не допомагає — очистіть кеш браузера.
          </p>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px", opacity: 0.6 }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: "16px", padding: "10px 20px", borderRadius: "8px", border: "none", background: "#4f46e5", color: "#fff", fontSize: "14px" }}
          >
            Перезавантажити
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const renderStartupError = (error) => {
  console.error("Startup error:", error);
  const rootEl = document.getElementById("root");
  if (!rootEl) return;
  rootEl.innerHTML = `
    <div style="padding:24px;font-family:system-ui,sans-serif;color:#fff;background:#0f172a;min-height:100vh">
      <h2 style="margin-bottom:12px">Не вдалося завантажити застосунок</h2>
      <p style="margin-bottom:16px;opacity:.8">Перевірте з'єднання та спробуйте ще раз.</p>
      <pre style="white-space:pre-wrap;font-size:12px;opacity:.6">${String(error?.message || error).replace(/</g, "&lt;")}</pre>
      <button type="button" onclick="window.location.reload()" style="margin-top:16px;padding:10px 20px;border-radius:8px;border:none;background:#4f46e5;color:#fff;font-size:14px">Перезавантажити</button>
    </div>`;
};

const bootstrap = async () => {
  try {
    await syncRuntimeConfigFromServer();
  } catch (error) {
    // Runtime-конфіг не критичний для старту — працюємо з env/localStorage.
    console.warn("Runtime config sync failed, continuing:", error);
  }

  const { default: App } = await import("./App.jsx");

  if (import.meta.env.DEV) {
    await Promise.all([
      import("./utils/createAdmin"),
      import("./utils/migration"),
    ]);
  }

  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </StrictMode>,
  );
};

bootstrap().catch(renderStartupError);
