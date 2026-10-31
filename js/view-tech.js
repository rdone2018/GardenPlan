// Garden technology: equipment register with instructions, seasonal tasks (feed the calendar) and costs.
(function (GP) {
  const L = GP.L, esc = GP.esc;

  // Sensible seasonal tasks offered for a new piece of equipment.
  const TEMPLATES = {
    watering: [[[4], 'Jarní spuštění: napustit rozvody, zkontrolovat trysky a těsnost, nastavit řídicí jednotku', 'Spring start: fill pipes, check nozzles and leaks, set the controller'],
      [[5, 6, 7, 8], 'Kontrola programu závlahy podle počasí, vyčistit filtr', 'Adjust the watering programme to the weather, clean the filter'],
      [[10], 'Zazimování: vypustit a vyfoukat rozvody, odpojit čerpadlo, baterie z řídicí jednotky', 'Winterising: drain and blow out pipes, disconnect pump, remove controller batteries']],
    mowing: [[[3], 'Servis sekačky: nabrousit nůž, olej, filtr, svíčka / baterie', 'Mower service: sharpen blade, oil, filter, spark plug / battery'],
      [[4, 5, 6, 7, 8, 9, 10], 'Pravidelné sekání, čištění podvozku', 'Regular mowing, clean the deck'],
      [[11], 'Uložit na zimu: vyčistit, nabít baterii, robot do garáže / dovnitř', 'Store for winter: clean, charge battery, robot mower indoors']],
    lighting: [[[3], 'Kontrola svítidel, kabelů a časovače', 'Check lights, cables and timer'], [[10], 'Posunout časovač na zimní čas', 'Shift the timer for winter time']],
    camera: [[[3, 9], 'Vyčistit objektivy, zkontrolovat záznam a aktualizace', 'Clean lenses, check recording and updates']],
    sensor: [[[3], 'Výměna baterií, kalibrace čidel', 'Replace batteries, calibrate sensors']],
    tools: [[[2], 'Nabrousit a naolejovat nářadí', 'Sharpen and oil tools']],
    other: []
  };

  GP.views.tech = {
    render() {
      const eq = GP.state.equipment;
      const total = eq.reduce((s, e) => s + (parseFloat(String(e.price || '').replace(/\s/g, '').replace(',', '.')) || 0), 0);
      let html = '<div class="head"><h1>' + L('Technika a automatizace', 'Technology & automation') + '</h1><div class="row gap"><select data-act="kind">' +
        GP.EQUIP_KINDS.map(k => '<option value="' + k[0] + '">' + esc(L(k[1], k[2])) + '</option>').join('') + '</select><button class="btn primary" data-act="new">+ ' + L('Přidat zařízení', 'Add equipment') + '</button></div></div>';
      if (!eq.length) return html + '<div class="empty"><p>' + L('Evidujte závlahu, sekačky, osvětlení, kamery i nářadí: návody, nastavení automatizace, servisní úkoly do kalendáře, ceny a záruky.', 'Keep track of irrigation, mowers, lights, cameras and tools: manuals, automation settings, service tasks for the calendar, prices and warranties.') + '</p></div>';
      const today = new Date().toISOString().slice(0, 10);
      for (const [k, cs, en] of GP.EQUIP_KINDS) {
        const items = eq.filter(e => e.kind === k);
        if (!items.length) continue;
        html += '<h2>' + esc(L(cs, en)) + '</h2><div class="cards">' + items.map(e => {
          const g = GP.byId('gardens', e.gardenId);
          const months = [...new Set((e.tasks || []).flatMap(t => t.months || []))];
          return '<a class="card" href="#/equipment/' + e.id + '"><h3>' + esc(e.name || L('(bez názvu)', '(unnamed)')) + '</h3><p class="muted small">' + esc([e.brand, g && g.name].filter(Boolean).join(' · ')) + '</p>' +
            '<p class="small">' + (months.length ? '📅 ' + esc(GP.formatMonths(months)) : '') + (e.price ? ' · ' + esc(e.price) + ' Kč' : '') +
            (e.warranty ? ' · ' + (e.warranty < today ? '<span class="warn-text">' + L('záruka skončila', 'warranty expired') + '</span>' : L('záruka do ', 'warranty until ') + esc(e.warranty)) : '') + '</p></a>';
        }).join('') + '</div>';
      }
      if (total) html += '<p class="panel">' + L('Pořizovací cena celkem', 'Total purchase cost') + ': <b>' + total.toLocaleString(L('cs-CZ', 'en-GB')) + ' Kč</b></p>';
      return html;
    },
    mount(root) {
      root.querySelector('[data-act=new]').onclick = () => {
        const kind = root.querySelector('[data-act=kind]').value;
        const e = { id: GP.uid(), kind, gardenId: GP.state.gardens.length === 1 ? GP.state.gardens[0].id : '', name: GP.optLabel(GP.EQUIP_KINDS, kind),
          tasks: (TEMPLATES[kind] || []).map(([months, cs, en]) => ({ months, text: L(cs, en) })) };
        GP.state.equipment.push(e);
        GP.saveNow(); GP.go('equipment/' + e.id);
      };
    }
  };

  GP.views.equipment = {
    render([id]) {
      const e = GP.byId('equipment', id);
      if (!e) return '<p>' + L('Zařízení nenalezeno.', 'Equipment not found.') + ' <a href="#/tech">←</a></p>';
      return '<div class="head"><h1><a href="#/tech" class="back">←</a> ' + esc(e.name || '') + '</h1><button class="btn danger" data-act="del">' + L('Smazat', 'Delete') + '</button></div>' +
        '<div class="panel"><div class="form" id="eform">' +
        '<label class="field"><span class="lbl">' + L('Druh', 'Kind') + '</span><select data-k="kind">' + GP.EQUIP_KINDS.map(k => '<option value="' + k[0] + '"' + (e.kind === k[0] ? ' selected' : '') + '>' + esc(L(k[1], k[2])) + '</option>').join('') + '</select></label>' +
        '<label class="field"><span class="lbl">' + L('Zahrada', 'Garden') + '</span><select data-k="gardenId"><option value="">' + L('všechny', 'all') + '</option>' + GP.state.gardens.map(g => '<option value="' + g.id + '"' + (e.gardenId === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('') + '</select></label>' +
        GP.EQUIP_FIELDS.map(f => GP.ui.field(f, e[f.key])).join('') + '</div></div>' +
        '<div class="panel"><h2>📅 ' + L('Sezónní úkoly', 'Seasonal tasks') + '</h2><p class="muted small">' + L('Objeví se v kalendáři ve vybraných měsících.', 'They appear in the calendar in the selected months.') + '</p><div id="etasks">' +
        (e.tasks || []).map((t, i) => '<div class="etask"><textarea data-k="tasks.' + i + '.text" rows="2">' + esc(t.text) + '</textarea>' + GP.ui.months('tasks.' + i + '.months', t.months) +
          '<button class="link danger" data-deltask="' + i + '">✕</button></div>').join('') +
        '</div><button class="btn" data-act="addtask">+ ' + L('Přidat úkol', 'Add task') + '</button></div>';
    },
    mount(root, [id]) {
      const e = GP.byId('equipment', id);
      if (!e) return;
      GP.ui.bind(root.querySelector('#eform'), e);
      GP.ui.bind(root.querySelector('#etasks'), e);
      root.querySelector('[data-act=addtask]').onclick = () => { (e.tasks = e.tasks || []).push({ text: '', months: [] }); GP.saveNow(); GP.render(); };
      root.querySelectorAll('[data-deltask]').forEach(b => b.onclick = () => { e.tasks.splice(+b.dataset.deltask, 1); GP.saveNow(); GP.render(); });
      root.querySelector('[data-act=del]').onclick = () => {
        if (!confirm(L('Smazat zařízení?', 'Delete this equipment?'))) return;
        GP.state.equipment = GP.state.equipment.filter(x => x !== e);
        GP.saveNow(); GP.go('tech');
      };
    }
  };
})(window.GP);
