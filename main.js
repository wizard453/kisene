/* Kišenė: prisijungimas, atvaizdavimas, įvykiai ir paleidimas. */
"use strict";

/* ---------- Prisijungimas ---------- */
function vAuth() {
  if (!CONFIGURED) return `<div><h1>Kišenė</h1><p class="lead">Programėlė dar nesujungta su duomenų baze.</p></div>
    <div class="hint">Atidaryk failą <code>config.js</code> ir įrašyk savo Supabase projekto <code>SUPABASE_URL</code> ir <code>SUPABASE_ANON_KEY</code>. Instrukcija yra faile <code>README.md</code>.</div>`;
  if (S.recovery) return `<div><h1>Kišenė</h1><p class="lead">Sukurk naują slaptažodį.</p></div>
    <form id="newPassForm"><label class="field">Naujas slaptažodis<input id="aPass" type="password" autocomplete="new-password" minlength="8" required></label>
    ${S.authErr ? `<div class="err">${esc(S.authErr)}</div>` : ""}<button class="btn wide">Išsaugoti</button></form>`;
  const login = S.authMode === "login";
  return `<div><h1>Kišenė</h1><p class="lead">Pajamos, išlaidos, investicijos ir patarimai visuose tavo įrenginiuose.</p></div>
    <form id="authForm">
      <div class="seg"><button type="button" data-am="login" aria-pressed="${login}">Prisijungti</button><button type="button" data-am="signup" aria-pressed="${!login}">Nauja paskyra</button></div>
      <label class="field">El. paštas<input id="aEmail" type="email" autocomplete="email" required></label>
      <label class="field">Slaptažodis<input id="aPass" type="password" autocomplete="${login ? "current-password" : "new-password"}" minlength="8" required></label>
      ${S.authErr ? `<div class="err">${esc(S.authErr)}</div>` : ""}
      ${S.authMsg ? `<div class="ok">${esc(S.authMsg)}</div>` : ""}
      <button class="btn wide" id="authBtn">${login ? "Prisijungti" : "Sukurti paskyrą"}</button>
      ${login ? `<button type="button" class="linkbtn" id="forgot" style="align-self:flex-start">Pamiršau slaptažodį</button>` : `<div class="fine">Slaptažodis bent 8 simbolių.</div>`}
    </form>`;
}
function authError(e) {
  const m = (e && e.message || "").toLowerCase();
  if (m.includes("invalid login")) return "Neteisingas el. paštas arba slaptažodis.";
  if (m.includes("email not confirmed")) return "Pirma patvirtink el. paštą paspaudęs nuorodą laiške.";
  if (m.includes("already registered")) return "Tokia paskyra jau yra. Prisijunk.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) return "Naujų paskyrų kūrimas išjungtas.";
  if (m.includes("password")) return "Slaptažodis per silpnas. Naudok bent 8 simbolius.";
  if (m.includes("fetch") || m.includes("network")) return "Nėra ryšio su serveriu. Patikrink internetą.";
  return e && e.message ? e.message : "Įvyko klaida. Bandyk dar kartą.";
}

/* ---------- Paskyra ir programėlė ---------- */
function vApp() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const c = S.confirm;
  return `${subHead("Paskyra ir programėlė")}
  <div class="set-group"><h3>Paskyra</h3>
    <div class="fine">Prisijungta kaip <b>${esc(S.user?.email || "")}</b>. Prisijunk ta pačia paskyra kitame įrenginyje, ir duomenys bus tie patys.</div>
    <div class="row">${c === "logout"
      ? `${S.outbox.length ? `<span class="err">Dar neišsiųsta pakeitimų: ${S.outbox.length}. Atsijungus jie dings.</span>` : ""}<button class="btn danger small" id="logoutYes">Atsijungti</button><button class="btn ghost small" data-confirm="">Atšaukti</button>`
      : `<button class="btn ghost small" data-confirm="logout">Atsijungti</button>`}</div>
  </div>
  <div class="set-group"><h3>Pranešimai</h3>
    <div class="fine">Įspėjimai apie biudžeto ribas, neįprastai dideles išlaidas, artėjančius mokėjimus ir mėnesio suvestinę. Jie visada matomi varpelyje viršuje, o įjungus ateina ir kaip telefono pranešimai.</div>
    <div class="fine">${/iphone|ipad|ipod/i.test(navigator.userAgent) ? "iPhone pranešimai veikia tik įdiegtoje programėlėje (Į pradžios ekraną). " : ""}Pranešimai tikrinami, kai programėlė atidaroma ar atnaujinami duomenys.</div>
    <div class="row">${nState().on && "Notification" in window && Notification.permission === "granted" ? `<span class="pill on">Įjungta</span><button class="btn ghost small" id="notifyOff">Išjungti</button>` : `<button class="btn small" id="notifyOn">Įjungti telefono pranešimus</button>`}</div>
  </div>
  <div class="set-group"><h3>Tavo vardas</h3>
    <label class="field">Vardas ir pavardė, kaip rodoma banko išraše<input id="ownName" value="${esc(S.cfg.prefs?.ownName || "")}" placeholder="pvz. Vardenis Pavardenis" autocomplete="name"></label>
    <div class="fine">Naudojama tik importuojant: pervedimai tau pačiam į kitus bankus atpažįstami kaip pervedimai, o ne išlaidos.</div>
  </div>
  ${!standalone ? `<div class="set-group"><h3>Įdiegti telefone</h3>
    ${S.installEvt ? `<div class="fine">Įdiek programėlę, kad ji atsidarytų kaip atskira aplikacija su savo ikona.</div><div class="row"><button class="btn small" id="installBtn">Įdiegti</button></div>`
      : ios ? `<div class="fine">Safari naršyklėje spausk „Bendrinti“ (kvadratas su rodykle aukštyn), tada „Į pradžios ekraną“.</div>`
      : `<div class="fine">Naršyklės meniu (⋮) pasirink „Įdiegti programą“ arba „Pridėti prie pradžios ekrano“.</div>`}
  </div>` : ""}
  <div class="set-group"><h3>Duomenys</h3>
    <div class="row"><button class="btn ghost small" id="exportCsv" ${!S.txs.size ? "disabled" : ""}>Eksportuoti biudžetą</button><button class="btn ghost small" id="exportInvCsv" ${!S.inv.size ? "disabled" : ""}>Eksportuoti investicijas</button></div>
    <div class="row">${c === "wipe" ? `<button class="btn danger small" id="wipeYes">Taip, ištrinti ${S.txs.size} operacijas</button><button class="btn ghost small" data-confirm="">Atšaukti</button>` : `<button class="btn ghost small" data-confirm="wipe" ${!S.txs.size ? "disabled" : ""}>Ištrinti biudžeto operacijas</button>`}
    ${c === "wipeinv" ? `<button class="btn danger small" id="wipeInvYes">Taip, ištrinti ${S.inv.size} investicijų operacijas</button><button class="btn ghost small" data-confirm="">Atšaukti</button>` : `<button class="btn ghost small" data-confirm="wipeinv" ${!S.inv.size ? "disabled" : ""}>Ištrinti investicijas</button>`}</div>
    ${S.demoDismissed && !S.txs.size ? `<button class="linkbtn" id="showDemo" style="align-self:flex-start">Rodyti pavyzdinius duomenis</button>` : ""}
    <button class="linkbtn" id="runOnboard" style="align-self:flex-start">Paleisti pradžios vedlį iš naujo</button>
    <button class="linkbtn" id="runTour" style="align-self:flex-start">Parodyti mokomąjį turą</button>
  </div>`;
}
function maybeOnboard() {
  if (S.obShown || S.ob || S.cfg.prefs?.onboarded || S.txs.size || S.inv.size) return;
  S.obShown = true; startOnboarding(); render();
}

/* ---------- Atvaizdavimas ---------- */
let renderSeq = 0;
function viewHtml() {
  if (S.tab === "overview") return vOverview();
  if (S.tab === "list") return vList();
  if (S.tab === "invest") return vInvest();
  const subs = {ai: vAI, import: vImport, accounts: vAccounts, budgets: vBudgets, cats: vCats, recurring: vRecurring, goals: vGoals, app: vApp, review: vReview, wealth: vWealthPage, year: vYear, onboard: vOnboard, look: vLook, recreview: vRecReview, help: vHelp};
  return (subs[S.sub] || vMore)();
}
async function render(fromData) {
  const signedIn = !!S.user && !S.recovery;
  $("#authScreen").hidden = signedIn; $("#appScreen").hidden = !signedIn; $("#tabs").hidden = !signedIn;
  if (!signedIn) {
    const email = $("#aEmail")?.value;
    $("#authScreen").innerHTML = vAuth();
    if (email && $("#aEmail")) $("#aEmail").value = email;
    return;
  }
  const ae = document.activeElement;
  if (fromData && ae && $("#view").contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) {
    if (S.tab === "list" && ae.id === "q") $("#listBody").innerHTML = listBody();
    return;
  }
  const thJson = JSON.stringify(S.cfg.prefs?.theme || null);
  if (thJson !== render.lastTheme) { render.lastTheme = thJson; if (S.cfg.prefs?.theme) applyTheme(S.cfg.prefs.theme); }
  const monthly = S.tab === "overview" || S.tab === "list";
  $("#monthBox").hidden = !monthly;
  $("#mLabel").textContent = ymLabel(S.ym);
  $("#mPick").value = S.ym; $("#mPick").max = ymOf(todayISO());
  $("#mNext").disabled = S.ym >= ymOf(todayISO());
  $("#pageTitle").textContent = monthly || S.tab === "more" ? "" : S.tab === "invest" ? "Investicijos" : "";
  $("#fab").hidden = false;
  $$("nav .tab").forEach(b => b.setAttribute("aria-current", b.dataset.tab === S.tab ? "page" : "false"));
  const seq = ++renderSeq;
  let html = viewHtml();
  if (html && typeof html.then === "function") html = await html;
  if (seq !== renderSeq) return;
  $("#view").innerHTML = html;
  if (S.tab === "overview") mountBars();
  if (S.tab === "invest" && !S.sub && S.invView.tab !== "market") { mountLine(valueSeries()); renderInvStatus(); }
  if (S.tab === "invest" && S.sub === "chart" && S.mkt.sym) { const c = S.mkt.charts[S.mkt.sym.symbol + "|" + S.mkt.range]; if (c?.data) mountPriceChart(c.data.points, c.data.currency, S.mkt.range); }
  if (S.tab === "invest" && S.invView.tab === "market" && !S.sub) renderMarketResults();
  if (S.tab === "more" && S.sub === "wealth") mountWealth(wealthSeries(S.wealthRange || "1y"));
  if (S.tab === "more" && S.sub === "year") { const yc = $("#yearChart"); if (yc) mountBars("#yearChart", yc.dataset.months.split(",")); }
  checkAlerts();
  renderSync();
}

/* ---------- Eksportas ---------- */
async function shareCsv(name, rows) {
  const text = "﻿" + rows.map(r => r.map(x => { x = String(x ?? ""); return /[;"\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(";")).join("\n");
  const file = new File([text], name, {type: "text/csv"});
  if (navigator.canShare && navigator.canShare({files: [file]})) {
    try { await navigator.share({files: [file], title: name}); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const dec = v => String(v).replace(".", ",");
function exportBudget() {
  const typeName = {exp: "Išlaidos", inc: "Pajamos", trf: "Pervedimas"};
  shareCsv("kisene-biudzetas-" + todayISO() + ".csv", [["Data", "Tipas", "Kategorija", "Suma", "Sąskaita", "Į sąskaitą", "Aprašymas", "Banko aprašymas"],
    ...[...S.txs.values()].sort((a, b) => a.date.localeCompare(b.date)).map(t => [t.date, typeName[t.type], t.type === "trf" ? "" : catById(t.cat).name, dec(t.type === "exp" ? -t.amount : t.amount), accName(t.account_id), t.type === "trf" ? accName(t.to_account_id) : "", t.note, t.memo])]);
}
function exportInv() {
  shareCsv("kisene-investicijos-" + todayISO() + ".csv", [["Data", "Tipas", "Platforma", "Simbolis", "Pavadinimas", "ISIN", "Kiekis", "Kaina", "Valiuta", "Suma", "Mokestis", "Suma EUR"],
    ...[...S.inv.values()].sort((a, b) => a.date.localeCompare(b.date)).map(t => [t.date, KIND_LABEL[t.kind], t.platform, t.symbol, t.name, t.isin, dec(t.qty), dec(t.price), t.currency, dec(t.amount), dec(t.fee), t.amount_eur == null ? "" : dec(t.amount_eur)])]);
}

/* ---------- Įvykiai ---------- */
function go(tab, sub) {
  S.tab = tab; S.sub = sub || null; S.confirm = null;
  if ((tab === "invest" && !sub) || sub === "wealth") refreshMarket();
  render(); window.scrollTo(0, 0);
}
document.addEventListener("click", async e => {
  const t = e.target.closest("button,[data-edit],[data-goal],[data-catfilter]"); if (!t || t.closest("#sheetRoot") || t.closest("#toastRoot")) return;
  const d = t.dataset;
  if (d.am) { S.authMode = d.am; S.authErr = ""; S.authMsg = ""; render(); return; }
  if (d.tab) { if (d.tab === "list") S.filter.cat = null; go(d.tab); return; }
  if (d.catfilter) { S.filter = {...S.filter, cat: d.catfilter, q: "", year: d.catyear || null}; go("list"); return; }
  if (d.clearcat) { S.filter.cat = null; S.filter.year = null; render(); return; }
  if (d.year) { S.year = d.year; render(); return; }
  if (d.gomonth) { S.ym = d.gomonth; resetAI(); render(); window.scrollTo(0, 0); return; }
  if (d.review && d.rcat) { applyReview(d.review, d.rcat); return; }
  if (d.keepother) { S.cfg.prefs = {...(S.cfg.prefs || {}), keepOther: [...(S.cfg.prefs?.keepOther || []), d.keepother]}; saveSettings("prefs"); render(); return; }
  if (d.cycleicon) { ensureCfg("categories"); S.cfg.categories = S.cfg.categories.map(c => { if (c.id !== d.cycleicon) return c; const cur = c.icon || CAT_ICONS[c.id] || "tag"; return {...c, icon: ICON_CHOICES[(ICON_CHOICES.indexOf(cur) + 1) % ICON_CHOICES.length]}; }); saveSettings("categories"); render(); return; }
  if (d.go) { go(d.go, d.sub); return; }
  if (d.sub !== undefined) { S.sub = d.sub || null; S.confirm = null; if (S.sub === "wealth") refreshMarket(); render(); window.scrollTo(0, 0); return; }
  if (d.confirm !== undefined) { S.confirm = d.confirm || null; render(); return; }
  if (d.edit) { const tx = allTx().find(x => x.id === d.edit); if (tx) openTxSheet(tx); return; }
  if (d.acc) { openAccSheet(accById(d.acc)); return; }
  if (d.pos) { openPosSheet(d.pos); return; }
  if (d.inv) { const x = S.inv.get(d.inv); if (x) openInvSheet(x); return; }
  if (d.ftype) { S.filter.type = d.ftype; render(); return; }
  if (d.range) { S.invView.range = d.range; render(); return; }
  if (d.invtab) { S.invView.tab = d.invtab; S.sub = null; render(); window.scrollTo(0, 0); return; }
  if (d.chart) { S.mkt.from = S.invView.tab === "market" ? "market" : "portfolio"; openChart(d.chart, d.cname, d.ctype); return; }
  if (d.mrange) { S.mkt.range = d.mrange; render(); return; }
  if (d.invback) { S.invView.tab = d.invback; S.sub = null; render(); window.scrollTo(0, 0); return; }
  if (d.wrange) { S.wealthRange = d.wrange; render(); return; }
  if (d.group) { S.invView.group = d.group; render(); return; }
  if (d.editcat) { openCatSheet(catById(d.editcat)); return; }
  if (d.newcat) { openCatSheet(null, d.newcat); return; }
  if (d.editrule) { const r = (S.cfg.rules || []).find(x => x.id === d.editrule); if (r) openRuleSheet(r); return; }
  if (d.editrec) { const r = (S.cfg.recurring || []).find(x => x.id === d.editrec); if (r) openRecSheet(r); return; }
  if (d.editgoal) { const g = (S.cfg.goals || []).find(x => x.id === d.editgoal); if (g) openGoalSheet(g); return; }
  if (d.aisuggest) { sendChat(d.aisuggest); return; }
  if (d.aiapply !== undefined) { applyPending(+d.aiapply); return; }
  if (d.aiundo !== undefined) { undoMsg(+d.aiundo); return; }
  if (d.airetry !== undefined) { retryChat(+d.airetry); return; }
  if (d.aidiscard !== undefined) { const m = S.ai.chat[+d.aidiscard]; if (m) { m.pending = null; m.acts = m.acts.map(a => ({...a, state: "undone"})); saveChat(); render(); } return; }
  if (d.laymove) { moveSection(d.laymove, +d.dir); return; }
  if (d.thmode) { setTheme({mode: d.thmode}); return; }
  if (d.thbg) { setTheme({bg: d.thbg}); return; }
  if (d.thacc) { setTheme({accent: d.thacc}); return; }
  if (d.thfont) { setTheme({font: d.thfont}); return; }
  if (d.morelayout) { S.cfg.prefs = {...(S.cfg.prefs || {}), moreLayout: d.morelayout}; saveSettings("prefs"); render(); return; }
  if (d.cyclecolor) { ensureCfg("categories"); S.cfg.categories = S.cfg.categories.map(c => c.id === d.cyclecolor ? {...c, color: SWATCHES[(SWATCHES.indexOf(c.color) + 1) % SWATCHES.length]} : c); saveSettings("categories"); render(); return; }
  if (d.archcat) { ensureCfg("categories"); S.cfg.categories = S.cfg.categories.map(c => c.id === d.archcat ? {...c, archived: true} : c); saveSettings("categories"); render(); return; }
  if (d.unarch) { ensureCfg("categories"); S.cfg.categories = S.cfg.categories.map(c => c.id === d.unarch ? {...c, archived: false} : c); saveSettings("categories"); render(); return; }
  if (d.delrule) { const prev = S.cfg.rules || []; S.cfg.rules = prev.filter(r => r.id !== d.delrule); saveSettings("rules"); render(); toast("Taisyklė pašalinta", () => { S.cfg.rules = prev; saveSettings("rules"); render(); }); return; }
  if (d.togglerec) { S.cfg.recurring = (S.cfg.recurring || []).map(r => r.id === d.togglerec ? {...r, active: !r.active, last: r.active ? r.last : (r.last && r.last < ymOf(todayISO()) ? addMonths(ymOf(todayISO()), -1) : r.last)} : r); saveSettings("recurring"); render(); generateRecurring(); return; }
  if (d.delrec) { const prev = S.cfg.recurring || []; S.cfg.recurring = prev.filter(r => r.id !== d.delrec); saveSettings("recurring"); render(); toast("Pasikartojanti operacija pašalinta", () => { S.cfg.recurring = prev; saveSettings("recurring"); render(); }); return; }
  if (d.delgoal) { const prev = S.cfg.goals || []; S.cfg.goals = prev.filter(g => g.id !== d.delgoal); saveSettings("goals"); render(); toast("Tikslas pašalintas", () => { S.cfg.goals = prev; saveSettings("goals"); render(); }); return; }
  if (d.goalsub) { const f = t.closest("form"); goalAdd(d.goalsub, -(parseNum(f.amt.value) || 0)); return; }
  switch (t.id) {
    case "fab": if (S.tab === "invest") openInvSheet(null); else openTxSheet(null); break;
    case "mPrev": S.ym = addMonths(S.ym, -1); resetAI(); render(); break;
    case "mNext": if (S.ym < ymOf(todayISO())) { S.ym = addMonths(S.ym, 1); resetAI(); render(); } break;
    case "hideDemo": S.demoDismissed = true; refreshDemo(); saveSettings("demo_dismissed"); render(); break;
    case "showDemo": S.demoDismissed = false; refreshDemo(); saveSettings("demo_dismissed"); go("overview"); break;
    case "aiClear": S.ai.chat = []; saveChat(); render(); break;
    case "aiStop": if (S.ai.ctrl) S.ai.ctrl.abort(); break;
    case "doImport": doBankImport(); break;
    case "impCancel": S.imp = null; if (S.ob) { S.sub = "onboard"; S.ob.step = 2; } render(); break;
    case "addAcc": openAccSheet(null); break;
    case "addLoan": openAccSheet(null, "loan"); break;
    case "watchBtn": toggleWatch(S.mkt.sym); render(); break;
    case "chartAddInv": { const c = S.mkt.charts[S.mkt.sym.symbol + "|" + S.mkt.range]?.data; openInvSheet(null, {symbol: S.mkt.sym.symbol.replace(/\..*$/, "").replace(/-EUR$|-USD$/, ""), name: c?.name || S.mkt.sym.name, currency: c?.currency, price: c?.price}); break; }
    case "brkConnect": case "brkMenu": openBrokerSheet(); break;
    case "brkSync": brokerSync(false); break;
    case "bellBtn": openAlerts(); break;
    case "notifyOn": enableNotifications(true); break;
    case "notifyOff": enableNotifications(false); break;
    case "exportYear": exportYear(); break;
    case "runOnboard": startOnboarding(); render(); window.scrollTo(0, 0); break;
    case "runTour": startTour(); break;
    case "obSkip": obFinish(); break;
    case "obNext2": S.ob.step = 3; render(); window.scrollTo(0, 0); break;
    case "obNext3": S.ob.step = 4; render(); window.scrollTo(0, 0); break;
    case "obBack": S.ob.step = Math.max(1, S.ob.step - 1); render(); break;
    case "obDone": obFinish(); break;
    case "addRec": openRecSheet(null); break;
    case "addRule": openRuleSheet(null); break;
    case "rrvSave": saveRecReview(); break;
    case "rrvSkip": finishRecReview(); break;
    case "recDetect": { const since = addDays(todayISO(), -45); S.recReview = prepareRecReview([...S.txs.values()].filter(t => t.date >= since), null); S.sub = "recreview"; render(); window.scrollTo(0, 0); break; }
    case "addGoal": openGoalSheet(null); break;
    case "layReset": saveLayout([]); render(); break;
    case "thReset": S.cfg.prefs = {...(S.cfg.prefs || {}), theme: {}, moreLayout: "list"}; saveSettings("prefs"); applyTheme({}); render(); break;
    case "addInv": openInvSheet(null); break;
    case "refreshPrices": S.market.histAt = 0; refreshMarket(true); break;
    case "doInvImport": doInvImport(); break;
    case "invImpCancel": S.invImp = null; render(); break;
    case "exportCsv": exportBudget(); break;
    case "exportInvCsv": exportInv(); break;
    case "wipeYes": S.txs.clear(); S.confirm = null; enqueue({kind: "wipe", table: "transactions"}); refreshDemo(); render(); toast("Biudžeto operacijos ištrintos"); break;
    case "wipeInvYes": S.inv.clear(); S.confirm = null; enqueue({kind: "wipe", table: "inv_tx"}); render(); toast("Investicijų operacijos ištrintos"); break;
    case "logoutYes": await signOut(); break;
    case "installBtn": if (S.installEvt) { S.installEvt.prompt(); await S.installEvt.userChoice.catch(() => {}); S.installEvt = null; render(); } break;
    case "forgot": {
      const email = $("#aEmail").value.trim();
      if (!email) { S.authErr = "Įrašyk el. paštą, ir atsiųsime nuorodą slaptažodžiui atkurti."; render(); break; }
      const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname});
      S.authErr = error ? authError(error) : ""; S.authMsg = error ? "" : "Išsiuntėme laišką su nuoroda slaptažodžiui atkurti."; render(); break;
    }
  }
});
function goalAdd(id, delta) {
  if (!delta) { toast("Įrašyk sumą"); return; }
  S.cfg.goals = (S.cfg.goals || []).map(g => g.id === id ? {...g, saved: r2(Math.max(0, g.saved + delta))} : g);
  saveSettings("goals"); render(); toast(delta > 0 ? "Įnešta" : "Išimta");
}
document.addEventListener("submit", async e => {
  const f = e.target; if (f.closest("#sheetRoot")) return;
  e.preventDefault();
  if (f.id === "mktForm") { $("#mktQ")?.blur(); marketSearch($("#mktQ").value); return; }
  if (f.id === "chatForm") { const i = $("#chatIn"); const q = i.value.trim(); if (q) { i.value = ""; sendChat(q); } return; }
  if (f.dataset.goalform) { goalAdd(f.dataset.goalform, parseNum(f.amt.value) || 0); return; }
  if (f.id === "obForm1") { obSaveStep1(); render(); window.scrollTo(0, 0); return; }
  if (f.id === "obForm3") {
    const b = {...S.cfg.budgets};
    $$("[data-obb]").forEach(cb => { const v = parseNum($("#obb_" + cb.dataset.obb).value); if (cb.checked && v > 0) b[cb.dataset.obb] = r2(v); });
    S.cfg.budgets = b; saveSettings("budgets"); S.ob.step = 4; render(); window.scrollTo(0, 0); return;
  }
  if (f.id === "addGoalForm") {
    const target = parseNum($("#ngTarget").value);
    if (!(target > 0)) { toast("Įrašyk tikslo sumą"); return; }
    S.cfg.goals = [...(S.cfg.goals || []), {id: shortId(), name: $("#ngName").value.trim(), target: r2(target), saved: r2(Math.max(0, parseNum($("#ngSaved").value) || 0)), deadline: $("#ngDeadline").value || null, color: SWATCHES[(S.cfg.goals || []).length % 8]}];
    saveSettings("goals"); render(); toast("Tikslas sukurtas"); return;
  }
  if (f.id === "addCatForm") {
    const name = $("#ncName").value.trim(); if (!name) return;
    ensureCfg("categories");
    const used = S.cfg.categories.map(c => c.color);
    S.cfg.categories = [...S.cfg.categories, {id: "c_" + shortId(), name, type: $("#ncType").value, color: SWATCHES.find(s => !used.includes(s)) || SWATCHES[S.cfg.categories.length % SWATCHES.length]}];
    saveSettings("categories"); render(); toast("Kategorija pridėta"); return;
  }
  if (f.id === "addRuleForm") {
    const pattern = $("#nrText").value.trim().toLowerCase(); if (!pattern) return;
    const [type, v] = $("#nrCat").value.split(":");
    const rule = type === "trf" ? {id: shortId(), pattern, type, cat: "transfer", to_account_id: v || null} : {id: shortId(), pattern, type, cat: v};
    S.cfg.rules = [rule, ...(S.cfg.rules || []).filter(r => r.pattern !== pattern)];
    saveSettings("rules"); render(); toast("Taisyklė pridėta"); return;
  }
  if (f.id === "authForm") {
    const email = $("#aEmail").value.trim(), password = $("#aPass").value;
    $("#authBtn").disabled = true; S.authErr = ""; S.authMsg = "";
    if (S.authMode === "login") {
      const {error} = await sb.auth.signInWithPassword({email, password});
      if (error) { S.authErr = authError(error); render(); }
    } else {
      const {data, error} = await sb.auth.signUp({email, password, options: {emailRedirectTo: location.origin + location.pathname}});
      if (error) S.authErr = authError(error);
      else if (!data.session) { S.authMsg = "Paskyra sukurta. Patvirtink el. paštą paspaudęs nuorodą laiške, tada prisijunk."; S.authMode = "login"; }
      render();
    }
    return;
  }
  if (f.id === "newPassForm") {
    const {error} = await sb.auth.updateUser({password: $("#aPass").value});
    if (error) { S.authErr = authError(error); render(); return; }
    S.recovery = false; S.authErr = ""; toast("Slaptažodis pakeistas");
    const {data} = await sb.auth.getSession(); if (data.session) startSession(data.session.user); else render();
  }
});
const nameTimers = {};
document.addEventListener("input", e => {
  const el = e.target; if (el.closest("#sheetRoot")) return;
  if (el.id === "q") { S.filter.q = el.value; $("#listBody").innerHTML = listBody(); return; }
  if (el.id === "mktQ") { marketSearch(el.value); return; }
  if (el.id === "chatIn") { el.style.height = "auto"; el.style.height = Math.min(120, el.scrollHeight) + "px"; return; }
  if (el.dataset.bud) {
    const v = parseNum(el.value); ensureCfg("budgets");
    if (v > 0) S.cfg.budgets = {...S.cfg.budgets, [el.dataset.bud]: r2(v)}; else { const b = {...S.cfg.budgets}; delete b[el.dataset.bud]; S.cfg.budgets = b; }
    saveSettings("budgets", 700); return;
  }
  if (el.dataset.catname) {
    const id = el.dataset.catname, val = el.value.trim(); if (!val) return;
    ensureCfg("categories"); S.cfg.categories = S.cfg.categories.map(c => c.id === id ? {...c, name: val.slice(0, 40)} : c);
    saveSettings("categories", 800); return;
  }
  if (el.id === "ownName") { S.cfg.prefs = {...(S.cfg.prefs || {}), ownName: el.value.trim()}; saveSettings("prefs", 800); }
});
document.addEventListener("change", async e => {
  const el = e.target; if (el.closest("#sheetRoot")) return;
  if (el.id === "bankFile" && el.files[0]) {
    const f = el.files[0]; const imp = bankSetup(f.name, await readFileText(f));
    if (!imp) { toast("Faile nerasta eilučių"); return; }
    imp.account_id = $("#impAcc")?.value || "main"; S.imp = imp; render(); return;
  }
  if (el.dataset.rrv !== undefined && S.recReview) { const it = S.recReview.items[+el.dataset.rrv]; it.checked = el.checked; el.closest(".rrv").classList.toggle("off", !el.checked); return; }
  if (el.dataset.laytoggle) { toggleSection(el.dataset.laytoggle); return; }
  if (el.id === "aiAuto") { S.cfg.prefs = {...(S.cfg.prefs || {}), aiAuto: el.checked}; saveSettings("prefs"); render(); return; }
  if (el.id === "heroAvg") { S.cfg.prefs = {...(S.cfg.prefs || {}), heroAvg: el.checked}; saveSettings("prefs"); return; }
  if (el.id === "obLoan") { const box = $(".ob-loan"); if (box) box.hidden = !el.checked; return; }
  if (el.id === "obFile" && el.files[0]) {
    const f = el.files[0]; const imp = bankSetup(f.name, await readFileText(f));
    if (!imp) { toast("Faile nerasta eilučių"); return; }
    imp.account_id = "main"; S.imp = imp; S.sub = "import"; render(); window.scrollTo(0, 0); return;
  }
  if (el.id === "invFile" && el.files[0]) {
    const f = el.files[0]; const imp = invSetup(f.name, await readFileText(f));
    if (!imp) { toast("Faile nerasta eilučių"); return; }
    S.invImp = imp; render(); return;
  }
  if (el.id === "impAcc" && S.imp) { S.imp.account_id = el.value; S.imp.overrides = {}; render(); return; }
  if (el.id === "impLearn" && S.imp) { S.imp.learn = el.checked; return; }
  if (el.id === "impBal" && S.imp) { S.imp.setBalance = el.checked; return; }
  if (el.id === "invPlat" && S.invImp) { S.invImp.platform = el.value.trim(); render(); return; }
  if (el.dataset.map) {
    const target = el.id.startsWith("bm_") ? S.imp : S.invImp;
    if (target) { target.map[el.dataset.map] = +el.value; if (el.dataset.map === "fee" && target.map.feeCols) target.map.feeCols = null; render(); }
    return;
  }
  if (el.dataset.choice && S.imp) { bankOverride(el.dataset.choice, el.value); render(); return; }
  if (el.dataset.reviewsel && el.value) { applyReview(el.dataset.reviewsel, el.value); return; }
  if (el.id === "mPick" && el.value) { const v = el.value > ymOf(todayISO()) ? ymOf(todayISO()) : el.value; if (v !== S.ym) { S.ym = v; resetAI(); render(); } return; }
  if (el.id === "fAcc") { S.filter.acc = el.value; $("#listBody").innerHTML = listBody(); return; }
});
/* Perbraukimas: turinyje keičia skiltis, ant mėnesio juostos keičia mėnesį */
const TAB_ORDER = ["overview", "list", "invest", "more"];
let swipe = null;
function hScrollable(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2) { const ox = getComputedStyle(n).overflowX; if (ox === "auto" || ox === "scroll") return true; }
  }
  return false;
}
document.addEventListener("touchstart", e => {
  swipe = null;
  if (e.touches.length !== 1 || !S.user || tourActive()) return;
  const t = e.target;
  if (t.closest("#sheetRoot,#tourRoot,#tabs,input,select,textarea,.chart,[data-noswipe]") || hScrollable(t)) return;
  const mode = t.closest("#monthBox") ? "month" : $("#appScreen").contains(t) ? "tab" : null;
  if (mode) swipe = {mode, x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now()};
}, {passive: true});
document.addEventListener("touchend", e => {
  if (!swipe) return;
  const sw = swipe; swipe = null;
  const dx = e.changedTouches[0].clientX - sw.x, dy = e.changedTouches[0].clientY - sw.y;
  if (!(Math.abs(dx) > 60 && Math.abs(dx) > 1.8 * Math.abs(dy) && Date.now() - sw.t < 700)) return;
  const v = $("#view"), anim = cls => { v.classList.remove("slide-l", "slide-r"); void v.offsetWidth; v.classList.add(cls); };
  if (sw.mode === "month") {
    const next = dx < 0 ? addMonths(S.ym, 1) : addMonths(S.ym, -1);
    if (next > ymOf(todayISO())) return;
    S.ym = next; resetAI(); anim(dx < 0 ? "slide-l" : "slide-r"); render(); return;
  }
  if (S.sub) {
    if (dx < 0 || S.sub === "onboard" || S.sub === "recreview") return;
    if (S.tab === "invest" && S.sub === "chart") S.invView.tab = S.mkt.from === "portfolio" ? "portfolio" : "market";
    if (S.sub === "help" && S.help?.lesson) { S.help.lesson = null; anim("slide-r"); render(); window.scrollTo(0, 0); return; }
    S.sub = null; S.confirm = null; anim("slide-r"); render(); window.scrollTo(0, 0); return;
  }
  const i = TAB_ORDER.indexOf(S.tab), j = i + (dx < 0 ? 1 : -1);
  if (i < 0 || j < 0 || j >= TAB_ORDER.length) return;
  if (TAB_ORDER[j] === "list") S.filter.cat = null;
  anim(dx < 0 ? "slide-l" : "slide-r"); go(TAB_ORDER[j]);
}, {passive: true});
/* Be priartinimo ir be teksto kopijavimo */
const editable = el => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
["gesturestart", "gesturechange", "gestureend"].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), {passive: false}));
document.addEventListener("touchmove", e => { if (e.touches.length > 1) e.preventDefault(); }, {passive: false});
["copy", "cut"].forEach(ev => document.addEventListener(ev, e => { if (!editable(document.activeElement)) e.preventDefault(); }));
document.addEventListener("contextmenu", e => { if (!editable(e.target)) e.preventDefault(); });
document.addEventListener("selectstart", e => { if (!editable(e.target)) e.preventDefault(); });
document.addEventListener("dragstart", e => e.preventDefault());

/* Įkrovimo ekranas */
let splashAt = performance.now(), hiddenAt = 0;
function splashGone() { const el = $("#splash"); return !el || el.hidden || el.classList.contains("gone"); }
function hideSplash() {
  const el = $("#splash"); if (!el || el.classList.contains("gone")) return;
  setTimeout(() => {
    el.classList.add("gone");
    setTimeout(() => { if (el.classList.contains("gone")) el.hidden = true; if (typeof maybeTour === "function") maybeTour(); }, 380);
  }, Math.max(0, 3000 - (performance.now() - splashAt)));
}
function showSplash() { const el = $("#splash"); if (!el) return; el.hidden = false; el.classList.remove("gone"); splashAt = performance.now(); }
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 10 * 60 * 1000) { showSplash(); hideSplash(); }
  hiddenAt = 0;
});
document.addEventListener("keydown", e => {
  if (e.target.id === "chatIn" && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#chatForm")?.requestSubmit(); }
});
window.addEventListener("scroll", () => $("#top").classList.toggle("scrolled", window.scrollY > 4), {passive: true});
window.addEventListener("online", () => { flush(); fetchAll(); if (S.tab === "more") render(); });
window.addEventListener("offline", () => { setSync("off"); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.user) { flush(); fetchAll(); } });
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); S.installEvt = e; if (S.sub === "app") render(); });

/* ---------- Sesija ---------- */
function startSession(user) {
  if (S.user && S.user.id === user.id) return;
  S.user = user; S.txs = new Map(); S.inv = new Map(); S.cfg = blankCfg(); S.outbox = []; S.loaded = false; S.demoDismissed = false; demoCache = null;
  S.market = {quotes: {}, fx: {}, at: 0, hist: null, histAt: 0, histKey: ""};
  loadCache(); refreshDemo(); render();
  subscribe(); fetchAll(); flush();
}
async function signOut() {
  if (channel) { sb.removeChannel(channel); channel = null; }
  try { localStorage.removeItem(cacheKey()); localStorage.removeItem("kisene.market." + S.user.id); } catch (e) {}
  await sb.auth.signOut().catch(() => {});
  S.user = null; S.txs = new Map(); S.inv = new Map(); S.outbox = []; S.confirm = null; S.tab = "overview"; S.sub = null; resetAI(); S.ai.chat = null; render();
}

/* ---------- Paleidimas ---------- */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  // Nauja versija: tikrinama atidarant ir grįžtant į programėlę, o radus ją puslapis perkraunamas
  const hadController = !!navigator.serviceWorker.controller;
  let swReg = null, reloading = false;
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").then(r => { swReg = r; }).catch(() => {}));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && swReg) swReg.update().catch(() => {}); });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    const busy = $("#sheetRoot").children.length || editable(document.activeElement) || tourActive();
    if (busy) { toast("Yra nauja versija. Ji įsijungs kitą kartą atidarius programėlę."); return; }
    reloading = true; location.reload();
  });
}
render();
setTimeout(hideSplash, 5000);
if (!sb) hideSplash();
if (sb) {
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") setTimeout(hideSplash, 0);
    if (event === "PASSWORD_RECOVERY") { S.recovery = true; S.authErr = ""; render(); return; }
    if (session && session.user) setTimeout(() => startSession(session.user), 0);
    else if (event === "SIGNED_OUT") { S.user = null; render(); }
  });
}
// kiekvieną dieną po vidurnakčio sukuriam pasikartojančias operacijas
setInterval(() => { if (S.user) generateRecurring(); }, 60 * 60 * 1000);
