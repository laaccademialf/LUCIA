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
  runTransaction,
} from "firebase/firestore";
import { db } from "./config";
import {
  createCollectionItemApi,
  deleteCollectionItemApi,
  getCollectionItemApi,
  isApiDataModeEnabled,
  listCollectionItemsApi,
  subscribeByPolling,
  updateCollectionItemApi,
} from "./collectionsAdapter";

// ==================== РЕСТОРАНИ ====================

/**
 * Отримати всі ресторани
 * @returns {Promise<Array>} Масив ресторанів
 */
export const getRestaurants = async () => {
  if (isApiDataModeEnabled()) {
    const items = await listCollectionItemsApi("restaurants");
    return items.sort((a, b) => String(a?.regNumber || "").localeCompare(String(b?.regNumber || "")));
  }

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
  if (isApiDataModeEnabled()) {
    return await getCollectionItemApi("restaurants", id).catch(() => null);
  }

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
  if (isApiDataModeEnabled()) {
    const { id: _ignoredId, ...restaurantData } = restaurant || {};
    return await createCollectionItemApi("restaurants", {
      ...restaurantData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

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
  if (isApiDataModeEnabled()) {
    const { id: _ignoredId, ...restaurantData } = data || {};
    await updateCollectionItemApi("restaurants", id, {
      ...restaurantData,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

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
  if (isApiDataModeEnabled()) {
    await deleteCollectionItemApi("restaurants", id);
    return;
  }

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
  if (isApiDataModeEnabled()) {
    return subscribeByPolling(async () => {
      const items = await listCollectionItemsApi("restaurants");
      return items.sort((a, b) => String(a?.regNumber || "").localeCompare(String(b?.regNumber || "")));
    }, callback, 5000);
  }

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

// ==================== СЕСІЇ ІНВЕНТАРИЗАЦІЇ ОЗ ====================

const normalizeSessionActive = (value) => {
  if (value === true || value === 1) return true;
  const text = String(value || "").trim().toLowerCase();
  return text === "true" || text === "1";
};

const normalizeInventorySession = (item) => {
  if (!item || typeof item !== "object") return item;
  return {
    ...item,
    isActive: normalizeSessionActive(item.isActive),
    scopeId: String(item.scopeId || "global"),
  };
};

export const startAssetInventorySession = async (scopeId, sessionData = {}) => {
  if (isApiDataModeEnabled()) {
    const scope = String(scopeId || "global");
    const nowIso = new Date().toISOString();
    const all = (await listCollectionItemsApi("assetInventorySessions")).map(normalizeInventorySession);

    await Promise.all(
      all
        .filter((item) => String(item?.scopeId || "global") === scope && normalizeSessionActive(item?.isActive))
        .map((item) =>
          updateCollectionItemApi("assetInventorySessions", item.id, {
            isActive: false,
            endedAt: nowIso,
            endedReason: "auto_closed_by_new_session",
            updatedAt: nowIso,
          })
        )
    );

    return await createCollectionItemApi("assetInventorySessions", {
      scopeId: scope,
      isActive: true,
      startedAt: nowIso,
      updatedAt: nowIso,
      ...sessionData,
    });
  }

  try {
    const sessionsRef = collection(db, "assetInventorySessions");
    const nowIso = new Date().toISOString();

    const activeSnapshot = await getDocs(sessionsRef);
    await Promise.all(
      activeSnapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => String(item.scopeId || "global") === String(scopeId || "global") && item.isActive === true)
        .map((item) =>
          updateDoc(doc(db, "assetInventorySessions", item.id), {
            isActive: false,
            endedAt: nowIso,
            endedReason: "auto_closed_by_new_session",
            updatedAt: nowIso,
          })
        )
    );

    const docRef = await addDoc(sessionsRef, {
      scopeId: String(scopeId || "global"),
      isActive: true,
      startedAt: nowIso,
      updatedAt: nowIso,
      ...sessionData,
    });

    return docRef.id;
  } catch (error) {
    console.error("Помилка старту сесії інвентаризації ОЗ:", error);
    throw error;
  }
};

export const endAssetInventorySession = async (sessionId, endData = {}, scopeId = "") => {
  if (isApiDataModeEnabled()) {
    const nowIso = new Date().toISOString();
    await updateCollectionItemApi("assetInventorySessions", sessionId, {
      isActive: false,
      endedAt: nowIso,
      updatedAt: nowIso,
      ...endData,
    });

    // Safety net: close any other active sessions in the same scope (legacy duplicates).
    const targetScope = String(scopeId || "").trim();
    if (targetScope) {
      const all = (await listCollectionItemsApi("assetInventorySessions")).map(normalizeInventorySession);
      await Promise.all(
        all
          .filter(
            (item) =>
              String(item?.id || "") !== String(sessionId || "") &&
              String(item?.scopeId || "global") === targetScope &&
              normalizeSessionActive(item?.isActive)
          )
          .map((item) =>
            updateCollectionItemApi("assetInventorySessions", item.id, {
              isActive: false,
              endedAt: nowIso,
              endedReason: "auto_closed_by_scope_end",
              updatedAt: nowIso,
              ...endData,
            })
          )
      );
    }
    return;
  }

  try {
    const nowIso = new Date().toISOString();
    const sessionRef = doc(db, "assetInventorySessions", sessionId);
    await updateDoc(sessionRef, {
      isActive: false,
      endedAt: nowIso,
      updatedAt: nowIso,
      ...endData,
    });
  } catch (error) {
    console.error("Помилка завершення сесії інвентаризації ОЗ:", error);
    throw error;
  }
};

export const subscribeToActiveAssetInventorySession = (scopeId, callback) => {
  if (isApiDataModeEnabled()) {
    return subscribeByPolling(async () => {
      const scope = String(scopeId || "global");
      const sessions = (await listCollectionItemsApi("assetInventorySessions")).map(normalizeInventorySession);
      const filtered = sessions
        .filter((item) => String(item?.scopeId || "global") === scope && normalizeSessionActive(item?.isActive))
        .sort((a, b) => String(b?.startedAt || "").localeCompare(String(a?.startedAt || "")));
      return filtered.slice(0, 1);
    }, (items) => callback(items[0] || null), 5000);
  }

  const sessionsRef = collection(db, "assetInventorySessions");
  const q = query(sessionsRef, orderBy("startedAt", "desc"));

  return onSnapshot(q, (snapshot) => {
    const sessions = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((item) => String(item.scopeId || "global") === String(scopeId || "global") && item.isActive === true)
      .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));

    callback(sessions[0] || null);
  });
};

export const subscribeToAssetInventorySessions = (scopeId, callback) => {
  if (isApiDataModeEnabled()) {
    return subscribeByPolling(async () => {
      const scope = String(scopeId || "global");
      const sessions = (await listCollectionItemsApi("assetInventorySessions")).map(normalizeInventorySession);
      return sessions
        .filter((item) => String(item?.scopeId || "global") === scope)
        .sort((a, b) => String(b?.startedAt || "").localeCompare(String(a?.startedAt || "")));
    }, callback, 5000);
  }

  const sessionsRef = collection(db, "assetInventorySessions");
  const q = query(sessionsRef, orderBy("startedAt", "desc"));

  return onSnapshot(q, (snapshot) => {
    const sessions = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((item) => String(item.scopeId || "global") === String(scopeId || "global"));

    callback(sessions);
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

export const getProductInventories = async () => {
  try {
    const inventoriesRef = collection(db, "productInventories");
    const q = query(inventoriesRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
  } catch (error) {
    console.error("Помилка отримання інвентаризацій продуктів:", error);
    throw error;
  }
};

export const startProductInventorySession = async (scopeId, sessionData = {}) => {
  if (isApiDataModeEnabled()) {
    const scope = String(scopeId || "");
    const nowIso = new Date().toISOString();
    const all = await listCollectionItemsApi("productInventorySessions");

    await Promise.all(
      all
        .filter((item) => String(item?.scopeId || "") === scope && item?.isActive === true)
        .map((item) =>
          updateCollectionItemApi("productInventorySessions", item.id, {
            isActive: false,
            endedAt: nowIso,
            endedReason: "auto_closed_by_new_session",
            updatedAt: nowIso,
          })
        )
    );

    return await createCollectionItemApi("productInventorySessions", {
      scopeId: scope,
      isActive: true,
      startedAt: nowIso,
      updatedAt: nowIso,
      ...sessionData,
    });
  }

  try {
    const sessionsRef = collection(db, "productInventorySessions");
    const nowIso = new Date().toISOString();

    const activeSnapshot = await getDocs(sessionsRef);
    await Promise.all(
      activeSnapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => String(item.scopeId || "") === String(scopeId || "") && item.isActive === true)
        .map((item) =>
          updateDoc(doc(db, "productInventorySessions", item.id), {
            isActive: false,
            endedAt: nowIso,
            endedReason: "auto_closed_by_new_session",
            updatedAt: nowIso,
          })
        )
    );

    const docRef = await addDoc(sessionsRef, {
      scopeId: String(scopeId || ""),
      isActive: true,
      startedAt: nowIso,
      updatedAt: nowIso,
      ...sessionData,
    });

    return docRef.id;
  } catch (error) {
    console.error("Помилка старту сесії інвентаризації продуктів:", error);
    throw error;
  }
};

export const endProductInventorySession = async (sessionId, endData = {}) => {
  if (isApiDataModeEnabled()) {
    const nowIso = new Date().toISOString();
    await updateCollectionItemApi("productInventorySessions", sessionId, {
      isActive: false,
      endedAt: nowIso,
      updatedAt: nowIso,
      ...endData,
    });
    return;
  }

  try {
    const nowIso = new Date().toISOString();
    const sessionRef = doc(db, "productInventorySessions", sessionId);
    await updateDoc(sessionRef, {
      isActive: false,
      endedAt: nowIso,
      updatedAt: nowIso,
      ...endData,
    });
  } catch (error) {
    console.error("Помилка завершення сесії інвентаризації продуктів:", error);
    throw error;
  }
};

export const subscribeToActiveProductInventorySession = (scopeId, callback) => {
  if (isApiDataModeEnabled()) {
    return subscribeByPolling(async () => {
      const scope = String(scopeId || "");
      const sessions = await listCollectionItemsApi("productInventorySessions");
      const filtered = sessions
        .filter((item) => String(item?.scopeId || "") === scope && item?.isActive === true)
        .sort((a, b) => String(b?.startedAt || "").localeCompare(String(a?.startedAt || "")));
      return filtered.slice(0, 1);
    }, (items) => callback(items[0] || null), 5000);
  }

  const sessionsRef = collection(db, "productInventorySessions");
  const q = query(sessionsRef, orderBy("startedAt", "desc"));

  return onSnapshot(q, (snapshot) => {
    const sessions = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((item) => String(item.scopeId || "") === String(scopeId || "") && item.isActive === true)
      .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));

    callback(sessions[0] || null);
  });
};

export const subscribeToProductInventorySessions = (scopeId, callback) => {
  if (isApiDataModeEnabled()) {
    return subscribeByPolling(async () => {
      const scope = String(scopeId || "");
      const sessions = await listCollectionItemsApi("productInventorySessions");
      return sessions
        .filter((item) => String(item?.scopeId || "") === scope)
        .sort((a, b) => String(b?.startedAt || "").localeCompare(String(a?.startedAt || "")));
    }, callback, 5000);
  }

  const sessionsRef = collection(db, "productInventorySessions");
  const q = query(sessionsRef, orderBy("startedAt", "desc"));

  return onSnapshot(q, (snapshot) => {
    const sessions = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((item) => String(item.scopeId || "") === String(scopeId || ""));

    callback(sessions);
  });
};

export const addProductInventory = async (inventory) => {
  try {
    const docRef = await addDoc(collection(db, "productInventories"), {
      ...inventory,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Помилка збереження інвентаризації продуктів:", error);
    throw error;
  }
};

const normalizeInventoryDate = (value) => {
  const raw = String(value || "").trim();
  const shortMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (shortMatch) return raw;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const upsertProductInventoryByRestaurantDate = async (inventory) => {
  try {
    const restaurantId = String(inventory?.restaurantId || "").trim();
    const sessionId = String(inventory?.inventorySessionId || "").trim();
    const inventoryDate = normalizeInventoryDate(inventory?.inventoryDate);

    if (!restaurantId || (!inventoryDate && !sessionId)) {
      throw new Error("Не вказано restaurantId та inventoryDate/sessionId для інвентаризації.");
    }

    const docId = sessionId || `${restaurantId}__${inventoryDate}`;
    const inventoryRef = doc(db, "productInventories", docId);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(inventoryRef);
      const nowIso = new Date().toISOString();

      const existing = snapshot.exists() ? snapshot.data() : {};
      const resolvedInventoryDate =
        inventoryDate ||
        normalizeInventoryDate(existing.inventoryDate) ||
        normalizeInventoryDate(inventory?.inventorySessionStartedAt) ||
        normalizeInventoryDate(nowIso);
      const existingItems = Array.isArray(existing.items) ? existing.items : [];
      const incomingItems = Array.isArray(inventory?.items) ? inventory.items : [];

      const mergedByProductId = new Map();

      existingItems.forEach((item) => {
        const productId = String(item?.productId || "").trim();
        if (!productId) return;
        mergedByProductId.set(productId, item);
      });

      incomingItems.forEach((item) => {
        const productId = String(item?.productId || "").trim();
        if (!productId) return;
        mergedByProductId.set(productId, item);
      });

      const mergedItems = Array.from(mergedByProductId.values()).sort((a, b) =>
        String(a?.productName || "").localeCompare(String(b?.productName || ""), "uk")
      );

      const totalItems = mergedItems.reduce((sum, item) => {
        const qty = Number(item?.qty);
        return sum + (Number.isFinite(qty) ? qty : 0);
      }, 0);

      const totalAmount = mergedItems.reduce((sum, item) => {
        const amount = Number(item?.amount);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0);

      const contributor = {
        userId: String(inventory?.createdById || inventory?.updatedById || ""),
        name: String(inventory?.createdBy || inventory?.updatedBy || "Користувач"),
        at: nowIso,
      };

      const prevContributors = Array.isArray(existing.contributors) ? existing.contributors : [];
      const contributorsMap = new Map();
      prevContributors.forEach((entry) => {
        const key = String(entry?.userId || entry?.name || "").trim();
        if (key) contributorsMap.set(key, entry);
      });
      const contributorKey = String(contributor.userId || contributor.name || "").trim();
      if (contributorKey) contributorsMap.set(contributorKey, contributor);

      const payload = {
        restaurantId,
        restaurantName: String(inventory?.restaurantName || existing.restaurantName || "Невідомий ресторан"),
        restaurantRegNumber: String(inventory?.restaurantRegNumber || existing.restaurantRegNumber || ""),
        inventoryDate: resolvedInventoryDate,
        inventorySessionId: sessionId || String(existing.inventorySessionId || ""),
        inventorySessionStartedAt: String(inventory?.inventorySessionStartedAt || existing.inventorySessionStartedAt || ""),
        items: mergedItems,
        totalItems,
        totalAmount,
        contributors: Array.from(contributorsMap.values()),
        lastContributorName: contributor.name,
        lastContributorId: contributor.userId,
        updatedBy: contributor.name,
        updatedById: contributor.userId,
        updatedAt: nowIso,
      };

      if (!snapshot.exists()) {
        payload.createdAt = nowIso;
        payload.createdBy = contributor.name;
        payload.createdById = contributor.userId;
      }

      transaction.set(inventoryRef, payload, { merge: true });
    });

    return docId;
  } catch (error) {
    console.error("Помилка upsert інвентаризації продуктів:", error);
    throw error;
  }
};

export const updateProductInventory = async (id, data) => {
  try {
    const docRef = doc(db, "productInventories", id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Помилка оновлення інвентаризації продуктів:", error);
    throw error;
  }
};

export const subscribeToProductInventories = (callback) => {
  const inventoriesRef = collection(db, "productInventories");
  const q = query(inventoriesRef, orderBy("createdAt", "desc"));

  return onSnapshot(q, (snapshot) => {
    const inventories = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));
    callback(inventories);
  });
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
