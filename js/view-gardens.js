// Gardens: list, specification, zones & grid, plant placements and the grid plan (plants / zones / season).
(function (GP) {
  const L = GP.L, esc = GP.esc;

  GP.STATUSES = [['wish', 'přání', 'wishlist'], ['planned', 'plánováno', 'planned'], ['planted', 'vysazeno', 'planted'], ['removed', 'odstraněno', 'removed']];
  GP.statusLabel = s => GP.optLabel(GP.STATUSES, s) || s;

  // Per-session UI state of the plan (not saved).
  const ui = GP.gardenUI = { mode: 'plants', sel: null, zoneSel: null, cell: null, move: null, month: new Date().getMonth() + 1, zoom: null, q: '', scroll: null };

  const colName = c => { let s = ''; c++; while (c > 0) { const r = (c - 1) % 26; s = String.fromCharCode(65 + r) + s; c = Math.floor((c - 1) / 26); } return s; };
  GP.cellName = key => { const [c, r] = key.split(',').map(Number); return colName(c) + (r + 1); };

  GP.newGarden = function () {
    const g = {
      id: GP.uid(), name: L('Moje zahrada', 'My garden'), grid: { cols: 24, rows: 16, cellM: 1 }, cells: {}, bgOpacity: 0.55,
      zones: [
        { id: GP.uid(), name: L('Trávník', 'Lawn'), color: '#a5d17a', light: 'sun', water: 'normal' },
        { id: GP.uid(), name: L('Záhon', 'Flower bed'), color: '#e0b07a', light: '', water: '' },
        { id: GP.uid(), name: L('Ovocný sad', 'Orchard'), color: '#7fb069', light: '', water: '' },
        { id: GP.uid(), name: L('Dům / stavby', 'House / buildings'), color: '#9e9e9e', light: '', water: '' },
        { id: GP.uid(), name: L('Cesta', 'Path'), color: '#d9d2c5', light: '', water: '' }
      ]
    };
    GP.state.gardens.push(g);
    GP.save();
    return g;
  };

  GP.gardenPlacements = gid => GP.state.placements.filter(p => p.gardenId === gid && p.status !== 'removed');

  function cellInfo(g, key) {
    const c = g.cells[key] || {};
    const zone = g.zones.find(z => z.id === c.zone);
    return { c, zone, light: c.light || (zone && zone.light) || '', water: c.water || (zone && zone.water) || '' };
  }

  // Suitability warnings for a plant on a cell of a garden.
  GP.plantIssues = function (plant, g, key, byCell) {
    const out = [];
    if (!plant) return out;
    if (key) {
      const ci = cellInfo(g, key);
      const want = GP.lightSet(plant.light);
      if (ci.light && want.size && !want.has(ci.light))
        out.push('☀ ' + L('chce', 'needs') + ': ' + plant.light + ' · ' + L('políčko', 'cell') + ': ' + GP.optLabel(GP.CELL_LIGHT, ci.light));
      const w = GP.norm(plant.water);
      if ((ci.water === 'dry' && /vlhk|wet|moist/.test(w)) || (ci.water === 'wet' && /such|dry/.test(w)))
        out.push('💧 ' + L('chce', 'needs') + ': ' + plant.water + ' · ' + L('políčko', 'cell') + ': ' + GP.optLabel(GP.CELL_WATER, ci.water));
      if (byCell && plant.antagonists) {
        const [c, r] = key.split(',').map(Number), bad = GP.norm(plant.antagonists), seen = new Set();
        for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
          for (const pl of byCell[(c + dc) + ',' + (r + dr)] || []) {
            const other = GP.byId('plants', pl.plantId);
            if (!other || other.id === plant.id || seen.has(other.id)) continue;
            const words = [other.name_la, other.name_cs, other.name_en].filter(Boolean).map(n => GP.norm(n).split(' ')[0]).filter(w => w.length >= 4);
            if (words.some(wd => bad.includes(wd))) { seen.add(other.id); out.push('⚔ ' + L('nevhodný soused', 'bad neighbour') + ': ' + GP.plantName(other)); }
          }
        }
      }
    }
    const min = parseFloat(String(g.minTemp || '').replace(/[−–]/g, '-').replace(',', '.'));
    const hard = GP.hardinessC(plant.hardiness);
    if (!isNaN(min) && hard != null && hard > min)
      out.push('❄ ' + L('mrazuvzdornost', 'hardiness') + ' ' + Math.round(hard) + ' °C · ' + L('zahrada', 'garden') + ' ' + min + ' °C');
    return out;
  };

  function placementsByCell(g) {
    const map = {};
    for (const pl of GP.gardenPlacements(g.id)) for (const k of pl.cells || []) (map[k] = map[k] || []).push(pl);
    return map;
  }

  // ---------------- garden list ----------------
  GP.views.gardens = {
    render() {
      const gs = GP.state.gardens;
      return '<div class="head"><h1>' + L('Zahrady', 'Gardens') + '</h1><button class="btn primary" data-act="new">+ ' + L('Nová zahrada', 'New garden') + '</button></div>' +
        (gs.length ? '<div class="cards">' + gs.map(g => {
          const n = GP.gardenPlacements(g.id).length;
          return '<a class="card garden-card" href="#/garden/' + g.id + '">' + miniMap(g) +
            '<h3>' + esc(g.name) + '</h3><p class="muted">' + esc([g.gardenType, g.address].filter(Boolean).join(' · ')) + '</p>' +
            '<p class="small">' + [g.area ? esc(g.area) + ' m²' : '', g.altitude ? esc(g.altitude) + ' m n. m.' : '', (g.soils || []).map(s => GP.optLabel(GP.SOILS, s)).join(', '), n + ' ' + L('rostlin', 'plants')].filter(Boolean).join(' · ') + '</p></a>';
        }).join('') + '</div>'
          : '<div class="empty"><p>' + L('Zatím tu není žádná zahrada. Založte první – zadáte polohu, půdu, okolí a nakreslíte plán.', 'No gardens yet. Create the first one – location, soil, surroundings and a grid plan.') + '</p></div>');
    },
    mount(root) {
      root.querySelector('[data-act=new]').onclick = () => { const g = GP.newGarden(); GP.go('garden/' + g.id + '/info'); };
    }
  };

  function miniMap(g) {
    const { cols, rows } = g.grid;
    const w = 6;
    let rects = '';
    for (const [k, c] of Object.entries(g.cells)) {
      const z = g.zones.find(x => x.id === c.zone);
      if (!z) continue;
      const [x, y] = k.split(',').map(Number);
      rects += '<rect x="' + x * w + '" y="' + y * w + '" width="' + w + '" height="' + w + '" fill="' + esc(z.color) + '"/>';
    }
    return '<svg class="mini" viewBox="0 0 ' + cols * w + ' ' + rows * w + '" preserveAspectRatio="xMidYMid meet"><rect width="100%" height="100%" fill="#f3f1ea"/>' + rects + '</svg>';
  }

  // ---------------- garden detail ----------------
  // Order follows the set-up: basics -> plants -> zones & grid -> plan (built from all of them)
  const TABS = [['info', '📋', 'Základní údaje', 'Basic details'], ['list', '🌱', 'Rostliny', 'Plants'], ['zones', '🎨', 'Zóny a mřížka', 'Zones & grid'], ['plan', '🗺️', 'Plán', 'Plan']];
  const defaultTab = g => (GP.gardenPlacements(g.id).some(pl => pl.cells && pl.cells.length) ? 'plan' : 'info');

  GP.views.garden = {
    render([id, tab]) {
      const g = GP.byId('gardens', id);
      if (!g) return '<p>' + L('Zahrada nenalezena.', 'Garden not found.') + ' <a href="#/gardens">←</a></p>';
      tab = tab || defaultTab(g);
      const tabs = '<div class="tabs">' + TABS.map(([t, i, cs, en]) => '<a href="#/garden/' + g.id + '/' + t + '" class="' + (t === tab ? 'on' : '') + '">' + i + ' ' + L(cs, en) + '</a>').join('') + '</div>';
      const body = tab === 'info' ? infoTab(g) : tab === 'zones' ? zonesTab(g) : tab === 'list' ? listTab(g) : planTab(g);
      return '<div class="head"><h1><a href="#/gardens" class="back">←</a> ' + esc(g.name) + '</h1></div>' + tabs + body;
    },
    mount(root, [id, tab]) {
      const g = GP.byId('gardens', id);
      if (!g) return;
      tab = tab || defaultTab(g);
      if (tab === 'info') mountInfo(root, g);
      else if (tab === 'zones') mountZones(root, g);
      else if (tab === 'list') mountList(root, g);
      else mountPlan(root, g);
    }
  };

  // ----- details -----
  const num = v => parseFloat(String(v == null ? '' : v).replace(',', '.'));
  const areaOf = g => (num(g.width) > 0 && num(g.length) > 0 ? Math.round(num(g.width) * num(g.length) * 10) / 10 : null);

  // Older versions stored soil / water / orientation as free text.
  function migrateGarden(g) {
    if (g.soilType && !g.soils) { g.soils = []; g.soilNote = [g.soilNote, g.soilType].filter(Boolean).join(', '); delete g.soilType; }
    if (g.waterSource && !g.water) { g.water = [{ type: 'other', capacity: '', note: g.waterSource }]; delete g.waterSource; }
    if (g.orientation && !g.aspect) { g.aspectNote = g.orientation; delete g.orientation; }
    g.soils = g.soils || [];
    g.water = g.water || [];
    g.surround = g.surround || {};
    g.surroundH = g.surroundH || {};
    g.surroundD = g.surroundD || {};
    for (const k in g.surround) if (g.surround[k] === 'trees') g.surround[k] = 'selfsown';
    if (g.soilPh && !GP.SOIL_PH.some(o => o[0] === g.soilPh)) { g.soilPhValue = g.soilPh; g.soilPh = GP.phCategory(g.soilPh); }
    // Separate soil / surroundings notes were merged into the single notes field.
    for (const k of ['soilNote', 'surroundings']) {
      if (g[k] && g[k].trim()) g.notes = [g.notes, g[k].trim()].filter(Boolean).join('\n');
      delete g[k];
    }
    // Tank / butt capacity is a number in m³ ("10 m³" -> "10")
    for (const w of g.water) if (w.capacity && /m3|m³/.test(w.capacity)) w.capacity = w.capacity.replace(/\s*m[3³]\s*/g, '').trim();
  }
  const HAS_VOLUME = ['tank', 'barrel'];

  // "JV + 2–7°" -> human sentence
  function slopeText(g) {
    const dir = { N: L('k severu', 'to the north'), NE: L('k severovýchodu', 'to the north-east'), E: L('k východu', 'to the east'), SE: L('k jihovýchodu', 'to the south-east'),
      S: L('k jihu', 'to the south'), SW: L('k jihozápadu', 'to the south-west'), W: L('k západu', 'to the west'), NW: L('k severozápadu', 'to the north-west') }[g.aspect];
    if (g.aspect === 'flat' || g.slope === '0') {
      return L('Pozemek je prakticky rovný', 'The plot is practically flat') + (dir ? ' (' + L('jen nepatrně klesá ', 'only very slightly falling ') + dir + ')' : '') +
        ' – ' + L('orientace na slunce téměř nehraje roli.', 'aspect hardly matters for sun.');
    }
    if (!dir || !g.slope) return '';
    const how = { 1: L('mírně', 'gently'), 2: L('středně', 'moderately'), 3: L('prudce', 'steeply'), 4: L('velmi prudce', 'very steeply') }[g.slope];
    const effect = /S/.test(g.aspect) && !/N/.test(g.aspect) ? L('teplejší, slunné stanoviště, dříve na jaře rozmrzá, rychleji vysychá.', 'warmer and sunnier, thaws earlier in spring, dries faster.')
      : /N/.test(g.aspect) && !/S/.test(g.aspect) ? L('chladnější a stinnější, později rozmrzá, déle drží vlhkost.', 'cooler and shadier, thaws later, stays moist longer.')
        : g.aspect === 'E' ? L('ranní slunce, chráněno před odpoledním žárem.', 'morning sun, sheltered from afternoon heat.') : L('odpolední slunce, teplejší a sušší.', 'afternoon sun, warmer and drier.');
    return L('Pozemek ', 'The plot falls ') + how + ' ' + L('klesá ', '') + dir + ' – ' + effect;
  }

  // Rough length of the shadow an obstacle on side `k` throws into the garden.
  function shadeText(g, k) {
    const h = num(g.surroundH[k]);
    if (!(h > 0)) return '';
    const d = num(g.surroundD[k]) > 0 ? num(g.surroundD[k]) : 0;
    const lat = isNaN(num(g.lat)) ? 50 : num(g.lat);
    const reach = elev => Math.max(0, h / Math.tan(elev * Math.PI / 180) - d);
    const m = x => (x < 0.5 ? '0' : x < 10 ? x.toFixed(1).replace('.', L(',', '.')) : Math.round(x)) + ' m';
    if (k === 'S') {
      return '☀ ' + L('polední stín do zahrady', 'noon shadow into the garden') + ': ' + L('červen', 'June') + ' ' + m(reach(90 - lat + 23.44)) + ', ' +
        L('březen/září', 'Mar/Sep') + ' ' + m(reach(90 - lat)) + ', ' + L('prosinec', 'December') + ' ' + m(reach(90 - lat - 23.44));
    }
    if (k === 'E' || k === 'W') {
      return '☀ ' + (k === 'E' ? L('stíní ráno a dopoledne', 'shades in the morning') : L('stíní odpoledne a večer', 'shades in the afternoon and evening')) +
        ' – ' + L('při slunci 30° nad obzorem dosáhne stín', 'with the sun 30° high the shadow reaches') + ' ~' + m(reach(30));
    }
    return '☀ ' + L('ze severu stín do zahrady téměř nepadá (jen v létě brzy ráno a večer).', 'from the north hardly any shadow falls into the garden (only early and late in summer).');
  }

  const selectHtml = (list, value, attrs) => '<select ' + attrs + '>' + list.map(o => '<option value="' + o[0] + '"' + (o[0] === (value || '') ? ' selected' : '') + '>' + esc(L(o[1], o[2])) + '</option>').join('') + '</select>';

  function infoTab(g) {
    migrateGarden(g);
    const area = areaOf(g);
    const own = '<div class="panel" id="gown"><h2>✏️ ' + L('Vaše údaje', 'Your details') + '</h2><div class="form one">' +
      GP.GARDEN_OWN.map(f => GP.ui.field(f, g[f.key])).join('') +
      '<div class="field"><span class="lbl">' + L('Rozměry (zatím obdélník)', 'Dimensions (rectangle for now)') + '</span><div class="row gap dims">' +
      '<input type="text" inputmode="decimal" data-k="width" value="' + esc(g.width) + '" placeholder="' + L('šířka', 'width') + '"><span>m ×</span>' +
      '<input type="text" inputmode="decimal" data-k="length" value="' + esc(g.length) + '" placeholder="' + L('délka', 'length') + '"><span>m</span></div>' +
      '<div class="row gap small"><span>' + L('Rozloha', 'Area') + ': <b id="areaOut">' + (area ? area.toLocaleString(L('cs-CZ', 'en-GB')) + ' m²' : '—') + '</b></span>' +
      '<button class="link small" data-act="fitgrid">↦ ' + L('nastavit podle toho mřížku plánu', 'size the plan grid to match') + '</button></div></div>' +
      '<div class="field"><span class="lbl">' + L('Orientace a svah', 'Aspect and slope') + '</span><div class="row gap">' +
      selectHtml(GP.ASPECTS, g.aspect, 'data-k="aspect" title="' + L('Kam je svah natočený', 'Which way the slope faces') + '"') +
      selectHtml(GP.SLOPES, g.slope, 'data-k="slope" title="' + L('Sklon', 'Slope') + '"') + '</div>' +
      '<p class="small muted" id="slopeText">' + esc(slopeText(g)) + '</p>' +
      (g.aspectNote ? '<input type="text" data-k="aspectNote" value="' + esc(g.aspectNote) + '">' : '') + '</div>' +
      '<div class="field"><span class="lbl">' + L('Typ půdy (lze vybrat více)', 'Soil type (several allowed)') + '</span><div class="chips" data-chips="soils">' +
      GP.SOILS.map(s => '<button type="button" class="chip' + (g.soils.includes(s[0]) ? ' on' : '') + '" data-v="' + s[0] + '">' + esc(L(s[1], s[2])) + '</button>').join('') + '</div>' +
      '</div>' +
      '<div class="field"><span class="lbl">' + L('Půdní reakce (pH)', 'Soil reaction (pH)') + '</span><div class="row gap">' +
      selectHtml(GP.SOIL_PH, g.soilPh, 'data-k="soilPh" id="phSel"') +
      '<label class="row small">' + L('naměřeno', 'measured') + ' <input type="text" inputmode="decimal" class="num" data-k="soilPhValue" value="' + esc(g.soilPhValue) + '"></label></div></div>' +
      '<div class="field"><span class="lbl">' + L('Zdroje vody', 'Water sources') + '</span><div id="water">' +
      g.water.map((w, i) => '<div class="water-row" data-w="' + i + '">' + selectHtml(GP.WATER_SOURCES, w.type, 'data-wk="type"') +
        (HAS_VOLUME.includes(w.type) ? '<label class="row small">' + L('objem', 'volume') + ' <input type="text" inputmode="decimal" class="num" data-wk="capacity" value="' + esc(w.capacity) + '"> m³</label>' : '<span></span>') +
        '<input type="text" data-wk="note" value="' + esc(w.note) + '" placeholder="' + L('poznámka', 'note') + '"><button class="link danger" data-delw="' + i + '">✕</button></div>').join('') +
      '</div><button class="btn small" data-act="addwater">+ ' + L('Přidat zdroj vody', 'Add water source') + '</button></div>' +
      '<div class="field"><span class="lbl">' + L('Okolí zahrady', 'Surroundings') + '</span><div class="sides">' +
      GP.SIDES.map(([k, cs, en]) => '<div class="side-sel"><span class="small"><b>' + esc(L(cs, en)) + '</b></span>' + selectHtml(GP.SURROUND, g.surround[k], 'data-k="surround.' + k + '"') +
        '<div class="row gap small"><label class="row">' + L('výška', 'height') + ' <input type="text" inputmode="decimal" class="num" data-k="surroundH.' + k + '" value="' + esc(g.surroundH[k]) + '"> m</label>' +
        '<label class="row" title="' + L('Vzdálenost překážky od hranice zahrady', 'Distance of the obstacle from the garden boundary') + '">' + L('od hranice', 'from edge') +
        ' <input type="text" inputmode="decimal" class="num" data-k="surroundD.' + k + '" value="' + esc(g.surroundD[k]) + '"> m</label></div>' +
        '<div class="small warn-text" id="shade-' + k + '">' + esc(shadeText(g, k)) + '</div></div>').join('') + '</div></div>' +
      GP.ui.field({ key: 'notes', type: 'longtext', cs: 'Poznámky', en: 'Notes' }, g.notes) + '</div></div>';

    const hasGps = !isNaN(num(g.lat)) && !isNaN(num(g.lon));
    const site = '<div class="panel" id="gsite"><h2>🌍 ' + L('Poloha a klima (podle GPS)', 'Location and climate (from GPS)') + '</h2>' +
      '<div class="form one"><div class="field"><span class="lbl">GPS</span><div class="row gap dims">' +
      '<input type="text" inputmode="decimal" data-k="lat" value="' + esc(g.lat) + '" placeholder="' + L('šířka, např. 49.1951', 'latitude, e.g. 49.1951') + '">' +
      '<input type="text" inputmode="decimal" data-k="lon" value="' + esc(g.lon) + '" placeholder="' + L('délka, např. 16.6068', 'longitude, e.g. 16.6068') + '"></div>' +
      '<div class="row gap"><button class="btn small" data-act="gps">📍 ' + L('Moje poloha', 'My location') + '</button>' +
      '<button class="btn small" data-act="map">🗺️ ' + L('Vybrat na mapě / hledat adresu', 'Pick on map / search address') + '</button>' +
      (hasGps ? '<a class="btn small" target="_blank" rel="noopener" href="https://mapy.cz/letecka?x=' + encodeURIComponent(num(g.lon)) + '&y=' + encodeURIComponent(num(g.lat)) + '&z=19&source=coor&id=' + encodeURIComponent(num(g.lon) + ',' + num(g.lat)) + '">↗ Mapy.cz</a>' : '') +
      '</div></div>' +
      '<div class="row gap"><button class="btn primary" data-act="fetch"' + (hasGps ? '' : ' disabled') + '>🌐 ' + L('Stáhnout údaje z webu', 'Download data from the web') + '</button>' +
      '<span class="small muted" id="fetchStatus">' + (g.climate ? L('naposledy', 'last') + ' ' + esc(g.climate.fetched) : (hasGps ? '' : L('nejdřív zadejte GPS', 'enter GPS first'))) + '</span></div>' +
      GP.GARDEN_SITE.map(f => GP.ui.field(f, g[f.key])).join('') + '</div>' +
      GP.geo.historyTable(g.climate) +
      '<p class="muted small">' + L('Údaje můžete ručně upravit. Nejnižší zimní teplota se porovnává s mrazuvzdorností rostlin.', 'You can edit the values by hand. The lowest winter temperature is checked against plant hardiness.') + '</p></div>';

    return '<div class="garden-info">' + own + site + '</div>' +
      '<div class="row gap"><button class="btn primary" data-act="save">💾 ' + L('Uložit', 'Save') + '</button><span class="grow"></span>' +
      '<button class="btn danger" data-act="del">' + L('Smazat zahradu', 'Delete garden') + '</button></div>';
  }

  function mountInfo(root, g) {
    GP.ui.bind(root.querySelector('#gown'), g, key => {
      if (key === 'width' || key === 'length') {
        const a = areaOf(g);
        g.area = a ? String(a) : '';
        root.querySelector('#areaOut').textContent = a ? a.toLocaleString(L('cs-CZ', 'en-GB')) + ' m²' : '—';
      }
      if (key === 'aspect' || key === 'slope') root.querySelector('#slopeText').textContent = slopeText(g);
      if (key === 'soilPhValue' && GP.phCategory(g.soilPhValue)) {
        g.soilPh = GP.phCategory(g.soilPhValue);
        root.querySelector('#phSel').value = g.soilPh;
      }
      const side = /^surround[HD]?\.(\w+)$/.exec(key);
      if (side) root.querySelector('#shade-' + side[1]).textContent = shadeText(g, side[1]);
    });
    GP.ui.bind(root.querySelector('#gsite'), g, key => {
      if (key === 'lat' || key === 'lon') root.querySelector('[data-act=fetch]').disabled = isNaN(num(g.lat)) || isNaN(num(g.lon));
    });

    root.querySelector('[data-chips=soils]').addEventListener('click', e => {
      const b = e.target.closest('.chip');
      if (!b) return;
      b.classList.toggle('on');
      g.soils = [...root.querySelectorAll('[data-chips=soils] .chip.on')].map(x => x.dataset.v);
      GP.save();
    });
    const water = root.querySelector('#water');
    const wupd = e => {
      const row = e.target.closest('[data-w]'), k = e.target.dataset.wk;
      if (!row || !k) return;
      g.water[+row.dataset.w][k] = e.target.value;
      if (k === 'type' && e.type === 'change') { GP.saveNow(); GP.render(); return; } // volume field only for tanks
      GP.save();
    };
    water.addEventListener('input', wupd);
    water.addEventListener('change', wupd);
    water.addEventListener('click', e => {
      const d = e.target.closest('[data-delw]');
      if (d) { g.water.splice(+d.dataset.delw, 1); GP.saveNow(); GP.render(); }
    });
    root.querySelector('[data-act=addwater]').onclick = () => { g.water.push({ type: g.water.length ? 'mains' : 'tank', capacity: '', note: '' }); GP.saveNow(); GP.render(); };

    root.querySelector('[data-act=fitgrid]').onclick = () => {
      const w = num(g.width), l = num(g.length);
      if (!(w > 0 && l > 0)) return GP.ui.toast(L('Nejdřív zadejte šířku a délku.', 'Enter width and length first.'));
      let cell = g.grid.cellM || 1;
      while (Math.max(w, l) / cell > 120) cell *= 2; // keep the grid manageable for big plots
      g.grid = { cols: Math.max(2, Math.ceil(w / cell)), rows: Math.max(2, Math.ceil(l / cell)), cellM: cell };
      GP.saveNow();
      GP.ui.toast(L('Mřížka plánu', 'Plan grid') + ': ' + g.grid.cols + ' × ' + g.grid.rows + ' (' + cell + ' m)');
    };

    const setGps = async (lat, lon) => {
      g.lat = String(lat); g.lon = String(lon);
      GP.saveNow(); GP.render();
      await fetchData();
    };
    async function fetchData() {
      const st = document.getElementById('fetchStatus'), btn = document.querySelector('[data-act=fetch]');
      if (st) st.textContent = L('Stahuji adresu, výšku a klima za 5 let…', 'Downloading address, altitude and 5 years of climate…');
      if (btn) btn.disabled = true;
      try {
        const problems = await GP.geo.fillGarden(g);
        GP.render();
        GP.ui.toast(problems.length ? L('Nepodařilo se stáhnout: ', 'Could not download: ') + problems.join(', ') : L('Údaje staženy ✓', 'Data downloaded ✓'));
      } catch (e) {
        if (st) st.textContent = e.message;
        if (btn) btn.disabled = false;
      }
    }
    root.querySelector('[data-act=fetch]').onclick = fetchData;
    root.querySelector('[data-act=gps]').onclick = async e => {
      const b = e.currentTarget;
      b.disabled = true;
      b.textContent = '📍 ' + L('Zjišťuji polohu…', 'Locating…');
      try {
        const pos = await GP.geo.current();
        await setGps(pos.coords.latitude.toFixed(6), pos.coords.longitude.toFixed(6));
        if (pos.coords.accuracy > 200) GP.ui.toast(L('Poloha je jen přibližná (±', 'Location is approximate (±') + Math.round(pos.coords.accuracy) + ' m) – ' + L('upřesněte ji na mapě.', 'refine it on the map.'));
      } catch (err) {
        b.disabled = false;
        b.textContent = '📍 ' + L('Moje poloha', 'My location');
        alert(err.message);
      }
    };
    root.querySelector('[data-act=map]').onclick = async () => {
      try {
        const p = await GP.geo.pickOnMap(num(g.lat), num(g.lon));
        if (p) await setGps(p.lat, p.lon);
      } catch (err) { alert(err.message); }
    };
    root.querySelector('[data-act=save]').onclick = () => { GP.saveNow(); GP.ui.toast(L('Uloženo ✓', 'Saved ✓')); };
    root.querySelector('[data-act=del]').onclick = () => {
      if (!confirm(L('Opravdu smazat zahradu „' + g.name + '“ i s jejím plánem?', 'Really delete garden "' + g.name + '" and its plan?'))) return;
      GP.state.gardens = GP.state.gardens.filter(x => x !== g);
      GP.state.placements = GP.state.placements.filter(p => p.gardenId !== g.id);
      GP.saveNow();
      GP.go('gardens');
    };
  }

  // ----- zones & grid -----
  function zonesTab(g) {
    const sel = (list, v, k) => '<select data-z="' + k + '">' + list.map(o => '<option value="' + o[0] + '"' + (o[0] === (v || '') ? ' selected' : '') + '>' + esc(L(o[1], o[2])) + '</option>').join('') + '</select>';
    return '<div class="panel"><h2>' + L('Mřížka plánu', 'Plan grid') + '</h2><div class="form">' +
      '<label class="field"><span class="lbl">' + L('Sloupců', 'Columns') + '</span><input type="number" min="2" max="200" data-grid="cols" value="' + g.grid.cols + '"></label>' +
      '<label class="field"><span class="lbl">' + L('Řádků', 'Rows') + '</span><input type="number" min="2" max="200" data-grid="rows" value="' + g.grid.rows + '"></label>' +
      '<label class="field"><span class="lbl">' + L('Velikost políčka (m)', 'Cell size (m)') + '</span><input type="number" min="0.1" step="0.1" data-grid="cellM" value="' + g.grid.cellM + '"></label>' +
      '<div class="field"><span class="lbl">' + L('Plán pokrývá', 'Plan covers') + '</span><b>' + +(g.grid.cols * g.grid.cellM).toFixed(1) + ' × ' + +(g.grid.rows * g.grid.cellM).toFixed(1) + ' m</b></div></div>' +
      '<h3>' + L('Podklad (mapa, letecký snímek, nákres)', 'Background (map, aerial photo, drawing)') + '</h3>' +
      '<div class="row gap"><label class="btn">🖼️ ' + L('Nahrát obrázek', 'Upload image') + '<input type="file" accept="image/*" data-act="bg" hidden></label>' +
      (g.background ? '<label class="row small">' + L('Průhlednost plánu', 'Plan opacity') + ' <input type="range" min="0" max="1" step="0.05" value="' + (g.bgOpacity == null ? 0.55 : g.bgOpacity) + '" data-act="opacity"></label><button class="btn" data-act="nobg">✕ ' + L('Odebrat podklad', 'Remove background') + '</button>' : '') +
      '</div>' + (g.background ? '<img class="bg-preview" src="' + g.background + '" alt="">' : '') + '</div>' +
      '<div class="panel"><h2>' + L('Zóny', 'Zones') + '</h2><p class="muted">' + L('Zóny malujete do plánu (režim 🎨). Světlo a vlhkost zóny se použijí pro kontrolu vhodnosti rostlin; jednotlivá políčka lze upravit.', 'Paint zones onto the plan (🎨 mode). Zone light and moisture are used to check plant suitability; single cells can be overridden.') + '</p>' +
      '<table class="tbl zones"><thead><tr><th></th><th>' + L('Název', 'Name') + '</th><th>' + L('Světlo', 'Light') + '</th><th>' + L('Vlhkost', 'Moisture') + '</th><th></th></tr></thead><tbody>' +
      g.zones.map(z => '<tr data-zone="' + z.id + '"><td><input type="color" data-z="color" value="' + esc(z.color) + '"></td><td><input type="text" data-z="name" value="' + esc(z.name) + '"></td><td>' +
        sel(GP.CELL_LIGHT, z.light, 'light') + '</td><td>' + sel(GP.CELL_WATER, z.water, 'water') + '</td><td><button class="link danger" data-act="delzone">✕</button></td></tr>').join('') +
      '</tbody></table><button class="btn" data-act="addzone">+ ' + L('Přidat zónu', 'Add zone') + '</button></div>';
  }
  function mountZones(root, g) {
    root.querySelectorAll('[data-grid]').forEach(inp => inp.onchange = () => {
      const k = inp.dataset.grid, v = parseFloat(inp.value);
      if (!(v > 0)) return;
      g.grid[k] = k === 'cellM' ? v : Math.min(200, Math.max(2, Math.round(v)));
      GP.saveNow(); GP.render();
    });
    root.querySelector('[data-act=bg]').onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      g.background = await GP.ui.readImage(f, 1800);
      GP.saveNow(); GP.render();
    };
    const op = root.querySelector('[data-act=opacity]');
    if (op) op.oninput = () => { g.bgOpacity = +op.value; GP.save(); };
    const nobg = root.querySelector('[data-act=nobg]');
    if (nobg) nobg.onclick = () => { delete g.background; GP.saveNow(); GP.render(); };
    root.querySelector('[data-act=addzone]').onclick = () => {
      g.zones.push({ id: GP.uid(), name: L('Nová zóna', 'New zone'), color: '#' + Math.floor(0x888888 + Math.random() * 0x777777).toString(16).padStart(6, '0'), light: '', water: '' });
      GP.saveNow(); GP.render();
    };
    root.querySelectorAll('tr[data-zone]').forEach(tr => {
      const z = g.zones.find(x => x.id === tr.dataset.zone);
      tr.addEventListener('input', e => { if (e.target.dataset.z) { z[e.target.dataset.z] = e.target.value; GP.save(); } });
      tr.addEventListener('change', e => { if (e.target.dataset.z) { z[e.target.dataset.z] = e.target.value; GP.save(); } });
      tr.querySelector('[data-act=delzone]').onclick = () => {
        if (!confirm(L('Smazat zónu „' + z.name + '“?', 'Delete zone "' + z.name + '"?'))) return;
        g.zones = g.zones.filter(x => x !== z);
        for (const c of Object.values(g.cells)) if (c.zone === z.id) delete c.zone;
        GP.saveNow(); GP.render();
      };
    });
  }

  // ----- plants in this garden (list) -----
  function listTab(g) {
    const pls = GP.state.placements.filter(p => p.gardenId === g.id);
    const byCell = placementsByCell(g);
    if (!pls.length) return '<div class="empty"><p>' + L('V zahradě zatím nejsou rostliny. Přidejte je v plánu (vyberte rostlinu a klikněte do mřížky), na kartě rostliny, nebo při importu CSV.', 'No plants in this garden yet. Add them on the plan (pick a plant, click the grid), from a plant card, or during CSV import.') + '</p></div>';
    return '<div class="panel"><table class="tbl"><thead><tr><th>' + L('Rostlina', 'Plant') + '</th><th>' + L('Umístění', 'Position') + '</th><th>' + L('Na plánu', 'On plan') + '</th><th>' + L('Stav', 'Status') + '</th><th>' + L('Vysazeno dne', 'Planted on') + '</th><th>' + L('Ks', 'Qty') + '</th><th>' + L('Upozornění', 'Warnings') + '</th></tr></thead><tbody>' +
      pls.map(pl => {
        const p = GP.byId('plants', pl.plantId);
        const issues = [...new Set((pl.cells && pl.cells.length ? pl.cells : [null]).flatMap(k => GP.plantIssues(p, g, k, byCell)))];
        return '<tr data-pl="' + pl.id + '"><td>' + GP.ui.swatch(GP.colorHex(p)) + ' <a href="#/plant/' + pl.plantId + '">' + esc(GP.plantName(p)) + '</a></td>' +
          '<td><input type="text" data-k="position" value="' + esc(pl.position) + '"></td>' +
          '<td class="small">' + (pl.cells && pl.cells.length ? pl.cells.slice(0, 6).map(GP.cellName).join(', ') + (pl.cells.length > 6 ? '…' : '') : '<span class="tag warn">' + L('neumístěno', 'not placed') + '</span>') + '</td>' +
          '<td><select data-k="status">' + GP.STATUSES.map(s => '<option value="' + s[0] + '"' + (pl.status === s[0] ? ' selected' : '') + '>' + esc(L(s[1], s[2])) + '</option>').join('') + '</select></td>' +
          '<td><input type="date" data-k="plantedDate" value="' + esc(pl.plantedDate) + '"></td>' +
          '<td><input type="text" class="num" data-k="count" value="' + esc(pl.count) + '"></td>' +
          '<td class="small warn-text">' + issues.map(esc).join('<br>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function mountList(root) {
    root.querySelectorAll('tr[data-pl]').forEach(tr => {
      const pl = GP.byId('placements', tr.dataset.pl);
      const upd = e => { if (e.target.dataset.k) { pl[e.target.dataset.k] = e.target.value; GP.save(); } };
      tr.addEventListener('input', upd);
      tr.addEventListener('change', upd);
    });
  }

  // ----- plan -----
  function planTab(g) {
    const { cols, rows } = g.grid;
    const byCell = placementsByCell(g);
    const modeBtn = (m, icon, cs, en) => '<button class="seg' + (ui.mode === m ? ' on' : '') + '" data-mode="' + m + '">' + icon + ' ' + L(cs, en) + '</button>';
    let tools = '<div class="toolbar">' + modeBtn('plants', '🌱', 'Rostliny', 'Plants') + modeBtn('zones', '🎨', 'Zóny', 'Zones') + modeBtn('season', '🌸', 'Sezóna', 'Season') +
      '<span class="grow"></span><button class="seg" data-zoom="-1" title="' + L('Oddálit', 'Zoom out') + '">−</button><button class="seg" data-zoom="1" title="' + L('Přiblížit', 'Zoom in') + '">+</button></div>';
    if (ui.mode === 'season') {
      tools += '<div class="toolbar season-bar"><button class="seg" data-act="play">' + (ui.playing ? '⏸' : '▶') + '</button>' +
        '<input type="range" min="1" max="12" value="' + ui.month + '" data-act="month"><b class="month-name">' + esc(GP.monthName(ui.month)) + '</b></div>';
    }

    let cells = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const key = c + ',' + r, ci = cellInfo(g, key), pls = byCell[key] || [];
      let style = '', content = '', cls = 'cell';
      const zc = ci.zone ? ci.zone.color : null;
      if (ui.mode === 'zones') {
        if (zc) style = 'background:' + zc;
      } else if (ui.mode === 'season') {
        const plants = pls.map(pl => GP.byId('plants', pl.plantId)).filter(Boolean);
        const blooming = [...new Set(plants.filter(p => (p.bloomMonths || []).includes(ui.month)).map(GP.colorHex))];
        if (blooming.length === 1) style = 'background:' + blooming[0];
        else if (blooming.length > 1) style = 'background:linear-gradient(135deg,' + blooming.map((h, i) => h + ' ' + Math.round(i * 100 / blooming.length) + '% ' + Math.round((i + 1) * 100 / blooming.length) + '%').join(',') + ')';
        else if (plants.some(p => p.evergreen === true)) style = 'background:#4f7d45';
        else if (plants.length) style = 'background:#c9dbb8';
        else if (zc) style = 'background:' + zc + '40';
        if (plants.some(p => (p.harvestMonths || []).includes(ui.month))) content = '<i class="fruit">🍎</i>';
        if (blooming.length) cls += ' bloom';
      } else {
        if (zc) style = 'background:' + zc + '66';
        if (pls.length) {
          const p = GP.byId('plants', pls[0].plantId);
          const hex = GP.colorHex(p);
          content = '<i class="dot" style="background:' + (hex || '#6a9c55') + '"></i><span class="lab">' + esc(abbr(GP.plantName(p))) + (pls.length > 1 ? '<sup>+' + (pls.length - 1) + '</sup>' : '') + '</span>';
          if (pls.some(pl => GP.plantIssues(GP.byId('plants', pl.plantId), g, key, byCell).length)) content += '<i class="warn-dot">!</i>';
          if (pls.some(pl => pl.status === 'wish' || pl.status === 'planned')) cls += ' planned';
        }
      }
      if (ui.cell === key) cls += ' sel';
      if (ui.move && ui.move.from === key) cls += ' moving';
      const title = GP.cellName(key) + (ci.zone ? ' · ' + ci.zone.name : '') + pls.map(pl => '\n• ' + GP.plantName(GP.byId('plants', pl.plantId))).join('');
      cells += '<div class="' + cls + '" data-cell="' + key + '" style="' + style + '" title="' + esc(title) + '">' + content + '</div>';
    }
    const bg = g.background ? 'background-image:url(' + g.background + ');' : '';
    const grid = '<div class="grid-wrap" id="gridWrap"><div class="grid ' + ui.mode + '" id="grid" style="--cols:' + cols + ';--rows:' + rows + ';' + bg + '--op:' + (g.background ? (g.bgOpacity == null ? 0.55 : g.bgOpacity) : 1) + '">' + cells + '</div></div>';
    const scale = '<p class="muted small">' + L('1 políčko', '1 cell') + ' = ' + g.grid.cellM + ' × ' + g.grid.cellM + ' m · ' + cols + ' × ' + rows + '</p>';
    return tools + '<div class="plan"><aside class="side">' + sidePanel(g, byCell) + '</aside><div class="plan-main">' + grid + scale + '</div></div>';
  }

  const abbr = name => (name.replace(/['‘’"]/g, '').trim().split(/\s+/)[0] || '?').slice(0, 3);

  function sidePanel(g, byCell) {
    if (ui.mode === 'zones') {
      return '<h3>' + L('Štětec', 'Brush') + '</h3><div class="zone-list">' + g.zones.map(z =>
        '<button class="zone-btn' + (ui.zoneSel === z.id ? ' on' : '') + '" data-zone="' + z.id + '"><span class="sw" style="background:' + esc(z.color) + '"></span>' + esc(z.name) + '</button>').join('') +
        '<button class="zone-btn' + (ui.zoneSel === '' ? ' on' : '') + '" data-zone=""><span class="sw eraser"></span>' + L('Guma', 'Eraser') + '</button></div>' +
        '<p class="muted small">' + L('Vyberte zónu a táhněte po plánu (myší i prstem).', 'Pick a zone and drag over the plan (mouse or finger).') + '</p>' +
        '<a href="#/garden/' + g.id + '/zones" class="small">⚙ ' + L('Upravit zóny, velikost mřížky a podklad', 'Edit zones, grid size and background') + '</a>';
    }
    if (ui.mode === 'season') {
      const pls = GP.gardenPlacements(g.id).filter(pl => pl.status !== 'wish');
      const plants = [...new Set(pls.map(pl => pl.plantId))].map(id => GP.byId('plants', id)).filter(Boolean);
      const bloom = plants.filter(p => (p.bloomMonths || []).includes(ui.month));
      const harvest = plants.filter(p => (p.harvestMonths || []).includes(ui.month));
      const noData = plants.filter(p => !(p.bloomMonths || []).length).length;
      const item = p => '<li>' + GP.ui.swatch(GP.colorHex(p)) + ' <a href="#/plant/' + p.id + '">' + esc(GP.plantName(p)) + '</a> <span class="muted small">' + esc(p.flowerColor || '') + '</span></li>';
      return '<h3>' + esc(GP.monthName(ui.month)) + '</h3><h4>🌸 ' + L('Kvete', 'Flowering') + ' (' + bloom.length + ')</h4><ul class="plain">' + (bloom.map(item).join('') || '<li class="muted">—</li>') + '</ul>' +
        (harvest.length ? '<h4>🍎 ' + L('Zraje / sklizeň', 'Ripening / harvest') + '</h4><ul class="plain">' + harvest.map(item).join('') + '</ul>' : '') +
        '<p class="muted small">' + L('Barvy = barva květů. Tmavě zelená = stálezelené, světle zelená = bez květu.', 'Colours = flower colour. Dark green = evergreen, light green = not flowering.') + '</p>' +
        (noData ? '<p class="small warn-text">' + noData + ' ' + L('rostlin nemá vyplněno, kdy kvete.', 'plants have no flowering months yet.') + '</p>' : '');
    }
    return (ui.cell ? cellPanel(g, ui.cell, byCell) : '') + palette(g);
  }

  function cellPanel(g, key, byCell) {
    const ci = cellInfo(g, key), pls = byCell[key] || [];
    const sel = (list, v, k) => '<select data-cellk="' + k + '">' + list.map(o => '<option value="' + o[0] + '"' + (o[0] === (v || '') ? ' selected' : '') + '>' + esc(L(o[1], o[2])) + '</option>').join('') + '</select>';
    return '<div class="cell-panel"><div class="row"><h3>' + L('Políčko', 'Cell') + ' ' + GP.cellName(key) + '</h3><span class="grow"></span><button class="link" data-act="closecell">✕</button></div>' +
      '<div class="mini-form"><label>' + L('Zóna', 'Zone') + ' <select data-cellk="zone"><option value="">—</option>' + g.zones.map(z => '<option value="' + z.id + '"' + (ci.c.zone === z.id ? ' selected' : '') + '>' + esc(z.name) + '</option>').join('') + '</select></label>' +
      '<label>' + L('Světlo', 'Light') + ' ' + sel(GP.CELL_LIGHT, ci.c.light, 'light') + '</label>' +
      '<label>' + L('Vlhkost', 'Moisture') + ' ' + sel(GP.CELL_WATER, ci.c.water, 'water') + '</label>' +
      '<label class="wide">' + L('Poznámka', 'Note') + ' <input type="text" data-cellk="note" value="' + esc(ci.c.note) + '"></label></div>' +
      (ci.zone && (ci.zone.light || ci.zone.water) && !ci.c.light && !ci.c.water ? '<p class="muted small">' + L('Podle zóny', 'From zone') + ': ' + esc([GP.optLabel(GP.CELL_LIGHT, ci.zone.light), GP.optLabel(GP.CELL_WATER, ci.zone.water)].filter(Boolean).join(', ')) + '</p>' : '') +
      '<ul class="plain cell-plants">' + (pls.map(pl => {
        const p = GP.byId('plants', pl.plantId), issues = GP.plantIssues(p, g, key, byCell);
        return '<li>' + GP.ui.swatch(GP.colorHex(p)) + ' <a href="#/plant/' + pl.plantId + '">' + esc(GP.plantName(p)) + '</a> <span class="tag">' + esc(GP.statusLabel(pl.status)) + '</span>' +
          '<span class="grow"></span><button class="link" data-movepl="' + pl.id + '" title="' + L('Přesunout na jiné políčko', 'Move to another cell') + '">↔</button>' +
          '<button class="link danger" data-unplace="' + pl.id + '" title="' + L('Odebrat z políčka', 'Remove from cell') + '">✕</button>' +
          (issues.length ? '<div class="small warn-text">' + issues.map(esc).join('<br>') + '</div>' : '') + '</li>';
      }).join('') || '<li class="muted small">' + L('Prázdné políčko. Vyberte rostlinu níže a klikněte sem.', 'Empty cell. Pick a plant below and click here.') + '</li>') + '</ul>' +
      (ui.move ? '<p class="small hint">↔ ' + L('Klikněte na cílové políčko…', 'Click the target cell…') + ' <button class="link" data-act="cancelmove">' + L('zrušit', 'cancel') + '</button></p>' : '') + '</div>';
  }

  function palette(g) {
    const sel = ui.sel ? GP.byId('plants', ui.sel) : null;
    const inGarden = GP.gardenPlacements(g.id);
    const q = GP.norm(ui.q);
    const matches = GP.state.plants.filter(p => !q || GP.norm([p.name_cs, p.name_sk, p.name_en, p.name_la, p.cultivar].join(' ')).includes(q))
      .sort((a, b) => GP.plantName(a).localeCompare(GP.plantName(b))).slice(0, 60);
    const item = (p, extra) => '<li class="pal' + (ui.sel === p.id ? ' on' : '') + '" draggable="true" data-pick="' + p.id + '">' + GP.ui.swatch(GP.colorHex(p) || '#6a9c55') + ' ' + esc(GP.plantName(p)) + (extra || '') + '</li>';
    const unplaced = inGarden.filter(pl => !(pl.cells && pl.cells.length));
    return '<div class="palette">' +
      (sel ? '<div class="picked">✚ <b>' + esc(GP.plantName(sel)) + '</b><span class="grow"></span><button class="link" data-act="unpick">✕</button><div class="small muted">' + L('Klikejte do plánu pro přidání (i více políček), nebo přetáhněte.', 'Click cells on the plan to add (several allowed), or drag.') + '</div></div>'
        : '<p class="muted small">' + L('Vyberte rostlinu a klikněte do plánu, nebo ji přetáhněte. Kliknutím na políčko zobrazíte detail.', 'Pick a plant and click the plan, or drag it. Click a cell to see its details.') + '</p>') +
      (unplaced.length ? '<h4>' + L('Čeká na umístění', 'Waiting to be placed') + ' (' + unplaced.length + ')</h4><ul class="plain pal-list">' +
        unplaced.map(pl => { const p = GP.byId('plants', pl.plantId); return p ? item(p, pl.position ? ' <span class="muted small">· ' + esc(pl.position) + '</span>' : '') : ''; }).join('') + '</ul>' : '') +
      '<h4>' + L('Katalog rostlin', 'Plant catalog') + '</h4><input type="search" data-act="q" placeholder="' + L('Hledat (CZ/SK/EN/latinsky)…', 'Search (CZ/SK/EN/Latin)…') + '" value="' + esc(ui.q) + '">' +
      '<ul class="plain pal-list" id="palList">' + (matches.map(p => item(p)).join('') || '<li class="muted small">' + (GP.state.plants.length ? L('Nic nenalezeno', 'Nothing found') : '<a href="#/plants">' + L('Katalog je prázdný – přidejte nebo importujte rostliny', 'Catalog is empty – add or import plants') + '</a>') + '</li>') + '</ul></div>';
  }

  // Add a plant to a cell, reusing its existing planting in this garden.
  function addToCell(g, plantId, key) {
    let pl = GP.state.placements.find(x => x.gardenId === g.id && x.plantId === plantId && x.status !== 'removed' && !(x.cells && x.cells.length)) ||
      GP.state.placements.find(x => x.gardenId === g.id && x.plantId === plantId && x.status !== 'removed');
    if (!pl) {
      pl = { id: GP.uid(), plantId, gardenId: g.id, cells: [], status: 'planned', position: '', plantedDate: '', count: '', notes: '' };
      GP.state.placements.push(pl);
    }
    pl.cells = pl.cells || [];
    if (!pl.cells.includes(key)) pl.cells.push(key);
    GP.save();
  }

  let playTimer = null;
  function mountPlan(root, g) {
    const wrap = root.querySelector('#gridWrap'), grid = root.querySelector('#grid');
    const fit = () => Math.max(16, Math.min(56, Math.floor((wrap.clientWidth - 4) / g.grid.cols)));
    grid.style.setProperty('--cell', (ui.zoom || fit()) + 'px');
    if (ui.scroll && ui.scroll.id === g.id) { wrap.scrollLeft = ui.scroll.x; wrap.scrollTop = ui.scroll.y; }
    const rerender = () => { ui.scroll = { id: g.id, x: wrap.scrollLeft, y: wrap.scrollTop }; GP.render(); };

    root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
      ui.mode = b.dataset.mode; ui.move = null;
      if (ui.mode === 'zones' && ui.zoneSel == null && g.zones[0]) ui.zoneSel = g.zones[0].id;
      stopPlay(); rerender();
    });
    root.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => {
      const cur = ui.zoom || fit();
      ui.zoom = Math.max(12, Math.min(96, Math.round(cur * (b.dataset.zoom === '1' ? 1.25 : 0.8))));
      rerender();
    });

    if (ui.mode === 'season') {
      const m = root.querySelector('[data-act=month]');
      m.oninput = () => { ui.month = +m.value; rerender(); };
      root.querySelector('[data-act=play]').onclick = () => {
        if (ui.playing) return stopPlay(), rerender();
        ui.playing = true;
        playTimer = setInterval(() => {
          if (!location.hash.startsWith('#/garden/' + g.id) || ui.mode !== 'season') return stopPlay();
          ui.month = ui.month % 12 + 1; rerender();
        }, 1100);
        rerender();
      };
      return;
    }

    if (ui.mode === 'zones') {
      root.querySelectorAll('[data-zone]').forEach(b => b.onclick = () => { ui.zoneSel = b.dataset.zone; rerender(); });
      let painting = false;
      const paint = el => {
        const cellEl = el && el.closest && el.closest('[data-cell]');
        if (!cellEl || ui.zoneSel == null) return;
        const key = cellEl.dataset.cell, z = g.zones.find(x => x.id === ui.zoneSel);
        const c = g.cells[key] || {};
        if (z) c.zone = z.id; else delete c.zone;
        if (Object.keys(c).length) g.cells[key] = c; else delete g.cells[key];
        cellEl.style.background = z ? z.color : '';
      };
      grid.addEventListener('pointerdown', e => { painting = true; grid.setPointerCapture(e.pointerId); paint(e.target); e.preventDefault(); });
      grid.addEventListener('pointermove', e => { if (painting) paint(document.elementFromPoint(e.clientX, e.clientY)); });
      const end = () => { if (painting) { painting = false; GP.save(); } };
      grid.addEventListener('pointerup', end);
      grid.addEventListener('pointercancel', end);
      return;
    }

    // plants mode
    grid.addEventListener('click', e => {
      const cellEl = e.target.closest('[data-cell]');
      if (!cellEl) return;
      const key = cellEl.dataset.cell;
      if (ui.move) {
        const pl = GP.byId('placements', ui.move.pl);
        if (pl) { pl.cells = pl.cells.filter(k => k !== ui.move.from); if (!pl.cells.includes(key)) pl.cells.push(key); GP.save(); }
        ui.move = null; ui.cell = key;
      } else if (ui.sel) {
        addToCell(g, ui.sel, key); ui.cell = key;
      } else {
        ui.cell = ui.cell === key ? null : key;
      }
      rerender();
    });
    grid.addEventListener('dragover', e => { if (e.target.closest('[data-cell]')) { e.preventDefault(); e.target.closest('[data-cell]').classList.add('drop'); } });
    grid.addEventListener('dragleave', e => { const c = e.target.closest('[data-cell]'); if (c) c.classList.remove('drop'); });
    grid.addEventListener('drop', e => {
      const cellEl = e.target.closest('[data-cell]'), id = e.dataTransfer.getData('text/plain');
      if (!cellEl || !GP.byId('plants', id)) return;
      e.preventDefault();
      addToCell(g, id, cellEl.dataset.cell); ui.cell = cellEl.dataset.cell;
      rerender();
    });

    const side = root.querySelector('.side');
    side.addEventListener('dragstart', e => { const li = e.target.closest('[data-pick]'); if (li) e.dataTransfer.setData('text/plain', li.dataset.pick); });
    side.addEventListener('click', e => {
      const t = e.target;
      const pick = t.closest('[data-pick]');
      if (pick) { ui.sel = ui.sel === pick.dataset.pick ? null : pick.dataset.pick; ui.move = null; return rerender(); }
      if (t.closest('[data-act=unpick]')) { ui.sel = null; return rerender(); }
      if (t.closest('[data-act=closecell]')) { ui.cell = null; ui.move = null; return rerender(); }
      if (t.closest('[data-act=cancelmove]')) { ui.move = null; return rerender(); }
      const mv = t.closest('[data-movepl]');
      if (mv) { ui.move = { pl: mv.dataset.movepl, from: ui.cell }; ui.sel = null; return rerender(); }
      const un = t.closest('[data-unplace]');
      if (un) { const pl = GP.byId('placements', un.dataset.unplace); pl.cells = pl.cells.filter(k => k !== ui.cell); GP.save(); return rerender(); }
    });
    side.addEventListener('change', e => {
      const k = e.target.dataset.cellk;
      if (!k || !ui.cell) return;
      const c = g.cells[ui.cell] || {};
      if (e.target.value) c[k] = e.target.value; else delete c[k];
      if (Object.keys(c).length) g.cells[ui.cell] = c; else delete g.cells[ui.cell];
      GP.save(); rerender();
    });
    const q = side.querySelector('[data-act=q]');
    if (q) q.oninput = () => {
      ui.q = q.value;
      const pos = q.selectionStart;
      rerender();
      const nq = document.querySelector('.side [data-act=q]');
      if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); }
    };
  }
  function stopPlay() { clearInterval(playTimer); playTimer = null; ui.playing = false; }
})(window.GP);
