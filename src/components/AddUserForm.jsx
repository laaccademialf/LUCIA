import { useState, useEffect } from "react";
import { UserPlus, Lock } from "lucide-react";
import { createUserByAdmin } from "../firebase/auth";
import { getRestaurants } from "../firebase/firestore";
import { getPositions, getWorkRoles } from "../firebase/rolesPositions";

export const AddUserForm = ({ onSuccess, currentUser }) => {
  const [formData, setFormData] = useState({
    displayName: "",
    email: "",
    password: "",
    role: "user",
    restaurant: "",
    position: "",
    workRole: "",
  });
  const [restaurants, setRestaurants] = useState([]);
  const [positions, setPositions] = useState([]);
  const [workRoles, setWorkRoles] = useState([]);
  const [adminPassword, setAdminPassword] = useState("");
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [restaurantsData, positionsData, rolesData] = await Promise.all([
        getRestaurants(),
        getPositions(),
        getWorkRoles(),
      ]);
      setRestaurants(restaurantsData);
      setPositions(positionsData);
      setWorkRoles(rolesData);
    } catch (error) {
      console.error("Помилка завантаження даних:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    
    // Показуємо запит пароля адміністратора
    setShowPasswordPrompt(true);
  };

  const handleConfirmCreate = async () => {
    if (!adminPassword) {
      setError("Введіть ваш пароль для підтвердження");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await createUserByAdmin(
        formData.email,
        formData.password,
        formData.displayName,
        currentUser,
        adminPassword,
        formData.restaurant,
        formData.position,
        formData.workRole,
        formData.role
      );
      
      setSuccess(`Користувач ${formData.displayName} успішно створений!`);
      setFormData({
        displayName: "",
        email: "",
        password: "",
        role: "user",
        restaurant: "",
        position: "",
        workRole: "",
      });
      setAdminPassword("");
      setShowPasswordPrompt(false);
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Помилка створення користувача:", error);
      if (error.code === "auth/email-already-in-use") {
        setError("Цей email вже використовується");
      } else if (error.code === "auth/weak-password") {
        setError("Пароль занадто слабкий. Мінімум 6 символів");
      } else if (error.code === "auth/invalid-email") {
        setError("Невірний формат email");
      } else if (error.code === "auth/wrong-password") {
        setError("❌ Невірний пароль адміністратора");
      } else if (error.code === "auth/operation-not-allowed") {
        setError("⚠️ Authentication не активовано у Firebase Console");
      } else {
        setError("Помилка створення користувача: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const baseInput = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none";

  return (
    <div className="card p-6 bg-white border border-slate-200 shadow-xl max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <UserPlus className="text-indigo-600" size={24} />
        <h2 className="text-xl font-semibold text-slate-900">Додати нового користувача</h2>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-100 border border-green-300 text-green-700 rounded-lg text-sm">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">
            Прізвище та ім'я *
          </label>
          <input
            type="text"
            value={formData.displayName}
            onChange={(e) => setFormData((prev) => ({ ...prev, displayName: e.target.value }))}
            required
            className={baseInput}
            placeholder="Іванов Іван"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">
            Email *
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
            required
            className={baseInput}
            placeholder="email@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">
            Пароль *
          </label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
            required
            minLength={6}
            className={baseInput}
            placeholder="Мінімум 6 символів"
          />
          <p className="text-xs text-slate-500 mt-1">Мінімум 6 символів</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">
            Ресторан *
          </label>
          <select
            value={formData.restaurant}
            onChange={(e) => setFormData((prev) => ({ ...prev, restaurant: e.target.value }))}
            required
            className={baseInput}
          >
            <option value="">Оберіть ресторан</option>
            {restaurants.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">
            Посада *
          </label>
          <select
            value={formData.position}
            onChange={(e) => setFormData((prev) => ({ ...prev, position: e.target.value }))}
            required
            className={baseInput}
          >
            <option value="">Оберіть посаду</option>
            {positions.map((position) => (
              <option key={position.id} value={position.name}>
                {position.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">
            Якщо немає потрібної посади, додайте її в розділі "Ролі та доступи"
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">
            Робоча роль
          </label>
          <select
            value={formData.workRole}
            onChange={(e) => setFormData((prev) => ({ ...prev, workRole: e.target.value }))}
            className={baseInput}
          >
            <option value="">Оберіть роль (необов'язково)</option>
            {workRoles.map((role) => (
              <option key={role.id} value={role.name}>
                {role.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">
            Якщо немає потрібної ролі, додайте її в розділі "Ролі та доступи"
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-800 mb-2">
            Системна роль *
          </label>
          <select
            value={formData.role}
            onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value }))}
            className={baseInput}
          >
            <option value="user">Користувач</option>
            <option value="admin">Адміністратор</option>
          </select>
          <p className="text-xs text-slate-500 mt-1">
            <strong>Адміністратори</strong> мають повний доступ до всіх функцій системи. 
            Роль також можна змінити пізніше у розділі "Редагувати"
          </p>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition shadow"
          >
            {loading ? "Створення..." : "Створити користувача"}
          </button>
        </div>
      </form>

      {/* Модальне вікно підтвердження */}
      {showPasswordPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="text-indigo-600" size={24} />
              <h3 className="text-lg font-semibold text-slate-900">Підтвердження створення</h3>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              Для створення нового користувача введіть ваш пароль адміністратора для підтвердження
            </p>

            {error && error.includes("пароль") && (
              <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-800 mb-2">
                Ваш пароль *
              </label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className={baseInput}
                placeholder="Введіть пароль"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && adminPassword) {
                    handleConfirmCreate();
                  }
                }}
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowPasswordPrompt(false);
                  setAdminPassword("");
                  setError("");
                }}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 disabled:opacity-50"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={handleConfirmCreate}
                disabled={loading || !adminPassword}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition"
              >
                {loading ? "Створення..." : "Підтвердити"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
