import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

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

async function listUsers() {
  try {
    const usersSnapshot = await getDocs(collection(db, "users"));
    
    console.log("\n📋 Список користувачів в Firestore:\n");
    
    usersSnapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`UID: ${doc.id}`);
      console.log(`Email: ${data.email}`);
      console.log(`Role: ${data.role}`);
      console.log(`DisplayName: ${data.displayName}`);
      console.log(`Restaurant: ${data.restaurant || "не призначено"}`);
      console.log(`Position: ${data.position || "не призначено"}`);
      console.log(`WorkRole: ${data.workRole || "не призначено"}`);
      console.log("---");
    });
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Помилка:", error);
    process.exit(1);
  }
}

listUsers();
