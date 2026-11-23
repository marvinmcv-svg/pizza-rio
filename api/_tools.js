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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Celular boliviano: 8 dígitos (con o sin +591). Mismo criterio que normalize_phone() en la base.
function normPhone(v) {
  let d = String(v == null ? "" : v).replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("591")) d = d.slice(3);
  if (d.length === 13 && d.startsWith("00591")) d = d.slice(5);
  return d.length === 8 && /^[234567]/.test(d) ? d : null;
}
const branchId = (i) => (Number.isInteger(i) && D.branches[i] ? D.branches[i].id : null);
const pinUrl = (o) => "https://maps.google.com/?q=" + o.lat + "," + o.lng;

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
    phone: normPhone(o.phone) || "",
    lat: null, lng: null,
  };
  if (Number.isFinite(+o.lat) && Number.isFinite(+o.lng) && o.lat !== null && o.lng !== null && Math.abs(+o.lat) <= 90 && Math.abs(+o.lng) <= 180 && !(+o.lat === 0 && +o.lng === 0)) {
    order.lat = Math.round(+o.lat * 1e6) / 1e6; order.lng = Math.round(+o.lng * 1e6) / 1e6;
  }
  const lo = s.lastOrder;
  const last = lo && Array.isArray(lo.cart) ? {
    cart: sanitizeState({ cart: lo.cart }).cart, branch: Number.isInteger(lo.branch) && D.branches[lo.branch] ? lo.branch : null,
    code: typeof lo.code === "string" && /^[A-Z]{2}-[A-Z0-9]{5}$/.test(lo.code) ? lo.code : null,
    track: typeof lo.track === "string" && UUID.test(lo.track) ? lo.track : null,
    mode: lo.mode === "pickup" ? "pickup" : lo.mode === "delivery" ? "delivery" : null,
  } : null;
  const placed = (Array.isArray(s.placed) ? s.placed : []).filter((x) => typeof x === "string" && /^[a-f0-9]{16}$/.test(x)).slice(-10);
  const stage = ["browsing", "awaiting_confirmation", "placed"].includes(s.stage) ? s.stage : "browsing";
  const token = typeof s.token === "string" && /^[a-f0-9]{16}$/.test(s.token) ? s.token : null;
  return { cart, order, lastOrder: last, placed, stage, token, upsold: !!s.upsold, undo: [], events: [] };
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
  if (!st.order.phone) m.push("celular (WhatsApp)");
  if (st.order.mode === "delivery" && !st.order.address && st.order.lat === null) m.push("dirección o ubicación");
  return m;
}
function buildMessage(st, rec) {
  const o = st.order, b = Number.isInteger(o.branch) ? D.branches[o.branch] : null, v = cartView(st);
  const L = ["¡Hola Pizza Río! 👋🍕 Quiero hacer un pedido " + (o.mode === "delivery" ? "para *delivery*" : "para *pasar a recoger*") + ":"];
  v.lines.forEach((l) => L.push("• " + l.qty + " × " + l.name + ": " + (l.line_total == null ? "precio a confirmar" : bs(l.line_total))));
  L.push("*Total: " + v.total_text.replace(" + ítems con precio a confirmar", " + a confirmar") + "*", "");
  L.push("👤 " + o.name + (o.phone ? " · " + phone(o.phone) : ""), "📍 " + (b ? "Sucursal " + b.name : "Call center"));
  if (o.mode === "delivery") {
    if (o.address) L.push("🏠 " + o.address);
    if (o.reference) L.push("↪ " + o.reference);
    if (o.lat !== null) L.push("📌 Ubicación: " + pinUrl(o));
  }
  L.push("🕒 " + (o.when || "Lo antes posible"));
  if (o.note) L.push("💬 " + o.note);
  if (rec && rec.code) { L.push("", "🧾 Pedido " + rec.code); if (rec.url) L.push("Seguí tu pedido: " + rec.url); }
  L.push("", "(Pedido armado con Ría en la web)");
  return L.join("\n");
}
function waTarget(st, rec) {
  const b = Number.isInteger(st.order.branch) ? D.branches[st.order.branch] : null;
  const text = encodeURIComponent(buildMessage(st, rec));
  if (b && b.whatsapp) return { label: "WhatsApp de " + b.name, href: "https://wa.me/" + b.whatsapp + "?text=" + text, copy: false };
  if (b && b.waLink) return { label: "WhatsApp de " + b.name, href: b.waLink, copy: true };
  return { label: "WhatsApp del call center", href: "https://wa.me/" + C.callCenter + "?text=" + text, copy: false };
}

/* ---------- combos que se arman con productos sueltos del carrito (la bebida la pone el combo) ---------- */
const COMBO_PARTS = { "combo-buri": ["churrasco"], "combo-rio": ["mixta", "tocinator"] };
function swapCart(cart, cid) {
  const out = cart.map((l) => ({ id: l.id, qty: l.qty }));
  COMBO_PARTS[cid].forEach((p) => { const l = out.find((x) => x.id === p); l.qty -= 1; });
  const c = out.find((x) => x.id === cid);
  if (c) c.qty += 1; else out.push({ id: cid, qty: 1 });
  return out.filter((l) => l.qty > 0);
}

/* ---------- definiciones para el modelo ---------- */
const S = (props, req) => ({ type: "object", properties: props, required: req || [], additionalProperties: false });
const DEFS = [
  { name: "search_menu", description: "Busca productos del menú de Pizza Río por nombre, ingrediente o tipo (ej. 'pollo', 'sin carne', 'combo', 'borde'). Devuelve ids, precios publicados y descripción conocida.", input_schema: S({ query: { type: "string" } }, ["query"]) },
  { name: "get_item_details", description: "Detalle de un producto: precio, tamaño, ingredientes publicados. Usalo antes de responder sobre ingredientes o precios.", input_schema: S({ item_id: { type: "string" } }, ["item_id"]) },
  { name: "get_promos", description: "Promos, combos y especiales vigentes hoy (con cuál aplica hoy). Usalo para '¿qué promo hay?', '¿qué hay de nuevo?' o si piden una oferta.", input_schema: S({}) },
  { name: "get_deals", description: "Revisa el carrito y devuelve combos/promos publicados que convienen, cada uno con total_if_accepted (el total de TODO el carrito si acepta). Citá ese total tal cual; no sumes vos. No cambia el carrito.", input_schema: S({}) },
  { name: "cart_swap_to_combo", description: "Si el cliente acepta un combo de get_deals, reemplaza las partes que ya están en el carrito por el combo. El resto del carrito queda igual.", input_schema: S({ combo_id: { type: "string" } }, ["combo_id"]) },
  { name: "find_stores", description: "Sucursales con WhatsApp y horario publicado (si existe). Filtra por nombre o zona si se da.", input_schema: S({ query: { type: "string" } }) },
  { name: "cart_view", description: "Muestra el carrito con totales calculados por el sistema.", input_schema: S({}) },
  { name: "cart_add", description: "Agrega un producto al carrito (usa el item_id de search_menu).", input_schema: S({ item_id: { type: "string" }, qty: { type: "integer", minimum: 1, maximum: 20 } }, ["item_id"]) },
  { name: "cart_update", description: "Cambia la cantidad de un producto del carrito (0 lo quita).", input_schema: S({ item_id: { type: "string" }, qty: { type: "integer", minimum: 0, maximum: 20 } }, ["item_id", "qty"]) },
  { name: "cart_remove", description: "Quita un producto del carrito.", input_schema: S({ item_id: { type: "string" } }, ["item_id"]) },
  { name: "cart_undo", description: "Deshace el último cambio del carrito ('no, mejor dejalo').", input_schema: S({}) },
  { name: "cart_clear", description: "Vacía el carrito (solo si el cliente pide empezar de nuevo o cancelar).", input_schema: S({}) },
  { name: "reorder_last", description: "Carga en el carrito el último pedido que este cliente hizo desde esta web ('lo de siempre', 'lo mismo de la otra vez').", input_schema: S({}) },
  { name: "set_order_details", description: "Guarda datos del pedido que el cliente ya dijo. branch es el nombre de la sucursal (o 'call center'). phone es el celular de WhatsApp (8 dígitos) para seguir el pedido.", input_schema: S({ mode: { type: "string", enum: ["delivery", "pickup"] }, branch: { type: "string" }, name: { type: "string" }, phone: { type: "string" }, address: { type: "string" }, reference: { type: "string" }, when: { type: "string", description: "'lo antes posible' o una hora como '20:30'" }, note: { type: "string" } }) },
  { name: "request_location", description: "Muestra el botón 'Compartir mi ubicación' (Entrega con Pin) para delivery. Úsalo cuando falte la dirección o el cliente no sepa explicarla.", input_schema: S({}) },
  { name: "review_order", description: "Prepara la lectura final del pedido (ítems, total del sistema, entrega, sucursal) y un confirmation_token. Llamalo antes de pedir el 'sí'. Si faltan datos, devuelve cuáles.", input_schema: S({}) },
  { name: "place_order", description: "Solo después de un 'sí' explícito del cliente a la lectura de review_order. Arma el mensaje para el WhatsApp de la sucursal y muestra el botón de envío.", input_schema: S({ confirmation_token: { type: "string" } }, ["confirmation_token"]) },
  { name: "get_order_status", description: "Para '¿dónde está mi pizza?' (Sigue tu Pizza). Devuelve el estado real del último pedido si tiene seguimiento; nunca inventes etapas ni tiempos.", input_schema: S({}) },
  { name: "handoff_to_human", description: "Pasa la conversación a una persona: quejas, reembolsos, pedidos muy grandes/eventos, alergias graves, o si no entendés dos veces.", input_schema: S({ reason: { type: "string" } }, ["reason"]) },
];

/* ---------- ejecución ---------- */
const STATUS_ES = { new: "recibido", confirmed: "confirmado", preparing: "en preparación", cooking: "en el horno", ready: "listo", out_for_delivery: "en camino", delivered: "entregado", cancelled: "cancelado" };
function handoffEvent(st, b, text, label) {
  if (b && b.whatsapp) st.events.push({ type: "handoff", href: "https://wa.me/" + b.whatsapp + "?text=" + encodeURIComponent("Hola Pizza Río. " + text), label });
}
// Deja el pedido listo para enviar por WhatsApp (con el código de la base si se registró).
function finishPlace(st, token, rec) {
  const target = waTarget(st, rec);
  const already = st.placed.includes(token);
  if (!already) st.placed.push(token);
  st.stage = "placed";
  st.events.push({ type: "state", stage: "placed", token });
  st.events.push({ type: "order.ready", token, href: target.href, label: target.label, copy: target.copy, message: buildMessage(st, rec), cart: st.cart, branch: st.order.branch, mode: st.order.mode,
    code: rec && rec.code || null, track: rec && rec.token || null, trackUrl: rec && rec.url || null });
  return { status: already ? "ya estaba listo (no se duplica)" : "listo para enviar", order_code: rec && rec.code || undefined, total: rec && rec.total != null ? bs(rec.total) + (rec.pending ? " + ítems con precio a confirmar" : "") : undefined,
    tracking: rec && rec.url ? "El cliente puede seguir su pedido con el botón 'Seguí tu pedido'." : undefined,
    sent_to: target.label, next_step: "El cliente toca el botón verde 'Enviar por WhatsApp' que apareció en el chat; la sucursal confirma el pago y el tiempo por ahí." };
}

/* Ruta asíncrona: registra el pedido en la base (si está configurada) y consulta el seguimiento.
   guard = { tokenAtStart, yes }: place_order solo corre si el pedido llegó en espera de confirmación,
   el último mensaje es un "sí" claro y el pedido no cambió desde la lectura. */
async function exec(name, input, st, now, opts) {
  const o = opts || {};
  const B = o.backend;
  if (name === "place_order") {
    const g = o.guard || {};
    const token = orderToken(st);
    const inpTok = input && input.confirmation_token;
    if (st.placed.includes(token)) return run("place_order", { confirmation_token: token }, st, now);
    if (!g.tokenAtStart || !g.yes || token !== g.tokenAtStart || (inpTok && inpTok !== token))
      return { error: "Todavía no: primero leé el resumen (review_order) y esperá que el cliente diga que sí en su próximo mensaje." };
    const miss = missingDetails(st);
    if (miss.length) return { error: "Faltan datos: " + miss.join(", ") };
    const store = branchId(st.order.branch);
    if (B && B.enabled() && store) {
      const payload = {
        client_ref: "ria-" + token + "-" + st.order.phone, channel: "ria", store, service: st.order.mode,
        customer_name: st.order.name, customer_phone: st.order.phone, address: st.order.address || null, reference: st.order.reference || null,
        lat: st.order.lat, lng: st.order.lng, scheduled_for: st.order.when || null, notes: st.order.note || null,
        items: st.cart.map((l) => ({ id: l.id, qty: l.qty })),
      };
      const r = await B.rpc("place_order", { payload });
      if (r.ok && r.data && r.data.code) {
        return finishPlace(st, token, { code: r.data.code, token: r.data.tracking_token, url: B.trackUrl(r.data.tracking_token), total: r.data.total, pending: r.data.price_pending });
      }
      if (r.kind === "business") {
        st.stage = "awaiting_confirmation";
        st.events.push({ type: "state", stage: st.stage, token: st.token });
        return { error: "No se pudo confirmar: " + B.explain(r.code) + " Explicáselo y ofrecé una alternativa (otra sucursal, otro producto o recoger).", reason: r.code };
      }
      console.error("[ria] backend no disponible, sigue por WhatsApp:", r.detail);
    }
    return finishPlace(st, token, null);
  }
  if (name === "get_order_status") {
    const lo = st.lastOrder;
    if (B && B.enabled() && lo && lo.track) {
      const r = await B.rpc("track_order", { token: lo.track });
      if (r.ok && r.data && r.data.status) return run("get_order_status", { live: r.data, url: B.trackUrl(lo.track) }, st, now);
    }
    return run("get_order_status", {}, st, now);
  }
  return run(name, input, st, now);
}

// "sí" claro: corto y sin peros ni cambios.
function isYes(text) {
  const t = CAT.norm(String(text || "")).replace(/[!¡.?¿,]/g, " ").trim();
  if (!t || t.length > 60) return false;
  if (/\b(no|pero|cambi\w*|quit\w*|saca\w*|agreg\w*|anad\w*|suma\w*|espera\w*|mejor|otra|otro|menos|mas|sin|falta\w*|todavia|aun)\b/.test(t)) return false;
  return /^(si+|sip|sii|dale|ok|okey|okay|oka|listo|confirm\w*|de una|va|vale|claro|perfecto|correcto|exacto|eso|asi esta|esta bien|todo bien|yes|yep|yeah|sure|go ahead|hacelo|mandalo|pedilo|adelante)\b/.test(t);
}
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
    case "get_deals": {
      const ids = st.cart.map((l) => l.id), tips = [];
      Object.entries(COMBO_PARTS).forEach(([cid, parts]) => {
        if (!ITEMS[cid] || ids.includes(cid) || !parts.every((p) => ids.includes(p))) return;
        const after = swapCart(st.cart, cid), t = CAT.totals(ITEMS, after);
        const sep = parts.map((p) => ITEMS[p].price);
        tips.push({ hint: "switch_to_combo", deal_item_id: cid, deal: ITEMS[cid].name, price: bs(ITEMS[cid].price), contents: ITEMS[cid].desc,
          replaces: parts.map((p) => ITEMS[p].name), separately: sep.some((x) => x == null) ? "precio por separado no publicado" : bs(sep.reduce((a, b) => a + b, 0)) + " (sin la bebida)",
          total_if_accepted: t.unknown ? bs(t.sum) + " + ítems con precio a confirmar" : bs(t.sum) });
      });
      const cm = D.weekly.find((w) => w.id === "choclomix");
      if (cm && active(cm, t) && t.dow === cm.day && !ids.includes("choclomix") && ITEMS.choclomix) {
        const after = st.cart.concat([{ id: "choclomix", qty: 1 }]), tt = CAT.totals(ITEMS, after);
        tips.push({ hint: "promo_of_the_day", deal_item_id: "choclomix", deal: cm.title, price: bs(cm.price), contents: cm.desc, applies_to: ids.filter((i) => i === "choclo" || i === "jamon").map((i) => ITEMS[i].name),
          total_if_added: tt.unknown ? bs(tt.sum) + " + ítems con precio a confirmar" : bs(tt.sum) });
      }
      return tips.length ? { suggestions: tips, rule: "Ofrecé como mucho una, una sola vez; citá total_if_accepted tal cual." } : { suggestions: [], note: "No hay un combo o promo publicada que mejore este carrito." };
    }
    case "cart_swap_to_combo": {
      const cid = String(inp.combo_id || ""), parts = COMBO_PARTS[cid];
      if (!parts) return { error: "Ese combo no se arma desde el carrito." };
      if (!parts.every((p) => st.cart.some((l) => l.id === p))) return { error: "Al carrito le faltan partes del combo: " + parts.map((p) => ITEMS[p].name).join(" + ") + "." };
      snapshot(st); st.cart = swapCart(st.cart, cid); emitCart(st);
      return Object.assign({ swapped_to: ITEMS[cid].name }, cartView(st));
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
      ["name", "address", "reference", "note"].forEach((k) => { if (typeof inp[k] === "string" && inp[k].trim()) o[k] = inp[k].trim().slice(0, k === "note" ? 200 : 160); });
      if (typeof inp.when === "string" && inp.when.trim()) {
        const w = inp.when.trim().toLowerCase(), m = w.match(/^(\d{1,2})(?::(\d{2}))?\s*(?:hs?|horas)?$/);
        if (/^(ya|ahora|asap|lo antes posible|cuanto antes|lo mas pronto|lo más pronto)$/.test(w)) o.when = "";
        else if (m && +m[1] < 24 && (!m[2] || +m[2] < 60)) {
          const hh = String(+m[1]).padStart(2, "0") + ":" + (m[2] || "00");
          if (toMin(hh) < t.min - 5) out.when_error = "Esa hora ya pasó (son las " + t.hhmm + ").";
          else o.when = hh;
        } else out.when_error = "Decime la hora como 20:30, o 'lo antes posible'.";
      }
      if (inp.phone !== undefined && String(inp.phone).trim()) {
        const ph = normPhone(inp.phone);
        if (ph) o.phone = ph; else out.phone_error = "El celular tiene 8 dígitos (ej. 71234567).";
      }
      st.events.push({ type: "order.updated", order: o });
      return Object.assign(out, { saved: { mode: o.mode || null, branch: o.branch === "cc" ? "call center" : (Number.isInteger(o.branch) ? D.branches[o.branch].name : null), name: o.name || null, phone: o.phone ? phone(o.phone) : null, address: o.address || null, location_pin: o.lat !== null, reference: o.reference || null, when: o.when || "lo antes posible", note: o.note || null }, still_missing: missingDetails(st) });
    }
    case "request_location": {
      st.events.push({ type: "location" });
      return { ok: true, note: "Apareció el botón 'Compartir mi ubicación'. Cuando lo toque, la ubicación queda en el pedido." };
    }
    case "review_order": {
      const miss = missingDetails(st);
      if (miss.length) return { ready: false, still_missing: miss };
      const v = cartView(st), o = st.order, b = Number.isInteger(o.branch) ? D.branches[o.branch] : null;
      const token = orderToken(st);
      st.stage = "awaiting_confirmation"; st.token = token;
      st.events.push({ type: "state", stage: st.stage, token });
      st.events.push({ type: "chips", chips: ["Sí, confirmar", "Cambiar algo"] });
      return { ready: true, confirmation_token: token, next: "Leé este resumen y preguntá '¿Confirmo?'. Terminá el turno ahí: el pedido se confirma cuando el cliente diga que sí.", items: v.lines.map((l) => l.qty + " × " + l.name + " (" + (l.line_total == null ? "precio a confirmar" : bs(l.line_total)) + ")"), total: v.total_text, service: o.mode === "delivery" ? "delivery a " + (o.address || "la ubicación compartida") + (o.reference ? " (" + o.reference + ")" : "") : "pasa a recoger", phone: phone(o.phone), branch: b ? b.name : "call center", name: o.name, when: o.when || "lo antes posible", payment: "se coordina por WhatsApp con la sucursal (medios de pago no publicados)", eta: "la sucursal confirma el tiempo por WhatsApp (no hay tiempos publicados)" };
    }
    case "place_order": {
      const token = orderToken(st);
      if (!inp.confirmation_token || inp.confirmation_token !== token) return { error: "El pedido cambió o no fue revisado. Llamá review_order y pedí confirmación de nuevo." };
      const miss = missingDetails(st);
      if (miss.length) return { error: "Faltan datos: " + miss.join(", ") };
      return finishPlace(st, token, null);
    }
    case "get_order_status": {
      const b = st.lastOrder && Number.isInteger(st.lastOrder.branch) ? D.branches[st.lastOrder.branch] : null;
      if (inp.live) {
        const L = inp.live, label = STATUS_ES[L.status] || L.status;
        st.events.push({ type: "track", href: inp.url, code: L.code });
        if (b) handoffEvent(st, b, "Consulta por mi pedido " + L.code, "Preguntar a " + b.name);
        return { code: L.code, status: label, service: L.service === "pickup" ? "para recoger" : "delivery", since: L.created_at, cancel_reason: L.cancel_reason || undefined, store: L.store && L.store.name, note: "Estado real del sistema. Apareció el botón 'Seguí tu pedido'. No inventes tiempos." };
      }
      if (b) handoffEvent(st, b, "Consulta por mi pedido", "Preguntar a " + b.name);
      return { tracking: st.lastOrder && st.lastOrder.code ? "No pude consultar el estado ahora mismo." : "Este pedido no tiene seguimiento en línea.", how_to_check: b ? "Escribile a la sucursal " + b.name + " por WhatsApp (apareció el botón)." : "Escribile por WhatsApp a la sucursal donde pediste, o al call center " + phone(C.callCenter) + "." };
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

module.exports = { DEFS, run, exec, isYes, normPhone, sanitizeState, cartView, orderToken, buildMessage, missingDetails, ITEMS, clock, STATUS_ES };
