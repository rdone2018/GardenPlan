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

  GP.views.caretexts = {
    render() {
      clusters = findClusters();
      return '<div class="head"><h1>' + L('Sjednotit texty péče', 'Unify care texts') + ' <span class="muted">(' + clusters.length + ')</span></h1>' +
        '<div class="row gap"><a class="btn" href="#/plants">← ' + L('Rostliny', 'Plants') + '</a></div></div>' +
        '<p class="muted small">' + L('Texty péče, které jsou skoro stejné. Po sjednocení je kalendář ukáže pohromadě pod jedním návodem. Kolečkem vyberte znění, které platí, zaškrtnutím ty texty, které se mají přepsat. Žlutě jsou slova, kterými se text od vybraného liší.',
          'Care texts that are almost the same. Once unified, the calendar lists those plants together under one instruction. Pick the wording that applies with the circle and tick the texts to be replaced. Words that differ from the chosen one are highlighted.') + '</p>' +
        ((GP.state.settings.careTextsKeep || []).length ? '<p class="small"><button class="link small" data-act="unkeep">' + L('Znovu ukázat skupiny ponechané jak jsou', 'Show groups left as they are again') + ' (' + GP.state.settings.careTextsKeep.length + ')</button></p>' : '') +
        (clusters.length ? clusters.map(clusterHtml).join('') : '<div class="empty"><p>' + L('Žádné podobné texty – vše je sjednocené. 🎉', 'No similar texts – all unified. 🎉') + '</p></div>');
    },
    mount(root) {
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
