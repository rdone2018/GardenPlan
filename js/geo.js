// Location helpers: device GPS, map picker (Leaflet, loaded on demand), address search,
// and site data from the web (OpenStreetMap Nominatim, Open-Meteo elevation + historical weather).
(function (GP) {
  const L = GP.L, esc = GP.esc;
  GP.geo = {};

  // ---------- device location ----------
  GP.geo.current = function () {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error(L('Prohlížeč neumí zjistit polohu.', 'This browser cannot get the location.')));
      if (window.isSecureContext === false) return reject(new Error(L('Poloha funguje jen přes https nebo http://localhost.', 'Location only works over https or http://localhost.')));
      navigator.geolocation.getCurrentPosition(resolve, err => {
        const msg = {
          1: L('Přístup k poloze nebyl povolen. Povolte ho v prohlížeči (ikona vlevo v adresním řádku) a ve Windows: Nastavení → Soukromí a zabezpečení → Poloha. Nebo vyberte místo na mapě.',
            'Location access was denied. Allow it in the browser (icon left of the address bar) and in Windows: Settings → Privacy & security → Location. Or pick the place on the map.'),
          2: L('Polohu se nepodařilo zjistit (počítač nemá GPS ani Wi‑Fi polohu). Vyberte místo na mapě.', 'Position unavailable (no GPS or Wi‑Fi location). Pick the place on the map.'),
          3: L('Zjištění polohy trvalo příliš dlouho. Zkuste to znovu nebo vyberte místo na mapě.', 'Getting the location timed out. Try again or pick the place on the map.')
        }[err.code] || err.message;
        reject(new Error(msg));
      }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
    });
  };

  // ---------- address search / reverse ----------
  const NOMINATIM = 'https://nominatim.openstreetmap.org/';
  GP.geo.search = async function (q) {
    const r = await fetch(NOMINATIM + 'search?format=jsonv2&limit=6&addressdetails=1&accept-language=' + L('cs', 'en') + '&q=' + encodeURIComponent(q));
    if (!r.ok) throw new Error('Nominatim ' + r.status);
    return (await r.json()).map(x => ({ lat: +x.lat, lon: +x.lon, name: x.display_name }));
  };
  GP.geo.reverse = async function (lat, lon) {
    const r = await fetch(NOMINATIM + 'reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=' + L('cs', 'en') + '&lat=' + lat + '&lon=' + lon);
    if (!r.ok) throw new Error('Nominatim ' + r.status);
    const j = await r.json(), a = j.address || {};
    const street = [a.road || a.hamlet || a.suburb, a.house_number].filter(Boolean).join(' ');
    const town = [a.postcode, a.village || a.town || a.city || a.municipality].filter(Boolean).join(' ');
    return { address: [street, town, a.country].filter(Boolean).join(', ') || j.display_name, region: a.state || a.county || '' };
  };

  // ---------- site & climate ----------
  const fmtDay = doy => { // day of year (non-leap) -> "25. 4."
    const d = new Date(2001, 0, 1); d.setDate(Math.round(doy));
    return L(d.getDate() + '. ' + (d.getMonth() + 1) + '.', d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
  };
  const doyOf = iso => { const d = new Date(iso + 'T12:00:00'); return Math.round((d - new Date(d.getFullYear(), 0, 0)) / 864e5); };
  const round1 = x => Math.round(x * 10) / 10;
  const avg = xs => { const v = xs.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

  GP.geo.elevation = async function (lat, lon) {
    const r = await fetch('https://api.open-meteo.com/v1/elevation?latitude=' + lat + '&longitude=' + lon);
    if (!r.ok) throw new Error('Open-Meteo ' + r.status);
    return Math.round((await r.json()).elevation[0]);
  };

  // Daily history of the last `years` complete years (+ preceding half year for the first winter).
  GP.geo.climate = async function (lat, lon, years) {
    years = years || 5;
    const lastYear = new Date().getFullYear() - 1, firstYear = lastYear - years + 1;
    const url = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + lat + '&longitude=' + lon +
      '&start_date=' + (firstYear - 1) + '-07-01&end_date=' + lastYear + '-12-31' +
      '&daily=temperature_2m_min,temperature_2m_max,temperature_2m_mean,precipitation_sum&timezone=Europe%2FBerlin';
    const r = await fetch(url);
    if (!r.ok) throw new Error('Open-Meteo archive ' + r.status);
    const d = (await r.json()).daily;
    const rows = d.time.map((t, i) => ({ t, y: +t.slice(0, 4), m: +t.slice(5, 7), tmin: d.temperature_2m_min[i], tmax: d.temperature_2m_max[i], tmean: d.temperature_2m_mean[i], rain: d.precipitation_sum[i] }));
    // Average precipitation per calendar month over the full years
    const monthlyRain = [];
    for (let m = 1; m <= 12; m++) {
      const sums = [];
      for (let y = firstYear; y <= lastYear; y++) sums.push(rows.filter(x => x.y === y && x.m === m).reduce((s, x) => s + (x.rain || 0), 0));
      monthlyRain.push(Math.round(avg(sums)));
    }
    const out = [];
    for (let y = firstYear; y <= lastYear; y++) {
      const inYear = rows.filter(x => x.y === y);
      const winter = rows.filter(x => (x.y === y - 1 && x.m >= 7) || (x.y === y && x.m <= 6));
      const spring = inYear.filter(x => x.m <= 6 && x.tmin != null && x.tmin <= 0);
      const autumn = inYear.filter(x => x.m >= 7 && x.tmin != null && x.tmin <= 0);
      const wmin = winter.reduce((best, x) => (x.tmin != null && (!best || x.tmin < best.tmin) ? x : best), null);
      const smax = inYear.reduce((best, x) => (x.tmax != null && (!best || x.tmax > best.tmax) ? x : best), null);
      const last = spring.length ? spring[spring.length - 1].t : null, first = autumn.length ? autumn[0].t : null;
      out.push({
        year: y,
        winterMin: wmin ? round1(wmin.tmin) : null, winterMinDate: wmin ? wmin.t : null,
        summerMax: smax ? round1(smax.tmax) : null, summerMaxDate: smax ? smax.t : null,
        lastFrost: last, firstFrost: first,
        frostFree: last && first ? doyOf(first) - doyOf(last) : null,
        rain: Math.round(inYear.reduce((s, x) => s + (x.rain || 0), 0)),
        meanT: round1(avg(inYear.map(x => x.tmean)))
      });
    }
    const absMin = out.reduce((b, x) => (x.winterMin != null && (!b || x.winterMin < b.winterMin) ? x : b), null);
    return {
      years: out,
      monthlyRain,
      summary: {
        minTemp: round1(avg(out.map(x => x.winterMin))),
        maxTemp: round1(avg(out.map(x => x.summerMax))),
        absMin: absMin && absMin.winterMin, absMinYear: absMin && absMin.year,
        lastFrost: avg(out.map(x => x.lastFrost && doyOf(x.lastFrost))),
        firstFrost: avg(out.map(x => x.firstFrost && doyOf(x.firstFrost))),
        frostFree: Math.round(avg(out.map(x => x.frostFree))),
        rain: Math.round(avg(out.map(x => x.rain))),
        meanT: round1(avg(out.map(x => x.meanT)))
      }
    };
  };

  // Fill the GPS-driven fields of a garden. Returns a list of problems (empty = all fine).
  GP.geo.fillGarden = async function (g) {
    const lat = parseFloat(String(g.lat).replace(',', '.')), lon = parseFloat(String(g.lon).replace(',', '.'));
    if (isNaN(lat) || isNaN(lon)) throw new Error(L('Nejdřív vyplňte GPS souřadnice.', 'Fill in GPS coordinates first.'));
    const problems = [];
    const [addr, elev, clim] = await Promise.allSettled([GP.geo.reverse(lat, lon), GP.geo.elevation(lat, lon), GP.geo.climate(lat, lon, 5)]);
    if (addr.status === 'fulfilled') { g.address = addr.value.address; g.region = addr.value.region; } else problems.push(L('adresa', 'address'));
    if (elev.status === 'fulfilled') g.altitude = String(elev.value); else problems.push(L('nadmořská výška', 'altitude'));
    if (clim.status === 'fulfilled') {
      const s = clim.value.summary;
      g.minTemp = s.minTemp != null ? String(s.minTemp) : '';
      g.maxTemp = s.maxTemp != null ? String(s.maxTemp) : '';
      g.lastFrost = s.lastFrost != null ? '~ ' + fmtDay(s.lastFrost) : '';
      g.firstFrost = s.firstFrost != null ? '~ ' + fmtDay(s.firstFrost) : '';
      g.frostFree = s.frostFree ? String(s.frostFree) : '';
      g.rainfall = s.rain ? String(s.rain) : '';
      g.meanTemp = s.meanT != null ? String(s.meanT) : '';
      g.climate = { fetched: new Date().toISOString().slice(0, 10), lat, lon, years: clim.value.years, monthlyRain: clim.value.monthlyRain, absMin: s.absMin, absMinYear: s.absMinYear };
    } else problems.push(L('klimatická data', 'climate data'));
    GP.saveNow();
    return problems;
  };

  GP.geo.historyTable = function (c) {
    if (!c || !c.years) return '';
    const day = iso => (iso ? fmtDay(doyOf(iso)) : '—');
    return '<details class="history"><summary>📈 ' + L('Historie po letech', 'History by year') + ' (' + c.years[0].year + '–' + c.years[c.years.length - 1].year + ')</summary>' +
      '<table class="tbl small"><thead><tr><th>' + L('Rok', 'Year') + '</th><th>' + L('Nejnižší teplota (zima)', 'Lowest temp (winter)') + '</th><th>' + L('Nejvyšší teplota (léto)', 'Highest temp (summer)') + '</th><th>' + L('Poslední jarní mráz', 'Last spring frost') + '</th><th>' +
      L('První podzimní mráz', 'First autumn frost') + '</th><th>' + L('Bez mrazu (dní)', 'Frost-free (days)') + '</th><th>' + L('Srážky (mm)', 'Rain (mm)') + '</th><th>' + L('Prům. teplota', 'Mean temp') + '</th></tr></thead><tbody>' +
      c.years.map(y => '<tr><td>' + y.year + '</td><td>' + (y.winterMin != null ? y.winterMin + ' °C <span class="muted">(' + day(y.winterMinDate) + ')</span>' : '—') + '</td><td>' +
        (y.summerMax != null ? y.summerMax + ' °C <span class="muted">(' + day(y.summerMaxDate) + ')</span>' : '—') + '</td><td>' + day(y.lastFrost) + '</td><td>' + day(y.firstFrost) +
        '</td><td>' + (y.frostFree || '—') + '</td><td>' + y.rain + '</td><td>' + (y.meanT != null ? y.meanT + ' °C' : '—') + '</td></tr>').join('') +
      '</tbody></table><p class="muted small">' + L('Nejnižší teplota za období', 'Lowest temperature of the period') + ': <b>' + c.absMin + ' °C</b> (' + c.absMinYear + '). ' +
      L('Zdroj: Open‑Meteo (reanalýza ERA5, mřížka cca 10 km, korigováno na nadmořskou výšku), mráz = teplota vzduchu ve 2 m ≤ 0 °C – přízemní mrazíky bývají častější. Staženo', 'Source: Open‑Meteo (ERA5 reanalysis, ~10 km grid, elevation-adjusted); frost = air temperature at 2 m ≤ 0 °C – ground frosts are more frequent. Fetched') +
      ' ' + esc(c.fetched) + '.</p></details>';
  };

  // Average precipitation per month as a small bar chart (SVG). Hovering a month shows its value.
  GP.geo.rainChart = function (monthly) {
    const W = 300, H = 132, top = 16, base = 112, slot = W / 12, bw = slot - 4, r = 4;
    const max = Math.max(1, ...monthly);
    const maxIdx = monthly.indexOf(Math.max(...monthly));
    let bars = '';
    monthly.forEach((v, i) => {
      const h = Math.max(1, (v / max) * (base - top)), x = i * slot + 2, y = base - h, rr = Math.min(r, h);
      const path = 'M' + x + ',' + base + 'V' + (y + rr) + 'Q' + x + ',' + y + ' ' + (x + rr) + ',' + y + 'H' + (x + bw - rr) +
        'Q' + (x + bw) + ',' + y + ' ' + (x + bw) + ',' + (y + rr) + 'V' + base + 'Z';
      bars += '<g class="rb' + (i === maxIdx ? ' max' : '') + '"><rect class="hit" x="' + i * slot + '" y="0" width="' + slot + '" height="' + H + '"/>' +
        '<path d="' + path + '"/><text class="val" x="' + (x + bw / 2) + '" y="' + (y - 4) + '">' + v + '</text>' +
        '<text class="mon" x="' + (x + bw / 2) + '" y="' + (base + 14) + '">' + esc(GP.monthShort(i + 1)) + '</text>' +
        '<title>' + esc(GP.monthName(i + 1)) + ': ' + v + ' mm</title></g>';
    });
    return '<svg class="rain-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(L('Průměrné srážky po měsících', 'Average precipitation by month')) + '">' +
      '<line class="baseline" x1="0" x2="' + W + '" y1="' + base + '" y2="' + base + '"/>' + bars + '</svg>';
  };

  // ---------- map picker ----------
  let leafletLoading = null;
  function loadLeaflet() {
    if (window.L && window.L.map) return Promise.resolve();
    if (leafletLoading) return leafletLoading;
    leafletLoading = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload = resolve;
      s.onerror = () => { leafletLoading = null; reject(new Error(L('Mapu se nepodařilo načíst – jste připojeni k internetu?', 'Could not load the map – are you online?'))); };
      document.head.appendChild(s);
    });
    return leafletLoading;
  }

  // Opens a modal map; resolves with {lat, lon} or null when cancelled.
  GP.geo.pickOnMap = async function (lat, lon) {
    await loadLeaflet();
    const Lf = window.L;
    return new Promise(resolve => {
      const box = document.createElement('div');
      box.className = 'modal';
      box.innerHTML = '<div class="modal-box"><div class="row gap"><input type="search" class="grow" data-q placeholder="' + L('Hledat adresu, obec…', 'Search address, town…') + '">' +
        '<button class="btn" data-search>🔎 ' + L('Hledat', 'Search') + '</button></div><ul class="plain search-res" data-res></ul>' +
        '<div class="map" data-map></div><div class="row gap"><span class="muted small grow" data-info>' + L('Klikněte do mapy na místo zahrady.', 'Click the garden location on the map.') + '</span>' +
        '<button class="btn" data-cancel>' + L('Zrušit', 'Cancel') + '</button><button class="btn primary" data-ok disabled>✓ ' + L('Použít tuto polohu', 'Use this location') + '</button></div></div>';
      document.body.appendChild(box);
      const has = !isNaN(lat) && !isNaN(lon);
      const map = Lf.map(box.querySelector('[data-map]')).setView(has ? [lat, lon] : [49.8, 15.5], has ? 17 : 7);
      const osm = Lf.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      const sat = Lf.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '© Esri' });
      Lf.control.layers({ [L('Mapa', 'Map')]: osm, [L('Letecká', 'Aerial')]: sat }).addTo(map);
      let marker = null, picked = null;
      const set = (la, lo) => {
        picked = { lat: +la.toFixed(6), lon: +lo.toFixed(6) };
        if (marker) marker.setLatLng([la, lo]); else marker = Lf.circleMarker([la, lo], { radius: 9, color: '#3e7b3a', weight: 3, fillOpacity: 0.5 }).addTo(map);
        box.querySelector('[data-info]').textContent = picked.lat + ', ' + picked.lon;
        box.querySelector('[data-ok]').disabled = false;
      };
      if (has) set(lat, lon);
      map.on('click', e => set(e.latlng.lat, e.latlng.lng));
      const close = v => { map.remove(); box.remove(); resolve(v); };
      box.querySelector('[data-cancel]').onclick = () => close(null);
      box.querySelector('[data-ok]').onclick = () => close(picked);
      const doSearch = async () => {
        const q = box.querySelector('[data-q]').value.trim();
        if (!q) return;
        const ul = box.querySelector('[data-res]');
        ul.innerHTML = '<li class="muted">…</li>';
        try {
          const res = await GP.geo.search(q);
          ul.innerHTML = res.map((x, i) => '<li><button class="link" data-i="' + i + '">' + esc(x.name) + '</button></li>').join('') || '<li class="muted">' + L('Nic nenalezeno', 'Nothing found') + '</li>';
          ul.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const x = res[+b.dataset.i]; map.setView([x.lat, x.lon], 18); set(x.lat, x.lon); ul.innerHTML = ''; });
        } catch (e) { ul.innerHTML = '<li class="warn-text">' + esc(e.message) + '</li>'; }
      };
      box.querySelector('[data-search]').onclick = doSearch;
      box.querySelector('[data-q]').onkeydown = e => { if (e.key === 'Enter') doSearch(); };
      setTimeout(() => map.invalidateSize(), 50);
    });
  };
})(window.GP);
