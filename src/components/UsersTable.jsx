import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { Users, Shield, User, Trash2, AlertCircle, Edit2, X, Save, KeyRound, Search } from "lucide-react";
import { getUsers, updateUserRole, deleteUser, updateUser } from "../firebase/users";
import { getRestaurants } from "../firebase/firestore";
import { getPositions, getWorkRoles } from "../firebase/rolesPositions";
import { adminResetUserPassword } from "../firebase/auth";

export const UsersTable = ({ currentUser }) => {
  const { user: authUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [positions, setPositions] = useState([]);
  const [workRoles, setWorkRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [resettingPasswordUserId, setResettingPasswordUserId] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editForm, setEditForm] = useState({
    displayName: "",
    email: "",
    restaurant: "",
    restaurants: [],
    position: "",
    workRole: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [usersData, restaurantsData, positionsData, rolesData] = await Promise.all([
        getUsers(),
        getRestaurants(),
        getPositions(),
        getWorkRoles(),
      ]);
      setUsers(usersData);
      setRestaurants(restaurantsData);
      setPositions(positionsData);
      setWorkRoles(rolesData);
    } catch (error) {
      console.error("Помилка завантаження даних:", error);
      setError("Не вдалося завантажити дані");
    } finally {
      setLoading(false);
    }
  };

  const getRestaurantName = (restaurantId) => {
    const restaurant = restaurants.find(r => r.id === restaurantId);
    return restaurant ? restaurant.name : "-";
  };

  const getUserRestaurantIds = (user) => {
    if (Array.isArray(user?.restaurants) && user.restaurants.length > 0) {
      return user.restaurants.map((id) => String(id || "").trim()).filter(Boolean);
    }
    const single = String(user?.restaurant || "").trim();
    return single ? [single] : [];
  };

  const formatUserRestaurants = (user) => {
    const ids = getUserRestaurantIds(user);
    if (ids.length === 0) return "-";
    const names = ids.map((id) => getRestaurantName(id));
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  };

  const normalizeSearchText = (value) => String(value || "").toLowerCase().trim().replace(/\s+/g, " ");

  const handleRoleToggle = async (userId, currentRole) => {
    if (currentUser?.uid === userId) {
      setError("Ви не можете змінити власну роль");
      return;
    }

    const newRole = currentRole === "admin" ? "user" : "admin";
    const confirmMessage = newRole === "admin" 
      ? "Ви впевнені що хочете надати права адміністратора цьому користувачу?"
      : "Ви впевнені що хочете забрати права адміністратора у цього користувача?";
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setUpdatingUserId(userId);
      setError("");
      await updateUserRole(userId, newRole);
      
      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, role: newRole } : user
        )
      );
    } catch (error) {
      console.error("Помилка зміни ролі:", error);
      setError("Не вдалося змінити роль користувача");
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (currentUser?.uid === userId) {
      setError("Ви не можете видалити власний обліковий запис");
      return;
    }

    try {
      setDeletingUserId(userId);
      setError("");
      await deleteUser(userId);
      
      setUsers((prev) => prev.filter((user) => user.id !== userId));
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error("Помилка видалення користувача:", error);
      setError("Не вдалося видалити користувача");
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user.id);
    setEditForm({
      displayName: user.displayName || "",
      email: user.email || "",
      restaurant: user.restaurant || "",
      restaurants: getUserRestaurantIds(user),
      position: user.position || "",
      workRole: user.workRole || "",
    });
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setEditForm({
      displayName: "",
      email: "",
      restaurant: "",
      restaurants: [],
      position: "",
      workRole: "",
    });
  };

  const handleSaveEdit = async () => {
    try {
      setError("");
      const normalizedRestaurants = Array.from(
        new Set((editForm.restaurants || []).map((id) => String(id || "").trim()).filter(Boolean))
      );
      const payload = {
        ...editForm,
        restaurants: normalizedRestaurants,
        restaurant: normalizedRestaurants[0] || "",
      };
      await updateUser(editingUser, payload);
      
      setUsers((prev) =>
        prev.map((user) =>
          user.id === editingUser ? { ...user, ...payload } : user
        )
      );
      
      setEditingUser(null);
      setEditForm({
        displayName: "",
        email: "",
        restaurant: "",
        restaurants: [],
        position: "",
        workRole: "",
      });
    } catch (error) {
      console.error("Помилка оновлення користувача:", error);
      setError("Не вдалося оновити дані користувача");
    }
  };

  const handleResetPassword = async (targetUser) => {
    if (!targetUser?.id) return;
    if (currentUser?.uid === targetUser.id) {
      setError("Для власного акаунта використовуйте зміну пароля у профілі");
      return;
    }

    const adminPassword = window.prompt("Введіть ваш пароль адміністратора для скидання пароля користувача:");
    if (adminPassword === null) return;
    if (!String(adminPassword || "").trim()) {
      setError("Введіть ваш пароль для підтвердження");
      return;
    }

    const confirmed = window.confirm(
      `Скинути пароль користувача ${targetUser.displayName || targetUser.email || targetUser.id} до значення Qwerty1?`
    );
    if (!confirmed) return;

    try {
      setResettingPasswordUserId(targetUser.id);
      setError("");
      await adminResetUserPassword(targetUser.id, adminPassword, "Qwerty1");
      alert(`Пароль користувача ${targetUser.displayName || targetUser.email || targetUser.id} скинуто до Qwerty1`);
    } catch (resetError) {
      console.error("Помилка скидання пароля:", resetError);
      setError(resetError?.message || "Не вдалося скинути пароль користувача");
    } finally {
      setResettingPasswordUserId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // Визначаємо, чи керуючий
  const isManager = authUser && authUser.workRole === "Керуючий";
  // Набір доступних ресторанів керуючого (переважно user.restaurants, фолбек — user.restaurant)
  const managerRestaurantIds = isManager
    ? Array.from(new Set(getUserRestaurantIds(authUser)))
    : [];
  // Якщо керуючий — відображаємо лише користувачів з перетином по ресторанах
  const visibleUsers = isManager && managerRestaurantIds.length > 0
    ? users.filter(u => {
        const ids = getUserRestaurantIds(u);
        return ids.some((id) => managerRestaurantIds.includes(id));
      })
    : users;
  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const filteredUsers = normalizedSearchQuery
    ? visibleUsers.filter((user) => {
        const userName = normalizeSearchText(user.displayName);
        if (!userName) return false;
        if (userName.includes(normalizedSearchQuery)) return true;
        const searchTokens = normalizedSearchQuery.split(" ").filter(Boolean);
        return searchTokens.every((token) => userName.includes(token));
      })
    : visibleUsers;

  return (
    <div className="card p-6 bg-white border border-slate-200 shadow-xl">
      <div className="flex items-center gap-3 mb-6">
        <Users className="text-indigo-600" size={24} />
        <h2 className="text-xl font-semibold text-slate-900">Управління користувачами</h2>
        <span className="ml-auto text-sm text-slate-500">{filteredUsers.length} з {visibleUsers.length} користувачів</span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Інформаційна підказка про ролі */}
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-3">
          <Shield size={20} className="text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">Управління правами адміністратора</p>
            <p className="text-blue-700">
              Натисніть на роль користувача щоб змінити її. <strong>Адміністратори</strong> мають повний доступ до всіх функцій системи,
              включаючи управління користувачами, ресторанами та налаштуваннями. Будьте обережні надаючи права адміністратора.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Пошук за прізвищем та іменем"
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {filteredUsers.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Users size={48} className="mx-auto mb-3 opacity-50" />
          <p>{normalizedSearchQuery ? "Користувачів за таким запитом не знайдено" : "Немає користувачів"}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                  Користувач
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                  Email
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                  Ресторан
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                  Посада
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                  Робоча роль
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                  Системна роль
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                  Створено
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">
                  Дії
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const isCurrentUser = currentUser?.uid === user.id;
                const isUpdating = updatingUserId === user.id;
                const isDeleting = deletingUserId === user.id;
                const isResettingPassword = resettingPasswordUserId === user.id;

                return (
                  <tr
                    key={user.id}
                    className={`border-b border-slate-100 hover:bg-slate-50 ${
                      isCurrentUser ? "bg-indigo-50" : ""
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {user.role === "admin" ? (
                          <Shield size={16} className="text-amber-600" />
                        ) : (
                          <User size={16} className="text-slate-400" />
                        )}
                        <span className="font-medium text-slate-900">
                          {user.displayName || "Без імені"}
                          {isCurrentUser && (
                            <span className="ml-2 text-xs text-indigo-600 font-semibold">
                              (Ви)
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">{user.email}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {formatUserRestaurants(user)}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {user.position || "-"}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {user.workRole || "-"}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleRoleToggle(user.id, user.role)}
                        disabled={isCurrentUser || isUpdating}
                        title={isCurrentUser ? "Ви не можете змінити власну роль" : "Натисніть щоб змінити роль"}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition ${
                          user.role === "admin"
                            ? "bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300"
                        } ${
                          isCurrentUser || isUpdating
                            ? "opacity-50 cursor-not-allowed"
                            : "cursor-pointer"
                        }`}
                      >
                        {isUpdating ? (
                          <>
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></div>
                            Оновлення...
                          </>
                        ) : (
                          <>
                            {user.role === "admin" ? (
                              <>
                                <Shield size={12} />
                                Адміністратор
                              </>
                            ) : (
                              <>
                                <User size={12} />
                                Користувач
                              </>
                            )}
                          </>
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {user.createdAt
                        ? new Date(user.createdAt).toLocaleDateString("uk-UA")
                        : "-"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {showDeleteConfirm === user.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            disabled={isDeleting}
                            className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-red-400"
                          >
                            {isDeleting ? "..." : "Так"}
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(null)}
                            className="px-3 py-1 text-xs bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
                          >
                            Ні
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEditUser(user)}
                            disabled={isCurrentUser}
                            className={`text-blue-600 hover:text-blue-800 disabled:text-blue-300 disabled:cursor-not-allowed transition ${
                              isCurrentUser ? "opacity-30" : ""
                            }`}
                            title={isCurrentUser ? "Не можна редагувати себе" : "Редагувати"}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleResetPassword(user)}
                            disabled={isCurrentUser || isResettingPassword}
                            className={`text-amber-600 hover:text-amber-800 disabled:text-amber-300 disabled:cursor-not-allowed transition ${
                              isCurrentUser ? "opacity-30" : ""
                            }`}
                            title={isCurrentUser ? "Для себе змініть пароль у профілі" : "Скинути пароль до Qwerty1"}
                          >
                            {isResettingPassword ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                            ) : (
                              <KeyRound size={16} />
                            )}
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(user.id)}
                            disabled={isCurrentUser || isDeleting}
                            className={`text-red-600 hover:text-red-800 disabled:text-red-300 disabled:cursor-not-allowed transition ${
                              isCurrentUser ? "opacity-30" : ""
                            }`}
                            title={isCurrentUser ? "Не можна видалити себе" : "Видалити"}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Модальне вікно редагування */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Edit2 className="text-indigo-600" size={24} />
                <h3 className="text-xl font-semibold text-slate-900">Редагування користувача</h3>
              </div>
              <button
                onClick={handleCancelEdit}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-2">
                  Прізвище та ім'я
                </label>
                <input
                  type="text"
                  value={editForm.displayName}
                  onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="Іванов Іван"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  disabled
                  className="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
                />
                <p className="text-xs text-slate-500 mt-1">Email не можна змінити</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-2">
                  Ресторани (доступ)
                </label>
                {(() => {
                  const allowed = isManager && managerRestaurantIds.length > 0
                    ? restaurants.filter((r) => managerRestaurantIds.includes(String(r.id)))
                    : restaurants;
                  if (allowed.length === 0) {
                    return (
                      <p className="text-sm text-slate-500">Немає доступних ресторанів</p>
                    );
                  }
                  return (
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-300 bg-white px-3 py-2 space-y-1">
                      {allowed.map((restaurant) => {
                        const checked = (editForm.restaurants || []).map(String).includes(String(restaurant.id));
                        return (
                          <label
                            key={restaurant.id}
                            className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer hover:bg-slate-50 px-1 py-0.5 rounded"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setEditForm((prev) => {
                                  const current = Array.isArray(prev.restaurants) ? prev.restaurants.map(String) : [];
                                  const next = e.target.checked
                                    ? Array.from(new Set([...current, String(restaurant.id)]))
                                    : current.filter((id) => id !== String(restaurant.id));
                                  return {
                                    ...prev,
                                    restaurants: next,
                                    restaurant: next[0] || "",
                                  };
                                });
                              }}
                            />
                            <span>{restaurant.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })()}
                <p className="text-xs text-slate-500 mt-1">
                  Користувач матиме доступ до всіх відмічених ресторанів. Перший зі списку вважається основним.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-2">
                  Посада
                </label>
                <select
                  value={editForm.position}
                  onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">Оберіть посаду</option>
                  {positions.map((position) => (
                    <option key={position.id} value={position.name}>
                      {position.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-2">
                  Робоча роль
                </label>
                <select
                  value={editForm.workRole}
                  onChange={(e) => setEditForm({ ...editForm, workRole: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">Оберіть роль (необов'язково)</option>
                  {workRoles.map((role) => (
                    <option key={role.id} value={role.name}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
              <button
                onClick={handleCancelEdit}
                className="px-5 py-2 rounded-lg bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition"
              >
                Скасувати
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 transition shadow"
              >
                <Save size={18} />
                Зберегти
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
