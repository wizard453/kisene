/* Kišenė: investicijos. Operacijų žurnalas -> pozicijos (vidutinės kainos metodu), pelnas, paskirstymas, vertės istorija. */
"use strict";

const ASSET_TYPES = {etf: "ETF", stock: "Akcijos", crypto: "Kriptovaliutos", bond: "Obligacijos", fund: "Fondai", pension: "Pensijų fondai", deposit: "Indėliai", other: "Kita"};
const TYPE_COLORS = {etf: "c1", stock: "c2", crypto: "c4", bond: "c3", fund: "c7", pension: "c6", deposit: "c10", other: "c12", cash: "c9"};
const assetKey = t => String(t.isin || t.symbol || "").toUpperCase();
const assetMeta = key => (S.cfg.assets || {})[key] || {};

/* ---------- Serverio funkcijos ---------- */
async function callFunction(name, body) {
  if (!sb) throw {message: "Ši funkcija šiuo metu nepasiekiama"};
  if (!navigator.onLine) throw {message: "Nėra interneto ryšio"};
  const {data} = await sb.auth.getSession();
  const token = data.session && data.session.access_token;
  if (!token) throw {message: "Sesija baigėsi. Prisijunk iš naujo."};
  const res = await fetch(CFG.SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/" + name, {
    method: "POST", headers: {"Content-Type": "application/json", Authorization: "Bearer " + token, apikey: CFG.SUPABASE_ANON_KEY}, body: JSON.stringify(body)
  });
  if (!res.ok) {
    let msg = `Duomenų gauti nepavyko (klaida ${res.status})`;
    try { const j = await res.json(); if (j.error) msg = j.error; } catch (e) {}
    if (res.status === 404) msg = `Ši funkcija dar neįjungta (${name}, 404)`;
    throw {message: msg, status: res.status};
  }
  return res.json();
}

/* ---------- Kursai ---------- */
function fxAt(cur, date) {
  if (!cur || cur === "EUR") return 1;
  const h = S.market.hist && S.market.hist[cur + "EUR=X"];
  if (h && h.points && h.points.length) {
    const ts = Date.parse(date + "T23:59:59Z") / 1000;
    let v = null;
    for (const [t, c] of h.points) { if (t <= ts) v = c; else break; }
    if (v === null) v = h.points[0][1];
    return v;
  }
  return S.market.fx[cur] || null;
}
function txEur(t, field) {
  const v = field === "fee" ? t.fee : t.amount;
  if (!v) return 0;
  if (field !== "fee" && t.amount_eur != null) return t.amount_eur;
  if (field === "fee" && t.amount_eur != null && t.amount) return v * t.amount_eur / t.amount;
  const r = fxAt(t.currency, t.date);
  return r ? v * r : v;
}
function priceEur(key) {
  const m = assetMeta(key);
  if (m.manual != null && m.manual !== "") return {price: +m.manual, src: "manual"};
  const q = m.yahoo && S.market.quotes[m.yahoo];
  if (q && q.price != null) { const fx = q.currency === "EUR" ? 1 : S.market.fx[q.currency]; if (fx) return {price: q.price * fx, src: "auto", raw: q}; }
  return null;
}

/* ---------- Portfelis ---------- */
function portfolio() {
  const txs = [...S.inv.values()].sort((a, b) => a.date.localeCompare(b.date) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
  const pos = new Map(), plat = {};
  const P = k => plat[k] || (plat[k] = {name: k || "Be platformos", cash: 0, deposits: 0, withdrawals: 0, interest: 0, fees: 0, divs: 0});
  let realized = 0, divs = 0, interest = 0, fees = 0, approx = false;
  const byYear = {};
  const Y = d => byYear[d.slice(0, 4)] || (byYear[d.slice(0, 4)] = {realized: 0, gains: 0, losses: 0, proceeds: 0, costSold: 0, divs: 0, interest: 0, fees: 0, sales: []});
  for (const t of txs) {
    if (t.currency !== "EUR" && t.amount_eur == null && !(S.market.hist && S.market.hist[t.currency + "EUR=X"])) approx = true;
    const pl = P(t.platform), eurAmt = txEur(t), feeEur = txEur(t, "fee");
    const key = assetKey(t);
    let p = null;
    if (key) {
      p = pos.get(key);
      if (!p) { p = {key, symbol: t.symbol, name: t.name, isin: t.isin, platforms: new Set(), qty: 0, cost: 0, realized: 0, divs: 0, fees: 0, txs: [], first: t.date}; pos.set(key, p); }
      if (t.name && !p.name) p.name = t.name; if (t.symbol && !p.symbol) p.symbol = t.symbol;
      p.txs.push(t);
    }
    switch (t.kind) {
      case "buy": p.qty += t.qty; p.cost += eurAmt + feeEur; p.platforms.add(t.platform); pl.cash -= eurAmt + feeEur; break;
      case "sell": {
        const sold = Math.min(t.qty, p.qty); const avg = p.qty > 0 ? p.cost / p.qty : 0;
        const gain = eurAmt - feeEur - avg * sold;
        p.realized += gain; realized += gain;
        const yr = Y(t.date); yr.realized += gain; if (gain >= 0) yr.gains += gain; else yr.losses -= gain; yr.proceeds += eurAmt - feeEur; yr.costSold += avg * sold;
        yr.sales.push({date: t.date, name: p.name || p.symbol, symbol: p.symbol, qty: sold, proceeds: eurAmt - feeEur, cost: avg * sold, gain, platform: t.platform});
        p.cost -= avg * sold; p.qty -= sold;
        if (p.qty < 1e-9) { p.qty = 0; p.cost = 0; }
        pl.cash += eurAmt - feeEur; break;
      }
      case "split": p.qty += t.qty; break;
      case "div": divs += eurAmt; pl.divs += eurAmt; Y(t.date).divs += eurAmt; pl.cash += eurAmt; if (p) p.divs += eurAmt; break;
      case "interest": interest += eurAmt; pl.interest += eurAmt; Y(t.date).interest += eurAmt; pl.cash += eurAmt; break;
      case "fee": fees += eurAmt; pl.fees += eurAmt; Y(t.date).fees += eurAmt; pl.cash -= eurAmt; if (p) p.fees += eurAmt; break;
      case "deposit": pl.deposits += eurAmt; pl.cash += eurAmt - feeEur; break;
      case "withdraw": pl.withdrawals += eurAmt; pl.cash -= eurAmt; break;
    }
  }
  const open = [], closed = [];
  let posValue = 0, cost = 0, unreal = 0, unpriced = 0;
  for (const p of pos.values()) {
    const meta = assetMeta(p.key);
    p.type = meta.type || "other";
    p.display = meta.name || p.name || p.symbol || p.key;
    if (p.qty > 1e-9) {
      const pr = priceEur(p.key);
      p.price = pr ? pr.price : null; p.src = pr?.src;
      p.value = pr ? p.qty * pr.price : p.cost;
      p.unreal = pr ? p.value - p.cost : 0;
      if (!pr) unpriced++;
      posValue += p.value; cost += p.cost; unreal += p.unreal;
      open.push(p);
    } else if (p.txs.some(t => t.kind === "buy" || t.kind === "sell")) closed.push(p);
  }
  open.sort((a, b) => b.value - a.value);
  const plats = Object.values(plat);
  const hasDeposits = plats.some(x => x.deposits > 0);
  const cash = plats.reduce((s, x) => s + (x.deposits > 0 && x.cash > 0.005 ? x.cash : 0), 0);
  const netDeposits = plats.reduce((s, x) => s + x.deposits - x.withdrawals, 0);
  const totalValue = posValue + cash;
  const totalReturn = unreal + realized + divs + interest - fees;
  return {byYear, open, closed, plats, posValue, cash, cost, unreal, realized, divs, interest, fees, totalValue, totalReturn, netDeposits, hasDeposits, unpriced, approx};
}

/* ---------- Rinkos duomenys ---------- */
let marketBusy = false;
async function refreshMarket(force) {
  if (marketBusy || !S.inv.size || !navigator.onLine || !sb) return;
  if (!force && Date.now() - (S.market.at || 0) < 30 * 60000) return;
  marketBusy = true; renderInvStatus();
  try {
    await resolveAssets();
    const keys = new Set([...S.inv.values()].map(assetKey).filter(Boolean));
    const symbols = [...new Set([...keys].map(k => assetMeta(k)).filter(m => m.yahoo && (m.manual == null || m.manual === "")).map(m => m.yahoo))];
    const curs = new Set([...S.inv.values()].map(t => t.currency));
    for (const s of symbols) { const q = S.market.quotes[s]; if (q?.currency) curs.add(q.currency); }
    for (const k of keys) { const c = assetMeta(k).currency; if (c) curs.add(c); }
    curs.delete("EUR");
    const r = await callFunction("market-data", {action: "quote", symbols, currencies: [...curs]});
    S.market.quotes = {...S.market.quotes, ...r.quotes};
    S.market.fx = {...S.market.fx, ...r.fx};
    S.market.at = Date.now();
    // naujos valiutos, kurios paaiškėjo tik iš kainų
    const extra = [...new Set(Object.values(r.quotes).map(q => q.currency))].filter(c => c && c !== "EUR" && !(c in S.market.fx));
    if (extra.length) { const r2_ = await callFunction("market-data", {action: "quote", symbols: [], currencies: extra}); S.market.fx = {...S.market.fx, ...r2_.fx}; }
    saveMarket();
    S.market.err = "";
    await loadHistory();
  } catch (e) { S.market.err = e.message || "Kainų atnaujinti nepavyko"; }
  marketBusy = false;
  if (S.tab === "invest" || S.sub === "wealth" || S.tab === "overview") render(true); else renderInvStatus();
}
async function loadHistory(force) {
  const txs = [...S.inv.values()]; if (!txs.length) return;
  const from = txs.reduce((m, t) => t.date < m ? t.date : m, "9999");
  const keys = [...new Set(txs.map(assetKey).filter(Boolean))];
  const syms = [...new Set(keys.map(k => assetMeta(k)).filter(m => m.yahoo && (m.manual == null || m.manual === "")).map(m => m.yahoo))];
  const curs = new Set(txs.map(t => t.currency));
  for (const s of syms) { const c = S.market.quotes[s]?.currency; if (c) curs.add(c); }
  curs.delete("EUR");
  const all = [...syms, ...[...curs].map(c => c + "EUR=X")].sort();
  const key = from + "|" + all.join(",");
  if (!force && S.market.histKey === key && Date.now() - (S.market.histAt || 0) < 12 * 3600000) return;
  if (!all.length) return;
  const r = await callFunction("market-data", {action: "history", symbols: all, from});
  S.market.hist = r.history; S.market.histAt = Date.now(); S.market.histKey = key;
  saveMarket();
}
// Kainų simbolių paieška naujoms pozicijoms
async function resolveAssets() {
  const items = [];
  const seen = new Set();
  for (const t of S.inv.values()) {
    const k = assetKey(t); if (!k || seen.has(k)) continue; seen.add(k);
    const m = assetMeta(k);
    if (m.yahoo || m.tried || (m.manual != null && m.manual !== "")) continue;
    if (!["buy", "sell", "split"].includes(t.kind)) continue;
    items.push({key: k, query: t.isin || t.symbol, currency: (m.currency || t.currency || "").toUpperCase()});
  }
  if (!items.length) return;
  const r = await callFunction("market-data", {action: "resolve", items: items.slice(0, 30)});
  const assets = {...(S.cfg.assets || {})};
  for (const it of items.slice(0, 30)) {
    const x = r.resolved[it.key];
    assets[it.key] = {...(assets[it.key] || {}), tried: true, ...(x ? {yahoo: x.symbol, type: assets[it.key]?.type || x.type, name: assets[it.key]?.name || ""} : {})};
  }
  S.cfg.assets = assets; saveSettings("assets");
}

/* ---------- Vertės istorija ---------- */
function valueSeries() {
  const h = S.market.hist; if (!h) return null;
  const txs = [...S.inv.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!txs.length) return null;
  const keys = [...new Set(txs.map(assetKey).filter(Boolean))];
  let base = null;
  for (const k of keys) { const s = h[assetMeta(k).yahoo]; if (s && s.points.length && (!base || s.points.length > base.points.length)) base = s; }
  if (!base) return null;
  const ts = base.points.map(p => p[0]).filter(t => t >= Date.parse(txs[0].date) / 1000 - 7 * 86400);
  const closeAt = (series, t) => { if (!series) return null; let v = null; for (const [x, c] of series.points) { if (x <= t) v = c; else break; } return v ?? series.points[0]?.[1] ?? null; };
  const out = [];
  let i = 0; const qty = {}, cost = {};
  for (const t of ts) {
    const d = new Date(t * 1000).toISOString().slice(0, 10);
    while (i < txs.length && txs[i].date <= d) {
      const x = txs[i++], k = assetKey(x);
      if (!k) continue;
      const e = txEur(x) + (x.kind === "buy" ? txEur(x, "fee") : 0);
      if (x.kind === "buy") { qty[k] = (qty[k] || 0) + x.qty; cost[k] = (cost[k] || 0) + e; }
      else if (x.kind === "sell") { const q = qty[k] || 0, s = Math.min(q, x.qty); cost[k] = q > 0 ? (cost[k] || 0) * (1 - s / q) : 0; qty[k] = q - s; }
      else if (x.kind === "split") qty[k] = (qty[k] || 0) + x.qty;
    }
    let val = 0, inv = 0;
    for (const k of Object.keys(qty)) {
      if (qty[k] <= 1e-9) continue;
      const m = assetMeta(k); inv += cost[k] || 0;
      if (m.manual != null && m.manual !== "") { val += qty[k] * +m.manual; continue; }
      const s = h[m.yahoo]; const c = closeAt(s, t);
      if (c == null) { val += cost[k] || 0; continue; }
      const cur = S.market.quotes[m.yahoo]?.currency || s.currency;
      const fx = cur === "EUR" ? 1 : closeAt(h[cur + "EUR=X"], t) || S.market.fx[cur] || 1;
      val += qty[k] * c * fx;
    }
    out.push({t, val, inv});
  }
  return out.length > 1 ? out : null;
}
function lineChart(series, range) {
  let pts = series;
  if (range !== "all") { const cut = Date.now() / 1000 - (range === "6m" ? 182 : 365) * 86400; pts = series.filter(p => p.t >= cut); }
  if (pts.length < 2) return `<div class="fine">Per mažai duomenų šiam laikotarpiui.</div>`;
  const W = 340, H = 180, L = 44, R = 8, T = 10, B = 22, pw = W - L - R, ph = H - T - B;
  const vals = pts.flatMap(p => [p.val, p.inv]);
  let lo = Math.min(...vals), hi = Math.max(...vals); const padv = (hi - lo) * 0.08 || hi * 0.1 || 1; lo = Math.max(0, lo - padv); hi = hi + padv;
  const step = niceMax((hi - lo) / 3) ; lo = Math.floor(lo / step) * step; hi = lo + step * Math.ceil((hi - lo) / step);
  const x = i => L + i / (pts.length - 1) * pw, y = v => T + ph - (v - lo) / (hi - lo) * ph;
  const path = k => pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[k]).toFixed(1)).join("");
  let grid = "";
  for (let v = lo; v <= hi + 1e-6; v += step) grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-dasharray="${v === lo ? "" : "2 4"}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)" font-family="var(--f-num)">${kfmt(v)}</text>`;
  const fmtD = t => { const d = new Date(t * 1000); return MSHORT[d.getMonth()] + (pts.length > 60 ? " " + String(d.getFullYear()).slice(2) : ""); };
  const lbls = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map(i => `<text x="${x(i)}" y="${H - 5}" text-anchor="${i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}" font-size="10.5" fill="var(--muted)" font-family="var(--f-body)">${fmtD(pts[i].t)}</text>`).join("");
  const last = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Portfelio vertė laike" data-n="${pts.length}">${grid}
    <path d="${path("val")}L${x(pts.length - 1)} ${y(lo)}L${x(0)} ${y(lo)}Z" fill="var(--inc)" opacity=".12"/>
    <path d="${path("inv")}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 3"/>
    <path d="${path("val")}" fill="none" stroke="var(--inc)" stroke-width="2"/>
    <circle cx="${x(pts.length - 1)}" cy="${y(last.val)}" r="4" fill="var(--inc)" stroke="var(--surface)" stroke-width="2"/>
    ${lbls}<line class="xh" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="var(--muted)" stroke-width="1" visibility="hidden"/>
    <rect class="hitarea" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/></svg>`;
}
function mountLine(series) {
  const host = $("#valChart"); if (!host || !series) return;
  host.innerHTML = lineChart(series, S.invView.range);
  const svg = host.querySelector("svg"); if (!svg) return;
  let pts = series; if (S.invView.range !== "all") { const cut = Date.now() / 1000 - (S.invView.range === "6m" ? 182 : 365) * 86400; pts = series.filter(p => p.t >= cut); }
  const tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; host.appendChild(tip);
  const xh = svg.querySelector(".xh"), hit = svg.querySelector(".hitarea");
  const move = e => {
    const rb = svg.getBoundingClientRect(), sc = rb.width / 340;
    const px = (e.clientX - rb.left) / sc; const i = Math.max(0, Math.min(pts.length - 1, Math.round((px - 44) / (340 - 52) * (pts.length - 1))));
    const p = pts[i]; const xx = 44 + i / (pts.length - 1) * (340 - 52);
    xh.setAttribute("x1", xx); xh.setAttribute("x2", xx); xh.setAttribute("visibility", "visible");
    const d = new Date(p.t * 1000);
    tip.innerHTML = `<b>${d.getDate()} ${MSHORT[d.getMonth()].toLowerCase()}. ${d.getFullYear()}</b>Vertė <span class="num">${eur(p.val)}</span><br>Investuota <span class="num">${eur(p.inv)}</span><br>Grąža <span class="num">${signed(p.val - p.inv)}</span>`;
    tip.style.left = Math.max(80, Math.min(host.clientWidth - 80, xx * sc)) + "px"; tip.style.top = "8px"; tip.hidden = false;
  };
  hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => { tip.hidden = true; xh.setAttribute("visibility", "hidden"); });
}

/* ---------- Rodiniai ---------- */
function renderInvStatus() {
  const el = $("#invStatus"); if (!el) return;
  el.innerHTML = marketBusy ? "Atnaujinamos kainos…" : S.market.err ? `<span class="err">${esc(S.market.err)}</span>` : S.market.at ? "Kainos atnaujintos " + new Date(S.market.at).toLocaleString("lt-LT", {month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"}) : "Kainos dar neatnaujintos";
}
const plClass = v => v > 0.005 ? "pos" : v < -0.005 ? "negc" : "";
function vInvest() {
  if (S.sub === "invimport") return vInvImport();
  if (S.sub === "chart") return vChart();
  if (S.invView.tab === "market") return vMarket();
  brokerStatus(); if (S.broker.status) brokerAuto();
  if (!S.inv.size) return `${invSeg()}${vBrokerCard()}<div class="ai-intro"><div class="sec-h"><h2>Investicijos</h2></div>
    <p>Sek savo investicijas visose platformose vienoje vietoje: vertę, pelną, dividendus ir paskirstymą. Importuok operacijų istoriją iš Trading 212, Revolut ar bet kurios kitos platformos CSV failo arba įvesk operacijas ranka.</p>
    <div class="row"><button class="btn" data-sub="invimport">Importuoti CSV</button><button class="btn ghost" id="addInv">Pridėti ranka</button></div>
    <div class="fine">Trading 212: Istorija → Eksportuoti CSV. Revolut: Investavimas → … → Dokumentai → Pajamų / operacijų ataskaita (CSV).</div></div>`;
  const p = portfolio();
  const series = valueSeries();
  const retBase = p.hasDeposits && p.netDeposits > 0 ? p.netDeposits : p.cost;
  const groups = {};
  if (S.invView.group === "type") { for (const x of p.open) { const g = groups[x.type] || (groups[x.type] = {id: x.type, name: ASSET_TYPES[x.type], color: TYPE_COLORS[x.type], v: 0}); g.v += x.value; } if (p.cash > 0) groups.cash = {id: "cash", name: "Grynieji platformose", color: "c9", v: p.cash}; }
  else if (S.invView.group === "platform") { const cols = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]; let ci = 0;
    for (const x of p.open) { const share = x.value / Math.max(1, x.platforms.size); for (const pl of x.platforms) { const g = groups[pl] || (groups[pl] = {id: pl, name: pl || "Be platformos", color: cols[ci++ % 8], v: 0}); g.v += share; } }
    for (const pl of p.plats) if (pl.deposits > 0 && pl.cash > 0.005) { const g = groups[pl.name] || (groups[pl.name] = {id: pl.name, name: pl.name, color: cols[ci++ % 8], v: 0}); g.v += pl.cash; } }
  else { const cols = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]; p.open.forEach((x, i) => groups[x.key] = {id: x.key, name: x.display, color: cols[i % 8], v: x.value}); }
  const slices = topSlices(Object.values(groups));
  const allocTotal = slices.reduce((s, x) => s + x.v, 0);
  const recent = [...S.inv.values()].sort((a, b) => b.date.localeCompare(a.date) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return `${invSeg()}${vBrokerCard()}
  <div class="sum inv">
    <div class="net"><div class="lbl">Portfelio vertė</div><div class="val num">${eur(p.totalValue)}</div><div class="rate ${plClass(p.totalReturn)}">${signed(p.totalReturn)}${retBase > 0 ? " · " + pct1(p.totalReturn / retBase * 100) : ""}</div></div>
    <div class="mini"><div class="lbl">Nerealizuotas</div><div class="val num ${plClass(p.unreal)}">${signed(p.unreal)}</div></div>
    <div class="mini"><div class="lbl">Realizuotas</div><div class="val num ${plClass(p.realized)}">${signed(p.realized)}</div></div>
    <div class="sum-foot">${p.hasDeposits ? `Įnešta grynąja <span class="num">${eur(p.netDeposits)}</span> · ` : ""}Pozicijų savikaina <span class="num">${eur(p.cost)}</span>${p.divs ? ` · dividendai <span class="num">${eur(p.divs)}</span>` : ""}${p.interest ? ` · palūkanos <span class="num">${eur(p.interest)}</span>` : ""}${p.fees ? ` · mokesčiai <span class="num">${eur(p.fees)}</span>` : ""}</div>
  </div>
  <div class="row between"><span class="fine" id="invStatus"></span><button class="linkbtn" id="refreshPrices">Atnaujinti kainas</button></div>
  ${p.unpriced ? `<div class="hint">${p.unpriced} pozicijų kaina nežinoma, jų vertė rodoma pagal savikainą. Atidaryk poziciją ir nurodyk kainos simbolį arba vertę ranka.</div>` : ""}
  ${p.approx ? `<div class="fine">Dalis sumų ne eurais perskaičiuotos dabartiniu kursu, kol neįkelta kursų istorija.</div>` : ""}
  ${series ? `<section class="card"><div class="sec-h"><h2>Vertė laike</h2><div class="keys aside"><span><i style="background:var(--inc)"></i>Vertė</span><span><i class="dash"></i>Investuota</span></div></div>
    <div class="filters">${[["6m", "6 mėn."], ["1y", "1 metai"], ["all", "Viskas"]].map(([k, n]) => `<button class="chip" data-range="${k}" aria-pressed="${S.invView.range === k}">${n}</button>`).join("")}</div>
    <div class="chart" id="valChart"></div></section>` : ""}
  ${allocTotal > 0 ? `<section class="card"><div class="sec-h"><h2>Paskirstymas</h2></div>
    <div class="filters">${[["type", "Pagal tipą"], ["platform", "Pagal platformą"], ["asset", "Pagal poziciją"]].map(([k, n]) => `<button class="chip" data-group="${k}" aria-pressed="${S.invView.group === k}">${n}</button>`).join("")}</div>
    <div class="donut-wrap">${donut(slices, allocTotal, "Vertė")}<div class="legend">${slices.map(s => `<div class="leg"><span class="sw" style="background:var(--${s.color})"></span><span class="nm">${esc(s.name)}</span><span class="am num">${eur0(s.v)} <span style="color:var(--muted)">${Math.round(s.v / allocTotal * 100)}%</span></span><div class="bar"><b style="width:${s.v / allocTotal * 100}%;background:var(--${s.color})"></b></div></div>`).join("")}</div></div></section>` : ""}
  <section class="card"><div class="sec-h"><h2>Pozicijos</h2><span class="aside">${p.open.length}</span></div>
    <div class="txs">${p.open.map(x => `<button class="tx" data-pos="${esc(x.key)}"><span class="dot" style="background:var(--${TYPE_COLORS[x.type]})">${esc((x.symbol || x.display)[0] || "?")}</span><div><div class="t1">${esc(x.display)}</div><div class="t2">${esc(x.symbol || x.isin)} · ${fmtN.format(r4(x.qty))} vnt. · ${esc([...x.platforms].join(", "))}${x.price == null ? " · kaina nežinoma" : ""}</div></div>
      <div class="ract"><span class="am num">${eur(x.value)}</span><span class="small num ${plClass(x.unreal)}">${x.price == null ? "" : signed(x.unreal) + (x.cost > 0 ? " · " + pct1(x.unreal / x.cost * 100) : "")}</span></div></button>`).join("") || `<div class="empty">Atvirų pozicijų nėra.</div>`}</div>
    ${p.cash > 0.005 ? `<div class="fine">Grynieji platformose (apskaičiuota iš įnešimų ir operacijų): <span class="num">${eur(p.cash)}</span></div>` : ""}
    ${p.closed.length ? `<details><summary>Uždarytos pozicijos (${p.closed.length})</summary><div class="txs">${p.closed.map(x => `<button class="tx" data-pos="${esc(x.key)}"><span class="dot" style="background:var(--c9)">${esc((x.symbol || x.display)[0] || "?")}</span><div><div class="t1">${esc(x.display)}</div><div class="t2">${esc(x.symbol || x.isin)}</div></div><span class="am num ${plClass(x.realized)}">${signed(x.realized + x.divs)}</span></button>`).join("")}</div></details>` : ""}
  </section>
  <section class="card"><div class="sec-h"><h2>Operacijos</h2><span class="aside">${S.inv.size}</span></div>
    <div class="txs">${recent.slice(0, 8).map(invItem).join("")}</div>
    ${recent.length > 8 ? `<details><summary>Visos operacijos</summary><div class="txs">${recent.slice(8).map(invItem).join("")}</div></details>` : ""}
  </section>
  <div class="row"><button class="btn ghost" data-sub="invimport">Importuoti CSV</button><button class="btn ghost" id="addInv">Pridėti operaciją</button></div>`;
}
const r4 = v => Math.round(v * 10000) / 10000;
function invItem(t) {
  const out = ["buy", "fee", "withdraw"].includes(t.kind);
  return `<button class="tx" data-inv="${esc(t.id)}"><span class="dot" style="background:var(--${t.kind === "buy" ? "c1" : t.kind === "sell" ? "c2" : t.kind === "div" || t.kind === "interest" ? "c3" : "c9"})">${icon({buy: "plus", sell: "minus", div: "coin", interest: "percent", fee: "receipt", deposit: "arrowin", withdraw: "arrowout", split: "split"}[t.kind])}</span><div><div class="t1">${esc(KIND_LABEL[t.kind])}${t.symbol ? " · " + esc(t.symbol) : ""}</div><div class="t2">${esc(t.platform || "")}${t.qty && t.kind !== "div" ? " · " + fmtN.format(r4(t.qty)) + " vnt." : ""} · ${dayLabel(t.date)}</div></div><span class="am num ${out ? "" : "pos"}">${money(t.amount, t.currency)}</span></button>`;
}

/* ---------- Pozicijos langas ---------- */
function openPosSheet(key) {
  const p = portfolio(); const x = [...p.open, ...p.closed].find(q => q.key === key); if (!x) return;
  const meta = {...assetMeta(key)};
  const root = $("#sheetRoot"); const close = () => { root.innerHTML = ""; };
  const q = meta.yahoo && S.market.quotes[meta.yahoo];
  root.innerHTML = `<div class="sheet-bg" id="sheetBg"><form class="sheet" id="posForm" role="dialog" aria-modal="true" aria-label="Pozicija">
    <div class="grab"></div><h3 class="sheet-h">${esc(x.display)}</h3>
    <div class="fine">${esc([x.symbol, x.isin].filter(Boolean).join(" · "))}${q ? ` · paskutinė kaina ${money(q.price, q.currency)}` : ""}</div>
    <div class="kv">
      <span>Kiekis</span><b class="num">${fmtN.format(r4(x.qty))}</b>
      ${x.qty > 0 ? `<span>Vidutinė kaina</span><b class="num">${eur(x.cost / x.qty)}</b><span>Savikaina</span><b class="num">${eur(x.cost)}</b><span>Vertė</span><b class="num">${eur(x.value)}</b><span>Nerealizuotas</span><b class="num ${plClass(x.unreal)}">${signed(x.unreal)}</b>` : ""}
      <span>Realizuotas</span><b class="num ${plClass(x.realized)}">${signed(x.realized)}</b>
      ${x.divs ? `<span>Dividendai</span><b class="num pos">${eur(x.divs)}</b>` : ""}
    </div>
    <label class="field">Pavadinimas<input id="pName" value="${esc(meta.name || x.name || "")}" maxlength="80"></label>
    <label class="field">Turto tipas<select id="pType">${Object.entries(ASSET_TYPES).map(([k, v]) => `<option value="${k}" ${x.type === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
    <div class="two"><label class="field">Kainos simbolis (Yahoo)<input id="pYahoo" value="${esc(meta.yahoo || "")}" placeholder="pvz. VWCE.DE" autocomplete="off"></label>
      <label class="field">Arba kaina ranka, €<input id="pManual" inputmode="decimal" value="${meta.manual != null && meta.manual !== "" ? String(meta.manual).replace(".", ",") : ""}" placeholder="automatinė"></label></div>
    <div class="fine">Kainos simbolis randamas automatiškai pagal ISIN ar tikerį. Jei kaina neteisinga, įrašyk simbolį iš finance.yahoo.com (pvz. VWCE.DE Xetra biržai, BTC-EUR kriptovaliutai). Pensijų fondams ir indėliams įrašyk vieneto vertę ranka.</div>
    ${meta.yahoo ? `<button class="btn ghost" type="button" id="pChart">${icon("percent", 16)} Kainos grafikas</button>` : ""}
    <div class="row"><button class="btn" style="flex:1">Išsaugoti</button><button class="btn ghost" type="button" id="pClose">Uždaryti</button></div>
    <h3 class="sheet-h">Operacijos</h3>
    <div class="txs">${[...x.txs].reverse().map(invItem).join("")}</div>
  </form></div>`;
  $("#sheetBg").onclick = e => { if (e.target.id === "sheetBg") close(); };
  $("#pClose").onclick = close;
  if ($("#pChart")) $("#pChart").onclick = () => { close(); S.mkt.from = "portfolio"; openChart(meta.yahoo, meta.name || x.display, x.type); };
  root.querySelectorAll("[data-inv]").forEach(b => b.onclick = e => { e.preventDefault(); const t = S.inv.get(b.dataset.inv); close(); if (t) openInvSheet(t); });
  $("#posForm").onsubmit = e => {
    e.preventDefault();
    const man = $("#pManual").value.trim();
    const yahoo = $("#pYahoo").value.trim().toUpperCase();
    S.cfg.assets = {...(S.cfg.assets || {}), [key]: {...meta, name: $("#pName").value.trim(), type: $("#pType").value, yahoo: yahoo || null, manual: man ? parseNum(man) : null, tried: true}};
    saveSettings("assets"); close(); render();
    if (yahoo && yahoo !== meta.yahoo) refreshMarket(true);
  };
}

/* ---------- Investicinės operacijos langas ---------- */
function openInvSheet(t, preset) {
  const isEdit = !!t;
  const lastPlat = [...S.inv.values()].sort((a, b) => b.date.localeCompare(a.date))[0]?.platform || "";
  const st = {kind: t?.kind || "buy", platform: t?.platform ?? lastPlat, symbol: t?.symbol || preset?.symbol || "", name: t?.name || preset?.name || "", isin: t?.isin || "",
    qty: t ? String(t.qty).replace(".", ",") : "", price: t ? String(t.price).replace(".", ",") : preset?.price ? String(Math.round(preset.price * 100) / 100).replace(".", ",") : "", currency: t?.currency || preset?.currency || "EUR",
    amount: t ? String(t.amount).replace(".", ",") : "", fee: t?.fee ? String(t.fee).replace(".", ",") : "", date: t?.date || todayISO(), note: t?.note || "", confirmDel: false};
  const plats = [...new Set([...S.inv.values()].map(x => x.platform).filter(Boolean))];
  const root = $("#sheetRoot"); const close = () => { root.innerHTML = ""; };
  const draw = () => {
    const sec = ["buy", "sell", "split"].includes(st.kind), withSym = sec || st.kind === "div";
    root.innerHTML = `<div class="sheet-bg" id="sheetBg"><form class="sheet" id="invForm" role="dialog" aria-modal="true" aria-label="Investicinė operacija">
      <div class="grab"></div>
      <div class="cats">${Object.entries(KIND_LABEL).map(([k, v]) => `<button type="button" data-kind="${k}" aria-pressed="${st.kind === k}">${v}</button>`).join("")}</div>
      <div class="two"><label class="field">Platforma<input id="iPlat" list="platList" value="${esc(st.platform)}" placeholder="pvz. Trading 212"><datalist id="platList">${plats.map(x => `<option value="${esc(x)}">`).join("")}</datalist></label>
        <label class="field">Data<input id="iDate" type="date" value="${st.date}"></label></div>
      ${withSym ? `<div class="two"><label class="field">Simbolis<input id="iSym" value="${esc(st.symbol)}" placeholder="pvz. VWCE" autocomplete="off"></label><label class="field">Pavadinimas<input id="iName" value="${esc(st.name)}" placeholder="nebūtina"></label></div>
        <label class="field">ISIN (nebūtina, padeda rasti kainą)<input id="iIsin" value="${esc(st.isin)}" placeholder="pvz. IE00BK5BQT80" autocomplete="off"></label>` : ""}
      ${sec ? `<div class="two"><label class="field">Kiekis${st.kind === "split" ? " (+/−)" : ""}<input id="iQty" inputmode="decimal" value="${esc(st.qty)}"></label>${st.kind !== "split" ? `<label class="field">Kaina už vnt.<input id="iPrice" inputmode="decimal" value="${esc(st.price)}"></label>` : "<span></span>"}</div>` : ""}
      ${st.kind !== "split" ? `<div class="two"><label class="field">Bendra suma${sec ? " (be mokesčio)" : ""}<input id="iAmt" inputmode="decimal" value="${esc(st.amount)}" placeholder="${sec ? "kiekis × kaina" : ""}"></label>
        <label class="field">Valiuta<input id="iCur" value="${esc(st.currency)}" maxlength="3" list="curList" autocomplete="off"><datalist id="curList"><option value="EUR"><option value="USD"><option value="GBP"><option value="CHF"></datalist></label></div>
        ${["buy", "sell", "deposit"].includes(st.kind) ? `<label class="field">Mokestis (nebūtina)<input id="iFee" inputmode="decimal" value="${esc(st.fee)}"></label>` : ""}` : ""}
      <div id="iErr" class="err" hidden></div>
      <div class="row"><button class="btn" style="flex:1">${isEdit ? "Išsaugoti" : "Pridėti"}</button><button class="btn ghost" type="button" id="iClose">Uždaryti</button></div>
      ${isEdit ? `<button class="linkbtn" type="button" id="iDel" style="color:var(--crit);align-self:flex-start">Ištrinti operaciją</button>` : ""}
    </form></div>`;
    const keep = () => { const v = id => $(id) ? $(id).value : undefined;
      st.platform = v("#iPlat") ?? st.platform; st.date = v("#iDate") ?? st.date; st.symbol = v("#iSym") ?? st.symbol; st.name = v("#iName") ?? st.name; st.isin = v("#iIsin") ?? st.isin;
      st.qty = v("#iQty") ?? st.qty; st.price = v("#iPrice") ?? st.price; st.amount = v("#iAmt") ?? st.amount; st.currency = v("#iCur") ?? st.currency; st.fee = v("#iFee") ?? st.fee; };
    root.querySelectorAll("[data-kind]").forEach(b => b.onclick = () => { keep(); st.kind = b.dataset.kind; draw(); });
    $("#sheetBg").onclick = e => { if (e.target.id === "sheetBg") close(); };
    $("#iClose").onclick = close;
    if ($("#iDel")) $("#iDel").onclick = () => { const orig = {...t}; removeInv(t.id); close(); render(); toast("Operacija ištrinta", () => { saveInv(orig); render(); }); };
    $("#invForm").onsubmit = e => {
      e.preventDefault(); keep();
      const fail = m => { const er = $("#iErr"); er.textContent = m; er.hidden = false; };
      const sec = ["buy", "sell", "split"].includes(st.kind);
      const qty = parseNum(st.qty) || 0, price = Math.abs(parseNum(st.price) || 0);
      let amount = Math.abs(parseNum(st.amount) || 0);
      if (sec && st.kind !== "split" && !amount && qty && price) amount = qty * price;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(st.date)) return fail("Pasirink datą.");
      if (sec && !st.symbol.trim() && !st.isin.trim()) return fail("Įrašyk simbolį.");
      if (sec && !qty) return fail("Įrašyk kiekį.");
      if (st.kind !== "split" && !(amount > 0)) return fail("Įrašyk sumą.");
      const cur = (st.currency || "EUR").trim().toUpperCase().slice(0, 3);
      saveInv({id: isEdit ? t.id : newId(), date: st.date, kind: st.kind, platform: st.platform.trim(), symbol: st.symbol.trim().toUpperCase(), name: st.name.trim(), isin: st.isin.trim().toUpperCase(),
        qty: st.kind === "split" ? qty : Math.abs(qty), price: price || (qty ? amount / Math.abs(qty) : 0), currency: cur, amount: r2(amount), fee: r2(Math.abs(parseNum(st.fee) || 0)),
        amount_eur: cur === "EUR" ? r2(amount) : (isEdit && t.currency === cur && Math.abs(t.amount - amount) < 0.005 ? t.amount_eur : null), note: st.note, created_at: t?.created_at});
      close(); render(); toast(isEdit ? "Operacija išsaugota" : "Operacija pridėta");
      refreshMarket(true);
    };
  };
  draw();
}

/* ---------- Investicijų importas ---------- */
async function vInvImport() {
  const imp = S.invImp;
  let body = `<div class="subhead"><button class="linkbtn" data-sub="">‹ Investicijos</button><h2>Investicijų importas</h2></div>
  <div class="set-group"><div class="fine">Įkelk operacijų istoriją CSV formatu. Trading 212 ir Revolut failai atpažįstami automatiškai. Bet kokiai kitai platformai priskirk stulpelius pats: užtenka datos, sumos ir, jei tai pirkimai ar pardavimai, simbolio bei kiekio. Tą patį failą įkėlus dar kartą, dublikatų nebus.</div>
    <div class="row"><label class="btn ghost small" for="invFile" style="cursor:pointer">Pasirinkti CSV failą</label><input type="file" id="invFile" accept=".csv,text/csv,.txt" hidden>${imp ? `<span class="fine">${esc(imp.name)}${imp.preset !== "generic" ? " · " + esc(PRESET_NAMES[imp.preset]) + " formatas" : ""}</span>` : ""}</div></div>`;
  if (!imp) return body + vImportsList("inv");
  const {cands, skipped} = await invCandidates(imp);
  const fresh = cands.filter(c => !S.inv.has(c.id)), dup = cands.length - fresh.length;
  imp._fresh = fresh;
  const byKind = {}; for (const c of fresh) byKind[c.kind] = (byKind[c.kind] || 0) + 1;
  body += `<div class="set-group">
    <label class="field">Platformos pavadinimas<input id="invPlat" value="${esc(imp.platform)}" placeholder="pvz. Trading 212" maxlength="60"></label>
    <details ${imp.preset === "generic" ? "open" : ""}><summary>Stulpelių priskyrimas</summary>${mapSelect(imp, INV_FIELDS, "im_")}<div class="fine">Jei tipo stulpelio nėra, pirkimas ar pardavimas nustatomas pagal kiekio ženklą.</div></details>
    <div class="fine">Rasta ${cands.length} operacijų: <b>${fresh.length} naujos</b>${fresh.length ? " (" + Object.entries(byKind).map(([k, v]) => `${v} ${KIND_LABEL[k].toLowerCase()}`).join(", ") + ")" : ""}${dup ? `, ${dup} jau importuotos` : ""}.${Object.keys(skipped).length ? ` Praleista: ${skippedText(skipped)}.` : ""}</div>
    ${fresh.length ? `<div class="prev"><table><thead><tr><th>Data</th><th>Tipas</th><th>Simbolis</th><th style="text-align:right">Kiekis</th><th style="text-align:right">Suma</th></tr></thead><tbody>${fresh.slice(0, 12).map(c => `<tr><td class="num">${c.date}</td><td>${KIND_LABEL[c.kind]}</td><td>${esc(c.symbol || c.isin)}</td><td class="r num">${c.qty ? fmtN.format(r4(c.qty)) : ""}</td><td class="r num">${money(c.amount, c.currency)}</td></tr>`).join("")}</tbody></table></div>${fresh.length > 12 ? `<div class="fine">ir dar ${fresh.length - 12}…</div>` : ""}` : ""}
    ${!imp.platform.trim() && fresh.length ? `<div class="err">Įrašyk platformos pavadinimą.</div>` : ""}
    <div class="row"><button class="btn small" id="doInvImport" ${!fresh.length || !imp.platform.trim() || imp.busy ? "disabled" : ""}>${imp.busy ? "Importuojama…" : `Importuoti ${fresh.length}`}</button><button class="btn ghost small" id="invImpCancel">Atšaukti</button></div>
  </div>`;
  return body;
}
async function doInvImport() {
  const imp = S.invImp; if (!imp || !imp._fresh?.length) return;
  imp.busy = true; render();
  const rows = imp._fresh.map(c => ({...c}));
  // sumos ne eurais: perskaičiuojam tos dienos kursu
  const foreign = [...new Set(rows.filter(r => r.amount_eur == null).map(r => r.currency))];
  if (foreign.length && navigator.onLine) {
    try {
      const from = rows.reduce((m, r) => r.date < m ? r.date : m, "9999");
      const h = (await callFunction("market-data", {action: "history", symbols: foreign.map(c => c + "EUR=X"), from: addDays(from, -7)})).history;
      S.market.hist = {...(S.market.hist || {}), ...h};
      for (const r of rows) if (r.amount_eur == null) { const fx = fxAt(r.currency, r.date); if (fx && h[r.currency + "EUR=X"]) r.amount_eur = r2(r.amount * fx); }
    } catch (e) { console.warn(e); }
  }
  const metaUpd = {...(S.cfg.assets || {})};
  for (const r of rows) { const k = assetKey(r); if (k && r.priceCur && !metaUpd[k]?.currency) metaUpd[k] = {...(metaUpd[k] || {}), currency: r.priceCur}; }
  S.cfg.assets = metaUpd; saveSettings("assets");
  const ds = rows.map(r => r.date).sort();
  const impId = recordImport("inv", {file: imp.name || "", platform: imp.platform.trim(), from: ds[0], to: ds[ds.length - 1]});
  bulkUpsert("inv_tx", rows.map(r => invRow({...r, import_id: impId})));
  S.invImp = null; S.sub = null; S.tab = "invest";
  render(); toast(`Importuota ${rows.length} operacijų`);
  refreshMarket(true);
}
