/* Kišenė: duomenys, sinchronizacija su Supabase ir darbas be interneto. */
"use strict";

const CFG = {...(window.KISENE_CONFIG || {})};
// jei įklijuotas adresas su /rest/v1/ gale, jį nukerpam
if (CFG.SUPABASE_URL) CFG.SUPABASE_URL = String(CFG.SUPABASE_URL).trim().replace(/\/(rest|auth|functions)\/v1\/?.*$/, "").replace(/\/+$/, "");
const CONFIGURED = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && !/XXXX/.test(CFG.SUPABASE_URL) && !/IKLIJUOK/.test(CFG.SUPABASE_ANON_KEY));
const sb = CONFIGURED && window.supabase ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
  auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}
}) : null;

const SETTINGS_FIELDS = ["budgets", "categories", "rules", "accounts", "recurring", "goals", "assets", "prefs"];
const blankCfg = () => ({budgets: {}, categories: null, rules: [], accounts: null, recurring: [], goals: [], assets: {}, prefs: {}});

const S = {
  user: null, authMode: "login", authMsg: "", authErr: "", recovery: false,
  tab: "overview", sub: null, ym: ymOf(todayISO()),
  txs: new Map(), inv: new Map(), cfg: blankCfg(), demoDismissed: false, demo: false,
  outbox: [], sync: "off", loaded: false,
  filter: {q: "", type: "all", acc: "all"},
  ai: {status: "idle", chat: null, ctrl: null},
  imp: null, invImp: null, invView: {group: "type", range: "all"}, market: {quotes: {}, fx: {}, at: 0, hist: null, histAt: 0, histKey: ""},
  confirm: null, installEvt: null
};
let channel = null, channelOk = false;

/* ---------- Modelis ---------- */
// Vartotojo kategorijos + naujos numatytosios, kurių dar nėra jo sąraše (ištrintos nebegrąžinamos)
const categories = () => {
  const own = S.cfg.categories; if (!own) return DEFAULT_CATEGORIES;
  const gone = new Set(S.cfg.prefs?.deletedCats || []);
  return [...own, ...DEFAULT_CATEGORIES.filter(d => !gone.has(d.id) && !own.some(c => c.id === d.id))];
};
const catsOf = type => categories().filter(c => c.type === type && !c.archived);
const catById = id => categories().find(c => c.id === id) || (id === "transfer" ? {id, name: "Pervedimas", color: "c9", type: "trf"} : {id, name: id || "Kita", color: "c9", type: "exp"});
const accounts = () => S.cfg.accounts || DEFAULT_ACCOUNTS;
const activeAccounts = () => accounts().filter(a => !a.archived);
const accById = id => accounts().find(a => a.id === id);
const accName = id => id ? (accById(id)?.name || "Ištrinta sąskaita") : "Kita sąskaita";
const isInvestAcc = id => accById(id)?.kind === "invest";
const isLoanAcc = id => accById(id)?.kind === "loan";

// Sąskaitos likutis: pradinis likutis tam tikrą dieną + vėlesnės operacijos
function accountBalance(acc, upTo) {
  if (!acc.anchor) return null;
  let b = acc.anchor.amount;
  for (const t of S.txs.values()) {
    if (t.date <= acc.anchor.date || (upTo && t.date > upTo)) continue;
    if (t.type === "inc" && t.account_id === acc.id) b += t.amount;
    else if (t.type === "exp" && t.account_id === acc.id) b -= t.amount;
    else if (t.type === "trf") { if (t.account_id === acc.id) b -= t.amount; if (t.to_account_id === acc.id) b += t.amount; }
  }
  return r2(b);
}

/* ---------- Vietinė kopija ---------- */
const cacheKey = () => "kisene.cache2." + S.user.id;
function saveCache() {
  if (!S.user) return;
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({txs: [...S.txs.values()], inv: [...S.inv.values()], cfg: S.cfg, demoDismissed: S.demoDismissed, outbox: S.outbox}));
  } catch (e) {}
}
function loadCache() {
  try {
    const o = JSON.parse(localStorage.getItem(cacheKey()) || "null");
    if (!o) return;
    S.txs = new Map((o.txs || []).map(t => [t.id, t]));
    S.inv = new Map((o.inv || []).map(t => [t.id, t]));
    S.cfg = {...blankCfg(), ...(o.cfg || {})};
    S.demoDismissed = !!o.demoDismissed;
    S.outbox = Array.isArray(o.outbox) ? o.outbox : [];
    S.loaded = true;
  } catch (e) {}
  try { const m = JSON.parse(localStorage.getItem("kisene.market." + S.user.id) || "null"); if (m) S.market = {...S.market, ...m}; } catch (e) {}
}
function saveMarket() { try { localStorage.setItem("kisene.market." + S.user.id, JSON.stringify(S.market)); } catch (e) {} }

/* ---------- Eilutės formatai ---------- */
const TX_COLS = "id,type,cat,amount,date,note,account_id,to_account_id,memo,recurring_id,created_at";
const INV_COLS = "id,date,kind,platform,symbol,name,isin,qty,price,currency,amount,fee,amount_eur,note,created_at";
function txRow(t) {
  return {id: t.id, type: t.type, cat: t.type === "trf" ? "transfer" : t.cat, amount: r2(t.amount), date: t.date, note: (t.note || "").slice(0, 120),
    account_id: t.account_id || "main", to_account_id: t.type === "trf" ? (t.to_account_id || null) : null, memo: (t.memo || "").slice(0, 300), recurring_id: t.recurring_id || null};
}
function normTx(r) {
  return {id: r.id, type: r.type, cat: r.cat, amount: Number(r.amount), date: String(r.date).slice(0, 10), note: r.note || "", account_id: r.account_id || "main",
    to_account_id: r.to_account_id || null, memo: r.memo || "", recurring_id: r.recurring_id || null, created_at: r.created_at};
}
function invRow(t) {
  const n = v => Number.isFinite(+v) ? +v : 0;
  return {id: t.id, date: t.date, kind: t.kind, platform: (t.platform || "").slice(0, 60), symbol: (t.symbol || "").slice(0, 40), name: (t.name || "").slice(0, 120),
    isin: (t.isin || "").slice(0, 20), qty: n(t.qty), price: n(t.price), currency: (t.currency || "EUR").toUpperCase().slice(0, 8), amount: r2(n(t.amount)), fee: r2(n(t.fee)),
    amount_eur: t.amount_eur == null || t.amount_eur === "" ? null : r2(n(t.amount_eur)), note: (t.note || "").slice(0, 200)};
}
function normInv(r) { return {...invRow(r), created_at: r.created_at}; }

/* ---------- Pakeitimų eilė ---------- */
function enqueue(op) {
  if (op.kind === "upsert" || op.kind === "delete") S.outbox = S.outbox.filter(o => !((o.kind === "upsert" || o.kind === "delete") && o.table === op.table && o.id === op.id));
  if (op.kind === "settings") {
    const prev = S.outbox.find(o => o.kind === "settings");
    if (prev) { prev.fields = [...new Set([...prev.fields, ...op.fields])]; saveCache(); flush(); return; }
  }
  if (op.kind === "wipe") S.outbox = S.outbox.filter(o => !(o.table === op.table));
  S.outbox.push(op);
  saveCache();
  flush();
}
const pendingId = (table, id) => S.outbox.some(o => o.table === table && o.id === id);
const pendingSettings = () => (S.outbox.find(o => o.kind === "settings") || {fields: []}).fields;

let flushing = false;
async function flush() {
  if (flushing || !sb || !S.user) return;
  if (!navigator.onLine) { setSync("off"); return; }
  if (!S.outbox.length) { setSync(channelOk ? "ok" : "busy"); return; }
  flushing = true; setSync("busy");
  try {
    while (S.outbox.length) {
      const op = S.outbox[0];
      let n = 1, error = null, status = 0;
      if (op.kind === "upsert") {
        const batch = [];
        while (n - 1 < S.outbox.length && S.outbox[n - 1].kind === "upsert" && S.outbox[n - 1].table === op.table && batch.length < 500) { batch.push(S.outbox[n - 1].row); n++; }
        n--;
        ({error, status} = await sb.from(op.table).upsert(batch));
      } else if (op.kind === "delete") {
        ({error, status} = await sb.from(op.table).delete().eq("id", op.id));
      } else if (op.kind === "wipe") {
        ({error, status} = await sb.from(op.table).delete().eq("user_id", S.user.id));
      } else if (op.kind === "settings") {
        const row = {user_id: S.user.id};
        for (const f of op.fields) { if (f === "demo_dismissed") row.demo_dismissed = S.demoDismissed; else row[f] = S.cfg[f]; }
        ({error, status} = await sb.from("settings").upsert(row));
      }
      if (error) {
        const st = Number(status || 0);
        const permanent = (st >= 400 && st < 500 && ![401, 408, 429].includes(st)) || /violates|invalid input|check constraint|does not exist/i.test(error.message || "");
        if (permanent) {
          console.warn("Atmestas pakeitimas", op, error);
          S.outbox.splice(0, n); saveCache();
          toast("Vieno pakeitimo išsaugoti nepavyko");
          continue;
        }
        if (st === 401) await sb.auth.refreshSession().catch(() => {});
        setSync("err");
        break;
      }
      S.outbox.splice(0, n);
      saveCache();
    }
  } catch (e) {
    setSync(navigator.onLine ? "err" : "off");
  } finally { flushing = false; }
  if (!S.outbox.length) setSync(channelOk ? "ok" : "busy");
  renderSync();
}

async function fetchTable(table, cols) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const {data, error} = await sb.from(table).select(cols).order("date", {ascending: false}).order("id").range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}
async function fetchAll() {
  if (!sb || !S.user || !navigator.onLine) return;
  setSync("busy");
  let txs, inv, set;
  try {
    [txs, inv] = await Promise.all([fetchTable("transactions", TX_COLS), fetchTable("inv_tx", INV_COLS)]);
    const r = await sb.from("settings").select("*").maybeSingle();
    if (r.error) throw r.error;
    set = r.data;
  } catch (e) {
    console.warn(e);
    setSync("err");
    if (/does not exist|column/i.test(e.message || "")) toast("Duomenų įkelti nepavyko");
    return;
  }
  const apply = (table, rows, norm) => {
    const map = new Map(rows.map(r => [r.id, norm(r)]));
    for (const op of S.outbox) {
      if (op.table !== table) continue;
      if (op.kind === "wipe") map.clear();
      if (op.kind === "upsert") { const prev = map.get(op.id), v = norm(op.row); if (prev && !v.created_at) v.created_at = prev.created_at; map.set(op.id, v); }
      if (op.kind === "delete") map.delete(op.id);
    }
    return map;
  };
  S.txs = apply("transactions", txs, normTx);
  S.inv = apply("inv_tx", inv, normInv);
  if (set) {
    const pend = pendingSettings();
    for (const f of SETTINGS_FIELDS) if (!pend.includes(f) && set[f] !== undefined) S.cfg[f] = set[f] ?? blankCfg()[f];
    if (!pend.includes("demo_dismissed")) S.demoDismissed = !!set.demo_dismissed;
  }
  S.loaded = true;
  saveCache(); refreshDemo();
  await generateRecurring();
  render(true);
  if (typeof maybeOnboard === "function") maybeOnboard();
  if (typeof maybeTour === "function") maybeTour();
  flush();
}

function subscribe() {
  if (!sb || !S.user) return;
  if (channel) sb.removeChannel(channel);
  const uid = S.user.id, f = "user_id=eq." + uid;
  const onRow = (table, map, norm) => p => {
    if (p.eventType === "DELETE") { const id = p.old && p.old.id; if (!id || pendingId(table, id)) return; if (map().delete(id)) changed(); return; }
    if (!p.new || pendingId(table, p.new.id)) return;
    map().set(p.new.id, norm(p.new)); changed();
  };
  const txH = onRow("transactions", () => S.txs, normTx), invH = onRow("inv_tx", () => S.inv, normInv);
  channel = sb.channel("kisene-" + uid)
    .on("postgres_changes", {event: "INSERT", schema: "public", table: "transactions", filter: f}, txH)
    .on("postgres_changes", {event: "UPDATE", schema: "public", table: "transactions", filter: f}, txH)
    .on("postgres_changes", {event: "DELETE", schema: "public", table: "transactions"}, txH)
    .on("postgres_changes", {event: "INSERT", schema: "public", table: "inv_tx", filter: f}, invH)
    .on("postgres_changes", {event: "UPDATE", schema: "public", table: "inv_tx", filter: f}, invH)
    .on("postgres_changes", {event: "DELETE", schema: "public", table: "inv_tx"}, invH)
    .on("postgres_changes", {event: "*", schema: "public", table: "settings", filter: f}, p => {
      if (!p.new) return;
      const pend = pendingSettings();
      for (const k of SETTINGS_FIELDS) if (!pend.includes(k) && p.new[k] !== undefined) S.cfg[k] = p.new[k] ?? blankCfg()[k];
      if (!pend.includes("demo_dismissed")) S.demoDismissed = !!p.new.demo_dismissed;
      changed();
    })
    .subscribe(status => {
      channelOk = status === "SUBSCRIBED";
      if (channelOk && !S.outbox.length) setSync("ok");
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setSync(navigator.onLine ? "err" : "off");
    });
}
let changeT = null;
function changed() { saveCache(); refreshDemo(); clearTimeout(changeT); changeT = setTimeout(() => render(true), 60); }

function setSync(s) { S.sync = s; renderSync(); }
function renderSync() {
  const el = $("#syncNote"); if (!el) return;
  const n = S.outbox.length;
  const txt = {ok: "Sinchronizuota", busy: n ? `Siunčiama (${n})…` : "Sinchronizuojama…", off: n ? `Be interneto · laukia ${n}` : "Be interneto", err: n ? `Nepavyko išsiųsti · laukia ${n}` : "Ryšio klaida"}[S.sync] || "";
  el.className = "sync " + S.sync;
  el.querySelector("span").textContent = txt;
}

/* ---------- Veiksmai ---------- */
function saveTx(t) {
  const row = txRow(t);
  S.txs.set(row.id, {...normTx(row), created_at: t.created_at || new Date().toISOString()});
  refreshDemo();
  enqueue({kind: "upsert", table: "transactions", id: row.id, row});
}
function removeTx(id) { S.txs.delete(id); refreshDemo(); enqueue({kind: "delete", table: "transactions", id}); }
function saveInv(t) {
  const row = invRow(t);
  S.inv.set(row.id, {...row, created_at: t.created_at || new Date().toISOString()});
  enqueue({kind: "upsert", table: "inv_tx", id: row.id, row});
}
function removeInv(id) { S.inv.delete(id); enqueue({kind: "delete", table: "inv_tx", id}); }
function bulkUpsert(table, rows) {
  const map = table === "inv_tx" ? S.inv : S.txs;
  const now = new Date().toISOString();
  for (const row of rows) {
    map.set(row.id, {...(table === "inv_tx" ? row : normTx(row)), created_at: map.get(row.id)?.created_at || now});
    S.outbox = S.outbox.filter(o => !(o.table === table && o.id === row.id));
    S.outbox.push({kind: "upsert", table, id: row.id, row});
  }
  refreshDemo(); saveCache(); flush();
}
const settingsTimers = {};
function saveSettings(field, delay) {
  if (field === "demo_dismissed") { enqueue({kind: "settings", fields: ["demo_dismissed"]}); return; }
  saveCache();
  clearTimeout(settingsTimers[field]);
  settingsTimers[field] = setTimeout(() => enqueue({kind: "settings", fields: [field]}), delay || 0);
}
function ensureCfg(field) {
  if (field === "categories") S.cfg.categories = categories().map(c => ({...c}));
  if (field === "accounts" && !S.cfg.accounts) S.cfg.accounts = DEFAULT_ACCOUNTS.map(a => ({...a}));
  return S.cfg[field];
}

/* ---------- Pasikartojančios operacijos ---------- */
let generating = false;
async function generateRecurring() {
  if (generating || !S.user || !S.loaded) return;
  generating = true;
  try {
    const now = ymOf(todayISO()), today = new Date().getDate();
    let changedAny = false;
    const rows = [];
    for (const r of S.cfg.recurring || []) {
      if (!r.active || recMode(r) !== "auto") continue;
      let m = r.last ? addMonths(r.last, 1) : r.start;
      let guard = 0;
      while (m <= now && guard++ < 36) {
        if (m === now && today < r.day) break;
        const id = await stableId("rec:" + r.id + ":" + m);
        if (!S.txs.has(id)) rows.push({id, type: r.type, cat: r.type === "trf" ? "transfer" : r.cat, amount: r.amount, date: m + "-" + pad2(r.day), note: r.note || "",
          account_id: r.account_id || "main", to_account_id: r.type === "trf" ? (r.to_account_id || null) : null, memo: "", recurring_id: r.id});
        r.last = m; changedAny = true;
        m = addMonths(m, 1);
      }
    }
    if (rows.length) bulkUpsert("transactions", rows);
    if (changedAny) saveSettings("recurring");
  } finally { generating = false; }
}

/* ---------- Pavyzdiniai duomenys ---------- */
function demoData() {
  const out = []; const base = ymOf(todayISO()); let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let k = 5; k >= 0; k--) {
    const ym = addMonths(base, -k); const last = k === 0 ? Math.min(28, new Date().getDate()) : 28;
    const add = (day, type, cat, amount, note, extra) => { if (day <= last) out.push({id: "demo" + out.length, type, cat, amount: r2(amount), date: ym + "-" + pad2(day), note, account_id: "main", demo: true, ...extra}); };
    add(5, "inc", "salary", 1850, "Atlyginimas");
    if (k % 2 === 0) add(18, "inc", "side", 120 + rnd() * 180, "Vertimo darbas");
    add(3, "exp", "home", 520, "Buto nuoma");
    add(14, "exp", "home", 62 + rnd() * 40, "Ignitis");
    add(9, "exp", "subs", 12.99, "Netflix"); add(11, "exp", "subs", 10.99, "Spotify");
    for (let w = 0; w < 4; w++) { add(2 + w * 7, "exp", "food", 35 + rnd() * 40, ["Maxima","Rimi","Lidl","IKI"][w]); add(5 + w * 7, "exp", "food", 14 + rnd() * 20, "Maxima"); }
    for (let w = 0; w < 3; w++) add(6 + w * 8, "exp", "transport", 8 + rnd() * 14, "Bolt");
    add(16, "exp", "transport", 48 + rnd() * 15, "Circle K");
    const cafes = k === 0 ? 6 : 3; for (let w = 0; w < cafes; w++) add(3 + w * 4, "exp", "cafe", 6 + rnd() * 22, ["Caffeine","Vero Cafe","Wolt","Hesburger"][w % 4]);
    if (k % 3 === 1) add(22, "exp", "shop", 40 + rnd() * 90, "IKEA");
    add(25, "exp", "fun", 15 + rnd() * 35, "Forum Cinemas");
    add(6, "trf", "transfer", 200, "Į investicijas", {to_account_id: null});
  }
  return out;
}
let demoCache = null;
function allTx() { if (S.demo) return demoCache || (demoCache = demoData()); return [...S.txs.values()]; }
function refreshDemo() { S.demo = S.loaded && S.txs.size === 0 && !S.demoDismissed; }
