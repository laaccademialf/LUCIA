import { collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "./config";
import {
  isApiDataModeEnabled,
  listCollectionItemsApi,
  upsertCollectionItemById,
  getCollectionItemApi,
} from "./collectionsAdapter";

const parseMaybeJson = (value) => {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return value;
  if (!(text.startsWith("{") || text.startsWith("["))) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
};

const normalizeRolePermissionsDoc = (item) => {
  if (!item || typeof item !== "object") return { permissions: {}, restaurants: [] };

  const maybePermissions = parseMaybeJson(item.permissions);
  let permissions = maybePermissions && typeof maybePermissions === "object" && !Array.isArray(maybePermissions)
    ? maybePermissions
    : null;

  if (!permissions) {
    const rebuilt = {};
    Object.entries(item).forEach(([key, rawValue]) => {
      if (!String(key || "").startsWith("permissions_")) return;
      const navId = String(key).slice("permissions_".length).replace(/_/g, "-");
      const value = parseMaybeJson(rawValue);

      if (Array.isArray(value)) {
        rebuilt[navId] = value;
        return;
      }

      if (value === true || value === 1 || String(value || "").toLowerCase() === "true") {
        rebuilt[navId] = true;
      }
    });
    permissions = rebuilt;
  }

  const maybeRestaurants = parseMaybeJson(item.restaurants);
  const restaurants = Array.isArray(maybeRestaurants)
    ? maybeRestaurants.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  return {
    ...item,
    roleName: item.roleName || item.role_name || "",
    permissions,
    restaurants,
  };
};

/**
 * Отримати дозволи для ролі
 */
export const getRolePermissions = async (roleId) => {
  if (isApiDataModeEnabled()) {
    const byId = await getCollectionItemApi("rolePermissions", roleId).catch(() => null);
    if (byId) return normalizeRolePermissionsDoc(byId);

    const all = await listCollectionItemsApi("rolePermissions");
    const roleByName = all.find((item) => {
      const rn = item?.roleName || item?.role_name;
      return rn && rn.toLowerCase() === String(roleId).toLowerCase();
    });
    return roleByName ? normalizeRolePermissionsDoc(roleByName) : { permissions: {}, restaurants: [] };
  }

  try {
    // Пробуємо знайти по ID
    const docRef = doc(db, "rolePermissions", roleId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return normalizeRolePermissionsDoc(docSnap.data());
    }

    // Якщо не знайдено по ID, шукаємо по roleName (НЕЗАЛЕЖНО ВІД РЕЄСТРУ)
    const querySnapshot = await getDocs(collection(db, "rolePermissions"));
    const roleByName = querySnapshot.docs.find(doc => {
      const rn = doc.data().roleName || doc.data().role_name;
      return rn && rn.toLowerCase() === String(roleId).toLowerCase();
    });
    if (roleByName) {
      console.log(`✅ Знайдено роль по roleName: ${roleId} -> ${roleByName.id}`);
      return normalizeRolePermissionsDoc(roleByName.data());
    }
    console.log(`⚠️ Роль не знайдена: ${roleId}`);
    return { permissions: {}, restaurants: [] };
  } catch (error) {
    console.error("Помилка завантаження дозволів:", error);
    throw error;
  }
};

/**
 * Отримати всі дозволи ролей
 */
export const getAllRolePermissions = async () => {
  if (isApiDataModeEnabled()) {
    const all = await listCollectionItemsApi("rolePermissions");
    return all.map((item) => normalizeRolePermissionsDoc(item));
  }

  try {
    const querySnapshot = await getDocs(collection(db, "rolePermissions"));
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...normalizeRolePermissionsDoc(doc.data()),
    }));
  } catch (error) {
    console.error("Помилка завантаження дозволів:", error);
    throw error;
  }
};

/**
 * Зберегти дозволи для ролі
 */
export const saveRolePermissions = async (roleId, roleName, permissions, restaurants = []) => {
  if (isApiDataModeEnabled()) {
    await upsertCollectionItemById("rolePermissions", roleId, {
      roleName,
      permissions,
      restaurants,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    await setDoc(doc(db, "rolePermissions", roleId), {
      roleName,
      permissions,
      restaurants,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Помилка збереження дозволів:", error);
    throw error;
  }
};

// === Field-level permissions (per role) ===

export const getFieldPermissions = async (roleIdOrName) => {
  if (isApiDataModeEnabled()) {
    const byId = await getCollectionItemApi("fieldPermissions", roleIdOrName).catch(() => null);
    if (byId) {
      return byId;
    }

    const normalizedRole = String(roleIdOrName || "").trim().toLowerCase();
    const all = await listCollectionItemsApi("fieldPermissions");
    return (
      all.find((item) => {
        const roleName = String(item?.roleName || item?.role_name || "").trim().toLowerCase();
        const roleId = String(item?.roleId || item?.role_id || item?.id || "").trim().toLowerCase();
        return Boolean(normalizedRole) && (roleName === normalizedRole || roleId === normalizedRole);
      }) || null
    );
  }

  try {
    const docRef = doc(db, "fieldPermissions", roleIdOrName);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }

    // fallback: search by roleName
    const querySnapshot = await getDocs(collection(db, "fieldPermissions"));
    const normalizedRole = String(roleIdOrName || "").trim().toLowerCase();
    const byName = querySnapshot.docs.find((d) => {
      const roleName = String(d.data().roleName || "").trim().toLowerCase();
      return roleName === normalizedRole;
    });
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
  if (isApiDataModeEnabled()) {
    return await listCollectionItemsApi("fieldPermissions");
  }

  try {
    const querySnapshot = await getDocs(collection(db, "fieldPermissions"));
    return querySnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.error("Помилка завантаження усіх fieldPermissions:", error);
    throw error;
  }
};

export const saveFieldPermissions = async (roleId, roleName, permissions) => {
  if (isApiDataModeEnabled()) {
    await upsertCollectionItemById("fieldPermissions", roleId, {
      roleName,
      permissions,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

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
