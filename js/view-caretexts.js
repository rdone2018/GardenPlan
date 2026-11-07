// Care texts that are almost the same (a comma, capital letter or a word apart) can be unified with one click,
// so the calendar lists those plants together under one instruction.
(function (GP) {
  const L = GP.L, esc = GP.esc;
  let clusters = [];

  // Two different wordings count as similar when they share most words and the same numbers
  // ("hnojit 1× za 14 dní" and "hnojit 1× za 7 dní" are meant to differ).
  const words = k => k.split(' ').filter(Boolean);
  const numbers = k => (k.match(/\d+/g) || []).join(',');
  function similar(a, b) {
    if (numbers(a) !== numbers(b)) return false;
    const A = words(a), B = words(b);
    if (Math.min(A.length, B.length) / Math.max(A.length, B.length) < 0.7) return false;
    const left = new Map();
    for (const w of A) left.set(w, (left.get(w) || 0) + 1);
    let common = 0;
    for (const w of B) if (left.get(w)) { common++; left.set(w, left.get(w) - 1); }
    return 2 * common / (A.length + B.length) >= 0.8;
  }

  function findClusters() {
    const out = [];
    for (const f of GP.PLANT_FIELDS.filter(x => x.type === 'care')) {
      // every wording used in this care item, with the terms that use it
      const variants = new Map();
      for (const p of GP.state.plants) for (const t of GP.careTerms(p, f.key)) {
        const text = (t.text || '').trim();
        if (!text) continue;
        if (!variants.has(text)) variants.set(text, { text, key: GP.textKey(text), refs: [] });
        variants.get(text).refs.push({ p, t });
      }
      // wordings with the same key belong together; keys that are similar are joined as well
      const keys = [...new Set([...variants.values()].map(v => v.key))].filter(Boolean);
      const parent = new Map(keys.map(k => [k, k]));
      const root = k => (parent.get(k) === k ? k : root(parent.get(k)));
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        if (root(keys[i]) !== root(keys[j]) && similar(keys[i], keys[j])) parent.set(root(keys[j]), root(keys[i]));
      }
      const by = new Map();
      for (const v of variants.values()) {
        if (!v.key) continue;
        const r = root(v.key);
        if (!by.has(r)) by.set(r, []);
        by.get(r).push(v);
      }
      const keep = new Set(GP.state.settings.careTextsKeep || []);
      for (const vs of by.values()) {
        if (vs.length < 2) continue;
        vs.sort((x, y) => y.refs.length - x.refs.length || x.text.localeCompare(y.text, 'cs'));
        const sig = f.key + ':' + [...new Set(vs.map(v => v.key))].sort().join('|');
        if (keep.has(sig)) continue;
        const sameKey = vs.every(v => v.key === vs[0].key);
        // wordings that differ in more than punctuation are only replaced when ticked
        if (!sameKey) vs.forEach((v, i) => { v.off = i > 0; });
        out.push({ f, variants: vs, target: 0, sameKey, sig });
      }
    }
    return out;
  }

  // the words of a wording that the chosen one does not have are highlighted
  function marked(text, target) {
    const have = new Set(words(GP.textKey(target)));
    return text.split(/(\s+)/).map(w => {
      const k = GP.textKey(w);
      return k && words(k).some(x => !have.has(x)) ? '<mark>' + esc(w) + '</mark>' : esc(w);
    }).join('');
  }

  function clusterHtml(c, ci) {
    const target = c.variants[c.target].text;
    return '<div class="panel ct-cluster" data-c="' + ci + '"><h3>' + (c.f.icon ? '<span class="ico">' + c.f.icon + '</span>' : '') + esc(GP.fieldLabel(c.f)) +
      ' <span class="muted small">' + (c.sameKey ? L('liší se jen čárkou, velkým písmenem, diakritikou nebo mezerou', 'differ only in a comma, capital, accent or space')
        : L('podobné texty – zkontrolujte, zda opravdu znamenají totéž', 'similar texts – check they really mean the same')) + '</span></h3>' +
      c.variants.map((v, vi) => '<div class="ct-var">' +
        '<label class="ct-pick" title="' + L('Použít toto znění', 'Use this wording') + '"><input type="radio" name="ct' + ci + '" data-v="' + vi + '"' + (vi === c.target ? ' checked' : '') + '></label>' +
        '<label class="ct-use" title="' + L('Sjednotit i tento text', 'Unify this text too') + '"><input type="checkbox" data-use="' + vi + '"' + (v.off ? '' : ' checked') + '></label>' +
        '<div><div class="pre">' + (vi === c.target ? esc(v.text) : marked(v.text, target)) + '</div>' +
        '<div class="small muted">' + v.refs.length + '× · ' + [...new Set(v.refs.map(r => r.p))].map(p => '<a href="#/plant/' + p.id + '">' + esc(GP.plantName(p)) + '</a>').join(', ') + '</div></div></div>').join('') +
      '<label class="field wide"><span class="lbl">' + L('Výsledný text (můžete upravit)', 'Resulting text (you can edit it)') + '</span><textarea rows="2" data-final>' + esc(c.final != null ? c.final : target) + '</textarea></label>' +
      '<div class="row gap"><button class="btn primary" data-act="unify">' + L('Sjednotit zaškrtnuté', 'Unify ticked') + '</button>' +
      (c.sameKey ? '' : '<button class="btn" data-act="keep" title="' + L('Texty mají být odlišné – už je tu nenabízet', 'The texts are meant to differ – do not offer them again') + '">' + L('Nechat jak je', 'Leave as is') + '</button>') + '</div></div>';
  }

  // ---------- by genus: plants of one genus usually need the same care; differences are listed side by side ----------
  // by species when one genus mixes different crops (tomato and potato are both Solanum)
  let gq = '', allGenera = false, genera = [], bySpecies = false;
  const groupName = p => bySpecies ? (p.name_la || '').trim().split(/\s+/).slice(0, 2).join(' ') : (p.genus || '').trim();
  const careFields = () => GP.PLANT_FIELDS.filter(x => x.type === 'care');
  // what a plant has in one care item, ignoring commas and capitals; maintenance is compared as a set of chips
  const termsOf = (p, f) => GP.careTerms(p, f.key).filter(t => (t.text || '').trim() || (t.months || []).length);
  function sigOf(p, f) {
    if (f.key === 'maintenance') return [...(p.maintenance || [])].sort().join(',');
    return JSON.stringify(termsOf(p, f).map(t => [GP.textKey(t.text), [...(t.months || [])].sort((a, b) => a - b), !!t.once]));
  }

  function genusGroups() {
    const by = new Map();
    for (const p of GP.state.plants) {
      const name = groupName(p), k = GP.norm(name);
      if (!k) continue;
      if (!by.has(k)) by.set(k, { name, plants: [] });
      by.get(k).plants.push(p);
    }
    const keep = new Set(GP.state.settings.genusKeep || []);
    const out = [];
    for (const g of by.values()) {
      if (g.plants.length < 2) continue;
      g.plants.sort((a, b) => GP.plantName(a).localeCompare(GP.plantName(b), 'cs'));
      // the common names (Jabloň, Višeň…) – easier to find than the Latin genus
      g.common = [...new Set(g.plants.map(p => (L(p.name_cs, p.name_en) || p.name_cs || '').trim()).filter(Boolean))];
      g.diffs = [];
      g.kept = 0;
      for (const f of [GP.plantField('maintenance'), ...careFields()]) {
        const vars = new Map();
        for (const p of g.plants) {
          const s = sigOf(p, f);
          if (!vars.has(s)) vars.set(s, { sig: s, plants: [] });
          vars.get(s).plants.push(p);
        }
        if (vars.size < 2) continue;
        const vs = [...vars.values()].sort((a, b) => b.plants.length - a.plants.length);
        // "leave as is" holds only while the plants stay as they were when it was clicked
        const keepSig = g.name + '|' + f.key + '|' + vs.map(v => v.sig).sort().join('#');
        if (keep.has(keepSig)) { g.kept++; continue; }
        g.diffs.push({ f, vars: vs, keepSig });
      }
      out.push(g);
    }
    return out.sort((a, b) => (a.common[0] || a.name).localeCompare(b.common[0] || b.name, 'cs'));
  }

  function variantHtml(g, gi, d, di, v, vi) {
    const model = v.plants[0];
    let body;
    if (d.f.key === 'maintenance') {
      const opts = new Map((d.f.opts || []).map(o => [o[0], L(o[1], o[2])]));
      body = (model.maintenance || []).length ? esc(model.maintenance.map(k => opts.get(k) || k).join(', ')) : '<span class="muted">' + L('nevyplněno', 'empty') + '</span>';
    } else {
      const ts = termsOf(model, d.f);
      body = ts.length ? ts.map(t => '<div class="gn-term"><span class="pre">' + esc(t.text || '') + '</span> <span class="small muted">' +
        esc(GP.formatMonths([...(t.months || [])].sort((a, b) => a - b)) || L('bez měsíců', 'no months')) + (t.once ? ' · ' + L('jednorázově', 'one-time') : '') + '</span></div>').join('')
        : '<span class="muted">' + L('nevyplněno', 'empty') + '</span>';
    }
    const others = g.plants.length - v.plants.length;
    return '<div class="gn-var"><div class="grow">' + body +
      '<div class="small muted">' + v.plants.length + '× · ' + v.plants.map(p => '<a href="#/plant/' + p.id + '">' + esc(GP.plantName(p)) + '</a>').join(', ') + '</div></div>' +
      '<button class="btn small" data-apply="' + gi + ':' + di + ':' + vi + '" title="' + L('Zkopírovat tuto péči ke zbylým rostlinám rodu', 'Copy this care to the other plants of the genus') + '">' +
      L('Použít u všech', 'Use for all') + ' (+' + others + ')</button></div>';
  }

  function genusHtml() {
    genera = genusGroups();
    const nq = GP.norm(gq);
    const shown = genera.filter(g => (allGenera || g.diffs.length) &&
      (!nq || GP.norm(g.name + ' ' + g.common.join(' ') + ' ' + g.plants.map(GP.plantName).join(' ')).includes(nq)));
    const nDiff = genera.filter(g => g.diffs.length).length;
    let html = '<p class="muted small">' + L('Rostliny stejného rodu obvykle potřebují stejnou péči. U každého rodu je vidět, v čem se jeho rostliny liší (text, měsíce, jednorázově). „Použít u všech“ zkopíruje vybranou variantu ke zbylým rostlinám rodu. „Nechat jak je“ = rozdíl je správně (např. letní a podzimní maliníky).',
        'Plants of one genus usually need the same care. For each genus you see where its plants differ (text, months, one-time). "Use for all" copies that variant to the other plants of the genus. "Leave as is" = the difference is right (e.g. summer and autumn raspberries).') + '</p>' +
      '<div class="row gap list-tools"><span><button class="seg' + (bySpecies ? '' : ' on') + '" data-sp="0" title="' + L('Širší skupina, např. Prunus = višeň, švestka, třešeň, bobkovišeň', 'Wider group, e.g. Prunus = cherry, plum, cherry laurel') + '">' + L('Rod (široce)', 'Genus (wide)') + '</button>' +
      '<button class="seg' + (bySpecies ? ' on' : '') + '" data-sp="1" title="' + L('Užší skupina, např. jen višně nebo jen jabloně', 'Narrower group, e.g. only sour cherries or only apples') + '">' + L('Druh (přesně)', 'Species (exact)') + '</button></span><input type="search" data-gq placeholder="' + L('Hledat rod, druh nebo rostlinu…', 'Search genus, species or plant…') + '" value="' + esc(gq) + '">' +
      '<label class="small"><input type="checkbox" data-allg' + (allGenera ? ' checked' : '') + '> ' + L('ukázat i rody bez rozdílů', 'show genera without differences too') + '</label>' +
      '<span class="small muted">' + (bySpecies ? L('druhů s rozdíly: ', 'species with differences: ') : L('rodů s rozdíly: ', 'genera with differences: ')) + nDiff + ' / ' + genera.length + '</span>' +
      ((GP.state.settings.genusKeep || []).length ? '<button class="link small" data-act="gunkeep">' + L('Znovu ukázat ponechané', 'Show kept ones again') + ' (' + GP.state.settings.genusKeep.length + ')</button>' : '') + '</div>';
    html += shown.map(g => {
      const gi = genera.indexOf(g);
      const common = g.common.slice(0, 4).join(', ') + (g.common.length > 4 ? ' …' : '');
      return '<div class="panel gn-genus"><h3>' + (common ? esc(common) + ' · ' : '') + '<i class="muted">' + esc(g.name) + '</i> <span class="muted">(' + g.plants.length + ')</span> ' +
        (g.diffs.length ? '<span class="miss-n">' + g.diffs.length + '</span>' : '<span class="small muted">✓ ' + L('stejná péče', 'same care') + '</span>') +
        (g.kept ? ' <span class="small muted">· ' + L('ponecháno: ', 'kept: ') + g.kept + '</span>' : '') + '</h3>' +
        (g.diffs.length ? '' : '<div class="small muted">' + g.plants.map(p => '<a href="#/plant/' + p.id + '">' + esc(GP.plantName(p)) + '</a>').join(', ') + '</div>') +
        g.diffs.map((d, di) => '<div class="gn-field"><div class="row gap"><b class="grow">' + (d.f.icon ? '<span class="ico">' + d.f.icon + '</span>' : '') + esc(GP.fieldLabel(d.f)) + '</b>' +
          '<button class="link small" data-gkeep="' + gi + ':' + di + '">' + L('Nechat jak je', 'Leave as is') + '</button></div>' +
          d.vars.map((v, vi) => variantHtml(g, gi, d, di, v, vi)).join('') + '</div>').join('') + '</div>';
    }).join('');
    return html + (shown.length ? '' : '<div class="empty"><p>' + (nq ? L('Nic neodpovídá.', 'Nothing matches.') : L('Všechny rody mají stejnou péči. 🎉', 'All genera have the same care. 🎉')) + '</p></div>');
  }

  // copies one variant (care terms or maintenance chips) to every other plant of the genus
  function applyVariant(g, d, v) {
    const model = v.plants[0], f = d.f;
    let n = 0;
    for (const p of g.plants) {
      if (v.plants.includes(p)) continue;
      if (f.key === 'maintenance') p.maintenance = [...(model.maintenance || [])];
      else {
        const ts = termsOf(model, f);
        if (ts.length) p[f.key] = JSON.parse(JSON.stringify(ts)); else delete p[f.key];
        // filled care is expected only when its maintenance chip is ticked
        if (ts.length && f.maint && !(p.maintenance || []).includes(f.maint)) p.maintenance = [...(p.maintenance || []).filter(k => k !== 'none'), f.maint];
      }
      n++;
    }
    return n;
  }

  // ---------- one-time care in bulk: one tick per care text marks every plant that uses it ----------
  let tab = 'genus', q = '', onlyHints = false;
  // suggested as one-time: winter protection, pruning and other care spread over several months (a cut or a cover
  // is done once in them), and painting the trunk anywhere; watering, feeding and spraying repeat
  const HINT_FIELDS = ['winter', 'pruning', 'otherCare'], HINT = /natr|nater|bilit/;

  function onceGroups() {
    const out = [];
    for (const f of GP.PLANT_FIELDS.filter(x => x.type === 'care')) {
      const by = new Map();
      for (const p of GP.state.plants) for (const t of GP.careTerms(p, f.key)) {
        if (!(t.months || []).length) continue;
        const k = GP.textKey(t.text);
        if (!by.has(k)) by.set(k, { f, key: f.key + ':' + k, terms: [], plants: new Set(), months: new Set() });
        const g = by.get(k);
        g.terms.push(t); g.plants.add(p);
        t.months.forEach(m => g.months.add(m));
      }
      for (const g of by.values()) {
        g.text = GP.mostUsed(g.terms.map(t => (t.text || '').trim())) || L('(bez textu)', '(no text)');
        g.on = g.terms.filter(t => t.once).length;
        g.hint = !g.on && g.months.size > 1 && (HINT_FIELDS.includes(f.key) || HINT.test(GP.textKey(g.text)));
        out.push(g);
      }
    }
    return out;
  }
  let groups = [];

  function onceHtml() {
    groups = onceGroups();
    const nq = GP.norm(q);
    const shown = groups.filter(g => (!nq || GP.norm(g.text + ' ' + [...g.plants].map(GP.plantName).join(' ')).includes(nq)) && (!onlyHints || g.hint));
    const nOn = groups.filter(g => g.on).length;
    let html = '<p class="muted small">' + L('Zaškrtnutím označíte péči jako jednorázovou u všech rostlin s tímto textem: stačí ji udělat jednou v kterémkoli z jejích měsíců. Nezaškrtnutá se opakuje každý měsíc (zálivka, postřik). Odškrtnutím se vše vrátí. 💡 = návrh: zimní ochrana, řez a další péče na víc měsíců, natírání kmene – přečtěte si text a rozhodněte.',
        'Ticking marks the care as one-time for every plant with this text: done once in any of its months. Unticked it repeats every month (watering, spraying). Untick to undo. 💡 = suggestion: winter protection, pruning and other care over several months, painting the trunk – read the text and decide.') + '</p>' +
      '<div class="row gap list-tools"><input type="search" data-q placeholder="' + L('Hledat v textu nebo rostlině…', 'Search text or plant…') + '" value="' + esc(q) + '">' +
      '<label class="small"><input type="checkbox" data-hints' + (onlyHints ? ' checked' : '') + '> ' + L('jen návrhy 💡', 'suggestions only 💡') + ' (' + groups.filter(g => g.hint).length + ')</label>' +
      '<span class="small muted">' + L('jednorázových textů: ', 'one-time texts: ') + nOn + '</span></div>';
    for (const f of GP.PLANT_FIELDS.filter(x => x.type === 'care')) {
      const gs = shown.filter(g => g.f === f).sort((a, b) => b.plants.size - a.plants.size || a.text.localeCompare(b.text, 'cs'));
      if (!gs.length) continue;
      html += '<div class="panel"><h3>' + (f.icon ? '<span class="ico">' + f.icon + '</span>' : '') + esc(GP.fieldLabel(f)) + ' <span class="muted">(' + gs.length + ')</span></h3>' +
        gs.map(g => {
          const names = [...g.plants].map(GP.plantName).sort((a, b) => a.localeCompare(b, 'cs'));
          return '<label class="once-row' + (g.on ? ' on' : '') + '"><input type="checkbox" data-once="' + esc(g.key) + '"' + (g.on ? ' checked' : '') +
            (g.on && g.on < g.terms.length ? ' data-some' : '') + '><div><div class="pre">' + (g.hint ? '💡 ' : '') + esc(g.text) + '</div>' +
            '<div class="small muted">' + esc(GP.formatMonths([...g.months].sort((a, b) => a - b))) + ' · ' + g.plants.size + '× · ' +
            esc(names.slice(0, 8).join(', ') + (names.length > 8 ? ' … +' + (names.length - 8) : '')) +
            (g.on && g.on < g.terms.length ? ' · ' + L('jednorázově jen u ', 'one-time only for ') + g.on + '/' + g.terms.length : '') + '</div></div></label>';
        }).join('') + '</div>';
    }
    return html + (shown.length ? '' : '<p class="muted">' + L('Nic neodpovídá.', 'Nothing matches.') + '</p>');
  }

  GP.views.caretexts = {
    render() {
      // the older tools are tucked away below the comparison by genus, which covers most of what they did
      const tabs = '<div class="row gap" style="margin-bottom:.8rem"><button class="btn small" data-tab="genus">← ' + L('Péče podle rodu', 'Care by genus') + '</button></div>';
      const more = '<p class="small muted gn-more">' + L('Další nástroje: ', 'More tools: ') +
        '<button class="link small" data-tab="unify">' + L('Sjednotit skoro stejné texty napříč rody', 'Unify almost identical texts across genera') + '</button> · ' +
        '<button class="link small" data-tab="once">' + L('Jednorázová péče hromadně', 'One-time care in bulk') + '</button></p>';
      if (tab === 'genus') return '<div class="head"><h1>' + L('Péče podle rodu', 'Care by genus') + '</h1>' +
        '<div class="row gap"><a class="btn" href="#/plants">← ' + L('Rostliny', 'Plants') + '</a></div></div>' + genusHtml() + more;
      if (tab === 'once') return '<div class="head"><h1>' + L('Jednorázová péče', 'One-time care') + '</h1>' +
        '<div class="row gap"><a class="btn" href="#/plants">← ' + L('Rostliny', 'Plants') + '</a></div></div>' + tabs + onceHtml();
      clusters = findClusters();
      return '<div class="head"><h1>' + L('Sjednotit texty péče', 'Unify care texts') + ' <span class="muted">(' + clusters.length + ')</span></h1>' +
        '<div class="row gap"><a class="btn" href="#/plants">← ' + L('Rostliny', 'Plants') + '</a></div></div>' + tabs +
        '<p class="muted small">' + L('Texty péče, které jsou skoro stejné. Po sjednocení je kalendář ukáže pohromadě pod jedním návodem. Kolečkem vyberte znění, které platí, zaškrtnutím ty texty, které se mají přepsat. Žlutě jsou slova, kterými se text od vybraného liší.',
          'Care texts that are almost the same. Once unified, the calendar lists those plants together under one instruction. Pick the wording that applies with the circle and tick the texts to be replaced. Words that differ from the chosen one are highlighted.') + '</p>' +
        ((GP.state.settings.careTextsKeep || []).length ? '<p class="small"><button class="link small" data-act="unkeep">' + L('Znovu ukázat skupiny ponechané jak jsou', 'Show groups left as they are again') + ' (' + GP.state.settings.careTextsKeep.length + ')</button></p>' : '') +
        (clusters.length ? clusters.map(clusterHtml).join('') : '<div class="empty"><p>' + L('Žádné podobné texty – vše je sjednocené. 🎉', 'No similar texts – all unified. 🎉') + '</p></div>');
    },
    mount(root) {
      root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; GP.render(); });
      if (tab === 'genus') {
        const s = root.querySelector('[data-gq]');
        s.oninput = () => {
          gq = s.value; GP.render();
          const n = document.querySelector('[data-gq]');
          n.focus(); n.setSelectionRange(n.value.length, n.value.length);
        };
        root.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => { bySpecies = b.dataset.sp === '1'; GP.render(); });
        root.querySelector('[data-allg]').onchange = e => { allGenera = e.target.checked; GP.render(); };
        root.addEventListener('click', e => {
          const b = e.target.closest('[data-apply],[data-gkeep],[data-act=gunkeep]');
          if (!b) return;
          const y = scrollY;
          if (b.dataset.act === 'gunkeep') delete GP.state.settings.genusKeep;
          else if (b.dataset.gkeep) {
            const [gi, di] = b.dataset.gkeep.split(':').map(Number);
            GP.state.settings.genusKeep = [...(GP.state.settings.genusKeep || []), genera[gi].diffs[di].keepSig];
          } else {
            const [gi, di, vi] = b.dataset.apply.split(':').map(Number);
            const g = genera[gi], d = g.diffs[di], v = d.vars[vi];
            if (!confirm(L('Použít u všech rostlin ' + g.name + ' (' + GP.fieldLabel(d.f) + ')? Přepíše se u ' + (g.plants.length - v.plants.length) + ' rostlin.',
              'Use for all ' + g.name + ' (' + GP.fieldLabel(d.f) + ')? This overwrites ' + (g.plants.length - v.plants.length) + ' plants.'))) return;
            const n = applyVariant(g, d, v);
            GP.ui.toast(L('Zkopírováno: ', 'Copied: ') + n + '× ' + GP.fieldLabel(d.f).toLowerCase());
          }
          GP.save();
          GP.render(); scrollTo(0, y);
        });
        return;
      }
      if (tab === 'once') {
        root.querySelectorAll('[data-some]').forEach(c => { c.indeterminate = true; });
        const s = root.querySelector('[data-q]');
        s.oninput = () => {
          q = s.value; GP.render();
          const n = document.querySelector('[data-q]');
          n.focus(); n.setSelectionRange(n.value.length, n.value.length);
        };
        root.querySelector('[data-hints]').onchange = e => { onlyHints = e.target.checked; GP.render(); };
        root.querySelectorAll('[data-once]').forEach(c => c.onchange = () => {
          const g = groups.find(x => x.key === c.dataset.once);
          for (const t of g.terms) if (c.checked) t.once = true; else delete t.once;
          GP.save();
          GP.ui.toast((c.checked ? L('Jednorázově: ', 'One-time: ') : L('Opakovaně: ', 'Repeated: ')) + g.plants.size + '× ' + GP.fieldLabel(g.f).toLowerCase());
          const y = scrollY; GP.render(); scrollTo(0, y);
        });
        return;
      }
      const redraw = (box, c, ci) => { box.outerHTML = clusterHtml(c, ci); };
      root.addEventListener('change', e => {
        const box = e.target.closest('.ct-cluster');
        if (!box) return;
        const ci = +box.dataset.c, c = clusters[ci];
        if (e.target.dataset.v != null) {
          c.target = +e.target.dataset.v;
          c.variants[c.target].off = false;
          c.final = null;
          redraw(box, c, ci);
        } else if (e.target.dataset.use != null) c.variants[+e.target.dataset.use].off = !e.target.checked;
      });
      root.addEventListener('input', e => {
        const box = e.target.closest('.ct-cluster');
        if (box && e.target.matches('[data-final]')) clusters[+box.dataset.c].final = e.target.value;
      });
      root.addEventListener('click', e => {
        const act = e.target.dataset.act;
        if (act === 'unkeep') { delete GP.state.settings.careTextsKeep; GP.save(); return GP.render(); }
        if (act !== 'unify' && act !== 'keep') return;
        const box = e.target.closest('.ct-cluster'), c = clusters[+box.dataset.c];
        if (act === 'keep') {
          GP.state.settings.careTextsKeep = [...(GP.state.settings.careTextsKeep || []), c.sig];
          GP.save();
          return GP.render();
        }
        const text = box.querySelector('[data-final]').value.trim();
        if (!text) return GP.ui.toast(L('Výsledný text je prázdný', 'The resulting text is empty'));
        let n = 0;
        for (const v of c.variants) if (!v.off) for (const r of v.refs) if (r.t.text !== text) { r.t.text = text; n++; }
        GP.save();
        GP.ui.toast(L('Sjednoceno: ', 'Unified: ') + n + '×');
        GP.render();
      });
    }
  };
})(window.GP);
