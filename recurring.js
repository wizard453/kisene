/* Kišenė: pasikartojantys mokėjimai.
   Du režimai:
   - "plan": planuojamas mokėjimas, kurį atneša banko išrašas. Programėlė tik laukia jo ir pažymi sumokėtu, kai randa atitinkančią operaciją.
   - "auto": operacija sukuriama automatiškai nurodytą dieną (grynieji ir kitos sąskaitos be išrašų).
   Po kiekvieno banko importo rodomas langas, kuriame pažymi, kurie mokėjimai pasikartoja. */
"use strict";

const recMode = r => r.mode || (accById(r.account_id)?.kind === "cash" ? "auto" : "plan");
const normKey = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
// Pasikartojančiais laikomi ir reguliarūs pervedimai į taupymą (taupomąją ar kitą savo sąskaitą, ne grynuosius)
const recKind = t => t.type === "trf" ? (isLoanAcc(t.to_account_id) ? "loan" : isInvestAcc(t.to_account_id) ? "invest"
  : accById(t.to_account_id)?.kind === "savings" || (!t.to_account_id && /taup|saving|santaup/i.test((t.note || "") + " " + (t.memo || ""))) ? "save" : null) : t.type;
const trfLabel = id => isLoanAcc(id) ? "Paskolos įmoka" : isInvestAcc(id) ? "Investavimas" : "Taupymas";

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
// Pavadinimo šaknis grupavimui: be skaičių, skyrybos ir diakritikų
const recRoot = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
// Operacijos sugrupuojamos pagal vietą. „Telia“ ir „Telia Lietuva“ sujungiamos, nes viena yra kitos pradžia.
function recGroups(accountId, months) {
  const since = addMonths(ymOf(todayISO()), -(months || 6)) + "-01";
  const groups = new Map();
  for (const t of S.txs.values()) {
    if (t.date < since || t.recurring_id || !t.note) continue;
    if (accountId && t.account_id !== accountId && !(t.type === "trf" && t.to_account_id === accountId)) continue;
    const kind = recKind(t); if (!kind) continue;
    const root = recRoot(t.note); if (!root) continue;
    const key = kind + "|" + (t.type === "trf" ? t.to_account_id + "|" : "") + root;
    const g = groups.get(key) || {key, root, kind, type: t.type, note: t.note, cat: t.cat, account_id: t.account_id, to_account_id: t.to_account_id, txs: []};
    g.txs.push(t); groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) => a.root.length - b.root.length);
  for (const g of list) {
    if (!g.txs.length) continue;
    for (const h of list) {
      if (h === g || !h.txs.length || h.kind !== g.kind || h.to_account_id !== g.to_account_id) continue;
      if (h.root.startsWith(g.root + " ") && g.root.length >= 4) { g.txs.push(...h.txs); h.txs = []; }
    }
  }
  return list.filter(g => g.txs.length).map(g => {
    const txs = g.txs.sort((a, b) => a.date.localeCompare(b.date));
    const amts = txs.map(t => t.amount), med = recMedian(amts);
    const last = txs[txs.length - 1];
    // dažniausias pavadinimas
    const names = {}; for (const t of txs) names[t.note] = (names[t.note] || 0) + 1;
    const cats = {}; for (const t of txs) cats[t.cat] = (cats[t.cat] || 0) + 1;
    return {...g, txs, note: Object.entries(names).sort((a, b) => b[1] - a[1])[0][0], cat: Object.entries(cats).sort((a, b) => b[1] - a[1])[0][0],
      amts, med, last, months: new Set(txs.map(t => ymOf(t.date)))};
  });
}
function recCand(g, strong) {
  const spread = (Math.max(...g.amts) - Math.min(...g.amts)) / (g.med || 1);
  return {key: g.key, type: g.type, note: g.note, cat: g.cat, account_id: g.last.account_id, to_account_id: g.to_account_id,
    amount: r2(g.txs.slice(-3).reduce((s, t) => s + t.amount, 0) / Math.min(3, g.txs.length)), day: Math.min(28, +g.last.date.slice(8)),
    variable: spread > 0.1, count: g.txs.length, months: g.months.size, last: g.last.date, strong};
}
const BILL_CATS = ["home", "subs", "loan", "insurance"];
const EVERYDAY_CATS = ["food", "cafe", "transport", "shop", "travel"];
function detectRecurring(accountId) {
  const out = [];
  for (const g of recGroups(accountId, 6)) {
    const {txs, amts, med, months} = g;
    if (txs.length < 1) continue;
    const gaps = []; for (let i = 1; i < txs.length; i++) gaps.push((Date.parse(txs[i].date) - Date.parse(txs[i - 1].date)) / 86400000);
    const medGap = recMedian(gaps);
    const perMonth = txs.length / Math.max(1, months.size);
    const monthlyGaps = gaps.filter(d => d >= 24 && d <= 37).length;
    const spread = (Math.max(...amts) - Math.min(...amts)) / (med || 1);
    const same = amts.filter(a => Math.abs(a - med) <= Math.max(1, med * 0.1)).length;
    const exact = amts.filter(a => Math.abs(a - med) <= Math.max(0.5, med * 0.03)).length >= Math.ceil(txs.length * 0.8);
    const days = txs.map(t => +t.date.slice(8)), dMed = recMedian(days);
    const sameDay = days.filter(d => Math.min(Math.abs(d - dMed), 31 - Math.abs(d - dMed)) <= 5).length >= Math.ceil(txs.length * 0.7);
    const billLike = g.type !== "exp" || BILL_CATS.includes(g.cat);
    // kas mėnesį: tipinis tarpas apie mėnesį arba po vieną kartą skirtingais mėnesiais
    const regular = months.size >= 2 && perMonth <= 1.5 && ((medGap >= 20 && medGap <= 40) || perMonth <= 1.2 || monthlyGaps >= Math.floor(txs.length / 2));
    let strong = false, maybe = false;
    if (regular) {
      if (billLike) strong = same >= Math.ceil(txs.length * 0.6) || spread <= (g.cat === "home" ? 1.5 : 0.6);
      // kasdienės kategorijos: ta pati suma maždaug tą pačią mėnesio dieną bent 3 mėnesius (pvz. sporto klubas)
      else strong = exact && sameDay && perMonth <= 1.2 && months.size >= 3;
      // pasiūlymas be pažymėjimo, bet ne kasdieniams pirkiniams (maistas, kavinės, transportas, apsipirkimas, kelionės)
      if (!strong) maybe = perMonth <= 1.2 && (billLike ? (exact || sameDay) : exact && sameDay && !EVERYDAY_CATS.includes(g.cat));
    }
    // prenumerata ar sąskaita, matyta tik kartą
    if (!regular && txs.length === 1 && g.type === "exp" && ["subs", "insurance", "home"].includes(g.cat)) maybe = true;
    if (!strong && !maybe) continue;
    out.push(recCand(g, strong));
  }
  return out.sort((a, b) => b.strong - a.strong || b.amount - a.amount);
}
// Visos vietos paskutinių 6 mėnesių operacijose: iš jų pasikartojantį mokėjimą galima pasirinkti ranka
function allRecCandidates(accountId) {
  return recGroups(accountId, 6).map(g => recCand(g, false)).sort((a, b) => b.months - a.months || b.count - a.count || b.amount - a.amount);
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
  const label = it => it.type === "trf" ? trfLabel(it.to_account_id) + " → " + (it.to_account_id ? accName(it.to_account_id) : "kita savo sąskaita") : catById(it.cat).name;
  const row = (it, i) => `<label class="rrv ${it.checked ? "" : "off"}"><input type="checkbox" data-rrv="${i}" ${it.checked ? "checked" : ""}>
    <span class="rrv-t"><b>${esc(it.note || label(it))}</b><small>${esc(label(it))} · kas mėn. ~${it.day} d.${it.variable ? " · suma kinta" : ""}</small>
      <small class="rrv-s ${it.stale ? "warn" : it.paid ? "ok" : ""}">${it.existing ? (it.paid ? `✓ Rasta šiame išraše ${dayLabel(it.paid)}${it.amountChanged ? `, suma pasikeitė į ${eur(it.amount)}` : ""}` : it.stale ? (it.lastSeen ? `Nematyta nuo ${dayLabel(it.lastSeen)}. Gal jau baigėsi?` : "Išrašuose nerasta. Gal jau baigėsi?") : "Šiame išraše nerasta") : it.manual ? "Pridėta ranka" : it.maybe ? (it.count > 1 ? `Galimai pasikartojantis · rasta ${it.count} kartus` : "Matyta tik kartą, gali būti prenumerata") : `Nauja · rasta ${it.count} kartus`}</small></span>
    <span class="am num ${it.type === "inc" ? "pos" : ""}">${it.type === "inc" ? "+" : "−"}${eur(it.amount)}</span></label>`;
  const ex = rv.items.map((it, i) => [it, i]).filter(([it]) => it.existing), nw = rv.items.map((it, i) => [it, i]).filter(([it]) => !it.existing);
  return `<div class="subhead"><h2>Pasikartojantys mokėjimai</h2></div>
  <div class="fine" style="margin-top:-4px">Pažymėk mokėjimus, kurie kartojasi kas mėnesį. Jie bus naudojami kortelėje „Laisvi pinigai“ kaip laukiami mokėjimai, kol atsiras kitame išraše. Atžymėk tuos, kurie baigėsi, pvz. išmokėtą lizingą.</div>
  ${nw.length ? `<div class="sec-h"><h2>Rasti nauji</h2><span class="aside">${nw.length}</span></div><div class="rrv-list">${nw.map(([it, i]) => row(it, i)).join("")}</div>` : ""}
  ${ex.length ? `<div class="sec-h"><h2>Jau sekami</h2><span class="aside">${ex.length}</span></div><div class="rrv-list">${ex.map(([it, i]) => row(it, i)).join("")}</div>` : ""}
  ${!rv.items.length ? `<div class="txs"><div class="empty">Automatiškai pasikartojančių mokėjimų nerasta. Gali juos pasirinkti iš sąrašo žemiau.</div></div>` : ""}
  <section class="card rrv-pick"><div class="sec-h"><h2>Pridėti iš visų operacijų</h2></div>
    <div class="fine">Jei kurio nors pasikartojančio mokėjimo nerado, surask jį čia ir paspausk „Pridėti“. Sąraše yra visos vietos iš paskutinių 6 mėnesių, dažniausiai pasikartojančios viršuje.</div>
    <input id="rrvQ" class="rrv-q" type="search" placeholder="Ieškoti, pvz. Telia, nuoma, sporto klubas" value="${esc(rv.q || "")}" autocomplete="off">
    <div id="rrvPick" class="rrv-list">${vRecPick()}</div></section>
  <div class="row"><button class="btn" id="rrvSave" style="flex:1">Išsaugoti</button><button class="btn ghost" id="rrvSkip">Praleisti</button></div>`;
}
function vRecPick() {
  const rv = S.recReview; if (!rv) return "";
  rv.all = rv.all || allRecCandidates(rv.accountId);
  const taken = new Set(rv.items.map(it => it.cand?.key || ""));
  const q = recRoot(rv.q || "");
  const list = rv.all.filter(c => !taken.has(c.key) && (!q || recRoot(c.note + " " + catById(c.cat).name).includes(q))).slice(0, q ? 40 : 25);
  if (!list.length) return `<div class="empty">${q ? "Nieko nerasta." : "Daugiau vietų nėra."}</div>`;
  return list.map(c => `<div class="rrv add"><span class="rrv-t"><b>${esc(c.note)}</b><small>${esc(c.type === "trf" ? trfLabel(c.to_account_id) : catById(c.cat).name)} · ${c.count} kart. per ${c.months} mėn. · paskutinį kartą ${dayLabel(c.last)}</small></span>
    <span class="am num ${c.type === "inc" ? "pos" : ""}">${c.type === "inc" ? "+" : "−"}${eur(c.amount)}</span><button class="btn ghost small" data-rrvadd="${esc(c.key)}">Pridėti</button></div>`).join("");
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
    } else if (!it.maybe && !it.manual) notRec.add(it.cand.key);
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
