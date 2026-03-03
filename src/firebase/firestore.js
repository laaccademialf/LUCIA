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
      ...doc.data(),
      id: doc.id,
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
      return { ...docSnap.data(), id: docSnap.id };
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
    const { id: _ignoredId, ...restaurantData } = restaurant || {};
    const docRef = await addDoc(collection(db, "restaurants"), {
      ...restaurantData,
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
    const { id: _ignoredId, ...restaurantData } = data || {};
    const docRef = doc(db, "restaurants", id);
    await updateDoc(docRef, {
      ...restaurantData,
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
      ...doc.data(),
      id: doc.id,
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

// ==================== ЗАМОВЛЕННЯ ПРОДУКЦІЇ ====================

export const getBookingProducts = async () => {
  try {
    const productsRef = collection(db, "bookingProducts");
    const q = query(productsRef, orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
  } catch (error) {
    console.error("Помилка отримання довідника продуктів:", error);
    throw error;
  }
};

export const addBookingProduct = async (product) => {
  try {
    const docRef = await addDoc(collection(db, "bookingProducts"), {
      ...product,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Помилка додавання продукту:", error);
    throw error;
  }
};

export const updateBookingProduct = async (id, data) => {
  try {
    const docRef = doc(db, "bookingProducts", id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Помилка оновлення продукту:", error);
    throw error;
  }
};

export const deleteBookingProduct = async (id) => {
  try {
    await deleteDoc(doc(db, "bookingProducts", id));
  } catch (error) {
    console.error("Помилка видалення продукту:", error);
    throw error;
  }
};

export const subscribeToBookingProducts = (callback) => {
  const productsRef = collection(db, "bookingProducts");
  const q = query(productsRef, orderBy("name"));

  return onSnapshot(q, (snapshot) => {
    const products = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
    callback(products);
  });
};

export const getProductOrders = async () => {
  try {
    const ordersRef = collection(db, "productOrders");
    const q = query(ordersRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
  } catch (error) {
    console.error("Помилка отримання заявок:", error);
    throw error;
  }
};

export const addProductOrder = async (order) => {
  try {
    const docRef = await addDoc(collection(db, "productOrders"), {
      ...order,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Помилка додавання заявки:", error);
    throw error;
  }
};

export const updateProductOrder = async (id, data) => {
  try {
    const docRef = doc(db, "productOrders", id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Помилка оновлення заявки:", error);
    throw error;
  }
};

export const subscribeToProductOrders = (callback) => {
  const ordersRef = collection(db, "productOrders");
  const q = query(ordersRef, orderBy("createdAt", "desc"));

  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
    callback(orders);
  });
};

export const getBookingSuppliers = async () => {
  try {
    const suppliersRef = collection(db, "bookingSuppliers");
    const q = query(suppliersRef, orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
  } catch (error) {
    console.error("Помилка отримання постачальників:", error);
    throw error;
  }
};

export const addBookingSupplier = async (supplier) => {
  try {
    const docRef = await addDoc(collection(db, "bookingSuppliers"), {
      ...supplier,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Помилка додавання постачальника:", error);
    throw error;
  }
};

export const updateBookingSupplier = async (id, data) => {
  try {
    const docRef = doc(db, "bookingSuppliers", id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Помилка оновлення постачальника:", error);
    throw error;
  }
};

export const deleteBookingSupplier = async (id) => {
  try {
    await deleteDoc(doc(db, "bookingSuppliers", id));
  } catch (error) {
    console.error("Помилка видалення постачальника:", error);
    throw error;
  }
};

export const subscribeToBookingSuppliers = (callback) => {
  const suppliersRef = collection(db, "bookingSuppliers");
  const q = query(suppliersRef, orderBy("name"));

  return onSnapshot(q, (snapshot) => {
    const suppliers = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
    callback(suppliers);
  });
};

export const getBookingTypicalFields = async () => {
  try {
    const fieldsRef = collection(db, "bookingTypicalFields");
    const q = query(fieldsRef, orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
  } catch (error) {
    console.error("Помилка отримання типових полів:", error);
    throw error;
  }
};

export const addBookingTypicalField = async (field) => {
  try {
    const docRef = await addDoc(collection(db, "bookingTypicalFields"), {
      ...field,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Помилка додавання типового поля:", error);
    throw error;
  }
};

export const updateBookingTypicalField = async (id, data) => {
  try {
    const docRef = doc(db, "bookingTypicalFields", id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Помилка оновлення типового поля:", error);
    throw error;
  }
};

export const deleteBookingTypicalField = async (id) => {
  try {
    await deleteDoc(doc(db, "bookingTypicalFields", id));
  } catch (error) {
    console.error("Помилка видалення типового поля:", error);
    throw error;
  }
};

export const subscribeToBookingTypicalFields = (callback) => {
  const fieldsRef = collection(db, "bookingTypicalFields");
  const q = query(fieldsRef, orderBy("name"));

  return onSnapshot(q, (snapshot) => {
    const fields = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
    callback(fields);
  });
};

export const addSupplierDispatch = async (dispatch) => {
  try {
    const docRef = await addDoc(collection(db, "supplierDispatches"), {
      ...dispatch,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Помилка створення відправки постачальнику:", error);
    throw error;
  }
};

// ==================== ЧЕК-ЛИСТИ ====================

export const getChecklistTemplates = async () => {
  try {
    const templatesRef = collection(db, "checklistTemplates");
    const q = query(templatesRef, orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
  } catch (error) {
    console.error("Помилка отримання шаблонів чек-листів:", error);
    throw error;
  }
};

export const addChecklistTemplate = async (template) => {
  try {
    const docRef = await addDoc(collection(db, "checklistTemplates"), {
      ...template,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Помилка створення шаблону чек-листа:", error);
    throw error;
  }
};

export const updateChecklistTemplate = async (id, data) => {
  try {
    const docRef = doc(db, "checklistTemplates", id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Помилка оновлення шаблону чек-листа:", error);
    throw error;
  }
};

export const deleteChecklistTemplate = async (id) => {
  try {
    await deleteDoc(doc(db, "checklistTemplates", id));
  } catch (error) {
    console.error("Помилка видалення шаблону чек-листа:", error);
    throw error;
  }
};

export const subscribeToChecklistTemplates = (callback) => {
  const templatesRef = collection(db, "checklistTemplates");
  const q = query(templatesRef, orderBy("name"));

  return onSnapshot(q, (snapshot) => {
    const templates = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
    callback(templates);
  });
};

export const getChecklistExecutions = async () => {
  try {
    const executionsRef = collection(db, "checklistExecutions");
    const q = query(executionsRef, orderBy("date", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
  } catch (error) {
    console.error("Помилка отримання виконань чек-листів:", error);
    throw error;
  }
};

export const addChecklistExecution = async (execution) => {
  try {
    const docRef = await addDoc(collection(db, "checklistExecutions"), {
      ...execution,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Помилка створення виконання чек-листа:", error);
    throw error;
  }
};

export const updateChecklistExecution = async (id, data) => {
  try {
    const docRef = doc(db, "checklistExecutions", id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Помилка оновлення виконання чек-листа:", error);
    throw error;
  }
};

export const deleteChecklistExecution = async (id) => {
  try {
    await deleteDoc(doc(db, "checklistExecutions", id));
  } catch (error) {
    console.error("Помилка видалення виконання чек-листа:", error);
    throw error;
  }
};

export const subscribeToChecklistExecutions = (callback) => {
  const executionsRef = collection(db, "checklistExecutions");
  const q = query(executionsRef, orderBy("date", "desc"));

  return onSnapshot(q, (snapshot) => {
    const executions = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
    callback(executions);
  });
};

// ==================== СЕРВІСНІ ЗАЯВКИ ====================

export const getServiceRequests = async () => {
  try {
    const requestsRef = collection(db, "serviceRequests");
    const q = query(requestsRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
  } catch (error) {
    console.error("Помилка отримання сервісних заявок:", error);
    throw error;
  }
};

export const addServiceRequest = async (requestData) => {
  try {
    const docRef = await addDoc(collection(db, "serviceRequests"), {
      ...requestData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Помилка створення сервісної заявки:", error);
    throw error;
  }
};

export const updateServiceRequest = async (id, data) => {
  try {
    const docRef = doc(db, "serviceRequests", id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Помилка оновлення сервісної заявки:", error);
    throw error;
  }
};

export const deleteServiceRequest = async (id) => {
  try {
    await deleteDoc(doc(db, "serviceRequests", id));
  } catch (error) {
    console.error("Помилка видалення сервісної заявки:", error);
    throw error;
  }
};

export const subscribeToServiceRequests = (callback) => {
  const requestsRef = collection(db, "serviceRequests");
  const q = query(requestsRef, orderBy("createdAt", "desc"));

  return onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
    callback(requests);
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
