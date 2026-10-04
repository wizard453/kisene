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
  ${w.length ? vWatchCards(w) : ""}
  <section class="card"><div class="sec-h"><h2>Populiarūs</h2></div><div class="txs">${QUICK_PICKS.filter(q => !inWatch(q.symbol)).map(quoteRow).join("")}</div></section>`;
}

/* ---------- Stebimų kortelės su grafikais ---------- */
const W_RANGES = [["1d", "1 d."], ["5d", "5 d."], ["1mo", "1 mėn."], ["6mo", "6 mėn."], ["1y", "1 m."]];
const wRange = () => S.cfg.prefs?.watchRange || "1mo";
function watchCard(item) {
  const rg = wRange(), c = S.mkt.charts[item.symbol + "|" + rg];
  if (!c) loadChart(item.symbol, rg);
  const data = c?.data, pts = data?.points || [], q = S.mkt.quotes[item.symbol];
  const price = data?.price ?? q?.price ?? (pts.length ? pts[pts.length - 1][1] : null), cur = data?.currency || q?.currency;
  const first = pts.length ? (rg === "1d" && data.prevClose ? data.prevClose : pts[0][1]) : null;
  const ch = price != null && first ? chg(price, first) : null;
  return `<button class="wcard" data-chart="${esc(item.symbol)}" data-cname="${esc(item.name || "")}" data-ctype="${esc(item.type || "")}">
    <span class="wc-h"><span class="wc-n"><b>${esc(item.name || item.symbol)}</b><small>${esc(item.symbol)}${MKT_TYPES[item.type] ? " · " + MKT_TYPES[item.type] : ""}</small></span>
      <span class="wc-p">${price != null ? `<b class="num">${priceFmt(price, cur)}</b>` : ""}${ch !== null ? `<small class="num ${ch >= 0 ? "pos" : "negc"}">${ch >= 0 ? "+" : "−"}${pct1(Math.abs(ch))}</small>` : ""}</span></span>
    <span class="wc-c">${!c || c.loading ? `<span class="wc-ld"></span>` : c.err || pts.length < 2 ? `<small class="muted">Grafiko nėra</small>` : priceChart(pts, cur, rg, chartCandles(data, 40), true)}</span>
  </button>`;
}
function vWatchCards(w) {
  return `<section class="card"><div class="sec-h"><h2>Stebimi</h2><span class="aside">${w.length}</span></div>
    <div class="row between wc-bar"><div class="filters ranges">${W_RANGES.map(([k, n]) => `<button class="chip" data-wrange2="${k}" aria-pressed="${wRange() === k}">${n}</button>`).join("")}</div></div>
    ${styleSeg()}
    <div class="wgrid">${w.slice(0, 20).map(watchCard).join("")}</div></section>`;
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
  else if (S.tab === "invest" && S.invView.tab === "market" && !S.sub && range === wRange()) { clearTimeout(loadChart.t); loadChart.t = setTimeout(() => { render(true); renderMarketResults(); }, 120); }
}
function openChart(sym, name, type) {
  S.mkt.sym = {symbol: sym, name: name || sym, type: type || ""};
  S.tab = "invest"; S.sub = "chart"; render(); window.scrollTo(0, 0);
}
const chartStyle = () => S.cfg.prefs?.chartStyle === "candle" ? "candle" : "line";
// žvakės sujungiamos, kad jų būtų ne daugiau kaip max (kitaip telefone jos per plonos)
function aggCandles(c, max) {
  if (!c || c.length <= max) return c || [];
  const k = Math.ceil(c.length / max), out = [];
  for (let i = 0; i < c.length; i += k) {
    const g = c.slice(i, i + k);
    out.push([g[0][0], g[0][1], Math.max(...g.map(x => x[2])), Math.min(...g.map(x => x[3])), g[g.length - 1][4]]);
  }
  return out;
}
// bendras kainos grafikas: linija arba žvakės; mini variante be ašių
function priceChart(pts, cur, range, candles, mini) {
  const W = 340, H = mini ? 96 : 200, L = mini ? 2 : 6, R = mini ? 2 : 50, T = mini ? 6 : 10, B = mini ? 4 : 22, pw = W - L - R, ph = H - T - B;
  const useC = candles && candles.length >= 2;
  const n = useC ? candles.length : pts.length;
  const vals = useC ? candles.flatMap(c => [c[2], c[3]]) : pts.map(p => p[1]);
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.08 || hi * 0.01 || 1; lo -= pad; hi += pad;
  const slot = pw / n;
  const x = i => useC ? L + slot * (i + 0.5) : L + i / (n - 1) * pw, y = v => T + ph - (v - lo) / (hi - lo) * ph;
  const firstV = useC ? candles[0][1] : pts[0][1], lastV = useC ? candles[n - 1][4] : pts[n - 1][1];
  const up = lastV >= firstV, col = up ? "var(--good)" : "var(--crit)";
  let g = "";
  if (!mini) {
    for (let i = 0; i <= 3; i++) { const v = lo + (hi - lo) * i / 3; g += `<line x1="${L}" x2="${L + pw}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" ${i ? 'stroke-dasharray="2 4"' : ""}/><text x="${L + pw + 6}" y="${y(v) + 4}" font-size="10.5" fill="var(--muted)" font-family="var(--f-num)">${kfmt(v).length > 6 ? kfmt(v) : fmtN.format(v >= 100 ? Math.round(v) : Math.round(v * 100) / 100)}</text>`; }
    const tAt = i => useC ? candles[i][0] : pts[i][0];
    const lab = t => { const dt = new Date(t * 1000); return range === "1d" ? pad2(dt.getHours()) + ":" + pad2(dt.getMinutes()) : range === "5d" ? dt.getDate() + " " + MSHORT[dt.getMonth()].toLowerCase() : MSHORT[dt.getMonth()] + " " + String(dt.getFullYear()).slice(2); };
    g += [0, Math.floor((n - 1) / 2), n - 1].map(i => `<text x="${x(i)}" y="${H - 5}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}" font-size="10.5" fill="var(--muted)" font-family="var(--f-body)">${lab(tAt(i))}</text>`).join("");
  }
  let body;
  if (useC) {
    const bw = Math.max(1.2, Math.min(12, slot * 0.66));
    body = candles.map((c, i) => {
      const [, o, h, l, cl] = c, cc = cl >= o ? "var(--good)" : "var(--crit)", xx = x(i).toFixed(1);
      const top = y(Math.max(o, cl)), bh = Math.max(1, Math.abs(y(o) - y(cl)));
      return `<line x1="${xx}" x2="${xx}" y1="${y(h).toFixed(1)}" y2="${y(l).toFixed(1)}" stroke="${cc}" stroke-width="1"/><rect x="${(x(i) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${cc}" rx="${bw > 4 ? 1 : 0}"/>`;
    }).join("");
  } else {
    const d = pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[1]).toFixed(1)).join("");
    body = `<path d="${d}L${x(n - 1)} ${T + ph}L${x(0)} ${T + ph}Z" fill="${col}" opacity=".1"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${mini ? 1.8 : 2}"/>${mini ? "" : `<circle cx="${x(n - 1)}" cy="${y(lastV)}" r="3.5" fill="${col}"/>`}`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Kainos grafikas"${mini ? ' preserveAspectRatio="none"' : ""}>${g}${body}
    ${mini ? "" : `<line class="xh" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="var(--muted)" visibility="hidden"/><rect class="hitarea" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/>`}</svg>`;
}
function chartCandles(data, max) { return chartStyle() === "candle" && data?.ohlc?.length >= 2 ? aggCandles(data.ohlc, max) : null; }
function mountPriceChart(data, range) {
  const pts = data?.points, cur = data?.currency;
  const host = $("#pxChart"); if (!host || !pts || pts.length < 2) return;
  const cand = chartCandles(data, 70);
  host.innerHTML = priceChart(pts, cur, range, cand);
  const svg = host.querySelector("svg"), tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; host.appendChild(tip);
  const xh = svg.querySelector(".xh"), hit = svg.querySelector(".hitarea");
  const n = cand ? cand.length : pts.length, pw = 284;
  const move = e => {
    const rb = svg.getBoundingClientRect(), sc = rb.width / 340, rel = (e.clientX - rb.left) / sc - 6;
    const i = Math.max(0, Math.min(n - 1, cand ? Math.floor(rel / (pw / n)) : Math.round(rel / pw * (n - 1))));
    const xx = cand ? 6 + pw / n * (i + 0.5) : 6 + i / (n - 1) * pw;
    xh.setAttribute("x1", xx); xh.setAttribute("x2", xx); xh.setAttribute("visibility", "visible");
    const t = cand ? cand[i][0] : pts[i][0], dt = new Date(t * 1000);
    const head = `<b>${dt.getDate()} ${MSHORT[dt.getMonth()].toLowerCase()}. ${dt.getFullYear()}${range === "1d" || range === "5d" ? " " + pad2(dt.getHours()) + ":" + pad2(dt.getMinutes()) : ""}</b>`;
    if (cand) {
      const [, o, h, l, c] = cand[i];
      tip.innerHTML = `${head}<span class="num">Atidarymas ${priceFmt(o, cur)}</span><br><span class="num">Uždarymas ${priceFmt(c, cur)}</span><br><span class="num">Didž. ${priceFmt(h, cur)} · Maž. ${priceFmt(l, cur)}</span>`;
    } else {
      tip.innerHTML = `${head}<span class="num">${priceFmt(pts[i][1], cur)}</span> · <span class="num ${pts[i][1] >= pts[0][1] ? "pos" : "negc"}">${chg(pts[i][1], pts[0][1]) >= 0 ? "+" : "−"}${pct1(Math.abs(chg(pts[i][1], pts[0][1])))}</span>`;
    }
    tip.style.left = Math.max(80, Math.min(host.clientWidth - 80, xx * sc)) + "px"; tip.style.top = "6px"; tip.hidden = false;
  };
  hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => { tip.hidden = true; xh.setAttribute("visibility", "hidden"); });
}
const styleSeg = () => `<div class="seg two cstyle" role="radiogroup" aria-label="Grafiko stilius"><button data-cstyle="line" aria-pressed="${chartStyle() === "line"}">Linija</button><button data-cstyle="candle" aria-pressed="${chartStyle() === "candle"}">Žvakės</button></div>`;
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
  ${styleSeg()}
  ${chartStyle() === "candle" && data && !data.ohlc ? `<div class="fine">Žvakėms reikia atnaujinti serverio funkciją market-data. Kol kas rodoma linija.</div>` : ""}
  <div class="chart pxchart" id="pxChart">${!c || c.loading ? `<div class="empty">Įkeliama…</div>` : c.err ? `<div class="empty">${esc(c.err)}</div>` : pts.length < 2 ? `<div class="empty">Šiam laikotarpiui duomenų nėra.</div>` : ""}</div>
  ${data ? `<div class="kv">
    ${data.dayLow != null && data.dayHigh != null ? `<span>Dienos intervalas</span><b class="num">${priceFmt(data.dayLow, data.currency)} – ${priceFmt(data.dayHigh, data.currency)}</b>` : ""}
    ${data.low52 != null && data.high52 != null ? `<span>52 sav. intervalas</span><b class="num">${priceFmt(data.low52, data.currency)} – ${priceFmt(data.high52, data.currency)}</b>` : ""}
    ${pts.length > 1 ? `<span>Laikotarpio min / max</span><b class="num">${priceFmt(Math.min(...pts.map(p => p[1])), data.currency)} – ${priceFmt(Math.max(...pts.map(p => p[1])), data.currency)}</b>` : ""}
    <span>Valiuta</span><b>${esc(data.currency || "—")}</b></div>` : ""}
  ${pos ? `<section class="card"><div class="sec-h"><h2>Mano pozicija</h2></div><div class="kv"><span>Kiekis</span><b class="num">${fmtN.format(r4(pos.qty))}</b><span>Vertė</span><b class="num">${eur(pos.value)}</b><span>Vidutinė kaina</span><b class="num">${eur(pos.cost / pos.qty)}</b><span>Nerealizuotas</span><b class="num ${plClass(pos.unreal)}">${signed(pos.unreal)}</b></div></section>` : ""}
  <div class="row"><button class="btn" id="chartAddInv" style="flex:1">Įrašyti pirkimą ar pardavimą</button></div>`;
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
    ${c ? `<div class="fine">Prijungta ${new Date(c.created_at).toLocaleDateString("lt-LT")}.</div>
      <div class="row"><button class="btn ghost small" type="button" id="brkFull">Sinchronizuoti viską iš naujo</button><button class="btn danger small" type="button" id="brkOff">Atjungti</button></div>`
    : `<ol class="steps">
        <li>Trading 212 programėlėje atidaryk <b>Nustatymai → API (Beta)</b> ir sukurk naują raktą.</li>
        <li>Pažymėk tik <b>skaitymo</b> leidimus: account, portfolio ir visus history. Prekybos leidimų nereikia.</li>
        <li>Nukopijuok API raktą ir slaptą raktą (rodomas tik vieną kartą) ir įklijuok čia.</li></ol>
      <label class="field">API raktas<input id="brkKey" autocomplete="off" required></label>
      <label class="field">Slaptas raktas (API secret)<input id="brkSecret" type="password" autocomplete="off"></label>
      <div class="fine">Veikia Invest ir Stocks ISA sąskaitos.</div>
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
