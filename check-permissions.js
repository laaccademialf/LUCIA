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

async function checkPermissions() {
  try {
    const permissionsSnapshot = await getDocs(collection(db, "rolePermissions"));
    
    console.log("\n📋 Права доступу в Firestore:\n");
    
    if (permissionsSnapshot.empty) {
      console.log("⚠️ Колекція rolePermissions порожня!");
    } else {
      permissionsSnapshot.forEach((doc) => {
        const data = doc.data();
        console.log(`ID Ролі: ${doc.id}`);
        console.log(`Назва: ${data.roleName}`);
        console.log(`Права:`, JSON.stringify(data.permissions, null, 2));
        console.log("---\n");
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Помилка:", error);
    process.exit(1);
  }
}

checkPermissions();
