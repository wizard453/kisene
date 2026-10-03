/* Kišenė: AI patarėjas. Pokalbis, kuriame AI mato duomenų santrauką ir gali keisti nustatymus (su atšaukimu). */
"use strict";

function md(s) {
  const lines = esc(s).split(/\n/); let out = "", inList = false;
  const inline = x => x.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  for (let l of lines) {
    l = l.trimEnd();
    const li = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (li) { if (!inList) { out += "<ul>"; inList = true; } out += "<li>" + inline(li[1]) + "</li>"; continue; }
    if (inList) { out += "</ul>"; inList = false; }
    if (/^#{1,4}\s+/.test(l)) { out += "<h4>" + inline(l.replace(/^#{1,4}\s+/, "")) + "</h4>"; continue; }
    if (l.trim()) out += "<p>" + inline(l) + "</p>";
  }
  if (inList) out += "</ul>";
  return out;
}

/* ---------- Kontekstas ---------- */
function aiContext() {
  const txs = allTx(), ym = S.ym, now = ymOf(todayISO());
  const cur = monthAgg(ym, txs);
  const nameMap = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [catById(k).name, r2(v)]));
  const months = [0, 1, 2, 3, 4, 5].map(k => { const m = addMonths(ym, -k); const a = monthAgg(m, txs);
    return a.n ? {mėnuo: m, pajamos: r2(a.inc), išlaidos: r2(a.exp), investuota: r2(a.inv), paskoloms: r2(a.debt), išlaidos_pagal_kategorijas: nameMap(a.byCat), pajamos_pagal_šaltinius: nameMap(a.byInc)} : null; }).filter(Boolean);
  const top = txs.filter(t => t.type === "exp" && ymOf(t.date) === ym).sort((a, b) => b.amount - a.amount).slice(0, 15)
    .map(t => ({data: t.date, suma: t.amount, kategorija: catById(t.cat).name, aprašymas: (t.note || "").slice(0, 40)}));
  // dažniausi pardavėjai per 3 mėn., kad AI galėtų siūlyti taisykles
  const merch = {};
  for (const t of txs) if (t.type === "exp" && t.date >= addMonths(ym, -2) + "-01" && t.note) { const k = t.note; (merch[k] = merch[k] || {aprašymas: k, kategorija: catById(t.cat).name, kartai: 0, suma: 0}); merch[k].kartai++; merch[k].suma = r2(merch[k].suma + t.amount); }
  const ctx = {
    rodomas_mėnuo: ym, mėnuo_dar_nesibaigė: ym === now ? `taip, šiandien ${new Date().getDate()} diena` : "ne", valiuta: "EUR",
    kategorijos: categories().filter(c => !c.archived).map(c => ({id: c.id, pavadinimas: c.name, tipas: c.type === "exp" ? "išlaidos" : "pajamos", ...(c.type === "exp" && S.cfg.budgets[c.id] ? {biudžetas: S.cfg.budgets[c.id]} : {})})),
    sąskaitos: activeAccounts().map(a => ({id: a.id, pavadinimas: a.name, tipas: ACCOUNT_KINDS[a.kind], likutis: accountBalance(a)})),
    pasikartojančios: (S.cfg.recurring || []).map(r => ({id: r.id, aprašymas: r.note, suma: r.amount, diena: r.day, tipas: r.type, kategorija_id: r.cat, aktyvi: r.active})),
    tikslai: (S.cfg.goals || []).map(g => ({id: g.id, pavadinimas: g.name, tikslas: g.target, sutaupyta: g.saved, terminas: g.deadline || null})),
    taisyklių_kiekis: (S.cfg.rules || []).length,
    šis_mėnuo: {pajamos: r2(cur.inc), išlaidos: r2(cur.exp), investuota: r2(cur.inv)},
    mėnesiai: months, didžiausios_išlaidos: top,
    dažniausi_pardavėjai: Object.values(merch).sort((a, b) => b.kartai - a.kartai).slice(0, 25)
  };
  if (ym === now) { const sp = spendable(); ctx.laisvi_pinigai_iki_mėn_pabaigos = {suma: r2(sp.left), per_dieną: r2(sp.perDay), dienų_liko: sp.daysLeft, laukiami_mokėjimai: sp.pending}; }
  if (S.inv.size) {
    const p = portfolio();
    const byType = {}; for (const x of p.open) byType[ASSET_TYPES[x.type]] = r2((byType[ASSET_TYPES[x.type]] || 0) + x.value);
    ctx.investicijos = {vertė: r2(p.totalValue), bendra_grąža: r2(p.totalReturn), nerealizuotas: r2(p.unreal), realizuotas: r2(p.realized), dividendai: r2(p.divs),
      paskirstymas_pagal_tipą: byType, pozicijos: p.open.slice(0, 12).map(x => ({pavadinimas: x.display, simbolis: x.symbol, tipas: ASSET_TYPES[x.type], vertė: r2(x.value), grąža: r2(x.unreal), dalis_proc: Math.round(x.value / (p.posValue || 1) * 100)}))};
  }
  return ctx;
}

/* ---------- Veiksmų pritaikymas ---------- */
const exCat = (id, type) => { const c = categories().find(x => x.id === id && !x.archived); return c && (!type || c.type === type) ? c : null; };
function snapshot() { return {cfg: JSON.parse(JSON.stringify({budgets: S.cfg.budgets, categories: S.cfg.categories, rules: S.cfg.rules, goals: S.cfg.goals, recurring: S.cfg.recurring})), tx: new Map()}; }
function touchTx(snap, t) { if (!snap.tx.has(t.id)) snap.tx.set(t.id, S.txs.has(t.id) ? {...S.txs.get(t.id)} : null); }
function applyAction(a, snap) {
  const i = a.input || {};
  const num = v => typeof v === "number" ? v : parseNum(v);
  try {
    switch (a.name) {
      case "set_budget": {
        const c = exCat(i.category_id, "exp"); if (!c) throw "nerasta kategorija";
        const v = num(i.amount); const b = {...S.cfg.budgets};
        if (v > 0) b[c.id] = r2(v); else delete b[c.id];
        S.cfg.budgets = b; saveSettings("budgets");
        return v > 0 ? `Biudžetas „${c.name}“: ${eur0(v)} per mėn.` : `Pašalintas biudžetas „${c.name}“`;
      }
      case "create_category": {
        const name = String(i.name || "").trim().slice(0, 40); if (!name) throw "be pavadinimo";
        const type = i.type === "inc" ? "inc" : "exp";
        const ex = categories().find(c => c.name.toLowerCase() === name.toLowerCase() && c.type === type);
        if (ex) return `Kategorija „${name}“ jau yra`;
        ensureCfg("categories");
        const used = S.cfg.categories.map(c => c.color);
        const id = String(i._id || "c_" + shortId());
        S.cfg.categories = [...S.cfg.categories, {id, name, type, icon: ICON_CHOICES.includes(i.icon) ? i.icon : "tag", color: SWATCHES.find(s => !used.includes(s)) || "c12"}];
        saveSettings("categories");
        if (type === "exp" && num(i.budget) > 0) { S.cfg.budgets = {...S.cfg.budgets, [id]: r2(num(i.budget))}; saveSettings("budgets"); }
        return `Sukurta kategorija „${name}“${type === "exp" && num(i.budget) > 0 ? ` su ${eur0(num(i.budget))} biudžetu` : ""}`;
      }
      case "update_category": {
        const c = categories().find(x => x.id === i.category_id); if (!c) throw "nerasta kategorija";
        ensureCfg("categories");
        S.cfg.categories = S.cfg.categories.map(x => x.id === c.id ? {...x, ...(i.name ? {name: String(i.name).slice(0, 40)} : {}), ...(ICON_CHOICES.includes(i.icon) ? {icon: i.icon} : {}), ...(typeof i.hidden === "boolean" ? {archived: i.hidden} : {})} : x);
        saveSettings("categories");
        return `Pakeista kategorija „${i.name || c.name}“${typeof i.hidden === "boolean" ? (i.hidden ? " (paslėpta)" : " (rodoma)") : ""}`;
      }
      case "add_rule": {
        const pattern = String(i.pattern || "").trim().toLowerCase(); if (!pattern) throw "be teksto";
        let rule;
        if (i.transfer_account_id !== undefined && i.transfer_account_id !== null && !i.category_id) {
          if (i.transfer_account_id && !accById(i.transfer_account_id)) throw "nerasta sąskaita";
          rule = {id: shortId(), pattern, type: "trf", cat: "transfer", to_account_id: i.transfer_account_id || null};
        } else { const c = exCat(i.category_id); if (!c) throw "nerasta kategorija"; rule = {id: shortId(), pattern, type: c.type, cat: c.id}; }
        S.cfg.rules = [rule, ...(S.cfg.rules || []).filter(r => r.pattern !== pattern)]; saveSettings("rules");
        const rows = [];
        for (const t of S.txs.values()) {
          if (!(`${t.note} ${t.memo}`.toLowerCase().includes(pattern))) continue;
          if (rule.type === "exp" && t.type !== "exp") continue; if (rule.type === "inc" && t.type !== "inc") continue; if (rule.type === "trf" && t.type === "inc") continue;
          const nt = rule.type === "trf" ? {...t, type: "trf", cat: "transfer", to_account_id: rule.to_account_id} : {...t, cat: rule.cat};
          if (nt.cat === t.cat && nt.type === t.type) continue;
          touchTx(snap, t); rows.push(txRow(nt));
        }
        if (rows.length) bulkUpsert("transactions", rows);
        return `Taisyklė „${pattern}“ → ${rule.type === "trf" ? "pervedimas į " + accName(rule.to_account_id) : catById(rule.cat).name}${rows.length ? `, pakeista ${rows.length} operacijų` : ""}`;
      }
      case "recategorize": {
        const c = exCat(i.category_id); if (!c) throw "nerasta kategorija";
        const q = String(i.match_text || "").trim().toLowerCase(); if (!q) throw "be teksto";
        const rows = [];
        for (const t of S.txs.values()) {
          if (t.type !== c.type || t.cat === c.id || (i.month && ymOf(t.date) !== i.month)) continue;
          if (!(`${t.note} ${t.memo}`.toLowerCase().includes(q))) continue;
          touchTx(snap, t); rows.push(txRow({...t, cat: c.id}));
        }
        if (rows.length) bulkUpsert("transactions", rows);
        return rows.length ? `${rows.length} operacijos („${q}“) perkeltos į „${c.name}“` : `Operacijų su „${q}“ nerasta`;
      }
      case "create_goal": {
        const t = num(i.target); if (!(t > 0)) throw "neteisinga suma";
        const g = {id: String(i._id || shortId()), name: String(i.name || "Tikslas").slice(0, 40), target: r2(t), saved: r2(Math.max(0, num(i.saved) || 0)), deadline: /^\d{4}-\d{2}$/.test(i.deadline || "") ? i.deadline : null, color: SWATCHES[(S.cfg.goals || []).length % 8]};
        S.cfg.goals = [...(S.cfg.goals || []), g]; saveSettings("goals");
        return `Sukurtas tikslas „${g.name}“: ${eur0(g.target)}${g.deadline ? " iki " + ymLabel(g.deadline).toLowerCase() : ""}`;
      }
      case "update_goal": {
        const g = (S.cfg.goals || []).find(x => x.id === i.goal_id); if (!g) throw "nerastas tikslas";
        if (i.delete) { S.cfg.goals = S.cfg.goals.filter(x => x.id !== g.id); saveSettings("goals"); return `Ištrintas tikslas „${g.name}“`; }
        const n = {...g};
        if (i.name) n.name = String(i.name).slice(0, 40);
        if (num(i.target) > 0) n.target = r2(num(i.target));
        if (num(i.saved) >= 0 && i.saved !== undefined) n.saved = r2(num(i.saved));
        if (num(i.add_amount)) n.saved = r2(Math.max(0, n.saved + num(i.add_amount)));
        if (i.deadline !== undefined) n.deadline = /^\d{4}-\d{2}$/.test(i.deadline || "") ? i.deadline : null;
        S.cfg.goals = S.cfg.goals.map(x => x.id === g.id ? n : x); saveSettings("goals");
        return `Tikslas „${n.name}“: ${eur0(n.saved)} iš ${eur0(n.target)}`;
      }
      case "create_recurring": {
        const amount = num(i.amount); if (!(amount > 0)) throw "neteisinga suma";
        const type = ["exp", "inc", "trf"].includes(i.type) ? i.type : "exp";
        let cat = "transfer";
        if (type !== "trf") { const c = exCat(i.category_id, type); cat = c ? c.id : (type === "exp" ? "other" : "iother"); }
        const day = Math.max(1, Math.min(28, Math.round(num(i.day) || 1)));
        const now = ymOf(todayISO());
        const r = {id: String(i._id || shortId()), type, cat, amount: r2(amount), note: String(i.note || "").slice(0, 80), day, account_id: accById(i.account_id) ? i.account_id : "main",
          to_account_id: type === "trf" ? (accById(i.to_account_id) ? i.to_account_id : null) : null, start: now, last: now, active: true};
        S.cfg.recurring = [...(S.cfg.recurring || []), r]; saveSettings("recurring");
        return `Sukurta pasikartojanti „${r.note}“: ${eur(r.amount)} kas mėn. ${day} d. (nuo kito mėnesio)`;
      }
      case "update_recurring": {
        const r = (S.cfg.recurring || []).find(x => x.id === i.recurring_id); if (!r) throw "nerasta pasikartojanti operacija";
        if (i.delete) { S.cfg.recurring = S.cfg.recurring.filter(x => x.id !== r.id); saveSettings("recurring"); return `Ištrinta pasikartojanti „${r.note}“`; }
        const n = {...r};
        if (num(i.amount) > 0) n.amount = r2(num(i.amount));
        if (num(i.day) > 0) n.day = Math.max(1, Math.min(28, Math.round(num(i.day))));
        if (i.note) n.note = String(i.note).slice(0, 80);
        if (i.category_id) { const c = exCat(i.category_id, r.type); if (!c) throw "nerasta kategorija"; n.cat = c.id; }
        if (typeof i.active === "boolean") n.active = i.active;
        S.cfg.recurring = S.cfg.recurring.map(x => x.id === r.id ? n : x); saveSettings("recurring");
        return `Pakeista pasikartojanti „${n.note}“: ${eur(n.amount)}, ${n.day} d.${n.active ? "" : ", sustabdyta"}`;
      }
      case "add_transaction": {
        const amount = num(i.amount); if (!(amount > 0)) throw "neteisinga suma";
        const type = ["exp", "inc", "trf"].includes(i.type) ? i.type : "exp";
        let cat = "transfer";
        if (type !== "trf") { const c = exCat(i.category_id, type) || categorize(i.note || "", type === "inc" ? "in" : "out"); cat = c.id || c.cat; }
        const date = /^\d{4}-\d{2}-\d{2}$/.test(i.date || "") ? i.date : todayISO();
        const t = {id: newId(), type, cat, amount: r2(amount), date, note: String(i.note || "").slice(0, 80), account_id: accById(i.account_id) ? i.account_id : "main",
          to_account_id: type === "trf" ? (accById(i.to_account_id) ? i.to_account_id : null) : null, memo: "", recurring_id: null};
        snap.tx.set(t.id, null); saveTx(t);
        return `Įrašyta: ${type === "inc" ? "+" : type === "exp" ? "−" : ""}${eur(amount)} „${t.note}“ (${type === "trf" ? "pervedimas" : catById(cat).name}, ${dayLabel(date)})`;
      }
    }
    throw "nežinomas veiksmas";
  } catch (e) { return {fail: `Nepavyko: ${a.name} (${typeof e === "string" ? e : "klaida"})`}; }
}
function undoSnapshot(snap) {
  Object.assign(S.cfg, snap.cfg);
  for (const f of ["budgets", "categories", "rules", "goals", "recurring"]) saveSettings(f);
  const restore = [];
  for (const [id, orig] of snap.tx) { if (orig) restore.push(txRow(orig)); else if (S.txs.has(id)) removeTx(id); }
  if (restore.length) bulkUpsert("transactions", restore);
}

/* ---------- Pokalbis ---------- */
const chatKey = () => "kisene.chat." + (S.user?.id || "x");
function loadChat() { try { return JSON.parse(localStorage.getItem(chatKey()) || "[]"); } catch (e) { return []; } }
function saveChat() { try { localStorage.setItem(chatKey(), JSON.stringify(S.ai.chat.slice(-40).map(m => ({...m, snap: undefined})))); } catch (e) {} }
function resetAI() { if (S.ai.ctrl) S.ai.ctrl.abort(); S.ai = {status: "idle", chat: S.ai.chat || loadChat(), ctrl: null}; }
const SUGGEST = ["Išanalizuok šį mėnesį", "Kur galėčiau sutaupyti?", "Nustatyk biudžetus pagal mano vidurkį", "Kiek per mėnesį išleidžiu kavinėms?", "Kokios mano prenumeratos?", "Sukurk tikslą atostogoms 1500 € iki birželio"];

async function callAI(messages) {
  const {data} = await sb.auth.getSession();
  const token = data.session && data.session.access_token;
  if (!token) throw {message: "Sesija baigėsi. Prisijunk iš naujo."};
  const res = await fetch(CFG.SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/ai-advisor", {
    method: "POST", signal: S.ai.ctrl?.signal,
    headers: {"Content-Type": "application/json", Authorization: "Bearer " + token, apikey: CFG.SUPABASE_ANON_KEY},
    body: JSON.stringify({messages, context: aiContext()})
  });
  if (!res.ok) {
    let msg = "AI paslauga nepasiekiama (" + res.status + ").";
    try { const j = await res.json(); if (j.error) msg = j.error; } catch (e) {}
    if (res.status === 404) msg = "AI patarėjas dar neįjungtas (ai-advisor, 404).";
    throw {message: msg};
  }
  return res.json();
}
async function sendChat(text) {
  text = String(text || "").trim();
  if (!text || S.ai.status === "run") return;
  if (!navigator.onLine) { toast("AI reikia interneto ryšio"); return; }
  if (!S.ai.chat) S.ai.chat = loadChat();
  S.ai.chat.push({role: "user", content: text, at: Date.now()});
  S.ai.status = "run"; S.ai.ctrl = new AbortController(); render(); scrollChat();
  // istorija modeliui: tekstas ir trumpas atliktų veiksmų sąrašas
  const hist = S.ai.chat.slice(-16).map(m => ({role: m.role, content: m.role === "assistant" && m.acts?.length ? `${m.content || ""}\n[Atlikta: ${m.acts.filter(x => x.state === "done").map(x => x.label).join("; ")}]` : (m.content || "…")}));
  try {
    const r = await callAI(hist);
    const msg = {role: "assistant", content: r.text || (r.actions?.length ? "Atlikta." : "…"), at: Date.now(), acts: []};
    if (r.actions?.length) {
      const auto = S.cfg.prefs?.aiAuto !== false;
      msg.pending = auto ? null : r.actions;
      if (auto) { const snap = snapshot(); msg.snap = snap; msg.acts = r.actions.map(a => { const res = applyAction(a, snap); return typeof res === "string" ? {label: res, state: "done"} : {label: res.fail, state: "fail"}; }); }
      else msg.acts = r.actions.map(a => ({label: describeAction(a), state: "pending"}));
    }
    S.ai.chat.push(msg);
  } catch (e) {
    if (e && e.name === "AbortError") S.ai.chat.push({role: "assistant", content: "Sustabdyta.", at: Date.now(), err: true});
    else S.ai.chat.push({role: "assistant", content: (e && e.message) || "Nepavyko gauti atsakymo.", at: Date.now(), err: true});
  }
  S.ai.status = "idle"; S.ai.ctrl = null; saveChat(); render(); scrollChat();
}
function describeAction(a) {
  const i = a.input || {};
  const cn = id => catById(id).name;
  return ({set_budget: () => `Biudžetas „${cn(i.category_id)}“: ${eur0(i.amount)}`, create_category: () => `Nauja kategorija „${i.name}“`, update_category: () => `Keisti kategoriją „${cn(i.category_id)}“`,
    add_rule: () => `Taisyklė „${i.pattern}“`, recategorize: () => `Perkelti „${i.match_text}“ į „${cn(i.category_id)}“`, create_goal: () => `Naujas tikslas „${i.name}“ ${eur0(i.target)}`,
    update_goal: () => "Keisti tikslą", create_recurring: () => `Nauja pasikartojanti „${i.note}“ ${eur(i.amount)}`, update_recurring: () => "Keisti pasikartojančią operaciją",
    add_transaction: () => `Įrašyti ${eur(i.amount)} „${i.note}“`}[a.name] || (() => a.name))();
}
function applyPending(idx) {
  const m = S.ai.chat[idx]; if (!m?.pending) return;
  const snap = snapshot(); m.snap = snap;
  m.acts = m.pending.map(a => { const res = applyAction(a, snap); return typeof res === "string" ? {label: res, state: "done"} : {label: res.fail, state: "fail"}; });
  m.pending = null; saveChat(); render();
}
function undoMsg(idx) {
  const m = S.ai.chat[idx]; if (!m?.snap) return;
  undoSnapshot(m.snap); m.snap = null; m.acts = m.acts.map(a => a.state === "done" ? {...a, state: "undone"} : a);
  saveChat(); render(); toast("Pakeitimai atšaukti");
}
function scrollChat() { setTimeout(() => window.scrollTo({top: document.body.scrollHeight, behavior: "smooth"}), 30); }

function vAI() {
  if (!S.ai.chat) S.ai.chat = loadChat();
  const chat = S.ai.chat, run = S.ai.status === "run";
  const auto = S.cfg.prefs?.aiAuto !== false;
  const msgs = chat.map((m, i) => m.role === "user" ? `<div class="msg me">${esc(m.content)}</div>` : `<div class="msg ai ${m.err ? "err" : ""}">${md(m.content || "")}
    ${m.acts?.length ? `<div class="acts">${m.acts.map(a => `<div class="act ${a.state}"><span class="ic">${a.state === "done" ? "✓" : a.state === "fail" ? "!" : a.state === "undone" ? "↶" : "?"}</span><span>${esc(a.label)}</span></div>`).join("")}
      ${m.pending ? `<div class="row"><button class="btn small" data-aiapply="${i}">Pritaikyti</button><button class="btn ghost small" data-aidiscard="${i}">Atmesti</button></div>` : m.snap ? `<div class="row"><button class="linkbtn" data-aiundo="${i}">Atšaukti šiuos pakeitimus</button></div>` : ""}</div>` : ""}</div>`).join("");
  return `<div class="ai-top"><div class="subhead"><button class="linkbtn" data-sub="">‹ Daugiau</button><h2>AI patarėjas</h2></div>${chat.length ? `<button class="linkbtn" id="aiClear">Naujas pokalbis</button>` : ""}</div>
  <div class="chat">
    ${!chat.length ? `<div class="ai-hello"><b>Klausk apie savo pinigus</b><span>Matau tavo pajamas, išlaidas, biudžetus, tikslus ir investicijas. Galiu analizuoti ir ${auto ? "iškart pakeisti" : "pasiūlyti pakeitimus"}: biudžetus, kategorijas, taisykles, tikslus, pasikartojančias operacijas. Kiekvieną pakeitimą galėsi atšaukti.</span>
      <label class="check"><input type="checkbox" id="aiAuto" ${auto ? "checked" : ""}> Pakeitimus taikyti iš karto (neklausti)</label></div>` : ""}
    ${msgs}
    ${run ? `<div class="msg ai"><span class="typing"><i></i><i></i><i></i></span></div>` : ""}
    <div class="suggest">${SUGGEST.map(q => `<button data-aisuggest="${esc(q)}" ${run ? "disabled" : ""}>${esc(q)}</button>`).join("")}</div>
  </div>
  <div class="chatbar"><form id="chatForm"><textarea id="chatIn" rows="1" placeholder="Parašyk klausimą arba ką pakeisti…" ${run ? "disabled" : ""}></textarea>
    ${run ? `<button type="button" id="aiStop" aria-label="Stabdyti">■</button>` : `<button aria-label="Siųsti">${icon("send", 18)}</button>`}</form></div>`;
}
