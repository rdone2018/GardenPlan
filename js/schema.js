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

  // ---------- option lists: [key, cs, en, match regex (diacritics-free), colour] ----------
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

  const O = GP.PLANT_OPTS = {
    purpose: [['useful', 'užitková', 'useful (crop)', 'uzit|uzitk|crop|edible|use'], ['ornamental', 'okrasná', 'ornamental', 'okras|ornam'],
      ['both', 'užitková i okrasná', 'useful and ornamental', 'obe|oboj|both']],
    habit: [['upright', 'vzpřímený', 'upright', 'vzprim|upright'], ['columnar', 'sloupovitý', 'columnar', 'sloup|column|fastig'],
      ['rounded', 'kulovitý', 'rounded', 'kulov|round|globos'], ['spreading', 'rozložitý', 'spreading', 'rozloz|spread'],
      ['weeping', 'převislý', 'weeping', 'previs|weep|pendul'], ['bushy', 'keřovitý', 'bushy', 'kerov|bush'],
      ['groundcover', 'kobercovitý / půdopokryvný', 'ground cover', 'koberc|pudopokr|ground'], ['climbing', 'popínavý', 'climbing', 'popin|climb'],
      ['clump', 'trsovitý', 'clump-forming', 'trsov|clump']],
    roots: [['shallow', 'mělký', 'shallow', 'melk|shallow'], ['medium', 'středně hluboký', 'medium deep', 'stred|medium'],
      ['deep', 'hluboký (kůlový)', 'deep (taproot)', 'hlubok|kulov|deep|tap'], ['spreading', 'rozrůstavý / výběžkatý', 'spreading / suckering', 'rozrust|vybez|sucker|spread|invaz']],
    foliage: [['evergreen', 'stálezelená', 'evergreen', 'stalezel|vzdyzel|evergreen|^ano$|^yes$'], ['semi', 'poloopadavá', 'semi-evergreen', 'poloopad|semi'],
      ['deciduous', 'opadavá', 'deciduous', 'opad|decid|^ne$|^no$']],
    leafColors: [['green', 'zelená', 'green', 'zelen|green', '#5f9e4a'], ['yellow', 'žlutá', 'yellow', 'zlut|zlt|yellow|zlat|gold', '#d8c23a'],
      ['red', 'červená', 'red / purple', 'cerven|purpur|red|purple', '#a8323a'], ['brown', 'hnědá', 'brown', 'hned|brown|bronz', '#8a5a36'],
      ['variegated', 'panašovaná', 'variegated', 'panas|pestr|variegat', 'repeating-linear-gradient(45deg,#5f9e4a 0 3px,#f1efc9 3px 6px)'],
      ['bluegreen', 'modrozelená / stříbrná', 'blue-green / silver', 'modrozel|stribr|siv|blue|silver|glauc', '#8fb3b0']],
    autumnColors: [['yellow', 'žlutá', 'yellow', 'zlut|zlt|yellow|zlat|gold', '#e3b928'], ['orange', 'oranžová', 'orange', 'oranz|orange', '#e47a24'],
      ['red', 'červená', 'red', 'cerven|red|karmin|sarlat', '#c2302a'], ['purple', 'purpurová', 'purple', 'purpur|vin|purple|burgund', '#7c1f3e'],
      ['brown', 'hnědá', 'brown', 'hned|brown|bronz', '#8a5a36']],
    flowerShowy: [['showy', 'výrazný', 'showy', 'vyrazn|showy|napadn'], ['inconspicuous', 'nevýrazný', 'inconspicuous', 'nevyrazn|nenapad|inconsp']],
    flowerColors: [['white', 'bílá', 'white', 'bil|biel|white|snehobil', '#f7f7f2'], ['cream', 'krémová', 'cream', 'krem|cream|smetan', '#f1e6c2'],
      ['yellow', 'žlutá', 'yellow', 'zlut|zlt|yellow|zlat|gold', '#f1cf35'], ['orange', 'oranžová', 'orange', 'oranz|orange|merunk|losos|salmon|koral|coral', '#f0962a'],
      ['red', 'červená', 'red', 'cerven|red|karmin|sarlat', '#d33a2f'], ['pink', 'růžová', 'pink', 'ruz|pink|rose', '#ee8db3'],
      ['purple', 'vínová / purpurová', 'wine / purple', 'vin|burgund|bordo|purpur|magent|cyklam', '#9b2d5e'], ['violet', 'fialová', 'violet', 'fial|violet|levand|lila|lilac', '#8f5cc4'],
      ['blue', 'modrá', 'blue', 'modr|blue|azur', '#4d7fd6'], ['green', 'zelená', 'green', 'zelen|green', '#86b85d'], ['brown', 'hnědá', 'brown', 'hned|brown', '#8a5a36']],
    scent: [['none', 'žádná', 'none', 'zadn|bez|none|no'], ['light', 'jemná', 'light', 'jemn|slab|light|mild|faint'], ['strong', 'intenzivní', 'strong', 'intenz|silna|vyrazn|strong']],
    fruit: [['edible', 'jedlý', 'edible', '^jedl|edible|^ano'], ['inedible', 'nejedlý', 'inedible', 'nejedl|inedib|^ne$']],
    light: [['sun', '☀ slunce', '☀ sun'], ['part', '⛅ polostín', '⛅ partial shade'], ['shade', '☁ stín', '☁ shade']],
    water: [['dry', 'snese sucho', 'drought tolerant', 'such|dry|drought'], ['medium', 'střední', 'medium', 'stred|norm|medium|mirn|bezn'],
      ['moist', 'vlhkomilná', 'likes moisture', 'vlhk|moist'], ['wet', 'snese i zamokření', 'tolerates waterlogging', 'zamok|bazin|wet|mokr|bog']],
    soilType: [['sand', 'písčitá', 'sandy', 'pisc|pies|sand'], ['loam', 'hlinitá', 'loam', 'hlin|loam'], ['clay', 'jílovitá', 'clay', 'jil|clay'],
      ['humus', 'humózní', 'humus-rich', 'humoz|humus|organ'], ['any', 'nenáročná', 'any', 'nenaroc|any|jakakoli|kazd']],
    soilPh: [['acid', 'kyselá (pH pod 5,5)', 'acidic (pH below 5.5)', 'kysel|acid'], ['macid', 'mírně kyselá (pH 5,5–6,5)', 'slightly acidic (pH 5.5–6.5)', 'mirne kysel|slightly acid'],
      ['neutral', 'neutrální (pH 6,5–7,2)', 'neutral (pH 6.5–7.2)', 'neutr'], ['malk', 'mírně zásaditá (pH 7,2–7,8)', 'slightly alkaline (pH 7.2–7.8)', 'mirne zasad|slightly alk'],
      ['alk', 'zásaditá (pH nad 7,8)', 'alkaline (pH above 7.8)', 'zasad|alkal|vapen|chalk'], ['any', 'snese jakékoli', 'any', 'nenaroc|any|jakekoli']],
    usda: [3, 4, 5, 6, 7, 8, 9, 10].map(n => {
      const lo = Math.round(-51.1 + (n - 1) * 5.56), hi = Math.round(-51.1 + n * 5.56);
      return [String(n), n + ' (' + lo + ' až ' + hi + ' °C)', n + ' (' + lo + ' to ' + hi + ' °C)'];
    }),
    maintenance: [['none', 'žádná', 'none', 'zadn|^ne$|^no$|none'], ['water', 'zálivka', 'watering', 'zaliv|water'], ['fert', 'hnojení', 'fertilising', 'hnoj|fert'], ['prune', 'zastřihávání / řez', 'trimming / pruning', 'rez|strih|prun|trim'],
      ['pests', 'ošetření proti chorobám a škůdcům', 'disease & pest control', 'chorob|skud|postrik|pest|diseas'], ['frost', 'ochrana proti mrazu', 'frost protection', 'mraz|zim|frost|winter']],
    support: [['none', 'není potřeba', 'not needed', 'nepotreb|bez|none|no'], ['stake', 'kůl při výsadbě', 'stake when planting', 'kul|stake'],
      ['permanent', 'trvalá opora (treláž, pergola, drát)', 'permanent support (trellis, pergola, wire)', 'trval|trelaz|pergol|drat|trellis|permanent']],
    growth: [['slow', 'pomalá', 'slow', 'pomal|slow'], ['medium', 'střední', 'medium', 'stred|medium'], ['fast', 'rychlá', 'fast', 'rychl|fast']],
    toxicParts: [['none', 'nejedovatá', 'not toxic'], ['whole', 'celá rostlina', 'whole plant'], ['root', 'kořen', 'root'], ['stem', 'stonek', 'stem'],
      ['leaves', 'listy', 'leaves'], ['flowers', 'květy', 'flowers'], ['fruit', 'plody', 'fruit']],
    toxicFor: [['people', 'pro lidi', 'for people'], ['animals', 'pro zvířata (psi, kočky)', 'for animals (dogs, cats)']],
    pollination: [['self', 'samosprašná', 'self-fertile', '^samospras|self'], ['partial', 'částečně samosprašná', 'partly self-fertile', 'castec|partly|partial'],
      ['cross', 'potřebuje opylovače', 'needs a pollinator', 'cizospras|opylov|cross|needs']],
    wildlife: [['bees', 'včely', 'bees'], ['butterflies', 'motýli', 'butterflies'], ['birds', 'ptáci', 'birds']]
  };
  GP.optLabel = (list, v) => { const o = list.find(x => x[0] === v); return o ? L(o[1], o[2]) : ''; };
  GP.optHex = (list, v) => { const o = list.find(x => x[0] === v); return o ? o[4] : null; };

  // ---------- plant fields ----------
  // group: 0 basics, 1 looks, 2 planting, 3 care. core: counts toward completeness. side: right-hand block. sub: sub-heading.
  // maint (care items): the "needs maintenance" choice that makes this care item expected.
  const F = (key, group, type, cs, en, aliases, extra) => Object.assign({ key, group, type, cs, en, aliases: aliases || [] }, extra || {});
  const SUB = {
    size: ['Velikost a tvar', 'Size and shape'], leaf: ['List', 'Leaves'], flower: ['Květ', 'Flower'], fruit: ['Plod', 'Fruit'],
    needs: ['Požadavky rostliny', 'What the plant needs'], how: ['Jak se sází', 'How to plant'], nature: ['Jedovatost a příroda', 'Toxicity and wildlife']
  };
  GP.subLabel = k => (SUB[k] ? L(SUB[k][0], SUB[k][1]) : '');

  GP.PLANT_FIELDS = [
    F('name_cs', 0, 'text', 'Český název', 'Czech name', ['cesky nazev', 'cz', 'cs', 'nazev', 'cesky'], { core: true }),
    F('name_la', 0, 'text', 'Latinský název', 'Latin name', ['latinsky nazev', 'latinsky nazov', 'botanicky', 'botanicky nazev', 'latin', 'botanical name', 'latin name'], { core: true, italic: true }),
    F('name_sk', 0, 'text', 'Slovenský název', 'Slovak name', ['slovensky nazov', 'slovensky nazev', 'sk', 'nazov']),
    F('name_en', 0, 'text', 'Anglický název', 'English name', ['english name', 'en', 'anglicky nazev', 'english', 'common name']),
    F('synonyms', 0, 'text', 'Latinská synonyma (starší názvy)', 'Latin synonyms (older names)', ['synonyma', 'synonymum', 'synonyms', 'synonym'], { wide: true, italic: true }),
    F('cultivar', 0, 'text', 'Odrůda / kultivar', 'Cultivar / variety', ['odruda', 'kultivar', 'cultivar', 'variety', 'sorta']),
    F('rootstock', 0, 'text', 'Podnož', 'Rootstock', ['podnoz', 'rootstock']),
    F('family', 0, 'text', 'Čeleď', 'Family', ['celed', 'celad', 'family']),
    F('genus', 0, 'text', 'Rod', 'Genus', ['rod', 'genus']),
    F('origin', 0, 'text', 'Původ / domovina', 'Origin / native range', ['puvod', 'povod', 'domovina', 'origin', 'native']),
    F('link', 0, 'url', 'Odkaz', 'Link', ['odkaz', 'link', 'url', 'zdroj', 'eshop', 'web']),
    F('type', 0, 'select', 'Typ', 'Type', ['typ', 'type', 'druh', 'kategorie'], { core: true, side: true, opts: GP.PLANT_TYPES }),
    F('purpose', 0, 'select', 'Funkce', 'Purpose', ['funkcia', 'funkce', 'ucel', 'purpose', 'function', 'vyuziti'], { side: true, opts: O.purpose }),

    F('height', 1, 'text', 'Výška v dospělosti (m)', 'Mature height (m)', ['vyska', 'vyska (m)', 'height', 'vyska v dospelosti', 'max vyska', 'max. vyska', 'max vyska (m)'], { core: true, sub: 'size', hint: 'např. 1,5–2' }),
    F('width', 1, 'text', 'Šířka v dospělosti (m)', 'Mature width (m)', ['sirka', 'sirka (m)', 'width', 'sirka v dospelosti', 'max sirka', 'max. sirka', 'max sirka (m)'], { core: true, sub: 'size', hint: 'např. 1–1,5' }),
    F('habit', 1, 'select', 'Tvar / habitus', 'Shape / habit', ['tvar', 'habitus', 'habit', 'shape'], { sub: 'size', opts: O.habit }),
    F('roots', 1, 'select', 'Kořenový systém', 'Root system', ['koren', 'korenovy system', 'roots', 'root system'], { sub: 'size', opts: O.roots }),
    F('foliage', 1, 'select', 'Stálezelená / opadavá', 'Evergreen / deciduous', ['stalezelena', 'stalezelene', 'stalezeleny', 'vzdyzelena', 'evergreen', 'opadava', 'olisteni'], { core: true, sub: 'leaf', opts: O.foliage }),
    F('leafColors', 1, 'multi', 'Barva listu', 'Leaf colour', ['barva listu', 'farba listov', 'leaf colour', 'leaf color', 'foliage colour'], { sub: 'leaf', opts: O.leafColors }),
    F('autumnColors', 1, 'multi', 'Podzimní zbarvení', 'Autumn colour', ['podzimni zbarveni', 'jesenne sfarbenie', 'autumn colour', 'autumn color', 'fall color'], { sub: 'leaf', opts: O.autumnColors }),
    F('flowerShowy', 1, 'select', 'Květ', 'Flower', ['kvet', 'vyraznost kvetu', 'flower'], { sub: 'flower', opts: O.flowerShowy }),
    F('flowerColors', 1, 'multi', 'Barva květů', 'Flower colour', ['barva kvetu', 'farba', 'farba kvetov', 'barva', 'flower colour', 'flower color', 'color', 'colour'], { core: true, sub: 'flower', opts: O.flowerColors }),
    F('bloomMonths', 1, 'months', 'Kvete (měsíce)', 'Flowering (months)', ['kvete', 'kvitne', 'doba kveteni', 'kveteni', 'bloom', 'flowering', 'blooms'], { core: true, sub: 'flower' }),
    F('scent', 1, 'select', 'Vůně', 'Scent', ['vune', 'vona', 'scent', 'fragrance'], { sub: 'flower', opts: O.scent }),
    F('fruit', 1, 'select', 'Plod', 'Fruit', ['plod', 'plody', 'fruit', 'jedly plod'], { sub: 'fruit', opts: O.fruit }),
    F('harvestMonths', 1, 'months', 'Zrání / sklizeň', 'Ripening / harvest', ['zrenie', 'zrani', 'sklizen', 'zber', 'harvest', 'ripening', 'dozrava'], { sub: 'fruit' }),

    F('light', 2, 'multi', 'Světlo', 'Light', ['svetlo', 'light', 'stanoviste', 'expozice', 'slnko', 'sun'], { core: true, sub: 'needs', opts: O.light }),
    F('water', 2, 'select', 'Voda', 'Water', ['voda', 'vlhkost', 'water', 'moisture', 'naroky na vodu', 'odolnost suchu'], { core: true, sub: 'needs', opts: O.water }),
    F('soilType', 2, 'select', 'Půda – typ', 'Soil – type', ['puda', 'typ pudy', 'soil', 'soil type'], { sub: 'needs', opts: O.soilType }),
    F('soilPh', 2, 'select', 'Půda – pH', 'Soil – pH', ['ph', 'ph pudy', 'soil ph'], { core: true, sub: 'needs', opts: O.soilPh }),
    F('hardiness', 2, 'num', 'Mrazuvzdornost (°C)', 'Frost hardiness (°C)', ['mrazuvzdornost', 'mrazuvzdornost (°c)', 'mrazuvzdornost (c)', 'hardiness', 'odolnost'], { core: true, sub: 'needs', hint: 'např. -25' }),
    F('usda', 2, 'select', 'Zóna USDA', 'USDA zone', ['usda', 'zona', 'zona odolnosti', 'zone', 'hardiness zone'], { sub: 'needs', opts: O.usda }),
    F('companions', 2, 'longtext', 'Vhodní sousedé', 'Good neighbours', ['vhodni sousede', 'susedia', 'companions', 'good neighbours'], { sub: 'needs' }),
    F('antagonists', 2, 'longtext', 'Nevhodní sousedé', 'Bad neighbours', ['nevhodni sousede', 'bad neighbours', 'incompatible'], { sub: 'needs' }),
    F('maintenance', 2, 'multi', 'Vyžaduje údržbu', 'Needs maintenance', ['vyzaduje udrzbu', 'udrzba', 'narocnost', 'maintenance'], { core: true, sub: 'needs', wide: true, opts: O.maintenance }),
    F('spacing', 2, 'num', 'Spon / vzdálenost od jiných rostlin (cm)', 'Spacing (cm)', ['spon', 'vzdalenost', 'spacing', 'rozestup'], { sub: 'how' }),
    F('depth', 2, 'num', 'Hloubka výsadby (cm)', 'Planting depth (cm)', ['hloubka', 'hloubka vysadby', 'depth', 'planting depth'], { sub: 'how' }),
    F('support', 2, 'select', 'Opora', 'Support', ['opora', 'support'], { sub: 'how', opts: O.support }),
    F('growth', 2, 'select', 'Rychlost růstu', 'Growth rate', ['rychlost rustu', 'rust', 'growth', 'growth rate'], { sub: 'how', opts: O.growth }),
    F('growthCm', 2, 'num', 'Přírůstek (cm za rok)', 'Annual growth (cm / year)', ['prirustek', 'annual growth'], { sub: 'how' }),
    F('planting', 2, 'longtext', 'Poznámky k výsadbě', 'Planting notes', ['vysadba a substrat', 'vysadba', 'substrat', 'planting', 'pestovani', 'pestovanie', 'cultivation', 'growing'], { sub: 'how' }),
    F('toxicParts', 2, 'multi', 'Jedovatost – části', 'Toxicity – parts', ['jedovatost', 'jedovata', 'toxic', 'toxicity', 'poisonous'], { sub: 'nature', opts: O.toxicParts }),
    F('toxicFor', 2, 'multi', 'Jedovatá pro', 'Toxic for', ['jedovata pro', 'toxic for'], { sub: 'nature', opts: O.toxicFor }),
    F('pollination', 2, 'select', 'Opylení', 'Pollination', ['opyleni', 'opelenie', 'samosprasnost', 'pollination'], { sub: 'nature', opts: O.pollination }),
    F('pollinators', 2, 'text', 'Vhodní opylovači (odrůdy)', 'Suitable pollinators (cultivars)', ['opylovaci', 'opylovac', 'pollinators', 'pollinator'], { sub: 'nature' }),
    F('wildlife', 2, 'multi', 'Přínos pro přírodu', 'Good for wildlife', ['prinos', 'vcely', 'wildlife', 'bees'], { sub: 'nature', opts: O.wildlife }),

    F('watering', 3, 'care', 'Zálivka', 'Watering', ['zalivka', 'zalievanie', 'watering'], { maint: 'water', icon: '💧' }),
    F('fertilizing', 3, 'care', 'Hnojení', 'Fertilising', ['hnojeni', 'hnojenie', 'fertilizing', 'fertilising', 'feeding'], { maint: 'fert', icon: '🧪' }),
    F('pruning', 3, 'care', 'Řez / střih', 'Pruning / trimming', ['rez', 'rez1', 'rez 1', 'rez2', 'rez 2', 'strih', 'strihanie', 'pruning', 'pruning 1', 'pruning 2'], { maint: 'prune', icon: '✂️' }),
    F('winter', 3, 'care', 'Ochrana na zimu', 'Winter protection', ['ochrana rostlin na zimu', 'ochrana na zimu', 'zimni ochrana', 'zima', 'winter protection', 'winter'], { maint: 'frost', icon: '❄️' }),
    F('diseases', 3, 'care', 'Ošetření proti chorobám', 'Disease control', ['choroby', 'choroby a skudci', 'choroby a skodcovia', 'diseases'], { maint: 'pests', icon: '🍂' }),
    F('pests', 3, 'care', 'Ošetření proti škůdcům', 'Pest control', ['skudci', 'skodcovia', 'pests'], { maint: 'pests', icon: '🐛' }),
    F('otherCare', 3, 'care', 'Další péče', 'Other care', ['dalsi pece', 'pece', 'other care', 'care'], { icon: '🌱' }),
    F('notes', 3, 'longtext', 'Poznámky', 'Notes', ['poznamky', 'poznamka', 'notes', 'note', '!!!', 'dulezite', 'pozor', 'warning', 'important'])
  ];
  GP.groups = () => [
    [L('0 · Základní údaje', '0 · Basic details'), L('Názvy a identita rostliny', 'Names and identity')],
    [L('1 · Vzhled', '1 · Looks'), L('Velikost, list, květ a plod', 'Size, leaves, flower and fruit')],
    [L('2 · Výsadba', '2 · Planting'), L('Co rostlina potřebuje a jak ji sázet', 'What the plant needs and how to plant it')],
    [L('3 · Péče během roku', '3 · Care through the year'), L('Měsíce u každé péče vytvoří připomínky v kalendáři', 'Months on each care item create calendar reminders')]
  ];
  GP.fieldLabel = f => L(f.cs, f.en);
  GP.plantField = key => GP.PLANT_FIELDS.find(f => f.key === key);

  // Fields that belong to one planting in a garden, recognised during CSV import.
  GP.PLACEMENT_FIELDS = [
    { key: 'position', cs: 'Umístění v zahradě', en: 'Position in garden', aliases: ['pozice', 'umisteni', 'umiestnenie', 'umistneni', 'umistnenie', 'misto', 'position', 'location', 'zona'] },
    { key: 'planted', cs: 'Vysazeno (ano/ne)', en: 'Planted (yes/no)', aliases: ['vysazen', 'vysazeno', 'vysadene', 'vysadeny', 'zasazeno', 'planted'] },
    { key: 'count', cs: 'Počet kusů', en: 'Count', aliases: ['pocet', 'ks', 'kusu', 'count', 'quantity', 'mnozstvo'] }
  ];

  // Care item -> list of terms [{ text, months }] (older data stored one { text, months } object).
  GP.careTerms = function (plant, key) {
    const v = plant[key];
    if (!v) return [];
    return Array.isArray(v) ? v.filter(Boolean) : [v];
  };
  const termFilled = t => !!((t.text && t.text.trim()) || (t.months && t.months.length));

  GP.isFilled = function (plant, f) {
    const v = plant[f.key];
    if (f.type === 'care') return GP.careTerms(plant, f.key).some(termFilled);
    if (f.type === 'months' || f.type === 'multi') return !!(v && v.length);
    return v != null && String(v).trim() !== '';
  };
  // Care items expected because of the ticked maintenance (empty maintenance = none expected yet).
  GP.careExpected = (plant, f) => !!(f.maint && (plant.maintenance || []).includes(f.maint));
  GP.coreFields = plant => GP.PLANT_FIELDS.filter(f => f.core || (f.type === 'care' && GP.careExpected(plant, f)));
  GP.completeness = function (plant) {
    const core = GP.coreFields(plant);
    return Math.round(100 * core.filter(f => GP.isFilled(plant, f)).length / core.length);
  };

  // ---------- reading free text into options ----------
  const optMatch = (opts, s) => opts.find(o => GP.norm(o[1]) === s || GP.norm(o[2]) === s || o[0] === s) ||
    opts.find(o => o[3] && new RegExp(o[3]).test(s));
  // Raw text (CSV cell, old data) -> stored value, or undefined when it cannot be read.
  GP.parseField = function (f, raw) {
    const s = GP.norm(raw);
    if (!s) return undefined;
    switch (f.type) {
      case 'months': { const ms = GP.parseMonths(raw); return ms.length ? ms : undefined; }
      case 'select': {
        if (f.key === 'type') return GP.parseType(raw);
        if (f.key === 'usda') { const n = s.match(/\d{1,2}/); return n && f.opts.some(o => o[0] === String(+n[0])) ? String(+n[0]) : undefined; }
        if (f.key === 'purpose' && /uzit|use/.test(s) && /okras|ornam/.test(s)) return 'both';
        const o = optMatch(f.opts, s);
        return o ? o[0] : undefined;
      }
      case 'multi': {
        if (f.key === 'light') { const set = GP.lightSet(raw); return set.size ? ['sun', 'part', 'shade'].filter(k => set.has(k)) : undefined; }
        const out = new Set();
        if (f.opts.some(o => o[4])) { // colours: every colour word found
          for (const o of f.opts) if (o[3] && new RegExp(o[3]).test(s)) out.add(o[0]);
        } else {
          for (const part of s.split(/[,;/+]|\sa\s|\sand\s/)) { const o = optMatch(f.opts, part.trim()); if (o) out.add(o[0]); }
        }
        return out.size ? f.opts.map(o => o[0]).filter(k => out.has(k)) : undefined;
      }
      case 'num': {
        if (f.key === 'hardiness') { const c = GP.hardinessC(raw); return c == null ? undefined : String(Math.round(c)); }
        const n = String(raw).match(/-?\d+(?:[.,]\d+)?/);
        return n ? n[0] : undefined;
      }
      default: return String(raw).trim();
    }
  };

  // USDA zone <-> lowest winter temperature (°C)
  GP.usdaFromC = c => { const n = Math.floor((c + 51.1) / 5.56) + 1; return n >= 3 && n <= 10 ? String(n) : n < 3 ? '3' : '10'; };
  GP.usdaToC = z => Math.round(-51.1 + (+z - 1) * 5.56);

  // Old cm values ("150", "30–50 cm") -> metres ("1,5", "0,3–0,5"); text that is not just numbers stays as it was.
  const cmToM = GP.cmToM = function (v) {
    const s = String(v || '').trim();
    if (!s || (/m\b/.test(s) && !/cm/.test(s))) return s.replace(/\s*m$/, '');
    if (!/^[\d\s.,–-]+(cm)?$/i.test(s)) return s;
    return s.replace(/cm/i, '').trim().replace(/\d+(?:[.,]\d+)?/g, n => String(parseFloat(n.replace(',', '.')) / 100).replace('.', ',')).replace(/\s*-\s*/g, '–');
  };

  // Bring a plant stored with the older field set to the current one (idempotent, returns true when changed).
  GP.PLANT_VERSION = 2;
  GP.migratePlant = function (p) {
    if ((p.v || 1) >= GP.PLANT_VERSION) return false;
    const notes = [];
    const fld = GP.plantField;
    const toOpt = (key, raw, label) => {
      if (raw == null || raw === '' || typeof raw !== 'string') return;
      const v = GP.parseField(fld(key), raw);
      if (v !== undefined) p[key] = v; else notes.push(label + ': ' + raw);
    };
    // looks
    if (p.flowerColor) { const v = GP.parseField(fld('flowerColors'), p.flowerColor); if (v) p.flowerColors = v; else notes.push('Barva květů: ' + p.flowerColor); }
    delete p.flowerColor; delete p.flowerHex;
    if (p.evergreen === true) p.foliage = 'evergreen'; else if (p.evergreen === false) p.foliage = 'deciduous';
    delete p.evergreen;
    if (p.height) p.height = cmToM(p.height);
    if (p.width) p.width = cmToM(p.width);
    if (p.heightMax) notes.push('Max. výška (m): ' + p.heightMax);
    if (p.widthMax) notes.push('Max. šířka (m): ' + p.widthMax);
    delete p.heightMax; delete p.widthMax;
    // basics
    if (typeof p.purpose === 'string' && !O.purpose.some(o => o[0] === p.purpose)) { const raw = p.purpose; delete p.purpose; toOpt('purpose', raw, 'Funkce'); }
    if (p.price) notes.push('Cena: ' + p.price);
    delete p.price;
    // planting
    if (typeof p.light === 'string') { const raw = p.light; delete p.light; toOpt('light', raw, 'Světlo'); }
    if (typeof p.water === 'string' && !O.water.some(o => o[0] === p.water)) { const raw = p.water; delete p.water; toOpt('water', raw, 'Voda'); }
    if (p.hardiness && !/^-?\d+$/.test(String(p.hardiness).trim())) {
      const raw = p.hardiness, z = GP.norm(raw).match(/zon\w*\s*(\d{1,2})/);
      delete p.hardiness;
      if (z) p.usda = String(+z[1]);
      toOpt('hardiness', raw, 'Mrazuvzdornost');
    }
    if (p.hardiness && !p.usda) p.usda = GP.usdaFromC(+p.hardiness);
    if (typeof p.maintenance === 'string') { if (p.maintenance.trim()) notes.push('Vyžaduje údržbu: ' + p.maintenance); delete p.maintenance; }
    const planting = [p.planting, p.cultivation].filter(x => x && x.trim()).join('\n');
    if (planting) p.planting = planting; else delete p.planting;
    delete p.cultivation;
    // care: one object -> list of terms; Řez 1 + Řez 2 -> Řez; "Choroby a škůdci" -> diseases
    const terms = v => (v ? (Array.isArray(v) ? v : [v]).filter(termFilled) : []);
    if (!Array.isArray(p.pruning)) {
      const pr = [...terms(p.pruning1), ...terms(p.pruning2)];
      delete p.pruning1; delete p.pruning2;
      if (pr.length) p.pruning = pr; else delete p.pruning;
    }
    if (p.pests && !Array.isArray(p.pests)) { const t = terms(p.pests); delete p.pests; if (t.length) p.diseases = t; }
    for (const k of ['watering', 'fertilizing', 'winter', 'diseases', 'otherCare']) {
      if (p[k] && !Array.isArray(p[k])) { const t = terms(p[k]); if (t.length) p[k] = t; else delete p[k]; }
    }
    // "!!! Důležité" -> notes
    if (p.warning && p.warning.trim()) notes.unshift('!!! ' + p.warning.trim());
    delete p.warning;
    if (notes.length) p.notes = [notes.join('\n'), p.notes].filter(x => x && x.trim()).join('\n');
    p.v = GP.PLANT_VERSION;
    return true;
  };

  // Flower colour shown on the plan / calendar: first chosen flower colour.
  GP.colorHex = function (plant) {
    if (!plant) return null;
    const c = (plant.flowerColors || [])[0];
    return c ? GP.optHex(O.flowerColors, c) : null;
  };
  GP.colorNames = plant => (plant.flowerColors || []).map(k => GP.optLabel(O.flowerColors, k)).join(', ');

  GP.plantName = function (p) {
    if (!p) return '?';
    const order = GP.state.settings.lang === 'en'
      ? ['name_en', 'name_cs', 'name_la', 'name_sk'] : ['name_cs', 'name_sk', 'name_la', 'name_en'];
    let name = '';
    for (const k of order) if (p[k] && p[k].trim()) { name = p[k].trim(); break; }
    if (p.cultivar && !GP.norm(name).includes(GP.norm(p.cultivar))) name += " '" + p.cultivar.replace(/^['‘’"]|['‘’"]$/g, '') + "'";
    // Unidentified plant (the exact species is not known yet) – marked with "?" everywhere.
    if (p.unsure) name = (name || L('(bez názvu)', '(unnamed)')) + ' ?';
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
    if (Array.isArray(text)) return new Set(text);
    const s = GP.norm(text), out = new Set();
    if (/polost|polotien|part|half/.test(s)) out.add('part');
    if (/slun|slnk|\bsun/.test(s)) out.add('sun');
    if (/stin|tien|shade/.test(s.replace(/polostin\w*|polotien\w*|partial shade|part shade|half shade/g, ' '))) out.add('shade');
    return out;
  };
  // "−23 °C" / "-23" / "zóna 6" -> minimum temperature in °C (zone converted roughly via USDA)
  GP.hardinessC = function (text) {
    const s = String(text == null ? '' : text).replace(/[−–]/g, '-');
    const zone = GP.norm(s).match(/zon\w*\s*(\d{1,2})/);
    if (zone) return GP.usdaToC(+zone[1]);
    const m = s.match(/-\s?\d{1,2}(?:[.,]\d)?/);
    return m ? parseFloat(m[0].replace(/\s/g, '').replace(',', '.')) : null;
  };
  // Garden pH category -> plant pH choices that suit it
  GP.PH_OK = {
    vacid: ['acid', 'any'], acid: ['acid', 'macid', 'any'], macid: ['acid', 'macid', 'neutral', 'any'], neutral: ['macid', 'neutral', 'malk', 'any'],
    malk: ['neutral', 'malk', 'alk', 'any'], alk: ['malk', 'alk', 'any'], valk: ['alk', 'any']
  };

  GP.CELL_LIGHT = [['', '—', '—'], ['sun', 'slunce', 'sun'], ['part', 'polostín', 'partial shade'], ['shade', 'stín', 'shade']];
  GP.CELL_WATER = [['', '—', '—'], ['dry', 'sucho', 'dry'], ['normal', 'běžná', 'normal'], ['wet', 'vlhko', 'wet']];

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
    { key: 'minTemp', type: 'text', cs: 'Nejnižší zimní (°C)', en: 'Lowest in winter (°C)' },
    { key: 'maxTemp', type: 'text', cs: 'Nejvyšší letní (°C)', en: 'Highest in summer (°C)' },
    { key: 'meanTemp', type: 'text', cs: 'Průměrná roční (°C)', en: 'Mean annual (°C)' },
    { key: 'frostFree', type: 'text', cs: 'Bezmrazé období (dní)', en: 'Frost-free period (days)' },
    { key: 'lastFrost', type: 'text', cs: 'Poslední jarní mrazy', en: 'Last spring frost' },
    { key: 'firstFrost', type: 'text', cs: 'První podzimní mrazy', en: 'First autumn frost' },
    { key: 'rainfall', type: 'text', cs: 'Roční srážky (mm)', en: 'Annual rainfall (mm)' }
  ];
  GP.ASPECTS = [['', '—', '—'], ['flat', 'rovina', 'flat'], ['N', 'sever (S)', 'north (N)'], ['NE', 'severovýchod (SV)', 'north-east (NE)'], ['E', 'východ (V)', 'east (E)'],
    ['SE', 'jihovýchod (JV)', 'south-east (SE)'], ['S', 'jih (J)', 'south (S)'], ['SW', 'jihozápad (JZ)', 'south-west (SW)'], ['W', 'západ (Z)', 'west (W)'], ['NW', 'severozápad (SZ)', 'north-west (NW)']];
  GP.SLOPES = [['', '—', '—'], ['0', 'rovina (0–2°)', 'flat (0–2°)'], ['1', 'mírný (2–7°)', 'gentle (2–7°)'], ['2', 'střední (7–15°)', 'moderate (7–15°)'],
    ['3', 'prudký (15–30°)', 'steep (15–30°)'], ['4', 'velmi prudký (nad 30°)', 'very steep (over 30°)']];
  GP.SOILS = [['sand', 'písčitá', 'sandy'], ['loamysand', 'hlinitopísčitá', 'loamy sand'], ['sandyloam', 'písčitohlinitá', 'sandy loam'], ['loam', 'hlinitá', 'loam'],
    ['clayloam', 'jílovitohlinitá', 'clay loam'], ['clay', 'jílovitá', 'clay'], ['stony', 'kamenitá', 'stony'], ['peat', 'rašelinná', 'peaty'], ['fill', 'navážka', 'made ground']];
  GP.SOIL_PH = [['', '—', '—'], ['vacid', 'silně kyselá (pH pod 5,0)', 'strongly acidic (pH below 5.0)'], ['acid', 'kyselá (pH 5,0–5,5)', 'acidic (pH 5.0–5.5)'],
    ['macid', 'mírně kyselá (pH 5,5–6,5)', 'slightly acidic (pH 5.5–6.5)'], ['neutral', 'neutrální (pH 6,5–7,2)', 'neutral (pH 6.5–7.2)'],
    ['malk', 'mírně zásaditá (pH 7,2–7,8)', 'slightly alkaline (pH 7.2–7.8)'], ['alk', 'zásaditá (pH 7,8–8,5)', 'alkaline (pH 7.8–8.5)'],
    ['valk', 'silně zásaditá (pH nad 8,5)', 'strongly alkaline (pH above 8.5)']];
  // measured pH value -> category key
  GP.phCategory = v => {
    const x = parseFloat(String(v).replace(',', '.'));
    if (isNaN(x)) return '';
    return x < 5 ? 'vacid' : x < 5.5 ? 'acid' : x < 6.5 ? 'macid' : x <= 7.2 ? 'neutral' : x <= 7.8 ? 'malk' : x <= 8.5 ? 'alk' : 'valk';
  };
  GP.WATER_SOURCES = [['mains', 'vodovod', 'mains water'], ['well', 'studna', 'well'], ['tank', 'retenční nádrž (dešťovka)', 'rainwater tank'], ['barrel', 'sud na dešťovku', 'water butt'],
    ['stream', 'potok / rybník', 'stream / pond'], ['grey', 'šedá voda', 'grey water'], ['other', 'jiný', 'other']];
  GP.SIDES = [['N', 'Na severu', 'To the north'], ['E', 'Na východě', 'To the east'], ['S', 'Na jihu', 'To the south'], ['W', 'Na západě', 'To the west']];
  GP.SURROUND = [['', '—', '—'], ['garden', 'zahrada souseda', 'neighbour’s garden'], ['house', 'dům / budova', 'house / building'], ['street', 'ulice / silnice', 'street / road'],
    ['broadleaf', 'listnatý les', 'broadleaf forest'], ['conifer', 'jehličnatý les', 'coniferous forest'], ['mixed', 'smíšený les', 'mixed forest'],
    ['selfsown', 'nálety (samovolně vzrostlé dřeviny)', 'self-sown trees / scrub'], ['field', 'pole', 'field'], ['meadow', 'louka / pastva', 'meadow / pasture'], ['orchard', 'sad', 'orchard'],
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
