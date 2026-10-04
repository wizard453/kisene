/* Kišenė: CSV importas. Banko išrašai (Swedbank, Revolut ir bet koks kitas CSV) ir investavimo platformų operacijos
   (Trading 212, Revolut ir bet kokia kita platforma, kai stulpelius priskiri pats). */
"use strict";

/* ===================== Banko išrašai ===================== */
/* Failų skaitymas: CSV, Excel (.xlsx, .xls) ir ISO 20022 XML (camt.053 / camt.052), kurį siūlo dauguma Lietuvos bankų.
   Excel ir XML paverčiami į CSV tekstą, o toliau importas vyksta kaip įprastai. */
const XLSX_SRCS = ["https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"];
let xlsxLoading = null;
function loadScript(src) {
  return new Promise((res, rej) => {
    const sc = document.createElement("script"); sc.src = src; sc.async = true;
    sc.onload = res; sc.onerror = () => { sc.remove(); rej(); };
    document.head.appendChild(sc);
  });
}
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return xlsxLoading = xlsxLoading || (async () => {
    for (const src of XLSX_SRCS) { try { await loadScript(src); if (window.XLSX) return window.XLSX; } catch (e) {} }
    xlsxLoading = null; throw new Error("Nepavyko įkelti Excel skaitytuvo. Patikrink interneto ryšį.");
  })();
}
const csvCell = v => { v = String(v ?? "").replace(/\s+/g, " ").trim(); return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
function camtToCsv(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return null;
  const kids = (el, n) => el ? [...el.children].filter(c => c.localName === n) : [];
  const one = (el, path) => { for (const n of path.split("/")) { el = kids(el, n)[0]; if (!el) return null; } return el; };
  const txt = (el, path) => one(el, path)?.textContent.trim() || "";
  const all = [...doc.getElementsByTagNameNS("*", "Ntry")];
  if (!all.length) return null;
  const stmt = doc.getElementsByTagNameNS("*", "Stmt")[0] || doc.getElementsByTagNameNS("*", "Rpt")[0];
  fileMeta = {ownIban: txt(one(stmt, "Acct"), "Id/IBAN"), ownerName: txt(one(stmt, "Acct"), "Ownr/Nm")};
  const out = [["Data", "Suma", "D/K", "Gavėjas", "Paaiškinimai", "Operacijos nr", "Valiuta", "Kito sąskaita"].join(";")];
  for (const e of all) {
    const st = txt(e, "Sts/Cd") || txt(e, "Sts");
    if (st && st !== "BOOK") continue;
    const amtEl = one(e, "Amt"), dk = txt(e, "CdtDbtInd");
    const date = (txt(e, "BookgDt/Dt") || txt(e, "BookgDt/DtTm") || txt(e, "ValDt/Dt")).slice(0, 10);
    const tx = one(e, "NtryDtls/TxDtls");
    const rp = one(tx, "RltdPties");
    const nm = side => txt(rp, side + "/Nm") || txt(rp, side + "/Pty/Nm");
    const party = dk === "DBIT" ? (nm("Cdtr") || nm("UltmtCdtr")) : (nm("Dbtr") || nm("UltmtDbtr"));
    const desc = [...(one(tx, "RmtInf") ? kids(one(tx, "RmtInf"), "Ustrd") : [])].map(x => x.textContent.trim()).join(" ") || txt(tx, "AddtlTxInf") || txt(e, "AddtlNtryInf");
    const otherAcct = dk === "DBIT" ? txt(rp, "CdtrAcct/Id/IBAN") : txt(rp, "DbtrAcct/Id/IBAN");
    const ref = txt(e, "AcctSvcrRef") || txt(tx, "Refs/AcctSvcrRef") || txt(tx, "Refs/EndToEndId") || txt(e, "NtryRef");
    out.push([date, amtEl?.textContent.trim() || "", dk === "DBIT" ? "D" : "K", party, desc, ref, amtEl?.getAttribute("Ccy") || "", otherAcct].map(csvCell).join(";"));
  }
  return out.length > 1 ? out.join("\n") : null;
}
let fileMeta = null;
async function readBankFile(f) {
  fileMeta = null;
  const name = (f.name || "").toLowerCase();
  if (/\.(xlsx|xls|ods)$/.test(name)) {
    const X = await loadXlsx();
    const wb = X.read(await f.arrayBuffer(), {type: "array", cellDates: true});
    const ws = wb.Sheets[wb.SheetNames[0]];
    return X.utils.sheet_to_csv(ws, {FS: ";", blankrows: false, rawNumbers: true, dateNF: "yyyy-mm-dd"});
  }
  const text = await readFileText(f);
  if (/\.xml$/.test(name) || /^\s*(<\?xml|<Document)/.test(text)) {
    const csv = camtToCsv(text);
    if (!csv) throw new Error("XML faile nerasta operacijų. Rinkis ISO 20022 (camt.053) išrašo formatą.");
    return csv;
  }
  return text;
}
async function bankSetupFile(f) {
  try { const imp = bankSetup(f.name, await readBankFile(f)); if (imp && fileMeta) Object.assign(imp, fileMeta); return imp; }
  catch (e) { toast(e.message || "Nepavyko perskaityti failo"); return undefined; }
}
/* Kaip atsisiųsti išrašą iš Lietuvos bankų. Meniu pavadinimai gali skirtis, nes bankai atnaujina savo sistemas. */
const BANK_GUIDES = [
  {id: "swedbank", n: "Swedbank", f: "CSV arba ISO XML", steps: ["Prisijunk prie interneto banko (patogiausia kompiuteryje).", "Atsidaryk „Kasdienės paslaugos“ → „Sąskaitos išrašas“.", "Pasirink sąskaitą ir laikotarpį, pvz. „Praėjęs mėnuo“, ir spausk „Rodyti“.", "Spausk „Išsaugoti failą“ ir pasirink CSV formatą (tinka ir ISO XML)."]},
  {id: "seb", n: "SEB", f: "XML (ISO 20022) arba CSV", steps: ["Prisijunk prie interneto banko kompiuteryje.", "Atsidaryk „Sąskaitos ir kortelės“ → „Sąskaitos išrašas“.", "Pasirink sąskaitą ir „Failo užsakymas“.", "Nurodyk laikotarpį, pasirink XML (ISO 20022) arba CSV formatą ir spausk „Parengti“.", "Paruoštą failą išsaugok įrenginyje."]},
  {id: "luminor", n: "Luminor", f: "CSV arba XML", steps: ["Prisijunk prie interneto banko.", "Atsidaryk sąskaitų skiltį ir pasirink „Sąskaitos išrašas“.", "Nurodyk laikotarpį ir atsisiųsk išrašą CSV formatu (tinka ir ISO XML)."]},
  {id: "artea", n: "Artea (buvęs Šiaulių bankas)", f: "CSV, Excel arba XML", steps: ["Prisijunk prie interneto banko.", "Atsidaryk „Sąskaitos ir kortelės“ → „Išrašas“.", "Pasirink sąskaitą ir laikotarpį.", "Atsisiųsk išrašą CSV, Excel arba XML formatu (ne PDF)."]},
  {id: "citadele", n: "Citadele", f: "CSV arba XML", steps: ["Prisijunk prie interneto banko.", "Atsidaryk sąskaitos išrašą (sąskaitų skiltyje).", "Pasirink laikotarpį ir eksportuok CSV arba ISO XML formatu."]},
  {id: "revolut", n: "Revolut", f: "Excel arba CSV", steps: ["Programėlėje atsidaryk „Pradžia“ ir po likučiu spausk „Sąskaitos“.", "Pasirink euro (EUR) sąskaitą.", "Spausk „Daugiau“ (…) → „Išrašas“.", "Pasirink laikotarpį ir Excel formatą, tada „Generuoti“.", "Svetainėje app.revolut.com išrašą gali atsisiųsti ir CSV formatu."]},
  {id: "paysera", n: "Paysera", f: "CSV", steps: ["Programėlėje pagrindiniame ekrane perbrauk ir spausk atsisiuntimo ženklą.", "Pasirink laikotarpį ir CSV formatą, spausk „Eksportuoti išrašą“.", "Arba svetainėje bank.paysera.com atsidaryk „Sąskaitos išrašas“, pasirink laikotarpį, spausk „Rodyti“ ir atsisiųsk."]},
  {id: "other", n: "Kiti bankai (Medicinos bankas, Urbo bankas ir kt.)", f: "CSV, Excel arba XML", steps: ["Interneto banke ieškok skilties „Sąskaitos išrašas“ arba „Išrašai“.", "Pasirink laikotarpį ir atsisiųsk failą CSV, Excel arba XML (ISO 20022, camt.053) formatu.", "PDF išrašas netinka, nes iš jo negalima nuskaityti operacijų."]}
];
function vBankGuide(open) {
  const g = S.bankGuide;
  return `<details class="bguide" ${open ? "open" : ""}><summary>Kaip atsisiųsti išrašą iš banko?</summary>
    <div class="fine">Tinka CSV, Excel (.xlsx) ir XML (ISO 20022) failai. PDF netinka. Patogiausia atsisiųsti kompiuteryje ir failą persikelti į telefoną, arba įkelti programėlę kompiuterio naršyklėje.</div>
    <div class="bg-list">${BANK_GUIDES.map(b => `<div class="bg-item ${g === b.id ? "on" : ""}"><button class="bg-h" data-bguide="${b.id}"><b>${esc(b.n)}</b><small>${esc(b.f)}</small><span class="chev">${g === b.id ? "⌃" : "⌄"}</span></button>
      ${g === b.id ? `<ol>${b.steps.map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}</div>`).join("")}</div>
    <div class="fine">Bankai kartais pakeičia meniu pavadinimus. Jei nerandi, ieškok „Sąskaitos išrašas“ ir rinkis CSV, Excel arba XML formatą. Kitų bankų failuose stulpelius gali priskirti pats.</div>
  </details>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-bguide]"); if (!b) return;
  e.stopPropagation(); e.preventDefault();
  S.bankGuide = S.bankGuide === b.dataset.bguide ? null : b.dataset.bguide; render();
}, true);
const BANK_ACCEPT = ".csv,text/csv,.txt,.xml,text/xml,application/xml,.xlsx,.xls,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

const BANK_FIELDS = [
  ["date", "Data", true], ["amt", "Suma", true], ["dir", "D/K žymė", false], ["party", "Gavėjas / mokėtojas", false],
  ["desc", "Paaiškinimas", false], ["acct", "Kito asmens sąskaita (IBAN)", false], ["id", "Įrašo ID", false], ["fee", "Mokestis", false]
];
function detectBankPreset(h) {
  const has = re => h.some(x => re.test(String(x || "").trim()));
  if (has(/^įrašo nr\.?$/i) && has(/^d\/k$/i) && has(/^gavėjas$/i)) return "swedbank";
  if (has(/^started date$/i) && has(/^description$/i) && has(/^amount$/i)) return "revolut";
  return "generic";
}
function guessBankMap(h, preset) {
  const m = {
    date: findCol(h, preset === "revolut" ? [/^completed date$/i, /^started date$/i] : [/^data$/i, /^operacijos data$/i, /^date$/i, /^booking date$/i, /data|date/i]),
    amt: findCol(h, [/^suma$/i, /^amount$/i, /^suma eur$/i, /suma|amount/i]),
    dir: findCol(h, [/^d\/k$/i, /^d\s*\/\s*k$/i, /debetas\s*\/\s*kreditas|debit\/credit/i, /^dk$/i]),
    party: findCol(h, [/^gavėjas$/i, /mokėtojo arba gavėjo|gavėjo pavadinimas|gavėjas|mokėtojas|counterparty|beneficiary|payee/i]),
    desc: findCol(h, [/^paaiškinimai$/i, /^description$/i, /mokėjimo paskirtis|paskirtis|paaiškin|aprašymas|details|description/i]),
    id: findCol(h, [/^įrašo nr\.?$/i, /operacijos nr|transaction id|^reference$|^id$/i]),
    acct: findCol(h, [/^kito sąskaita$/i, /gavėjo sąskait|mokėtojo sąskait|gavejo saskait|moketojo saskait|kontrahento sąskait|counterparty (account|iban)|beneficiary (account|iban)|payee account/i]),
    fee: preset === "revolut" ? findCol(h, [/^fee$/i]) : -1
  };
  return m;
}
function bankSetup(name, text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return null;
  let hi = rows.findIndex(r => { const g = guessBankMap(r.map(x => x.trim()), "generic"); return g.date >= 0 && g.amt >= 0; });
  if (hi < 0) hi = 0;
  const header = rows[hi].map(x => x.trim());
  const preset = detectBankPreset(header);
  return {name, header, rows: rows.slice(hi + 1), preset, map: guessBankMap(header, preset), account_id: "main", learn: true, overrides: {}, setBalance: true};
}

// Pirmasis etapas: CSV eilutės -> kandidatai (be kategorijų)
async function bankCandidates(imp) {
  const h = imp.header, m = imp.map, out = [], skipped = {};
  const skip = why => { skipped[why] = (skipped[why] || 0) + 1; };
  const col = re => h.findIndex(x => re.test(x));
  const cType = col(/^type$/i), cState = col(/^state$/i), cCur = col(/^(valiuta|currency)$/i);
  const cRowKind = imp.preset === "swedbank" ? 1 : -1;
  const ownCols = [col(/^galutinis gavėjas$/i), col(/^pradinis mokėtojas$/i)].filter(i => i >= 0);
  let balances = null;
  const occ = {};
  for (const r of imp.rows) {
    const get = i => i >= 0 ? String(r[i] ?? "").trim() : "";
    const descAll = get(m.desc), party = get(m.party);
    // Swedbank: 10 = pradžios likutis, 20 = operacija, 82 = apyvarta, 86 = pabaigos likutis
    if (cRowKind >= 0) {
      const k = get(cRowKind);
      if (k === "86") { const v = parseNum(get(m.amt)); const d = parseDate(get(m.date)); if (v !== null && d) balances = {amount: get(m.dir).toUpperCase() === "D" ? -v : v, date: d}; }
      if (k && k !== "20") { skip("likučio ir apyvartos eilutės"); continue; }
    }
    else if (/^(likutis pradžiai|likutis pabaigai|apyvarta|opening balance|closing balance|turnover)$/i.test(descAll)) { skip("likučio ir apyvartos eilutės"); continue; }
    if (cState >= 0 && get(cState) && !/^completed$/i.test(get(cState))) { skip("neįvykdytos operacijos"); continue; }
    if (cCur >= 0 && get(cCur) && get(cCur).toUpperCase() !== "EUR") { skip("ne eurais"); continue; }
    const date = parseDate(get(m.date)); let v = parseNum(get(m.amt));
    if (!date || v === null || v === 0) { skip("neatpažinta data ar suma"); continue; }
    let dir = v < 0 ? "out" : "in";
    if (m.dir >= 0) {
      const d = get(m.dir).toUpperCase();
      if (d === "D" || d === "DEBIT" || d === "DBIT") dir = "out"; else if (d === "K" || d === "C" || d === "CREDIT" || d === "CRDT") dir = "in"; else { skip("neatpažinta D/K žymė"); continue; }
    }
    let amount = Math.abs(v);
    const fee = m.fee >= 0 ? Math.abs(parseNum(get(m.fee)) || 0) : 0;
    if (fee && dir === "out") amount += fee;
    const type = cType >= 0 ? get(cType).toUpperCase() : "";
    if (type === "EXCHANGE") { skip("valiutos keitimas"); continue; }
    const extId = get(m.id);
    const base = `${date}|${amount}|${dir}|${descAll}|${party}`;
    occ[base] = (occ[base] || 0) + 1;
    const id = await stableId(`bank:${imp.account_id}:${extId || base + "#" + occ[base]}`);
    out.push({id, date, amount: r2(amount), dir, party, desc: descAll, revType: type, own: ownCols.map(get).filter(Boolean), iban: normIban(get(m.acct))});
  }
  return {cands: out, skipped, balances};
}

// Antrasis etapas: kandidato tipas ir kategorija
const normIban = v => String(v || "").replace(/\s+/g, "").toUpperCase();
// Užuominos, kad tai pinigų perkėlimas tarp savo sąskaitų
const TRF_WORDS = /pervedimas sau|tarp savo|savo sąskait|savo saskait|own account|between (my|own) accounts|lėšų perkėlim|lesu perkelim|top-?up|papildym|money added|added money|to savings|į taupym|i taupym/i;
const BANK_NAMES = [["revolut", /revolut/i], ["swedbank", /swedbank|hanza/i], ["seb", /\bseb\b/i], ["luminor", /luminor|\bdnb\b|nordea/i], ["paysera", /paysera/i], ["artea", /artea|šiaulių bank|siauliu bank/i], ["citadele", /citadele/i], ["medbank", /medicinos bank/i], ["urbo", /urbo bank/i], ["n26", /\bn26\b/i], ["wise", /\bwise\b|transferwise/i]];
const INVEST_RE = /trading ?212|lightyear|interactive brokers|\bibkr\b|etoro|robinhood|bondora|finbee|nordnet|swedbank robur|revolut securities|\bxtb\b|degiro|saxo/i;
const ownTokens = name => normName(name || "").split(" ").filter(t => t.length > 1);
function isOwnName(text, toks) { if (toks.length < 2) return false; const n = normName(text).split(" "); return toks.every(t => n.includes(t)); }
// Kurią savo sąskaitą primena tekstas (pagal sąskaitos pavadinimą ar atpažinimo žodžius)
function accByHint(low, exceptId) {
  for (const a of activeAccounts()) {
    if (a.id === exceptId || a.kind === "cash") continue;
    const words = (a.match || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
    if (words.some(k => low.includes(k))) return a;
  }
  for (const [, re] of BANK_NAMES) {
    if (!re.test(low)) continue;
    const a = activeAccounts().find(x => x.id !== exceptId && re.test(x.name));
    if (a) return a;
  }
  return null;
}
// Ta pati suma kitoje savo sąskaitoje ±3 d. priešinga kryptimi: tai vienas pervedimas, matomas dviejuose išrašuose
function findPair(c, imp) {
  const t0 = Date.parse(c.date), used = imp._paired || (imp._paired = new Set());
  let best = null;
  for (const t of S.txs.values()) {
    if (used.has(t.id) || Math.abs(t.amount - c.amount) > 0.005) continue;
    // kurios sąskaitos operacija ir kuria kryptimi
    let acc = null;
    if (c.dir === "out") { if (t.type === "inc") acc = t.account_id; else if (t.type === "trf" && !t.account_id) acc = t.to_account_id; }
    else { if (t.type === "exp") acc = t.account_id; else if (t.type === "trf" && !t.to_account_id) acc = t.account_id; }
    if (!acc || acc === imp.account_id) continue;
    const dd = Math.abs(Date.parse(t.date) - t0) / 86400000; if (dd > 3) continue;
    if (!best || dd < best.dd) best = {t, acc, dd};
  }
  return best;
}
function classifyBank(c, imp) {
  const text = `${c.party} ${c.desc}`;
  const low = text.toLowerCase();
  const note = cleanMerchant(c.party || c.desc) || (c.dir === "in" ? "Pajamos" : "Išlaidos");
  const res = {id: c.id, date: c.date, amount: c.amount, note, memo: maskCards(c.desc), account_id: imp.account_id, dir: c.dir, iban: c.iban || ""};
  const trf = (other, why, sure = true) => ({...res, type: "trf", cat: "transfer", account_id: c.dir === "out" ? imp.account_id : (other || null), to_account_id: c.dir === "out" ? (other || null) : imp.account_id, why, sure});
  const ov = imp.overrides[c.id];
  if (ov) return {...applyChoice(res, ov, c.dir, imp), sure: true, ai: imp.aiPicked?.has(c.id)};
  // vartotojo taisyklės turi pirmenybę
  const ruled = categorize(text, c.dir, c.amount);
  if (ruled.rule) return ruled.type === "trf" ? trf(ruled.to_account_id, "tavo taisyklė") : {...res, type: ruled.type, cat: ruled.cat, sure: true, why: "tavo taisyklė"};
  // kito asmens sąskaita yra viena iš tavo sąskaitų
  if (c.iban) {
    const a = activeAccounts().find(x => x.id !== imp.account_id && (normIban(x.iban) === c.iban || (x.ibans || []).includes(c.iban)));
    if (a) return trf(a.id, "tavo sąskaitos IBAN");
    if (imp.ownIban && c.iban === normIban(imp.ownIban)) return {...res, type: "skip"};
  }
  // tavo vardas kaip gavėjas ar mokėtojas
  const toks = ownTokens(S.cfg.prefs?.ownName || imp.ownerName);
  if ([c.party, ...c.own].some(p => isOwnName(p, toks))) {
    // paskolos ar lizingo įmoka į paskolos sąskaitą savo vardu
    if (c.dir === "out" && categorize(text, c.dir, c.amount).cat === "loan") {
      const loanAcc = activeAccounts().find(a => a.kind === "loan");
      return loanAcc ? trf(loanAcc.id, "paskolos įmoka") : {...res, type: "exp", cat: "loan", sure: true, why: "paskolos įmoka"};
    }
    const pair = findPair(c, imp);
    if (pair) { imp._paired.add(pair.t.id); return {...trf(pair.acc, "tavo vardas ir ta pati suma kitoje sąskaitoje"), pairWith: pair.t.id}; }
    return trf(accByHint(low, imp.account_id)?.id || null, "tavo vardas");
  }
  // kitų savo sąskaitų atpažinimo žodžiai
  for (const a of activeAccounts()) {
    if (a.id === imp.account_id || !a.match) continue;
    if (a.match.split(",").map(x => x.trim().toLowerCase()).filter(Boolean).some(k => low.includes(k))) return trf(a.id, a.name);
  }
  if (/^grynieji\b|cash withdrawal|\batm\b|bankomat|grynųjų išėm|grynuju isem/i.test(c.desc)) {
    const cash = activeAccounts().find(a => a.kind === "cash");
    return {...trf(cash?.id || null, "grynieji"), note: "Grynųjų išėmimas"};
  }
  if (c.revType === "TOPUP") return trf(accByHint(low, imp.account_id)?.id || activeAccounts().find(a => a.id !== imp.account_id && a.kind === "bank")?.id || null, "papildymas");
  const hintWords = TRF_WORDS.test(text);
  // banko pavadinimas tekste, išskyrus paties išrašo banką (mokėjimai savo bankui yra mokesčiai ar paskolos)
  const curName = (accById(imp.account_id)?.name || "") + " " + (imp.preset === "swedbank" ? "swedbank" : imp.preset === "revolut" ? "revolut" : "");
  const hintBank = BANK_NAMES.some(([, re]) => re.test(text) && !re.test(curName));
  const g = categorize(text, c.dir, c.amount);
  // tas pats pervedimas jau matytas kitos sąskaitos išraše
  if (hintWords || hintBank || (!g.sure && c.amount >= 50)) {
    const pair = findPair(c, imp);
    if (pair && (hintWords || hintBank || pair.dd <= 1)) { imp._paired.add(pair.t.id); return {...trf(pair.acc, "ta pati suma kitoje tavo sąskaitoje"), pairWith: pair.t.id}; }
  }
  // investavimo platforma: pervedimas į investicijų sąskaitą
  if (INVEST_RE.test(text) && c.dir === "out") {
    const invs = activeAccounts().filter(a => a.kind === "invest");
    const inv = invs.find(a => INVEST_RE.test(a.name + " " + (a.match || ""))) || invs[0];
    if (inv) return trf(inv.id, "investavimo platforma");
    return {...res, type: "exp", cat: g.cat, sure: false, why: "investavimo platforma: jei tai investavimas, pasirink pervedimą į investicijų sąskaitą (ją sukursi skiltyje Sąskaitos ir skolos)"};
  }
  if (hintWords) return trf(accByHint(low, imp.account_id)?.id || null, "pervedimo žodžiai");
  // banko pavadinimas: jei turi tokio banko sąskaitą, tai papildymas. Jei ne, gali būti ir apmokėjimas, todėl pažymima patikrinti.
  if (hintBank && !g.sure) { const a = accByHint(low, imp.account_id); return trf(a?.id || null, a ? "papildymas į „" + a.name + "“" : "banko pavadinimas", !!a); }
  return {...res, type: g.type, cat: g.cat, sure: g.sure, why: g.why};
}
function applyChoice(res, choice, dir, imp) {
  if (choice === "skip") return {...res, type: "skip"};
  const [type, v] = choice.split(":");
  if (type === "trf") return {...res, type: "trf", cat: "transfer", account_id: dir === "out" ? imp.account_id : (v || null), to_account_id: dir === "out" ? (v || null) : imp.account_id};
  return {...res, type, cat: v};
}
const choiceOf = r => r.type === "skip" ? "skip" : r.type === "trf" ? "trf:" + ((r.dir === "out" ? r.to_account_id : r.account_id) || "") : r.type + ":" + r.cat;

// Pervedimas jau užfiksuotas iš kitos sąskaitos išrašo (± 4 dienos, ta pati suma, tos pačios sąskaitos)
function isDuplicateTransfer(r) {
  if (r.type !== "trf" || !r.account_id || !r.to_account_id) return false;
  const t0 = Date.parse(r.date);
  for (const t of S.txs.values()) {
    if (t.type !== "trf" || t.id === r.id || Math.abs(t.amount - r.amount) > 0.005) continue;
    const pair = (t.account_id === r.account_id && t.to_account_id === r.to_account_id);
    if (pair && Math.abs(Date.parse(t.date) - t0) <= 4 * 86400000) return true;
  }
  return false;
}

/* ===================== Investicijos ===================== */
const INV_FIELDS = [
  ["date", "Data", true], ["type", "Operacijos tipas", false], ["symbol", "Simbolis (tikeris)", false], ["name", "Pavadinimas", false],
  ["isin", "ISIN", false], ["qty", "Kiekis", false], ["price", "Kaina už vienetą", false], ["priceCur", "Kainos valiuta", false],
  ["total", "Bendra suma", true], ["currency", "Sumos valiuta", false], ["fee", "Mokestis", false], ["id", "Operacijos ID", false]
];
const KIND_LABEL = {buy: "Pirkimas", sell: "Pardavimas", div: "Dividendai", interest: "Palūkanos", fee: "Mokestis", deposit: "Įnešimas", withdraw: "Išėmimas", split: "Akcijų skaidymas"};
function classifyInvType(s) {
  s = String(s || "").toLowerCase();
  if (!s) return null;
  if (/split/.test(s)) return "split";
  if (/divid/.test(s)) return "div";
  if (/interest|palūkan|lending|saveback/.test(s)) return "interest";
  if (/deposit|top-?up|įneš|cash in|transfer in/.test(s)) return "deposit";
  if (/withdraw|išim|išėm|cash out|transfer out/.test(s)) return "withdraw";
  if (/buy|pirk|purchase|bought/.test(s)) return "buy";
  if (/sell|pard|sold/.test(s)) return "sell";
  if (/fee|custody|komis|mokest|tax|charge/.test(s)) return "fee";
  return null;
}
function detectInvPreset(h) {
  const has = re => h.some(x => re.test(String(x || "").trim()));
  if (has(/^action$/i) && has(/^no\. of shares$/i)) return "t212";
  if (has(/^ticker$/i) && has(/^type$/i) && has(/^price per share$/i)) return "revolut";
  if (has(/^product$/i) && has(/^fiat amount/i)) return "revolut-crypto";
  return "generic";
}
const PRESET_NAMES = {t212: "Trading 212", revolut: "Revolut", "revolut-crypto": "Revolut", generic: ""};
function guessInvMap(h, preset) {
  const m = {
    date: findCol(h, preset === "revolut-crypto" ? [/^completed date$/i] : [/^time$/i, /^date$/i, /^data$/i, /^trade date$/i, /date|data|time/i]),
    type: findCol(h, [/^action$/i, /^type$/i, /^tipas$/i, /^transaction type$/i, /^operation$/i, /type|tipas|veiksmas/i]),
    symbol: findCol(h, preset === "revolut-crypto" ? [/^currency$/i] : [/^ticker$/i, /^symbol$/i, /^simbolis$/i, /^instrument$/i, /ticker|symbol/i]),
    name: findCol(h, [/^name$/i, /^pavadinimas$/i, /^instrument name$/i, /^security$/i]),
    isin: findCol(h, [/^isin$/i, /isin/i]),
    qty: findCol(h, preset === "revolut-crypto" ? [/^amount$/i] : [/^no\. of shares$/i, /^quantity$/i, /^qty$/i, /^kiekis$/i, /^shares$/i, /^units$/i, /quantity|shares|kiekis/i]),
    price: findCol(h, [/^price \/ share$/i, /^price per share$/i, /^price$/i, /^kaina$/i, /price/i]),
    priceCur: findCol(h, [/^currency \(price \/ share\)$/i]),
    total: findCol(h, preset === "revolut-crypto" ? [/^fiat amount \(inc\. fees\)$/i, /^fiat amount$/i] : [/^total$/i, /^total \([a-z]{3}\)$/i, /^total amount$/i, /^net amount$/i, /^amount$/i, /^suma$/i, /total|amount|suma/i]),
    currency: findCol(h, preset === "revolut-crypto" ? [/^base currency$/i] : [/^currency \(total\)$/i, /^currency$/i, /^valiuta$/i]),
    fee: findCol(h, [/^fee$/i, /^fees$/i, /^commission$/i, /^mokestis$/i, /^currency conversion fee/i]),
    id: findCol(h, [/^id$/i, /^transaction id$/i, /^order id$/i])
  };
  // Trading 212 turi kelis mokesčių stulpelius
  m.feeCols = preset === "t212" ? h.map((x, i) => /fee|stamp duty|finra|transaction tax/i.test(x) && !/^currency \(/i.test(x) ? i : -1).filter(i => i >= 0) : null;
  return m;
}
function invSetup(name, text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return null;
  const header = rows[0].map(x => x.trim());
  const preset = detectInvPreset(header);
  return {name, header, rows: rows.slice(1), preset, map: guessInvMap(header, preset), platform: PRESET_NAMES[preset] || ""};
}
async function invCandidates(imp) {
  const h = imp.header, m = imp.map, out = [], skipped = {}, occ = {};
  const skip = why => { skipped[why] = (skipped[why] || 0) + 1; };
  const cState = h.findIndex(x => /^state$/i.test(x));
  const totalHdrCur = m.total >= 0 ? (h[m.total].match(/\(([A-Z]{3})\)$/) || [])[1] : null;
  for (const r of imp.rows) {
    const get = i => i >= 0 ? String(r[i] ?? "").trim() : "";
    if (cState >= 0 && get(cState) && !/^completed$/i.test(get(cState))) { skip("neįvykdytos"); continue; }
    const date = parseDate(get(m.date));
    if (!date) { skip("be datos"); continue; }
    const rawType = get(m.type);
    let qty = parseNum(get(m.qty)), price = parseNum(get(m.price)), total = parseNum(get(m.total));
    let kind = classifyInvType(rawType);
    if (!kind && qty && total) kind = qty > 0 ? "buy" : "sell";
    if (!kind && m.type < 0 && !qty && total) kind = total > 0 ? "deposit" : "withdraw";
    if (!kind) { skip(rawType ? `„${rawType}“` : "neatpažintas tipas"); continue; }
    if (rawType && /currency conversion|exchange/i.test(rawType) && !/exchanged to/i.test(rawType)) { if (!(qty && total)) { skip(`„${rawType}“`); continue; } }
    const symbol = get(m.symbol).toUpperCase().replace(/\s+/g, "");
    const isin = get(m.isin).toUpperCase();
    if (["buy", "sell", "split"].includes(kind) && !symbol && !isin) { skip("be simbolio"); continue; }
    let fee = 0;
    for (const i of (m.feeCols && m.feeCols.length ? m.feeCols : [m.fee])) if (i >= 0) fee += Math.abs(parseNum(get(i)) || 0);
    if (kind !== "split") {
      qty = Math.abs(qty || 0);
      if ((total === null || total === 0) && qty && price) total = qty * Math.abs(price);
      total = Math.abs(total || 0);
      if (!price && qty && total) price = total / qty;
      price = Math.abs(price || 0);
    } else { qty = qty || 0; total = 0; price = 0; }
    if (kind !== "split" && !total && kind !== "fee") { skip("nulinė suma"); continue; }
    if (kind === "fee" && !total) { total = fee; fee = 0; }
    const currency = (get(m.currency) || totalHdrCur || get(m.priceCur) || "EUR").toUpperCase().slice(0, 3);
    const extId = get(m.id);
    const base = `${date}|${kind}|${symbol || isin}|${qty}|${total}`;
    occ[base] = (occ[base] || 0) + 1;
    const id = await stableId(`inv:${imp.platform || imp.name}:${extId || base + "#" + occ[base]}`);
    out.push({id, date, kind, platform: imp.platform.trim(), symbol, name: get(m.name), isin, qty, price, currency,
      amount: r2(total), fee: r2(fee), amount_eur: currency === "EUR" ? r2(total) : null, note: kind === "fee" || kind === "interest" ? rawType.slice(0, 200) : "",
      priceCur: (get(m.priceCur) || currency).toUpperCase()});
  }
  return {cands: out, skipped};
}

/* ===================== Rodiniai ===================== */
const mapSelect = (imp, fields, idPrefix) => `<div class="mapgrid">${fields.map(([k, label, req]) => `<label>${label}${req ? "" : " (nebūtina)"}<select id="${idPrefix}${k}" data-map="${k}">
  <option value="-1">—</option>${imp.header.map((x, i) => `<option value="${i}" ${imp.map[k] === i ? "selected" : ""}>${esc(x || "Stulpelis " + (i + 1))}</option>`).join("")}</select></label>`).join("")}</div>`;
const skippedText = sk => Object.entries(sk).map(([k, v]) => `${v} – ${esc(k)}`).join(", ");

function choiceOptions(r) {
  const exp = catsOf("exp").map(c => `<option value="exp:${c.id}">${esc(c.name)}</option>`).join("");
  const inc = catsOf("inc").map(c => `<option value="inc:${c.id}">${esc(c.name)}</option>`).join("");
  const trf = activeAccounts().filter(a => a.id !== S.imp.account_id).map(a => `<option value="trf:${esc(a.id)}">⇄ ${esc(a.name)}</option>`).join("") + `<option value="trf:">⇄ Kita savo sąskaita</option>`;
  const opts = (r.dir === "out" ? `<optgroup label="Išlaidos">${exp}</optgroup>` : `<optgroup label="Pajamos">${inc}</optgroup>`) + `<optgroup label="Pervedimas">${trf}</optgroup><option value="skip">Praleisti</option>`;
  return opts.replace(`value="${choiceOf(r)}"`, `value="${choiceOf(r)}" selected`);
}
const FIELD_HELP = {
  date: "Kada įvyko operacija.", amt: "Pinigų suma. Jei faile yra minuso ženklas, jis reiškia išlaidas.",
  dir: "Stulpelis su D arba K: D yra išlaidos (debetas), K yra pajamos (kreditas). Jei tokio nėra, palik tuščią.",
  party: "Kam mokėjai arba kas tau sumokėjo.", desc: "Mokėjimo paskirtis ar pirkinio aprašymas.",
  acct: "Gavėjo ar mokėtojo sąskaitos numeris. Padeda atpažinti pervedimus tarp tavo sąskaitų.",
  id: "Unikalus operacijos numeris. Padeda išvengti dublikatų.", fee: "Banko mokestis už operaciją."
};
const presetLabel = imp => imp.ownIban !== undefined ? "banko XML (ISO 20022) formatas" : imp.preset === "swedbank" ? "Swedbank formatas" : imp.preset === "revolut" ? "Revolut formatas" : "";
function vMapping(imp) {
  // pavyzdžiai iš tikrų operacijų, ne iš likučio ar apyvartos eilučių
  const skipRow = r => r.some(x => /^(likutis pradžiai|likutis pabaigai|apyvarta|opening balance|closing balance|turnover)$/i.test(String(x || "").trim()));
  const sample = imp.rows.filter(r => !skipRow(r)).slice(0, 5);
  return `<div class="mapv">${BANK_FIELDS.map(([k, label, req]) => {
    const i = imp.map[k], ex = i >= 0 ? sample.map(r => String(r[i] ?? "").trim()).filter(Boolean)[0] || "" : "";
    return `<div class="mapf ${req && !(i >= 0) ? "bad" : ""}"><div class="mapf-h"><b>${label}</b><span class="${req ? "req" : ""}">${req ? "būtina" : "nebūtina"}</span></div>
      <small>${FIELD_HELP[k] || ""}</small>
      <select id="bm_${k}" data-map="${k}"><option value="-1">Nėra tokio stulpelio</option>${imp.header.map((x, j) => `<option value="${j}" ${i === j ? "selected" : ""}>${esc(x || "Stulpelis " + (j + 1))}</option>`).join("")}</select>
      ${i >= 0 ? `<small class="mapf-ex">Pvz. iš failo: <b>${esc(ex.slice(0, 60)) || "tuščia"}</b></small>` : ""}</div>`;
  }).join("")}</div>`;
}
const choiceLabel = (r) => r.type === "skip" ? "Praleisti" : r.type === "trf" ? "Pervedimas: " + ((r.dir === "out" ? r.to_account_id : r.account_id) ? accName(r.dir === "out" ? r.to_account_id : r.account_id) : "kita savo sąskaita") : catById(r.cat).name;
// Operacijos sugrupuojamos pagal vietą ir dabartinę kategoriją
function importGroupsOf(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = r.note.trim().toLowerCase() + "|" + r.dir + "|" + choiceOf(r);
    const g = m.get(k) || {key: k, note: r.note, dir: r.dir, rows: [], total: 0, sure: true, ai: false, why: r.why};
    g.rows.push(r); g.total += r.amount; if (!r.sure) g.sure = false; if (r.ai) g.ai = true;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => (a.sure - b.sure) || b.total - a.total);
}
function vImpGroup(g, i, open) {
  const r = g.rows[0], n = g.rows.length;
  const ds = g.rows.map(x => x.date).sort();
  const sign = g.dir === "in" ? "+" : "−";
  return `<div class="ig ${g.sure ? "" : "unsure"} ${r.type === "trf" ? "trf" : ""}">
    <div class="ig-h"><div class="ig-t"><b>${esc(g.note)}</b><small>${n > 1 ? `${n} operacijos · ${dayLabel(ds[0])}–${dayLabel(ds[n - 1])}` : dayLabel(ds[0])}</small></div><b class="num ${g.dir === "in" ? "pos" : ""}">${sign}${eur(g.total)}</b></div>
    ${!g.sure ? `<div class="ig-why">Patikrink${g.why ? `: ${esc(g.why)}` : ", kategorija atspėta neužtikrintai"}</div>` : g.ai ? `<div class="ig-why ai">Pakeitė AI</div>` : r.type === "trf" && g.why ? `<div class="ig-why info">Atpažinta kaip pervedimas: ${esc(g.why)}</div>` : ""}
    <select class="ig-sel" data-gchoice="${i}" aria-label="Kategorija">${choiceOptions(r)}</select>
    ${n > 1 ? `<details ${open ? "open" : ""}><summary>Rodyti operacijas (${n})</summary><div class="ig-rows">${g.rows.map(x => `<div class="ig-row"><span class="num">${dayLabel(x.date)}</span><span class="ig-m">${esc((x.memo || x.note).slice(0, 70))}</span><b class="num">${sign}${eur(x.amount)}</b>
      <select class="mini-sel" data-choice="${x.id}">${choiceOptions(x)}</select></div>`).join("")}</div></details>` : `<div class="ig-m1">${esc((r.memo || "").slice(0, 90))}</div>`}
  </div>`;
}
async function vImport() {
  const imp = S.imp;
  let body = `${subHead("Banko išrašo importas")}`;
  if (!imp) return body + `<div class="set-group"><div class="fine">Atsisiųsk sąskaitos išrašą iš savo banko (CSV, Excel arba XML) ir įkelk čia. Tą patį failą įkėlus dar kartą, dublikatų nebus.</div>
    <label class="field">Kurios sąskaitos išrašas<select id="impAcc">${accOptions("main")}</select></label>
    <div class="row"><label class="btn small" for="bankFile" style="cursor:pointer">Pasirinkti failą</label><input type="file" id="bankFile" accept="${BANK_ACCEPT}" hidden></div>
    ${!(S.cfg.prefs?.ownName) ? `<div class="hint">Patarimas: skiltyje <button class="linkbtn" data-sub="app">Profilis</button> įrašyk savo vardą ir pavardę. Tada pervedimai sau į kitus bankus bus atpažinti automatiškai.</div>` : ""}
  </div><div class="set-group">${vBankGuide(!importGroups("bank").length)}</div>` + vImportsList("bank");
  const {cands, skipped, balances} = await bankCandidates(imp);
  imp.balances = balances; imp._paired = new Set();
  const rows = cands.map(c => classifyBank(c, imp));
  const dupT = rows.filter(isDuplicateTransfer);
  const existing = rows.filter(r => S.txs.has(r.id));
  const fresh = rows.filter(r => !S.txs.has(r.id) && !dupT.includes(r) && r.type !== "skip");
  imp._fresh = fresh;
  const groups = importGroupsOf(fresh); imp._groups = groups;
  const cnt = t => fresh.filter(r => r.type === t).length;
  const unsure = groups.filter(g => !g.sure);
  const paired = fresh.filter(r => r.pairWith).length;
  const accObj = accById(imp.account_id);
  const showBal = balances && (!accObj?.anchor || accObj.anchor.date < balances.date);
  const known = presetLabel(imp);
  const mapOk = imp.map.date >= 0 && imp.map.amt >= 0;
  const f = imp.gfilter || "all";
  const shown = f === "unsure" ? unsure : f === "trf" ? groups.filter(g => g.rows[0].type === "trf") : f === "inc" ? groups.filter(g => g.dir === "in" && g.rows[0].type !== "trf") : groups;
  const ai = imp.ai || {};
  body += `<div class="set-group imp-file"><div class="row" style="justify-content:space-between;align-items:center"><div class="fine"><b>${esc(imp.name)}</b>${known ? ` · ${known}` : ""}</div><button class="linkbtn" id="impCancel">Keisti failą</button></div>
    <label class="field">Kurios sąskaitos išrašas<select id="impAcc">${accOptions(imp.account_id)}</select></label></div>
  <div class="impsteps"><span class="${!mapOk ? "on" : "done"}">1. Failas</span><span class="${mapOk ? "on" : ""}">2. Kategorijos</span><span>3. Importas</span></div>
  <section class="card istep"><div class="sec-h"><h2>1. Ar failas nuskaitytas teisingai?</h2></div>
    ${known && mapOk ? `<div class="fine">Failas atpažintas automatiškai. Žemiau matai, kaip atrodys pirmos operacijos. Jei viskas gerai, nieko keisti nereikia.</div>`
      : `<div class="fine">Programėlė turi žinoti, kuriame failo stulpelyje yra data, suma ir aprašymas. Po kiekvienu laukeliu matai pavyzdį iš tavo failo. Jei pavyzdys netinka, pasirink kitą stulpelį.</div>`}
    ${fresh.length ? `<div class="isample">${fresh.slice(0, 3).map(r => `<div><span class="num">${r.date}</span><span>${esc(r.note)}</span><b class="num ${r.dir === "in" ? "pos" : ""}">${r.dir === "in" ? "+" : "−"}${eur(r.amount)}</b></div>`).join("")}</div>` : ""}
    <details class="mapdet" ${!known || !mapOk ? "open" : ""}><summary>${known && mapOk ? "Keisti stulpelių priskyrimą" : "Stulpelių priskyrimas"}</summary>${vMapping(imp)}</details>
    ${!mapOk ? `<div class="err">Pasirink stulpelius „Data“ ir „Suma“, kad būtų galima tęsti.</div>` : ""}
  </section>
  ${mapOk ? `<section class="card istep"><div class="sec-h"><h2>2. Patikrink kategorijas</h2></div>
    <div class="fine">Rasta <b>${fresh.length} naujų</b> operacijų: ${cnt("exp")} išlaidos, ${cnt("inc")} pajamos, ${cnt("trf")} pervedimai tarp tavo sąskaitų.${existing.length ? ` ${existing.length} jau buvo importuotos anksčiau.` : ""}${dupT.length ? ` ${dupT.length} pervedimai jau įrašyti iš kitos sąskaitos išrašo.` : ""}${paired ? ` ${paired} pervedimai sujungti su ta pačia operacija kitoje tavo sąskaitoje.` : ""}${Object.keys(skipped).length ? ` Praleista: ${skippedText(skipped)}.` : ""}</div>
    ${fresh.length ? `<div class="fine">Operacijos sugrupuotos pagal vietą. Pakeitus kategoriją grupei, ji pakeičiama visoms grupės operacijoms. ${unsure.length ? `<b>${unsure.length}</b> grupės pažymėtos geltonai: jas verta patikrinti.` : ""}</div>
    <div class="aibox"><button class="btn ghost small" id="impAI" ${ai.busy ? "disabled" : ""}>${ai.busy ? "AI tikrina…" : ai.done ? "Patikrinti dar kartą su AI" : "Patikrinti kategorijas su AI"}</button>
      <small>${ai.err ? `<span class="err">${esc(ai.err)}</span>` : ai.done ? `AI pakeitė ${ai.changed} grupių kategorijas. Jos pažymėtos „Pakeitė AI“.` : "AI peržiūri pavadinimus ir sumas ir pataiso aiškiai klaidingas kategorijas, pvz. gėrimą degalinėje."}</small></div>
    <div class="filters">${[["all", `Visos (${groups.length})`], ["unsure", `Patikrinti (${unsure.length})`], ["trf", "Pervedimai"], ["inc", "Pajamos"]].map(([k, n]) => `<button class="chip" data-gfilter="${k}" aria-pressed="${f === k}">${n}</button>`).join("")}</div>
    <div class="igs">${shown.map(g => vImpGroup(g, groups.indexOf(g))).join("") || `<div class="empty">Šiame sąraše nieko nėra.</div>`}</div>` : ""}
  </section>
  <section class="card istep"><div class="sec-h"><h2>3. Importuoti</h2></div>
    ${fresh.length ? `<label class="check big"><input type="checkbox" id="impLearn" ${imp.learn ? "checked" : ""}><span><b>Kitą kartą priskirti taip pat</b><small>Jei pakeitei kategoriją, pvz. „Circle K“ į Kavines, programėlė tai įsimins ir kituose išrašuose tą pačią vietą priskirs taip pat. Įsimintus pakeitimus rasi skiltyje Kategorijos ir taisyklės.</small></span></label>` : ""}
    ${showBal ? `<label class="check big"><input type="checkbox" id="impBal" ${imp.setBalance ? "checked" : ""}><span><b>Nustatyti likutį: ${eur(balances.amount)}</b><small>Tai sąskaitos „${esc(accName(imp.account_id))}“ likutis išrašo pabaigoje (${balances.date}). Pažymėk, kad likutis programėlėje sutaptų su banku.</small></span></label>` : ""}
    ${!fresh.length && !showBal ? `<div class="fine">Naujų operacijų nėra, importuoti nieko nereikia.</div>` : `<div class="fine">Paspaudus mygtuką apačioje operacijos bus įrašytos. Vėliau jas galėsi pakeisti arba ištrinti visą failą skiltyje „Įkelti failai“.</div>`}
  </section>
  <div class="imp-bar"><button class="btn" id="doImport" ${!fresh.length && !showBal ? "disabled" : ""}>${fresh.length ? `Importuoti ${fresh.length} operacijas` : "Nustatyti likutį"}</button></div>` : ""}`;
  return body;
}
// Vienos operacijos pakeitimas
function bankOverride(id, choice) {
  const imp = S.imp; const r = imp._fresh.find(x => x.id === id); if (!r) return;
  imp.overrides[id] = choice; imp.aiPicked?.delete(id);
}
// Visos grupės pakeitimas. Įsimenama kaip taisyklė, jei grupė apima visas tos vietos operacijas arba atskiriama pagal sumą.
function groupOverride(i, choice) {
  const imp = S.imp, g = imp._groups?.[i]; if (!g) return;
  for (const r of g.rows) { imp.overrides[r.id] = choice; imp.aiPicked?.delete(r.id); }
  const key = g.note.trim().toLowerCase(); if (!key || choice === "skip") return;
  const same = imp._fresh.filter(x => x.note.trim().toLowerCase() === key && x.dir === g.dir);
  const others = same.filter(x => !g.rows.includes(x));
  const amts = g.rows.map(x => x.amount), lo = Math.min(...amts), hi = Math.max(...amts);
  let bound = null;
  if (others.length) {
    if (others.every(x => x.amount > hi)) bound = {max: r2(hi)};
    else if (others.every(x => x.amount < lo)) bound = {min: r2(lo)};
    else return;
  }
  imp.learned = imp.learned || {};
  imp.learned[key + (bound ? JSON.stringify(bound) : "")] = {pattern: key, choice, dir: g.dir, ...bound};
}
// AI peržiūri grupes ir pataiso kategorijas (naudoja tą pačią AI patarėjo funkciją)
async function aiCheckImport() {
  const imp = S.imp; if (!imp?._groups) return;
  imp.ai = {busy: true}; render();
  const groups = imp._groups.filter(g => !g.rows.some(r => imp.overrides[r.id] && !imp.aiPicked?.has(r.id)));
  const cats = categories().filter(c => !c.archived);
  const list = groups.slice(0, 160).map((g, i) => ({i, vieta: g.note, aprašymas: maskCards(g.rows[0].memo || "").slice(0, 90), kryptis: g.dir === "in" ? "gauta" : "išleista",
    sumos: [...new Set(g.rows.map(r => r.amount))].slice(0, 6), kartai: g.rows.length, dabar: choiceOf(g.rows[0]).replace(/^(exp|inc):/, "")}));
  const prompt = `Tu esi banko operacijų kategorizavimo įrankis. Lietuvos banko išrašo grupės: kiekviena turi vietą (pardavėją), aprašymą, sumas ir dabartinę kategoriją.
Kategorijos išlaidoms: ${cats.filter(c => c.type === "exp").map(c => `${c.id} (${c.name})`).join(", ")}.
Kategorijos pajamoms: ${cats.filter(c => c.type === "inc").map(c => `${c.id} (${c.name})`).join(", ")}.
Specialios reikšmės: "trf" yra pinigų perkėlimas tarp to paties žmogaus sąskaitų (pvz. papildymas iš kito banko), "keep" reiškia palikti kaip yra.
Taisyklės: vertink pagal tai, kas tikriausiai buvo nupirkta. Maža suma degalinėje (iki ~20 €) dažniausiai yra kava, gėrimas ar užkandis, o ne degalai. Prekybos centrai yra maistas. Jei abejoji, rašyk "keep". Pajamoms nenaudok išlaidų kategorijų ir atvirkščiai.
${S.cfg.prefs?.ownName ? `Sąskaitos savininkas: ${S.cfg.prefs.ownName}.\n` : ""}Atsakyk TIK JSON masyvu be jokio kito teksto, pvz. [{"i":0,"c":"food"},{"i":3,"c":"keep"}]. Įtrauk tik tas grupes, kurias keistum.
Grupės:
${JSON.stringify(list)}`;
  let text = "";
  try {
    await callAI([{role: "user", content: prompt}], t => { text += t; }, {context: {užduotis: "operacijų kategorizavimas"}, tools: false, signal: new AbortController().signal});
    const j = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1) || "[]");
    imp.aiPicked = imp.aiPicked || new Set();
    let changed = 0;
    for (const x of Array.isArray(j) ? j : []) {
      const g = groups[x.i]; if (!g || !x.c || x.c === "keep") continue;
      let choice = null;
      if (x.c === "trf") choice = "trf:";
      else { const c = catById(x.c); if (!c || c.id !== x.c) continue; if ((c.type === "inc") !== (g.dir === "in")) continue; choice = c.type + ":" + c.id; }
      if (choice === choiceOf(g.rows[0])) continue;
      for (const r of g.rows) { imp.overrides[r.id] = choice; imp.aiPicked.add(r.id); }
      changed++;
    }
    imp.ai = {done: true, changed};
  } catch (e) {
    imp.ai = {err: "AI patikrinti nepavyko: " + (e.message || "klaida") + ". Kategorijas gali pakeisti pats."};
  }
  if (S.imp === imp) render();
}
function doBankImport() {
  const imp = S.imp; if (!imp) return;
  const fresh = (imp._fresh || []).filter(r => r.type !== "skip");
  const ds = fresh.map(r => r.date).sort();
  const impId = fresh.length ? recordImport("bank", {file: imp.name || "", account_id: imp.account_id, from: ds[0], to: ds[ds.length - 1]}) : null;
  // pervedimas, jau matytas kitos sąskaitos išraše: esama operacija paverčiama pervedimu tarp abiejų sąskaitų, nauja neįrašoma
  const pairs = fresh.filter(r => r.pairWith && r.type === "trf" && S.txs.has(r.pairWith));
  if (pairs.length) bulkUpsert("transactions", pairs.map(r => { const t = S.txs.get(r.pairWith); return txRow({...t, type: "trf", cat: "transfer", account_id: r.account_id, to_account_id: r.to_account_id}); }));
  const rows = fresh.filter(r => !pairs.includes(r)).map(r => txRow({...r, import_id: impId}));
  if (rows.length) bulkUpsert("transactions", rows);
  // savo sąskaitų IBAN įsimenami: kitą kartą pervedimai bus atpažinti tiksliai
  const ibanFor = {};
  if (imp.ownIban) ibanFor[imp.account_id] = [normIban(imp.ownIban)];
  for (const r of fresh) if (r.type === "trf" && r.iban) { const other = r.dir === "out" ? r.to_account_id : r.account_id; if (other && other !== imp.account_id) (ibanFor[other] = ibanFor[other] || []).push(r.iban); }
  if (Object.keys(ibanFor).length) {
    ensureCfg("accounts");
    S.cfg.accounts = S.cfg.accounts.map(a => { const add = ibanFor[a.id]; if (!add) return a; return {...a, ibans: [...new Set([...(a.ibans || []), ...add])].slice(0, 10)}; });
    saveSettings("accounts");
  }
  if (imp.ownerName && !S.cfg.prefs?.ownName) { S.cfg.prefs = {...(S.cfg.prefs || {}), ownName: imp.ownerName}; saveSettings("prefs"); }
  if (imp.learn && imp.learned) {
    const rules = [...(S.cfg.rules || [])];
    for (const l of Object.values(imp.learned)) {
      const {pattern, choice} = l;
      if (choice === "skip" || !pattern) continue;
      const [type, v] = choice.split(":");
      const lim = {...(l.max != null ? {max: l.max} : {}), ...(l.min != null ? {min: l.min} : {})};
      const rule = type === "trf" ? {id: shortId(), pattern, type, cat: "transfer", to_account_id: v || null, ...lim} : {id: shortId(), pattern, type, cat: v, ...lim};
      const i = rules.findIndex(x => x.pattern === pattern && x.max === rule.max && x.min === rule.min); if (i >= 0) rules.splice(i, 1);
      rules.unshift(rule);
    }
    S.cfg.rules = rules; saveSettings("rules");
  }
  if (imp.balances && $("#impBal")?.checked) {
    ensureCfg("accounts");
    // likutis išrašo pabaigos dienos pabaigoje: vėlesnės operacijos pridedamos prie jo
    S.cfg.accounts = S.cfg.accounts.map(a => a.id === imp.account_id ? {...a, anchor: {date: imp.balances.date, amount: r2(imp.balances.amount)}} : a);
    saveSettings("accounts");
  }
  const months = rows.map(t => ymOf(t.date)).sort();
  if (months.length) S.ym = months[months.length - 1] > ymOf(todayISO()) ? ymOf(todayISO()) : months[months.length - 1];
  const imported = rows.map(normTx);
  const dup = replaceGeneratedDuplicates(imported);
  const accId = imp.account_id;
  S.imp = null;
  generateRecurring();
  toast(rows.length ? `Importuota ${rows.length} operacijų${dup ? `, pakeista ${dup} automatiškai sukurtų` : ""}` : "Likutis nustatytas");
  const rv = rows.length ? prepareRecReview(imported, accId) : null;
  if (rv && rv.items.length) { S.recReview = rv; S.tab = "more"; S.sub = "recreview"; render(); window.scrollTo(0, 0); return; }
  finishRecReview();
}
