import { collection, getDocs, getDoc, doc, updateDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import { db } from "./config";

/**
 * Отримати всіх користувачів
 * @returns {Promise<Array>} Масив користувачів
 */
export const getUsers = async () => {
  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error("Помилка отримання користувачів:", error);
    throw error;
  }
};

/**
 * Отримати одного користувача за ID
 * @param {string} id - ID користувача
 * @returns {Promise<Object>} Дані користувача
 */
export const getUser = async (id) => {
  try {
    const docRef = doc(db, "users", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  } catch (error) {
    console.error("Помилка отримання користувача:", error);
    throw error;
  }
};

/**
 * Оновити роль користувача
 * @param {string} id - ID користувача
 * @param {string} role - Нова роль ('admin' або 'user')
 * @returns {Promise<void>}
 */
export const updateUserRole = async (id, role) => {
  try {
    const docRef = doc(db, "users", id);
    await updateDoc(docRef, {
      role: role,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Помилка оновлення ролі користувача:", error);
    throw error;
  }
};

/**
 * Оновити дані користувача
 * @param {string} id - ID користувача
 * @param {Object} data - Нові дані
 * @returns {Promise<void>}
 */
export const updateUser = async (id, data) => {
  try {
    const docRef = doc(db, "users", id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Помилка оновлення користувача:", error);
    throw error;
  }
};

/**
 * Видалити користувача
 * @param {string} id - ID користувача
 * @returns {Promise<void>}
 */
export const deleteUser = async (id) => {
  try {
    await deleteDoc(doc(db, "users", id));
  } catch (error) {
    console.error("Помилка видалення користувача:", error);
    throw error;
  }
};
