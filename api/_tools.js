/* Herramientas deterministas de Ría.
   El modelo NUNCA calcula precios ni confirma pedidos: propone una llamada, estas funciones
   validan y responden con datos de js/data.js. Cada cambio visible emite un evento de UI
   (el carrito de la web se actualiza mientras Ría habla). */
"use strict";
const crypto = require("crypto");
const D = require("../js/data.js");
const CAT = require("../js/catalog.js");

const C = D.config;
const ITEMS = CAT.build(D);
const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MAX_QTY = 20, MAX_LINES = 30;
const bs = (n) => C.currency + " " + n;
const priceTxt = (p) => (p == null ? "precio no publicado (se confirma por WhatsApp)" : bs(p));

/* ---------- reloj de Santa Cruz ---------- */
function clock(date) {
  const p = {};
  new Intl.DateTimeFormat("en-US", { timeZone: C.timezone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(date || new Date()).forEach((x) => (p[x.type] = x.value));
  const hh = p.hour.replace("24", "00");
  return { dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), min: +hh * 60 + +p.minute, hhmm: hh + ":" + p.minute, date: p.year + "-" + p.month + "-" + p.day };
}
const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const active = (x, t) => !x.until || t.date <= x.until;
function branchStatus(b, t) {
  if (!b.open || !b.close) return b.opensNote ? b.opensNote.toLowerCase() + " (cierre no publicado)" : "horario no publicado";
  const o = toMin(b.open), c = toMin(b.close), n = t.min;
  const open = c > o ? n >= o && n < c : n >= o || n < c;
  return (open ? "abierta ahora" : "cerrada ahora") + " (delivery " + b.open + "–" + b.close + ")";
}
const phone = (n) => "+591 " + n.replace(/^591/, "").replace(/^(\d{3})(\d+)/, "$1 $2");

/* ---------- estado ---------- */
function sanitizeState(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const cart = (Array.isArray(s.cart) ? s.cart : [])
    .filter((l) => l && ITEMS[l.id] && Number.isFinite(+l.qty))
    .map((l) => ({ id: String(l.id), qty: Math.max(1, Math.min(MAX_QTY, Math.round(+l.qty))) }))
    .slice(0, MAX_LINES);
  const o = s.order && typeof s.order === "object" ? s.order : {};
  const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n || 160) : "");
  const order = {
    mode: o.mode === "pickup" ? "pickup" : o.mode === "delivery" ? "delivery" : "",
    branch: Number.isInteger(o.branch) && D.branches[o.branch] ? o.branch : (o.branch === "cc" ? "cc" : null),
    name: str(o.name, 60), address: str(o.address), reference: str(o.reference), when: str(o.when, 40), note: str(o.note, 200),
  };
  const last = s.lastOrder && Array.isArray(s.lastOrder.cart) ? { cart: sanitizeState({ cart: s.lastOrder.cart }).cart, branch: Number.isInteger(s.lastOrder.branch) ? s.lastOrder.branch : null } : null;
  const placed = (Array.isArray(s.placed) ? s.placed : []).filter((x) => typeof x === "string").slice(-10);
  return { cart, order, lastOrder: last, placed, undo: [], events: [] };
}

function cartView(st) {
  const t = CAT.totals(ITEMS, st.cart);
  return {
    lines: st.cart.map((l) => { const it = ITEMS[l.id]; return { item_id: l.id, name: it.name, qty: l.qty, unit_price: it.price, line_total: it.price == null ? null : it.price * l.qty }; }),
    items_count: t.count,
    total_known: t.sum,
    has_unpriced_items: t.unknown,
    total_text: t.count ? bs(t.sum) + (t.unknown ? " + ítems con precio a confirmar" : "") : "carrito vacío",
  };
}
function emitCart(st) { st.events.push({ type: "cart.updated", cart: st.cart.map((l) => ({ id: l.id, qty: l.qty })) }); }
function snapshot(st) { st.undo.push(JSON.stringify(st.cart)); if (st.undo.length > 10) st.undo.shift(); }
function resolveItem(id) {
  if (ITEMS[id]) return ITEMS[id].aliasOf ? ITEMS[ITEMS[id].aliasOf] : ITEMS[id];
  // Sin coincidencia aproximada: solo id exacto o nombre exacto (nunca agregar algo "parecido").
  const q = CAT.norm(id);
  const hit = Object.values(ITEMS).find((it) => !it.hidden && (CAT.norm(it.short) === q || CAT.norm(it.name) === q || it.id === q.replace(/ /g, "-")));
  return hit || null;
}

/* ---------- token de confirmación (cambia si cambia el pedido) ---------- */
function orderToken(st) {
  return crypto.createHash("sha256").update(JSON.stringify({ c: st.cart, o: st.order })).digest("hex").slice(0, 16);
}
function missingDetails(st) {
  const m = [];
  if (!st.cart.length) m.push("productos");
  if (!st.order.mode) m.push("delivery o recoger");
  if (st.order.branch === null) m.push("sucursal");
  if (!st.order.name) m.push("nombre");
  if (st.order.mode === "delivery" && !st.order.address) m.push("dirección");
  return m;
}
function buildMessage(st) {
  const o = st.order, b = Number.isInteger(o.branch) ? D.branches[o.branch] : null, v = cartView(st);
  const L = ["¡Hola Pizza Río! 👋🍕 Quiero hacer un pedido " + (o.mode === "delivery" ? "para *delivery*" : "para *pasar a recoger*") + ":"];
  v.lines.forEach((l) => L.push("• " + l.qty + " × " + l.name + ": " + (l.line_total == null ? "precio a confirmar" : bs(l.line_total))));
  L.push("*Total: " + v.total_text.replace(" + ítems con precio a confirmar", " + a confirmar") + "*", "");
  L.push("👤 " + o.name, "📍 " + (b ? "Sucursal " + b.name : "Call center"));
  if (o.mode === "delivery") { L.push("🏠 " + o.address); if (o.reference) L.push("↪ " + o.reference); }
  L.push("🕒 " + (o.when || "Lo antes posible"));
  if (o.note) L.push("💬 " + o.note);
  L.push("", "(Pedido armado con Ría en la web)");
  return L.join("\n");
}
function waTarget(st) {
  const b = Number.isInteger(st.order.branch) ? D.branches[st.order.branch] : null;
  const text = encodeURIComponent(buildMessage(st));
  if (b && b.whatsapp) return { label: "WhatsApp de " + b.name, href: "https://wa.me/" + b.whatsapp + "?text=" + text, copy: false };
  if (b && b.waLink) return { label: "WhatsApp de " + b.name, href: b.waLink, copy: true };
  return { label: "WhatsApp del call center", href: "https://wa.me/" + C.callCenter + "?text=" + text, copy: false };
}

/* ---------- definiciones para el modelo ---------- */
const S = (props, req) => ({ type: "object", properties: props, required: req || [], additionalProperties: false });
const DEFS = [
  { name: "search_menu", description: "Busca productos del menú de Pizza Río por nombre, ingrediente o tipo (ej. 'pollo', 'sin carne', 'combo', 'borde'). Devuelve ids, precios publicados y descripción conocida.", input_schema: S({ query: { type: "string" } }, ["query"]) },
  { name: "get_item_details", description: "Detalle de un producto: precio, tamaño, ingredientes publicados. Usalo antes de responder sobre ingredientes o precios.", input_schema: S({ item_id: { type: "string" } }, ["item_id"]) },
  { name: "get_promos", description: "Promos, combos y especiales vigentes hoy (con cuál aplica hoy). Usalo para '¿qué promo hay?', '¿qué hay de nuevo?' o si piden una oferta.", input_schema: S({}) },
  { name: "find_best_deal", description: "Revisa el carrito actual y sugiere un combo o promo publicada que convenga. No cambia el carrito.", input_schema: S({}) },
  { name: "find_stores", description: "Sucursales con WhatsApp y horario publicado (si existe). Filtra por nombre o zona si se da.", input_schema: S({ query: { type: "string" } }) },
  { name: "cart_view", description: "Muestra el carrito con totales calculados por el sistema.", input_schema: S({}) },
  { name: "cart_add", description: "Agrega un producto al carrito (usa el item_id de search_menu).", input_schema: S({ item_id: { type: "string" }, qty: { type: "integer", minimum: 1, maximum: 20 } }, ["item_id"]) },
  { name: "cart_update", description: "Cambia la cantidad de un producto del carrito (0 lo quita).", input_schema: S({ item_id: { type: "string" }, qty: { type: "integer", minimum: 0, maximum: 20 } }, ["item_id", "qty"]) },
  { name: "cart_remove", description: "Quita un producto del carrito.", input_schema: S({ item_id: { type: "string" } }, ["item_id"]) },
  { name: "cart_undo", description: "Deshace el último cambio del carrito ('no, mejor dejalo').", input_schema: S({}) },
  { name: "cart_clear", description: "Vacía el carrito (solo si el cliente pide empezar de nuevo o cancelar).", input_schema: S({}) },
  { name: "reorder_last", description: "Carga en el carrito el último pedido que este cliente hizo desde esta web ('lo de siempre', 'lo mismo de la otra vez').", input_schema: S({}) },
  { name: "set_order_details", description: "Guarda datos del pedido que el cliente ya dijo. branch es el nombre de la sucursal (o 'call center').", input_schema: S({ mode: { type: "string", enum: ["delivery", "pickup"] }, branch: { type: "string" }, name: { type: "string" }, address: { type: "string" }, reference: { type: "string" }, when: { type: "string", description: "'lo antes posible' o una hora como '20:30'" }, note: { type: "string" } }) },
  { name: "review_order", description: "Prepara la lectura final del pedido (ítems, total del sistema, entrega, sucursal) y un confirmation_token. Llamalo antes de pedir el 'sí'. Si faltan datos, devuelve cuáles.", input_schema: S({}) },
  { name: "place_order", description: "Solo después de un 'sí' explícito del cliente a la lectura de review_order. Arma el mensaje para el WhatsApp de la sucursal y muestra el botón de envío.", input_schema: S({ confirmation_token: { type: "string" } }, ["confirmation_token"]) },
  { name: "get_order_status", description: "Para '¿dónde está mi pizza?'. Explica cómo consultar el estado de un pedido.", input_schema: S({}) },
  { name: "handoff_to_human", description: "Pasa la conversación a una persona: quejas, reembolsos, pedidos muy grandes/eventos, alergias graves, o si no entendés dos veces.", input_schema: S({ reason: { type: "string" } }, ["reason"]) },
];

/* ---------- ejecución ---------- */
function run(name, input, st, now) {
  const t = clock(now);
  const inp = input && typeof input === "object" ? input : {};
  switch (name) {
    case "search_menu": {
      const hits = CAT.search(ITEMS, inp.query, 8);
      return hits.length ? { results: hits.map((it) => ({ item_id: it.id, name: it.name, price: priceTxt(it.price), category: it.category, description: it.desc || "ingredientes no publicados", meat_free: it.veg || undefined, new: it.isNew || undefined })) } : { results: [], note: "No hay nada así en el menú publicado." };
    }
    case "get_item_details": {
      const it = resolveItem(String(inp.item_id || ""));
      if (!it) return { error: "No existe ese producto en el menú publicado." };
      return { item_id: it.id, name: it.name, price: priceTxt(it.price), size: it.size || null, category: it.category, ingredients: it.desc || "no publicados (consultar por WhatsApp)", meat_free: it.veg, allergens: "no publicados: no prometas que algo es libre de alérgenos" };
    }
    case "get_promos": {
      const promos = D.weekly.filter((w) => active(w, t)).map((w) => ({ item_id: w.id, title: w.title, when: w.day == null ? "todos los días" : "cada " + DAYS[w.day] + (w.until ? " hasta " + w.until : ""), applies_today: w.day == null || w.day === t.dow, description: w.desc, price: (w.plus ? "+" : "") + bs(w.price) }));
      const combos = D.combos.map((c) => ({ item_id: c.id, title: c.name, contents: c.note, price: bs(c.price) }));
      const news = Object.values(ITEMS).filter((i) => i.isNew).map((i) => ({ item_id: i.id, name: i.name, price: priceTxt(i.price) }));
      return { today: DAYS[t.dow], promos, combos, new_items: news, partner: D.partner ? D.partner.title + ". " + D.partner.copy : null };
    }
    case "find_best_deal": {
      const ids = st.cart.map((l) => l.id), tips = [];
      if (ids.includes("churrasco") && !ids.includes("combo-buri")) tips.push({ deal_item_id: "combo-buri", tip: "La Churrasco sola es " + bs(ITEMS.churrasco.price) + "; el Combo Buri (Churrasco + Coca-Cola 1,5 L) es " + bs(ITEMS["combo-buri"].price) + "." });
      if (ids.includes("mixta") && ids.includes("tocinator") && !ids.includes("combo-rio")) tips.push({ deal_item_id: "combo-rio", tip: "Mixta + Tocinátor + Coca-Cola 1,5 L salen juntas en el Combo Río a " + bs(92) + "." });
      const cm = D.weekly.find((w) => w.id === "choclomix");
      if (cm && active(cm, t) && t.dow === cm.day && (ids.includes("choclo") || ids.includes("jamon")) && !ids.includes("choclomix")) tips.push({ deal_item_id: "choclomix", tip: "Hoy es martes de ChocloMix: mitad choclo + mitad jamón a " + bs(cm.price) + "." });
      return tips.length ? { suggestions: tips } : { suggestions: [], note: "No hay un combo publicado que mejore este carrito." };
    }
    case "find_stores": {
      const q = CAT.norm(inp.query || "");
      const list = D.branches.map((b, i) => ({ i, b })).filter(({ b }) => !q || CAT.norm(b.name).includes(q) || q.includes(CAT.norm(b.name)));
      const rows = (list.length ? list : D.branches.map((b, i) => ({ i, b }))).map(({ b }) => ({ name: b.name, whatsapp: b.whatsapp ? phone(b.whatsapp) : "link de WhatsApp en la web", status: branchStatus(b, t), address: b.address || "dirección no publicada" }));
      return { now: t.hhmm, matched: !!list.length && !!q, branches: rows, call_center: phone(C.callCenter) };
    }
    case "cart_view": return cartView(st);
    case "cart_add": {
      const it = resolveItem(String(inp.item_id || ""));
      if (!it) return { error: "Ese producto no está en el menú publicado. Usá search_menu." };
      const qty = Math.max(1, Math.min(MAX_QTY, parseInt(inp.qty, 10) || 1));
      snapshot(st);
      const l = st.cart.find((x) => x.id === it.id);
      if (l) l.qty = Math.min(MAX_QTY, l.qty + qty); else if (st.cart.length < MAX_LINES) st.cart.push({ id: it.id, qty }); else return { error: "Carrito lleno." };
      emitCart(st);
      return Object.assign({ added: it.name, qty }, cartView(st));
    }
    case "cart_update": {
      const it = resolveItem(String(inp.item_id || "")); const l = it && st.cart.find((x) => x.id === it.id);
      if (!l) return { error: "Ese producto no está en el carrito." };
      snapshot(st);
      const q = Math.max(0, Math.min(MAX_QTY, parseInt(inp.qty, 10) || 0));
      if (q === 0) st.cart = st.cart.filter((x) => x !== l); else l.qty = q;
      emitCart(st); return cartView(st);
    }
    case "cart_remove": {
      const it = resolveItem(String(inp.item_id || "")); const l = it && st.cart.find((x) => x.id === it.id);
      if (!l) return { error: "Ese producto no está en el carrito." };
      snapshot(st); st.cart = st.cart.filter((x) => x !== l); emitCart(st);
      return Object.assign({ removed: it.name }, cartView(st));
    }
    case "cart_undo": {
      if (!st.undo.length) return { error: "No hay cambios para deshacer en esta respuesta." };
      st.cart = JSON.parse(st.undo.pop()); emitCart(st); return cartView(st);
    }
    case "cart_clear": { snapshot(st); st.cart = []; emitCart(st); return cartView(st); }
    case "reorder_last": {
      if (!st.lastOrder || !st.lastOrder.cart.length) return { error: "No hay un pedido anterior guardado en este dispositivo." };
      snapshot(st); st.cart = st.lastOrder.cart.map((l) => ({ id: l.id, qty: l.qty }));
      if (Number.isInteger(st.lastOrder.branch) && st.order.branch === null) { st.order.branch = st.lastOrder.branch; st.events.push({ type: "order.updated", order: st.order }); }
      emitCart(st); return Object.assign({ loaded: "último pedido" }, cartView(st));
    }
    case "set_order_details": {
      const o = st.order, out = {};
      if (inp.mode === "delivery" || inp.mode === "pickup") o.mode = inp.mode;
      if (typeof inp.branch === "string" && inp.branch.trim()) {
        const q = CAT.norm(inp.branch);
        if (q.includes("call") || q.includes("central")) o.branch = "cc";
        else {
          const i = D.branches.findIndex((b) => CAT.norm(b.name) === q) >= 0 ? D.branches.findIndex((b) => CAT.norm(b.name) === q) : D.branches.findIndex((b) => CAT.norm(b.name).includes(q) || q.includes(CAT.norm(b.name)));
          if (i < 0) out.branch_error = "No encontré esa sucursal. Opciones: " + D.branches.map((b) => b.name).join(", ");
          else o.branch = i;
        }
      }
      ["name", "address", "reference", "when", "note"].forEach((k) => { if (typeof inp[k] === "string" && inp[k].trim()) o[k] = inp[k].trim().slice(0, k === "note" ? 200 : 160); });
      st.events.push({ type: "order.updated", order: o });
      return Object.assign(out, { saved: { mode: o.mode || null, branch: o.branch === "cc" ? "call center" : (Number.isInteger(o.branch) ? D.branches[o.branch].name : null), name: o.name || null, address: o.address || null, reference: o.reference || null, when: o.when || "lo antes posible", note: o.note || null }, still_missing: missingDetails(st) });
    }
    case "review_order": {
      const miss = missingDetails(st);
      if (miss.length) return { ready: false, still_missing: miss };
      const v = cartView(st), o = st.order, b = Number.isInteger(o.branch) ? D.branches[o.branch] : null;
      const token = orderToken(st);
      st.events.push({ type: "chips", chips: ["Sí, confirmar", "Cambiar algo"] });
      return { ready: true, confirmation_token: token, items: v.lines.map((l) => l.qty + " × " + l.name + " (" + (l.line_total == null ? "precio a confirmar" : bs(l.line_total)) + ")"), total: v.total_text, service: o.mode === "delivery" ? "delivery a " + o.address + (o.reference ? " (" + o.reference + ")" : "") : "pasa a recoger", branch: b ? b.name : "call center", name: o.name, when: o.when || "lo antes posible", payment: "se coordina por WhatsApp con la sucursal (medios de pago no publicados)", eta: "la sucursal confirma el tiempo por WhatsApp (no hay tiempos publicados)" };
    }
    case "place_order": {
      const token = orderToken(st);
      if (!inp.confirmation_token || inp.confirmation_token !== token) return { error: "El pedido cambió o no fue revisado. Llamá review_order y pedí confirmación de nuevo." };
      const miss = missingDetails(st);
      if (miss.length) return { error: "Faltan datos: " + miss.join(", ") };
      const target = waTarget(st);
      const already = st.placed.includes(token);
      if (!already) st.placed.push(token);
      st.events.push({ type: "order.ready", token, href: target.href, label: target.label, copy: target.copy, message: buildMessage(st), cart: st.cart, branch: st.order.branch });
      return { status: already ? "ya estaba listo (no se duplica)" : "listo para enviar", sent_to: target.label, next_step: "El cliente toca el botón verde 'Enviar por WhatsApp' que apareció en el chat; la sucursal confirma el pedido, el pago y el tiempo por ahí. El pedido NO está hecho hasta que lo envíe." };
    }
    case "get_order_status": {
      const b = st.lastOrder && Number.isInteger(st.lastOrder.branch) ? D.branches[st.lastOrder.branch] : null;
      return { tracking: "Pizza Río todavía no tiene seguimiento en línea.", how_to_check: b ? "Escribile a la sucursal " + b.name + " por WhatsApp (" + (b.whatsapp ? phone(b.whatsapp) : "link en la web") + ")." : "Escribile por WhatsApp a la sucursal donde pediste, o al call center " + phone(C.callCenter) + "." };
    }
    case "handoff_to_human": {
      const v = cartView(st);
      const text = "Hola Pizza Río, vengo del chat de la web. Motivo: " + String(inp.reason || "consulta").slice(0, 200) + (v.items_count ? ". Mi carrito: " + v.lines.map((l) => l.qty + "× " + l.name).join(", ") : "");
      const b = Number.isInteger(st.order.branch) ? D.branches[st.order.branch] : null;
      const num = b && b.whatsapp ? b.whatsapp : C.callCenter;
      st.events.push({ type: "handoff", href: "https://wa.me/" + num + "?text=" + encodeURIComponent(text), label: b && b.whatsapp ? "Hablar con " + b.name : "Hablar con el call center" });
      return { ok: true, note: "Apareció un botón para hablar con una persona por WhatsApp." };
    }
    default: return { error: "Herramienta desconocida." };
  }
}

module.exports = { DEFS, run, sanitizeState, cartView, orderToken, buildMessage, ITEMS, clock };
