#!/usr/bin/env bash
# Піднімає migration-сервер з env для Vik-Soft API та робить порт публічним.
# Запускати ОДИН раз після перезапуску Codespace:
#   bash scripts/start-energocenter.sh
set -e
cd "$(dirname "$0")/.."

if [ ! -f .env.energocenter ]; then
  echo "[!] .env.energocenter не знайдено. Створи його з:"
  echo "    VIKSOFT_API_BASE=https://your-viksoft-host.example"
  echo "    VIKSOFT_USER=<login>"
  echo "    VIKSOFT_PASSWORD=<password>"
  exit 1
fi

# Зупиняємо попередній екземпляр
pkill -9 -f "node scripts/custom-db/server" 2>/dev/null || true
sleep 1

# Оновлюємо git-метадані для поточного codespace перед запуском.
node scripts/git-meta.cjs

# Стартуємо у фоні
set -a; . ./.env.energocenter; set +a
nohup node scripts/custom-db/server.js > /tmp/migration-server.log 2>&1 &
SERVER_PID=$!
echo "[+] migration-server PID=$SERVER_PID"

# Чекаємо готовності
for i in 1 2 3 4 5; do
  if curl -sf http://127.0.0.1:8787/health > /dev/null; then
    echo "[+] /health OK"
    break
  fi
  sleep 1
done

# Робимо порт публічним (потрібно для CORS з 5173)
if command -v gh > /dev/null && [ -n "${CODESPACE_NAME:-}" ]; then
  gh codespace ports visibility 8787:public -c "$CODESPACE_NAME" || \
    echo "[!] Не вдалося зробити порт публічним через gh. Зроби вручну у вкладці PORTS."
else
  echo "[i] Не Codespace або немає gh — порт не публікую."
fi

echo "[✓] Готово. Лог: tail -f /tmp/migration-server.log"
