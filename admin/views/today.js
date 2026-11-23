/* Hoy: KPIs del día, pedidos por estado, estado de cada sucursal y últimos pedidos. */
import { sb, S, $, esc, money, hhmm, STATUS, CHANNEL, stPill, storeState, myStores, isAdmin, q, rpc, errMsg, localDay, loading } from "../lib.js";

export default async function (el, ctx) {
  el.innerHTML = loading();
  let timer = null;
  async function load() {
    try {
      const day = localDay(0);
      const scope = isAdmin() ? null : S.me.store_id;
      let oq = sb.from("orders").select("id,code,order_no,status,store_id,customer_name,total,channel,service,created_at").eq("business_day", day).order("created_at", { ascending: false }).limit(500);
      if (scope) oq = oq.eq("store_id", scope);
      const [rep, orders, stores] = await Promise.all([
        rpc("report_summary", { p_from: day, p_to: day, p_store: scope }),
        q(oq),
        q(sb.from("stores").select("*").order("sort")),
      ]);
      const counts = {};
      orders.forEach((o) => (counts[o.status] = (counts[o.status] || 0) + 1));
      const mine = new Set(myStores().map((s) => s.id));
      el.innerHTML =
        '<div class="cards">' +
          kpi("Pedidos", rep.orders) + kpi("Ventas", money(rep.revenue)) + kpi("Ticket promedio", money(rep.avg_ticket)) +
          kpi("Cancelados", rep.cancelled + " (" + rep.cancelled_pct + "%)", rep.cancelled_pct >= 3 ? "bad" : "ok") +
          kpi("Clientes nuevos", rep.new_customers || 0) +
        "</div>" +
        '<div class="section"><h2>En curso ahora</h2><a class="btn btn--sm" href="#/pedidos">Ir al tablero →</a></div>' +
        '<div class="row">' + ["new", "confirmed", "preparing", "cooking", "ready", "out_for_delivery", "delivered", "cancelled"].map((s) => stPill(s) + ' <b class="mono">' + (counts[s] || 0) + "</b>&nbsp;&nbsp;").join("") + "</div>" +
        '<div class="section"><h2>Sucursales</h2><a class="btn btn--ghost btn--sm" href="#/sucursales">Gestionar</a></div>' +
        '<div class="tablewrap"><table><thead><tr><th>Sucursal</th><th>Estado</th><th>Horario</th><th class="num">Pedidos hoy</th></tr></thead><tbody>' +
        stores.filter((s) => s.active && mine.has(s.id)).map((s) => { const x = storeState(s); return "<tr><td>" + esc(s.name) + '</td><td><span class="pill ' + x.cls + '">' + esc(x.label) + "</span>" + (s.pause_reason && x.k === "paused" ? ' <small class="muted">' + esc(s.pause_reason) + "</small>" : "") + "</td><td>" + (s.open_time ? s.open_time.slice(0, 5) + "–" + s.close_time.slice(0, 5) : '<span class="muted">no publicado</span>') + '</td><td class="num">' + orders.filter((o) => o.store_id === s.id).length + "</td></tr>"; }).join("") +
        "</tbody></table></div>" +
        '<div class="section"><h2>Últimos pedidos</h2></div>' +
        (orders.length ? '<div class="tablewrap"><table><thead><tr><th>Hora</th><th>#</th><th>Cliente</th><th>Sucursal</th><th>Canal</th><th>Estado</th><th class="num">Total</th></tr></thead><tbody>' +
          orders.slice(0, 12).map((o) => "<tr><td>" + hhmm(o.created_at) + "</td><td>#" + esc(o.order_no) + ' <small class="muted">' + esc(o.code) + "</small></td><td>" + esc(o.customer_name || "—") + "</td><td>" + esc((S.storeById[o.store_id] || {}).name) + "</td><td>" + esc(CHANNEL[o.channel]) + "</td><td>" + stPill(o.status) + '</td><td class="num">' + money(o.total) + "</td></tr>").join("") +
          "</tbody></table></div>" : '<div class="card empty">Todavía no hay pedidos hoy.</div>');
    } catch (e) { el.innerHTML = '<div class="card empty">' + esc(errMsg(e)) + "</div>"; }
  }
  const kpi = (label, val, tone) => '<div class="card kpi' + (tone ? " kpi--" + tone : "") + '"><span>' + esc(label) + "</span><b>" + esc(val) + "</b></div>";
  ctx.channel("today", ["orders", "stores"], () => { clearTimeout(timer); timer = setTimeout(load, 800); });
  const poll = setInterval(load, 60000);
  ctx.onCleanup(() => { clearInterval(poll); clearTimeout(timer); });
  await load();
}
