/* Kišenė: redagavimo langai (kategorijos, pasikartojančios, taisyklės, tikslai) ir apžvalgos išdėstymas. */
"use strict";

function sheet(html, onMount, onDismiss) {
  const root = $("#sheetRoot");
  const close = () => { root.innerHTML = ""; document.removeEventListener("keydown", onKey); };
  const onKey = e => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  root.innerHTML = `<div class="sheet-bg" id="sheetBg">${html}</div>`;
  const dismiss = () => { close(); if (onDismiss) onDismiss(); };
  $("#sheetBg").onclick = e => { if (e.target.id === "sheetBg") dismiss(); };
  root.querySelectorAll("[data-close]").forEach(b => b.onclick = dismiss);
  onMount && onMount(close);
  return close;
}
const pickGrid = (name, items, sel, render) => `<div class="pick" role="radiogroup">${items.map(v => `<button type="button" role="radio" data-pick="${name}" data-val="${v}" aria-checked="${v === sel}" aria-label="${v}">${render(v)}</button>`).join("")}</div>`;
function wirePicks(root, st, redraw) {
  root.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => { st[b.dataset.pick] = b.dataset.val; redraw ? redraw() : root.querySelectorAll(`[data-pick="${b.dataset.pick}"]`).forEach(x => x.setAttribute("aria-checked", x.dataset.val === b.dataset.val)); });
}

/* ---------- Kategorija ---------- */
function openCatSheet(cat, type, onCreated, onBack) {
  const isEdit = !!cat;
  const used = categories().map(c => c.color);
  const st = {name: cat?.name || "", type: cat?.type || type || "exp", icon: cat?.icon || CAT_ICONS[cat?.id] || "tag", color: cat?.color || SWATCHES.find(s => !used.includes(s)) || "c1",
    budget: cat && budgetsFor(nowYm())[cat.id] ? String(budgetsFor(nowYm())[cat.id]).replace(".", ",") : "", del: false, moveTo: ""};
  const fixed = ["other", "iother"].includes(cat?.id);
  const count = isEdit ? [...S.txs.values()].filter(t => t.cat === cat.id).length : 0;
  const draw = () => {
    const others = catsOf(st.type).filter(c => c.id !== cat?.id);
    return sheet(`<form class="sheet" id="catForm" role="dialog" aria-modal="true" aria-label="Kategorija">
      <div class="grab"></div>
      <div class="cat-prev"><span class="tdot big" style="background:var(--${st.color})">${icon(st.icon, 22)}</span><h3 class="sheet-h">${isEdit ? "Kategorija" : "Nauja kategorija"}</h3></div>
      <label class="field">Pavadinimas<input id="ceName" value="${esc(st.name)}" maxlength="40" required placeholder="pvz. Augintiniai"></label>
      ${!isEdit ? `<div class="seg"><button type="button" data-ctype="exp" aria-pressed="${st.type === "exp"}">Išlaidos</button><button type="button" data-ctype="inc" aria-pressed="${st.type === "inc"}">Pajamos</button></div>` : ""}
      <div class="field">Ikona${pickGrid("icon", ICON_CHOICES, st.icon, v => icon(v, 20))}</div>
      <div class="field">Spalva${pickGrid("color", SWATCHES, st.color, v => `<i style="background:var(--${v})"></i>`)}</div>
      ${st.type === "exp" ? `<label class="field">Mėnesio biudžetas, € (nebūtina)<input id="ceBudget" inputmode="decimal" value="${esc(st.budget)}" placeholder="be ribos"></label>` : ""}
      <div class="row"><button class="btn" style="flex:1">${isEdit ? "Išsaugoti" : "Sukurti"}</button><button class="btn ghost" type="button" data-close>Uždaryti</button></div>
      ${isEdit && !fixed ? (st.del ? `<div class="set-group"><div class="fine">${count ? `${count} operacijos su šia kategorija bus perkeltos į:` : "Kategorija bus ištrinta."}</div>
          ${count ? `<select class="inp" id="ceMove">${others.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>` : ""}
          <div class="row"><button class="btn danger small" type="button" id="ceDelYes">Ištrinti</button><button class="btn ghost small" type="button" id="ceDelNo">Atšaukti</button></div></div>`
        : `<div class="row"><button class="linkbtn" type="button" id="ceHide">${cat.archived ? "Rodyti vėl" : "Slėpti"}</button><button class="linkbtn" type="button" id="ceDel" style="color:var(--crit)">Ištrinti</button></div>`) : ""}
    </form>`, close => {
      const keep = () => { st.name = $("#ceName").value; if ($("#ceBudget")) st.budget = $("#ceBudget").value; };
      const root = $("#sheetRoot");
      wirePicks(root, st, () => { keep(); draw(); });
      root.querySelectorAll("[data-ctype]").forEach(b => b.onclick = () => { keep(); st.type = b.dataset.ctype; draw(); });
      if ($("#ceDel")) $("#ceDel").onclick = () => { keep(); st.del = true; draw(); };
      if ($("#ceDelNo")) $("#ceDelNo").onclick = () => { keep(); st.del = false; draw(); };
      if ($("#ceHide")) $("#ceHide").onclick = () => { ensureCfg("categories"); S.cfg.categories = S.cfg.categories.map(c => c.id === cat.id ? {...c, archived: !c.archived} : c); saveSettings("categories"); close(); render(); };
      if ($("#ceDelYes")) $("#ceDelYes").onclick = () => {
        const to = $("#ceMove")?.value || (cat.type === "exp" ? "other" : "iother");
        const rows = [...S.txs.values()].filter(t => t.cat === cat.id).map(t => txRow({...t, cat: to}));
        if (rows.length) bulkUpsert("transactions", rows);
        ensureCfg("categories"); S.cfg.categories = S.cfg.categories.filter(c => c.id !== cat.id); saveSettings("categories");
        S.cfg.prefs = {...(S.cfg.prefs || {}), deletedCats: [...new Set([...(S.cfg.prefs?.deletedCats || []), cat.id])]}; saveSettings("prefs");
        S.cfg.rules = (S.cfg.rules || []).map(r => r.cat === cat.id ? {...r, cat: to} : r); saveSettings("rules");
        const b = {...S.cfg.budgets}; delete b[cat.id]; S.cfg.budgets = b; saveSettings("budgets");
        close(); render(); toast(`Kategorija „${cat.name}“ ištrinta`);
      };
      $("#catForm").onsubmit = e => {
        e.preventDefault(); keep();
        const name = st.name.trim(); if (!name) return;
        ensureCfg("categories");
        let id = cat?.id;
        if (isEdit) S.cfg.categories = S.cfg.categories.map(c => c.id === id ? {...c, name, icon: st.icon, color: st.color} : c);
        else { id = "c_" + shortId(); S.cfg.categories = [...S.cfg.categories, {id, name, type: st.type, icon: st.icon, color: st.color}]; }
        saveSettings("categories");
        if (st.type === "exp") {
          const v = parseNum(st.budget); const b = {...S.cfg.budgets};
          if (v > 0) b[id] = r2(v); else delete b[id];
          S.cfg.budgets = b; saveSettings("budgets");
        }
        close(); toast(isEdit ? "Kategorija išsaugota" : "Kategorija sukurta");
        if (onCreated) onCreated(id); else render();
      };
    }, onBack);
  };
  draw();
}

/* ---------- Pasikartojanti operacija ---------- */
function openRecSheet(rec) {
  const isEdit = !!rec;
  const st = {type: rec?.type || "exp", cat: rec?.cat || "home", amount: rec ? String(rec.amount).replace(".", ",") : "", note: rec?.note || "", day: rec?.day || Math.min(28, new Date().getDate()),
    account_id: rec?.account_id || "main", to_account_id: rec?.to_account_id || "", start: rec?.start || ymOf(todayISO()), active: rec ? rec.active : true, thisMonth: !isEdit,
    mode: rec ? recMode(rec) : null, match: rec?.match || "", variable: !!rec?.variable};
  const draw = () => {
    const isT = st.type === "trf";
    const cats = isT ? [] : catsByFreq(st.type); if (!isT && !cats.some(c => c.id === st.cat)) st.cat = cats[0]?.id;
    sheet(`<form class="sheet" id="recForm" role="dialog" aria-modal="true" aria-label="Pasikartojanti operacija">
      <div class="grab"></div><h3 class="sheet-h">${isEdit ? "Pasikartojanti operacija" : "Nauja pasikartojanti"}</h3>
      <div class="seg three"><button type="button" data-rt="exp" aria-pressed="${st.type === "exp"}">Išlaidos</button><button type="button" data-rt="inc" aria-pressed="${st.type === "inc"}">Pajamos</button><button type="button" data-rt="trf" aria-pressed="${isT}">Pervedimas</button></div>
      <div class="two"><label class="field">Suma, €<input id="reAmt" inputmode="decimal" value="${esc(st.amount)}" required></label><label class="field">Kiekvieno mėn. diena<input id="reDay" type="number" min="1" max="28" value="${st.day}"></label></div>
      <label class="field">Aprašymas<input id="reNote" value="${esc(st.note)}" maxlength="80" placeholder="pvz. Buto nuoma"></label>
      ${isT ? "" : `<label class="field">Kategorija<select id="reCat">${cats.map(c => `<option value="${c.id}" ${c.id === st.cat ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>`}
      <div class="two"><label class="field">${isT ? "Iš sąskaitos" : "Sąskaita"}<select id="reAcc">${accOptions(st.account_id)}</select></label>${isT ? `<label class="field">Į sąskaitą<select id="reTo">${accOptions(st.to_account_id, true)}</select></label>` : "<span></span>"}</div>
      <label class="field">Kaip sekti<select id="reMode"><option value="plan" ${(st.mode || (accById(st.account_id)?.kind === "cash" ? "auto" : "plan")) === "plan" ? "selected" : ""}>Laukti banko išrašo (tik planuoti)</option><option value="auto" ${(st.mode || (accById(st.account_id)?.kind === "cash" ? "auto" : "plan")) === "auto" ? "selected" : ""}>Sukurti operaciją automatiškai</option></select></label>
      <label class="field">Atpažinti išraše pagal tekstą (nebūtina)<input id="reMatch" value="${esc(st.match)}" placeholder="pvz. artea lizingas" autocomplete="off"></label>
      <label class="check"><input type="checkbox" id="reVar" ${st.variable ? "checked" : ""}> Suma kiekvieną mėnesį kinta (pvz. komunaliniai)</label>
      <label class="field">Pradžios mėnuo<input id="reStart" type="month" value="${st.start}"></label>
      <label class="check"><input type="checkbox" id="reActive" ${st.active ? "checked" : ""}> Aktyvi</label>
      ${!isEdit ? `<label class="check"><input type="checkbox" id="reNow" ${st.thisMonth ? "checked" : ""}> Jei kuriama automatiškai: įrašyti ir šio mėnesio operaciją, jei diena jau praėjo</label>` : `<div class="fine">Pakeitimai galioja būsimoms operacijoms. Jau sukurtų operacijų jie nekeičia.</div>`}
      <div id="reErr" class="err" hidden></div>
      <div class="row"><button class="btn" style="flex:1">${isEdit ? "Išsaugoti" : "Sukurti"}</button><button class="btn ghost" type="button" data-close>Uždaryti</button></div>
      ${isEdit ? `<button class="linkbtn" type="button" id="reDel" style="color:var(--crit);align-self:flex-start">Ištrinti</button>` : ""}
    </form>`, close => {
      const keep = () => { st.amount = $("#reAmt").value; st.day = +$("#reDay").value || 1; st.note = $("#reNote").value; if ($("#reCat")) st.cat = $("#reCat").value;
        st.account_id = $("#reAcc").value; if ($("#reTo")) st.to_account_id = $("#reTo").value; st.start = $("#reStart").value || st.start; st.active = $("#reActive").checked; if ($("#reNow")) st.thisMonth = $("#reNow").checked;
        st.mode = $("#reMode").value; st.match = $("#reMatch").value; st.variable = $("#reVar").checked; };
      $("#sheetRoot").querySelectorAll("[data-rt]").forEach(b => b.onclick = () => { keep(); st.type = b.dataset.rt; draw(); });
      if ($("#reDel")) $("#reDel").onclick = () => { const prev = S.cfg.recurring || []; S.cfg.recurring = prev.filter(r => r.id !== rec.id); saveSettings("recurring"); close(); render(); toast("Pasikartojanti operacija ištrinta", () => { S.cfg.recurring = prev; saveSettings("recurring"); render(); }); };
      $("#recForm").onsubmit = e => {
        e.preventDefault(); keep();
        const amount = r2(parseNum(st.amount)); const er = $("#reErr");
        if (!(amount > 0)) { er.textContent = "Įvesk sumą."; er.hidden = false; return; }
        if (st.type === "trf" && st.to_account_id === st.account_id) { er.textContent = "Pasirink skirtingas sąskaitas."; er.hidden = false; return; }
        const day = Math.max(1, Math.min(28, st.day));
        const base = {type: st.type, cat: st.type === "trf" ? "transfer" : st.cat, amount, note: st.note.trim(), day, account_id: st.account_id, to_account_id: st.type === "trf" ? (st.to_account_id || null) : null, start: st.start, active: st.active,
          mode: st.mode, match: normKey(st.match) || "", variable: st.variable};
        if (isEdit) {
          // jei pradžia perkelta į priekį, pirmos operacijos nesukursim anksčiau
          S.cfg.recurring = (S.cfg.recurring || []).map(r => r.id === rec.id ? {...r, ...base, last: r.last && r.last >= addMonths(st.start, -1) ? r.last : addMonths(st.start, -1)} : r);
        } else {
          const now = ymOf(todayISO());
          const last = st.thisMonth ? addMonths(st.start, -1) : (st.start > now ? addMonths(st.start, -1) : now);
          S.cfg.recurring = [...(S.cfg.recurring || []), {id: shortId(), ...base, last}];
        }
        saveSettings("recurring"); close(); generateRecurring(); render(); toast(isEdit ? "Išsaugota" : "Pasikartojanti operacija sukurta");
      };
    });
  };
  draw();
}

/* ---------- Taisyklė ---------- */
function ruleTargets(sel) {
  return `${catsOf("exp").map(c => `<option value="exp:${c.id}" ${sel === "exp:" + c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
    <optgroup label="Pajamos">${catsOf("inc").map(c => `<option value="inc:${c.id}" ${sel === "inc:" + c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</optgroup>
    <optgroup label="Pervedimas">${activeAccounts().map(a => `<option value="trf:${esc(a.id)}" ${sel === "trf:" + a.id ? "selected" : ""}>→ ${esc(a.name)}</option>`).join("")}<option value="trf:" ${sel === "trf:" ? "selected" : ""}>→ kita savo sąskaita</option></optgroup>`;
}
function openRuleSheet(rule) {
  const sel = rule ? (rule.type === "trf" ? "trf:" + (rule.to_account_id || "") : rule.type + ":" + rule.cat) : "exp:food";
  sheet(`<form class="sheet" id="ruleForm" role="dialog" aria-modal="true" aria-label="Taisyklė">
    <div class="grab"></div><h3 class="sheet-h">${rule ? "Taisyklė" : "Nauja taisyklė"}</h3>
    <label class="field">Kai aprašyme yra<input id="ruText" value="${esc(rule?.pattern || "")}" required placeholder="pvz. gardi mėsytė" autocomplete="off"></label>
    <label class="field">Priskirti<select id="ruTarget">${ruleTargets(sel)}</select></label>
    <label class="check"><input type="checkbox" id="ruApply" checked> Pritaikyti ir esamoms operacijoms</label>
    <div class="row"><button class="btn" style="flex:1">Išsaugoti</button><button class="btn ghost" type="button" data-close>Uždaryti</button></div>
    ${rule ? `<button class="linkbtn" type="button" id="ruDel" style="color:var(--crit);align-self:flex-start">Ištrinti taisyklę</button>` : ""}
  </form>`, close => {
    if ($("#ruDel")) $("#ruDel").onclick = () => { const prev = S.cfg.rules || []; S.cfg.rules = prev.filter(r => r.id !== rule.id); saveSettings("rules"); close(); render(); toast("Taisyklė ištrinta", () => { S.cfg.rules = prev; saveSettings("rules"); render(); }); };
    $("#ruleForm").onsubmit = e => {
      e.preventDefault();
      const pattern = $("#ruText").value.trim().toLowerCase(); if (!pattern) return;
      const [type, v] = $("#ruTarget").value.split(":");
      const nr = type === "trf" ? {id: rule?.id || shortId(), pattern, type, cat: "transfer", to_account_id: v || null} : {id: rule?.id || shortId(), pattern, type, cat: v};
      S.cfg.rules = [nr, ...(S.cfg.rules || []).filter(r => r.id !== nr.id && r.pattern !== pattern)]; saveSettings("rules");
      let n = 0;
      if ($("#ruApply").checked) {
        const rows = [];
        for (const t of S.txs.values()) {
          if (t.type === "trf" && type !== "trf") continue;
          if (!(`${t.note} ${t.memo}`.toLowerCase().includes(pattern))) continue;
          const dir = t.type === "inc" ? "in" : "out";
          if (type === "exp" && dir !== "out") continue; if (type === "inc" && dir !== "in") continue;
          const nt = type === "trf" ? {...t, type: "trf", cat: "transfer", to_account_id: v || null} : {...t, type, cat: v};
          if (nt.cat !== t.cat || nt.type !== t.type || nt.to_account_id !== t.to_account_id) rows.push(txRow(nt));
        }
        if (rows.length) { bulkUpsert("transactions", rows); n = rows.length; }
      }
      close(); render(); toast(n ? `Taisyklė išsaugota, pakeista ${n} operacijų` : "Taisyklė išsaugota");
    };
  });
}

/* ---------- Tikslas ---------- */
function openGoalSheet(goal) {
  const st = {color: goal?.color || SWATCHES[(S.cfg.goals || []).length % 8]};
  const draw = () => sheet(`<form class="sheet" id="goalForm" role="dialog" aria-modal="true" aria-label="Tikslas">
    <div class="grab"></div><h3 class="sheet-h">${goal ? "Tikslas" : "Naujas tikslas"}</h3>
    <label class="field">Pavadinimas<input id="goName" value="${esc(goal?.name || "")}" maxlength="40" required placeholder="pvz. Atostogos"></label>
    <div class="two"><label class="field">Tikslo suma, €<input id="goTarget" inputmode="decimal" value="${goal ? String(goal.target).replace(".", ",") : ""}" required></label>
      <label class="field">Jau sutaupyta, €<input id="goSaved" inputmode="decimal" value="${goal ? String(goal.saved).replace(".", ",") : ""}" placeholder="0"></label></div>
    <label class="field">Terminas (nebūtina)<input id="goDeadline" type="month" value="${goal?.deadline || ""}"></label>
    <div class="field">Spalva${pickGrid("color", SWATCHES, st.color, v => `<i style="background:var(--${v})"></i>`)}</div>
    <div class="row"><button class="btn" style="flex:1">${goal ? "Išsaugoti" : "Sukurti"}</button><button class="btn ghost" type="button" data-close>Uždaryti</button></div>
    ${goal ? `<button class="linkbtn" type="button" id="goDel" style="color:var(--crit);align-self:flex-start">Ištrinti tikslą</button>` : ""}
  </form>`, close => {
    wirePicks($("#sheetRoot"), st);
    if ($("#goDel")) $("#goDel").onclick = () => { const prev = S.cfg.goals || []; S.cfg.goals = prev.filter(g => g.id !== goal.id); saveSettings("goals"); close(); render(); toast("Tikslas ištrintas", () => { S.cfg.goals = prev; saveSettings("goals"); render(); }); };
    $("#goalForm").onsubmit = e => {
      e.preventDefault();
      const target = parseNum($("#goTarget").value); if (!(target > 0)) { toast("Įrašyk tikslo sumą"); return; }
      const g = {id: goal?.id || shortId(), name: $("#goName").value.trim(), target: r2(target), saved: r2(Math.max(0, parseNum($("#goSaved").value) || 0)), deadline: $("#goDeadline").value || null, color: st.color};
      S.cfg.goals = goal ? (S.cfg.goals || []).map(x => x.id === goal.id ? g : x) : [...(S.cfg.goals || []), g];
      saveSettings("goals"); close(); render(); toast(goal ? "Tikslas išsaugotas" : "Tikslas sukurtas");
    };
  });
  draw();
}

/* ---------- Apžvalgos išdėstymas ---------- */
const OVERVIEW_SECTIONS = [
  ["hero", "Laisvi pinigai šiam mėnesiui"], ["together", "Bendras biudžetas (susietos paskyros)"], ["review", "Operacijos be kategorijos"], ["wealth", "Turtas"], ["spend", "Kur keliauja pinigai"],
  ["income", "Iš kur ateina pajamos"], ["insights", "Pastebėjimai"], ["goals", "Tikslai"], ["trend", "Pusė metų"], ["recent", "Naujausios operacijos"]
];
function overviewLayout() {
  const saved = S.cfg.prefs?.layout || [];
  const out = saved.filter(x => OVERVIEW_SECTIONS.some(s => s[0] === x.id));
  // naujos skiltys įterpiamos savo vietoje, ne gale
  OVERVIEW_SECTIONS.forEach(([id], i) => {
    if (out.some(x => x.id === id)) return;
    const prev = OVERVIEW_SECTIONS.slice(0, i).reverse().find(([p]) => out.some(x => x.id === p));
    const at = prev ? out.findIndex(x => x.id === prev[0]) + 1 : 0;
    out.splice(at, 0, {id, on: true});
  });
  return out;
}
function saveLayout(l) { S.cfg.prefs = {...(S.cfg.prefs || {}), layout: l}; saveSettings("prefs"); }
function moveSection(id, dir) {
  const l = overviewLayout(); const i = l.findIndex(x => x.id === id), j = i + dir;
  if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; saveLayout(l); render();
}
function toggleSection(id) { saveLayout(overviewLayout().map(x => x.id === id ? {...x, on: !x.on} : x)); render(); }
function vLayoutEditor() {
  const l = overviewLayout();
  return `<div class="set-group"><h3>Apžvalgos skiltys</h3><div class="fine">Išjunk nereikalingas ir rodyklėmis pakeisk tvarką.</div>
    <div class="lay">${l.map((x, i) => `<div class="lrow ${x.on ? "" : "off"}"><label class="check"><input type="checkbox" data-laytoggle="${x.id}" ${x.on ? "checked" : ""}> ${esc(OVERVIEW_SECTIONS.find(s => s[0] === x.id)[1])}</label>
      <span class="row nowrap"><button class="icbtn" data-laymove="${x.id}" data-dir="-1" ${i === 0 ? "disabled" : ""} aria-label="Aukštyn">↑</button><button class="icbtn" data-laymove="${x.id}" data-dir="1" ${i === l.length - 1 ? "disabled" : ""} aria-label="Žemyn">↓</button></span></div>`).join("")}</div>
    <button class="linkbtn" id="layReset" style="align-self:flex-start">Atkurti numatytąjį</button></div>`;
}
