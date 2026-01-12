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
    const loadPermissions = async () => {
      if (!workRoleId) {
        console.log("⚠️ Немає workRoleId");
        setFieldPermissions({});
        setLoading(false);
        return;
      }

      // Завантажуємо дозволи з localStorage
      const savedPermissions = localStorage.getItem("fieldPermissions");
      
      if (savedPermissions) {
        try {
          const allPermissions = JSON.parse(savedPermissions);
          console.log("📦 Всі збережені дозволи:", allPermissions);
          console.log("🔍 Шукаємо дозволи для workRole:", workRoleId);
          
          // Спочатку пробуємо знайти по ID
          let rolePermissions = allPermissions[workRoleId];
          
          if (!rolePermissions) {
            // Якщо workRoleId - це назва ролі, завантажуємо список ролей та шукаємо ID
            console.log("🔄 workRole схоже на назву, шукаємо відповідний ID...");
            
            try {
              const { getWorkRoles } = await import("../firebase/rolesPositions");
              const roles = await getWorkRoles();
              const matchingRole = roles.find(r => r.name === workRoleId);
              
              if (matchingRole) {
                console.log("✅ Знайдено роль по назві:", matchingRole.name, "ID:", matchingRole.id);
                rolePermissions = allPermissions[matchingRole.id] || {};
              } else {
                console.log("⚠️ Роль не знайдена в базі");
                rolePermissions = {};
              }
            } catch (error) {
              console.error("Помилка завантаження ролей:", error);
              rolePermissions = {};
            }
          }
          
          console.log("🔐 Дозволи для ролі:", workRoleId, rolePermissions);
          setFieldPermissions(rolePermissions);
        } catch (error) {
          console.error("Помилка парсингу дозволів:", error);
          setFieldPermissions({});
        }
      } else {
        console.log("⚠️ Немає збережених дозволів в localStorage");
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
    
    // Перевіряємо конкретний дозвіл - якщо поле є і воно true, то дозволяємо
    // Якщо поле є і воно false або undefined - забороняємо
    const allowed = fieldPermissions[fieldId] === true;
    console.log(`🔒 canEdit(${fieldId}): ${allowed} (значення в permissions: ${fieldPermissions[fieldId]})`);
    return allowed;
  };

  return {
    fieldPermissions,
    loading,
    canEdit,
  };
};
