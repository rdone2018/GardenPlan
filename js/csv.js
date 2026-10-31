// CSV reading/writing. Handles Excel exports in Czech locale (";" delimiter, Windows-1250 or UTF-8).
(function (GP) {
  GP.csv = {};

  GP.csv.decode = function (buffer) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '');
    } catch (e) {
      return new TextDecoder('windows-1250').decode(buffer);
    }
  };

  GP.csv.parse = function (text) {
    const firstLine = text.split(/\r?\n/, 1)[0];
    const count = ch => firstLine.split(ch).length - 1;
    const delim = [';', '\t', ','].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ';');
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"' && field === '') quoted = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(v => v.trim() !== '')) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some(v => v.trim() !== '')) rows.push(row);
    return rows.map(r => r.map(v => v.trim()));
  };

  // Header -> "plant:<key>" | "place:<key>" | ""
  GP.csv.matchHeader = function (header) {
    let h = GP.norm(header).replace(/[:*]+$/, '').trim();
    if (!h) return '';
    // "Hnojení – měsíce" (as written by our own export) -> months of a care item
    const monthsSuffix = /\s*[–-]\s*(mesice|months)$/;
    if (monthsSuffix.test(h)) {
      const base = GP.csv.matchHeader(h.replace(monthsSuffix, ''));
      const f = GP.PLANT_FIELDS.find(x => 'plant:' + x.key === base);
      return f && f.type === 'care' ? base + '.months' : '';
    }
    const candidates = [];
    for (const f of GP.PLANT_FIELDS) candidates.push(['plant:' + f.key, [GP.norm(f.cs), GP.norm(f.en), ...f.aliases]]);
    for (const f of GP.PLACEMENT_FIELDS) candidates.push(['place:' + f.key, [GP.norm(f.cs), GP.norm(f.en), ...f.aliases]]);
    for (const [target, names] of candidates) if (names.includes(h)) return target;
    // Loose match: header starts with an alias (e.g. "Vyžaduje údrž…", "Mrazuvzdornost °C")
    for (const [target, names] of candidates) if (names.some(n => n.length >= 4 && (h.startsWith(n) || n.startsWith(h) && h.length >= 5))) return target;
    return '';
  };

  const cell = v => {
    const s = v == null ? '' : String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  GP.csv.exportPlants = function () {
    const fields = GP.PLANT_FIELDS.filter(f => f.type !== 'color');
    const head = [];
    for (const f of fields) {
      head.push(f.cs);
      if (f.type === 'care') head.push(f.cs + ' – měsíce');
    }
    const lines = [head.map(cell).join(';')];
    for (const p of GP.state.plants) {
      const out = [];
      for (const f of fields) {
        const v = p[f.key];
        if (f.type === 'care') { out.push(v ? v.text || '' : ''); out.push(v ? GP.formatMonths(v.months) : ''); }
        else if (f.type === 'months') out.push(GP.formatMonths(v || []));
        else if (f.type === 'bool') out.push(v === true ? 'ano' : v === false ? 'ne' : '');
        else if (f.type === 'select') out.push(GP.typeLabel(v));
        else out.push(v || '');
      }
      lines.push(out.map(cell).join(';'));
    }
    return '﻿' + lines.join('\r\n');
  };
})(window.GP);
