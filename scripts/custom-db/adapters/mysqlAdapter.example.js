// Example only. Requires: npm i mysql2
// This adapter demonstrates how to import docs into MySQL JSON tables.

import mysql from "mysql2/promise";

const quoteIdent = (name) => {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return `\`${name}\``;
};

export async function importCollectionsToMySql({ collectionsData, mysqlConfig }) {
  const conn = await mysql.createConnection(mysqlConfig);

  try {
    for (const [collectionName, docs] of Object.entries(collectionsData)) {
      const table = quoteIdent(`lucia_${collectionName}`);

      await conn.execute(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id VARCHAR(255) PRIMARY KEY,
          payload JSON NOT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      for (const item of docs) {
        await conn.execute(
          `
            INSERT INTO ${table} (id, payload)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP
          `,
          [item.id, JSON.stringify(item.data || {})]
        );
      }
    }
  } finally {
    await conn.end();
  }
}
