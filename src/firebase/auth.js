import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "./config";

/**
 * Реєстрація нового користувача
 * @param {string} email - Email
 * @param {string} password - Пароль
 * @param {string} displayName - Прізвище та ім'я
 * @returns {Promise<Object>} Дані користувача
 */
export const registerUser = async (email, password, displayName) => {
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
      role: "user", // За замовчуванням - звичайний користувач
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return {
      uid: user.uid,
      email: user.email,
      displayName: displayName,
      role: "user",
    };
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
      role: role || "user",
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

    return {
      uid: newUser.uid,
      email: newUser.email,
      displayName: displayName,
      role: role || "user",
      restaurant: restaurant || "",
      position: position || "",
      workRole: workRole || "",
    };
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
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Отримання додаткових даних з Firestore
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const userData = userDoc.exists() ? userDoc.data() : {};

    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || userData.displayName || "",
      role: userData.role || "user",
    };
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
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        unsubscribe();
        if (user) {
          // Отримання додаткових даних з Firestore
          try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            const userData = userDoc.exists() ? userDoc.data() : {};

            resolve({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || userData.displayName || "",
              role: userData.role || "user",
            });
          } catch (error) {
            console.error("Помилка отримання даних користувача:", error);
            resolve({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || "",
              role: "user",
            });
          }
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
  try {
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          const userData = userDoc.exists() ? userDoc.data() : {};

          callback({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || userData.displayName || "",
            role: userData.role || "user",
          });
        } catch (error) {
          console.error("Помилка отримання даних користувача:", error);
          callback({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || "",
            role: "user",
          });
        }
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
