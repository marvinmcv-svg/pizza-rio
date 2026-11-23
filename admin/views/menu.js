/* Menú: nombre, descripción, precio, activo y sin carne. El precio de acá es el que cobra la base. */
import { sb, S, $, esc, q, toast, errMsg, loading } from "../lib.js";

export default async function (el) {
  el.innerHTML = loading();
  let items = [];
  async function load() {
    try { items = await q(sb.from("menu_items").select("*").order("sort")); S.menu = items; S.menuById = Object.fromEntries(items.map((m) => [m.id, m])); render(); }
    catch (e) { el.innerHTML = '<div class="card empty">' + esc(errMsg(e)) + "</div>"; }
  }
  function render() {
    el.innerHTML = '<div class="notice">⚠️ Si cambiás un precio acá, cambialo también en <code>js/data.js</code> (o regenerá el seed): la web muestra <code>data.js</code> y la base cobra lo que dice esta tabla. Precio vacío = «a confirmar».</div>' +
      '<div class="toolbar"><label>Buscar<input id="mText" placeholder="Producto o categoría"></label></div>' +
      '<div class="tablewrap"><table><thead><tr><th>Producto</th><th>Categoría</th><th>Descripción</th><th class="num">Precio (Bs)</th><th>Activo</th><th>Sin carne</th><th></th></tr></thead><tbody id="mRows"></tbody></table></div>';
    rows();
    $("#mText", el).addEventListener("input", rows);
  }
  function rows() {
    const t = ($("#mText", el).value || "").toLowerCase();
    $("#mRows", el).innerHTML = items.filter((m) => !t || (m.name + " " + (m.category || "")).toLowerCase().includes(t)).map((m) =>
      '<tr data-id="' + esc(m.id) + '"><td><input name="name" value="' + esc(m.name) + '" aria-label="Nombre"><small class="muted">' + esc(m.id) + "</small></td><td>" + esc(m.category || "") + '</td><td><input name="description" value="' + esc(m.description || "") + '" aria-label="Descripción"></td>' +
      '<td class="num"><input name="price" type="number" min="0" step="0.5" style="width:96px;text-align:right" value="' + (m.price == null ? "" : m.price) + '" aria-label="Precio"></td>' +
      '<td><input type="checkbox" name="active"' + (m.active ? " checked" : "") + ' aria-label="Activo"></td><td><input type="checkbox" name="veg"' + (m.veg ? " checked" : "") + ' aria-label="Sin carne"></td><td><button class="btn btn--sm" type="button" data-save>Guardar</button></td></tr>').join("");
  }
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-save]"); if (!b) return;
    const tr = b.closest("tr"), v = (n) => tr.querySelector('[name="' + n + '"]');
    const price = v("price").value === "" ? null : Number(v("price").value);
    if (price != null && (!isFinite(price) || price < 0)) return toast("Precio inválido", "bad");
    const patch = { name: v("name").value.trim(), description: v("description").value.trim() || null, price, active: v("active").checked, veg: v("veg").checked };
    if (!patch.name) return toast("El nombre no puede quedar vacío", "bad");
    b.disabled = true;
    try { await q(sb.from("menu_items").update(patch).eq("id", tr.dataset.id)); Object.assign(S.menuById[tr.dataset.id], patch); toast("Guardado · recordá actualizar data.js", "ok"); }
    catch (err) { toast(errMsg(err), "bad"); } finally { b.disabled = false; }
  });
  await load();
}
