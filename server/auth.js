// Gardeners, their users and sign-in sessions (modelled on DoggyFeed, github.com/rdone2018/DoggyFeed, MIT).
// A gardener owns gardens, plants, equipment and tasks; several users (each signing in with their e-mail) can work
// with one gardener's data, a guest only looks at it. Passwords are stored only as scrypt hashes with a random
// salt. A session is a random token in an HttpOnly cookie; the database keeps only the token's SHA-256 hash.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { pool, firstGardenerId } from './database.js';
import { checkedCountry } from './countries.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1 };
export const SESSION_DAYS = 30;

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const tokenHash = token => crypto.createHash('sha256').update(String(token)).digest('hex');
// Errors carry a short code; the page shows the text in its language (js/auth.js).
const httpError = (statusCode, code) => Object.assign(new Error(code), { statusCode, appCode: code });

export const normalEmail = value => String(value ?? '').trim().toLowerCase();
const emailOk = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;
const passwordOk = password => { const n = String(password ?? '').length; return n >= 8 && n <= 200; };

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password), salt, 64, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function passwordMatches(password, stored) {
  const [kind, N, r, p, salt, key] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(String(password), Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// Checked when an e-mail is unknown, so a wrong e-mail takes as long as a wrong password.
const unknownUserHash = hashPassword(crypto.randomUUID());

async function inTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

async function insertUser(conn, gardenerId, { email, password, name, isAdmin = false, isGuest = false }) {
  const mail = normalEmail(email);
  if (!emailOk(mail)) throw httpError(400, 'email');
  if (!passwordOk(password)) throw httpError(400, 'password');
  if (isAdmin && isGuest) throw httpError(400, 'admin-guest');
  const id = 'u-' + crypto.randomUUID();
  try {
    await conn.query(
      'INSERT INTO users (id, gardener_id, email, name, password_hash, is_admin, is_guest, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, gardenerId, mail, clean(name, 120), await hashPassword(password), isAdmin ? 1 : 0, isGuest ? 1 : 0, new Date()]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw httpError(409, 'email-taken');
    throw e;
  }
  return id;
}

// The gardener profile from a form. The country is changed only when it is sent.
async function gardenerFields(conn, fields) {
  const g = { name: clean(fields.name, 120), contact: clean(fields.contact, 200), email: normalEmail(fields.email).slice(0, 200) };
  if (!g.name) throw httpError(400, 'name');
  if (g.email && !emailOk(g.email)) throw httpError(400, 'email');
  if ('country' in fields) g.country = await checkedCountry(conn, fields.country);
  return g;
}

async function updateGardenerRow(conn, gardenerId, g) {
  const sets = ['name = ?', 'contact = ?', 'email = ?'], values = [g.name, g.contact, g.email];
  if (g.country !== undefined) { sets.push('country = ?'); values.push(g.country); }
  await conn.query('UPDATE gardeners SET ' + sets.join(', ') + ' WHERE id = ?', [...values, gardenerId]);
}

export async function userCount() {
  const [row] = await pool.query('SELECT COUNT(*) AS n FROM users');
  return Number(row.n) || 0;
}

// First start: while there are no users, the first one joins the oldest gardener (holding the data from before
// gardeners) and names it. The first user is the administrator.
export async function setUpFirstUser(body) {
  return inTransaction(async conn => {
    const [row] = await conn.query('SELECT COUNT(*) AS n FROM users FOR UPDATE');
    if (Number(row.n) > 0) throw httpError(409, 'set-up');
    const gardenerId = await firstGardenerId(conn);
    await updateGardenerRow(conn, gardenerId, await gardenerFields(conn, { name: body.gardenerName, contact: body.contact, email: body.email, country: body.country }));
    return insertUser(conn, gardenerId, { email: body.email, password: body.password, name: body.name, isAdmin: true });
  });
}

// A new gardener with its first user. A taken e-mail gets the same general answer as other details that cannot be
// used and costs the same password hashing, so the form cannot be used to find out which e-mails have an account.
export async function createGardenerWithUser(body) {
  try {
    return await inTransaction(async conn => {
      const g = await gardenerFields(conn, { name: body.gardenerName, contact: body.contact, email: body.email, country: body.country });
      const id = 'g-' + crypto.randomUUID();
      await conn.query('INSERT INTO gardeners (id, name, contact, email, country, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, g.name, g.contact, g.email, g.country || '', new Date()]);
      return insertUser(conn, id, { email: body.email, password: body.password, name: body.name });
    });
  } catch (e) {
    if (e.appCode === 'email-taken') throw httpError(400, 'signup-refused');
    throw e;
  }
}

// The user's id when the e-mail and password match, otherwise null.
export async function checkSignIn(email, password) {
  const [user] = await pool.query('SELECT id, password_hash FROM users WHERE email = ?', [normalEmail(email)]);
  if (!user) {
    await passwordMatches(password, await unknownUserHash);
    return null;
  }
  return await passwordMatches(password, user.password_hash) ? user.id : null;
}

export async function startSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query('DELETE FROM sessions WHERE expires_at < ?', [new Date()]);
  await pool.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    [tokenHash(token), userId, new Date(Date.now() + SESSION_DAYS * 86400000)]);
  return token;
}

// The signed-in user and their gardener for a session token, or null. A session in use is extended, so it only ends
// after SESSION_DAYS without use.
export async function readSession(token) {
  if (!token) return null;
  const [row] = await pool.query(
    `SELECT s.token_hash, s.expires_at, u.id AS user_id, u.email AS user_email, u.name AS user_name, u.is_admin, u.is_guest,
            g.id AS gardener_id, g.name, g.contact, g.email, g.country
     FROM sessions s JOIN users u ON u.id = s.user_id JOIN gardeners g ON g.id = u.gardener_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    [tokenHash(token), new Date()]);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() - Date.now() < (SESSION_DAYS - 1) * 86400000) {
    await pool.query('UPDATE sessions SET expires_at = ? WHERE token_hash = ?', [new Date(Date.now() + SESSION_DAYS * 86400000), row.token_hash]);
  }
  return {
    user: { id: row.user_id, email: row.user_email, name: row.user_name || '', isAdmin: !!row.is_admin, isGuest: !!row.is_guest },
    gardener: { id: row.gardener_id, name: row.name, contact: row.contact || '', email: row.email || '', country: row.country || '' }
  };
}

export async function endSession(token) {
  if (token) await pool.query('DELETE FROM sessions WHERE token_hash = ?', [tokenHash(token)]);
}

// ---------- the signed-in gardener's profile and users ----------

// The profile with its users (never their password hashes).
export async function readGardener(gardenerId) {
  const [g] = await pool.query('SELECT id, name, contact, email, country, created_at FROM gardeners WHERE id = ?', [gardenerId]);
  if (!g) throw httpError(404, 'not-found');
  const users = await pool.query('SELECT id, email, name, is_admin, is_guest, created_at FROM users WHERE gardener_id = ? ORDER BY email', [gardenerId]);
  return {
    id: g.id, name: g.name, contact: g.contact, email: g.email, country: g.country, createdAt: new Date(g.created_at).toISOString(),
    users: users.map(u => ({ id: u.id, email: u.email, name: u.name, isAdmin: !!u.is_admin, isGuest: !!u.is_guest, createdAt: new Date(u.created_at).toISOString() }))
  };
}

export async function updateGardener(gardenerId, fields) {
  return inTransaction(async conn => updateGardenerRow(conn, gardenerId, await gardenerFields(conn, fields)));
}

export async function addUser(gardenerId, body) {
  return inTransaction(conn => insertUser(conn, gardenerId, { email: body.email, password: body.password, name: body.name, isGuest: body.isGuest === true }));
}

async function otherEditors(conn, gardenerId, userId) {
  const [row] = await conn.query('SELECT COUNT(*) AS n FROM users WHERE gardener_id = ? AND is_guest = 0 AND id <> ?', [gardenerId, userId]);
  return Number(row.n);
}

// A guest only looks at the gardener's data. An administrator cannot be a guest, nobody changes their own role, and
// a gardener always keeps a user who is not a guest.
export async function setGuest(gardenerId, userId, isGuest, currentUserId) {
  if (userId === currentUserId) throw httpError(400, 'own-role');
  return inTransaction(async conn => {
    const [u] = await conn.query('SELECT id, is_admin FROM users WHERE id = ? AND gardener_id = ? FOR UPDATE', [userId, gardenerId]);
    if (!u) throw httpError(404, 'not-found');
    if (isGuest && u.is_admin) throw httpError(400, 'admin-guest');
    if (isGuest && !await otherEditors(conn, gardenerId, userId)) throw httpError(400, 'last-editor');
    await conn.query('UPDATE users SET is_guest = ? WHERE id = ?', [isGuest ? 1 : 0, userId]);
  });
}

// A new password signs that user out everywhere else (keepToken: the session that set it stays).
export async function setPassword(gardenerId, userId, password, keepToken) {
  if (!passwordOk(password)) throw httpError(400, 'password');
  const hash = await hashPassword(password);
  return inTransaction(async conn => {
    const r = await conn.query('UPDATE users SET password_hash = ? WHERE id = ? AND gardener_id = ?', [hash, userId, gardenerId]);
    if (!r.affectedRows) throw httpError(404, 'not-found');
    await conn.query('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', [userId, keepToken ? tokenHash(keepToken) : '']);
  });
}

// Users cannot remove themselves; a gardener keeps a user who can make changes, and the app keeps an administrator.
export async function removeUser(gardenerId, userId, currentUserId) {
  if (userId === currentUserId) throw httpError(400, 'remove-self');
  return inTransaction(async conn => {
    const users = await conn.query('SELECT id FROM users WHERE gardener_id = ? FOR UPDATE', [gardenerId]);
    if (!users.some(u => u.id === userId)) throw httpError(404, 'not-found');
    if (!await otherEditors(conn, gardenerId, userId)) throw httpError(400, 'last-editor');
    const admins = await conn.query('SELECT id FROM users WHERE is_admin = 1 FOR UPDATE');
    if (admins.length === 1 && admins[0].id === userId) throw httpError(400, 'last-admin');
    await conn.query('DELETE FROM sessions WHERE user_id = ?', [userId]);
    await conn.query('DELETE FROM users WHERE id = ? AND gardener_id = ?', [userId, gardenerId]);
  });
}

// An existing install without an administrator (users added another way): the oldest user becomes one.
export async function ensureAdmin() {
  const [row] = await pool.query('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1');
  if (Number(row.n) > 0) return;
  const [oldest] = await pool.query('SELECT id FROM users ORDER BY created_at, id LIMIT 1');
  if (oldest) await pool.query('UPDATE users SET is_admin = 1, is_guest = 0 WHERE id = ?', [oldest.id]);
}
