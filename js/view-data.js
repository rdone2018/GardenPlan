// Backup / restore of all data and CSV export.
(function (GP) {
  const L = GP.L, esc = GP.esc;
  const COLLECTIONS = ['gardens', 'plants', 'placements', 'equipment', 'tasks'];
  const dataUrl = blob => new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = reject; fr.readAsDataURL(blob); });

  // Items of the copy kept aside (changes this browser never managed to send) that differ from the server.
  async function unsentChanges(copy) {
    const out = [];
    for (const c of COLLECTIONS) {
      for (let x of copy[c] || []) {
        if (!x || !x.id) continue;
        // plants saved by an older version get the current field set first, like the ones from the server
        if (c === 'plants') { x = JSON.parse(JSON.stringify(x)); GP.migratePlant(x); }
        const cur = GP.byId(c, x.id);
        if (!cur) { out.push({ c, x, what: L('nová', 'new') }); continue; }
        const strip = o => JSON.stringify(Object.assign({}, o, { photo: undefined }));
        const fieldsDiffer = strip(x) !== strip(cur);
        let photoDiffers = (x.photo || '') !== (cur.photo || '');
        // the server keeps photos separately: compare the picture itself
        if (photoDiffers && /^data:/.test(x.photo || '') && /^api\/photo\//.test(cur.photo || '')) {
          try { photoDiffers = await dataUrl(await (await fetch(cur.photo)).blob()) !== x.photo; } catch (e) { /* keep as different */ }
        }
        if (fieldsDiffer || photoDiffers) out.push({ c, x, what: [fieldsDiffer ? L('údaje', 'details') : '', photoDiffers ? L('fotka', 'photo') : ''].filter(Boolean).join(' + ') });
      }
    }
    return out;
  }

  async function showUnsent(box) {
    const copy = await GP.unsent.get();
    if (!copy) { box.remove(); GP.hasUnsent = false; return; }
    const list = await unsentChanges(copy.state || {});
    const KIND = { gardens: L('zahrada', 'garden'), plants: L('rostlina', 'plant'), placements: L('výsadba', 'planting'), equipment: L('technika', 'equipment'), tasks: L('úkol', 'task') };
    const name = r => r.c === 'plants' ? GP.plantName(r.x) : r.c === 'placements' ? GP.plantName(GP.byId('plants', r.x.plantId) || r.x) : (r.x.name || r.x.title || r.x.id);
    box.innerHTML = '<h3>⚠ ' + L('Neodeslané změny z tohoto prohlížeče', 'Unsent changes from this browser') + '</h3>' +
      '<p class="small">' + L('Tyto změny se uložily jen sem (' + new Date(copy.time).toLocaleString('cs-CZ') + ') a na server se nedostaly. Vyberte, které chcete vrátit – přepíší současnou verzi na serveru.',
        'These changes were only stored here (' + new Date(copy.time).toLocaleString('en-GB') + ') and never reached the server. Pick the ones to bring back – they replace the current version on the server.') + '</p>' +
      (list.length ? '<div class="unsent-list">' + list.map((r, i) => '<label class="row gap small"><input type="checkbox" data-i="' + i + '" checked> ' +
        (r.x.photo ? '<img src="' + esc(r.x.photo) + '" alt="">' : '') + '<b>' + esc(name(r)) + '</b> <span class="muted">' + KIND[r.c] + ' · ' + r.what + '</span></label>').join('') + '</div>'
        : '<p class="muted small">' + L('Nic se neliší od serveru.', 'Nothing differs from the server.') + '</p>') +
      '<div class="row gap">' + (list.length ? '<button class="btn primary" data-act="unsent-ok">' + L('Vrátit vybrané', 'Bring back selected') + '</button>' : '') +
      '<button class="btn" data-act="unsent-drop">' + L('Zahodit kopii', 'Discard the copy') + '</button></div>';
    const ok = box.querySelector('[data-act=unsent-ok]');
    if (ok) ok.onclick = () => {
      for (const cb of box.querySelectorAll('input[data-i]:checked')) {
        const r = list[cb.dataset.i], arr = GP.state[r.c], at = arr.findIndex(y => y.id === r.x.id);
        if (at >= 0) arr[at] = r.x; else arr.push(r.x);
      }
      GP.unsent.drop();
      GP.saveNow();
      GP.ui.toast(L('Změny vráceny', 'Changes restored'));
      GP.render();
    };
    box.querySelector('[data-act=unsent-drop]').onclick = () => {
      if (list.length && !confirm(L('Opravdu zahodit neodeslané změny?', 'Really discard the unsent changes?'))) return;
      GP.unsent.drop();
      GP.render();
    };
  }

  GP.views.data = {
    render() {
      const size = Math.round(JSON.stringify(GP.state).length / 1024);
      return '<div class="head"><h1>' + L('Data a zálohy', 'Data & backups') + '</h1></div>' +
        (GP.hasUnsent ? '<div class="panel" data-unsent><p class="muted">' + L('Porovnávám…', 'Comparing…') + '</p></div>' : '') +
        '<div class="panel"><p>' + (GP.storageMode === 'server'
          ? '🗄️ ' + L('Data se ukládají do databáze <b>MariaDB</b> na serveru – stejná data vidíte z každého zařízení. Záloha do souboru se přesto hodí.', 'Data is stored in the <b>MariaDB</b> database on the server – every device sees the same data. A file backup is still useful.')
          : '💻 ' + L('Data se ukládají jen <b>v tomto prohlížeči</b> (aplikace neběží přes server s databází). Pravidelně si stáhněte zálohu. Do databáze je přenesete tak, že zálohu nahrajete v aplikaci otevřené ze serveru.', 'Data is stored only <b>in this browser</b> (the app is not running through the database server). Download backups regularly. To move them into the database, restore the backup in the app opened from the server.')) + '</p>' +
        '<p class="muted small">' + L('Velikost dat', 'Data size') + ': ' + size + ' kB · ' + GP.state.plants.length + ' ' + L('rostlin', 'plants') + ' · ' + GP.state.gardens.length + ' ' + L('zahrad', 'gardens') + '</p>' +
        '<div class="row gap"><button class="btn primary" data-act="backup">⬇ ' + L('Stáhnout zálohu (JSON)', 'Download backup (JSON)') + '</button>' +
        '<label class="btn">⬆ ' + L('Obnovit ze zálohy', 'Restore from backup') + '<input type="file" accept=".json,application/json" data-act="restore" hidden></label>' +
        '<button class="btn" data-act="csv">⬇ ' + L('Rostliny jako CSV (Excel)', 'Plants as CSV (Excel)') + '</button></div></div>' +
        '<div class="panel"><h3>' + L('Import rostlin', 'Import plants') + '</h3><a class="btn" href="#/import">⬆ ' + L('Import CSV', 'Import CSV') + '</a></div>' +
        '<div class="panel"><h3 class="danger-text">' + L('Smazat vše', 'Delete everything') + '</h3><p class="muted small">' + L('Nejprve si stáhněte zálohu.', 'Download a backup first.') + '</p><button class="btn danger" data-act="wipe">' + L('Smazat všechna data', 'Delete all data') + '</button></div>';
    },
    mount(root) {
      const stamp = () => new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
      const box = root.querySelector('[data-unsent]');
      if (box) showUnsent(box);
      // photos stored on the server are put into the file, so the backup works anywhere
      root.querySelector('[data-act=backup]').onclick = async e => {
        const b = e.currentTarget;
        b.disabled = true;
        const data = JSON.parse(JSON.stringify(GP.state));
        let missing = 0;
        for (const x of [...data.plants, ...data.gardens]) {
          if (!/^api\/photo\//.test(x.photo || '')) continue;
          try {
            const blob = await (await fetch(x.photo)).blob();
            x.photo = await dataUrl(blob);
          } catch (err) { missing++; }
        }
        b.disabled = false;
        GP.ui.download('gardenplan-zaloha-' + stamp() + '.json', JSON.stringify(data, null, 1), 'application/json');
        if (missing) GP.ui.toast(L('Některé fotky se nepodařilo přidat do zálohy: ', 'Some photos could not be added to the backup: ') + missing);
      };
      root.querySelector('[data-act=csv]').onclick = () => GP.ui.download('rostliny-' + stamp() + '.csv', GP.csv.exportPlants(), 'text/csv;charset=utf-8');
      root.querySelector('[data-act=restore]').onchange = async e => {
        const f = e.target.files[0];
        if (!f) return;
        let data;
        try { data = JSON.parse(await f.text()); } catch (err) { return GP.ui.toast(L('Soubor není platná záloha', 'Not a valid backup file')); }
        if (!data || !Array.isArray(data.plants) || !Array.isArray(data.gardens)) return GP.ui.toast(L('Soubor není záloha GardenPlan', 'Not a GardenPlan backup'));
        if (!confirm(L('Nahradit všechna současná data obsahem zálohy?', 'Replace all current data with the backup?'))) return;
        try {
          await GP.replaceState(data);
          GP.ui.toast(L('Záloha obnovena', 'Backup restored'));
        } catch (err) { alert(err.message); }
        GP.go('');
        GP.render();
      };
      root.querySelector('[data-act=wipe]').onclick = async () => {
        if (!confirm(L('Opravdu smazat všechny zahrady, rostliny a úkoly?', 'Really delete all gardens, plants and tasks?'))) return;
        try { await GP.replaceState({ settings: GP.state.settings }); } catch (err) { alert(err.message); }
        if (GP.resetImport) GP.resetImport();
        GP.go('');
        GP.render();
      };
    }
  };
})(window.GP);
