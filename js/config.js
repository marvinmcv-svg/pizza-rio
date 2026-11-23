/* Configuración pública del backend (Supabase). Lo usan la web, /admin, /sigue-tu-pizza y Ría.
   La clave publicable (sb_publishable_… o "anon") ES pública por diseño: la base la protege con RLS
   y solo deja ejecutar place_order / track_order. NUNCA pongas acá la service_role ni otra clave secreta.
   Con supabaseUrl vacío el backend queda apagado: los pedidos siguen saliendo por WhatsApp como siempre. */
(function (root, factory) {
  const cfg = factory();
  if (typeof module === "object" && module.exports) module.exports = cfg;
  else root.PR_CONFIG = cfg;
})(typeof self !== "undefined" ? self : this, function () {
  return {
    supabaseUrl: "",          // ej. "https://abcdefghijkl.supabase.co"
    supabaseKey: "",          // clave publicable del proyecto
    siteUrl: "https://pizza-rio-orpin.vercel.app",
    trackPath: "sigue-tu-pizza",
  };
});
