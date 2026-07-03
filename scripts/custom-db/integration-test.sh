#!/usr/bin/env bash
# ============================================================================
# LUCIA — інтеграційні тести бекенда (custom-db) проти справжньої MariaDB.
#
# Покриває «закони бази»:
#   - консолідація дублікатів таблиць (base vs _flat, різні регістри, сміття)
#   - логін через scrypt-хеші у lucia_authUsers_flat
#   - читання невідомої колекції НЕ створює таблицю
#   - запис у невідому колекцію відхиляється; у відому — створює _flat
#   - чутливі колекції недоступні через /api/collections (усі варіанти імен)
#
# Вимоги: docker, curl, node. Запуск: npm run test:integration
# ============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DB_CONTAINER="lucia-int-db"
DB_PORT="${LUCIA_INT_DB_PORT:-33071}"
API_PORT="${LUCIA_INT_API_PORT:-8799}"
TOKEN="int-test-token"
SERVER_PID=""

PASS=0
FAIL=0

cleanup() {
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null || true
  docker rm -f "$DB_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

assert() {
  local desc="$1"; local expected="$2"; local actual="$3"
  if [[ "$actual" == *"$expected"* ]]; then
    echo "  ✓ $desc"
    PASS=$((PASS+1))
  else
    echo "  ✗ $desc"
    echo "    очікувалось: $expected"
    echo "    отримано:    $actual"
    FAIL=$((FAIL+1))
  fi
}

sql() { docker exec "$DB_CONTAINER" mariadb -uroot -proot lucia_int -e "$1" 2>/dev/null; }

echo "=== 1. Підняття MariaDB ==="
docker rm -f "$DB_CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$DB_CONTAINER" -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=lucia_int -p "$DB_PORT:3306" mariadb:10.11 >/dev/null
for i in $(seq 1 30); do
  sql "SELECT 1" >/dev/null 2>&1 && break
  sleep 1
done
sql "SELECT 1" >/dev/null || { echo "MariaDB не піднялась"; exit 1; }
echo "  ✓ MariaDB готова"

echo "=== 2. Сідінг «хаотичного» стану (дублікати + сміття) ==="
CRED=$(node -e '
const crypto = require("crypto");
const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync("Int123!", salt, 64).toString("hex");
console.log(salt + " " + hash);')
SALT=$(echo "$CRED" | awk '{print $1}')
HASH=$(echo "$CRED" | awk '{print $2}')

sql "
CREATE TABLE lucia_authusers (id VARCHAR(255) PRIMARY KEY, payload JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
INSERT INTO lucia_authusers (id, payload, updated_at) VALUES ('user1', JSON_OBJECT('email','stale@int.ua','updatedAt','2024-01-01T00:00:00Z'), '2024-01-01 00:00:00');
CREATE TABLE lucia_authUsers_flat (id VARCHAR(255) PRIMARY KEY, email VARCHAR(255), password_hash TEXT, password_salt TEXT, payload JSON, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
INSERT INTO lucia_authUsers_flat (id, email, password_hash, password_salt, payload) VALUES ('user1','fresh@int.ua','$HASH','$SALT', JSON_OBJECT('email','fresh@int.ua','updatedAt','2026-01-01T00:00:00Z'));
CREATE TABLE lucia_users_flat (id VARCHAR(255) PRIMARY KEY, email VARCHAR(255), displayName VARCHAR(255), role VARCHAR(64), payload JSON, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
INSERT INTO lucia_users_flat (id, email, displayName, role, payload) VALUES ('user1','fresh@int.ua','Int Test','admin', JSON_OBJECT('email','fresh@int.ua','role','admin','displayName','Int Test'));
CREATE TABLE lucia_lucia_authUsers_flat_flat (id VARCHAR(255) PRIMARY KEY, payload JSON);
"
echo "  ✓ засіяно: lucia_authusers (старий) + lucia_authUsers_flat (свіжий) + сміття"

echo "=== 3. Консолідація: dry-run ==="
DRY=$(MYSQL_HOST=127.0.0.1 MYSQL_PORT=$DB_PORT MYSQL_USER=root MYSQL_PASSWORD=root MYSQL_DATABASE=lucia_int node scripts/custom-db/consolidate-tables.js)
assert "dry-run бачить групу authusers" "consolidate" "$DRY"
assert "dry-run бачить сміття" "garbage" "$DRY"
assert "dry-run не застосовує" "DRY-RUN" "$DRY"
TABLES_AFTER_DRY=$(sql "SHOW TABLES" | tail -n +2 | sort | tr '\n' ' ')
assert "dry-run не змінив таблиці (без бекапів)" "lucia_authusers" "$TABLES_AFTER_DRY"
[[ "$TABLES_AFTER_DRY" != *"zz_backup_"* ]] && { echo "  ✓ dry-run не створив бекапів"; PASS=$((PASS+1)); } || { echo "  ✗ dry-run створив бекапи"; FAIL=$((FAIL+1)); }

echo "=== 4. Консолідація: apply ==="
APPLY_OUT=$(MYSQL_HOST=127.0.0.1 MYSQL_PORT=$DB_PORT MYSQL_USER=root MYSQL_PASSWORD=root MYSQL_DATABASE=lucia_int node scripts/custom-db/consolidate-tables.js --apply)
assert "apply завершився" "Готово" "$APPLY_OUT"
TABLES=$(sql "SHOW TABLES" | tail -n +2 | sort | tr '\n' ' ')
assert "канонічна таблиця існує" "lucia_authUsers_flat" "$TABLES"
assert "бекапи створені" "zz_backup_" "$TABLES"
[[ "$TABLES" != *"lucia_lucia_"*" "* || "$TABLES" == *"zz_backup_lucia_lucia_"* ]] && { echo "  ✓ сміття прибрано в бекап"; PASS=$((PASS+1)); } || { echo "  ✗ сміття лишилось"; FAIL=$((FAIL+1)); }
MERGED_EMAIL=$(sql "SELECT JSON_UNQUOTE(JSON_EXTRACT(payload,'\$.email')) AS e FROM lucia_authUsers_flat WHERE id='user1'" | tail -1)
assert "переміг свіжіший запис" "fresh@int.ua" "$MERGED_EMAIL"

echo "=== 5. Старт бекенда ==="
MIGRATION_DB_ENGINE=mysql MIGRATION_DB_REQUIRE_ENGINE=mysql MYSQL_HOST=127.0.0.1 MYSQL_PORT=$DB_PORT MYSQL_USER=root MYSQL_PASSWORD=root MYSQL_DATABASE=lucia_int \
  CUSTOM_MIGRATION_TOKEN=$TOKEN MIGRATION_PORT=$API_PORT node scripts/custom-db/server.js > /tmp/lucia-int-server.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 20); do
  curl -s "http://127.0.0.1:$API_PORT/health" | grep -q '"ok":true' && break
  sleep 1
done

HEALTH=$(curl -s "http://127.0.0.1:$API_PORT/health?deep=1" -H "Authorization: Bearer $TOKEN")
assert "deep health: authStorage ok" '"authStorage":{"ok":true' "$HEALTH"

echo "=== 6. Логін після консолідації ==="
LOGIN=$(curl -s -X POST "http://127.0.0.1:$API_PORT/auth/login" -H "Content-Type: application/json" -d '{"email":"fresh@int.ua","password":"Int123!"}')
assert "логін успішний" '"ok":true' "$LOGIN"
assert "роль підтягнулась" '"role":"admin"' "$LOGIN"
BAD=$(curl -s -X POST "http://127.0.0.1:$API_PORT/auth/login" -H "Content-Type: application/json" -d '{"email":"fresh@int.ua","password":"WRONG"}')
assert "невірний пароль → Invalid credentials" "Invalid credentials" "$BAD"

echo "=== 7. Реєстр колекцій ==="
UNKNOWN_READ=$(curl -s "http://127.0.0.1:$API_PORT/api/collections/totallyUnknownThing" -H "Authorization: Bearer $TOKEN")
assert "читання невідомої колекції → порожньо" '"data":[]' "$UNKNOWN_READ"
NO_TABLE=$(sql "SHOW TABLES LIKE 'lucia_totallyUnknownThing%'" | wc -l)
assert "таблиця НЕ створена читанням" "0" "$NO_TABLE"

UNKNOWN_WRITE=$(curl -s -X POST "http://127.0.0.1:$API_PORT/api/collections/totallyUnknownThing" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"id":"x","name":"test"}')
assert "запис у невідому колекцію відхилено" "Unknown collection" "$UNKNOWN_WRITE"

KNOWN_WRITE=$(curl -s -X POST "http://127.0.0.1:$API_PORT/api/collections/restaurants" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"id":"r1","name":"Test Resto"}')
assert "запис у відому колекцію ok" '"ok":true' "$KNOWN_WRITE"
KNOWN_TABLE=$(sql "SHOW TABLES LIKE 'lucia_restaurants_flat'" | wc -l)
assert "таблиця відомої колекції створена записом" "2" "$KNOWN_TABLE"

echo "=== 8. Чутливі колекції (усі варіанти обходу) ==="
for name in authUsers authusers AUTHUSERS authSessions authsessions lucia_authUsers_flat lucia_authusers_flat authUsers_flat; do
  RESP=$(curl -s "http://127.0.0.1:$API_PORT/api/collections/$name" -H "Authorization: Bearer $TOKEN")
  assert "заборонено: $name" "Forbidden" "$RESP"
done

echo "=== 9. Унікальний індекс email (після консолідації) ==="
IDX=$(sql "SELECT COUNT(*) AS n FROM information_schema.statistics WHERE table_schema='lucia_int' AND LOWER(table_name)='lucia_authusers_flat' AND index_name='uniq_auth_email'" | tail -1)
assert "UNIQUE індекс uniq_auth_email існує" "1" "$IDX"
DUP_INSERT=$(docker exec "$DB_CONTAINER" mariadb -uroot -proot lucia_int -e "INSERT INTO lucia_authUsers_flat (id, email) VALUES ('dupe_test','fresh@int.ua')" 2>&1 || true)
assert "дублікат email відхилено БД" "Duplicate" "$DUP_INSERT"

echo "=== 10. Rate limiting логіна ==="
RL_LAST=""
for i in $(seq 1 12); do
  RL_LAST=$(curl -s -X POST "http://127.0.0.1:$API_PORT/auth/login" -H "Content-Type: application/json" -d '{"email":"bruteforce@int.ua","password":"WRONG'$i'"}')
done
assert "після 10+ невдалих спроб → 429" "Забагато невдалих спроб" "$RL_LAST"
RL_OK=$(curl -s -X POST "http://127.0.0.1:$API_PORT/auth/login" -H "Content-Type: application/json" -d '{"email":"fresh@int.ua","password":"Int123!"}')
assert "легітимний користувач не заблокований (інший email, той самий IP)" '"ok":true' "$RL_OK"

echo "=== 11. Бекап (через контейнер, як у проді) ==="
docker cp scripts/custom-db/backup-db.sh "$DB_CONTAINER:/tmp/backup-db.sh"
BK_OUT=$(docker exec -e MYSQL_HOST=127.0.0.1 -e MYSQL_PORT=3306 -e MYSQL_USER=root -e MYSQL_PASSWORD=root -e MYSQL_DATABASE=lucia_int -e BACKUP_DIR=/tmp/lucia-backups "$DB_CONTAINER" bash /tmp/backup-db.sh 2>&1) || true
assert "бекап створено" "✓ Готово" "$BK_OUT"
BK_COUNT=$(docker exec "$DB_CONTAINER" sh -c 'ls /tmp/lucia-backups/lucia_*.sql.gz 2>/dev/null | wc -l')
assert "файл бекапа існує" "1" "$BK_COUNT"
BK_CONTENT=$(docker exec "$DB_CONTAINER" sh -c 'cat /tmp/lucia-backups/lucia_*.sql.gz | gunzip | grep -c lucia_authUsers_flat' || true)
[[ "$BK_CONTENT" -gt 0 ]] && { echo "  ✓ бекап містить дані authUsers"; PASS=$((PASS+1)); } || { echo "  ✗ бекап порожній"; FAIL=$((FAIL+1)); }

echo ""
echo "==================================="
echo "Пройдено: $PASS, Провалено: $FAIL"
echo "==================================="
[[ $FAIL -eq 0 ]]
