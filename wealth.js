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

function wealthSeries(range) {
  const txs = [...S.txs.values()];
  const invTxs = [...S.inv.values()].sort((a, b) => a.date.localeCompare(b.date));
  const accs = trackedAccounts();
  if (!accs.length && !invTxs.length) return null;
  const today = todayISO();
  let first = today;
  for (const a of accs) { if (a.anchor.date < first) first = a.anchor.date; }
  for (const t of txs) if (accs.some(a => a.id === t.account_id || a.id === t.to_account_id) && t.date < first) first = t.date;
  if (invTxs.length && invTxs[0].date < first) first = invTxs[0].date;
  const cut = range === "6m" ? addDays(today, -182) : range === "1y" ? addDays(today, -365) : first;
  const start = cut > first ? cut : first;
  const span = (Date.parse(today) - Date.parse(start)) / 86400000;
  const step = span > 800 ? 30 : span > 200 ? 7 : span > 60 ? 3 : 1;
  const dates = [];
  for (let d = start; d < today; d = addDays(d, step)) dates.push(d);
  dates.push(today);
  const series = S.inv.size ? valueSeries() : null;
  const p = S.inv.size ? portfolio() : null;
  const out = dates.map(d => {
    let acc = 0, debt = 0;
    for (const a of accs) { const b = balanceAt(a, d, txs); if (a.kind === "loan") debt += Math.min(0, b); else acc += b; }
    const inv = d === today && p ? p.totalValue : invAt(d, series, invTxs);
    return {d, acc, debt, inv, total: acc + inv + debt};
  });
  return out.length > 1 ? out : null;
}

// Pokyčio išskaidymas: sutaupyta iš pajamų, investicijų prieaugis, kita
function wealthChange(pts) {
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
  const dInv = pts[pts.length - 1].inv - pts[0].inv;
  const market = invTxs.length ? dInv - contrib : 0;
  const delta = pts[pts.length - 1].total - pts[0].total;
  let repaid = 0;
  for (const t of S.txs.values()) if (t.type === "trf" && t.date > d0 && t.date <= d1 && isLoanAcc(t.to_account_id)) repaid += t.amount;
  return {delta, saved, market, repaid, other: delta - saved - market, start: pts[0].total, end: pts[pts.length - 1].total};
}

function wealthChart(pts, compact) {
  const W = 340, H = compact ? 64 : 190, L = compact ? 2 : 46, R = compact ? 2 : 8, T = compact ? 6 : 10, B = compact ? 4 : 22, pw = W - L - R, ph = H - T - B;
  const stacked = !compact && pts.every(p => p.acc >= 0 && p.inv >= 0) && (pts.some(p => p.inv > 0) || pts.some(p => p.debt < 0)) && pts.some(p => p.acc > 0);
  const vals = pts.map(p => p.total).concat(stacked ? [0, ...pts.map(p => p.acc + p.inv), ...pts.map(p => p.debt)] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (compact) { const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.05 || 1; lo -= pad; hi += pad; }
  else { const step = niceMax((hi - lo) / 3 || Math.abs(hi) / 3 || 1); lo = stacked ? 0 : Math.floor(lo / step) * step; hi = lo + step * Math.max(1, Math.ceil((hi - lo) / step)); }
  const x = i => L + i / (pts.length - 1) * pw, y = v => T + ph - (v - lo) / (hi - lo) * ph;
  const line = k => pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(k(p)).toFixed(1)).join("");
  let g = "";
  if (!compact) {
    const step = (hi - lo) / 3;
    for (let i = 0; i <= 3; i++) { const v = lo + step * i; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" ${i ? 'stroke-dasharray="2 4"' : ""}/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)" font-family="var(--f-num)">${kfmt(v)}</text>`; }
    const lb = i => { const dt = new Date(pts[i].d + "T12:00"); return MSHORT[dt.getMonth()] + " " + String(dt.getFullYear()).slice(2); };
    g += [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map(i => `<text x="${x(i)}" y="${H - 5}" text-anchor="${i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}" font-size="10.5" fill="var(--muted)" font-family="var(--f-body)">${lb(i)}</text>`).join("");
  }
  const up = pts[pts.length - 1].total >= pts[0].total;
  const col = compact ? (up ? "var(--good)" : "var(--crit)") : "var(--ink)";
  let areas = "";
  if (stacked) {
    const base = `L${x(pts.length - 1)} ${y(0)}L${x(0)} ${y(0)}Z`;
    const accTop = line(p => p.acc);
    const rev = k => pts.map((p, i) => [x(i), y(k(p))]).reverse().map(([a, b]) => `L${a.toFixed(1)} ${b.toFixed(1)}`).join("");
    areas = `<path d="${accTop}${base}" fill="var(--c1)" opacity=".55"/><path d="${accTop}${rev(p => p.acc + p.inv)}Z" fill="var(--c7)" opacity=".5"/>`;
    if (pts.some(p => p.debt < 0)) areas += `<path d="${line(p => p.debt)}${base}" fill="var(--c8)" opacity=".45"/>`;
  } else if (!compact) areas = `<path d="${line(p => p.total)}L${x(pts.length - 1)} ${y(lo)}L${x(0)} ${y(lo)}Z" fill="var(--inc)" opacity=".12"/>`;
  else areas = `<path d="${line(p => p.total)}L${x(pts.length - 1)} ${H}L${x(0)} ${H}Z" fill="${col}" opacity=".1"/>`;
  const last = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Turto vertė laike" ${compact ? 'preserveAspectRatio="none"' : ""}>${g}${areas}
    <path d="${line(p => p.total)}" fill="none" stroke="${col}" stroke-width="${compact ? 1.8 : 2}" ${compact ? 'vector-effect="non-scaling-stroke"' : ""}/>
    ${compact ? "" : `<circle cx="${x(pts.length - 1)}" cy="${y(last.total)}" r="4" fill="var(--ink)" stroke="var(--surface)" stroke-width="2"/>
    <line class="xh" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="var(--muted)" visibility="hidden"/><rect class="hitarea" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/>`}</svg>`;
}
function mountWealth(pts) {
  const host = $("#wealthChart"); if (!host || !pts) return;
  host.innerHTML = wealthChart(pts);
  const svg = host.querySelector("svg"), tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; host.appendChild(tip);
  const xh = svg.querySelector(".xh"), hit = svg.querySelector(".hitarea");
  const move = e => {
    const rb = svg.getBoundingClientRect(), sc = rb.width / 340;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(((e.clientX - rb.left) / sc - 46) / (340 - 54) * (pts.length - 1))));
    const p = pts[i], xx = 46 + i / (pts.length - 1) * (340 - 54);
    xh.setAttribute("x1", xx); xh.setAttribute("x2", xx); xh.setAttribute("visibility", "visible");
    const dt = new Date(p.d + "T12:00");
    tip.innerHTML = `<b>${dt.getDate()} ${MSHORT[dt.getMonth()].toLowerCase()}. ${dt.getFullYear()}</b>Iš viso <span class="num">${eur(p.total)}</span><br>Sąskaitos <span class="num">${eur(p.acc)}</span><br>Investicijos <span class="num">${eur(p.inv)}</span>${p.debt < 0 ? `<br>Skolos <span class="num">−${eur(-p.debt)}</span>` : ""}`;
    tip.style.left = Math.max(80, Math.min(host.clientWidth - 80, xx * sc)) + "px"; tip.style.top = "8px"; tip.hidden = false;
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
  const pts = wealthSeries("6m");
  const total = pts ? pts[pts.length - 1].total : accs.reduce((s, a) => s + (accountBalance(a) || 0), 0) + (p ? p.totalValue : 0);
  let ch = "";
  if (pts) {
    const ref = pts.find(x => x.d >= addDays(todayISO(), -30)) || pts[0];
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
  const range = S.wealthRange || "1y";
  const pts = wealthSeries(range);
  let body = `${subHead("Turtas", ["Apžvalga", "overview"])}`;
  if (!pts) return body + `<div class="ai-intro"><p>Turtui skaičiuoti reikia bent vienos sąskaitos su nurodytu likučiu arba investicijų. Likutį nustatysi skiltyje Sąskaitos arba importuodamas Swedbank išrašą.</p><div class="row"><button class="btn" data-go="more" data-sub="accounts">Į sąskaitas</button></div></div>`;
  const c = wealthChange(pts);
  const last = pts[pts.length - 1];
  const parts = [["Sutaupyta iš pajamų", c.saved, "Pajamos atėmus išlaidas sekamose sąskaitose"], ["Investicijų prieaugis", c.market, "Kainų pokytis, dividendai ir palūkanos be tavo įnašų"], ["Kita", c.other, "Pervedimai į nesekamas sąskaitas, nesuvesti likučiai ir pan."]].filter(x => Math.abs(x[1]) >= 1 || x[0] !== "Kita");
  const maxAbs = Math.max(...parts.map(x => Math.abs(x[1])), 1);
  body += `
  <div class="sum inv">
    <div class="net"><div class="lbl">Grynoji vertė</div><div class="val num">${eur(last.total)}</div><div class="rate ${plClass(c.delta)}">${signed(c.delta)}${c.start > 0 ? " · " + pct1(c.delta / c.start * 100) : ""} per laikotarpį</div></div>
    <div class="mini"><div class="lbl">Sąskaitos</div><div class="val num"><i style="background:var(--c1)"></i>${eur0(last.acc)}</div></div>
    <div class="mini"><div class="lbl">Investicijos</div><div class="val num"><i style="background:var(--c7)"></i>${eur0(last.inv)}</div></div>
    ${last.debt < 0 ? `<div class="sum-foot">Iš jų atimtos skolos <span class="num negc">−${eur(-last.debt)}</span>${c.repaid > 0 ? ` · per laikotarpį grąžinta <span class="num">${eur(c.repaid)}</span>` : ""}</div>` : ""}
  </div>
  <section class="card"><div class="sec-h"><h2>Vertė laike</h2><div class="keys aside"><span><i style="background:var(--c1)"></i>Sąskaitos</span><span><i style="background:var(--c7)"></i>Investicijos</span>${pts.some(p => p.debt < 0) ? `<span><i style="background:var(--c8)"></i>Skolos</span>` : ""}</div></div>
    <div class="filters">${[["6m", "6 mėn."], ["1y", "1 metai"], ["all", "Viskas"]].map(([k, n]) => `<button class="chip" data-wrange="${k}" aria-pressed="${range === k}">${n}</button>`).join("")}</div>
    <div class="chart" id="wealthChart"></div></section>
  <section class="card"><div class="sec-h"><h2>Kodėl pasikeitė</h2><span class="aside">nuo ${dayLabel(pts[0].d)}</span></div>
    <div class="why">
      <div class="wline"><span>Pradžioje</span><b class="num">${eur(c.start)}</b></div>
      ${parts.map(([n, v, hint]) => `<div class="wpart"><div class="wline"><span>${n}<small>${hint}</small></span><b class="num ${plClass(v)}">${signed(v)}</b></div><div class="wbar"><b class="${v < 0 ? "neg" : ""}" style="width:${Math.abs(v) / maxAbs * 100}%"></b></div></div>`).join("")}
      <div class="wline total"><span>Dabar</span><b class="num">${eur(c.end)}</b></div>
    </div></section>
  <section class="card"><div class="sec-h"><h2>Sudėtis dabar</h2></div>
    <div class="wealth">${accs.map(a => { const b = accountBalance(a); return `<button class="wrow" data-acc="${esc(a.id)}"><span>${esc(a.name)}</span><span class="num ${b < 0 ? "negc" : ""}">${b < 0 ? "−" : ""}${eur(Math.abs(b))}</span></button>`; }).join("")}
    ${S.inv.size ? `<button class="wrow" data-go="invest"><span>Investicijos</span><span class="num">${eur(last.inv)}</span></button>` : ""}</div>
    ${untracked.length ? `<div class="fine">Neįtrauktos, nes nenurodytas likutis: ${untracked.map(a => esc(a.name)).join(", ")}. <button class="linkbtn" data-sub="accounts">Nustatyti</button></div>` : ""}
  </section>`;
  return body;
}
