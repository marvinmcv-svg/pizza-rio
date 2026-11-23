/* Nuevo pedido manual (teléfono, en local, WhatsApp, PedidosYa). El precio lo pone la base. */
import { sb, S, $, $$, esc, money, phoneFmt, normPhone, CHANNEL, SERVICE, PAYMENT, myStores, q, rpc, toast, errMsg, options, storeOptions } from "../lib.js";

export default async function (el) {
  const stores = myStores();
  let cart = [], customer = null, avail = {};
  const menu = S.menu.filter((m) => m.active);
  const chOpts = Object.fromEntries(Object.entries(CHANNEL).filter(([k]) => k !== "web" && k !== "ria"));

  el.innerHTML =
    '<form id="no" class="grid2" style="grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);align-items:start" autocomplete="off">' +
    '<div class="card" style="display:grid;gap:12px">' +
      '<div class="grid2"><label>Celular del cliente<input name="phone" type="tel" inputmode="tel" placeholder="7XXXXXXX"></label><label>Nombre<input name="name"></label></div>' +
      '<p class="small muted" id="custInfo">Escribí el celular: si ya pidió, cargamos su nombre y su última dirección.</p>' +
      '<div class="grid2"><label>Canal<select name="channel">' + options(chOpts, "phone") + '</select></label><label>Servicio<select name="service">' + options(SERVICE, "delivery") + '</select></label><label>Sucursal<select name="store">' + storeOptions(stores[0] && stores[0].id) + "</select></label></div>" +
      '<div class="grid2" id="addrBox"><label>Dirección<input name="address"></label><label>Referencia<input name="reference"></label></div>' +
      '<div class="grid2"><label>Para las (opcional)<input name="when" type="time"></label><label>Pago<select name="payment"><option value="">—</option>' + options(PAYMENT) + '</select></label><label>Paga con (cambio)<input name="change" type="number" min="0" step="1" inputmode="numeric"></label></div>' +
      '<label>Nota<input name="notes" placeholder="Sin cebolla, timbre no funciona…"></label>' +
    "</div>" +
    '<div class="card" style="display:grid;gap:10px">' +
      '<label>Buscar producto<input id="msearch" placeholder="hawaiana, combo, borde…"></label>' +
      '<div id="mlist" style="display:grid;gap:6px;max-height:260px;overflow:auto"></div>' +
      '<h3 style="font-size:1.05rem">Pedido</h3><div id="ncart"></div>' +
      '<button class="btn btn--red btn--lg btn--block" type="submit">Registrar pedido</button>' +
      '<p class="small muted">Los precios los calcula la base (menú vigente); productos sin precio quedan «a confirmar».</p>' +
    "</div></form>";
  const f = $("#no", el);

  async function loadAvail() {
    avail = {};
    try { (await q(sb.from("store_item_availability").select("item_id,available").eq("store_id", f.store.value))).forEach((a) => (avail[a.item_id] = a.available)); } catch (e) { /* sin 86 */ }
    renderMenu();
  }
  function renderMenu() {
    const t = $("#msearch", el).value.trim().toLowerCase();
    const list = menu.filter((m) => !t || (m.name + " " + (m.category || "")).toLowerCase().includes(t)).slice(0, 40);
    $("#mlist", el).innerHTML = list.map((m) => { const out = avail[m.id] === false; return '<button type="button" class="btn btn--ghost btn--sm" style="justify-content:space-between" data-add="' + esc(m.id) + '"' + (out ? " disabled" : "") + "><span>" + esc(m.name) + (out ? " · agotado" : "") + "</span><b>" + (m.price == null ? "a confirmar" : money(m.price)) + "</b></button>"; }).join("") || '<p class="muted small">Sin resultados.</p>';
  }
  function renderCart() {
    let sum = 0, pending = false;
    $("#ncart", el).innerHTML = cart.length ? '<table><tbody>' + cart.map((l, i) => { const m = S.menuById[l.id]; if (m.price == null) pending = true; else sum += m.price * l.qty;
      return "<tr><td>" + esc(m.name) + '</td><td><div class="row"><button type="button" class="btn btn--ghost btn--sm" data-q="-1" data-i="' + i + '" aria-label="Quitar uno">−</button><b class="mono">' + l.qty + '</b><button type="button" class="btn btn--ghost btn--sm" data-q="1" data-i="' + i + '" aria-label="Agregar uno">+</button></div></td><td class="num">' + (m.price == null ? "—" : money(m.price * l.qty)) + "</td></tr>"; }).join("") +
      '<tr><td><b>Subtotal</b></td><td></td><td class="num"><b>' + money(sum) + (pending ? " +?" : "") + "</b></td></tr></tbody></table>" : '<p class="muted small">Agregá productos desde la lista.</p>';
  }
  el.addEventListener("click", (e) => {
    const a = e.target.closest("[data-add]");
    if (a) { const l = cart.find((x) => x.id === a.dataset.add); if (l) l.qty = Math.min(50, l.qty + 1); else cart.push({ id: a.dataset.add, qty: 1 }); renderCart(); }
    const b = e.target.closest("[data-q]");
    if (b) { const l = cart[+b.dataset.i]; l.qty += +b.dataset.q; if (l.qty <= 0) cart.splice(+b.dataset.i, 1); renderCart(); }
  });
  $("#msearch", el).addEventListener("input", renderMenu);
  f.store.addEventListener("change", loadAvail);
  const syncSvc = () => ($("#addrBox", el).hidden = f.service.value !== "delivery");
  f.service.addEventListener("change", syncSvc);

  // búsqueda del cliente por celular
  let lookT = null;
  f.phone.addEventListener("input", () => {
    clearTimeout(lookT);
    lookT = setTimeout(async () => {
      const ph = normPhone(f.phone.value);
      customer = null;
      if (!ph) { $("#custInfo", el).textContent = "Escribí el celular: si ya pidió, cargamos su nombre y su última dirección."; return; }
      try {
        const [c] = await q(sb.from("customers").select("id,name,orders_count,last_order_at,blocked,notes,allergies").eq("phone", ph));
        if (!c) { $("#custInfo", el).textContent = "Cliente nuevo ✨"; return; }
        customer = c;
        if (!f.name.value) f.name.value = c.name || "";
        const [a] = await q(sb.from("customer_addresses").select("address,reference").eq("customer_id", c.id).order("last_used_at", { ascending: false }).limit(1));
        if (a && !f.address.value) { f.address.value = a.address; f.reference.value = a.reference || ""; }
        $("#custInfo", el).innerHTML = (c.blocked ? '<span class="pill pill--bad">Bloqueado</span> ' : "") + "<b>" + esc(c.name || "Cliente") + "</b> · " + c.orders_count + " pedido(s)" + (c.allergies ? ' · <span class="pill pill--warn">Alergias: ' + esc(c.allergies) + "</span>" : "") + (c.notes ? " · " + esc(c.notes) : "");
      } catch (e) { $("#custInfo", el).textContent = errMsg(e); }
    }, 350);
  });

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!cart.length) return toast("Agregá al menos un producto", "bad");
    const btn = f.querySelector('[type="submit"]'); btn.disabled = true;
    try {
      const r = await rpc("place_order", { payload: {
        client_ref: "bo-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()), channel: f.channel.value, store: f.store.value, service: f.service.value,
        customer_name: f.name.value.trim() || null, customer_phone: f.phone.value.trim() || null,
        address: f.service.value === "delivery" ? f.address.value.trim() || null : null, reference: f.service.value === "delivery" ? f.reference.value.trim() || null : null,
        scheduled_for: f.when.value || null, payment_method: f.payment.value || null, cash_change_for: f.change.value || null, notes: f.notes.value.trim() || null,
        items: cart.map((l) => ({ id: l.id, qty: l.qty })),
      } });
      toast("Pedido #" + r.order_no + " (" + r.code + ") registrado · " + money(r.total), "ok");
      cart = []; f.reset(); customer = null; renderCart(); syncSvc(); loadAvail();
      $("#custInfo", el).textContent = "Listo. Podés cargar el siguiente.";
    } catch (err) { toast(errMsg(err), "bad"); }
    finally { btn.disabled = false; }
  });
  syncSvc(); renderCart(); await loadAvail();
  if (window.matchMedia("(max-width: 860px)").matches) f.style.gridTemplateColumns = "1fr";
}
