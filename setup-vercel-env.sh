#!/bin/bash

echo "🚀 Налаштування змінних оточення для Vercel..."
echo ""

# Перевірка чи встановлено Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "⚠️  Vercel CLI не встановлено"
    echo "Встановіть: npm i -g vercel"
    echo ""
    read -p "Встановити зараз? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm i -g vercel
    else
        exit 1
    fi
fi

# Перевірка .env файлу
if [ ! -f .env ]; then
    echo "❌ Файл .env не знайдено!"
    echo "Створіть .env файл на основі .env.example"
    exit 1
fi

echo "📋 Читання змінних з .env..."
source .env

# Список змінних для Vercel
declare -a vars=(
    "VITE_FIREBASE_API_KEY"
    "VITE_FIREBASE_AUTH_DOMAIN"
    "VITE_FIREBASE_PROJECT_ID"
    "VITE_FIREBASE_STORAGE_BUCKET"
    "VITE_FIREBASE_MESSAGING_SENDER_ID"
    "VITE_FIREBASE_APP_ID"
)

# Опціональна змінна
if [ ! -z "$VITE_FIREBASE_MEASUREMENT_ID" ]; then
    vars+=("VITE_FIREBASE_MEASUREMENT_ID")
fi

echo ""
echo "🔧 Додавання змінних на Vercel..."
echo "Оберіть середовище: Production (p), Preview (v), Development (d), All (a)"
read -p "Ваш вибір: " env_choice

case $env_choice in
    p|P)
        env_flag="production"
        ;;
    v|V)
        env_flag="preview"
        ;;
    d|D)
        env_flag="development"
        ;;
    a|A)
        env_flag="production preview development"
        ;;
    *)
        echo "❌ Невірний вибір"
        exit 1
        ;;
esac

# Додавання кожної змінної
for var in "${vars[@]}"; do
    value="${!var}"
    if [ -z "$value" ]; then
        echo "⚠️  $var не знайдено в .env, пропускаємо..."
        continue
    fi
    
    echo "➕ Додавання $var..."
    for env in $env_flag; do
        echo "$value" | vercel env add "$var" "$env" 2>/dev/null || echo "   (можливо вже існує)"
    done
done

echo ""
echo "✅ Змінні додано!"
echo ""
echo "📦 Наступні кроки:"
echo "1. Перевірте змінні: vercel env ls"
echo "2. Зробіть deployment: vercel --prod"
echo "3. Або просто: git push (якщо підключено Git integration)"
echo ""
