// Persistence. When the app is served by server/server.js the data lives in MariaDB (changes are sent
// as small diffs); otherwise it is kept in the browser's IndexedDB. IndexedDB also serves as a local cache:
// changes not yet confirmed by the server stay there and are sent again after a reload or a server restart.
window.GP = window.GP || {};
(function (GP) {
  const DB_NAME = 'gardenplan', STORE = 'state', KEY = 'main', SYNC_KEY = 'sync', UNSENT_KEY = 'unsent';
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

  // Fingerprints of the items as the server last confirmed them, kept with syncInfo: after a reload they tell
  // which local items were really changed here (and must not be overwritten by an older copy from this device).
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
  function setBase() {
    syncInfo.base = { meta: snap.meta };
    for (const c of COLLECTIONS) { const b = syncInfo.base[c] = {}; for (const [id, json] of snap[c]) b[id] = hash(json); }
  }

  // Did this device change the item since the server last confirmed it?
  function changedHere(c, id, json) {
    if (snap) return snap[c].get(id) !== json;
    const b = syncInfo.base && syncInfo.base[c];
    return !(b && b[id] === hash(json));
  }

  // Items edited on this device get the time of the edit (mt), so that when two devices changed the same item,
  // the later edit wins (see mergeLocal). Returns whether anything differs from the server.
  // keepTimes: the changes come from an earlier visit and already carry their edit times.
  const stamped = new Map(); // 'collection|id' -> the item right after its last stamp
  function markChanges(keepTimes) {
    const t = Date.now(), base = syncInfo.base || {};
    let any = metaOf(GP.state) !== (snap ? snap.meta : base.meta);
    for (const c of COLLECTIONS) {
      const ids = new Set();
      for (const x of GP.state[c] || []) {
        if (!x || !x.id) continue;
        ids.add(x.id);
        const json = JSON.stringify(x), key = c + '|' + x.id;
        if (!changedHere(c, x.id, json)) continue;
        any = true;
        if (stamped.get(key) === json) continue;
        if (!keepTimes) x.mt = t;
        stamped.set(key, JSON.stringify(x));
      }
      const known = snap ? [...snap[c].keys()] : Object.keys(base[c] || {});
      if (known.some(id => !ids.has(id))) any = true;
    }
    return any;
  }

  // Server data + local changes the server never got, item by item: a change made on one side only wins; when both
  // sides changed an item, the later edit (mt) wins. Items deleted here are deleted on the server too, unless another
  // device changed them meanwhile. A copy saved by an older version has no fingerprints and no edit times – its items
  // that differ from the server cannot be decided and are returned in `unsure` (kept aside for the Data page).
  function mergeLocal(server, local) {
    const out = Object.assign(emptyState(), server), unsure = {};
    const base = syncInfo.base;
    let won = 0;
    for (const c of COLLECTIONS) {
      const b = base ? base[c] || {} : null;
      const m = new Map((server[c] || []).map(x => [x.id, x]));
      const here = new Set();
      for (const x of local[c] || []) {
        if (!x || !x.id) continue;
        here.add(x.id);
        const s = m.get(x.id), json = JSON.stringify(x);
        if ((s && JSON.stringify(s) === json) || (b && b[x.id] === hash(json))) continue; // the server copy is current
        let mine;
        if (!s) mine = b || x.mt ? true : null;                                    // new here (or deleted elsewhere)
        else if (b && b[x.id] === hash(JSON.stringify(s))) mine = true;            // changed only here
        else if (!b && !x.mt) mine = null;
        else mine = (x.mt || 0) > (s.mt || 0);                                     // changed on both sides
        if (mine) { m.set(x.id, x); won++; }
        else if (mine === null) (unsure[c] = unsure[c] || []).push(x);
      }
      if (b) for (const id of Object.keys(b)) {
        const s = m.get(id);
        if (!here.has(id) && s && hash(JSON.stringify(s)) === b[id]) { m.delete(id); won++; }
      }
      out[c] = [...m.values()];
    }
    out.settings = local.settings || out.settings;
    out.taskDone = Object.assign({}, server.taskDone, local.taskDone);
    return { state: out, unsure, won };
  }

  // -> { state } | { reachable, error }; reachable = our server answered (even with an error)
  async function fetchState() {
    try {
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 60000);
      const r = await fetch('api/state', { cache: 'no-store', signal: ctrl.signal }).finally(() => clearTimeout(timer));
      const json = (r.headers.get('content-type') || '').includes('json');
      if (r.ok && json) return { state: await r.json() };
      if (json) { let e = ''; try { e = (await r.json()).error || ''; } catch (x) { /* ignore */ } return { reachable: true, error: 'HTTP ' + r.status + (e ? ' – ' + e : '') }; }
      return { reachable: false, error: 'HTTP ' + r.status };
    } catch (e) {
      return { reachable: false, error: e.message };
    }
  }

  // number of items that differ from the last confirmed state (for the progress text)
  const countDiff = next => COLLECTIONS.reduce((n, c) => n + [...next[c]].filter(([id, json]) => snap[c].get(id) !== json).length + [...snap[c].keys()].filter(id => !next[c].has(id)).length, 0);

  // Sends everything that differs from the last confirmed state, in batches; retries every 10 s on failure.
  function syncServer() {
    if (GP.storageMode !== 'server' || GP.offline || !snap) return;
    if (syncing) { again = true; return syncing; }
    syncing = (async () => {
      // with nothing to send the body would finish before `syncing` is assigned and leave it set for good
      // (every later save was then skipped while the status still said "saved")
      await null;
      let part = 0, newerSeen = false;
      try {
        for (;;) {
          part++;
          const next = snapshot(GP.state);
          const body = { upsert: {}, delete: {} }, sent = [];
          let size = 0, any = false;
          for (const c of COLLECTIONS) {
            for (const [id, json] of snap[c]) {
              if (next[c].has(id)) continue;
              (body.delete[c] = body.delete[c] || []).push(id);
              ((body.seen = body.seen || {})[c] = body.seen[c] || {})[id] = JSON.parse(json).mt || 0;
              sent.push([c, id, null]); any = true;
            }
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
          const text = JSON.stringify(body);
          status(GP.L('Ukládám', 'Saving') + (part > 1 || sent.length < countDiff(next) ? ' ' + GP.L('část', 'part') + ' ' + part : '') + ' (' + Math.round(text.length / 1024) + ' kB)…');
          // a request the server never answers must not hang forever
          const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 60000);
          let r;
          try { r = await fetch('api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text, keepalive: text.length < 60000, signal: ctrl.signal }); }
          catch (e) { throw new Error(e.name === 'AbortError' ? GP.L('server neodpověděl do 60 s', 'no answer from the server within 60 s') : e.message); }
          finally { clearTimeout(timer); }
          if (!r.ok) {
            let e = '';
            try { e = (await r.json()).error || ''; } catch (x) { /* proxy error page */ }
            throw new Error('HTTP ' + r.status + (r.status === 413 ? ' – ' + GP.L('příliš velký požadavek', 'request too large') : '') + (e ? ' – ' + e : ''));
          }
          let answer = {};
          try { answer = await r.json(); } catch (e) { /* older server */ }
          for (const [c, id, json] of sent) { if (json === null) snap[c].delete(id); else snap[c].set(id, json); }
          if (body.meta) snap.meta = next.meta;
          // the server keeps photos separately and answers with their addresses: use them here too (smaller saves)
          for (const [c, id, url] of answer.photos || []) {
            const o = JSON.parse(snap[c].get(id) || 'null');
            if (!o) continue;
            const item = GP.state[c].find(x => x.id === id);
            if (item && item.photo === o.photo) item.photo = url;
            o.photo = url;
            snap[c].set(id, JSON.stringify(o));
          }
          // another device edited some of these items later: its version stays and is shown here too
          for (const [c, obj] of answer.newer || []) {
            const sentJson = (sent.find(s => s[0] === c && s[1] === obj.id) || [])[2];
            const json = JSON.stringify(obj), at = GP.state[c].findIndex(x => x.id === obj.id);
            snap[c].set(obj.id, json);
            stamped.delete(c + '|' + obj.id);
            if (at >= 0 && JSON.stringify(GP.state[c][at]) === sentJson) GP.state[c][at] = obj; // unless edited again meanwhile
            else if (at < 0 && sentJson === null) GP.state[c].push(obj);                       // deleted here, edited there
            newerSeen = true;
          }
          if ((answer.photos || []).length || (answer.newer || []).length) writeLocal();
        }
        clearTimeout(retryTimer);
        syncInfo.dirty = false;
        setBase();
        writeSyncInfo();
        status('✓ ' + GP.L('Uloženo na server', 'Saved to server') + ' ' + now());
        if (newerSeen) {
          if (GP.ui) GP.ui.toast(GP.L('Některé položky mezitím upravilo jiné zařízení – ponechána novější verze.', 'Another device edited some items later – the newer version was kept.'));
          if (GP.render) GP.render();
        }
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

  // ---------- unsent copy kept aside ----------
  function keepUnsent(local) {
    GP.hasUnsent = true;
    if (!db) return;
    try { db.transaction(STORE, 'readwrite').objectStore(STORE).put({ time: Date.now(), state: local }, UNSENT_KEY); } catch (e) { console.error(e); }
  }
  GP.unsent = {
    get: () => (db ? readKey(UNSENT_KEY) : Promise.resolve(null)),
    drop() {
      GP.hasUnsent = false;
      if (db) try { db.transaction(STORE, 'readwrite').objectStore(STORE).delete(UNSENT_KEY); } catch (e) { console.error(e); }
    }
  };

  // Server data arrived (first load or after an outage): take it, plus local changes it does not have yet.
  function useServerState(serverState, local) {
    GP.storageMode = 'server';
    GP.offline = false;
    snap = snapshot(Object.assign(emptyState(), serverState));
    const merged = syncInfo.dirty && local ? mergeLocal(serverState, local) : null;
    // items that cannot be decided are never thrown away: the user picks on the Data page what to bring back
    if (merged && Object.keys(merged.unsure).length) keepUnsent(Object.assign({}, merged.unsure));
    GP.state = merged ? merged.state : Object.assign(emptyState(), serverState);
    setBase();
    syncInfo.mode = 'server';
    syncInfo.dirty = !!merged && markChanges(true);
    writeLocal();
    if (syncInfo.dirty) { status(GP.L('Odesílám změny z tohoto zařízení…', 'Sending the changes from this device…')); setTimeout(syncServer, 300); }
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
    // ask the server right away; the browser copy is read meanwhile
    const t0 = performance.now(), ms = () => Math.round(performance.now() - t0);
    const times = GP.startTimes = { page: Math.round(t0) };
    status(GP.L('Načítám data…', 'Loading data…'));
    const server = fetchState().then(r => { times.server = ms(); return r; });
    // Browser storage sometimes stalls (seen in Edge): give it a few seconds in all, then go on without it. It is
    // then not touched at all this time, so an unsent copy in it is not overwritten either.
    const LATE = {}, deadline = new Promise(resolve => setTimeout(() => resolve(LATE), 4000));
    const inTime = p => Promise.race([p, deadline]);
    let local = null;
    try {
      db = await inTime(openDb());
      if (db === LATE) throw new Error('IndexedDB did not open within 4 s');
      const rows = await inTime(Promise.all([readKey(KEY), readKey(SYNC_KEY), readKey(UNSENT_KEY)]));
      if (rows === LATE) throw new Error('IndexedDB did not answer within 4 s');
      const [l, si, un] = rows;
      local = l;
      syncInfo = Object.assign({ mode: 'local', dirty: false }, si);
      GP.hasUnsent = !!un;
    } catch (e) {
      console.error('Storage unavailable', e);
      times.storageError = e.message;
      db = null;
    }
    times.storage = ms();

    const r = await server;
    console.log('GardenPlan start (ms):', JSON.stringify(times));
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
    status('');
    if (!db) GP.storageError = true;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  };

  // Another device may have changed the data meanwhile: fetch the current state (only when nothing is waiting
  // to be saved here). Returns true when something changed.
  GP.refresh = async function () {
    if (GP.storageMode !== 'server' || GP.offline || !snap || saveTimer || syncing || syncInfo.dirty) return false;
    const r = await fetchState();
    if (!r.state || saveTimer || syncing || syncInfo.dirty) return false;
    const next = snapshot(Object.assign(emptyState(), r.state));
    if (next.meta === snap.meta && COLLECTIONS.every(c => next[c].size === snap[c].size && [...next[c]].every(([id, json]) => snap[c].get(id) === json))) return false;
    snap = next;
    setBase();
    GP.state = Object.assign(emptyState(), r.state);
    writeLocal();
    return true;
  };

  function write() {
    saveTimer = null;
    // only real changes count: a "dirty" flag left behind by a page closed mid-save used to make the next visit
    // treat the whole local copy as unsent
    if (GP.storageMode === 'server' && markChanges()) syncInfo.dirty = true;
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
