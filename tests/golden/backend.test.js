/* Golden tests v3: confirmación forzada por el servidor, celular, ubicación, registro del pedido en la base
   y seguimiento. La base se simula (sin red). Correr: npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../../api/_tools.js");

const SAT = new Date("2026-11-21T13:00:00-04:00");
const TRACK = "7b0c3f7e-2a51-4f0e-9a4f-3b1d2c4e5f60";

function fakeBackend(reply) {
  const calls = [];
  return {
    calls,
    enabled: () => true,
    explain: require("../../api/_backend.js").explain,
    trackUrl: (t) => "https://pizza.example/sigue-tu-pizza/?t=" + t,
    rpc: async (fn, body) => { calls.push({ fn, body }); return typeof reply === "function" ? reply(fn, body, calls.length) : reply; },
  };
}
function readyOrder() {
  const st = T.sanitizeState({});
  T.run("cart_add", { item_id: "hawaiana", qty: 2 }, st, SAT);
  T.run("set_order_details", { mode: "delivery", branch: "Equipetrol", name: "Ana Pérez", phone: "+591 71234567", address: "Calle 5", reference: "portón verde" }, st, SAT);
  const rv = T.run("review_order", {}, st, SAT);
  assert.equal(rv.ready, true);
  // lo que el navegador guarda y vuelve a mandar en el próximo turno
  return T.sanitizeState(JSON.parse(JSON.stringify({ cart: st.cart, order: st.order, stage: st.stage, token: st.token, placed: st.placed })));
}
const guardFor = (st, text) => ({ tokenAtStart: st.stage === "awaiting_confirmation" && st.token === T.orderToken(st) ? st.token : null, yes: T.isYes(text) });

test("isYes: sí claros vs. respuestas con cambios", () => {
  ["sí", "Si!", "dale", "ok", "sí, confirmá", "Listo", "de una", "yes", "perfecto 👍", "sí por favor"].forEach((t) => assert.equal(T.isYes(t), true, t));
  ["no", "sí pero sin borde", "mejor dos", "agregá una coca", "esperá", "cambiá la dirección", "sí, y sumale un borde", "", "que tal"].forEach((t) => assert.equal(T.isYes(t), false, t));
});

test("celular: 8 dígitos bolivianos, con o sin +591", () => {
  assert.equal(T.normPhone("+591 7123-4567"), "71234567");
  assert.equal(T.normPhone("59171234567"), "71234567");
  assert.equal(T.normPhone("3 3456789"), "33456789");
  assert.equal(T.normPhone("1234"), null);
  assert.equal(T.normPhone("91234567"), null);
  const st = T.sanitizeState({});
  assert.match(T.run("set_order_details", { phone: "123" }, st, SAT).phone_error, /8 dígitos/);
});

test("hora: HH:MM válida y no pasada; «ya» = lo antes posible", () => {
  const st = T.sanitizeState({});
  assert.match(T.run("set_order_details", { when: "10:00" }, st, SAT).when_error, /ya pasó/);
  assert.equal(T.run("set_order_details", { when: "20" }, st, SAT).saved.when, "20:00");
  assert.equal(T.run("set_order_details", { when: "ya" }, st, SAT).saved.when, "lo antes posible");
  assert.match(T.run("set_order_details", { when: "mañana temprano" }, st, SAT).when_error, /20:30/);
});

test("Entrega con Pin: la ubicación reemplaza la dirección y va en el mensaje", () => {
  const st = T.sanitizeState({ order: { lat: -17.7631, lng: -63.1977 } });
  T.run("cart_add", { item_id: "hawaiana" }, st, SAT);
  T.run("request_location", {}, st, SAT);
  assert.ok(st.events.some((e) => e.type === "location"));
  const d = T.run("set_order_details", { mode: "delivery", branch: "Equipetrol", name: "Ana", phone: "71234567" }, st, SAT);
  assert.deepEqual(d.still_missing, []);
  assert.match(T.buildMessage(st), /📌 Ubicación: https:\/\/maps\.google\.com\/\?q=-17\.7631,-63\.1977/);
  assert.equal(T.sanitizeState({ order: { lat: 200, lng: 5 } }).order.lat, null);
});

test("guardia: el modelo no puede confirmar en el mismo turno de la lectura", async () => {
  const st = T.sanitizeState({});
  T.run("cart_add", { item_id: "hawaiana" }, st, SAT);
  T.run("set_order_details", { mode: "pickup", branch: "Equipetrol", name: "Ana", phone: "71234567" }, st, SAT);
  const tokenAtStart = null; // el pedido NO llegó esperando confirmación
  const rv = T.run("review_order", {}, st, SAT);
  const r = await T.exec("place_order", { confirmation_token: rv.confirmation_token }, st, SAT, { guard: { tokenAtStart, yes: true } });
  assert.match(r.error, /Todavía no/);
  assert.equal(st.events.some((e) => e.type === "order.ready"), false);
});

test("guardia: sin un «sí» claro no se confirma; si el carrito cambió tampoco", async () => {
  let st = readyOrder();
  let r = await T.exec("place_order", { confirmation_token: st.token }, st, SAT, { guard: guardFor(st, "sí pero sin borde") });
  assert.match(r.error, /Todavía no/);
  st = readyOrder();
  const g = guardFor(st, "sí");
  T.run("cart_add", { item_id: "borde-0" }, st, SAT);
  r = await T.exec("place_order", { confirmation_token: g.tokenAtStart }, st, SAT, { guard: g });
  assert.match(r.error, /Todavía no/);
});

test("sí → se registra en la base con el precio de la base, código, seguimiento y WhatsApp a la sucursal", async () => {
  const st = readyOrder();
  const B = fakeBackend({ ok: true, data: { ok: true, code: "PR-K7M2Q", tracking_token: TRACK, total: 108, price_pending: false } });
  const r = await T.exec("place_order", { confirmation_token: st.token }, st, SAT, { guard: guardFor(st, "Sí, confirmá"), backend: B });
  assert.equal(r.order_code, "PR-K7M2Q");
  assert.equal(r.total, "Bs 108");
  const p = B.calls[0].body.payload;
  assert.equal(B.calls[0].fn, "place_order");
  assert.deepEqual({ ch: p.channel, store: p.store, svc: p.service, ph: p.customer_phone, items: p.items },
    { ch: "ria", store: "equipetrol", svc: "delivery", ph: "71234567", items: [{ id: "hawaiana", qty: 2 }] });
  assert.equal(p.client_ref, "ria-" + st.token + "-71234567");
  assert.equal(Object.keys(p).some((k) => /price|total/.test(k)), false, "el cliente nunca manda precios");
  const ev = st.events.find((e) => e.type === "order.ready");
  assert.match(ev.href, /^https:\/\/wa\.me\/59175358717\?text=/);
  assert.match(decodeURIComponent(ev.href), /Pedido PR-K7M2Q[\s\S]*Seguí tu pedido: https:\/\/pizza\.example\/sigue-tu-pizza\/\?t=7b0c3f7e/);
  assert.equal(ev.track, TRACK);
  assert.equal(st.stage, "placed");
  // un segundo "sí" no duplica (y la base además es idempotente por client_ref)
  const again = await T.exec("place_order", { confirmation_token: st.token }, st, SAT, { guard: guardFor(st, "sí"), backend: B });
  assert.match(again.status, /no se duplica/);
  assert.equal(B.calls.length, 1);
});

test("error de negocio (agotado) → vuelve a esperar confirmación y Ría explica", async () => {
  const st = readyOrder();
  const B = fakeBackend({ ok: false, kind: "business", code: "sold_out:Pizza Hawaiana" });
  const r = await T.exec("place_order", {}, st, SAT, { guard: guardFor(st, "dale"), backend: B });
  assert.match(r.error, /Se agotó Pizza Hawaiana/);
  assert.equal(st.stage, "awaiting_confirmation");
  assert.equal(st.events.some((e) => e.type === "order.ready"), false);
});

test("base caída → el pedido igual sale por WhatsApp (nunca se pierde)", async () => {
  const st = readyOrder();
  const B = fakeBackend({ ok: false, kind: "network", detail: "AbortError" });
  const orig = console.error; console.error = () => {};
  const r = await T.exec("place_order", {}, st, SAT, { guard: guardFor(st, "ok"), backend: B });
  console.error = orig;
  assert.equal(r.status, "listo para enviar");
  assert.ok(st.events.find((e) => e.type === "order.ready").href.startsWith("https://wa.me/59175358717"));
});

test("Sigue tu Pizza: estado real desde track_order + botón de seguimiento", async () => {
  const st = T.sanitizeState({ lastOrder: { cart: [{ id: "hawaiana", qty: 1 }], branch: 1, code: "PR-K7M2Q", track: TRACK } });
  const B = fakeBackend({ ok: true, data: { code: "PR-K7M2Q", status: "cooking", service: "delivery", created_at: "2026-11-21T16:50:00Z", store: { name: "Equipetrol" } } });
  const r = await T.exec("get_order_status", {}, st, SAT, { backend: B });
  assert.deepEqual(B.calls[0], { fn: "track_order", body: { token: TRACK } });
  assert.equal(r.status, "en el horno");
  const tr = st.events.find((e) => e.type === "track");
  assert.equal(tr.href, "https://pizza.example/sigue-tu-pizza/?t=" + TRACK);
  // un token de seguimiento que no es UUID se descarta
  assert.equal(T.sanitizeState({ lastOrder: { cart: [], track: "../admin" } }).lastOrder.track, null);
});

test("_backend.rpc: mapea errores de negocio, corta a los 6 s y no lanza", async () => {
  process.env.SUPABASE_URL = "https://x.supabase.co"; process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  delete require.cache[require.resolve("../../api/_backend.js")];
  const B = require("../../api/_backend.js");
  const mk = (status, body) => async () => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });
  assert.deepEqual(await B.rpc("place_order", {}, { fetch: mk(400, { message: "store_paused" }) }), { ok: false, kind: "business", code: "store_paused" });
  assert.equal((await B.rpc("place_order", {}, { fetch: mk(500, { message: "boom" }) })).kind, "network");
  assert.equal((await B.rpc("place_order", {}, { fetch: mk(200, { code: "PR-AAAAA" }) })).data.code, "PR-AAAAA");
  const hang = (u, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(Object.assign(new Error("x"), { name: "AbortError" }))));
  const r = await B.rpc("track_order", {}, { fetch: hang, timeout: 30 });
  assert.deepEqual(r, { ok: false, kind: "network", detail: "AbortError" });
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_PUBLISHABLE_KEY;
});

test("tool schemas válidos para ambos proveedores (nombres únicos, objeto sin extras)", () => {
  const names = T.DEFS.map((d) => d.name);
  assert.equal(new Set(names).size, names.length);
  T.DEFS.forEach((d) => { assert.match(d.name, /^[a-z_]{3,40}$/); assert.equal(d.input_schema.type, "object"); assert.equal(d.input_schema.additionalProperties, false); });
  ["get_deals", "cart_swap_to_combo", "request_location", "place_order", "get_order_status"].forEach((n) => assert.ok(names.includes(n), n));
});
