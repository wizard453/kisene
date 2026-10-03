/* Kišenė: išvaizda (tema, fonas, akcento spalva, teksto dydis) ir „Daugiau“ meniu. */
"use strict";

const BG_PRESETS = {
  brand:    {name: "Kišenė",    light: ["#F7F7F5", "#FFFFFF", "#FFFFFF", "#D9D9D6"], dark: ["#10211D", "#162C27", "#1C3530", "#29433C"]},
  sage:     {name: "Šalavijas", light: ["#F1F3EE", "#FBFCF9", "#FFFFFF", "#DCE0D8"], dark: ["#111513", "#191E1B", "#202622", "#2E3531"]},
  white:    {name: "Balta",     light: ["#FFFFFF", "#F6F7F8", "#FFFFFF", "#E3E5E8"], dark: ["#0B0C0E", "#16181B", "#1D2024", "#2A2D31"]},
  sand:     {name: "Smėlis",    light: ["#F5F0E6", "#FCF9F3", "#FFFFFF", "#E4DCCB"], dark: ["#17140F", "#211D17", "#29241D", "#3A342A"]},
  sky:      {name: "Dangus",    light: ["#EEF3F8", "#FAFCFE", "#FFFFFF", "#D7E1EC"], dark: ["#0F141A", "#171E26", "#1E2731", "#2A3542"]},
  rose:     {name: "Rožė",      light: ["#F7EFF0", "#FDF9F9", "#FFFFFF", "#EAD9DB"], dark: ["#181213", "#221A1B", "#2B2122", "#3B2E30"]},
  lavender: {name: "Levanda",   light: ["#F1EFF8", "#FBFAFE", "#FFFFFF", "#DDD9EC"], dark: ["#131219", "#1C1A24", "#24212E", "#312E40"]},
  graphite: {name: "Grafitas",  light: ["#E9EAEC", "#F6F6F7", "#FFFFFF", "#D3D5D9"], dark: ["#000000", "#0E0E10", "#17171A", "#26262B"]}
};
const ACCENTS = {
  forest: {name: "Kišenė", light: "#0E3D36", dark: "#9FE0C3", soft: ["#EAF6EF", "#1E3F37"]}, mint: {name: "Mėta", light: "#3E9A85", dark: "#9FE0C3"}, ocean: {name: "Jūra", light: "#1F5A8C", dark: "#7DB6E8"},
  plum: {name: "Slyva", light: "#5B3A7A", dark: "#BFA0E0"}, amber: {name: "Gintaras", light: "#8A5A00", dark: "#F2B84B"},
  coral: {name: "Koralas", light: "#A8432C", dark: "#F4A08A"}, graphite: {name: "Grafitas", light: "#2B2F36", dark: "#C9CDD4"}
};
const FONT_SIZES = [["sm", "Mažesnis", 14], ["md", "Įprastas", 15], ["lg", "Didesnis", 16.5]];
const THEME_KEY = "kisene.theme";

function themePrefs() {
  const p = S?.cfg?.prefs?.theme;
  // senas numatytasis fonas „Šalavijas“ pakeičiamas nauju „Kišenė“
  const mig = o => o && o.bg === "sage" ? {...o, bg: "brand"} : o;
  if (p) return mig(p);
  try { return mig(JSON.parse(localStorage.getItem(THEME_KEY) || "null")) || {}; } catch (e) { return {}; }
}
function mix(hex, other, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(other);
  return "#" + a.map((v, i) => Math.round(v * t + b[i] * (1 - t)).toString(16).padStart(2, "0")).join("");
}
function applyTheme(tp) {
  tp = tp || themePrefs();
  const root = document.documentElement;
  const mode = tp.mode || "system";
  if (mode === "system") delete root.dataset.theme; else root.dataset.theme = mode;
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const bg = BG_PRESETS[tp.bg] || BG_PRESETS.brand, ac = ACCENTS[tp.accent] || ACCENTS.forest;
  const [b, s, r, l] = dark ? bg.dark : bg.light;
  const acc = dark ? ac.dark : ac.light;
  const set = (k, v) => root.style.setProperty(k, v);
  set("--bg", b); set("--surface", s); set("--raise", r); set("--line", l);
  set("--accent", acc); set("--accent-soft", ac.soft ? ac.soft[dark ? 1 : 0] : mix(acc, s, dark ? 0.22 : 0.13)); set("--accent-ink", dark ? b : "#FFFFFF");
  const fs = FONT_SIZES.find(f => f[0] === tp.font) || FONT_SIZES[1];
  document.body && (document.body.style.fontSize = fs[2] + "px");
  root.style.fontSize = fs[2] + "px";
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", b));
  try { localStorage.setItem(THEME_KEY, JSON.stringify(tp)); } catch (e) {}
}
function setTheme(patch) {
  const tp = {...themePrefs(), ...patch};
  S.cfg.prefs = {...(S.cfg.prefs || {}), theme: tp}; saveSettings("prefs");
  applyTheme(tp); render();
}
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyTheme());
applyTheme();

function vLook() {
  const tp = themePrefs();
  const mode = tp.mode || "system", bgK = tp.bg || "brand", acK = tp.accent || "forest";
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const ml = S.cfg.prefs?.moreLayout || "list";
  return `${subHead("Išvaizda")}
  <div class="set-group"><h3>Tema</h3>
    <div class="seg three">${[["system", "Automatinė"], ["light", "Šviesi"], ["dark", "Tamsi"]].map(([k, n]) => `<button data-thmode="${k}" aria-pressed="${mode === k}">${n}</button>`).join("")}</div></div>
  <div class="set-group"><h3>Fono spalva</h3>
    <div class="swgrid">${Object.entries(BG_PRESETS).map(([k, v]) => { const c = dark ? v.dark : v.light; return `<button class="swopt" data-thbg="${k}" aria-pressed="${bgK === k}"><span class="swprev" style="background:${c[0]}"><i style="background:${c[1]};border-color:${c[3]}"></i></span><small>${v.name}</small></button>`; }).join("")}</div></div>
  <div class="set-group"><h3>Akcento spalva</h3>
    <div class="swgrid">${Object.entries(ACCENTS).map(([k, v]) => `<button class="swopt" data-thacc="${k}" aria-pressed="${acK === k}"><span class="swprev round" style="background:${dark ? v.dark : v.light}"></span><small>${v.name}</small></button>`).join("")}</div></div>
  <div class="set-group"><h3>Teksto dydis</h3>
    <div class="seg three">${FONT_SIZES.map(([k, n]) => `<button data-thfont="${k}" aria-pressed="${(tp.font || "md") === k}">${n}</button>`).join("")}</div></div>
  <div class="set-group"><h3>„Daugiau“ meniu išdėstymas</h3>
    <div class="seg three">${[["list", "Sąrašas"], ["grid", "Mažos ikonos"], ["tiles", "Didelės plytelės"]].map(([k, n]) => `<button data-morelayout="${k}" aria-pressed="${ml === k}">${n}</button>`).join("")}</div></div>
  ${vLayoutEditor()}
  <div class="set-group"><h3>Laisvų pinigų skaičiavimas</h3>
    <label class="check"><input type="checkbox" id="heroAvg" ${S.cfg.prefs?.heroAvg !== false ? "checked" : ""}> Kol atlyginimas negautas, naudoti paskutinių 3 mėnesių pajamų vidurkį</label>
    <div class="fine">Išjungus, skaičiuojama tik pagal jau gautas pajamas ir suplanuotas pasikartojančias pajamas.</div></div>
  <button class="linkbtn" id="thReset" style="align-self:flex-start">Atkurti numatytąją išvaizdą</button>`;
}

/* ---------- Daugiau meniu ---------- */
function moreItems() {
  const nAcc = activeAccounts().length, nRec = (S.cfg.recurring || []).filter(r => r.active).length, nGoals = (S.cfg.goals || []).length, nRules = (S.cfg.rules || []).length;
  const rv = S.loaded ? reviewGroups().reduce((n, g) => n + g.ids.length, 0) : 0;
  return [
    {group: "Finansai", items: [
      ["wealth", "Turtas", "Grynoji vertė ir jos pokytis", "coin", "c7"],
      ["together", "Bendra paskyra", S.partner ? "Susieta su " + partnerName() : "Bendras biudžetas dviese", "heart", "c5"],
      ["year", "Metų ataskaita", "Metai skaičiais ir palyginimas", "receipt", "c1"],
      ["accounts", "Sąskaitos ir skolos", `${nAcc} sąskaitos`, "bank", "c11"],
      ["budgets", "Biudžetai", "Mėnesio ribos kategorijoms", "percent", "c2"],
      ["goals", "Taupymo tikslai", nGoals ? `${nGoals} tikslai` : "Atostogoms, rezervui", "gift", "c3"],
      ["recurring", "Pasikartojančios", nRec ? `${nRec} aktyvios` : "Nuoma, prenumeratos", "repeat", "c6"]]},
    {group: "Įrankiai", items: [
      ["ai", "AI patarėjas", "Klausk ir keisk nustatymus pokalbiu", "sparkle", "c5"],
      ["import", "Banko išrašo importas", "CSV iš bet kurio banko", "arrowin", "c10"],
      ["review", "Be kategorijos", rv ? `${rv} laukia` : "Viskas sutvarkyta", "tag", "c4", rv],
      ["cats", "Kategorijos ir taisyklės", `${nRules} taisyklės`, "dots", "c8"]]},
    {group: "Pagalba", items: [
      ["help", "Pagalba ir pamokos", "Kaip kas veikia, biudžeto metodai", "book", "c3"]]},
    {group: "Nustatymai", items: [
      ["look", "Išvaizda", "Spalvos, tema, išdėstymas", "palette", "c12"],
      ["app", "Paskyra ir programėlė", S.user?.email || "", "user", "c9"]]}
  ];
}
function vMore() {
  const ml = S.cfg.prefs?.moreLayout || "list";
  const switcher = `<div class="mlsw" role="radiogroup" aria-label="Išdėstymas">${[["list", "dots"], ["grid", "grid"], ["tiles", "tiles"]].map(([k, ic]) => `<button data-morelayout="${k}" role="radio" aria-checked="${ml === k}" aria-label="${k === "list" ? "Sąrašas" : k === "grid" ? "Mažos ikonos" : "Didelės plytelės"}">${icon(ic === "dots" ? "list" : ic, 18)}</button>`).join("")}</div>`;
  const item = ([k, t, d, ic, col, badge]) => `<button class="mi" data-sub="${k}"><span class="mi-ic" style="background:var(--${col})">${icon(ic, ml === "grid" ? 22 : 20)}${badge ? `<i class="mi-badge">${badge > 9 ? "9+" : badge}</i>` : ""}</span><span class="mi-t"><b>${t}</b>${ml === "grid" ? "" : `<small>${esc(d)}</small>`}</span>${ml === "list" ? '<span class="chev">›</span>' : ""}</button>`;
  return `<div class="more-head"><h2>Daugiau</h2>${switcher}</div>
  ${moreItems().map(g => `<div class="mgroup"><div class="mg-h">${g.group}</div><div class="menu ${ml}">${g.items.map(item).join("")}</div></div>`).join("")}`;
}
