/* Clientes (CRM): segmentos, búsqueda, filtros, exportar y ficha editable. */
import { sb, S, $, esc, money, dmy, dt, phoneFmt, stPill, q, toast, errMsg, openDrawer, downloadCsv, loading } from "../lib.js";

const SEG = { vip: "VIP", frequent: "Frecuente", at_risk: "En riesgo", new: "Nuevo", occasional: "Ocasional", lost: "Perdido", none: "Sin pedidos" };
const SEG_CLS = { vip: "pill--ok", frequent: "pill--ok", at_risk: "pill--warn", new: "", occasional: "", lost: "pill--bad", none: "" };
const VIP_MIN = 1000; // Bs gastados para ser VIP (o el 10% que más gastó)

export default async function (el) {
  el.innerHTML = loading();
  let rows = [], vipCut = Infinity;
  const state = { seg: "", text: "", tag: "", store: "", optin: "", sort: "last" };
  const days = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity);
  function segment(c) {
    if (!c.orders_count) return "none";
    const d = days(c.last_order_at);
    if (c.total_spent >= VIP_MIN || c.total_spent >= vipCut) return "vip";
    if (d > 60) return "lost";
    if (c.orders_count >= 3 && d < 30) return "frequent";
    if (c.orders_count >= 2 && d >= 30) return "at_risk";
    if (c.orders_count === 1) return "new";
    return "occasional";
  }

  async function load() {
    try {
      rows = await q(sb.from("customers").select("*").order("last_order_at", { ascending: false, nullsFirst: false }).limit(2000));
      const spent = rows.map((c) => Number(c.total_spent)).filter((x) => x > 0).sort((a, b) => b - a);
      vipCut = spent.length >= 10 ? spent[Math.floor(spent.length * 0.1) - 1] : Infinity;
      rows.forEach((c) => (c.seg = segment(c)));
      render();
    } catch (e) { el.innerHTML = '<div class="card empty">' + esc(errMsg(e)) + "</div>"; }
  }
  function filtered() {
    const t = state.text.toLowerCase().replace(/\s/g, "");
    let list = rows.filter((c) => (!state.seg || c.seg === state.seg) && (!state.tag || (c.tags || []).includes(state.tag)) && (!state.store || c.preferred_store === state.store) &&
      (!state.optin || String(c.marketing_opt_in) === state.optin) && (!t || (c.name || "").toLowerCase().replace(/\s/g, "").includes(t) || (c.phone || "").includes(t)));
    const by = { last: (a, b) => (b.last_order_at || "").localeCompare(a.last_order_at || ""), spent: (a, b) => b.total_spent - a.total_spent, orders: (a, b) => b.orders_count - a.orders_count, name: (a, b) => (a.name || "").localeCompare(b.name || "") };
    return list.sort(by[state.sort]);
  }
  function render() {
    const counts = {}; rows.forEach((c) => (counts[c.seg] = (counts[c.seg] || 0) + 1));
    const tags = [...new Set(rows.flatMap((c) => c.tags || []))].sort();
    const list = filtered();
    el.innerHTML =
      '<div class="tabs" role="group" aria-label="Segmentos"><button type="button" data-seg="" aria-pressed="' + !state.seg + '">Todos ' + rows.length + "</button>" +
      Object.keys(SEG).map((k) => '<button type="button" data-seg="' + k + '" aria-pressed="' + (state.seg === k) + '">' + SEG[k] + " " + (counts[k] || 0) + "</button>").join("") + "</div>" +
      '<div class="toolbar"><label>Buscar<input id="cText" value="' + esc(state.text) + '" placeholder="Nombre o celular"></label>' +
      '<label>Etiqueta<select id="cTag"><option value="">Todas</option>' + tags.map((t) => "<option" + (t === state.tag ? " selected" : "") + ">" + esc(t) + "</option>").join("") + "</select></label>" +
      '<label>Sucursal preferida<select id="cStore"><option value="">Todas</option>' + S.stores.map((s) => '<option value="' + s.id + '"' + (s.id === state.store ? " selected" : "") + ">" + esc(s.name) + "</option>").join("") + "</select></label>" +
      '<label>Promos<select id="cOpt"><option value="">Todos</option><option value="true"' + (state.optin === "true" ? " selected" : "") + '>Acepta</option><option value="false"' + (state.optin === "false" ? " selected" : "") + ">No acepta</option></select></label>" +
      '<label>Orden<select id="cSort"><option value="last">Último pedido</option><option value="spent">Más gastó</option><option value="orders">Más pedidos</option><option value="name">Nombre</option></select></label>' +
      '<button class="btn btn--ghost" type="button" id="cCsv">Exportar CSV</button></div>' +
      (list.length ? '<div class="tablewrap"><table><thead><tr><th>Cliente</th><th>Celular</th><th>Segmento</th><th class="num">Pedidos</th><th class="num">Gastó</th><th>Último</th><th>Sucursal</th></tr></thead><tbody>' +
        list.slice(0, 500).map((c) => '<tr class="click" data-id="' + c.id + '" tabindex="0"><td>' + esc(c.name || "—") + (c.blocked ? ' <span class="pill pill--bad">Bloqueado</span>' : "") + (c.tags || []).map((t) => ' <span class="pill">' + esc(t) + "</span>").join("") + "</td><td>" + esc(phoneFmt(c.phone)) + '</td><td><span class="pill ' + SEG_CLS[c.seg] + '">' + SEG[c.seg] + '</span></td><td class="num">' + c.orders_count + '</td><td class="num">' + money(c.total_spent) + "</td><td>" + dmy(c.last_order_at) + "</td><td>" + esc((S.storeById[c.preferred_store] || {}).name || "") + "</td></tr>").join("") +
        "</tbody></table></div>" + (list.length > 500 ? '<p class="muted small">Mostrando 500 de ' + list.length + ". Usá la búsqueda o exportá el CSV.</p>" : "") : '<div class="card empty">No hay clientes con ese filtro.</div>');
    $("#cSort", el).value = state.sort;
  }
  el.addEventListener("click", (e) => {
    const s = e.target.closest("[data-seg]"); if (s) { state.seg = s.dataset.seg; render(); return; }
    if (e.target.id === "cCsv") {
      downloadCsv("clientes-pizza-rio.csv", [["Nombre", "Celular", "Segmento", "Pedidos", "Gastó (Bs)", "Primer pedido", "Último pedido", "Sucursal preferida", "Etiquetas", "Acepta promos", "Email", "Cumpleaños"]]
        .concat(filtered().map((c) => [c.name, c.phone, SEG[c.seg], c.orders_count, c.total_spent, dmy(c.first_order_at), dmy(c.last_order_at), (S.storeById[c.preferred_store] || {}).name, (c.tags || []).join(" "), c.marketing_opt_in ? "sí" : "no", c.email, c.birthday])));
      return;
    }
    const r = e.target.closest("tr[data-id]"); if (r) profile(r.dataset.id);
  });
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("tr[data-id]")) profile(e.target.dataset.id); });
  el.addEventListener("input", (e) => { if (e.target.id === "cText") { state.text = e.target.value; const pos = e.target.selectionStart; render(); const i = $("#cText", el); i.focus(); i.setSelectionRange(pos, pos); } });
  el.addEventListener("change", (e) => { const k = { cTag: "tag", cStore: "store", cOpt: "optin", cSort: "sort" }[e.target.id]; if (k) { state[k] = e.target.value; render(); } });

  async function profile(id) {
    const c = rows.find((x) => x.id === id); if (!c) return;
    const body = openDrawer(c.name || phoneFmt(c.phone), loading());
    try {
      const [orders, addrs] = await Promise.all([
        q(sb.from("orders").select("id,code,order_no,status,store_id,total,created_at,channel").eq("customer_id", id).order("created_at", { ascending: false }).limit(50)),
        q(sb.from("customer_addresses").select("*").eq("customer_id", id).order("last_used_at", { ascending: false })),
      ]);
      const fav = {};
      if (orders.length) (await q(sb.from("order_items").select("name,qty,order_id").in("order_id", orders.filter((o) => o.status !== "cancelled").map((o) => o.id)))).forEach((i) => (fav[i.name] = (fav[i.name] || 0) + i.qty));
      const favs = Object.entries(fav).sort((a, b) => b[1] - a[1]).slice(0, 5);
      body.innerHTML =
        '<div class="cards" style="margin:0"><div class="card kpi"><span>Pedidos</span><b>' + c.orders_count + '</b></div><div class="card kpi"><span>Gastó</span><b>' + money(c.total_spent) + '</b></div><div class="card kpi"><span>Segmento</span><b style="font-size:1.1rem">' + SEG[c.seg] + "</b></div></div>" +
        '<dl class="kv"><dt>Celular</dt><dd><a href="https://wa.me/' + esc(c.phone.replace("+", "")) + '" target="_blank" rel="noopener">' + esc(phoneFmt(c.phone)) + "</a></dd><dt>Cliente desde</dt><dd>" + dmy(c.first_order_at || c.created_at) + "</dd>" + (c.nit ? "<dt>NIT/CI</dt><dd>" + esc(c.nit) + (c.razon_social ? " · " + esc(c.razon_social) : "") + "</dd>" : "") + "</dl>" +
        (favs.length ? "<div><h3>Favoritos</h3><p>" + favs.map(([n, k]) => esc(n) + " <b>×" + k + "</b>").join(" · ") + "</p></div>" : "") +
        '<form class="card" id="cForm" style="display:grid;gap:10px"><div class="grid2"><label>Nombre<input name="name" value="' + esc(c.name || "") + '"></label><label>Email<input name="email" type="email" value="' + esc(c.email || "") + '"></label><label>Cumpleaños<input name="birthday" type="date" value="' + esc(c.birthday || "") + '"></label><label>Etiquetas (separadas por coma)<input name="tags" value="' + esc((c.tags || []).join(", ")) + '"></label></div>' +
        '<label>Alergias<input name="allergies" value="' + esc(c.allergies || "") + '"></label><label>Notas<textarea name="notes" rows="2">' + esc(c.notes || "") + "</textarea></label>" +
        '<label class="check"><input type="checkbox" name="optin"' + (c.marketing_opt_in ? " checked" : "") + '> Acepta recibir promos</label><label class="check"><input type="checkbox" name="blocked"' + (c.blocked ? " checked" : "") + "> Bloqueado (no puede pedir en línea)</label>" +
        '<button class="btn" type="submit">Guardar</button></form>' +
        (addrs.length ? "<div><h3>Direcciones</h3><ul>" + addrs.map((a) => "<li>" + esc(a.address) + (a.reference ? " <small class=\"muted\">(" + esc(a.reference) + ")</small>" : "") + "</li>").join("") + "</ul></div>" : "") +
        "<div><h3>Pedidos</h3>" + (orders.length ? '<table><tbody>' + orders.map((o) => "<tr><td>" + dt(o.created_at) + "</td><td>" + esc(o.code) + "</td><td>" + esc((S.storeById[o.store_id] || {}).name) + "</td><td>" + stPill(o.status) + '</td><td class="num">' + money(o.total) + "</td></tr>").join("") + "</tbody></table>" : '<p class="muted">Sin pedidos.</p>') + "</div>";
      $("#cForm", body).addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const patch = { name: f.get("name").trim() || null, email: f.get("email").trim() || null, birthday: f.get("birthday") || null, allergies: f.get("allergies").trim() || null, notes: f.get("notes").trim() || null,
          tags: f.get("tags").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean), marketing_opt_in: f.has("optin"), blocked: f.has("blocked") };
        if (patch.marketing_opt_in && !c.marketing_opt_in) { patch.opt_in_at = new Date().toISOString(); patch.opt_in_source = "backoffice"; }
        try { await q(sb.from("customers").update(patch).eq("id", id)); Object.assign(c, patch); c.seg = segment(c); toast("Cliente guardado", "ok"); render(); } catch (err) { toast(errMsg(err), "bad"); }
      });
    } catch (e) { body.innerHTML = '<p class="empty">' + esc(errMsg(e)) + "</p>"; }
  }
  await load();
}
