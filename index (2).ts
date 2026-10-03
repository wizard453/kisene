// Kišenė: AI patarėjas (Supabase Edge Function, Deno)
//
// Pokalbis su finansų patarėju, kuris mato programėlės duomenų santrauką ir gali pakeisti nustatymus
// (biudžetus, kategorijas, taisykles, tikslus, pasikartojančias operacijas) per įrankius.
// Pakeitimus pritaiko pati programėlė, o serveris tik grąžina, ką AI nusprendė padaryti.
//
// Užklausa (POST JSON): {messages:[{role, content}], context:{...}}
// Atsakymas: {text, actions:[{name, input}]}
//
// Paslaptys (Edge Functions -> Secrets):
//  ANTHROPIC_API_KEY  – privaloma
//  ANTHROPIC_MODEL    – nebūtina, numatytasis claude-haiku-4-5-20251001
//  ALLOWED_EMAILS     – nebūtina, kableliais atskirti el. paštai, kuriems leidžiama naudoti AI

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const fail = (status: number, message: string) => new Response(JSON.stringify({ error: message }), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SYSTEM = `Tu esi asmeninių finansų patarėjas programėlėje „Kišenė“. Kalbi lietuviškai, draugiškai, aiškiai ir trumpai.
Remkis tik pateiktais duomenimis (žr. KONTEKSTAS). Sumas rašyk eurais su kableliu (pvz. 12,50 €). Nespėliok to, ko duomenyse nėra.
Pervedimai tarp savo sąskaitų nėra išlaidos. Investavimas ir paskolų įmokos nėra išlaidos.
Kai vartotojas prašo ką nors pakeisti (biudžetą, kategoriją, taisyklę, tikslą, pasikartojančią operaciją, operacijų kategorijas) arba įrašyti operaciją, naudok įrankius. Programėlė pakeitimus pritaikys iš karto, o vartotojas galės juos atšaukti.
Prieš keisdamas, įsitikink, kad tiksliai supranti prašymą. Jei neaišku, kurią kategoriją ar sumą turi omeny, paklausk, o ne spėliok. Nekeisk to, ko neprašė.
Naudok tik tuos kategorijų, tikslų, sąskaitų ir pasikartojančių operacijų id, kurie yra kontekste, arba id, kuriuos grąžino ką tik sukurto objekto įrankis.
Po pakeitimų trumpai pasakyk, ką padarei.
Kai prašoma mėnesio analizės: ### Santrauka (2–3 sakiniai), ### Kas krenta į akis (3–5 punktai su skaičiais), ### Ką daryti (3 veiksmai su apytikre sutaupoma suma). Iki 250 žodžių.
Kitais atvejais atsakyk iki 150 žodžių, nebent prašoma daugiau.
Gali komentuoti investicijų paskirstymą, koncentraciją ir mokesčius, bet nerekomenduok pirkti ar parduoti konkrečių vertybinių popierių.`;

const TOOLS = [
  { name: "set_budget", description: "Nustato arba pašalina išlaidų kategorijos mėnesio biudžetą. amount = 0 pašalina biudžetą.",
    input_schema: { type: "object", properties: { category_id: { type: "string" }, amount: { type: "number", minimum: 0 } }, required: ["category_id", "amount"] } },
  { name: "create_category", description: "Sukuria naują išlaidų arba pajamų kategoriją. Grąžina naujos kategorijos id.",
    input_schema: { type: "object", properties: { name: { type: "string" }, type: { type: "string", enum: ["exp", "inc"] },
      icon: { type: "string", enum: ["tag", "basket", "home", "car", "cup", "ticket", "repeat", "heart", "bag", "plane", "bank", "shield", "briefcase", "cap", "coin", "gift", "paw", "book", "child", "receipt", "percent"] },
      budget: { type: "number", minimum: 0, description: "Nebūtina, tik išlaidų kategorijai" } }, required: ["name", "type"] } },
  { name: "update_category", description: "Pervadina kategoriją, pakeičia jos ikoną arba paslepia / parodo.",
    input_schema: { type: "object", properties: { category_id: { type: "string" }, name: { type: "string" }, icon: { type: "string" }, hidden: { type: "boolean" } }, required: ["category_id"] } },
  { name: "add_rule", description: "Sukuria taisyklę: operacijos, kurių aprašyme yra tekstas, priskiriamos kategorijai arba pažymimos kaip pervedimas į savo sąskaitą. Pritaiko ir esamoms operacijoms.",
    input_schema: { type: "object", properties: { pattern: { type: "string" }, category_id: { type: "string" }, transfer_account_id: { type: "string", description: "Jei tai pervedimas į savo sąskaitą" } }, required: ["pattern"] } },
  { name: "recategorize", description: "Pakeičia esamų operacijų, kurių aprašyme yra tekstas, kategoriją. Nekuria taisyklės.",
    input_schema: { type: "object", properties: { match_text: { type: "string" }, category_id: { type: "string" }, month: { type: "string", description: "YYYY-MM, jei tik vieno mėnesio" } }, required: ["match_text", "category_id"] } },
  { name: "create_goal", description: "Sukuria taupymo tikslą. Grąžina tikslo id.",
    input_schema: { type: "object", properties: { name: { type: "string" }, target: { type: "number", minimum: 1 }, saved: { type: "number", minimum: 0 }, deadline: { type: "string", description: "YYYY-MM" } }, required: ["name", "target"] } },
  { name: "update_goal", description: "Pakeičia tikslą. add_amount prideda (arba atima, jei neigiamas) prie sutaupytos sumos.",
    input_schema: { type: "object", properties: { goal_id: { type: "string" }, name: { type: "string" }, target: { type: "number" }, saved: { type: "number" }, add_amount: { type: "number" }, deadline: { type: "string" }, delete: { type: "boolean" } }, required: ["goal_id"] } },
  { name: "create_recurring", description: "Sukuria kas mėnesį pasikartojančią operaciją. Grąžina jos id.",
    input_schema: { type: "object", properties: { type: { type: "string", enum: ["exp", "inc", "trf"] }, amount: { type: "number", minimum: 0.01 }, day: { type: "integer", minimum: 1, maximum: 28 },
      note: { type: "string" }, category_id: { type: "string" }, account_id: { type: "string" }, to_account_id: { type: "string" } }, required: ["type", "amount", "day", "note"] } },
  { name: "update_recurring", description: "Pakeičia pasikartojančią operaciją: sumą, dieną, aprašymą, kategoriją, sustabdo ar ištrina.",
    input_schema: { type: "object", properties: { recurring_id: { type: "string" }, amount: { type: "number" }, day: { type: "integer", minimum: 1, maximum: 28 }, note: { type: "string" },
      category_id: { type: "string" }, active: { type: "boolean" }, delete: { type: "boolean" } }, required: ["recurring_id"] } },
  { name: "add_transaction", description: "Įrašo vieną operaciją (išlaidas, pajamas arba pervedimą).",
    input_schema: { type: "object", properties: { type: { type: "string", enum: ["exp", "inc", "trf"] }, amount: { type: "number", minimum: 0.01 }, date: { type: "string", description: "YYYY-MM-DD, numatytai šiandien" },
      note: { type: "string" }, category_id: { type: "string" }, account_id: { type: "string" }, to_account_id: { type: "string" } }, required: ["type", "amount", "note"] } },
];
const rid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

type Msg = { role: "user" | "assistant"; content: unknown };
function validMessages(x: unknown): x is { role: string; content: string }[] {
  if (!Array.isArray(x) || x.length < 1 || x.length > 40) return false;
  let total = 0;
  for (const m of x as any[]) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string" || !m.content.trim()) return false;
    total += m.content.length;
  }
  return (x as any[])[x.length - 1].role === "user" && total <= 60000;
}
// Anthropic reikalauja kaitalioti roles, todėl sujungiam iš eilės einančias tos pačios rolės žinutes
function normalize(ms: { role: string; content: string }[]): Msg[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of ms) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + m.content; else out.push({ role: m.role as any, content: m.content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "Netinkamas metodas");
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return fail(500, "Serveryje nenustatytas ANTHROPIC_API_KEY");

  const auth = req.headers.get("authorization") ?? "";
  const anon = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!auth.startsWith("Bearer ")) return fail(401, "Reikia prisijungti");
  const userRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, { headers: { Authorization: auth, apikey: anon } });
  if (!userRes.ok) return fail(401, "Sesija nebegalioja, prisijunk iš naujo");
  const user = await userRes.json();
  const allowed = (Deno.env.get("ALLOWED_EMAILS") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(String(user.email ?? "").toLowerCase())) return fail(403, "Šiai paskyrai AI analizė neleidžiama");

  let body: { messages?: unknown; context?: unknown; tools?: boolean };
  try { body = await req.json(); } catch { return fail(400, "Netinkamas užklausos formatas"); }
  if (!validMessages(body.messages)) return fail(400, "Netinkamas pokalbio formatas");
  const ctx = JSON.stringify(body.context ?? {}).slice(0, 40000);
  const system = SYSTEM + `\n\nŠiandien: ${new Date().toISOString().slice(0, 10)}.\nKONTEKSTAS (JSON):\n${ctx}`;

  const messages: Msg[] = normalize(body.messages);
  const actions: { name: string; input: Record<string, unknown> }[] = [];
  let text = "";
  for (let round = 0; round < 5; round++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001", max_tokens: 1500, system, messages, ...(body.tools === false ? {} : { tools: TOOLS }) }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Anthropic error", res.status, detail);
      if (res.status === 429) return fail(429, "Pasiektas užklausų limitas, pabandyk po kelių minučių");
      if (res.status === 401) return fail(502, "Netinkamas Anthropic API raktas");
      return fail(502, "AI paslauga šiuo metu nepasiekiama");
    }
    const j = await res.json();
    const blocks: any[] = j.content ?? [];
    text += blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
    const uses = blocks.filter((b) => b.type === "tool_use");
    if (j.stop_reason !== "tool_use" || !uses.length) break;
    messages.push({ role: "assistant", content: blocks });
    const results = uses.map((u) => {
      const input = { ...(u.input || {}) };
      let note = "Priimta, programėlė pritaikys pakeitimą.";
      if (u.name === "create_category") { input._id = rid("c_ai"); note = `Kategorija sukurta, id=${input._id}.`; }
      if (u.name === "create_goal") { input._id = rid("g"); note = `Tikslas sukurtas, id=${input._id}.`; }
      if (u.name === "create_recurring") { input._id = rid("r"); note = `Pasikartojanti operacija sukurta, id=${input._id}.`; }
      actions.push({ name: u.name, input });
      return { type: "tool_result", tool_use_id: u.id, content: note };
    });
    messages.push({ role: "user", content: results });
    if (text) text += "\n\n";
  }
  return new Response(JSON.stringify({ text: text.trim(), actions }), { headers: { ...CORS, "Content-Type": "application/json" } });
});
