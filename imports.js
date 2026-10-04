/* Kišenė: įkeltų CSV failų sąrašas. Kiekvieną failą galima peržiūrėti, perkelti į kitą sąskaitą, pakeisti kitu failu arba ištrinti. */
"use strict";

// Įkėlimo informacija saugoma nustatymuose, o kiekviena operacija žino savo failą (import_id)
function recordImport(kind, meta) {
  const id = "imp_" + shortId();
  const list = [{id, kind, at: new Date().toISOString(), ...meta}, ...(S.cfg.prefs?.imports || [])].slice(0, 150);
  S.cfg.prefs = {...(S.cfg.prefs || {}), imports: list}; saveSettings("prefs");
  return id;
}
function forgetImport(id) {
  S.cfg.prefs = {...(S.cfg.prefs || {}), imports: (S.cfg.prefs?.imports || []).filter(x => x.id !== id)}; saveSettings("prefs");
}

// Operacijos, priklausančios įkėlimui. Senesni įkėlimai (be failo žymės) grupuojami pagal sąskaitą ir mėnesį arba platformą.
function importItems(key) {
  if (key.startsWith("legacy:bank:")) {
    const [, , acc, ym] = key.split(":");
    return [...S.txs.values()].filter(t => !t.import_id && t.memo && !t.recurring_id && t.account_id === acc && ymOf(t.date) === ym);
  }
  if (key.startsWith("legacy:inv:")) {
    const plat = key.slice("legacy:inv:".length);
    return [...S.inv.values()].filter(t => !t.import_id && (t.platform || "") === plat);
  }
  const meta = (S.cfg.prefs?.imports || []).find(x => x.id === key);
  return [...(meta?.kind === "inv" ? S.inv : S.txs).values()].filter(t => t.import_id === key);
}
function importGroups(kind) {
  const out = [];
  for (const m of S.cfg.prefs?.imports || []) {
    if (m.kind !== kind) continue;
    const items = importItems(m.id);
    if (!items.length) continue;
    const dates = items.map(t => t.date).sort();
    out.push({key: m.id, file: m.file || "CSV failas", at: m.at, account_id: m.account_id, platform: m.platform, n: items.length, from: dates[0], to: dates[dates.length - 1]});
  }
  if (kind === "bank") {
    const g = {};
    for (const t of S.txs.values()) if (!t.import_id && t.memo && !t.recurring_id) { const k = `legacy:bank:${t.account_id}:${ymOf(t.date)}`; (g[k] = g[k] || []).push(t.date); }
    Object.entries(g).sort((a, b) => b[0].localeCompare(a[0])).forEach(([k, ds]) => { ds.sort(); const [, , acc, ym] = k.split(":"); out.push({key: k, legacy: true, file: `Importuota anksčiau · ${ymLabel(ym)}`, account_id: acc, n: ds.length, from: ds[0], to: ds[ds.length - 1]}); });
  } else {
    const g = {};
    for (const t of S.inv.values()) if (!t.import_id) { const k = `legacy:inv:${t.platform || ""}`; (g[k] = g[k] || []).push(t.date); }
    Object.entries(g).forEach(([k, ds]) => { ds.sort(); const plat = k.slice(11); out.push({key: k, legacy: true, file: `Visos ${plat || "be platformos"} operacijos be failo`, platform: plat, n: ds.length, from: ds[0], to: ds[ds.length - 1]}); });
  }
  return out;
}
const shortDate = d => d ? d.slice(0, 10).split("-").reverse().slice(0, 2).join(".") + "." + d.slice(2, 4) : "";

function vImportsList(kind) {
  const groups = importGroups(kind);
  if (!groups.length) return "";
  const c = S.confirm;
  return `<div class="set-group"><h3>Įkelti failai</h3>
    ${!impOk() ? `<div class="hint">Failų trynimas ir keitimas dar neįjungtas serveryje. Kol jis neįjungtas, nauji failai bus rodomi kaip „Importuota anksčiau“.</div>` : ""}
    <div class="imps">${groups.map(g => `<div class="imp">
      <div class="imp-h"><span class="imp-ic">${icon(kind === "bank" ? "receipt" : "briefcase", 18)}</span>
        <span class="imp-t"><b>${esc(g.file)}</b><small>${g.n} oper. · ${shortDate(g.from)}–${shortDate(g.to)}${kind === "bank" ? " · " + esc(accName(g.account_id)) : g.platform ? " · " + esc(g.platform) : ""}${g.at ? " · įkelta " + shortDate(g.at) : ""}</small></span></div>
      ${c === "imp:" + g.key ? `<div class="row"><span class="err">Ištrinti ${g.n} operacijas?</span><button class="btn danger small" data-impdel="${esc(g.key)}">Ištrinti</button><button class="btn ghost small" data-confirm="">Atšaukti</button></div>`
      : `<div class="imp-a">
        ${kind === "bank" ? `<button class="linkbtn" data-impview="${esc(g.key)}">Peržiūrėti</button>
          <label class="imp-acc">Sąskaita <select data-impacc="${esc(g.key)}">${accOptions(g.account_id)}</select></label>` : ""}
        <button class="linkbtn" data-imprepl="${esc(g.key)}">Pakeisti kitu failu</button>
        <button class="linkbtn danger" data-confirm="imp:${esc(g.key)}">Ištrinti</button></div>`}
    </div>`).join("")}</div></div>`;
}

function deleteImport(key, silent) {
  const kind = key.startsWith("legacy:inv:") || (S.cfg.prefs?.imports || []).find(x => x.id === key)?.kind === "inv" ? "inv" : "bank";
  const items = importItems(key).map(t => ({...t}));
  if (!items.length) return null;
  const table = kind === "inv" ? "inv_tx" : "transactions";
  bulkDelete(table, items.map(t => t.id));
  const meta = (S.cfg.prefs?.imports || []).find(x => x.id === key);
  if (meta) forgetImport(key);
  S.confirm = null; render();
  if (!silent) toast(`Ištrinta ${items.length} operacijų`, () => {
    bulkUpsert(table, items.map(t => kind === "inv" ? invRow(t) : txRow(t)));
    if (meta) { S.cfg.prefs = {...(S.cfg.prefs || {}), imports: [meta, ...(S.cfg.prefs?.imports || [])]}; saveSettings("prefs"); }
    render();
  });
  return {kind, items};
}
function moveImport(key, acc) {
  const items = importItems(key); if (!items.length || !accById(acc)) return;
  bulkUpsert("transactions", items.map(t => txRow({...t, account_id: acc, to_account_id: t.to_account_id === acc ? null : t.to_account_id})));
  const list = (S.cfg.prefs?.imports || []).map(x => x.id === key ? {...x, account_id: acc} : x);
  S.cfg.prefs = {...(S.cfg.prefs || {}), imports: list}; saveSettings("prefs");
  render(); toast(`${items.length} operacijos perkeltos į „${accName(acc)}“`);
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-impdel],[data-impview],[data-imprepl]"); if (!t || t.closest("#sheetRoot")) return;
  e.stopPropagation();
  const d = t.dataset;
  if (d.impdel) { deleteImport(d.impdel); return; }
  if (d.impview) {
    S.filter = {...S.filter, imp: d.impview, cat: null, q: "", type: "all", acc: "all"}; go("list"); return;
  }
  if (d.imprepl) {
    // naujas failas pasirenkamas pirmiausia; senasis ištrinamas tik tada, kai naujas pasirinktas
    const key = d.imprepl, meta = (S.cfg.prefs?.imports || []).find(x => x.id === key);
    const isInv = key.startsWith("legacy:inv:") || meta?.kind === "inv";
    const acc = meta?.account_id || (key.startsWith("legacy:bank:") ? key.split(":")[2] : null);
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".csv,text/csv,.txt"; inp.style.display = "none"; document.body.appendChild(inp);
    inp.onchange = async () => {
      const f = inp.files[0]; inp.remove(); if (!f) return;
      const text = await readFileText(f);
      const imp = isInv ? invSetup(f.name, text) : bankSetup(f.name, text);
      if (!imp) { toast("Faile nerasta eilučių"); return; }
      deleteImport(key);
      if (isInv) { S.invImp = imp; S.sub = "invimport"; if (S.tab !== "more") S.tab = "invest"; }
      else { imp.account_id = acc && accById(acc) ? acc : "main"; S.imp = imp; S.tab = "more"; S.sub = "import"; }
      render(); window.scrollTo(0, 0);
    };
    inp.click();
  }
}, true);
document.addEventListener("change", e => {
  const el = e.target; if (!el.dataset || !el.dataset.impacc) return;
  e.stopPropagation(); moveImport(el.dataset.impacc, el.value);
}, true);
