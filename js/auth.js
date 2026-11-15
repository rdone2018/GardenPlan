// Sign-in, new gardener, first set-up and the gardener profile (only when the app runs through server/server.js).
// A gardener owns gardens, plants, equipment and tasks; several users can sign in to one gardener with their
// e-mail, a guest only looks. Opened from disk or a plain static server, the app has no sign-in at all.
(function (GP) {
  const L = (cs, en) => GP.L(cs, en);
  const esc = s => GP.esc(s);
  GP.auth = {};
  GP.session = null; // { user: {id, email, name, isAdmin, isGuest}, gardener: {id, name, contact, email, country} }

  // Server answers carry a short code; the text is shown in the page language.
  const ERRORS = {
    'wrong-sign-in': ['Nesprávný e-mail nebo heslo.', 'The e-mail or password is wrong.'],
    'sign-in-limit': ['Příliš mnoho neúspěšných pokusů. Zkuste to znovu za {0}.', 'Too many failed attempts. Try again in {0}.'],
    'sign-up-limit': ['Příliš mnoho pokusů o registraci. Zkuste to znovu za {0}.', 'Too many sign-up attempts. Try again in {0}.'],
    'too-fast': ['Vyplňte prosím formulář v klidu a odešlete ho znovu.', 'Please take a moment to fill in the form, then send it again.'],
    'form-expired': ['Formulář vypršel, proto byl obnoven. Odešlete ho prosím znovu.', 'The form has expired, so it was refreshed. Please send it again.'],
    'signup-refused': ['S těmito údaji nelze zahradníka založit. Zkuste jiný e-mail.', 'The gardener could not be created with these details. Try a different e-mail.'],
    email: ['Zadejte platný e-mail.', 'Enter a valid e-mail.'],
    'email-taken': ['Tento e-mail už má účet.', 'This e-mail already has an account.'],
    password: ['Heslo musí mít aspoň 8 znaků.', 'Use a password of at least 8 characters.'],
    'password-again': ['Hesla se neshodují.', 'The passwords do not match.'],
    name: ['Vyplňte jméno zahradníka.', 'Fill in the gardener name.'],
    country: ['Vyberte zemi ze seznamu.', 'Choose a country from the list.'],
    'admin-guest': ['Administrátor nemůže být host.', 'An administrator cannot be a guest.'],
    'own-role': ['Svou vlastní roli změnit nemůžete.', 'You cannot change your own role.'],
    'last-editor': ['Zahradník musí mít aspoň jednoho uživatele, který může dělat změny.', 'A gardener needs at least one user who can make changes.'],
    'remove-self': ['Sami sebe odebrat nemůžete.', 'You cannot remove yourself.'],
    'last-admin': ['Toto je jediný administrátor aplikace, nelze ho odebrat.', 'This is the only administrator of the app, so it cannot be removed.'],
    'set-up': ['Aplikace už je nastavená – přihlaste se.', 'The app is already set up – sign in instead.'],
    guest: ['Host se může jen dívat, změny ukládat nemůže.', 'A guest can only look, not save changes.'],
    'signed-out': ['Přihlášení vypršelo – přihlaste se znovu.', 'Your sign-in has expired – please sign in again.'],
    'not-found': ['Nenalezeno.', 'Not found.'],
    'too-large': ['Požadavek je příliš velký.', 'The request is too large.'],
    network: ['Server neodpovídá. Zkontrolujte připojení.', 'The server does not answer. Check the connection.']
  };
  const waitText = s => s >= 5400 ? Math.ceil(s / 3600) + ' h' : s >= 90 ? Math.ceil(s / 60) + ' min' : s + ' s';
  GP.auth.errorText = (code, wait) => {
    const t = ERRORS[code];
    return (t ? L(t[0], t[1]) : String(code || '')).replace('{0}', waitText(wait || 0));
  };

  // POST with JSON; throws an Error whose message is the text to show (and .data the whole answer).
  async function post(url, body) {
    let r;
    try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), cache: 'no-store' }); }
    catch (e) { throw Object.assign(new Error(GP.auth.errorText('network')), { data: {} }); }
    let data = {};
    try { data = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok) throw Object.assign(new Error(GP.auth.errorText(data.error || 'HTTP ' + r.status, data.wait)), { data, status: r.status });
    return data;
  }
  async function getJson(url) {
    const r = await fetch(url, { cache: 'no-store' });
    const data = await r.json();
    if (!r.ok) throw new Error(GP.auth.errorText(data.error));
    return data;
  }
  GP.auth.post = post;

  // ---------- countries ----------
  let countryList = null;
  async function loadCountries() {
    if (!countryList) countryList = getJson('api/countries').then(d => d.countries).catch(() => []);
    return countryList;
  }
  // Country of the browser, from its language settings (cs -> CZ, sk -> SK, en-GB -> GB).
  GP.auth.browserCountry = function () {
    for (const tag of navigator.languages || [navigator.language || '']) {
      const m = /^([a-z]{2,3})(?:-([A-Za-z]{2}))?/.exec(tag || '');
      if (!m) continue;
      if (m[2]) return m[2].toUpperCase();
      const byLang = { cs: 'CZ', sk: 'SK', de: 'DE', pl: 'PL', hu: 'HU', da: 'DK', sv: 'SE', fr: 'FR', it: 'IT', es: 'ES', nl: 'NL', uk: 'UA' };
      if (byLang[m[1]]) return byLang[m[1]];
    }
    return '';
  };
  function countryName(c) {
    try { return new Intl.DisplayNames([GP.L('cs', 'en')], { type: 'region' }).of(c.code) || c.name; } catch (e) { return c.name; }
  }
  GP.auth.countryOptions = async function (selected) {
    const list = (await loadCountries()).map(c => ({ code: c.code, name: countryName(c) }))
      .sort((a, b) => a.name.localeCompare(b.name, GP.L('cs', 'en')));
    return '<option value="">—</option>' + list.map(c => '<option value="' + c.code + '"' + (c.code === selected ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
  };
  GP.auth.countryName = async function (code) {
    const c = (await loadCountries()).find(x => x.code === code);
    return c ? countryName(c) : code;
  };

  // ---------- start ----------
  // true: go on loading the data (signed in, or no sign-in at all); false: the sign-in screen is shown instead.
  GP.auth.start = async function () {
    let data;
    try {
      const r = await fetch('api/session', { cache: 'no-store' });
      if (!(r.headers.get('content-type') || '').includes('json')) return true; // plain static server: browser storage
      data = await r.json();
      if (!r.ok) return true; // the server has a problem: the data loading shows it
    } catch (e) {
      return true; // no server answer (opened from disk, or the server is down: the last saved copy is shown)
    }
    if (data.signedIn) {
      GP.session = { user: data.user, gardener: data.gardener };
      GP.readOnly = !!data.user.isGuest;
      return true;
    }
    showScreen(data.setupNeeded ? 'setup' : 'signin');
    return false;
  };

  // The server says the session is gone (expired, signed out elsewhere, user removed): show the sign-in screen.
  GP.auth.signedOut = function () {
    if (GP.auth.signedOutShown) return;
    GP.auth.signedOutShown = true;
    GP.session = null;
    showScreen('signin', GP.auth.errorText('signed-out'));
  };

  // Changes still being saved are sent first; the copy kept in this browser is deleted, so the next person using
  // this browser sees nothing of this gardener.
  GP.auth.signOut = async function () {
    try { await GP.flush(); } catch (e) { /* the server will refuse anyway once signed out */ }
    if (GP.hasUnsaved && GP.hasUnsaved() && !confirm(L('Některé změny se nepodařilo uložit na server. Po odhlášení se ztratí. Přesto odhlásit?', 'Some changes could not be saved to the server. They are lost when you sign out. Sign out anyway?'))) return;
    try { await post('api/session/sign-out'); } catch (e) { /* signed out locally anyway */ }
    await GP.clearLocal();
    location.hash = '#/';
    location.reload();
  };

  // ---------- sign-in / new gardener / set-up screens ----------
  let formToken = '', honeypot = 'website', tokenTimer = null;
  async function refreshToken() {
    clearTimeout(tokenTimer);
    try { const d = await getJson('api/form-token'); formToken = d.token; honeypot = d.honeypot || honeypot; } catch (e) { formToken = ''; }
    tokenTimer = setTimeout(refreshToken, 50 * 60 * 1000); // tokens expire after an hour
  }

  const field = (name, label, type, extra) => '<label class="field"><span class="lbl">' + label + '</span><input name="' + name + '" type="' + (type || 'text') + '"' + (extra || '') + '></label>';
  // A field people never see or fill in, but form-filling bots do.
  const trap = () => '<div class="hp" aria-hidden="true"><label>Website <input name="' + honeypot + '" type="text" tabindex="-1" autocomplete="off"></label></div>';

  async function showScreen(mode, message) {
    document.body.classList.add('signed-out');
    const app = document.getElementById('app');
    if (mode !== 'setup') await refreshToken();
    const lang = GP.L('cs', 'en');
    const langBtns = '<div class="lang auth-lang"><button data-lang="cs" class="' + (lang === 'cs' ? 'on' : '') + '">CZ</button><button data-lang="en" class="' + (lang === 'en' ? 'on' : '') + '">EN</button></div>';
    const gardenerFields = async () =>
      field('gardenerName', L('Jméno zahradníka (pod tímto jménem uvidíte své zahrady)', 'Gardener name (your gardens are kept under this name)'), 'text', ' required maxlength="120" placeholder="' + L('např. Zahrada Novákovi', 'e.g. The Smiths\' garden') + '"') +
      field('name', L('Vaše jméno (nepovinné)', 'Your name (optional)'), 'text', ' maxlength="120" autocomplete="name"') +
      '<label class="field"><span class="lbl">' + L('Země', 'Country') + '</span><select name="country">' + await GP.auth.countryOptions(GP.auth.browserCountry()) + '</select></label>' +
      field('email', L('E-mail (pro přihlášení)', 'E-mail (to sign in)'), 'email', ' required autocomplete="email"') +
      field('password', L('Heslo (aspoň 8 znaků)', 'Password (at least 8 characters)'), 'password', ' required minlength="8" autocomplete="new-password"') +
      field('password2', L('Heslo znovu', 'Password again'), 'password', ' required minlength="8" autocomplete="new-password"');
    let html;
    if (mode === 'signin') {
      html = '<h1>' + L('Přihlášení', 'Sign in') + '</h1>' +
        '<form class="auth-form" data-mode="signin">' + trap() +
        field('email', 'E-mail', 'email', ' required autocomplete="username"') +
        field('password', L('Heslo', 'Password'), 'password', ' required autocomplete="current-password"') +
        '<p class="auth-msg danger-text"></p>' +
        '<button class="btn primary" type="submit">' + L('Přihlásit', 'Sign in') + '</button></form>' +
        '<p class="muted">' + L('Ještě nemáte účet?', 'No account yet?') + ' <a href="#" data-to="register">' + L('Založit nového zahradníka', 'Create a new gardener') + '</a></p>';
    } else if (mode === 'register') {
      html = '<h1>' + L('Nový zahradník', 'New gardener') + '</h1>' +
        '<p class="muted">' + L('Založíte si vlastní prostor pro své zahrady, rostliny a techniku. Další lidi (třeba rodinu) můžete pozvat později v profilu.', 'You get your own space for your gardens, plants and equipment. You can add other people (family, for example) later in your profile.') + '</p>' +
        '<form class="auth-form" data-mode="register">' + trap() + await gardenerFields() +
        '<p class="auth-msg danger-text"></p>' +
        '<button class="btn primary" type="submit">' + L('Založit a přihlásit', 'Create and sign in') + '</button></form>' +
        '<p class="muted"><a href="#" data-to="signin">' + L('Už mám účet – přihlásit', 'I already have an account – sign in') + '</a></p>';
    } else {
      html = '<h1>' + L('Nastavení – první spuštění', 'Set-up – first start') + '</h1>' +
        '<p>' + L('Aplikace teď má přihlašování. Všechna dosavadní data (zahrady, rostliny, technika, úkoly) budou patřit zahradníkovi, kterého tady pojmenujete, a vy budete jeho první uživatel a <b>administrátor</b> aplikace.',
          'The app now has sign-in. All existing data (gardens, plants, equipment, tasks) will belong to the gardener you name here, and you will be its first user and the <b>administrator</b> of the app.') + '</p>' +
        '<form class="auth-form" data-mode="setup">' + await gardenerFields() +
        '<p class="auth-msg danger-text"></p>' +
        '<button class="btn primary" type="submit">' + L('Uložit a přihlásit', 'Save and sign in') + '</button></form>';
    }
    app.innerHTML = '<div class="page auth-page"><div class="panel auth-box">' + langBtns + html + '</div></div>';
    if (message) app.querySelector('.auth-msg').textContent = message;
    const first = app.querySelector('input:not([tabindex="-1"])');
    if (first) first.focus();

    app.querySelector('.auth-lang').onclick = e => {
      const b = e.target.closest('[data-lang]');
      if (!b) return;
      GP.setPreLang(b.dataset.lang);
      showScreen(mode);
    };
    app.querySelectorAll('[data-to]').forEach(a => { a.onclick = e => { e.preventDefault(); showScreen(a.dataset.to); }; });
    const form = app.querySelector('form');
    form.onsubmit = async e => {
      e.preventDefault();
      const msg = form.querySelector('.auth-msg'), btn = form.querySelector('[type=submit]');
      const data = Object.fromEntries(new FormData(form).entries());
      msg.textContent = '';
      if (mode !== 'signin') {
        if (String(data.password).length < 8) return (msg.textContent = GP.auth.errorText('password'));
        if (data.password !== data.password2) return (msg.textContent = GP.auth.errorText('password-again'));
        delete data.password2;
      }
      if (mode !== 'setup') data.formToken = formToken;
      btn.disabled = true;
      try {
        await post(mode === 'signin' ? 'api/session' : mode === 'register' ? 'api/register' : 'api/setup', data);
        // start clean with the signed-in gardener's data
        await GP.clearLocal();
        location.hash = '#/';
        location.reload();
      } catch (err) {
        msg.textContent = err.message;
        if (err.data && err.data.formRefresh) await refreshToken();
        btn.disabled = false;
      }
    };
  }

  // ---------- profile page: the gardener and its users ----------
  const roleText = u => u.isAdmin ? L('administrátor', 'administrator') : u.isGuest ? L('host – jen čtení', 'guest – read only') : L('může upravovat', 'can edit');

  GP.views.profile = {
    render() {
      if (!GP.session) return '<div class="head"><h1>' + L('Profil', 'Profile') + '</h1></div><p class="muted">' + L('Aplikace neběží přes server, přihlašování tu není.', 'The app is not running through the server, there is no sign-in here.') + '</p>';
      return '<div class="head"><h1>👤 ' + esc(GP.session.gardener.name || L('Profil', 'Profile')) + '</h1>' +
        '<button class="btn" data-act="signout">🚪 ' + L('Odhlásit', 'Sign out') + '</button></div>' +
        '<p class="muted">' + L('Přihlašovací e-mail:', 'Signed in as') + ' <b>' + esc(GP.session.user.email) + '</b> · ' + roleText(GP.session.user) + '</p>' +
        '<div data-profile><p class="muted">' + L('Načítám…', 'Loading…') + '</p></div>';
    },
    async mount(root) {
      const so = root.querySelector('[data-act=signout]');
      if (so) so.onclick = () => GP.auth.signOut();
      const box = root.querySelector('[data-profile]');
      if (!box) return;
      let g;
      try { g = await getJson('api/gardener'); } catch (e) { box.innerHTML = '<p class="danger-text">' + esc(e.message) + '</p>'; return; }
      const me = GP.session.user, ro = me.isGuest;
      const dis = ro ? ' disabled' : '';
      box.innerHTML =
        '<div class="panel"><h3>' + L('Zahradník', 'Gardener') + '</h3>' +
        '<form class="form" data-form="gardener">' +
        '<label class="field"><span class="lbl">' + L('Jméno zahradníka', 'Gardener name') + '</span><input name="name" type="text" maxlength="120" required value="' + esc(g.name) + '"' + dis + '></label>' +
        '<label class="field"><span class="lbl">' + L('Kontakt (telefon, adresa…)', 'Contact (phone, address…)') + '</span><input name="contact" type="text" maxlength="200" value="' + esc(g.contact) + '"' + dis + '></label>' +
        '<label class="field"><span class="lbl">E-mail</span><input name="email" type="email" maxlength="200" value="' + esc(g.email) + '"' + dis + '></label>' +
        '<label class="field"><span class="lbl">' + L('Země', 'Country') + '</span><select name="country"' + dis + '>' + await GP.auth.countryOptions(g.country || GP.auth.browserCountry()) + '</select></label>' +
        '</form>' + (ro ? '' : '<button class="btn primary" data-act="save">' + L('Uložit', 'Save') + '</button>') + ' <span class="muted small" data-saved></span></div>' +

        '<div class="panel"><h3>' + L('Kdo se může přihlásit', 'Who can sign in') + '</h3>' +
        '<p class="muted small">' + L('Všichni tady vidí stejné zahrady a rostliny. Host si je může jen prohlížet.', 'Everyone here sees the same gardens and plants. A guest can only look.') + '</p>' +
        '<div class="panel flush"><table class="tbl"><thead><tr><th>E-mail</th><th>' + L('Jméno', 'Name') + '</th><th>' + L('Role', 'Role') + '</th><th></th></tr></thead><tbody>' +
        g.users.map(u => '<tr data-user="' + esc(u.id) + '"><td>' + esc(u.email) + (u.id === me.id ? ' <span class="muted small">(' + L('vy', 'you') + ')</span>' : '') + '</td><td>' + esc(u.name) + '</td><td>' + roleText(u) + '</td><td class="row wrap">' +
          (u.id === me.id || !ro ? '<button class="btn small" data-act="password">🔑 ' + (u.id === me.id ? L('Změnit heslo', 'Change password') : L('Nastavit heslo', 'Set password')) + '</button>' : '') +
          (!ro && u.id !== me.id && !u.isAdmin ? '<button class="btn small" data-act="guest">' + (u.isGuest ? L('Povolit změny', 'Allow changes') : L('Udělat hostem', 'Make guest')) + '</button>' : '') +
          (!ro && u.id !== me.id ? '<button class="btn small danger" data-act="remove">' + L('Odebrat', 'Remove') + '</button>' : '') +
          '</td></tr>').join('') +
        '</tbody></table></div>' +
        (ro ? '' : '<h4>' + L('Přidat přihlášení', 'Add a sign-in') + '</h4><form class="form" data-form="adduser">' +
          '<label class="field"><span class="lbl">E-mail</span><input name="email" type="email" required autocomplete="off"></label>' +
          '<label class="field"><span class="lbl">' + L('Jméno (nepovinné)', 'Name (optional)') + '</span><input name="name" type="text" maxlength="120" autocomplete="off"></label>' +
          '<label class="field"><span class="lbl">' + L('Heslo (aspoň 8 znaků)', 'Password (at least 8 characters)') + '</span><input name="password" type="password" minlength="8" required autocomplete="new-password"></label>' +
          '<label class="field"><span class="lbl">' + L('Role', 'Role') + '</span><select name="role"><option value="edit">' + L('může upravovat', 'can edit') + '</option><option value="guest">' + L('host – jen čtení', 'guest – read only') + '</option></select></label>' +
          '</form><p class="muted small">' + L('Heslo pak dotyčnému předejte sami – aplikace e-maily neposílá. Heslo si může po přihlášení změnit.', 'Give the password to the person yourself – the app sends no e-mails. They can change it after signing in.') + '</p>' +
          '<button class="btn primary" data-act="adduser">' + L('Přidat', 'Add') + '</button> <span class="danger-text small" data-err></span>') +
        '</div>';

      const err = msg => { const el = box.querySelector('[data-err]'); if (el) el.textContent = msg || ''; else if (msg) GP.ui.toast(msg); };
      const reload = () => GP.render();
      const saveBtn = box.querySelector('[data-act=save]');
      if (saveBtn) saveBtn.onclick = async () => {
        const data = Object.fromEntries(new FormData(box.querySelector('[data-form=gardener]')).entries());
        try {
          const ng = await post('api/gardener', data);
          GP.session.gardener = { id: ng.id, name: ng.name, contact: ng.contact, email: ng.email, country: ng.country };
          GP.ui.toast(L('Uloženo', 'Saved'));
          reload();
        } catch (e) { GP.ui.toast(e.message); }
      };
      const addBtn = box.querySelector('[data-act=adduser]');
      if (addBtn) addBtn.onclick = async () => {
        const f = box.querySelector('[data-form=adduser]');
        const data = Object.fromEntries(new FormData(f).entries());
        if (String(data.password).length < 8) return err(GP.auth.errorText('password'));
        try {
          await post('api/gardener/users', { email: data.email, name: data.name, password: data.password, isGuest: data.role === 'guest' });
          GP.ui.toast(L('Přihlášení přidáno', 'Sign-in added'));
          reload();
        } catch (e) { err(e.message); }
      };
      box.querySelectorAll('tr[data-user]').forEach(tr => {
        const id = tr.dataset.user, u = g.users.find(x => x.id === id);
        tr.querySelectorAll('[data-act]').forEach(b => {
          b.onclick = async () => {
            const act = b.dataset.act, url = 'api/gardener/users/' + encodeURIComponent(id) + '/';
            try {
              if (act === 'password') {
                // a small inline form instead of prompt(), so the password is not shown in plain text
                const cell = b.parentElement;
                cell.innerHTML = '<input type="password" minlength="8" placeholder="' + L('nové heslo', 'new password') + '" autocomplete="new-password"> <button class="btn small primary">' + L('Uložit', 'Save') + '</button> <button class="btn small">' + L('Zrušit', 'Cancel') + '</button>';
                const [inp, ok, cancel] = cell.children;
                inp.focus();
                cancel.onclick = reload;
                ok.onclick = async () => {
                  if (inp.value.length < 8) return GP.ui.toast(GP.auth.errorText('password'));
                  try {
                    await post(url + 'password', { password: inp.value });
                    GP.ui.toast(id === me.id ? L('Heslo změněno. Na ostatních zařízeních se přihlaste znovu.', 'Password changed. Sign in again on your other devices.') : L('Heslo nastaveno', 'Password set'));
                    reload();
                  } catch (e) { GP.ui.toast(e.message); }
                };
                return;
              }
              if (act === 'guest') await post(url + 'guest', { isGuest: !u.isGuest });
              if (act === 'remove') {
                if (!confirm(L('Odebrat přihlášení ' + u.email + '? Data zahradníka zůstanou.', 'Remove the sign-in ' + u.email + '? The gardener\'s data stays.'))) return;
                await post(url + 'delete');
              }
              reload();
            } catch (e) { GP.ui.toast(e.message); }
          };
        });
      });
    }
  };
})(window.GP);
