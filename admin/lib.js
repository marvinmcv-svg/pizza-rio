/* Utilidades compartidas del backoffice. */
const CFG = window.PR_CONFIG || {};
export const enabled = !!(CFG.supabaseUrl && CFG.supabaseKey && window.supabase);
export const sb = enabled ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, storageKey: "pr-admin-auth" } }) : null;
export const TZ = "America/La_Paz";
export const S = { me: null, stores: [], storeById: {}, menu: [], menuById: {}, reasons: [], reasonByCode: {} };

export const $ = (s, el) => (el || document).querySelector(s);
export const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const money = (n) => (n == null ? "—" : "Bs " + Number(n).toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
const fmt = (opts) => new Intl.DateTimeFormat("es-BO", Object.assign({ timeZone: TZ }, opts));
export const hhmm = (iso) => (iso ? fmt({ hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "");
export const dmy = (iso) => (iso ? fmt({ day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)) : "");
export const dt = (iso) => (iso ? dmy(iso) + " " + hhmm(iso) : "");
/** Fecha local (Bolivia) AAAA-MM-DD, con desplazamiento en días. */
export function localDay(offset) {
  const d = new Date(Date.now() + (offset || 0) * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export const minsSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
export const phoneFmt = (p) => (p ? String(p).replace(/^\+591(\d{3})(\d{5})$/, "+591 $1 $2") : "");
export const normPhone = (v) => { let d = String(v || "").replace(/\D/g, ""); if (d.length === 11 && d.startsWith("591")) d = d.slice(3); return d.length === 8 && /^[234567]/.test(d) ? "+591" + d : null; };

export const STATUS = {
  new: "Nuevo", confirmed: "Confirmado", preparing: "Preparando", cooking: "En el horno", ready: "Listo",
  out_for_delivery: "En camino", delivered: "Entregado", cancelled: "Cancelado",
};
export const FLOW = ["new", "confirmed", "preparing", "cooking", "ready", "out_for_delivery", "delivered"];
export const ROLE = { owner: "Dueño", admin: "Administrador", manager: "Encargado", cashier: "Caja", kitchen: "Cocina", rider: "Delivery" };
export const CHANNEL = { web: "Web", ria: "Ría (IA)", whatsapp: "WhatsApp", phone: "Teléfono", walk_in: "En local", pedidosya: "PedidosYa" };
export const SERVICE = { delivery: "Delivery", pickup: "Recoger", dine_in: "En local" };
export const PAYMENT = { cash: "Efectivo", qr: "QR", card: "Tarjeta", pedidosya: "PedidosYa", other: "Otro" };
export const PAY_STATUS = { pending: "Pendiente", paid: "Pagado", refunded: "Devuelto" };
export const stPill = (s) => '<span class="pill pill--st" style="background:var(--st-' + esc(s) + ')">' + esc(STATUS[s] || s) + "</span>";

/** Siguiente estado (y su etiqueta) para el botón grande, según servicio y rol. */
export function nextStep(o, role) {
  const map = { new: ["confirmed", "Confirmar"], confirmed: ["preparing", "Empezar"], preparing: ["cooking", "Al horno"], cooking: ["ready", "¡Lista!"],
    ready: o.service === "delivery" ? ["out_for_delivery", "Despachar"] : ["delivered", "Entregar"], out_for_delivery: ["delivered", "Entregar"] };
  const n = map[o.status];
  if (!n) return null;
  if (role === "kitchen" && !["confirmed", "preparing", "cooking", "ready"].includes(n[0])) return null;
  if (role === "rider" && !["out_for_delivery", "delivered"].includes(n[0])) return null;
  return n;
}

export const isRole = (...roles) => !!S.me && roles.includes(S.me.role);
export const isAdmin = () => isRole("owner", "admin");
/** Sucursales que la persona puede operar. */
export const myStores = () => (isAdmin() || !S.me.store_id ? S.stores : S.stores.filter((s) => s.id === S.me.store_id));

/* ---------- errores → mensajes ---------- */
const ERR = {
  store_paused: "La sucursal está pausada.", delivery_unavailable: "La sucursal no hace delivery ahora.", pickup_unavailable: "La sucursal no recibe pedidos para recoger ahora.",
  invalid_phone: "Celular inválido (8 dígitos).", missing_name: "Falta el nombre.", missing_address: "Falta la dirección o ubicación.", empty_order: "El pedido está vacío.",
  rate_limited: "Demasiados pedidos seguidos desde ese número.", customer_blocked: "Ese cliente está bloqueado.", unknown_store: "Sucursal desconocida.",
  forbidden_store: "No tenés acceso a esa sucursal.", not_staff: "Tu usuario no es del equipo.", order_not_found: "No se encontró el pedido.",
  closed_needs_manager: "Solo un encargado puede reabrir un pedido cerrado.", not_delivery: "Ese pedido no es delivery.", role_forbidden: "Tu rol no puede hacer ese cambio.",
  cancel_reason_required: "Elegí un motivo de cancelación.", cancel_note_required: "Escribí una nota para el motivo «Otro».", cancel_needs_manager: "Solo un encargado puede cancelar un pedido que ya se empezó.",
  recall_needs_manager: "Solo un encargado puede volver atrás un pedido.", admin_only: "Solo dueño o administrador.", owner_only: "Solo el dueño puede hacer eso.",
  weak_password: "La contraseña debe tener al menos 8 caracteres.", invalid_email: "Email inválido.", email_taken: "Ese email ya tiene usuario.", store_required: "Elegí la sucursal.",
  cannot_demote_self: "No podés cambiarte el rol ni desactivarte a vos mismo.", staff_not_found: "Usuario no encontrado.", forbidden: "No tenés permiso.", invalid_range: "Rango de fechas inválido.",
  time_in_past: "Esa hora ya pasó.", invalid_time: "Hora inválida.", invalid_channel: "Canal inválido.", invalid_service: "Servicio inválido.",
};
export function errMsg(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e || "");
  if (/^sold_out:/.test(m)) return "Agotado en esta sucursal: " + m.slice(9);
  if (/^unknown_item:/.test(m)) return "Producto desconocido: " + m.slice(13);
  if (ERR[m]) return ERR[m];
  if (/permission denied|row-level security|42501/i.test(m)) return "No tenés permiso para eso.";
  if (/Invalid login credentials/i.test(m)) return "Email o contraseña incorrectos.";
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "Sin conexión con el servidor. Reintentá.";
  return m || "Algo falló. Reintentá.";
}
/** Ejecuta una consulta de supabase-js y lanza si hay error. */
export async function q(promise) { const { data, error } = await promise; if (error) throw error; return data; }
export const rpc = (fn, args) => q(sb.rpc(fn, args));

/* ---------- UI ---------- */
export function toast(msg, kind) {
  const t = document.createElement("div");
  t.className = "toast" + (kind ? " toast--" + kind : ""); t.textContent = msg;
  $("#toasts").appendChild(t); setTimeout(() => t.remove(), kind === "bad" ? 5000 : 2800);
}
let lastFocus = null;
export function openDrawer(title, html) {
  lastFocus = document.activeElement;
  $("#drawerTitle").textContent = title; $("#drawerBody").innerHTML = html;
  $("#drawer").hidden = false; $("#scrim").hidden = false;
  $("#drawer .x").focus();
  return $("#drawerBody");
}
export function closeDrawer() { $("#drawer").hidden = true; $("#scrim").hidden = true; if (lastFocus) lastFocus.focus(); }
let modalSubmit = null;
/** Modal con formulario. onSubmit(FormData) → si devuelve false queda abierto. */
export function openModal(title, html, onSubmit, okLabel) {
  lastFocus = document.activeElement;
  $("#modalTitle").textContent = title; $("#modalBody").innerHTML = html; $("#modalOk").textContent = okLabel || "Guardar";
  modalSubmit = onSubmit; $("#modal").hidden = false;
  const f = $("#modalBody input, #modalBody select, #modalBody textarea"); (f || $("#modalOk")).focus();
  return $("#modalBody");
}
export function closeModal() { $("#modal").hidden = true; modalSubmit = null; if (lastFocus) lastFocus.focus(); }
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "modalForm") return;
  e.preventDefault();
  if (!modalSubmit) return closeModal();
  const btn = $("#modalOk"); btn.disabled = true;
  try { const r = await modalSubmit(new FormData(e.target)); if (r !== false) closeModal(); }
  catch (err) { toast(errMsg(err), "bad"); }
  finally { btn.disabled = false; }
});
document.addEventListener("click", (e) => {
  if (e.target.closest("#drawer [data-close]") || e.target.id === "scrim") closeDrawer();
  if (e.target.closest("#modal [data-close]") || e.target.id === "modal") closeModal();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (!$("#modal").hidden) closeModal(); else if (!$("#drawer").hidden) closeDrawer(); } });

export const options = (obj, sel) => Object.entries(obj).map(([v, l]) => '<option value="' + esc(v) + '"' + (v === sel ? " selected" : "") + ">" + esc(l) + "</option>").join("");
export const storeOptions = (sel, withAll) => (withAll ? '<option value="">Todas las sucursales</option>' : "") + myStores().map((s) => '<option value="' + esc(s.id) + '"' + (s.id === sel ? " selected" : "") + ">" + esc(s.name) + "</option>").join("");
export const loading = () => '<div class="card"><div class="skel" style="width:40%"></div><div class="skel"></div><div class="skel" style="width:70%"></div></div>';

export function downloadCsv(name, rows) {
  const cell = (v) => { const s = v == null ? "" : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Estado de una sucursal ahora: abierta / pausada / cerrada / sin horario. */
export function storeState(s) {
  if (s.is_paused && (!s.paused_until || new Date(s.paused_until) > new Date())) return { k: "paused", label: "Pausada" + (s.paused_until ? " hasta " + hhmm(s.paused_until) : ""), cls: "pill--warn" };
  if (!s.open_time || !s.close_time) return { k: "unknown", label: "Sin horario", cls: "" };
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).split(":");
  const n = +p[0] * 60 + +p[1], toM = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5), o = toM(s.open_time), c = toM(s.close_time);
  const open = c > o ? n >= o && n < c : n >= o || n < c;
  return open ? { k: "open", label: "Abierta", cls: "pill--ok" } : { k: "closed", label: "Cerrada", cls: "pill--bad" };
}
