import { useState } from "react";
import { X } from "lucide-react";
import { loginUser, requestPasswordReset } from "../firebase/auth";
import { useAuth } from "../hooks/useAuth";

export const LoginModal = ({ onClose, onLoginSuccess }) => {
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await loginUser(email, password);
      
      // Перенаправлення на дашборд після успішного входу
      if (onLoginSuccess) {
        onLoginSuccess();
      }
      
      onClose();
    } catch (error) {
      console.error("Помилка входу:", error);
      if (error.code === "auth/api-401" || error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
        setError("Невірний email або пароль");
      } else if (error.code === "auth/api-404" || error.code === "auth/user-not-found") {
        setError("Користувача не знайдено");
      } else if (error.code === "auth/api-429" || Number(error.status) === 429) {
        setError("Забагато невдалих спроб входу. Спробуйте через кілька хвилин.");
      } else if (error.code === "auth/api-500" || Number(error.status) >= 500) {
        setError("Сервер тимчасово недоступний. Спробуйте пізніше або зверніться до адміністратора.");
      } else {
        setError(`Помилка входу: ${error.message || "Спробуйте ще раз"}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setError("");
    setResetMessage("");
    if (!email.trim()) {
      setError("Введіть email, на який надіслати тимчасовий пароль");
      return;
    }
    setLoading(true);
    try {
      const response = await requestPasswordReset(email);
      setResetMessage(response?.message || "Якщо акаунт існує, лист буде надіслано.");
    } catch (resetError) {
      setError(resetError?.message || "Не вдалося надіслати лист. Спробуйте пізніше.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-slate-900">Вхід</h2>
          {isAuthenticated && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition"
            >
              <X size={24} />
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm whitespace-pre-line">
            {error}
          </div>
        )}

        {resetMessage && (
          <div className="mb-4 p-3 bg-emerald-100 text-emerald-700 rounded-lg text-sm">
            {resetMessage}
          </div>
        )}

        {!resetMode ? <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setResetMode(true);
              setError("");
              setResetMessage("");
            }}
            className="-mt-2 block text-left text-sm text-indigo-600 hover:text-indigo-500"
          >
            Забули пароль?
          </button>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition"
          >
            {loading ? "Вхід..." : "Увійти"}
          </button>
        </form> : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Введіть email. Якщо акаунт існує, на нього прийде тимчасовий пароль.
            </p>
            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={loading}
              className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition"
            >
              {loading ? "Надсилання..." : "Надіслати тимчасовий пароль"}
            </button>
            <button
              type="button"
              onClick={() => {
                setResetMode(false);
                setError("");
                setResetMessage("");
              }}
              className="w-full text-sm text-slate-500 hover:text-slate-700"
            >
              Повернутися до входу
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
