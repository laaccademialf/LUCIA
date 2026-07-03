#!/usr/bin/env bash
# ============================================================================
# LUCIA — бекап MariaDB (mysqldump + gzip + ротація).
#
# ВИКОРИСТАННЯ:
#   bash scripts/custom-db/backup-db.sh                 # бекап у /var/backups/lucia
#   BACKUP_DIR=/mnt/backups bash scripts/custom-db/backup-db.sh
#
# ENV (ті самі, що в сервера — /etc/lucia/db.env підвантажується автоматично):
#   MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
#   BACKUP_DIR        — куди складати (default /var/backups/lucia)
#   BACKUP_KEEP_DAYS  — скільки днів зберігати (default 14)
#
# CRON (щодня о 02:30, від root):
#   30 2 * * * /usr/bin/bash /var/www/example.com/app/scripts/custom-db/backup-db.sh >> /var/log/lucia-backup.log 2>&1
#
# DOCKER (хост-cron, контейнер із бекендом):
#   30 2 * * * docker exec luci-backend bash scripts/custom-db/backup-db.sh >> /var/log/lucia-backup.log 2>&1
#   (переконайтесь, що BACKUP_DIR змонтовано як volume — інакше бекап зникне з контейнером!)
#
# ВІДНОВЛЕННЯ:
#   gunzip < lucia_YYYY-MM-DD_HHMMSS.sql.gz | mysql -h$MYSQL_HOST -u$MYSQL_USER -p $MYSQL_DATABASE
# ============================================================================
set -euo pipefail

# Підвантажити env сервера, якщо є (не перетираючи вже задане оточення)
if [[ -f /etc/lucia/db.env ]]; then
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^[A-Z_]+$ ]] || continue
    [[ -z "${!key:-}" ]] && export "$key=$value"
  done < <(grep -E '^[A-Z_]+=' /etc/lucia/db.env)
fi

MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_DATABASE="${MYSQL_DATABASE:?MYSQL_DATABASE не задано}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/lucia}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

STAMP=$(date +%Y-%m-%d_%H%M%S)
FILE="$BACKUP_DIR/lucia_${STAMP}.sql.gz"

# Пароль через env-змінну MYSQL_PWD — не світиться в ps
export MYSQL_PWD="${MYSQL_PASSWORD:-}"

DUMP_BIN=$(command -v mariadb-dump || command -v mysqldump || true)
if [[ -z "$DUMP_BIN" ]]; then
  echo "✗ Не знайдено mariadb-dump/mysqldump. Встановіть: apt-get install mariadb-client" >&2
  exit 1
fi

echo "[$(date -Iseconds)] Бекап $MYSQL_DATABASE → $FILE"
"$DUMP_BIN" \
  -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" \
  --single-transaction --quick --routines --triggers \
  --no-tablespaces \
  "$MYSQL_DATABASE" | gzip > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
echo "[$(date -Iseconds)] ✓ Готово: $FILE ($SIZE)"

# Перевірка цілісності архіву
gzip -t "$FILE" || { echo "✗ Архів пошкоджено!"; exit 1; }

# Ротація
DELETED=$(find "$BACKUP_DIR" -name "lucia_*.sql.gz" -mtime "+$BACKUP_KEEP_DAYS" -print -delete | wc -l)
[[ "$DELETED" -gt 0 ]] && echo "[$(date -Iseconds)] Ротація: видалено $DELETED старих бекапів (> $BACKUP_KEEP_DAYS днів)"

# Підсумок
COUNT=$(find "$BACKUP_DIR" -name "lucia_*.sql.gz" | wc -l)
echo "[$(date -Iseconds)] Всього бекапів: $COUNT"
