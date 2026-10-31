import mariadb from 'mariadb';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

// dotenv never overrides values that are already set, so the first file that defines a value wins.
// The project .env is a fallback for local development, for example on Windows where /etc does not exist.
if (process.env.GARDENPLAN_ENV_FILE) {
  dotenv.config({ path: process.env.GARDENPLAN_ENV_FILE });
} else {
  dotenv.config({ path: ['/etc/gardenplan/gardenplan.env', path.join(root, '.env')] });
}

export const pool = mariadb.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'gardenplan',
  user: process.env.DB_USER || 'gardenplan',
  password: process.env.DB_PASSWORD,
  jsonStrings: true,
  connectionLimit: 5,
  decimalAsNumber: true,
  // Fail with an error instead of waiting forever for a free connection or a blocked query.
  acquireTimeout: 15000,
  queryTimeout: 30000
});

// Creates every table the app needs (CREATE TABLE IF NOT EXISTS, so safe on every start).
export async function initDatabase() {
  const statements = (await readFile(path.join(root, 'schema.sql'), 'utf8'))
    .split(/;\s*(?:\r?\n|$)/)
    .map(s => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
  const conn = await pool.getConnection();
  try {
    for (const sql of statements) await conn.query(sql);
  } finally {
    conn.release();
  }
}
