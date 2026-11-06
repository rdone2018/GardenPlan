// Small UI toolkit: escaping, form fields bound to objects, month pickers, images, downloads.
(function (GP) {
  const L = GP.L;
  GP.ui = {};

  const esc = GP.esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  GP.getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  GP.setPath = function (obj, path, value) {
    const keys = path.split('.'), last = keys.pop();
    let o = obj;
    keys.forEach((k, i) => {
      if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(keys[i + 1] || last) ? [] : {};
      o = o[k];
    });
    if (value === undefined) delete o[last]; else o[last] = value;
  };

  GP.ui.months = function (path, months) {
    const set = new Set(months || []);
    let html = '<div class="months" data-months="' + esc(path) + '">';
    for (let m = 1; m <= 12; m++) {
      html += '<button type="button" class="m' + (set.has(m) ? ' on' : '') + '" data-m="' + m + '" title="' + esc(GP.monthName(m)) + '">' + GP.monthShort(m) + '</button>';
    }
    return html + '</div>';
  };

  // Month + year as two plain lists (the browser's month input is awkward for past years). The value
  // ("2026-04", or just "2015" when the month is not known) sits in a hidden input with `attr`, which
  // fires a bubbling "change" like any other field, so existing handlers read it as e.target.value.
  GP.ui.monthYear = function (attr, value) {
    const [y, m] = String(value || '').split('-'), now = new Date().getFullYear();
    let html = '<span class="my"><select class="my-m" title="' + L('Měsíc', 'Month') + '"><option value="">' + L('měsíc', 'month') + '</option>';
    for (let i = 1; i <= 12; i++) html += '<option value="' + i + '"' + (+m === i ? ' selected' : '') + '>' + esc(GP.monthName(i)) + '</option>';
    html += '</select><select class="my-y" title="' + L('Rok', 'Year') + '"><option value="">' + L('rok', 'year') + '</option>';
    for (let i = now + 1; i >= 1950; i--) html += '<option' + (+y === i ? ' selected' : '') + '>' + i + '</option>';
    return html + '</select><input type="hidden" ' + attr + ' value="' + esc(value ? GP.ui.monthYearValue(y, m) : '') + '"></span>';
  };
  GP.ui.monthYearValue = (y, m) => (y ? y + (m ? '-' + String(+m).padStart(2, '0') : '') : '');
  document.addEventListener('change', e => {
    const box = e.target.closest && e.target.closest('.my');
    if (!box || e.target.type === 'hidden') return;
    const hidden = box.querySelector('input[type=hidden]');
    hidden.value = GP.ui.monthYearValue(box.querySelector('.my-y').value, box.querySelector('.my-m').value);
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }, true);

  // Render one labelled field; `path` is the property path on the bound object.
  GP.ui.field = function (f, value, path) {
    path = path || f.key;
    const label = '<span class="lbl">' + esc(L(f.cs, f.en)) + '</span>';
    const id = 'f_' + path.replace(/\W/g, '_');
    let input;
    switch (f.type) {
      case 'longtext':
        input = '<textarea id="' + id + '" data-k="' + path + '" rows="3">' + esc(value) + '</textarea>';
        return '<label class="field wide">' + label + input + '</label>';
      case 'care': {
        // One care item = several terms, each with its own text and months.
        const terms = Array.isArray(value) && value.length ? value : [value && !Array.isArray(value) ? value : {}];
        return '<div class="care-terms" data-care="' + path + '">' + terms.map((t, i) => '<div class="term">' +
          '<textarea data-k="' + path + '.' + i + '.text" rows="2" placeholder="' + esc(L('Co a jak dělat…', 'What and how…')) + '">' + esc(t.text) + '</textarea>' +
          '<div class="care-months"><span class="muted small">' + esc(L('Kdy:', 'When:')) + '</span>' + GP.ui.months(path + '.' + i + '.months', t.months) +
          '<label class="small once" title="' + esc(L('Stačí udělat jednou v kterémkoli z vybraných měsíců (např. natřít kmen). Bez zaškrtnutí se úkol opakuje každý měsíc (např. postřik).',
            'Done once in any of the chosen months (e.g. painting the trunk). Unticked, the task repeats every month (e.g. spraying).')) + '"><input type="checkbox" data-k="' + path + '.' + i + '.once"' + (t.once ? ' checked' : '') + '> ' +
            esc(L('jednorázově', 'once')) + '</label>' +
          (terms.length > 1 ? '<button type="button" class="link danger small" data-delterm="' + path + '" data-i="' + i + '">✕</button>' : '') + '</div></div>').join('') +
          '<button type="button" class="link small" data-addterm="' + path + '">+ ' + L('další termín', 'another time') + '</button></div>';
      }
      case 'months':
        return '<div class="field wide">' + label + GP.ui.months(path, value) + '</div>';
      case 'multi': {
        const set = new Set(value || []);
        return '<div class="field' + (f.wide || (!f.half && f.opts.length > 3) ? ' wide' : '') + (f.span ? ' span' + f.span : '') + '">' + label + '<div class="chips" data-multi="' + path + '">' +
          f.opts.map(o => '<button type="button" class="chip' + (set.has(o[0]) ? ' on' : '') + '" data-v="' + o[0] + '">' +
            (o[4] ? '<span class="sw" style="background:' + o[4] + '"></span> ' : '') + esc(L(o[1], o[2])) + '</button>').join('') + '</div></div>';
      }
      case 'num':
        return '<label class="field">' + label + '<input type="text" inputmode="decimal" data-k="' + path + '" value="' + esc(value) + '"' + (f.hint ? ' placeholder="' + esc(f.hint) + '"' : '') + '></label>';
      case 'bool':
        return '<label class="field">' + label + '<select data-k="' + path + '" data-type="bool">' +
          '<option value=""' + (value !== true && value !== false ? ' selected' : '') + '>?</option>' +
          '<option value="1"' + (value === true ? ' selected' : '') + '>' + L('ano', 'yes') + '</option>' +
          '<option value="0"' + (value === false ? ' selected' : '') + '>' + L('ne', 'no') + '</option></select></label>';
      case 'select':
        return '<label class="field">' + label + '<select data-k="' + path + '"><option value=""></option>' +
          (f.opts || GP.PLANT_TYPES).map(t => '<option value="' + t[0] + '"' + (value === t[0] ? ' selected' : '') + '>' + esc(L(t[1], t[2])) + '</option>').join('') +
          '</select></label>';
      case 'color':
        return '<label class="field">' + label + '<span class="row"><input type="color" data-k="' + path + '" value="' + esc(value || '#cccccc') + '">' +
          (value ? '<button type="button" class="link small" data-clear="' + path + '">' + L('automaticky', 'automatic') + '</button>' : '<span class="muted small">' + L('podle barvy květů', 'from flower colour') + '</span>') + '</span></label>';
      case 'url':
        return '<label class="field">' + label + '<span class="row"><input type="url" data-k="' + path + '" value="' + esc(value) + '">' +
          (value ? '<a href="' + esc(value) + '" target="_blank" rel="noopener" class="small">↗</a>' : '') + '</span></label>';
      case 'date':
        return '<label class="field">' + label + '<input type="date" data-k="' + path + '" value="' + esc(value) + '"></label>';
      default: {
        const list = f.list ? '<datalist id="' + id + '_l">' + f.list.map(o => '<option value="' + esc(o) + '">').join('') + '</datalist>' : '';
        return '<label class="field' + (f.italic ? ' italic' : '') + (f.wide ? ' wide' : '') + '">' + label + '<input type="text" data-k="' + path + '" value="' + esc(value) + '"' +
          (f.list ? ' list="' + id + '_l"' : '') + (f.hint ? ' placeholder="' + esc(f.hint) + '"' : '') + '>' + list + '</label>';
      }
    }
  };

  // Two-way binding: edits inside `root` write straight into `obj` and save.
  GP.ui.bind = function (root, obj, onChange) {
    const changed = key => { GP.save(); if (onChange) onChange(key); };
    root.addEventListener('input', e => {
      const k = e.target.dataset.k;
      if (!k || e.target.tagName === 'SELECT' || e.target.type === 'checkbox') return;
      GP.setPath(obj, k, e.target.value);
      changed(k);
    });
    root.addEventListener('change', e => {
      const k = e.target.dataset.k;
      if (!k || (e.target.tagName !== 'SELECT' && e.target.type !== 'checkbox')) return;
      // a ticked box stores true, an empty one nothing
      const v = e.target.type === 'checkbox' ? (e.target.checked || undefined)
        : e.target.dataset.type === 'bool' ? (e.target.value === '' ? '' : e.target.value === '1') : e.target.value;
      GP.setPath(obj, k, v);
      changed(k);
    });
    root.addEventListener('click', e => {
      const btn = e.target.closest('.months .m');
      if (btn) {
        const box = btn.closest('.months'), path = box.dataset.months;
        btn.classList.toggle('on');
        const months = [...box.querySelectorAll('.m.on')].map(b => +b.dataset.m);
        GP.setPath(obj, path, months);
        changed(path);
        return;
      }
      const chip = e.target.closest('[data-multi] .chip');
      if (chip) {
        // "none" (žádná / nejedovatá) excludes every other choice and the other way round
        const box = chip.closest('[data-multi]'), path = box.dataset.multi;
        chip.classList.toggle('on');
        if (chip.classList.contains('on')) box.querySelectorAll('.chip.on').forEach(c => {
          if (c !== chip && (c.dataset.v === 'none' || chip.dataset.v === 'none')) c.classList.remove('on');
        });
        GP.setPath(obj, path, [...box.querySelectorAll('.chip.on')].map(c => c.dataset.v));
        changed(path);
        return;
      }
      const clr = e.target.closest('[data-clear]');
      if (clr) { GP.setPath(obj, clr.dataset.clear, ''); changed(clr.dataset.clear); GP.render(); }
    });
  };

  // Resize an uploaded image so photos do not bloat storage.
  GP.ui.readImage = function (file, maxSize) {
    maxSize = maxSize || 1000;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  GP.ui.download = function (filename, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: type || 'text/plain' }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  GP.ui.toast = function (msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = 'show';
    clearTimeout(t._h);
    t._h = setTimeout(() => (t.className = ''), 2600);
  };

  GP.ui.bar = pct => '<span class="bar" title="' + pct + ' %"><span style="width:' + pct + '%;background:' +
    (pct >= 80 ? 'var(--ok)' : pct >= 40 ? 'var(--warn)' : 'var(--bad)') + '"></span></span>';

  GP.ui.swatch = hex => (hex ? '<span class="sw" style="background:' + esc(hex) + '"></span>' : '');
})(window.GP);
