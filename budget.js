/* Kišenė: biudžeto rodiniai (apžvalga, operacijos, operacijos langas, sąskaitos, kategorijos, biudžetai, pasikartojančios, tikslai). */
"use strict";

/* ---------- Kategorizavimas ---------- */
// dir: "out" (pinigai išėjo) arba "in" (atėjo)
function categorize(text, dir, amount) {
  const low = String(text || "").toLowerCase();
  for (const r of S.cfg.rules || []) {
    if (!r.pattern || !low.includes(r.pattern)) continue;
    if (r.type === "exp" && dir === "in") continue;
    if (r.type === "inc" && dir === "out") continue;
    if (r.max != null && amount != null && amount > r.max) continue;
    if (r.min != null && amount != null && amount < r.min) continue;
    return {type: r.type, cat: r.type === "trf" ? "transfer" : r.cat, to_account_id: r.to_account_id || null, rule: true, sure: true};
  }
  if (dir === "in") {
    for (const [c, re] of INCOME_KEYWORDS) if (re.test(text)) return {type: "inc", cat: c, sure: true};
    return {type: "inc", cat: "iother", sure: false};
  }
  const g = guessExpCat(String(text || ""), amount);
  return {type: "exp", cat: g.cat, sure: g.sure, why: g.why};
}

/* ---------- Skaičiavimai ---------- */
function monthAgg(ym, txs) {
  const a = {inc: 0, exp: 0, inv: 0, debt: 0, byCat: {}, byInc: {}, n: 0};
  for (const t of txs) {
    if (ymOf(t.date) !== ym) continue; a.n++;
    if (t.type === "inc") { a.inc += t.amount; a.byInc[t.cat] = (a.byInc[t.cat] || 0) + t.amount; }
    else if (t.type === "exp") { a.exp += t.amount; a.byCat[t.cat] = (a.byCat[t.cat] || 0) + t.amount; }
    else if (t.type === "trf") {
      if (isInvestAcc(t.to_account_id)) a.inv += t.amount;
      if (isInvestAcc(t.account_id)) a.inv -= t.amount;
      if (isLoanAcc(t.to_account_id)) a.debt += t.amount;
    }
  }
  return a;
}
function insights(ym, txs) {
  const out = []; const cur = monthAgg(ym, txs);
  const prev = [1, 2, 3].map(k => monthAgg(addMonths(ym, -k), txs)).filter(a => a.n > 0);
  for (const c of catsOf("exp")) {
    const b = budgetsFor(ym)[c.id]; const v = cur.byCat[c.id] || 0;
    if (b > 0 && v > b) out.push({lvl: "crit", ic: "!", t: `${c.name}: viršytas biudžetas ${eur(v - b)} (${eur(v)} iš ${eur0(b)}).`});
    else if (b > 0 && v >= b * 0.85) out.push({lvl: "warn", ic: "!", t: `${c.name}: išnaudota ${pct(v / b * 100)} biudžeto, liko ${eur(b - v)}.`});
  }
  if (prev.length) {
    let best = null;
    for (const c of catsOf("exp")) {
      const avg = prev.reduce((s, a) => s + (a.byCat[c.id] || 0), 0) / prev.length; const v = cur.byCat[c.id] || 0;
      if (avg > 0 && v - avg > 20 && v / avg > 1.3) { const d = {c, v, avg, r: v / avg}; if (!best || d.v - d.avg > best.v - best.avg) best = d; }
    }
    if (best) out.push({lvl: "info", ic: "↑", t: `${best.c.name}: ${eur(best.v)} šį mėnesį, tai ${pct((best.r - 1) * 100)} daugiau nei vidutiniškai (${eur(best.avg)}).`});
  }
  if (cur.inc > 0) {
    const rate = (cur.inc - cur.exp) / cur.inc * 100;
    out.push({lvl: rate < 0 ? "warn" : "info", ic: rate < 0 ? "!" : "%", t: rate < 0 ? `Išlaidos viršija pajamas ${eur(cur.exp - cur.inc)}.` : `Sutaupyta ${pct(rate)} pajamų (${eur(cur.inc - cur.exp)})${cur.inv > 0 ? `, iš jų investuota ${eur(cur.inv)}` : ""}.`});
  }
  const seen = {};
  for (let k = 0; k < 4; k++) {
    const m = addMonths(ym, -k);
    for (const t of txs) {
      if (t.type !== "exp" || ymOf(t.date) !== m || !t.note || t.recurring_id) continue;
      const key = t.note.trim().toLowerCase();
      (seen[key] = seen[key] || {name: t.note.trim(), months: new Set(), amt: []}).months.add(m); seen[key].amt.push(t.amount);
    }
  }
  const rec = Object.values(seen).filter(s => s.months.size >= 3 && Math.max(...s.amt) - Math.min(...s.amt) <= Math.max(2, 0.1 * Math.max(...s.amt)) && s.amt.length <= s.months.size + 1);
  if (rec.length) out.push({lvl: "info", ic: "↻", t: `Panašu į prenumeratas: ${rec.slice(0, 4).map(r => r.name + " " + eur(r.amt[0])).join(", ")}. Gali jas pažymėti kaip pasikartojančias.`});
  return out.slice(0, 5);
}

/* ---------- Dažnumas ---------- */
// Kategorijos rikiuojamos pagal tai, kiek kartų naudotos per pastaruosius 120 dienų
function catFreq(type) {
  const cut = addDays(todayISO(), -120), n = {};
  for (const t of S.txs.values()) if (t.type === type && t.date >= cut) n[t.cat] = (n[t.cat] || 0) + 1;
  return n;
}
function catsByFreq(type) {
  const n = catFreq(type), fallback = type === "exp" ? "other" : "iother";
  return catsOf(type).map((c, i) => ({c, i})).sort((a, b) => (a.c.id === fallback) - (b.c.id === fallback) || (n[b.c.id] || 0) - (n[a.c.id] || 0) || a.i - b.i).map(x => x.c);
}
// Dažniausios operacijos (kategorija + aprašymas) greitam įvedimui
function frequentTemplates(type, max) {
  const cut = addDays(todayISO(), -90), m = new Map();
  for (const t of S.txs.values()) {
    if (t.type !== type || t.date < cut || !t.note) continue;
    const k = t.cat + "|" + t.note.trim().toLowerCase();
    const x = m.get(k) || {cat: t.cat, note: t.note.trim(), n: 0, amts: []};
    x.n++; x.amts.push(t.amount); m.set(k, x);
  }
  return [...m.values()].filter(x => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, max || 6)
    .map(x => ({...x, fixed: x.amts.every(v => Math.abs(v - x.amts[0]) < 0.005) ? x.amts[0] : null}));
}

/* ---------- Kiek dar galima išleisti šį mėnesį ---------- */
// Automatiškai atpažinti pasikartojantys mokėjimai, kurių vartotojas dar neišsaugojo (talpinama, kol duomenys nepasikeičia)
let autoRecCache = {k: "", v: []};
function autoRecurring() {
  const k = S.txs.size + ":" + (S.cfg.recurring || []).length + ":" + (S.cfg.prefs?.notRecurring || []).length + ":" + [...S.txs.values()].reduce((m, t) => t.date > m ? t.date : m, "");
  if (autoRecCache.k === k) return autoRecCache.v;
  const saved = S.cfg.recurring || [], notRec = new Set(S.cfg.prefs?.notRecurring || []);
  const recent = addMonths(ymOf(todayISO()), -2) + "-01";
  const v = detectRecurring(null).filter(c => c.strong && c.last >= recent && !notRec.has(c.key)).filter(c => {
    const fake = {id: "_", type: c.type, note: c.note, match: normKey(c.note), account_id: c.account_id, to_account_id: c.to_account_id, amount: c.amount, variable: c.variable};
    return !saved.some(r => recMatches(r, {type: c.type, note: c.note, memo: "", amount: c.amount, account_id: c.account_id, to_account_id: c.to_account_id}) || recMatches(fake, {type: r.type, note: r.note || "", memo: "", amount: r.amount, account_id: r.account_id, to_account_id: r.to_account_id}));
  }).map(c => ({id: "auto:" + c.key, auto: true, active: true, start: "0000-00", mode: "plan", type: c.type, cat: c.type === "trf" ? "transfer" : c.cat, note: c.note, match: normKey(c.note), amount: c.amount, day: c.day, account_id: c.account_id, to_account_id: c.to_account_id, variable: c.variable}));
  autoRecCache = {k, v};
  return v;
}
// Ar pasikartojantis mokėjimas yra išlaida, kurią reikia atidėti (paskolos ir investavimas taip pat)
const recIsOut = r => r.type === "exp" || (r.type === "trf" && (isInvestAcc(r.to_account_id) || isLoanAcc(r.to_account_id) || accById(r.to_account_id)?.kind === "savings" || !r.to_account_id));

/* ---------- Kiek dar galima išleisti šį mėnesį ---------- */
function spendable() {
  const ym = ymOf(todayISO()), today = new Date().getDate(), txs = allTx();
  const a = monthAgg(ym, txs);
  const prev = [1, 2, 3].map(k => monthAgg(addMonths(ym, -k), txs)).filter(x => x.n > 0);
  const avgInc = prev.length ? prev.reduce((s, x) => s + x.inc, 0) / prev.length : 0;
  const pending = [];
  let pendInc = 0;
  const recs = [...(S.cfg.recurring || []), ...(S.demo ? [] : autoRecurring())];
  for (const r of recs) {
    if (!r.active || r.start > ym) continue;
    if (recMode(r) === "auto" ? (r.last && r.last >= ym) : recPaid(r, ym)) continue;
    if (r.type === "inc") { pendInc += r.amount; continue; }
    if (recIsOut(r)) pending.push({name: r.note || catById(r.cat).name, amount: r.amount, day: r.day, auto: !!r.auto, kind: r.type === "trf" ? (isLoanAcc(r.to_account_id) ? "loan" : isInvestAcc(r.to_account_id) ? "invest" : "save") : r.cat === "loan" ? "loan" : "exp"});
  }
  pending.sort((x, y) => x.day - y.day);
  const pendOut = pending.reduce((s, x) => s + x.amount, 0);
  const useAvg = S.cfg.prefs?.heroAvg !== false;
  const known = a.inc + pendInc;
  const expected = useAvg ? Math.max(known, avgInc) : known;
  const waiting = expected - a.inc;
  const [y, m] = ym.split("-").map(Number);
  const daysLeft = new Date(y, m, 0).getDate() - today + 1;
  const saved = Math.max(0, a.inv);
  const left = expected - a.exp - saved - a.debt - pendOut;
  // biudžetuose dar numatyta (likusi biudžeto dalis, kurios dar neišleidai)
  let budLeft = 0;
  for (const c of catsOf("exp")) { const b = budgetsFor(ym)[c.id]; if (b > 0) budLeft += Math.max(0, b - (a.byCat[c.id] || 0)); }
  return {left, perDay: left / daysLeft, daysLeft, expected, received: a.inc, waiting, fromAvg: useAvg && avgInc > known, spent: a.exp, saved, debt: a.debt, pendOut, pending, budLeft, nAuto: pending.filter(x => x.auto).length};
}
/* ---------- Grafikai ---------- */
function donut(slices, total, label, clickable) {
  const R = 60, cx = 75, cy = 75, C = 2 * Math.PI * R; let off = 0;
  const gap = slices.length > 1 ? 2 : 0;
  const arcs = slices.map(s => { const len = s.v / total * C; const a = `<circle ${clickable && s.id !== "_rest" ? `data-catfilter="${esc(s.id)}" class="arc"` : ""} cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--${s.color})" stroke-width="20" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"><title>${esc(s.name)}: ${eur(s.v)}</title></circle>`; off += len; return a; }).join("");
  return `<svg viewBox="0 0 150 150" width="150" height="150" role="img" aria-label="${esc(label)}">
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--line)" stroke-width="20"/>${arcs}
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="10.5" fill="var(--muted)" font-family="var(--f-body)" font-weight="600" letter-spacing=".06em">${esc(label.toUpperCase())}</text>
    <text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="16" fill="var(--ink)" font-family="var(--f-num)">${eur0(total)}</text></svg>`;
}
function topSlices(entries) {
  const sorted = entries.filter(e => e.v > 0).sort((a, b) => b.v - a.v);
  if (sorted.length <= 8) return sorted;
  const rest = sorted.slice(7);
  return [...sorted.slice(0, 7), {id: "_rest", name: `Kitos (${rest.length})`, color: "c9", v: rest.reduce((s, e) => s + e.v, 0)}];
}
function niceMax(v) { if (v <= 0) return 100; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p; return 10 * p; }
const kfmt = v => Math.abs(v) >= 1000 ? (Math.round(v / 100) / 10).toString().replace(".", ",") + " k" : String(Math.round(v));
function bars(ym, txs, monthsArr) {
  const months = monthsArr || [...Array(6)].map((_, i) => addMonths(ym, i - 5));
  const data = months.map(m => { const a = monthAgg(m, txs); return {m, inc: a.inc, exp: a.exp}; });
  const max = niceMax(Math.max(...data.map(d => Math.max(d.inc, d.exp))));
  const W = 340, H = 176, L = 40, Rr = 6, T = 8, B = 24; const pw = W - L - Rr, ph = H - T - B; const colW = pw / months.length; const bw = Math.min(14, colW * 0.3);
  const y = v => T + ph - v / max * ph;
  let g = "";
  for (let i = 0; i <= 2; i++) { const v = max * i / 2; const yy = y(v); g += `<line x1="${L}" x2="${W - Rr}" y1="${yy}" y2="${yy}" stroke="var(--line)" stroke-width="1" ${i ? 'stroke-dasharray="2 4"' : ""}/><text x="${L - 6}" y="${yy + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)" font-family="var(--f-num)">${kfmt(v)}</text>`; }
  const bar = (x, v, col) => { if (v <= 0) return ""; const h = Math.max(2, v / max * ph); const y0 = T + ph, top = y0 - h, r = Math.min(4, h / 2, bw / 2);
    return `<path d="M${x} ${y0}V${top + r}Q${x} ${top} ${x + r} ${top}H${x + bw - r}Q${x + bw} ${top} ${x + bw} ${top + r}V${y0}Z" fill="var(${col})"/>`; };
  let b = "";
  data.forEach((d, i) => {
    const cx = L + colW * i + colW / 2; const sel = d.m === ym;
    b += bar(cx - bw - 1, d.inc, "--inc") + bar(cx + 1, d.exp, "--exp");
    b += `<text x="${cx}" y="${H - 6}" text-anchor="middle" font-size="${months.length > 8 ? 9.5 : 11}" fill="var(${sel ? "--ink" : "--muted"})" font-weight="${sel ? 700 : 500}" font-family="var(--f-body)">${months.length > 8 ? MSHORT[+d.m.slice(5) - 1].slice(0, 3) : MSHORT[+d.m.slice(5) - 1]}</text>`;
    b += `<rect class="hit" data-i="${i}" x="${L + colW * i}" y="${T}" width="${colW}" height="${ph + B}" fill="transparent"/>`;
  });
  return {svg: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pajamos ir išlaidos per 6 mėnesius">${g}<line x1="${L}" x2="${W - Rr}" y1="${T + ph}" y2="${T + ph}" stroke="var(--muted)" stroke-width="1"/>${b}</svg>`, data, colW, L, W};
}
function mountBars(sel, monthsArr) {
  const host = $(sel || "#barChart"); if (!host) return; const r = bars(S.ym, allTx(), monthsArr); host.innerHTML = r.svg;
  const tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; host.appendChild(tip);
  host.querySelectorAll(".hit").forEach(h => {
    const show = () => {
      const d = r.data[+h.dataset.i]; const sc = host.querySelector("svg").getBoundingClientRect().width / r.W;
      tip.innerHTML = `<b>${ymLabel(d.m)}</b>Pajamos <span class="num">${eur(d.inc)}</span><br>Išlaidos <span class="num">${eur(d.exp)}</span><br>Sutaupyta <span class="num">${eur(d.inc - d.exp)}</span>`;
      let x = (r.L + r.colW * (+h.dataset.i) + r.colW / 2) * sc; x = Math.max(80, Math.min(host.clientWidth - 80, x));
      tip.style.left = x + "px"; tip.style.top = "10px"; tip.hidden = false;
    };
    h.addEventListener("pointerenter", show); h.addEventListener("click", show); h.addEventListener("pointerleave", () => tip.hidden = true);
  });
}
/* ---------- Apžvalga ---------- */
function vOverview() {
  const txs = allTx(); const a = monthAgg(S.ym, txs);
  const parts = {hero: ovHero, together: () => ovTogether(), review: ovReview, wealth: () => vWealth(), spend: ovSpend, income: ovIncome, insights: ovInsights, goals: () => vGoalsMini(), trend: ovTrend, recent: ovRecent};
  const body = overviewLayout().filter(x => x.on).map(x => parts[x.id](a, txs)).join("");
  return `
  ${S.demo ? `<div class="banner"><span>Rodomi <b>pavyzdiniai duomenys</b>. Pridėk pirmą operaciją arba importuok banko išrašą, ir jie išnyks.</span><button class="linkbtn" id="hideDemo">Slėpti</button></div>` : ""}
  ${!S.loaded ? `<div class="banner"><span>Įkeliami duomenys…</span></div>` : ""}
  ${emptyMonthHint(a)}
  ${body}
  <button class="linkbtn custom-link" data-go="more" data-sub="look">Tvarkyti apžvalgą</button>`;
}
function emptyMonthHint(a) {
  if (S.demo || a.n || !S.txs.size) return "";
  let last = "";
  for (const t of S.txs.values()) { const m = ymOf(t.date); if (m < S.ym && m > last) last = m; }
  if (!last) return "";
  return `<div class="banner"><span>${esc(ymLabel(S.ym))}: operacijų dar nėra. Naujausi duomenys: ${esc(ymLabel(last))}.</span><button class="linkbtn" data-gomonth="${last}">Rodyti</button></div>`;
}
function ovHero(a, txs) {
  const isNow = S.ym === ymOf(todayISO());
  if (isNow && (txs.length || (S.cfg.recurring || []).length)) {
    const sp = spendable();
    const neg = sp.left < 0;
    const line = (label, v, sign, hint, cls) => `<div class="eq-row ${cls || ""}"><span>${label}${hint ? `<small>${hint}</small>` : ""}</span><b class="num">${sign}${eur(Math.abs(v))}</b></div>`;
    return `<section class="hero ${neg ? "neg" : ""}">
      <div class="lbl">${neg ? "Šį mėnesį trūksta" : "Laisvi pinigai iki mėnesio pabaigos"}</div>
      <div class="big num">${eur0(Math.abs(sp.left))}</div>
      <div class="rate">${neg ? "Išlaidos ir suplanuoti mokėjimai viršija šio mėnesio pajamas." : `Tiek lieka iš šio mėnesio pajamų sumokėjus visas suplanuotas sąskaitas. Tai suma, kurią dar gali išleisti arba atsidėti: apie ${eur0(sp.perDay)} per dieną, liko ${sp.daysLeft} d.`}</div>
      <div class="eq">
        ${line("Pajamos", sp.expected, "+", sp.waiting > 0.5 ? `gauta ${eur0(sp.received)}, dar laukiama ${eur0(sp.waiting)}${sp.fromAvg ? " (pagal 3 mėn. vidurkį)" : ""}` : "")}
        ${line("Jau išleista", sp.spent, "−", "")}
        ${sp.pendOut ? `<details class="eq-pend"><summary>${line("Dar reikės sumokėti", sp.pendOut, "−", `${sp.pending.length} mokėjimai iki mėnesio pabaigos · rodyti`)}</summary>
          <div class="pend-list">${sp.pending.map(x => `<div><span>${esc(x.name)}<small>${x.day} d.${x.kind === "loan" ? " · paskola" : x.kind === "invest" ? " · investavimas" : x.kind === "save" ? " · taupymas" : ""}${x.auto ? " · atpažinta automatiškai" : ""}</small></span><b class="num">−${eur(x.amount)}</b></div>`).join("")}</div>
          ${sp.nAuto ? `<button class="linkbtn" data-sub="recurring">Peržiūrėti pasikartojančius mokėjimus ›</button>` : ""}</details>` : ""}
        ${sp.saved ? line("Investuota", sp.saved, "−", "") : ""}
        ${sp.debt ? line("Paskolų įmokos", sp.debt, "−", "") : ""}
        ${line("Laisvi pinigai", sp.left, sp.left < 0 ? "−" : "=", "", "total")}
      </div>
      ${sp.budLeft > 0 && sp.left > 0 ? `<div class="hfoot">Iš jų biudžetuose dar numatyta ${eur0(Math.min(sp.budLeft, sp.left))}${sp.left > sp.budLeft ? `, nepaskirstyta ${eur0(sp.left - sp.budLeft)}` : ""}.</div>` : ""}
    </section>`;
  }
  const net = a.inc - a.exp;
  const rate = a.inc > 0 ? `Sutaupyta ${pct(net / a.inc * 100)} pajamų` : (a.n ? "Pajamų šį mėnesį nėra" : "Šį mėnesį operacijų dar nėra");
  return `<div class="sum">
    <div class="net"><div class="lbl">Sutaupyta</div><div class="val num ${net < 0 ? "negc" : ""}">${net < 0 ? "−" : ""}${eur(Math.abs(net))}</div><div class="rate">${rate}</div></div>
    <div class="mini"><div class="lbl">Pajamos</div><div class="val num"><i style="background:var(--inc)"></i>${eur(a.inc)}</div></div>
    <div class="mini"><div class="lbl">Išlaidos</div><div class="val num"><i style="background:var(--exp)"></i>${eur(a.exp)}</div></div>
    ${a.inv > 0 || a.debt > 0 ? `<div class="sum-foot">${a.inv > 0 ? `Investuota <span class="num">${eur(a.inv)}</span>` : ""}${a.inv > 0 && a.debt > 0 ? " · " : ""}${a.debt > 0 ? `paskoloms grąžinta <span class="num">${eur(a.debt)}</span>` : ""}</div>` : ""}
  </div>`;
}
function ovReview() {
  if (S.demo) return "";
  const review = reviewGroups().reduce((n, g) => n + g.ids.length, 0);
  return review ? `<button class="review-card" data-go="more" data-sub="review"><span class="ric">${icon("tag", 20)}</span><span><b>${review} operacijos be kategorijos</b><small>Priskirk vienu paspaudimu, programėlė įsimins</small></span><span class="chev">›</span></button>` : "";
}
function legendFor(entries, total, withBudgets) {
  return entries.map(s => {
    const b = withBudgets ? budgetsFor(S.ym)[s.id] : 0; const share = total ? s.v / total * 100 : 0;
    let bud = "", barW = share, barC = `var(--${s.color})`;
    if (b > 0) {
      const u = s.v / b * 100; barW = Math.min(100, u); const cls = u > 100 ? "over" : u >= 85 ? "near" : "";
      if (u > 100) barC = "var(--crit)";
      bud = `<span class="bud ${cls}">${u > 100 ? "Viršyta " + eur(s.v - b) : "Biudžetas " + eur0(b) + " · liko " + eur(b - s.v)}</span>`;
    }
    const tag = s.id === "_rest" || s.noLink ? "div" : "button";
    return `<${tag} class="leg" ${tag === "button" ? (s.go ? `data-go="${s.go}"` : `data-catfilter="${esc(s.id)}"`) : ""}><span class="sw" style="background:var(--${s.color})"></span><span class="nm">${esc(s.name)}${s.tag ? ` <small class="tagm">${s.tag}</small>` : ""}</span><span class="am num">${eur(s.v)} <span class="muted">${total ? Math.round(share) + "%" : ""}</span></span><span class="bar"><b style="width:${barW}%;background:${barC}"></b></span>${bud}</${tag}>`;
  }).join("");
}
function ovSpend(a) {
  const expCats = catsOf("exp");
  const entries = [...expCats, ...Object.keys(a.byCat).filter(id => !expCats.some(c => c.id === id)).map(catById)].map(c => ({id: c.id, name: c.name, color: c.color, v: a.byCat[c.id] || 0}));
  const slices = topSlices(entries);
  const withBudget = expCats.filter(c => budgetsFor(S.ym)[c.id] > 0 && !(a.byCat[c.id] > 0)).map(c => ({id: c.id, name: c.name, color: c.color, v: 0}));
  const rows = legendFor([...entries.filter(e => e.v > 0).sort((x, y) => y.v - x.v), ...withBudget], a.exp, true);
  return `<section class="card">
    <div class="sec-h"><h2>Kur keliauja pinigai</h2>${infoBtn("spend")}<span class="aside num">${eur0(a.exp)}</span></div>
    ${a.exp > 0 || rows ? `<div class="donut-wrap">${donut(slices, a.exp, "Išlaidos", true)}<div class="legend">${rows || '<div class="fine">Išlaidų šį mėnesį nėra.</div>'}</div></div>` : `<div class="empty">Šį mėnesį išlaidų dar nėra.</div>`}
    <button class="linkbtn more-link" data-go="more" data-sub="spendtrend">Kitimas laike ir AI analizė ›</button>
  </section>`;
}
// Investicijų pajamos mėnesį (dividendai, palūkanos, realizuotas pelnas), skaičiuojamos portfelyje
function invIncomeMonth(ym) {
  if (!S.inv.size) return null;
  let div = 0, int = 0, gain = 0;
  for (const t of S.inv.values()) if (ymOf(t.date) === ym) { if (t.kind === "div") div += txEur(t); if (t.kind === "interest") int += txEur(t); }
  const yr = portfolio().byYear[ym.slice(0, 4)];
  if (yr) for (const x of yr.sales) if (ymOf(x.date) === ym) gain += x.gain;
  return {div, int, gain, total: div + int + gain};
}
function ovIncome(a, txs) {
  const incCats = catsOf("inc");
  const entries = [...incCats, ...Object.keys(a.byInc).filter(id => !incCats.some(c => c.id === id)).map(catById)].map(c => ({id: c.id, name: c.name, color: c.color, v: a.byInc[c.id] || 0})).filter(e => e.v > 0).sort((x, y) => y.v - x.v);
  const ii = invIncomeMonth(S.ym);
  const extra = ii && Math.abs(ii.total) >= 0.01 ? [{id: "_inv", name: "Investicijų grąža", color: "c7", v: Math.max(0, ii.total), go: "invest", tag: "portfelyje"}] : [];
  const total = a.inc;
  const prev = monthAgg(addMonths(S.ym, -1), txs).inc;
  if (!entries.length && !extra.length) return `<section class="card"><div class="sec-h"><h2>Iš kur ateina pajamos</h2></div><div class="empty">Šį mėnesį pajamų dar nėra.</div></section>`;
  const slices = topSlices(entries);
  return `<section class="card">
    <div class="sec-h"><h2>Iš kur ateina pajamos</h2>${infoBtn("income")}<span class="aside num">${eur0(total)}${prev > 0 ? ` <span class="${total >= prev ? "pos" : "negc"}">${total >= prev ? "↑" : "↓"} ${pct(Math.abs((total - prev) / prev * 100))}</span>` : ""}</span></div>
    <div class="donut-wrap">${total > 0 ? donut(slices, total, "Pajamos", true) : ""}<div class="legend">${legendFor(entries, total, false)}${legendFor(extra, 0, false)}</div></div>
    ${ii && Math.abs(ii.total) >= 0.01 ? `<div class="fine">Investicijų grąža (dividendai ${eur(ii.div)}, palūkanos ${eur(ii.int)}, pardavimų rezultatas ${signed(ii.gain)}) lieka investavimo platformose, todėl į mėnesio pajamas neįskaičiuojama.</div>` : ""}
    <div class="row between"><span class="fine">Šaltinį pakeisi paspaudęs operaciją.</span><button class="linkbtn" data-go="more" data-sub="cats">Tvarkyti šaltinius</button></div>
    <button class="linkbtn more-link" data-go="more" data-sub="inctrend">Pajamų kitimas laike ›</button>
  </section>`;
}
function ovInsights(a, txs) {
  const ins = insights(S.ym, txs);
  return ins.length ? `<section class="card"><div class="sec-h"><h2>Pastebėjimai</h2><button class="linkbtn aside" data-go="more" data-sub="ai">Klausti AI</button></div><ul class="notes">${ins.map(i => `<li class="${i.lvl}"><span class="ic">${i.ic}</span><span>${esc(i.t)}</span></li>`).join("")}</ul></section>` : "";
}
function ovTrend() {
  return `<section class="card">
    <div class="sec-h"><h2>Pusė metų</h2><div class="keys aside"><span><i style="background:var(--inc)"></i>Pajamos</span><span><i style="background:var(--exp)"></i>Išlaidos</span></div></div>
    <div class="chart" id="barChart"></div>
  </section>`;
}
function ovRecent(a, txs) {
  const recent = txs.filter(t => ymOf(t.date) === S.ym).sort((x, y) => y.date.localeCompare(x.date) || String(y.created_at || "").localeCompare(String(x.created_at || ""))).slice(0, 5);
  return `<section class="card">
    <div class="sec-h"><h2>Naujausios</h2><button class="linkbtn aside" data-go="list">Visos operacijos</button></div>
    ${recent.length ? `<div class="txs">${recent.map(txItem).join("")}</div>` : `<div class="txs"><div class="empty">Operacijų nėra. Spausk + apačioje.</div></div>`}
  </section>`;
}
function vGoalsMini() {
  const goals = (S.cfg.goals || []).filter(g => g.saved < g.target).slice(0, 3);
  if (!goals.length) return "";
  return `<section class="card"><div class="sec-h"><h2>Tikslai</h2><button class="linkbtn aside" data-go="more" data-sub="goals">Visi tikslai</button></div>
    <div class="goals">${goals.map(goalCard).join("")}</div></section>`;
}

/* ---------- Operacijų sąrašas ---------- */
function txItem(t) {
  if (t.type === "trf") {
    const inv = isInvestAcc(t.to_account_id), loan = isLoanAcc(t.to_account_id);
    return `<button class="tx" data-edit="${esc(t.id)}"><span class="dot" style="background:var(--${inv ? "c7" : loan ? "c11" : "c9"})">${icon(inv ? "coin" : loan ? "bank" : "swap")}</span><div><div class="t1">${esc(t.note || (inv ? "Investavimas" : loan ? "Paskolos įmoka" : "Pervedimas"))}</div><div class="t2">${esc(accName(t.account_id))} → ${esc(accName(t.to_account_id))} · ${dayLabel(t.date)}</div></div><span class="am num muted">${eur(t.amount)}</span></button>`;
  }
  const c = catById(t.cat);
  const multi = activeAccounts().length > 1 && t.account_id && t.account_id !== "main" ? " · " + accName(t.account_id) : "";
  return `<button class="tx" data-edit="${esc(t.id)}"><span class="dot" style="background:var(--${c.color})">${catIcon(c)}</span><div><div class="t1">${esc(t.note || c.name)}${t.recurring_id ? ' <span class="rec" title="Pasikartojanti">↻</span>' : ""}</div><div class="t2">${esc(c.name)} · ${dayLabel(t.date)}${esc(multi)}</div></div><span class="am num ${t.type === "inc" ? "pos" : ""}">${t.type === "inc" ? "+" : "−"}${eur(t.amount)}</span></button>`;
}
function vList() {
  const accs = activeAccounts();
  const fc = S.filter.cat ? catById(S.filter.cat) : null;
  const fy = S.filter.cat && S.filter.year ? " · " + S.filter.year : "";
  return `
  <input class="search" id="q" type="search" placeholder="Ieškoti pagal aprašymą ar kategoriją" value="${esc(S.filter.q)}" autocomplete="off">
  <div class="filters">${S.filter.imp ? `<button class="chip on" data-clearimp="1">${icon("receipt", 14)} Vieno failo operacijos ✕</button>` : fc ? `<button class="chip on" data-clearcat="1"><i style="background:var(--${fc.color})"></i>${esc(fc.name)}${fy} ✕</button>` : [["all", "Visos"], ["exp", "Išlaidos"], ["inc", "Pajamos"], ["trf", "Pervedimai"]].map(([k, n]) => `<button class="chip" data-ftype="${k}" aria-pressed="${S.filter.type === k}">${n}</button>`).join("")}
  ${accs.length > 1 ? `<select class="chip" id="fAcc" aria-label="Sąskaita"><option value="all">Visos sąskaitos</option>${accs.map(a => `<option value="${esc(a.id)}" ${S.filter.acc === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>` : ""}</div>
  <div id="listBody">${listBody()}</div>`;
}
function listBody() {
  if (S.filter.imp) {
    const rows = importItems(S.filter.imp).sort((x, y) => y.date.localeCompare(x.date));
    let html = "", last = "";
    for (const t of rows.slice(0, 600)) { if (t.date !== last) { last = t.date; const d = new Date(t.date + "T12:00"); html += `<div class="day">${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()} ${d.getFullYear()}</div>`; } html += txItem(t); }
    return `<div class="fine" style="margin:0 2px 8px">Failo operacijos: ${rows.length}</div><div class="txs">${html || '<div class="empty">Operacijų nebėra.</div>'}</div>`;
  }
  const q = S.filter.q.trim().toLowerCase();
  const allMonths = q.length >= 2 || !!(S.filter.cat && S.filter.year);
  const rows = allTx().filter(t => (q.length >= 2 || (S.filter.cat && S.filter.year ? t.date.startsWith(S.filter.year) : ymOf(t.date) === S.ym)) && (S.filter.cat ? t.cat === S.filter.cat : (S.filter.type === "all" || t.type === S.filter.type)) &&
    (S.filter.acc === "all" || t.account_id === S.filter.acc || t.to_account_id === S.filter.acc) &&
    (!q || (t.note || "").toLowerCase().includes(q) || (t.memo || "").toLowerCase().includes(q) || catById(t.cat).name.toLowerCase().includes(q)))
    .sort((x, y) => y.date.localeCompare(x.date) || String(y.created_at || "").localeCompare(String(x.created_at || "")));
  if (!rows.length) return `<div class="txs"><div class="empty">${q ? "Nieko nerasta." : "Šį mėnesį operacijų nėra."}</div></div>`;
  let html = "", last = "";
  const inc = rows.filter(t => t.type === "inc").reduce((s, t) => s + t.amount, 0), exp = rows.filter(t => t.type === "exp").reduce((s, t) => s + t.amount, 0);
  for (const t of rows.slice(0, 400)) {
    if (t.date !== last) { last = t.date; const d = new Date(t.date + "T12:00"); html += `<div class="day">${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()}${allMonths ? " " + d.getFullYear() : ""}</div>`; }
    html += txItem(t);
  }
  return `<div class="fine" style="margin-bottom:8px">${allMonths ? "Visi mėnesiai · " : ""}${rows.length} operacijos${inc ? ` · pajamos <span class="num">${eur(inc)}</span>` : ""}${exp ? ` · išlaidos <span class="num">${eur(exp)}</span>` : ""}</div><div class="txs">${html}</div>`;
}
/* ---------- Operacijos langas ---------- */
function accOptions(sel, withNone) {
  return activeAccounts().map(a => `<option value="${esc(a.id)}" ${sel === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("") + (withNone ? `<option value="" ${!sel ? "selected" : ""}>Kita (nesekama) sąskaita</option>` : "");
}
function openTxSheet(tx, preset) {
  const isEdit = !!tx && !tx.demo;
  const st = {
    type: tx?.type || preset?.type || "exp", cat: tx?.cat || preset?.cat || null, amount: tx ? String(tx.amount).replace(".", ",") : "",
    date: tx?.date || (S.ym === ymOf(todayISO()) ? todayISO() : S.ym + "-01"), note: tx?.note || "",
    account_id: tx?.account_id || (S.filter.acc !== "all" ? S.filter.acc : "main"), to_account_id: tx?.to_account_id ?? (activeAccounts().find(a => a.kind === "invest")?.id || ""),
    repeat: !!preset?.repeat, learn: true, catTouched: !!tx || !!preset?.cat, more: false
  };
  if (!accById(st.account_id)) st.account_id = activeAccounts()[0]?.id || "main";
  const origCat = tx?.cat;
  const root = $("#sheetRoot");
  const close = () => { root.innerHTML = ""; document.removeEventListener("keydown", onKey); };
  const onKey = e => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  const sameNote = () => st.note.trim() ? [...S.txs.values()].filter(t => t.id !== tx?.id && t.type === st.type && t.cat !== st.cat && (t.note || "").trim().toLowerCase() === st.note.trim().toLowerCase()).length : 0;
  const draw = () => {
    const isT = st.type === "trf";
    const cats = isT ? [] : catsByFreq(st.type);
    if (!isT && !cats.some(c => c.id === st.cat)) st.cat = cats[0]?.id || (st.type === "exp" ? "other" : "iother");
    const shown = st.more || cats.length <= 8 ? cats : cats.slice(0, 7).concat(cats.some((c, i) => i >= 7 && c.id === st.cat) ? [cats.find(c => c.id === st.cat)] : []);
    const tpl = !isEdit && !isT ? frequentTemplates(st.type, 6) : [];
    const multiAcc = activeAccounts().length > 1 || isT;
    const showLearn = isEdit && !isT && st.note.trim() && origCat !== st.cat;
    const n = showLearn ? sameNote() : 0;
    root.innerHTML = `<div class="sheet-bg" id="sheetBg"><form class="sheet" id="txForm" role="dialog" aria-modal="true" aria-label="${isEdit ? "Redaguoti operaciją" : "Nauja operacija"}">
      <div class="grab"></div>
      <div class="seg three"><button type="button" data-st="exp" aria-pressed="${st.type === "exp"}">Išlaidos</button><button type="button" data-st="inc" aria-pressed="${st.type === "inc"}">Pajamos</button><button type="button" data-st="trf" aria-pressed="${isT}">Pervedimas</button></div>
      ${tpl.length ? `<div class="tpl" aria-label="Dažnos operacijos">${tpl.map((x, i) => { const c = catById(x.cat); return `<button type="button" data-tpl="${i}"><span class="tdot" style="background:var(--${c.color})">${icon(c.icon || CAT_ICONS[c.id] || "tag", 14)}</span>${esc(x.note)}${x.fixed ? ` <span class="num muted">${eur(x.fixed)}</span>` : ""}</button>`; }).join("")}</div>` : ""}
      <div class="amt"><input id="fAmt" inputmode="decimal" placeholder="0,00" value="${esc(st.amount)}" aria-label="Suma" autocomplete="off"><span>€</span></div>
      ${isT ? "" : `<div class="cats" id="catChips">${shown.map(c => `<button type="button" data-cat="${c.id}" aria-pressed="${st.cat === c.id}"><span class="tdot" style="background:var(--${c.color})">${icon(c.icon || CAT_ICONS[c.id] || "tag", 14)}</span>${esc(c.name)}</button>`).join("")}${!st.more && cats.length > 8 ? `<button type="button" id="moreCats" class="morecats">Daugiau…</button>` : ""}<button type="button" id="newCat" class="morecats">+ Nauja</button></div>`}
      ${multiAcc ? `<div class="two"><label class="field">${isT ? "Iš sąskaitos" : "Sąskaita"}<select id="fAcc">${accOptions(st.account_id)}</select></label>
        ${isT ? `<label class="field">Į sąskaitą<select id="fTo">${accOptions(st.to_account_id, true)}</select></label>` : "<span></span>"}</div>` : ""}
      <div class="two"><label class="field">Data<input id="fDate" type="date" value="${st.date}"></label><label class="field">Aprašymas<input id="fNote" placeholder="${isT ? "pvz. Į Trading 212" : "pvz. Maxima"}" value="${esc(st.note)}" maxlength="80" autocomplete="off"></label></div>
      ${showLearn ? `<label class="check"><input type="checkbox" id="fLearn" ${st.learn ? "checked" : ""}> Įsiminti: „${esc(st.note.trim())}“ visada → ${esc(catById(st.cat).name)}${n ? ` ir pakeisti dar ${n} tokias operacijas` : ""}</label>` : ""}
      ${!isEdit ? `<label class="check"><input type="checkbox" id="fRepeat" ${st.repeat ? "checked" : ""}> Kartoti kas mėnesį</label>` : ""}
      ${tx?.recurring_id ? `<div class="fine">Sukurta iš pasikartojančios operacijos. Šablonas keičiamas skiltyje Daugiau → Pasikartojančios.</div>` : ""}
      ${tx?.memo && tx.memo !== tx.note ? `<div class="fine memo">${esc(tx.memo)}</div>` : ""}
      <div id="fErr" class="err" hidden></div>
      <div class="row"><button class="btn" style="flex:1" type="submit">${isEdit ? "Išsaugoti" : "Pridėti"}</button><button class="btn ghost" type="button" id="fClose">Uždaryti</button></div>
      ${isEdit ? `<button class="linkbtn" type="button" id="fDel" style="color:var(--crit);align-self:flex-start">Ištrinti operaciją</button>` : ""}
      ${tx?.demo ? `<div class="fine">Tai pavyzdinė operacija. Išsaugojus bus sukurta tavo pirma tikra operacija.</div>` : ""}
    </form></div>`;
    const keep = () => {
      st.amount = $("#fAmt").value; st.date = $("#fDate").value; st.note = $("#fNote").value;
      if ($("#fAcc")) st.account_id = $("#fAcc").value; if ($("#fTo")) st.to_account_id = $("#fTo").value;
      if ($("#fLearn")) st.learn = $("#fLearn").checked; if ($("#fRepeat")) st.repeat = $("#fRepeat").checked;
    };
    root.querySelectorAll("[data-st]").forEach(b => b.onclick = () => { keep(); st.type = b.dataset.st; st.cat = null; st.catTouched = false; draw(); });
    root.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => { keep(); st.cat = b.dataset.cat; st.catTouched = true; draw(); });
    root.querySelectorAll("[data-tpl]").forEach(b => b.onclick = () => {
      keep(); const x = tpl[+b.dataset.tpl]; st.cat = x.cat; st.note = x.note; st.catTouched = true;
      if (x.fixed && !st.amount) st.amount = String(x.fixed).replace(".", ",");
      draw(); $("#fAmt").focus(); if (navigator.vibrate) navigator.vibrate(8);
    });
    if ($("#moreCats")) $("#moreCats").onclick = () => { keep(); st.more = true; draw(); };
    if ($("#newCat")) $("#newCat").onclick = () => { keep(); const saved = {...st}; openCatSheet(null, st.type, id => { Object.assign(st, saved, {cat: id, catTouched: true, more: true}); draw(); }, () => { Object.assign(st, saved); draw(); }); };
    $("#fNote").addEventListener("input", () => {
      if (st.catTouched || st.type === "trf") return;
      const g = categorize($("#fNote").value, st.type === "inc" ? "in" : "out");
      if (g.type !== st.type || g.cat === st.cat) return;
      st.cat = g.cat;
      if (!root.querySelector(`[data-cat="${g.cat}"]`)) { keep(); st.more = true; draw(); $("#fNote").focus(); return; }
      root.querySelectorAll("[data-cat]").forEach(b => b.setAttribute("aria-pressed", b.dataset.cat === st.cat));
    });
    $("#sheetBg").onclick = e => { if (e.target.id === "sheetBg") close(); };
    $("#fClose").onclick = close;
    if ($("#fDel")) $("#fDel").onclick = () => {
      const orig = {...tx};
      removeTx(tx.id); close(); render();
      toast("Operacija ištrinta", () => { saveTx(orig); render(); });
    };
    $("#txForm").onsubmit = e => {
      e.preventDefault(); keep();
      const amount = r2(parseNum(st.amount));
      const err = $("#fErr");
      const fail = m => { err.textContent = m; err.hidden = false; };
      if (!(amount > 0)) { fail("Įvesk sumą, didesnę už nulį."); $("#fAmt").focus(); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(st.date)) { fail("Pasirink datą."); return; }
      if (st.type === "trf" && st.to_account_id === st.account_id) { fail("Pasirink skirtingas sąskaitas."); return; }
      const id = isEdit ? tx.id : newId();
      const t = {id, type: st.type, cat: st.type === "trf" ? "transfer" : st.cat, amount, date: st.date, note: st.note.trim(), account_id: st.account_id,
        to_account_id: st.type === "trf" ? (st.to_account_id || null) : null, memo: tx?.memo || "", recurring_id: tx?.recurring_id || null, created_at: isEdit ? tx.created_at : undefined};
      if (st.repeat && !isEdit) {
        const rid = shortId();
        t.recurring_id = rid;
        S.cfg.recurring = [...(S.cfg.recurring || []), {id: rid, type: t.type, cat: t.cat, amount, note: t.note, account_id: t.account_id, to_account_id: t.to_account_id, day: Math.min(28, +st.date.slice(8)), start: ymOf(st.date), last: ymOf(st.date), active: true}];
        saveSettings("recurring");
      }
      saveTx(t);
      if ($("#fLearn")?.checked) learnRule(t.note, t.type, t.cat, tx?.id);
      close(); if (navigator.vibrate) navigator.vibrate(10);
      if (isEdit) toast("Pakeitimai išsaugoti");
      else toast(`${t.type === "inc" ? "+" : t.type === "exp" ? "−" : ""}${eur(amount)} · ${t.type === "trf" ? "pervedimas" : catById(t.cat).name}`, () => { removeTx(id); render(); });
      if (ymOf(st.date) !== S.ym) S.ym = ymOf(st.date);
      render();
    };
    setTimeout(() => { if (!isEdit && !st.amount) $("#fAmt")?.focus(); }, 50);
  };
  draw();
}
function learnRule(note, type, cat, exceptId) {
  const pattern = note.trim().toLowerCase(); if (!pattern) return;
  S.cfg.rules = [{id: shortId(), pattern, type, cat}, ...(S.cfg.rules || []).filter(r => r.pattern !== pattern)];
  saveSettings("rules");
  const rows = [];
  for (const t of S.txs.values()) if (t.id !== exceptId && t.type === type && t.cat !== cat && (t.note || "").trim().toLowerCase() === pattern) rows.push(txRow({...t, cat}));
  if (rows.length) bulkUpsert("transactions", rows);
}

/* ---------- Daugiau: meniu ---------- */
function subHead(title, back) {
  const [label, go] = back || ["Daugiau", ""];
  return `<div class="subhead"><button class="linkbtn" ${go ? `data-go="${go}"` : 'data-sub=""'}>‹ ${esc(label)}</button><h2>${esc(title)}</h2></div>`;
}

/* ---------- Biudžetai ---------- */
function vBudgets() {
  const a = monthAgg(ymOf(todayISO()), allTx());
  return `${subHead("Biudžetai")}
  <div class="set-group"><div class="fine">Nustatyk mėnesio ribą kategorijai. Apžvalgoje matysi, kiek liko, ir gausi įspėjimą prie 85 %. Šalia rodoma, kiek išleista šį mėnesį. Pakeitimai galioja nuo šio mėnesio, o praėję mėnesiai lieka su tuo metu buvusiomis ribomis.</div>
    ${catsOf("exp").map(c => `<div class="brow"><span class="sw" style="background:var(--${c.color})"></span><label for="b_${c.id}">${esc(c.name)}<small class="num">${eur(a.byCat[c.id] || 0)}</small></label><input id="b_${c.id}" data-bud="${c.id}" inputmode="decimal" placeholder="—" value="${budgetsFor(nowYm())[c.id] ? String(budgetsFor(nowYm())[c.id]).replace(".", ",") : ""}"></div>`).join("")}
  </div>`;
}

/* ---------- Kategorijos ir taisyklės ---------- */
function vCats() {
  const budA = monthAgg(ymOf(todayISO()), allTx());
  const list = type => categories().filter(c => c.type === type && !c.archived).map(c => `<button class="tx" data-editcat="${c.id}"><span class="dot" style="background:var(--${c.color})">${catIcon(c)}</span><div><div class="t1">${esc(c.name)}</div><div class="t2">${type === "exp" ? (budgetsFor(nowYm())[c.id] ? `Biudžetas ${eur0(budgetsFor(nowYm())[c.id])} · išleista ${eur0(budA.byCat[c.id] || 0)}` : `Šį mėn. ${eur0(budA.byCat[c.id] || 0)}`) : `Šį mėn. ${eur0(budA.byInc[c.id] || 0)}`}</div></div><span class="chev">›</span></button>`).join("");
  const hidden = categories().filter(c => c.archived);
  const rules = S.cfg.rules || [];
  const ruleTarget = r => r.type === "trf" ? "Pervedimas → " + accName(r.to_account_id) : catById(r.cat).name;
  return `${subHead("Kategorijos ir taisyklės")}
  ${S.txs.size ? `<button class="tour-card" data-sub="aicats"><span class="tc-ic">${icon("sparkle", 20)}</span><span class="tc-t"><b>Patikrinti kategorijas su AI</b><small>AI peržiūri tavo operacijas ir pasiūlo, ką priskirti tiksliau. Pakeitimus patvirtini pats.</small></span><span class="chev">›</span></button>` : ""}
  <div class="fine" style="margin-top:-6px">Paspausk kategoriją, kad pakeistum pavadinimą, ikoną, spalvą ar biudžetą.</div>
  <div class="sec-h"><h2>Išlaidų kategorijos</h2><button class="linkbtn aside" data-newcat="exp">+ Nauja</button></div>
  <div class="txs">${list("exp")}</div>
  <div class="sec-h"><h2>Pajamų šaltiniai</h2><button class="linkbtn aside" data-newcat="inc">+ Naujas</button></div>
  <div class="txs">${list("inc")}</div>
  ${hidden.length ? `<details><summary>Paslėptos (${hidden.length})</summary><div class="txs">${hidden.map(c => `<button class="tx" data-editcat="${c.id}"><span class="dot" style="background:var(--${c.color});opacity:.5">${catIcon(c)}</span><div><div class="t1">${esc(c.name)}</div></div><span class="chev">›</span></button>`).join("")}</div></details>` : ""}
  <div class="sec-h"><h2>Taisyklės</h2><button class="linkbtn aside" id="addRule">+ Nauja</button></div>
  <div class="fine" style="margin-top:-6px">Taisyklės priskiria kategoriją pagal aprašymą. Jos sukuriamos ir automatiškai, kai pakeiti operacijos kategoriją.</div>
  ${rules.length ? `<div class="txs">${rules.map(r => `<button class="tx" data-editrule="${esc(r.id)}"><span class="dot" style="background:var(--${r.type === "trf" ? "c9" : catById(r.cat).color})">${r.type === "trf" ? icon("swap") : catIcon(catById(r.cat))}</span><div><div class="t1">„${esc(r.pattern)}“</div><div class="t2">→ ${esc(ruleTarget(r))}${r.max != null ? ` · kai suma iki ${eur(r.max)}` : r.min != null ? ` · kai suma nuo ${eur(r.min)}` : ""}</div></div><span class="chev">›</span></button>`).join("")}</div>` : `<div class="txs"><div class="empty">Taisyklių dar nėra.</div></div>`}`;
}
/* ---------- Sąskaitos ---------- */
function vAccounts() {
  const row = a => { const b = accountBalance(a); const loan = a.kind === "loan";
    const prog = loan && a.original && b !== null ? Math.max(0, Math.min(100, (1 - (-b) / a.original) * 100)) : null;
    return `<button class="tx" data-acc="${esc(a.id)}"><span class="dot" style="background:var(--${a.kind === "invest" ? "c7" : a.kind === "cash" ? "c4" : loan ? "c11" : "c1"})">${icon(loan ? "bank" : a.kind === "invest" ? "coin" : a.kind === "cash" ? "receipt" : "home")}</span><div><div class="t1">${esc(a.name)}</div><div class="t2">${esc(ACCOUNT_KINDS[a.kind] || "")}${prog !== null ? ` · grąžinta ${pct(prog)}` : a.match ? " · atpažįstama pagal „" + esc(a.match) + "“" : ""}</div>${prog !== null ? `<div class="gbar thin"><b style="width:${prog}%;background:var(--c11)"></b></div>` : ""}</div><span class="am num ${b !== null && b < 0 ? "negc" : ""}">${b === null ? '<span class="muted">—</span>' : (b < 0 ? "−" : "") + eur(Math.abs(b))}</span></button>`; };
  const list = activeAccounts();
  const debts = list.filter(a => a.kind === "loan");
  return `${subHead("Sąskaitos")}
  <div class="fine" style="margin-top:-6px">Pervedimai tarp savo sąskaitų nėra nei pajamos, nei išlaidos. Pervedimai į investavimo platformą rodomi kaip investavimas, o įmokos paskoloms mažina skolą.</div>
  <div class="txs">${list.filter(a => a.kind !== "loan").map(row).join("")}</div>
  ${debts.length ? `<div class="sec-h"><h2>Skolos</h2></div><div class="txs">${debts.map(row).join("")}</div>` : ""}
  <div class="row"><button class="btn ghost" id="addAcc">Pridėti sąskaitą</button><button class="btn ghost" id="addLoan">Pridėti paskolą</button></div>`;
}
function openAccSheet(acc, presetKind) {
  const isEdit = !!acc;
  const st = {name: acc?.name || "", kind: acc?.kind || presetKind || "bank", match: acc?.match || "", bal: "", balDate: todayISO(), original: acc?.original ? String(acc.original).replace(".", ",") : "", reclass: true, confirmDel: false};
  const cur = acc ? accountBalance(acc) : null;
  const root = $("#sheetRoot");
  const close = () => { root.innerHTML = ""; };
  const matching = () => { const keys = st.match.split(",").map(x => x.trim().toLowerCase()).filter(Boolean); if (!keys.length) return [];
    return [...S.txs.values()].filter(t => t.type === "exp" && keys.some(k => (t.note + " " + t.memo).toLowerCase().includes(k))); };
  const draw = () => {
    const loan = st.kind === "loan";
    const m = loan ? matching() : [];
    root.innerHTML = `<div class="sheet-bg" id="sheetBg"><form class="sheet" id="accForm" role="dialog" aria-modal="true" aria-label="Sąskaita">
      <div class="grab"></div><h3 class="sheet-h">${isEdit ? "Sąskaita" : "Nauja sąskaita"}</h3>
      <label class="field">Pavadinimas<input id="aName" value="${esc(st.name)}" placeholder="${loan ? "pvz. Automobilio lizingas" : "pvz. Revolut"}" maxlength="40" required></label>
      ${!isEdit && !loan ? `<div class="bankchips">${["Swedbank", "SEB", "Luminor", "Revolut", "Paysera", "Artea", "Citadele", "Medicinos bankas", "Urbo bankas", "N26", "Wise", "Taupomoji", "Trading 212"].map(b => `<button type="button" class="chip" data-bankchip="${b}">${b}</button>`).join("")}</div>` : ""}
      <label class="field">Tipas<select id="aKind">${Object.entries(ACCOUNT_KINDS).map(([k, v]) => `<option value="${k}" ${st.kind === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="field">${loan ? "Įmokų gavėjas banko išraše" : "Atpažinti pervedimus pagal žodžius"}<input id="aMatch" value="${esc(st.match)}" placeholder="${loan ? "pvz. artea lizingas" : "pvz. revolut arba trading 212, trading212"}" autocomplete="off"></label>
      <div class="fine">${loan ? "Įmokos šiam gavėjui bus laikomos skolos grąžinimu, o ne išlaidomis, ir mažins likusią skolą." : "Importuojant banko išrašą, operacijos, kurių aprašyme yra šie žodžiai, bus pažymėtos kaip pervedimas į šią sąskaitą. Kelis žodžius atskirk kableliu."}</div>
      <div class="two"><label class="field">${loan ? "Likusi skola" : "Dabartinis likutis"}${cur !== null ? ` (dabar ${eur(loan ? -cur : cur)})` : ""}<input id="aBal" inputmode="decimal" placeholder="${isEdit ? "nekeisti" : "nebūtina"}" value="${esc(st.bal)}"></label>
        <label class="field">Data<input id="aBalDate" type="date" value="${st.balDate}"></label></div>
      ${loan ? `<label class="field">Pradinė paskolos suma (nebūtina)<input id="aOrig" inputmode="decimal" value="${esc(st.original)}" placeholder="progresui rodyti"></label>` : ""}
      ${loan && m.length ? `<label class="check"><input type="checkbox" id="aReclass" ${st.reclass ? "checked" : ""}> Pažymėti ${m.length} ankstesnes įmokas (${eur(m.reduce((s, t) => s + t.amount, 0))}) kaip skolos grąžinimą</label>` : ""}
      <div id="aErr" class="err" hidden></div>
      <div class="row"><button class="btn" style="flex:1">${isEdit ? "Išsaugoti" : "Pridėti"}</button><button class="btn ghost" type="button" id="aClose">Uždaryti</button></div>
      ${isEdit && acc.id !== "main" ? (st.confirmDel ? `<div class="row"><button class="btn danger small" type="button" id="aDelYes">Taip, paslėpti sąskaitą</button><button class="btn ghost small" type="button" id="aDelNo">Ne</button></div><div class="fine">Operacijos lieka, tik sąskaita nebus rodoma pasirinkimuose.</div>` : `<button class="linkbtn" type="button" id="aDel" style="color:var(--crit);align-self:flex-start">Paslėpti sąskaitą</button>`) : ""}
    </form></div>`;
    const keep = () => { st.name = $("#aName").value; st.kind = $("#aKind").value; st.match = $("#aMatch").value; st.bal = $("#aBal").value; st.balDate = $("#aBalDate").value;
      if ($("#aOrig")) st.original = $("#aOrig").value; if ($("#aReclass")) st.reclass = $("#aReclass").checked; };
    $("#sheetBg").onclick = e => { if (e.target.id === "sheetBg") close(); };
    $("#aClose").onclick = close;
    $("#aKind").onchange = () => { keep(); draw(); };
    root.querySelectorAll("[data-bankchip]").forEach(b => b.onclick = () => {
      keep(); const n = b.dataset.bankchip; st.name = n;
      st.kind = n === "Taupomoji" ? "savings" : n === "Trading 212" ? "invest" : "bank";
      if (n !== "Taupomoji") st.match = n.toLowerCase();
      draw();
    });
    $("#aMatch").onchange = () => { if (st.kind === "loan") { keep(); draw(); } };
    $("#aName").addEventListener("change", () => {
      const n = $("#aName").value.trim().toLowerCase();
      if (!isEdit && /lizing|paskol|kredit|leasing|būsto|busto/.test(n)) { keep(); st.kind = "loan"; draw(); return; }
      if (!isEdit && !$("#aMatch").value && /revolut|trading ?212|swedbank|seb|luminor|paysera|wise|interactive brokers|ibkr|lightyear|etoro/.test(n)) $("#aMatch").value = n;
      if (!isEdit && /trading ?212|interactive|ibkr|lightyear|etoro|degiro|xtb|finasta/i.test(n)) $("#aKind").value = "invest";
    });
    if ($("#aDel")) $("#aDel").onclick = () => { keep(); st.confirmDel = true; draw(); };
    if ($("#aDelNo")) $("#aDelNo").onclick = () => { keep(); st.confirmDel = false; draw(); };
    if ($("#aDelYes")) $("#aDelYes").onclick = () => { ensureCfg("accounts"); S.cfg.accounts = S.cfg.accounts.map(a => a.id === acc.id ? {...a, archived: true} : a); saveSettings("accounts"); close(); render(); };
    $("#accForm").onsubmit = e => {
      e.preventDefault(); keep();
      const name = st.name.trim(); if (!name) return;
      const loan = st.kind === "loan";
      let bal = st.bal.trim() ? parseNum(st.bal) : null;
      if (st.bal.trim() && bal === null) { const er = $("#aErr"); er.textContent = "Neteisinga suma."; er.hidden = false; return; }
      if (bal !== null && loan) bal = -Math.abs(bal);
      ensureCfg("accounts");
      const base = isEdit ? accById(acc.id) : {id: shortId()};
      // perklasifikuojam ankstesnes įmokas prieš skaičiuodami inkarą
      if (loan && st.reclass && $("#aReclass")) {
        const rows = matching().map(t => txRow({...t, type: "trf", cat: "transfer", to_account_id: base.id}));
        if (rows.length) bulkUpsert("transactions", rows);
        S.cfg.rules = [{id: shortId(), pattern: st.match.split(",")[0].trim().toLowerCase(), type: "trf", cat: "transfer", to_account_id: base.id}, ...(S.cfg.rules || [])];
        saveSettings("rules");
      }
      let anchor = base.anchor || null;
      if (bal !== null) {
        // likutis nurodytos dienos pabaigoje: atimam tos dienos operacijas, kad inkaras būtų dienos pradžioje
        anchor = {date: addDays(st.balDate, -1), amount: 0};
        const diff = accountBalance({...base, anchor}, st.balDate) || 0;
        anchor = {date: anchor.date, amount: r2(bal - diff)};
      }
      const orig = loan && st.original.trim() ? Math.abs(parseNum(st.original) || 0) : null;
      const next = {...base, name, kind: st.kind, match: st.match.trim().toLowerCase(), anchor, original: orig};
      S.cfg.accounts = isEdit ? S.cfg.accounts.map(a => a.id === acc.id ? next : a) : [...S.cfg.accounts, next];
      saveSettings("accounts"); close(); render(); toast(isEdit ? "Sąskaita išsaugota" : "Sąskaita pridėta");
    };
  };
  draw();
}
function addDays(d, n) { const x = new Date(d + "T12:00"); x.setDate(x.getDate() + n); return x.getFullYear() + "-" + pad2(x.getMonth() + 1) + "-" + pad2(x.getDate()); }

/* ---------- Pasikartojančios ---------- */
function vRecurring() {
  const list = S.cfg.recurring || [], ym = ymOf(todayISO()), today = new Date().getDate();
  const monthly = list.filter(r => r.active && r.type !== "inc").reduce((s, r) => s + r.amount, 0);
  const status = r => {
    if (!r.active) return "sustabdyta";
    if (recMode(r) === "auto") return r.last && r.last >= ym ? "šį mėn. įrašyta" : `bus įrašyta ${r.day} d.`;
    const p = recPaid(r, ym);
    return p ? `✓ šį mėn. ${r.type === "inc" ? "gauta" : "sumokėta"} ${dayLabel(p.date)}` : r.day < today ? "laukiama (vėluoja)" : `laukiama ~${r.day} d.`;
  };
  return `${subHead("Pasikartojančios operacijos")}
  <div class="fine" style="margin-top:-6px">Mokėjimai, kuriuos atneša banko išrašas, tik planuojami: programėlė laukia jų ir pažymi sumokėtais, kai juos randa importuojant. Grynųjų ir kitų sąskaitų be išrašų operacijos sukuriamos automatiškai.${monthly ? ` Aktyvių mokėjimų suma: <b class="num">${eur(monthly)}</b> per mėnesį.` : ""}</div>
  <button class="btn ghost" id="recDetect">Rasti pasikartojančius iš operacijų</button>
  ${list.length ? `<div class="txs">${[...list].sort((a, b) => (b.active - a.active) || a.day - b.day).map(r => { const c = r.type === "trf" ? {name: (isLoanAcc(r.to_account_id) ? "Paskola → " : "Pervedimas → ") + accName(r.to_account_id), color: "c9"} : catById(r.cat);
    return `<button class="tx ${r.active ? "" : "dim"}" data-editrec="${esc(r.id)}"><span class="dot" style="background:var(--${c.color})">${icon(recMode(r) === "auto" ? "repeat" : "receipt")}</span><div><div class="t1">${esc(r.note || c.name)}</div><div class="t2">${esc(c.name)} · ${esc(status(r))}${recMode(r) === "auto" ? " · kuriama automatiškai" : ""}</div></div>
      <span class="am num ${r.type === "inc" ? "pos" : ""}">${r.type === "inc" ? "+" : r.type === "exp" ? "−" : ""}${eur(r.amount)}</span></button>`; }).join("")}</div>` : `<div class="txs"><div class="empty">Pasikartojančių operacijų dar nėra. Įkelk banko išrašą arba spausk „Rasti pasikartojančius“.</div></div>`}
  <button class="btn ghost" id="addRec">Pridėti ranka</button>`;
}
/* ---------- Taupymo tikslai ---------- */
function goalCard(g) {
  const p = g.target > 0 ? Math.min(100, g.saved / g.target * 100) : 0;
  let need = "";
  if (g.deadline && g.saved < g.target) {
    const m = monthsBetween(ymOf(todayISO()), g.deadline) + 1;
    need = m > 0 ? `Reikia ~${eur0((g.target - g.saved) / m)} per mėnesį iki ${ymLabel(g.deadline).toLowerCase()}` : "Terminas praėjo";
  } else if (g.saved >= g.target) need = "Tikslas pasiektas";
  return `<button class="goal" data-editgoal="${esc(g.id)}"><span class="g1"><b>${esc(g.name)}</b><span class="num">${eur0(g.saved)} / ${eur0(g.target)}</span></span>
    <span class="gbar"><b style="width:${p}%;background:var(--${g.color || "c3"})"></b></span><span class="fine">${pct(p)}${need ? " · " + need : ""}</span></button>`;
}
function vGoals() {
  const goals = S.cfg.goals || [];
  return `${subHead("Taupymo tikslai")}
  <div class="fine" style="margin-top:-6px">Paspausk tikslą, kad pakeistum jo sumą, terminą ar spalvą.</div>
  ${goals.length ? goals.map(g => `<div class="set-group">${goalCard(g)}
    <form class="row" data-goalform="${esc(g.id)}"><input class="inp" name="amt" inputmode="decimal" placeholder="Suma" style="width:110px"><button class="btn small" name="add">Įnešti</button><button class="btn ghost small" name="sub" type="button" data-goalsub="${esc(g.id)}">Išimti</button></form></div>`).join("") : `<div class="txs"><div class="empty">Tikslų dar nėra.</div></div>`}
  <button class="btn ghost" id="addGoal">Naujas tikslas</button>
  ${S.partner ? `<div class="set-group"><h3>Bendri tikslai su ${esc(partnerName())}</h3>${(S.sgoals || []).map(g => sgCard(g, false)).join("") || `<div class="fine">Bendrų tikslų dar nėra.</div>`}<button class="linkbtn" data-go="more" data-sub="together" style="align-self:flex-start">Tvarkyti bendrus tikslus</button></div>` : ""}`;
}
/* ---------- Peržiūra: operacijos be kategorijos ---------- */
function reviewGroups() {
  const keep = new Set((S.cfg.prefs?.keepOther || []).map(x => x.toLowerCase()));
  const m = new Map();
  for (const t of S.txs.values()) {
    if (!((t.type === "exp" && t.cat === "other") || (t.type === "inc" && t.cat === "iother")) || !t.note) continue;
    const k = t.type + "|" + t.note.trim().toLowerCase();
    if (keep.has(k)) continue;
    const g = m.get(k) || {key: k, type: t.type, note: t.note.trim(), ids: [], total: 0, last: ""};
    g.ids.push(t.id); g.total += t.amount; if (t.date > g.last) g.last = t.date; m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.ids.length - a.ids.length || b.total - a.total);
}
function vReview() {
  const groups = reviewGroups();
  const chips = type => catsByFreq(type).filter(c => c.id !== "other" && c.id !== "iother");
  const exp = chips("exp"), inc = chips("inc");
  return `${subHead("Be kategorijos", ["Apžvalga", "overview"])}
  <div class="fine" style="margin-top:-6px">Pasirink kategoriją. Ji bus pritaikyta visoms operacijoms su tuo pačiu aprašymu ir įsiminta kitiems importams.</div>
  ${groups.length ? groups.map(g => { const list = g.type === "exp" ? exp : inc;
    return `<div class="rv"><div class="rv-h"><b>${esc(g.note)}</b><span class="num ${g.type === "inc" ? "pos" : ""}">${g.type === "inc" ? "+" : "−"}${eur(g.total)}</span></div>
      <div class="fine">${g.ids.length} ${g.ids.length === 1 ? "operacija" : "operacijos"} · paskutinė ${dayLabel(g.last)}</div>
      <div class="cats small-chips">${list.slice(0, 6).map(c => `<button data-review="${esc(g.key)}" data-rcat="${c.id}"><span class="tdot" style="background:var(--${c.color})">${icon(c.icon || CAT_ICONS[c.id] || "tag", 14)}</span>${esc(c.name)}</button>`).join("")}
        <select class="mini-sel" data-reviewsel="${esc(g.key)}" aria-label="Kita kategorija"><option value="">Kita…</option>${list.slice(6).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}${activeAccounts().map(a => `<option value="trf:${esc(a.id)}">⇄ Pervedimas: ${esc(a.name)}</option>`).join("")}</select>
        <button class="linkbtn" data-keepother="${esc(g.key)}">Palikti „Kita“</button></div></div>`; }).join("")
    : `<div class="txs"><div class="empty">Viskas sutvarkyta. Visos operacijos turi kategorijas.</div></div>`}`;
}
function applyReview(key, choice) {
  const g = reviewGroups().find(x => x.key === key); if (!g) return;
  if (choice.startsWith("trf:")) {
    const acc = choice.slice(4) || null;
    const rows = g.ids.map(id => S.txs.get(id)).filter(Boolean).map(t => txRow({...t, type: "trf", cat: "transfer", ...(g.type === "exp" ? {to_account_id: acc} : {to_account_id: t.account_id, account_id: acc})}));
    bulkUpsert("transactions", rows);
    S.cfg.rules = [{id: shortId(), pattern: g.note.toLowerCase(), type: "trf", cat: "transfer", to_account_id: acc}, ...(S.cfg.rules || []).filter(r => r.pattern !== g.note.toLowerCase())];
    saveSettings("rules");
  } else learnRule(g.note, g.type, choice, null);
  if (navigator.vibrate) navigator.vibrate(8);
  toast(`„${g.note}“ → ${choice.startsWith("trf:") ? "pervedimas" : catById(choice).name}`);
  render();
}
