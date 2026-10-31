// Overview: getting started, this month's agenda, what to fill in next.
(function (GP) {
  const L = GP.L, esc = GP.esc;

  GP.views.dashboard = {
    render() {
      const s = GP.state, m = new Date().getMonth() + 1;
      const steps = [
        [s.gardens.length > 0, '#/gardens', L('Založte zahradu – poloha, nadmořská výška, půda, okolí', 'Create a garden – location, altitude, soil, surroundings')],
        [s.plants.length > 0, '#/import', L('Importujte seznam rostlin z Excelu (CSV) nebo je přidejte ručně', 'Import your plant list from Excel (CSV) or add plants by hand')],
        [s.placements.some(p => p.cells && p.cells.length), s.gardens[0] ? '#/garden/' + s.gardens[0].id + '/plan' : '#/gardens', L('Rozmístěte rostliny do plánu zahrady', 'Place plants on the garden plan')],
        [s.plants.some(p => (p.bloomMonths || []).length), '#/plants', L('Doplňte, kdy rostliny kvetou a kdy o ně pečovat', 'Fill in flowering and care months')]
      ];
      const started = steps.every(x => x[0]);
      let html = '<div class="head"><h1>' + L('Přehled', 'Overview') + '</h1></div>';
      if (!started) {
        html += '<div class="panel"><h2>' + L('Začínáme', 'Getting started') + '</h2><ol class="steps">' +
          steps.map(([ok, href, text]) => '<li class="' + (ok ? 'ok' : '') + '"><a href="' + href + '">' + (ok ? '✓ ' : '') + esc(text) + '</a></li>').join('') + '</ol></div>';
      }
      html += '<div class="dash"><div class="panel" id="agenda"><h2>📅 ' + esc(GP.monthName(m)) + ' – ' + L('co dělat', 'to do') + '</h2>' + GP.agendaHtml(m, '', true) +
        '<a href="#/calendar" class="small">' + L('Celý kalendář →', 'Full calendar →') + '</a></div>';

      const stats = [
        [s.gardens.length, L('zahrad', 'gardens'), '#/gardens'],
        [s.plants.length, L('rostlin v katalogu', 'plants in catalog'), '#/plants'],
        [s.placements.filter(p => p.status === 'planted').length, L('vysazeno', 'planted'), '#/plants'],
        [s.equipment.length, L('zařízení', 'devices'), '#/tech']
      ];
      html += '<div class="col"><div class="stats">' + stats.map(([n, t, h]) => '<a class="stat" href="' + h + '"><b>' + n + '</b><span>' + esc(t) + '</span></a>').join('') + '</div>';

      const todo = s.plants.map(p => [p, GP.completeness(p)]).filter(x => x[1] < 100).sort((a, b) => a[1] - b[1]).slice(0, 8);
      if (todo.length) {
        html += '<div class="panel"><h3>✏️ ' + L('Doplnit údaje', 'Details to fill in') + '</h3><ul class="plain">' +
          todo.map(([p, pct]) => '<li class="row"><a href="#/plant/' + p.id + '">' + esc(GP.plantName(p)) + '</a><span class="grow"></span>' + GP.ui.bar(pct) + '</li>').join('') +
          '</ul><a class="small" href="#/plants" data-act="incomplete">' + L('Všechny nekompletní →', 'All incomplete →') + '</a></div>';
      }
      html += '</div></div>';
      return html;
    },
    mount(root) {
      GP.bindAgenda(root.querySelector('#agenda'));
      const inc = root.querySelector('[data-act=incomplete]');
      if (inc) inc.onclick = () => { GP.plantFilter.missing = '_any'; GP.plantFilter.sort = 'complete'; };
    }
  };
})(window.GP);
