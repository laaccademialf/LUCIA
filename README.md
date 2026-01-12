# LUCIA - La Famiglia Unified Control & Intelligence

Система управління рестораном з інтеграцією Firebase.

## 🚀 Швидкий старт

### Локальна розробка

```bash
# Встановлення залежностей
npm install

# Налаштування Firebase
cp .env.example .env
# Відредагуйте .env з вашими Firebase credentials

# Запуск dev сервера
npm run dev
```

### 📦 Деплой на Vercel

**Важливо:** Після деплою на Vercel обов'язково налаштуйте змінні оточення!

#### Варіант 1: Через веб-інтерфейс Vercel

1. Відкрийте https://vercel.com/dashboard
2. Оберіть проект → Settings → Environment Variables
3. Додайте всі змінні з `.env` файлу (з префіксом `VITE_`)
4. Зробіть Redeploy

#### Варіант 2: Через CLI (автоматично)

```bash
# Встановіть Vercel CLI
npm i -g vercel

# Запустіть скрипт налаштування
./setup-vercel-env.sh

# Або додайте вручну
vercel env add VITE_FIREBASE_API_KEY
# ... інші змінні

# Deployment
vercel --prod
```

**📖 Детальна інструкція:** [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md)

## 🔧 Налаштування Firebase

1. Створіть проект на https://console.firebase.google.com
2. Увімкніть Authentication → Email/Password
3. Створіть Firestore database
4. Додайте ваш домен в Authorized domains
5. Скопіюйте credentials в `.env`

**📖 Детальні інструкції:**
- [FIREBASE_SETUP.md](FIREBASE_SETUP.md) - Повна настройка
- [FIREBASE_AUTH_SETUP.md](FIREBASE_AUTH_SETUP.md) - Налаштування автентифікації

## 🐛 Вирішення проблем

### "auth/api-key-not-valid" на Vercel
→ Не налаштовані змінні оточення. Див. [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md)

### "auth/api-key-not-valid" локально
→ Не перезапущений dev сервер після зміни .env. Запустіть `./restart-dev.sh`

### Помилки реєстрації
→ Перевірте чи увімкнено Email/Password в Firebase Console

**📖 Повний гід:** [TROUBLESHOOTING_API_KEY.md](TROUBLESHOOTING_API_KEY.md)

## 📚 Структура проекту

```
src/
├── components/          # React компоненти
│   ├── AssetForm.jsx       # Форма активів
│   ├── LoginModal.jsx      # Модал входу
│   ├── UsersTable.jsx      # Таблиця користувачів
│   └── ...
├── firebase/           # Firebase конфігурація та функції
│   ├── config.js          # Ініціалізація
│   ├── auth.js            # Автентифікація
│   ├── firestore.js       # Операції з БД
│   └── ...
├── hooks/             # Custom React hooks
└── utils/             # Допоміжні функції
```

## 🔑 Ролі користувачів

- **Admin** - Повний доступ до всіх функцій
- **User** - Обмежений доступ згідно з налаштуваннями ролі

Управління ролями: Налаштування → Облікові записи → Редагувати

## 🛠️ Корисні команди

```bash
npm run dev          # Запуск dev сервера
npm run build        # Build для production
npm run preview      # Перегляд production build
./restart-dev.sh     # Перезапуск dev сервера
./check-auth.sh      # Перевірка Firebase налаштувань
```

## 📄 Ліцензія

Приватний проект La Famiglia

---

## React + Vite (технічні деталі)

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
