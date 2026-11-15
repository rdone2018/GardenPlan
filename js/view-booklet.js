// Garden booklet: a printable diary of one garden (A4, saved as PDF with the browser's print). The garden on one
// page, its plan, the plants growing in it – grouped by genus with the care they share written once and only the
// differences per plant – and a care calendar for every month, with the plants that share a task on one line.
// "For sharing" leaves out what must not be passed on: photos that are not freely licensed (e-shop photos),
// the exact address and GPS, the owner's name and the background image (e.g. an architect's plan).
(function (GP) {
  const L = (cs, en) => GP.L(cs, en), esc = s => GP.esc(s);
  const opts = { share: false, short: false, photos: true };
  const TYPE_ORDER = ['tree', 'shrub', 'subshrub', 'perennial', 'biennial', 'annual', 'bulb', ''];
  const CHAPTER = { tree: ['Stromy', 'Trees'], shrub: ['Keře', 'Shrubs'], subshrub: ['Polokeře', 'Subshrubs'], perennial: ['Trvalky', 'Perennials'],
    biennial: ['Dvouletky', 'Biennials'], annual: ['Letničky a zelenina', 'Annuals and vegetables'], bulb: ['Cibuloviny', 'Bulbs'], '': ['Ostatní', 'Others'] };

  const careFields = () => GP.PLANT_FIELDS.filter(f => f.type === 'care');
  const opt = (list, v) => (v ? GP.optLabel(list, v) || v : '');
  const optList = (key, vals) => (vals || []).map(v => opt(GP.PLANT_OPTS[key] || [], v)).filter(Boolean).join(', ');
  // -12.2 -> −12,2 (a real minus, and a decimal comma in Czech)
  const num = v => String(v).replace('-', '−').replace('.', L(',', '.'));
  const months = ms => GP.formatMonths([...(ms || [])].sort((a, b) => a - b));
  const fullName = p => GP.plantName(p);
  const genusOf = p => (p.genus || (p.name_la || '').split(' ')[0] || GP.plantName(p)).trim();
  // photos that may be passed on: freely licensed ones (Wikimedia Commons, credited) – not e-shop photos
  const photoOk = p => p.photo && opts.photos && (!opts.share || /^Wikimedia/.test(p.photoCredit || ''));
  // a photo that cannot be loaded leaves no broken image behind
  const photo = (p, cls) => photoOk(p) ? '<figure class="' + cls + '"><img src="' + esc(p.photo) + '" alt="" onerror="this.parentNode.remove()">' + (p.photoCredit ? '<figcaption>' + esc(p.photoCredit) + '</figcaption>' : '') + '</figure>' : '';

  // a care item as one comparable value: wording + months + one-time
  const termSig = t => GP.textKey(t.text || '') + '|' + [...(t.months || [])].sort((a, b) => a - b).join(',') + (t.once ? '|1' : '');
  const careSig = (p, key) => GP.careTerms(p, key).map(termSig).join(' ; ');
  // mark: '+' (on top of the shared care) or 'bez' (the shared care this plant does not have)
  const careRows = (terms, mark) => terms.map(t => '<tr' + (mark && mark !== '+' ? ' class="bk-without"' : '') + '><td class="bk-m">' + (mark ? '<span class="bk-mark">' + esc(mark) + '</span> ' : '') + esc(months(t.months) || '—') +
    (t.once ? ' <span class="bk-once">1×</span>' : '') + '</td><td>' + esc(t.text || '') + '</td></tr>').join('');

  // the plants growing (or planned) in garden g, with their placements
  function gardenPlants(g) {
    const map = new Map();
    for (const pl of GP.state.placements) {
      if (pl.gardenId !== g.id) continue;
      const p = GP.byId('plants', pl.plantId);
      if (!p) continue;
      if (!map.has(p.id)) map.set(p.id, { p, pls: [] });
      map.get(p.id).pls.push(pl);
    }
    return [...map.values()];
  }
  const countOf = e => e.pls.reduce((n, pl) => n + (parseInt(pl.count, 10) || 1), 0);

  // ---------- 1: the garden ----------
  function gardenPage(g, items) {
    const cellM = (g.grid && g.grid.cellM) || 1;
    const wM = g.grid ? Math.round(g.grid.cols * cellM) : '', hM = g.grid ? Math.round(g.grid.rows * cellM) : '';
    const zoneArea = {};
    for (const c of Object.values(g.cells || {})) if (c.zone) zoneArea[c.zone] = (zoneArea[c.zone] || 0) + cellM * cellM;
    const kv = (k, v) => v || v === 0 ? '<tr><th>' + k + '</th><td>' + v + '</td></tr>' : '';
    const typeCount = {};
    for (const e of items) typeCount[e.p.type || ''] = (typeCount[e.p.type || ''] || 0) + 1;
    const total = items.reduce((n, e) => n + countOf(e), 0);
    const genera = new Set(items.map(e => genusOf(e.p))).size;
    const where = opts.share ? (g.region || '') : (g.address || '') + (g.lat && g.lon ? ' · GPS ' + g.lat + ', ' + g.lon : '');
    return '<section class="bk-page bk-title">' +
      '<p class="bk-eyebrow">' + L('Diář zahrady', 'Garden diary') + ' · MeaFlora</p><h1>' + esc(g.name || L('Zahrada', 'Garden')) + '</h1>' +
      '<p class="bk-sub">' + esc([g.gardenType, opts.share ? '' : g.owner].filter(Boolean).join(' · ')) + '</p>' +
      '<div class="bk-cols"><table class="bk-kv"><tbody>' +
      kv(L('Poloha', 'Location'), esc(where)) +
      kv(L('Nadmořská výška', 'Altitude'), g.altitude ? esc(g.altitude) + ' m' : '') +
      kv(L('Rozměry', 'Size'), wM ? wM + ' × ' + hM + ' m' + (g.area ? ' · ' + esc(g.area) + ' m²' : '') : '') +
      kv(L('Mřížka plánu', 'Plan grid'), g.grid ? g.grid.cols + ' × ' + g.grid.rows + ' ' + L('políček po', 'cells of') + ' ' + cellM + ' m' : '') +
      kv(L('Orientace', 'Aspect'), esc(opt(GP.ASPECTS, g.aspect))) +
      kv(L('Svah', 'Slope'), esc(opt(GP.SLOPES, g.slope))) +
      kv(L('Půda', 'Soil'), esc([(g.soils || []).map(s => opt(GP.SOILS, s)).join(', '), opt(GP.SOIL_PH, g.soilPh)].filter(Boolean).join(' · '))) +
      kv(L('Voda', 'Water'), esc((g.water || []).map(w => typeof w === 'string' ? opt(GP.WATER_SOURCES, w) : [opt(GP.WATER_SOURCES, w.type), w.capacity ? w.capacity + ' m³' : '', w.note].filter(Boolean).join(' ')).join(', '))) +
      '</tbody></table><table class="bk-kv"><tbody>' +
      kv(L('Nejnižší zimní teplota', 'Lowest in winter'), g.minTemp ? esc(num(g.minTemp)) + ' °C' : '') +
      kv(L('Nejvyšší letní teplota', 'Highest in summer'), g.maxTemp ? esc(num(g.maxTemp)) + ' °C' : '') +
      kv(L('Průměrná roční teplota', 'Mean annual temperature'), g.meanTemp ? esc(num(g.meanTemp)) + ' °C' : '') +
      kv(L('Poslední jarní mrazy', 'Last spring frost'), esc(g.lastFrost || '')) +
      kv(L('První podzimní mrazy', 'First autumn frost'), esc(g.firstFrost || '')) +
      kv(L('Bezmrazé období', 'Frost-free period'), g.frostFree ? esc(g.frostFree) + ' ' + L('dní', 'days') : '') +
      kv(L('Roční srážky', 'Annual rainfall'), g.rainfall ? esc(g.rainfall) + ' mm' : '') +
      '</tbody></table></div>' +
      '<div class="bk-stats"><div><b>' + total + '</b>' + L('rostlin', 'plants') + '</div><div><b>' + items.length + '</b>' + L('druhů a odrůd', 'species & cultivars') + '</div><div><b>' + genera + '</b>' + L('rodů', 'genera') + '</div>' +
      TYPE_ORDER.filter(t => typeCount[t]).map(t => '<div><b>' + typeCount[t] + '</b>' + esc(L(CHAPTER[t][0], CHAPTER[t][1]).toLowerCase()) + '</div>').join('') + '</div>' +
      ((g.zones || []).some(z => zoneArea[z.id]) ? '<h3>' + L('Zóny zahrady', 'Garden zones') + '</h3><ul class="bk-zones">' + (g.zones || []).filter(z => zoneArea[z.id]).map(z =>
        '<li><i style="background:' + esc(z.color) + '"></i>' + esc(z.name) + ' <span>' + Math.round(zoneArea[z.id]) + ' m²</span></li>').join('') + '</ul>' : '') +
      (opts.short ? '' : '<h3>' + L('Obsah', 'Contents') + '</h3><ol class="bk-toc"><li>' + L('Plán zahrady', 'Garden plan') + '</li>' +
        TYPE_ORDER.filter(t => typeCount[t]).map(t => '<li>' + esc(L(CHAPTER[t][0], CHAPTER[t][1])) + '</li>').join('') + '<li>' + L('Kalendář péče po měsících', 'Care calendar by month') + '</li></ol>') +
      '</section>';
  }

  // ---------- 2: the plan ----------
  function planPage(g, items) {
    if (!g.grid) return '';
    const placed = items.filter(e => e.pls.some(pl => (pl.cells || []).length));
    return '<section class="bk-page bk-plan"><h2>' + L('Plán zahrady', 'Garden plan') + '</h2>' +
      '<canvas class="bk-canvas" data-garden="' + esc(g.id) + '"></canvas>' +
      '<p class="bk-note">' + L('Mřížka po ', 'Grid of ') + g.grid.cellM + ' m · ' + L('silná čára každých 5 m', 'bold line every 5 m') + ' · ' +
      (placed.length ? L('v plánu je rozmístěno ', 'plants placed on the plan: ') + placed.length + ' / ' + items.length : L('rostliny zatím nejsou v plánu rozmístěné', 'plants are not placed on the plan yet')) + '</p>' +
      '<ul class="bk-zones">' + (g.zones || []).map(z => '<li><i style="background:' + esc(z.color) + '"></i>' + esc(z.name) + '</li>').join('') + '</ul></section>';
  }

  function drawPlan(canvas, g) {
    const { cols, rows, cellM } = g.grid, W = 1800, px = W / cols, H = Math.round(rows * px);
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d'), zone = {};
    for (const z of g.zones || []) zone[z.id] = z.color;
    ctx.fillStyle = '#f4f6ef'; ctx.fillRect(0, 0, W, H);
    for (const [k, c] of Object.entries(g.cells || {})) {
      if (!c.zone || !zone[c.zone]) continue;
      const [x, y] = k.split(',').map(Number);
      ctx.fillStyle = zone[c.zone]; ctx.fillRect(x * px, y * px, Math.ceil(px), Math.ceil(px));
    }
    const step5 = Math.round(5 / cellM);
    for (let x = 0; x <= cols; x++) { ctx.strokeStyle = x % step5 ? 'rgba(0,0,0,.07)' : 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.moveTo(x * px, 0); ctx.lineTo(x * px, H); ctx.stroke(); }
    for (let y = 0; y <= rows; y++) { ctx.strokeStyle = y % step5 ? 'rgba(0,0,0,.07)' : 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.moveTo(0, y * px); ctx.lineTo(W, y * px); ctx.stroke(); }
    // plants: a dot in the flower colour on each of their cells
    for (const pl of GP.state.placements) {
      if (pl.gardenId !== g.id) continue;
      const p = GP.byId('plants', pl.plantId);
      for (const k of pl.cells || []) {
        const [x, y] = k.split(',').map(Number);
        ctx.fillStyle = GP.colorHex(p) || '#3e7b3a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc((x + .5) * px, (y + .5) * px, Math.max(4, px * .38), 0, 7); ctx.fill(); ctx.stroke(); ctx.lineWidth = 1;
      }
    }
    ctx.strokeStyle = '#4a6a3a'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
  }

  // ---------- 3: plants, grouped by genus ----------
  function facts(p) {
    return [
      p.height ? L('výška ', 'height ') + esc(p.height) + ' cm' : '', p.width ? L('šířka ', 'width ') + esc(p.width) + ' cm' : '',
      optList('light', p.light), optList('water', p.water),
      p.hardiness ? L('mrazuvzdornost ', 'hardy to ') + esc(String(p.hardiness).replace('-', '−')) + ' °C' : '',
      (p.bloomMonths || []).length ? '🌸 ' + esc(months(p.bloomMonths)) + (GP.colorNames(p) ? ' (' + esc(GP.colorNames(p)) + ')' : '') : '',
      (p.harvestMonths || []).length ? '🧺 ' + esc(months(p.harvestMonths)) : ''
    ].filter(Boolean).join(' · ');
  }
  const where = e => [...new Set(e.pls.map(pl => pl.position).filter(Boolean))].join(', ');

  // one plant on its own: a compact card
  function plantCard(e) {
    const p = e.p, care = careFields().filter(f => GP.careTerms(p, f.key).some(t => t.text || (t.months || []).length));
    return '<article class="bk-card">' + photo(p, 'bk-ph') +
      '<div class="bk-card-body"><h4>' + esc(fullName(p)) + ' <span class="bk-count">' + countOf(e) + '×</span></h4>' +
      '<p class="bk-la">' + esc([p.name_la, p.family].filter(Boolean).join(' · ')) + (where(e) ? ' · 📍 ' + esc(where(e)) : '') + '</p>' +
      '<p class="bk-facts">' + facts(p) + '</p>' +
      (care.length ? '<table class="bk-care"><tbody>' + care.map(f => '<tr class="bk-care-h"><td colspan="2">' + (f.icon || '') + ' ' + esc(GP.fieldLabel(f)) + '</td></tr>' + careRows(GP.careTerms(p, f.key))).join('') + '</tbody></table>' : '') +
      (p.notes ? '<p class="bk-notes">' + esc(p.notes) + '</p>' : '') + '</div></article>';
  }

  // a genus with several plants: the care they share once, a table of the plants, the differences per plant
  function genusPage(genus, list) {
    const names = [...new Set(list.map(e => (L(e.p.name_cs, e.p.name_en) || e.p.name_cs || '').split(' ')[0]).filter(Boolean))];
    const shared = [], diffs = [];
    for (const f of careFields()) {
      const sigs = new Map();
      for (const e of list) { const s = careSig(e.p, f.key); if (!sigs.has(s)) sigs.set(s, []); sigs.get(s).push(e); }
      // the most common variant; on a tie the shorter one, so the others show as additions
      const [mainSig, mainList] = [...sigs.entries()].sort((a, b) => b[1].length - a[1].length || a[0].split(' ; ').length - b[0].split(' ; ').length)[0];
      const mainTerms = mainSig ? GP.careTerms(mainList[0].p, f.key) : [];
      if (mainSig) shared.push([f, mainTerms, mainList.length === list.length]);
      // only what really differs: terms a plant has on top of the shared care, and shared terms it does not have
      const mainKeys = new Set(mainTerms.map(termSig));
      for (const [s, es] of sigs) {
        if (s === mainSig) continue;
        const theirs = GP.careTerms(es[0].p, f.key), theirKeys = new Set(theirs.map(termSig));
        const extra = theirs.filter(t => !mainKeys.has(termSig(t))), missing = mainTerms.filter(t => !theirKeys.has(termSig(t)));
        if (extra.length || missing.length) diffs.push([f, es, extra, missing]);
      }
    }
    return '<section class="bk-genus"><h3>' + esc(genus) + ' <span>' + esc(names.join(', ')) + ' · ' + list.length + ' ' + L('druhů a odrůd', 'species & cultivars') + ' · ' + list.reduce((n, e) => n + countOf(e), 0) + ' ' + L('ks', 'pcs') + '</span></h3>' +
      '<table class="bk-members"><thead><tr><th></th><th>' + L('Rostlina', 'Plant') + '</th><th>' + L('Ks', 'Pcs') + '</th><th>' + L('Údaje', 'Details') + '</th></tr></thead><tbody>' +
      list.map(e => '<tr><td class="bk-thumb">' + photo(e.p, 'bk-th') + '</td><td><b>' + esc(fullName(e.p)) + '</b>' + (e.p.notes ? '<div class="bk-notes">' + esc(e.p.notes) + '</div>' : '') + '</td><td>' + countOf(e) + '</td><td class="bk-facts">' + facts(e.p) + (where(e) ? ' · 📍 ' + esc(where(e)) : '') + '</td></tr>').join('') +
      '</tbody></table>' +
      (shared.length ? '<h4>' + L('Společná péče', 'Shared care') + '</h4><table class="bk-care"><tbody>' + shared.map(([f, terms, all]) =>
        '<tr class="bk-care-h"><td colspan="2">' + (f.icon || '') + ' ' + esc(GP.fieldLabel(f)) + (all ? '' : ' <span class="bk-ref">' + L('(kromě rostlin níže)', '(except the plants below)') + '</span>') + '</td></tr>' + careRows(terms)).join('') + '</tbody></table>' : '') +
      (diffs.length ? '<h4>' + L('Kde se liší', 'Where they differ') + '</h4><table class="bk-care"><tbody>' + diffs.map(([f, es, extra, missing]) =>
        '<tr class="bk-care-h"><td colspan="2">' + (f.icon || '') + ' ' + esc(GP.fieldLabel(f)) + ' – ' + esc(es.map(e => fullName(e.p)).join(', ')) + '</td></tr>' +
        careRows(extra, '+') + careRows(missing, L('bez', 'not')) ).join('') + '</tbody></table>' : '') +
      '</section>';
  }

  function plantChapters(items) {
    let html = '';
    for (const t of TYPE_ORDER) {
      const inType = items.filter(e => (TYPE_ORDER.includes(e.p.type) ? e.p.type : '') === t);
      if (!inType.length) continue;
      const byGenus = new Map();
      for (const e of inType) { const g = genusOf(e.p); if (!byGenus.has(g)) byGenus.set(g, []); byGenus.get(g).push(e); }
      const groups = [...byGenus.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const multi = groups.filter(([, l]) => l.length > 1), single = groups.filter(([, l]) => l.length === 1);
      html += '<section class="bk-page bk-chapter"><h2>' + esc(L(CHAPTER[t][0], CHAPTER[t][1])) + ' <span>' + inType.length + '</span></h2>' +
        multi.map(([g, l]) => genusPage(g, l.sort((a, b) => fullName(a.p).localeCompare(fullName(b.p))))).join('') +
        (single.length ? '<div class="bk-cards">' + single.map(([, l]) => plantCard(l[0])).join('') + '</div>' : '') + '</section>';
    }
    return html;
  }

  // ---------- 4: the calendar, plants sharing a task on one line ----------
  function calendarPages(g) {
    const month = m => {
      const a = GP.monthAgenda(m, g.id), groups = new Map();
      for (const t of a.tasks) {
        const key = t.kind === 'care' ? t.field + '|' + GP.textKey(t.text || '') : t.key;
        if (!groups.has(key)) groups.set(key, { icon: t.icon, text: t.kind === 'care' ? (t.text || GP.fieldLabel(GP.plantField(t.field))) : t.title, plants: [], once: t.once });
        if (t.plant) groups.get(key).plants.push(fullName(t.plant));
      }
      const rows = [...groups.values()].sort((x, y) => y.plants.length - x.plants.length);
      return '<div class="bk-month"><h3>' + esc(GP.monthName(m)) + '</h3>' +
        (rows.length ? '<ul class="bk-tasks">' + rows.map(r => '<li><span class="bk-ico">' + r.icon + '</span><div><b>' + esc(String(r.text).split('\n')[0]) + '</b>' + (r.once ? ' <span class="bk-once">1×</span>' : '') +
          (r.plants.length ? '<div class="bk-pl">' + esc([...new Set(r.plants)].join(', ')) + '</div>' : '') + '</div></li>').join('') + '</ul>' : '<p class="bk-ref">' + L('Žádné úkoly.', 'No tasks.') + '</p>') +
        (a.bloom.length ? '<p class="bk-pl"><b>🌸 ' + L('Kvete', 'Flowering') + ':</b> ' + esc(a.bloom.map(fullName).join(', ')) + '</p>' : '') +
        (a.harvest.length ? '<p class="bk-pl"><b>🧺 ' + L('Sklizeň', 'Harvest') + ':</b> ' + esc(a.harvest.map(fullName).join(', ')) + '</p>' : '') + '</div>';
    };
    let html = '<section class="bk-page bk-calendar"><h2>' + L('Kalendář péče po měsících', 'Care calendar by month') + '</h2>';
    for (let m = 1; m <= 12; m++) html += month(m);
    return html + '</section>';
  }

  GP.views.booklet = {
    render(args) {
      const g = GP.byId('gardens', args[0]);
      if (!g) return '<p class="muted">' + L('Zahrada nenalezena.', 'Garden not found.') + '</p>';
      const items = gardenPlants(g);
      const tog = (k, label, title) => '<label class="small" title="' + esc(title || '') + '"><input type="checkbox" data-opt="' + k + '"' + (opts[k] ? ' checked' : '') + '> ' + label + '</label>';
      return '<div class="head no-print"><h1>📖 ' + L('Booklet zahrady', 'Garden booklet') + ' – ' + esc(g.name) + '</h1>' +
        '<span class="row gap"><a class="btn" href="#/garden/' + esc(g.id) + '">← ' + L('Zahrada', 'Garden') + '</a><button class="btn primary" data-act="print">🖨 ' + L('Tisk / uložit PDF', 'Print / save PDF') + '</button></span></div>' +
        '<div class="panel no-print row gap wrap">' +
        tog('share', L('Verze ke sdílení', 'Version for sharing'), L('Bez fotek z e-shopů (jen volně licencované z Wikimedia Commons), bez přesné adresy, GPS a jména majitele', 'Without e-shop photos (only freely licensed ones from Wikimedia Commons), without the exact address, GPS and owner')) +
        tog('photos', L('S fotkami', 'With photos')) +
        tog('short', L('Zkrácená verze (bez rostlin)', 'Short version (no plants)')) +
        '<span class="muted small">' + L('V tisku zvolte „Uložit jako PDF“, formát A4 a zapněte „Grafika na pozadí“, aby byly vidět barvy.', 'In the print dialog choose "Save as PDF", A4, and turn on "Background graphics" so the colours show.') + '</span></div>' +
        '<div class="booklet">' + gardenPage(g, items) + planPage(g, items) + (opts.short ? '' : plantChapters(items)) + calendarPages(g) + '</div>';
    },
    mount(root, args) {
      const g = GP.byId('gardens', args[0]);
      if (!g) return;
      root.querySelectorAll('[data-opt]').forEach(c => { c.onchange = () => { opts[c.dataset.opt] = c.checked; GP.render(); }; });
      const pr = root.querySelector('[data-act=print]');
      if (pr) pr.onclick = () => window.print();
      const cv = root.querySelector('.bk-canvas');
      if (cv) drawPlan(cv, g);
    }
  };
})(window.GP);
