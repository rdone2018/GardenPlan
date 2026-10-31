// Field definitions (drive forms, CSV mapping, completeness) and month / colour helpers.
(function (GP) {
  const L = GP.L;

  // ---------- text helpers ----------
  GP.norm = s => String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

  // ---------- months ----------
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  GP.MONTHS_CS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
  GP.MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  GP.monthName = m => L(GP.MONTHS_CS, GP.MONTHS_EN)[m - 1];
  GP.monthShort = m => L(ROMAN[m - 1], GP.MONTHS_EN[m - 1].slice(0, 3));

  // Month words in CZ / SK / EN incl. common inflections (matched on diacritics-free text).
  const MONTH_WORDS = [
    [1, 'leden|ledna|lednu|januar|januara|january|jan'],
    [2, 'unor|unora|unoru|februar|februara|february|feb'],
    [3, 'brezen|brezna|breznu|marec|marca|march|mar'],
    [4, 'duben|dubna|dubnu|april|aprila|apr'],
    [5, 'kveten|kvetna|kvetnu|maj|maja|may'],
    [7, 'cervenec|cervence|cervenci|jul|jula|july'],
    [6, 'cerven|cervna|cervnu|jun|juna|june'],
    [8, 'srpen|srpna|srpnu|august|augusta|aug'],
    [9, 'zari|september|septembra|sept|sep'],
    [10, 'rijen|rijna|rijnu|oktober|oktobra|october|okt|oct'],
    [11, 'listopad|listopadu|november|novembra|nov'],
    [12, 'prosinec|prosince|prosinci|december|decembra|dec']
  ];

  // "IV–V", "4-5, 9", "duben až červen", "XI–II" -> sorted month numbers.
  GP.parseMonths = function (input) {
    if (Array.isArray(input)) return input;
    let s = String(input || '');
    if (!s.trim()) return [];
    // Roman numerals only when written in capitals (so Czech "v" / "i" are not read as months).
    s = s.replace(/\b(XII|XI|IX|X|VIII|VII|VI|IV|V|III|II|I)\b/g, r => ' ' + (ROMAN.indexOf(r) + 1) + ' ');
    s = GP.norm(s);
    for (const [m, words] of MONTH_WORDS) s = s.replace(new RegExp('\\b(' + words + ')\\b', 'g'), ' ' + m + ' ');
    s = s.replace(/[–—]|\baz\b|\bdo\b|\bto\b/g, '-');
    const tokens = s.match(/\d{1,2}|-/g) || [];
    const out = new Set();
    let prev = null, range = false;
    for (const tk of tokens) {
      if (tk === '-') { range = prev != null; continue; }
      const n = +tk;
      if (n < 1 || n > 12) { prev = null; range = false; continue; }
      if (range) {
        let m = prev;
        for (let i = 0; i < 12; i++) { out.add(m); if (m === n) break; m = m % 12 + 1; }
      }
      out.add(n);
      prev = n; range = false;
    }
    return [...out].sort((a, b) => a - b);
  };

  // [4,5,9] -> "IV–V, IX" (CZ) / "Apr–May, Sep" (EN)
  GP.formatMonths = function (months) {
    if (!months || !months.length) return '';
    const ms = [...months].sort((a, b) => a - b), parts = [];
    let start = ms[0], prev = ms[0];
    for (let i = 1; i <= ms.length; i++) {
      if (ms[i] === prev + 1) { prev = ms[i]; continue; }
      parts.push(start === prev ? GP.monthShort(start) : GP.monthShort(start) + '–' + GP.monthShort(prev));
      start = prev = ms[i];
    }
    return parts.join(', ');
  };

  // ---------- flower colours ----------
  const COLORS = [
    ['bil|biel|white|snehobil', '#f7f7f2'], ['krem|cream|smetan', '#f1e6c2'],
    ['zlut|zlt|yellow|zlat|gold', '#f1cf35'], ['oranz|orange|merunk', '#f0962a'],
    ['losos|salmon|koral|coral', '#f39a80'], ['ruz|pink|rose', '#ee8db3'],
    ['vin|burgund|bordo', '#7c1f3e'], ['purpur|magent|cyklam', '#b43181'],
    ['cerven|red|karmin', '#d33a2f'], ['fial|purple|violet|levand|lila|lilac', '#8f5cc4'],
    ['modr|blue|azur', '#4d7fd6'], ['zelen|green', '#86b85d'], ['hned|brown', '#8a5a36']
  ];
  GP.colorHex = function (plant) {
    if (!plant) return null;
    if (plant.flowerHex) return plant.flowerHex;
    const s = GP.norm(plant.flowerColor);
    if (!s) return null;
    for (const [re, hex] of COLORS) if (new RegExp(re).test(s)) return hex;
    return '#c9c3d6';
  };

  // ---------- plant fields ----------
  // group: 0 basic, 1 before planting, 2 aftercare. core: counts toward completeness.
  const F = (key, group, type, cs, en, aliases, extra) => Object.assign({ key, group, type, cs, en, aliases: aliases || [] }, extra || {});
  GP.PLANT_TYPES = [
    ['tree', 'Strom', 'Tree'], ['fruit', 'Ovocná dřevina', 'Fruit tree / bush'], ['shrub', 'Keř', 'Shrub'],
    ['conifer', 'Jehličnan', 'Conifer'], ['climber', 'Popínavá', 'Climber'], ['perennial', 'Trvalka', 'Perennial'],
    ['annual', 'Letnička', 'Annual'], ['bulb', 'Cibulovina', 'Bulb'], ['grass', 'Tráva', 'Grass'],
    ['fern', 'Kapradina', 'Fern'], ['vegetable', 'Zelenina', 'Vegetable'], ['herb', 'Bylinka', 'Herb'],
    ['aquatic', 'Vodní', 'Aquatic'], ['other', 'Jiné', 'Other']
  ];
  const TYPE_WORDS = {
    tree: 'strom|stromy|tree', fruit: 'ovoc|fruit', shrub: 'ker|kere|kry|shrub|bush', conifer: 'jehlic|ihlic|conifer',
    climber: 'popin|ovijav|climb', perennial: 'trvalk|perenn', annual: 'letnic|annual', bulb: 'cibul|hlizn|bulb',
    grass: 'trav|grass', fern: 'kaprad|papra|fern', vegetable: 'zelenin|vegetab', herb: 'bylin|herb', aquatic: 'vodni|aquat'
  };
  GP.parseType = function (v) {
    const s = GP.norm(v);
    if (!s) return '';
    for (const [k] of GP.PLANT_TYPES) if (s === k) return k;
    for (const [k, re] of Object.entries(TYPE_WORDS)) if (new RegExp(re).test(s)) return k;
    return 'other';
  };
  GP.typeLabel = k => { const t = GP.PLANT_TYPES.find(x => x[0] === k); return t ? L(t[1], t[2]) : ''; };

  GP.PLANT_FIELDS = [
    F('name_cs', 0, 'text', 'Český název', 'Czech name', ['cesky nazev', 'cz', 'cs', 'nazev', 'cesky'], { core: true }),
    F('name_sk', 0, 'text', 'Slovenský název', 'Slovak name', ['slovensky nazov', 'slovensky nazev', 'sk', 'nazov']),
    F('name_en', 0, 'text', 'Anglický název', 'English name', ['english name', 'en', 'anglicky nazev', 'english', 'common name']),
    F('name_la', 0, 'text', 'Latinský název', 'Latin name', ['latinsky nazev', 'latinsky nazov', 'botanicky', 'botanicky nazev', 'latin', 'botanical name', 'latin name'], { core: true, italic: true }),
    F('cultivar', 0, 'text', 'Odrůda / kultivar', 'Cultivar / variety', ['odruda', 'kultivar', 'cultivar', 'variety', 'sorta']),
    F('type', 0, 'select', 'Typ', 'Type', ['typ', 'type', 'druh', 'kategorie'], { core: true }),
    F('purpose', 0, 'text', 'Funkce / účel', 'Purpose', ['funkcia', 'funkce', 'ucel', 'purpose', 'function', 'vyuziti']),
    F('link', 0, 'url', 'Odkaz', 'Link', ['odkaz', 'link', 'url', 'zdroj', 'eshop', 'web']),
    F('price', 0, 'text', 'Cena', 'Price', ['cena', 'price']),

    F('flowerColor', 1, 'text', 'Barva květů', 'Flower colour', ['barva kvetu', 'barva kvetu', 'farba', 'farba kvetov', 'barva', 'flower colour', 'flower color', 'color', 'colour'], { core: true }),
    F('flowerHex', 1, 'color', 'Barva na plánu', 'Colour on plan', []),
    F('bloomMonths', 1, 'months', 'Kvete (měsíce)', 'Flowering (months)', ['kvete', 'kvitne', 'doba kveteni', 'kveteni', 'bloom', 'flowering', 'blooms'], { core: true }),
    F('harvestMonths', 1, 'months', 'Zrání / sklizeň', 'Ripening / harvest', ['zrenie', 'zrani', 'sklizen', 'zber', 'harvest', 'ripening', 'dozrava']),
    F('height', 1, 'text', 'Výška (cm)', 'Height (cm)', ['vyska', 'vyska (cm)', 'height', 'height (cm)'], { core: true }),
    F('width', 1, 'text', 'Šířka (cm)', 'Width (cm)', ['sirka', 'sirka (cm)', 'width', 'width (cm)'], { core: true }),
    F('heightMax', 1, 'text', 'Max. výška (m)', 'Max height (m)', ['max vyska', 'max. vyska', 'vyska max', 'max height', 'max vyska (m)']),
    F('widthMax', 1, 'text', 'Max. šířka (m)', 'Max width (m)', ['max sirka', 'max. sirka', 'sirka max', 'max width', 'max sirka (m)']),
    F('light', 1, 'text', 'Světlo', 'Light', ['svetlo', 'light', 'stanoviste', 'expozice', 'slnko', 'sun'], { core: true, list: ['slunce', 'slunce/polostín', 'polostín', 'polostín/stín', 'stín'] }),
    F('water', 1, 'text', 'Voda / vlhkost', 'Water / moisture', ['voda', 'vlhkost', 'water', 'moisture', 'naroky na vodu'], { core: true, list: ['suchomilná', 'střední', 'vlhkomilná'] }),
    F('hardiness', 1, 'text', 'Mrazuvzdornost', 'Frost hardiness', ['mrazuvzdornost', 'mrazuvzdornost (°c)', 'mrazuvzdornost (c)', 'hardiness', 'zona', 'zona odolnosti', 'odolnost'], { core: true }),
    F('evergreen', 1, 'bool', 'Stálezelená', 'Evergreen', ['stalezelena', 'stalezelene', 'stalezeleny', 'vzdyzelena', 'evergreen'], { core: true }),
    F('maintenance', 1, 'text', 'Vyžaduje údržbu', 'Maintenance', ['vyzaduje udrzbu', 'udrzba', 'narocnost', 'maintenance']),
    F('rootstock', 1, 'text', 'Podnož', 'Rootstock', ['podnoz', 'rootstock']),
    F('planting', 1, 'longtext', 'Výsadba a substrát', 'Planting & soil', ['vysadba a substrat', 'vysadba', 'substrat', 'puda', 'planting', 'soil'], { core: true }),
    F('cultivation', 1, 'longtext', 'Pěstování', 'Cultivation', ['pestovani', 'pestovanie', 'cultivation', 'growing']),
    F('companions', 1, 'longtext', 'Vhodní sousedé', 'Good neighbours', ['vhodni sousede', 'susedia', 'companions', 'good neighbours']),
    F('antagonists', 1, 'longtext', 'Nevhodní sousedé', 'Bad neighbours', ['nevhodni sousede', 'bad neighbours', 'incompatible']),

    F('fertilizing', 2, 'care', 'Hnojení', 'Fertilising', ['hnojeni', 'hnojenie', 'fertilizing', 'fertilising', 'feeding'], { core: true }),
    F('watering', 2, 'care', 'Zálivka', 'Watering', ['zalivka', 'zalievanie', 'watering'], { core: true }),
    F('pruning1', 2, 'care', 'Řez 1', 'Pruning 1', ['rez1', 'rez 1', 'rez', 'strihanie', 'pruning', 'pruning 1'], { core: true }),
    F('pruning2', 2, 'care', 'Řez 2', 'Pruning 2', ['rez2', 'rez 2', 'pruning 2']),
    F('winter', 2, 'care', 'Ochrana na zimu', 'Winter protection', ['ochrana rostlin na zimu', 'ochrana na zimu', 'zimni ochrana', 'zima', 'winter protection', 'winter'], { core: true }),
    F('pests', 2, 'care', 'Choroby a škůdci', 'Diseases & pests', ['choroby a skudci', 'choroby a skodcovia', 'choroby', 'skudci', 'pests', 'diseases'], { core: true }),
    F('otherCare', 2, 'care', 'Další péče', 'Other care', ['dalsi pece', 'pece', 'other care', 'care']),
    F('warning', 2, 'longtext', '!!! Důležité', '!!! Important', ['!!!', 'dulezite', 'pozor', 'warning', 'important']),
    F('notes', 2, 'longtext', 'Poznámky', 'Notes', ['poznamky', 'poznamka', 'notes', 'note'])
  ];
  GP.groups = () => [
    [L('0 · Základ', '0 · Basics'), L('Názvy a identita rostliny', 'Names and identity')],
    [L('1 · Před výsadbou', '1 · Before planting'), L('Velikost a vhodnost pro stanoviště', 'Size and suitability for the spot')],
    [L('2 · Péče během roku', '2 · Care through the year'), L('Měsíce u každé péče vytvoří připomínky v kalendáři', 'Months on each care item create calendar reminders')]
  ];
  GP.fieldLabel = f => L(f.cs, f.en);

  // Fields that belong to one planting in a garden, recognised during CSV import.
  GP.PLACEMENT_FIELDS = [
    { key: 'position', cs: 'Umístění v zahradě', en: 'Position in garden', aliases: ['pozice', 'umisteni', 'umiestnenie', 'umistneni', 'umistnenie', 'misto', 'position', 'location', 'zona'] },
    { key: 'planted', cs: 'Vysazeno (ano/ne)', en: 'Planted (yes/no)', aliases: ['vysazen', 'vysazeno', 'vysadene', 'vysadeny', 'zasazeno', 'planted'] },
    { key: 'count', cs: 'Počet kusů', en: 'Count', aliases: ['pocet', 'ks', 'kusu', 'count', 'quantity', 'mnozstvo'] }
  ];

  GP.isFilled = function (plant, f) {
    const v = plant[f.key];
    if (f.type === 'care') return !!(v && ((v.text && v.text.trim()) || (v.months && v.months.length)));
    if (f.type === 'months') return !!(v && v.length);
    if (f.type === 'bool') return v === true || v === false;
    return v != null && String(v).trim() !== '';
  };
  GP.completeness = function (plant) {
    const core = GP.PLANT_FIELDS.filter(f => f.core);
    return Math.round(100 * core.filter(f => GP.isFilled(plant, f)).length / core.length);
  };

  GP.plantName = function (p) {
    if (!p) return '?';
    const order = GP.state.settings.lang === 'en'
      ? ['name_en', 'name_cs', 'name_la', 'name_sk'] : ['name_cs', 'name_sk', 'name_la', 'name_en'];
    let name = '';
    for (const k of order) if (p[k] && p[k].trim()) { name = p[k].trim(); break; }
    if (p.cultivar && !GP.norm(name).includes(GP.norm(p.cultivar))) name += " '" + p.cultivar.replace(/^['‘’"]|['‘’"]$/g, '') + "'";
    return name || L('(bez názvu)', '(unnamed)');
  };

  GP.parseBool = function (v) {
    const s = GP.norm(v);
    if (!s) return '';
    if (/^(ano|ane|yes|y|true|1|x|✓|ja)$/.test(s) || s.startsWith('ano')) return true;
    if (/^(ne|nie|no|n|false|0|-)$/.test(s) || s.startsWith('ne')) return false;
    return '';
  };

  // ---------- suitability ----------
  // Light words -> set of 'sun' | 'part' | 'shade'
  GP.lightSet = function (text) {
    const s = GP.norm(text), out = new Set();
    if (/polost|polotien|part|half/.test(s)) out.add('part');
    if (/slun|slnk|\bsun/.test(s)) out.add('sun');
    if (/stin|tien|shade/.test(s.replace(/polostin\w*|polotien\w*|partial shade|part shade|half shade/g, ' '))) out.add('shade');
    return out;
  };
  // "−23 °C" / "-23" / "zóna 6" -> minimum temperature in °C (zone converted roughly via USDA)
  GP.hardinessC = function (text) {
    const s = String(text || '').replace(/[−–]/g, '-');
    const zone = GP.norm(s).match(/zon\w*\s*(\d{1,2})/);
    if (zone) return -51.1 + (+zone[1]) * 5.6;
    const m = s.match(/-\s?\d{1,2}(?:[.,]\d)?/);
    return m ? parseFloat(m[0].replace(/\s/g, '').replace(',', '.')) : null;
  };

  GP.CELL_LIGHT = [['', '—', '—'], ['sun', 'slunce', 'sun'], ['part', 'polostín', 'partial shade'], ['shade', 'stín', 'shade']];
  GP.CELL_WATER = [['', '—', '—'], ['dry', 'sucho', 'dry'], ['normal', 'běžná', 'normal'], ['wet', 'vlhko', 'wet']];
  GP.optLabel = (list, v) => { const o = list.find(x => x[0] === v); return o ? L(o[1], o[2]) : ''; };

  // ---------- garden fields ----------
  // ---------- garden ----------
  // Chosen by the owner (left column)
  GP.GARDEN_OWN = [
    { key: 'name', type: 'text', cs: 'Název zahrady', en: 'Garden name' },
    { key: 'owner', type: 'text', cs: 'Majitel', en: 'Owner' },
    { key: 'gardenType', type: 'text', cs: 'Typ zahrady', en: 'Garden type', list: ['okrasná', 'užitková', 'ovocný sad', 'smíšená', 'chalupa', 'předzahrádka'] }
  ];
  // Driven by GPS / downloaded from the web (right column); all stay editable
  GP.GARDEN_SITE = [
    { key: 'address', type: 'text', cs: 'Adresa', en: 'Address' },
    { key: 'altitude', type: 'text', cs: 'Nadmořská výška (m)', en: 'Altitude (m)' },
    { key: 'minTemp', type: 'text', cs: 'Nejnižší zimní teplota (°C, průměr 5 let)', en: 'Lowest winter temperature (°C, 5-year avg)' },
    { key: 'lastFrost', type: 'text', cs: 'Poslední jarní mrazy (průměr)', en: 'Last spring frost (avg)' },
    { key: 'firstFrost', type: 'text', cs: 'První podzimní mrazy (průměr)', en: 'First autumn frost (avg)' },
    { key: 'frostFree', type: 'text', cs: 'Bezmrazé období (dní)', en: 'Frost-free period (days)' },
    { key: 'rainfall', type: 'text', cs: 'Roční srážky (mm, průměr)', en: 'Annual rainfall (mm, avg)' },
    { key: 'meanTemp', type: 'text', cs: 'Průměrná roční teplota (°C)', en: 'Mean annual temperature (°C)' }
  ];
  GP.ASPECTS = [['', '—', '—'], ['flat', 'rovina', 'flat'], ['N', 'sever (S)', 'north (N)'], ['NE', 'severovýchod (SV)', 'north-east (NE)'], ['E', 'východ (V)', 'east (E)'],
    ['SE', 'jihovýchod (JV)', 'south-east (SE)'], ['S', 'jih (J)', 'south (S)'], ['SW', 'jihozápad (JZ)', 'south-west (SW)'], ['W', 'západ (Z)', 'west (W)'], ['NW', 'severozápad (SZ)', 'north-west (NW)']];
  GP.SLOPES = [['', '—', '—'], ['0', 'rovina (0–2°)', 'flat (0–2°)'], ['1', 'mírný (2–7°)', 'gentle (2–7°)'], ['2', 'střední (7–15°)', 'moderate (7–15°)'],
    ['3', 'prudký (15–30°)', 'steep (15–30°)'], ['4', 'velmi prudký (nad 30°)', 'very steep (over 30°)']];
  GP.SOILS = [['sand', 'písčitá', 'sandy'], ['loamysand', 'hlinitopísčitá', 'loamy sand'], ['sandyloam', 'písčitohlinitá', 'sandy loam'], ['loam', 'hlinitá', 'loam'],
    ['clayloam', 'jílovitohlinitá', 'clay loam'], ['clay', 'jílovitá', 'clay'], ['stony', 'kamenitá', 'stony'], ['peat', 'rašelinná', 'peaty'], ['fill', 'navážka', 'made ground']];
  GP.WATER_SOURCES = [['mains', 'vodovod', 'mains water'], ['well', 'studna', 'well'], ['tank', 'retenční nádrž (dešťovka)', 'rainwater tank'], ['barrel', 'sud na dešťovku', 'water butt'],
    ['stream', 'potok / rybník', 'stream / pond'], ['grey', 'šedá voda', 'grey water'], ['other', 'jiný', 'other']];
  GP.SIDES = [['N', 'Na severu', 'To the north'], ['E', 'Na východě', 'To the east'], ['S', 'Na jihu', 'To the south'], ['W', 'Na západě', 'To the west']];
  GP.SURROUND = [['', '—', '—'], ['garden', 'zahrada souseda', 'neighbour’s garden'], ['house', 'dům / budova', 'house / building'], ['street', 'ulice / silnice', 'street / road'],
    ['broadleaf', 'listnatý les', 'broadleaf forest'], ['conifer', 'jehličnatý les', 'coniferous forest'], ['mixed', 'smíšený les', 'mixed forest'],
    ['trees', 'vzrostlé stromy', 'tall trees'], ['field', 'pole', 'field'], ['meadow', 'louka / pastva', 'meadow / pasture'], ['orchard', 'sad', 'orchard'],
    ['water', 'vodní plocha / potok', 'water / stream'], ['wall', 'plot / zeď', 'fence / wall'], ['hedge', 'živý plot', 'hedge'], ['open', 'otevřená krajina', 'open land'], ['other', 'jiné', 'other']];

  GP.EQUIP_KINDS = [['watering', 'Zavlažování', 'Watering'], ['mowing', 'Sekání', 'Mowing'], ['lighting', 'Osvětlení', 'Lighting'],
    ['camera', 'Kamery', 'Cameras'], ['sensor', 'Čidla', 'Sensors'], ['tools', 'Nářadí', 'Tools'], ['other', 'Jiné', 'Other']];
  GP.EQUIP_FIELDS = [
    { key: 'name', type: 'text', cs: 'Název', en: 'Name' },
    { key: 'brand', type: 'text', cs: 'Výrobce / model', en: 'Brand / model' },
    { key: 'purchased', type: 'date', cs: 'Datum pořízení', en: 'Purchase date' },
    { key: 'price', type: 'text', cs: 'Cena (Kč)', en: 'Price (CZK)' },
    { key: 'warranty', type: 'date', cs: 'Záruka do', en: 'Warranty until' },
    { key: 'supplier', type: 'text', cs: 'Dodavatel / servis (kontakt)', en: 'Supplier / service (contact)' },
    { key: 'link', type: 'url', cs: 'Návod / odkaz', en: 'Manual / link' },
    { key: 'instructions', type: 'longtext', cs: 'Návod k obsluze / nastavení / automatizace', en: 'Operating instructions / settings / automation' },
    { key: 'notes', type: 'longtext', cs: 'Poznámky', en: 'Notes' }
  ];
})(window.GP);
