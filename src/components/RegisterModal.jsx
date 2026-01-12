import { useState } from "react";
import { X } from "lucide-react";
import { registerUser } from "../firebase/auth";

export const RegisterModal = ({ onClose, onSwitchToLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await registerUser(email, password, displayName);
      onClose();
    } catch (error) {
      console.error("Помилка реєстрації:", error);
      if (error.code === "auth/operation-not-allowed") {
        setError("⚠️ Authentication не активовано у Firebase Console. Будь ласка, активуйте Email/Password провайдер.");
      } else if (error.code === "auth/email-already-in-use") {
        setError("Цей email вже використовується");
      } else if (error.code === "auth/weak-password") {
        setError("Пароль занадто слабкий. Мінімум 6 символів");
      } else if (error.code === "auth/invalid-email") {
        setError("Невірний формат email");
      } else {
        setError("Помилка реєстрації. Спробуйте ще раз.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-slate-900">Реєстрація</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition"
          >
            <X size={24} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Прізвище та ім'я
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="Іванов Іван"
            />
          </div>

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
              minLength={6}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              placeholder="••••••••"
            />
            <p className="text-xs text-slate-500 mt-1">Мінімум 6 символів</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition"
          >
            {loading ? "Реєстрація..." : "Зареєструватися"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-slate-600">
          Вже є акаунт?{" "}
          <button
            onClick={onSwitchToLogin}
            className="text-indigo-600 font-semibold hover:text-indigo-500"
          >
            Увійти
          </button>
        </div>
      </div>
    </div>
  );
};
