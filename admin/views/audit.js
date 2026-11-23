/* Auditoría: quién cambió qué y cuándo, con antes → después. */
import { sb, S, $, esc, dt, STATUS, q, errMsg, localDay, loading } from "../lib.js";

const ENT = { orders: "Pedidos", stores: "Sucursales", menu_items: "Menú", store_item_availability: "Agotados", staff: "Equipo" };
const ACT = { insert: "creó", update: "cambió", delete: "borró", password_reset: "cambió la contraseña de" };

export default async function (el) {
  let entity = "", from = localDay(-7), names = {};
  el.innerHTML = '<div class="toolbar"><label>Qué<select id="aEnt"><option value="">Todo</option>' + Object.entries(ENT).map(([k, v]) => '<option value="' + k + '">' + v + "</option>").join("") + '</select></label><label>Desde<input type="date" id="aFrom" value="' + from + '"></label></div><div id="aOut">' + loading() + "</div>";
  const val = (v) => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : STATUS[v] || String(v));
  function diff(r) {
    if (!r.data) return "";
    if (r.action === "update") return Object.entries(r.data).map(([k, d]) => "<div><code>" + esc(k) + "</code>: " + esc(val(d.from)) + " → <b>" + esc(val(d.to)) + "</b></div>").join("");
    const d = r.data, pick = ["name", "full_name", "role", "price", "available", "store_id", "item_id"].filter((k) => k in d);
    return pick.map((k) => "<div><code>" + esc(k) + "</code>: " + esc(val(d[k])) + "</div>").join("");
  }
  async function load() {
    const out = $("#aOut", el);
    try {
      if (!Object.keys(names).length) (await q(sb.from("staff").select("user_id,full_name"))).forEach((s) => (names[s.user_id] = s.full_name));
      let aq = sb.from("audit_log").select("*").gte("created_at", from + "T00:00:00-04:00").order("created_at", { ascending: false }).limit(300);
      if (entity) aq = aq.eq("entity", entity);
      const rows = await q(aq);
      out.innerHTML = rows.length ? '<div class="tablewrap"><table><thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Detalle</th></tr></thead><tbody>' +
        rows.map((r) => "<tr><td>" + dt(r.created_at) + "</td><td>" + esc(r.actor ? names[r.actor] || "Usuario" : "Sistema / web") + "</td><td>" + esc(ACT[r.action] || r.action) + " " + esc(ENT[r.entity] || r.entity) + ' <small class="muted">' + esc(r.entity === "store_item_availability" ? r.entity_id : (S.storeById[r.entity_id] || S.menuById[r.entity_id] || {}).name || names[r.entity_id] || r.entity_id || "") + '</small></td><td class="small">' + diff(r) + "</td></tr>").join("") +
        "</tbody></table></div>" + (rows.length === 300 ? '<p class="muted small">Mostrando los últimos 300. Acotá con los filtros.</p>' : "") : '<div class="card empty">Sin cambios registrados en ese período.</div>';
    } catch (e) { out.innerHTML = '<div class="card empty">' + esc(errMsg(e)) + "</div>"; }
  }
  el.addEventListener("change", (e) => { if (e.target.id === "aEnt") entity = e.target.value; if (e.target.id === "aFrom") from = e.target.value || localDay(-7); load(); });
  await load();
}
