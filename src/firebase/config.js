import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

// Конфігурація Firebase (ОПЦІЙНА).
// Платформа працює з власною базою (MariaDB/Postgres) через custom-db API.
// Firebase ініціалізується ЛИШЕ якщо задано реальну конфігурацію:
//  - через env (VITE_FIREBASE_*), АБО
//  - через runtime-налаштування (localStorage lucia_runtime_firebase_config).
// Якщо конфігурації немає — жодних запитів до firestore.googleapis.com не буде.
const firebaseConfigFromEnv = {
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || "").trim(),
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "").trim(),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim(),
  storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "").trim(),
  messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "").trim(),
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID || "").trim(),
};

const REQUIRED_KEYS = ["apiKey", "authDomain", "projectId", "appId"];

const isPlaceholderValue = (value) => {
  const text = String(value || "").trim();
  if (!text) return true;
  return /^your_/i.test(text);
};

const isRealConfig = (config) =>
  Boolean(config) && REQUIRED_KEYS.every((key) => !isPlaceholderValue(config?.[key]));

const readRuntimeConfig = () => {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return null;
  }

  const raw = localStorage.getItem("lucia_runtime_firebase_config");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!isRealConfig(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const runtimeConfig = readRuntimeConfig();
const firebaseConfig = runtimeConfig || (isRealConfig(firebaseConfigFromEnv) ? firebaseConfigFromEnv : null);

export const isFirebaseConfigured = Boolean(firebaseConfig);

// Заглушка: будь-яка спроба використати Firebase без конфігурації дає
// зрозумілу помилку замість тихих запитів на firestore.googleapis.com.
const createDisabledStub = (label) =>
  new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === Symbol.toPrimitive || prop === "toString") {
          return () => `[Firebase ${label} disabled]`;
        }
        throw new Error(
          `Firebase (${label}) вимкнено: платформа працює з власною базою через custom-db API. ` +
            "Якщо Firebase дійсно потрібен, задайте VITE_FIREBASE_* у env або runtime-конфігурацію."
        );
      },
    }
  );

// ЛІНИВА ініціалізація: Firebase SDK не стартує при завантаженні сторінки
// (жодних heartbeat-записів в IndexedDB, жодного трафіку), а лише при першому
// реальному зверненні до db/auth/storage — тобто тільки якщо десь виконується
// не-API гілка коду, чого в same-origin режимі не буває.
let app = null;
let services = null;

const ensureFirebase = () => {
  if (services) return services;
  app = initializeApp(firebaseConfig);
  services = {
    db: getFirestore(app),
    auth: getAuth(app),
    storage: getStorage(app),
  };
  return services;
};

const createLazyService = (key, label) =>
  new Proxy(
    {},
    {
      get(_target, prop) {
        const service = ensureFirebase()[key];
        const value = service[prop];
        return typeof value === "function" ? value.bind(service) : value;
      },
      has(_target, prop) {
        return prop in ensureFirebase()[key];
      },
      getPrototypeOf() {
        return Object.getPrototypeOf(ensureFirebase()[key]);
      },
    }
  );

let db;
let auth;
let storage;

if (isFirebaseConfigured) {
  db = createLazyService("db", "firestore");
  auth = createLazyService("auth", "auth");
  storage = createLazyService("storage", "storage");
} else {
  db = createDisabledStub("firestore");
  auth = createDisabledStub("auth");
  storage = createDisabledStub("storage");
}

export { db, auth, storage };

export const activeFirebaseConfig = firebaseConfig || {};
export const isRuntimeFirebaseConfig = Boolean(runtimeConfig);

export default app;
