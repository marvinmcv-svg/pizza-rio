/* POST /api/ria · Ría, asistente de pedidos de Pizza Río.
   Responde text/plain en streaming. Entre el texto van eventos de UI codificados como
   [[ui:BASE64(JSON)]] (carrito actualizado, pedido listo, chips, pasar a una persona).
   Proveedor: Claude (Anthropic) o NVIDIA NIM. Las claves se leen SOLO de variables de entorno. */
"use strict";
const { SYSTEM_PROMPT, liveContext } = require("./_prompt.js");
const T = require("./_tools.js");

const MAX_TOOL_ROUNDS = 6;
const hits = new Map();
function limited(ip) {
  const t = Date.now();
  if (hits.size > 5000) hits.clear();
  const arr = (hits.get(ip) || []).filter((x) => t - x < 60000);
  arr.push(t); hits.set(ip, arr);
  return arr.length > 20;
}

function sanitize(body) {
  const raw = body && Array.isArray(body.messages) ? body.messages : null;
  if (!raw) return null;
  let msgs = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) }))
    .slice(-16);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  msgs = msgs.reduce((a, m) => { const last = a[a.length - 1]; if (last && last.role === m.role) last.content += "\n" + m.content; else a.push({ ...m }); return a; }, []);
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

function provider() {
  const forced = (process.env.RIA_PROVIDER || "").toLowerCase();
  if (forced === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (forced === "nvidia" && process.env.NVIDIA_API_KEY) return "nvidia";
  if (forced) return null;
  if (process.env.NVIDIA_API_KEY) return "nvidia";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return null; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (e) { return null; }
}

const uiEvent = (ev) => "[[ui:" + Buffer.from(JSON.stringify(ev), "utf8").toString("base64") + "]]";
function flush(res, st) { while (st.events.length) res.write(uiEvent(st.events.shift())); }
function execTool(name, input, st) {
  try { return T.run(name, input, st, new Date()); } catch (e) { console.error("[ria] tool", name, e && e.message); return { error: "La herramienta falló." }; }
}

/* ---------- Claude ---------- */
async function runAnthropic(res, messages, st, channel) {
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic();
  const voice = channel === "voice";
  const model = voice ? (process.env.RIA_VOICE_MODEL || "claude-haiku-5-5") : (process.env.RIA_MODEL || "claude-sonnet-5-5");
  // El contexto en vivo va como mensaje de sistema DESPUÉS de la conversación: no rompe el caché.
  const convo = messages.concat([{ role: "system", content: liveContext(new Date(), st, channel) }]);
  let wrote = false;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const params = {
      model,
      max_tokens: 1024,
      output_config: { effort: "low" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: T.DEFS,
      messages: convo,
    };
    // Respaldo del servidor si un filtro de seguridad rechaza (Sonnet; Haiku no lo tiene).
    if (/sonnet|opus|fable/.test(model)) { params.betas = ["server-side-fallback-2026-07-01"]; params.fallbacks = "default"; }
    const stream = params.betas ? client.beta.messages.stream(params) : client.messages.stream(params);
    let roundText = false;
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        if (!roundText && wrote) res.write("\n\n");
        res.write(event.delta.text); roundText = true; wrote = true;
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "tool_use") {
      convo.push({ role: "assistant", content: final.content });
      const results = final.content.filter((b) => b.type === "tool_use").map((b) => {
        const out = execTool(b.name, b.input, st);
        flush(res, st);
        return { type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out), is_error: !!out.error };
      });
      convo.push({ role: "user", content: results });
      continue;
    }
    if (final.stop_reason === "refusal") res.write("\n\nDe eso no te puedo ayudar 🙏, pero sí con todo lo de Pizza Río: menú, promos, sucursales y tu pedido. 🍕");
    else if (final.stop_reason === "max_tokens") res.write("…");
    return;
  }
  res.write(wrote ? "…" : "Uy, me enredé. ¿Me lo decís de nuevo, más cortito? 🙏");
}

/* ---------- NVIDIA NIM (API compatible con OpenAI) ---------- */
async function runNvidia(res, messages, st, channel) {
  const OpenAI = require("openai");
  const client = new OpenAI({ apiKey: process.env.NVIDIA_API_KEY, baseURL: "https://integrate.api.nvidia.com/v1" });
  const tools = T.DEFS.map((d) => ({ type: "function", function: { name: d.name, description: d.description, parameters: d.input_schema } }));
  const convo = [{ role: "system", content: SYSTEM_PROMPT + "\n\n" + liveContext(new Date(), st, channel) }].concat(messages);
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const r = await client.chat.completions.create({ model: process.env.RIA_NVIDIA_MODEL || "meta/llama-3.3-70b-instruct", temperature: 0.6, top_p: 0.95, max_tokens: 1024, tools, messages: convo });
    const msg = r.choices[0].message;
    if (msg.tool_calls && msg.tool_calls.length) {
      convo.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });
      msg.tool_calls.forEach((tc) => {
        let args = {}; try { args = JSON.parse(tc.function.arguments || "{}"); } catch (e) { args = {}; }
        const out = execTool(tc.function.name, args, st); flush(res, st);
        convo.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(out) });
      });
      continue;
    }
    res.write(msg.content || ""); // nunca reasoning_content
    return;
  }
  res.write("…");
}

module.exports = async function handler(req, res) {
  // El sitio propio manda "x-ria-client: web": a él le devolvemos los errores como 200 + cabecera
  // X-Ria-Status, para que el navegador no ensucie la consola. Cualquier otro cliente recibe el código HTTP real.
  const web = req.headers["x-ria-client"] === "web";
  const fail = (code, msg) => {
    res.setHeader("Cache-Control", "no-store");
    if (web) { res.statusCode = 200; res.setHeader("X-Ria-Status", String(code)); } else res.statusCode = code;
    return res.end(msg);
  };
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return fail(405, "method_not_allowed"); }
  const prov = provider();
  if (!prov) return fail(503, "not_configured");
  const ip = String(req.headers["x-forwarded-for"] || (req.socket && req.socket.remoteAddress) || "?").split(",")[0].trim();
  if (limited(ip)) return fail(429, "rate_limited");
  const body = await readBody(req);
  const messages = sanitize(body);
  if (!messages) return fail(400, "bad_request");
  const st = T.sanitizeState(body.state);
  const channel = body.channel === "voice" ? "voice" : "text";

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  try {
    if (prov === "anthropic") await runAnthropic(res, messages, st, channel);
    else await runNvidia(res, messages, st, channel);
  } catch (err) {
    console.error("[ria]", prov, err && err.status, err && err.message);
    res.write("\n\n[[error]]");
  }
  res.end();
};

module.exports.sanitize = sanitize;
