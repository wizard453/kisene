/* Kišenė: pradžios vedlys (rodomas pirmą kartą prisijungus be duomenų, galima paleisti iš naujo). */
"use strict";

const BANKS = ["Swedbank", "SEB", "Luminor", "Šiaulių bankas", "Citadele", "Revolut", "Paysera", "Kitas bankas"];

function startOnboarding() {
  const main = accById("main");
  S.ob = {step: 1, ownName: S.cfg.prefs?.ownName || "", bank: main && main.name !== "Pagrindinė sąskaita" ? main.name : "Swedbank", mainBal: "",
    rev: !!activeAccounts().find(a => /revolut/i.test(a.name)), revBal: "", cash: true, cashBal: "", t212: !!activeAccounts().find(a => a.kind === "invest"),
    loan: !!activeAccounts().find(a => a.kind === "loan"), loanName: "", loanPayee: "", loanDebt: ""};
  S.tab = "more"; S.sub = "onboard";
}
function suggestBudgets() {
  const now = ymOf(todayISO()), txs = [...S.txs.values()];
  const months = dataMonths(txs, now).map(m => monthAgg(m, txs));
  if (!months.length) return [];
  return catsOf("exp").filter(c => c.id !== "other").map(c => {
    const avg = months.reduce((s, a) => s + (a.byCat[c.id] || 0), 0) / months.length;
    return {c, avg, sug: Math.ceil(avg * 1.05 / 10) * 10};
  }).filter(x => x.avg >= 15).sort((a, b) => b.avg - a.avg);
}
function vOnboard() {
  const o = S.ob; if (!o) { startOnboarding(); return vOnboard(); }
  const steps = ["Sąskaitos", "Išrašas", "Biudžetai", "Pradėk"];
  const head = `<div class="ob-steps">${steps.map((n, i) => `<span class="${i + 1 === o.step ? "on" : i + 1 < o.step ? "done" : ""}"><i>${i + 1 < o.step ? "✓" : i + 1}</i>${n}</span>`).join("")}</div>`;
  if (o.step === 1) return `${head}
  <div class="ob"><h2>Sveikas! Pradėkime nuo tavo pinigų žemėlapio</h2>
    <p class="fine">Tai užtruks apie minutę. Viską vėliau galėsi pakeisti skiltyje Daugiau.</p>
    <form id="obForm1" class="set-group">
      <label class="field">Vardas ir pavardė, kaip rodoma banko išraše<input id="obName" value="${esc(o.ownName)}" placeholder="pvz. Vardenis Pavardenis" autocomplete="name"></label>
      <div class="two"><label class="field">Pagrindinis bankas<select id="obBank">${BANKS.map(b => `<option ${o.bank === b ? "selected" : ""}>${b}</option>`).join("")}</select></label>
        <label class="field">Likutis dabar, €<input id="obMainBal" inputmode="decimal" placeholder="arba iš išrašo" value="${esc(o.mainBal)}"></label></div>
      <h3>Kas dar turi?</h3>
      <label class="obopt"><input type="checkbox" id="obRev" ${o.rev ? "checked" : ""}><span><b>Revolut</b><small>Papildymai iš banko bus pervedimai, ne išlaidos</small></span><input class="inp" id="obRevBal" inputmode="decimal" placeholder="likutis €" value="${esc(o.revBal)}"></label>
      <label class="obopt"><input type="checkbox" id="obCash" ${o.cash ? "checked" : ""}><span><b>Grynieji</b><small>Išėmimai iš bankomato pateks čia</small></span><input class="inp" id="obCashBal" inputmode="decimal" placeholder="turi €" value="${esc(o.cashBal)}"></label>
      <label class="obopt"><input type="checkbox" id="obT212" ${o.t212 ? "checked" : ""}><span><b>Trading 212</b><small>Pervedimai į ją bus investavimas</small></span><span></span></label>
      <label class="obopt"><input type="checkbox" id="obLoan" ${o.loan ? "checked" : ""}><span><b>Paskola ar lizingas</b><small>Įmokos mažins skolą, o ne didins išlaidas</small></span><span></span></label>
      <div class="ob-loan" ${o.loan ? "" : "hidden"}>
        <div class="two"><label class="field">Pavadinimas<input id="obLoanName" value="${esc(o.loanName)}" placeholder="pvz. Automobilio lizingas"></label><label class="field">Likusi skola, €<input id="obLoanDebt" inputmode="decimal" value="${esc(o.loanDebt)}"></label></div>
        <label class="field">Įmokų gavėjas išraše<input id="obLoanPayee" value="${esc(o.loanPayee)}" placeholder="pvz. artea lizingas"></label>
      </div>
      <div class="row"><button class="btn" style="flex:1">Toliau</button><button class="btn ghost" type="button" id="obSkip">Praleisti vedlį</button></div>
    </form></div>`;
  if (o.step === 2) return `${head}
  <div class="ob"><h2>Įkelk banko išrašą</h2>
    <p class="fine">Programėlė suskirstys operacijas į kategorijas, atpažins pervedimus tarp tavo sąskaitų ir nustatys likutį. Rekomenduojama įkelti bent 3 paskutinių mėnesių išrašą, tada bus galima pasiūlyti biudžetus.</p>
    <div class="set-group"><div class="fine">${esc(accName("main"))} interneto banke rask „Sąskaitos išrašas“, pasirink laikotarpį ir formatą CSV, Excel arba XML.</div>
      <div class="row"><label class="btn" for="obFile" style="cursor:pointer">Pasirinkti išrašo failą</label><input type="file" id="obFile" accept="${BANK_ACCEPT}" hidden><button class="btn ghost" id="obNext2">Vėliau</button></div>
      ${vBankGuide(false)}</div>
    <button class="linkbtn" id="obBack" style="align-self:flex-start">‹ Atgal</button></div>`;
  if (o.step === 3) {
    const sug = suggestBudgets();
    return `${head}
  <div class="ob"><h2>Mėnesio biudžetai</h2>
    ${sug.length ? `<p class="fine">Pasiūlyta pagal paskutinių mėnesių vidurkį, suapvalinus į viršų. Pažymėk, kuriuos nori sekti, ir pakoreguok sumas.</p>
    <form id="obForm3" class="set-group">${sug.map(x => `<label class="obopt"><input type="checkbox" data-obb="${x.c.id}" ${x.avg >= 30 && !["travel", "shop", "loan", "insurance"].includes(x.c.id) ? "checked" : ""}><span><b>${esc(x.c.name)}</b><small>vidutiniškai ${eur0(x.avg)} per mėn.</small></span><input class="inp" id="obb_${x.c.id}" inputmode="decimal" value="${x.sug}"></label>`).join("")}
      <div class="row"><button class="btn" style="flex:1">Išsaugoti biudžetus</button><button class="btn ghost" type="button" id="obNext3">Praleisti</button></div></form>`
    : `<p class="fine">Kol kas per mažai duomenų biudžetams pasiūlyti. Juos nustatysi vėliau skiltyje Daugiau → Biudžetai.</p><div class="row"><button class="btn" id="obNext3">Toliau</button></div>`}
    <button class="linkbtn" id="obBack" style="align-self:flex-start">‹ Atgal</button></div>`;
  }
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  return `${head}
  <div class="ob"><h2>Viskas paruošta</h2>
    <ul class="notes">
      <li><span class="ic">+</span><span>Išlaidą pridėsi mygtuku + apačioje. Dažnos operacijos bus vienu paspaudimu.</span></li>
      <li><span class="ic">↔</span><span>Mėnesius keisk perbraukdamas pirštu arba paspaudęs mėnesio pavadinimą.</span></li>
      <li><span class="ic">!</span><span>Pranešimus apie biudžetą ir didelius mokėjimus įjungsi skiltyje Daugiau → Profilis.</span></li>
      ${standalone ? "" : `<li><span class="ic">⇩</span><span>${/iphone|ipad|ipod/i.test(navigator.userAgent) ? "Safari: Bendrinti → Į pradžios ekraną, kad programėlė atsidarytų kaip aplikacija." : "Naršyklės meniu pasirink „Įdiegti programą“, kad ji atsidarytų kaip aplikacija."}</span></li>`}
    </ul>
    <div class="row"><button class="btn" id="obDone" style="flex:1">Pradėti</button></div></div>`;
}
function obSaveStep1() {
  const o = S.ob, v = id => $(id)?.value?.trim() || "";
  Object.assign(o, {ownName: v("#obName"), bank: v("#obBank"), mainBal: v("#obMainBal"), rev: $("#obRev").checked, revBal: v("#obRevBal"), cash: $("#obCash").checked, cashBal: v("#obCashBal"),
    t212: $("#obT212").checked, loan: $("#obLoan").checked, loanName: v("#obLoanName"), loanPayee: v("#obLoanPayee"), loanDebt: v("#obLoanDebt")});
  S.cfg.prefs = {...(S.cfg.prefs || {}), ownName: o.ownName}; saveSettings("prefs");
  ensureCfg("accounts");
  const today = todayISO(), anchorOf = (txt, neg) => { const n = parseNum(txt); return n === null ? null : {date: today, amount: r2(neg ? -Math.abs(n) : n)}; };
  const accs = S.cfg.accounts.map(a => ({...a}));
  const upsert = (find, make) => { const i = accs.findIndex(find); if (i >= 0) accs[i] = {...accs[i], ...make(accs[i]), archived: false}; else accs.push({id: shortId(), ...make({})}); };
  upsert(a => a.id === "main", a => ({name: o.bank === "Kitas bankas" ? "Pagrindinė sąskaita" : o.bank, kind: "bank", anchor: anchorOf(o.mainBal) || a.anchor || null}));
  if (o.rev && o.bank !== "Revolut") upsert(a => /revolut/i.test(a.name), a => ({name: "Revolut", kind: "bank", match: "revolut", anchor: anchorOf(o.revBal) || a.anchor || null}));
  if (o.cash) upsert(a => a.kind === "cash", a => ({name: "Grynieji", kind: "cash", match: a.match || "", anchor: anchorOf(o.cashBal) || a.anchor || null}));
  if (o.t212) upsert(a => /trading ?212/i.test(a.name), () => ({name: "Trading 212", kind: "invest", match: "trading 212, trading212"}));
  if (o.loan && (o.loanName || o.loanPayee)) upsert(a => a.kind === "loan" && a.name === (o.loanName || "Paskola"), a => ({name: o.loanName || "Paskola", kind: "loan", match: o.loanPayee.toLowerCase(), anchor: anchorOf(o.loanDebt, true) || a.anchor || null, original: a.original || null}));
  S.cfg.accounts = accs; saveSettings("accounts");
  o.step = 2;
}
function obFinish() {
  S.cfg.prefs = {...(S.cfg.prefs || {}), onboarded: true}; saveSettings("prefs");
  S.ob = null; go("overview");
  if (typeof maybeTour === "function") setTimeout(maybeTour, 400);
}
