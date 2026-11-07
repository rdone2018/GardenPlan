// Plant catalog (shared by all gardens) and the plant card: 0 basics, 1 before planting, 2 care, plus plantings.
(function (GP) {
  const L = GP.L, esc = GP.esc;
  const FILTERS = ['q', 'type', 'purpose', 'crop', 'color', 'bloomIn', 'harvestIn', 'garden', 'missing'];
  const picked = new Set(); // plants ticked in the catalog (for this session), e.g. to add them to a garden at once
  const filt = GP.plantFilter = { q: '', type: '', purpose: '', crop: '', color: '', bloomIn: '', harvestIn: '', missing: '', garden: '', sort: 'name' };

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
      // "useful and ornamental" plants show under both "useful" and "ornamental"
      if (filt.purpose === '_none' ? p.purpose : filt.purpose && p.purpose !== filt.purpose && p.purpose !== 'both') return false;
      if (filt.crop && (p.crop || '') !== (filt.crop === '_none' ? '' : filt.crop)) return false;
      if (filt.color && !(p.flowerColors || []).includes(filt.color)) return false;
      if (filt.bloomIn && !(p.bloomMonths || []).includes(+filt.bloomIn)) return false;
      if (filt.harvestIn && !(p.harvestMonths || []).includes(+filt.harvestIn)) return false;
      if (filt.missing === '_any' && GP.completeness(p) === 100) return false;
      if (filt.missing === '_unsure' && !p.unsure) return false;
      if (filt.missing && filt.missing[0] !== '_' &&GP.isFilled(p, GP.PLANT_FIELDS.find(f => f.key === filt.missing))) return false;
      if (filt.garden) {
        // '_none' = plants not in any garden yet
        const inG = GP.state.placements.some(pl => pl.plantId === p.id && pl.status !== 'removed' && (filt.garden === '_none' || pl.gardenId === filt.garden));
        if (inG === (filt.garden === '_none')) return false;
      }
      return true;
    });
    const name = (a, b) => GP.plantName(a).localeCompare(GP.plantName(b), 'cs');
    // order of a choice list (strom, keř, …), plants without a value last, then by name
    const inOrder = (key, list) => (a, b) => {
      const ix = p => { const i = list.findIndex(o => o[0] === p[key]); return i < 0 ? 99 : i; };
      return ix(a) - ix(b) || name(a, b);
    };
    const by = {
      name,
      latin: (a, b) => (a.name_la || '~').localeCompare(b.name_la || '~'),
      type: inOrder('type', GP.PLANT_TYPES),
      purpose: inOrder('purpose', GP.PLANT_OPTS.purpose),
      crop: inOrder('crop', GP.PLANT_OPTS.crop),
      bloom: (a, b) => Math.min(99, ...(a.bloomMonths || [])) - Math.min(99, ...(b.bloomMonths || [])) || name(a, b),
      harvest: (a, b) => Math.min(99, ...(a.harvestMonths || [])) - Math.min(99, ...(b.harvestMonths || [])) || name(a, b),
      complete: (a, b) => GP.completeness(a) - GP.completeness(b) || name(a, b)
    };
    return list.sort(by[filt.sort] || by.name);
  }

  const SORTS = () => [['name', L('název', 'name')], ['latin', L('latinsky', 'Latin')], ['type', L('typ', 'type')], ['purpose', L('funkce', 'purpose')],
    ['crop', L('užitek', 'crop')], ['bloom', L('doba květu', 'flowering')], ['harvest', L('doba zrání', 'ripening')], ['complete', L('vyplněnost', 'completeness')]];
  // a column header that sorts the list when clicked
  const sortTh = (key, label, cls) => '<th class="th-sort' + (filt.sort === key ? ' on' : '') + (cls ? ' ' + cls : '') + '" data-sort="' + key + '" title="' + L('Kliknutím seřadit', 'Click to sort') + '">' +
    label + (filt.sort === key && key !== 'complete' ? ' ▲' : '') + '</th>';

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

  // Plant card: fields that count as missing get a light red background, and each section heading says how many
  // are missing there, so the gaps are easy to find on a long card. Called again after every edit.
  function markMissing(root, p) {
    const form = root.querySelector('#pform');
    if (!form) return;
    form.querySelectorAll('.missing').forEach(el => el.classList.remove('missing'));
    form.querySelectorAll('.miss-n').forEach(el => el.remove());
    const sections = form.querySelectorAll('details.group');
    const count = new Map();
    for (const f of GP.countedFields(p)) {
      if (GP.isFilled(p, f)) continue;
      const el = form.querySelector('[data-care="' + f.key + '"], [data-multi="' + f.key + '"], [data-months="' + f.key + '"], [data-k="' + f.key + '"]');
      const box = el && (el.closest('details.care-item') || el.closest('.field'));
      if (!box) continue;
      box.classList.add('missing');
      const sec = box.closest('details.group');
      count.set(sec, (count.get(sec) || 0) + 1);
    }
    sections.forEach(sec => {
      const n = count.get(sec);
      if (n) sec.querySelector('summary').insertAdjacentHTML('beforeend', '<span class="miss-n">' + L('chybí ', 'missing ') + n + '</span>');
    });
  }

  // Twelve small cells, one per month (I–XII), the given months filled in – shows at a glance when a plant flowers or ripens.
  const BLOOM = '#d36f9a', HARVEST = '#c2552d';
  function monthStrip(months, color, title) {
    const set = new Set(months || []);
    if (!set.size) return '';
    return '<span class="mstrip" title="' + esc(title + ': ' + GP.formatMonths(months)) + '">' +
      [...Array(12)].map((_, i) => '<i' + (set.has(i + 1) ? ' class="on" style="background:' + color + '"' : '') + '></i>').join('') + '</span>';
  }
  // Same strip for the whole list: the stronger the colour, the more plants in that month; empty months are gaps.
  function coverageStrip(list, key, color, verb) {
    const n = [...Array(12)].map((_, i) => list.filter(p => (p[key] || []).includes(i + 1)).length), max = Math.max(1, ...n);
    return '<span class="mstrip cover">' + n.map((c, i) => '<i title="' + esc(GP.monthName(i + 1) + ': ' + verb + ' ' + c) + '"' +
      (c ? ' class="on" style="background:' + color + ';opacity:' + (0.25 + 0.75 * c / max).toFixed(2) + '"' : '') + '></i>').join('') + '</span>';
  }

  // Adds the ticked plants to a garden in one go (no place on the plan yet – that is done later on the plan).
  function addToGardenDialog(plants) {
    const gardens = GP.state.gardens;
    if (!gardens.length) return GP.ui.toast(L('Nejdřív založte zahradu (Zahrady → Nová zahrada).', 'Create a garden first (Gardens → New garden).'));
    const box = document.createElement('div');
    box.className = 'modal';
    box.innerHTML = '<div class="modal-box"><div class="row gap"><b class="grow">🏡 ' + L('Přidat do zahrady', 'Add to garden') + ' – ' + plants.length + ' ' + L('rostlin', 'plants') + '</b><button class="link" data-x>✕</button></div>' +
      '<div class="form">' +
      '<label class="field"><span class="lbl">' + L('Zahrada', 'Garden') + '</span><select data-g>' + gardens.map(g => '<option value="' + g.id + '">' + esc(g.name) + '</option>').join('') + '</select></label>' +
      '<label class="field"><span class="lbl">' + L('Stav', 'Status') + '</span><select data-s>' + GP.STATUSES.filter(s => s[0] !== 'removed').map(s => '<option value="' + s[0] + '"' + (s[0] === 'planted' ? ' selected' : '') + '>' + esc(L(s[1], s[2])) + '</option>').join('') + '</select></label>' +
      '<label class="field"><span class="lbl">' + L('Vysazeno v měsíci', 'Planted in') + '</span>' + GP.ui.monthYear('data-d', '') + '</label></div>' +
      '<p class="small muted">' + L('Měsíc je nepovinný a dá se později upravit v zahradě (záložka Rostliny), i každé rostlině zvlášť. Rostliny, které už v zahradě jsou, se přeskočí. Místo na plánu zahrady jim určíte později.',
        'The month is optional and can be changed later in the garden (Plants tab), for each plant separately too. Plants already in the garden are skipped. Their place on the garden plan is set later.') + '</p>' +
      '<div class="row gap"><button class="btn primary" data-ok>' + L('Přidat', 'Add') + '</button><button class="btn" data-x>' + L('Zrušit', 'Cancel') + '</button></div></div>';
    document.body.appendChild(box);
    const close = () => box.remove();
    box.querySelectorAll('[data-x]').forEach(b => b.onclick = close);
    box.addEventListener('click', e => { if (e.target === box) close(); });
    box.querySelector('[data-ok]').onclick = () => {
      const gid = box.querySelector('[data-g]').value, status = box.querySelector('[data-s]').value, date = box.querySelector('[data-d]').value;
      let added = 0, skipped = 0;
      for (const p of plants) {
        if (GP.state.placements.some(x => x.plantId === p.id && x.gardenId === gid && x.status !== 'removed')) { skipped++; continue; }
        GP.state.placements.push({ id: GP.uid(), plantId: p.id, gardenId: gid, cells: [], status, position: '', plantedDate: date, count: '', notes: '' });
        added++;
      }
      picked.clear();
      GP.saveNow();
      close();
      GP.ui.toast(L('Přidáno do zahrady: ', 'Added to the garden: ') + added + (skipped ? ' · ' + L('už tam bylo: ', 'already there: ') + skipped : ''));
      GP.render();
    };
  }

  // Flower colours as coloured labels ("bílá", "růžová"); dark text on light colours, white on dark ones.
  function colorPills(p) {
    const opts = GP.PLANT_OPTS.flowerColors;
    return '<span class="cpills">' + (p.flowerColors || []).map(k => {
      const hex = GP.optHex(opts, k) || '#ccc';
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      const light = 0.299 * r + 0.587 * g + 0.114 * b > 150;
      return '<span class="cpill" style="background:' + hex + ';color:' + (light ? '#2b2b26' : '#fff') + '">' + esc(GP.optLabel(opts, k).split(' / ')[0]) + '</span>';
    }).join('') + '</span>';
  }

  GP.views.plants = {
    render() {
      const all = GP.state.plants, list = filtered();
      const opt = (v, label, cur) => '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
      const head = '<div class="head"><h1>' + L('Rostliny', 'Plants') + ' <span class="muted">(' + all.length + ')</span></h1>' +
        '<div class="row gap">' + (all.length ? '<button class="btn" data-act="bulk" title="' + L('Pro rostliny ve výběru bez latinského názvu nebo bez fotky', 'For plants in the list without a Latin name or photo') + '">🔎 ' + L('Doplnit z databází', 'Fill from databases') + '</button>' : '') +
        (all.some(p => p.cultivar) ? '<button class="btn" data-act="cvphotos" title="' + L('Fotky přímo dané odrůdy z Wikimedia Commons', 'Photos of the exact cultivar from Wikimedia Commons') + '">🖼 ' + L('Fotky odrůd', 'Cultivar photos') + '</button>' : '') +
        (all.length ? '<a class="btn" href="#/caretexts" title="' + L('Najít skoro stejné texty péče a sjednotit je', 'Find almost identical care texts and unify them') + '">✏️ ' + L('Texty péče', 'Care texts') + '</a>' : '') +
        '<a class="btn" href="#/import">⬆ ' + L('Import CSV', 'Import CSV') + '</a><button class="btn" data-act="export">⬇ ' + L('Export CSV', 'Export CSV') + '</button>' +
        '<button class="btn primary" data-act="new">+ ' + L('Nová rostlina', 'New plant') + '</button></div></div>';
      if (!all.length) {
        return head + '<div class="empty"><p>' + L('Katalog je prázdný. Importujte svůj seznam z Excelu (uložit jako CSV), nebo přidejte rostlinu ručně. Stačí název – zbytek doplníme postupně.', 'The catalog is empty. Import your list from Excel (save as CSV), or add a plant by hand. A name is enough – the rest can be filled in over time.') + '</p>' +
          '<p><a class="btn primary" href="#/import">⬆ ' + L('Importovat CSV', 'Import CSV') + '</a></p></div>';
      }
      // filters sit in the table header, each one above the column it filters
      const sel = (f, html) => '<select data-f="' + f + '"' + (filt[f] ? ' class="on"' : '') + '>' + html + '</select>';
      const filterRow = '<tr class="filter-row"><th class="pick"></th><th></th>' +
        '<th><input type="search" data-f="q" placeholder="' + L('Hledat v názvech…', 'Search names…') + '" title="' + L('Česky, slovensky, anglicky i latinsky', 'Czech, Slovak, English or Latin') + '" value="' + esc(filt.q) + '"></th>' +
        '<th class="hide-sm">' + sel('type', opt('', L('Vše', 'All'), filt.type) + GP.PLANT_TYPES.map(t => opt(t[0], L(t[1], t[2]), filt.type)).join('')) + '</th>' +
        '<th class="hide-sm">' + sel('purpose', opt('', L('Vše', 'All'), filt.purpose) + GP.PLANT_OPTS.purpose.map(o => opt(o[0], L(o[1], o[2]), filt.purpose)).join('') + opt('_none', L('nevyplněno', 'not set'), filt.purpose)) + '</th>' +
        '<th class="hide-sm">' + sel('crop', opt('', L('Vše', 'All'), filt.crop) + GP.PLANT_OPTS.crop.map(o => opt(o[0], L(o[1], o[2]), filt.crop)).join('') + opt('_none', L('bez užitku', 'none'), filt.crop)) + '</th>' +
        '<th>' + sel('color', opt('', L('Vše', 'All'), filt.color) + GP.PLANT_OPTS.flowerColors.map(o => opt(o[0], L(o[1], o[2]), filt.color)).join('')) + '</th>' +
        ['bloomIn', 'harvestIn'].map(f => '<th class="hide-sm">' + sel(f, opt('', L('Vše', 'All'), filt[f]) + [...Array(12)].map((_, i) => opt(String(i + 1), GP.monthName(i + 1), filt[f])).join('')) + '</th>').join('') +
        '<th class="hide-sm">' + sel('garden', opt('', L('Vše', 'All'), filt.garden) + opt('_none', L('V žádné zahradě', 'In no garden'), filt.garden) + GP.state.gardens.map(g => opt(g.id, g.name, filt.garden)).join('')) + '</th>' +
        '<th>' + sel('missing', opt('', L('Vše', 'All'), filt.missing) + opt('_any', L('Nekompletní', 'Incomplete'), filt.missing) +
          opt('_unsure', L('Neurčené (?)', 'Unidentified (?)') + ' · ' + all.filter(p => p.unsure).length, filt.missing) +
          GP.PLANT_FIELDS.filter(f => f.core).map(f => opt(f.key, L('Chybí: ', 'Missing: ') + GP.fieldLabel(f), filt.missing)).join('')) + '</th></tr>';
      const anyFilter = FILTERS.some(k => filt[k]);
      for (const id of picked) if (!GP.byId('plants', id)) picked.delete(id);
      const filters = '<div class="row gap list-tools"><label class="small muted">' + L('Řadit:', 'Sort:') + ' <select data-f="sort">' + SORTS().map(([k, label]) => opt(k, label, filt.sort)).join('') + '</select></label>' +
        (picked.size ? '<span class="pick-bar"><b>' + L('Vybráno: ', 'Selected: ') + picked.size + '</b> <button class="btn primary small" data-act="togarden">🏡 ' + L('Přidat do zahrady', 'Add to garden') + '</button>' +
          ' <button class="link small" data-act="nopick">✕ ' + L('Zrušit výběr', 'Clear selection') + '</button></span>' : '<span class="small muted">' + L('Zaškrtnutím vyberete rostliny, např. k přidání do zahrady.', 'Tick plants to select them, e.g. to add them to a garden.') + '</span>') +
        (anyFilter ? '<button class="link small" data-act="nofilter">✕ ' + L('Zrušit filtry', 'Clear filters') + '</button>' : '') + '</div>';
      const allPicked = list.length && list.every(p => picked.has(p.id)), somePicked = list.some(p => picked.has(p.id));
      // gardens the plant grows in, with the number of pieces ("Zahrada (3 ks)")
      const gardensOf = p => {
        const by = new Map();
        for (const pl of GP.state.placements) {
          if (pl.plantId !== p.id || pl.status === 'removed') continue;
          by.set(pl.gardenId, (by.get(pl.gardenId) || 0) + (+pl.count || 1));
        }
        return [...by].map(([gid, n]) => { const g = GP.byId('gardens', gid); return g ? esc(g.name) + (n > 1 ? ' <span class="muted">(' + n + ' ' + L('ks', 'pcs') + ')</span>' : '') : ''; }).filter(Boolean).join(', ');
      };
      const rows = list.map(p => '<tr data-href="#/plant/' + p.id + '"' + (picked.has(p.id) ? ' class="row-picked"' : '') + '><td class="pick"><input type="checkbox" data-pick="' + p.id + '"' + (picked.has(p.id) ? ' checked' : '') + '></td><td class="thumb">' + (p.photo ? '<img src="' + p.photo + '" alt="" loading="lazy">' : '') + '</td>' +
          '<td><a href="#/plant/' + p.id + '">' + esc(GP.plantName(p)) + '</a><div class="italic small muted">' + esc(p.name_la) + '</div></td>' +
          '<td class="hide-sm">' + esc(GP.typeLabel(p.type)) + '</td>' +
          '<td class="hide-sm small">' + esc(GP.optLabel(GP.PLANT_OPTS.purpose, p.purpose)) + '</td>' +
          '<td class="hide-sm small">' + esc(GP.optLabel(GP.PLANT_OPTS.crop, p.crop)) + '</td>' +
          '<td>' + colorPills(p) + '</td>' +
          '<td class="hide-sm">' + monthStrip(p.bloomMonths, GP.colorHex(p) || BLOOM, L('Kvete', 'Flowers')) + '</td>' +
          '<td class="hide-sm">' + monthStrip(p.harvestMonths, HARVEST, L('Zraje', 'Ripens')) + '</td>' +
          '<td class="hide-sm small">' + gardensOf(p) + '</td>' +
          '<td>' + sectionBars(p) + '</td></tr>').join('');
      // how the plants in the list cover the year – gaps show months with nothing in flower / to harvest
      const cover = list.length < 2 ? '' : '<tfoot><tr class="cover-row"><td class="pick"></td><td></td><td class="small">' + L('Pokrytí roku', 'Year coverage') + ' <span class="muted">(' + list.length + ')</span></td>' +
        '<td class="hide-sm" colspan="4"></td><td class="hide-sm">' + coverageStrip(list, 'bloomMonths', BLOOM, L('kvete', 'in flower')) + '</td>' +
        '<td class="hide-sm">' + coverageStrip(list, 'harvestMonths', HARVEST, L('zraje', 'ripening')) + '</td><td class="hide-sm" colspan="2"></td></tr></tfoot>';
      return head + filters + '<div class="panel flush"><table class="tbl plants"><thead><tr><th class="pick"><input type="checkbox" data-pickall title="' + L('Vybrat všechny zobrazené', 'Select all shown') + '"' +
        (allPicked ? ' checked' : '') + (somePicked && !allPicked ? ' data-some' : '') + '></th><th></th>' + sortTh(filt.sort === 'latin' ? 'latin' : 'name', filt.sort === 'latin' ? L('Název – latinsky', 'Name – Latin') : L('Název', 'Name')) +
        sortTh('type', L('Typ', 'Type'), 'hide-sm') + sortTh('purpose', L('Funkce', 'Purpose'), 'hide-sm') + sortTh('crop', L('Užitek', 'Crop'), 'hide-sm') +
        '<th>' + L('Barva květů', 'Flower colour') + '</th>' + sortTh('bloom', L('Kvete', 'Flowers'), 'hide-sm') + sortTh('harvest', L('Zrání', 'Ripens'), 'hide-sm') +
        '<th class="hide-sm">' + L('Zahrada', 'Garden') + '</th>' +
        sortTh('complete', '<span class="sec-head">' + SECTIONS().map(s => '<span>' + esc(s) + '</span>').join('') + '</span>') + '</tr>' + filterRow + '</thead><tbody>' +
        (rows || '<tr><td colspan="11" class="muted">' + L('Nic neodpovídá filtru.', 'Nothing matches the filter.') + '</td></tr>') + '</tbody>' + cover + '</table></div>' +
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
      // clicking "Název" again switches between the Czech and the Latin name
      root.querySelectorAll('th[data-sort]').forEach(th => th.onclick = () => {
        const k = th.dataset.sort;
        filt.sort = k === 'name' && filt.sort === 'name' ? 'latin' : k === 'latin' ? 'name' : k;
        GP.render();
      });
      const nf = root.querySelector('[data-act=nofilter]');
      if (nf) nf.onclick = () => { for (const k of FILTERS) filt[k] = ''; GP.render(); };
      root.querySelectorAll('[data-f]').forEach(el => {
        el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => {
          filt[el.dataset.f] = el.value;
          const pos = el.selectionStart;
          GP.render();
          if (el.tagName === 'INPUT') { const n = document.querySelector('[data-f=q]'); n.focus(); n.setSelectionRange(pos, pos); }
        });
      });
      root.querySelectorAll('tr[data-href]').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a') && !e.target.closest('.pick')) location.hash = tr.dataset.href; }));
      // ticking plants: one by one, or all shown with the header box
      const pa = root.querySelector('[data-pickall]');
      if (pa) {
        pa.indeterminate = pa.hasAttribute('data-some');
        pa.onchange = () => { for (const p of filtered()) { if (pa.checked) picked.add(p.id); else picked.delete(p.id); } GP.render(); };
      }
      root.querySelectorAll('[data-pick]').forEach(cb => cb.onchange = () => { if (cb.checked) picked.add(cb.dataset.pick); else picked.delete(cb.dataset.pick); GP.render(); });
      const np = root.querySelector('[data-act=nopick]');
      if (np) np.onclick = () => { picked.clear(); GP.render(); };
      const tg = root.querySelector('[data-act=togarden]');
      if (tg) tg.onclick = () => addToGardenDialog([...picked].map(id => GP.byId('plants', id)).filter(Boolean));
    }
  };

  // ---------------- plant card ----------------
  // Previous / next plant in the order of the catalog list (with its filters), so the database can be gone through
  // one plant after another; a plant the filters no longer show (e.g. just completed) steps through the whole catalog.
  function plantNav(p) {
    let list = filtered();
    if (!list.includes(p)) list = GP.state.plants.slice().sort((a, b) => GP.plantName(a).localeCompare(GP.plantName(b), 'cs'));
    const i = list.indexOf(p), prev = list[i - 1], next = list[i + 1];
    const link = (x, cls, label) => x ? '<a class="btn ' + cls + '" href="#/plant/' + x.id + '" title="' + esc(GP.plantName(x)) + '">' + label + '</a>' : '<span class="btn ' + cls + ' off">' + label + '</span>';
    return '<div class="plant-nav">' +
      link(prev, 'pn-prev', '← <span>' + L('předchozí', 'previous') + (prev ? ': <b>' + esc(GP.plantName(prev)) + '</b>' : '') + '</span>') +
      '<span class="muted small">' + (i + 1) + ' / ' + list.length + (list.length < GP.state.plants.length ? ' ' + L('(podle filtru)', '(filtered)') : '') + '</span>' +
      link(next, 'pn-next', '<span>' + L('další', 'next') + (next ? ': <b>' + esc(GP.plantName(next)) + '</b>' : '') + '</span> →') + '</div>';
  }

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
        '<button class="btn danger" data-act="del">' + L('Smazat', 'Delete') + '</button></div></div>' + plantNav(p) +
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
      // once more at the bottom, so after going through the card it is one tap to the next plant
      html += '</div>' + plantingsPanel(p) + plantNav(p);
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
        markMissing(root, p);
      });
      markMissing(root, p);
      form.addEventListener('click', e => {
        const add = e.target.closest('[data-addterm]'), del = e.target.closest('[data-delterm]');
        if (!add && !del) return;
        const key = (add || del).dataset[add ? 'addterm' : 'delterm'];
        const terms = GP.careTerms(p, key).slice();
        if (add) { if (!terms.length) terms.push({}); terms.push({}); } else terms.splice(+del.dataset.i, 1);
        p[key] = terms;
        GP.save(); careRedraw(); markMissing(root, p);
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
      (pls.length ? '<table class="tbl"><thead><tr><th>' + L('Zahrada', 'Garden') + '</th><th>' + L('Umístění', 'Position') + '</th><th>' + L('Stav', 'Status') + '</th><th>' + L('Vysazeno v měsíci', 'Planted in') + '</th><th>' + L('Ks', 'Qty') + '</th><th>' + L('Poznámka', 'Note') + '</th><th></th></tr></thead><tbody>' +
        pls.map(pl => {
          const g = GP.byId('gardens', pl.gardenId);
          const issues = g ? [...new Set((pl.cells && pl.cells.length ? pl.cells : [null]).flatMap(k => GP.plantIssues(p, g, k)))] : [];
          return '<tr data-pl="' + pl.id + '"><td>' + (g ? '<a href="#/garden/' + g.id + '/plan">' + esc(g.name) + '</a>' : '?') +
            '<div class="small muted">' + (pl.cells && pl.cells.length ? pl.cells.slice(0, 5).map(GP.cellName).join(', ') + (pl.cells.length > 5 ? '…' : '') : L('není na plánu', 'not on plan')) + '</div>' +
            (issues.length ? '<div class="small warn-text">' + issues.map(esc).join('<br>') + '</div>' : '') + '</td>' +
            '<td><input type="text" data-k="position" value="' + esc(pl.position) + '"></td>' +
            '<td><select data-k="status">' + GP.STATUSES.map(s => '<option value="' + s[0] + '"' + (pl.status === s[0] ? ' selected' : '') + '>' + esc(L(s[1], s[2])) + '</option>').join('') + '</select></td>' +
            '<td>' + GP.ui.monthYear('data-k="plantedDate"', (pl.plantedDate || '').slice(0, 7)) + '</td>' +
            '<td><input type="text" class="num" data-k="count" value="' + esc(pl.count) + '"></td>' +
            '<td><input type="text" data-k="notes" value="' + esc(pl.notes) + '"></td>' +
            '<td><button class="link danger" data-delpl="' + pl.id + '">✕</button></td></tr>';
        }).join('') + '</tbody></table>' : '<p class="muted">' + L('Rostlina zatím není v žádné zahradě.', 'This plant is not in any garden yet.') + '</p>') +
      (gs.length ? '<div class="row gap"><select data-act="addgarden">' + gs.map(g => '<option value="' + g.id + '">' + esc(g.name) + '</option>').join('') + '</select>' +
        '<button class="btn" data-act="addpl">+ ' + L('Přidat do zahrady', 'Add to garden') + '</button></div>' : '') + '</div>';
  }
})(window.GP);
