// Plant catalog (shared by all gardens) and the plant card: 0 basics, 1 before planting, 2 care, plus plantings.
(function (GP) {
  const L = GP.L, esc = GP.esc;
  const filt = GP.plantFilter = { q: '', type: '', missing: '', garden: '', sort: 'name' };

  GP.newPlant = function (data) {
    const p = Object.assign({ id: GP.uid(), created: new Date().toISOString().slice(0, 10) }, data || {});
    GP.state.plants.push(p);
    GP.save();
    return p;
  };

  function filtered() {
    const q = GP.norm(filt.q);
    let list = GP.state.plants.filter(p => {
      if (q && !GP.norm([p.name_cs, p.name_sk, p.name_en, p.name_la, p.cultivar, p.purpose].join(' ')).includes(q)) return false;
      if (filt.type && p.type !== filt.type) return false;
      if (filt.missing === '_any' && GP.completeness(p) === 100) return false;
      if (filt.missing && filt.missing !== '_any' && GP.isFilled(p, GP.PLANT_FIELDS.find(f => f.key === filt.missing))) return false;
      if (filt.garden && !GP.state.placements.some(pl => pl.plantId === p.id && pl.gardenId === filt.garden && pl.status !== 'removed')) return false;
      return true;
    });
    const by = {
      name: (a, b) => GP.plantName(a).localeCompare(GP.plantName(b), 'cs'),
      latin: (a, b) => (a.name_la || '~').localeCompare(b.name_la || '~'),
      bloom: (a, b) => ((a.bloomMonths || [])[0] || 99) - ((b.bloomMonths || [])[0] || 99),
      complete: (a, b) => GP.completeness(a) - GP.completeness(b)
    };
    return list.sort(by[filt.sort] || by.name);
  }

  GP.views.plants = {
    render() {
      const all = GP.state.plants, list = filtered();
      const opt = (v, label, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
      const head = '<div class="head"><h1>' + L('Rostliny', 'Plants') + ' <span class="muted">(' + all.length + ')</span></h1>' +
        '<div class="row gap"><a class="btn" href="#/import">⬆ ' + L('Import CSV', 'Import CSV') + '</a><button class="btn" data-act="export">⬇ ' + L('Export CSV', 'Export CSV') + '</button>' +
        '<button class="btn primary" data-act="new">+ ' + L('Nová rostlina', 'New plant') + '</button></div></div>';
      if (!all.length) {
        return head + '<div class="empty"><p>' + L('Katalog je prázdný. Importujte svůj seznam z Excelu (uložit jako CSV), nebo přidejte rostlinu ručně. Stačí název – zbytek doplníme postupně.', 'The catalog is empty. Import your list from Excel (save as CSV), or add a plant by hand. A name is enough – the rest can be filled in over time.') + '</p>' +
          '<p><a class="btn primary" href="#/import">⬆ ' + L('Importovat CSV', 'Import CSV') + '</a></p></div>';
      }
      const filters = '<div class="filters"><input type="search" data-f="q" placeholder="' + L('Hledat v názvech (CZ/SK/EN/latinsky)…', 'Search names (CZ/SK/EN/Latin)…') + '" value="' + esc(filt.q) + '">' +
        '<select data-f="type">' + opt('', L('Všechny typy', 'All types'), filt.type) + GP.PLANT_TYPES.map(t => opt(t[0], L(t[1], t[2]), filt.type)).join('') + '</select>' +
        '<select data-f="garden">' + opt('', L('Všechny zahrady', 'All gardens'), filt.garden) + GP.state.gardens.map(g => opt(g.id, g.name, filt.garden)).join('') + '</select>' +
        '<select data-f="missing">' + opt('', L('Vše', 'All'), filt.missing) + opt('_any', L('Nekompletní', 'Incomplete'), filt.missing) +
        GP.PLANT_FIELDS.filter(f => f.core).map(f => opt(f.key, L('Chybí: ', 'Missing: ') + GP.fieldLabel(f), filt.missing)).join('') + '</select>' +
        '<select data-f="sort">' + opt('name', L('Řadit: název', 'Sort: name'), filt.sort) + opt('latin', L('Řadit: latinsky', 'Sort: Latin'), filt.sort) +
        opt('bloom', L('Řadit: doba květu', 'Sort: flowering'), filt.sort) + opt('complete', L('Řadit: vyplněnost', 'Sort: completeness'), filt.sort) + '</select></div>';
      const rows = list.map(p => {
        const pct = GP.completeness(p);
        const n = GP.state.placements.filter(pl => pl.plantId === p.id && pl.status !== 'removed').length;
        return '<tr data-href="#/plant/' + p.id + '"><td class="thumb">' + (p.photo ? '<img src="' + p.photo + '" alt="">' : '') + '</td>' +
          '<td><a href="#/plant/' + p.id + '">' + esc(GP.plantName(p)) + '</a><div class="italic small muted">' + esc(p.name_la) + '</div></td>' +
          '<td class="hide-sm">' + esc(GP.typeLabel(p.type)) + '</td>' +
          '<td>' + GP.ui.swatch(GP.colorHex(p)) + ' ' + esc(GP.formatMonths(p.bloomMonths)) + '</td>' +
          '<td class="hide-sm">' + esc([p.height, p.heightMax ? 'max ' + p.heightMax + ' m' : ''].filter(Boolean).join(' · ')) + '</td>' +
          '<td class="hide-sm">' + esc(p.light || '') + '</td>' +
          '<td class="hide-sm">' + (n || '') + '</td>' +
          '<td>' + GP.ui.bar(pct) + '</td></tr>';
      }).join('');
      return head + filters + '<div class="panel flush"><table class="tbl plants"><thead><tr><th></th><th>' + L('Název', 'Name') + '</th><th class="hide-sm">' + L('Typ', 'Type') + '</th><th>' + L('Kvete', 'Flowers') + '</th><th class="hide-sm">' + L('Výška', 'Height') + '</th><th class="hide-sm">' + L('Světlo', 'Light') + '</th><th class="hide-sm" title="' + L('Počet výsadeb', 'Plantings') + '">🏡</th><th>' + L('Vyplněno', 'Complete') + '</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="8" class="muted">' + L('Nic neodpovídá filtru.', 'Nothing matches the filter.') + '</td></tr>') + '</tbody></table></div>' +
        '<p class="muted small">' + list.length + ' / ' + all.length + '</p>';
    },
    mount(root) {
      const nb = root.querySelector('[data-act=new]');
      nb.onclick = () => { const p = GP.newPlant(); GP.go('plant/' + p.id); };
      const ex = root.querySelector('[data-act=export]');
      if (ex) ex.onclick = () => GP.ui.download('rostliny-' + new Date().toISOString().slice(0, 10) + '.csv', GP.csv.exportPlants(), 'text/csv;charset=utf-8');
      root.querySelectorAll('[data-f]').forEach(el => {
        el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => {
          filt[el.dataset.f] = el.value;
          const pos = el.selectionStart;
          GP.render();
          if (el.tagName === 'INPUT') { const n = document.querySelector('[data-f=q]'); n.focus(); n.setSelectionRange(pos, pos); }
        });
      });
      root.querySelectorAll('tr[data-href]').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a')) location.hash = tr.dataset.href; }));
    }
  };

  // ---------------- plant card ----------------
  GP.views.plant = {
    render([id]) {
      const p = GP.byId('plants', id);
      if (!p) return '<p>' + L('Rostlina nenalezena.', 'Plant not found.') + ' <a href="#/plants">←</a></p>';
      const pct = GP.completeness(p);
      const groups = GP.groups();
      const search = encodeURIComponent((p.name_la || p.name_cs || p.name_en || '').trim());
      const web = search ? '<div class="row gap small web-links">' + L('Hledat na webu:', 'Search the web:') +
        ' <a target="_blank" rel="noopener" href="https://www.google.com/search?q=' + search + '+' + encodeURIComponent(L('pěstování péče', 'care growing')) + '">Google</a>' +
        ' <a target="_blank" rel="noopener" href="https://' + L('cs', 'en') + '.wikipedia.org/w/index.php?search=' + search + '">Wikipedia</a>' +
        ' <a target="_blank" rel="noopener" href="https://www.google.com/search?q=site%3Ahavlis.cz+' + search + '">Havlis</a>' +
        ' <a target="_blank" rel="noopener" href="https://www.rhs.org.uk/search?query=' + search + '">RHS</a></div>' : '';

      const missing = GP.PLANT_FIELDS.filter(f => f.core && !GP.isFilled(p, f)).map(GP.fieldLabel);
      let html = '<div class="head"><h1><a href="#/plants" class="back">←</a> <span id="pname">' + esc(GP.plantName(p)) + '</span></h1>' +
        '<div class="row gap"><span id="pbar">' + GP.ui.bar(pct) + '</span><button class="btn primary" data-act="save">💾 ' + L('Uložit', 'Save') + '</button>' +
        '<button class="btn danger" data-act="del">' + L('Smazat', 'Delete') + '</button></div></div>' +
        '<div class="plant-top"><div class="photo-box">' + (p.photo ? '<img src="' + p.photo + '" alt="">' : '<div class="ph">🌿</div>') +
        '<label class="btn small">📷 ' + (p.photo ? L('Změnit foto', 'Change photo') : L('Přidat foto', 'Add photo')) + '<input type="file" accept="image/*" data-act="photo" hidden></label>' +
        (p.photo ? ' <button class="link small danger" data-act="nophoto">✕</button>' : '') + '</div>' +
        '<div class="grow"><p class="names"><b>CZ</b> ' + esc(p.name_cs || '—') + ' · <b>SK</b> ' + esc(p.name_sk || '—') + ' · <b>EN</b> ' + esc(p.name_en || '—') + ' · <b>LA</b> <i>' + esc(p.name_la || '—') + '</i></p>' +
        (p.warning ? '<div class="alert">⚠ ' + esc(p.warning) + '</div>' : '') +
        (missing.length ? '<p class="small muted">' + L('Chybí doplnit', 'Still missing') + ': ' + esc(missing.join(', ')) + '</p>' : '<p class="small ok-text">✓ ' + L('Hlavní údaje jsou kompletní', 'Main details are complete') + '</p>') +
        web + '</div></div><div id="pform">';
      for (let gi = 0; gi < 3; gi++) {
        html += '<details class="panel group" open><summary><h2>' + esc(groups[gi][0]) + '</h2><span class="muted small">' + esc(groups[gi][1]) + '</span></summary><div class="form">' +
          GP.PLANT_FIELDS.filter(f => f.group === gi).map(f => GP.ui.field(f, p[f.key])).join('') + '</div></details>';
      }
      html += '</div>' + plantingsPanel(p);
      return html;
    },
    mount(root, [id]) {
      const p = GP.byId('plants', id);
      if (!p) return;
      GP.ui.bind(root.querySelector('#pform'), p, key => {
        if (/^name_|^cultivar/.test(key)) root.querySelector('#pname').textContent = GP.plantName(p);
        root.querySelector('#pbar').innerHTML = GP.ui.bar(GP.completeness(p));
      });
      root.querySelector('[data-act=save]').onclick = () => { GP.saveNow(); GP.ui.toast(L('Uloženo ✓', 'Saved ✓')); };
      root.querySelector('[data-act=del]').onclick = () => {
        if (!confirm(L('Smazat rostlinu „' + GP.plantName(p) + '“ z katalogu i ze všech zahrad?', 'Delete "' + GP.plantName(p) + '" from the catalog and all gardens?'))) return;
        GP.state.plants = GP.state.plants.filter(x => x !== p);
        GP.state.placements = GP.state.placements.filter(x => x.plantId !== p.id);
        GP.saveNow(); GP.go('plants');
      };
      root.querySelector('[data-act=photo]').onchange = async e => {
        const f = e.target.files[0];
        if (!f) return;
        p.photo = await GP.ui.readImage(f, 900);
        GP.saveNow(); GP.render();
      };
      const np = root.querySelector('[data-act=nophoto]');
      if (np) np.onclick = () => { delete p.photo; GP.saveNow(); GP.render(); };

      const pp = root.querySelector('#plantings');
      pp.addEventListener('input', e => upd(e));
      pp.addEventListener('change', e => upd(e));
      function upd(e) {
        const tr = e.target.closest('[data-pl]'), k = e.target.dataset.k;
        if (!tr || !k) return;
        GP.byId('placements', tr.dataset.pl)[k] = e.target.value;
        GP.save();
      }
      pp.addEventListener('click', e => {
        const del = e.target.closest('[data-delpl]');
        if (del) {
          if (!confirm(L('Odebrat tuto výsadbu (i z plánu)?', 'Remove this planting (also from the plan)?'))) return;
          GP.state.placements = GP.state.placements.filter(x => x.id !== del.dataset.delpl);
          GP.saveNow(); GP.render();
        }
        if (e.target.closest('[data-act=addpl]')) {
          const gid = pp.querySelector('[data-act=addgarden]').value;
          if (!gid) return;
          GP.state.placements.push({ id: GP.uid(), plantId: p.id, gardenId: gid, cells: [], status: 'planned', position: '', plantedDate: '', count: '', notes: '' });
          GP.saveNow(); GP.render();
        }
      });
    }
  };

  function plantingsPanel(p) {
    const pls = GP.state.placements.filter(x => x.plantId === p.id);
    const gs = GP.state.gardens;
    return '<div class="panel" id="plantings"><h2>🏡 ' + L('V mých zahradách', 'In my gardens') + '</h2>' +
      (pls.length ? '<table class="tbl"><thead><tr><th>' + L('Zahrada', 'Garden') + '</th><th>' + L('Umístění', 'Position') + '</th><th>' + L('Stav', 'Status') + '</th><th>' + L('Vysazeno dne', 'Planted on') + '</th><th>' + L('Ks', 'Qty') + '</th><th>' + L('Poznámka', 'Note') + '</th><th></th></tr></thead><tbody>' +
        pls.map(pl => {
          const g = GP.byId('gardens', pl.gardenId);
          const issues = g ? [...new Set((pl.cells && pl.cells.length ? pl.cells : [null]).flatMap(k => GP.plantIssues(p, g, k)))] : [];
          return '<tr data-pl="' + pl.id + '"><td>' + (g ? '<a href="#/garden/' + g.id + '/plan">' + esc(g.name) + '</a>' : '?') +
            '<div class="small muted">' + (pl.cells && pl.cells.length ? pl.cells.slice(0, 5).map(GP.cellName).join(', ') + (pl.cells.length > 5 ? '…' : '') : L('není na plánu', 'not on plan')) + '</div>' +
            (issues.length ? '<div class="small warn-text">' + issues.map(esc).join('<br>') + '</div>' : '') + '</td>' +
            '<td><input type="text" data-k="position" value="' + esc(pl.position) + '"></td>' +
            '<td><select data-k="status">' + GP.STATUSES.map(s => '<option value="' + s[0] + '"' + (pl.status === s[0] ? ' selected' : '') + '>' + esc(L(s[1], s[2])) + '</option>').join('') + '</select></td>' +
            '<td><input type="date" data-k="plantedDate" value="' + esc(pl.plantedDate) + '"></td>' +
            '<td><input type="text" class="num" data-k="count" value="' + esc(pl.count) + '"></td>' +
            '<td><input type="text" data-k="notes" value="' + esc(pl.notes) + '"></td>' +
            '<td><button class="link danger" data-delpl="' + pl.id + '">✕</button></td></tr>';
        }).join('') + '</tbody></table>' : '<p class="muted">' + L('Rostlina zatím není v žádné zahradě.', 'This plant is not in any garden yet.') + '</p>') +
      (gs.length ? '<div class="row gap"><select data-act="addgarden">' + gs.map(g => '<option value="' + g.id + '">' + esc(g.name) + '</option>').join('') + '</select>' +
        '<button class="btn" data-act="addpl">+ ' + L('Přidat do zahrady', 'Add to garden') + '</button></div>' : '') + '</div>';
  }
})(window.GP);
