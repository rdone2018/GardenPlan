// GardenPlan server: serves the web app and stores its data in MariaDB.
// Start: node server.js   (configuration: see database.js and .env.example)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { pool, initDatabase } from './database.js';

const env = process.env; // filled from the env file by database.js
const PORT = Number(env.PORT) || 8080;
const APP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- tables ----------
// Collection in the app -> table and the columns copied out of the JSON object.
const str = (v, n) => String(v == null ? '' : v).slice(0, n || 255);
const COLLECTIONS = {
  gardens: { table: 'gardens', cols: g => ({ name: str(g.name), owner: str(g.owner) }) },
  plants: { table: 'plants', cols: p => ({ name_cs: str(p.name_cs), name_sk: str(p.name_sk), name_en: str(p.name_en), name_la: str(p.name_la), type: str(p.type, 32) }) },
  placements: { table: 'placements', cols: p => ({ garden_id: p.gardenId || null, plant_id: p.plantId || null, status: str(p.status, 16) }) },
  equipment: { table: 'equipment', cols: e => ({ garden_id: e.gardenId || null, name: str(e.name), kind: str(e.kind, 32) }) },
  tasks: { table: 'tasks', cols: t => ({ garden_id: t.gardenId || null, title: str(t.title) }) }
};
const META_KEYS = ['settings', 'taskDone', 'version'];

async function upsert(conn, name, objects) {
  const c = COLLECTIONS[name];
  for (const obj of objects) {
    if (!obj || typeof obj.id !== 'string' || !obj.id) continue;
    const cols = c.cols(obj);
    const names = ['id', ...Object.keys(cols), 'data'];
    const values = [str(obj.id, 32), ...Object.values(cols), JSON.stringify(obj)];
    await conn.query(
      'INSERT INTO ' + c.table + ' (' + names.join(',') + ') VALUES (' + names.map(() => '?').join(',') + ') ' +
      'ON DUPLICATE KEY UPDATE ' + names.slice(1).map(n => n + '=VALUES(' + n + ')').join(','),
      values);
  }
}

async function saveMeta(conn, meta) {
  for (const k of META_KEYS) {
    if (meta[k] === undefined) continue;
    await conn.query('INSERT INTO meta (k, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)', [k, JSON.stringify(meta[k])]);
  }
}

async function inTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

// ---------- web ----------
const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', async (req, res, next) => {
  try {
    const [row] = await pool.query('SELECT DATABASE() AS db, VERSION() AS version');
    res.json({ ok: true, db: row.db, version: row.version });
  } catch (e) { next(e); }
});

// Whole app state in the shape the browser keeps it.
app.get('/api/state', async (req, res, next) => {
  try {
    const state = {};
    for (const [name, c] of Object.entries(COLLECTIONS)) {
      const rows = await pool.query('SELECT data FROM ' + c.table + ' ORDER BY updated_at, id');
      state[name] = rows.map(r => JSON.parse(r.data));
    }
    for (const r of await pool.query('SELECT k, data FROM meta')) state[r.k] = JSON.parse(r.data);
    res.set('Cache-Control', 'no-store').json(state);
  } catch (e) { next(e); }
});

// Changes since the last save: { upsert: {plants: [..]}, delete: {plants: [ids]}, meta: {settings, taskDone, version} }
app.post('/api/sync', async (req, res, next) => {
  const t0 = Date.now(), kb = Math.round((Number(req.headers['content-length']) || 0) / 1024);
  try {
    const body = req.body || {};
    const counts = Object.keys(COLLECTIONS).map(n => [n, ((body.upsert || {})[n] || []).length, ((body.delete || {})[n] || []).length]).filter(c => c[1] || c[2]);
    const what = counts.map(([n, u, d]) => n + ' ' + u + (d ? '/-' + d : '')).join(', ') || 'meta';
    console.log(new Date().toISOString(), 'sync start', kb + ' kB', what);
    await inTransaction(async conn => {
      for (const name of Object.keys(COLLECTIONS)) {
        const up = body.upsert && body.upsert[name];
        if (Array.isArray(up) && up.length) await upsert(conn, name, up);
        const del = body.delete && body.delete[name];
        if (Array.isArray(del) && del.length) await conn.query('DELETE FROM ' + COLLECTIONS[name].table + ' WHERE id IN (?)', [del.map(id => str(id, 32))]);
      }
      if (body.meta) await saveMeta(conn, body.meta);
    });
    console.log(new Date().toISOString(), 'sync done', what, (Date.now() - t0) + ' ms');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Replace everything (restore from backup, delete all data).
app.post('/api/replace', async (req, res, next) => {
  try {
    const body = req.body || {};
    await inTransaction(async conn => {
      for (const [name, c] of Object.entries(COLLECTIONS)) {
        await conn.query('DELETE FROM ' + c.table);
        if (Array.isArray(body[name])) await upsert(conn, name, body[name]);
      }
      await conn.query('DELETE FROM meta');
      await saveMeta(conn, body);
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Only the app's own files are public (not this server folder with .env).
app.get('/', (req, res) => res.sendFile(path.join(APP_DIR, 'index.html')));
for (const dir of ['css', 'js', 'sample']) app.use('/' + dir, express.static(path.join(APP_DIR, dir)));

app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));
app.use((err, req, res, next) => {
  console.error(new Date().toISOString(), err.message);
  res.status(500).json({ error: err.message });
});

initDatabase()
  .then(() => app.listen(PORT, () => console.log('GardenPlan: http://localhost:' + PORT + '  (database ' + (env.DB_NAME || 'gardenplan') + ' @ ' + (env.DB_HOST || 'localhost') + ')')))
  .catch(e => {
    console.error('Cannot connect to MariaDB / create tables:', e.message);
    console.error('Check DB_HOST, DB_USER, DB_PASSWORD and DB_NAME in /etc/gardenplan/gardenplan.env (or server/.env)');
    process.exit(1);
  });
