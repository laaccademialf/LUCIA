import { useState, useEffect } from "react";

/**
 * Хук для завантаження прав редагування полів на основі робочої ролі користувача
 * @param {string} workRoleId - ID робочої ролі користувача
 * @returns {Object} - Об'єкт з дозволами { fieldId: boolean }
 */
export const useFieldPermissions = (workRoleId) => {
  const [fieldPermissions, setFieldPermissions] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workRoleId) {
      setFieldPermissions({});
      setLoading(false);
      return;
    }

    // Завантажуємо дозволи з localStorage
    const savedPermissions = localStorage.getItem("fieldPermissions");
    
    if (savedPermissions) {
      try {
        const allPermissions = JSON.parse(savedPermissions);
        const rolePermissions = allPermissions[workRoleId] || {};
        
        console.log("🔐 Дозволи для ролі:", workRoleId, rolePermissions);
        setFieldPermissions(rolePermissions);
      } catch (error) {
        console.error("Помилка парсингу дозволів:", error);
        setFieldPermissions({});
      }
    } else {
      // Якщо немає збережених дозволів - всі поля доступні
      console.log("⚠️ Немає збережених дозволів, всі поля доступні");
      setFieldPermissions({});
    }
    
    setLoading(false);
  }, [workRoleId]);

  /**
   * Перевірка чи може користувач редагувати поле
   * @param {string} fieldId - ID поля
   * @returns {boolean} - true якщо може редагувати, false якщо тільки читання
   */
  const canEdit = (fieldId) => {
    // Якщо немає дозволів взагалі - дозволяємо редагувати
    if (Object.keys(fieldPermissions).length === 0) {
      return true;
    }
    
    // Перевіряємо конкретний дозвіл
    return fieldPermissions[fieldId] !== false;
  };

  return {
    fieldPermissions,
    loading,
    canEdit,
  };
};
