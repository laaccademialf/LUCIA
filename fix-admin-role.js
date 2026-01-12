import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBXDGMLVWYIZhNE4-xKAMwD_oiR2NUYB6Q",
  authDomain: "luci-f1285.firebaseapp.com",
  projectId: "luci-f1285",
  storageBucket: "luci-f1285.firebasestorage.app",
  messagingSenderId: "1031116046116",
  appId: "1:1031116046116:web:a27a9e2a87eb9f1c64b0ef",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixAdminRole() {
  try {
    const adminEmail = "andrii.disha@gmail.com";
    const adminUID = "11sRYgDZysUxJTxSfSNvWlfvygE2"; // Поточний користувач з браузера
    
    // Знаходимо користувача по UID
    const usersRef = doc(db, "users", adminUID);
    
    // Перевіряємо чи існує документ
    const userDoc = await getDoc(usersRef);
    console.log("Чи існує документ:", userDoc.exists());
    if (userDoc.exists()) {
      console.log("Поточні дані користувача:", userDoc.data());
    }
    
    // Створюємо/оновлюємо документ
    await setDoc(usersRef, {
      email: adminEmail,
      displayName: "Andrii Admin",
      role: "admin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    
    console.log(`✅ Роль користувача ${adminEmail} встановлено на admin`);
    
    // Перевіряємо зміни
    const updatedDoc = await getDoc(usersRef);
    console.log("Оновлені дані:", updatedDoc.data());
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Помилка:", error);
    process.exit(1);
  }
}

fixAdminRole();
