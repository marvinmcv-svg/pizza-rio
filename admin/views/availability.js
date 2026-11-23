/* Agotados ("86"): un toque marca un producto como agotado en una sucursal. Bloquea web y Ría al instante. */
import { sb, S, $, esc, myStores, q, toast, errMsg, storeOptions, loading } from "../lib.js";

export default async function (el, ctx) {
  const stores = myStores();
  let store = stores[0] && stores[0].id, avail = {};
  el.innerHTML = '<div class="toolbar"><label>Sucursal<select id="aStore">' + storeOptions(store) + '</select></label><label>Buscar<input id="aText" placeholder="Producto"></label><button class="btn btn--ok" type="button" id="aAll">Todo disponible</button></div><div id="aGrid">' + loading() + "</div>";
  async function load() {
    try {
      avail = {};
      (await q(sb.from("store_item_availability").select("item_id,available").eq("store_id", store))).forEach((a) => (avail[a.item_id] = a.available));
      render();
    } catch (e) { $("#aGrid", el).innerHTML = '<div class="card empty">' + esc(errMsg(e)) + "</div>"; }
  }
  function render() {
    const t = $("#aText", el).value.trim().toLowerCase();
    const items = S.menu.filter((m) => m.active && (!t || m.name.toLowerCase().includes(t)));
    const out = items.filter((m) => avail[m.id] === false).length;
    $("#aGrid", el).innerHTML = '<p class="small muted">' + (out ? "<b>" + out + "</b> agotado(s) en esta sucursal." : "Todo disponible.") + " Tocá un producto para cambiarlo.</p>" +
      '<div class="avail">' + items.map((m) => { const on = avail[m.id] !== false; return '<button type="button" data-id="' + esc(m.id) + '" aria-pressed="' + on + '"><b>' + esc(m.name) + "</b><small>" + (on ? "Disponible" : "AGOTADO") + "</small></button>"; }).join("") + "</div>";
  }
  async function set(id, available) {
    try {
      await q(sb.from("store_item_availability").upsert({ store_id: store, item_id: id, available, updated_by: S.me.user_id, updated_at: new Date().toISOString() }, { onConflict: "store_id,item_id" }));
      avail[id] = available; render(); toast((S.menuById[id] || {}).name + (available ? " disponible" : " agotado"), available ? "ok" : undefined);
    } catch (e) { toast(errMsg(e), "bad"); }
  }
  el.addEventListener("click", async (e) => {
    const b = e.target.closest(".avail button"); if (b) { b.disabled = true; await set(b.dataset.id, b.getAttribute("aria-pressed") !== "true"); return; }
    if (e.target.id === "aAll") {
      const ids = Object.keys(avail).filter((k) => avail[k] === false);
      if (!ids.length) return toast("Ya está todo disponible");
      try { await q(sb.from("store_item_availability").update({ available: true, updated_by: S.me.user_id, updated_at: new Date().toISOString() }).eq("store_id", store).in("item_id", ids)); toast("Todo disponible", "ok"); load(); } catch (err) { toast(errMsg(err), "bad"); }
    }
  });
  $("#aStore", el).addEventListener("change", (e) => { store = e.target.value; load(); });
  $("#aText", el).addEventListener("input", render);
  ctx.channel("avail", ["store_item_availability"], load);
  await load();
}
