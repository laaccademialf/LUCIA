#!/bin/bash

echo "🔍 Перевірка налаштувань Firebase Authentication..."
echo ""
echo "📋 Конфігурація з .env:"
echo "  Project ID: ${VITE_FIREBASE_PROJECT_ID:-не знайдено}"
echo "  Auth Domain: ${VITE_FIREBASE_AUTH_DOMAIN:-не знайдено}"
echo ""
echo "✅ Щоб перевірити чи активований Email/Password провайдер:"
echo ""
echo "1. Відкрийте Firebase Console:"
echo "   https://console.firebase.google.com/project/luci-f1285/authentication/providers"
echo ""
echo "2. Переконайтеся що Email/Password провайдер УВІМКНЕНО"
echo ""
echo "3. Якщо вимкнено - натисніть на нього і увімкніть"
echo ""
echo "📖 Детальна інструкція: FIREBASE_AUTH_SETUP.md"
echo ""

# Перевірка чи запущений dev сервер
if lsof -Pi :5174 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "✅ Dev сервер запущений на http://localhost:5174"
else
    echo "⚠️  Dev сервер не запущений. Запустіть: npm run dev"
fi
