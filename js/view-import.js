// CSV import: auto-map Czech/Slovak/English column names to plant fields, preview, then merge into the catalog.
(function (GP) {
  const L = GP.L, esc = GP.esc;
  let imp = null; // { file, headers, rows, map, gardenId, fillOnly, extraToNotes, result }

  function targetOptions(cur) {
    const opt = (v, label) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
    let html = opt('', '— ' + L('nepoužít', 'skip') + ' —');
    const groups = GP.groups();
    for (let gi = 0; gi < 3; gi++) {
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
          (r.placed ? '<li>' + L('Přidáno do zahrady', 'Added to garden') + ': <b>' + r.placed + '</b></li>' : '') +
          (r.skipped ? '<li>' + L('Přeskočeno (bez názvu)', 'Skipped (no name)') + ': ' + r.skipped + '</li>' : '') + '</ul>' +
          '<div class="row gap"><a class="btn primary" href="#/plants">' + L('Zobrazit katalog', 'Open catalog') + '</a>' +
          (imp.gardenId ? '<a class="btn" href="#/garden/' + imp.gardenId + '/plan">' + L('Umístit v plánu zahrady', 'Place them on the garden plan') + '</a>' : '') + '</div></div>';
      }

      const mappedNames = imp.map.some(t => /^plant:name_/.test(t));
      html += '<div class="panel"><h2>' + L('Přiřazení sloupců', 'Column mapping') + '</h2>' +
        '<div class="map-table"><table class="tbl"><thead><tr><th>' + L('Sloupec v souboru', 'Column in file') + '</th><th>' + L('Uložit jako', 'Store as') + '</th><th>' + L('Ukázka (1. řádek)', 'Sample (row 1)') + '</th></tr></thead><tbody>' +
        imp.headers.map((h, i) => '<tr class="' + (imp.map[i] ? '' : 'unmapped') + '"><td><b>' + esc(h || '(' + (i + 1) + ')') + '</b></td><td><select data-col="' + i + '">' + targetOptions(imp.map[i]) + '</select></td>' +
          '<td class="small sample">' + esc((imp.rows.find(r => r[i]) || [])[i] || '').slice(0, 120) + '</td></tr>').join('') + '</tbody></table></div>' +
        (mappedNames ? '' : '<p class="alert">' + L('Přiřaďte alespoň jeden sloupec s názvem rostliny.', 'Map at least one plant-name column.') + '</p>') +
        '<h3>' + L('Možnosti', 'Options') + '</h3><div class="opts">' +
        '<label><input type="checkbox" data-opt="fillOnly"' + (imp.fillOnly ? ' checked' : '') + '> ' + L('Rostlinu, která už v katalogu je (stejný latinský nebo český název), jen doplnit – vyplněné údaje nepřepisovat', 'If a plant already exists (same Latin or Czech name), only fill empty fields – never overwrite') + '</label>' +
        '<label><input type="checkbox" data-opt="extraToNotes"' + (imp.extraToNotes ? ' checked' : '') + '> ' + L('Nepřiřazené sloupce uložit do poznámek', 'Save unmapped columns into notes') + '</label>' +
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
        imp = { file: f.name, headers, rows: rows.slice(1), map: headers.map(GP.csv.matchHeader), gardenId: '', fillOnly: true, extraToNotes: true };
        // The same target twice -> keep only the first
        const seen = new Set();
        imp.map = imp.map.map(t => (t && seen.has(t) ? '' : (seen.add(t), t)));
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
    const res = { created: 0, updated: 0, placed: 0, skipped: 0 };
    const fieldOf = key => GP.PLANT_FIELDS.find(f => f.key === key);
    for (const row of imp.rows) {
      const data = {}, place = {}, extra = [];
      imp.headers.forEach((h, i) => {
        const raw = (row[i] || '').trim();
        if (!raw) return;
        const t = imp.map[i];
        if (!t) { if (imp.extraToNotes) extra.push(h + ': ' + raw); return; }
        const [kind, path] = t.split(':');
        if (kind === 'place') { place[path] = raw; return; }
        const [key, sub] = path.split('.');
        const f = fieldOf(key);
        if (sub === 'months') {
          data[key] = data[key] || {};
          data[key].months = GP.parseMonths(raw);
        } else if (f.type === 'care') {
          data[key] = data[key] || {};
          data[key].text = raw;
        } else if (f.type === 'months') {
          const ms = GP.parseMonths(raw);
          if (ms.length) data[key] = ms;
          else extra.push(GP.fieldLabel(f) + ': ' + raw); // e.g. "koncem léta" – keep the text
        } else if (f.type === 'bool') {
          const b = GP.parseBool(raw);
          if (b !== '') data[key] = b; else extra.push(GP.fieldLabel(f) + ': ' + raw);
        } else if (f.type === 'select') {
          data[key] = GP.parseType(raw);
          if (data[key] === 'other') extra.push(GP.fieldLabel(f) + ': ' + raw);
        } else data[key] = raw;
      });
      if (!['name_cs', 'name_sk', 'name_en', 'name_la'].some(k => data[k])) { res.skipped++; continue; }
      if (extra.length) data.notes = [data.notes, extra.join('\n')].filter(Boolean).join('\n');

      const same = (a, b) => a && b && GP.norm(a) === GP.norm(b);
      let p = GP.state.plants.find(x => same(x.name_la, data.name_la) || (!data.name_la && same(x.name_cs, data.name_cs)) || (!data.name_la && !data.name_cs && same(x.name_sk, data.name_sk)));
      if (p) {
        for (const [k, v] of Object.entries(data)) {
          const f = fieldOf(k);
          if (f.type === 'care') {
            const cur = p[k] || {};
            if (v.text && (!imp.fillOnly || !cur.text)) cur.text = v.text;
            if (v.months && v.months.length && (!imp.fillOnly || !(cur.months || []).length)) cur.months = v.months;
            p[k] = cur;
          } else if (k === 'notes' && p.notes && imp.fillOnly) {
            if (!p.notes.includes(v)) p.notes += '\n' + v;
          } else if (!imp.fillOnly || !GP.isFilled(p, f)) p[k] = v;
        }
        res.updated++;
      } else {
        p = GP.newPlant(data);
        res.created++;
      }

      if (imp.gardenId) {
        const exists = GP.state.placements.some(x => x.plantId === p.id && x.gardenId === imp.gardenId && (x.position || '') === (place.position || ''));
        if (!exists) {
          const planted = GP.parseBool(place.planted);
          GP.state.placements.push({ id: GP.uid(), plantId: p.id, gardenId: imp.gardenId, cells: [], status: planted === true ? 'planted' : 'planned',
            position: place.position || '', plantedDate: '', count: place.count || '', notes: '' });
          res.placed++;
        }
      }
    }
    return res;
  }
})(window.GP);
