// CSV import: auto-map Czech/Slovak/English column names to plant fields, preview, then merge into the catalog.
(function (GP) {
  const L = GP.L, esc = GP.esc;
  let imp = null; // { file, headers, rows, map, gardenId, fillOnly, extraToNotes, result }

  function targetOptions(cur) {
    const opt = (v, label) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
    let html = opt('', '— ' + L('nepoužít', 'skip') + ' —') + opt('match:name', L('Původní název (podle něj najít rostlinu)', 'Original name (find the plant by it)'));
    const groups = GP.groups();
    for (let gi = 0; gi < groups.length; gi++) {
      html += '<optgroup label="' + esc(groups[gi][0]) + '">';
      for (const f of GP.PLANT_FIELDS.filter(x => x.group === gi && x.type !== 'color')) {
        html += opt('plant:' + f.key, GP.fieldLabel(f));
        if (f.type === 'care') html += opt('plant:' + f.key + '.months', GP.fieldLabel(f) + ' – ' + L('měsíce', 'months'));
      }
      html += '</optgroup>';
    }
    html += '<optgroup label="' + esc(L('Výsadba v zahradě', 'Planting in garden')) + '">' + GP.PLACEMENT_FIELDS.map(f => opt('place:' + f.key, L(f.cs, f.en))).join('') + '</optgroup>';
    return html;
  }

  GP.views.import = {
    render() {
      let html = '<div class="head"><h1><a href="#/plants" class="back">←</a> ' + L('Import rostlin z CSV', 'Import plants from CSV') + '</h1></div>' +
        '<div class="panel"><p>' + L('V Excelu: <b>Soubor → Uložit jako → CSV (oddělený středníkem)</b> nebo „CSV UTF-8“. Názvy sloupců mohou být česky, slovensky nebo anglicky – aplikace je rozpozná, přiřazení můžete upravit. Stačí, když má každý řádek alespoň jeden název.',
        'In Excel: <b>File → Save as → CSV</b> (or "CSV UTF-8"). Column names may be Czech, Slovak or English – they are recognised automatically and you can adjust the mapping. Each row needs at least one name.') + '</p>' +
        '<label class="btn primary">📄 ' + L('Vybrat soubor CSV', 'Choose CSV file') + '<input type="file" accept=".csv,.txt,text/csv" data-act="file" hidden></label>' +
        (imp ? ' <span class="muted">' + esc(imp.file) + ' · ' + imp.rows.length + ' ' + L('řádků', 'rows') + '</span>' : '') + '</div>';
      if (!imp) return html;

      if (imp.result) {
        const r = imp.result;
        return html + '<div class="panel"><h2>✓ ' + L('Hotovo', 'Done') + '</h2><ul>' +
          '<li>' + L('Nových rostlin', 'New plants') + ': <b>' + r.created + '</b></li>' +
          '<li>' + L('Doplněných existujících', 'Existing plants updated') + ': <b>' + r.updated + '</b></li>' +
          (r.dupes ? '<li>' + L('Opakované řádky (další kusy téže rostliny)', 'Repeated rows (more specimens of the same plant)') + ': ' + r.dupes + '</li>' : '') +
          (r.unsure ? '<li>' + L('Neurčených rostlin (?)', 'Unidentified plants (?)') + ': ' + r.unsure + '</li>' : '') +
          (r.placed ? '<li>' + L('Přidáno do zahrady', 'Added to garden') + ': <b>' + r.placed + '</b></li>' : '') +
          (r.skipped ? '<li>' + L('Přeskočeno (bez názvu)', 'Skipped (no name)') + ': ' + r.skipped + '</li>' : '') + '</ul>' +
          '<div class="row gap"><a class="btn primary" href="#/plants">' + L('Zobrazit katalog', 'Open catalog') + '</a>' +
          (imp.gardenId ? '<a class="btn" href="#/garden/' + imp.gardenId + '/plan">' + L('Umístit v plánu zahrady', 'Place them on the garden plan') + '</a>' : '') + '</div></div>';
      }

      const mappedNames = imp.map.some(t => /^plant:name_/.test(t));
      // "Meru?ka", "T?eše?" = the file was saved in a code page without Czech letters, they are lost for good.
      const broken = imp.rows.filter(r => r.some(c => /\p{L}\?\p{L}/u.test(c || ''))).length;
      if (broken) html += '<div class="alert">⚠ ' + L('V ' + broken + ' řádcích je „?“ uprostřed slova (např. „Meru?ka“). Soubor byl nejspíš uložen jako obyčejné CSV a Excel při tom česká písmena ř, ň, č, ě, ů nahradil otazníkem – ta už v souboru nejsou. V Excelu prosím zvolte <b>Uložit jako → CSV UTF-8 (s oddělovači)</b> a nahrajte soubor znovu.',
        broken + ' rows contain "?" inside a word (e.g. "Meru?ka"). The file was probably saved as plain CSV and Excel replaced letters it could not store with "?". In Excel choose <b>Save as → CSV UTF-8</b> and load the file again.') + '</div>';
      html += '<div class="panel"><h2>' + L('Přiřazení sloupců', 'Column mapping') + '</h2>' +
        '<div class="map-table"><table class="tbl"><thead><tr><th>' + L('Sloupec v souboru', 'Column in file') + '</th><th>' + L('Uložit jako', 'Store as') + '</th><th>' + L('Ukázka (1. řádek)', 'Sample (row 1)') + '</th></tr></thead><tbody>' +
        imp.headers.map((h, i) => '<tr class="' + (imp.map[i] ? '' : 'unmapped') + '"><td><b>' + esc(h || '(' + (i + 1) + ')') + '</b></td><td><select data-col="' + i + '">' + targetOptions(imp.map[i]) + '</select></td>' +
          '<td class="small sample">' + esc((imp.rows.find(r => r[i]) || [])[i] || '').slice(0, 120) + '</td></tr>').join('') + '</tbody></table></div>' +
        (mappedNames ? '' : '<p class="alert">' + L('Přiřaďte alespoň jeden sloupec s názvem rostliny.', 'Map at least one plant-name column.') + '</p>') +
        '<h3>' + L('Možnosti', 'Options') + '</h3><div class="opts">' +
        '<label><input type="checkbox" data-opt="fillOnly"' + (imp.fillOnly ? ' checked' : '') + '> ' + L('Rostlinu, která už v katalogu je (stejný latinský nebo český název), jen doplnit – vyplněné údaje nepřepisovat', 'If a plant already exists (same Latin or Czech name), only fill empty fields – never overwrite') + '</label>' +
        '<label><input type="checkbox" data-opt="extraToNotes"' + (imp.extraToNotes ? ' checked' : '') + '> ' + L('Nepřiřazené sloupce uložit do poznámek', 'Save unmapped columns into notes') + '</label>' +
        '<label><input type="checkbox" data-opt="splitNames"' + (imp.splitNames ? ' checked' : '') + '> ' + L('Z názvu oddělit odrůdu v uvozovkách (\'Bluecrop\') a podnož v závorce (podnož myrobalan)', 'Split the cultivar in quotes (\'Bluecrop\') and the rootstock in brackets (rootstock …) out of the name') + '</label>' +
        '<p class="small muted">' + L('Stejná rostlina na více řádcích se v katalogu uloží jednou; při přidání do zahrady se řádky sečtou jako počet kusů. Otazník v názvu („Rododendron ???“) = neurčená rostlina.', 'The same plant on several rows is stored once in the catalog; when adding to a garden the rows are summed as a count. A question mark in the name = unidentified plant.') + '</p>' +
        '<label>' + L('Přidat rostliny také do zahrady', 'Also add the plants to garden') + ' <select data-opt="gardenId"><option value="">— ' + L('ne', 'no') + ' —</option>' +
        GP.state.gardens.map(g => '<option value="' + g.id + '"' + (imp.gardenId === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('') + '</select></label></div>' +
        '<button class="btn primary" data-act="run"' + (mappedNames ? '' : ' disabled') + '>⬆ ' + L('Importovat', 'Import') + ' ' + imp.rows.length + ' ' + L('řádků', 'rows') + '</button></div>';
      return html;
    },
    mount(root) {
      root.querySelector('[data-act=file]').onchange = async e => {
        const f = e.target.files[0];
        if (!f) return;
        const rows = GP.csv.parse(GP.csv.decode(await f.arrayBuffer()));
        if (rows.length < 2) return GP.ui.toast(L('Soubor neobsahuje data', 'The file has no data rows'));
        const headers = rows[0];
        imp = { file: f.name, headers, rows: rows.slice(1), map: headers.map(GP.csv.matchHeader), gardenId: GP.state.gardens.length === 1 ? GP.state.gardens[0].id : '',
          fillOnly: true, extraToNotes: true, splitNames: true };
        // The same target twice -> keep only the first (care items and long texts may take several columns)
        const seen = new Set(), multi = t => { const f = GP.plantField(t.replace(/^plant:/, '').split('.')[0]); return f && (f.type === 'care' || f.type === 'longtext'); };
        imp.map = imp.map.map(t => (t && seen.has(t) && !multi(t) ? '' : (seen.add(t), t)));
        // a file that names the plants by their original name is meant to rewrite them (e.g. cleaned names)
        if (imp.map.includes('match:name')) imp.fillOnly = false;
        GP.render();
      };
      if (!imp || imp.result) return;
      root.querySelectorAll('[data-col]').forEach(s => s.onchange = () => { imp.map[+s.dataset.col] = s.value; GP.render(); });
      root.querySelectorAll('[data-opt]').forEach(el => el.onchange = () => { imp[el.dataset.opt] = el.type === 'checkbox' ? el.checked : el.value; });
      root.querySelector('[data-act=run]').onclick = () => { imp.result = runImport(imp); GP.saveNow(); GP.render(); };
    }
  };

  GP.resetImport = () => { imp = null; };

  function runImport(imp) {
    const res = { created: 0, updated: 0, placed: 0, skipped: 0, dupes: 0, unsure: 0 };
    const fieldOf = key => GP.PLANT_FIELDS.find(f => f.key === key);
    const thisRun = new Set(), runPlaced = new Map();
    for (const row of imp.rows) {
      const data = {}, place = {}, extra = [];
      let matchName = '';
      imp.headers.forEach((h, i) => {
        const raw = (row[i] || '').trim();
        if (!raw) return;
        const t = imp.map[i];
        if (!t) { if (imp.extraToNotes) extra.push(h + ': ' + raw); return; }
        const [kind, path] = t.split(':');
        if (kind === 'place') { place[path] = raw; return; }
        if (kind === 'match') { matchName = raw; return; }
        const [key, sub] = path.split('.');
        const f = fieldOf(key);
        if (f.type === 'care') {
          // a care column fills the first term: its text, or its months ("– měsíce" column)
          // ("Řez 1" + "Řez 2" -> two terms of Řez)
          const terms = data[key] = data[key] || [];
          if (sub === 'months') {
            const t = terms.find(x => !x.months) || (terms.push({}), terms[terms.length - 1]);
            t.months = GP.parseMonths(raw);
          } else {
            const t = terms.find(x => !x.text) || (terms.push({}), terms[terms.length - 1]);
            t.text = raw;
          }
          return;
        }
        if (f.type === 'longtext' && data[key]) { data[key] += '\n' + raw; return; } // e.g. two columns mapped to notes
        const v = GP.parseField(f, raw);
        if (v === undefined) { extra.push(GP.fieldLabel(f) + ': ' + raw); return; } // e.g. "koncem léta" – keep the text
        // sizes are stored in cm; a "(m)" column or "m" value is converted
        data[key] = key === 'height' || key === 'width' ? GP.toCm(raw, /\(m\)|\bv m\b/.test(GP.norm(h)) ? 'm' : 'cm') : v;
        if (key === 'hardiness' && !data.usda) data.usda = GP.usdaFromC(+v);
      });
      // "?" in a name = the exact species is not known: drop the "?" and flag the plant instead.
      const names = ['name_cs', 'name_sk', 'name_en', 'name_la'];
      if (names.some(k => data[k] && data[k].includes('?'))) {
        data.unsure = true;
        for (const k of names) if (data[k]) data[k] = data[k].replace(/\?/g, '').replace(/\s+/g, ' ').trim();
      }
      if (imp.splitNames) {
        for (const k of names) {
          if (!data[k]) continue;
          const s = splitName(data[k]);
          data[k] = s.name;
          if (s.cultivar && !data.cultivar) data.cultivar = s.cultivar;
          if (s.rootstock && !data.rootstock) data.rootstock = s.rootstock;
        }
      }
      if (!names.some(k => data[k])) { res.skipped++; continue; }
      if (extra.length) data.notes = [data.notes, extra.join('\n')].filter(Boolean).join('\n');

      // An unidentified plant only merges with another unidentified one of the same name, never with a known species;
      // different cultivars / rootstocks stay separate plants.
      const same = (a, b) => a && b && GP.norm(a) === GP.norm(b);
      // with a "Původní název" column the plant is found by its current Czech name (the file may rename it)
      const noQ = s => (s || '').replace(/\?/g, ''); // "Višeň ???" also finds an unidentified "Višeň"
      let p = matchName ? GP.state.plants.find(x => !thisRun.has(x.id) && same(noQ(x.name_cs), noQ(matchName))) :
        GP.state.plants.find(x => !x.unsure === !data.unsure && GP.norm(x.cultivar) === GP.norm(data.cultivar) && GP.norm(x.rootstock) === GP.norm(data.rootstock) &&
          (same(x.name_la, data.name_la) || (!data.name_la && same(x.name_cs, data.name_cs)) || (!data.name_la && !data.name_cs && same(x.name_sk, data.name_sk))));
      if (p && thisRun.has(p.id)) {
        res.dupes++; // the same plant again in this file = another specimen
      } else if (p) {
        for (const [k, v] of Object.entries(data)) {
          const f = fieldOf(k);
          if (!f) p[k] = v; // flags such as `unsure`
          else if (k === 'notes' && p.notes && imp.fillOnly) {
            if (!p.notes.includes(v)) p.notes += '\n' + v;
          } else if (!imp.fillOnly || !GP.isFilled(p, f)) p[k] = v;
        }
        res.updated++;
      } else {
        p = GP.newPlant(data);
        res.created++;
      }
      thisRun.add(p.id);

      if (imp.gardenId) {
        const key = p.id + '|' + (place.position || '');
        const exists = GP.state.placements.some(x => x.plantId === p.id && x.gardenId === imp.gardenId && (x.position || '') === (place.position || ''));
        if (runPlaced.has(key)) {
          const pl = runPlaced.get(key);
          pl.count = String((+pl.count || 1) + (+place.count || 1));
        } else if (!exists) {
          const planted = GP.parseBool(place.planted);
          const pl = { id: GP.uid(), plantId: p.id, gardenId: imp.gardenId, cells: [], status: planted === true ? 'planted' : 'planned',
            position: place.position || '', plantedDate: '', count: place.count || '', notes: '' };
          GP.state.placements.push(pl);
          runPlaced.set(key, pl);
          res.placed++;
        }
      }
    }
    res.unsure = GP.state.plants.filter(p => thisRun.has(p.id) && p.unsure).length;
    return res;
  }

  // "Meruňka 'Bergeron'  (podnož myrobalan)" -> { name: 'Meruňka', cultivar: 'Bergeron', rootstock: 'myrobalan' }
  const Q = '[\'‘’‚"“”„´`]';
  function splitName(raw) {
    let s = raw.replace(/ /g, ' '), cultivar = '', rootstock = '';
    s = s.replace(/\(\s*podno[žz]\w*\s*:?\s*([^)]*)\)/i, (m, r) => { rootstock = r.trim(); return ' '; });
    s = s.replace(new RegExp(Q + '\\s*(.+)\\s*' + Q), (m, c) => { cultivar = c.trim(); return ' '; });
    return { name: s.replace(/\s+/g, ' ').replace(/[\s,–-]+$/, '').trim() || raw.trim(), cultivar, rootstock };
  }
})(window.GP);
