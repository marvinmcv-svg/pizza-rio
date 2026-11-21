/* Prueba de punta a punta del endpoint /api/ria contra un servidor falso de la API de Claude
   (sin clave real ni costo). Verifica: ciclo de herramientas, evento de carrito en el stream,
   contexto en vivo fuera del prompt cacheado, modelo de voz y errores. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { PassThrough } = require("node:stream");

function sse(res, events) {
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const [t, d] of events) res.write("event: " + t + "\ndata: " + JSON.stringify(Object.assign({ type: t }, d)) + "\n\n");
  res.end();
}
const start = (model) => ["message_start", { message: { id: "m", type: "message", role: "assistant", model, content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } }];
function textTurn(model, text) {
  return [start(model), ["content_block_start", { index: 0, content_block: { type: "text", text: "" } }], ["content_block_delta", { index: 0, delta: { type: "text_delta", text } }], ["content_block_stop", { index: 0 }], ["message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } }], ["message_stop", {}]];
}
function toolTurn(model, name, input) {
  return [start(model), ["content_block_start", { index: 0, content_block: { type: "tool_use", id: "tu_1", name, input: {} } }], ["content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } }], ["content_block_stop", { index: 0 }], ["message_delta", { delta: { stop_reason: "tool_use" }, usage: { output_tokens: 5 } }], ["message_stop", {}]];
}

let server, requests = [];
test.before(async () => {
  server = http.createServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      const body = JSON.parse(b); requests.push({ url: req.url, headers: req.headers, body });
      const hasResult = body.messages.some((m) => Array.isArray(m.content) && m.content.some((c) => c.type === "tool_result"));
      if (!hasResult) sse(res, toolTurn(body.model, "cart_add", { item_id: "hawaiana", qty: 2 }));
      else sse(res, textTurn(body.model, "¡Listo! Dos Hawaianas, Bs 108."));
    });
  });
  await new Promise((r) => server.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:" + server.address().port;
  process.env.ANTHROPIC_API_KEY = "test-dummy";
  delete process.env.NVIDIA_API_KEY; delete process.env.RIA_PROVIDER;
});
test.after(() => server.close());

function call(body, headers) {
  const handler = require("../../api/ria.js");
  const req = new PassThrough(); req.method = "POST"; req.headers = headers || {}; req.socket = { remoteAddress: "10.0.0." + Math.floor(Math.random() * 200) }; req.body = body;
  return new Promise((resolve) => {
    let out = ""; const hdr = {};
    const res = { statusCode: 0, setHeader: (k, v) => (hdr[k.toLowerCase()] = v), write: (c) => { out += c; }, end: (c) => { if (c) out += c; resolve({ status: res.statusCode, out, hdr }); } };
    handler(req, res);
  });
}
const uiEvents = (out) => [...out.matchAll(/\[\[ui:([A-Za-z0-9+/=]+)\]\]/g)].map((m) => JSON.parse(Buffer.from(m[1], "base64").toString("utf8")));

test("texto: ciclo de herramientas, carrito en vivo y respuesta (#1, #21)", async () => {
  requests = [];
  const r = await call({ messages: [{ role: "user", content: "dos hawaianas" }], state: { cart: [] }, channel: "text" });
  assert.equal(r.status, 200);
  const ev = uiEvents(r.out).find((e) => e.type === "cart.updated");
  assert.deepEqual(ev.cart, [{ id: "hawaiana", qty: 2 }], "el carrito llega antes que el texto final");
  assert.match(r.out, /¡Listo! Dos Hawaianas, Bs 108\./);
  assert.equal(requests.length, 2);
  const first = requests[0].body;
  assert.equal(first.model, "claude-sonnet-5-5");
  assert.equal(first.fallbacks, "default");
  assert.match(requests[0].headers["anthropic-beta"], /server-side-fallback-2026-07-01/);
  assert.deepEqual(first.system[0].cache_control, { type: "ephemeral" });
  assert.doesNotMatch(first.system[0].text, /2026-|Ahora en Santa Cruz/, "nada variable en el prompt cacheado");
  const live = first.messages[first.messages.length - 1];
  assert.equal(live.role, "system");
  assert.match(live.content, /Contexto en vivo[\s\S]*Canal: TEXTO/);
  const second = requests[1].body.messages;
  assert.ok(second.some((m) => Array.isArray(m.content) && m.content.some((c) => c.type === "tool_result" && /Bs 108/.test(c.content))));
});

test("voz: usa el modelo rápido y avisa el canal (#18)", async () => {
  requests = [];
  await call({ messages: [{ role: "user", content: "dos hawaianas" }], channel: "voice" });
  assert.equal(requests[0].body.model, "claude-haiku-5-5");
  assert.equal(requests[0].body.fallbacks, undefined);
  assert.match(requests[0].body.messages.at(-1).content, /Canal: VOZ/);
});

test("sin clave: el sitio recibe 200 + X-Ria-Status 503 (sin errores en consola); otros clientes 503", async () => {
  const k = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  const web = await call({ messages: [{ role: "user", content: "hola" }] }, { "x-ria-client": "web" });
  assert.equal(web.status, 200); assert.equal(web.hdr["x-ria-status"], "503");
  const api = await call({ messages: [{ role: "user", content: "hola" }] });
  assert.equal(api.status, 503);
  process.env.ANTHROPIC_API_KEY = k;
});

test("historial inválido → 400", async () => {
  const r = await call({ messages: [{ role: "assistant", content: "hola" }] });
  assert.equal(r.status, 400);
});
