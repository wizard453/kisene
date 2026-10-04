/* Kišenė: išlaidų ir pajamų kitimas laike, AI analizė pagal biudžeto metodą. */
"use strict";

S.trend = {range: 12, cat: null, icat: null};
S.mAI = {status: "idle", text: "", actions: null, applied: null, err: ""};

const BUDGET_METHODS = {
  "503020": {name: "50/30/20", groups: [["Būtini poreikiai", 50], ["Norai", 30], ["Taupymas ir skolų grąžinimas", 20]]},
  "702010": {name: "70/20/10", groups: [["Gyvenimo išlaidos", 70], ["Taupymas ir investavimas", 20], ["Skolos arba labdara", 10]]},
  "jars": {name: "Šeši stiklainiai", groups: [["Būtinos išlaidos", 55], ["Finansinė laisvė (investicijos)", 10], ["Ilgalaikis taupymas", 10], ["Mokymasis", 10], ["Malonumai", 10], ["Dovanos ir labdara", 5]]},
  "custom": {name: "Savo procentai", groups: null}
};
const customGroups = () => S.cfg.prefs?.customMethod || [["Būtini poreikiai", 60], ["Norai", 25], ["Taupymas", 15]];

/* ---------- Duomenys ---------- */
function trendMonths(range) {
  const now = ymOf(todayISO()), txs = allTx();
  let first = now;
  for (const t of txs) { const m = ymOf(t.date); if (m < first) first = m; }
  const out = [];
  for (let m = first; m <= now; m = addMonths(m, 1)) out.push(m);
  return range ? out.slice(-range) : out;
}
// mėnesio sumos: bendra arba pasirinktos kategorijos
function monthVals(months, kind, cat) {
  const txs = allTx();
  return months.map(m => { const a = monthAgg(m, txs); return kind === "exp" ? (cat ? a.byCat[cat] || 0 : a.exp) : (cat ? a.byInc[cat] || 0 : a.inc); });
}
// vidurkis tik iš pilnų mėnesių (be einamojo)
function avgFull(months, vals) {
  const now = ymOf(todayISO());
  const v = vals.filter((x, i) => months[i] !== now);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
}

/* ---------- Grafikai ---------- */
function trendChart(months, vals, color, stacks) {
  const W = 340, H = 180, L = 40, R = 6, T = 14, B = 22, pw = W - L - R, ph = H - T - B;
  const now = ymOf(todayISO());
  const hi0 = Math.max(...vals, 1), step = niceMax(hi0 / 3), hi = step * Math.max(1, Math.ceil(hi0 / step));
  const n = months.length, slot = pw / n, bw = Math.min(26, slot * 0.62);
  const y = v => T + ph - v / hi * ph;
  let g = "";
  for (let v = 0; v <= hi + 1e-6; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" ${v ? 'stroke-dasharray="2 4"' : ""}/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)" font-family="var(--f-num)">${kfmt(v)}</text>`;
  const avg = avgFull(months, vals);
  // sudėti stulpeliai: kiekviena kategorija savo spalva, viršuje didžiausios
  const bars = stacks ? months.map((m, i) => {
    const x = L + slot * i + (slot - bw) / 2, cur = m === now;
    let base = T + ph, out = "";
    for (const st of stacks) {
      const v = st.vals[i]; if (!(v > 0)) continue;
      const h = v / hi * ph; base -= h;
      out += `<rect x="${x.toFixed(1)}" y="${base.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(.6, h - .6).toFixed(1)}" fill="${st.color}" opacity="${cur ? .45 : 1}"/>`;
    }
    return out;
  }).join("") : vals.map((v, i) => {
    const x = L + slot * i + (slot - bw) / 2, h = Math.max(v > 0 ? 1.5 : 0, v / hi * ph);
    const cur = months[i] === now;
    return `<rect x="${x.toFixed(1)}" y="${(T + ph - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${color}" opacity="${cur ? .45 : 1}"/>`;
  }).join("");
  const every = n > 12 ? 3 : n > 8 ? 2 : 1;
  const labels = months.map((m, i) => i % every && i !== n - 1 ? "" : `<text x="${(L + slot * i + slot / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="var(--f-body)">${MSHORT[+m.slice(5) - 1]}${m.endsWith("-01") || i === 0 ? " " + m.slice(2, 4) : ""}</text>`).join("");
  const avgLine = avg > 0 ? `<line x1="${L}" x2="${W - R}" y1="${y(avg)}" y2="${y(avg)}" stroke="var(--ink)" stroke-dasharray="5 4" stroke-width="1.2" opacity=".7"/><text x="${W - R}" y="${y(avg) - 4}" text-anchor="end" font-size="10" fill="var(--ink)" font-family="var(--f-body)">vid. ${eur0(avg)}</text>` : "";
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Kitimas per mėnesius">${g}${bars}${avgLine}${labels}
    <rect class="hitarea" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/></svg>`;
}
function mountTrendChart(months, vals) {
  const host = $("#trendChart"); if (!host) return;
  const svg = host.querySelector("svg"), hit = svg?.querySelector(".hitarea"); if (!hit) return;
  const tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; host.appendChild(tip);
  const move = e => {
    const rb = svg.getBoundingClientRect(), sc = rb.width / 340, slot = (340 - 46) / months.length;
    const i = Math.max(0, Math.min(months.length - 1, Math.floor(((e.clientX - rb.left) / sc - 40) / slot)));
    const stacks = S.trend._s;
    const parts = stacks ? stacks.filter(st => st.vals[i] > 0).sort((a, b) => b.vals[i] - a.vals[i]).slice(0, 5).map(st => `<span class="tip-l"><i style="background:${st.color}"></i>${esc(st.name)} <span class="num">${eur0(st.vals[i])}</span></span>`).join("") : "";
    tip.innerHTML = `<b>${ymLabel(months[i])}</b>Iš viso <span class="num">${eur(vals[i])}</span>${months[i] === ymOf(todayISO()) ? " · mėnuo dar nesibaigė" : ""}${parts}`;
    tip.style.left = Math.max(80, Math.min(host.clientWidth - 80, (40 + slot * (i + .5)) * sc)) + "px"; tip.style.top = "6px"; tip.hidden = false;
  };
  hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => { tip.hidden = true; });
}
function miniBars(vals, color) {
  const W = 84, H = 26, n = vals.length, hi = Math.max(...vals, 1), slot = W / n, bw = Math.max(2, slot * .64);
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${vals.map((v, i) => { const h = Math.max(v > 0 ? 1.5 : .5, v / hi * (H - 2)); return `<rect x="${(slot * i + (slot - bw) / 2).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${color}" opacity="${i === n - 1 ? .5 : 1}"/>`; }).join("")}</svg>`;
}

/* ---------- Puslapiai ---------- */
function vTrend(kind) {
  const isExp = kind === "exp", tr = S.trend, sel = isExp ? tr.cat : tr.icat;
  const all = trendMonths(0), months = trendMonths(tr.range);
  const title = isExp ? "Išlaidų kitimas" : "Pajamų kitimas";
  let body = subHead(title, ["Apžvalga", "overview"]).replace(/<h2>(.*?)<\/h2>/, (_, t) => `<div class="sh-row"><h2>${t}</h2>${infoBtn(isExp ? "spendtrend" : "inctrend")}</div>`);
  if (!allTx().some(t => t.type === kind)) return body + `<div class="empty">${isExp ? "Išlaidų" : "Pajamų"} dar nėra.</div>`;
  const cats = catsOf(kind);
  const txs = allTx();
  // kategorijos, kurios turėjo sumų per laikotarpį
  const used = new Set();
  for (const t of txs) if (t.type === kind && months.includes(ymOf(t.date))) used.add(t.cat);
  const list = [...cats.filter(c => used.has(c.id)), ...[...used].filter(id => !cats.some(c => c.id === id)).map(catById)]
    .map(c => { const v = monthVals(months, kind, c.id); return {c, v, avg: avgFull(months, v), total: v.reduce((s, x) => s + x, 0)}; })
    .sort((a, b) => b.total - a.total);
  const selC = sel ? catById(sel) : null;
  const vals = monthVals(months, kind, sel);
  // bendras grafikas: visos kategorijos viename stulpelyje (8 didžiausios, likusios kartu)
  let stacks = null;
  if (!sel) {
    const top = list.slice(0, 8).map(({c, v}) => ({name: c.name, color: `var(--${c.color})`, vals: v}));
    const rest = list.slice(8);
    if (rest.length) top.push({name: `Kitos (${rest.length})`, color: "var(--faint)", vals: months.map((_, i) => rest.reduce((s, r) => s + r.v[i], 0))});
    stacks = top;
  }
  S.trend._m = months; S.trend._v = vals; S.trend._s = stacks;
  const color = selC ? `var(--${selC.color})` : isExp ? "var(--exp)" : "var(--inc)";
  const avg = avgFull(months, vals);
  const now = ymOf(todayISO()), prevM = addMonths(now, -1);
  const prev = vals[months.indexOf(prevM)] ?? 0;
  const prevAvg = avgFull(months.slice(0, -2), vals.slice(0, -2));
  const dPrev = prevAvg > 0 ? (prev - prevAvg) / prevAvg * 100 : null;
  body += `
  ${all.length > 6 ? `<div class="filters">${[[6, "6 mėn."], [12, "12 mėn."], [0, "Viskas"]].filter(([k]) => !k || all.length > k - 1).map(([k, n]) => `<button class="chip" data-trange="${k}" aria-pressed="${tr.range === k || (!tr.range && !k)}">${n}</button>`).join("")}</div>` : ""}
  <section class="card"><div class="sec-h"><h2>${selC ? esc(selC.name) : isExp ? "Visos išlaidos" : "Visos pajamos"}</h2>${selC ? `<button class="linkbtn aside" data-tsel="">Rodyti visas</button>` : ""}</div>
    <div class="tstats">
      <div><small>Vidurkis</small><b class="num">${eur0(avg)}</b></div>
      <div><small>${MONTHS[+prevM.slice(5) - 1]}</small><b class="num">${eur0(prev)}</b>${dPrev !== null && months.length > 3 ? `<small class="${(dPrev > 0) === isExp ? "negc" : "pos"}">${dPrev >= 0 ? "↑" : "↓"} ${pct(Math.abs(dPrev))}</small>` : ""}</div>
      <div><small>Šis mėnuo</small><b class="num">${eur0(vals[vals.length - 1] || 0)}</b></div>
    </div>
    <div class="chart" id="trendChart">${trendChart(months, vals, color, stacks)}</div>
    ${stacks ? `<div class="tlegend">${stacks.map(st => `<span><i style="background:${st.color}"></i>${esc(st.name)}</span>`).join("")}</div>` : ""}
    ${selC ? `<button class="linkbtn" data-catfilter="${esc(selC.id)}" data-catyear="${now.slice(0, 4)}" style="align-self:flex-start">Operacijos: ${esc(selC.name)} ›</button>` : ""}
  </section>
  <section class="card"><div class="sec-h"><h2>${isExp ? "Pagal kategorijas" : "Pagal šaltinius"}</h2><span class="aside">vid. per mėn.</span></div>
    <div class="fine">Paspausk eilutę, kad grafike pamatytum tik ją.</div>
    <div class="trows">${list.map(({c, v, avg: a}) => {
      const last = v[v.length - 2] ?? 0, ch = a > 0 && v.length > 2 ? (last - a) / a * 100 : null;
      return `<button class="trow ${sel === c.id ? "on" : ""}" data-tsel="${esc(c.id)}"><span class="sw" style="background:var(--${c.color})"></span><span class="tn">${esc(c.name)}${ch !== null && Math.abs(ch) >= 15 ? `<small class="${(ch > 0) === isExp ? "negc" : "pos"}">${ch > 0 ? "↑" : "↓"} ${pct(Math.abs(ch))} praėjusį mėn.</small>` : ""}</span>${miniBars(v, `var(--${c.color})`)}<b class="num">${eur0(a)}</b></button>`;
    }).join("")}</div></section>
  ${isExp ? vMethodAI() : ""}`;
  return body;
}

/* ---------- AI: išlaidų paskirstymas pagal metodą ---------- */
function vMethodAI() {
  const mk = S.cfg.prefs?.aiMethod || "503020", m = BUDGET_METHODS[mk];
  const groups = mk === "custom" ? customGroups() : m.groups;
  const sum = groups.reduce((s, g) => s + (+g[1] || 0), 0);
  const st = S.mAI, run = st.status === "run";
  return `<section class="card mai"><div class="sec-h"><h2>AI analizė pagal metodą</h2></div>
    <div class="fine">AI suskirstys tavo kategorijas į metodo grupes, palygins su tikslu ir pasiūlys, kiek kur skirti per mėnesį.</div>
    <div class="filters">${Object.entries(BUDGET_METHODS).map(([k, v]) => `<button class="chip" data-aimethod="${k}" aria-pressed="${mk === k}">${v.name}</button>`).join("")}</div>
    ${mk === "custom" ? `<div class="cgroups">${groups.map(([n, p], i) => `<div class="cg"><input class="inp" data-cgname="${i}" value="${esc(n)}" maxlength="40" placeholder="Grupė"><input class="inp num" data-cgpct="${i}" value="${p}" inputmode="decimal" style="width:64px"><span>%</span>${groups.length > 2 ? `<button class="linkbtn danger" data-cgdel="${i}" aria-label="Pašalinti">✕</button>` : ""}</div>`).join("")}
      <div class="row between"><button class="linkbtn" data-cgadd="1">+ Pridėti grupę</button><span class="fine ${Math.abs(sum - 100) > 0.01 ? "err" : ""}">Iš viso ${fmtN.format(sum)} %</span></div></div>`
      : `<div class="mgroups">${groups.map(([n, p]) => `<span><b>${p} %</b> ${esc(n)}</span>`).join("")}</div>`}
    <div class="row"><button class="btn" id="maiRun" ${run || (mk === "custom" && Math.abs(sum - 100) > 0.01) ? "disabled" : ""}>${run ? "Analizuojama…" : st.text ? "Analizuoti iš naujo" : "Analizuoti su AI"}</button>${run ? `<button class="btn ghost small" id="maiStop">Stabdyti</button>` : ""}</div>
    ${st.err ? `<div class="err">${esc(st.err)}</div>` : ""}
    ${st.text || run ? `<div class="msg ai mai-out" id="maiOut">${st.text ? md(st.text) : '<span class="typing"><i></i><i></i><i></i></span>'}${run && st.text ? '<span class="caret"></span>' : ""}</div>` : ""}
    ${st.actions?.length ? `<div class="acts">${st.actions.map(a => `<div class="act ${st.applied ? "done" : "pending"}"><span class="ic">${st.applied ? "✓" : "?"}</span><span>${esc(describeAction(a))}</span></div>`).join("")}</div>
      <div class="row">${st.applied ? `<span class="pill on">Biudžetai pritaikyti</span><button class="linkbtn" id="maiUndo">Atšaukti</button>` : `<button class="btn small" id="maiApply">Pritaikyti šiuos biudžetus</button>`}</div>` : ""}
  </section>`;
}
function methodPrompt(mk) {
  const groups = mk === "custom" ? customGroups() : BUDGET_METHODS[mk].groups;
  const now = ymOf(todayISO()), months = [1, 2, 3].map(i => addMonths(now, -i)), txs = allTx();
  const aggs = months.map(m => monthAgg(m, txs)).filter(a => a.n);
  const k = Math.max(1, aggs.length);
  const inc = aggs.reduce((s, a) => s + a.inc, 0) / k, inv = aggs.reduce((s, a) => s + a.inv, 0) / k, debt = aggs.reduce((s, a) => s + a.debt, 0) / k;
  const byCat = {};
  for (const a of aggs) for (const [id, v] of Object.entries(a.byCat)) byCat[id] = (byCat[id] || 0) + v / k;
  const catLines = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([id, v]) => `- ${id}: ${catById(id).name}: ${r2(v)} €${S.cfg.budgets[id] ? ` (dabartinis biudžetas ${S.cfg.budgets[id]} €)` : ""}`).join("\n");
  return `Pritaikyk mano išlaidoms metodą „${mk === "custom" ? "savo procentai" : BUDGET_METHODS[mk].name}“. Grupės ir dalis nuo pajamų: ${groups.map(([n, p]) => `${n} ${p} %`).join(", ")}.
Mano paskutinių ${aggs.length} pilnų mėnesių vidurkiai per mėnesį: pajamos ${r2(inc)} €, investuota ${r2(inv)} €, paskoloms grąžinta ${r2(debt)} €.
Išlaidos pagal kategorijas (id: pavadinimas: vidurkis):
${catLines || "- išlaidų nėra"}

Atsakyk taip:
### Kaip suskirsčiau
Kiekvienai grupei išvardyk, kurios mano kategorijos į ją patenka (investavimą ir paskolų grąžinimą priskirk taupymo ar skolų grupei, jei tokia yra).
### Dabar ir tikslas
Lentelė su stulpeliais: Grupė | Tikslas | Dabar. Tikslą ir dabartinę sumą rašyk eurais ir procentais nuo pajamų.
### Ką keisti
3–5 konkretūs pasiūlymai su sumomis: kurias kategorijas mažinti ir kiek, kur galima skirti daugiau.
Tada kiekvienai išlaidų kategorijai, kuriai siūlai mėnesio ribą, iškviesk įrankį set_budget su tos kategorijos id ir suma (apvalink iki 5 €). Kitų įrankių nenaudok. Pakeitimų neaprašinėk atskirai, programėlė juos parodys.`;
}
async function runMethodAI() {
  const mk = S.cfg.prefs?.aiMethod || "503020";
  if (!navigator.onLine) { toast("AI reikia interneto ryšio"); return; }
  S.mAI = {status: "run", text: "", actions: null, applied: null, err: "", ctrl: new AbortController()};
  const prevCtrl = S.ai.ctrl; S.ai.ctrl = S.mAI.ctrl;
  render();
  let actions = [];
  try {
    const r = await callAI([{role: "user", content: methodPrompt(mk)}], t => {
      S.mAI.text += t;
      const el = $("#maiOut"); if (el) el.innerHTML = md(S.mAI.text) + '<span class="caret"></span>';
    });
    actions = (r.actions || []).filter(a => a.name === "set_budget");
  } catch (e) {
    if (e && e.name === "AbortError") S.mAI.err = "Sustabdyta.";
    else { S.mAI.err = (e && e.message) || "Nepavyko gauti atsakymo."; actions = (e?.actions || []).filter(a => a.name === "set_budget"); }
  }
  S.ai.ctrl = prevCtrl;
  S.mAI = {...S.mAI, status: "idle", actions, ctrl: null};
  render();
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-trange],[data-tsel],[data-aimethod],[data-cgadd],[data-cgdel],#maiRun,#maiStop,#maiApply,#maiUndo"); if (!b || b.closest("#sheetRoot")) return;
  e.stopPropagation();
  const d = b.dataset;
  if (d.trange !== undefined) { S.trend.range = +d.trange; render(); return; }
  if (d.tsel !== undefined) { const k = S.sub === "inctrend" ? "icat" : "cat"; S.trend[k] = d.tsel && S.trend[k] !== d.tsel ? d.tsel : null; render(); window.scrollTo({top: 0, behavior: "smooth"}); return; }
  if (d.aimethod) { if (S.mAI.status === "run") return; S.cfg.prefs = {...(S.cfg.prefs || {}), aiMethod: d.aimethod}; saveSettings("prefs"); if (!S.mAI.applied) S.mAI = {status: "idle", text: "", actions: null, applied: null, err: ""}; render(); return; }
  if (d.cgadd) { const g = [...customGroups(), ["Nauja grupė", 0]]; S.cfg.prefs = {...(S.cfg.prefs || {}), customMethod: g}; saveSettings("prefs"); render(); return; }
  if (d.cgdel !== undefined) { const g = customGroups().filter((_, i) => i !== +d.cgdel); S.cfg.prefs = {...(S.cfg.prefs || {}), customMethod: g}; saveSettings("prefs"); render(); return; }
  if (b.id === "maiRun") { runMethodAI(); return; }
  if (b.id === "maiStop") { S.mAI.ctrl?.abort(); return; }
  if (b.id === "maiApply") {
    const snap = snapshot();
    const res = S.mAI.actions.map(a => applyAction(a, snap));
    const fails = res.filter(r => typeof r !== "string").length;
    S.mAI.applied = snap; render(); toast(fails ? `Pritaikyta, ${fails} nepavyko` : "Biudžetai pritaikyti"); return;
  }
  if (b.id === "maiUndo") { if (S.mAI.applied) undoSnapshot(S.mAI.applied); S.mAI.applied = null; render(); toast("Biudžetai atkurti"); }
}, true);
document.addEventListener("input", e => {
  const el = e.target, d = el.dataset || {};
  if (d.cgname === undefined && d.cgpct === undefined) return;
  e.stopPropagation();
  const g = customGroups().map(x => [...x]);
  if (d.cgname !== undefined) g[+d.cgname][0] = el.value.slice(0, 40);
  else g[+d.cgpct][1] = Math.max(0, Math.min(100, parseNum(el.value) || 0));
  S.cfg.prefs = {...(S.cfg.prefs || {}), customMethod: g}; saveSettings("prefs", 600);
  // atnaujinam tik sumą ir mygtuką, kad laukelis neprarastų žymeklio
  const sum = g.reduce((s, x) => s + (+x[1] || 0), 0), sEl = $(".cgroups .row .fine");
  if (sEl) { sEl.textContent = `Iš viso ${fmtN.format(sum)} %`; sEl.classList.toggle("err", Math.abs(sum - 100) > 0.01); }
  const run = $("#maiRun"); if (run) run.disabled = Math.abs(sum - 100) > 0.01;
}, true);

/* ---------- Informaciniai langai ---------- */
const INFO = {
  spend: ["Kur keliauja pinigai", `<p>Ši kortelė rodo, kam išleidai pinigus pasirinktą mėnesį.</p>
    <ul><li><b>Žiedas</b> parodo kiekvienos kategorijos dalį visose išlaidose, o viduryje yra visa mėnesio suma.</li>
    <li><b>Sąraše</b> prie kategorijos matyti suma ir procentas nuo visų išlaidų.</li>
    <li>Jei kategorijai nustatytas <b>biudžetas</b>, juosta rodo, kiek jo išnaudota ir kiek liko. Viršijus ribą, juosta tampa raudona.</li>
    <li>Paspaudus kategoriją atsidaro visos jos operacijos.</li>
    <li>Nuoroda <b>Kitimas laike ir AI analizė</b> atidaro langą, kuriame matyti, kaip išlaidos keitėsi per mėnesius.</li></ul>
    <p>Pervedimai tarp savo sąskaitų čia nėra laikomi išlaidomis.</p>`],
  income: ["Iš kur ateina pajamos", `<p>Kortelė rodo pasirinkto mėnesio pajamas pagal šaltinį: atlyginimas, papildomos pajamos, dovanos ir kt.</p>
    <ul><li>Rodyklė prie sumos parodo, ar pajamos didesnės, ar mažesnės nei praėjusį mėnesį.</li>
    <li>Šaltinį pakeisi paspaudęs operaciją ir pasirinkęs kitą kategoriją.</li>
    <li>Nuoroda <b>Pajamų kitimas laike</b> parodo, kaip pajamos keitėsi per mėnesius.</li></ul>`],
  spendtrend: ["Išlaidų kitimas", `<p>Šiame lange matai, kaip tavo išlaidos keitėsi per mėnesius.</p>
    <ul><li><b>Bendras grafikas</b>: kiekvienas stulpelis yra vienas mėnuo, o spalvos jame yra kategorijos. Palietus stulpelį matyti suma ir didžiausios to mėnesio kategorijos. Einamasis mėnuo rodomas blyškiau, nes dar nesibaigė.</li>
    <li><b>Punktyrinė linija</b> yra vidutinės išlaidos per pilną mėnesį.</li>
    <li>Viršuje matyti vidurkis, praėjęs ir šis mėnuo. Rodyklė parodo, kiek praėjęs mėnuo skyrėsi nuo vidurkio.</li>
    <li><b>Pagal kategorijas</b>: kiekviena eilutė turi mažą grafiką ir vidutinę sumą per mėnesį. Paspaudus eilutę, didelis grafikas rodo tik tą kategoriją.</li>
    <li><b>AI analizė pagal metodą</b>: pasirink metodą (pvz. 50/30/20) arba įrašyk savo procentus. AI suskirstys kategorijas į grupes, palygins su tikslu ir pasiūlys mėnesio ribas. Ribos pritaikomos tik paspaudus mygtuką, ir jas galima atšaukti.</li></ul>`],
  inctrend: ["Pajamų kitimas", `<p>Šiame lange matai, kaip tavo pajamos keitėsi per mėnesius.</p>
    <ul><li><b>Bendras grafikas</b>: kiekvienas stulpelis yra mėnuo, spalvos yra pajamų šaltiniai. Palietus stulpelį matyti suma ir šaltiniai.</li>
    <li><b>Punktyrinė linija</b> yra vidutinės pajamos per pilną mėnesį.</li>
    <li><b>Pagal šaltinius</b>: paspaudus eilutę, grafikas rodo tik tą šaltinį.</li></ul>`]
};
const infoBtn = k => `<button class="ibtn" data-info="${k}" aria-label="Kas čia rodoma?">i</button>`;
function openInfo(k) {
  const [t, html] = INFO[k] || []; if (!t) return;
  const root = $("#sheetRoot");
  root.innerHTML = `<div class="sheet-bg" id="sheetBg"><div class="sheet info-sheet" role="dialog" aria-modal="true" aria-label="${esc(t)}"><div class="grab"></div>
    <h3 class="sheet-h">${esc(t)}</h3><div class="info-body">${html}</div><button class="btn" id="infoOk">Supratau</button></div></div>`;
  const close = () => { root.innerHTML = ""; };
  $("#sheetBg").onclick = e => { if (e.target.id === "sheetBg") close(); };
  $("#infoOk").onclick = close;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-info]"); if (!b || b.closest("#sheetRoot")) return;
  e.stopPropagation(); e.preventDefault(); openInfo(b.dataset.info);
}, true);
