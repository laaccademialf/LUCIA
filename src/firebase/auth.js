import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "./config";
import { getRuntimePlatformAdminEmails } from "../data/platformAdminSettings";

const ENV_AUTH_API_BASE = String(
  import.meta.env.VITE_AUTH_API_BASE_URL || import.meta.env.VITE_DATA_API_BASE_URL || ""
)
  .trim()
  .replace(/\/+$/, "");
const ENV_AUTH_API_TOKEN = String(
  import.meta.env.VITE_AUTH_API_TOKEN || import.meta.env.VITE_DATA_API_TOKEN || ""
).trim();
const AUTH_SESSION_KEY = "lucia_auth_session_token";
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

const resolveFirebaseUserProfile = async (firebaseUser) => {
  const fallback = {
    uid: firebaseUser?.uid || "",
    email: firebaseUser?.email || "",
    displayName: firebaseUser?.displayName || "",
    role: isPlatformAdminEmail(firebaseUser?.email) ? "admin" : "user",
    restaurant: "",
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

    if (shouldUpsertProfile) {
      await setDoc(
        userRef,
        {
          email: firebaseUser.email || "",
          displayName: firebaseUser.displayName || userData.displayName || "",
          role: resolvedRole,
          restaurant: userData.restaurant || "",
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
      restaurant: userData.restaurant || "",
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
  const runtimeBase = String(runtime?.apiBaseUrl || "").trim().replace(/\/+$/, "");
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
  }
};

const notifyAuthApiSubscribers = (user) => {
  authApiCurrentUser = user || null;
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
  if (sessionToken) headers["x-session-token"] = sessionToken;
  const apiToken = getAuthApiToken();
  if (apiToken) headers["x-api-token"] = apiToken;
  return headers;
};

const authApiRequest = async (path, options = {}) => {
  const response = await fetch(`${getAuthApiBase()}${path}`, options);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(body || `Auth API error ${response.status}`);
    error.code = `auth/api-${response.status}`;
    throw error;
  }
  return response.json().catch(() => ({}));
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
export const createUserByAdmin = async (email, password, displayName, currentUser, currentPassword, restaurant, position, workRole, role = "user") => {
  if (isAuthApiEnabled()) {
    const payload = await authApiRequest("/auth/admin-create-user", {
      method: "POST",
      headers: authApiHeaders(true),
      body: JSON.stringify({
        email,
        password,
        displayName,
        restaurant,
        position,
        workRole,
        role,
        currentPassword,
        currentUserId: currentUser?.uid || "",
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
      restaurant: restaurant || "",
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
      restaurant: restaurant || "",
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
    const user = applyPlatformAdminOverride(payload?.user || null);
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
        const user = applyPlatformAdminOverride(payload?.user || null);
        notifyAuthApiSubscribers(user);
        resolve(user);
      } catch {
        setAuthSessionToken("");
        notifyAuthApiSubscribers(null);
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
