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

/* ---------- Profilis ---------- */
function vApp() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const c = S.confirm, u = S.user || {};
  const name = S.cfg.prefs?.ownName || "";
  const initials = (name || u.email || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  const since = u.created_at ? new Date(u.created_at) : null;
  const sinceTxt = since ? `${since.getFullYear()} m. ${MONTHS_GEN[since.getMonth()]} ${since.getDate()} d.` : "";
  const nImp = (S.cfg.prefs?.imports || []).length;
  const stat = (v, l) => `<div class="pstat"><b class="num">${v}</b><span>${l}</span></div>`;
  const pw = S.pw || {};
  return `${subHead("Profilis")}
  <section class="card pcard">
    <div class="phead"><div class="pavatar">${esc(initials)}</div>
      <div class="pid"><b>${esc(name || "Vardas nenurodytas")}</b><span>${esc(u.email || "")}</span>${sinceTxt ? `<small>Narys nuo ${sinceTxt}</small>` : ""}</div></div>
    <div class="pstats">${stat(S.txs.size, "operacijos")}${stat(S.inv.size, "investicijos")}${stat(accounts().length, "sąskaitos")}${stat(nImp, "įkelti failai")}</div>
    ${S.partner ? `<button class="tx plink" data-sub="together"><span class="dot" style="background:var(--c5)">${icon("heart", 16)}</span><div><div class="t1">Susieta su ${esc(partnerName())}</div><div class="t2">Bendra paskyra</div></div><span class="chev">›</span></button>` : ""}
  </section>
  <div class="set-group"><h3>Asmeninė informacija</h3>
    <label class="field">Vardas ir pavardė, kaip rodoma banko išraše<input id="ownName" value="${esc(name)}" placeholder="pvz. Vardenis Pavardenis" autocomplete="name"></label>
    <div class="fine">Naudojama importuojant: pervedimai tau pačiam į kitus bankus atpažįstami kaip pervedimai, o ne išlaidos.</div>
    <label class="field">El. paštas<input value="${esc(u.email || "")}" disabled></label>
  </div>
  <div class="set-group"><h3>Slaptažodis</h3>
    ${pw.open ? `<form id="pwForm" class="pwform">
      <label class="field">Naujas slaptažodis<input type="password" name="p1" autocomplete="new-password" minlength="6" required></label>
      <label class="field">Pakartok slaptažodį<input type="password" name="p2" autocomplete="new-password" minlength="6" required></label>
      ${pw.err ? `<div class="err">${esc(pw.err)}</div>` : ""}
      <div class="row"><button class="btn small" ${pw.busy ? "disabled" : ""}>${pw.busy ? "Keičiama…" : "Išsaugoti"}</button><button type="button" class="btn ghost small" id="pwCancel">Atšaukti</button></div></form>`
    : `<div class="row"><button class="btn ghost small" id="pwOpen">Keisti slaptažodį</button></div>`}
  </div>
  <div class="set-group"><h3>Pranešimai</h3>
    <div class="fine">Įspėjimai apie biudžeto ribas, neįprastai dideles išlaidas, artėjančius mokėjimus ir mėnesio suvestinę. Jie visada matomi varpelyje viršuje, o įjungus ateina ir kaip telefono pranešimai.</div>
    <div class="fine">${ios ? "iPhone pranešimai veikia tik įdiegtoje programėlėje (Į pradžios ekraną). " : ""}Pranešimai tikrinami, kai programėlė atidaroma ar atnaujinami duomenys.</div>
    <div class="row">${nState().on && "Notification" in window && Notification.permission === "granted" ? `<span class="pill on">Įjungta</span><button class="btn ghost small" id="notifyOff">Išjungti</button>` : `<button class="btn small" id="notifyOn">Įjungti telefono pranešimus</button>`}</div>
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
  </div>
  <div class="set-group"><h3>Prisijungimas</h3>
    <div class="fine">Prisijunk ta pačia paskyra kitame įrenginyje, ir duomenys bus tie patys.</div>
    <div class="row">${c === "logout"
      ? `${S.outbox.length ? `<span class="err">Dar neišsiųsta pakeitimų: ${S.outbox.length}. Atsijungus jie dings.</span>` : ""}<button class="btn danger small" id="logoutYes">Atsijungti</button><button class="btn ghost small" data-confirm="">Atšaukti</button>`
      : `<button class="btn ghost small" data-confirm="logout">Atsijungti</button>`}</div>
  </div>
  <div class="set-group danger-zone"><h3>Pavojinga zona</h3>
    <div class="dz-item"><div><b>Atstatyti programėlę</b><div class="fine">Ištrinamos visos operacijos, investicijos, įkelti failai, biudžetai, tikslai, sąskaitos ir nustatymai. Paskyra lieka, o programėlė vėl rodo nulius. Atšaukti negalima.</div></div>
      ${c === "reset" ? confirmWord("resetYes", "Atstatyti viską") : `<button class="btn ghost small dz-btn" data-confirm="reset">Atstatyti programėlę</button>`}</div>
    <div class="dz-item"><div><b>Ištrinti profilį</b><div class="fine">Paskyra ir visi jos duomenys ištrinami visam laikui. Jei susieta su partneriu, ryšys nutraukiamas. Šiuo el. paštu vėliau galėsi užsiregistruoti iš naujo.</div></div>
      ${c === "delacc" ? confirmWord("delAccYes", "Ištrinti profilį") : `<button class="btn danger small dz-btn" data-confirm="delacc">Ištrinti profilį</button>`}</div>
    ${S.dzErr ? `<div class="err">${esc(S.dzErr)}</div>` : ""}
  </div>`;
}
// Negrįžtamiems veiksmams reikia įrašyti žodį, kad nebūtų paspausta netyčia
const CONFIRM_WORD = "TRINTI";
function confirmWord(id, label) {
  return `<div class="dz-confirm"><label class="field">Patvirtinimui įrašyk <b>${CONFIRM_WORD}</b><input id="dzWord" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
    <div class="row"><button class="btn danger small" id="${id}" disabled>${S.dzBusy ? "Vykdoma…" : label}</button><button class="btn ghost small" data-confirm="">Atšaukti</button></div></div>`;
}
const PROFILE_FIELDS = ["budgets", "categories", "rules", "accounts", "recurring", "goals", "assets", "prefs"];
// Visų duomenų ištrynimas serveryje. Pirmiausia per serverio funkciją, o jei jos dar nėra, tiesiogiai iš lentelių.
async function serverReset() {
  const {error} = await sb.rpc("reset_my_data");
  if (!error) return;
  if (!/reset_my_data|PGRST202|404/i.test(error.message + error.code)) throw error;
  const uid = S.user.id;
  for (const t of ["transactions", "inv_tx", "settings"]) {
    const r = await sb.from(t).delete().eq("user_id", uid); if (r.error) throw r.error;
  }
  await sb.from("shared_goal_entries").delete().eq("user_id", uid).then(() => {}, () => {});
}
async function resetApp() {
  S.dzBusy = true; S.dzErr = ""; render();
  try {
    if (!S.demo || S.txs.size || S.inv.size) { S.outbox = []; await serverReset(); }
    S.txs = new Map(); S.inv = new Map(); S.outbox = [];
    const theme = S.cfg.prefs?.theme;
    S.cfg = blankCfg(); S.cfg.prefs = {onboarded: true, tourDone: true, budHistV: 2, budgetHist: [{from: BUD0, b: {}}], ...(theme ? {theme} : {})};
    S.demoDismissed = true;
    try { localStorage.removeItem("kisene.market." + S.user.id); } catch (e) {}
    enqueue({kind: "settings", fields: [...PROFILE_FIELDS, "demo_dismissed"]});
    S.dzBusy = false; S.confirm = null; resetAI(); refreshDemo();
    S.tab = "overview"; S.sub = null; S.ym = ymOf(todayISO());
    render(); window.scrollTo(0, 0); toast("Programėlė atstatyta");
  } catch (e) {
    S.dzBusy = false; S.dzErr = "Nepavyko ištrinti duomenų: " + (e.message || e) + ". Patikrink interneto ryšį ir bandyk dar kartą."; render();
  }
}
async function deleteAccount() {
  S.dzBusy = true; S.dzErr = ""; render();
  const {error} = await sb.rpc("delete_my_account");
  if (error) {
    S.dzBusy = false;
    S.dzErr = /delete_my_account|PGRST202|404/i.test(error.message + error.code)
      ? "Profilio trynimas dar neįjungtas serveryje: Supabase SQL editor reikia paleisti profilio SQL kodą."
      : "Nepavyko ištrinti profilio: " + error.message;
    render(); return;
  }
  S.outbox = []; S.dzBusy = false; S.confirm = null;
  try { localStorage.removeItem(cacheKey()); } catch (e) {}
  await signOut();
  toast("Profilis ištrintas");
}
function maybeOnboard() {
  if (S.obShown || S.ob || S.cfg.prefs?.onboarded || S.txs.size || S.inv.size) return;
  S.obShown = true; startOnboarding(); render();
}

/* ---------- Naršymo istorija: „atgal“ grąžina į ankstesnį langą ---------- */
// Kiekvienas langas aprašomas skiltimi, polapiu ir jų būsena. Istorija sujungta su telefono „atgal“ mygtuku.
const NAV_TRANSIENT = ["onboard", "recreview"];
let navCur = null, navStack = [], navRestoring = false, navIgnorePop = 0;
function navSnap() {
  const L = S.tab === "list";
  return {tab: S.tab, sub: S.sub || null, inv: S.invView?.tab || null, lesson: S.help?.lesson || null, cat: L && S.filter.cat || null, year: L && S.filter.year || null,
    imp: L && S.filter.imp || null, sym: S.sub === "chart" ? S.mkt?.sym || null : null, scroll: 0};
}
const navKey = n => n ? JSON.stringify({...n, scroll: 0, inv: n.tab === "invest" ? n.inv : null, sym: n.sym?.symbol || null}) : "";
function navTrack() {
  const snap = navSnap();
  if (!navCur) { navCur = snap; return; }
  if (navKey(snap) === navKey(navCur)) return;
  if (navRestoring || (typeof tourActive === "function" && tourActive())) { navCur = snap; return; }
  // pagrindiniai 4 langai yra vienas lygis: tarp jų istorija nekaupiama
  if (navIsTop(snap)) {
    if (navStack.length) { navIgnorePop++; history.go(-navStack.length); navStack = []; }
    navCur = snap; return;
  }
  const top = navStack[navStack.length - 1];
  if (top && navKey(top) === navKey(snap)) {
    // paspaustas „‹ atgal“ mygtukas: tai tas pats, kas grįžti istorijoje
    navStack.pop(); navIgnorePop++; history.back();
    const sc = top.scroll; setTimeout(() => window.scrollTo(0, sc), 0);
  } else if (!NAV_TRANSIENT.includes(navCur.sub)) {
    navStack.push(navCur); if (navStack.length > 60) navStack.shift();
    history.pushState({kisene: navStack.length}, "");
  }
  navCur = snap;
}
const navIsTop = n => !n.sub && !n.cat && !n.imp;
function navApply(n) {
  S.tab = n.tab; S.sub = n.sub; S.confirm = null;
  if (n.inv && S.invView) S.invView.tab = n.inv;
  if (S.help) S.help.lesson = n.lesson;
  S.filter = {...S.filter, cat: n.cat, year: n.year, imp: n.imp};
  if (n.sym) S.mkt.sym = n.sym;
}
let navBackAt = 0;
function navBack() {
  if (Date.now() - navBackAt < 300) return true;
  navBackAt = Date.now();
  if (navStack.length) { history.back(); return true; }
  // istorijos nėra: grįžtam pagal hierarchiją
  if (S.sub && NAV_TRANSIENT.includes(S.sub)) return false;
  if (S.sub === "help" && S.help?.lesson) { S.help.lesson = null; }
  else if (S.sub) { if (S.tab === "invest" && S.sub === "chart") S.invView.tab = S.mkt.from === "portfolio" ? "portfolio" : "market"; S.sub = null; }
  else if (S.filter.imp || S.filter.cat) { S.filter = {...S.filter, imp: null, cat: null, year: null}; }
  else if (S.tab !== "overview") { const i = TAB_ORDER.indexOf(S.tab); S.tab = TAB_ORDER[Math.max(0, i - 1)]; }
  else return false;
  S.confirm = null; navRestoring = true; render(); navRestoring = false; window.scrollTo(0, 0); return true;
}
let navPopAt = 0;
window.addEventListener("popstate", () => {
  if (navIgnorePop) { navIgnorePop--; return; }
  // du „atgal“ tuo pačiu gestu (programėlės ir telefono): antrąjį atšaukiam
  if (Date.now() - navPopAt < 250) { history.pushState({kisene: navStack.length + 1}, ""); return; }
  navPopAt = Date.now();
  const prev = navStack.pop(); if (!prev) return;
  $("#sheetRoot").innerHTML = "";
  navApply(prev); navRestoring = true; render(); navRestoring = false;
  const v = $("#view"); v.classList.remove("slide-l", "slide-r"); void v.offsetWidth; v.classList.add("slide-r");
  setTimeout(() => window.scrollTo(0, prev.scroll || 0), 0);
});
window.addEventListener("scroll", () => { if (navCur) navCur.scroll = window.scrollY; }, {passive: true});

/* ---------- Atvaizdavimas ---------- */
let renderSeq = 0;
function viewHtml() {
  if (S.tab === "overview") return vOverview();
  if (S.tab === "list") return vList();
  if (S.tab === "invest") return vInvest();
  const subs = {ai: vAI, aicats: vAiCats, import: vImport, invimport: vInvImport, accounts: vAccounts, budgets: vBudgets, cats: vCats, recurring: vRecurring, goals: vGoals, app: vApp, review: vReview, wealth: vWealthPage, year: vYear, onboard: vOnboard, look: vLook, recreview: vRecReview, help: vHelp, together: vTogether, spendtrend: () => vTrend("exp"), inctrend: () => vTrend("inc")};
  return (subs[S.sub] || vMore)();
}
async function render(fromData) {
  if (S.loaded && S.cfg) ensureBudHist();
  const signedIn = !!S.user && !S.recovery;
  $("#authScreen").hidden = signedIn; $("#appScreen").hidden = !signedIn; $("#tabs").hidden = !signedIn;
  if (!signedIn) {
    const email = $("#aEmail")?.value;
    $("#authScreen").innerHTML = vAuth();
    if (email && $("#aEmail")) $("#aEmail").value = email;
    return;
  }
  navTrack();
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
  if (S.tab === "invest" && S.sub === "chart" && S.mkt.sym) { const c = S.mkt.charts[S.mkt.sym.symbol + "|" + S.mkt.range]; if (c?.data) mountPriceChart(c.data, S.mkt.range); }
  if (S.tab === "invest" && S.invView.tab === "market" && !S.sub) renderMarketResults();
  if (S.tab === "more" && (S.sub === "spendtrend" || S.sub === "inctrend") && S.trend._m) mountTrendChart(S.trend._m, S.trend._v);
  if (S.tab === "more" && S.sub === "wealth") mountWealth(wealthSeries(S.wealthRangeEff || S.wealthRange || "all"));
  if (S.tab === "more" && S.sub === "year") { const yc = $("#yearChart"); if (yc) mountBars("#yearChart", yc.dataset.months.split(",")); }
  checkAlerts();
  renderSync();
}

/* ---------- Mėnesio pasirinkimas ---------- */
function openMonthSheet() {
  const now = ymOf(todayISO()), curY = +now.slice(0, 4);
  // kiekvieno mėnesio išlaidos, kad būtų matyti, kur yra duomenų
  const spent = {};
  for (const t of allTx()) if (t.type === "exp") { const m = ymOf(t.date); spent[m] = (spent[m] || 0) + t.amount; }
  const has = {}; for (const t of allTx()) has[ymOf(t.date)] = true;
  const years = Object.keys(has).map(m => +m.slice(0, 4));
  const minY = Math.min(curY - 1, ...years);
  let year = +S.ym.slice(0, 4);
  const root = $("#sheetRoot"); const close = () => { root.innerHTML = ""; };
  const draw = () => {
    const cells = MONTHS.map((n, i) => {
      const ym = year + "-" + String(i + 1).padStart(2, "0"), fut = ym > now, sel = ym === S.ym;
      return `<button type="button" class="mcell${sel ? " sel" : ""}${ym === now ? " now" : ""}${has[ym] ? " has" : ""}" data-pickym="${ym}" ${fut ? "disabled" : ""}>
        <b>${MSHORT[i]}</b><small class="num">${spent[ym] ? "−" + eur0(spent[ym]) : fut ? "" : "—"}</small></button>`;
    }).join("");
    root.innerHTML = `<div class="sheet-bg" id="sheetBg"><div class="sheet msheet" role="dialog" aria-modal="true" aria-label="Pasirinkti mėnesį">
      <div class="grab"></div>
      <div class="my-head"><button type="button" class="my-nav" data-yr="-1" ${year <= minY ? "disabled" : ""} aria-label="Ankstesni metai">‹</button>
        <h3 class="sheet-h">${year}</h3>
        <button type="button" class="my-nav" data-yr="1" ${year >= curY ? "disabled" : ""} aria-label="Kiti metai">›</button></div>
      <div class="mgrid">${cells}</div>
      <div class="row msheet-foot">${S.ym !== now ? `<button type="button" class="btn ghost small" data-pickym="${now}">Šis mėnuo</button>` : ""}<button type="button" class="btn small" id="mClose">Uždaryti</button></div>
    </div></div>`;
  };
  draw();
  root.onclick = e => {
    if (e.target.id === "sheetBg" || e.target.id === "mClose") { close(); root.onclick = null; return; }
    const y = e.target.closest("[data-yr]"); if (y && !y.disabled) { year += +y.dataset.yr; draw(); return; }
    const m = e.target.closest("[data-pickym]"); if (m && !m.disabled) {
      const v = m.dataset.pickym; close(); root.onclick = null;
      if (v !== S.ym) { const v0 = S.ym; S.ym = v; resetAI(); const vw = $("#view"); vw.classList.remove("slide-l", "slide-r"); void vw.offsetWidth; vw.classList.add(v > v0 ? "slide-l" : "slide-r"); render(); }
    }
  };
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
  // kategorijos ar failo filtras galioja tik operacijų sąraše
  if (tab !== "list") S.filter = {...S.filter, cat: null, imp: null, year: null};
  if ((tab === "invest" && !sub) || sub === "wealth") refreshMarket();
  render(); window.scrollTo(0, 0);
}
document.addEventListener("click", async e => {
  const t = e.target.closest("button,[data-edit],[data-goal],[data-catfilter]"); if (!t || t.closest("#sheetRoot") || t.closest("#toastRoot")) return;
  const d = t.dataset;
  if (d.am) { S.authMode = d.am; S.authErr = ""; S.authMsg = ""; render(); return; }
  if (d.tab) { S.filter = {...S.filter, cat: null, imp: null, year: null}; go(d.tab); return; }
  if (d.catfilter) { S.filter = {...S.filter, cat: d.catfilter, q: "", year: d.catyear || null}; go("list"); return; }
  if (d.clearimp) { S.filter.imp = null; render(); return; }
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
  if (d.cstyle) { S.cfg.prefs = {...(S.cfg.prefs || {}), chartStyle: d.cstyle}; saveSettings("prefs"); render(); if (S.tab === "invest" && S.invView.tab === "market" && !S.sub) renderMarketResults(); return; }
  if (d.wrange2) { S.cfg.prefs = {...(S.cfg.prefs || {}), watchRange: d.wrange2}; saveSettings("prefs"); render(); renderMarketResults(); return; }
  if (d.invback) { S.invView.tab = d.invback; S.sub = null; render(); window.scrollTo(0, 0); return; }
  if (d.wrange) { S.wealthRange = d.wrange; render(); return; }
  if (d.wtoggle) { const h = S.wealthHidden || []; S.wealthHidden = h.includes(d.wtoggle) ? h.filter(x => x !== d.wtoggle) : [...h, d.wtoggle]; render(); return; }
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
  if (d.rrvadd && S.recReview) {
    const c = (S.recReview.all || []).find(x => x.key === d.rrvadd); if (!c) return;
    S.recReview.items.push({id: "new:" + c.key, existing: false, cand: c, note: c.note, type: c.type, cat: c.cat, to_account_id: c.to_account_id, amount: c.amount, day: c.day, count: c.count, variable: c.variable, checked: true, manual: true});
    render(); toast(`„${c.note}“ pridėta prie pasikartojančių`); return;
  }
  if (d.gfilter && S.imp) { S.imp.gfilter = d.gfilter; render(); return; }
  switch (t.id) {
    case "fab": if (S.tab === "invest") openInvSheet(null); else openTxSheet(null); break;
    case "mOpen": openMonthSheet(); break;
    case "mPrev": S.ym = addMonths(S.ym, -1); resetAI(); render(); break;
    case "mNext": if (S.ym < ymOf(todayISO())) { S.ym = addMonths(S.ym, 1); resetAI(); render(); } break;
    case "hideDemo": S.demoDismissed = true; refreshDemo(); saveSettings("demo_dismissed"); render(); break;
    case "showDemo": S.demoDismissed = false; refreshDemo(); saveSettings("demo_dismissed"); go("overview"); break;
    case "aiClear": S.ai.chat = []; saveChat(); render(); break;
    case "aiStop": if (S.ai.ctrl) S.ai.ctrl.abort(); break;
    case "doImport": doBankImport(); break;
    case "impAI": aiCheckImport(); break;
    case "impNewAcc": if (S.imp) { createImportAccount(S.imp); render(); } break;
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
    case "resetYes": resetApp(); break;
    case "delAccYes": deleteAccount(); break;
    case "pwOpen": S.pw = {open: true}; render(); break;
    case "pwCancel": S.pw = null; render(); break;
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
  if (f.id === "pwForm") {
    const p1 = f.querySelector('[name="p1"]').value, p2 = f.querySelector('[name="p2"]').value;
    if (p1.length < 6) { S.pw = {open: true, err: "Slaptažodis turi būti bent 6 simbolių."}; render(); return; }
    if (p1 !== p2) { S.pw = {open: true, err: "Slaptažodžiai nesutampa."}; render(); return; }
    S.pw = {open: true, busy: true}; render();
    const {error} = await sb.auth.updateUser({password: p1});
    if (error) { S.pw = {open: true, err: "Nepavyko pakeisti: " + error.message}; render(); return; }
    S.pw = null; render(); toast("Slaptažodis pakeistas"); return;
  }
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
  if (el.id === "rrvQ" && S.recReview) { S.recReview.q = el.value; const box = $("#rrvPick"); if (box) box.innerHTML = vRecPick(); return; }
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
  if (el.id === "dzWord") { const b = $("#resetYes") || $("#delAccYes"); if (b) b.disabled = el.value.trim().toUpperCase() !== CONFIRM_WORD || !!S.dzBusy; return; }
  if (el.id === "ownName") { S.cfg.prefs = {...(S.cfg.prefs || {}), ownName: el.value.trim()}; saveSettings("prefs", 800); }
});
document.addEventListener("change", async e => {
  const el = e.target; if (el.closest("#sheetRoot")) return;
  if (el.id === "bankFile" && el.files[0]) {
    const f = el.files[0]; const imp = await bankSetupFile(f); el.value = "";
    if (imp === undefined) return;
    if (!imp) { toast("Faile nerasta eilučių"); return; }
    S.imp = imp; render(); return;
  }
  if (el.dataset.rrv !== undefined && S.recReview) { const it = S.recReview.items[+el.dataset.rrv]; it.checked = el.checked; el.closest(".rrv").classList.toggle("off", !el.checked); return; }
  if (el.dataset.laytoggle) { toggleSection(el.dataset.laytoggle); return; }
  if (el.id === "aiAuto") { S.cfg.prefs = {...(S.cfg.prefs || {}), aiAuto: el.checked}; saveSettings("prefs"); render(); return; }
  if (el.id === "heroAvg") { S.cfg.prefs = {...(S.cfg.prefs || {}), heroAvg: el.checked}; saveSettings("prefs"); return; }
  if (el.id === "obLoan") { const box = $(".ob-loan"); if (box) box.hidden = !el.checked; return; }
  if (el.id === "obFile" && el.files[0]) {
    const f = el.files[0]; const imp = await bankSetupFile(f); if (imp === undefined) return;
    if (!imp) { toast("Faile nerasta eilučių"); return; }
    S.imp = imp; S.sub = "import"; render(); window.scrollTo(0, 0); return;
  }
  if (el.id === "invFile" && el.files[0]) {
    const f = el.files[0]; const imp = invSetup(f.name, await readFileText(f));
    if (!imp) { toast("Faile nerasta eilučių"); return; }
    S.invImp = imp; render(); return;
  }
  if (el.id === "impAcc" && S.imp) { if (el.value === "__new") createImportAccount(S.imp); else { S.imp.account_id = el.value; S.imp.overrides = {}; S.imp.suggestNew = false; } render(); return; }
  if (el.id === "aiImportAuto") { S.cfg.prefs = {...(S.cfg.prefs || {}), aiImport: el.checked}; saveSettings("prefs"); return; }
  if (el.id === "impLearn" && S.imp) { S.imp.learn = el.checked; return; }
  if (el.id === "impBal" && S.imp) { S.imp.setBalance = el.checked; return; }
  if (el.id === "invPlat" && S.invImp) { S.invImp.platform = el.value.trim(); render(); return; }
  if (el.dataset.map) {
    const target = el.id.startsWith("bm_") ? S.imp : S.invImp;
    if (target) { target.map[el.dataset.map] = +el.value; if (el.dataset.map === "fee" && target.map.feeCols) target.map.feeCols = null; render(); }
    return;
  }
  if (el.dataset.choice && S.imp) { bankOverride(el.dataset.choice, el.value); render(); return; }
  if (el.dataset.gchoice !== undefined && S.imp) { groupOverride(+el.dataset.gchoice, el.value); render(); return; }
  if (el.dataset.reviewsel && el.value) { applyReview(el.dataset.reviewsel, el.value); return; }
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
  // prie pat ekrano krašto telefonas pats atlieka „atgal“ gestą, todėl čia jo nedubliuojam
  const x0 = e.touches[0].clientX;
  if (x0 < 32 || x0 > window.innerWidth - 32) return;
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
  const top = !S.sub && !(S.tab === "list" && (S.filter.imp || S.filter.cat));
  // giliau esančiame lange: į dešinę grįžta atgal, į kairę nieko nedaro
  if (!top) { if (dx > 0 && !NAV_TRANSIENT.includes(S.sub)) { anim("slide-r"); navBack(); } return; }
  // pagrindiniuose 4 languose: pereina į gretimą langą
  const i = TAB_ORDER.indexOf(S.tab), j = i + (dx < 0 ? 1 : -1);
  if (i < 0 || j < 0 || j >= TAB_ORDER.length) return;
  if (TAB_ORDER[j] === "list") S.filter.cat = null;
  anim(dx < 0 ? "slide-l" : "slide-r"); go(TAB_ORDER[j]);
}, {passive: true});
/* Be priartinimo ir be teksto kopijavimo */
const editable = el => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
["gesturestart", "gesturechange", "gestureend"].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), {passive: false}));
// Be „patempk žemyn, kad perkrautum“: ekrano viršuje traukiant žemyn puslapis nebeperkraunamas
let pullY = null;
let pullX = 0;
document.addEventListener("touchstart", e => { pullY = e.touches.length === 1 ? e.touches[0].clientY : null; pullX = e.touches[0]?.clientX || 0; }, {passive: true});
document.addEventListener("touchmove", e => {
  if (e.touches.length > 1) { e.preventDefault(); return; }
  const dy = e.touches[0].clientY - pullY, dx = Math.abs(e.touches[0].clientX - pullX);
  // mažas piršto judesys bakstelint nelaikomas tempimu, kitaip Android praryja paspaudimą
  if (pullY == null || window.scrollY > 0 || dy <= 12 || dx > dy || tourActive()) return;
  // leidžiam slinkti vidiniams sąrašams (pvz. lapams), jei jie dar ne viršuje
  for (let n = e.target; n && n !== document.body; n = n.parentElement) if (n.scrollTop > 0) return;
  if (e.cancelable) e.preventDefault();
}, {passive: false});
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
  navStack = []; navCur = null;
  S.user = null; S.partner = null; S.sgoals = null; S.linkCode = null; S.txs = new Map(); S.inv = new Map(); S.outbox = []; S.confirm = null; S.tab = "overview"; S.sub = null; resetAI(); S.ai.chat = null; render();
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
