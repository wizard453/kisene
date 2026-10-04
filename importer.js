/* Kišenė: CSV importas. Banko išrašai (Swedbank, Revolut ir bet koks kitas CSV) ir investavimo platformų operacijos
   (Trading 212, Revolut ir bet kokia kita platforma, kai stulpelius priskiri pats). */
"use strict";

/* ===================== Banko išrašai ===================== */
const BANK_FIELDS = [
  ["date", "Data", true], ["amt", "Suma", true], ["dir", "D/K žymė", false], ["party", "Gavėjas / mokėtojas", false],
  ["desc", "Paaiškinimas", false], ["id", "Įrašo ID", false], ["fee", "Mokestis", false]
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
    out.push({id, date, amount: r2(amount), dir, party, desc: descAll, revType: type, own: ownCols.map(get).filter(Boolean)});
  }
  return {cands: out, skipped, balances};
}

// Antrasis etapas: kandidato tipas ir kategorija
function classifyBank(c, imp) {
  const text = `${c.party} ${c.desc}`;
  const low = text.toLowerCase();
  const note = cleanMerchant(c.party || c.desc) || (c.dir === "in" ? "Pajamos" : "Išlaidos");
  const res = {id: c.id, date: c.date, amount: c.amount, note, memo: maskCards(c.desc), account_id: imp.account_id, dir: c.dir};
  const trf = (other, why) => ({...res, type: "trf", cat: "transfer", account_id: c.dir === "out" ? imp.account_id : (other || null), to_account_id: c.dir === "out" ? (other || null) : imp.account_id, why});
  const ov = imp.overrides[c.id];
  if (ov) return applyChoice(res, ov, c.dir, imp);
  // vartotojo taisyklės turi pirmenybę
  const ruled = categorize(text, c.dir);
  if (ruled.rule) return ruled.type === "trf" ? trf(ruled.to_account_id, "taisyklė") : {...res, type: ruled.type, cat: ruled.cat};
  // savo vardas: pervedimas tarp savo sąskaitų
  const own = normName(S.cfg.prefs?.ownName || "");
  if (own) {
    const toks = own.split(" ");
    if ([c.party, ...c.own].some(p => { const n = normName(p); return toks.length > 1 && toks.every(t => n.split(" ").includes(t)); })) {
      const acc = activeAccounts().find(a => a.id !== imp.account_id && a.match && a.match.split(",").map(s => s.trim()).filter(Boolean).some(k => low.includes(k)));
      return trf(acc?.id || null, "tavo vardas");
    }
  }
  // kitų savo sąskaitų atpažinimas pagal žodžius
  for (const a of activeAccounts()) {
    if (a.id === imp.account_id || !a.match) continue;
    if (a.match.split(",").map(s => s.trim()).filter(Boolean).some(k => low.includes(k))) return trf(a.id, a.name);
  }
  if (/^grynieji\b|cash withdrawal|\batm\b|bankomat/i.test(c.desc)) {
    const cash = activeAccounts().find(a => a.kind === "cash");
    return {...trf(cash?.id || null, "grynieji"), note: "Grynųjų išėmimas"};
  }
  if (c.revType === "TOPUP") {
    const bank = activeAccounts().find(a => a.id !== imp.account_id && a.kind === "bank");
    return trf(bank?.id || null, "papildymas");
  }
  const g = categorize(text, c.dir);
  return {...res, type: g.type, cat: g.cat};
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
async function vImport() {
  const imp = S.imp;
  let body = `${subHead("Banko išrašo importas")}
  <div class="set-group"><div class="fine">Eksportuok išrašą CSV formatu iš savo banko interneto banko ir įkelk čia. Swedbank ir Revolut formatai atpažįstami automatiškai, kitiems bankams stulpelius gali priskirti pats. Tą patį failą įkėlus dar kartą, dublikatų nebus.</div>
    <label class="field">Kurios sąskaitos išrašas<select id="impAcc">${accOptions(imp?.account_id || "main")}</select></label>
    <div class="row"><label class="btn ghost small" for="bankFile" style="cursor:pointer">Pasirinkti CSV failą</label><input type="file" id="bankFile" accept=".csv,text/csv,.txt" hidden>${imp ? `<span class="fine">${esc(imp.name)} · ${imp.preset === "swedbank" ? "Swedbank formatas" : imp.preset === "revolut" ? "Revolut formatas" : "bendras formatas"}</span>` : ""}</div>
    ${!(S.cfg.prefs?.ownName) ? `<div class="hint">Patarimas: skiltyje <button class="linkbtn" data-sub="app">Profilis</button> įrašyk savo vardą ir pavardę, tada pervedimai sau į kitus bankus bus atpažinti automatiškai.</div>` : ""}
  </div>`;
  if (!imp) return body + vImportsList("bank");
  const {cands, skipped, balances} = await bankCandidates(imp);
  imp.balances = balances;
  const rows = cands.map(c => classifyBank(c, imp));
  const dupT = rows.filter(isDuplicateTransfer);
  const existing = rows.filter(r => S.txs.has(r.id));
  const fresh = rows.filter(r => !S.txs.has(r.id) && !dupT.includes(r) && r.type !== "skip");
  imp._fresh = fresh;
  const cnt = t => fresh.filter(r => r.type === t).length;
  const accObj = accById(imp.account_id);
  const showBal = balances && (!accObj?.anchor || accObj.anchor.date < balances.date);
  body += `<div class="set-group">
    <details ${imp.preset === "generic" ? "open" : ""}><summary>Stulpelių priskyrimas</summary>${mapSelect(imp, BANK_FIELDS, "bm_")}</details>
    <div class="fine">Rasta ${rows.length} operacijų: <b>${fresh.length} naujos</b> (${cnt("exp")} išlaidos, ${cnt("inc")} pajamos, ${cnt("trf")} pervedimai)${existing.length ? `, ${existing.length} jau importuotos` : ""}${dupT.length ? `, ${dupT.length} pervedimai jau įrašyti iš kitos sąskaitos` : ""}.${Object.keys(skipped).length ? ` Praleista: ${skippedText(skipped)}.` : ""}</div>
    ${fresh.length ? `<div class="fine">Patikrink kategorijas. Pakeitus vieną, ta pati keičiama visoms operacijoms su tuo pačiu aprašymu.</div>
    <div class="prev"><table><thead><tr><th>Data</th><th>Aprašymas</th><th>Kategorija</th><th style="text-align:right">Suma</th></tr></thead><tbody>${fresh.map(r => `<tr><td class="num">${r.date.slice(5)}</td><td title="${esc(r.memo)}">${esc(r.note.slice(0, 26))}</td><td><select class="mini-sel" data-choice="${r.id}">${choiceOptions(r)}</select></td><td class="r num ${r.dir === "in" ? "pos" : ""}">${r.dir === "in" ? "+" : "−"}${eur(r.amount)}</td></tr>`).join("")}</tbody></table></div>
    <label class="check"><input type="checkbox" id="impLearn" ${imp.learn ? "checked" : ""}> Įsiminti mano pakeitimus kaip taisykles</label>` : ""}
    ${showBal ? `<label class="check"><input type="checkbox" id="impBal" ${imp.setBalance ? "checked" : ""}> Nustatyti sąskaitos „${esc(accName(imp.account_id))}“ likutį: ${eur(balances.amount)} (${balances.date})</label>` : ""}
    <div class="row"><button class="btn small" id="doImport" ${!fresh.length && !showBal ? "disabled" : ""}>${fresh.length ? `Importuoti ${fresh.length}` : "Nustatyti likutį"}</button><button class="btn ghost small" id="impCancel">Atšaukti</button></div>
  </div>`;
  return body;
}
function bankOverride(id, choice) {
  const imp = S.imp; const r = imp._fresh.find(x => x.id === id); if (!r) return;
  const key = r.note.trim().toLowerCase();
  for (const x of imp._fresh) if (x.note.trim().toLowerCase() === key && x.dir === r.dir) imp.overrides[x.id] = choice;
  imp.learned = imp.learned || {};
  imp.learned[key] = {choice, dir: r.dir};
}
function doBankImport() {
  const imp = S.imp; if (!imp) return;
  const fresh = (imp._fresh || []).filter(r => r.type !== "skip");
  const ds = fresh.map(r => r.date).sort();
  const impId = fresh.length ? recordImport("bank", {file: imp.name || "", account_id: imp.account_id, from: ds[0], to: ds[ds.length - 1]}) : null;
  const rows = fresh.map(r => txRow({...r, import_id: impId}));
  if (rows.length) bulkUpsert("transactions", rows);
  if (imp.learn && imp.learned) {
    const rules = [...(S.cfg.rules || [])];
    for (const [pattern, {choice}] of Object.entries(imp.learned)) {
      if (choice === "skip" || !pattern) continue;
      const [type, v] = choice.split(":");
      const rule = type === "trf" ? {id: shortId(), pattern, type, cat: "transfer", to_account_id: v || null} : {id: shortId(), pattern, type, cat: v};
      const i = rules.findIndex(x => x.pattern === pattern); if (i >= 0) rules.splice(i, 1);
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
