// Kišenė: rinkos duomenų serverio funkcija (Supabase Edge Function, Deno)
//
// Kainas ir valiutų kursus ima iš Yahoo Finance viešų adresų (be rakto).
// Tai neoficialus šaltinis: jei jis kada nors nustos veikti, programėlė leidžia
// įvesti kainas ranka, o šią funkciją galima pakeisti kitu tiekėju.
//
// Veiksmai (POST JSON):
//   {action:"quote",   symbols:["VWCE.DE","AAPL"], currencies:["USD"]}
//   {action:"history", symbols:["VWCE.DE","USDEUR=X"], from:"2024-01-01"}
//   {action:"resolve", items:[{key, query, currency}]}   simbolio paieška pagal ISIN ar tikerį
//   {action:"search",  q:"apple"}                         paieška pagal pavadinimą ar simbolį
//   {action:"chart",   symbol:"AAPL", range:"1y"}          grafikas (1d, 5d, 1mo, 6mo, ytd, 1y, 5y, max)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UA = { "User-Agent": "Mozilla/5.0 (compatible; Kisene/1.0)", "Accept": "application/json" };
const SYM = /^[A-Za-z0-9.\-=^]{1,24}$/;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Paprasta talpykla vienam funkcijos egzemplioriui
const cache = new Map<string, { t: number; v: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v as T;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return v;
}

type Chart = { currency: string; price: number | null; prevClose: number | null; time: number | null; name: string; type: string; exchange: string;
  high52: number | null; low52: number | null; dayHigh: number | null; dayLow: number | null; points: [number, number][] };
const num = (v: unknown, div: number) => typeof v === "number" && isFinite(v) ? v / div : null;

async function chart(symbol: string, params: string): Promise<Chart | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  const r = j?.chart?.result?.[0];
  if (!r) return null;
  let currency: string = r.meta?.currency ?? "";
  let div = 1;
  if (currency === "GBp" || currency === "GBX") { currency = "GBP"; div = 100; }
  if (currency === "ZAc") { currency = "ZAR"; div = 100; }
  const ts: number[] = r.timestamp ?? [];
  const closes: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
  const points: [number, number][] = [];
  ts.forEach((t, i) => { const c = closes[i]; if (typeof c === "number" && isFinite(c)) points.push([t, c / div]); });
  const m = r.meta ?? {};
  const p = m.regularMarketPrice;
  return {
    currency: currency.toUpperCase(),
    price: typeof p === "number" ? p / div : (points.length ? points[points.length - 1][1] : null),
    prevClose: num(m.previousClose, div) ?? num(m.chartPreviousClose, div),
    time: m.regularMarketTime ?? null,
    name: m.longName ?? m.shortName ?? "",
    type: m.instrumentType ?? "",
    exchange: m.fullExchangeName ?? m.exchangeName ?? "",
    high52: num(m.fiftyTwoWeekHigh, div), low52: num(m.fiftyTwoWeekLow, div),
    dayHigh: num(m.regularMarketDayHigh, div), dayLow: num(m.regularMarketDayLow, div),
    points,
  };
}

async function quote(symbol: string) {
  return cached(`q:${symbol}`, 10 * 60_000, async () => {
    const c = await chart(symbol, "range=5d&interval=1d");
    if (!c) return null;
    // ankstesnės dienos uždarymo kaina dienos pokyčiui
    const pts = c.points;
    const prev = pts.length >= 2 ? pts[pts.length - 2][1] : c.prevClose;
    return { price: c.price, prevClose: prev, currency: c.currency, time: c.time, name: c.name, type: c.type, spark: pts.map((x) => x[1]) };
  });
}

async function history(symbol: string, fromSec: number) {
  const interval = Date.now() / 1000 - fromSec > 400 * 86400 ? "1wk" : "1d";
  return cached(`h:${symbol}:${fromSec}:${interval}`, 6 * 3600_000, async () => {
    const c = await chart(symbol, `period1=${fromSec}&period2=${Math.floor(Date.now() / 1000)}&interval=${interval}`);
    return c ? { currency: c.currency, points: c.points } : null;
  });
}

const PREF_EXCH: Record<string, string[]> = {
  EUR: ["GER", "ETR", "AMS", "PAR", "MIL", "BRU", "MCE", "VIE", "HEL", "LIS", "IRL", "FRA", "STU", "BER", "MUN", "DUS"],
  GBP: ["LSE", "IOB"],
  USD: ["NMS", "NYQ", "NGM", "NCM", "PCX", "ASE", "BTS", "NAS", "NYS"],
};

async function resolve(query: string, currency: string) {
  return cached(`r:${query}:${currency}`, 24 * 3600_000, async () => {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`;
    const res = await fetch(url, { headers: UA });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    const quotes: any[] = (j?.quotes ?? []).filter((q: any) => q.symbol && q.quoteType !== "OPTION" && q.quoteType !== "FUTURE");
    if (!quotes.length) return null;
    // kriptovaliuta: BTC -> BTC-EUR
    const crypto = quotes.find((q) => q.quoteType === "CRYPTOCURRENCY");
    if (crypto) {
      const base = String(crypto.symbol).split("-")[0];
      return { symbol: `${base}-${currency || "EUR"}`, type: "crypto", name: crypto.shortname ?? base };
    }
    const pref = PREF_EXCH[currency] ?? [];
    quotes.sort((a, b) => {
      const ia = pref.indexOf(a.exchange), ib = pref.indexOf(b.exchange);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    // patikrinam valiutą pirmiems keliems kandidatams
    for (const q of quotes.slice(0, 4)) {
      const c = await quote(q.symbol);
      if (c && (!currency || c.currency === currency)) {
        return { symbol: q.symbol, type: typeOf(q.quoteType), name: q.longname ?? q.shortname ?? "" };
      }
    }
    const q = quotes[0];
    return { symbol: q.symbol, type: typeOf(q.quoteType), name: q.longname ?? q.shortname ?? "" };
  });
}
// Laikotarpis -> intervalas grafikui
const RANGES: Record<string, string> = { "1d": "5m", "5d": "30m", "1mo": "1d", "6mo": "1d", "ytd": "1d", "1y": "1d", "5y": "1wk", "max": "1mo" };
async function chartRange(symbol: string, range: string) {
  const interval = RANGES[range] ?? "1d";
  return cached(`c:${symbol}:${range}`, range === "1d" || range === "5d" ? 5 * 60_000 : 60 * 60_000, async () => {
    const c = await chart(symbol, `range=${range}&interval=${interval}&includePrePost=false`);
    return c;
  });
}
async function search(q: string) {
  return cached(`s:${q.toLowerCase()}`, 6 * 3600_000, async () => {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0`;
    const res = await fetch(url, { headers: UA });
    if (!res.ok) return [];
    const j = await res.json().catch(() => null);
    return (j?.quotes ?? []).filter((x: any) => x.symbol && ["EQUITY", "ETF", "MUTUALFUND", "CRYPTOCURRENCY", "INDEX", "CURRENCY", "FUTURE"].includes(x.quoteType))
      .map((x: any) => ({ symbol: x.symbol, name: x.longname ?? x.shortname ?? x.symbol, type: typeOf(x.quoteType), exchange: x.exchDisp ?? x.exchange ?? "" }));
  });
}

function typeOf(qt: string) {
  return qt === "ETF" ? "etf" : qt === "EQUITY" ? "stock" : qt === "MUTUALFUND" ? "fund" : qt === "CRYPTOCURRENCY" ? "crypto" : qt === "INDEX" ? "index" : qt === "CURRENCY" ? "fx" : qt === "FUTURE" ? "commodity" : "other";
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null as R); }
  }));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Netinkamas metodas" });

  // Vartotojo patikra
  const auth = req.headers.get("authorization") ?? "";
  const anon = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Reikia prisijungti" });
  const u = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, { headers: { Authorization: auth, apikey: anon } });
  if (!u.ok) return json(401, { error: "Sesija nebegalioja, prisijunk iš naujo" });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "Netinkamas užklausos formatas" }); }

  try {
    if (body.action === "quote") {
      const symbols: string[] = (body.symbols ?? []).filter((s: string) => SYM.test(s)).slice(0, 60);
      const currencies: string[] = (body.currencies ?? []).filter((c: string) => /^[A-Z]{3}$/.test(c) && c !== "EUR").slice(0, 20);
      const q = await pool(symbols, 6, quote);
      const f = await pool(currencies, 6, (c) => quote(`${c}EUR=X`));
      const quotes: Record<string, unknown> = {};
      symbols.forEach((s, i) => { if (q[i]) quotes[s] = q[i]; });
      const fx: Record<string, number> = {};
      currencies.forEach((c, i) => { const v = (f[i] as any)?.price; if (typeof v === "number") fx[c] = v; });
      return json(200, { quotes, fx, at: Date.now() });
    }
    if (body.action === "history") {
      const symbols: string[] = (body.symbols ?? []).filter((s: string) => SYM.test(s)).slice(0, 60);
      const from = Date.parse(body.from ?? "");
      const fromSec = Math.floor((isFinite(from) ? from : Date.now() - 365 * 86400_000) / 1000);
      const h = await pool(symbols, 6, (s) => history(s, Math.max(fromSec, Math.floor(Date.now() / 1000) - 10 * 365 * 86400)));
      const out: Record<string, unknown> = {};
      symbols.forEach((s, i) => { if (h[i]) out[s] = h[i]; });
      return json(200, { history: out });
    }
    if (body.action === "search") {
      const q = String(body.q ?? "").trim().slice(0, 40);
      if (!q) return json(200, { results: [] });
      return json(200, { results: await search(q) });
    }
    if (body.action === "chart") {
      const symbol = String(body.symbol ?? "");
      const range = String(body.range ?? "1y");
      if (!SYM.test(symbol) || !(range in RANGES)) return json(400, { error: "Netinkamas simbolis ar laikotarpis" });
      const c = await chartRange(symbol, range);
      if (!c) return json(404, { error: "Duomenų šiam simboliui nerasta" });
      let fx = 1;
      if (c.currency && c.currency !== "EUR") { const f = await quote(`${c.currency}EUR=X`); fx = (f as any)?.price ?? 0; }
      return json(200, { chart: c, fxToEur: fx || null });
    }
    if (body.action === "resolve") {
      const items: { key: string; query: string; currency?: string }[] = (body.items ?? []).slice(0, 30);
      const r = await pool(items, 4, (it) => resolve(String(it.query ?? "").slice(0, 40), String(it.currency ?? "").toUpperCase()));
      const out: Record<string, unknown> = {};
      items.forEach((it, i) => { out[it.key] = r[i]; });
      return json(200, { resolved: out });
    }
    return json(400, { error: "Nežinomas veiksmas" });
  } catch (e) {
    console.error(e);
    return json(502, { error: "Rinkos duomenų šaltinis nepasiekiamas" });
  }
});
