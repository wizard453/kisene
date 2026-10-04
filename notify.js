/* Kišenė: pranešimai. Taisyklės skaičiuojamos programėlėje, kai ji atidaroma ar pasikeičia duomenys.
   Rodoma varpelyje ir, jei leista, telefono pranešimu. */
"use strict";

const nKey = () => "kisene.alerts." + (S.user?.id || "x");
function nState() { try { return JSON.parse(localStorage.getItem(nKey()) || "null") || {seen: [], notified: [], on: false}; } catch (e) { return {seen: [], notified: [], on: false}; } }
function nSave(st) { st.seen = st.seen.slice(-400); st.notified = st.notified.slice(-400); try { localStorage.setItem(nKey(), JSON.stringify(st)); } catch (e) {} }
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function computeAlerts() {
  if (!S.loaded || S.demo) return [];
  const out = [], ym = ymOf(todayISO()), today = new Date().getDate(), txs = [...S.txs.values()];
  const a = monthAgg(ym, txs);
  // biudžetai
  for (const c of catsOf("exp")) {
    const b = budgetsFor(ym)[c.id], v = a.byCat[c.id] || 0;
    if (!(b > 0)) continue;
    if (v > b) out.push({key: `bud100:${ym}:${c.id}`, lvl: "crit", title: `${c.name}: biudžetas viršytas`, body: `Išleista ${eur(v)} iš ${eur0(b)} (viršyta ${eur(v - b)}).`, go: {cat: c.id}});
    else if (v >= b * 0.85) out.push({key: `bud85:${ym}:${c.id}`, lvl: "warn", title: `${c.name}: liko ${eur(b - v)}`, body: `Išnaudota ${pct(v / b * 100)} mėnesio biudžeto.`, go: {cat: c.id}});
  }
  // neįprastai didelės išlaidos per paskutines 7 dienas
  const week = addDays(todayISO(), -7), cut = addDays(todayISO(), -120);
  const byCat = {};
  for (const t of txs) if (t.type === "exp" && t.date >= cut) (byCat[t.cat] = byCat[t.cat] || []).push(t);
  for (const t of txs) {
    if (t.type !== "exp" || t.date < week) continue;
    const others = (byCat[t.cat] || []).filter(x => x.id !== t.id).map(x => x.amount);
    const med = median(others);
    if (others.length >= 4 && t.amount > Math.max(50, med * 3)) out.push({key: `big:${t.id}`, lvl: "warn", title: `Didelė išlaida: ${eur(t.amount)}`, body: `${t.note || catById(t.cat).name}, ${dayLabel(t.date)}. Įprastai ${catById(t.cat).name.toLowerCase()} kainuoja apie ${eur0(med)}.`, go: {tx: t.id}});
  }
  // artėjantys pasikartojantys mokėjimai
  for (const r of S.cfg.recurring || []) {
    if (!r.active || r.type === "inc" || r.start > ym || (recMode(r) === "auto" ? (r.last && r.last >= ym) : recPaid(r, ym))) continue;
    const d = r.day - today;
    if (d >= 0 && d <= 2) out.push({key: `rec:${r.id}:${ym}`, lvl: "info", title: d === 0 ? `Šiandien: ${r.note || catById(r.cat).name}` : d === 1 ? `Rytoj: ${r.note || catById(r.cat).name}` : `Po 2 dienų: ${r.note || catById(r.cat).name}`, body: `Pasikartojantis mokėjimas ${eur(r.amount)}.`, go: {sub: "recurring"}});
  }
  // mėnesio likutis
  if (a.n) { const sp = spendable(); if (sp.left < 0) out.push({key: `neg:${ym}`, lvl: "crit", title: "Šį mėnesį išleista daugiau nei uždirbama", body: `Viršyta ${eur0(-sp.left)}, įskaitant laukiančius mokėjimus.`, go: {tab: "overview"}}); }
  // praėjusio mėnesio suvestinė (pirmą savaitę)
  if (today <= 7) {
    const pm = addMonths(ym, -1), p = monthAgg(pm, txs);
    if (p.n && p.inc > 0) { const sv = p.inc - p.exp; out.push({key: `sum:${pm}`, lvl: "info", title: `${MONTHS[+pm.slice(5) - 1]}: ${sv >= 0 ? "sutaupei" : "išleidai daugiau"} ${eur0(Math.abs(sv))}`, body: `Pajamos ${eur0(p.inc)}, išlaidos ${eur0(p.exp)}${sv >= 0 ? `, sutaupyta ${pct(sv / p.inc * 100)}` : ""}.`, go: {tab: "overview", ym: pm}}); }
  }
  // pasiekti tikslai
  for (const g of S.cfg.goals || []) if (g.target > 0 && g.saved >= g.target) out.push({key: `goal:${g.id}`, lvl: "info", title: `Tikslas pasiektas: ${g.name}`, body: `Sutaupyta ${eur0(g.saved)}.`, go: {sub: "goals"}});
  // per daug operacijų be kategorijos
  const rv = reviewGroups().reduce((n, g) => n + g.ids.length, 0);
  if (rv >= 5) out.push({key: `review:${ym}:${Math.floor(rv / 5)}`, lvl: "info", title: `${rv} operacijos be kategorijos`, body: "Priskirk jas, kad statistika būtų tiksli.", go: {sub: "review"}});
  return out;
}

// Paleidžiama po duomenų pasikeitimų: atnaujina varpelį ir išsiunčia naujus pranešimus į telefoną
let alertsCache = [];
function checkAlerts() {
  alertsCache = computeAlerts();
  const st = nState();
  const unseen = alertsCache.filter(x => !st.seen.includes(x.key)).length;
  const b = $("#bellBadge"); if (b) { b.textContent = unseen > 9 ? "9+" : unseen; b.hidden = !unseen; }
  if (st.on && "Notification" in window && Notification.permission === "granted") {
    const fresh = alertsCache.filter(x => !st.notified.includes(x.key) && !st.seen.includes(x.key));
    for (const x of fresh.slice(0, 3)) showSystemNotification(x);
    st.notified.push(...fresh.map(x => x.key)); nSave(st);
  }
}
async function showSystemNotification(x) {
  const opts = {body: x.body, tag: x.key, icon: "icon-192.png", badge: "icon-192.png", data: {go: x.go}};
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) { await reg.showNotification(x.title, opts); return; }
  } catch (e) {}
  try { new Notification(x.title, opts); } catch (e) {}
}
async function enableNotifications(on) {
  const st = nState();
  if (on) {
    if (!("Notification" in window)) { toast("Ši naršyklė nepalaiko pranešimų"); return; }
    let p = Notification.permission;
    if (p === "default") p = await Notification.requestPermission();
    if (p !== "granted") { toast("Pranešimai neleisti naršyklės nustatymuose"); st.on = false; nSave(st); render(); return; }
    // jau esami įspėjimai nebus siunčiami iš naujo
    st.notified = [...new Set([...st.notified, ...computeAlerts().map(x => x.key)])];
  }
  st.on = on; nSave(st); render();
  toast(on ? "Pranešimai įjungti" : "Pranešimai išjungti");
}
function openAlerts() {
  const list = computeAlerts();
  const st = nState();
  const root = $("#sheetRoot"); const close = () => { root.innerHTML = ""; };
  root.innerHTML = `<div class="sheet-bg" id="sheetBg"><div class="sheet" role="dialog" aria-modal="true" aria-label="Pranešimai">
    <div class="grab"></div><h3 class="sheet-h">Pranešimai</h3>
    ${list.length ? `<ul class="notes">${list.map((x, i) => `<li class="${x.lvl === "crit" ? "crit" : x.lvl === "warn" ? "warn" : ""} ${st.seen.includes(x.key) ? "" : "unread"}"><button class="nbtn" data-al="${i}"><span class="ic">${x.lvl === "info" ? "i" : "!"}</span><span><b>${esc(x.title)}</b><br>${esc(x.body)}</span></button></li>`).join("")}</ul>`
      : `<div class="empty">Naujų pranešimų nėra.</div>`}
    ${!st.on ? `<div class="hint">Gali gauti šiuos pranešimus ir telefone: Daugiau → Paskyra ir programėlė → Pranešimai.</div>` : ""}
    <button class="btn ghost" id="alClose">Uždaryti</button></div></div>`;
  st.seen = [...new Set([...st.seen, ...list.map(x => x.key)])]; nSave(st); checkAlerts();
  $("#sheetBg").onclick = e => { if (e.target.id === "sheetBg") close(); };
  $("#alClose").onclick = close;
  root.querySelectorAll("[data-al]").forEach(b => b.onclick = () => { close(); followAlert(list[+b.dataset.al].go); });
}
function followAlert(g) {
  if (!g) return;
  if (g.cat) { S.filter = {...S.filter, cat: g.cat, q: ""}; S.ym = ymOf(todayISO()); go("list"); return; }
  if (g.tx) { const t = S.txs.get(g.tx); if (t) openTxSheet(t); return; }
  if (g.ym) S.ym = g.ym;
  if (g.sub) { go("more", g.sub); return; }
  go(g.tab || "overview");
}
