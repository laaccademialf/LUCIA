import { collection, getDocs, getDoc, doc, updateDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import { db } from "./config";
import {
  deleteCollectionItemApi,
  getCollectionItemApi,
  isApiDataModeEnabled,
  listCollectionItemsApi,
  updateCollectionItemApi,
} from "./collectionsAdapter";

const normalizeEmailValue = (value) => String(value || "").trim().toLowerCase();

const updateUsersByEmailInApiMode = async (id, payload = {}) => {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) throw new Error("User id is required");

  const targetUser = await getCollectionItemApi("users", normalizedId).catch(() => null);
  const targetEmail = normalizeEmailValue(targetUser?.email || targetUser?.user_email || "");

  if (!targetEmail) {
    await updateCollectionItemApi("users", normalizedId, payload);
    return;
  }

  const allUsers = await listCollectionItemsApi("users");
  const matchedIds = allUsers
    .filter((item) => normalizeEmailValue(item?.email || item?.user_email || "") === targetEmail)
    .map((item) => String(item?.id || "").trim())
    .filter(Boolean);

  const idsToUpdate = Array.from(new Set(matchedIds.length > 0 ? matchedIds : [normalizedId]));
  await Promise.all(idsToUpdate.map((userId) => updateCollectionItemApi("users", userId, payload)));
};

const normalizeUserRecord = (user) => {
  if (!user || typeof user !== "object") return user;

  const createdAt = user.createdAt || user.created_at || "";
  const updatedAt = user.updatedAt || user.updated_at || "";

  return {
    ...user,
    displayName: user.displayName || user.display_name || "",
    email: user.email || user.user_email || "",
    role: user.role || "user",
    restaurant: user.restaurant || user.restaurant_id || user.restaurant_name || "",
    restaurantName: user.restaurantName || user.restaurant_name || user.restaurant || "",
    position: user.position || user.position_name || "",
    workRole: user.workRole || user.work_role_name || user.work_role || "",
    createdAt,
    updatedAt,
  };
};

/**
 * Отримати всіх користувачів
 * @returns {Promise<Array>} Масив користувачів
 */
export const getUsers = async () => {
  if (isApiDataModeEnabled()) {
    const users = await listCollectionItemsApi("users");
    return users
      .map(normalizeUserRecord)
      .sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")));
  }

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
  if (isApiDataModeEnabled()) {
    const user = await getCollectionItemApi("users", id).catch(() => null);
    return normalizeUserRecord(user);
  }

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
  if (isApiDataModeEnabled()) {
    await updateUsersByEmailInApiMode(id, {
      role,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

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
  if (isApiDataModeEnabled()) {
    await updateUsersByEmailInApiMode(id, {
      ...(data || {}),
      updatedAt: new Date().toISOString(),
    });
    return;
  }

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
  if (isApiDataModeEnabled()) {
    await deleteCollectionItemApi("users", id);
    return;
  }

  try {
    await deleteDoc(doc(db, "users", id));
  } catch (error) {
    console.error("Помилка видалення користувача:", error);
    throw error;
  }
};
