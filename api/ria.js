/* POST /api/ria · Ría, recepcionista virtual de Pizza Río.
   Responde text/plain en streaming. Proveedor: Claude (Anthropic) o NVIDIA NIM.
   Las claves se leen SOLO de variables de entorno. */
"use strict";
const { SYSTEM_PROMPT, liveContext } = require("./_prompt.js");

const hits = new Map();
function limited(ip) {
  const t = Date.now();
  if (hits.size > 5000) hits.clear();
  const arr = (hits.get(ip) || []).filter((x) => t - x < 60000);
  arr.push(t); hits.set(ip, arr);
  return arr.length > 12;
}

function sanitize(body) {
  const raw = body && Array.isArray(body.messages) ? body.messages : null;
  if (!raw) return null;
  let msgs = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) }))
    .slice(-16);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  // une mensajes consecutivos del mismo rol
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

async function streamAnthropic(res, messages) {
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: process.env.RIA_MODEL || "claude-sonnet-5-5",
    max_tokens: 1024,
    output_config: { effort: "low" },
    // Si un clasificador de seguridad rechaza, el servidor reintenta con el modelo de respaldo.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    // El contexto en vivo va después de la conversación (mensaje de sistema a mitad de conversación),
    // así no rompe el caché del prompt estático.
    messages: messages.concat([{ role: "system", content: liveContext(new Date()) }]),
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") res.write(event.delta.text);
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") res.write("\n\nDe eso no te puedo ayudar 🙏, pero sí con todo lo de Pizza Río: menú, promos y sucursales. 🍕");
  else if (final.stop_reason === "max_tokens") res.write("…");
}

async function streamNvidia(res, messages) {
  const OpenAI = require("openai");
  const client = new OpenAI({ apiKey: process.env.NVIDIA_API_KEY, baseURL: "https://integrate.api.nvidia.com/v1" });
  const stream = await client.chat.completions.create({
    model: process.env.RIA_NVIDIA_MODEL || "meta/llama-3.3-70b-instruct",
    temperature: 0.6, top_p: 0.95, max_tokens: 1024, stream: true,
    messages: [{ role: "system", content: SYSTEM_PROMPT + "\n\n" + liveContext(new Date()) }].concat(messages),
  });
  for await (const chunk of stream) {
    const d = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
    if (d && typeof d.content === "string" && d.content) res.write(d.content); // nunca reasoning_content
  }
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
  const messages = sanitize(await readBody(req));
  if (!messages) return fail(400, "bad_request");

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  try {
    if (prov === "anthropic") await streamAnthropic(res, messages);
    else await streamNvidia(res, messages);
  } catch (err) {
    console.error("[ria]", prov, err && err.status, err && err.message);
    res.write("\n\n[[error]]");
  }
  res.end();
};
