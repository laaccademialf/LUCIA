import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "./config";

// ==================== РЕСТОРАНИ ====================

/**
 * Отримати всі ресторани
 * @returns {Promise<Array>} Масив ресторанів
 */
export const getRestaurants = async () => {
  try {
    const restaurantsRef = collection(db, "restaurants");
    const q = query(restaurantsRef, orderBy("regNumber"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error("Помилка отримання ресторанів:", error);
    throw error;
  }
};

/**
 * Отримати один ресторан за ID
 * @param {string} id - ID ресторану
 * @returns {Promise<Object>} Дані ресторану
 */
export const getRestaurant = async (id) => {
  try {
    const docRef = doc(db, "restaurants", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  } catch (error) {
    console.error("Помилка отримання ресторану:", error);
    throw error;
  }
};

/**
 * Додати новий ресторан
 * @param {Object} restaurant - Дані ресторану
 * @returns {Promise<string>} ID створеного документа
 */
export const addRestaurant = async (restaurant) => {
  try {
    const docRef = await addDoc(collection(db, "restaurants"), {
      ...restaurant,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Помилка додавання ресторану:", error);
    throw error;
  }
};

/**
 * Оновити ресторан
 * @param {string} id - ID ресторану
 * @param {Object} data - Нові дані
 * @returns {Promise<void>}
 */
export const updateRestaurant = async (id, data) => {
  try {
    const docRef = doc(db, "restaurants", id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Помилка оновлення ресторану:", error);
    throw error;
  }
};

/**
 * Видалити ресторан
 * @param {string} id - ID ресторану
 * @returns {Promise<void>}
 */
export const deleteRestaurant = async (id) => {
  try {
    await deleteDoc(doc(db, "restaurants", id));
  } catch (error) {
    console.error("Помилка видалення ресторану:", error);
    throw error;
  }
};

/**
 * Підписатися на зміни ресторанів (realtime)
 * @param {Function} callback - Функція, яка викликається при змінах
 * @returns {Function} Функція відписки
 */
export const subscribeToRestaurants = (callback) => {
  const restaurantsRef = collection(db, "restaurants");
  const q = query(restaurantsRef, orderBy("regNumber"));
  
  return onSnapshot(q, (snapshot) => {
    const restaurants = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(restaurants);
  });
};

// ==================== ОСНОВНІ ЗАСОБИ (ASSETS) ====================

/**
 * Отримати всі активи
 * @returns {Promise<Array>} Масив активів
 */
export const getAssets = async () => {
  try {
    const assetsRef = collection(db, "assets");
    const q = query(assetsRef, orderBy("invNumber"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error("Помилка отримання активів:", error);
    throw error;
  }
};

/**
 * Додати новий актив
 * @param {Object} asset - Дані активу
 * @returns {Promise<string>} ID створеного документа
 */
export const addAsset = async (asset) => {
  try {
    const docRef = await addDoc(collection(db, "assets"), {
      ...asset,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Помилка додавання активу:", error);
    throw error;
  }
};

/**
 * Оновити актив
 * @param {string} id - ID активу
 * @param {Object} data - Нові дані
 * @returns {Promise<void>}
 */
export const updateAsset = async (id, data) => {
  try {
    const docRef = doc(db, "assets", id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Помилка оновлення активу:", error);
    throw error;
  }
};

/**
 * Видалити актив
 * @param {string} id - ID активу
 * @returns {Promise<void>}
 */
export const deleteAsset = async (id) => {
  try {
    await deleteDoc(doc(db, "assets", id));
  } catch (error) {
    console.error("Помилка видалення активу:", error);
    throw error;
  }
};

/**
 * Підписатися на зміни активів (realtime)
 * @param {Function} callback - Функція, яка викликається при змінах
 * @returns {Function} Функція відписки
 */
export const subscribeToAssets = (callback) => {
  const assetsRef = collection(db, "assets");
  const q = query(assetsRef, orderBy("invNumber"));
  
  return onSnapshot(q, (snapshot) => {
    const assets = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    callback(assets);
  });
};

// ==================== ДОПОМІЖНІ ФУНКЦІЇ ====================

/**
 * Масове додавання документів (для ініціалізації)
 * @param {string} collectionName - Назва колекції
 * @param {Array} items - Масив елементів для додавання
 * @returns {Promise<Array>} Масив ID створених документів
 */
export const bulkAdd = async (collectionName, items) => {
  try {
    const promises = items.map((item) =>
      addDoc(collection(db, collectionName), {
        ...item,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );
    const results = await Promise.all(promises);
    return results.map((doc) => doc.id);
  } catch (error) {
    console.error(`Помилка масового додавання в ${collectionName}:`, error);
    throw error;
  }
};
