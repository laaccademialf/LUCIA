# Налаштування Firebase для LUCIA

## Крок 1: Отримайте конфігураційні дані Firebase

1. Відкрийте [Firebase Console](https://console.firebase.google.com/)
2. Виберіть ваш проєкт
3. Перейдіть до **Project Settings** (іконка шестерні) → **General**
4. Прокрутіть вниз до розділу **Your apps**
5. Якщо ви ще не додали веб-додаток, натисніть **Add app** (веб-іконка `</>`)
6. Зареєструйте додаток (можете назвати його "LUCIA")
7. Скопіюйте конфігураційний об'єкт `firebaseConfig`

## Крок 2: Налаштуйте Firestore Database

1. В Firebase Console перейдіть до **Firestore Database**
2. Натисніть **Create database**
3. Виберіть режим:
   - **Test mode** (для розробки) - дозволяє читання/запис без авторизації
   - **Production mode** (для продакшену) - потребує налаштування правил безпеки
4. Виберіть локацію (наприклад, `europe-west1`)

## Крок 3: Додайте конфігурацію до проєкту

Відредагуйте файл `src/firebase/config.js` та замініть значення на ваші:

\`\`\`javascript
const firebaseConfig = {
  apiKey: "ВАШ_API_KEY",
  authDomain: "ВАШ_PROJECT_ID.firebaseapp.com",
  projectId: "ВАШ_PROJECT_ID",
  storageBucket: "ВАШ_PROJECT_ID.appspot.com",
  messagingSenderId: "ВАШ_MESSAGING_SENDER_ID",
  appId: "ВАШ_APP_ID"
};
\`\`\`

## Крок 4: Налаштуйте правила безпеки Firestore

Для розробки (НЕ використовуйте у продакшені):

\`\`\`
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
\`\`\`

Для продакшену (з автентифікацією):

\`\`\`
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /restaurants/{restaurantId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
    
    match /assets/{assetId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
\`\`\`

## Крок 5: Структура даних Firestore

### Колекція: `restaurants`

Документ містить:
\`\`\`javascript
{
  regNumber: "001",
  name: "Ресторан А",
  address: "Вул. Хрещатик, 1",
  seatsTotal: "50",
  seatsSummer: "",
  seatsWinter: "",
  hasTerrace: false,
  areaTotal: "100",
  areaSummer: "",
  areaWinter: "",
  country: "Україна",
  region: "Київська",
  city: "Київ",
  street: "Хрещатик, 1",
  postalCode: "01001",
  notes: "",
  schedule: {
    mon: { from: "09:00", to: "22:00" },
    tue: { from: "09:00", to: "22:00" },
    wed: { from: "09:00", to: "22:00" },
    thu: { from: "09:00", to: "22:00" },
    fri: { from: "09:00", to: "22:00" },
    sat: { from: "10:00", to: "23:00" },
    sun: { from: "10:00", to: "23:00" }
  },
  createdAt: "2026-01-12T...",
  updatedAt: "2026-01-12T..."
}
\`\`\`

### Колекція: `assets`

Документ містить всі поля з інвентаризації основних засобів.

## Крок 6: Міграція існуючих даних

Після налаштування Firebase, ви можете використати скрипт міграції:

\`\`\`bash
# У консолі браузера при відкритому додатку
# Запустіть функцію migrateData() з src/utils/migration.js
\`\`\`

## Використання у додатку

Firebase вже інтегровано в додаток. Всі операції CRUD автоматично синхронізуються з Firestore:

- ✅ Додавання нових ресторанів
- ✅ Редагування ресторанів
- ✅ Видалення ресторанів
- ✅ Realtime оновлення (дані автоматично оновлюються у всіх відкритих вкладках)
- ✅ Збереження активів (основних засобів)

## Корисні посилання

- [Firebase Console](https://console.firebase.google.com/)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Firebase Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
