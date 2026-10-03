/* Kišenė: mokomasis turas naujam naudotojui. Paryškina mygtuką, nuveda į skiltį ir paaiškina. */
"use strict";

const TOUR = [
  {title: "Sveikas atvykęs į Kišenę!", text: "Per minutę parodysiu, kur kas yra ir ką spausti. Turą gali bet kada praleisti, o vėl jį rasi skiltyje Daugiau → Pagalba ir pamokos."},
  {tab: "overview", sel: ".hero, .sum", title: "Laisvi pinigai", text: "Čia matai, kiek dar gali išleisti ar atsidėti iki mėnesio pabaigos: pajamos atėmus tai, kas jau išleista, ir mokėjimus, kurie dar laukia."},
  {tab: "overview", sel: "#monthBox", title: "Mėnesio pasirinkimas", text: "Rodyklėmis arba perbraukdamas per šią juostą pereini į kitą mėnesį. Paspaudęs mėnesio pavadinimą gali pasirinkti bet kurį mėnesį."},
  {tab: "overview", sel: () => [...$$("#view section.card")].find(s => /Kur keliauja/.test(s.textContent)) || $("#view section.card"), title: "Kur keliauja pinigai", text: "Apžvalgoje rasi grafikus ir kategorijų sąrašą. Paspaudęs kategoriją pamatysi visas jos operacijas."},
  {tab: "overview", sel: "#fab", title: "Pridėti operaciją", text: "Pliuso mygtukas visada po ranka. Juo įrašai išlaidas, pajamas ar pervedimą tarp sąskaitų, pvz. grynaisiais sumokėtą sumą."},
  {tab: "list", sel: 'nav .tab[data-tab="list"]', title: "Operacijos", text: "Visų mėnesio operacijų sąrašas. Paspausk ant operacijos, kad pakeistum kategoriją, sumą ar ją ištrintum."},
  {tab: "list", sel: "#q", title: "Paieška ir filtrai", text: "Ieškok pagal parduotuvės pavadinimą ar kategoriją, o filtrais rodyk tik išlaidas, pajamas ar pervedimus."},
  {title: "Perbraukimas", text: "Perbrauk turinį į kairę ar dešinę, kad pereitum į gretimą skiltį. Atidarytame puslapyje perbraukimas į dešinę grąžina atgal."},
  {tab: "invest", sel: ".invseg", title: "Investicijos", text: "„Mano portfelis“ rodo tavo investicijų vertę ir pelną. „Rinka“ leidžia surasti bet kurią akciją, ETF ar kriptovaliutą ir pažiūrėti jos grafiką."},
  {tab: "more", sel: '.mi[data-sub="import"]', title: "Banko išrašo importas", text: "Kas mėnesį įkelk banko CSV išrašą. Programėlė pati suskirstys operacijas į kategorijas ir parodys pasikartojančius mokėjimus, kuriuos gali pažymėti."},
  {tab: "more", sel: '.mi[data-sub="budgets"]', title: "Biudžetai", text: "Nustatyk mėnesio ribas kategorijoms. Artėjant prie ribos ar ją viršijus, varpelyje atsiras įspėjimas."},
  {tab: "more", sel: '.mi[data-sub="ai"]', title: "AI patarėjas", text: "Klausk apie savo finansus arba paprašyk pakeisti nustatymus, pvz. „nustatyk kavinėms 80 € ribą“."},
  {tab: "more", sel: '.mi[data-sub="help"]', title: "Pagalba ir pamokos", text: "Čia rasi atsakymus, kaip kas veikia, sąvokų žodynėlį ir pamokas apie biudžeto metodus. Iš čia gali vėl paleisti šį turą."},
  {tab: "overview", title: "Viskas paruošta!", text: "Pradėk nuo banko išrašo importo arba pridėk pirmą operaciją pliuso mygtuku. Sėkmės!"}
];
let tourStep = -1;
function tourActive() { return tourStep >= 0; }

function maybeTour() {
  if (tourActive() || S.tourShown || !S.user || !S.loaded || S.ob || S.sub === "onboard" || S.sub === "recreview" || S.sub === "import") return;
  if (S.cfg.prefs?.tourDone) return;
  if (!(S.cfg.prefs?.onboarded || S.txs.size || S.inv.size)) return;
  if (typeof splashGone === "function" && !splashGone()) return;
  if ($("#sheetRoot").children.length) return;
  S.tourShown = true;
  startTour();
}
function startTour() {
  $("#sheetRoot").innerHTML = "";
  tourStep = 0; tourShow();
}
function endTour() {
  tourStep = -1;
  $("#tourRoot").innerHTML = "";
  window.removeEventListener("resize", tourPlace);
  if (!S.cfg.prefs?.tourDone) { S.cfg.prefs = {...(S.cfg.prefs || {}), tourDone: true}; saveSettings("prefs"); }
  go("overview");
}
async function tourShow() {
  const st = TOUR[tourStep];
  if (st.tab && (S.tab !== st.tab || S.sub)) {
    S.tab = st.tab; S.sub = null; S.confirm = null;
    if (st.tab === "invest") S.invView.tab = "portfolio";
    if (st.tab === "list") S.filter.cat = null;
    await render();
  }
  const root = $("#tourRoot");
  if (!root.firstChild) {
    root.innerHTML = `<div class="tour" role="dialog" aria-modal="true"><div class="tour-block"></div><div class="tour-hole none"></div><div class="tour-tip"></div></div>`;
    window.addEventListener("resize", tourPlace);
  }
  const last = tourStep === TOUR.length - 1;
  root.querySelector(".tour-tip").innerHTML = `<h4>${esc(st.title)}</h4><p>${esc(st.text)}</p>
    <div class="tour-nav"><span class="cnt">${tourStep + 1} / ${TOUR.length}</span>
    ${last ? "" : `<button class="linkbtn" data-tour="skip">Praleisti</button>`}
    ${tourStep > 0 ? `<button class="btn ghost small" data-tour="back">Atgal</button>` : ""}
    <button class="btn small" data-tour="next">${last ? "Baigti" : tourStep === 0 ? "Pradėti" : "Toliau"}</button></div>`;
  const el = tourEl();
  if (el && getComputedStyle(el).position !== "fixed" && !el.closest("nav.tabs")) {
    const r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > innerHeight - 260) window.scrollTo(0, Math.max(0, scrollY + r.top - (el.id === "monthBox" ? 20 : 90)));
  }
  requestAnimationFrame(tourPlace);
}
function tourEl() {
  const st = TOUR[tourStep]; if (!st || !st.sel) return null;
  const el = typeof st.sel === "function" ? st.sel() : $(st.sel);
  return el && el.getBoundingClientRect().width ? el : null;
}
function tourPlace() {
  if (!tourActive()) return;
  const hole = $("#tourRoot .tour-hole"), tip = $("#tourRoot .tour-tip"); if (!hole || !tip) return;
  const el = tourEl();
  if (!el) {
    hole.classList.add("none"); hole.removeAttribute("style");
    tip.style.top = Math.max(16, (innerHeight - tip.offsetHeight) / 2) + "px"; return;
  }
  const r = el.getBoundingClientRect(), pad = 6;
  const top = Math.max(4, r.top - pad), h = Math.min(r.height + pad * 2, innerHeight - top - 4);
  hole.classList.remove("none");
  Object.assign(hole.style, {left: (r.left - pad) + "px", top: top + "px", width: (r.width + pad * 2) + "px", height: h + "px", borderRadius: (el.id === "fab" ? 22 : 14) + "px"});
  const th = tip.offsetHeight, below = top + h + 14;
  tip.style.top = (below + th < innerHeight - 12 ? below : Math.max(12, top - th - 14)) + "px";
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-tour]"); if (!b) return;
  e.stopPropagation();
  const a = b.dataset.tour;
  if (a === "skip") { endTour(); return; }
  if (a === "back") { tourStep = Math.max(0, tourStep - 1); tourShow(); return; }
  if (tourStep >= TOUR.length - 1) { endTour(); return; }
  tourStep++; tourShow();
}, true);
window.addEventListener("scroll", () => { if (tourActive()) requestAnimationFrame(tourPlace); }, {passive: true});
