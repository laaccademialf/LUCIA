import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

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

async function fixTest3User() {
  try {
    // Знаходимо UID з консолі браузера або створюємо запис
    // Якщо ви знаєте UID test3, вставте його тут
    const test3UID = "PASTE_UID_HERE"; // Треба взяти з помилки в консолі або Firebase Console
    
    console.log("Створюємо/оновлюємо користувача test3 в Firestore...");
    
    await setDoc(doc(db, "users", test3UID), {
      email: "test3@gmail.com",
      displayName: "Test3",
      role: "user",
      restaurant: "Кувшин", // Або ID ресторану
      position: "Керуючий",
      workRole: "Керуючий",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    
    console.log("✅ Користувач test3 додано в Firestore!");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Помилка:", error);
    process.exit(1);
  }
}

console.log(`
⚠️ Для виправлення test3 потрібен UID користувача.

Варіанти:
1. Подивіться UID в Firebase Console (Authentication → Users)
2. Або просто видаліть test3 з Firebase Auth і створіть заново

Щоб видалити з Auth, зайдіть в Firebase Console:
https://console.firebase.google.com/project/luci-f1285/authentication/users

Знайдіть test3@gmail.com і видаліть, потім створіть заново через систему.
`);

// fixTest3User();
