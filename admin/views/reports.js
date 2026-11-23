/* Reportes: rango de fechas + sucursal; KPIs contra metas, gráficos, top productos, cancelaciones y CSV. */
import { sb, S, $, esc, money, dt, STATUS, CHANNEL, SERVICE, isAdmin, myStores, q, rpc, toast, errMsg, localDay, downloadCsv, storeOptions, loading } from "../lib.js";

// Metas de operación (verde si se cumple, ámbar cerca, rojo lejos)
const TARGETS = { avg_prep_min: [15, 20], avg_out_door_min: [20, 25], avg_delivery_min: [40, 50], cancelled_pct: [3, 5], late_pct: [20, 30] };
const tone = (k, v) => (v == null ? "" : v <= TARGETS[k][0] ? "ok" : v <= TARGETS[k][1] ? "warn" : "bad");

export default async function (el) {
  let from = localDay(-6), to = localDay(0), store = isAdmin() ? "" : (S.me.store_id || "");
  el.innerHTML = '<div class="toolbar"><label>Desde<input type="date" id="rFrom" value="' + from + '"></label><label>Hasta<input type="date" id="rTo" value="' + to + '"></label>' +
    (isAdmin() || !S.me.store_id ? '<label>Sucursal<select id="rStore">' + storeOptions(store, true) + "</select></label>" : "") +
    '<div class="row"><button class="btn btn--ghost btn--sm" type="button" data-range="0">Hoy</button><button class="btn btn--ghost btn--sm" type="button" data-range="6">7 días</button><button class="btn btn--ghost btn--sm" type="button" data-range="29">30 días</button></div>' +
    '<button class="btn" type="button" id="rCsv">Exportar pedidos (CSV)</button></div><div id="rOut">' + loading() + "</div>";

  async function load() {
    const out = $("#rOut", el);
    out.innerHTML = loading();
    try {
      const r = await rpc("report_summary", { p_from: from, p_to: to, p_store: store || null });
      const kpi = (label, val, k, raw, goal) => '<div class="card kpi' + (k ? " kpi--" + tone(k, raw) : "") + '"><span>' + esc(label) + "</span><b>" + esc(val) + "</b>" + (goal ? "<small>" + esc(goal) + "</small>" : "") + "</div>";
      const min = (v) => (v == null ? "—" : v + " min");
      out.innerHTML =
        '<div class="cards">' + kpi("Pedidos", r.orders) + kpi("Ventas", money(r.revenue)) + kpi("Ticket promedio", money(r.avg_ticket)) + kpi("Clientes", r.customers || 0) + kpi("Clientes nuevos", r.new_customers || 0) + "</div>" +
        '<div class="cards">' + kpi("Preparación", min(r.avg_prep_min), "avg_prep_min", r.avg_prep_min, "meta ≤ 15 min") + kpi("Salida del local", min(r.avg_out_door_min), "avg_out_door_min", r.avg_out_door_min, "meta ≤ 20 min") +
          kpi("Entrega", min(r.avg_delivery_min), "avg_delivery_min", r.avg_delivery_min, "meta ≤ 40 min") + kpi("Cancelados", r.cancelled + " (" + r.cancelled_pct + "%)", "cancelled_pct", r.cancelled_pct, "meta < 3%") +
          kpi("Entregas tarde (> 45 min)", r.late_pct == null ? "—" : r.late_pct + "%", "late_pct", r.late_pct, "meta < 20%") + "</div>" +
        (r.orders ? '<div class="charts">' +
          chart("Pedidos por día", columns(fillDays(r.by_day))) +
          chart("Pedidos por hora", columns(fillHours(r.by_hour))) +
          chart("Ventas por sucursal", bars(r.by_store.map((s) => ({ k: s.store, v: Number(s.revenue), label: money(s.revenue), t: s.orders + " pedidos" })))) +
          chart("Pedidos por canal", bars(r.by_channel.map((c) => ({ k: CHANNEL[c.channel] || c.channel, v: c.orders, label: String(c.orders), t: money(c.revenue) })))) +
          chart("Pedidos por servicio", bars(r.by_service.map((c) => ({ k: SERVICE[c.service] || c.service, v: c.orders, label: String(c.orders), t: money(c.revenue) })))) +
          chart("Top productos", bars(r.top_items.map((i) => ({ k: i.name, v: i.qty, label: "×" + i.qty, t: money(i.revenue) })))) +
          (r.cancel_reasons.length ? chart("Motivos de cancelación", bars(r.cancel_reasons.map((c) => ({ k: c.label, v: c.count, label: String(c.count) })))) : "") +
        "</div>" : '<div class="card empty">No hay pedidos en ese rango.</div>');
    } catch (e) { out.innerHTML = '<div class="card empty">' + esc(errMsg(e)) + "</div>"; }
  }
  const chart = (title, svg) => '<div class="card chart"><h3>' + esc(title) + "</h3>" + svg + "</div>";
  function fillDays(rows) {
    const m = Object.fromEntries(rows.map((r) => [r.day, r])), out = [];
    for (let d = new Date(from + "T12:00:00Z"); d <= new Date(to + "T12:00:00Z") && out.length < 92; d.setUTCDate(d.getUTCDate() + 1)) {
      const k = d.toISOString().slice(0, 10), x = m[k];
      out.push({ k: k.slice(8, 10) + "/" + k.slice(5, 7), v: x ? x.orders : 0, t: k.slice(8, 10) + "/" + k.slice(5, 7) + ": " + (x ? x.orders + " pedidos · " + money(x.revenue) : "sin pedidos") });
    }
    return out;
  }
  function fillHours(rows) { const m = Object.fromEntries(rows.map((r) => [r.hour, r.orders])); const hs = rows.map((r) => r.hour); const a = Math.min(...hs, 10), b = Math.max(...hs, 23); const out = []; for (let h = a; h <= b; h++) out.push({ k: String(h), v: m[h] || 0, t: h + ":00–" + h + ":59 · " + (m[h] || 0) + " pedidos" }); return out; }

  // Columnas verticales (una serie): extremo de datos redondeado, anclado a la base, 2 px entre barras.
  function columns(data) {
    if (!data.length) return '<p class="muted small">Sin datos.</p>';
    const W = 320, H = 150, pad = 18, max = Math.max(...data.map((d) => d.v), 1), bw = (W - 8) / data.length;
    const every = Math.ceil(data.length / 12);
    return '<svg viewBox="0 0 ' + W + " " + (H + pad) + '" role="img" aria-label="Gráfico de columnas">' +
      '<line x1="0" x2="' + W + '" y1="' + H + '" y2="' + H + '" stroke="#e3d29c" stroke-width="1"/>' +
      data.map((d, i) => {
        const h = Math.max(d.v ? 2 : 0, (d.v / max) * (H - 16)), x = 4 + i * bw + 1, w = Math.max(2, bw - 2), y = H - h, r = Math.min(4, w / 2, h);
        const path = h ? "M" + x + "," + H + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y + "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + H + "Z" : "";
        return "<g><title>" + esc(d.t || d.k + ": " + d.v) + '</title><rect x="' + (x - 1) + '" y="0" width="' + bw + '" height="' + H + '" fill="transparent"/>' + (path ? '<path d="' + path + '" fill="var(--red)"/>' : "") +
          (i % every === 0 ? '<text x="' + (x + w / 2) + '" y="' + (H + 12) + '" text-anchor="middle">' + esc(d.k) + "</text>" : "") + "</g>";
      }).join("") +
      '<text class="v" x="2" y="10">máx. ' + max + "</text></svg>";
  }
  // Barras horizontales con etiqueta directa del valor.
  function bars(data) {
    if (!data.length) return '<p class="muted small">Sin datos.</p>';
    const max = Math.max(...data.map((d) => d.v), 1);
    return '<div class="hbar">' + data.map((d) => '<div title="' + esc(d.k + (d.t ? " · " + d.t : "")) + '"><span>' + esc(d.k) + '</span><i style="width:' + Math.max(1, (d.v / max) * 100) + '%"></i><span>' + esc(d.label) + "</span></div>").join("") + "</div>";
  }

  el.addEventListener("change", (e) => {
    if (e.target.id === "rFrom") from = e.target.value;
    if (e.target.id === "rTo") to = e.target.value;
    if (e.target.id === "rStore") store = e.target.value;
    if (from && to) load();
  });
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-range]");
    if (b) { from = localDay(-+b.dataset.range); to = localDay(0); $("#rFrom", el).value = from; $("#rTo", el).value = to; load(); return; }
    if (e.target.id === "rCsv") {
      try {
        let oq = sb.from("orders").select("*").gte("business_day", from).lte("business_day", to).order("created_at").limit(10000);
        if (store) oq = oq.eq("store_id", store);
        const rows = await q(oq);
        downloadCsv("pedidos-" + from + "-a-" + to + ".csv", [["Fecha", "Código", "N° día", "Sucursal", "Canal", "Servicio", "Estado", "Cliente", "Celular", "Subtotal", "Delivery", "Descuento", "Total", "Pago", "Estado pago", "Motivo cancelación"]]
          .concat(rows.map((o) => [dt(o.created_at), o.code, o.order_no, (S.storeById[o.store_id] || {}).name, CHANNEL[o.channel], SERVICE[o.service], STATUS[o.status], o.customer_name, o.customer_phone, o.subtotal, o.delivery_fee, o.discount, o.total, o.payment_method, o.payment_status, o.cancel_reason])));
      } catch (err) { toast(errMsg(err), "bad"); }
    }
  });
  if (!myStores().length) { el.innerHTML = '<div class="card empty">Sin sucursal asignada.</div>'; return; }
  await load();
}
