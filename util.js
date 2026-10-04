/* Kišenė: bendros konstantos ir pagalbinės funkcijos.
   Visi js/ failai yra paprasti skriptai ir dalijasi globaliais kintamaisiais. Įkėlimo tvarka nurodyta index.html. */
"use strict";

const MONTHS = ["Sausis","Vasaris","Kovas","Balandis","Gegužė","Birželis","Liepa","Rugpjūtis","Rugsėjis","Spalis","Lapkritis","Gruodis"];
const MSHORT = ["Sau","Vas","Kov","Bal","Geg","Bir","Lie","Rgp","Rgs","Spa","Lap","Gru"];

// Spalvų žetonai (styles.css: --c1 ... --c12)
const SWATCHES = ["c1","c2","c3","c4","c5","c6","c7","c8","c10","c11","c12","c13","c9"];

const DEFAULT_CATEGORIES = [
  {id:"food", name:"Maistas", type:"exp", color:"c1"},
  {id:"home", name:"Būstas", type:"exp", color:"c2"},
  {id:"utilities", name:"Komunaliniai mokesčiai", type:"exp", color:"c13"},
  {id:"transport", name:"Transportas", type:"exp", color:"c3"},
  {id:"cafe", name:"Kavinės ir restoranai", type:"exp", color:"c4"},
  {id:"fun", name:"Pramogos ir sportas", type:"exp", color:"c5"},
  {id:"subs", name:"Prenumeratos", type:"exp", color:"c6"},
  {id:"health", name:"Sveikata", type:"exp", color:"c7"},
  {id:"shop", name:"Apsipirkimas", type:"exp", color:"c8"},
  {id:"travel", name:"Kelionės", type:"exp", color:"c10"},
  {id:"loan", name:"Paskolos ir lizingas", type:"exp", color:"c11"},
  {id:"insurance", name:"Draudimas ir mokesčiai", type:"exp", color:"c12"},
  {id:"other", name:"Kita", type:"exp", color:"c9"},
  {id:"salary", name:"Atlyginimas", type:"inc", color:"c1"},
  {id:"grant", name:"Stipendija", type:"inc", color:"c3"},
  {id:"side", name:"Papildomos pajamos", type:"inc", color:"c4"},
  {id:"gift", name:"Dovanos", type:"inc", color:"c5"},
  {id:"repay", name:"Grąžinimai", type:"inc", color:"c12", neutral:true},
  {id:"invinc", name:"Investicijų pajamos", type:"inc", color:"c7"},
  {id:"cashinc", name:"Gauta grynaisiais", type:"inc", color:"c6"},
  {id:"iother", name:"Kitos pajamos", type:"inc", color:"c9"}
];
const DEFAULT_ACCOUNTS = [
  {id:"main", name:"Pagrindinė sąskaita", kind:"bank", match:""},
  {id:"cash", name:"Grynieji", kind:"cash", match:""}
];
const ACCOUNT_KINDS = {bank:"Banko sąskaita", card:"Kortelė", cash:"Grynieji", savings:"Taupomoji", invest:"Investavimo platforma", loan:"Paskola / lizingas"};

// Įmontuotos kategorijų taisyklės (vartotojo taisyklės tikrinamos pirmiau).
// Tvarka svarbi: konkretesni pavadinimai tikrinami anksčiau, pvz. „Bolt Food“ prieš „Bolt“.
const KEYWORDS = [
  // maisto pristatymas ir kavinės
  ["cafe", /bolt\.eu\/s\/|bolt food|wolt|foodout|greet\.menu|jammi|hesburger|mcdonald|\bkfc\b|burger king|subway|kebab|pizz|picer|sushi|\bgogi\b|\bcili\b|čili|caffeine|vero caf|coffee|kavin|restoran|bistro|\bbaras\b|starbucks|costa coffee|\bpub\b|talutti|can can|domino|šoko|soko|kepyklėl|cafe\b|kavos/i],
  // maisto prekės
  ["food", /maxima|\brimi\b|\blidl\b|\biki\b|norfa|\baib[eė]\b|prisma|barbora|lastmile|\bšilas\b|\bsilas\b|mes[yė]t|mėsin|turgus|kepykl|express market|vynoteka|\bmini\s?maxima\b|ikiukas|aldi|biedronka|\bcoop\b|spar\b|rimi express/i],
  // degalinės nustatomos atskirai pagal sumą (žr. FUEL_RE)
  ["transport", /autoaibe|bolt\.eu|\bbolt\b|uber|citybee|spark\b|\bjudu\b|trafi|m\.ticket|mticket|viešasis transport|viesasis transport|autobus|troleibus|stova|unipark|europark|parkuok|flowbird|parking|parkavim|taksi|e-tolling|vinjet|kelių mokest|keliu mokest|autodoc|inter cars|autoplius|padang|automobil|regitra|technin(ė|e) apžiūr|tech\.? apziur/i],
  ["subs", /netflix|spotify|youtube|apple\.com|icloud|google\s?(one|storage|play)|disney|\bhbo\b|\bmax\.com|go3|telia|\bbit[eė]\b|tele2|pildyk|ezys|adobe|chatgpt|openai|claude\.ai|anthropic|patreon|github|microsoft|dropbox|canva|duolingo|audible|storytel|\bdelfi\b|15min|lrytas|kindle/i],
  ["health", /vaistin|eurovaist|camelia|gintarin|\bbenu\b|antėja|anteja|klinik|odontolog|dantų|dantu|medical|medicin|\bmed\b|optik|labor|affidea|kardiolita|hila\b|sveikat|poliklinik|ligonin|psicholog|kineziterap|masaž|masaz/i],
  // paskolos tikrinamos prieš būstą: „būsto kreditas“ yra paskola
  ["loan", /lizing|leasing|paskol|kredit|sąskaita: ?bls|saskaita: ?bls|\bbls\d{6,}|būsto kredit|busto kredit|inbank|mokilizingas|general financing|bigbank|moment credit|\bsavy\b|ferratum|credit24|\bipf\b/i],
  // komunaliniai tikrinami prieš būstą: jų sumos kinta kas mėnesį
  ["utilities", /ignitis|enefit|elektrum|\beso\b|vandenys|šiluma|siluma|miesto gijos|vilniaus energija|kauno energija|energija|viena sąskaita|viena saskaita|elektr|dujos|šildym|sildym|karšt(o|as) vand|karst(o|as) vand|internetas|cgates|\binit\b|ecoservice|atliek|komunalin/i],
  ["home", /nuoma|nuomos|bendrij|būsto admin|busto admin|administrat|namų valdym|namu valdym|daugiabu|būsto|busto|apartament|nekilnojam/i],
  ["fun", /kino|\bkinas\b|forum cinemas|multikino|apollo|arena|steam|playstation|xbox|nintendo|bilietai|tiketa|kakava|koncert|teatr|muziej|lemon gym|impuls|gym\+|\bgym\b|fitness|sport(o)? klub|baseinas|boulin|batut|escape|\bspa\b|vandens parkas|žaidim|zaidim/i],
  ["shop", /senukai|ermitaž|ermitaz|moki veži|moki vezi|jysk|ikea|depo\b|bauhaus|pigu|varle|varlė|temu|aliexpress|amazon|ebay|shein|zalando|about you|\bzara\b|h&m|\bhm\b|lindex|reserved|sinsay|pepco|action\b|decathlon|sportland|euronics|topo cent|bigbox|elektromarkt|drogas|eurokos|douglas|kika|apranga|mango\b|ccc\b|deichmann|tiger\b|flying tiger|jumbo|vinted|knygos|pegasas|vaga\b|humanitas/i],
  ["travel", /booking\.com|airbnb|kiwi\.com|ryanair|wizz|airbaltic|\blot\b|lufthansa|finnair|hotel|hostel|viešbut|viesbut|flixbus|ecolines|ltg link|lux express|oro uost|airport|skyscanner|trip\.com|expedia/i],
  ["insurance", /banko mokestis|paslaugų plano|paslaugu plano|aptarnavimo mokest|komisin|draudim|insurance|\bergo\b|gjensidige|lietuvos draudimas|\bbta\b|compensa|if p&c|\bif\b draud|vmi\b|sodra|registrų centras|registru centras|savivaldyb|bauda|notar|antstol/i]
];
// Degalinės: dideli pirkiniai yra degalai, maži dažniausiai kava ar užkandžiai
const FUEL_RE = /circle\s?k|viada|orlen|neste|\bemsi\b|baltic petroleum|lukoil|alauša|alausa|jozita|ventus nafta|skulas|degalin|\bshell\b|\bstatoil\b/i;
const FUEL_SNACK_MAX = 20;
const INCOME_KEYWORDS = [
  ["salary", /du išmokėjimas|darbo užmok|darbo uzmok|atlyginim|salary|\balga\b|premij|atostogini/i],
  ["grant", /stipend/i],
  ["invinc", /dividend|palūkan|palukan|interest|trading ?212|revolut securities|lightyear|interactive brokers|\bibkr\b/i],
  ["side", /honorar|autorin|sąskait(a|os) faktūr|saskait(a|os) faktur|\bsf\b|vinted|individual(i|ios) veikl/i],
  // grąžinimai nėra pajamos: skolos grąžinimas ar pinigų grąžinimas už prekę
  ["repay", /skol(os|ą|a|ų)? grąžin|skol(os|ą|a|ų)? grazin|grąžin|grazin|refund|grąžinam|atgal už|atgal uz|return of/i],
  ["gift", /dovan|gimtadien|kalėd|kaled|vestuv|krikšt|kriksti/i]
];
// Kategorija išlaidoms pagal tekstą ir sumą. sure=false reiškia, kad verta patikrinti.
function guessExpCat(text, amount) {
  if (FUEL_RE.test(text) && !/bolt|wolt/i.test(text)) {
    if (amount != null && amount < FUEL_SNACK_MAX) return {cat: "cafe", sure: false, why: "maža suma degalinėje"};
    return {cat: "transport", sure: amount != null, why: "degalinė"};
  }
  for (const [c, re] of KEYWORDS) if (re.test(text)) return {cat: c, sure: true};
  return {cat: "other", sure: false};
}

// Pajamų kategorijos, kurios nėra pajamos (pvz. grąžinta skola)
const isNeutralInc = cat => cat === "repay" || !!(typeof catById === "function" && catById(cat)?.neutral);
const isRealInc = t => t.type === "inc" && !isNeutralInc(t.cat);
const fmt = new Intl.NumberFormat("lt-LT", {style:"currency", currency:"EUR"});
const fmt0 = new Intl.NumberFormat("lt-LT", {style:"currency", currency:"EUR", maximumFractionDigits:0});
const fmtN = new Intl.NumberFormat("lt-LT", {maximumFractionDigits:6});
const eur = v => fmt.format(v || 0);
const eur0 = v => fmt0.format(v || 0);
const signed = v => (v < 0 ? "−" : "+") + eur(Math.abs(v));
const money = (v, cur) => { try { return new Intl.NumberFormat("lt-LT", {style:"currency", currency:cur || "EUR", maximumFractionDigits: Math.abs(v) < 1 ? 4 : 2}).format(v || 0); } catch (e) { return fmtN.format(v || 0) + " " + cur; } };
const pct = v => String(isFinite(v) ? Math.round(v) : 0).replace("-", "−") + " %";
const pct1 = v => (isFinite(v) ? (Math.round(v * 10) / 10).toString().replace(".", ",").replace("-", "−") : "0") + " %";
const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const ymOf = d => String(d).slice(0, 7);
const pad2 = n => String(n).padStart(2, "0");
const todayISO = () => { const d = new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); };
const addMonths = (ym, n) => { let [y, m] = ym.split("-").map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + "-" + pad2(m); };
const monthsBetween = (a, b) => { const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1); };
const ymLabel = ym => { const [y, m] = ym.split("-").map(Number); return MONTHS[m - 1] + " " + y; };
const dayLabel = d => { const x = new Date(d + "T12:00"); return x.getDate() + " " + MSHORT[x.getMonth()].toLowerCase() + "."; };
const r2 = v => Math.round(v * 100) / 100;
const shortId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const newId = () => (crypto.randomUUID ? crypto.randomUUID() :
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));

// Pastovus UUID iš teksto: ta pati operacija importuota du kartus arba dviejuose įrenginiuose gauna tą patį ID
async function stableId(text) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  const h = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Skaičius iš bet kokio formato: "1 234,56", "1,234.56", "USD 12.5", "-$10", "0,00012"
function parseNum(s) {
  if (typeof s === "number") return s;
  s = String(s ?? "").trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /-/.test(s.replace(/\d-\d/g, ""));
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc >= 0 && ld >= 0) {
    const dec = lc > ld ? "," : ".";
    s = s.split(dec === "," ? "." : ",").join("").replace(dec, ".");
  } else if (lc >= 0) {
    s = (s.split(",").length > 2) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (ld >= 0 && s.split(".").length > 2) {
    s = s.replace(/\./g, "");
  }
  const v = parseFloat(s);
  return isFinite(v) ? (neg ? -v : v) : null;
}
function parseDate(s) {
  s = String(s ?? "").trim(); let m;
  if ((m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/))) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  if ((m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})/))) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
  if ((m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2})\b/))) return `20${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
  const t = Date.parse(s);
  if (isFinite(t)) { const d = new Date(t); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  return null;
}

// CSV skaitymas su automatiniu skirtuko atpažinimu
function parseCSV(text) {
  text = String(text).replace(/^﻿/, "");
  const first = text.split(/\r?\n/)[0] || "";
  const cnt = ch => first.split(ch).length - 1;
  const d = [";", ",", "\t"].sort((a, b) => cnt(b) - cnt(a))[0];
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { row.push(f); f = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(f); f = ""; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else f += ch;
  }
  row.push(f); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}
function readFileText(file) {
  return new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onerror = () => reject(rd.error);
    rd.onload = () => {
      const text = String(rd.result);
      if (!text.includes("\uFFFD")) return resolve(text);
      const rd2 = new FileReader(); rd2.onload = () => resolve(String(rd2.result)); rd2.onerror = () => resolve(text);
      rd2.readAsText(file, "windows-1257");
    };
    rd.readAsText(file, "utf-8");
  });
}
// Pirmas antraštės stulpelis, atitinkantis kurį nors iš šablonų (pagal šablonų prioritetą)
function findCol(header, patterns) {
  for (const re of patterns) { const i = header.findIndex(h => re.test(String(h || "").trim())); if (i >= 0) return i; }
  return -1;
}

// Pirkinio aprašymo valymas: "PIRKINYS 5167****6666 2026.08.30 12.43 EUR (765777) MAXIMA/X-027 MAXIMA 10233 VILNIUS" -> "Maxima"
const BRANDS = [
  [/maxima/i,"Maxima"],[/\brimi\b/i,"Rimi"],[/\blidl\b/i,"Lidl"],[/\biki\b/i,"IKI"],[/norfa/i,"Norfa"],[/autoaibe/i,"Autoaibė"],[/\baib[eė]\b/i,"Aibė"],
  [/bolt\.eu\/s\//i,"Bolt Food"],[/bolt/i,"Bolt"],[/circle\s?k/i,"Circle K"],[/orlen/i,"Orlen"],[/neste/i,"Neste"],[/baltic petroleum/i,"Baltic Petroleum"],[/emsi/i,"Emsi"],
  [/spotify/i,"Spotify"],[/netflix/i,"Netflix"],[/apple\.com/i,"Apple"],[/chatgpt|openai/i,"OpenAI"],[/anthropic|claude/i,"Anthropic"],
  [/pigu/i,"Pigu.lt"],[/senukai/i,"Senukai"],[/hesburger/i,"Hesburger"],[/booking\.com/i,"Booking.com"],[/kiwi\.com/i,"Kiwi.com"],
  [/revolut/i,"Revolut"],[/paslaugų plano|aptarnavimo mokest|komisinis atlyg|sąskaitos tvarkymo/i,"Banko mokestis"],[/wolt/i,"Wolt"],[/judu/i,"Judu"],[/draudimas\.lt/i,"Draudimas.lt"],[/apollo kinas/i,"Apollo Kinas"],[/zalgirio arena|žalgirio arena/i,"Žalgirio arena"]
];
function cleanMerchant(s) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  for (const [re, name] of BRANDS) if (re.test(s)) return name;
  s = s.replace(/^PIRKINYS\s+\S+\s+\d{4}\.\d{2}\.\d{2}\s+[\d.,]+\s+[A-Z]{3}\s+\(\d+\)\s*/i, "")
       .replace(/^GRYNIEJI.*$/i, "Grynųjų išėmimas")
       .replace(/^(MKK|SQ|SP|PAYPAL)\s?\*/i, "")
       .replace(/\b[A-Z]{2}-\d{4,5}\b/g, "")
       .replace(/\b\d{4,}\b/g, "")
       .replace(/\b[A-Z0-9]*\d[A-Z0-9]{5,}\b/g, "")
       .replace(/^"+|"+$/g, "")
       .replace(/\b\d{4}[.-]\d{2}([.-]\d{2})?\b/g, "")
       .replace(/(^|[\s,])(UAB|AB|IĮ|II|MB|VŠĮ|VŠI|VSI|ŽŪB)(?=[\s,]|$)/gi, " ")
       .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
       .replace(/\s+(VILNIUS|KAUNAS|KLAIPEDA|KLAIPĖDA|SIAULIAI|ŠIAULIAI|PANEVEZYS|PANEVĖŽYS|TALLINN|DUBLIN\s*\d*|STOCKHOLM|AMSTERDAM|BRNO|CORK|LOS GATOS|RIGA|WARSZAWA|LONDON)\b.*$/i, "")
       .replace(/\s+/g, " ").trim();
  if (s.length > 2 && s === s.toUpperCase()) s = s.toLowerCase().replace(/(^|[\s/(-])([a-ząčęėįšųūž])/g, (m, a, b) => a + b.toUpperCase());
  return s.slice(0, 60);
}
const maskCards = s => String(s || "").replace(/\b\d{4,6}\*{4,}\d{2,4}\b/g, "****").replace(/\s+/g, " ").trim();
const normName = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");

let toastT = null;
// toast("Ištrinta", () => atkurti()) parodo mygtuką „Atšaukti“ 5 sekundėms
function toast(msg, undo) {
  const r = $("#toastRoot");
  r.innerHTML = `<div class="toast" role="status"><span>${esc(msg)}</span>${undo ? '<button class="toast-undo" type="button">Atšaukti</button>' : ""}</div>`;
  if (undo) r.querySelector(".toast-undo").onclick = () => { clearTimeout(toastT); r.innerHTML = ""; undo(); };
  clearTimeout(toastT); toastT = setTimeout(() => r.innerHTML = "", undo ? 5000 : 2800);
}

/* ---------- Ikonos (24×24, linijinės) ---------- */
const ICONS = {
  basket: '<path d="M4 9h16l-1.5 10.5a1 1 0 0 1-1 .5h-11a1 1 0 0 1-1-.5z"/><path d="M8 9l4-5 4 5"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
  car: '<path d="M5 16V12l2-5h10l2 5v4"/><path d="M4 16h16"/><circle cx="8" cy="17.5" r="1.5"/><circle cx="16" cy="17.5" r="1.5"/>',
  cup: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2"/><path d="M9 3v3M12 3v3"/>',
  ticket: '<path d="M4 8a2 2 0 0 0 0 4v4h16v-4a2 2 0 0 1 0-4V4H4z" transform="translate(0 2)"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
  repeat: '<path d="M17 3l3 3-3 3"/><path d="M4 11V9a3 3 0 0 1 3-3h13"/><path d="M7 21l-3-3 3-3"/><path d="M20 13v2a3 3 0 0 1-3 3H4"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  plane: '<path d="M10.5 20l1.5-6-6-2.5V9l6.5 1.5L15 4h2l-1 7.5L21 13v2.5l-5.5-1L14 20z"/>',
  bank: '<path d="M3 9l9-5 9 5"/><path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9"/><path d="M3 20h18"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z"/>',
  dots: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
  briefcase: '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V5.5h6v2"/><path d="M3.5 13h17"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.5a3 3 0 1 0 0 5"/><path d="M8.5 11h5M8.5 13h5"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M3 9h18M12 9v11"/><path d="M12 9c-2-4-6-3-5 0M12 9c2-4 6-3 5 0"/>',
  arrowin: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M5 20h14"/>',
  arrowout: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/>',
  swap: '<path d="M7 4L4 7l3 3"/><path d="M4 7h13"/><path d="M17 14l3 3-3 3"/><path d="M20 17H7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  split: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5l12 7.5M8 15.5l12-7.5"/>',
  paw: '<circle cx="7" cy="9" r="1.6"/><circle cx="12" cy="7" r="1.6"/><circle cx="17" cy="9" r="1.6"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 1.5-1.5 2-4 2s-4-.5-4-2z"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
  child: '<circle cx="12" cy="6" r="2.5"/><path d="M8 21v-6l-2-3 3-2h6l3 2-2 3v6"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.4"/>',
  sparkle: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.1-1.6-1.1-2.7 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7" r="1.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  tiles: '<rect x="3.5" y="4" width="17" height="7" rx="2"/><rect x="3.5" y="13" width="17" height="7" rx="2"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  send: '<path d="M4 12l16-8-6 16-3-7z"/>'
};
const CAT_ICONS = {food: "basket", home: "home", transport: "car", cafe: "cup", fun: "ticket", subs: "repeat", health: "heart", shop: "bag", travel: "plane",
  loan: "bank", insurance: "shield", other: "dots", salary: "briefcase", grant: "cap", side: "coin", gift: "gift", repay: "swap", utilities: "bolt", iother: "arrowin", transfer: "swap", invinc: "percent", cashinc: "receipt"};
const ICON_CHOICES = ["tag", "basket", "home", "bolt", "car", "cup", "ticket", "repeat", "heart", "bag", "plane", "bank", "shield", "briefcase", "cap", "coin", "gift", "paw", "book", "child", "receipt", "percent"];
const icon = (name, size) => `<svg viewBox="0 0 24 24" width="${size || 18}" height="${size || 18}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.tag}</svg>`;
const catIcon = c => icon(c.icon || CAT_ICONS[c.id] || "tag");
