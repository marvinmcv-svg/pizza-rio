/* Backoffice Pizza Río: ingreso, navegación por rol y router con vistas que se cargan al entrar. */
import { sb, enabled, S, $, esc, ROLE, errMsg, q, toast, closeDrawer, closeModal } from "./lib.js";

const ALL = ["owner", "admin", "manager", "cashier", "kitchen", "rider"];
const ROUTES = [
  { path: "hoy", title: "Hoy", icon: "📊", roles: ["owner", "admin", "manager"], mod: "./views/today.js" },
  { path: "pedidos", title: "Pedidos", icon: "🍕", roles: ALL, mod: "./views/orders.js" },
  { path: "nuevo", title: "Nuevo pedido", icon: "➕", roles: ["owner", "admin", "manager", "cashier"], mod: "./views/neworder.js" },
  { path: "clientes", title: "Clientes", icon: "👥", roles: ["owner", "admin", "manager", "cashier"], mod: "./views/customers.js" },
  { path: "sucursales", title: "Sucursales", icon: "🏪", roles: ["owner", "admin", "manager"], mod: "./views/branches.js" },
  { path: "disponibilidad", title: "Agotados (86)", icon: "🚫", roles: ["owner", "admin", "manager", "cashier", "kitchen"], mod: "./views/availability.js" },
  { path: "menu", title: "Menú", icon: "📋", roles: ["owner", "admin"], mod: "./views/menu.js" },
  { path: "reportes", title: "Reportes", icon: "📈", roles: ["owner", "admin", "manager", "cashier"], mod: "./views/reports.js" },
  { path: "equipo", title: "Equipo", icon: "🧑‍🍳", roles: ["owner", "admin"], mod: "./views/team.js" },
  { path: "auditoria", title: "Auditoría", icon: "🔎", roles: ["owner", "admin"], mod: "./views/audit.js" },
  { path: "cuenta", title: "Mi cuenta", icon: "🙂", roles: ALL, mod: "./views/account.js" },
];
const allowed = () => ROUTES.filter((r) => r.roles.includes(S.me.role));

/* ---------- contexto de la vista: canales de tiempo real que se limpian al cambiar de ruta ---------- */
let cleanup = [], channels = [], renderSeq = 0;
function makeCtx() {
  return {
    channel(name, tables, onChange) {
      const ch = sb.channel(name + "-" + Date.now());
      tables.forEach((t) => ch.on("postgres_changes", { event: "*", schema: "public", table: t }, onChange));
      ch.subscribe((status) => $("#live").classList.toggle("is-on", status === "SUBSCRIBED"));
      channels.push(ch);
      return ch;
    },
    onCleanup(fn) { cleanup.push(fn); },
    setBadge(path, n) { const b = $('#nav a[href="#/' + path + '"] .badge'); if (b) { b.textContent = n; b.hidden = !n; } },
  };
}
async function teardown() {
  cleanup.forEach((fn) => { try { fn(); } catch (e) { /* nada */ } }); cleanup = [];
  for (const ch of channels) { try { await sb.removeChannel(ch); } catch (e) { /* nada */ } }
  channels = []; $("#live").classList.remove("is-on");
  closeDrawer(); closeModal();
}

async function route() {
  if (!S.me) return;
  const seq = ++renderSeq;
  const path = (location.hash.replace(/^#\/?/, "").split("?")[0]) || "";
  const list = allowed();
  const r = list.find((x) => x.path === path) || list.find((x) => x.path === (S.me.role === "kitchen" || S.me.role === "rider" ? "pedidos" : "hoy")) || list[0];
  if (r.path !== path) { history.replaceState(null, "", "#/" + r.path); }
  await teardown();
  $$nav().forEach((a) => (a.getAttribute("href") === "#/" + r.path ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  $("#viewTitle").textContent = r.title;
  document.title = r.title + " · Pizza Río";
  const host = $("#view");
  const el = document.createElement("div"); // elemento nuevo por ruta: no se acumulan listeners
  host.replaceChildren(el);
  try {
    const mod = await import(r.mod);
    if (seq !== renderSeq) return;
    await mod.default(el, makeCtx());
  } catch (e) {
    console.error(e);
    if (seq === renderSeq) el.innerHTML = '<div class="card empty">No se pudo cargar esta sección: ' + esc(errMsg(e)) + ' <button class="btn btn--sm" type="button" onclick="location.reload()">Reintentar</button></div>';
  }
}
const $$nav = () => [...document.querySelectorAll("#nav a")];

function renderShell() {
  $("#nav").innerHTML = allowed().map((r) => '<li><a class="nav" href="#/' + r.path + '"><i aria-hidden="true">' + r.icon + "</i><span>" + esc(r.title) + '</span><span class="badge" hidden></span></a></li>').join("");
  const st = S.me.store_id ? S.storeById[S.me.store_id] : null;
  $("#me").innerHTML = "<b>" + esc(S.me.full_name) + "</b><br>" + esc(ROLE[S.me.role]) + (st ? " · " + esc(st.name) : " · todas las sucursales");
  $("#login").hidden = true; $("#shell").hidden = false;
}

async function loadSession() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return showLogin();
  try {
    const uid = data.session.user.id;
    const staff = await q(sb.from("staff").select("*").eq("user_id", uid).maybeSingle());
    if (!staff || !staff.active) { await sb.auth.signOut(); return showLogin("Tu usuario no tiene acceso al backoffice."); }
    S.me = staff;
    const [stores, menu, reasons] = await Promise.all([
      q(sb.from("stores").select("*").order("sort")),
      q(sb.from("menu_items").select("*").order("sort")),
      q(sb.from("cancel_reasons").select("*").order("sort")),
    ]);
    S.stores = stores; S.storeById = Object.fromEntries(stores.map((s) => [s.id, s]));
    S.menu = menu; S.menuById = Object.fromEntries(menu.map((m) => [m.id, m]));
    S.reasons = reasons; S.reasonByCode = Object.fromEntries(reasons.map((r) => [r.code, r]));
    renderShell();
    route();
  } catch (e) {
    showLogin(errMsg(e));
  }
}
function showLogin(msg) {
  S.me = null; $("#shell").hidden = true; $("#login").hidden = false; $("#loginMsg").textContent = msg || "";
  $('#loginForm [name="email"]').focus();
}

if (!enabled) {
  $("#noBackend").hidden = false;
} else {
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target), btn = e.target.querySelector("button");
    btn.disabled = true; $("#loginMsg").textContent = "";
    const { error } = await sb.auth.signInWithPassword({ email: String(f.get("email")).trim(), password: String(f.get("password")) });
    btn.disabled = false;
    if (error) { $("#loginMsg").textContent = errMsg(error); return; }
    e.target.reset();
    loadSession();
  });
  $("#logout").addEventListener("click", async () => { await teardown(); await sb.auth.signOut(); showLogin(); toast("Sesión cerrada"); });
  window.addEventListener("hashchange", route);
  loadSession();
}
