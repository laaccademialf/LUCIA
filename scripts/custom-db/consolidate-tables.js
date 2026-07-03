#!/usr/bin/env node
// ============================================================================
// LUCIA — одноразова консолідація таблиць MariaDB/MySQL.
//
// ПРОБЛЕМА: історично та сама колекція могла жити в кількох таблицях
// (lucia_authusers, lucia_authUsers, lucia_authUsers_flat, ...). Сервер
// зливав їх «магією кандидатів», що робило поведінку бази непередбачуваною.
//
// ЩО РОБИТЬ СКРИПТ:
//   1. Знаходить усі таблиці lucia_* і групує за канонічною колекцією
//      (без регістру, без суфікса _flat).
//   2. Для груп із >1 таблиці зливає записи в канонічну lucia_<Name>_flat
//      (свіжіший updated_at/created_at виграє при дублікаті id).
//   3. Старі таблиці перейменовує в zz_backup_<ім'я>_<час> (НЕ видаляє).
//   4. Сміттєві таблиці типу lucia_lucia_*_flat_flat (наслідок sed-хотфіксів)
//      теж ідуть у бекап.
//
// ВИКОРИСТАННЯ (env ті самі, що в сервера: /etc/lucia/db.env або оточення):
//   node scripts/custom-db/consolidate-tables.js            # dry-run (звіт, БЕЗ змін)
//   node scripts/custom-db/consolidate-tables.js --apply    # застосувати
//
// У Docker:
//   docker exec luci-backend node scripts/custom-db/consolidate-tables.js --apply
//
// ПІСЛЯ УСПІШНОЇ КОНСОЛІДАЦІЇ:
//   - env AUTH_USERS_COLLECTIONS більше не потрібен — можна прибрати;
//   - переконавшись, що все працює, бекапи zz_backup_* можна видалити.
// ============================================================================
import { readFileSync } from "node:fs";
import { KNOWN_COLLECTIONS, canonicalCollectionKey } from "./collections.js";

const loadEnvFile = (filePath) => {
  try {
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* env-файл опційний */
  }
};
loadEnvFile("/etc/lucia/db.env");
loadEnvFile(new URL("../../.env", import.meta.url).pathname);

const APPLY = process.argv.includes("--apply");

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "",
};

const KNOWN_BY_KEY = new Map(KNOWN_COLLECTIONS.map((name) => [name.toLowerCase(), name]));

const quoteIdent = (name) => `\`${String(name).replace(/`/g, "``")}\``;

const rowTimestamp = (doc) => {
  const candidates = [doc?.updatedAt, doc?.updated_at, doc?.createdAt, doc?.created_at];
  let best = 0;
  for (const value of candidates) {
    const ts = Date.parse(String(value || ""));
    if (Number.isFinite(ts) && ts > best) best = ts;
  }
  return best;
};

const parsePayload = (value) => {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

// Той самий принцип, що mapMySqlRowToDocument на сервері: payload — база,
// скалярні колонки мають пріоритет, крім випадку «скаляр порожній, payload — ні».
const rowToDocument = (row) => {
  const doc = { ...parsePayload(row.payload) };
  for (const [key, value] of Object.entries(row)) {
    if (key === "payload") continue;
    if (value === undefined) continue;
    if ((value === "" || value === null) && doc[key] !== undefined && doc[key] !== null && doc[key] !== "") {
      continue;
    }
    doc[key] = value;
  }
  doc.id = String(row.id || "");
  return doc;
};

const main = async () => {
  if (!MYSQL_CONFIG.database) {
    console.error("MYSQL_DATABASE не задано. Запустіть з env сервера (наприклад, у контейнері бекенда).");
    process.exit(1);
  }

  const mysql = await import("mysql2/promise");
  const conn = await mysql.default.createConnection(MYSQL_CONFIG);
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

  try {
    const [tables] = await conn.execute(
      `SELECT table_name AS t FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name LIKE 'lucia%'`
    );
    const allTables = tables
      .map((r) => String(r.t))
      .filter((t) => t.startsWith("lucia_"));

    // Сміття від sed-хотфіксів: lucia_lucia_*
    const garbage = allTables.filter((t) => /^lucia_lucia_/i.test(t));

    // Групування за канонічним ключем
    const groups = new Map(); // key -> [tableNames]
    for (const table of allTables) {
      if (garbage.includes(table)) continue;
      const key = canonicalCollectionKey(table);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(table);
    }

    const actions = [];

    for (const [key, groupTables] of groups) {
      const canonicalName = KNOWN_BY_KEY.get(key) || null;
      const targetTable = `lucia_${canonicalName || key}_flat`;
      const isAligned = groupTables.length === 1 && groupTables[0] === targetTable;
      if (isAligned) continue;

      actions.push({ key, canonicalName, targetTable, sources: groupTables });
    }

    console.log(`\n=== LUCIA консолідація таблиць (${APPLY ? "APPLY" : "DRY-RUN"}) ===`);
    console.log(`База: ${MYSQL_CONFIG.database} @ ${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}`);
    console.log(`Таблиць lucia_*: ${allTables.length}, груп до консолідації: ${actions.length}, сміттєвих: ${garbage.length}\n`);

    for (const table of garbage) {
      console.log(`[garbage] ${table} → zz_backup_${table}_${stamp}`);
      if (APPLY) {
        await conn.execute(`RENAME TABLE ${quoteIdent(table)} TO ${quoteIdent(`zz_backup_${table}_${stamp}`)}`);
      }
    }

    for (const action of actions) {
      const { key, canonicalName, targetTable, sources } = action;
      console.log(`[consolidate] "${key}"${canonicalName ? ` (канон: ${canonicalName})` : " (НЕвідома колекція!)"}`);
      console.log(`  джерела: ${sources.join(", ")}`);
      console.log(`  ціль:    ${targetTable}`);

      if (!APPLY) continue;

      // 1. Читаємо та зливаємо всі записи (свіжіший виграє)
      const merged = new Map(); // id -> {doc, ts}
      let totalRows = 0;
      for (const source of sources) {
        const [rows] = await conn.execute(`SELECT * FROM ${quoteIdent(source)}`);
        totalRows += rows.length;
        for (const row of rows) {
          const doc = rowToDocument(row);
          const id = doc.id;
          if (!id) continue;
          const ts = rowTimestamp(doc);
          const current = merged.get(id);
          if (!current || ts >= current.ts) {
            merged.set(id, { doc, ts });
          }
        }
      }

      // 2. Готуємо цільову таблицю
      const sourceIsTarget = sources.includes(targetTable);
      const workTable = `${targetTable}__consolidating`;
      await conn.execute(`DROP TABLE IF EXISTS ${quoteIdent(workTable)}`);
      await conn.execute(`
        CREATE TABLE ${quoteIdent(workTable)} (
          id VARCHAR(255) PRIMARY KEY,
          payload JSON NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      // 3. Пишемо злиті документи (payload — джерело правди; скалярні колонки
      //    сервер добудує сам при наступних записах через ensureFlatColumnsMySql)
      for (const { doc } of merged.values()) {
        const { id, ...payload } = doc;
        await conn.execute(
          `INSERT INTO ${quoteIdent(workTable)} (id, payload) VALUES (?, ?)`,
          [id, JSON.stringify(payload)]
        );
      }

      // 4. Атомарна заміна: джерела → бекапи, робоча таблиця → канонічна
      const renames = [];
      for (const source of sources) {
        renames.push(`${quoteIdent(source)} TO ${quoteIdent(`zz_backup_${source}_${stamp}`)}`);
      }
      renames.push(`${quoteIdent(workTable)} TO ${quoteIdent(targetTable)}`);
      await conn.execute(`RENAME TABLE ${renames.join(", ")}`);

      console.log(`  ✓ злито ${merged.size} унікальних записів із ${totalRows} рядків (${sources.length} таблиць)${sourceIsTarget ? "" : ""}`);
    }

    if (!APPLY && (actions.length > 0 || garbage.length > 0)) {
      console.log(`\nЦе був DRY-RUN. Запустіть з --apply, щоб застосувати.`);
      console.log(`Перед --apply зробіть дамп: mysqldump ${MYSQL_CONFIG.database} > backup.sql`);
    }
    if (actions.length === 0 && garbage.length === 0) {
      console.log("Все вже консолідовано — дій не потрібно. ✓");
    }
    if (APPLY && (actions.length > 0 || garbage.length > 0)) {
      console.log(`\n✓ Готово. Старі таблиці збережено як zz_backup_*_${stamp}.`);
      console.log("Після перевірки роботи їх можна видалити. Перезапустіть бекенд, щоб скинути кеш résolution таблиць.");
    }
  } finally {
    await conn.end();
  }
};

main().catch((error) => {
  console.error("Помилка консолідації:", error.message);
  process.exit(1);
});
