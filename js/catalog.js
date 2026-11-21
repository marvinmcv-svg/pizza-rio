/* Pizza Río · catálogo único (lo usan la web, Ría y los tests).
   Construye la lista de productos vendibles desde js/data.js con su id y precio.
   price: null = precio no publicado (se confirma por WhatsApp). */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PR_CATALOG = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Sinónimos y palabras de búsqueda (español cruceño + inglés básico).
  const TAGS = {
    americana: ["jamon", "ham"],
    canadiense: ["tocino", "bacon"],
    hawaiana: ["piña", "pina", "jamon", "pineapple", "ham"],
    churrasco: ["carne", "bife", "ojo de bife", "chorizo", "beef", "steak", "nueva"],
    "pollo-catupiry": ["pollo", "chicken", "catupiry", "queso"],
    "barbacoa-carne": ["carne", "bbq", "barbacoa", "beef"],
    "barbacoa-pollo": ["pollo", "bbq", "barbacoa", "chicken"],
    carbonara: ["tocino", "bacon", "crema"],
    "4-quesos": ["queso", "quesos", "cheese", "four cheese"],
    "4-estaciones": ["estaciones"],
    mixta: ["jamon", "mixta"],
    jamon: ["jamon", "ham"],
    tocinator: ["tocino", "bacon", "tocinator"],
    napolitana: ["tomate", "napolitana"],
    choclo: ["choclo", "maiz", "corn", "vegetariana", "sin carne", "veggie", "vegetarian"],
    "chorizo-argentino": ["chorizo", "carne", "sausage"],
    carnivora: ["carne", "carnes", "meat", "carnivora"],
    "especial-rio": ["especial", "rio"],
    cheeseburguer: ["hamburguesa", "burger", "cheeseburger"],
    "pollo-crema": ["pollo", "crema", "chicken"],
    "nacho-supremo": ["nachos", "nacho"],
    "combo-rio": ["combo", "2 pa 2", "dos pizzas", "coca", "gaseosa", "para compartir"],
    "combo-buri": ["combo", "churrasco", "coca", "gaseosa"],
    choclomix: ["choclo", "jamon", "martes", "mitad"],
    "borde-0": ["borde", "catupiry", "queso en el borde"],
    "extra-0": ["sticker", "dedicatoria", "regalo"],
  };

  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

  function build(D) {
    const items = {};
    const put = (o) => { items[o.id] = Object.assign({ tags: (TAGS[o.id] || []).map(norm) }, o); };
    D.menu.forEach((c) => c.items.forEach((i) => put({ id: i.id, name: "Pizza " + i.name, short: i.name, price: i.price, kind: "pizza", category: c.name, size: D.sizes.familiar, desc: i.desc || null, veg: !!i.veg, isNew: !!i.isNew })));
    D.weekly.forEach((w) => { if (!items[w.id] && !w.plus) put({ id: w.id, name: w.title, short: w.title, price: w.price, kind: "promo", category: "Promos", desc: w.desc, day: w.day, until: w.until || null }); });
    // Tarjetas de combos que repiten un producto ya existente quedan como alias ocultos (la web las acepta; Ría usa el original).
    D.combos.forEach((c) => { if (c.ref && items[c.ref]) put(Object.assign({}, items[c.ref], { id: c.id, hidden: true, aliasOf: c.ref })); else put({ id: c.id, name: c.name, short: c.name, price: c.price, kind: "combo", category: "Combos", desc: c.note }); });
    if (D.addons.bordes) D.addons.bordes.items.forEach((n, i) => put({ id: "borde-" + i, name: n, short: n, price: D.addons.bordes.price, kind: "extra", category: "Bordes", desc: "Se suma a una pizza." }));
    if (D.addons.extras) D.addons.extras.items.forEach((n, i) => put({ id: "extra-" + i, name: n, short: n, price: D.addons.extras.price, kind: "extra", category: "Extras", desc: "Se suma a una pizza." }));
    if (D.yapa && items[D.yapa.id]) put(Object.assign({}, items[D.yapa.id], { id: "yapa-" + D.yapa.id, hidden: true, aliasOf: D.yapa.id }));
    return items;
  }

  // Totales: solo suma precios publicados; los null quedan "a confirmar".
  function totals(items, cart) {
    let sum = 0, unknown = false, count = 0;
    (cart || []).forEach((l) => { const it = items[l.id]; if (!it) return; count += l.qty; if (it.price == null) unknown = true; else sum += it.price * l.qty; });
    return { sum, unknown, count };
  }

  function search(items, query, limit) {
    const q = norm(query);
    if (!q) return [];
    // "sin carne" / vegetariano: solo lo marcado como sin carne en data.js (nunca adivinar)
    if (/\b(sin carne|vegetarian[ao]?s?|veggie|vegan[ao]?|meat ?free|sin jamon)\b/.test(q)) return Object.values(items).filter((it) => !it.hidden && it.veg);
    const words = q.split(" ").filter((w) => w.length > 1);
    const scored = Object.values(items).filter((it) => !it.hidden).map((it) => {
      const hay = [norm(it.name), norm(it.category), norm(it.desc)].concat(it.tags).join(" | ");
      let score = 0;
      if (norm(it.name).includes(q) || norm(it.short).includes(q)) score += 10;
      if (it.tags.includes(q)) score += 8;
      words.forEach((w) => { if (hay.includes(w)) score += 2; });
      return { it, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    return scored.slice(0, limit || 6).map((x) => x.it);
  }

  return { build, totals, search, norm };
});
