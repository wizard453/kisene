/* Kišenė: pasikartojantys mokėjimai.
   Du režimai:
   - "plan": planuojamas mokėjimas, kurį atneša banko išrašas. Programėlė tik laukia jo ir pažymi sumokėtu, kai randa atitinkančią operaciją.
   - "auto": operacija sukuriama automatiškai nurodytą dieną (grynieji ir kitos sąskaitos be išrašų).
   Po kiekvieno banko importo rodomas langas, kuriame pažymi, kurie mokėjimai pasikartoja. */
"use strict";

const recMode = r => r.mode || (accById(r.account_id)?.kind === "cash" ? "auto" : "plan");
const normKey = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const recKind = t => t.type === "trf" ? (isLoanAcc(t.to_account_id) ? "loan" : isInvestAcc(t.to_account_id) ? "invest" : null) : t.type;

// Ar operacija atitinka pasikartojantį mokėjimą
function recMatches(r, t) {
  if (t.recurring_id === r.id) return true;
  if (t.type !== r.type) return false;
  if (r.type === "trf") { if (t.to_account_id !== r.to_account_id) return false; }
  else if (r.account_id && t.account_id !== r.account_id && accById(r.account_id)) return false;
  const key = normKey(r.match || r.note);
  const text = normKey(t.note + " " + t.memo);
  const byText = key && text.includes(key);
  const tol = r.variable ? 0.5 : 0.2;
  const byAmt = Math.abs(t.amount - r.amount) <= Math.max(1, r.amount * tol);
  return r.type === "trf" ? byAmt || byText : byText && (byAmt || r.variable);
}
// Šio mėnesio operacija, kuri atitinka mokėjimą (jei sumokėta)
function recPaid(r, ym) {
  for (const t of S.txs.values()) if (ymOf(t.date) === ym && recMatches(r, t)) return t;
  return null;
}

/* ---------- Atpažinimas iš operacijų ---------- */
const recMedian = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function detectRecurring(accountId) {
  const since = addMonths(ymOf(todayISO()), -6) + "-01";
  const groups = new Map();
  for (const t of S.txs.values()) {
    if (t.date < since || t.recurring_id || !t.note) continue;
    if (accountId && t.account_id !== accountId) continue;
    const kind = recKind(t); if (!kind) continue;
    const key = kind + "|" + (t.type === "trf" ? t.to_account_id + "|" : "") + normKey(t.note);
    const g = groups.get(key) || {key, kind, type: t.type, note: t.note, cat: t.cat, account_id: t.account_id, to_account_id: t.to_account_id, txs: []};
    g.txs.push(t); groups.set(key, g);
  }
  const out = [];
  for (const g of groups.values()) {
    const txs = g.txs.sort((a, b) => a.date.localeCompare(b.date));
    const amts = txs.map(t => t.amount), med = recMedian(amts);
    const same = amts.filter(a => Math.abs(a - med) <= Math.max(1, med * 0.1)).length;
    const months = new Set(txs.map(t => ymOf(t.date)));
    let monthlyGaps = 0;
    for (let i = 1; i < txs.length; i++) { const d = (Date.parse(txs[i].date) - Date.parse(txs[i - 1].date)) / 86400000; if (d >= 24 && d <= 37) monthlyGaps++; }
    const spread = (Math.max(...amts) - Math.min(...amts)) / (med || 1);
    // bent du kartai maždaug kas mėnesį, ne daugiau kaip ~1 kartas per mėnesį
    const perMonth = txs.length / Math.max(1, months.size);
    // kasdienės kategorijos (maistas, degalai, kavinės) laikomos pasikartojančiomis tik jei suma tiksliai ta pati bent 3 mėnesius
    const billLike = g.type !== "exp" || ["home", "subs", "loan", "insurance", "health"].includes(g.cat) || catById(g.cat).type === "exp" && !["food", "cafe", "transport", "shop", "fun", "travel", "other"].includes(g.cat);
    const exact = amts.filter(a => Math.abs(a - med) <= Math.max(0.5, med * 0.03)).length >= Math.ceil(txs.length * 0.8);
    const gaps = []; for (let i = 1; i < txs.length; i++) gaps.push((Date.parse(txs[i].date) - Date.parse(txs[i - 1].date)) / 86400000);
    const medGap = recMedian(gaps);
    // kas mėnesį: tipinis tarpas ~mėnuo arba po vieną kartą skirtingais mėnesiais (mokėjimo diena gali svyruoti tarp mėnesio pradžios ir pabaigos)
    const regular = txs.length >= 2 && ((medGap >= 20 && medGap <= 40) || (months.size >= 2 && perMonth <= 1.2) || (months.size >= 2 && txs.length <= months.size * 2 && monthlyGaps >= Math.floor(txs.length / 2)));
    const strong = regular && (billLike ? (same >= Math.ceil(txs.length * 0.6) || spread <= 0.6) : exact && months.size >= 3);
    // prenumerata, matyta tik kartą: pasiūlom, bet nepažymim
    const maybe = !strong && txs.length === 1 && g.type === "exp" && g.cat === "subs";
    if (!strong && !maybe) continue;
    const last = txs[txs.length - 1];
    const days = txs.map(t => +t.date.slice(8)).sort((a, b) => a - b);
    out.push({key: g.key, type: g.type, note: g.note, cat: g.cat, account_id: g.account_id, to_account_id: g.to_account_id,
      amount: r2(txs.slice(-3).reduce((s, t) => s + t.amount, 0) / Math.min(3, txs.length)), day: Math.min(28, +last.date.slice(8)),
      variable: spread > 0.1, count: txs.length, last: last.date, strong});
  }
  return out.sort((a, b) => b.strong - a.strong || b.amount - a.amount);
}

/* ---------- Langas po importo ---------- */
// imported: ką tik importuotų operacijų sąrašas; accountId: kurios sąskaitos išrašas
function prepareRecReview(imported, accountId) {
  const recs = (S.cfg.recurring || []).filter(r => recMode(r) === "plan" || (r.account_id === accountId && accById(accountId)?.kind !== "cash"));
  const lastImport = imported.reduce((m, t) => t.date > m ? t.date : m, "");
  const items = [];
  // esami
  for (const r of recs) {
    if (accountId && r.type !== "trf" && r.account_id && r.account_id !== accountId) continue;
    const hits = imported.filter(t => recMatches(r, t)).sort((a, b) => b.date.localeCompare(a.date));
    const all = [...S.txs.values()].filter(t => recMatches(r, t)).sort((a, b) => b.date.localeCompare(a.date));
    const lastSeen = all[0]?.date || null;
    const stale = lastImport && (!lastSeen || monthsBetween(ymOf(lastSeen), ymOf(lastImport)) >= 2);
    items.push({id: r.id, existing: true, rec: r, note: r.note, type: r.type, cat: r.cat, to_account_id: r.to_account_id, amount: hits[0]?.amount ?? r.amount, day: r.day,
      paid: hits[0]?.date || null, lastSeen, stale, checked: r.active && !stale, amountChanged: hits[0] && Math.abs(hits[0].amount - r.amount) > 0.005});
  }
  // nauji
  for (const c of detectRecurring(accountId)) {
    const fake = {id: "_", type: c.type, note: c.note, match: c.note, account_id: c.account_id, to_account_id: c.to_account_id, amount: c.amount, variable: c.variable};
    if ((S.cfg.recurring || []).some(r => recMatches(r, {type: c.type, note: c.note, memo: "", amount: c.amount, account_id: c.account_id, to_account_id: c.to_account_id}) || recMatches(fake, {type: r.type, note: r.note || "", memo: "", amount: r.amount, account_id: r.account_id, to_account_id: r.to_account_id}))) continue;
    if ((S.cfg.prefs?.notRecurring || []).includes(c.key)) continue;
    items.push({id: "new:" + c.key, existing: false, cand: c, note: c.note, type: c.type, cat: c.cat, to_account_id: c.to_account_id, amount: c.amount, day: c.day, count: c.count, variable: c.variable, checked: c.strong, maybe: !c.strong});
  }
  return {accountId, items};
}
function vRecReview() {
  const rv = S.recReview;
  if (!rv) { S.sub = null; return vOverview(); }
  const label = it => it.type === "trf" ? (isLoanAcc(it.to_account_id) ? "Paskolos įmoka" : "Investavimas") + " → " + accName(it.to_account_id) : catById(it.cat).name;
  const row = (it, i) => `<label class="rrv ${it.checked ? "" : "off"}"><input type="checkbox" data-rrv="${i}" ${it.checked ? "checked" : ""}>
    <span class="rrv-t"><b>${esc(it.note || label(it))}</b><small>${esc(label(it))} · kas mėn. ~${it.day} d.${it.variable ? " · suma kinta" : ""}</small>
      <small class="rrv-s ${it.stale ? "warn" : it.paid ? "ok" : ""}">${it.existing ? (it.paid ? `✓ Rasta šiame išraše ${dayLabel(it.paid)}${it.amountChanged ? `, suma pasikeitė į ${eur(it.amount)}` : ""}` : it.stale ? (it.lastSeen ? `Nematyta nuo ${dayLabel(it.lastSeen)}. Gal jau baigėsi?` : "Išrašuose nerasta. Gal jau baigėsi?") : "Šiame išraše nerasta") : it.maybe ? "Matyta tik kartą, gali būti prenumerata" : `Nauja · rasta ${it.count} kartus`}</small></span>
    <span class="am num ${it.type === "inc" ? "pos" : ""}">${it.type === "inc" ? "+" : "−"}${eur(it.amount)}</span></label>`;
  const ex = rv.items.map((it, i) => [it, i]).filter(([it]) => it.existing), nw = rv.items.map((it, i) => [it, i]).filter(([it]) => !it.existing);
  return `<div class="subhead"><h2>Pasikartojantys mokėjimai</h2></div>
  <div class="fine" style="margin-top:-4px">Pažymėk mokėjimus, kurie kartojasi kas mėnesį. Jie bus naudojami kortelėje „Laisvi pinigai“ kaip laukiami mokėjimai, kol atsiras kitame išraše. Atžymėk tuos, kurie baigėsi, pvz. išmokėtą lizingą.</div>
  ${nw.length ? `<div class="sec-h"><h2>Rasti nauji</h2><span class="aside">${nw.length}</span></div><div class="rrv-list">${nw.map(([it, i]) => row(it, i)).join("")}</div>` : ""}
  ${ex.length ? `<div class="sec-h"><h2>Jau sekami</h2><span class="aside">${ex.length}</span></div><div class="rrv-list">${ex.map(([it, i]) => row(it, i)).join("")}</div>` : ""}
  ${!rv.items.length ? `<div class="txs"><div class="empty">Pasikartojančių mokėjimų nerasta. Jų atsiras, kai įkelsi bent dviejų mėnesių išrašus.</div></div>` : ""}
  <div class="row"><button class="btn" id="rrvSave" style="flex:1">Išsaugoti</button><button class="btn ghost" id="rrvSkip">Praleisti</button></div>`;
}
function saveRecReview() {
  const rv = S.recReview; if (!rv) return;
  const now = ymOf(todayISO());
  let recs = [...(S.cfg.recurring || [])];
  let added = 0, stopped = 0;
  const notRec = new Set(S.cfg.prefs?.notRecurring || []);
  for (const it of rv.items) {
    if (it.existing) {
      recs = recs.map(r => {
        if (r.id !== it.id) return r;
        const n = {...r, mode: recMode(r) === "auto" && accById(r.account_id)?.kind !== "cash" ? "plan" : recMode(r)};
        if (!it.checked && r.active) { n.active = false; stopped++; }
        if (it.checked) { n.active = true; if (it.paid && it.amountChanged && !r.variable) n.amount = r2(it.amount); }
        return n;
      });
    } else if (it.checked) {
      const c = it.cand;
      recs.push({id: shortId(), type: c.type, cat: c.type === "trf" ? "transfer" : c.cat, amount: c.amount, note: c.note, match: normKey(c.note), day: c.day,
        account_id: c.account_id, to_account_id: c.to_account_id || null, start: now, last: now, active: true, mode: "plan", variable: c.variable});
      added++;
    } else if (!it.maybe) notRec.add(it.cand.key);
  }
  S.cfg.recurring = recs; saveSettings("recurring");
  S.cfg.prefs = {...(S.cfg.prefs || {}), notRecurring: [...notRec].slice(-200)}; saveSettings("prefs");
  finishRecReview();
  toast(added || stopped ? `Pasikartojančių: +${added}${stopped ? `, sustabdyta ${stopped}` : ""}` : "Išsaugota");
}
function finishRecReview() {
  S.recReview = null;
  if (S.ob) { S.tab = "more"; S.sub = "onboard"; S.ob.step = 3; } else { S.tab = "overview"; S.sub = null; }
  render(); window.scrollTo(0, 0);
}
// Automatiškai sukurtą operaciją pakeičia banko įrašas: pašalinam sugeneruotą dublikatą
function replaceGeneratedDuplicates(imported) {
  const remove = [];
  for (const g of [...S.txs.values()].filter(t => t.recurring_id)) {
    const r = (S.cfg.recurring || []).find(x => x.id === g.recurring_id);
    if (r && accById(r.account_id)?.kind === "cash") continue;
    const hit = imported.find(t => !t.recurring_id && t.type === g.type && ymOf(t.date) === ymOf(g.date) && t.account_id === g.account_id
      && (g.type !== "trf" || t.to_account_id === g.to_account_id) && Math.abs(t.amount - g.amount) <= Math.max(1, g.amount * 0.05));
    if (hit) {
      remove.push(g.id);
      // toliau šį mokėjimą atpažinsim pagal banko aprašymą ir lauksim išrašo
      if (r && !r.match) { S.cfg.recurring = S.cfg.recurring.map(x => x.id === r.id ? {...x, match: normKey(hit.note), mode: "plan"} : x); saveSettings("recurring"); }
    }
  }
  for (const id of remove) removeTx(id);
  return remove.length;
}
