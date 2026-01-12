import { collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "./config";

/**
 * Отримати дозволи для ролі
 */
export const getRolePermissions = async (roleId) => {
  try {
    const docRef = doc(db, "rolePermissions", roleId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return { permissions: {} };
  } catch (error) {
    console.error("Помилка завантаження дозволів:", error);
    throw error;
  }
};

/**
 * Отримати всі дозволи ролей
 */
export const getAllRolePermissions = async () => {
  try {
    const querySnapshot = await getDocs(collection(db, "rolePermissions"));
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error("Помилка завантаження дозволів:", error);
    throw error;
  }
};

/**
 * Зберегти дозволи для ролі
 */
export const saveRolePermissions = async (roleId, roleName, permissions) => {
  try {
    await setDoc(doc(db, "rolePermissions", roleId), {
      roleName,
      permissions,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Помилка збереження дозволів:", error);
    throw error;
  }
};
