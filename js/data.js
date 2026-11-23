/* =========================================================================
   Pizza Río · datos del sitio (compartido por la web y por Ría, la IA)
   -------------------------------------------------------------------------
   Cada dato tiene su fuente (post de Instagram, Linktree o foto propia).
   Si algo no está publicado, NO va acá: va en la lista "falta confirmar"
   del README. Precios en bolivianos (Bs).
   ========================================================================= */
(function (root, factory) {
  const data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.PIZZARIO = data;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const IG = "https://www.instagram.com/pizzario.bolivia/";
  const P = (code) => "https://www.instagram.com/p/" + code + "/";

  return {
    config: {
      brand: "Pizza Río",
      ai: "Ría",
      // Call center por WhatsApp: cartel de la sucursal Av. Banzer (foto P("DfaJm0sCRJn"))
      // y caja de pizza "CALL CENTER Telf. 78462865" (foto P("DdRYDrJRkCn")).
      callCenter: "59178462865",
      instagram: IG,
      facebook: "https://www.facebook.com/pizzariosantacruz",
      linktree: "https://linktr.ee/pizzario.bolivia",
      timezone: "America/La_Paz",
      currency: "Bs",
      locale: "es-BO",
      countryCode: "591",
      phonePrefix: "591",
      phoneDigits: 8, // celulares de Bolivia: 8 dígitos (6xxxxxxx / 7xxxxxxx)
      codePrefix: "PR", // códigos de pedido PR-ABCDE
      trackPath: "sigue-tu-pizza",
      city: "Santa Cruz",
      slogan: "#ConVosEnTodas", // hashtag de casi todos sus posts
    },

    stats: [
      // 21 sucursales listadas en linktr.ee/pizzario.bolivia
      { value: 21, suffix: "", label: "sucursales en Santa Cruz" },
      // "Una sola medida ... tamaño familiar, 8 porciones" (Facebook, 24/08/2026)
      { value: 8, suffix: "", label: "porciones en cada Río familiar" },
      // 23.374 seguidores en Instagram (perfil, 21/11/2026)
      { value: 23.4, suffix: "K", label: "Río Lovers en Instagram", decimals: 1 },
    ],

    // "Una sola medida para todas tus Ríos favoritas: tamaño familiar, 8 porciones"
    // https://www.facebook.com/pizzariosantacruz/videos/933157173179604/
    sizes: { familiar: "Familiar · 8 porciones" },

    // Precios: carta impresa que aparece en P("DdcUJiUidcu") (slide 3, 18/09/2026).
    // Solo se cargaron los precios que se leen claramente en la foto.
    // price: null = el nombre aparece en la carta o en posts, pero el precio no se ve.
    menu: [
      {
        id: "clasicas", name: "Clásicas", size: "Familiar · 8 porciones",
        items: [
          { id: "americana", name: "Americana", price: 52, img: "assets/img/feat-americana.webp" }, // carta P("DdcUJiUidcu")
          { id: "canadiense", name: "Canadiense", price: 52 }, // carta P("DdcUJiUidcu")
          { id: "hawaiana", name: "Hawaiana", price: 54, img: "assets/img/feat-hawaiana.webp" }, // carta P("DdcUJiUidcu")
        ],
      },
      {
        id: "especiales", name: "Especiales", size: "Familiar · 8 porciones",
        items: [
          // P("DdUaH7oJKeK") 15/09/2026: "PIZZA DE CORTE DE OJO DE BIFE Y CHORIZO ARGENTINO a tan solo BS 63"
          // P("DdpRataJg3W"): "... con Salsa Churrasquera"
          { id: "churrasco", name: "Churrasco", price: 63, isNew: true,
            desc: "Corte de ojo de bife, chorizo argentino y salsa churrasquera." },
          { id: "pollo-catupiry", name: "Pollo Catupiry", price: 56 }, // carta
          { id: "4-estaciones", name: "4 Estaciones", price: 56 }, // carta
          { id: "barbacoa-carne", name: "Barbacoa de Carne", price: 56 }, // carta
          { id: "barbacoa-pollo", name: "Barbacoa de Pollo", price: 56 }, // carta
          { id: "carbonara", name: "Carbonara", price: 56 }, // carta
          { id: "4-quesos", name: "4 Quesos", price: 60 }, // carta
        ],
      },
      {
        id: "mas", name: "Más Ríos", size: "precio por WhatsApp",
        items: [
          // Nombres vistos en la carta (precio tapado en la foto) o en captions de combos.
          { id: "mixta", name: "Mixta", price: null }, // P("DeH4qdiiUee")
          { id: "jamon", name: "Jamón", price: null }, // P("DeCbIHLx7wO")
          { id: "tocinator", name: "Tocinátor", price: null }, // P("DeH4qdiiUee")
          { id: "napolitana", name: "Napolitana", price: null }, // P("Ddl5mdHiUvl")
          { id: "choclo", name: "Choclo", price: null, veg: true }, // P("DfSTFEWJZc0") "1/2 choclo"
          { id: "chorizo-argentino", name: "Chorizo Argentino", price: null }, // P("DdZ4VO5pwB9")
          { id: "carnivora", name: "Carnívora", price: null }, // P("DeCbP7ixu7b")
          { id: "especial-rio", name: "Especial Río", price: null, special: true }, // carta
          { id: "cheeseburguer", name: "Cheeseburguer", price: null }, // carta + P("Db_lJ04J28u")
          { id: "pollo-crema", name: "Pollo con Crema", price: null }, // carta
          { id: "nacho-supremo", name: "Nacho Supremo", price: null }, // carta
        ],
      },
    ],

    addons: {
      // P("DceUjM0psfk") 26/08/2026: "extra de queso Catupiry en el borde por solo BS 15"
      bordes: { price: 15, items: ["Borde de Catupiry"] },
      // P("Dd3_-KgRwMr") 29/09/2026: "Sumá Bs 4 a tu pizza, elegí el sticker ... Disponible en todas las sucursales"
      extras: { price: 4, items: ["Sticker en la caja"] },
    },

    // Promos de la semana / de todos los días. day: 0=domingo … 6=sábado; null = todos los días.
    weekly: [
      // P("DfSTFEWJZc0") 03/11/2026 "Todos los martes de noviembre" + P("Df2T-IexU_T") 17/11/2026 "Martes de ChocloMix a Bs 36"
      { id: "choclomix", day: 2, until: "2026-11-30", name: "Martes", title: "ChocloMix",
        desc: "1 pizza familiar: mitad choclo + mitad jamón.", price: 36 },
      // P("DeH4qdiiUee") 05/10/2026: "1 Pizza Mixta + 1 Pizza Tocinátor + Coca-Cola 1.5 L por Bs. 92"
      { id: "combo-rio", day: null, name: "2 pa' 2", title: "Combo Río",
        desc: "1 Mixta + 1 Tocinátor + Coca-Cola 1,5 L.", price: 92 },
      { id: "borde", day: null, name: "Antojo extra", title: "Borde Catupiry",
        desc: "Tu Río favorita con borde de queso Catupiry.", price: 15, plus: true }, // P("DceUjM0psfk")
      { id: "sticker", day: null, name: "Para dedicar", title: "Sticker en la caja",
        desc: "Elegí el sticker que dice lo que pensás y dedicásela a alguien.", price: 4, plus: true }, // P("Dd3_-KgRwMr")
    ],

    combos: [
      { id: "combo-rio", name: "Combo Río · 2 pa' 2", price: 92, img: "assets/img/combo-combo-rio.webp", hot: true,
        note: "1 Pizza Mixta + 1 Pizza Tocinátor + Coca-Cola 1,5 L", src: P("DeH4qdiiUee") },
      // P("DdUaH7oJKeK") 15/09/2026: "Llevala en combo más 1 Coca Cola de 1,5lt a BS 69"
      { id: "combo-buri", name: "Combo Buri", price: 69, img: "assets/img/combo-combo-buri.webp", star: true,
        note: "1 Pizza Churrasco + Coca-Cola 1,5 L", src: P("DdUaH7oJKeK") },
      { id: "choclomix-combo", ref: "choclomix", name: "Martes de ChocloMix", price: 36, img: "assets/img/combo-choclomix.webp",
        note: "1 pizza familiar mitad jamón + mitad choclo · solo martes de noviembre", src: P("Df2T-IexU_T") },
      { id: "churrasco-sola", ref: "churrasco", name: "Pizza Churrasco", price: 63, img: "assets/img/combo-churrasco.webp",
        note: "Ojo de bife + chorizo argentino + salsa churrasquera", src: P("DdUaH7oJKeK") },
    ],

    // Especial del mes (noviembre 2026): ChocloMix todos los martes.
    yapa: { id: "choclomix", name: "ChocloMix", price: 36, month: "noviembre", until: "2026-11-30",
      img: "assets/img/spot-choclomix.webp", // recorte de P("DfSTFEWJZc0") sin titular ni precio
      lede: "Porque ustedes lo pidieron… el ChocloMix se queda. Mitad choclo + mitad jamón, todos los martes de noviembre.", // P("DfSTFEWJZc0")
    },

    // Carrusel principal (portada). Fotos recortadas de los posts originales, sin el texto del post.
    hero: [
      { id: "combo-rio", eyebrow: "Todos los días", t1: "El verdadero", t2: "2 pa' 2.", price: 92,
        desc: "1 Pizza Mixta + 1 Pizza Tocinátor + Coca-Cola 1,5 L. Porque acá nadie sale lastimado, solo lleno. 😂",
        add: "combo-rio", img: "assets/hero/slide-combo-rio.webp", w: 1100, h: 770, src: P("DeH4qdiiUee") },
      { id: "choclomix", eyebrow: "Martes de noviembre", t1: "Martes de", t2: "ChocloMix.", price: 36, day: 2, until: "2026-11-30",
        desc: "1 pizza familiar: mitad choclo + mitad jamón. Porque noviembre sin ChocloMix… no gracias. 😌",
        add: "choclomix", img: "assets/hero/slide-choclomix.webp", w: 900, h: 900, round: true, src: P("DfSTFEWJZc0") },
      { id: "churrasco", eyebrow: "Nueva", t1: "Pizza", t2: "Churrasco.", price: 63, theme: "green",
        desc: "Corte de ojo de bife, chorizo argentino y salsa churrasquera. En Combo Buri con Coca-Cola 1,5 L: Bs 69.",
        add: "churrasco", img: "assets/hero/slide-buri.webp", w: 1100, h: 760, src: P("DdUaH7oJKeK") },
      { id: "borde", eyebrow: "Antojo extra", t1: "¿Con o sin", t2: "borde?", price: 15, plus: true,
        desc: "Tu Río favorita como siempre, o con ese extra de queso Catupiry en el borde. 🤤",
        add: "borde-0", img: "assets/hero/slide-catupiry.webp", w: 1000, h: 962, src: P("DceUjM0psfk") },
    ],

    // Tarjetas "Descubrí nuestras promos": los posts tal cual los publicó Pizza Río.
    promoCards: [
      { img: "assets/img/combo-rio-2pa2.webp", title: "Combo Río 2 pa' 2", price: 92, add: "combo-rio", url: P("DeH4qdiiUee") },
      { img: "assets/img/choclomix-kit.webp", title: "Martes de ChocloMix", price: 36, add: "choclomix", day: 2, until: "2026-11-30", url: P("Df2T-IexU_T") },
      { img: "assets/img/borde-catupiry.webp", title: "Borde de Catupiry", price: 15, plus: true, add: "borde-0", url: P("DceUjM0psfk") },
      { img: "assets/img/combo-buri.webp", title: "Combo Buri", price: 69, add: "combo-buri", url: P("DdRXr9KxcLl") },
      { img: "assets/img/sticker.webp", title: "Sticker dedicado", price: 4, plus: true, add: "extra-0", url: P("Dd3_-KgRwMr") },
      { img: "assets/img/pirai-11am.webp", title: "Piraí desde las 11:00", href: "#sucursales", url: P("Dd7C2OIpjrw") },
    ],

    featured: [
      { ref: "churrasco", name: "Pizza Churrasco", tag: "Nueva", video: "assets/video/churrasco-queso",
        desc: "Corte de ojo de bife, chorizo argentino y salsa churrasquera. Un homenaje a Santa Cruz.", price: 63 }, // P("DczjDIHpSeJ")
      { ref: "hawaiana", name: "Hawaiana", tag: "Favorita de la casa", img: "assets/img/feat-hawaiana.webp",
        desc: "De las más pedidas según nuestro equipo.", price: 54 }, // P("DdcUJiUidcu") "los verdaderos favoritos de la casa"
      { ref: "americana", name: "Americana", tag: "Favorita de la casa", img: "assets/img/feat-americana.webp",
        desc: "Otra de las favoritas de la casa.", price: 52 }, // P("DdcUJiUidcu")
    ],

    // Sucursales y WhatsApp: linktr.ee/pizzario.bolivia ("DELIVERY SUCURSALES SCZ").
    // Horarios: solo los que están publicados.
    branches: [
      { id: "montero", name: "Montero", waLink: "https://wa.link/di2f72" }, // Linktree usa un link corto, sin número visible
      // Caja de pizza en P("DdRYDrJRkCn"): "DELIVERY De 10:30 AM a 10:45 PM - Telf. 75358717"
      { id: "equipetrol", name: "Equipetrol", whatsapp: "59175358717", open: "10:30", close: "22:45" },
      { id: "av-alemana", name: "Av. Alemana", whatsapp: "59169006395" },
      { id: "av-banzer", name: "Av. Banzer", whatsapp: "59175500462" }, // también en el cartel, P("DfaJm0sCRJn")
      { id: "av-beni", name: "Av. Beni", whatsapp: "59176380990" },
      { id: "av-radial-27", name: "Av. Radial 27", whatsapp: "59177827722" },
      // P("Dd7C2OIpjrw"): "Desde las 11 AM ya podés pasar por nuestra sucursal de la Piraí"
      { id: "av-pirai", name: "Av. Piraí", whatsapp: "59176327440", opensNote: "Desde las 11:00" },
      { id: "av-busch", name: "Av. Busch", whatsapp: "59175631173" }, // Linktree: wa.me/75631173
      { id: "doble-via-km-6", name: "Doble Vía KM 6", whatsapp: "59176445179" },
      { id: "villa-1ro-de-mayo", name: "Villa 1ro de Mayo", whatsapp: "59178012393" },
      { id: "doble-via-km-9", name: "Doble Vía KM 9", whatsapp: "59174160460" },
      { id: "melchor-pinto", name: "Melchor Pinto", whatsapp: "59177026938" },
      { id: "virgen-de-lujan", name: "Virgen de Luján", whatsapp: "59162240413" },
      { id: "plaza-blacutt", name: "Plaza Blacutt", whatsapp: "59169013211" },
      { id: "paragua", name: "Paraguá", whatsapp: "59177304620" },
      { id: "san-aurelio", name: "San Aurelio", whatsapp: "59177012768" },
      { id: "santos-dumont-2", name: "Santos Dumont 2", whatsapp: "59177303391" },
      { id: "santos-dumont", name: "Santos Dumont", whatsapp: "59175358848" },
      { id: "sevilla", name: "Sevilla", whatsapp: "59162246930" },
      { id: "plan-3000", name: "Plan 3000", whatsapp: "59177387397" },
      { id: "pampa-de-la-isla", name: "Pampa de la Isla", whatsapp: "59174166949" },
    ],

    // Alianza vigente: P("DfvTxbOij29") 14/11/2026 (Pizza Río × Honda Center Sport)
    partner: {
      name: "Honda Center Sport",
      title: "Comprá tu Río y ganá una Honda Navi",
      copy: "Comprá tu pizza, escaneá el código QR, registrá tu código ¡y ya estás participando! Sortearemos 5 Honda Navi. Y si elegís el Combo Navi, duplicás tus oportunidades de ganar.",
      fine: "Promoción válida en Santa Cruz.",
      url: P("DfvTxbOij29"),
    },

    facts: [
      "Pizza Río es una pizzería de Santa Cruz, Bolivia, con 21 sucursales y pedidos por WhatsApp a cada sucursal.",
      "Todas las pizzas son de una sola medida: tamaño familiar, 8 porciones.",
      "El call center atiende por WhatsApp al 784-62865.",
      "La sucursal Equipetrol hace delivery de 10:30 a 22:45 (según su caja de pizza). Los horarios de las demás sucursales no están publicados.",
      "La sucursal de la Av. Piraí abre desde las 11:00 para el almuerzo.",
      "Borde de queso Catupiry: Bs 15 extra. Sticker dedicado en la caja: Bs 4 extra, en todas las sucursales.",
      "Alianza con Honda Center Sport: comprando una pizza, escaneando el QR y registrando el código se participa en el sorteo de 5 Honda Navi; el Combo Navi duplica las oportunidades. Válido en Santa Cruz. El contenido y precio del Combo Navi no están publicados.",
      "En febrero de 2026 Pizza Río ayudó al refugio Angelitos de Edgar a pagar Bs 50.000 de deudas veterinarias.",
      "Sus redes oficiales son Instagram @pizzario.bolivia y Facebook Pizza Río (pizzariosantacruz).",
    ],

    reels: [
      { src: "assets/video/churrasco", caption: "Así nace la Pizza Churrasco 🥩", url: P("DczjDIHpSeJ") },
      { src: "assets/video/churrasco-combo", caption: "Churrasco + soda 1,5 L 🤤", url: P("DdUaH7oJKeK") },
      { src: "assets/video/refugio-50mil", caption: "¡Bs 50.000 bien gastados! 🐶❤️", url: P("DUZOQdeCTKu") },
      { src: "assets/video/septiembre-scz", caption: "Septiembre se vive con orgullo 💚🤍💚", url: P("Dc1PlABR_rB") },
      { src: "assets/video/halloween", caption: "Algo muy embrujado llegó a Río 🎃", url: P("DexhreSyVii") },
    ],

    feed: [
      { img: "assets/img/combo-rio-2pa2.webp", url: P("DeH4qdiiUee"), alt: "Combo Río 2 pa' 2: Mixta + Tocinátor por Bs 92" },
      { img: "assets/img/choclomix-kit.webp", url: P("Df2T-IexU_T"), alt: "Martes de ChocloMix a Bs 36" },
      { img: "assets/img/mision-1.webp", url: P("Df7hT1EEVBr"), alt: "Nueva misión desbloqueada" },
      { img: "assets/img/historia-4.webp", url: P("DfaJm0sCRJn"), alt: "Nuestra historia: los inicios" },
      { img: "assets/img/combo-buri.webp", url: P("DdRXr9KxcLl"), alt: "Donde hay junte hay Combo Buri" },
      { img: "assets/img/pirai-11am.webp", url: P("Dd7C2OIpjrw"), alt: "En la Piraí desde las 11 AM" },
      { img: "assets/img/sticker.webp", url: P("Dd3_-KgRwMr"), alt: "La indirecta viene con pizza: sticker por Bs 4" },
      { img: "assets/img/borde-catupiry.webp", url: P("DceUjM0psfk"), alt: "¿Tu Río favorita va con o sin borde?" },
    ],

    story: {
      img: "assets/img/historia-1.webp",
      video: "assets/video/refugio-50mil",
      p1: "Nos sumamos al trend y nos pegó la nostalgia. Volvimos unos años atrás para recordar cómo empezó una de nuestras historias y todo lo que nos trajo hasta acá.", // P("DfaJm0sCRJn")
      p2: "Y no solo de pizza vive Río: ayudamos al refugio Angelitos de Edgar a pagar Bs 50.000 de deudas veterinarias. Una vez más, gracias #RíoLovers. ❤️💛", // P("DUZOQdeCTKu")
      timeline: [
        { big: "2017", text: "ya compartíamos nuestro menú en Facebook" }, // facebook.com/photo.php?fbid=825274977610637 (17/01/2017)
        { big: "21", text: "sucursales en Santa Cruz" }, // Linktree
        { big: "50K", text: "bolivianos para el refugio Angelitos de Edgar" }, // P("DUZOQdeCTKu")
      ],
    },
  };
});
