import { collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "./config";

/**
 * Отримати дозволи для ролі
 */
export const getRolePermissions = async (roleId) => {
  try {
    // Спочатку пробуємо знайти по ID
    const docRef = doc(db, "rolePermissions", roleId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data();
    }
    
    // Якщо не знайдено по ID, шукаємо по назві ролі
    const querySnapshot = await getDocs(collection(db, "rolePermissions"));
    const roleByName = querySnapshot.docs.find(doc => doc.data().roleName === roleId);
    
    if (roleByName) {
      console.log(`✅ Знайдено роль по назві: ${roleId} -> ${roleByName.id}`);
      return roleByName.data();
    }
    
    console.log(`⚠️ Роль не знайдена: ${roleId}`);
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

// === Field-level permissions (per role) ===

export const getFieldPermissions = async (roleIdOrName) => {
  try {
    const docRef = doc(db, "fieldPermissions", roleIdOrName);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }

    // fallback: search by roleName
    const querySnapshot = await getDocs(collection(db, "fieldPermissions"));
    const byName = querySnapshot.docs.find((d) => d.data().roleName === roleIdOrName);
    if (byName) {
      return { id: byName.id, ...byName.data() };
    }

    return null;
  } catch (error) {
    console.error("Помилка завантаження fieldPermissions:", error);
    throw error;
  }
};

export const getAllFieldPermissions = async () => {
  try {
    const querySnapshot = await getDocs(collection(db, "fieldPermissions"));
    return querySnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.error("Помилка завантаження усіх fieldPermissions:", error);
    throw error;
  }
};

export const saveFieldPermissions = async (roleId, roleName, permissions) => {
  try {
    await setDoc(doc(db, "fieldPermissions", roleId), {
      roleName,
      permissions,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Помилка збереження fieldPermissions:", error);
    throw error;
  }
};
