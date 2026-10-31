// Plant catalog (shared by all gardens) and the plant card: 0 basics, 1 before planting, 2 care, plus plantings.
(function (GP) {
  const L = GP.L, esc = GP.esc;
  const filt = GP.plantFilter = { q: '', type: '', missing: '', garden: '', sort: 'name' };

  GP.newPlant = function (data) {
    const p = Object.assign({ id: GP.uid(), created: new Date().toISOString().slice(0, 10), v: GP.PLANT_VERSION }, data || {});
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
      if (filt.missing === '_unsure' && !p.unsure) return false;
      if (filt.missing && filt.missing[0] !== '_' &&GP.isFilled(p, GP.PLANT_FIELDS.find(f => f.key === filt.missing))) return false;
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

  // One small bar per section of the plant card (basics, looks, planting, care); hover tells what is missing.
  const SECTIONS = () => [L('Základ', 'Basics'), L('Vzhled', 'Looks'), L('Výsadba', 'Planting'), L('Péče', 'Care')];
  function sectionBars(p) {
    const names = SECTIONS();
    return '<span class="sec-bars">' + GP.groupCompleteness(p).map((s, i) => {
      if (s.pct === null) return '<span class="sb unknown" title="' + esc(names[i] + ': ' + L('nejdřív zaškrtněte „Vyžaduje údržbu“ ve Výsadbě', 'first tick "Needs maintenance" under Planting')) + '"></span>';
      const color = s.pct === 100 ? 'var(--ok)' : s.pct >= 50 ? 'var(--warn)' : 'var(--bad)';
      const title = names[i] + ': ' + s.pct + ' %' + (s.missing.length ? ' · ' + L('chybí', 'missing') + ': ' + s.missing.join(', ') : ' ✓');
      return '<span class="sb' + (s.pct === 100 ? ' full' : '') + '" title="' + esc(title) + '"><i style="width:' + Math.max(s.pct, 0) + '%;background:' + color + '"></i></span>';
    }).join('') + '</span>';
  }

  GP.views.plants = {
    render() {
      const all = GP.state.plants, list = filtered();
      const opt = (v, label, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
      const head = '<div class="head"><h1>' + L('Rostliny', 'Plants') + ' <span class="muted">(' + all.length + ')</span></h1>' +
        '<div class="row gap">' + (all.length ? '<button class="btn" data-act="bulk" title="' + L('Pro rostliny ve výběru bez latinského názvu nebo bez fotky', 'For plants in the list without a Latin name or photo') + '">🔎 ' + L('Doplnit z databází', 'Fill from databases') + '</button>' : '') +
        (all.some(p => p.cultivar) ? '<button class="btn" data-act="cvphotos" title="' + L('Fotky přímo dané odrůdy z Wikimedia Commons', 'Photos of the exact cultivar from Wikimedia Commons') + '">🖼 ' + L('Fotky odrůd', 'Cultivar photos') + '</button>' : '') +
        '<a class="btn" href="#/import">⬆ ' + L('Import CSV', 'Import CSV') + '</a><button class="btn" data-act="export">⬇ ' + L('Export CSV', 'Export CSV') + '</button>' +
        '<button class="btn primary" data-act="new">+ ' + L('Nová rostlina', 'New plant') + '</button></div></div>';
      if (!all.length) {
        return head + '<div class="empty"><p>' + L('Katalog je prázdný. Importujte svůj seznam z Excelu (uložit jako CSV), nebo přidejte rostlinu ručně. Stačí název – zbytek doplníme postupně.', 'The catalog is empty. Import your list from Excel (save as CSV), or add a plant by hand. A name is enough – the rest can be filled in over time.') + '</p>' +
          '<p><a class="btn primary" href="#/import">⬆ ' + L('Importovat CSV', 'Import CSV') + '</a></p></div>';
      }
      const filters = '<div class="filters"><input type="search" data-f="q" placeholder="' + L('Hledat v názvech (CZ/SK/EN/latinsky)…', 'Search names (CZ/SK/EN/Latin)…') + '" value="' + esc(filt.q) + '">' +
        '<select data-f="type">' + opt('', L('Všechny typy', 'All types'), filt.type) + GP.PLANT_TYPES.map(t => opt(t[0], L(t[1], t[2]), filt.type)).join('') + '</select>' +
        '<select data-f="garden">' + opt('', L('Všechny zahrady', 'All gardens'), filt.garden) + GP.state.gardens.map(g => opt(g.id, g.name, filt.garden)).join('') + '</select>' +
        '<select data-f="missing">' + opt('', L('Vše', 'All'), filt.missing) + opt('_any', L('Nekompletní', 'Incomplete'), filt.missing) +
        opt('_unsure', L('Neurčené (?)', 'Unidentified (?)') + ' · ' + all.filter(p => p.unsure).length, filt.missing) +
        GP.PLANT_FIELDS.filter(f => f.core).map(f => opt(f.key, L('Chybí: ', 'Missing: ') + GP.fieldLabel(f), filt.missing)).join('') + '</select>' +
        '<select data-f="sort">' + opt('name', L('Řadit: název', 'Sort: name'), filt.sort) + opt('latin', L('Řadit: latinsky', 'Sort: Latin'), filt.sort) +
        opt('bloom', L('Řadit: doba květu', 'Sort: flowering'), filt.sort) + opt('complete', L('Řadit: vyplněnost', 'Sort: completeness'), filt.sort) + '</select></div>';
      // gardens the plant grows in, with the number of pieces ("Zahrada (3 ks)")
      const gardensOf = p => {
        const by = new Map();
        for (const pl of GP.state.placements) {
          if (pl.plantId !== p.id || pl.status === 'removed') continue;
          by.set(pl.gardenId, (by.get(pl.gardenId) || 0) + (+pl.count || 1));
        }
        return [...by].map(([gid, n]) => { const g = GP.byId('gardens', gid); return g ? esc(g.name) + (n > 1 ? ' <span class="muted">(' + n + ' ' + L('ks', 'pcs') + ')</span>' : '') : ''; }).filter(Boolean).join(', ');
      };
      const rows = list.map(p => '<tr data-href="#/plant/' + p.id + '"><td class="thumb">' + (p.photo ? '<img src="' + p.photo + '" alt="">' : '') + '</td>' +
          '<td><a href="#/plant/' + p.id + '">' + esc(GP.plantName(p)) + '</a><div class="italic small muted">' + esc(p.name_la) + '</div></td>' +
          '<td class="hide-sm">' + esc(GP.typeLabel(p.type)) + '</td>' +
          '<td class="hide-sm small">' + gardensOf(p) + '</td>' +
          '<td>' + sectionBars(p) + '</td></tr>').join('');
      return head + filters + '<div class="panel flush"><table class="tbl plants"><thead><tr><th></th><th>' + L('Název', 'Name') + '</th><th class="hide-sm">' + L('Typ', 'Type') + '</th><th class="hide-sm">' + L('Zahrada', 'Garden') + '</th><th title="' + L('Vyplněnost sekcí karty', 'How complete each section of the card is') + '"><span class="sec-head">' + SECTIONS().map(s => '<span>' + esc(s) + '</span>').join('') + '</span></th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="5" class="muted">' + L('Nic neodpovídá filtru.', 'Nothing matches the filter.') + '</td></tr>') + '</tbody></table></div>' +
        '<p class="muted small">' + list.length + ' / ' + all.length + '</p>';
    },
    mount(root) {
      const nb = root.querySelector('[data-act=new]');
      nb.onclick = () => { const p = GP.newPlant(); GP.go('plant/' + p.id); };
      const bulk = root.querySelector('[data-act=bulk]');
      if (bulk) bulk.onclick = () => {
        // plants still missing the Latin name or a photo
        const todo = filtered().filter(p => !p.name_la || !p.photo);
        if (!todo.length) return GP.ui.toast(L('Všechny rostliny ve výběru už mají latinský název i fotku – další údaje doplňte na kartě.', 'All plants in the list already have a Latin name and a photo – use the plant card.'));
        GP.lookup.bulk(todo, () => GP.render());
      };
      const cph = root.querySelector('[data-act=cvphotos]');
      if (cph) cph.onclick = () => {
        // cultivars without a photo or with a general one downloaded from Wikimedia (own photos are left alone)
        const todo = filtered().filter(p => p.cultivar && (!p.photo || /^Wikimedia/.test(p.photoCredit || '')));
        if (!todo.length) return GP.ui.toast(L('Ve výběru nejsou odrůdy bez vlastní fotky.', 'No cultivars without an own photo in the list.'));
        GP.lookup.bulkPhotos(todo, () => GP.render());
      };
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

      // Unidentified plant: identification help instead of species care data.
      const unsure = '<div class="unsure-box' + (p.unsure ? ' on' : '') + '"><label><input type="checkbox" data-act="unsure"' + (p.unsure ? ' checked' : '') + '> ' +
        L('Přesný druh neznám (neurčená rostlina „?“)', 'Exact species unknown (unidentified plant "?")') + '</label>' +
        (p.unsure ? '<p class="small">' + L('Údaje o péči z webu zatím nejde dohledat. Vyfoťte list, květ a celou rostlinu a zkuste ji určit:', 'Care data cannot be looked up yet. Photograph a leaf, the flower and the whole plant and try to identify it:') +
          ' <a target="_blank" rel="noopener" href="https://identify.plantnet.org/">Pl@ntNet</a> · <a target="_blank" rel="noopener" href="https://lens.google.com/">Google Lens</a>. ' +
          L('Až druh zjistíte, doplňte latinský název a zrušte zaškrtnutí.', 'Once you know the species, fill in the Latin name and untick this.') + '</p>' +
          '<label class="field wide"><span class="lbl">' + L('Co o ní víme (vzhled, výška, kdy kvete, odkud je)', 'What we know (looks, height, flowering, where from)') + '</span>' +
          '<textarea data-k="idNote" rows="2">' + esc(p.idNote || '') + '</textarea></label>' : '') + '</div>';
      const missing = GP.coreFields(p).filter(f => !GP.isFilled(p, f)).map(GP.fieldLabel);
      // Lines in the notes starting with "!!!" are shown as a warning at the top.
      const important = (p.notes || '').split('\n').filter(x => /^\s*!!!/.test(x)).map(x => x.replace(/^\s*!!!\s*/, ''));
      let html = '<div class="head"><h1><a href="#/plants" class="back">←</a> <span id="pname">' + esc(GP.plantName(p)) + '</span></h1>' +
        '<div class="row gap"><span id="pbar">' + GP.ui.bar(pct) + '</span><button class="btn" data-act="lookup">🔎 ' + L('Doplnit z databází', 'Fill from databases') + '</button>' +
        '<button class="btn primary" data-act="save">💾 ' + L('Uložit', 'Save') + '</button>' +
        '<button class="btn danger" data-act="del">' + L('Smazat', 'Delete') + '</button></div></div>' +
        '<div class="plant-top"><div class="photo-box">' + (p.photo ? '<img src="' + p.photo + '" alt="">' : '<div class="ph">🌿</div>') +
        '<label class="btn small">📷 ' + (p.photo ? L('Změnit foto', 'Change photo') : L('Přidat foto', 'Add photo')) + '<input type="file" accept="image/*" data-act="photo" hidden></label>' +
        (p.photo ? ' <button class="link small danger" data-act="nophoto">✕</button>' : '') +
        '<button class="link small" data-act="pickphoto">🖼 ' + L('Vybrat z Wikimedia', 'Pick from Wikimedia') + '</button>' +
        (p.photo && p.photoCredit ? '<div class="credit">' + (p.photoPage ? '<a target="_blank" rel="noopener" href="' + esc(p.photoPage) + '">' + esc(p.photoCredit) + '</a>' : esc(p.photoCredit)) + '</div>' : '') + '</div>' +
        '<div class="grow"><p class="names"><b>CZ</b> ' + esc(p.name_cs || '—') + ' · <b>SK</b> ' + esc(p.name_sk || '—') + ' · <b>EN</b> ' + esc(p.name_en || '—') + ' · <b>LA</b> <i>' + esc(p.name_la || '—') + '</i></p>' +
        important.map(x => '<div class="alert">⚠ ' + esc(x) + '</div>').join('') +
        (missing.length ? '<p class="small muted">' + L('Chybí doplnit', 'Still missing') + ': ' + esc(missing.join(', ')) + '</p>' : '<p class="small ok-text">✓ ' + L('Hlavní údaje jsou kompletní', 'Main details are complete') + '</p>') +
        (p.unsure ? '' : web) + unsure + '</div></div><div id="pform">';
      groups.forEach((g, gi) => {
        html += '<details class="panel group" open><summary><h2>' + esc(g[0]) + '</h2><span class="muted small">' + esc(g[1]) + '</span></summary>' +
          (gi === 3 ? '<div id="careform">' + careHtml(p) + '</div>' : groupHtml(p, gi)) + '</details>';
      });
      html += '</div>' + plantingsPanel(p);
      return html;
    },
    mount(root, [id]) {
      const p = GP.byId('plants', id);
      if (!p) return;
      const form = root.querySelector('#pform');
      const careRedraw = () => { form.querySelector('#careform').innerHTML = careHtml(p); };
      GP.ui.bind(form, p, key => {
        if (/^name_|^cultivar/.test(key)) root.querySelector('#pname').textContent = GP.plantName(p);
        // frost hardiness °C <-> USDA zone, whichever was typed last
        if (key === 'hardiness') {
          const c = parseFloat(String(p.hardiness).replace(/[−–]/g, '-').replace(',', '.'));
          if (!isNaN(c)) { p.usda = GP.usdaFromC(c); form.querySelector('[data-k=usda]').value = p.usda; }
        }
        if (key === 'usda' && p.usda) { p.hardiness = String(GP.usdaToC(p.usda)); form.querySelector('[data-k=hardiness]').value = p.hardiness; }
        if (key === 'maintenance') careRedraw();
        // a crop makes the plant useful (ornamental -> both)
        if (key === 'crop' && p.crop && p.purpose !== 'useful' && p.purpose !== 'both') p.purpose = p.purpose === 'ornamental' ? 'both' : 'useful';
        // fields shown only for some choices (crop, sowing, toxic for…) -> redraw the card where it was
        if (['type', 'purpose', 'crop', 'sowOutside', 'toxicParts'].includes(key)) { const y = scrollY; GP.render(); scrollTo(0, y); return; }
        root.querySelector('#pbar').innerHTML = GP.ui.bar(GP.completeness(p));
      });
      form.addEventListener('click', e => {
        const add = e.target.closest('[data-addterm]'), del = e.target.closest('[data-delterm]');
        if (!add && !del) return;
        const key = (add || del).dataset[add ? 'addterm' : 'delterm'];
        const terms = GP.careTerms(p, key).slice();
        if (add) { if (!terms.length) terms.push({}); terms.push({}); } else terms.splice(+del.dataset.i, 1);
        p[key] = terms;
        GP.save(); careRedraw();
      });
      root.querySelector('[data-act=unsure]').onchange = e => {
        if (e.target.checked) p.unsure = true; else delete p.unsure;
        GP.saveNow(); GP.render();
      };
      const idn = root.querySelector('[data-k=idNote]');
      if (idn) idn.oninput = () => { p.idNote = idn.value; GP.save(); };
      root.querySelector('[data-act=pickphoto]').onclick = () => GP.lookup.photoDialog(p, () => { GP.render(); GP.ui.toast(L('Fotka změněna ✓', 'Photo changed ✓')); });
      root.querySelector('[data-act=lookup]').onclick = () => GP.lookup.dialog(p, () => { GP.render(); GP.ui.toast(L('Doplněno ✓', 'Filled in ✓')); });
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
        p.photo = await GP.ui.readImage(f, 600);
        delete p.photoCredit; delete p.photoPage;
        GP.saveNow(); GP.render();
      };
      const np = root.querySelector('[data-act=nophoto]');
      if (np) np.onclick = () => { delete p.photo; delete p.photoCredit; delete p.photoPage; GP.saveNow(); GP.render(); };

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

  // Fields of one section; sub-headings between blocks, the "side" fields in a block on the right.
  // Fields with `box` (soil, frost) that follow each other become small boxes side by side.
  function fieldsHtml(p, list) {
    let prev = '', out = '', boxes = null;
    const flush = () => {
      if (!boxes) return;
      out += '<div class="boxes">' + Object.entries(boxes).map(([b, html]) => '<div class="fbox"><div class="fbox-t">' + esc(GP.subLabel(b)) + '</div>' + html + '</div>').join('') + '</div>';
      boxes = null;
    };
    for (const f of list) {
      if (f.show && !f.show(p)) continue;
      if (f.sub && f.sub !== prev) { flush(); out += '<h3 class="sub">' + esc(GP.subLabel(f.sub)) + '</h3>'; prev = f.sub; }
      if (f.box) { boxes = boxes || {}; boxes[f.box] = (boxes[f.box] || '') + GP.ui.field(f, p[f.key]); continue; }
      flush();
      out += GP.ui.field(f, p[f.key]);
    }
    flush();
    return out;
  }
  function groupHtml(p, gi) {
    const fs = GP.PLANT_FIELDS.filter(f => f.group === gi), main = fs.filter(f => !f.side), side = fs.filter(f => f.side);
    return '<div class="pgroup' + (side.length ? ' has-side' : '') + '"><div class="form' + (gi === 0 ? ' two' : '') + '">' + fieldsHtml(p, main) + '</div>' +
      (side.length ? '<div class="form one sidebox">' + fieldsHtml(p, side) + '</div>' : '') + '</div>';
  }
  // Care: items ticked under "Needs maintenance" are open and marked, the others stay folded unless they hold data.
  function careHtml(p) {
    const maint = p.maintenance || [];
    return GP.PLANT_FIELDS.filter(f => f.group === 3).map(f => {
      if (f.type !== 'care') return '<div class="form">' + GP.ui.field(f, p[f.key]) + '</div>';
      const expected = GP.careExpected(p, f), filled = GP.isFilled(p, f);
      const open = !f.maint || expected || filled || !maint.length;
      return '<details class="care-item' + (expected ? ' expected' : '') + '"' + (open ? ' open' : '') + '><summary><b>' + f.icon + ' ' + esc(GP.fieldLabel(f)) + '</b>' +
        (expected && !filled ? ' <span class="tag todo">' + L('k vyplnění', 'to fill in') + '</span>' : '') +
        (!open ? ' <span class="muted small">' + L('není zaškrtnuto v údržbě', 'not ticked under maintenance') + '</span>' : '') + '</summary>' +
        GP.ui.field(f, p[f.key]) + '</details>';
    }).join('');
  }

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
