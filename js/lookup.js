// Fill plant data from open databases: Wikidata (names CZ/SK/EN/Latin, photo) and GBIF (accepted name, genus, family, synonyms).
(function (GP) {
  const W = 'https://www.wikidata.org/w/api.php?format=json&origin=*&';
  const GBIF = 'https://api.gbif.org/v1/';
  // answers are kept for the session: many plants share a genus ("Rododendron 'X'") and ask the same questions
  const cache = new Map();
  const getJson = url => {
    if (!cache.has(url)) {
      const pr = fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
      pr.catch(() => cache.delete(url));
      cache.set(url, pr);
    }
    return cache.get(url);
  };
  const RANKS = { Q7432: 'species', Q34740: 'genus', Q35409: 'family', Q767728: 'variety', Q68947: 'subspecies', Q4886: 'cultivar', Q2455704: 'subfamily', Q3238261: 'subgenus' };

  const snak = (e, p) => (((e.claims || {})[p] || [])[0] || {}).mainsnak || {};
  const claimVal = (e, p) => (snak(e, p).datavalue || {}).value;
  const label = (e, lang) => ((e.labels || {})[lang] || {}).value || '';
  const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  async function entities(ids) {
    if (!ids.length) return [];
    const d = await getJson(W + 'action=wbgetentities&props=labels|claims|descriptions&languages=cs|sk|en&ids=' + ids.join('|'));
    return ids.map(id => d.entities[id]).filter(e => e && !e.missing);
  }
  function toTaxon(e) {
    const rank = (claimVal(e, 'P105') || {}).id;
    return {
      qid: e.id, latin: claimVal(e, 'P225') || '', rank: RANKS[rank] || '', image: claimVal(e, 'P18') || '',
      cs: label(e, 'cs'), sk: label(e, 'sk'), en: label(e, 'en'),
      desc: ((e.descriptions || {})[GP.state.settings.lang] || (e.descriptions || {}).cs || (e.descriptions || {}).en || {}).value || ''
    };
  }
  // Search hits -> taxa (things that are fruit / produce point to their taxon via "natural product of taxon")
  async function taxaFor(query, lang) {
    const s = await getJson(W + 'action=wbsearchentities&type=item&limit=8&language=' + lang + '&uselang=' + lang + '&search=' + encodeURIComponent(query));
    const ents = await entities(s.search.map(x => x.id));
    const out = [], via = [];
    for (const e of ents) {
      if (claimVal(e, 'P225')) out.push(toTaxon(e));
      else if (claimVal(e, 'P1582')) via.push(claimVal(e, 'P1582').id);
    }
    if (via.length) out.push(...(await entities(via)).filter(e => claimVal(e, 'P225')).map(toTaxon));
    const seen = new Set();
    return out.filter(t => !seen.has(t.qid) && seen.add(t.qid) && t.rank !== 'family');
  }

  // Drop animals & co. with the same name ("blýskavka" is also a moth): GBIF tells the kingdom. Unknown names stay.
  async function onlyPlants(taxa) {
    const top = taxa.slice(0, 6);
    const kingdoms = await Promise.all(top.map(t => getJson(GBIF + 'species/match?name=' + encodeURIComponent(t.latin)).then(m => m.kingdom || '', () => '')));
    return top.filter((t, i) => !kingdoms[i] || kingdoms[i] === 'Plantae');
  }

  // Name as typed in the catalog -> candidate taxa + the words left over after the matched part (a cultivar, usually).
  // "Malina tulameen" -> malina (Rubus idaeus) + "tulameen"; "pozdní Švestka Haroma" -> švestka + "Haroma".
  GP.lookup = {};
  GP.lookup.find = async function (p, typed) {
    if (!typed && p.name_la) {
      const t = await onlyPlants(await taxaFor(p.name_la.replace(/['‘’"].*$/, '').trim(), 'en'));
      if (t.length) return { candidates: t, rest: '' };
    }
    const text = (typed || [p.name_cs, p.name_sk].filter(Boolean)[0] || p.name_en || '')
      .replace(/['‘’‚"“”„´`][^'‘’‚"“”„´`]*['‘’‚"“”„´`]/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/[?–-]/g, ' ').trim();
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return { candidates: [], rest: '' };
    // word windows, longest first, those starting at the beginning first; at most 10 tries, each in Czech then Slovak
    const windows = [];
    for (let len = words.length; len >= 1; len--) for (let i = 0; i + len <= words.length; i++) windows.push([i, len]);
    for (const [i, len] of windows.slice(0, 10)) {
      for (const lang of ['cs', 'sk']) {
        const q = words.slice(i, i + len).join(' ');
        const taxa = await taxaFor(q, lang);
        if (!taxa.length) continue;
        // exact label match first; one word ("hrušeň") means the genus, two words ("hrušeň obecná") the species
        const n = GP.norm(q), exact = t => [t.cs, t.sk].some(x => GP.norm(x) === n) ? 0 : 1;
        const order = len === 1 ? ['genus', 'species'] : ['species', 'genus'], rk = t => (order.indexOf(t.rank) + 3) % 3;
        taxa.sort((a, b) => exact(a) - exact(b) || rk(a) - rk(b));
        const plants = await onlyPlants(taxa);
        if (!plants.length) continue;
        // only the genus found ("bříza užitečná" -> bříza): GBIF may know the two-word Czech / Slovak name
        if (plants[0].rank !== 'species' && words.length > i + len) {
          const sp = await gbifSpecies(words.slice(i, i + 2).join(' '));
          if (sp) return { candidates: [sp, ...plants.filter(t => t.qid !== sp.qid)], rest: words.slice(i + 2).join(' '), matched: words.slice(i, i + 2).join(' ') };
        }
        return { candidates: plants, rest: words.slice(i + len).join(' '), matched: q };
      }
    }
    const sp = words.length > 1 && await gbifSpecies(words.slice(0, 2).join(' '));
    return sp ? { candidates: [sp], rest: words.slice(2).join(' '), matched: words.slice(0, 2).join(' ') } : { candidates: [], rest: '' };
  };

  // Czech / Slovak common name -> plant species via GBIF vernacular names, then its Wikidata item
  GP.lookup.gbifSpecies = gbifSpecies;
  async function gbifSpecies(q) {
    try {
      const d = await getJson(GBIF + 'species/search?qField=VERNACULAR&datasetKey=d7dddbf4-2cf0-4f39-9b2a-bb099caae36c&limit=5&q=' + encodeURIComponent(q));
      const n = GP.norm(q);
      const hit = (d.results || []).find(r => r.kingdom === 'Plantae' && r.rank === 'SPECIES' && (r.vernacularNames || []).some(v => GP.norm(v.vernacularName) === n));
      if (!hit) return null;
      const vern = lang => ((hit.vernacularNames || []).find(v => v.language === lang) || {}).vernacularName || '';
      const t = (await taxaFor(hit.canonicalName, 'en')).find(x => GP.norm(x.latin) === GP.norm(hit.canonicalName)) ||
        { qid: '', latin: hit.canonicalName, rank: 'species', image: '', cs: '', sk: '', en: '', desc: 'GBIF' };
      t.cs = t.cs || vern('ces'); t.sk = t.sk || vern('slk');
      return t;
    } catch (e) { return null; }
  }

  // "black satin" -> "Black Satin"; leave mixed case as typed.
  // Czech / Slovak adjectives right after the name ("japonská", "Meyerův") belong to the species, and words
  // like "beztrná", "remontantní" describe the plant – neither is a cultivar.
  const DESCRIPTIVE = /^(beztrn\w*|remontant\w*|pozdn\w*|ran[áéýí]|stalezelen\w*|zakrsl\w*|sloupovit\w*|plaziv\w*|pnouc\w*)$/;
  GP.lookup.cultivarFrom = function (rest) {
    let words = String(rest || '').split(/\s+/).filter(Boolean);
    while (words.length && (/^\p{Ll}+[áéíý]$/u.test(words[0]) || /^\p{L}+(ův|ova|ová)$/u.test(words[0]))) words.shift();
    words = words.filter(w => !DESCRIPTIVE.test(GP.norm(w)));
    const s = words.join(' ');
    return s && s === s.toLowerCase() ? s.replace(/(^|\s)\S/g, c => c.toUpperCase()) : s;
  };

  // Taxon -> proposed values { field: { value, source } } for the plant
  GP.lookup.details = async function (t) {
    const out = {}, put = (k, v, source) => { if (v && String(v).trim()) out[k] = { value: v, source }; };
    put('name_cs', cap(t.cs), 'Wikidata');
    put('name_sk', cap(t.sk), 'Wikidata');
    if (t.en && GP.norm(t.en) !== GP.norm(t.latin)) put('name_en', cap(t.en), 'Wikidata');
    put('name_la', t.latin, 'Wikidata');
    try {
      const rank = t.rank === 'species' || t.rank === 'genus' ? '&rank=' + t.rank.toUpperCase() : '';
      const m = await getJson(GBIF + 'species/match?kingdom=Plantae&name=' + encodeURIComponent(t.latin) + rank);
      // a match on a higher rank still tells the genus / family
      if (m.matchType === 'HIGHERRANK') { put('genus', m.genus, 'GBIF'); put('family', m.family, 'GBIF'); }
      // only trust an exact or close match on the same name
      if (m.usageKey && m.matchType !== 'NONE' && m.matchType !== 'HIGHERRANK') {
        let key = m.usageKey, latin = m.canonicalName;
        if (m.status === 'SYNONYM' && m.acceptedUsageKey) {
          const a = await getJson(GBIF + 'species/' + m.acceptedUsageKey);
          key = a.key; latin = a.canonicalName;
          put('name_la', latin, 'GBIF');
        }
        put('genus', m.genus, 'GBIF');
        put('family', m.family, 'GBIF');
        const syn = await getJson(GBIF + 'species/' + key + '/synonyms?limit=60');
        const names = [...new Set([t.latin, ...(syn.results || []).filter(s => s.rank === m.rank).map(s => s.canonicalName)])]
          .filter(n => n && GP.norm(n) !== GP.norm(latin)).slice(0, 6);
        put('synonyms', names.join(', '), 'GBIF');
        out._gbif = key;
      }
    } catch (e) { out._gbifError = e.message; }
    if (!out.genus && t.rank === 'genus') put('genus', t.latin, 'Wikidata');
    if (t.image) {
      try {
        const d = await getJson('https://commons.wikimedia.org/w/api.php?format=json&origin=*&action=query&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=700&titles=File:' + encodeURIComponent(t.image));
        const ii = (Object.values(d.query.pages)[0].imageinfo || [])[0];
        if (ii) {
          const meta = ii.extmetadata || {}, strip = s => String(s || '').replace(/<[^>]*>/g, '').trim();
          out.photo = { value: ii.thumburl || ii.url, source: 'Wikimedia Commons',
            credit: [strip((meta.Artist || {}).value), strip((meta.LicenseShortName || {}).value)].filter(Boolean).join(', '), page: ii.descriptionurl };
        }
      } catch (e) { /* no photo */ }
    }
    if (t.qid) out._qid = t.qid;
    return out;
  };

  // Apply chosen proposals; photos are downloaded and stored like an uploaded photo.
  GP.lookup.apply = async function (p, props, keys) {
    for (const k of keys) {
      const v = props[k];
      if (!v) continue;
      if (k === 'photo') {
        const blob = await (await fetch(v.value)).blob();
        p.photo = await GP.ui.readImage(blob, 900);
        p.photoCredit = 'Wikimedia Commons' + (v.credit ? ' – ' + v.credit : '');
        p.photoPage = v.page || '';
      } else p[k] = v.value;
    }
    if (props._qid) p.wikidata = props._qid;
    if (props._gbif) p.gbif = props._gbif;
  };

  // ---------- dialog for one plant ----------
  const L = GP.L, esc = GP.esc;

  // Details of the taxon + what the typed name itself tells (cultivar after the species name).
  async function propose(p, t, rest, matched) {
    const props = await GP.lookup.details(t);
    const cult = GP.lookup.cultivarFrom(rest);
    if (cult && !p.cultivar) {
      props.cultivar = { value: cult, source: L('zbytek názvu', 'rest of the name') };
      // the cultivar was part of the Czech name: propose the name without it ("malina tulameen" -> "Malina")
      const drop = new Set(cult.split(/\s+/).map(GP.norm));
      const left = (p.name_cs || '').split(/\s+/).filter(w => !drop.has(GP.norm(w))).join(' ');
      if (p.name_cs && left && GP.norm(left) !== GP.norm(p.name_cs)) {
        const lab = [t.cs, t.sk].find(x => GP.norm(x) === GP.norm(left)); // same words, proper diacritics ("jahodnik" -> "Jahodník")
        props.name_cs = { value: cap(lab || left), source: L('název bez odrůdy', 'name without cultivar'), tick: true };
      }
    }
    return props;
  }
  const FIELDS = ['name_cs', 'name_sk', 'name_en', 'name_la', 'cultivar', 'genus', 'family', 'synonyms', 'photo'];

  GP.lookup.dialog = function (p, onDone) {
    const box = document.createElement('div');
    box.className = 'modal';
    box.innerHTML = '<div class="modal-box lookup"><div class="row gap"><b class="grow">🔎 ' + L('Doplnit z databází', 'Fill from databases') + ' – ' + esc(GP.plantName(p)) + '</b>' +
      '<button class="link" data-x>✕</button></div><div class="row gap"><input type="search" class="grow" data-q placeholder="' + L('Hledat jiný název (česky, slovensky, latinsky)…', 'Search another name (Czech, Slovak, Latin)…') + '">' +
      '<button class="btn" data-go>' + L('Hledat', 'Search') + '</button></div><div class="lk-body"><p class="muted">' + L('Hledám…', 'Searching…') + '</p></div></div>';
    document.body.appendChild(box);
    const body = box.querySelector('.lk-body');
    const close = () => box.remove();
    box.querySelector('[data-x]').onclick = close;
    box.addEventListener('click', e => { if (e.target === box) close(); });
    let rest = '', matched = '';

    async function search(typed) {
      body.innerHTML = '<p class="muted">' + L('Hledám…', 'Searching…') + '</p>';
      try {
        const r = await GP.lookup.find(p, typed);
        rest = r.rest; matched = r.matched || '';
        if (!r.candidates.length) { body.innerHTML = '<p>' + L('Nic jsem nenašla. Zkuste jiný název nahoře – třeba latinsky nebo jen rod (např. „malina“).', 'Nothing found. Try another name above – Latin, or just the genus.') + '</p>'; return; }
        body.innerHTML = '<p class="small muted">' + L('Vyberte správný druh:', 'Pick the right species:') + '</p><ul class="lk-cands">' + r.candidates.map((t, i) =>
          '<li><button class="lk-cand" data-i="' + i + '"><i>' + esc(t.latin) + '</i> – ' + esc(cap(t.cs || t.sk || t.en)) + ' <span class="muted small">' + esc(t.desc) + '</span></button></li>').join('') + '</ul>';
        body.querySelectorAll('[data-i]').forEach(b => b.onclick = () => pick(r.candidates[+b.dataset.i]));
      } catch (e) { body.innerHTML = '<p class="alert">' + L('Databáze nejsou dostupné', 'Databases are not reachable') + ' (' + esc(e.message) + ')</p>'; }
    }

    async function pick(t) {
      body.innerHTML = '<p class="muted">' + L('Načítám údaje o druhu…', 'Loading species details…') + '</p>';
      const props = await propose(p, t, rest, matched);
      const row = k => {
        const v = props[k];
        if (!v) return '';
        const cur = k === 'photo' ? p.photo : p[k];
        const same = k !== 'photo' && cur && GP.norm(cur) === GP.norm(v.value);
        if (same) return '';
        const lbl = k === 'photo' ? L('Fotka', 'Photo') : GP.fieldLabel(GP.plantField(k));
        const shown = k === 'photo' ? '<img src="' + esc(v.value) + '" alt=""><div class="small muted">' + esc(v.credit || '') + '</div>' : esc(v.value);
        const now = k === 'photo' ? (cur ? '<img src="' + cur + '" alt="">' : '—') : esc(cur || '—');
        return '<tr><td><input type="checkbox" data-k="' + k + '"' + (cur && !v.tick ? '' : ' checked') + '></td><td><b>' + esc(lbl) + '</b></td><td class="muted">' + now + '</td><td>' + shown + ' <span class="tag">' + esc(v.source) + '</span></td></tr>';
      };
      const rows = FIELDS.map(row).join('');
      body.innerHTML = '<p class="small"><i>' + esc(t.latin) + '</i>' + (t.qid ? ' · <a target="_blank" rel="noopener" href="https://www.wikidata.org/wiki/' + t.qid + '">Wikidata</a>' : '') +
        (props._gbif ? ' · <a target="_blank" rel="noopener" href="https://www.gbif.org/species/' + props._gbif + '">GBIF</a>' : '') + '</p>' +
        (rows ? '<table class="tbl lk-table"><thead><tr><th></th><th>' + L('Pole', 'Field') + '</th><th>' + L('Teď', 'Now') + '</th><th>' + L('Návrh', 'Proposal') + '</th></tr></thead><tbody>' + rows + '</tbody></table>' +
          '<p class="small muted">' + L('Prázdná pole jsou zaškrtnutá. Vyplněná pole se přepíšou jen když je zaškrtnete.', 'Empty fields are ticked. Filled fields are only overwritten when you tick them.') + '</p>' +
          '<div class="row gap"><button class="btn primary" data-apply>' + L('Použít vybrané', 'Apply selected') + '</button><button class="btn" data-back>← ' + L('Jiný druh', 'Other species') + '</button></div>'
          : '<p>' + L('Všechno, co databáze nabízí, už v kartě máte.', 'The card already has everything the databases offer.') + '</p><button class="btn" data-back>← ' + L('Jiný druh', 'Other species') + '</button>');
      body.querySelector('[data-back]').onclick = () => search(box.querySelector('[data-q]').value.trim() || undefined);
      const ap = body.querySelector('[data-apply]');
      if (ap) ap.onclick = async () => {
        ap.disabled = true; ap.textContent = L('Ukládám…', 'Saving…');
        const keys = [...body.querySelectorAll('[data-k]:checked')].map(c => c.dataset.k);
        try { await GP.lookup.apply(p, props, keys); } catch (e) { GP.ui.toast(L('Fotku se nepodařilo stáhnout', 'Could not download the photo')); }
        GP.saveNow(); close(); if (onDone) onDone();
      };
    }

    box.querySelector('[data-go]').onclick = () => search(box.querySelector('[data-q]').value.trim() || undefined);
    box.querySelector('[data-q]').addEventListener('keydown', e => { if (e.key === 'Enter') box.querySelector('[data-go]').click(); });
    search();
  };

  // ---------- bulk fill for the catalog ----------
  // Finds a species for each plant, shows them for review; applying fills only empty fields
  // (plus the Czech name without the cultivar when the cultivar was split off).
  GP.lookup.bulk = function (plants, onDone) {
    const box = document.createElement('div');
    box.className = 'modal';
    const rows = plants.map(p => ({ p, state: 'wait', cands: [], rest: '', matched: '', pick: 0 }));
    let stop = false, running = false;
    box.innerHTML = '<div class="modal-box lookup wide"><div class="row gap"><b class="grow">🔎 ' + L('Doplnit z databází', 'Fill from databases') + ' – ' + plants.length + ' ' + L('rostlin', 'plants') + '</b>' +
      '<button class="link" data-x>✕</button></div>' +
      '<p class="small muted">' + L('Ke každé rostlině najdu druh na Wikidatech a v GBIF. Zkontrolujte ho (u nejistých vyberte jiný nebo „nepoužít“) a dejte Použít. Doplní se jen prázdná pole: latinský a další názvy, odrůda ze zbytku názvu, rod, čeleď, synonyma a fotka. U rostlin s latinským názvem se hledá podle něj.',
        'For each plant I look up the species on Wikidata and GBIF. Check it (pick another or "skip") and press Apply. Only empty fields are filled: Latin and other names, cultivar from the rest of the name, genus, family, synonyms and photo. Plants with a Latin name are looked up by it.') + '</p>' +
      '<label class="small"><input type="checkbox" data-photos checked> ' + L('stáhnout i fotky (z Wikimedia Commons)', 'also download photos (from Wikimedia Commons)') + '</label>' +
      '<div class="lk-progress small muted"></div><div class="lk-scroll"><table class="tbl lk-bulk"><thead><tr><th>' + L('Rostlina', 'Plant') + '</th><th>' + L('Nalezený druh', 'Species found') + '</th><th>' + L('Odrůda', 'Cultivar') + '</th></tr></thead><tbody></tbody></table></div>' +
      '<div class="row gap"><button class="btn primary" data-apply disabled>' + L('Použít', 'Apply') + '</button><button class="btn" data-stop>' + L('Zastavit hledání', 'Stop searching') + '</button></div></div>';
    document.body.appendChild(box);
    const tbody = box.querySelector('tbody'), prog = box.querySelector('.lk-progress');
    const close = () => { stop = true; box.remove(); };
    box.querySelector('[data-x]').onclick = close;

    const cell = r => {
      if (r.state === 'wait') return '<span class="muted">…</span>';
      if (r.state === 'error') return '<span class="warn-text">' + L('chyba spojení', 'connection error') + '</span>';
      if (!r.cands.length) return '<span class="muted">' + L('nenalezeno – zkuste na kartě rostliny', 'not found – try on the plant card') + '</span>';
      return '<select data-pick="' + rows.indexOf(r) + '">' + r.cands.slice(0, 5).map((t, i) => '<option value="' + i + '"' + (i === r.pick ? ' selected' : '') + '>' +
        esc(t.latin + ' – ' + cap(t.cs || t.sk || t.en || '')) + '</option>').join('') + '<option value="-1"' + (r.pick === -1 ? ' selected' : '') + '>— ' + L('nepoužít', 'skip') + ' —</option></select>';
    };
    const draw = () => {
      tbody.innerHTML = rows.map(r => '<tr><td>' + esc(GP.plantName(r.p)) + '</td><td>' + cell(r) + '</td><td>' + esc(r.p.cultivar ? '' : GP.lookup.cultivarFrom(r.rest)) + '</td></tr>').join('');
      const done = rows.filter(r => r.state !== 'wait').length, found = rows.filter(r => r.cands.length).length;
      prog.textContent = (running ? L('Hledám', 'Searching') + ' ' + done + ' / ' + rows.length : L('Hotovo', 'Done') + ': ' + done + ' / ' + rows.length) + ' · ' + L('nalezeno', 'found') + ' ' + found;
      box.querySelector('[data-apply]').disabled = running || !found;
    };
    tbody.addEventListener('change', e => { const s = e.target.closest('[data-pick]'); if (s) rows[+s.dataset.pick].pick = +s.value; });

    async function run() {
      running = true; draw();
      let next = 0;
      // three lookups at a time
      const worker = async () => {
        while (!stop && next < rows.length) {
          const r = rows[next++];
          try { const f = await GP.lookup.find(r.p); Object.assign(r, { cands: f.candidates, rest: f.rest, matched: f.matched || '', state: 'ok' }); }
          catch (e) { r.state = 'error'; }
          if (!stop) draw();
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      running = false;
      if (!stop || box.isConnected) draw();
    }
    box.querySelector('[data-stop]').onclick = e => { stop = true; running = false; e.target.disabled = true; draw(); };

    box.querySelector('[data-apply]').onclick = async e => {
      const btn = e.target, photos = box.querySelector('[data-photos]').checked;
      btn.disabled = true;
      const todo = rows.filter(r => r.cands.length && r.pick >= 0);
      let n = 0, failed = 0;
      for (const r of todo) {
        prog.textContent = L('Ukládám', 'Saving') + ' ' + (++n) + ' / ' + todo.length + '…';
        try {
          const props = await propose(r.p, r.cands[r.pick], r.rest, r.matched);
          const keys = FIELDS.filter(k => props[k] && (k === 'photo' ? photos && !r.p.photo : props[k].tick || !r.p[k]));
          await GP.lookup.apply(r.p, props, keys);
        } catch (err) { failed++; }
      }
      GP.saveNow();
      box.remove();
      GP.ui.toast(L('Doplněno', 'Filled in') + ': ' + (todo.length - failed) + (failed ? ' · ' + L('chyba', 'failed') + ': ' + failed : ''));
      if (onDone) onDone();
    };
    draw();
    run();
  };
})(window.GP);
