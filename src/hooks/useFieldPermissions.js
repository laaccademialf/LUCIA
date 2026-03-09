import { useState, useEffect } from "react";
import { getFieldPermissions } from "../firebase/permissions";
import { getCollectionItemApi, isCollectionsApiEnabled } from "../api/collectionsApi";

/**
 * Хук для завантаження прав редагування полів на основі робочої ролі користувача
 * @param {string} workRoleId - ID робочої ролі користувача
 * @returns {Object} - Об'єкт з дозволами { fieldId: boolean }
 */
export const useFieldPermissions = (workRoleId) => {
  const [fieldPermissions, setFieldPermissions] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPermissions = async () => {
      if (!workRoleId) {
        console.log("⚠️ Немає workRoleId");
        setFieldPermissions({});
        setLoading(false);
        return;
      }

      try {
        const doc = isCollectionsApiEnabled()
          ? await getCollectionItemApi("fieldPermissions", workRoleId)
          : await getFieldPermissions(workRoleId);

        if (doc && doc.permissions) {
          console.log("🔐 Дозволи для ролі:", workRoleId, doc.permissions);
          setFieldPermissions(doc.permissions);
        } else {
          console.log("⚠️ Дозволи для ролі не знайдені у Firestore, дозволяємо за замовчуванням");
          setFieldPermissions({});
        }
      } catch (error) {
        console.error("Помилка завантаження дозволів:", error);
        setFieldPermissions({});
      }

      setLoading(false);
    };
    
    loadPermissions();
  }, [workRoleId]);

  /**
   * Перевірка чи може користувач редагувати поле
   * @param {string} fieldId - ID поля
   * @returns {boolean} - true якщо може редагувати, false якщо тільки читання
   */
  const canEdit = (fieldId) => {
    // Якщо немає дозволів взагалі - забороняємо редагування (захисний підхід)
    if (Object.keys(fieldPermissions).length === 0) {
      console.log(`⚠️ canEdit(${fieldId}): true (немає налаштованих дозволів, дозволяємо за замовчуванням)`);
      return true; // За замовчуванням дозволяємо, поки не налаштовані права
    }
    
    // Перевіряємо конкретний дозвіл:
    // false -> заборонено, true/undefined -> дозволено (щоб нові поля не блокувалися автоматично)
    const allowed = fieldPermissions[fieldId] !== false;
    console.log(`🔒 canEdit(${fieldId}): ${allowed} (значення в permissions: ${fieldPermissions[fieldId]})`);
    return allowed;
  };

  return {
    fieldPermissions,
    loading,
    canEdit,
  };
};
