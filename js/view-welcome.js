// Welcome page: opens by itself the first time a new gardener signs in (settings.welcome, set by the server with the
// starter plants), and any time from the profile (Getting started). An animation drawn in the page (no video file,
// so it follows the page language) walks through the steps in order, with real details taken from the starter
// plants (sample/starter-plants.json); below it the same steps as links.
(function (GP) {
  const L = (cs, en) => GP.L(cs, en), esc = s => GP.esc(s);
  let timer = null, starters = null;

  const EMOJI = { 'starter-apple': '🍎', 'starter-tomato': '🍅', 'starter-mint': '🌿', 'starter-rhododendron': '🌺', 'starter-sweetgum': '🌳', 'starter-tulip': '🌷' };
  const loadStarters = () => starters || (starters = fetch('sample/starter-plants.json').then(r => r.json()).catch(() => []));

  // [4,5,6] -> "IV–VI" (or "Apr–Jun"); separate runs joined with commas
  function monthRange(list) {
    const ms = [...new Set(list || [])].sort((a, b) => a - b), runs = [];
    for (const m of ms) { const last = runs[runs.length - 1]; if (last && m === last[1] + 1) last[1] = m; else runs.push([m, m]); }
    return runs.map(([a, b]) => a === b ? GP.monthShort(a) : GP.monthShort(a) + '–' + GP.monthShort(b)).join(', ');
  }
  const months = (p, key) => (p[key] || []).flatMap(t => t.months || []);
  const short = t => { const s = String(t).split(' – ')[0]; return s.length > 60 ? s.slice(0, 58).replace(/[ ,;]+\S*$/, '') + '…' : s; };

  // the care calendar of the starter plants for one month: [icon, text]
  function tasksFor(plants, m) {
    const perPlant = [];
    const KINDS = [['plantMonths', '🪴'], ['pruning', '✂️'], ['fertilizing', '🌱'], ['winter', '❄️'], ['pests', '🐛'], ['diseases', '🍂'], ['otherCare', '📝'], ['watering', '💧'], ['harvestMonths', '🧺']];
    for (const p of plants) {
      const out = []; perPlant.push(out);
      const name = p.name_cs.split(' ')[0];
      for (const [k, icon] of KINDS) {
        const v = p[k];
        if (!Array.isArray(v)) continue;
        if (typeof v[0] === 'number') {
          if (v.includes(m)) out.push([icon, (k === 'plantMonths' ? L('Vysadit', 'Plant') : L('Sklízet', 'Harvest')) + ' – ' + name.toLowerCase()]);
        } else {
          for (const t of v) if ((t.months || []).includes(m)) out.push([icon, name + ': ' + short(t.text)]);
        }
      }
    }
    // one task of each plant in turn, so the list is not all about one plant
    const mixed = [];
    for (let i = 0; mixed.length < 6 && perPlant.some(l => l[i]); i++) for (const l of perPlant) if (l[i] && mixed.length < 6) mixed.push(l[i]);
    return mixed;
  }

  function introHtml(plants) {
    const apple = plants.find(p => p.id === 'starter-apple') || {};
    const row = (icon, label, value, d) => '<li style="--d:' + d + '"><span>' + icon + '</span><b>' + label + '</b>' + value + '</li>';

    // 1: a plant record and what it holds, care included
    const plantCard = '<div class="card-ex"><div class="ex-head" style="--d:0"><span class="ex-ico">🍎</span><div><b>' + esc(apple.name_cs || 'Jabloň') + ' ‘' + esc(apple.cultivar || '') + '’</b><i>' + esc(apple.name_la || '') + '</i></div></div>' +
      '<ul class="ex-rows">' +
      row('🌳', L('Typ', 'Type'), GP.typeLabel(apple.type || 'tree'), 1) +
      row('📏', L('Velikost', 'Size'), esc(apple.height || '') + ' × ' + esc(apple.width || '') + ' cm', 2) +
      row('☀️', L('Světlo', 'Light'), L('plné slunce', 'full sun'), 3) +
      row('❄️', L('Mrazuvzdornost', 'Hardiness'), esc(String(apple.hardiness || '').replace('-', '−')) + ' °C', 4) +
      row('🌸', L('Kvete', 'Flowers'), monthRange(apple.bloomMonths), 5) +
      row('🧺', L('Sklizeň', 'Harvest'), monthRange(apple.harvestMonths), 6) +
      '</ul><div class="ex-care">' +
      [['✂️', L('Řez', 'Pruning'), months(apple, 'pruning')], ['🌱', L('Hnojení', 'Feeding'), months(apple, 'fertilizing')], ['💧', L('Zálivka', 'Watering'), months(apple, 'watering')], ['❄️', L('Na zimu', 'Winter'), months(apple, 'winter')], ['🐛', L('Škůdci', 'Pests'), months(apple, 'pests')], ['🍂', L('Choroby', 'Diseases'), months(apple, 'diseases')], ['🧺', L('Probírka plodů', 'Fruit thinning'), months(apple, 'otherCare')]]
        .map(([i, n, ms], k) => '<span style="--d:' + (7 + k) + '">' + i + ' ' + n + ' <em>' + monthRange(ms) + '</em></span>').join('') + '</div></div>';

    // 2: a garden record and what it holds, size included
    const gardenCard = '<div class="card-ex"><div class="ex-head" style="--d:0"><span class="ex-ico">🏡</span><div><b>' + L('Moje zahrada', 'My garden') + '</b><i>' + L('zahrada u domu', 'garden by the house') + '</i></div></div>' +
      '<ul class="ex-rows">' +
      row('📍', L('Poloha', 'Location'), L('z mapy → 420 m n. m.', 'from the map → 420 m a.s.l.'), 1) +
      row('📐', L('Rozměry', 'Size'), L('30 × 20 m (600 m²), mřížka po 1 m', '30 × 20 m (600 m²), 1 m grid'), 2) +
      row('🧭', L('Orientace', 'Aspect'), L('na jih', 'south'), 3) +
      row('🪨', L('Půda', 'Soil'), L('hlinitá, pH 6,5', 'loam, pH 6.5'), 4) +
      row('🌡️', L('Nejnižší zimní', 'Lowest in winter'), '−20 °C', 5) +
      row('💧', L('Voda', 'Water'), L('studna, kapková závlaha', 'well, drip irrigation'), 6) +
      '</ul><div class="ex-care">' +
      [['z-house', L('Dům', 'House')], ['z-lawn', L('Trávník', 'Lawn')], ['z-bed', L('Záhony', 'Beds')], ['z-veg', L('Zelenina', 'Vegetables')], ['z-path', L('Cesta', 'Path')]]
        .map(([z, n], k) => '<span style="--d:' + (7 + k) + '"><i class="sw ' + z + '"></i>' + n + '</span>').join('') + '</div></div>';

    // 3: the plants go into the garden
    const into = '<div class="into"><ul class="into-plants">' + plants.map((p, i) => '<li style="--d:' + i + '"><span>' + (EMOJI[p.id] || '🌱') + '</span>' + esc(p.name_cs) + '</li>').join('') + '</ul>' +
      '<div class="into-arrow">→</div><div class="into-garden"><b>🏡 ' + L('Moje zahrada', 'My garden') + '</b><ul>' +
      plants.map((p, i) => '<li style="--d:' + i + '">' + (EMOJI[p.id] || '🌱') + ' ' + esc(p.name_cs.split(' ')[0]) + ' <em>' + [2, 6, 3, 2, 1, 25][i % 6] + '×</em></li>').join('') + '</ul></div></div>';

    // 4: the care calendar made from those plants: last month and this month
    const now = new Date().getMonth() + 1, prev = now === 1 ? 12 : now - 1;
    const col = (m, cls) => '<div class="cal-col ' + cls + '"><b>' + esc(GP.monthName(m)) + '</b><ul>' + (tasksFor(plants, m).map(([i, t], k) => '<li style="--d:' + k + '"><span>' + i + '</span>' + esc(t) + '</li>').join('') || '<li class="muted">—</li>') + '</ul></div>';
    const calendar = '<div class="cal-ex">' + col(prev, 'prev') + col(now, 'now') + '</div>';

    // 5: the grid is the garden – the house in the middle, lawn, beds, a path, plants around the house
    const W = 15, H = 10; // 30 x 20 m, one cell = 2 m
    const zone = (c, r) => (c >= 6 && c <= 8 && r >= 3 && r <= 5) ? 'house' : (c === 7 && r >= 6) ? 'path' : (r === 0 && c >= 2 && c <= 12) ? 'bed' : (c <= 3 && r >= 6) ? 'veg' : 'lawn';
    const spots = [['🍎', 1, 1], ['🍎', 3, 1], ['🌳', 13, 2], ['🌺', 10, 4], ['🌺', 5, 4], ['🌷', 6, 7], ['🌷', 8, 7], ['🍅', 1, 7], ['🍅', 2, 8], ['🌿', 0, 9]];
    let cells = '';
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) cells += '<i class="' + (zone(c, r) === 'house' ? 'z-house' : 'z-' + zone(c, r)) + '" style="grid-area:' + (r + 1) + '/' + (c + 1) + ';--i:' + (r + c) + '"></i>';
    const yard = '<div class="yard-wrap"><span class="dim dim-x">30 m</span><span class="dim dim-y">20 m</span><div class="yard">' + cells +
      '<div class="house-label" style="grid-area:4/7/7/10">🏠 ' + L('Dům', 'House') + '</div>' +
      spots.map(([e, c, r], i) => '<b style="grid-area:' + (r + 1) + '/' + (c + 1) + ';--d:' + i + '">' + e + '</b>').join('') +
      '</div><span class="scale">' + L('1 políčko = 2 m', '1 cell = 2 m') + '</span></div>';

    // 2: fill a plant from open databases (Doplnit z databází: Wikidata, GBIF, Wikimedia Commons)
    const lookup = '<div class="look-ex"><div class="look-search" style="--d:0"><span>🔎</span><b class="typing">' + L('jabloň', 'apple') + '</b><em>' + L('Doplnit z databází', 'Fill from databases') + '</em></div>' +
      '<div class="look-pick" style="--d:1">✓ <b>' + esc(apple.name_la || 'Malus domestica') + '</b> <span>' + L('druh', 'species') + ' · Wikidata · GBIF</span></div>' +
      '<ul class="look-rows">' +
      [[L('Latinsky', 'Latin'), apple.name_la], [L('Slovensky', 'Slovak'), apple.name_sk], [L('Anglicky', 'English'), apple.name_en], [L('Rod', 'Genus'), apple.genus], [L('Čeleď', 'Family'), apple.family], [L('Fotka', 'Photo'), '🖼️ Wikimedia Commons']]
        .map(([k, v], i) => '<li style="--d:' + (i + 2) + '"><span>☑</span><b>' + k + '</b>' + esc(v || '') + '</li>').join('') +
      '</ul><div class="look-more" style="--d:8">' + L('a odkazy na hledání: Google · Havlis · Pl@ntNet', 'and search links: Google · Havlis · Pl@ntNet') + '</div></div>';

    // 3: what is missing is red; filling it in raises the completeness bar to 100 %
    const missing = '<div class="miss-ex"><div class="miss-head"><b>🍅 ' + L('Rajče tyčkové', 'Tomato') + '</b><span class="miss-bar"><i></i></span><em class="miss-pct"></em></div><ul>' +
      [[L('Výška', 'Height'), '70–80 cm'], [L('Světlo', 'Light'), L('plné slunce', 'full sun')], [L('Výsev do skleníku', 'Sow indoors'), 'III–IV'], [L('Hnojení', 'Feeding'), L('od kvetení každé 2 týdny', 'every 2 weeks from flowering')], [L('Podzimní barva', 'Autumn colour'), L('nehodí se', 'does not apply')]]
        .map(([k, v], i) => '<li class="' + (i === 4 ? 'na' : '') + '" style="--d:' + i + '"><b>' + k + '</b><span>' + esc(v) + '</span></li>').join('') +
      '</ul><p class="miss-note">' + L('Červeně = chybí · filtr „chybí: …“ najde rostliny, kde co chybí', 'Red = missing · the "missing: …" filter finds plants with gaps') + '</p></div>';

    // 4: two almost identical care texts become one, and the calendar lists the plants together
    const texts = '<div class="txt-ex"><div class="txt a" style="--d:0">' + L('Na jaře hnojit kompostem', 'Feed with compost in spring') + ' <span>🍎</span></div>' +
      '<div class="txt b" style="--d:1">' + L('na jaře hnojit, kompostem', 'feed with compost, in spring') + ' <span>🌺 🌷</span></div>' +
      '<div class="txt merged">✓ ' + L('Na jaře hnojit kompostem', 'Feed with compost in spring') + ' <span>🍎 🌺 🌷</span></div>' +
      '<div class="txt-cal">📅 ' + L('Březen', 'March') + ': <b>' + L('Na jaře hnojit kompostem', 'Feed with compost in spring') + '</b> – ' + L('jabloň, rododendron, tulipán', 'apple, rhododendron, tulip') + '</div>' +
      '<p class="miss-note">' + L('Texty péče: sjednocení podobných textů a stejná péče pro celý rod', 'Care texts: unify similar texts and the same care for a whole genus') + '</p></div>';

    const scenes = [
      [4500, '<div class="sc sc-hello"><p class="eyebrow">' + L('Vítejte v', 'Welcome to') + '</p><h2>MeaFlora</h2><p class="tag">' + L('Vaše zahrada, rostliny a péče na jednom místě', 'Your garden, plants and care in one place') + '</p>' +
        '<svg class="sprout" viewBox="0 0 120 140" aria-hidden="true"><path class="pot" d="M30 100h60l-8 36H38z"/><path class="stem" d="M60 100V48"/><path class="leaf l1" d="M60 74c-22 0-30-14-30-24 16 0 30 8 30 24z"/><path class="leaf l2" d="M60 60c20 0 30-12 30-22-16 0-30 6-30 22z"/><circle class="bloom" cx="60" cy="40" r="11"/></svg></div>'],
      [8500, '<div class="sc"><p class="step">1</p><h3>' + L('Přidejte rostliny', 'Add your plants') + '</h3><p class="tag">' + L('U každé rostliny je vše od velikosti po péči přes celý rok', 'Each plant holds everything from its size to care all year') + '</p>' + plantCard + '</div>'],
      [8000, '<div class="sc"><p class="step">2</p><h3>' + L('Doplňte údaje z internetu', 'Fill in details from the internet') + '</h3><p class="tag">' + L('Názvy, rod, čeleď i fotka z veřejných databází jedním tlačítkem', 'Names, genus, family and a photo from public databases with one button') + '</p>' + lookup + '</div>'],
      [8000, '<div class="sc"><p class="step">3</p><h3>' + L('Zkontrolujte, co chybí', 'Check what is missing') + '</h3><p class="tag">' + L('Aplikace ukáže, co ještě doplnit, až je rostlina na 100 %', 'The app shows what is left to fill in until the plant is 100 %') + '</p>' + missing + '</div>'],
      [8000, '<div class="sc"><p class="step">4</p><h3>' + L('Vylaďte texty péče', 'Tidy up the care texts') + '</h3><p class="tag">' + L('Skoro stejné texty sjednotíte jedním kliknutím', 'Almost identical texts are unified with one click') + '</p>' + texts + '</div>'],
      [8500, '<div class="sc"><p class="step">5</p><h3>' + L('Přidejte zahradu', 'Add your garden') + '</h3><p class="tag">' + L('Poloha, rozměry, půda, klima a zóny zahrady', 'Location, size, soil, climate and the garden zones') + '</p>' + gardenCard + '</div>'],
      [6500, '<div class="sc"><p class="step">6</p><h3>' + L('Přidejte rostliny do zahrady', 'Add plants to the garden') + '</h3><p class="tag">' + L('Kolik kusů a kde rostou', 'How many and where they grow') + '</p>' + into + '</div>'],
      [8500, '<div class="sc"><p class="step">7</p><h3>' + L('Vygenerujte si vlastní kalendář péče', 'Get your own care calendar') + '</h3><p class="tag">' + L('Úkoly pro vaše rostlinky – minulý a tento měsíc', 'Tasks for your plants – last month and this month') + '</p>' + calendar + '</div>'],
      [9000, '<div class="sc"><p class="step">8</p><h3>' + L('Rozmístěte je v mřížce zahrady', 'Place them on the garden grid') + '</h3><p class="tag">' + L('Mřížka je vaše zahrada v metrech – dům, trávník, záhony a rostliny kolem', 'The grid is your garden in metres – house, lawn, beds and plants around') + '</p>' + yard + '</div>']
    ];
    return '<figure class="intro" aria-label="' + L('Ukázka, jak MeaFlora funguje', 'How MeaFlora works') + '">' +
      scenes.map(([ms, s], i) => '<div class="scene" data-scene="' + i + '" data-ms="' + ms + '">' + s + '</div>').join('') +
      '<div class="intro-dots">' + scenes.map((s, i) => '<button type="button" data-go="' + i + '" aria-label="' + (i + 1) + '"></button>').join('') + '</div></figure>';
  }

  function play(fig) {
    const scenes = [...fig.querySelectorAll('.scene')], dots = [...fig.querySelectorAll('[data-go]')];
    let at = -1;
    const show = n => {
      at = (n + scenes.length) % scenes.length;
      // removing and adding the class restarts the scene's CSS animations
      scenes.forEach((s, i) => { s.classList.remove('on'); if (i === at) { void s.offsetWidth; s.classList.add('on'); } });
      dots.forEach((d, i) => d.classList.toggle('on', i === at));
      clearTimeout(timer);
      timer = setTimeout(() => { if (document.body.contains(fig)) show(at + 1); }, Number(scenes[at].dataset.ms) || 6000);
    };
    dots.forEach((d, i) => { d.onclick = () => show(i); });
    show(0);
  }

  GP.views.welcome = {
    render() {
      const step = (n, title, text, href, btn) => '<li class="panel welcome-step"><span class="welcome-number">' + n + '</span><div><h3>' + title + '</h3><p class="muted">' + text + '</p></div><a class="btn" href="' + href + '">' + btn + '</a></li>';
      const g = GP.state.gardens[0];
      return '<div class="head"><div><p class="muted small">' + L('Začínáme', 'Getting started') + '</p><h1>' + L('Vítejte v MeaFlora', 'Welcome to MeaFlora') + '</h1></div></div>' +
        '<figure class="intro intro-loading"></figure>' +
        (GP.state.plants.some(p => p.sample) ? '<div class="welcome-note"><b>' + L('Šest rostlin v katalogu je jen ukázka.', 'The six plants in the catalog are only samples.') + '</b> ' +
          L('Jabloň, rajče, mátu, rododendron, ambroň a tulipán jsme přidali, abyste viděli, co všechno se u rostliny dá zapsat. Upravte je, nebo je smažte a přidejte svoje.', 'The apple tree, tomato, mint, rhododendron, sweetgum and tulip are there to show what a plant record can hold. Edit them, or delete them and add your own.') + '</div>' : '') +
        '<ol class="welcome-steps">' +
        step(1, L('Přidejte rostliny', 'Add your plants'), L('Upravte ukázkové rostliny, nebo je smažte a přidejte svoje – ručně, s vyhledáním na webu, nebo najednou z Excelu (Import CSV).', 'Edit the sample plants, or delete them and add your own – by hand, with a web search, or all at once from Excel (Import CSV).'), '#/plants', L('Rostliny', 'Plants')) +
        step(2, L('Doplňte a vylaďte údaje', 'Complete and tidy up'), L('Na kartě rostliny tlačítko Doplnit z databází vyplní názvy, rod, čeleď a fotku. Červená pole ukazují, co chybí, filtr „chybí: …“ najde rostliny s mezerami a stránka Texty péče sjednotí podobné texty.', 'On the plant card, Fill from databases adds the names, genus, family and a photo. Red fields show what is missing, the "missing: …" filter finds plants with gaps and the Care texts page unifies similar texts.'), '#/caretexts', L('Texty péče', 'Care texts')) +
        step(3, L('Přidejte zahradu', 'Add your garden'), L('Zadejte polohu (podle ní se doplní nadmořská výška a klima), rozměry a velikost políčka mřížky v metrech a namalujte zóny – dům, záhony, trávník, cesty.', 'Enter the location (altitude and climate are filled in from it), the size and the grid cell size in metres, and paint the zones – house, beds, lawn, paths.'), g ? '#/garden/' + g.id : '#/gardens', L('Zahrady', 'Gardens')) +
        step(4, L('Přidejte rostliny do zahrady', 'Add plants to the garden'), L('V seznamu rostlin je zaškrtněte a dejte Přidat do zahrady – zapíšete stav (plánováno, vysazeno), datum a počet kusů.', 'Tick them in the plant list and choose Add to garden – with the status (planned, planted), date and count.'), '#/plants', L('Rostliny', 'Plants')) +
        step(5, L('Kalendář péče', 'Care calendar'), L('Kalendář se sestaví sám z péče u vašich rostlin – každý měsíc víte, co je na řadě.', 'The calendar is made from the care of your plants – every month you know what is due.'), '#/calendar', L('Kalendář', 'Calendar')) +
        step(6, L('Rozmístěte rostliny v mřížce', 'Place plants on the grid'), L('V plánu zahrady klikněte na rostlinu a pak na políčka. Aplikace upozorní, když rostlině nesedí světlo, vlhkost nebo mrazy.', 'In the garden plan pick a plant, then click cells. The app warns when light, moisture or frost does not suit the plant.'), g ? '#/garden/' + g.id + '/plan' : '#/gardens', L('Plán', 'Plan')) +
        step(7, L('Pozvěte další', 'Invite others'), L('V profilu přidejte přihlášení pro rodinu – může upravovat, nebo jen prohlížet jako host.', 'In your profile add sign-ins for your family – they can edit, or only look as guests.'), '#/profile', L('Profil', 'Profile')) +
        '</ol><div class="welcome-end"><button class="btn primary" data-act="done">' + L('Pustit se do toho', 'Get started') + '</button><span class="muted small">' + L('Tuto stránku najdete znovu v profilu (Jak začít).', 'You can open this page again from your profile (Getting started).') + '</span></div>';
    },
    async mount(root) {
      root.querySelector('[data-act=done]').onclick = () => GP.go('');
      // seen once is enough: it no longer opens by itself
      if (GP.state.settings.welcome) { delete GP.state.settings.welcome; GP.save(); }
      const plants = await loadStarters();
      const spot = root.querySelector('.intro-loading');
      if (!spot || !document.body.contains(spot)) return;
      spot.outerHTML = introHtml(plants);
      play(root.querySelector('.intro'));
    }
  };
})(window.GP);
