/* Pedidos: tablero en vivo por sucursal (kanban), aviso sonoro, detalle del pedido. */
import { sb, S, $, esc, money, hhmm, dt, minsSince, phoneFmt, STATUS, FLOW, CHANNEL, SERVICE, PAYMENT, PAY_STATUS, stPill, nextStep, isRole, isAdmin, myStores,
  q, rpc, toast, errMsg, openDrawer, closeDrawer, openModal, options, storeOptions } from "../lib.js";

const COLS = ["new", "confirmed", "preparing", "cooking", "ready", "out_for_delivery"];
const PREF = "pr-admin-orders-store";

export default async function (el, ctx) {
  const stores = myStores();
  let store = (() => { try { return localStorage.getItem(PREF); } catch (e) { return null; } })();
  if (store !== "" && !stores.some((s) => s.id === store)) store = isAdmin() ? "" : (stores[0] && stores[0].id) || "";
  let orders = [], items = {}, known = null, newIds = new Set(), audioCtx = null, timer = null, poll = null, baseTitle = document.title;

  el.innerHTML =
    '<div class="toolbar"><label>Sucursal<select id="oStore">' + storeOptions(store, isAdmin() || stores.length > 1) + "</select></label>" +
    '<label class="check"><input type="checkbox" id="oSound" checked> Sonido</label>' +
    '<span class="muted small" id="oInfo"></span></div><div class="board" id="board"></div>';
  $("#oStore", el).addEventListener("change", (e) => { store = e.target.value; try { localStorage.setItem(PREF, store); } catch (x) {} known = null; load(); });

  // El audio se habilita con el primer toque (regla de los navegadores).
  const unlock = () => { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) {} };
  document.addEventListener("pointerdown", unlock, { once: true });
  function beep() {
    if (!$("#oSound", el) || !$("#oSound", el).checked || !audioCtx) return;
    [0, 0.22].forEach((t) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "square"; o.frequency.value = 880; g.gain.value = 0.08;
      o.connect(g); g.connect(audioCtx.destination); o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + 0.14);
    });
  }

  async function load() {
    try {
      let query = sb.from("orders").select("*").in("status", COLS).order("created_at", { ascending: true }).limit(300);
      if (store) query = query.eq("store_id", store);
      const rows = await q(query);
      const ids = rows.map((o) => o.id);
      items = {};
      if (ids.length) (await q(sb.from("order_items").select("order_id,name,qty,notes").in("order_id", ids))).forEach((i) => (items[i.order_id] = items[i.order_id] || []).push(i));
      // pedidos nuevos desde la última carga
      if (known) {
        const fresh = rows.filter((o) => o.status === "new" && !known.has(o.id));
        if (fresh.length) {
          fresh.forEach((o) => newIds.add(o.id));
          beep();
          if (document.hidden && window.Notification && Notification.permission === "granted") new Notification("Pizza Río: " + fresh.length + " pedido(s) nuevo(s)", { body: fresh.map((o) => "#" + o.order_no + " " + (o.customer_name || "")).join(", "), tag: "pr-new" });
        }
      }
      known = new Set(rows.map((o) => o.id));
      orders = rows;
      render();
    } catch (e) { $("#board", el).innerHTML = '<div class="card empty">' + esc(errMsg(e)) + "</div>"; }
  }

  function render() {
    const nNew = orders.filter((o) => o.status === "new").length;
    ctx.setBadge("pedidos", nNew);
    document.title = (nNew ? "(" + nNew + ") " : "") + "Pedidos · Pizza Río";
    $("#oInfo", el).textContent = orders.length + " en curso · actualizado " + hhmm(new Date().toISOString());
    $("#board", el).innerHTML = COLS.map((c) => {
      const list = orders.filter((o) => o.status === c);
      return '<section class="col" aria-label="' + esc(STATUS[c]) + '"><h3>' + esc(STATUS[c]) + "<span>" + list.length + "</span></h3>" + (list.map(card).join("") || '<p class="muted small" style="padding:0 6px">—</p>') + "</section>";
    }).join("");
    newIds.clear();
  }
  function card(o) {
    const age = minsSince(o.created_at), cls = age < 10 ? "g" : age < 20 ? "a" : "r";
    const nx = nextStep(o, S.me.role);
    const its = (items[o.id] || []).map((i) => "<li>" + esc(i.qty) + "× " + esc(i.name) + (i.notes ? " <em>(" + esc(i.notes) + ")</em>" : "") + "</li>").join("");
    return '<article class="ocard' + (newIds.has(o.id) ? " is-new" : "") + '" style="--c:var(--st-' + o.status + ')" data-id="' + o.id + '" tabindex="0">' +
      '<div class="ocard__top"><span class="ocard__no">#' + esc(o.order_no) + ' <span class="ocard__code">' + esc(o.code) + '</span></span><span class="age age--' + cls + '" title="Minutos desde que entró">' + age + " min</span></div>" +
      '<div class="row"><span class="pill">' + esc(SERVICE[o.service]) + '</span><span class="pill">' + esc(CHANNEL[o.channel]) + "</span>" + (o.scheduled_for ? '<span class="pill pill--warn">🕒 ' + hhmm(o.scheduled_for) + "</span>" : "") + (!store ? '<span class="pill">' + esc((S.storeById[o.store_id] || {}).name) + "</span>" : "") + "</div>" +
      (o.possible_duplicate ? '<span class="dup">⚠ Posible duplicado</span>' : "") +
      "<div><b>" + esc(o.customer_name || "Sin nombre") + "</b></div><ul>" + its + "</ul>" +
      '<div class="ocard__foot"><b>' + money(o.total) + (o.price_pending ? " +?" : "") + "</b>" + (o.payment_status === "paid" ? '<span class="pill pill--ok">Pagado</span>' : "") + "</div>" +
      (nx ? '<button class="btn btn--red next" type="button" data-next="' + nx[0] + '">' + esc(nx[1]) + "</button>" : "") + "</article>";
  }

  async function setStatus(id, status, note, reason) {
    try { await rpc("set_order_status", { p_order: id, p_status: status, p_note: note || null, p_cancel_reason: reason || null }); toast(STATUS[status] + " ✓", "ok"); await load(); return true; }
    catch (e) { toast(errMsg(e), "bad"); return false; }
  }

  el.addEventListener("click", (e) => {
    const nb = e.target.closest("[data-next]");
    if (nb) { e.stopPropagation(); nb.disabled = true; setStatus(nb.closest(".ocard").dataset.id, nb.dataset.next).finally(() => (nb.disabled = false)); return; }
    const c = e.target.closest(".ocard"); if (c) detail(c.dataset.id);
  });
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.classList.contains("ocard")) detail(e.target.dataset.id); });

  /* ---------- detalle ---------- */
  async function detail(id) {
    const body = openDrawer("Pedido", '<div class="skel"></div><div class="skel"></div>');
    try {
      const [o] = await q(sb.from("orders").select("*").eq("id", id));
      if (!o) throw new Error("order_not_found");
      const [its, evs] = await Promise.all([
        q(sb.from("order_items").select("*").eq("order_id", id)),
        q(sb.from("order_events").select("*").eq("order_id", id).order("created_at")),
      ]);
      let riders = [];
      if (o.service === "delivery" && isRole("owner", "admin", "manager", "cashier")) riders = await q(sb.from("staff").select("user_id,full_name,store_id").eq("role", "rider").eq("active", true));
      riders = riders.filter((r) => !r.store_id || r.store_id === o.store_id);
      const st = S.storeById[o.store_id] || {};
      const track = location.origin + "/sigue-tu-pizza/?t=" + o.tracking_token;
      const maps = o.lat != null ? "https://maps.google.com/?q=" + o.lat + "," + o.lng : o.address ? "https://maps.google.com/?q=" + encodeURIComponent(o.address + ", Santa Cruz de la Sierra") : null;
      const mgr = isRole("owner", "admin", "manager");
      const canEdit = isRole("owner", "admin", "manager", "cashier");
      const nx = nextStep(o, S.me.role);
      $("#drawerTitle").textContent = "#" + o.order_no + " · " + o.code;
      body.innerHTML =
        '<div class="row">' + stPill(o.status) + '<span class="pill">' + esc(SERVICE[o.service]) + '</span><span class="pill">' + esc(CHANNEL[o.channel]) + '</span><span class="pill">' + esc(st.name) + "</span>" + (o.possible_duplicate ? '<span class="pill pill--bad">⚠ Posible duplicado</span>' : "") + "</div>" +
        (nx ? '<button class="btn btn--red btn--lg btn--block" data-d-next="' + nx[0] + '">' + esc(nx[1]) + "</button>" : "") +
        '<div class="card"><table><tbody>' + its.map((i) => "<tr><td>" + esc(i.qty) + "×</td><td>" + esc(i.name) + (i.notes ? '<br><small class="muted">' + esc(i.notes) + "</small>" : "") + '</td><td class="num">' + (i.line_total == null ? "a confirmar" : money(i.line_total)) + "</td></tr>").join("") +
        '<tr><td></td><td>Subtotal</td><td class="num">' + money(o.subtotal) + "</td></tr>" + (Number(o.delivery_fee) ? '<tr><td></td><td>Delivery</td><td class="num">' + money(o.delivery_fee) + "</td></tr>" : "") + (Number(o.discount) ? '<tr><td></td><td>Descuento</td><td class="num">−' + money(o.discount) + "</td></tr>" : "") +
        '<tr><td></td><td><b>Total</b></td><td class="num"><b>' + money(o.total) + "</b>" + (o.price_pending ? '<br><small class="muted">+ precios a confirmar</small>' : "") + "</td></tr></tbody></table></div>" +
        '<dl class="kv"><dt>Cliente</dt><dd>' + esc(o.customer_name || "—") + "</dd><dt>Celular</dt><dd>" + (o.customer_phone ? esc(phoneFmt(o.customer_phone)) : "—") + "</dd>" +
        (o.service === "delivery" ? "<dt>Dirección</dt><dd>" + esc(o.address || "📌 Ubicación compartida") + (o.reference ? "<br><small>" + esc(o.reference) + "</small>" : "") + (maps ? '<br><a href="' + esc(maps) + '" target="_blank" rel="noopener">Abrir en Maps ↗</a>' : "") + "</dd>" : "") +
        "<dt>Entró</dt><dd>" + dt(o.created_at) + " (" + minsSince(o.created_at) + " min)</dd>" + (o.scheduled_for ? "<dt>Programado</dt><dd>" + dt(o.scheduled_for) + "</dd>" : "") +
        (o.notes ? "<dt>Nota</dt><dd>" + esc(o.notes) + "</dd>" : "") + (o.cancel_reason ? "<dt>Cancelación</dt><dd>" + esc((S.reasonByCode[o.cancel_reason] || {}).label || o.cancel_reason) + "</dd>" : "") + "</dl>" +
        '<div class="row">' + (o.customer_phone ? '<a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="https://wa.me/' + esc(o.customer_phone.replace("+", "")) + "?text=" + encodeURIComponent("Hola " + (o.customer_name || "") + ", te escribimos de Pizza Río " + st.name + " por tu pedido " + o.code + ".") + '">WhatsApp al cliente</a>' : "") +
        '<button class="btn btn--ghost btn--sm" type="button" data-copy="' + esc(track) + '">Copiar link de seguimiento</button></div>' +
        (canEdit ? '<form class="card grid2" id="payForm"><label>Pago<select name="payment_method"><option value="">—</option>' + options(PAYMENT, o.payment_method) + '</select></label><label>Estado del pago<select name="payment_status">' + options(PAY_STATUS, o.payment_status) + "</select></label>" +
          (o.service === "delivery" ? '<label>Repartidor<select name="rider_id"><option value="">—</option>' + riders.map((r) => '<option value="' + r.user_id + '"' + (r.user_id === o.rider_id ? " selected" : "") + ">" + esc(r.full_name) + "</option>").join("") + "</select></label>" : "") +
          '<label>Nota interna<input name="notes" value="' + esc(o.notes || "") + '"></label><button class="btn btn--sm" type="submit">Guardar cambios</button></form>' : "") +
        "<div><h3>Historial</h3><ol class=\"tl\">" + evs.map((e) => "<li><time>" + hhmm(e.created_at) + "</time>" + stPill(e.status) + (e.note ? " <small>" + esc(e.note) + "</small>" : "") + "</li>").join("") + "</ol></div>" +
        '<div class="row">' + (mgr && o.status !== "new" ? '<button class="btn btn--ghost btn--sm" type="button" data-recall>Volver a un estado anterior</button>' : "") +
        (o.status !== "cancelled" && o.status !== "delivered" && (mgr || ["new", "confirmed"].includes(o.status)) && isRole("owner", "admin", "manager", "cashier") ? '<button class="btn btn--ghost btn--sm" type="button" data-cancel style="color:var(--red)">Cancelar pedido</button>' : "") + "</div>";

      const dn = $("[data-d-next]", body);
      if (dn) dn.addEventListener("click", async () => { dn.disabled = true; if (await setStatus(o.id, dn.dataset.dNext)) detail(o.id); else dn.disabled = false; });
      $("[data-copy]", body).addEventListener("click", (e) => { navigator.clipboard.writeText(e.currentTarget.dataset.copy).then(() => toast("Link copiado"), () => toast(track)); });
      const pf = $("#payForm", body);
      if (pf) pf.addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = new FormData(pf), patch = { payment_method: f.get("payment_method") || null, payment_status: f.get("payment_status"), notes: String(f.get("notes") || "").trim() || null };
        if (f.has("rider_id")) patch.rider_id = f.get("rider_id") || null;
        try { await q(sb.from("orders").update(patch).eq("id", o.id)); toast("Guardado", "ok"); load(); } catch (err) { toast(errMsg(err), "bad"); }
      });
      const rc = $("[data-recall]", body);
      if (rc) rc.addEventListener("click", () => {
        const prev = FLOW.filter((s) => FLOW.indexOf(s) < (o.status === "cancelled" ? 99 : FLOW.indexOf(o.status)) && (s !== "out_for_delivery" || o.service === "delivery"));
        openModal("Volver atrás #" + o.order_no, '<label>Nuevo estado<select name="st">' + prev.map((s) => '<option value="' + s + '">' + esc(STATUS[s]) + "</option>").join("") + '</select></label><label>Motivo<input name="note" required placeholder="Ej. se reabre por error de cocina"></label>',
          async (f) => { if (await setStatus(o.id, f.get("st"), f.get("note"))) detail(o.id); else return false; }, "Volver atrás");
      });
      const cb = $("[data-cancel]", body);
      if (cb) cb.addEventListener("click", () => {
        openModal("Cancelar #" + o.order_no, '<label>Motivo<select name="reason" required><option value="">Elegí…</option>' + S.reasons.map((r) => '<option value="' + esc(r.code) + '">' + esc(r.label) + "</option>").join("") + '</select></label><label>Nota<input name="note" placeholder="Obligatoria si el motivo es «Otro»"></label>',
          async (f) => { if (await setStatus(o.id, "cancelled", f.get("note"), f.get("reason"))) closeDrawer(); else return false; }, "Cancelar pedido");
      });
    } catch (e) { body.innerHTML = '<p class="empty">' + esc(errMsg(e)) + "</p>"; }
  }

  // tiempo real + refresco al volver + respaldo cada 60 s
  const refresh = () => { clearTimeout(timer); timer = setTimeout(load, 300); };
  ctx.channel("orders", ["orders"], refresh);
  poll = setInterval(load, 60000);
  const tick = setInterval(() => { if (orders.length) render(); }, 30000); // los minutos avanzan
  const onVis = () => { if (!document.hidden) load(); };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("online", load);
  if (window.Notification && Notification.permission === "default") document.addEventListener("pointerdown", () => Notification.requestPermission().catch(() => {}), { once: true });
  ctx.onCleanup(() => { clearInterval(poll); clearInterval(tick); clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", load); document.removeEventListener("pointerdown", unlock); document.title = baseTitle; });
  await load();
}
