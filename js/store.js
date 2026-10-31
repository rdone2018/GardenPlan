// Persistence: the whole app state is one object kept in the browser's IndexedDB.
window.GP = window.GP || {};
(function (GP) {
  const DB_NAME = 'gardenplan', STORE = 'state', KEY = 'main';
  let db = null, saveTimer = null;
  GP.views = {};

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

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function write() {
    if (!db) return;
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(GP.state, KEY);
      tx.oncomplete = () => {
        const el = document.getElementById('saved');
        if (el) el.textContent = '✓ ' + GP.L('Uloženo', 'Saved') + ' ' + new Date().toLocaleTimeString(GP.L('cs-CZ', 'en-GB'), { hour: '2-digit', minute: '2-digit' });
      };
      tx.onerror = () => console.error('Save failed', tx.error);
    } catch (e) {
      console.error('Save failed', e);
    }
  }

  GP.load = async function () {
    try {
      db = await openDb();
      const saved = await new Promise((resolve, reject) => {
        const req = db.transaction(STORE).objectStore(STORE).get(KEY);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      GP.state = Object.assign(emptyState(), saved || {});
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) {
      console.error('Storage unavailable', e);
      GP.state = emptyState();
      GP.storageError = true;
    }
  };

  GP.save = function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(write, 250);
  };

  GP.saveNow = function () {
    clearTimeout(saveTimer);
    write();
  };

  GP.replaceState = function (data) {
    GP.state = Object.assign(emptyState(), data);
    GP.saveNow();
  };

  GP.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  GP.byId = (list, id) => GP.state[list].find(x => x.id === id);

  // Pick the Czech or English text for the current UI language.
  GP.L = (cs, en) => (GP.state && GP.state.settings.lang === 'en' ? en : cs);
})(window.GP);
