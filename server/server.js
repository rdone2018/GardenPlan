// MeaFlora (GardenPlan) server: serves the web app and stores its data in MariaDB.
// Start: node server.js   (configuration: see database.js and .env.example)
// Every gardener's data is kept apart: each data row has gardener_id, and every data route works only with the data
// of the signed-in user's gardener (see auth.js).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import express from 'express';
import { pool, initDatabase } from './database.js';
import * as auth from './auth.js';
import * as formGuard from './form-guard.js';
import * as countries from './countries.js';

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
async function storePhoto(conn, gid, name, obj) {
  if (!PHOTO_KINDS.includes(name)) return obj;
  const id = str(obj.id, 32);
  const m = /^data:(image\/[\w.+-]+);base64,/.exec(typeof obj.photo === 'string' ? obj.photo : '');
  if (m) {
    const img = Buffer.from(obj.photo.slice(m[0].length), 'base64');
    const v = crypto.createHash('sha1').update(img).digest('hex').slice(0, 12);
    await conn.query('INSERT INTO photos (gardener_id, kind, id, mime, img) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE mime=VALUES(mime), img=VALUES(img)', [gid, name, id, m[1], img]);
    return Object.assign({}, obj, { photo: 'api/photo/' + name + '/' + encodeURIComponent(id) + '?v=' + v });
  }
  if (!obj.photo) await conn.query('DELETE FROM photos WHERE gardener_id=? AND kind=? AND id=?', [gid, name, id]);
  return obj;
}

// rewritten (optional) collects [collection, id, photo address] for photos moved to the photos table.
// newer (optional): an item edited later on another device (its edit time mt is later) is not overwritten by an
// older edit; [collection, stored item] goes back to the browser instead.
async function upsert(conn, gid, name, objects, rewritten, newer) {
  const c = COLLECTIONS[name];
  for (let obj of objects) {
    if (!obj || typeof obj.id !== 'string' || !obj.id) continue;
    if (newer && obj.mt) {
      const [row] = await conn.query('SELECT data FROM ' + c.table + ' WHERE gardener_id=? AND id=? FOR UPDATE', [gid, str(obj.id, 32)]);
      const cur = row && JSON.parse(row.data);
      if (cur && (cur.mt || 0) > obj.mt) { newer.push([name, cur]); continue; }
    }
    const stored = await storePhoto(conn, gid, name, obj);
    if (rewritten && stored.photo !== obj.photo) rewritten.push([name, obj.id, stored.photo]);
    obj = stored;
    const cols = c.cols(obj);
    const names = ['gardener_id', 'id', ...Object.keys(cols), 'data'];
    const values = [gid, str(obj.id, 32), ...Object.values(cols), JSON.stringify(obj)];
    await conn.query(
      'INSERT INTO ' + c.table + ' (' + names.join(',') + ') VALUES (' + names.map(() => '?').join(',') + ') ' +
      'ON DUPLICATE KEY UPDATE ' + names.slice(2).map(n => n + '=VALUES(' + n + ')').join(','),
      values);
  }
}

async function saveMeta(conn, gid, meta) {
  for (const k of META_KEYS) {
    if (meta[k] === undefined) continue;
    await conn.query('INSERT INTO meta (gardener_id, k, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)', [gid, k, JSON.stringify(meta[k])]);
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

// ---------- sign-in ----------
// The session cookie is HttpOnly (page scripts cannot read it) and SameSite=Lax (other sites cannot send it along
// with their requests); it is marked Secure when the app is reached over https (directly or through nginx).
const SESSION_COOKIE = 'gardenplan_session';

function sessionToken(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) { try { return decodeURIComponent(value.join('=')); } catch (e) { return ''; } }
  }
  return '';
}

function sessionCookie(req, token, maxAgeSeconds) {
  const secure = req.socket.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  return SESSION_COOKIE + '=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAgeSeconds + (secure ? '; Secure' : '');
}

// The browser's network address, for the sign-in and sign-up limits. Behind a reverse proxy every request comes from
// the proxy, so with GARDENPLAN_TRUST_PROXY=1 the first address in X-Forwarded-For is used instead. Only set it when
// a proxy you control always sets that header, as browsers could otherwise send any address in it.
function clientAddress(req) {
  if (env.GARDENPLAN_TRUST_PROXY === '1') {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || 'unknown';
}

const pause = () => new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 800));
// A refused form token: the page fetches a new one and asks to send again.
const formTokenAnswer = problem => ({ error: problem === 'too-fast' ? 'too-fast' : 'form-expired', formRefresh: true });
const tooMany = (res, wait, code) => { res.set('Retry-After', String(wait)); res.status(429).json({ error: code, wait }); };

// ---------- web ----------
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'no-referrer'); next(); });
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// The countries a gardener can be in, also for the New gardener form before signing in.
app.get('/api/countries', async (req, res, next) => {
  try { res.json({ countries: await countries.listCountries() }); } catch (e) { next(e); }
});

// Who is signed in. Without a session it says whether the app still needs its first user (setupNeeded).
app.get('/api/session', async (req, res, next) => {
  try {
    const session = await auth.readSession(sessionToken(req));
    if (session) return res.json({ signedIn: true, ...session });
    res.json({ signedIn: false, setupNeeded: await auth.userCount() === 0 });
  } catch (e) { next(e); }
});

// A signed form token for the Sign in and New gardener forms (see form-guard.js).
app.get('/api/form-token', (req, res) => res.json({ token: formGuard.formToken(), honeypot: formGuard.HONEYPOT_FIELD }));

async function signedIn(req, res, userId) {
  const token = await auth.startSession(userId);
  res.set('Set-Cookie', sessionCookie(req, token, auth.SESSION_DAYS * 86400));
  res.json({ signedIn: true, ...await auth.readSession(token) });
}

// Sign in: hard limits on failed sign-ins, a honeypot and a timing check. A wrong e-mail and a wrong password get the
// same answer after the same password hashing, so no answer shows which e-mails have an account.
app.post('/api/session', async (req, res, next) => {
  try {
    const address = clientAddress(req), body = req.body || {};
    const email = auth.normalEmail(body.email);
    const wait = formGuard.signInWaitSeconds(address, email);
    if (wait) return tooMany(res, wait, 'sign-in-limit');
    if (formGuard.honeypotFilled(body)) {
      console.log(new Date().toISOString(), 'sign-in refused: honeypot filled in, from', address);
      formGuard.noteFailedSignIn(address, email);
      await pause();
      return res.status(401).json({ error: 'wrong-sign-in', formRefresh: true });
    }
    const problem = formGuard.formTokenProblem(body.formToken, Date.now(), formGuard.SIGN_IN_MIN_SECONDS);
    if (problem) {
      formGuard.noteFailedSignIn(address, email);
      return res.status(400).json(formTokenAnswer(problem));
    }
    formGuard.useFormToken(body.formToken);
    const userId = await auth.checkSignIn(email, body.password);
    if (!userId) {
      formGuard.noteFailedSignIn(address, email);
      return res.status(401).json({ error: 'wrong-sign-in', formRefresh: true });
    }
    formGuard.noteSignedIn(address, email);
    await signedIn(req, res, userId);
  } catch (e) { next(e); }
});

// First start: the first user (the administrator) joins the gardener holding the existing data.
app.post('/api/setup', async (req, res, next) => {
  try {
    await signedIn(req, res, await auth.setUpFirstUser(req.body || {}));
  } catch (e) { next(e); }
});

// New gardener with its first user: hard limits per address and per day, a honeypot and a timing check.
app.post('/api/register', async (req, res, next) => {
  try {
    const address = clientAddress(req), body = req.body || {};
    const wait = formGuard.signupWaitSeconds(address);
    if (wait) return tooMany(res, wait, 'sign-up-limit');
    formGuard.noteSignupAttempt(address);
    // Honeypot filled in: answer as if it worked (after a short pause), but create nothing and start no session.
    if (formGuard.honeypotFilled(body)) {
      console.log(new Date().toISOString(), 'new gardener refused: honeypot filled in, from', address);
      await pause();
      return res.json({ signedIn: true });
    }
    const problem = formGuard.formTokenProblem(body.formToken);
    if (problem) return res.status(400).json(formTokenAnswer(problem));
    formGuard.useFormToken(body.formToken);
    const userId = await auth.createGardenerWithUser(body);
    formGuard.noteGardenerCreated(address);
    console.log(new Date().toISOString(), 'new gardener', str(body.gardenerName, 120), 'created, from', address);
    await signedIn(req, res, userId);
  } catch (e) { next(e); }
});

app.post('/api/session/sign-out', async (req, res, next) => {
  try {
    await auth.endSession(sessionToken(req));
    res.set('Set-Cookie', sessionCookie(req, '', 0));
    res.json({ signedIn: false });
  } catch (e) { next(e); }
});

// Everything below needs a signed-in user and only ever reaches the data of that user's gardener. A guest may only
// read (and set their own password).
async function requireSession(req, res, next) {
  try {
    const session = await auth.readSession(sessionToken(req));
    if (!session) return res.status(401).json({ error: 'signed-out', signedIn: false });
    req.session = session;
    req.gid = session.gardener.id;
    next();
  } catch (e) { next(e); }
}
const notGuest = (req, res, next) => req.session.user.isGuest ? res.status(403).json({ error: 'guest' }) : next();

// The signed-in gardener's profile and its users. Changes use POST, as some proxies block PUT and DELETE.
app.get('/api/gardener', requireSession, async (req, res, next) => {
  try { res.json(await auth.readGardener(req.gid)); } catch (e) { next(e); }
});
app.post('/api/gardener', requireSession, notGuest, async (req, res, next) => {
  try {
    await auth.updateGardener(req.gid, req.body || {});
    res.json(await auth.readGardener(req.gid));
  } catch (e) { next(e); }
});
app.post('/api/gardener/users', requireSession, notGuest, async (req, res, next) => {
  try {
    await auth.addUser(req.gid, req.body || {});
    res.json(await auth.readGardener(req.gid));
  } catch (e) { next(e); }
});
app.post('/api/gardener/users/:id/:action(password|guest|delete)', requireSession, async (req, res, next) => {
  try {
    const { id, action } = req.params, me = req.session.user, body = req.body || {};
    if (me.isGuest && !(action === 'password' && id === me.id)) return res.status(403).json({ error: 'guest' });
    if (action === 'password') await auth.setPassword(req.gid, id, body.password, id === me.id ? sessionToken(req) : '');
    if (action === 'guest') await auth.setGuest(req.gid, id, body.isGuest === true, me.id);
    if (action === 'delete') await auth.removeUser(req.gid, id, me.id);
    res.json(await auth.readGardener(req.gid));
  } catch (e) { next(e); }
});

// Whole data of the signed-in gardener in the shape the browser keeps it.
app.get('/api/state', requireSession, async (req, res, next) => {
  try {
    const state = {};
    for (const [name, c] of Object.entries(COLLECTIONS)) {
      const rows = await pool.query('SELECT data FROM ' + c.table + ' WHERE gardener_id=? ORDER BY updated_at, id', [req.gid]);
      state[name] = rows.map(r => JSON.parse(r.data));
    }
    for (const r of await pool.query('SELECT k, data FROM meta WHERE gardener_id=?', [req.gid])) state[r.k] = JSON.parse(r.data);
    res.json(state);
  } catch (e) { next(e); }
});

// Changes since the last save: { upsert: {plants: [..]}, delete: {plants: [ids]}, seen: {plants: {id: mt}}, meta: {settings, taskDone, version} }
// Answers { ok, photos: [[collection, id, address]], newer: [[collection, item]] } – newer = edited later elsewhere, kept.
app.post('/api/sync', requireSession, notGuest, async (req, res, next) => {
  const t0 = Date.now(), kb = Math.round((Number(req.headers['content-length']) || 0) / 1024), gid = req.gid;
  try {
    const body = req.body || {};
    const counts = Object.keys(COLLECTIONS).map(n => [n, ((body.upsert || {})[n] || []).length, ((body.delete || {})[n] || []).length]).filter(c => c[1] || c[2]);
    const what = counts.map(([n, u, d]) => n + ' ' + u + (d ? '/-' + d : '')).join(', ') || 'meta';
    console.log(new Date().toISOString(), 'sync start', req.session.user.email, kb + ' kB', what);
    const photos = [], newer = [];
    await inTransaction(async conn => {
      for (const name of Object.keys(COLLECTIONS)) {
        const up = body.upsert && body.upsert[name];
        if (Array.isArray(up) && up.length) await upsert(conn, gid, name, up, photos, newer);
        const del = body.delete && body.delete[name];
        if (Array.isArray(del) && del.length) {
          let ids = del.map(id => str(id, 32));
          // seen: edit times of the versions the browser deleted – an item edited later on another device stays
          const seen = body.seen && body.seen[name];
          if (seen) {
            const kept = new Set();
            for (const r of await conn.query('SELECT id, data FROM ' + COLLECTIONS[name].table + ' WHERE gardener_id=? AND id IN (?) FOR UPDATE', [gid, ids])) {
              const cur = JSON.parse(r.data);
              if ((cur.mt || 0) > (seen[r.id] || 0)) { kept.add(r.id); newer.push([name, cur]); }
            }
            ids = ids.filter(id => !kept.has(id));
          }
          if (!ids.length) continue;
          await conn.query('DELETE FROM ' + COLLECTIONS[name].table + ' WHERE gardener_id=? AND id IN (?)', [gid, ids]);
          if (PHOTO_KINDS.includes(name)) await conn.query('DELETE FROM photos WHERE gardener_id=? AND kind=? AND id IN (?)', [gid, name, ids]);
        }
      }
      if (body.meta) await saveMeta(conn, gid, body.meta);
    });
    console.log(new Date().toISOString(), 'sync done', what, (Date.now() - t0) + ' ms' + (newer.length ? ', kept ' + newer.length + ' newer' : ''));
    res.json({ ok: true, photos, newer });
  } catch (e) { next(e); }
});

// Replace all data of the signed-in gardener (restore from backup, delete all data).
app.post('/api/replace', requireSession, notGuest, async (req, res, next) => {
  try {
    const body = req.body || {}, gid = req.gid;
    await inTransaction(async conn => {
      for (const [name, c] of Object.entries(COLLECTIONS)) {
        await conn.query('DELETE FROM ' + c.table + ' WHERE gardener_id=?', [gid]);
        if (Array.isArray(body[name])) await upsert(conn, gid, name, body[name]);
      }
      await conn.query('DELETE FROM photos WHERE gardener_id=?', [gid]);
      await conn.query('DELETE FROM meta WHERE gardener_id=?', [gid]);
      await saveMeta(conn, gid, body);
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// The address changes with the photo (?v=hash), so the browser may keep it for good (but not shared caches: only
// the gardener's users may see it).
app.get('/api/photo/:kind/:id', requireSession, async (req, res, next) => {
  try {
    const [row] = await pool.query('SELECT mime, img FROM photos WHERE gardener_id=? AND kind=? AND id=?', [req.gid, req.params.kind, req.params.id]);
    if (!row) return res.status(404).json({ error: 'not-found' });
    res.set('Cache-Control', 'private, max-age=31536000, immutable').type(row.mime).send(row.img);
  } catch (e) { next(e); }
});

// Data saved before the photos table existed keeps photos inside the JSON: move them out once.
async function movePhotos() {
  for (const name of PHOTO_KINDS) {
    const table = COLLECTIONS[name].table;
    const rows = await pool.query('SELECT gardener_id, id FROM ' + table + ' WHERE data LIKE ?', ['%"photo":"data:%']);
    for (const { gardener_id: gid, id } of rows) {
      await inTransaction(async conn => {
        const [row] = await conn.query('SELECT data FROM ' + table + ' WHERE gardener_id=? AND id=?', [gid, id]);
        if (row) await upsert(conn, gid, name, [JSON.parse(row.data)]);
      });
    }
    if (rows.length) console.log(new Date().toISOString(), 'moved', rows.length, name, 'photos to the photos table');
  }
}

// Only the app's own files are public (not this server folder with .env).
app.get('/', (req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(APP_DIR, 'index.html')));
for (const dir of ['css', 'js', 'sample']) app.use('/' + dir, express.static(path.join(APP_DIR, dir)));

app.use('/api', (req, res) => res.status(404).json({ error: 'not-found' }));
// Expected problems (a taken e-mail, a too short password…) answer with their code; the page shows its text.
app.use((err, req, res, next) => {
  if (err.appCode) return res.status(err.statusCode || 400).json({ error: err.appCode });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad-request' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too-large' });
  console.error(new Date().toISOString(), req.method, req.path, err.message);
  res.status(500).json({ error: err.message });
});

initDatabase()
  .then(() => countries.seedCountries().catch(e => console.error(new Date().toISOString(), 'filling the countries failed:', e.message)))
  .then(() => auth.ensureAdmin())
  .then(() => movePhotos().catch(e => console.error(new Date().toISOString(), 'moving photos failed:', e.message)))
  .then(() => app.listen(PORT, () => console.log('MeaFlora: http://localhost:' + PORT + '  (database ' + (env.DB_NAME || 'gardenplan') + ' @ ' + (env.DB_HOST || 'localhost') + ')')))
  .catch(e => {
    console.error('Cannot connect to MariaDB / create tables:', e.message);
    console.error('Check DB_HOST, DB_USER, DB_PASSWORD and DB_NAME in /etc/gardenplan/gardenplan.env (or server/.env)');
    process.exit(1);
  });
