import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Конфігурація Firebase
// Для використання: створіть файл .env в корені проєкту на основі .env.example
const firebaseConfigFromEnv = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_SENDER_ID",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "YOUR_APP_ID"
};

const readRuntimeConfig = () => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return null;
  }

  const raw = localStorage.getItem("lucia_runtime_firebase_config");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const required = ["apiKey", "authDomain", "projectId", "appId"];
    if (!required.every((key) => Boolean(String(parsed?.[key] || "").trim()))) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const firebaseConfig = readRuntimeConfig() || firebaseConfigFromEnv;

// Ініціалізація Firebase
const app = initializeApp(firebaseConfig);

// Ініціалізація Firestore
export const db = getFirestore(app);

// Ініціалізація Authentication
export const auth = getAuth(app);

export const activeFirebaseConfig = firebaseConfig;
export const isRuntimeFirebaseConfig = Boolean(readRuntimeConfig());

export default app;
