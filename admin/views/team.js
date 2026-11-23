/* Equipo: usuarios, roles, sucursal, activar/desactivar y contraseñas. */
import { sb, S, $, esc, ROLE, dmy, isRole, q, rpc, toast, errMsg, openModal, options, loading } from "../lib.js";

export default async function (el) {
  el.innerHTML = loading();
  let staff = [];
  const roleOpts = (sel) => options(isRole("owner") ? ROLE : Object.fromEntries(Object.entries(ROLE).filter(([k]) => k !== "owner")), sel);
  const storeSel = (sel) => '<option value="">— (todas: solo dueño/admin)</option>' + S.stores.map((s) => '<option value="' + s.id + '"' + (s.id === sel ? " selected" : "") + ">" + esc(s.name) + "</option>").join("");
  async function load() {
    try { staff = await q(sb.from("staff").select("*").order("role").order("full_name")); render(); }
    catch (e) { el.innerHTML = '<div class="card empty">' + esc(errMsg(e)) + "</div>"; }
  }
  function render() {
    el.innerHTML = '<div class="section" style="margin-top:0"><p class="muted small" style="margin:0">Cada persona entra con su email y contraseña. Encargado, caja, cocina y delivery ven solo su sucursal.</p><button class="btn btn--red" type="button" id="tNew">+ Agregar persona</button></div>' +
      '<div class="tablewrap"><table><thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Sucursal</th><th>Estado</th><th>Desde</th><th></th></tr></thead><tbody>' +
      staff.map((s) => "<tr><td><b>" + esc(s.full_name) + "</b>" + (s.user_id === S.me.user_id ? ' <span class="pill">vos</span>' : "") + "</td><td>" + esc(s.email || "") + "</td><td>" + esc(ROLE[s.role]) + "</td><td>" + esc((S.storeById[s.store_id] || {}).name || "Todas") + "</td><td>" + (s.active ? '<span class="pill pill--ok">Activo</span>' : '<span class="pill pill--bad">Inactivo</span>') + "</td><td>" + dmy(s.created_at) + "</td><td>" +
        (s.role === "owner" && !isRole("owner") ? "" : '<div class="row"><button class="btn btn--ghost btn--sm" data-edit="' + s.user_id + '">Editar</button><button class="btn btn--ghost btn--sm" data-pw="' + s.user_id + '">Contraseña</button></div>') + "</td></tr>").join("") +
      "</tbody></table></div>";
  }
  el.addEventListener("click", (e) => {
    if (e.target.id === "tNew") {
      openModal("Agregar persona", '<label>Nombre completo<input name="name" required></label><label>Email<input name="email" type="email" required autocomplete="off"></label><label>Contraseña temporal (mín. 8)<input name="pw" type="text" minlength="8" required autocomplete="off"></label>' +
        '<div class="grid2"><label>Rol<select name="role">' + roleOpts("cashier") + '</select></label><label>Sucursal<select name="store">' + storeSel(S.stores[0] && S.stores[0].id) + '</select></label></div><label>Celular (opcional)<input name="phone" type="tel"></label><p class="small muted">Pasale el email y la contraseña temporal; la puede cambiar en «Mi cuenta».</p>',
        async (f) => { await rpc("admin_create_staff", { p_email: f.get("email"), p_password: f.get("pw"), p_full_name: f.get("name"), p_role: f.get("role"), p_store: f.get("store") || null, p_phone: f.get("phone") || null }); toast("Usuario creado", "ok"); load(); }, "Crear usuario");
    }
    const ed = e.target.closest("[data-edit]");
    if (ed) {
      const s = staff.find((x) => x.user_id === ed.dataset.edit);
      openModal("Editar · " + s.full_name, '<label>Nombre<input name="name" value="' + esc(s.full_name) + '" required></label><div class="grid2"><label>Rol<select name="role">' + roleOpts(s.role) + '</select></label><label>Sucursal<select name="store">' + storeSel(s.store_id) + '</select></label></div><label class="check"><input type="checkbox" name="active"' + (s.active ? " checked" : "") + "> Activo (puede entrar)</label>",
        async (f) => { await rpc("admin_update_staff", { p_user: s.user_id, p_role: f.get("role"), p_store: f.get("store") || null, p_active: f.has("active"), p_full_name: f.get("name") }); toast("Guardado", "ok"); load(); });
    }
    const pw = e.target.closest("[data-pw]");
    if (pw) {
      const s = staff.find((x) => x.user_id === pw.dataset.pw);
      openModal("Nueva contraseña · " + s.full_name, '<label>Contraseña (mín. 8)<input name="pw" type="text" minlength="8" required autocomplete="off"></label>',
        async (f) => { await rpc("admin_set_password", { p_user: s.user_id, p_password: f.get("pw") }); toast("Contraseña cambiada", "ok"); }, "Cambiar");
    }
  });
  await load();
}
