/* Kišenė: metų ataskaita. */
"use strict";

function yearAgg(y, txs) {
  const a = {inc: 0, exp: 0, inv: 0, debt: 0, byCat: {}, byInc: {}, n: 0, months: new Set()};
  for (let m = 1; m <= 12; m++) {
    const x = monthAgg(y + "-" + pad2(m), txs);
    if (x.n) a.months.add(m);
    a.inc += x.inc; a.exp += x.exp; a.inv += x.inv; a.debt += x.debt; a.n += x.n;
    for (const [k, v] of Object.entries(x.byCat)) a.byCat[k] = (a.byCat[k] || 0) + v;
    for (const [k, v] of Object.entries(x.byInc)) a.byInc[k] = (a.byInc[k] || 0) + v;
  }
  return a;
}
function availableYears() {
  const ys = new Set([todayISO().slice(0, 4)]);
  for (const t of allTx()) ys.add(t.date.slice(0, 4));
  for (const t of S.inv.values()) ys.add(t.date.slice(0, 4));
  return [...ys].sort().reverse();
}
const deltaPct = (cur, prev) => prev > 0 ? (cur - prev) / prev * 100 : null;
function deltaTag(cur, prev, goodUp) {
  const d = deltaPct(cur, prev); if (d === null) return "";
  const good = goodUp ? d >= 0 : d <= 0;
  return `<span class="dtag ${Math.abs(d) < 0.5 ? "" : good ? "pos" : "negc"}">${d >= 0 ? "↑" : "↓"} ${pct(Math.abs(d))}</span>`;
}

function vYear() {
  const years = availableYears();
  const y = S.year && years.includes(S.year) ? S.year : years[0];
  const txs = allTx();
  const a = yearAgg(y, txs), b = yearAgg(String(+y - 1), txs);
  const hasPrev = b.n > 0;
  const saved = a.inc - a.exp, savedPrev = b.inc - b.exp;
  const nMonths = Math.max(1, a.months.size);
  const cats = [...new Set([...Object.keys(a.byCat), ...Object.keys(b.byCat)])].map(id => ({c: catById(id), v: a.byCat[id] || 0, p: b.byCat[id] || 0})).filter(x => x.v > 0 || x.p > 0).sort((x, z) => z.v - x.v);
  const incs = Object.entries(a.byInc).map(([id, v]) => ({c: catById(id), v})).sort((x, z) => z.v - x.v);
  const big = txs.filter(t => t.type === "exp" && t.date.startsWith(y)).sort((x, z) => z.amount - x.amount).slice(0, 5);
  const moves = cats.filter(x => x.p > 50 && x.v > 0).map(x => ({...x, d: x.v - x.p})).sort((x, z) => Math.abs(z.d) - Math.abs(x.d)).slice(0, 3);
  const pf = S.inv.size ? portfolio() : null;
  const iy = pf && pf.byYear[y];
  const months = [...Array(12)].map((_, i) => y + "-" + pad2(i + 1));
  const row = (label, cur, prev, goodUp) => `<div class="yrow"><span>${label}</span><b class="num">${eur(cur)}</b>${hasPrev ? `<span class="yprev num">${eur(prev)}</span>${deltaTag(cur, prev, goodUp)}` : ""}</div>`;
  return `${subHead("Metų ataskaita")}
  <div class="filters">${years.map(x => `<button class="chip" data-year="${x}" aria-pressed="${x === y}">${x}</button>`).join("")}</div>
  ${!a.n && !iy ? `<div class="txs"><div class="empty">${y} metais operacijų nėra.</div></div>` : `
  <section class="card"><div class="sec-h"><h2>${y} metai</h2><span class="aside">${a.months.size} mėn. su duomenimis${hasPrev ? ` · lyginama su ${+y - 1}` : ""}</span></div>
    <div class="ytable">
      ${hasPrev ? `<div class="yrow head"><span></span><b>${y}</b><span class="yprev">${+y - 1}</span><span></span></div>` : ""}
      ${row("Pajamos", a.inc, b.inc, true)}
      ${row("Išlaidos", a.exp, b.exp, false)}
      ${row("Sutaupyta", saved, savedPrev, true)}
      ${a.inv || b.inv ? row("Investuota", a.inv, b.inv, true) : ""}
      ${a.debt || b.debt ? row("Paskoloms grąžinta", a.debt, b.debt, true) : ""}
    </div>
    <div class="fine">Sutaupyta ${a.inc ? pct(saved / a.inc * 100) : "0 %"} pajamų. Vidutiniškai per mėnesį: pajamos ${eur0(a.inc / nMonths)}, išlaidos ${eur0(a.exp / nMonths)}.</div>
  </section>
  <section class="card"><div class="sec-h"><h2>Pagal mėnesius</h2><div class="keys aside"><span><i style="background:var(--inc)"></i>Pajamos</span><span><i style="background:var(--exp)"></i>Išlaidos</span></div></div>
    <div class="chart" id="yearChart" data-months="${months.join(",")}"></div></section>
  ${moves.length && hasPrev ? `<section class="card"><div class="sec-h"><h2>Didžiausi pokyčiai</h2></div><ul class="notes">${moves.map(x => `<li class="${x.d > 0 ? "warn" : "info"}"><span class="ic">${x.d > 0 ? "↑" : "↓"}</span><span>${esc(x.c.name)}: ${eur0(x.v)} vietoj ${eur0(x.p)} (${x.d > 0 ? "+" : "−"}${eur0(Math.abs(x.d))})</span></li>`).join("")}</ul></section>` : ""}
  <section class="card"><div class="sec-h"><h2>Išlaidos pagal kategorijas</h2></div>
    <div class="ytable cats-t">${hasPrev ? `<div class="yrow head"><span></span><b>${y}</b><span class="yprev">${+y - 1}</span><span></span></div>` : ""}
    ${cats.map(x => `<button class="yrow" data-catfilter="${esc(x.c.id)}" data-catyear="${y}"><span class="ycat"><span class="tdot" style="background:var(--${x.c.color})">${icon(x.c.icon || CAT_ICONS[x.c.id] || "tag", 13)}</span>${esc(x.c.name)}<small>${eur0(x.v / nMonths)} / mėn.</small></span><b class="num">${eur0(x.v)}</b>${hasPrev ? `<span class="yprev num">${eur0(x.p)}</span>${deltaTag(x.v, x.p, false)}` : ""}</button>`).join("")}</div></section>
  ${incs.length ? `<section class="card"><div class="sec-h"><h2>Pajamų šaltiniai</h2></div><div class="wealth">${incs.map(x => `<div class="wrow"><span>${esc(x.c.name)}</span><span class="num">${eur(x.v)}</span></div>`).join("")}</div></section>` : ""}
  ${big.length ? `<section class="card"><div class="sec-h"><h2>Didžiausios išlaidos</h2></div><div class="txs">${big.map(txItem).join("")}</div></section>` : ""}
  `}
  ${iy ? `<section class="card"><div class="sec-h"><h2>Investicijų pajamos</h2><span class="aside">deklaracijai</span></div>
    <div class="ytable">
      <div class="yrow"><span>Pardavimų pajamos</span><b class="num">${eur(iy.proceeds)}</b></div>
      <div class="yrow"><span>Parduotų vertybinių popierių savikaina</span><b class="num">${eur(iy.costSold)}</b></div>
      <div class="yrow"><span>Pelnas iš pardavimų</span><b class="num pos">${eur(iy.gains)}</b></div>
      ${iy.losses ? `<div class="yrow"><span>Nuostoliai iš pardavimų</span><b class="num negc">−${eur(iy.losses)}</b></div>` : ""}
      <div class="yrow"><span>Dividendai</span><b class="num">${eur(iy.divs)}</b></div>
      ${iy.interest ? `<div class="yrow"><span>Palūkanos</span><b class="num">${eur(iy.interest)}</b></div>` : ""}
      ${iy.fees ? `<div class="yrow"><span>Platformų mokesčiai</span><b class="num">${eur(iy.fees)}</b></div>` : ""}
    </div>
    ${iy.sales.length ? `<details><summary>Pardavimai (${iy.sales.length})</summary><div class="prev"><table><thead><tr><th>Data</th><th>Pozicija</th><th style="text-align:right">Gauta</th><th style="text-align:right">Savikaina</th><th style="text-align:right">Rezultatas</th></tr></thead><tbody>${iy.sales.map(x => `<tr><td class="num">${x.date}</td><td>${esc(x.symbol || x.name)}</td><td class="r num">${eur(x.proceeds)}</td><td class="r num">${eur(x.cost)}</td><td class="r num ${plClass(x.gain)}">${signed(x.gain)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
    <div class="fine">Sumos eurais, savikaina apskaičiuota vidutinės kainos metodu. Deklaracijai gali reikėti kito savikainos metodo ar papildomų duomenų, pvz. užsienyje išskaičiuoto dividendų mokesčio, todėl prieš teikdamas pasitikrink VMI nurodymus ir platformos metinę ataskaitą.</div>
  </section>` : ""}
  <button class="btn ghost" id="exportYear">Eksportuoti ${y} m. ataskaitą (CSV)</button>`;
}
function exportYear() {
  const years = availableYears(); const y = S.year && years.includes(S.year) ? S.year : years[0];
  const txs = allTx(), a = yearAgg(y, txs);
  const rows = [["Kišenė", `${y} m. ataskaita`], [], ["Rodiklis", "Suma EUR"], ["Pajamos", dec(r2(a.inc))], ["Išlaidos", dec(r2(a.exp))], ["Sutaupyta", dec(r2(a.inc - a.exp))], ["Investuota", dec(r2(a.inv))], ["Paskoloms grąžinta", dec(r2(a.debt))], [], ["Mėnuo", "Pajamos", "Išlaidos"]];
  for (let m = 1; m <= 12; m++) { const x = monthAgg(y + "-" + pad2(m), txs); rows.push([ymLabel(y + "-" + pad2(m)), dec(r2(x.inc)), dec(r2(x.exp))]); }
  rows.push([], ["Kategorija", "Suma EUR"]);
  for (const [id, v] of Object.entries(a.byCat).sort((p, q) => q[1] - p[1])) rows.push([catById(id).name, dec(r2(v))]);
  const iy = S.inv.size ? portfolio().byYear[y] : null;
  if (iy) {
    rows.push([], ["Investicijos", "Suma EUR"], ["Pardavimų pajamos", dec(r2(iy.proceeds))], ["Savikaina", dec(r2(iy.costSold))], ["Pelnas", dec(r2(iy.gains))], ["Nuostoliai", dec(r2(iy.losses))], ["Dividendai", dec(r2(iy.divs))], ["Palūkanos", dec(r2(iy.interest))], ["Mokesčiai", dec(r2(iy.fees))]);
    if (iy.sales.length) { rows.push([], ["Data", "Pozicija", "Platforma", "Kiekis", "Gauta", "Savikaina", "Rezultatas"]); for (const x of iy.sales) rows.push([x.date, x.symbol || x.name, x.platform, dec(r4(x.qty)), dec(r2(x.proceeds)), dec(r2(x.cost)), dec(r2(x.gain))]); }
  }
  shareCsv(`kisene-ataskaita-${y}.csv`, rows);
}
