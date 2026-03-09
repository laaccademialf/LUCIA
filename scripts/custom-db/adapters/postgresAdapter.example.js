// Example only. Requires: npm i pg
// This adapter demonstrates how to import docs into PostgreSQL JSONB tables.

import { Client } from "pg";

const quoteIdent = (name) => {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${name}`);
  }
  return `\"${name}\"`;
};

export async function importCollectionsToPostgres({ collectionsData, connectionString }) {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    for (const [collectionName, docs] of Object.entries(collectionsData)) {
      const table = quoteIdent(`lucia_${collectionName}`);

      await client.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      for (const item of docs) {
        await client.query(
          `
            INSERT INTO ${table} (id, payload, updated_at)
            VALUES ($1, $2::jsonb, NOW())
            ON CONFLICT (id)
            DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
          `,
          [item.id, JSON.stringify(item.data || {})]
        );
      }
    }
  } finally {
    await client.end();
  }
}
