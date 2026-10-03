// Kišenė: investavimo platformų prijungimas (Supabase Edge Function, Deno)
//
// Šiuo metu palaikoma: Trading 212 (oficialus viešas API, tik Invest ir Stocks ISA sąskaitos).
// API raktas ir slaptas raktas saugomi lentelėje broker_connections užšifruoti (AES-GCM).
// Programėlė jų niekada negauna atgal, o lentelė klientams neprieinama (RLS be taisyklių).
//
// Veiksmai (POST JSON):
//   {action:"status"}                                         prijungtos platformos
//   {action:"connect", platform:"t212", key, secret}          patikrina ir išsaugo raktus
//   {action:"sync", platform:"t212", full?:boolean}           grąžina naujas operacijas ir dabartines pozicijas
//   {action:"disconnect", platform:"t212"}                    ištrina raktus
//
// Paslaptys: BROKER_SECRET (rekomenduojama, bet koks ilgas atsitiktinis tekstas raktams šifruoti).
// Jei jos nėra, naudojamas SUPABASE_SERVICE_ROLE_KEY.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const T212 = "https://live.trading212.com/api/v0";

/* ---------- Šifravimas ---------- */
async function aesKey() {
  const raw = new TextEncoder().encode(Deno.env.get("BROKER_SECRET") || SERVICE);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function enc(text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(text)));
  return b64(iv) + "." + b64(ct);
}
async function dec(s: string) {
  const [iv, ct] = s.split(".");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(), unb64(ct)));
}

/* ---------- Duomenų bazė (service role) ---------- */
async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`DB ${res.status}: ${await res.text()}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}
const getConn = async (uid: string, platform: string) =>
  (await db(`broker_connections?user_id=eq.${uid}&platform=eq.${encodeURIComponent(platform)}&select=*`))?.[0] ?? null;
const saveConn = (row: Record<string, unknown>) =>
  db("broker_connections?on_conflict=user_id,platform", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(row) });

/* ---------- Trading 212 ---------- */
class T212Error extends Error { constructor(public status: number, msg: string) { super(msg); } }
async function t212(path: string, auth: string) {
  const res = await fetch(path.startsWith("http") ? path : `${T212}${path}`, { headers: { Authorization: auth } });
  if (res.status === 401) throw new T212Error(401, "Trading 212 atmetė raktą. Patikrink API raktą ir slaptą raktą.");
  if (res.status === 403) throw new T212Error(403, "Raktui trūksta leidimų. Kurdamas raktą Trading 212 pažymėk skaitymo leidimus (account, portfolio, history).");
  if (res.status === 429) throw new T212Error(429, "Trading 212 užklausų limitas. Bandyk po minutės.");
  if (!res.ok) throw new T212Error(res.status, `Trading 212 klaida (${res.status})`);
  return res.json();
}
const authOf = (key: string, secret: string) => secret ? "Basic " + btoa(`${key}:${secret}`) : key;
// AAPL_US_EQ -> AAPL, VWCEd_EQ -> VWCE
const cleanTicker = (t: string) => String(t || "").replace(/_[A-Z]{2}_EQ$/, "").replace(/[a-z]?_EQ$/, "").replace(/_/g, ".");

// Puslapiuojam nuo naujausių iki `since` (ISO data), ne daugiau `maxPages` puslapių
async function pages(path: string, auth: string, dateOf: (x: any) => string, since: string | null, maxPages: number) {
  const out: any[] = [];
  let next: string | null = `${path}${path.includes("?") ? "&" : "?"}limit=50`;
  let n = 0, done = false;
  while (next && n < maxPages) {
    const j: any = await t212(next.startsWith("/api/v0") ? `https://live.trading212.com${next}` : next, auth);
    n++;
    for (const it of j.items ?? []) {
      if (since && dateOf(it) && dateOf(it) <= since) { done = true; break; }
      out.push(it);
    }
    if (done) break;
    next = j.nextPagePath || null;
  }
  return { items: out, complete: done || !next };
}

function mapOrder(it: any) {
  const f = it.fill, o = it.order;
  if (!f || !o) return null;
  const date = String(f.filledAt || o.createdAt || "").slice(0, 10);
  const wi = f.walletImpact || {};
  const fees = (wi.taxes || []).reduce((s: number, t: any) => s + Math.abs(Number(t.quantity) || 0), 0);
  const net = Math.abs(Number(wi.netValue) || 0);
  const qty = Math.abs(Number(f.quantity) || Number(o.filledQuantity) || 0);
  const inst = o.instrument || {};
  const base = { platform: "Trading 212", symbol: cleanTicker(inst.ticker || o.ticker), name: inst.name || "", isin: inst.isin || "", currency: wi.currency || "EUR" };
  if (f.type === "STOCK_SPLIT") return { ...base, ext: `order:${f.id}`, date, kind: "split", qty: Number(f.quantity) || 0, price: 0, amount: 0, fee: 0 };
  if (f.type && f.type !== "TRADE") return null;
  const buy = o.side === "BUY";
  // netValue: buy = mokėta su mokesčiais, sell = gauta be mokesčių
  const amount = buy ? Math.max(0, net - fees) : net + fees;
  return { ...base, ext: `order:${f.id ?? o.id}`, date, kind: buy ? "buy" : "sell", qty, price: Number(f.price) || 0, priceCur: inst.currency || "", amount, fee: fees };
}
function mapDividend(it: any) {
  const inst = it.instrument || {};
  const eur = Number(it.amountInEuro);
  const amt = Number(it.amount) || 0;
  return { ext: `div:${it.reference}`, date: String(it.paidOn || "").slice(0, 10), kind: "div", platform: "Trading 212", symbol: cleanTicker(inst.ticker || it.ticker), name: inst.name || "",
    isin: inst.isin || "", qty: Number(it.quantity) || 0, price: Number(it.grossAmountPerShare) || 0, currency: it.currency || "EUR", amount: Math.abs(amt), fee: 0,
    amount_eur: isFinite(eur) ? Math.abs(eur) : null };
}
function mapTransaction(it: any) {
  const kind = ({ DEPOSIT: "deposit", WITHDRAW: "withdraw", FEE: "fee", INTEREST_ON_FREE_CASH: "interest", LENDING_INTEREST: "interest" } as Record<string, string>)[it.type];
  if (!kind) return null;
  return { ext: `trx:${it.reference}`, date: String(it.dateTime || "").slice(0, 10), kind, platform: "Trading 212", symbol: "", name: "", isin: "", qty: 0, price: 0,
    currency: it.currency || "EUR", amount: Math.abs(Number(it.amount) || 0), fee: 0, note: it.type === "LENDING_INTEREST" ? "Akcijų skolinimo palūkanos" : kind === "interest" ? "Palūkanos už laisvus pinigus" : "" };
}

/* ---------- Užklausų apdorojimas ---------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Netinkamas metodas" });
  const auth = req.headers.get("authorization") ?? "";
  const anon = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Reikia prisijungti" });
  const u = await fetch(`${URL_}/auth/v1/user`, { headers: { Authorization: auth, apikey: anon } });
  if (!u.ok) return json(401, { error: "Sesija nebegalioja, prisijunk iš naujo" });
  const uid = (await u.json()).id as string;

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "Netinkamas užklausos formatas" }); }
  const platform = String(body.platform ?? "t212");
  if (body.action !== "status" && platform !== "t212") return json(400, { error: "Ši platforma kol kas nepalaikoma" });

  try {
    if (body.action === "status") {
      const rows = await db(`broker_connections?user_id=eq.${uid}&select=platform,last_sync,state,created_at`);
      return json(200, { connections: rows ?? [] });
    }
    if (body.action === "disconnect") {
      await db(`broker_connections?user_id=eq.${uid}&platform=eq.${platform}`, { method: "DELETE" });
      return json(200, { ok: true });
    }
    if (body.action === "connect") {
      const key = String(body.key ?? "").trim(), secret = String(body.secret ?? "").trim();
      if (!key) return json(400, { error: "Įrašyk API raktą" });
      const a = authOf(key, secret);
      const summary: any = await t212("/equity/account/summary", a).catch(async (e) => {
        if (e instanceof T212Error && e.status === 404) return t212("/equity/account/cash", a);
        throw e;
      });
      await saveConn({ user_id: uid, platform, key_enc: await enc(key), secret_enc: secret ? await enc(secret) : null, state: {}, last_sync: null });
      return json(200, { ok: true, currency: summary?.currency ?? summary?.currencyCode ?? null });
    }
    if (body.action === "sync") {
      const c = await getConn(uid, platform);
      if (!c) return json(404, { error: "Trading 212 neprijungta" });
      const a = authOf(await dec(c.key_enc), c.secret_enc ? await dec(c.secret_enc) : "");
      const st = body.full ? {} : (c.state || {});
      // 20 užklausų per minutę kiekvienam istorijos tipui, todėl vienu kartu imam iki 15 puslapių
      const [orders, divs, trx] = await Promise.all([
        pages("/equity/history/orders", a, (x) => String(x.fill?.filledAt || x.order?.createdAt || ""), st.orders || null, 15),
        pages("/equity/history/dividends", a, (x) => String(x.paidOn || ""), st.dividends || null, 15),
        pages("/equity/history/transactions", a, (x) => String(x.dateTime || ""), st.transactions || null, 15),
      ]);
      const rows = [
        ...orders.items.map(mapOrder), ...divs.items.map(mapDividend), ...trx.items.map(mapTransaction),
      ].filter((r) => r && r.date);
      const skipped = orders.items.length + divs.items.length + trx.items.length - rows.length;
      let positions: any[] = [], summary: any = null;
      try { positions = await t212("/equity/positions", a); } catch (_) { /* nebūtina */ }
      try { summary = await t212("/equity/account/summary", a); } catch (_) { /* nebūtina */ }
      const newest = (items: any[], f: (x: any) => string, prev?: string) => items.reduce((m, x) => (f(x) > m ? f(x) : m), prev || "");
      const complete = orders.complete && divs.complete && trx.complete;
      // būsena atnaujinama tik pilnai perskaičius, kad nebūtų praleista operacijų
      const state = complete ? {
        orders: newest(orders.items, (x) => String(x.fill?.filledAt || x.order?.createdAt || ""), st.orders),
        dividends: newest(divs.items, (x) => String(x.paidOn || ""), st.dividends),
        transactions: newest(trx.items, (x) => String(x.dateTime || ""), st.transactions),
      } : (c.state || {});
      await db(`broker_connections?user_id=eq.${uid}&platform=eq.${platform}`, { method: "PATCH", body: JSON.stringify({ state, last_sync: new Date().toISOString() }) });
      return json(200, {
        rows, skipped, complete,
        positions: (Array.isArray(positions) ? positions : []).map((p: any) => ({
          symbol: cleanTicker(p.instrument?.ticker || p.ticker), isin: p.instrument?.isin || "", name: p.instrument?.name || "", qty: Number(p.quantity) || 0,
          value: Number(p.walletImpact?.currentValue) || null, currency: p.walletImpact?.currency || null, price: Number(p.currentPrice) || null,
        })),
        summary,
      });
    }
    return json(400, { error: "Nežinomas veiksmas" });
  } catch (e) {
    console.error(e);
    if (e instanceof T212Error) return json(e.status === 429 ? 429 : 400, { error: e.message });
    return json(500, { error: "Sinchronizuoti nepavyko" });
  }
});
