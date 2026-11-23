/* Sucursales: horario, pausar pedidos (con reanudación automática), delivery/recoger, tiempos y datos. */
import { sb, S, $, esc, money, hhmm, storeState, myStores, isAdmin, q, toast, errMsg, openDrawer, closeDrawer, loading } from "../lib.js";

export default async function (el, ctx) {
  el.innerHTML = loading();
  let stores = [];
  async function load() {
    try {
      const mine = new Set(myStores().map((s) => s.id));
      stores = (await q(sb.from("stores").select("*").order("sort"))).filter((s) => mine.has(s.id));
      stores.forEach((s) => { S.storeById[s.id] = s; });
      render();
    } catch (e) { el.innerHTML = '<div class="card empty">' + esc(errMsg(e)) + "</div>"; }
  }
  function render() {
    el.innerHTML = '<div class="tablewrap"><table><thead><tr><th>Sucursal</th><th>Estado</th><th>Horario</th><th>Delivery</th><th>Recoger</th><th class="num">Prep.</th><th class="num">Costo delivery</th><th></th></tr></thead><tbody>' +
      stores.map((s) => { const x = storeState(s);
        return '<tr><td><b>' + esc(s.name) + "</b>" + (s.active ? "" : ' <span class="pill">Inactiva</span>') + '</td><td><span class="pill ' + x.cls + '">' + esc(x.label) + "</span>" + (x.k === "paused" && s.pause_reason ? '<br><small class="muted">' + esc(s.pause_reason) + "</small>" : "") + "</td><td>" + (s.open_time ? s.open_time.slice(0, 5) + "–" + s.close_time.slice(0, 5) : '<span class="muted">—</span>') + "</td><td>" + (s.accepts_delivery ? "✅" : "⛔") + "</td><td>" + (s.accepts_pickup ? "✅" : "⛔") + '</td><td class="num">' + s.prep_minutes + ' min</td><td class="num">' + (s.delivery_fee == null ? '<span class="muted">por WhatsApp</span>' : money(s.delivery_fee)) + '</td><td><div class="row">' +
          (x.k === "paused" ? '<button class="btn btn--ok btn--sm" data-resume="' + s.id + '">Reanudar</button>' : '<button class="btn btn--red btn--sm" data-pause="' + s.id + '">Pausar</button>') + '<button class="btn btn--ghost btn--sm" data-edit="' + s.id + '">Editar</button></div></td></tr>'; }).join("") + "</tbody></table></div>" +
      '<p class="muted small">Pausar bloquea al instante los pedidos de la web y de Ría para esa sucursal. Con tiempo, se reanuda sola.</p>';
  }
  async function save(id, patch, msg) {
    try { await q(sb.from("stores").update(patch).eq("id", id)); toast(msg || "Guardado", "ok"); await load(); return true; } catch (e) { toast(errMsg(e), "bad"); return false; }
  }
  el.addEventListener("click", (e) => {
    const p = e.target.closest("[data-pause]"), r = e.target.closest("[data-resume]"), ed = e.target.closest("[data-edit]");
    if (r) save(r.dataset.resume, { is_paused: false, pause_reason: null, paused_until: null }, "Sucursal reanudada");
    if (p) pauseDrawer(stores.find((s) => s.id === p.dataset.pause));
    if (ed) editDrawer(stores.find((s) => s.id === ed.dataset.edit));
  });
  function pauseDrawer(s) {
    const body = openDrawer("Pausar " + s.name, '<label>Motivo<input id="pReason" placeholder="Lluvia, mucha demanda, falta de personal…"></label><p class="small muted">¿Por cuánto tiempo?</p><div class="row">' +
      [[15, "15 min"], [30, "30 min"], [60, "1 hora"], [0, "Hasta que la reanude"]].map(([m, l]) => '<button class="btn btn--red" type="button" data-min="' + m + '">' + l + "</button>").join("") + "</div>");
    body.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-min]"); if (!b) return;
      const m = +b.dataset.min;
      const until = m ? new Date(Date.now() + m * 60000).toISOString() : null;
      if (await save(s.id, { is_paused: true, pause_reason: $("#pReason", body).value.trim() || null, paused_until: until }, "Pausada" + (until ? " hasta las " + hhmm(until) : ""))) closeDrawer();
    });
  }
  function editDrawer(s) {
    const body = openDrawer(s.name,
      '<form id="sForm" style="display:grid;gap:12px"><div class="grid2"><label>Abre<input type="time" name="open_time" value="' + esc((s.open_time || "").slice(0, 5)) + '"></label><label>Cierra<input type="time" name="close_time" value="' + esc((s.close_time || "").slice(0, 5)) + '"></label></div>' +
      '<label class="check"><input type="checkbox" name="accepts_delivery"' + (s.accepts_delivery ? " checked" : "") + '> Acepta delivery</label><label class="check"><input type="checkbox" name="accepts_pickup"' + (s.accepts_pickup ? " checked" : "") + "> Acepta pedidos para recoger</label>" +
      '<div class="grid2"><label>Minutos de preparación<input type="number" name="prep_minutes" min="5" max="180" value="' + s.prep_minutes + '"></label><label>Costo de delivery (Bs, vacío = se cotiza)<input type="number" name="delivery_fee" min="0" step="0.5" value="' + (s.delivery_fee == null ? "" : s.delivery_fee) + '"></label></div>' +
      '<label>WhatsApp (591…)<input name="whatsapp" inputmode="numeric" value="' + esc(s.whatsapp || "") + '"></label><label>Dirección<input name="address" value="' + esc(s.address || "") + '"></label><label>Plus Code<input name="plus_code" value="' + esc(s.plus_code || "") + '"></label>' +
      (isAdmin() ? '<label class="check"><input type="checkbox" name="active"' + (s.active ? " checked" : "") + "> Activa</label>" : "") +
      '<button class="btn btn--red" type="submit">Guardar</button><p class="small muted">Recordá actualizar también <code>js/data.js</code> si cambiás horario, dirección o WhatsApp, para que la web y Ría lo muestren.</p></form>');
    $("#sForm", body).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const patch = { open_time: f.get("open_time") || null, close_time: f.get("close_time") || null, accepts_delivery: f.has("accepts_delivery"), accepts_pickup: f.has("accepts_pickup"),
        prep_minutes: Math.max(5, Math.min(180, +f.get("prep_minutes") || 20)), delivery_fee: f.get("delivery_fee") === "" ? null : +f.get("delivery_fee"),
        whatsapp: String(f.get("whatsapp")).replace(/\D/g, "") || null, address: f.get("address").trim() || null, plus_code: f.get("plus_code").trim() || null };
      if ((patch.open_time && !patch.close_time) || (!patch.open_time && patch.close_time)) return toast("Completá apertura y cierre, o dejá ambos vacíos", "bad");
      if (isAdmin()) patch.active = f.has("active");
      if (await save(s.id, patch)) closeDrawer();
    });
  }
  ctx.channel("stores", ["stores"], load);
  const tick = setInterval(render, 60000); // reanudación automática visible
  ctx.onCleanup(() => clearInterval(tick));
  await load();
}
