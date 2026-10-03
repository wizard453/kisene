/* Kišenė: rinka (bet kurios akcijos, ETF, kriptovaliutos, indekso grafikas, stebimų sąrašas)
   ir investavimo platformų prijungimas (Trading 212). */
"use strict";

const MKT_TYPES = {stock: "Akcija", etf: "ETF", crypto: "Kripto", fund: "Fondas", index: "Indeksas", fx: "Valiuta", commodity: "Žaliava", other: ""};
const QUICK_PICKS = [
  {symbol: "^GSPC", name: "S&P 500", type: "index"}, {symbol: "VWCE.DE", name: "Vanguard FTSE All-World", type: "etf"},
  {symbol: "BTC-EUR", name: "Bitcoin", type: "crypto"}, {symbol: "ETH-EUR", name: "Ethereum", type: "crypto"},
  {symbol: "NVDA", name: "NVIDIA", type: "stock"}, {symbol: "AAPL", name: "Apple", type: "stock"},
  {symbol: "GC=F", name: "Auksas", type: "commodity"}, {symbol: "EURUSD=X", name: "EUR/USD", type: "fx"}
];
const RANGES = [["1d", "1 d."], ["5d", "5 d."], ["1mo", "1 mėn."], ["6mo", "6 mėn."], ["ytd", "Šie m."], ["1y", "1 m."], ["5y", "5 m."], ["max", "Viskas"]];
S.mkt = {q: "", results: null, busy: false, err: "", sym: null, range: "1y", charts: {}, quotes: {}, quotesAt: 0};

const watchlist = () => S.cfg.prefs?.watchlist || [];
const inWatch = sym => watchlist().some(w => w.symbol === sym);
function toggleWatch(item) {
  const list = watchlist();
  const next = inWatch(item.symbol) ? list.filter(w => w.symbol !== item.symbol) : [...list, {symbol: item.symbol, name: item.name || item.symbol, type: item.type || "other"}];
  S.cfg.prefs = {...(S.cfg.prefs || {}), watchlist: next}; saveSettings("prefs");
  toast(inWatch(item.symbol) ? "Pridėta prie stebimų" : "Pašalinta iš stebimų");
}
const chg = (a, b) => b ? (a - b) / b * 100 : 0;
const priceFmt = (v, cur) => cur ? money(v, cur) : fmtN.format(Math.round(v * 100) / 100);

async function loadWatchQuotes(force) {
  const syms = [...new Set([...watchlist().map(w => w.symbol), ...QUICK_PICKS.map(q => q.symbol)])];
  if (!syms.length || !navigator.onLine || !sb) return;
  if (!force && Date.now() - S.mkt.quotesAt < 5 * 60000) return;
  S.mkt.quotesAt = Date.now();
  try {
    const r = await callFunction("market-data", {action: "quote", symbols: syms, currencies: []});
    S.mkt.quotes = {...S.mkt.quotes, ...r.quotes};
    if (S.tab === "invest" && S.invView.tab === "market" && !S.sub) render(true);
  } catch (e) { S.mkt.err = e.message; }
}
let searchT = null;
function marketSearch(q) {
  S.mkt.q = q;
  clearTimeout(searchT);
  if (q.trim().length < 2) { S.mkt.results = null; renderMarketResults(); return; }
  searchT = setTimeout(async () => {
    S.mkt.busy = true; renderMarketResults();
    try { const r = await callFunction("market-data", {action: "search", q: q.trim()}); if (S.mkt.q === q) S.mkt.results = r.results; S.mkt.err = ""; }
    catch (e) { S.mkt.err = e.message; S.mkt.results = []; }
    S.mkt.busy = false; renderMarketResults();
  }, 350);
}
function spark(vals, up) {
  if (!vals || vals.length < 2) return "";
  const lo = Math.min(...vals), hi = Math.max(...vals), W = 64, H = 24;
  const d = vals.map((v, i) => (i ? "L" : "M") + (i / (vals.length - 1) * W).toFixed(1) + " " + (H - 2 - (v - lo) / ((hi - lo) || 1) * (H - 4)).toFixed(1)).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--${up ? "good" : "crit"})" stroke-width="1.6"/></svg>`;
}
function quoteRow(item) {
  const q = S.mkt.quotes[item.symbol];
  const c = q && q.prevClose ? chg(q.price, q.prevClose) : null;
  return `<button class="tx" data-chart="${esc(item.symbol)}" data-cname="${esc(item.name || "")}" data-ctype="${esc(item.type || "")}">
    <span class="dot mk" style="background:var(--${TYPE_COLORS[item.type] || "c12"})">${esc((item.name || item.symbol).replace(/^[\^]/, "")[0] || "?")}</span>
    <div><div class="t1">${esc(item.name || item.symbol)}</div><div class="t2">${esc(item.symbol)}${MKT_TYPES[item.type] ? " · " + MKT_TYPES[item.type] : ""}${item.exchange ? " · " + esc(item.exchange) : ""}</div></div>
    <div class="ract">${q ? `<span class="am num">${priceFmt(q.price, q.currency)}</span><span class="small num ${c === null ? "" : c >= 0 ? "pos" : "negc"}">${c === null ? "" : (c >= 0 ? "+" : "−") + pct1(Math.abs(c))}</span>` : `<span class="chev">›</span>`}</div>
    ${q && q.spark ? `<span class="sp">${spark(q.spark, c === null || c >= 0)}</span>` : ""}</button>`;
}
function renderMarketResults() {
  const host = $("#mktResults"); if (!host) return;
  const r = S.mkt.results;
  host.innerHTML = S.mkt.busy && !r ? `<div class="fine">Ieškoma…</div>` : r === null ? "" : r.length ? `<div class="txs">${r.map(quoteRow).join("")}</div>` : `<div class="txs"><div class="empty">${S.mkt.err ? esc(S.mkt.err) : "Nieko nerasta. Pabandyk simbolį, pvz. AAPL arba VWCE."}</div></div>`;
}
function invSeg() {
  return `<div class="seg invseg"><button data-invtab="portfolio" aria-pressed="${S.invView.tab !== "market"}">Mano portfelis</button><button data-invtab="market" aria-pressed="${S.invView.tab === "market"}">Rinka</button></div>`;
}
function vMarket() {
  loadWatchQuotes();
  const w = watchlist();
  return `${invSeg()}
  <form id="mktForm" class="mktsearch"><input class="search" id="mktQ" type="search" placeholder="Ieškok akcijų, ETF, kriptovaliutų, pvz. Tesla, VWCE, BTC" value="${esc(S.mkt.q)}" autocomplete="off" enterkeyhint="search"></form>
  <div id="mktResults"></div>
  ${w.length ? `<section class="card"><div class="sec-h"><h2>Stebimi</h2><span class="aside">${w.length}</span></div><div class="txs">${w.map(quoteRow).join("")}</div></section>` : ""}
  <section class="card"><div class="sec-h"><h2>Populiarūs</h2></div><div class="txs">${QUICK_PICKS.filter(q => !inWatch(q.symbol)).map(quoteRow).join("")}</div></section>
  <div class="fine">Kainos iš Yahoo Finance, gali vėluoti iki 15–20 min. Tai ne investavimo rekomendacijos.</div>`;
}

/* ---------- Simbolio grafikas ---------- */
async function loadChart(sym, range) {
  const key = sym + "|" + range;
  if (S.mkt.charts[key] && Date.now() - S.mkt.charts[key].at < (range === "1d" ? 5 : 30) * 60000) return;
  S.mkt.charts[key] = {loading: true, at: 0};
  try {
    const r = await callFunction("market-data", {action: "chart", symbol: sym, range});
    S.mkt.charts[key] = {data: r.chart, fx: r.fxToEur, at: Date.now()};
  } catch (e) { S.mkt.charts[key] = {err: e.message, at: Date.now()}; }
  if (S.sub === "chart" && S.mkt.sym?.symbol === sym && S.mkt.range === range) render(true);
}
function openChart(sym, name, type) {
  S.mkt.sym = {symbol: sym, name: name || sym, type: type || ""};
  S.tab = "invest"; S.sub = "chart"; render(); window.scrollTo(0, 0);
}
function priceChart(pts, cur, range) {
  const W = 340, H = 200, L = 6, R = 50, T = 10, B = 22, pw = W - L - R, ph = H - T - B;
  const vals = pts.map(p => p[1]);
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.08 || hi * 0.01 || 1; lo -= pad; hi += pad;
  const x = i => L + i / (pts.length - 1) * pw, y = v => T + ph - (v - lo) / (hi - lo) * ph;
  const up = vals[vals.length - 1] >= vals[0], col = up ? "var(--good)" : "var(--crit)";
  const d = pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[1]).toFixed(1)).join("");
  let g = "";
  for (let i = 0; i <= 3; i++) { const v = lo + (hi - lo) * i / 3; g += `<line x1="${L}" x2="${L + pw}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" ${i ? 'stroke-dasharray="2 4"' : ""}/><text x="${L + pw + 6}" y="${y(v) + 4}" font-size="10.5" fill="var(--muted)" font-family="var(--f-num)">${kfmt(v).length > 6 ? kfmt(v) : fmtN.format(v >= 100 ? Math.round(v) : Math.round(v * 100) / 100)}</text>`; }
  const lab = t => { const dt = new Date(t * 1000); return range === "1d" ? pad2(dt.getHours()) + ":" + pad2(dt.getMinutes()) : range === "5d" ? dt.getDate() + " " + MSHORT[dt.getMonth()].toLowerCase() : MSHORT[dt.getMonth()] + " " + String(dt.getFullYear()).slice(2); };
  g += [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map(i => `<text x="${x(i)}" y="${H - 5}" text-anchor="${i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}" font-size="10.5" fill="var(--muted)" font-family="var(--f-body)">${lab(pts[i][0])}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Kainos grafikas">${g}
    <path d="${d}L${x(pts.length - 1)} ${T + ph}L${x(0)} ${T + ph}Z" fill="${col}" opacity=".1"/>
    <path d="${d}" fill="none" stroke="${col}" stroke-width="2"/>
    <circle cx="${x(pts.length - 1)}" cy="${y(vals[vals.length - 1])}" r="3.5" fill="${col}"/>
    <line class="xh" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="var(--muted)" visibility="hidden"/>
    <rect class="hitarea" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/></svg>`;
}
function mountPriceChart(pts, cur, range) {
  const host = $("#pxChart"); if (!host || !pts || pts.length < 2) return;
  host.innerHTML = priceChart(pts, cur, range);
  const svg = host.querySelector("svg"), tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; host.appendChild(tip);
  const xh = svg.querySelector(".xh"), hit = svg.querySelector(".hitarea");
  const move = e => {
    const rb = svg.getBoundingClientRect(), sc = rb.width / 340;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(((e.clientX - rb.left) / sc - 6) / 284 * (pts.length - 1))));
    const xx = 6 + i / (pts.length - 1) * 284; xh.setAttribute("x1", xx); xh.setAttribute("x2", xx); xh.setAttribute("visibility", "visible");
    const dt = new Date(pts[i][0] * 1000);
    tip.innerHTML = `<b>${dt.getDate()} ${MSHORT[dt.getMonth()].toLowerCase()}. ${dt.getFullYear()}${range === "1d" || range === "5d" ? " " + pad2(dt.getHours()) + ":" + pad2(dt.getMinutes()) : ""}</b><span class="num">${priceFmt(pts[i][1], cur)}</span> · <span class="num ${pts[i][1] >= pts[0][1] ? "pos" : "negc"}">${chg(pts[i][1], pts[0][1]) >= 0 ? "+" : "−"}${pct1(Math.abs(chg(pts[i][1], pts[0][1])))}</span>`;
    tip.style.left = Math.max(70, Math.min(host.clientWidth - 70, xx * sc)) + "px"; tip.style.top = "6px"; tip.hidden = false;
  };
  hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => { tip.hidden = true; xh.setAttribute("visibility", "hidden"); });
}
function myPositionFor(sym) {
  if (!S.inv.size) return null;
  const p = portfolio();
  return p.open.find(x => assetMeta(x.key).yahoo === sym || x.symbol === sym) || null;
}
function vChart() {
  const m = S.mkt.sym; if (!m) { S.sub = null; return vInvest(); }
  const key = m.symbol + "|" + S.mkt.range, c = S.mkt.charts[key];
  if (!c) loadChart(m.symbol, S.mkt.range);
  const data = c?.data;
  const pts = data?.points || [];
  const first = pts.length ? (S.mkt.range === "1d" && data.prevClose ? data.prevClose : pts[0][1]) : null;
  const price = data?.price ?? (pts.length ? pts[pts.length - 1][1] : null);
  const ch = price != null && first ? chg(price, first) : null;
  const pos = myPositionFor(m.symbol);
  const back = S.mkt.from === "portfolio" ? ["Mano portfelis", "invest"] : ["Rinka", "invest"];
  return `<div class="subhead"><button class="linkbtn" data-go="invest" data-invback="${S.mkt.from === "portfolio" ? "portfolio" : "market"}">‹ ${back[0]}</button></div>
  <div class="pxhead"><div><h2>${esc(data?.name || m.name || m.symbol)}</h2><div class="fine">${esc(m.symbol)}${data?.exchange ? " · " + esc(data.exchange) : ""}${MKT_TYPES[m.type] ? " · " + MKT_TYPES[m.type] : ""}</div></div>
    <button class="star ${inWatch(m.symbol) ? "on" : ""}" id="watchBtn" aria-label="${inWatch(m.symbol) ? "Nebestebėti" : "Stebėti"}" aria-pressed="${inWatch(m.symbol)}">★</button></div>
  ${price != null ? `<div class="pxprice"><b class="num">${priceFmt(price, data.currency)}</b>${ch !== null ? `<span class="num ${ch >= 0 ? "pos" : "negc"}">${ch >= 0 ? "+" : "−"}${priceFmt(Math.abs(price - first), data.currency)} (${ch >= 0 ? "+" : "−"}${pct1(Math.abs(ch))})</span><small>${RANGES.find(r => r[0] === S.mkt.range)[1]}</small>` : ""}
    ${data.currency && data.currency !== "EUR" && c.fx ? `<div class="fine">≈ ${eur(price * c.fx)}</div>` : ""}</div>` : ""}
  <div class="filters ranges">${RANGES.map(([k, n]) => `<button class="chip" data-mrange="${k}" aria-pressed="${S.mkt.range === k}">${n}</button>`).join("")}</div>
  <div class="chart pxchart" id="pxChart">${!c || c.loading ? `<div class="empty">Įkeliama…</div>` : c.err ? `<div class="empty">${esc(c.err)}</div>` : pts.length < 2 ? `<div class="empty">Šiam laikotarpiui duomenų nėra.</div>` : ""}</div>
  ${data ? `<div class="kv">
    ${data.dayLow != null && data.dayHigh != null ? `<span>Dienos intervalas</span><b class="num">${priceFmt(data.dayLow, data.currency)} – ${priceFmt(data.dayHigh, data.currency)}</b>` : ""}
    ${data.low52 != null && data.high52 != null ? `<span>52 sav. intervalas</span><b class="num">${priceFmt(data.low52, data.currency)} – ${priceFmt(data.high52, data.currency)}</b>` : ""}
    ${pts.length > 1 ? `<span>Laikotarpio min / max</span><b class="num">${priceFmt(Math.min(...pts.map(p => p[1])), data.currency)} – ${priceFmt(Math.max(...pts.map(p => p[1])), data.currency)}</b>` : ""}
    <span>Valiuta</span><b>${esc(data.currency || "—")}</b></div>` : ""}
  ${pos ? `<section class="card"><div class="sec-h"><h2>Mano pozicija</h2></div><div class="kv"><span>Kiekis</span><b class="num">${fmtN.format(r4(pos.qty))}</b><span>Vertė</span><b class="num">${eur(pos.value)}</b><span>Vidutinė kaina</span><b class="num">${eur(pos.cost / pos.qty)}</b><span>Nerealizuotas</span><b class="num ${plClass(pos.unreal)}">${signed(pos.unreal)}</b></div></section>` : ""}
  <div class="row"><button class="btn" id="chartAddInv" style="flex:1">Įrašyti pirkimą ar pardavimą</button></div>
  <div class="fine">Kainos iš Yahoo Finance, gali vėluoti. Tai ne investavimo rekomendacija.</div>`;
}

/* ---------- Investavimo platformų prijungimas ---------- */
S.broker = {status: null, busy: false, err: "", loadedAt: 0, positions: null, summary: null};
async function brokerStatus(force) {
  if (!sb || !navigator.onLine || (!force && Date.now() - S.broker.loadedAt < 10 * 60000)) return;
  S.broker.loadedAt = Date.now();
  try { const r = await callFunction("broker-sync", {action: "status"}); S.broker.status = r.connections || []; S.broker.err = ""; }
  catch (e) { S.broker.status = S.broker.status || []; S.broker.err = e.status === 404 ? "" : e.message; S.broker.missing = e.status === 404; }
  if (S.tab === "invest" && !S.sub) render(true);
}
const t212Conn = () => (S.broker.status || []).find(c => c.platform === "t212");
function vBrokerCard() {
  if (S.broker.missing) return "";
  const c = t212Conn();
  if (!c) return `<button class="brk" id="brkConnect"><span class="brk-ic">${icon("arrowin", 18)}</span><span><b>Prijungti Trading 212</b><small>Operacijos ir pozicijos atsinaujins automatiškai</small></span><span class="chev">›</span></button>`;
  const last = c.last_sync ? new Date(c.last_sync).toLocaleString("lt-LT", {month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"}) : "dar nesinchronizuota";
  const p = S.broker.summary, mine = S.inv.size ? portfolio().plats.find(x => /trading ?212/i.test(x.name)) : null;
  return `<div class="brk on"><span class="brk-ic">${icon("swap", 18)}</span><span><b>Trading 212 prijungta</b><small>${S.broker.busy ? "Sinchronizuojama…" : "Paskutinį kartą " + last}${S.broker.err ? ` · <span class="err">${esc(S.broker.err)}</span>` : ""}</small></span>
    <span class="row nowrap"><button class="btn small" id="brkSync" ${S.broker.busy ? "disabled" : ""}>Atnaujinti</button><button class="linkbtn" id="brkMenu" aria-label="Nustatymai">⋯</button></span></div>
    ${S.broker.posNote ? `<div class="fine">${S.broker.posNote}</div>` : ""}`;
}
function openBrokerSheet() {
  const c = t212Conn();
  const root = $("#sheetRoot"); const close = () => { root.innerHTML = ""; };
  root.innerHTML = `<div class="sheet-bg" id="sheetBg"><form class="sheet" id="brkForm" role="dialog" aria-modal="true" aria-label="Trading 212">
    <div class="grab"></div><h3 class="sheet-h">${c ? "Trading 212" : "Prijungti Trading 212"}</h3>
    ${c ? `<div class="fine">Prijungta ${new Date(c.created_at).toLocaleDateString("lt-LT")}. Raktai saugomi užšifruoti serveryje ir programėlei neatskleidžiami.</div>
      <div class="row"><button class="btn ghost small" type="button" id="brkFull">Sinchronizuoti viską iš naujo</button><button class="btn danger small" type="button" id="brkOff">Atjungti</button></div>`
    : `<ol class="steps">
        <li>Trading 212 programėlėje atidaryk <b>Nustatymai → API (Beta)</b> ir sukurk naują raktą.</li>
        <li>Pažymėk tik <b>skaitymo</b> leidimus: account, portfolio ir visus history. Prekybos leidimų nereikia.</li>
        <li>Nukopijuok API raktą ir slaptą raktą (rodomas tik vieną kartą) ir įklijuok čia.</li></ol>
      <label class="field">API raktas<input id="brkKey" autocomplete="off" required></label>
      <label class="field">Slaptas raktas (API secret)<input id="brkSecret" type="password" autocomplete="off"></label>
      <div class="fine">Veikia tik Invest ir Stocks ISA sąskaitos. Raktai saugomi užšifruoti tavo Supabase serveryje ir naudojami tik duomenims nuskaityti.</div>
      <div id="brkErr" class="err" hidden></div>
      <button class="btn" id="brkSave">Prijungti</button>`}
    <button class="btn ghost" type="button" id="brkClose">Uždaryti</button></form></div>`;
  $("#sheetBg").onclick = e => { if (e.target.id === "sheetBg") close(); };
  $("#brkClose").onclick = close;
  if ($("#brkFull")) $("#brkFull").onclick = () => { close(); brokerSync(true); };
  if ($("#brkOff")) $("#brkOff").onclick = async () => {
    close();
    try { await callFunction("broker-sync", {action: "disconnect", platform: "t212"}); S.broker.status = (S.broker.status || []).filter(x => x.platform !== "t212"); render(); toast("Trading 212 atjungta. Importuotos operacijos liko."); }
    catch (e) { toast(e.message); }
  };
  $("#brkForm").onsubmit = async e => {
    e.preventDefault(); if (c) return;
    const btn = $("#brkSave"), er = $("#brkErr"); btn.disabled = true; btn.textContent = "Tikrinama…"; er.hidden = true;
    try {
      await callFunction("broker-sync", {action: "connect", platform: "t212", key: $("#brkKey").value, secret: $("#brkSecret").value});
      close(); toast("Trading 212 prijungta"); S.broker.loadedAt = 0; await brokerStatus(true); brokerSync(false);
    } catch (ex) { er.textContent = ex.message; er.hidden = false; btn.disabled = false; btn.textContent = "Prijungti"; }
  };
}
let brokerTimer = null;
async function brokerSync(full) {
  if (S.broker.busy) return;
  S.broker.busy = true; S.broker.err = ""; render(true);
  try {
    const r = await callFunction("broker-sync", {action: "sync", platform: "t212", full: !!full});
    // apsauga nuo dublikatų su anksčiau iš CSV importuotomis operacijomis
    const fp = t => [t.date, t.kind, (t.isin || t.symbol || "").toUpperCase(), t.kind === "buy" || t.kind === "sell" ? (Math.round(t.qty * 1e4) / 1e4) : Math.round(t.amount * 100)].join("|");
    const have = new Set([...S.inv.values()].filter(t => /trading ?212/i.test(t.platform)).map(fp));
    const rows = [];
    for (const x of r.rows) {
      const id = await stableId("t212:" + x.ext);
      if (S.inv.has(id)) continue;
      const row = {...x, id, amount_eur: x.amount_eur ?? (x.currency === "EUR" ? x.amount : null)};
      if (have.has(fp(row))) continue;
      rows.push(invRow(row));
    }
    if (rows.length) bulkUpsert("inv_tx", rows);
    S.broker.positions = r.positions; S.broker.summary = r.summary;
    // patikrinam, ar pozicijos sutampa su T212
    const p = portfolio(), diffs = [];
    for (const bp of r.positions || []) {
      const mine = p.open.find(x => (bp.isin && x.isin === bp.isin) || x.symbol === bp.symbol);
      if (!mine || Math.abs(mine.qty - bp.qty) > Math.max(1e-4, bp.qty * 0.001)) diffs.push(bp.symbol);
    }
    S.broker.posNote = diffs.length ? `Kiekiai nesutampa su Trading 212: ${diffs.slice(0, 5).map(esc).join(", ")}${diffs.length > 5 ? "…" : ""}. Gali būti, kad dalis istorijos dar neįkelta arba buvo operacijų, kurių API negrąžina. Pabandyk „Sinchronizuoti viską iš naujo“.` : "";
    S.broker.status = (S.broker.status || []).map(c => c.platform === "t212" ? {...c, last_sync: new Date().toISOString()} : c);
    toast(rows.length ? `Trading 212: ${rows.length} naujos operacijos` : "Trading 212: naujų operacijų nėra");
    clearTimeout(brokerTimer);
    if (!r.complete) { toast("Istorija ilga, likusi dalis bus įkelta po minutės"); brokerTimer = setTimeout(() => brokerSync(false), 65000); }
    refreshMarket(true);
  } catch (e) { S.broker.err = e.message; }
  S.broker.busy = false; render(true);
}
// automatinė sinchronizacija atidarius investicijas, jei praėjo daugiau nei 6 valandos
function brokerAuto() {
  const c = t212Conn();
  if (c && !S.broker.busy && (!c.last_sync || Date.now() - Date.parse(c.last_sync) > 6 * 3600000)) brokerSync(false);
}
