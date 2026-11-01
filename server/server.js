// GardenPlan server: serves the web app and stores its data in MariaDB.
// Start: node server.js   (configuration: see database.js and .env.example)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
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
const PHOTO_KINDS = ['plants', 'gardens'];

// Photos arrive as data URLs (hundreds of kB each). They go to the photos table and the object keeps only
// their address, so /api/state stays small and the browser caches every photo.
async function storePhoto(conn, name, obj) {
  if (!PHOTO_KINDS.includes(name)) return obj;
  const id = str(obj.id, 32);
  const m = /^data:(image\/[\w.+-]+);base64,/.exec(typeof obj.photo === 'string' ? obj.photo : '');
  if (m) {
    const img = Buffer.from(obj.photo.slice(m[0].length), 'base64');
    const v = crypto.createHash('sha1').update(img).digest('hex').slice(0, 12);
    await conn.query('INSERT INTO photos (kind, id, mime, img) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE mime=VALUES(mime), img=VALUES(img)', [name, id, m[1], img]);
    return Object.assign({}, obj, { photo: 'api/photo/' + name + '/' + encodeURIComponent(id) + '?v=' + v });
  }
  if (!obj.photo) await conn.query('DELETE FROM photos WHERE kind=? AND id=?', [name, id]);
  return obj;
}

// rewritten (optional) collects [collection, id, photo address] for photos moved to the photos table
async function upsert(conn, name, objects, rewritten) {
  const c = COLLECTIONS[name];
  for (let obj of objects) {
    if (!obj || typeof obj.id !== 'string' || !obj.id) continue;
    const stored = await storePhoto(conn, name, obj);
    if (rewritten && stored.photo !== obj.photo) rewritten.push([name, obj.id, stored.photo]);
    obj = stored;
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
    const photos = [];
    await inTransaction(async conn => {
      for (const name of Object.keys(COLLECTIONS)) {
        const up = body.upsert && body.upsert[name];
        if (Array.isArray(up) && up.length) await upsert(conn, name, up, photos);
        const del = body.delete && body.delete[name];
        if (Array.isArray(del) && del.length) {
          const ids = del.map(id => str(id, 32));
          await conn.query('DELETE FROM ' + COLLECTIONS[name].table + ' WHERE id IN (?)', [ids]);
          if (PHOTO_KINDS.includes(name)) await conn.query('DELETE FROM photos WHERE kind=? AND id IN (?)', [name, ids]);
        }
      }
      if (body.meta) await saveMeta(conn, body.meta);
    });
    console.log(new Date().toISOString(), 'sync done', what, (Date.now() - t0) + ' ms');
    res.json({ ok: true, photos });
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

// The address changes with the photo (?v=hash), so the browser may keep it for good.
app.get('/api/photo/:kind/:id', async (req, res, next) => {
  try {
    const [row] = await pool.query('SELECT mime, img FROM photos WHERE kind=? AND id=?', [req.params.kind, req.params.id]);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.set('Cache-Control', 'public, max-age=31536000, immutable').type(row.mime).send(row.img);
  } catch (e) { next(e); }
});

// Data saved before the photos table existed keeps photos inside the JSON: move them out once.
async function movePhotos() {
  for (const name of PHOTO_KINDS) {
    const table = COLLECTIONS[name].table;
    const rows = await pool.query('SELECT id FROM ' + table + ' WHERE data LIKE ?', ['%"photo":"data:%']);
    for (const { id } of rows) {
      await inTransaction(async conn => {
        const [row] = await conn.query('SELECT data FROM ' + table + ' WHERE id=?', [id]);
        if (row) await upsert(conn, name, [JSON.parse(row.data)]);
      });
    }
    if (rows.length) console.log(new Date().toISOString(), 'moved', rows.length, name, 'photos to the photos table');
  }
}

// Only the app's own files are public (not this server folder with .env).
app.get('/', (req, res) => res.sendFile(path.join(APP_DIR, 'index.html')));
for (const dir of ['css', 'js', 'sample']) app.use('/' + dir, express.static(path.join(APP_DIR, dir)));

app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));
app.use((err, req, res, next) => {
  console.error(new Date().toISOString(), err.message);
  res.status(500).json({ error: err.message });
});

initDatabase()
  .then(() => movePhotos().catch(e => console.error(new Date().toISOString(), 'moving photos failed:', e.message)))
  .then(() => app.listen(PORT, () => console.log('GardenPlan: http://localhost:' + PORT + '  (database ' + (env.DB_NAME || 'gardenplan') + ' @ ' + (env.DB_HOST || 'localhost') + ')')))
  .catch(e => {
    console.error('Cannot connect to MariaDB / create tables:', e.message);
    console.error('Check DB_HOST, DB_USER, DB_PASSWORD and DB_NAME in /etc/gardenplan/gardenplan.env (or server/.env)');
    process.exit(1);
  });
