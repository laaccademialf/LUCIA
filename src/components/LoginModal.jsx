import { useState } from "react";
import { X } from "lucide-react";
import { loginUser } from "../firebase/auth";
import { useAuth } from "../hooks/useAuth";

export const LoginModal = ({ onClose, onSwitchToRegister }) => {
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await loginUser(email, password);
      onClose();
    } catch (error) {
      console.error("Помилка входу:", error);
      if (error.code === "auth/operation-not-allowed") {
        setError("⚠️ Authentication не активовано у Firebase Console. Будь ласка, активуйте Email/Password провайдер.");
      } else if (error.code === "auth/invalid-credential") {
        setError("Невірний email або пароль");
      } else if (error.code === "auth/user-not-found") {
        setError("Користувача не знайдено");
      } else if (error.code === "auth/wrong-password") {
        setError("Невірний пароль");
      } else if (error.code && error.code.includes("api-key")) {
        setError("⚠️ Невалідний API ключ!\n\nПерезапустіть dev сервер:\n• Ctrl+C в терміналі\n• npm run dev");
      } else {
        setError(`Помилка входу: ${error.message || "Спробуйте ще раз"}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
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
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition"
          >
            {loading ? "Вхід..." : "Увійти"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-slate-600">
          Немає акаунту?{" "}
          <button
            onClick={onSwitchToRegister}
            className="text-indigo-600 font-semibold hover:text-indigo-500"
          >
            Зареєструватися
          </button>
        </div>
      </div>
    </div>
  );
};
