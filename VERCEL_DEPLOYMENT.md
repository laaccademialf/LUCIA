# 🚀 Деплой LUCIA на Vercel

## Проблема: auth/api-key-not-valid на Vercel

Коли проект працює локально, але на Vercel видає помилку з API ключем - це означає що **змінні оточення не налаштовані на Vercel**.

## ✅ Рішення: Налаштування Environment Variables

### Крок 1: Відкрийте налаштування проекту на Vercel

1. Перейдіть на https://vercel.com/dashboard
2. Оберіть ваш проект **LUCIA**
3. Перейдіть в **Settings** (⚙️)
4. Оберіть **Environment Variables** в лівому меню

### Крок 2: Додайте всі змінні з .env файлу

Додайте кожну змінну окремо, натискаючи **Add**:

| Name | Value (з вашого .env) |
|------|----------------------|
| `VITE_FIREBASE_API_KEY` | не використовується, Firebase вимкнено |
| `VITE_FIREBASE_AUTH_DOMAIN` | не використовується |
| `VITE_FIREBASE_PROJECT_ID` | не використовується |
| `VITE_FIREBASE_STORAGE_BUCKET` | не використовується |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `27065662746` |
| `VITE_FIREBASE_APP_ID` | `1:27065662746:web:1ebada5c79b5181b4cc0a3` |
| `VITE_FIREBASE_MEASUREMENT_ID` | `G-W0E0FGF0VP` |

**Важливо:**
- ✅ Для кожної змінної оберіть середовище: **Production**, **Preview**, і **Development**
- ✅ Всі змінні повинні починатися з префіксом `VITE_`
- ✅ Копіюйте значення БЕЗ лапок

### Крок 3: Redeploy проекту

Після додавання змінних:

1. Перейдіть на вкладку **Deployments**
2. Знайдіть останній deployment
3. Натисніть три крапки `...` → **Redeploy**
4. Або зробіть новий commit і push:
   ```bash
   git commit --allow-empty -m "Trigger Vercel redeploy"
   git push
   ```

### Крок 4: Перевірка

1. Дочекайтеся завершення deployment
2. Відкрийте ваш сайт на Vercel
3. Спробуйте зареєструватися

## 🔍 Швидка перевірка через Vercel CLI

```bash
# Встановіть Vercel CLI (якщо не встановлено)
npm i -g vercel

# Додайте змінні через CLI
vercel env add VITE_FIREBASE_API_KEY
vercel env add VITE_FIREBASE_AUTH_DOMAIN
vercel env add VITE_FIREBASE_PROJECT_ID
vercel env add VITE_FIREBASE_STORAGE_BUCKET
vercel env add VITE_FIREBASE_MESSAGING_SENDER_ID
vercel env add VITE_FIREBASE_APP_ID
vercel env add VITE_FIREBASE_MEASUREMENT_ID

# Redeploy
vercel --prod
```

## 📋 Автоматичне додавання змінних (скрипт)

Створіть файл `vercel-env-setup.sh`:

```bash
#!/bin/bash

# Читаємо змінні з .env
source .env

# Додаємо на Vercel
vercel env add VITE_FIREBASE_API_KEY production <<< "$VITE_FIREBASE_API_KEY"
vercel env add VITE_FIREBASE_AUTH_DOMAIN production <<< "$VITE_FIREBASE_AUTH_DOMAIN"
vercel env add VITE_FIREBASE_PROJECT_ID production <<< "$VITE_FIREBASE_PROJECT_ID"
vercel env add VITE_FIREBASE_STORAGE_BUCKET production <<< "$VITE_FIREBASE_STORAGE_BUCKET"
vercel env add VITE_FIREBASE_MESSAGING_SENDER_ID production <<< "$VITE_FIREBASE_MESSAGING_SENDER_ID"
vercel env add VITE_FIREBASE_APP_ID production <<< "$VITE_FIREBASE_APP_ID"

echo "✅ Змінні додано! Запустіть: vercel --prod"
```

## 🎯 Налаштування Firebase для Production

### Важливо: Додайте Vercel домен в Firebase

1. Firebase не використовується. Налаштуйте тільки змінні custom-db API та MariaDB.
2. **Authentication** → **Settings** → **Authorized domains**
3. Додайте ваш Vercel домен:
   - `your-project.vercel.app`
   - або ваш custom домен

Без цього Firebase не дозволить автентифікацію з Vercel!

## 🔒 Безпека Production

### Firebase Rules
Перевірте правила безпеки Firestore для production:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Користувачі
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
      allow create: if request.auth != null;
    }
    
    // Ресторани - тільки для авторизованих
    match /restaurants/{restaurantId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Активи - тільки для авторизованих
    match /assets/{assetId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    
    // Довідники - читання для всіх авторизованих, запис тільки для адмінів
    match /{document=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

## ✅ Чеклист для Production

- [ ] Всі змінні `VITE_FIREBASE_*` додані в Vercel
- [ ] Vercel домен додано в Firebase Authorized domains
- [ ] Email/Password провайдер увімкнено в Firebase
- [ ] Firestore Rules налаштовані для production
- [ ] Зроблено Redeploy після додавання змінних
- [ ] Перевірено реєстрацію на production сайті

## 🚨 Типові помилки

1. **Забули Redeploy** - змінні застосовуються тільки після нового деплою
2. **Не додали домен в Firebase** - автентифікація не працюватиме
3. **Не вибрали середовище** - оберіть Production, Preview, Development
4. **Помилка в імені змінної** - перевірте префікс `VITE_`

## 📱 Перевірка в консолі браузера

На production сайті відкрийте консоль (F12) і виконайте:

```javascript
console.log('Environment check:');
console.log('API Key:', import.meta.env.VITE_FIREBASE_API_KEY);
console.log('Project ID:', import.meta.env.VITE_FIREBASE_PROJECT_ID);
```

Якщо виводить `undefined` - змінні не завантажені, перевірте налаштування!
