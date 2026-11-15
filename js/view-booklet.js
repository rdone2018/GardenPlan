// Garden booklet: a printable diary of one garden, saved as PDF with the browser's print. Two parts:
// - Plant labels: one A5 label per plant, always the same layout (photo and names, facts in fixed places, the care
//   year as a 12-month strip, the care texts, neighbours, lines for notes), two labels side by side on an A4 sheet
//   (landscape) to cut in half – a growing encyclopedia of the garden in a ring binder.
// - Overview (A4): the garden on one page, its plan, the list of plants and the care calendar for every month, with
//   the plants that share a task on one line – reprinted whenever plants are added.
// "For sharing" leaves out what must not be passed on: photos that are not freely licensed (e-shop photos) are
// replaced by their colours only, and the exact address, GPS and the owner's name are left out.
(function (GP) {
  const L = (cs, en) => GP.L(cs, en), esc = s => GP.esc(s);
  const opts = { part: 'labels', share: false, photos: true, test: false };
  const TYPE_ORDER = ['tree', 'shrub', 'subshrub', 'perennial', 'biennial', 'annual', 'bulb', ''];
  const CHAPTER = { tree: ['Stromy', 'Trees'], shrub: ['Keře', 'Shrubs'], subshrub: ['Polokeře', 'Subshrubs'], perennial: ['Trvalky', 'Perennials'],
    biennial: ['Dvouletky', 'Biennials'], annual: ['Letničky a zelenina', 'Annuals and vegetables'], bulb: ['Cibuloviny', 'Bulbs'], '': ['Ostatní', 'Others'] };

  const careFields = () => GP.PLANT_FIELDS.filter(f => f.type === 'care');
  const opt = (list, v) => (v ? GP.optLabel(list, v) || v : '');
  const optList = (key, vals) => [].concat(vals || []).map(v => opt(GP.PLANT_OPTS[key] || [], v)).filter(Boolean).join(', ');
  // -12.2 -> −12,2 (a real minus, and a decimal comma in Czech)
  const num = v => String(v).replace('-', '−').replace('.', L(',', '.'));
  const months = ms => GP.formatMonths([...(ms || [])].sort((a, b) => a - b));
  const fullName = p => GP.plantName(p);
  const genusOf = p => (p.genus || (p.name_la || '').split(' ')[0] || GP.plantName(p)).trim();
  const typeOf = p => (TYPE_ORDER.includes(p.type) ? p.type : '');
  const today = () => new Date().toLocaleDateString(L('cs-CZ', 'en-GB'));
  // short names of the care items for the year strip
  const SHORT = { watering: ['Zálivka', 'Watering'], fertilizing: ['Hnojení', 'Feeding'], pruning: ['Řez', 'Pruning'], winter: ['Na zimu', 'Winter'], diseases: ['Choroby', 'Diseases'], pests: ['Škůdci', 'Pests'], otherCare: ['Další péče', 'Other care'] };
  // "2026-04" -> "duben 2026"
  const monthYear = v => { const [y, m] = String(v || '').split('-').map(Number); return y ? (m ? GP.monthName(m) + ' ' : '') + y : ''; };

  // Photos: in my version every photo; for sharing only freely licensed ones (Wikimedia Commons), any other photo
  // becomes a blur of its colours (worked out in mount from a tiny copy of the photo, the picture itself is not shown).
  const freePhoto = p => /^Wikimedia/.test(p.photoCredit || '');
  function photoBox(p) {
    const swatch = GP.colorHex(p) || '#cfe5b7';
    if (!p.photo || !opts.photos) return '<div class="lb-photo lb-none" style="background:' + esc(swatch) + '"></div>';
    if (opts.share && !freePhoto(p)) return '<div class="lb-photo lb-colors" data-colors="' + esc(p.photo) + '" style="background:' + esc(swatch) + '"></div>';
    return '<figure class="lb-photo"><img src="' + esc(p.photo) + '" alt="" onerror="this.parentNode.classList.add(\'lb-none\');this.remove()">' +
      (p.photoCredit && (opts.share || freePhoto(p)) ? '<figcaption>' + esc(p.photoCredit) + '</figcaption>' : '') + '</figure>';
  }

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
    return [...map.values()].sort((a, b) => TYPE_ORDER.indexOf(typeOf(a.p)) - TYPE_ORDER.indexOf(typeOf(b.p)) || fullName(a.p).localeCompare(fullName(b.p), L('cs', 'en')));
  }
  const countOf = e => e.pls.reduce((n, pl) => n + (parseInt(pl.count, 10) || 1), 0);
  const where = e => [...new Set(e.pls.map(pl => pl.position).filter(Boolean))].join(', ');

  // ---------- plant labels (A5) ----------
  function label(e, g, sameGenus) {
    const p = e.p;
    const fact = (k, v) => '<div><b>' + k + '</b><span>' + (v || '—') + '</span></div>';
    const strip = [
      ['🌸', L('Kvete', 'Flowers'), p.bloomMonths, GP.colorHex(p) || '#e8a0bf'],
      ['🧺', L('Sklizeň', 'Harvest'), p.harvestMonths, '#e6a23c'],
      ['🪴', L('Výsadba', 'Planting'), p.plantMonths, '#8d6e63'],
      ['🌱', L('Výsev', 'Sowing'), [...(p.sowInMonths || []), ...(p.sowOutMonths || [])], '#9ccc65'],
      ...careFields().map(f => [f.icon || '•', SHORT[f.key] ? L(SHORT[f.key][0], SHORT[f.key][1]) : GP.fieldLabel(f), GP.careTerms(p, f.key).flatMap(t => t.months || []), '#5d9b52'])
    ].filter(r => (r[2] || []).length);
    const care = careFields().map(f => [f, GP.careTerms(p, f.key).filter(t => t.text || (t.months || []).length)]).filter(x => x[1].length);
    const toxic = optList('toxicParts', p.toxicParts);
    return '<article class="lb-card">' +
      '<header class="lb-head">' + photoBox(p) + '<div class="lb-names"><p class="lb-type">' + esc(GP.typeLabel(p.type) || '') + '</p>' +
      '<h3>' + esc(fullName(p)) + '</h3><p class="lb-la">' + esc([p.name_la, p.family].filter(Boolean).join(' · ')) + '</p>' +
      '<p class="lb-where">' + countOf(e) + ' ' + L('ks', 'pcs') + (where(e) ? ' · 📍 ' + esc(where(e)) : '') + (e.pls[0] && e.pls[0].plantedDate ? ' · ' + L('vysazeno ', 'planted ') + esc(monthYear(e.pls[0].plantedDate)) : '') + '</p></div></header>' +
      '<div class="lb-facts">' +
      fact(L('Výška × šířka', 'Height × width'), p.height ? esc(p.height) + (p.width ? ' × ' + esc(p.width) : '') + ' cm' : '') +
      fact(L('Rozestup', 'Spacing'), p.spacing ? esc(p.spacing) + ' cm' : '') +
      fact(L('Světlo', 'Light'), esc(optList('light', p.light))) +
      fact(L('Voda', 'Water'), esc(optList('water', p.water))) +
      fact(L('Půda', 'Soil'), esc([optList('soilType', p.soilType), optList('soilPh', p.soilPh)].filter(Boolean).join(', '))) +
      fact(L('Mrazuvzdornost', 'Hardiness'), p.hardiness ? esc(num(p.hardiness)) + ' °C' + (p.usda ? ' (USDA ' + esc(p.usda) + ')' : '') : '') +
      fact(L('Květ', 'Flower'), esc([GP.colorNames(p), months(p.bloomMonths)].filter(Boolean).join(', '))) +
      fact(L('Jedovatost', 'Toxicity'), esc(toxic && toxic !== opt(GP.PLANT_OPTS.toxicParts || [], 'none') ? toxic + (p.toxicFor ? ' – ' + optList('toxicFor', p.toxicFor) : '') : L('nejedovatá', 'not toxic'))) +
      '</div>' +
      (strip.length ? '<table class="lb-year"><thead><tr><th></th>' + Array.from({ length: 12 }, (_, i) => '<th>' + GP.monthShort(i + 1) + '</th>').join('') + '</tr></thead><tbody>' +
        strip.map(([icon, name, ms, color]) => '<tr><td class="lb-row">' + icon + ' ' + esc(name) + '</td>' + Array.from({ length: 12 }, (_, i) => '<td' + (ms.includes(i + 1) ? ' class="on" style="background:' + esc(color) + '"' : '') + '></td>').join('') + '</tr>').join('') +
        '</tbody></table>' : '') +
      (care.length ? '<div class="lb-care">' + care.map(([f, terms]) => terms.map(t => '<p><span class="lb-ico">' + (f.icon || '•') + '</span><b>' + esc(months(t.months) || GP.fieldLabel(f)) + (t.once ? ' · 1×' : '') + '</b> ' + esc(t.text || '') + '</p>').join('')).join('') + '</div>' : '') +
      (p.planting ? '<p class="lb-line"><b>' + L('Výsadba', 'Planting') + ':</b> ' + esc(p.planting) + '</p>' : '') +
      (p.companions || p.antagonists ? '<p class="lb-line">' + (p.companions ? '<b>✓</b> ' + esc(p.companions) : '') + (p.antagonists ? (p.companions ? ' &nbsp; ' : '') + '<b>✗</b> ' + esc(p.antagonists) : '') + '</p>' : '') +
      (p.notes ? '<p class="lb-line lb-note">' + esc(p.notes) + '</p>' : '') +
      '<div class="lb-notes"><span>' + L('Moje poznámky', 'My notes') + '</span></div>' +
      '<footer class="lb-foot"><span>' + esc(g.name || '') + ' · MeaFlora · ' + today() + '</span>' + (sameGenus.length ? '<span>' + L('Stejný rod: ', 'Same genus: ') + esc(sameGenus.join(', ')) + '</span>' : '') + '</footer>' +
      '</article>';
  }

  function labelSheets(g, items) {
    const list = opts.test ? items.slice(0, 2) : items;
    const byGenus = new Map();
    for (const e of items) { const k = genusOf(e.p); if (!byGenus.has(k)) byGenus.set(k, []); byGenus.get(k).push(fullName(e.p)); }
    const cards = list.map(e => label(e, g, (byGenus.get(genusOf(e.p)) || []).filter(n => n !== fullName(e.p)).slice(0, 6)));
    let html = '';
    for (let i = 0; i < cards.length; i += 2) html += '<section class="lb-sheet">' + cards[i] + (cards[i + 1] || '<article class="lb-card lb-empty"></article>') + '</section>';
    return html || '<p class="muted">' + L('V této zahradě zatím nejsou žádné rostliny.', 'There are no plants in this garden yet.') + '</p>';
  }

  // A long label first gets slightly smaller text (not below 88 %, so it stays readable); what still does not fit –
  // the last care lines, planting, neighbours, notes and the lines for my notes – goes on a continuation label right
  // after it. Then the labels are paired into A4 sheets again.
  const over = el => el.scrollHeight > el.clientHeight + 1;
  function fitLabels(root) {
    const box = root.querySelector('.bk-labels');
    if (!box || box.dataset.fitted) return;
    box.dataset.fitted = '1';
    const cards = [...box.querySelectorAll('.lb-card:not(.lb-empty)')];
    const units = []; // [label] or [label, its continuation] – a plant with a continuation gets a sheet of its own
    for (const card of cards) {
      const unit = [card];
      units.push(unit);
      let s = 1;
      card.style.setProperty('--fs', s);
      while (over(card) && s > 0.88) { s = Math.round((s - 0.04) * 100) / 100; card.style.setProperty('--fs', s); }
      if (!over(card)) continue;
      const cont = document.createElement('article');
      cont.className = 'lb-card lb-cont';
      cont.style.setProperty('--fs', s);
      cont.innerHTML = '<header class="lb-conthead"><b>' + esc(card.querySelector('h3').textContent) + '</b> <span>' + L('pokračování', 'continued') + '</span></header><div class="lb-care"></div>';
      const contCare = cont.querySelector('.lb-care'), foot = card.querySelector('.lb-foot');
      // planting, neighbours, notes and the note lines go first, then care lines from the end
      card.querySelectorAll('.lb-line, .lb-notes').forEach(n => cont.appendChild(n));
      const care = [...card.querySelectorAll('.lb-care > p')];
      while (over(card) && care.length) contCare.prepend(care.pop());
      cont.appendChild(foot.cloneNode(true));
      unit.push(cont);
    }
    // pair the labels into sheets again: a label with its continuation side by side, the other labels two by two
    const out = [];
    let waiting = null;
    for (const u of units) {
      if (u.length === 2) out.push(...u);
      else if (waiting) { out.push(waiting, u[0]); waiting = null; }
      else waiting = u[0];
    }
    if (waiting) out.push(waiting);
    box.innerHTML = '';
    for (let i = 0; i < out.length; i += 2) {
      const sheet = document.createElement('section');
      sheet.className = 'lb-sheet';
      sheet.append(out[i], out[i + 1] || Object.assign(document.createElement('article'), { className: 'lb-card lb-empty' }));
      box.appendChild(sheet);
    }
    box.querySelectorAll('.lb-card:not(.lb-empty)').forEach(c => c.classList.toggle('lb-long', over(c)));
  }

  // a blur of the photo's colours (for sharing): the average colours of the photo's quarters as a soft gradient
  function colorBlurs(root) {
    root.querySelectorAll('[data-colors]').forEach(box => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = 2; c.height = 2;
          const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 2, 2);
          const d = ctx.getImageData(0, 0, 2, 2).data, col = i => 'rgb(' + d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ')';
          box.style.background = 'radial-gradient(circle at 25% 25%, ' + col(0) + ', transparent 70%), radial-gradient(circle at 75% 25%, ' + col(4) + ', transparent 70%),' +
            'radial-gradient(circle at 25% 75%, ' + col(8) + ', transparent 70%), radial-gradient(circle at 75% 75%, ' + col(12) + ', transparent 70%), ' + col(0);
        } catch (e) { /* keep the flower colour */ }
      };
      img.src = box.dataset.colors;
    });
  }

  // ---------- overview (A4) ----------
  function gardenPage(g, items) {
    const cellM = (g.grid && g.grid.cellM) || 1;
    const wM = g.grid ? Math.round(g.grid.cols * cellM) : '', hM = g.grid ? Math.round(g.grid.rows * cellM) : '';
    const zoneArea = {};
    for (const c of Object.values(g.cells || {})) if (c.zone) zoneArea[c.zone] = (zoneArea[c.zone] || 0) + cellM * cellM;
    const kv = (k, v) => v || v === 0 ? '<tr><th>' + k + '</th><td>' + v + '</td></tr>' : '';
    const typeCount = {};
    for (const e of items) typeCount[typeOf(e.p)] = (typeCount[typeOf(e.p)] || 0) + 1;
    const total = items.reduce((n, e) => n + countOf(e), 0);
    const genera = new Set(items.map(e => genusOf(e.p))).size;
    const place = opts.share ? (g.region || '') : (g.address || '') + (g.lat && g.lon ? ' · GPS ' + g.lat + ', ' + g.lon : '');
    return '<section class="bk-page bk-title">' +
      '<p class="bk-eyebrow">' + L('Diář zahrady', 'Garden diary') + ' · MeaFlora · ' + L('stav k ', 'as of ') + today() + '</p><h1>' + esc(g.name || L('Zahrada', 'Garden')) + '</h1>' +
      '<p class="bk-sub">' + esc([g.gardenType, opts.share ? '' : g.owner].filter(Boolean).join(' · ')) + '</p>' +
      '<div class="bk-cols"><table class="bk-kv"><tbody>' +
      kv(L('Poloha', 'Location'), esc(place)) +
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
      '</section>';
  }

  function planPage(g, items) {
    if (!g.grid) return '';
    const placed = items.filter(e => e.pls.some(pl => (pl.cells || []).length));
    return '<section class="bk-page bk-plan"><h2>' + L('Plán zahrady', 'Garden plan') + '</h2>' +
      '<canvas class="bk-canvas"></canvas>' +
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

  // the list of plants (which label belongs where in the binder)
  function indexPage(items) {
    let html = '<section class="bk-page bk-index"><h2>' + L('Seznam rostlin', 'List of plants') + ' <span>' + items.length + '</span></h2>';
    for (const t of TYPE_ORDER) {
      const inType = items.filter(e => typeOf(e.p) === t);
      if (!inType.length) continue;
      html += '<h3>' + esc(L(CHAPTER[t][0], CHAPTER[t][1])) + '</h3><table class="bk-list"><tbody>' +
        inType.map(e => '<tr><td>' + esc(fullName(e.p)) + '</td><td class="bk-la">' + esc(e.p.name_la || '') + '</td><td>' + countOf(e) + ' ' + L('ks', 'pcs') + '</td><td>' + esc(where(e)) + '</td></tr>').join('') + '</tbody></table>';
    }
    return html + '</section>';
  }

  // the calendar, plants sharing a task on one line
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
      const part = (v, label) => '<button class="seg' + (opts.part === v ? ' on' : '') + '" data-part="' + v + '">' + label + '</button>';
      return '<div class="head no-print"><h1>📖 ' + L('Booklet zahrady', 'Garden booklet') + ' – ' + esc(g.name) + '</h1>' +
        '<span class="row gap"><a class="btn" href="#/garden/' + esc(g.id) + '">← ' + L('Zahrada', 'Garden') + '</a><button class="btn primary" data-act="print">🖨 ' + L('Tisk / uložit PDF', 'Print / save PDF') + '</button></span></div>' +
        '<div class="panel no-print row gap wrap"><span>' + part('labels', '🏷️ ' + L('Štítky rostlin (A5)', 'Plant labels (A5)')) + part('overview', '📄 ' + L('Přehled zahrady (A4)', 'Garden overview (A4)')) + '</span>' +
        (opts.part === 'labels' ? tog('test', L('Zkušební list (první 2 rostliny)', 'Test sheet (first 2 plants)')) : '') +
        tog('photos', L('S fotkami', 'With photos')) +
        tog('share', L('Verze ke sdílení', 'Version for sharing'), L('Fotky, které nejsou volně licencované (z e-shopů), se nahradí jen jejich barvami; bez přesné adresy, GPS a jména majitele', 'Photos that are not freely licensed (from e-shops) are replaced by their colours only; without the exact address, GPS and owner')) +
        '<span class="muted small">' + (opts.part === 'labels'
          ? L('Tiskne se na A4 na šířku, dva štítky vedle sebe – po vytištění rozstřihněte napůl. V tisku zapněte „Grafika na pozadí“.', 'Prints on A4 landscape, two labels side by side – cut in half after printing. Turn on "Background graphics" in the print dialog.')
          : L('Úvod, plán, seznam rostlin a kalendář – vytiskněte znovu, když přibudou rostliny. V tisku zapněte „Grafika na pozadí“.', 'Garden, plan, list of plants and calendar – print again when plants are added. Turn on "Background graphics" in the print dialog.')) + '</span></div>' +
        '<div class="booklet ' + (opts.part === 'labels' ? 'bk-labels' : 'bk-overview') + '">' +
        (opts.part === 'labels' ? labelSheets(g, items) : gardenPage(g, items) + planPage(g, items) + indexPage(items) + calendarPages(g)) + '</div>';
    },
    mount(root, args) {
      const g = GP.byId('gardens', args[0]);
      if (!g) return;
      root.querySelectorAll('[data-opt]').forEach(c => { c.onchange = () => { opts[c.dataset.opt] = c.checked; GP.render(); }; });
      root.querySelectorAll('[data-part]').forEach(b => { b.onclick = () => { opts.part = b.dataset.part; GP.render(); }; });
      const pr = root.querySelector('[data-act=print]');
      if (pr) pr.onclick = () => window.print();
      const cv = root.querySelector('.bk-canvas');
      if (cv) drawPlan(cv, g);
      colorBlurs(root);
      // the photo box has a fixed size, so the labels can be fitted once the fonts are ready
      (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => fitLabels(root));
    }
  };
})(window.GP);
