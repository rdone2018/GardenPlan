// Router and page shell.
(function (GP) {
  const L = GP.L;

  const NAV = [
    ['', '🏡', 'Přehled', 'Overview'],
    ['gardens', '🗺️', 'Zahrady', 'Gardens'],
    ['plants', '🌸', 'Rostliny', 'Plants'],
    ['calendar', '📅', 'Kalendář', 'Calendar'],
    ['tech', '⚙️', 'Technika', 'Technology'],
    ['data', '💾', 'Data', 'Data']
  ];
  const ROUTES = { '': 'dashboard', gardens: 'gardens', garden: 'garden', plants: 'plants', plant: 'plant',
    import: 'import', calendar: 'calendar', tech: 'tech', equipment: 'equipment', data: 'data' };

  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    return { name: ROUTES[parts[0]] ? parts[0] : '', args: parts.slice(1) };
  }

  GP.go = path => { location.hash = '#/' + path; };

  GP.render = function () {
    const r = route();
    document.documentElement.lang = GP.state.settings.lang;

    document.getElementById('nav').innerHTML = NAV.map(([path, icon, cs, en]) => {
      const active = r.name === path || (path === 'gardens' && r.name === 'garden') || (path === 'plants' && (r.name === 'plant' || r.name === 'import')) ||
        (path === 'tech' && r.name === 'equipment');
      return '<a href="#/' + path + '" class="' + (active ? 'active' : '') + '"><span>' + icon + '</span> ' + L(cs, en) + '</a>';
    }).join('');

    const lang = GP.state.settings.lang;
    document.getElementById('lang').innerHTML =
      '<button data-lang="cs" class="' + (lang === 'cs' ? 'on' : '') + '">CZ</button><button data-lang="en" class="' + (lang === 'en' ? 'on' : '') + '">EN</button>';

    const view = GP.views[ROUTES[r.name]];
    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = (GP.storageError ? '<div class="alert">' + L('Prohlížeč nepovolil ukládání dat – změny se neuloží. Zkuste jiný prohlížeč nebo spusťte serve.ps1.', 'The browser blocked data storage – changes will not be saved. Try another browser or run serve.ps1.') + '</div>' : '') +
      view.render(r.args);
    const app = document.getElementById('app');
    app.replaceChildren(page);
    if (view.mount) view.mount(page, r.args);
  };

  document.getElementById('lang').addEventListener('click', e => {
    const b = e.target.closest('[data-lang]');
    if (!b) return;
    GP.state.settings.lang = b.dataset.lang;
    GP.saveNow();
    GP.render();
  });

  window.addEventListener('hashchange', () => { GP.render(); window.scrollTo(0, 0); });
  window.addEventListener('beforeunload', () => GP.saveNow());
  document.addEventListener('visibilitychange', () => { if (document.hidden) GP.saveNow(); });

  GP.load().then(GP.render);
})(window.GP);
