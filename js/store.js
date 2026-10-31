// Persistence. When the app is served by server/server.js the data lives in MariaDB (changes are sent
// as small diffs); otherwise it is kept in the browser's IndexedDB. IndexedDB also serves as a local cache.
window.GP = window.GP || {};
(function (GP) {
  const DB_NAME = 'gardenplan', STORE = 'state', KEY = 'main';
  const COLLECTIONS = ['gardens', 'plants', 'placements', 'equipment', 'tasks'];
  let db = null, saveTimer = null, retryTimer = null;
  let snap = null;            // last state confirmed by the server (server mode)
  let syncing = null, again = false;
  GP.views = {};
  GP.storageMode = 'local';   // 'local' | 'server'

  function emptyState() {
    return {
      version: 1,
      settings: { lang: 'cs' },
      gardens: [],     // garden specification, grid, zones, cells
      plants: [],      // shared plant catalog (species / cultivars)
      placements: [],  // a plant planted in a garden (optionally on grid cells)
      equipment: [],   // garden technology with seasonal tasks
      tasks: [],       // custom recurring tasks
      taskDone: {}     // "taskKey|year|month" -> true
    };
  }

  function status(text, warn) {
    const el = document.getElementById('saved');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('warn', !!warn);
  }
  const now = () => new Date().toLocaleTimeString(GP.L('cs-CZ', 'en-GB'), { hour: '2-digit', minute: '2-digit' });

  // ---------- browser storage ----------
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function readLocal() {
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function writeLocal() {
    if (!db) return;
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(GP.state, KEY);
      if (GP.storageMode === 'local') tx.oncomplete = () => status('✓ ' + GP.L('Uloženo', 'Saved') + ' ' + now());
      tx.onerror = () => console.error('Save failed', tx.error);
    } catch (e) {
      console.error('Save failed', e);
    }
  }

  // ---------- server storage ----------
  const metaOf = s => JSON.stringify({ settings: s.settings, taskDone: s.taskDone, version: s.version });
  function snapshot(s) {
    const o = { meta: metaOf(s) };
    for (const c of COLLECTIONS) o[c] = new Map((s[c] || []).map(x => [x.id, JSON.stringify(x)]));
    return o;
  }

  async function syncServer() {
    if (syncing) { again = true; return syncing; }
    const next = snapshot(GP.state);
    const body = { upsert: {}, delete: {} };
    let changed = false;
    for (const c of COLLECTIONS) {
      for (const [id, json] of next[c]) if (snap[c].get(id) !== json) { (body.upsert[c] = body.upsert[c] || []).push(JSON.parse(json)); changed = true; }
      for (const id of snap[c].keys()) if (!next[c].has(id)) { (body.delete[c] = body.delete[c] || []).push(id); changed = true; }
    }
    if (next.meta !== snap.meta) { body.meta = JSON.parse(next.meta); changed = true; }
    if (!changed) return;
    status(GP.L('Ukládám…', 'Saving…'));
    syncing = fetch('api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: JSON.stringify(body).length < 60000 })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); })
      .then(() => {
        snap = next;
        clearTimeout(retryTimer);
        status('✓ ' + GP.L('Uloženo na server', 'Saved to server') + ' ' + now());
      })
      .catch(e => {
        console.error('Server save failed', e);
        status('⚠ ' + GP.L('Server nedostupný – změny čekají', 'Server unreachable – changes pending'), true);
        clearTimeout(retryTimer);
        retryTimer = setTimeout(syncServer, 10000);
      })
      .finally(() => {
        syncing = null;
        if (again) { again = false; syncServer(); }
      });
    return syncing;
  }

  // ---------- public API ----------
  GP.load = async function () {
    try { db = await openDb(); } catch (e) { console.error('IndexedDB unavailable', e); }
    try {
      const r = await fetch('api/state', { cache: 'no-store' });
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
        GP.state = Object.assign(emptyState(), await r.json());
        GP.storageMode = 'server';
        snap = snapshot(GP.state);
        writeLocal();
        status('✓ ' + GP.L('Připojeno k databázi', 'Connected to database'));
        return;
      }
    } catch (e) { /* no server (file:// or a plain static server) -> browser storage */ }

    try {
      const saved = db ? await readLocal() : null;
      GP.state = Object.assign(emptyState(), saved || {});
      if (!db) GP.storageError = true;
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) {
      console.error('Storage unavailable', e);
      GP.state = emptyState();
      GP.storageError = true;
    }
  };

  function write() {
    writeLocal();
    if (GP.storageMode === 'server') syncServer();
  }

  GP.save = function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(write, 400);
  };

  GP.saveNow = function () {
    clearTimeout(saveTimer);
    write();
  };

  GP.replaceState = async function (data) {
    GP.state = Object.assign(emptyState(), data);
    writeLocal();
    if (GP.storageMode !== 'server') return;
    const r = await fetch('api/replace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(GP.state) });
    if (!r.ok) throw new Error(GP.L('Server data neuložil', 'The server did not save the data') + ' (HTTP ' + r.status + ')');
    snap = snapshot(GP.state);
    status('✓ ' + GP.L('Uloženo na server', 'Saved to server') + ' ' + now());
  };

  GP.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  GP.byId = (list, id) => GP.state[list].find(x => x.id === id);

  // Pick the Czech or English text for the current UI language.
  GP.L = (cs, en) => (GP.state && GP.state.settings.lang === 'en' ? en : cs);
})(window.GP);
