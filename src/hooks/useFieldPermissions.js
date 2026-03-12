import { useState, useEffect, useCallback } from "react";
import { getFieldPermissions } from "../firebase/permissions";

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
        setFieldPermissions({});
        setLoading(false);
        return;
      }

      try {
        const doc = await getFieldPermissions(workRoleId);

        if (doc && doc.permissions) {
          setFieldPermissions(doc.permissions);
        } else {
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
  const canEdit = useCallback((fieldId) => {
    // Якщо немає дозволів взагалі - забороняємо редагування (захисний підхід)
    if (Object.keys(fieldPermissions).length === 0) {
      return true; // За замовчуванням дозволяємо, поки не налаштовані права
    }
    
    // Перевіряємо конкретний дозвіл:
    // false -> заборонено, true/undefined -> дозволено (щоб нові поля не блокувалися автоматично)
    const allowed = fieldPermissions[fieldId] !== false;
    return allowed;
  }, [fieldPermissions]);

  return {
    fieldPermissions,
    loading,
    canEdit,
  };
};
