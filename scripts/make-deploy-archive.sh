#!/usr/bin/env bash
# Готує деплой-архів проєкту за правилами сервера оновлень:
#  - усі файли кореня проєкту (копія репозиторію)
#  - БЕЗ node_modules (встановлюється з package.json)
#  - dist опційно (--with-dist — сервер пропустить збірку)
#  - .env опційно (--with-env — тільки якщо змінилися змінні оточення)
#
# Використання:
#   npm run deploy:archive                # чистий архів з вихідників
#   npm run deploy:archive -- --with-dist # включити готовий dist (швидше оновлення)
#   npm run deploy:archive -- --with-env  # включити .env
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WITH_DIST=0
WITH_ENV=0
for arg in "$@"; do
  case "$arg" in
    --with-dist) WITH_DIST=1 ;;
    --with-env)  WITH_ENV=1 ;;
    *) echo "Невідомий аргумент: $arg" >&2; exit 1 ;;
  esac
done

# Перевірка: збірка з чистої інсталяції має проходити (усі peer-залежності явні)
echo "==> Перевірка повноти package.json (npm ls) ..."
if ! npm ls --omit=dev >/dev/null 2>&1; then
  echo "ПОПЕРЕДЖЕННЯ: npm ls виявив розбіжності залежностей. Запустіть 'npm install' і перевірте package.json." >&2
fi

if [[ $WITH_DIST -eq 1 ]]; then
  echo "==> Збірка фронтенду (dist буде включено в архів) ..."
  npm run build
fi

VERSION=$(node -p "require('./package.json').version")
STAMP=$(date +%Y%m%d-%H%M%S)
OUT_DIR="$ROOT_DIR/tmp"
ARCHIVE="$OUT_DIR/lucia-deploy-${VERSION}-${STAMP}.tar.gz"
mkdir -p "$OUT_DIR"

EXCLUDES=(
  --exclude='./node_modules'
  --exclude='./scripts/custom-db/node_modules'
  --exclude='./.git'
  --exclude='./tmp'
  --exclude='./android/.gradle'
  --exclude='./android/app/build'
  --exclude='./android/build'
  --exclude='./.env.local'
)
[[ $WITH_DIST -eq 0 ]] && EXCLUDES+=(--exclude='./dist')
[[ $WITH_ENV -eq 0 ]] && EXCLUDES+=(--exclude='./.env' --exclude='./.env.*')

echo "==> Пакування ${ARCHIVE} ..."
tar -czf "$ARCHIVE" "${EXCLUDES[@]}" .

echo "==> Готово:"
ls -lh "$ARCHIVE"
echo
echo "Вміст (перші 30 записів):"
tar -tzf "$ARCHIVE" | head -30
