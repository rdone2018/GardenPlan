// Calendar: monthly reminders generated from plant care months, equipment tasks and custom tasks; year overview.
(function (GP) {
  const L = GP.L, esc = GP.esc;
  const cal = { month: new Date().getMonth() + 1, garden: '', view: 'month' };
  const careFields = () => GP.PLANT_FIELDS.filter(f => f.type === 'care');

  // Everything that falls into month `m` (optionally for one garden).
  GP.monthAgenda = function (m, gardenId) {
    const tasks = [], bloom = new Map(), harvest = new Map();
    const pls = GP.state.placements.filter(pl => pl.status !== 'removed' && pl.status !== 'wish' && (!gardenId || pl.gardenId === gardenId));
    const seen = new Set();
    for (const pl of pls) {
      const p = GP.byId('plants', pl.plantId), g = GP.byId('gardens', pl.gardenId);
      if (!p || !g) continue;
      if ((p.bloomMonths || []).includes(m)) bloom.set(p.id, p);
      if ((p.harvestMonths || []).includes(m)) harvest.set(p.id, p);
      for (const f of careFields()) {
        GP.careTerms(p, f.key).forEach((c, i) => {
          if (!(c.months || []).includes(m)) return;
          const key = 'care:' + g.id + ':' + p.id + ':' + f.key + (i ? ':' + i : '');
          if (seen.has(key)) return;
          seen.add(key);
          tasks.push({ key, icon: f.icon || '•', title: GP.fieldLabel(f) + ' – ' + GP.plantName(p), text: c.text, garden: g, href: '#/plant/' + p.id });
        });
      }
    }
    for (const e of GP.state.equipment) {
      if (gardenId && e.gardenId && e.gardenId !== gardenId) continue;
      (e.tasks || []).forEach((t, i) => {
        if ((t.months || []).includes(m)) tasks.push({ key: 'eq:' + e.id + ':' + i, icon: '⚙️', title: (t.text || L('Údržba', 'Maintenance')).split('\n')[0] + ' – ' + (e.name || '?'), text: t.text, garden: GP.byId('gardens', e.gardenId), href: '#/equipment/' + e.id });
      });
    }
    for (const t of GP.state.tasks) {
      if (gardenId && t.gardenId && t.gardenId !== gardenId) continue;
      if ((t.months || []).includes(m)) tasks.push({ key: 'task:' + t.id, icon: '📝', title: t.title, text: t.note, garden: GP.byId('gardens', t.gardenId), custom: t });
    }
    return { tasks, bloom: [...bloom.values()], harvest: [...harvest.values()] };
  };

  const doneKey = (key, m) => key + '|' + new Date().getFullYear() + '|' + m;

  GP.agendaHtml = function (m, gardenId, compact) {
    const a = GP.monthAgenda(m, gardenId);
    const done = GP.state.taskDone;
    const showGarden = GP.state.gardens.length > 1 && !gardenId;
    let html = '<ul class="tasks">' + (a.tasks.map(t => {
      const d = done[doneKey(t.key, m)];
      return '<li class="' + (d ? 'done' : '') + '"><label><input type="checkbox" data-done="' + esc(t.key) + '" data-m="' + m + '"' + (d ? ' checked' : '') + '> <span>' + t.icon + '</span> ' +
        (t.href ? '<a href="' + t.href + '">' + esc(t.title) + '</a>' : '<b>' + esc(t.title) + '</b>') + '</label>' +
        (showGarden && t.garden ? ' <span class="tag">' + esc(t.garden.name) + '</span>' : '') +
        (t.custom && !compact ? ' <button class="link danger small" data-deltask="' + t.custom.id + '">✕</button>' : '') +
        (t.text && !compact ? '<div class="small muted pre">' + esc(t.text) + '</div>' : '') + '</li>';
    }).join('') || '<li class="muted">' + L('Žádné úkoly pro tento měsíc.', 'No tasks for this month.') + '</li>') + '</ul>';
    if (a.bloom.length) html += '<p class="small"><b>🌸 ' + L('Kvete', 'Flowering') + ':</b> ' + a.bloom.map(p => GP.ui.swatch(GP.colorHex(p)) + ' <a href="#/plant/' + p.id + '">' + esc(GP.plantName(p)) + '</a>').join(', ') + '</p>';
    if (a.harvest.length) html += '<p class="small"><b>🍎 ' + L('Zraje / sklizeň', 'Ripening / harvest') + ':</b> ' + a.harvest.map(p => '<a href="#/plant/' + p.id + '">' + esc(GP.plantName(p)) + '</a>').join(', ') + '</p>';
    return html;
  };

  GP.bindAgenda = function (root) {
    root.addEventListener('change', e => {
      const k = e.target.dataset.done;
      if (!k) return;
      const key = doneKey(k, +e.target.dataset.m);
      if (e.target.checked) GP.state.taskDone[key] = true; else delete GP.state.taskDone[key];
      e.target.closest('li').classList.toggle('done', e.target.checked);
      GP.save();
    });
    root.addEventListener('click', e => {
      const d = e.target.closest('[data-deltask]');
      if (!d || !confirm(L('Smazat tento úkol?', 'Delete this task?'))) return;
      GP.state.tasks = GP.state.tasks.filter(t => t.id !== d.dataset.deltask);
      GP.saveNow(); GP.render();
    });
  };

  function yearView(gardenId) {
    const pls = GP.state.placements.filter(pl => pl.status !== 'removed' && (!gardenId || pl.gardenId === gardenId));
    const plants = [...new Set(pls.map(pl => pl.plantId))].map(id => GP.byId('plants', id)).filter(Boolean)
      .sort((a, b) => ((a.bloomMonths || [])[0] || 99) - ((b.bloomMonths || [])[0] || 99));
    if (!plants.length) return '<p class="muted">' + L('Zatím nejsou žádné rostliny v zahradách.', 'No plants in gardens yet.') + '</p>';
    const now = new Date().getMonth() + 1;
    let html = '<div class="year-wrap"><table class="year"><thead><tr><th></th>' + [...Array(12)].map((_, i) => '<th class="' + (i + 1 === now ? 'now' : '') + '">' + GP.monthShort(i + 1) + '</th>').join('') + '</tr></thead><tbody>';
    for (const p of plants) {
      const hex = GP.colorHex(p) || '#bbb';
      html += '<tr><td class="nm"><a href="#/plant/' + p.id + '">' + esc(GP.plantName(p)) + '</a></td>';
      for (let m = 1; m <= 12; m++) {
        const b = (p.bloomMonths || []).includes(m), h = (p.harvestMonths || []).includes(m);
        const care = careFields().filter(f => GP.careTerms(p, f.key).some(t => (t.months || []).includes(m))).map(f => f.icon).join('');
        html += '<td class="' + (m === now ? 'now' : '') + '"' + (b ? ' style="background:' + hex + '"' : '') + ' title="' + esc(GP.monthName(m)) + '">' + (h ? '🍎' : '') + '<span class="ci">' + care + '</span></td>';
      }
      html += '</tr>';
    }
    return html + '</tbody></table></div><p class="small muted">' + L('Barva = kvete · 🍎 zrání · ', 'Colour = flowering · 🍎 ripening · ') + careFields().map(f => f.icon + ' ' + GP.fieldLabel(f)).join(' · ') + '</p>';
  }

  GP.views.calendar = {
    render() {
      const gsel = '<select data-c="garden"><option value="">' + L('Všechny zahrady', 'All gardens') + '</option>' + GP.state.gardens.map(g => '<option value="' + g.id + '"' + (cal.garden === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('') + '</select>';
      let html = '<div class="head"><h1>' + L('Kalendář péče', 'Care calendar') + '</h1><div class="row gap">' + gsel +
        '<button class="seg' + (cal.view === 'month' ? ' on' : '') + '" data-view="month">' + L('Měsíc', 'Month') + '</button><button class="seg' + (cal.view === 'year' ? ' on' : '') + '" data-view="year">' + L('Celý rok', 'Whole year') + '</button></div></div>';
      if (cal.view === 'year') return html + '<div class="panel">' + yearView(cal.garden) + '</div>';
      html += '<div class="month-tabs">' + [...Array(12)].map((_, i) => '<button class="' + (cal.month === i + 1 ? 'on' : '') + (new Date().getMonth() === i ? ' now' : '') + '" data-month="' + (i + 1) + '">' + esc(GP.monthName(i + 1)) + '</button>').join('') + '</div>' +
        '<div class="panel" id="agenda"><h2>' + esc(GP.monthName(cal.month)) + '</h2>' + GP.agendaHtml(cal.month, cal.garden) + '</div>' +
        '<div class="panel"><h3>+ ' + L('Vlastní opakovaný úkol', 'Custom recurring task') + '</h3><div class="form" id="newtask">' +
        '<label class="field"><span class="lbl">' + L('Úkol', 'Task') + '</span><input type="text" data-t="title" placeholder="' + L('např. Vyčistit okapy, objednat mulč…', 'e.g. Clean gutters, order mulch…') + '"></label>' +
        '<label class="field"><span class="lbl">' + L('Zahrada', 'Garden') + '</span><select data-t="gardenId"><option value="">' + L('všechny', 'all') + '</option>' + GP.state.gardens.map(g => '<option value="' + g.id + '"' + (cal.garden === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('') + '</select></label>' +
        '<label class="field wide"><span class="lbl">' + L('Poznámka', 'Note') + '</span><input type="text" data-t="note"></label>' +
        '<div class="field wide"><span class="lbl">' + L('Měsíce', 'Months') + '</span>' + GP.ui.months('months', [cal.month]) + '</div></div>' +
        '<button class="btn primary" data-act="addtask">' + L('Přidat úkol', 'Add task') + '</button></div>' +
        '<p class="muted small">' + L('Připomínky vznikají z měsíců u péče o rostliny (karta rostliny → 2 · Péče), z úkolů techniky a z vlastních úkolů. Odškrtnutí platí pro letošní rok.', 'Reminders come from care months on plants (plant card → 2 · Care), technology tasks and custom tasks. Ticks apply to the current year.') + '</p>';
      return html;
    },
    mount(root) {
      root.querySelectorAll('[data-month]').forEach(b => b.onclick = () => { cal.month = +b.dataset.month; GP.render(); });
      root.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { cal.view = b.dataset.view; GP.render(); });
      root.querySelector('[data-c=garden]').onchange = e => { cal.garden = e.target.value; GP.render(); };
      const agenda = root.querySelector('#agenda');
      if (!agenda) return;
      GP.bindAgenda(agenda);
      const form = root.querySelector('#newtask'), draft = { months: [cal.month] };
      GP.ui.bind(form, draft);
      form.addEventListener('change', e => { if (e.target.dataset.t) draft[e.target.dataset.t] = e.target.value; });
      form.addEventListener('input', e => { if (e.target.dataset.t) draft[e.target.dataset.t] = e.target.value; });
      root.querySelector('[data-act=addtask]').onclick = () => {
        if (!(draft.title || '').trim()) return GP.ui.toast(L('Zadejte název úkolu', 'Enter a task name'));
        if (draft.gardenId == null) draft.gardenId = cal.garden;
        GP.state.tasks.push({ id: GP.uid(), title: draft.title.trim(), note: draft.note || '', gardenId: draft.gardenId || '', months: draft.months || [] });
        GP.saveNow(); GP.render();
      };
    }
  };
})(window.GP);
