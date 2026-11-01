// Calendar: monthly reminders generated from plant care months, equipment tasks and custom tasks; year overview.
(function (GP) {
  const L = GP.L, esc = GP.esc;
  const cal = { month: new Date().getMonth() + 1, garden: '', view: 'month' };
  const careFields = () => GP.PLANT_FIELDS.filter(f => f.type === 'care');
  // month fields that are reminders too (planting out, sowing)
  const taskFields = () => GP.PLANT_FIELDS.filter(f => f.task);
  const taskShown = (p, f) => !f.show || f.show(p);

  // Care of what grows in the garden in month `m` (optionally for one garden): only plants planted out –
  // sowing and planting are in the planting plan (plantingPage), which works with the whole catalog.
  GP.monthAgenda = function (m, gardenId) {
    const tasks = [], bloom = new Map(), harvest = new Map();
    const pls = GP.state.placements.filter(pl => pl.status === 'planted' && (!gardenId || pl.gardenId === gardenId));
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
          tasks.push({ key, kind: 'care', field: f.key, plant: p, icon: f.icon || '•', title: GP.fieldLabel(f) + ' – ' + GP.plantName(p), text: c.text, garden: g, href: '#/plant/' + p.id });
        });
      }
    }
    for (const e of GP.state.equipment) {
      if (gardenId && e.gardenId && e.gardenId !== gardenId) continue;
      (e.tasks || []).forEach((t, i) => {
        if ((t.months || []).includes(m)) tasks.push({ key: 'eq:' + e.id + ':' + i, kind: 'eq', icon: '⚙️', title: (t.text || L('Údržba', 'Maintenance')).split('\n')[0] + ' – ' + (e.name || '?'), text: t.text, garden: GP.byId('gardens', e.gardenId), href: '#/equipment/' + e.id });
      });
    }
    for (const t of GP.state.tasks) {
      if (gardenId && t.gardenId && t.gardenId !== gardenId) continue;
      if ((t.months || []).includes(m)) tasks.push({ key: 'task:' + t.id, kind: 'task', icon: '📝', title: t.title, text: t.note, garden: GP.byId('gardens', t.gardenId), custom: t });
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

  // ---------- month page: overview of the work + sections Planting · Flowering · Ripening · Care ----------
  const nextMonth = m => m % 12 + 1;
  // kinds of work, in the order of the overview (only the ones that occur are shown)
  const workKinds = () => careFields().map(f => ({ id: f.key, icon: f.icon || '•', label: GP.fieldLabel(f), is: t => t.kind === 'care' && t.field === f.key }))
    .concat([{ id: 'eq', icon: '⚙️', label: L('Technika', 'Equipment'), is: t => t.kind === 'eq' }, { id: 'task', icon: '📝', label: L('Vlastní úkoly', 'Custom tasks'), is: t => t.kind === 'task' }]);

  const tasksWord = n => L(n === 1 ? 'úkol' : n >= 2 && n <= 4 ? 'úkoly' : 'úkolů', n === 1 ? 'task' : 'tasks');

  function overview(m, a, b) {
    const done = GP.state.taskDone, isDone = t => done[doneKey(t.key, m)];
    const rows = workKinds().map(k => ({ k, cur: a.tasks.filter(k.is), nxt: b.tasks.filter(k.is) })).filter(r => r.cur.length || r.nxt.length);
    const max = Math.max(1, ...rows.map(r => Math.max(r.cur.length, r.nxt.length)));
    // bar length as a share of the track minus room for the number
    const w = n => 'calc((100% - 2rem) * ' + (n / max).toFixed(3) + ')';
    const nDone = a.tasks.filter(isDone).length, m2 = nextMonth(m);
    return '<div class="panel cal-sum"><div class="sum-top">' +
      '<div><span class="sum-n">' + a.tasks.length + '</span> ' + tasksWord(a.tasks.length) + ' · <b>' + esc(GP.monthName(m)) + '</b>' +
        (a.tasks.length ? ' <span class="muted small">(' + L('hotovo', 'done') + ' ' + nDone + ')</span>' : '') + '</div>' +
      '<div class="muted"><span class="sum-n nx">' + b.tasks.length + '</span> ' + tasksWord(b.tasks.length) + ' · ' + esc(GP.monthName(m2)) + '</div></div>' +
      (rows.length ? '<div class="sum-legend small muted"><i class="cur"></i>' + esc(GP.monthName(m)) + ' <i class="cur-done"></i>' + L('z toho hotovo', 'of which done') + ' <i class="nxt"></i>' + esc(GP.monthName(m2)) + '</div>' +
        '<div class="sum-rows">' + rows.map(r => {
          const d = r.cur.filter(isDone).length;
          return '<div class="sum-row"><span class="sum-lbl">' + r.k.icon + ' ' + esc(r.k.label) + '</span><div class="sum-bars">' +
            '<div class="sum-bar" title="' + esc(GP.monthName(m) + ': ' + r.cur.length + ' · ' + L('hotovo', 'done') + ' ' + d) + '"><i class="cur" style="width:' + w(r.cur.length) + '"><b style="width:' + (r.cur.length ? d / r.cur.length * 100 : 0) + '%"></b></i><em>' + r.cur.length + '</em></div>' +
            '<div class="sum-bar" title="' + esc(GP.monthName(m2) + ': ' + r.nxt.length) + '"><i class="nxt" style="width:' + w(r.nxt.length) + '"></i><em>' + r.nxt.length + '</em></div></div></div>';
        }).join('') + '</div>' : '<p class="muted small">' + L('V těchto dvou měsících nejsou žádné úkoly.', 'No tasks in these two months.') + '</p>') +
      '<p class="small muted sum-foot">🌸 ' + L('kvete', 'in flower') + ' ' + a.bloom.length + ' → ' + b.bloom.length + ' · 🍎 ' + L('zraje', 'ripening') + ' ' + a.harvest.length + ' → ' + b.harvest.length + '</p></div>';
  }

  function monthPage(m, gardenId) {
    const a = GP.monthAgenda(m, gardenId), b = GP.monthAgenda(nextMonth(m), gardenId);
    const done = GP.state.taskDone, showGarden = GP.state.gardens.length > 1 && !gardenId;
    const li = (t, label) => {
      const d = done[doneKey(t.key, m)];
      return '<li class="' + (d ? 'done' : '') + '"><label><input type="checkbox" data-done="' + esc(t.key) + '" data-m="' + m + '"' + (d ? ' checked' : '') + '> ' +
        (t.href ? '<a href="' + t.href + '">' + esc(label) + '</a>' : '<b>' + esc(label) + '</b>') + '</label>' +
        (showGarden && t.garden ? ' <span class="tag">' + esc(t.garden.name) + '</span>' : '') +
        (t.custom ? ' <button class="link danger small" data-deltask="' + t.custom.id + '">✕</button>' : '') +
        (t.text ? '<div class="small muted pre">' + esc(t.text) + '</div>' : '') + '</li>';
    };
    // plant tasks grouped by kind of work ("✂️ Řez / střih (4)"), each line = the plant
    const grouped = tasks => workKinds().map(k => {
      const ts = tasks.filter(k.is);
      return ts.length ? '<h4>' + k.icon + ' ' + esc(k.label) + ' <span class="muted">(' + ts.length + ')</span></h4><ul class="tasks">' +
        ts.map(t => li(t, t.plant ? GP.plantName(t.plant) : t.title)).join('') + '</ul>' : '';
    }).join('');
    const plantLinks = (list, swatch) => list.length ? '<div class="pchips">' + list.map(p => '<a class="pchip" href="#/plant/' + p.id + '">' + (swatch ? GP.ui.swatch(GP.colorHex(p)) + ' ' : '') + esc(GP.plantName(p)) + '</a>').join('') + '</div>' : '';
    const sec = (icon, title, n, body, cls) => '<div class="panel cal-sec' + (cls ? ' ' + cls : '') + '"><h3>' + icon + ' ' + title + ' <span class="muted">(' + n + ')</span></h3>' +
      (body || '<p class="muted small">' + L('Nic', 'Nothing') + '</p>') + '</div>';
    const care = a.tasks.filter(t => t.kind === 'care'), other = a.tasks.filter(t => t.kind === 'eq' || t.kind === 'task');
    return overview(m, a, b) + '<div class="cal-secs" id="agenda">' +
      sec('🌸', L('Kvetení', 'Flowering'), a.bloom.length, plantLinks(a.bloom, true)) +
      sec('🍎', L('Zrání a sklizeň', 'Ripening and harvest'), a.harvest.length, plantLinks(a.harvest)) +
      sec('🧰', L('Péče', 'Care'), care.length + other.length, grouped(care) +
        (other.length ? '<h4>⚙️ ' + L('Technika a vlastní úkoly', 'Equipment and custom tasks') + ' <span class="muted">(' + other.length + ')</span></h4><ul class="tasks">' + other.map(t => li(t, t.title)).join('') + '</ul>' : ''), 'wide') +
      '</div>';
  }

  function yearView(gardenId) {
    const pls = GP.state.placements.filter(pl => pl.status === 'planted' && (!gardenId || pl.gardenId === gardenId));
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

  // ---------- planting plan: sowing and planting out, for any plant in the catalog ----------
  // (vegetables mostly – they are sown every year, so they stay here even when planted)
  const SOW = () => [['sowInMonths', '🏠'], ['sowOutMonths', '🌱'], ['plantMonths', '🪴']]
    .map(([key, icon]) => ({ f: GP.PLANT_FIELDS.find(x => x.key === key), icon })).filter(s => s.f);
  const resown = p => ['annual', 'biennial'].includes(p.type) || ['vegetable', 'herb'].includes(p.crop);
  const sowMonths = (p, s) => (taskShown(p, s.f) && p[s.f.key]) || [];
  // most advanced status of the plant in any garden ('' = not in a garden)
  const plantStatus = p => ['planted', 'planned', 'wish'].find(st => GP.state.placements.some(pl => pl.plantId === p.id && pl.status === st)) || '';
  function sowCandidates() {
    return GP.state.plants.filter(p => SOW().some(s => sowMonths(p, s).length)).filter(p => {
      if (cal.sow === 'veg' && !resown(p)) return false;
      // a tree or shrub already in the ground is not planted again
      return cal.sow === 'all' || plantStatus(p) !== 'planted' || resown(p);
    });
  }

  function plantingPage(m) {
    const list = sowCandidates(), done = GP.state.taskDone;
    const tag = p => { const st = plantStatus(p); return '<span class="tag' + (st ? '' : ' muted') + '">' + esc(st ? GP.statusLabel(st) : L('není v zahradě', 'not in a garden')) + '</span>'; };
    const hint = (p, s) => (s.f.key === 'plantMonths'
      ? [p.spacing ? L('spon ', 'spacing ') + p.spacing + ' cm' : '', p.depth ? L('hloubka ', 'depth ') + p.depth + ' cm' : '']
      : [p.germDays ? L('klíčí ', 'germinates in ') + p.germDays + L(' dní', ' days') : '', p.germTemp ? p.germTemp + ' °C' : '']).filter(Boolean).join(' · ');
    const sec = s => {
      const ps = list.filter(p => sowMonths(p, s).includes(m)).sort((a, b) => GP.plantName(a).localeCompare(GP.plantName(b), 'cs'));
      return '<div class="panel cal-sec"><h3>' + s.icon + ' ' + esc(L(s.f.task[0], s.f.task[1])) + ' <span class="muted">(' + ps.length + ')</span></h3>' +
        (ps.length ? '<ul class="tasks">' + ps.map(p => {
          const key = 'sow:' + p.id + ':' + s.f.key, d = done[doneKey(key, m)], h = hint(p, s);
          return '<li class="' + (d ? 'done' : '') + '"><label><input type="checkbox" data-done="' + esc(key) + '" data-m="' + m + '"' + (d ? ' checked' : '') + '> <a href="#/plant/' + p.id + '">' + esc(GP.plantName(p)) + '</a></label> ' + tag(p) +
            (h ? '<div class="small muted pre">' + esc(h) + '</div>' : '') + '</li>';
        }).join('') + '</ul>' : '<p class="muted small">' + L('Nic', 'Nothing') + '</p>') + '</div>';
    };
    // whole year at a glance: when to sow inside, sow outside, plant out
    const now = new Date().getMonth() + 1;
    const rows = list.map(p => ({ p, first: Math.min(99, ...SOW().flatMap(s => sowMonths(p, s))) })).sort((a, b) => a.first - b.first || GP.plantName(a.p).localeCompare(GP.plantName(b.p), 'cs'));
    const year = !rows.length ? '' : '<div class="panel"><h3>' + L('Celý rok', 'Whole year') + '</h3><div class="year-wrap"><table class="year"><thead><tr><th></th>' +
      [...Array(12)].map((_, i) => '<th class="' + (i + 1 === now ? 'now' : '') + (i + 1 === m ? ' sel' : '') + '">' + GP.monthShort(i + 1) + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map(({ p }) => '<tr><td class="nm"><a href="#/plant/' + p.id + '">' + esc(GP.plantName(p)) + '</a></td>' + [...Array(12)].map((_, i) => {
        const icons = SOW().filter(s => sowMonths(p, s).includes(i + 1)).map(s => s.icon).join('');
        return '<td class="' + (i + 1 === now ? 'now' : '') + (icons ? ' sow' : '') + '" title="' + esc(GP.monthName(i + 1)) + '">' + icons + '</td>';
      }).join('') + '</tr>').join('') + '</tbody></table></div>' +
      '<p class="small muted">' + SOW().map(s => s.icon + ' ' + L(s.f.task[0], s.f.task[1])).join(' · ') + '</p></div>';
    return '<div class="row gap list-tools"><label class="small">' + L('Zobrazit:', 'Show:') + ' <select data-c="sow">' +
      [['', L('co je potřeba zasadit (bez vysazených stromů a keřů)', 'what needs planting (no trees and shrubs already planted)')], ['veg', L('jen zelenina, bylinky a letničky', 'vegetables, herbs and annuals only')], ['all', L('celý katalog', 'whole catalog')]]
        .map(([v, t]) => '<option value="' + v + '"' + ((cal.sow || '') === v ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></label>' +
      '<span class="small muted">' + list.length + ' ' + L(list.length === 1 ? 'rostlina' : list.length >= 2 && list.length <= 4 ? 'rostliny' : 'rostlin', list.length === 1 ? 'plant' : 'plants') +
        ' ' + L('s termínem výsevu nebo výsadby', 'with a sowing or planting time') + '</span></div>' +
      '<div class="cal-secs" id="agenda">' + SOW().map(sec).join('') + '</div>' + year;
  }

  // coming to the calendar from elsewhere always starts at the current month
  let inCalendar = false;
  window.addEventListener('hashchange', () => { if (!/^#\/calendar/.test(location.hash)) inCalendar = false; });

  GP.views.calendar = {
    render() {
      if (!inCalendar) { cal.month = new Date().getMonth() + 1; cal.view = 'month'; inCalendar = true; }
      const sowing = cal.view === 'sow';
      const gsel = sowing ? '' : '<select data-c="garden"><option value="">' + L('Všechny zahrady', 'All gardens') + '</option>' + GP.state.gardens.map(g => '<option value="' + g.id + '"' + (cal.garden === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('') + '</select>';
      const seg = (v, label) => '<button class="seg' + (cal.view === v ? ' on' : '') + '" data-view="' + v + '">' + label + '</button>';
      let html = '<div class="head"><h1>' + (sowing ? L('Plán výsevu a výsadby', 'Sowing and planting plan') : L('Kalendář péče', 'Care calendar')) + '</h1><div class="row gap">' + gsel +
        seg('month', '🧰 ' + L('Péče – měsíc', 'Care – month')) + seg('year', L('Péče – celý rok', 'Care – whole year')) + seg('sow', '🪴 ' + L('Plán výsadby', 'Planting plan')) + '</div></div>';
      if (cal.view === 'year') return html + '<div class="panel">' + yearView(cal.garden) + '</div>';
      html += '<div class="month-tabs">' + [...Array(12)].map((_, i) => '<button class="' + (cal.month === i + 1 ? 'on' : '') + (new Date().getMonth() === i ? ' now' : '') + '" data-month="' + (i + 1) + '">' + esc(GP.monthName(i + 1)) + '</button>').join('') + '</div>';
      if (sowing) return html + plantingPage(cal.month) +
        '<p class="muted small">' + L('Termíny výsevu a výsadby jsou na kartě rostliny (Výsadba → Kdy sázet a vysévat). Vysazené stromy, keře a trvalky se tu neukazují – zelenina, bylinky a letničky ano, protože se sejí každý rok. Odškrtnutí platí pro letošní rok.',
          'Sowing and planting times are on the plant card (Planting → When to plant and sow). Trees, shrubs and perennials already planted are not shown – vegetables, herbs and annuals are, as they are sown every year. Ticks apply to the current year.') + '</p>';
      html += monthPage(cal.month, cal.garden) +
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
      const gs = root.querySelector('[data-c=garden]');
      if (gs) gs.onchange = e => { cal.garden = e.target.value; GP.render(); };
      const ss = root.querySelector('[data-c=sow]');
      if (ss) ss.onchange = e => { cal.sow = e.target.value; GP.render(); };
      const agenda = root.querySelector('#agenda');
      if (!agenda) return;
      GP.bindAgenda(agenda);
      // a tick changes the "done" part of the overview bars
      if (cal.view === 'month') agenda.addEventListener('change', e => { if (e.target.dataset.done) GP.render(); });
      const form = root.querySelector('#newtask');
      if (!form) return;
      const draft = { months: [cal.month] };
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
