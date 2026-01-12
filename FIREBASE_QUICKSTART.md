# 🔥 Швидкий старт: Підключення Firebase

## 📋 Що потрібно зробити

### 1️⃣ Отримайте дані з Firebase Console

1. Відкрийте ваш проєкт у [Firebase Console](https://console.firebase.google.com/)
2. Клікніть на іконку ⚙️ (Settings) → **Project settings**
3. Прокрутіть до розділу **Your apps**
4. Якщо додатка немає - клікніть **Add app** → виберіть веб `</>`
5. Скопіюйте об'єкт `firebaseConfig`

### 2️⃣ Створіть файл `.env`

У корені проєкту створіть файл `.env` та додайте ваші дані:

```bash
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

### 3️⃣ Активуйте Firestore Database

1. В Firebase Console → **Firestore Database**
2. **Create database**
3. **Start in test mode** (для розробки)
4. Виберіть локацію: **europe-west1** (або найближчу)

### 4️⃣ Налаштуйте правила безпеки (опціонально)

У розділі **Firestore Database** → **Rules** додайте:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true; // Тільки для розробки!
    }
  }
}
```

⚠️ **ВАЖЛИВО**: Це правило дозволяє всім читати та писати. Для продакшену потрібні інші правила!

### 5️⃣ Перезапустіть dev-сервер

```bash
npm run dev
```

### 6️⃣ Міграція даних (опціонально)

Якщо хочете завантажити тестові дані:

1. Відкрийте додаток у браузері
2. Відкрийте Console (F12)
3. Введіть:

```javascript
migrateData()
```

Це додасть початкові ресторани до Firestore.

## ✅ Готово!

Тепер всі дані автоматично зберігаються в Firebase Firestore:

- ✅ Ресторани
- ✅ Основні засоби (активи)
- ✅ Графіки роботи
- ✅ Realtime синхронізація між вкладками

## 🔍 Перевірка

1. Додайте ресторан у додатку
2. Перейдіть до Firebase Console → Firestore Database
3. Побачите нову колекцію `restaurants` з вашими даними

## 🛠️ Використання у коді

### Приклад 1: Використання хуків (рекомендовано)

```javascript
import { useRestaurants } from './hooks/useRestaurants';

function MyComponent() {
  const { restaurants, loading, addRestaurant, updateRestaurant, deleteRestaurant } = useRestaurants();
  
  if (loading) return <div>Завантаження...</div>;
  
  return (
    <div>
      {restaurants.map(r => <div key={r.id}>{r.name}</div>)}
    </div>
  );
}
```

### Приклад 2: Прямі функції

```javascript
import { addRestaurant, getRestaurants } from './firebase/firestore';

// Додати ресторан
const newRestaurant = { name: "Новий ресторан", ... };
const id = await addRestaurant(newRestaurant);

// Отримати всі ресторани
const restaurants = await getRestaurants();
```

## 📚 Структура файлів

```
src/
├── firebase/
│   ├── config.js         # Конфігурація Firebase
│   └── firestore.js      # CRUD функції для Firestore
├── hooks/
│   ├── useRestaurants.js # Хук для ресторанів
│   └── useAssets.js      # Хук для активів
└── utils/
    └── migration.js      # Міграція початкових даних
```

## ❓ Питання?

Детальніша інструкція: [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)
