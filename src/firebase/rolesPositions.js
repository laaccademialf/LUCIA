import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "./config";

/**
 * Отримати всі посади
 */
export const getPositions = async () => {
  try {
    const querySnapshot = await getDocs(collection(db, "positions"));
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
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
  try {
    const docRef = await addDoc(collection(db, "positions"), {
      ...positionData,
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
  try {
    const querySnapshot = await getDocs(collection(db, "workRoles"));
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
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
  try {
    const docRef = await addDoc(collection(db, "workRoles"), {
      ...roleData,
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
  try {
    await deleteDoc(doc(db, "workRoles", roleId));
  } catch (error) {
    console.error("Помилка видалення ролі:", error);
    throw error;
  }
};
