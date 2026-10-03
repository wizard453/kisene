/* Kišenė: bendra paskyra. Dvi susietos paskyros mato viena kitos pajamas ir išlaidas, apžvalgoje rodomas bendras biudžetas. */
"use strict";

S.partner = null;      // {link, id, email, txs, cats, loading}
S.linkAvail = undefined; // false, jei serveryje nėra bendros paskyros lentelių
S.linkCode = null;

async function fetchPartner() {
  if (!sb || !S.user || !navigator.onLine) return;
  const {data: link, error} = await sb.from("links").select("*").maybeSingle();
  if (error) { S.linkAvail = !/does not exist|schema cache|relation/i.test(error.message || "") ? undefined : false; if (S.partner) { S.partner = null; render(true); } return; }
  S.linkAvail = true;
  if (!link || !link.user_a || !link.user_b) { if (S.partner) { S.partner = null; render(true); } return; }
  const mine = link.user_a === S.user.id;
  const id = mine ? link.user_b : link.user_a, email = (mine ? link.email_b : link.email_a) || "";
  S.partner = {...(S.partner || {}), link, id, email, txs: S.partner && S.partner.id === id ? S.partner.txs : [], loading: !(S.partner && S.partner.id === id && S.partner.txs?.length)};
  try {
    const since = addMonths(ymOf(todayISO()), -13) + "-01";
    const txs = [];
    for (let from = 0; ; from += 1000) {
      const {data, error: e} = await sb.from("transactions").select("id,type,cat,amount,date").eq("user_id", id).gte("date", since).order("date", {ascending: false}).order("id").range(from, from + 999);
      if (e) throw e;
      txs.push(...data.map(r => ({...r, amount: Number(r.amount), date: String(r.date).slice(0, 10)})));
      if (data.length < 1000) break;
    }
    const {data: set} = await sb.from("settings").select("categories").eq("user_id", id).maybeSingle();
    if (S.partner?.id === id) S.partner = {...S.partner, txs, cats: set?.categories || null, loading: false};
    await fetchSharedGoals();
  } catch (e) { console.warn(e); if (S.partner?.id === id) S.partner = {...S.partner, loading: false}; }
  render(true);
}
const partnerName = () => S.cfg.prefs?.partnerName || (S.partner?.email || "Partneris").split("@")[0];
function pCat(id) {
  const c = (S.partner?.cats || []).find(x => x.id === id) || DEFAULT_CATEGORIES.find(x => x.id === id);
  return c ? {name: c.name, color: c.color || "c9"} : {name: "Kita", color: "c9"};
}
function pAgg(ym) {
  const a = {inc: 0, exp: 0, byCat: {}};
  for (const t of S.partner?.txs || []) {
    if (ymOf(t.date) !== ym) continue;
    if (t.type === "inc") a.inc += t.amount;
    else if (t.type === "exp") { a.exp += t.amount; a.byCat[t.cat] = (a.byCat[t.cat] || 0) + t.amount; }
  }
  return a;
}

/* ---------- Apžvalgos kortelė ---------- */
function ovTogether() {
  if (!S.partner) return "";
  const nm = partnerName();
  if (S.partner.loading) return `<section class="card"><div class="sec-h"><h2>Bendras biudžetas</h2><span class="aside">Tu + ${esc(nm)}</span></div><div class="empty">Įkeliama…</div></section>`;
  const me = monthAgg(S.ym, [...S.txs.values()]), pa = pAgg(S.ym);
  const inc = me.inc + pa.inc, exp = me.exp + pa.exp, net = inc - exp;
  // kategorijos sujungiamos pagal pavadinimą, kad sutaptų ir pačių sukurtos
  const cats = {};
  const add = (name, color, v, who) => { const k = name.toLowerCase(); cats[k] = cats[k] || {name, color, me: 0, pa: 0}; cats[k][who] += v; };
  for (const [id, v] of Object.entries(me.byCat)) { const c = catById(id); add(c.name, c.color, v, "me"); }
  for (const [id, v] of Object.entries(pa.byCat)) { const c = pCat(id); add(c.name, c.color, v, "pa"); }
  const top = Object.values(cats).sort((a, b) => (b.me + b.pa) - (a.me + a.pa)).slice(0, 6);
  const maxCat = Math.max(1, ...top.map(c => c.me + c.pa));
  const person = (label, a, cls) => {
    const m = Math.max(1, me.inc, me.exp, pa.inc, pa.exp);
    return `<div class="tog-p"><span class="tog-n"><i class="${cls}"></i>${esc(label)}</span>
      <span class="tog-b"><i class="inc" style="width:${a.inc / m * 100}%"></i></span><b class="num pos">+${eur0(a.inc)}</b>
      <span></span><span class="tog-b"><i class="exp" style="width:${a.exp / m * 100}%"></i></span><b class="num">−${eur0(a.exp)}</b></div>`;
  };
  return `<section class="card tog">
    <div class="sec-h"><h2>Bendras biudžetas</h2><span class="aside">Tu + ${esc(nm)}</span></div>
    <div class="tog-stats">
      <div><small>Pajamos</small><b class="num">${eur0(inc)}</b></div>
      <div><small>Išlaidos</small><b class="num">${eur0(exp)}</b></div>
      <div class="${net < 0 ? "neg" : ""}"><small>${net < 0 ? "Trūksta" : "Sutaupyta"}</small><b class="num">${net < 0 ? "−" : ""}${eur0(Math.abs(net))}</b>${inc > 0 && net > 0 ? `<small>${pct(net / inc * 100)} pajamų</small>` : ""}</div>
    </div>
    <div class="tog-people">${person("Tu", me, "me")}${person(nm, pa, "pa")}</div>
    ${top.length ? `<div class="tog-cats"><div class="tog-leg"><span><i class="me"></i>Tu</span><span><i class="pa"></i>${esc(nm)}</span></div>
      ${top.map(c => `<div class="tog-c"><span class="tog-cn">${esc(c.name)}</span><span class="tog-cb"><i class="me" style="width:${c.me / maxCat * 100}%"></i><i class="pa" style="width:${c.pa / maxCat * 100}%"></i></span><b class="num">${eur0(c.me + c.pa)}</b></div>`).join("")}</div>`
      : `<div class="empty">Šį mėnesį abiejų išlaidų dar nėra.</div>`}
    ${ovSharedGoalsMini()}
    ${!(S.sgoals || []).length && S.sgAvail !== false ? `<button class="linkbtn" data-go="more" data-sub="together" style="align-self:flex-start">+ Sukurti bendrą tikslą</button>` : ""}
  </section>`;
}

/* ---------- Nustatymų puslapis ---------- */
function vTogether() {
  const p = S.partner, c = S.confirm;
  let body = `${subHead("Bendra paskyra")}`;
  if (S.linkAvail === false) return body + `<div class="hint">Bendra paskyra dar neįjungta serveryje.</div>`;
  if (p) {
    return body + `<div class="set-group"><h3>Susieta</h3>
      <div class="fine">Tavo paskyra susieta su <b>${esc(p.email)}</b> nuo ${new Date(p.link.created_at).toLocaleDateString("lt-LT")}. Apžvalgoje rodomas bendras biudžetas. Abu matote vienas kito pajamas ir išlaidas, bet keisti gali tik savo operacijas.</div>
      <label class="field">Kaip vadinti apžvalgoje<input id="partnerName" value="${esc(S.cfg.prefs?.partnerName || "")}" placeholder="${esc((p.email || "").split("@")[0])}" maxlength="24"></label>
      <div class="row">${c === "unlink" ? `<button class="btn danger small" id="unlinkYes">Taip, atsieti</button><button class="btn ghost small" data-confirm="">Atšaukti</button>` : `<button class="btn ghost small" data-confirm="unlink">Atsieti paskyras</button>`}</div></div>
      ${vSharedGoals()}
      <div class="set-group"><h3>Patarimas</h3><div class="fine">Jei pervedate pinigus vienas kitam, tokį pervedimą pažymėk kaip pervedimą, o ne išlaidas, kad bendrame biudžete jis nebūtų skaičiuojamas du kartus.</div></div>`;
  }
  return body + `<div class="set-group"><div class="fine">Sujunk savo paskyrą su partnerio ar šeimos nario paskyra. Apžvalgoje atsiras bendras biudžetas: abiejų pajamos, išlaidos ir didžiausios išlaidų kategorijos kartu. Abu matysite vienas kito operacijas, bet keisti jas galės tik savininkas. Atsieti galima bet kada.</div></div>
    <div class="set-group"><h3>1. Sukurk kvietimo kodą</h3>
      ${S.linkCode ? `<div class="link-code num">${esc(S.linkCode)}</div><div class="fine">Kodas galioja 24 valandas. Partneris jį įveda savo programėlėje šiame puslapyje.</div>
        <div class="row"><button class="btn small" id="shareCode">Bendrinti kodą</button></div>`
      : `<div class="row"><button class="btn small" id="makeCode">Sukurti kodą</button></div>`}</div>
    <div class="set-group"><h3>2. Arba įvesk gautą kodą</h3>
      <form id="linkForm" class="row nowrap"><input id="linkCode" class="search" placeholder="pvz. 4F9A2C" maxlength="12" autocomplete="off" autocapitalize="characters" style="flex:1"><button class="btn small">Susieti</button></form>
      ${S.linkErr ? `<div class="err">${esc(S.linkErr)}</div>` : ""}</div>`;
}

const rpcErr = e => { const m = e?.message || ""; return /function .* does not exist|schema cache/i.test(m) ? "Bendra paskyra dar neįjungta serveryje." : m || "Nepavyko. Bandyk dar kartą."; };
document.addEventListener("click", async e => {
  const b = e.target.closest("#makeCode,#shareCode,#unlinkYes"); if (!b) return;
  e.stopPropagation();
  if (b.id === "makeCode") {
    b.disabled = true;
    const {data, error} = await sb.rpc("create_link_invite");
    if (error) { S.linkErr = rpcErr(error); } else { S.linkCode = data; S.linkErr = ""; }
    render(); return;
  }
  if (b.id === "shareCode") {
    const text = `Prisijunk prie mano bendro biudžeto Kišenėje: Daugiau → Bendra paskyra, kodas ${S.linkCode}`;
    if (navigator.share) navigator.share({text}).catch(() => {}); else { navigator.clipboard?.writeText(S.linkCode); toast("Kodas nukopijuotas"); }
    return;
  }
  if (b.id === "unlinkYes") {
    const {error} = await sb.from("links").delete().eq("id", S.partner.link.id);
    if (error) { toast(rpcErr(error)); return; }
    S.partner = null; S.confirm = null; render(); toast("Paskyros atsietos");
  }
}, true);
document.addEventListener("submit", async e => {
  if (e.target.id !== "linkForm") return;
  e.preventDefault(); e.stopPropagation();
  const code = $("#linkCode").value.trim(); if (!code) return;
  const {error} = await sb.rpc("accept_link_invite", {p_code: code});
  if (error) { S.linkErr = rpcErr(error); render(); return; }
  S.linkErr = ""; S.linkCode = null; toast("Paskyros susietos");
  await fetchPartner(); go("overview");
}, true);
document.addEventListener("input", e => {
  if (e.target.id !== "partnerName") return;
  S.cfg.prefs = {...(S.cfg.prefs || {}), partnerName: e.target.value.trim().slice(0, 24)}; saveSettings("prefs", 800);
}, true);

/* ---------- Bendri tikslai ---------- */
S.sgoals = null;        // [{id, name, target, deadline, created_by, entries: []}]
S.sgAvail = undefined;  // false, jei serveryje nėra lentelių
async function fetchSharedGoals() {
  if (!sb || !S.partner?.link) { S.sgoals = null; return; }
  const {data: goals, error} = await sb.from("shared_goals").select("*").eq("link_id", S.partner.link.id).order("created_at");
  if (error) { S.sgAvail = /does not exist|schema cache|relation/i.test(error.message || "") ? false : S.sgAvail; S.sgoals = S.sgoals || []; return; }
  S.sgAvail = true;
  let entries = [];
  if (goals.length) {
    const r = await sb.from("shared_goal_entries").select("*").in("goal_id", goals.map(g => g.id));
    if (!r.error) entries = r.data;
  }
  S.sgoals = goals.map(g => ({...g, target: Number(g.target), entries: entries.filter(e => e.goal_id === g.id).map(e => ({...e, amount: Number(e.amount)}))}));
}
function sgSum(g) {
  let me = 0, pa = 0;
  for (const e of g.entries) { if (e.user_id === S.user.id) me += e.amount; else pa += e.amount; }
  return {me: Math.max(0, me), pa: Math.max(0, pa), total: Math.max(0, me + pa)};
}
function sgMonths(n) {
  const out = [], start = ymOf(todayISO());
  for (let i = 1; i <= n; i++) out.push(addMonths(start, i));
  return out;
}
function sgCard(g, full) {
  const s = sgSum(g), p = Math.min(100, s.total / g.target * 100), nm = partnerName();
  const left = g.target - s.total;
  let pace = "";
  if (g.deadline && left > 0) {
    const months = Math.max(1, (+g.deadline.slice(0, 4) - +todayISO().slice(0, 4)) * 12 + (+g.deadline.slice(5, 7) - +todayISO().slice(5, 7)));
    const MG = ["sausio", "vasario", "kovo", "balandžio", "gegužės", "birželio", "liepos", "rugpjūčio", "rugsėjo", "spalio", "lapkričio", "gruodžio"];
    pace = ` · reikia ~${eur0(left / months)} per mėn. iki ${g.deadline.slice(0, 4)} m. ${MG[+g.deadline.slice(5, 7) - 1]}`;
  }
  return `<div class="sg">
    <div class="g1"><b>${esc(g.name)}</b><span class="num">${eur0(s.total)} / ${eur0(g.target)}</span></div>
    <div class="sgbar"><i class="me" style="width:${g.target ? Math.min(100, s.me / g.target * 100) : 0}%"></i><i class="pa" style="width:${g.target ? Math.min(100 - Math.min(100, s.me / g.target * 100), s.pa / g.target * 100) : 0}%"></i></div>
    <div class="fine">${left > 0 ? `Liko ${eur0(left)}${pace}` : "Tikslas pasiektas 🎉"}${full ? ` · Tu ${eur0(s.me)}, ${esc(nm)} ${eur0(s.pa)}` : ""}</div>
    ${full ? (S.confirm === "sgdel:" + g.id
      ? `<div class="row"><button class="btn danger small" data-sgdel="${g.id}">Taip, ištrinti tikslą</button><button class="btn ghost small" data-confirm="">Atšaukti</button></div>`
      : `<form class="row nowrap sg-form" data-sgform="${g.id}"><input class="inp" name="amt" inputmode="decimal" placeholder="Suma" style="width:100px"><button class="btn small" name="add" value="1">Įnešti</button><button class="btn ghost small" name="sub" value="1">Išimti</button><button type="button" class="linkbtn danger" data-confirm="sgdel:${g.id}" style="margin-left:auto">Ištrinti</button></form>`) : ""}
  </div>`;
}
function vSharedGoals() {
  if (!S.partner) return "";
  if (S.sgAvail === false) return `<div class="set-group"><h3>Bendri tikslai</h3><div class="hint">Bendri tikslai dar neįjungti serveryje.</div></div>`;
  const goals = S.sgoals || [];
  return `<div class="set-group"><h3>Bendri tikslai</h3>
    <div class="fine">Tikslas, kuriam taupote abu. Kiekvienas įneša savo dalį, o juostoje matyti, kiek įnešė kiekvienas.</div>
    ${goals.map(g => sgCard(g, true)).join("") || `<div class="empty" style="padding:8px 0">Bendrų tikslų dar nėra.</div>`}
    <form id="sgNew" class="sg-new"><b>Naujas bendras tikslas</b>
      <label class="field">Pavadinimas<input id="sgName" maxlength="60" placeholder="pvz. Atostogos Italijoje" required></label>
      <div class="two"><label class="field">Suma, €<input id="sgTarget" inputmode="decimal" placeholder="2000" required></label>
      <label class="field">Iki kada<select id="sgDeadline"><option value="">Be termino</option>${sgMonths(36).map(m => `<option value="${m}">${ymLabel(m)}</option>`).join("")}</select></label></div>
      <button class="btn small">Sukurti</button></form></div>`;
}
function ovSharedGoalsMini() {
  const goals = (S.sgoals || []).slice(0, 3);
  if (!goals.length) return "";
  return `<div class="tog-goals"><div class="row between"><b style="font-size:14px">Bendri tikslai</b><button class="linkbtn" data-go="more" data-sub="together">Visi</button></div>${goals.map(g => sgCard(g, false)).join("")}</div>`;
}
document.addEventListener("submit", async e => {
  const f = e.target;
  if (f.id === "sgNew") {
    e.preventDefault(); e.stopPropagation();
    const name = $("#sgName").value.trim(), target = parseNum($("#sgTarget").value);
    if (!name || !(target > 0)) { toast("Įrašyk pavadinimą ir sumą"); return; }
    const {error} = await sb.from("shared_goals").insert({link_id: S.partner.link.id, name: name.slice(0, 60), target: r2(target), deadline: $("#sgDeadline").value || null});
    if (error) { toast(rpcErr(error)); return; }
    await fetchSharedGoals(); render(); toast("Bendras tikslas sukurtas"); return;
  }
  if (f.dataset && f.dataset.sgform) {
    e.preventDefault(); e.stopPropagation();
    const amt = parseNum(f.querySelector("[name=amt]").value);
    if (!(amt > 0)) { toast("Įrašyk sumą"); return; }
    const sign = e.submitter && e.submitter.name === "sub" ? -1 : 1;
    const {error} = await sb.from("shared_goal_entries").insert({goal_id: f.dataset.sgform, amount: r2(sign * amt)});
    if (error) { toast(rpcErr(error)); return; }
    await fetchSharedGoals(); render(); toast(sign > 0 ? "Įnešta" : "Išimta");
  }
}, true);
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-sgdel]"); if (!b) return;
  e.stopPropagation();
  const {error} = await sb.from("shared_goals").delete().eq("id", b.dataset.sgdel);
  if (error) { toast(rpcErr(error)); return; }
  S.confirm = null; await fetchSharedGoals(); render(); toast("Bendras tikslas ištrintas");
}, true);
