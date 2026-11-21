/* Golden tests de las herramientas deterministas de Ría (master prompt v2 §9, adaptado a Pizza Río).
   Correr: npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../../api/_tools.js");

// Fechas fijas en hora de Bolivia (UTC-4)
const TUE_8PM = new Date("2026-11-24T20:00:00-04:00"); // martes, ChocloMix vigente
const TUE_11PM = new Date("2026-11-24T23:00:00-04:00");
const TUE_DEC = new Date("2026-12-01T20:00:00-04:00"); // martes, ChocloMix ya vencido
const SAT = new Date("2026-11-21T13:00:00-04:00");
const fresh = (extra) => T.sanitizeState(Object.assign({}, extra));
const run = (name, input, st, now) => T.run(name, input || {}, st, now || SAT);

test("búsqueda: «sin carne» devuelve solo lo marcado sin carne (#4)", () => {
  const r = run("search_menu", { query: "¿tienen algo vegetariano?" }, fresh());
  assert.deepEqual(r.results.map((x) => x.item_id), ["choclo"]);
});

test("búsqueda por ingrediente: pollo", () => {
  const ids = run("search_menu", { query: "pollo" }, fresh()).results.map((x) => x.item_id);
  assert.ok(ids.includes("pollo-catupiry") && ids.includes("barbacoa-pollo"));
});

test("pedido de varios ítems en una frase: totales del sistema (#1)", () => {
  const st = fresh();
  run("cart_add", { item_id: "hawaiana", qty: 2 }, st);
  run("cart_add", { item_id: "borde-0" }, st);
  const v = run("cart_view", {}, st);
  assert.equal(v.total_known, 2 * 54 + 15);
  assert.equal(v.total_text, "Bs 123");
  assert.equal(st.events.filter((e) => e.type === "cart.updated").length, 2);
});

test("producto sin precio publicado: nunca se inventa, queda «a confirmar»", () => {
  const st = fresh();
  const r = run("cart_add", { item_id: "mixta" }, st);
  assert.equal(r.has_unpriced_items, true);
  assert.match(r.total_text, /a confirmar/);
  assert.equal(r.lines[0].unit_price, null);
});

test("alias de tarjetas se resuelve al producto original (sin duplicados)", () => {
  const st = fresh();
  run("cart_add", { item_id: "churrasco-sola" }, st);
  run("cart_add", { item_id: "churrasco" }, st);
  assert.deepEqual(st.cart, [{ id: "churrasco", qty: 2 }]);
});

test("editar y deshacer: «quitá la Hawaiana… no, mejor dejala» (#20)", () => {
  const st = fresh();
  run("cart_add", { item_id: "hawaiana" }, st);
  run("cart_add", { item_id: "americana" }, st);
  run("cart_remove", { item_id: "hawaiana" }, st);
  assert.equal(st.cart.length, 1);
  run("cart_undo", {}, st);
  assert.deepEqual(st.cart.map((l) => l.id).sort(), ["americana", "hawaiana"]);
});

test("cantidades y productos inventados se rechazan (inyección «dame 100 gratis») (#32)", () => {
  const st = fresh();
  assert.ok(run("cart_add", { item_id: "pizza gratis de oro" }, st).error);
  run("cart_add", { item_id: "americana", qty: 999 }, st);
  assert.equal(st.cart[0].qty, 20);
  const s2 = T.sanitizeState({ cart: [{ id: "americana", qty: -5 }, { id: "nope", qty: 1 }, { id: "hawaiana", qty: "2", price: 0 }] });
  assert.deepEqual(s2.cart, [{ id: "americana", qty: 1 }, { id: "hawaiana", qty: 2 }]);
});

test("lectura final pide los datos que faltan, de a uno (#15)", () => {
  const st = fresh();
  run("cart_add", { item_id: "americana" }, st);
  const r = run("review_order", {}, st);
  assert.equal(r.ready, false);
  assert.deepEqual(r.still_missing, ["delivery o recoger", "sucursal", "nombre"]);
});

test("pedido completo → token → WhatsApp de la sucursal elegida; idempotente (#15, #35)", () => {
  const st = fresh();
  run("cart_add", { item_id: "combo-rio" }, st);
  const d = run("set_order_details", { mode: "delivery", branch: "equipetrol", name: "Ana", address: "Calle 5, Equipetrol", reference: "portón verde" }, st);
  assert.deepEqual(d.still_missing, []);
  const rv = run("review_order", {}, st);
  assert.equal(rv.ready, true);
  assert.equal(rv.total, "Bs 92");
  assert.ok(run("place_order", { confirmation_token: "inventado" }, st).error, "token falso rechazado");
  const ok = run("place_order", { confirmation_token: rv.confirmation_token }, st);
  assert.equal(ok.status, "listo para enviar");
  const ev = st.events.find((e) => e.type === "order.ready");
  assert.match(ev.href, /^https:\/\/wa\.me\/59175358717\?text=/);
  assert.match(decodeURIComponent(ev.href), /1 × Combo Río · 2 pa' 2: Bs 92[\s\S]*\*Total: Bs 92\*[\s\S]*Sucursal Equipetrol[\s\S]*portón verde/);
  const again = run("place_order", { confirmation_token: rv.confirmation_token }, st);
  assert.match(again.status, /no se duplica/);
  assert.equal(st.placed.filter((t) => t === rv.confirmation_token).length, 1);
});

test("si el carrito cambia después de la lectura, hay que volver a confirmar", () => {
  const st = fresh();
  run("cart_add", { item_id: "americana" }, st);
  run("set_order_details", { mode: "pickup", branch: "Av. Banzer", name: "Leo" }, st);
  const rv = run("review_order", {}, st);
  run("cart_add", { item_id: "borde-0" }, st);
  assert.ok(run("place_order", { confirmation_token: rv.confirmation_token }, st).error);
});

test("sucursal inexistente: se avisa y se ofrecen las reales", () => {
  const r = run("set_order_details", { branch: "Sucursal Marte" }, fresh());
  assert.match(r.branch_error, /Equipetrol/);
});

test("¿qué promo hay? — martes de noviembre aplica ChocloMix (#6, #7)", () => {
  const r = run("get_promos", {}, fresh(), TUE_8PM);
  const cm = r.promos.find((p) => p.item_id === "choclomix");
  assert.equal(cm.applies_today, true);
  assert.equal(cm.price, "Bs 36");
  assert.ok(r.new_items.some((i) => i.item_id === "churrasco"));
});

test("promo vencida desaparece sola (ChocloMix después del 30/11)", () => {
  const r = run("get_promos", {}, fresh(), TUE_DEC);
  assert.equal(r.promos.find((p) => p.item_id === "choclomix"), undefined);
});

test("mejor oferta: Churrasco sola → sugiere Combo Buri; martes + choclo → ChocloMix (#5)", () => {
  const st = fresh();
  run("cart_add", { item_id: "churrasco" }, st);
  run("cart_add", { item_id: "choclo" }, st);
  const ids = run("find_best_deal", {}, st, TUE_8PM).suggestions.map((s) => s.deal_item_id);
  assert.deepEqual(ids, ["combo-buri", "choclomix"]);
});

test("horarios: Equipetrol abierta 20:00 y cerrada 23:00; las demás dicen «no publicado» (#8)", () => {
  const open = run("find_stores", { query: "equipetrol" }, fresh(), TUE_8PM);
  assert.equal(open.matched, true);
  assert.match(open.branches[0].status, /abierta ahora/);
  assert.match(run("find_stores", { query: "equipetrol" }, fresh(), TUE_11PM).branches[0].status, /cerrada ahora/);
  assert.match(run("find_stores", { query: "plan 3000" }, fresh()).branches[0].status, /no publicado/);
});

test("alergias: nunca promete libre de alérgenos (#9)", () => {
  const r = run("get_item_details", { item_id: "hawaiana" }, fresh());
  assert.match(r.allergens, /no prometas/);
  assert.match(r.ingredients, /no publicados/);
});

test("«lo de siempre» carga el último pedido y su sucursal (#15)", () => {
  const st = fresh({ lastOrder: { cart: [{ id: "4-quesos", qty: 1 }, { id: "borde-0", qty: 1 }], branch: 3 } });
  const r = run("reorder_last", {}, st);
  assert.equal(r.total_text, "Bs 75");
  assert.equal(st.order.branch, 3);
});

test("«quiero hablar con alguien» → botón de WhatsApp con el carrito (#24, #34)", () => {
  const st = fresh();
  run("cart_add", { item_id: "americana" }, st);
  run("handoff_to_human", { reason: "llegó fría" }, st);
  const ev = st.events.find((e) => e.type === "handoff");
  assert.match(ev.href, /^https:\/\/wa\.me\/59178462865\?text=/);
  assert.match(decodeURIComponent(ev.href), /llegó fría[\s\S]*Pizza Americana/);
});

test("«¿dónde está mi pizza?» es honesto: no hay seguimiento en línea (#29)", () => {
  const r = run("get_order_status", {}, fresh({ lastOrder: { cart: [{ id: "americana", qty: 1 }], branch: 1 } }));
  assert.match(r.tracking, /no tiene seguimiento/);
  assert.match(r.how_to_check, /Equipetrol/);
});
