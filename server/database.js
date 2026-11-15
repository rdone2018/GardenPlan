import mariadb from 'mariadb';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
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

// Tables holding a gardener's data. Each row belongs to one gardener (column gardener_id, first in the primary key),
// so two gardeners may even use the same item ids without touching each other's data.
export const GARDENER_TABLES = ['gardens', 'plants', 'placements', 'equipment', 'tasks', 'photos', 'meta'];

// Creates every table the app needs (CREATE TABLE IF NOT EXISTS, so safe on every start), then moves data saved
// before gardeners existed to the first gardener.
export async function initDatabase() {
  const statements = (await readFile(path.join(root, 'schema.sql'), 'utf8'))
    .split(/;\s*(?:\r?\n|$)/)
    .map(s => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
  const conn = await pool.getConnection();
  try {
    for (const sql of statements) await conn.query(sql);
    await addGardenerColumns(conn);
  } finally {
    conn.release();
  }
}

const newId = prefix => prefix + '-' + crypto.randomUUID();

async function primaryKey(conn, table) {
  const rows = await conn.query(
    "SELECT COLUMN_NAME AS c FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION",
    [table]);
  return rows.map(r => r.c);
}

// The gardener that data from before gardeners belongs to: the oldest one, or a new one when there is none yet.
// The first user (set up on the page) joins it and names it.
export async function firstGardenerId(conn) {
  const [g] = await conn.query('SELECT id FROM gardeners ORDER BY created_at, id LIMIT 1');
  if (g) return g.id;
  const id = newId('g');
  await conn.query('INSERT INTO gardeners (id, name, created_at) VALUES (?, ?, ?)', [id, '', new Date()]);
  return id;
}

// Older databases have no gardener_id column: add it (first in every primary key) and give all existing rows to the
// first gardener. Rows left without a gardener by an interrupted earlier start are given to it too, but only while
// nobody has signed up yet – later every row is always written with its gardener.
async function addGardenerColumns(conn) {
  const added = [];
  for (const table of GARDENER_TABLES) {
    const [col] = await conn.query(
      "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'gardener_id'", [table]);
    if (Number(col.n) === 0) {
      await conn.query('ALTER TABLE `' + table + "` ADD COLUMN gardener_id VARCHAR(40) NOT NULL DEFAULT '' FIRST");
      added.push(table);
    }
  }
  const [users] = await conn.query('SELECT COUNT(*) AS n FROM users');
  if (added.length || Number(users.n) === 0) {
    let gardenerId = null;
    for (const table of GARDENER_TABLES) {
      const [orphans] = await conn.query('SELECT COUNT(*) AS n FROM `' + table + "` WHERE gardener_id = ''");
      if (!Number(orphans.n)) continue;
      gardenerId = gardenerId || await firstGardenerId(conn);
      await conn.query('UPDATE `' + table + "` SET gardener_id = ? WHERE gardener_id = ''", [gardenerId]);
      console.log(new Date().toISOString(), 'moved', Number(orphans.n), table, 'rows to gardener', gardenerId);
    }
  }
  for (const table of GARDENER_TABLES) {
    const pk = await primaryKey(conn, table);
    if (pk[0] === 'gardener_id') continue;
    const cols = ['gardener_id', ...pk.filter(c => c !== 'gardener_id')];
    await conn.query('ALTER TABLE `' + table + '` DROP PRIMARY KEY, ADD PRIMARY KEY (' + cols.map(c => '`' + c + '`').join(', ') + ')');
    console.log(new Date().toISOString(), 'primary key of', table, 'is now', cols.join(', '));
  }
}
