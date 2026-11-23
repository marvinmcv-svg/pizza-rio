/* Cliente del backend (Supabase RPC) para Ría, del lado del servidor.
   Usa la misma clave PUBLICABLE que la web (las RPC públicas son place_order y track_order):
   el servidor no tiene más permisos que un navegador. Variables opcionales: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY. */
"use strict";
const CFG = require("../js/config.js");

const TIMEOUT_MS = 6000;
const url = () => (process.env.SUPABASE_URL || CFG.supabaseUrl || "").replace(/\/+$/, "");
const key = () => process.env.SUPABASE_PUBLISHABLE_KEY || CFG.supabaseKey || "";
const enabled = () => !!(url() && key());
const siteUrl = () => (process.env.SITE_URL || CFG.siteUrl || "").replace(/\/+$/, "");
const trackUrl = (token) => siteUrl() + "/" + (CFG.trackPath || "sigue-tu-pizza") + "/?t=" + token;

// Errores de negocio que devuelve place_order (mensaje de la excepción).
const BUSINESS = /^(store_paused|delivery_unavailable|pickup_unavailable|invalid_service|sold_out:.*|unknown_item:.*|unknown_store|invalid_phone|missing_name|missing_address|invalid_location|invalid_time|time_in_past|rate_limited|customer_blocked|empty_order|too_many_lines|invalid_payload|invalid_channel)$/;

/** → { ok: true, data } | { ok: false, kind: "business", code } | { ok: false, kind: "network", detail } */
async function rpc(fn, body, opts) {
  if (!enabled()) return { ok: false, kind: "disabled" };
  const f = (opts && opts.fetch) || fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), (opts && opts.timeout) || TIMEOUT_MS);
  try {
    const res = await f(url() + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key(), Authorization: "Bearer " + key() },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const txt = await res.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
    if (res.ok) return { ok: true, data };
    const code = data && typeof data.message === "string" ? data.message : "";
    if (BUSINESS.test(code)) return { ok: false, kind: "business", code };
    return { ok: false, kind: "network", detail: res.status + " " + code };
  } catch (e) {
    return { ok: false, kind: "network", detail: (e && e.name) || "error" };
  } finally {
    clearTimeout(timer);
  }
}

// Lo que Ría le dice al cliente ante cada error de negocio.
function explain(code) {
  if (code.startsWith("sold_out:")) return "Se agotó " + code.slice(9) + " en esa sucursal por hoy.";
  if (code.startsWith("unknown_item:")) return "Uno de los productos ya no está en el menú.";
  return ({
    store_paused: "Esa sucursal pausó los pedidos por un rato.",
    delivery_unavailable: "Esa sucursal no está haciendo delivery ahora.",
    pickup_unavailable: "Esa sucursal no está recibiendo pedidos para recoger ahora.",
    unknown_store: "No encontré esa sucursal.",
    invalid_phone: "El celular no es válido (son 8 dígitos, ej. 71234567).",
    missing_name: "Falta el nombre.",
    missing_address: "Falta la dirección o la ubicación para el delivery.",
    invalid_location: "La ubicación no es válida.",
    invalid_time: "No entendí la hora del pedido.",
    time_in_past: "Esa hora ya pasó.",
    rate_limited: "Hay muchos pedidos seguidos desde ese número; esperá unos minutos.",
    customer_blocked: "No podemos tomar este pedido en línea; escribile a la sucursal.",
    empty_order: "El pedido está vacío.",
  })[code] || "No se pudo registrar el pedido.";
}

module.exports = { enabled, rpc, explain, trackUrl, siteUrl };
