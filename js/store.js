// Persistence. When the app is served by server/server.js the data lives in MariaDB (changes are sent
// as small diffs); otherwise it is kept in the browser's IndexedDB. IndexedDB also serves as a local cache:
// changes not yet confirmed by the server stay there and are sent again after a reload or a server restart.
window.GP = window.GP || {};
(function (GP) {
  const DB_NAME = 'gardenplan', STORE = 'state', KEY = 'main', SYNC_KEY = 'sync';
  const COLLECTIONS = ['gardens', 'plants', 'placements', 'equipment', 'tasks'];
  const BATCH = 400000;       // max. characters of plant/garden data in one save request (proxies often allow 1 MB)
  let db = null, saveTimer = null, retryTimer = null;
  let snap = null;            // last state confirmed by the server (server mode)
  let syncing = null, again = false;
  let syncInfo = { mode: 'local', dirty: false }; // dirty = local changes the server has not confirmed yet
  GP.views = {};
  GP.storageMode = 'local';   // 'local' | 'server'
  GP.offline = false;         // server mode, but the server cannot be reached right now

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
    el.title = text;
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
  function readKey(key) {
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function writeLocal() {
    if (!db) return;
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(GP.state, KEY);
      tx.objectStore(STORE).put(syncInfo, SYNC_KEY);
      if (GP.storageMode === 'local') tx.oncomplete = () => status('✓ ' + GP.L('Uloženo', 'Saved') + ' ' + now());
      tx.onerror = () => console.error('Save failed', tx.error);
    } catch (e) {
      console.error('Save failed', e);
    }
  }
  function writeSyncInfo() {
    if (!db) return;
    try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(syncInfo, SYNC_KEY); } catch (e) { console.error(e); }
  }

  // ---------- server storage ----------
  const metaOf = s => JSON.stringify({ settings: s.settings, taskDone: s.taskDone, version: s.version });
  function snapshot(s) {
    const o = { meta: metaOf(s) };
    for (const c of COLLECTIONS) o[c] = new Map((s[c] || []).map(x => [x.id, JSON.stringify(x)]));
    return o;
  }

  // Server data + local changes the server never got (local wins per item; nothing is deleted).
  function mergeLocal(server, local) {
    const out = Object.assign(emptyState(), server);
    for (const c of COLLECTIONS) {
      const m = new Map((server[c] || []).map(x => [x.id, x]));
      for (const x of local[c] || []) if (x && x.id) m.set(x.id, x);
      out[c] = [...m.values()];
    }
    out.settings = local.settings || out.settings;
    out.taskDone = Object.assign({}, server.taskDone, local.taskDone);
    return out;
  }

  // -> { state } | { reachable, error }; reachable = our server answered (even with an error)
  async function fetchState() {
    try {
      const r = await fetch('api/state', { cache: 'no-store' });
      const json = (r.headers.get('content-type') || '').includes('json');
      if (r.ok && json) return { state: await r.json() };
      if (json) { let e = ''; try { e = (await r.json()).error || ''; } catch (x) { /* ignore */ } return { reachable: true, error: 'HTTP ' + r.status + (e ? ' – ' + e : '') }; }
      return { reachable: false, error: 'HTTP ' + r.status };
    } catch (e) {
      return { reachable: false, error: e.message };
    }
  }

  // Sends everything that differs from the last confirmed state, in batches; retries every 10 s on failure.
  function syncServer() {
    if (GP.storageMode !== 'server' || GP.offline || !snap) return;
    if (syncing) { again = true; return syncing; }
    syncing = (async () => {
      try {
        for (;;) {
          const next = snapshot(GP.state);
          const body = { upsert: {}, delete: {} }, sent = [];
          let size = 0, any = false;
          for (const c of COLLECTIONS) {
            for (const id of snap[c].keys()) if (!next[c].has(id)) { (body.delete[c] = body.delete[c] || []).push(id); sent.push([c, id, null]); any = true; }
          }
          if (next.meta !== snap.meta) { body.meta = JSON.parse(next.meta); any = true; }
          fill: for (const c of COLLECTIONS) {
            for (const [id, json] of next[c]) {
              if (snap[c].get(id) === json) continue;
              if (size && size + json.length > BATCH) break fill; // the rest goes in the next request
              (body.upsert[c] = body.upsert[c] || []).push(JSON.parse(json));
              sent.push([c, id, json]); size += json.length; any = true;
            }
          }
          if (!any) break;
          status(GP.L('Ukládám…', 'Saving…'));
          const text = JSON.stringify(body);
          const r = await fetch('api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text, keepalive: text.length < 60000 });
          if (!r.ok) {
            let e = '';
            try { e = (await r.json()).error || ''; } catch (x) { /* proxy error page */ }
            throw new Error('HTTP ' + r.status + (r.status === 413 ? ' – ' + GP.L('příliš velký požadavek', 'request too large') : '') + (e ? ' – ' + e : ''));
          }
          for (const [c, id, json] of sent) { if (json === null) snap[c].delete(id); else snap[c].set(id, json); }
          if (body.meta) snap.meta = next.meta;
        }
        clearTimeout(retryTimer);
        syncInfo.dirty = false;
        writeSyncInfo();
        status('✓ ' + GP.L('Uloženo na server', 'Saved to server') + ' ' + now());
      } catch (e) {
        console.error('Server save failed', e);
        status('⚠ ' + GP.L('Neuloženo na server', 'Not saved to server') + ' (' + e.message + ') – ' + GP.L('zkusím znovu, změny jsou v prohlížeči', 'retrying, changes are kept in the browser'), true);
        clearTimeout(retryTimer);
        retryTimer = setTimeout(syncServer, 10000);
      } finally {
        syncing = null;
        if (again) { again = false; syncServer(); }
      }
    })();
    return syncing;
  }

  // Server data arrived (first load or after an outage): take it, plus local changes it does not have yet.
  function useServerState(serverState, local) {
    GP.storageMode = 'server';
    GP.offline = false;
    snap = snapshot(Object.assign(emptyState(), serverState));
    GP.state = syncInfo.dirty && local ? mergeLocal(serverState, local) : Object.assign(emptyState(), serverState);
    const pending = syncInfo.dirty && local;
    syncInfo.mode = 'server';
    writeLocal();
    if (pending) { status(GP.L('Odesílám neuložené změny…', 'Sending unsaved changes…')); setTimeout(syncServer, 300); }
    else status('✓ ' + GP.L('Připojeno k databázi', 'Connected to database'));
  }

  // Server mode but the server is down: show the cached copy, keep changes locally, reconnect in the background.
  function reconnect() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(async () => {
      const r = await fetchState();
      if (!r.state) return reconnect();
      useServerState(r.state, GP.state);
      if (GP.render) GP.render();
    }, 10000);
  }

  // ---------- public API ----------
  GP.load = async function () {
    try { db = await openDb(); } catch (e) { console.error('IndexedDB unavailable', e); }
    let local = null;
    try {
      if (db) { local = await readKey(KEY); syncInfo = Object.assign(syncInfo, await readKey(SYNC_KEY)); }
    } catch (e) { console.error('Storage unavailable', e); }

    const r = await fetchState();
    if (r.state) return useServerState(r.state, local);

    if (r.reachable || syncInfo.mode === 'server') {
      // never fall back to the (possibly empty) browser copy silently – that is how changes got lost
      GP.storageMode = 'server';
      GP.offline = true;
      GP.serverError = r.error || '';
      GP.state = Object.assign(emptyState(), local || {});
      status('⚠ ' + GP.L('Server nedostupný – zobrazuji poslední uloženou kopii', 'Server unreachable – showing the last saved copy'), true);
      reconnect();
      return;
    }

    // no server at all (file:// or a plain static server) -> browser storage
    GP.state = Object.assign(emptyState(), local || {});
    if (!db) GP.storageError = true;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  };

  function write() {
    if (GP.storageMode === 'server') syncInfo.dirty = true;
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
    if (GP.offline) throw new Error(GP.L('Server je nedostupný', 'The server is unreachable'));
    GP.state = Object.assign(emptyState(), data);
    if (GP.storageMode === 'server') syncInfo.dirty = true;
    writeLocal();
    if (GP.storageMode !== 'server') return;
    // empty the server first (small request), then send the data in batches like any other change
    const base = { settings: GP.state.settings, taskDone: GP.state.taskDone, version: GP.state.version };
    const r = await fetch('api/replace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(base) });
    if (!r.ok) throw new Error(GP.L('Server data neuložil', 'The server did not save the data') + ' (HTTP ' + r.status + ')');
    snap = snapshot(Object.assign(emptyState(), base));
    await syncServer();
  };

  GP.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  GP.byId = (list, id) => GP.state[list].find(x => x.id === id);

  // Pick the Czech or English text for the current UI language.
  GP.L = (cs, en) => (GP.state && GP.state.settings.lang === 'en' ? en : cs);
})(window.GP);
