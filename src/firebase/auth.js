import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updateEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "./config";
import { getRuntimePlatformAdminEmails } from "../data/platformAdminSettings";
import {
  getCollectionItemApi,
  listCollectionItemsApi,
} from "./collectionsAdapter";

const normalizeApiBase = (value) => String(value || "").trim().replace(/\/+$/, "").replace(/\/api$/i, "");
const ENV_AUTH_API_BASE = normalizeApiBase(
  import.meta.env.VITE_AUTH_API_BASE_URL || import.meta.env.VITE_DATA_API_BASE_URL || ""
);
const ENV_AUTH_API_TOKEN = String(
  import.meta.env.VITE_AUTH_API_TOKEN || import.meta.env.VITE_DATA_API_TOKEN || ""
).trim();
const AUTH_SESSION_KEY = "lucia_auth_session_token";
const AUTH_USER_CACHE_KEY = "lucia_auth_user_cache";
const DEFAULT_PLATFORM_ADMIN_EMAILS = ["andrii.disha@gmail.com"];
const ENV_PLATFORM_ADMIN_EMAILS = String(import.meta.env.VITE_PLATFORM_ADMIN_EMAILS || "")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const getConfiguredPlatformAdminEmails = () => {
  return Array.from(
    new Set([
      ...DEFAULT_PLATFORM_ADMIN_EMAILS,
      ...ENV_PLATFORM_ADMIN_EMAILS,
      ...getRuntimePlatformAdminEmails(),
    ])
  );
};

const isPlatformAdminEmail = (email) => {
  const normalized = String(email || "").trim().toLowerCase();
  return Boolean(normalized) && getConfiguredPlatformAdminEmails().includes(normalized);
};

const applyPlatformAdminOverride = (user) => {
  if (!user) return null;
  if (!isPlatformAdminEmail(user.email)) return user;
  return {
    ...user,
    role: "admin",
    isPlatformAdmin: true,
  };
};

// Парсимо поле restaurants з різних форматів (масив / JSON-рядок / CSV).
const parseRestaurantsField = (raw) => {
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map((v) => String(v || "").trim()).filter(Boolean)));
  }
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return [];
    if (text.startsWith("[")) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return Array.from(new Set(parsed.map((v) => String(v || "").trim()).filter(Boolean)));
        }
      } catch {
        /* fallthrough */
      }
    }
    return Array.from(new Set(text.split(",").map((v) => v.trim()).filter(Boolean)));
  }
  return [];
};

// Якщо /auth/login або /auth/me не повернули поле restaurants[] (наприклад, бекенд
// застарілий і його ще не оновили), дочитуємо запис користувача напряму з таблиці
// users і мерджимо restaurants. Це дає змогу одразу мати доступ до всіх закладів
// користувача без очікування деплою нового server.js.
const enrichUserWithRestaurants = async (user) => {
  if (!user || typeof user !== "object") return user;

  const existing = parseRestaurantsField(
    user.restaurants ?? user.restaurant_ids ?? user.restaurantIds
  );
  if (existing.length > 0) {
    return { ...user, restaurants: existing };
  }

  const uid = String(user.uid || user.id || "").trim();
  const email = String(user.email || "").trim().toLowerCase();

  let record = null;
  if (uid) {
    record = await getCollectionItemApi("users", uid).catch(() => null);
  }
  if (!record && email) {
    try {
      const all = await listCollectionItemsApi("users");
      record = (Array.isArray(all) ? all : []).find(
        (it) => String(it?.email || it?.user_email || "").trim().toLowerCase() === email
      ) || null;
    } catch {
      record = null;
    }
  }

  if (!record) return user;

  const restaurantsArray = parseRestaurantsField(
    record.restaurants ?? record.restaurant_ids ?? record.restaurantIds
  );
  const primary =
    user.restaurant ||
    record.restaurant ||
    record.restaurant_id ||
    record.restaurant_name ||
    restaurantsArray[0] ||
    "";

  if (restaurantsArray.length === 0 && !primary) return user;

  return {
    ...user,
    restaurant: primary || user.restaurant || "",
    restaurants: restaurantsArray.length > 0
      ? restaurantsArray
      : (primary ? [String(primary).trim()] : []),
    restaurantName:
      user.restaurantName ||
      record.restaurantName ||
      record.restaurant_name ||
      record.restaurant ||
      "",
  };
};

const resolveFirebaseUserProfile = async (firebaseUser) => {
  const fallback = {
    uid: firebaseUser?.uid || "",
    email: firebaseUser?.email || "",
    displayName: firebaseUser?.displayName || "",
    role: isPlatformAdminEmail(firebaseUser?.email) ? "admin" : "user",
    restaurant: "",
    restaurants: [],
    position: "",
    workRole: "",
  };

  if (!firebaseUser?.uid) {
    return applyPlatformAdminOverride(fallback);
  }

  try {
    const userRef = doc(db, "users", firebaseUser.uid);
    const userDoc = await getDoc(userRef);
    const userData = userDoc.exists() ? userDoc.data() : {};
    const shouldForceAdmin = isPlatformAdminEmail(firebaseUser.email);
    const resolvedRole = shouldForceAdmin ? "admin" : userData.role || "user";
    const shouldUpsertProfile = !userDoc.exists() || (shouldForceAdmin && userData.role !== "admin");

    // Multi-restaurant access lives in `restaurants` array on the user record.
    // Accept legacy aliases (restaurant_ids / restaurantIds), JSON-string and CSV.
    const parseRestaurantsArray = (raw) => {
      if (Array.isArray(raw)) {
        return raw.map((v) => String(v || "").trim()).filter(Boolean);
      }
      if (typeof raw === "string") {
        const text = raw.trim();
        if (!text) return [];
        if (text.startsWith("[")) {
          try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
              return parsed.map((v) => String(v || "").trim()).filter(Boolean);
            }
          } catch {
            /* fallthrough */
          }
        }
        return text.split(",").map((v) => v.trim()).filter(Boolean);
      }
      return [];
    };

    const restaurantsArray = (() => {
      const fromArray = parseRestaurantsArray(
        userData.restaurants ?? userData.restaurant_ids ?? userData.restaurantIds
      );
      if (fromArray.length > 0) return fromArray;
      const single = String(userData.restaurant || "").trim();
      return single ? [single] : [];
    })();
    const primaryRestaurant = String(userData.restaurant || restaurantsArray[0] || "").trim();

    if (shouldUpsertProfile) {
      await setDoc(
        userRef,
        {
          email: firebaseUser.email || "",
          displayName: firebaseUser.displayName || userData.displayName || "",
          role: resolvedRole,
          restaurant: primaryRestaurant,
          restaurants: restaurantsArray,
          position: userData.position || "",
          workRole: userData.workRole || "",
          ...(userDoc.exists() ? {} : { createdAt: new Date().toISOString() }),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    return applyPlatformAdminOverride({
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName || userData.displayName || "",
      role: resolvedRole,
      restaurant: primaryRestaurant,
      restaurants: restaurantsArray,
      position: userData.position || "",
      workRole: userData.workRole || "",
    });
  } catch (error) {
    console.error("Помилка отримання профілю користувача:", error);
    return applyPlatformAdminOverride(fallback);
  }
};

const readRuntimeCustomConfig = () => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem("lucia_runtime_custom_config");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

const getAuthApiBase = () => {
  const runtime = readRuntimeCustomConfig();
  const runtimeBase = normalizeApiBase(runtime?.apiBaseUrl || "");
  return runtimeBase || ENV_AUTH_API_BASE;
};

const getAuthApiToken = () => {
  const runtime = readRuntimeCustomConfig();
  const runtimeToken = String(runtime?.token || "").trim();
  return runtimeToken || ENV_AUTH_API_TOKEN;
};

let authApiCurrentUser = null;
const authApiSubscribers = new Set();

export const isAuthApiEnabled = () => Boolean(getAuthApiBase());

const getAuthSessionToken = () => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return "";
  return String(localStorage.getItem(AUTH_SESSION_KEY) || "");
};

const setAuthSessionToken = (token) => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  if (token) {
    localStorage.setItem(AUTH_SESSION_KEY, token);
  } else {
    localStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem(AUTH_USER_CACHE_KEY);
  }
};

const setCachedAuthUser = (user) => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  if (!user || typeof user !== "object") {
    localStorage.removeItem(AUTH_USER_CACHE_KEY);
    return;
  }
  try {
    localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(user));
  } catch {
    // ignore cache write issues
  }
};

const getCachedAuthUser = () => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(AUTH_USER_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return applyPlatformAdminOverride(parsed);
  } catch {
    return null;
  }
};

const notifyAuthApiSubscribers = (user) => {
  authApiCurrentUser = user || null;
  setCachedAuthUser(authApiCurrentUser);
  authApiSubscribers.forEach((callback) => {
    try {
      callback(authApiCurrentUser);
    } catch {
      // no-op
    }
  });
};

const authApiHeaders = (withJson = true) => {
  const headers = {};
  if (withJson) headers["Content-Type"] = "application/json";
  const sessionToken = getAuthSessionToken();
  if (sessionToken) {
    headers["x-session-token"] = sessionToken;
    headers.Authorization = `Bearer ${sessionToken}`;
  }
  const apiToken = getAuthApiToken();
  if (apiToken) headers["x-api-token"] = apiToken;
  return headers;
};

const authApiRequest = async (path, options = {}) => {
  const response = await fetch(`${getAuthApiBase()}${path}`, options);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let normalizedMessage = body || `Auth API error ${response.status}`;
    if (body) {
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === "object") {
          const apiError = String(parsed?.error || "").trim();
          const apiMessage = String(parsed?.message || "").trim();
          if (apiError) normalizedMessage = apiError;
          else if (apiMessage) normalizedMessage = apiMessage;
        }
      } catch {
        // body is not JSON
      }
    }

    const error = new Error(normalizedMessage);
    error.status = response.status;
    error.code = `auth/api-${response.status}`;
    throw error;
  }
  return response.json().catch(() => ({}));
};

const isUnauthorizedAuthError = (error) => {
  const status = Number(error?.status);
  if (status === 401 || status === 403) return true;

  const code = String(error?.code || "").toLowerCase();
  return code === "auth/api-401" || code === "auth/api-403";
};

/**
 * Реєстрація нового користувача
 * @param {string} email - Email
 * @param {string} password - Пароль
 * @param {string} displayName - Прізвище та ім'я
 * @returns {Promise<Object>} Дані користувача
 */
export const registerUser = async (email, password, displayName) => {
  if (isAuthApiEnabled()) {
    const payload = await authApiRequest("/auth/register", {
      method: "POST",
      headers: authApiHeaders(true),
      body: JSON.stringify({ email, password, displayName }),
    });

    setAuthSessionToken(String(payload?.token || ""));
    const user = applyPlatformAdminOverride(payload?.user || null);
    notifyAuthApiSubscribers(user);
    return user;
  }

  try {
    // Створення користувача в Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Оновлення профілю з ім'ям
    await updateProfile(user, { displayName });

    // Збереження додаткових даних в Firestore
    await setDoc(doc(db, "users", user.uid), {
      email: user.email,
      displayName: displayName,
      role: isPlatformAdminEmail(user.email) ? "admin" : "user",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return applyPlatformAdminOverride({
      uid: user.uid,
      email: user.email,
      displayName: displayName,
      role: "user",
    });
  } catch (error) {
    console.error("Помилка реєстрації:", error);
    throw error;
  }
};

/**
 * Створення користувача адміністратором (без автологіну)
 * @param {string} email - Email
 * @param {string} password - Пароль
 * @param {string} displayName - Прізвище та ім'я
 * @param {Object} currentUser - Поточний користувач (адміністратор)
 * @param {string} currentPassword - Пароль поточного користувача
 * @param {string} restaurant - ID ресторану
 * @param {string} position - Посада
 * @param {string} workRole - Робоча роль
 * @param {string} role - Системна роль (user або admin)
 * @returns {Promise<Object>} Дані створеного користувача
 */
export const createUserByAdmin = async (email, password, displayName, currentUser, currentPassword, restaurant, position, workRole, role = "user", restaurants = null) => {
  const restaurantsList = Array.isArray(restaurants)
    ? Array.from(new Set(restaurants.map((v) => String(v || "").trim()).filter(Boolean)))
    : restaurant
      ? [String(restaurant).trim()].filter(Boolean)
      : [];
  const primaryRestaurant = String(restaurant || restaurantsList[0] || "").trim();

  if (isAuthApiEnabled()) {
    const effectiveCurrentUser = currentUser || authApiCurrentUser || getCachedAuthUser();
    const payload = await authApiRequest("/auth/admin-create-user", {
      method: "POST",
      headers: authApiHeaders(true),
      body: JSON.stringify({
        email,
        password,
        displayName,
        restaurant: primaryRestaurant,
        restaurants: restaurantsList,
        position,
        workRole,
        role,
        currentPassword,
        currentUserId: effectiveCurrentUser?.uid || effectiveCurrentUser?.id || "",
      }),
    });

    return applyPlatformAdminOverride(payload?.user || null);
  }

  try {
    // Зберігаємо дані поточного користувача
    const adminEmail = currentUser.email;
    
    // Створюємо нового користувача (це автоматично логінить під ним)
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const newUser = userCredential.user;

    // Оновлюємо профіль нового користувача
    await updateProfile(newUser, { displayName });

    // Зберігаємо дані в Firestore
    await setDoc(doc(db, "users", newUser.uid), {
      email: newUser.email,
      displayName: displayName,
      role: isPlatformAdminEmail(newUser.email) ? "admin" : role || "user",
      restaurant: primaryRestaurant,
      restaurants: restaurantsList,
      position: position || "",
      workRole: workRole || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Виходимо з нового облікового запису
    await signOut(auth);

    // Повертаємось до адміністраторського облікового запису
    await signInWithEmailAndPassword(auth, adminEmail, currentPassword);

    return applyPlatformAdminOverride({
      uid: newUser.uid,
      email: newUser.email,
      displayName: displayName,
      role: role || "user",
      restaurant: primaryRestaurant,
      restaurants: restaurantsList,
      position: position || "",
      workRole: workRole || "",
    });
  } catch (error) {
    console.error("Помилка створення користувача:", error);
    throw error;
  }
};

/**
 * Вхід користувача
 * @param {string} email - Email
 * @param {string} password - Пароль
 * @returns {Promise<Object>} Дані користувача
 */
export const loginUser = async (email, password) => {
  if (isAuthApiEnabled()) {
    const payload = await authApiRequest("/auth/login", {
      method: "POST",
      headers: authApiHeaders(true),
      body: JSON.stringify({ email, password }),
    });

    setAuthSessionToken(String(payload?.token || ""));
    let user = applyPlatformAdminOverride(payload?.user || null);
    try {
      user = await enrichUserWithRestaurants(user);
    } catch { /* noop */ }
    notifyAuthApiSubscribers(user);
    return user;
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return await resolveFirebaseUserProfile(userCredential.user);
  } catch (error) {
    console.error("Помилка входу:", error);
    throw error;
  }
};

/**
 * Вихід користувача
 * @returns {Promise<void>}
 */
export const logoutUser = async () => {
  if (isAuthApiEnabled()) {
    try {
      await authApiRequest("/auth/logout", {
        method: "POST",
        headers: authApiHeaders(true),
        body: JSON.stringify({}),
      });
    } finally {
      setAuthSessionToken("");
      notifyAuthApiSubscribers(null);
    }
    return;
  }

  try {
    await signOut(auth);
  } catch (error) {
    console.error("Помилка виходу:", error);
    throw error;
  }
};

/**
 * Оновити профіль поточного користувача
 * @param {{displayName?: string, email?: string, currentPassword?: string}} payload
 * @returns {Promise<Object>} Оновлений профіль
 */
export const updateCurrentUserProfile = async ({ displayName, email, currentPassword } = {}) => {
  const nextDisplayName = String(displayName || "").trim();
  const nextEmail = String(email || "").trim();

  if (isAuthApiEnabled()) {
    const response = await authApiRequest("/auth/update-profile", {
      method: "POST",
      headers: authApiHeaders(true),
      body: JSON.stringify({
        displayName: nextDisplayName,
        email: nextEmail,
        currentPassword: String(currentPassword || ""),
      }),
    });

    const updatedUser = applyPlatformAdminOverride(response?.user || null);
    if (updatedUser) {
      notifyAuthApiSubscribers(updatedUser);
      return updatedUser;
    }
    return getCurrentUser();
  }

  const current = auth.currentUser;
  if (!current) {
    throw new Error("Користувач не авторизований");
  }

  const currentEmail = String(current.email || "").trim();
  const emailChanged = Boolean(nextEmail) && nextEmail !== currentEmail;

  // Для зміни email у Firebase може знадобитися повторна автентифікація
  if (emailChanged) {
    const pwd = String(currentPassword || "").trim();
    if (!pwd) {
      const err = new Error("Для зміни email введіть поточний пароль");
      err.code = "auth/requires-current-password";
      throw err;
    }
    const credential = EmailAuthProvider.credential(currentEmail, pwd);
    await reauthenticateWithCredential(current, credential);
    await updateEmail(current, nextEmail);
  }

  if (nextDisplayName && nextDisplayName !== String(current.displayName || "")) {
    await updateProfile(current, { displayName: nextDisplayName });
  }

  await setDoc(
    doc(db, "users", current.uid),
    {
      email: emailChanged ? nextEmail : currentEmail,
      displayName: nextDisplayName || current.displayName || "",
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return await resolveFirebaseUserProfile(current);
};

/**
 * Змінити пароль поточного користувача
 * @param {{currentPassword: string, newPassword: string}} payload
 * @returns {Promise<boolean>}
 */
export const changeCurrentUserPassword = async ({ currentPassword, newPassword } = {}) => {
  const currentPwd = String(currentPassword || "").trim();
  const nextPwd = String(newPassword || "").trim();

  if (!currentPwd || !nextPwd) {
    throw new Error("Заповніть поточний та новий пароль");
  }

  if (isAuthApiEnabled()) {
    const effectiveUser = authApiCurrentUser || getCachedAuthUser();
    await authApiRequest("/auth/change-password", {
      method: "POST",
      headers: authApiHeaders(true),
      body: JSON.stringify({
        currentPassword: currentPwd,
        newPassword: nextPwd,
        currentUserId: effectiveUser?.uid || effectiveUser?.id || "",
      }),
    });
    return true;
  }

  const current = auth.currentUser;
  if (!current || !current.email) {
    throw new Error("Користувач не авторизований");
  }

  const credential = EmailAuthProvider.credential(current.email, currentPwd);
  await reauthenticateWithCredential(current, credential);
  await updatePassword(current, nextPwd);
  return true;
};

export const adminResetUserPassword = async (targetUserId, currentPassword, defaultPassword = "Qwerty1") => {
  if (!isAuthApiEnabled()) {
    throw new Error("Admin reset password доступний лише в API режимі");
  }

  const normalizedTargetUserId = String(targetUserId || "").trim();
  const normalizedCurrentPassword = String(currentPassword || "").trim();
  if (!normalizedTargetUserId) {
    throw new Error("Не вказано користувача для скидання пароля");
  }
  if (!normalizedCurrentPassword) {
    throw new Error("Введіть ваш пароль для підтвердження");
  }

  const effectiveUser = authApiCurrentUser || getCachedAuthUser();
  const payload = await authApiRequest("/auth/admin-reset-user-password", {
    method: "POST",
    headers: authApiHeaders(true),
    body: JSON.stringify({
      targetUserId: normalizedTargetUserId,
      currentPassword: normalizedCurrentPassword,
      defaultPassword: String(defaultPassword || "Qwerty1").trim() || "Qwerty1",
      currentUserId: effectiveUser?.uid || effectiveUser?.id || "",
    }),
  });

  return {
    ok: Boolean(payload?.ok),
    defaultPassword: String(payload?.defaultPassword || defaultPassword || "Qwerty1"),
  };
};

/**
 * Отримання поточного користувача
 * @returns {Promise<Object|null>} Дані користувача або null
 */
export const getCurrentUser = () => {
  if (isAuthApiEnabled()) {
    return new Promise(async (resolve) => {
      const token = getAuthSessionToken();
      if (!token) {
        notifyAuthApiSubscribers(null);
        resolve(null);
        return;
      }

      try {
        const payload = await authApiRequest("/auth/me", {
          method: "GET",
          headers: authApiHeaders(false),
        });
        let user = applyPlatformAdminOverride(payload?.user || null);
        try {
          user = await enrichUserWithRestaurants(user);
        } catch { /* noop */ }

        // Деякі проксі можуть загубити нестандартний заголовок сесії на окремих запитах.
        // Якщо токен локально є, але /auth/me повернув user:null, зберігаємо поточну сесію.
        if (!user) {
          const cachedUser = getCachedAuthUser();
          if (token && cachedUser) {
            notifyAuthApiSubscribers(cachedUser);
            resolve(cachedUser);
            return;
          }
        }

        notifyAuthApiSubscribers(user);
        resolve(user);
      } catch (error) {
        if (isUnauthorizedAuthError(error)) {
          setAuthSessionToken("");
          notifyAuthApiSubscribers(null);
          resolve(null);
          return;
        }

        // Тимчасові помилки бекенду/мережі не повинні розлогінювати користувача.
        if (authApiCurrentUser) {
          resolve(authApiCurrentUser);
          return;
        }

        const cachedUser = getCachedAuthUser();
        if (cachedUser) {
          notifyAuthApiSubscribers(cachedUser);
          resolve(cachedUser);
          return;
        }

        resolve(null);
      }
    });
  }

  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        unsubscribe();
        if (user) {
          resolve(await resolveFirebaseUserProfile(user));
        } else {
          resolve(null);
        }
      },
      reject
    );
  });
};

/**
 * Підписка на зміни стану автентифікації
 * @param {Function} callback - Функція, яка викликається при зміні стану
 * @returns {Function} Функція відписки
 */
export const subscribeToAuthChanges = (callback) => {
  if (isAuthApiEnabled()) {
    authApiSubscribers.add(callback);

    if (authApiCurrentUser !== null) {
      callback(authApiCurrentUser);
    } else {
      getCurrentUser().then((user) => callback(user));
    }

    return () => {
      authApiSubscribers.delete(callback);
    };
  }

  try {
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        callback(await resolveFirebaseUserProfile(user));
      } else {
        callback(null);
      }
    });
  } catch (error) {
    console.error("Помилка ініціалізації Auth:", error);
    // Повертаємо пусту функцію відписки
    callback(null);
    return () => {};
  }
};

/**
 * Створення адміністратора (для ініціалізації)
 * @param {string} email - Email
 * @param {string} password - Пароль
 * @param {string} displayName - Прізвище та ім'я
 * @returns {Promise<Object>} Дані адміністратора
 */
export const createAdmin = async (email, password, displayName) => {
  if (isAuthApiEnabled()) {
    const user = await registerUser(email, password, displayName);
    return {
      ...user,
      role: "admin",
    };
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await updateProfile(user, { displayName });

    await setDoc(doc(db, "users", user.uid), {
      email: user.email,
      displayName: displayName,
      role: "admin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return {
      uid: user.uid,
      email: user.email,
      displayName: displayName,
      role: "admin",
    };
  } catch (error) {
    console.error("Помилка створення адміністратора:", error);
    throw error;
  }
};
