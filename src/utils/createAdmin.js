import { createAdmin } from "../firebase/auth";

/**
 * Створення головного адміністратора
 * Викликайте цю функцію один раз після налаштування Firebase Authentication
 */
export const createMainAdmin = async () => {
  const adminData = {
    email: "andrii.disha@gmail.com",
    password: "October2020!",
    displayName: "Діша Андрій",
  };

  try {
    console.log("🔐 Створення головного адміністратора...");
    
    const admin = await createAdmin(
      adminData.email,
      adminData.password,
      adminData.displayName
    );
    
    console.log("✅ Адміністратор створений успішно!");
    console.log("📧 Email:", admin.email);
    console.log("👤 Ім'я:", admin.displayName);
    console.log("🔑 Роль:", admin.role);
    
    return { success: true, admin };
  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      console.log("ℹ️  Адміністратор з цим email вже існує");
      return { success: false, error: "Користувач вже існує" };
    }
    
    if (error.code === "auth/operation-not-allowed") {
      console.error("❌ Authentication не активовано!");
      console.log("📝 Інструкція:");
      console.log("1. Відкрийте: https://console.firebase.google.com/project/luci-f1285/authentication/providers");
      console.log("2. Увімкніть Email/Password провайдер");
      console.log("3. Збережіть зміни");
      console.log("4. Запустіть createMainAdmin() знову");
      return { success: false, error: "Authentication не активовано. Дивіться інструкцію вище ↑" };
    }

    if (error.code === "permission-denied" || error.message?.includes("Missing or insufficient permissions")) {
      console.error("❌ Firestore правила блокують запис!");
      console.log("");
      console.log("📝 ШВИДКЕ ВИПРАВЛЕННЯ:");
      console.log("1. Відкрийте: https://console.firebase.google.com/project/luci-f1285/firestore/rules");
      console.log("2. Замініть правила на:");
      console.log("");
      console.log("%crules_version = '2';", "color: #10B981");
      console.log("%cservice cloud.firestore {", "color: #10B981");
      console.log("%c  match /databases/{database}/documents {", "color: #10B981");
      console.log("%c    match /{document=**} {", "color: #10B981");
      console.log("%c      allow read, write: if true;", "color: #10B981");
      console.log("%c    }", "color: #10B981");
      console.log("%c  }", "color: #10B981");
      console.log("%c}", "color: #10B981");
      console.log("");
      console.log("3. Натисніть 'Publish'");
      console.log("4. Запустіть createMainAdmin() знову");
      console.log("");
      console.log("⚠️  Це правило для розробки. Для продакшену використовуйте інші правила!");
      return { success: false, error: "Firestore правила блокують запис. Дивіться інструкцію вище ↑" };
    }
    
    console.error("❌ Помилка створення адміністратора:", error);
    return { success: false, error: error.message };
  }
};

// Експорт для використання в консолі браузера
if (typeof window !== "undefined") {
  window.createMainAdmin = createMainAdmin;
}
