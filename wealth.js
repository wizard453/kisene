/* Kišenė: turtas (grynoji vertė) laike. Sąskaitų likučiai + investicijų vertė, pokyčio išskaidymas. */
"use strict";

// Sąskaitos įtaka likučiui
function txEffect(t, accId) {
  if (t.type === "inc") return t.account_id === accId ? t.amount : 0;
  if (t.type === "exp") return t.account_id === accId ? -t.amount : 0;
  if (t.type === "trf") return (t.account_id === accId ? -t.amount : 0) + (t.to_account_id === accId ? t.amount : 0);
  return 0;
}
// Likutis dienos pabaigoje: nuo inkaro skaičiuojama į priekį arba atgal
function balanceAt(acc, d, txs) {
  if (!acc.anchor) return null;
  let b = acc.anchor.amount;
  const a = acc.anchor.date;
  for (const t of txs) {
    if (d >= a) { if (t.date > a && t.date <= d) b += txEffect(t, acc.id); }
    else if (t.date > d && t.date <= a) b -= txEffect(t, acc.id);
  }
  return b;
}
const trackedAccounts = () => activeAccounts().filter(a => a.anchor && a.kind !== "invest");

// Investicijų vertė datos pabaigoje (pozicijos pagal kainų istoriją + grynieji platformose)
function invAt(d, series, invTxs) {
  if (!invTxs.length) return 0;
  const ts = Date.parse(d + "T23:59:59Z") / 1000;
  let pos = null;
  if (series) { for (const p of series) { if (p.t <= ts) pos = p.val; else break; } if (pos === null && series.length && invTxs[0].date <= d) pos = series[0].inv; }
  const plat = {}, dep = new Set();
  let cost = 0;
  for (const t of invTxs) {
    if (t.date > d) break;
    const e = txEur(t), f = txEur(t, "fee");
    const p = plat[t.platform] || 0;
    if (t.kind === "deposit") { dep.add(t.platform); plat[t.platform] = p + e - f; }
    else if (t.kind === "withdraw") plat[t.platform] = p - e;
    else if (t.kind === "buy") { plat[t.platform] = p - e - f; cost += e + f; }
    else if (t.kind === "sell") { plat[t.platform] = p + e - f; cost -= e - f; }
    else if (t.kind === "div" || t.kind === "interest") plat[t.platform] = p + e;
    else if (t.kind === "fee") plat[t.platform] = p - e;
  }
  const cash = Object.entries(plat).reduce((s, [k, v]) => s + (dep.has(k) && v > 0 ? v : 0), 0);
  return (pos === null ? Math.max(0, cost) : pos) + cash;
}

// Nuo kada sąskaitos likutis žinomas: nuo pirmos jos operacijos arba nurodyto likučio
function accStart(a, txs) {
  let f = a.anchor.date;
  for (const t of txs) if ((t.account_id === a.id || t.to_account_id === a.id) && t.date < f) f = t.date;
  return f;
}
// Taškai laike. Komponentas rodomas tik nuo tada, kai apie jį yra duomenų; bendra vertė tik kai žinomi visi.
function wealthSeries(range) {
  const txs = [...S.txs.values()];
  const invTxs = [...S.inv.values()].sort((a, b) => a.date.localeCompare(b.date));
  const accs = trackedAccounts();
  if (!accs.length && !invTxs.length) return null;
  const today = todayISO();
  const starts = new Map(accs.map(a => [a.id, accStart(a, txs)]));
  const invStart = invTxs.length ? invTxs[0].date : null;
  const compStarts = [...starts.values(), ...(invStart ? [invStart] : [])];
  const first = compStarts.reduce((m, d) => d < m ? d : m, today);
  const allKnown = compStarts.reduce((m, d) => d > m ? d : m, first);
  const cut = range === "6m" ? addDays(today, -182) : range === "1y" ? addDays(today, -365) : first;
  const start = cut > first ? cut : first;
  const span = (Date.parse(today) - Date.parse(start)) / 86400000;
  const step = span > 800 ? 30 : span > 200 ? 7 : span > 60 ? 3 : 1;
  const dates = [];
  for (let d = start; d < today; d = addDays(d, step)) dates.push(d);
  dates.push(today);
  const series = S.inv.size ? valueSeries() : null;
  const p = S.inv.size ? portfolio() : null;
  const hasAcc = accs.some(a => a.kind !== "loan"), hasDebt = accs.some(a => a.kind === "loan");
  const out = dates.map(d => {
    let acc = null, debt = null;
    for (const a of accs) {
      if (d < starts.get(a.id)) continue;
      const b = balanceAt(a, d, txs);
      if (a.kind === "loan") debt = (debt || 0) + Math.min(0, b); else acc = (acc || 0) + b;
    }
    const inv = invStart && d >= invStart ? (d === today && p ? p.totalValue : invAt(d, series, invTxs)) : null;
    const total = d >= allKnown ? (acc || 0) + (inv || 0) + (debt || 0) : null;
    return {d, acc: hasAcc ? acc : null, debt: hasDebt ? debt : null, inv, total};
  });
  return out.length > 1 ? out : null;
}
// Kiek laiko apima duomenys (dienomis), kad būtų rodomi tik prasmingi laikotarpiai
function wealthSpan() {
  const pts = wealthSeries("all");
  return pts ? (Date.parse(todayISO()) - Date.parse(pts[0].d)) / 86400000 : 0;
}

// Pokyčio išskaidymas: sutaupyta iš pajamų, investicijų prieaugis, kita
function wealthChange(all) {
  const pts = all.filter(p => p.total != null);
  if (pts.length < 2) return null;
  const d0 = pts[0].d, d1 = pts[pts.length - 1].d;
  const accIds = new Set(trackedAccounts().map(a => a.id));
  let saved = 0;
  for (const t of S.txs.values()) {
    if (t.date <= d0 || t.date > d1 || !accIds.has(t.account_id)) continue;
    if (t.type === "inc") saved += t.amount; else if (t.type === "exp") saved -= t.amount;
  }
  const invTxs = [...S.inv.values()];
  const depPlats = new Set(invTxs.filter(t => t.kind === "deposit").map(t => t.platform));
  let contrib = 0;
  for (const t of invTxs) {
    if (t.date <= d0 || t.date > d1) continue;
    const e = txEur(t), f = txEur(t, "fee");
    if (depPlats.has(t.platform)) { if (t.kind === "deposit") contrib += e - f; else if (t.kind === "withdraw") contrib -= e; }
    else if (t.kind === "buy") contrib += e + f; else if (t.kind === "sell") contrib -= e - f;
  }
  const dInv = (pts[pts.length - 1].inv || 0) - (pts[0].inv || 0);
  const market = invTxs.length ? dInv - contrib : 0;
  const delta = pts[pts.length - 1].total - pts[0].total;
  let repaid = 0;
  for (const t of S.txs.values()) if (t.type === "trf" && t.date > d0 && t.date <= d1 && isLoanAcc(t.to_account_id)) repaid += t.amount;
  return {delta, saved, market, repaid, other: delta - saved - market, start: pts[0].total, end: pts[pts.length - 1].total, d0};
}

const W_SERIES = [["total", "Grynoji vertė", "var(--ink)"], ["acc", "Sąskaitos", "var(--c1)"], ["inv", "Investicijos", "var(--c7)"], ["debt", "Skolos", "var(--c8)"]];
// Mažas grafikas (apžvalgos kortelei ir komponentų kortelėms): viena linija savo mastelyje
function wealthChart(all, compact, key, color) {
  key = key || "total";
  const pts = all.filter(p => p[key] != null);
  if (pts.length < 2) return "";
  const W = 340, H = 64, T = 6, B = 4, ph = H - T - B;
  const vals = pts.map(p => p[key]);
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.05 || 1; lo -= pad; hi += pad;
  const n = pts.length;
  const x = i => 2 + i / (n - 1) * (W - 4), y = v => T + ph - (v - lo) / (hi - lo) * ph;
  const d = pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[key]).toFixed(1)).join("");
  const up = vals[vals.length - 1] >= vals[0];
  const col = color || (up ? "var(--good)" : "var(--crit)");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pokytis laike" preserveAspectRatio="none"><path d="${d}L${x(pts.length - 1)} ${H}L${x(0)} ${H}Z" fill="${col}" opacity=".12"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.8" vector-effect="non-scaling-stroke"/></svg>`;
}
// Didelis grafikas: kiekvienas komponentas atskira linija, juos galima išjungti
function wealthBigChart(pts, hidden) {
  const W = 340, H = 200, L = 46, R = 8, T = 10, B = 22, pw = W - L - R, ph = H - T - B;
  const keys = W_SERIES.filter(([k]) => !hidden.includes(k) && pts.some(p => p[k] != null));
  const vals = keys.flatMap(([k]) => pts.map(p => p[k]).filter(v => v != null));
  if (!vals.length) return `<div class="empty">Pasirink bent vieną liniją.</div>`;
  let lo = Math.min(0, ...vals), hi = Math.max(...vals);
  const step = niceMax((hi - lo) / 3 || Math.abs(hi) / 3 || 1); lo = Math.floor(lo / step) * step; hi = lo + step * Math.max(1, Math.ceil((hi - lo) / step));
  const x = i => L + i / (pts.length - 1) * pw, y = v => T + ph - (v - lo) / (hi - lo) * ph;
  let g = "";
  for (let v = lo; v <= hi + 1e-6; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" ${Math.abs(v) > 1e-6 ? 'stroke-dasharray="2 4"' : ""}/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)" font-family="var(--f-num)">${kfmt(v)}</text>`;
  const lb = i => { const dt = new Date(pts[i].d + "T12:00"); return MSHORT[dt.getMonth()] + " " + String(dt.getFullYear()).slice(2); };
  g += [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map(i => `<text x="${x(i)}" y="${H - 5}" text-anchor="${i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}" font-size="10.5" fill="var(--muted)" font-family="var(--f-body)">${lb(i)}</text>`).join("");
  // linija nutrūksta ten, kur duomenų nėra
  const path = k => { let d = "", on = false; pts.forEach((p, i) => { if (p[k] == null) { on = false; return; } d += (on ? "L" : "M") + x(i).toFixed(1) + " " + y(p[k]).toFixed(1); on = true; }); return d; };
  const lines = keys.map(([k, , col]) => `<path d="${path(k)}" fill="none" stroke="${col}" stroke-width="${k === "total" ? 2.6 : 2}" ${k === "total" ? "" : 'stroke-opacity=".9"'} stroke-linejoin="round"/>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Turto vertė laike">${g}${lines}
    <line class="xh" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="var(--muted)" visibility="hidden"/><rect class="hitarea" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/></svg>`;
}
function mountWealth(pts) {
  const host = $("#wealthChart"); if (!host || !pts) return;
  const hidden = S.wealthHidden || [];
  host.innerHTML = wealthBigChart(pts, hidden);
  const svg = host.querySelector("svg"); if (!svg) return;
  const tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; host.appendChild(tip);
  const xh = svg.querySelector(".xh"), hit = svg.querySelector(".hitarea");
  const move = e => {
    const rb = svg.getBoundingClientRect(), sc = rb.width / 340;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(((e.clientX - rb.left) / sc - 46) / (340 - 54) * (pts.length - 1))));
    const p = pts[i], xx = 46 + i / (pts.length - 1) * (340 - 54);
    xh.setAttribute("x1", xx); xh.setAttribute("x2", xx); xh.setAttribute("visibility", "visible");
    const dt = new Date(p.d + "T12:00");
    tip.innerHTML = `<b>${dt.getDate()} ${MSHORT[dt.getMonth()].toLowerCase()}. ${dt.getFullYear()}</b>` + W_SERIES.filter(([k]) => p[k] != null && !hidden.includes(k)).map(([k, n, col]) => `<span class="tip-l"><i style="background:${col}"></i>${n} <span class="num">${p[k] < 0 ? "−" : ""}${eur(Math.abs(p[k]))}</span></span>`).join("") || "Duomenų nėra";
    tip.style.left = Math.max(90, Math.min(host.clientWidth - 90, xx * sc)) + "px"; tip.style.top = "8px"; tip.hidden = false;
  };
  hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => { tip.hidden = true; xh.setAttribute("visibility", "hidden"); });
}

/* ---------- Rodiniai ---------- */
// Apžvalgos kortelė: dabartinė vertė, pokytis per mėnesį ir mažas grafikas
function vWealth() {
  if (S.demo) return "";
  const accs = trackedAccounts();
  const p = S.inv.size ? portfolio() : null;
  if (!accs.length && !p) return "";
  const pts0 = wealthSeries("6m");
  const pts = pts0 && pts0.filter(x => x.total != null).length > 1 ? pts0 : null;
  const total = pts ? pts[pts.length - 1].total : accs.reduce((s, a) => s + (accountBalance(a) || 0), 0) + (p ? p.totalValue : 0);
  let ch = "";
  if (pts) {
    const ref = pts.find(x => x.total != null && x.d >= addDays(todayISO(), -30)) || pts.find(x => x.total != null);
    const dlt = total - ref.total;
    ch = `<span class="wchg ${plClass(dlt)}">${signed(dlt)} per 30 d.</span>`;
  }
  return `<button class="wcard" data-go="more" data-sub="wealth">
    <span class="wtop"><span><small>Turtas</small><b class="num">${eur0(total)}</b>${ch}</span><span class="chev">›</span></span>
    ${pts ? `<span class="spark">${wealthChart(pts, true)}</span>` : ""}
  </button>`;
}
function vWealthPage() {
  const accs = trackedAccounts();
  const untracked = activeAccounts().filter(a => !a.anchor && a.kind !== "invest");
  const span = wealthSpan();
  const ranges = [["6m", "6 mėn.", 182], ["1y", "1 metai", 365], ["all", "Viskas", 0]].filter(([k, , d]) => k === "all" || span > d + 14);
  let range = S.wealthRange || (span > 380 ? "1y" : "all");
  if (!ranges.some(r => r[0] === range)) range = "all";
  S.wealthRangeEff = range;
  const pts = wealthSeries(range);
  let body = `${subHead("Turtas", ["Apžvalga", "overview"])}`;
  if (!pts) return body + `<div class="ai-intro"><p>Turtui skaičiuoti reikia bent vienos sąskaitos su nurodytu likučiu arba investicijų. Likutį nustatysi skiltyje Sąskaitos arba importuodamas Swedbank išrašą.</p><div class="row"><button class="btn" data-go="more" data-sub="accounts">Į sąskaitas</button></div></div>`;
  const c = wealthChange(pts);
  const last = pts[pts.length - 1];
  const hidden = S.wealthHidden || [];
  const comps = W_SERIES.filter(([k]) => k !== "total" && pts.filter(p => p[k] != null).length > 1);
  const firstKnown = k => pts.find(p => p[k] != null);
  const partial = pts.some(p => p.total == null);
  const parts = c ? [["Sutaupyta iš pajamų", c.saved, "Pajamos atėmus išlaidas sekamose sąskaitose"], ["Investicijų prieaugis", c.market, "Kainų pokytis, dividendai ir palūkanos be tavo įnašų"], ["Kita", c.other, "Pervedimai į nesekamas sąskaitas, nesuvesti likučiai ir pan."]].filter(x => Math.abs(x[1]) >= 1 || x[0] !== "Kita") : [];
  const maxAbs = Math.max(...parts.map(x => Math.abs(x[1])), 1);
  body += `
  <div class="sum inv">
    <div class="net"><div class="lbl">Grynoji vertė</div><div class="val num">${eur(last.total ?? 0)}</div>${c ? `<div class="rate ${plClass(c.delta)}">${signed(c.delta)}${c.start > 0 ? " · " + pct1(c.delta / c.start * 100) : ""} nuo ${dayLabel(c.d0)}</div>` : ""}</div>
    <div class="mini"><div class="lbl">Sąskaitos</div><div class="val num"><i style="background:var(--c1)"></i>${eur0(last.acc || 0)}</div></div>
    <div class="mini"><div class="lbl">Investicijos</div><div class="val num"><i style="background:var(--c7)"></i>${eur0(last.inv || 0)}</div></div>
    ${last.debt < 0 ? `<div class="sum-foot">Iš jų atimtos skolos <span class="num negc">−${eur(-last.debt)}</span>${c?.repaid > 0 ? ` · per laikotarpį grąžinta <span class="num">${eur(c.repaid)}</span>` : ""}</div>` : ""}
  </div>
  <section class="card"><div class="sec-h"><h2>Vertė laike</h2></div>
    ${ranges.length > 1 ? `<div class="filters">${ranges.map(([k, n]) => `<button class="chip" data-wrange="${k}" aria-pressed="${range === k}">${n}</button>`).join("")}</div>` : ""}
    <div class="wlegend">${W_SERIES.filter(([k]) => pts.some(p => p[k] != null)).map(([k, n, col]) => `<button class="wl-chip ${hidden.includes(k) ? "off" : ""}" data-wtoggle="${k}"><i style="background:${col}"></i>${n}</button>`).join("")}</div>
    <div class="chart" id="wealthChart"></div>
    ${partial ? `<div class="fine">Grynoji vertė rodoma nuo ${dayLabel(pts.find(p => p.total != null)?.d || last.d)}, kai yra visų dalių duomenys. Anksčiau matyti tik tos dalys, apie kurias yra duomenų.</div>` : ""}
  </section>
  ${comps.length > 1 ? `<section class="card"><div class="sec-h"><h2>Kaip keitėsi kiekviena dalis</h2></div>
    <div class="wparts">${comps.map(([k, n, col]) => { const f = firstKnown(k), dl = last[k] - f[k]; return `<div class="wpcard"><div class="wp-h"><span><i style="background:${col}"></i>${n}</span><b class="num">${last[k] < 0 ? "−" : ""}${eur0(Math.abs(last[k]))}</b></div>
      <div class="wp-d num ${plClass(k === "debt" ? dl : dl)}">${signed(dl)} nuo ${dayLabel(f.d)}</div><div class="wp-c">${wealthChart(pts, true, k, col)}</div></div>`; }).join("")}</div>
    ${comps.some(([k]) => k === "inv") ? `<div class="fine">Investicijos yra rinkos vertė: visų pozicijų vertė tos dienos kaina ir dar neinvestuoti pinigai platformoje. Į ją įeina ir tai, ką įnešei, ir pelnas ar nuostolis. Kiek įnešta ir koks pelnas, matyti skiltyje Investicijos.</div>` : ""}</section>` : ""}
  ${c ? `<section class="card"><div class="sec-h"><h2>Kodėl pasikeitė</h2><span class="aside">nuo ${dayLabel(c.d0)}</span></div>
    <div class="why">
      <div class="wline"><span>Pradžioje</span><b class="num">${eur(c.start)}</b></div>
      ${parts.map(([n, v, hint]) => `<div class="wpart"><div class="wline"><span>${n}<small>${hint}</small></span><b class="num ${plClass(v)}">${signed(v)}</b></div><div class="wbar"><b class="${v < 0 ? "neg" : ""}" style="width:${Math.abs(v) / maxAbs * 100}%"></b></div></div>`).join("")}
      <div class="wline total"><span>Dabar</span><b class="num">${eur(c.end)}</b></div>
    </div></section>` : ""}
  <section class="card"><div class="sec-h"><h2>Sudėtis dabar</h2></div>
    <div class="wealth">${accs.map(a => { const b = accountBalance(a); return `<button class="wrow" data-acc="${esc(a.id)}"><span>${esc(a.name)}</span><span class="num ${b < 0 ? "negc" : ""}">${b < 0 ? "−" : ""}${eur(Math.abs(b))}</span></button>`; }).join("")}
    ${S.inv.size ? `<button class="wrow" data-go="invest"><span>Investicijos</span><span class="num">${eur(last.inv || 0)}</span></button>` : ""}</div>
    ${untracked.length ? `<div class="fine">Neįtrauktos, nes nenurodytas likutis: ${untracked.map(a => esc(a.name)).join(", ")}. <button class="linkbtn" data-sub="accounts">Nustatyti</button></div>` : ""}
  </section>`;
  return body;
}
