import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "./config";
import {
  createCollectionItemApi,
  deleteCollectionItemApi,
  isApiDataModeEnabled,
  listCollectionItemsApi,
  updateCollectionItemApi,
} from "./collectionsAdapter";

const byNameAsc = (a, b) => String(a?.name || "").localeCompare(String(b?.name || ""));

/**
 * Отримати всі посади
 */
export const getPositions = async () => {
  if (isApiDataModeEnabled()) {
    const items = await listCollectionItemsApi("positions");
    return items.sort(byNameAsc);
  }

  try {
    const querySnapshot = await getDocs(collection(db, "positions"));
    return querySnapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
  } catch (error) {
    console.error("Помилка завантаження посад:", error);
    throw error;
  }
};

/**
 * Додати нову посаду
 */
export const addPosition = async (positionData) => {
  if (isApiDataModeEnabled()) {
    return await createCollectionItemApi("positions", {
      ...positionData,
      parentId: positionData.parentId || null,
      createdAt: new Date().toISOString(),
    });
  }

  try {
    const docRef = await addDoc(collection(db, "positions"), {
      ...positionData,
      parentId: positionData.parentId || null,
      createdAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Помилка додавання посади:", error);
    throw error;
  }
};

/**
 * Видалити посаду
 */
export const deletePosition = async (positionId) => {
  if (isApiDataModeEnabled()) {
    await deleteCollectionItemApi("positions", positionId);
    return;
  }

  try {
    await deleteDoc(doc(db, "positions", positionId));
  } catch (error) {
    console.error("Помилка видалення посади:", error);
    throw error;
  }
};

/**
 * Отримати всі робочі ролі
 */
export const getWorkRoles = async () => {
  if (isApiDataModeEnabled()) {
    const items = await listCollectionItemsApi("workRoles");
    return items.sort(byNameAsc);
  }

  try {
    const querySnapshot = await getDocs(collection(db, "workRoles"));
    return querySnapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
  } catch (error) {
    console.error("Помилка завантаження ролей:", error);
    throw error;
  }
};

/**
 * Додати нову роль
 */
export const addWorkRole = async (roleData) => {
  if (isApiDataModeEnabled()) {
    return await createCollectionItemApi("workRoles", {
      ...roleData,
      parentId: roleData.parentId || null,
      createdAt: new Date().toISOString(),
    });
  }

  try {
    const docRef = await addDoc(collection(db, "workRoles"), {
      ...roleData,
      parentId: roleData.parentId || null,
      createdAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Помилка додавання ролі:", error);
    throw error;
  }
};

/**
 * Видалити роль
 */
export const deleteWorkRole = async (roleId) => {
  if (isApiDataModeEnabled()) {
    await deleteCollectionItemApi("workRoles", roleId);
    return;
  }

  try {
    await deleteDoc(doc(db, "workRoles", roleId));
  } catch (error) {
    console.error("Помилка видалення ролі:", error);
    throw error;
  }
};

/**
 * Оновити посаду
 */
export const updatePosition = async (positionId, positionData) => {
  if (isApiDataModeEnabled()) {
    await updateCollectionItemApi("positions", positionId, {
      ...positionData,
      parentId: positionData.parentId || null,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    await updateDoc(doc(db, "positions", positionId), {
      ...positionData,
      parentId: positionData.parentId || null,
    });
  } catch (error) {
    console.error("Помилка оновлення посади:", error);
    throw error;
  }
};

/**
 * Оновити роль
 */
export const updateWorkRole = async (roleId, roleData) => {
  if (isApiDataModeEnabled()) {
    await updateCollectionItemApi("workRoles", roleId, {
      ...roleData,
      parentId: roleData.parentId || null,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    await updateDoc(doc(db, "workRoles", roleId), {
      ...roleData,
      parentId: roleData.parentId || null,
    });
  } catch (error) {
    console.error("Помилка оновлення ролі:", error);
    throw error;
  }
};
