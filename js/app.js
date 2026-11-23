/* Pizza Río · app (vanilla, sin build) */
(function () {
  "use strict";
  const D = window.PIZZARIO;
  if (!D) return;
  const C = D.config;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => C.currency + " " + n;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const store = {
    get(k, s) { try { return JSON.parse((s || localStorage).getItem(k)); } catch (e) { return null; } },
    set(k, v, s) { try { (s || localStorage).setItem(k, JSON.stringify(v)); } catch (e) { /* sin storage */ } },
  };

  /* ---------- hora de Santa Cruz ---------- */
  function now() {
    const p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: C.timezone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date()).forEach((x) => (p[x.type] = x.value));
    const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
    const h = +p.hour % 24, m = +p.minute;
    const fake = new URLSearchParams(location.search).get("dia"); // ?dia=2 para probar la card de hoy
    return { dow: fake != null && fake !== "" ? +fake : dow, min: h * 60 + m, hhmm: p.hour.replace("24", "00") + ":" + p.minute, date: p.year + "-" + p.month + "-" + p.day };
  }
  const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const active = (x, t) => !x.until || t.date <= x.until;
  function todayPromo(t) { return D.weekly.find((w) => w.day === t.dow && active(w, t)); }

  function branchStatus(b, t) {
    if (!b.open || !b.close) return { cls: "na", label: b.opensNote || "Horario por confirmar", open: null };
    const o = toMin(b.open), c = toMin(b.close), n = t.min;
    const isOpen = c > o ? n >= o && n < c : n >= o || n < c;
    if (isOpen) return c - n <= 30 && c - n > 0 ? { cls: "soon", label: "Cierra pronto", open: true } : { cls: "open", label: "Abierto", open: true };
    const until = (o - n + 1440) % 1440;
    if (until <= 60) return { cls: "soon", label: "Abre " + b.open, open: false };
    return { cls: "closed", label: "Cerrado", open: false };
  }

  /* ---------- toast + cart ---------- */
  const toastEl = $("#toast");
  let toastT;
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add("is-on"); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("is-on"), 2200); }

  let cart = store.get("pr-cart") || [];
  const allItems = window.PR_CATALOG ? window.PR_CATALOG.build(D) : {};
  cart = cart.filter((l) => allItems[l.id]);

  function add(id) {
    const it = allItems[id]; if (!it) return;
    const l = cart.find((x) => x.id === id);
    if (l) l.qty++; else cart.push({ id, qty: 1 });
    saveCart(); toast("Agregado: " + it.name + " 🍕");
    const c = $("#cartCount"); c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump");
  }
  function setQty(id, d) { const l = cart.find((x) => x.id === id); if (!l) return; l.qty += d; if (l.qty <= 0) cart = cart.filter((x) => x !== l); saveCart(); }
  function totals() {
    let sum = 0, unknown = false, count = 0;
    cart.forEach((l) => { const it = allItems[l.id]; count += l.qty; if (it.price == null) unknown = true; else sum += it.price * l.qty; });
    return { sum, unknown, count };
  }
  const totalLabel = (t) => money(t.sum) + (t.unknown ? " + a confirmar" : "");
  function saveCart() { store.set("pr-cart", cart); renderCart(); renderFlowCart(); updatePreview(); if (typeof renderRiaCart === "function") renderRiaCart(); }
  function renderCart() {
    const t = totals();
    $("#cartCount").textContent = t.count;
    $("#mbarCount").textContent = t.count; $("#mbarTotal").textContent = money(t.sum) + (t.unknown ? "+" : "");
    $("#mbarCart").hidden = !t.count;
    $("#drawerTotal").textContent = totalLabel(t);
    const body = $("#drawerBody");
    if (!cart.length) {
      body.innerHTML = '<div class="cart-empty"><img src="assets/img/logo.png" width="90" height="90" alt=""><p>Tu caja está vacía… y eso duele. 🥲</p><a class="btn btn--red" href="#combos" data-close>Ver combos</a></div>';
      return;
    }
    body.innerHTML = cart.map((l) => { const it = allItems[l.id];
      return '<div class="cl"><div class="cl__name">' + esc(it.name) + "<small>" + (it.price == null ? "Precio a confirmar" : money(it.price) + " c/u") + '</small></div><div class="qty"><button type="button" data-q="-1" data-id="' + esc(l.id) + '" aria-label="Quitar uno">−</button><span>' + l.qty + '</span><button type="button" data-q="1" data-id="' + esc(l.id) + '" aria-label="Agregar uno">+</button></div></div>'; }).join("");
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-add]"); if (a) { add(a.dataset.add); return; }
    const q = e.target.closest("[data-q]"); if (q) setQty(q.dataset.id, +q.dataset.q);
  });

  /* drawer */
  const drawer = $("#drawer"), scrim = $("#scrim");
  let lastFocus = null;
  function openDrawer() { lastFocus = document.activeElement; drawer.hidden = false; scrim.hidden = false; $("#drawerClose").focus(); updateMbar(); }
  function closeDrawer() { drawer.hidden = true; scrim.hidden = true; if (lastFocus) lastFocus.focus(); updateMbar(); }
  $("#cartBtn").addEventListener("click", openDrawer);
  $("#mbarCart").addEventListener("click", openDrawer);
  $("#drawerClose").addEventListener("click", closeDrawer);
  scrim.addEventListener("click", closeDrawer);
  drawer.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeDrawer(); });
  $("#drawerGo").addEventListener("click", () => { closeDrawer(); setIntent("delivery"); goStep(2); $("#pedir").scrollIntoView({ behavior: reduced ? "auto" : "smooth" }); });
  document.addEventListener("keydown", (e) => { if (e.key !== "Escape") return; if (!drawer.hidden) closeDrawer(); else if (!$("#ria").hidden) closeRia(); });

  /* ---------- barra superior + reloj ---------- */
  function renderLive() {
    const t = now();
    $("#clock").innerHTML = "<b>" + esc(t.hhmm) + "</b> en " + esc(C.city) + " · " + D.branches.length + " sucursales";
  }
  (function topbar() {
    const t = now(), p = todayPromo(t);
    const items = [p ? "Hoy: " + p.title + " a " + money(p.price) : "Combo Río 2 pa' 2 a " + money(92), "Pedí por WhatsApp a tu sucursal", "Borde de Catupiry +" + money(15), D.branches.length + " sucursales en " + C.city, "#ConVosEnTodas"];
    const html = items.map((x) => "<span>" + esc(x) + '</span><i aria-hidden="true">🍕</i>').join("");
    $("#topbar").innerHTML = html + html;
  })();

  /* ---------- hero: carrusel de promos ---------- */
  const heroSlides = (() => { const t = now(); return D.hero.filter((h) => active(h, t)); })();
  let heroIdx = 0, heroTimer = null;
  function renderHero() {
    const t = now();
    const todayI = heroSlides.findIndex((h) => h.day === t.dow);
    if (todayI > 0) heroIdx = todayI;
    $("#slides").innerHTML = heroSlides.map((h, i) => {
      const today = h.day === t.dow, on = i === heroIdx;
      const ti = on ? "" : ' tabindex="-1"';
      return '<article class="slide' + (h.theme ? " slide--" + h.theme : "") + (h.round ? " slide--round" : "") + (on ? " is-on" : "") + '" aria-roledescription="diapositiva" aria-label="' + (i + 1) + " de " + heroSlides.length + '"' + (on ? "" : ' aria-hidden="true"') + ">" +
        '<div class="slide__media"><img src="' + esc(h.img) + '" width="' + h.w + '" height="' + h.h + '" alt="' + esc(h.t1 + " " + h.t2) + '"' + (i === 0 || on ? ' fetchpriority="high"' : ' loading="lazy"') + "></div>" +
        '<div class="wrap slide__in"><div class="slide__txt">' +
        '<p class="slide__eyebrow">' + (today ? "Hoy · " : "") + esc(h.eyebrow) + "</p>" +
        '<h2 class="slide__title"><span>' + esc(h.t1) + '</span> <span class="hl">' + esc(h.t2) + "</span></h2>" +
        '<p class="slide__desc">' + esc(h.desc) + "</p>" +
        '<div class="slide__buy"><p class="slide__price"><small>' + (h.plus ? "+" : "") + esc(C.currency) + "</small>" + h.price + '</p><button class="btn btn--mustard btn--lg" type="button" data-add="' + esc(h.add) + '"' + ti + ">Agregar al pedido</button></div>" +
        '<a class="slide__src" href="' + esc(h.src) + '" target="_blank" rel="noopener"' + ti + ">Ver la publicación ↗</a>" +
        "</div></div></article>";
    }).join("");
    $("#heroDots").innerHTML = heroSlides.map((h, i) => '<button type="button" aria-label="Ver promo ' + (i + 1) + ": " + esc(h.t1 + " " + h.t2) + '"' + (i === heroIdx ? ' aria-current="true"' : "") + "></button>").join("");
  }
  function goSlide(i, user) {
    const n = heroSlides.length; heroIdx = (i + n) % n;
    $$("#slides .slide").forEach((el, k) => {
      const on = k === heroIdx; el.classList.toggle("is-on", on);
      if (on) el.removeAttribute("aria-hidden"); else el.setAttribute("aria-hidden", "true");
      $$("a, button", el).forEach((x) => (on ? x.removeAttribute("tabindex") : x.setAttribute("tabindex", "-1")));
    });
    $$("#heroDots button").forEach((d, k) => (k === heroIdx ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
    if (user) startHero();
  }
  function startHero() { clearInterval(heroTimer); if (!reduced && heroSlides.length > 1) heroTimer = setInterval(() => goSlide(heroIdx + 1), 6500); }
  $("#heroPrev").addEventListener("click", () => goSlide(heroIdx - 1, true));
  $("#heroNext").addEventListener("click", () => goSlide(heroIdx + 1, true));
  $("#heroDots").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) goSlide($$("#heroDots button").indexOf(b), true); });
  $("#top").addEventListener("mouseenter", () => clearInterval(heroTimer));
  $("#top").addEventListener("mouseleave", startHero);
  $("#top").addEventListener("focusin", () => clearInterval(heroTimer));
  (function swipe() {
    let x0 = null;
    const el = $("#slides");
    el.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
    el.addEventListener("touchend", (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 45) goSlide(heroIdx + (dx < 0 ? 1 : -1), true); x0 = null; });
  })();

  /* "¿Cómo querés tu pedido?" -> arma el pedido con ese modo y esa sucursal */
  $("#where").addEventListener("submit", (e) => {
    e.preventDefault();
    const mode = ($("#where").querySelector('input[name="whereMode"]:checked') || {}).value || "delivery";
    setIntent(mode);
    const v = $("#whereBranch").value; if (v !== "") $("#branchSel").value = v;
    updatePreview(); goStep(2);
    $("#pedir").scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  });

  /* ---------- "Descubrí nuestras promos" ---------- */
  function renderPromoCards() {
    const t = now();
    $("#promoCards").innerHTML = D.promoCards.filter((c) => active(c, t)).map((c, i) => {
      const today = c.day === t.dow;
      const action = c.add ? '<button class="add" type="button" data-add="' + esc(c.add) + '" aria-label="Agregar ' + esc(c.title) + '">+</button>' : '<a class="add add--link" href="' + esc(c.href) + '" aria-label="' + esc(c.title) + '">→</a>';
      return '<article class="pcard reveal" style="--d:' + i * 60 + 'ms">' + (today ? '<span class="pcard__today">Hoy</span>' : "") +
        '<a class="pcard__img" href="' + esc(c.url) + '" target="_blank" rel="noopener" aria-label="' + esc(c.title) + ' en Instagram"><img src="' + esc(c.img) + '" width="900" height="1125" loading="lazy" alt="' + esc(c.title) + '"></a>' +
        '<div class="pcard__foot"><div><h3>' + esc(c.title) + "</h3>" + (c.price != null ? '<p class="pcard__price">' + (c.plus ? "+" : "") + money(c.price) + "</p>" : '<p class="pcard__price pcard__price--info">Almuerzo en Río</p>') + "</div>" + action + "</div></article>";
    }).join("");
    const rail = $("#promoCards"), step = () => Math.min(rail.clientWidth * .8, 900);
    $("#promoPrev").addEventListener("click", () => rail.scrollBy({ left: -step(), behavior: reduced ? "auto" : "smooth" }));
    $("#promoNext").addEventListener("click", () => rail.scrollBy({ left: step(), behavior: reduced ? "auto" : "smooth" }));
  }

  /* ---------- menu ---------- */
  let menuCat = D.menu[0].id, menuOpen = false;
  function renderMenuTabs() {
    $("#menuTabs").innerHTML = D.menu.map((c) => '<button class="tab" role="tab" type="button" data-cat="' + esc(c.id) + '" aria-selected="' + (c.id === menuCat) + '">' + esc(c.name) + "<small>" + esc(c.size) + "</small></button>").join("");
  }
  function itemRow(i) {
    const badges = (i.isNew ? '<span class="badge">Nueva</span>' : "") + (i.veg ? '<span class="badge badge--veg">Sin carne</span>' : "") + (i.special ? '<span class="badge badge--sp">Especial</span>' : "");
    const price = i.price == null ? '<span class="mi__price mi__price--ask">Precio por WhatsApp</span>' : '<span class="mi__price">' + money(i.price) + "</span>";
    return '<div class="mi"><div class="mi__txt"><h3>' + esc(i.name) + badges + "</h3>" + (i.desc ? "<p>" + esc(i.desc) + "</p>" : "") + "</div>" + price + '<button class="add" type="button" data-add="' + esc(i.id) + '" aria-label="Agregar ' + esc(i.name) + '">+</button></div>';
  }
  function renderMenu() {
    const cat = D.menu.find((c) => c.id === menuCat);
    const list = $("#menuList");
    list.innerHTML = cat.items.map(itemRow).join("");
    list.style.animation = "none"; void list.offsetWidth; list.style.animation = "";
    const more = $("#menuMore");
    const clip = cat.items.length > 6 && !menuOpen;
    list.classList.toggle("is-clipped", clip);
    more.hidden = !clip || window.innerWidth > 760;
    more.textContent = "Ver las " + cat.items.length + " ↓";
  }
  $("#menuTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-cat]"); if (!b) return; menuCat = b.dataset.cat; menuOpen = false; renderMenuTabs(); renderMenu(); });
  $("#menuMore").addEventListener("click", () => { menuOpen = true; renderMenu(); });
  window.addEventListener("resize", () => { const cat = D.menu.find((c) => c.id === menuCat); $("#menuMore").hidden = menuOpen || cat.items.length <= 6 || window.innerWidth > 760; });
  function renderAddons() {
    const A = D.addons, out = [];
    if (A.bordes) out.push('<div class="addon reveal"><h3>Bordes</h3><p>Sumale borde a cualquier Río.</p><div class="addon__chips">' + A.bordes.items.map((n, i) => '<button class="xchip" type="button" data-add="borde-' + i + '">+ ' + esc(n) + " <b>" + money(A.bordes.price) + "</b></button>").join("") + "</div></div>");
    if (A.extras) out.push('<div class="addon reveal" style="--d:80ms"><h3>Extras</h3><p>Disponible en todas las sucursales.</p><div class="addon__chips">' + A.extras.items.map((n, i) => '<button class="xchip" type="button" data-add="extra-' + i + '">+ ' + esc(n) + " <b>" + money(A.extras.price) + "</b></button>").join("") + "</div></div>");
    $("#addons").innerHTML = out.join("");
  }

  /* ---------- combos + featured ---------- */
  function renderCombos() {
    $("#combosGrid").innerHTML = D.combos.map((c, i) => '<article class="combo reveal' + (c.star ? " combo--star" : "") + '" style="--d:' + i * 70 + 'ms"><div class="combo__img"><img src="' + esc(c.img) + '" width="720" height="540" loading="lazy" alt="' + esc(c.name) + '">' + (c.hot ? '<span class="combo__badge">Favorito 🔥</span>' : c.star ? '<span class="combo__badge">Para compartir</span>' : "") + '</div><div class="combo__body"><h3>' + esc(c.name) + "</h3><p>" + esc(c.note) + '</p><div class="combo__foot"><span class="price-xl"><small>' + esc(C.currency) + "</small>" + c.price + '</span><button class="add add--cream" type="button" data-add="' + esc(c.id) + '" aria-label="Agregar ' + esc(c.name) + '">+</button></div></div></article>').join("");
    $("#featured").innerHTML = D.featured.map((f, i) => {
      const media = f.video ? '<video muted playsinline loop preload="none" poster="' + esc(f.video) + '.webp" data-auto><source src="' + esc(f.video) + '.mp4" type="video/mp4"></video>' : '<img src="' + esc(f.img) + '" width="900" height="900" loading="lazy" alt="Pizza ' + esc(f.name) + '">';
      return '<article class="feat reveal" style="--d:' + i * 80 + 'ms"><div class="feat__media">' + media + '<span class="feat__tag">' + esc(f.tag) + '</span></div><div class="feat__body"><h3>' + esc(f.name) + "</h3><p>" + esc(f.desc) + '</p><div class="combo__foot"><span class="price-xl"><small>' + esc(C.currency) + "</small>" + f.price + '</span><button class="add add--cream" type="button" data-add="' + esc(f.ref) + '" aria-label="Agregar ' + esc(f.name) + '">+</button></div></div></article>';
    }).join("");
  }

  /* ---------- reels ---------- */
  function renderReels() {
    $("#reelRail").innerHTML = D.reels.map((r) => '<a class="reel" href="' + esc(r.url) + '" target="_blank" rel="noopener"><video muted playsinline loop preload="none" poster="' + esc(r.src) + '.webp" data-auto><source src="' + esc(r.src) + '.mp4" type="video/mp4"></video><span class="reel__play" aria-hidden="true">▶</span><span class="reel__cap"><b>' + esc(r.caption) + "</b><small>Ver en Instagram ↗</small></span></a>").join("");
    const rail = $("#reelRail"), step = () => Math.min(rail.clientWidth * .8, 640);
    $("#reelPrev").addEventListener("click", () => rail.scrollBy({ left: -step(), behavior: reduced ? "auto" : "smooth" }));
    $("#reelNext").addEventListener("click", () => rail.scrollBy({ left: step(), behavior: reduced ? "auto" : "smooth" }));
  }
  function watchVideos() {
    if (reduced || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { const v = e.target; if (e.isIntersecting) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause(); }), { threshold: .35 });
    $$("video[data-auto], .story__media video").forEach((v) => io.observe(v));
  }

  /* ---------- branches ---------- */
  const fmtPhone = (n) => { const d = n.replace(/^591/, ""); return d.slice(0, 3) + " " + d.slice(3); };
  const waHref = (b) => b.whatsapp ? "https://wa.me/" + b.whatsapp : b.waLink;
  function renderBranches() {
    const t = now();
    $("#branches").innerHTML = D.branches.map((b) => {
      const s = branchStatus(b, t);
      const maps = "https://www.google.com/maps/search/" + encodeURIComponent(b.plus || ("Pizza Río " + b.name + " Santa Cruz de la Sierra"));
      return '<article class="br"><div class="br__top"><h3>' + esc(b.name) + '</h3><span class="st st--' + s.cls + '">' + (s.cls === "open" ? '<i class="dot"></i>' : "") + esc(s.label) + "</span></div>" +
        "<p>" + (b.open ? "Delivery " + esc(b.open) + "–" + esc(b.close) : b.opensNote ? esc(b.opensNote) + " · cierre por confirmar" : "Pedidos por WhatsApp") + "</p>" + (b.address ? "<p>" + esc(b.address) + "</p>" : "") +
        '<div class="br__links"><a href="' + esc(maps) + '" target="_blank" rel="noopener">Cómo llegar ↗</a><a href="' + esc(waHref(b)) + '" target="_blank" rel="noopener">WhatsApp ' + (b.whatsapp ? esc(fmtPhone(b.whatsapp)) : "↗") + "</a></div></article>";
    }).join("");
    const sel = $("#branchSel"), cur = sel.value;
    sel.innerHTML = '<option value="">Elegí tu sucursal</option>' + D.branches.map((b, i) => { const s = branchStatus(b, t); return '<option value="' + i + '">' + esc(b.name) + (s.open === true ? " · abierta" : s.open === false ? " · cerrada" : "") + "</option>"; }).join("") + '<option value="cc">Call center · consultas generales</option>';
    sel.value = cur;
    const ws = $("#whereBranch"), wcur = ws.value;
    ws.innerHTML = sel.innerHTML.replace("Elegí tu sucursal", "Elegí tu sucursal…"); ws.value = wcur;
  }

  /* ---------- partner, story, feed ---------- */
  function renderPartner() {
    const p = D.partner, el = $("#alianza");
    if (!p) { el.remove(); return; }
    el.innerHTML = '<div class="wrap partner"><div class="reveal"><p class="partner__by">Pizza Río <span>×</span> ' + esc(p.name) + '</p><h2 class="partner__title">' + esc(p.title) + '</h2><ol class="partner__steps"><li><b>1</b>Comprá tu pizza</li><li><b>2</b>Escaneá el QR</li><li><b>3</b>Registrá tu código</li></ol><p>Y si elegís el Combo Navi, ¡duplicás tus oportunidades de ganar! <small>' + esc(p.fine) + '</small></p><a class="btn btn--red" href="' + esc(p.url) + '" target="_blank" rel="noopener">Ver la publicación ↗</a></div><div class="partner__badge reveal" style="--d:120ms"><svg viewBox="0 0 120 120" aria-hidden="true"><defs><path id="pcirc" d="M60,60 m-47,0 a47,47 0 1,1 94,0 a47,47 0 1,1 -94,0"/></defs><text><textPath href="#pcirc">SORTEAMOS · HONDA NAVI · SANTA CRUZ ·</textPath></text></svg><b>5</b><span>motos Navi</span></div></div>';
  }
  function renderStory() {
    const s = D.story;
    $("#historia").innerHTML = '<div class="wrap story__grid"><div class="story__media reveal"><video muted playsinline loop preload="none" poster="' + esc(s.video) + '.webp"><source src="' + esc(s.video) + '.mp4" type="video/mp4"></video></div><div class="reveal" style="--d:100ms"><p class="eyebrow">Nuestra historia</p><h2 class="display">Volvimos <span class="hl">al inicio.</span></h2><p>' + esc(s.p1) + "</p><p>" + esc(s.p2) + '</p><ol class="timeline">' + s.timeline.map((x) => "<li><b>" + esc(x.big) + "</b><span>" + esc(x.text) + "</span></li>").join("") + "</ol></div></div>";
  }
  function renderFeed() {
    $("#feed").innerHTML = D.feed.map((f) => '<a href="' + esc(f.url) + '" target="_blank" rel="noopener" aria-label="' + esc(f.alt) + ' (Instagram)"><img src="' + esc(f.img) + '" width="900" height="1125" loading="lazy" alt="' + esc(f.alt) + '"></a>').join("");
  }

  /* ---------- backend (Supabase): registra pedidos; si no responde, WhatsApp igual ---------- */
  const CFG = window.PR_CONFIG || {};
  const backendOn = !!(CFG.supabaseUrl && CFG.supabaseKey);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const trackHref = (t) => location.origin + "/" + (CFG.trackPath || "sigue-tu-pizza") + "/?t=" + t;
  const safeWa = (h) => typeof h === "string" && /^https:\/\/(wa\.me|wa\.link)\//.test(h);
  const safeTrack = (h) => { try { const u = new URL(h); return u.protocol === "https:" && u.pathname === "/" + (CFG.trackPath || "sigue-tu-pizza") + "/" && UUID_RE.test(u.searchParams.get("t") || ""); } catch (e) { return false; } };
  const normPhone = (v) => { let d = String(v || "").replace(/\D/g, ""); if (d.length === 11 && d.startsWith("591")) d = d.slice(3); return d.length === 8 && /^[234567]/.test(d) ? d : ""; };
  async function rpc(fn, body) {
    const ctrl = new AbortController(), tm = setTimeout(() => ctrl.abort(), 6000);
    try {
      const r = await fetch(CFG.supabaseUrl.replace(/\/+$/, "") + "/rest/v1/rpc/" + fn, { method: "POST", headers: { "Content-Type": "application/json", apikey: CFG.supabaseKey, Authorization: "Bearer " + CFG.supabaseKey }, body: JSON.stringify(body), signal: ctrl.signal });
      const j = await r.json().catch(() => null);
      return r.ok ? { ok: true, data: j } : { ok: false, code: (j && j.message) || "", network: r.status >= 500 || !(j && j.message) };
    } catch (e) { return { ok: false, network: true }; } finally { clearTimeout(tm); }
  }
  function dbErr(code) {
    if (/^sold_out:/.test(code)) return "Se agotó " + code.slice(9) + " en esa sucursal por hoy 😕. Elegí otra pizza u otra sucursal.";
    return ({
      store_paused: "Esa sucursal pausó los pedidos por un ratito. Probá con otra sucursal 🙏",
      delivery_unavailable: "Esa sucursal no está haciendo delivery ahora. Probá para recoger u otra sucursal.",
      pickup_unavailable: "Esa sucursal no está recibiendo pedidos para recoger ahora.",
      invalid_phone: "Revisá tu celular: son 8 dígitos (ej. 71234567).",
      missing_address: "Necesitamos tu dirección o tu ubicación para el delivery 🏠",
      missing_name: "¿Cómo te llamás? 🙂",
      rate_limited: "Recibimos varios pedidos seguidos desde tu número. Esperá unos minutos 🙏",
      customer_blocked: "No podemos tomar este pedido en línea. Escribinos por WhatsApp.",
      time_in_past: "Esa hora ya pasó. Elegí otra 🕒",
    })[code] || (/^unknown_item:/.test(code) ? "Uno de los productos ya no está disponible. Revisá tu pedido." : "");
  }

  /* ---------- funnel ---------- */
  const flow = $("#flow");
  let flowRef = null, flowRec = null, pin = null;
  const F = (n) => (flow.elements[n] ? flow.elements[n].value : "");
  let step = 1, pickCat = D.menu[0].id;
  const chipVal = (name) => $$('.chips[data-name="' + name + '"] .chip.is-on').map((c) => c.dataset.v || c.textContent.trim());
  const intent = () => (flow.querySelector('input[name="intent"]:checked') || {}).value || "delivery";
  function setIntent(v) { const r = flow.querySelector('input[name="intent"][value="' + v + '"]'); if (r) r.checked = true; syncIntent(); }
  function syncIntent() {
    const i = intent(), isOrder = i === "delivery" || i === "pickup";
    $$('[data-for="order"]', flow).forEach((x) => (x.hidden = !isOrder));
    $$('[data-for="event"]', flow).forEach((x) => (x.hidden = i !== "event"));
    $$('[data-for="question"]', flow).forEach((x) => (x.hidden = i !== "question"));
    $$('[data-for="delivery"]', flow).forEach((x) => (x.hidden = i !== "delivery"));
    $$('[data-for="when"]', flow).forEach((x) => (x.hidden = !isOrder));
    updatePreview();
  }
  function goStep(n) {
    step = n;
    $$(".step", flow).forEach((f) => (f.hidden = +f.dataset.step !== n));
    $$("#steps button").forEach((b) => { b.classList.toggle("is-on", +b.dataset.step === n); b.classList.toggle("is-done", +b.dataset.step < n); });
    $("#flowBack").style.visibility = n === 1 ? "hidden" : "visible";
    $("#flowNext").hidden = n === 4;
    $("#flowMsg").textContent = "";
    if (n === 4) {
      if (!flowRec) flowRef = "web-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2));
      $("#summary").textContent = buildMsg(); $("#sendWa").href = target().href;
    }
  }
  function validate(n) {
    const i = intent();
    if (n === 2 && (i === "delivery" || i === "pickup") && !cart.length) return "Agregá al menos una pizza 🍕";
    if (n === 2 && i === "question" && !F("qText").trim()) return "Contanos tu consulta 🙂";
    if (n === 2 && i === "event" && !F("evDate")) return "Elegí una fecha para tu evento 📅";
    if (n === 3 && !F("name").trim()) return "¿Cómo te llamás? 🙂";
    if (n === 3 && (i === "delivery" || i === "pickup") && !normPhone(F("phone"))) return "Tu celular de WhatsApp (8 dígitos) para avisarte del pedido 📱";
    if (n === 3 && i === "delivery" && !F("address").trim() && !pin) return "Necesitamos tu dirección (o tocá «Usar mi ubicación») 🏠";
    return "";
  }
  $("#flowNext").addEventListener("click", () => { const err = validate(step); if (err) { $("#flowMsg").textContent = err; return; } goStep(step + 1); });
  $("#flowBack").addEventListener("click", () => goStep(Math.max(1, step - 1)));
  $("#steps").addEventListener("click", (e) => { const b = e.target.closest("[data-step]"); if (!b) return; const n = +b.dataset.step; for (let k = step; k < n; k++) { const err = validate(k); if (err) { $("#flowMsg").textContent = err; return; } } goStep(n); });
  flow.addEventListener("change", (e) => { if (e.target.name === "intent") syncIntent(); updatePreview(); });
  // cualquier cambio después de registrar el pedido arma un pedido nuevo
  const resetRec = () => { if (flowRec) { flowRec = null; $("#flowOk").hidden = true; } };
  flow.addEventListener("input", () => { resetRec(); updatePreview(); });
  $("#pinBtn").addEventListener("click", () => {
    const b = $("#pinBtn");
    if (!navigator.geolocation) { toast("Tu navegador no comparte ubicación: escribí la dirección 🏠"); return; }
    b.disabled = true; b.firstChild.textContent = "📍 Buscando tu ubicación… ";
    navigator.geolocation.getCurrentPosition((p) => {
      pin = { lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 };
      b.disabled = false; b.classList.add("is-on"); b.firstChild.textContent = "✅ Ubicación guardada ";
      resetRec(); updatePreview();
    }, () => { b.disabled = false; b.firstChild.textContent = "📍 Usar mi ubicación "; toast("No pudimos obtener tu ubicación: escribí la dirección 🏠"); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
  flow.addEventListener("click", (e) => {
    const c = e.target.closest(".chip"); if (!c) return;
    const g = c.parentElement;
    if (g.hasAttribute("data-single")) $$(".chip", g).forEach((x) => x.classList.toggle("is-on", x === c)); else c.classList.toggle("is-on");
    if (g.dataset.name === "when") $(".when-time", flow).hidden = c.dataset.v !== "later";
    updatePreview();
  });
  function renderPicker() {
    $("#pickTabs").innerHTML = [{ id: "combos", name: "Combos" }].concat(D.menu).map((c) => '<button class="tab" type="button" data-pc="' + esc(c.id) + '" aria-selected="' + (c.id === pickCat) + '">' + esc(c.name) + "</button>").join("");
    const items = pickCat === "combos" ? D.combos.map((c) => ({ id: c.id, name: c.name, price: c.price })) : D.menu.find((c) => c.id === pickCat).items;
    $("#pickList").innerHTML = items.map((i) => '<button class="pick" type="button" data-add="' + esc(i.id) + '"><span>' + esc(i.name) + "</span><em>" + (i.price == null ? "consultar" : money(i.price)) + " +</em></button>").join("");
  }
  $("#pickTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-pc]"); if (!b) return; pickCat = b.dataset.pc; renderPicker(); });
  function renderFlowCart() {
    const t = totals();
    $("#flowCart").innerHTML = cart.length ? cart.map((l) => { const it = allItems[l.id]; return '<div class="line"><span>' + l.qty + " × " + esc(it.name) + "</span><b>" + (it.price == null ? "a confirmar" : money(it.price * l.qty)) + "</b></div>"; }).join("") + '<div class="line"><span>Total</span><b>' + esc(totalLabel(t)) + "</b></div>" : '<p class="empty">Tu pedido está vacío. Elegí abajo 👇</p>';
  }
  function target() {
    const v = $("#branchSel").value, b = v !== "" && v !== "cc" ? D.branches[+v] : null;
    const text = encodeURIComponent(buildMsg());
    if (b && b.whatsapp) return { name: "Pizza Río · " + b.name, num: "+591 " + fmtPhone(b.whatsapp), href: "https://wa.me/" + b.whatsapp + "?text=" + text };
    if (b && b.waLink) return { name: "Pizza Río · " + b.name, num: "WhatsApp de la sucursal", href: b.waLink, copy: true };
    return { name: "Pizza Río · Call center", num: "+591 " + fmtPhone(C.callCenter), href: "https://wa.me/" + C.callCenter + "?text=" + text };
  }
  function buildMsg() {
    const i = intent(), L = [];
    const v = $("#branchSel").value, b = v !== "" && v !== "cc" ? D.branches[+v] : null;
    if (i === "delivery" || i === "pickup") {
      L.push("¡Hola Pizza Río! 👋🍕 Quiero hacer un pedido " + (i === "delivery" ? "para *delivery*" : "para *pasar a recoger*") + ":");
      cart.forEach((l) => { const it = allItems[l.id]; L.push("• " + l.qty + " × " + it.name + ": " + (it.price == null ? "precio a confirmar" : money(it.price * l.qty))); });
      if (cart.length) L.push("*Total: " + totalLabel(totals()) + "*");
    } else if (i === "event") {
      L.push("¡Hola Pizza Río! 👋 Quiero consultar por una *mesa / evento*:");
      if (F("evDate")) L.push("📅 " + F("evDate") + (F("evTime") ? " a las " + F("evTime") : ""));
      if (F("evPeople")) L.push("👥 " + F("evPeople") + " personas");
      const oc = chipVal("occasion"); if (oc.length) L.push("🎉 " + oc.join(", "));
      if (F("evNote").trim()) L.push("📝 " + F("evNote").trim());
    } else {
      L.push("¡Hola Pizza Río! 👋 Tengo una *consulta*" + (chipVal("topic").length ? " sobre " + chipVal("topic").join(", ").toLowerCase() : "") + ":");
      if (F("qText").trim()) L.push(F("qText").trim());
    }
    L.push("");
    const ph = normPhone(F("phone"));
    if (F("name").trim()) L.push("👤 " + F("name").trim() + (ph ? " · +591 " + fmtPhone(ph) : ""));
    L.push("📍 " + (b ? "Sucursal " + b.name : "Call center"));
    if (i === "delivery") { if (F("address").trim()) L.push("🏠 " + F("address").trim()); if (F("ref").trim()) L.push("↪ " + F("ref").trim()); if (pin) L.push("📌 Ubicación: https://maps.google.com/?q=" + pin.lat + "," + pin.lng); }
    if (i === "delivery" || i === "pickup") { const w = chipVal("when")[0]; L.push("🕒 " + (w === "later" && F("whenTime") ? "Para las " + F("whenTime") : "Lo antes posible")); }
    if (F("note").trim()) L.push("💬 " + F("note").trim());
    if (flowRec && (i === "delivery" || i === "pickup")) L.push("", "🧾 Pedido " + flowRec.code, "Seguí tu pedido: " + trackHref(flowRec.token));
    return L.join("\n");
  }
  function fmtWa(s) { return esc(s).replace(/\*([^*\n]+)\*/g, "<b>$1</b>"); }
  function updatePreview() {
    const tg = target(), t = now();
    $("#phName").textContent = tg.name; $("#phNum").textContent = tg.num;
    $("#phOut").innerHTML = fmtWa(buildMsg()) + "<time>" + esc(t.hhmm) + "</time>";
    $$("#phChat time")[0].textContent = t.hhmm;
    const chat = $("#phChat"); chat.scrollTop = chat.scrollHeight;
    if (step === 4) { $("#summary").textContent = buildMsg(); $("#sendWa").href = tg.href; }
  }
  let sending = false;
  function openWa(w) {
    const tg = target(), bv = $("#branchSel").value;
    if (cart.length) store.set("pr-last-order", { cart: cart.map((l) => ({ id: l.id, qty: l.qty })), branch: bv !== "" && bv !== "cc" ? +bv : null, mode: intent(), code: flowRec ? flowRec.code : null, track: flowRec ? flowRec.token : null });
    $("#sendWa").href = tg.href;
    if (tg.copy && navigator.clipboard) navigator.clipboard.writeText(buildMsg()).then(() => toast("Copiamos tu mensaje: pegalo en el chat 📋"), () => {});
    if (w) { try { w.opener = null; w.location.href = tg.href; } catch (e) { location.href = tg.href; } }
  }
  $("#sendWa").addEventListener("click", async (e) => {
    const i = intent(), bv = $("#branchSel").value, b = bv !== "" && bv !== "cc" ? D.branches[+bv] : null;
    const record = backendOn && (i === "delivery" || i === "pickup") && cart.length && b && b.id && !flowRec;
    if (!record) { openWa(null); return; }
    e.preventDefault();
    if (sending) return; sending = true;
    const w = window.open("", "_blank"); // se abre ya (en el clic) para que el navegador no lo bloquee
    const btn = $("#sendWa"); btn.classList.add("is-busy"); $("#flowMsg").textContent = "Registrando tu pedido…";
    const when = chipVal("when")[0] === "later" && F("whenTime") ? F("whenTime") : null;
    const r = await rpc("place_order", { payload: {
      client_ref: flowRef, channel: "web", store: b.id, service: i, customer_name: F("name").trim(), customer_phone: normPhone(F("phone")),
      address: i === "delivery" ? F("address").trim() || null : null, reference: i === "delivery" ? F("ref").trim() || null : null,
      lat: i === "delivery" && pin ? pin.lat : null, lng: i === "delivery" && pin ? pin.lng : null, scheduled_for: when, notes: F("note").trim() || null,
      items: cart.map((l) => ({ id: (allItems[l.id] && allItems[l.id].aliasOf) || l.id, qty: l.qty })),
    } });
    sending = false; btn.classList.remove("is-busy"); $("#flowMsg").textContent = "";
    if (r.ok && r.data && r.data.code && UUID_RE.test(r.data.tracking_token || "")) {
      flowRec = { code: r.data.code, token: r.data.tracking_token };
      const ok = $("#flowOk");
      ok.innerHTML = "<b>✅ Pedido " + esc(flowRec.code) + (r.data.order_no ? " · #" + esc(r.data.order_no) : "") + " registrado</b><span>Enviá el mensaje por WhatsApp para que la sucursal lo confirme.</span><a href=\"" + esc(trackHref(flowRec.token)) + "\" target=\"_blank\" rel=\"noopener\">📍 Seguí tu pedido</a>";
      ok.hidden = false;
      $("#summary").textContent = buildMsg(); updatePreview();
    } else if (!r.network && dbErr(r.code)) {
      if (w) w.close();
      $("#flowMsg").textContent = dbErr(r.code);
      return;
    }
    // base caída: el pedido igual sale por WhatsApp (nunca se pierde)
    openWa(w || null);
    if (!w) location.href = target().href;
  });

  /* ---------- Ría: asistente de pedidos (texto + voz) ---------- */
  const ria = $("#ria"), log = $("#riaLog"), input = $("#riaInput");
  let hist = store.get("ria-hist", sessionStorage) || [], busy = false, riaReturn = null;
  let riaOrder = store.get("ria-order", sessionStorage) || {};
  let placed = store.get("ria-placed", sessionStorage) || [];
  let riaStage = store.get("ria-stage", sessionStorage) || {};
  let persona = null;
  fetch("persona/catchphrases.json").then((r) => (r.ok ? r.json() : null)).then((j) => (persona = j)).catch(() => {});
  const usedLines = new Set();
  function line(tag, fallback) {
    const arr = persona && Array.isArray(persona[tag]) ? persona[tag].filter((x) => !usedLines.has(x)) : [];
    if (!arr.length) return fallback;
    const x = arr[Math.floor(Math.random() * arr.length)]; usedLines.add(x); return x;
  }
  const lastOrder = () => store.get("pr-last-order");
  function chipsDefault() {
    const lo = lastOrder();
    return (lo && lo.track ? ["¿Dónde está mi pizza?"] : []).concat(lo && lo.cart && lo.cart.length ? ["Lo de siempre 🍕"] : []).concat(["¿Qué promo hay hoy?", "Quiero una pizza sin carne", "¿Qué trae la Churrasco?", "Hablar con una persona"]);
  }
  function setChips(list) { $("#riaChips").innerHTML = (list || []).map((c) => '<button type="button">' + esc(c) + "</button>").join(""); }
  function md(s) {
    const lines = esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").split("\n");
    let out = "", inList = false;
    lines.forEach((l) => {
      const m = l.match(/^\s*[-•]\s+(.*)/);
      if (m) { if (!inList) { out += "<ul>"; inList = true; } out += "<li>" + m[1] + "</li>"; }
      else { if (inList) { out += "</ul>"; inList = false; } if (l.trim()) out += "<p>" + l + "</p>"; }
    });
    return out + (inList ? "</ul>" : "");
  }
  function bubble(role, html) { const d = document.createElement("div"); d.className = "msg msg--" + role; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
  function renderRiaCart() {
    const t = totals(), el = $("#riaCart");
    el.hidden = !t.count;
    el.innerHTML = '<span>🛒 Tu pedido: <b>' + t.count + "</b> · " + esc(totalLabel(t)) + "</span><small>Ver</small>";
  }
  function renderRia() {
    log.innerHTML = "";
    const lo = lastOrder();
    const hello = lo && lo.cart && lo.cart.length ? line("returning", "¡Volviste! ¿Te armo lo de siempre?") : line("greeting", "¡Hola! Soy Ría 🍕 ¿Qué se te antoja hoy?");
    bubble("bot", md("**" + hello + "** Pedime todo en una frase o preguntame lo que quieras."));
    hist.forEach((m) => bubble(m.role === "user" ? "user" : "bot", m.role === "user" ? esc(m.content) : md(m.content)));
    setChips(hist.length ? [] : chipsDefault());
    renderRiaCart();
  }
  function openRia() { riaReturn = document.activeElement; ria.hidden = false; renderRia(); input.focus(); updateMbar(); }
  function closeRia() { stopVoice(); ria.hidden = true; updateMbar(); if (riaReturn) riaReturn.focus(); }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-ria-open]")) { e.preventDefault(); closeNav(); openRia(); } });
  $("#riaClose").addEventListener("click", closeRia);
  $("#riaCart").addEventListener("click", () => { openDrawer(); });
  $("#riaChips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) ask(b.textContent.replace(/\s*🍕$/, "")); });
  $("#riaForm").addEventListener("submit", (e) => { e.preventDefault(); const v = input.value.trim(); if (v) { input.value = ""; ask(v); } });
  const ERR_LINKS = '<div class="msg__links"><a href="#menu" data-close-ria>Ver menú</a><a href="#pedir" data-close-ria>Pedir por WhatsApp</a></div>';
  log.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-ria]")) closeRia();
    const send = e.target.closest("[data-wa-copy]");
    if (send && navigator.clipboard) navigator.clipboard.writeText(send.dataset.waCopy).then(() => toast("Copiamos tu pedido: pegalo en el chat 📋"), () => {});
  });
  function errorMsg(status) {
    if ([503, 404, 501, 405].includes(status)) return "Ría se está preparando y muy pronto te va a atender 🛠️.";
    if (status === 429) return "¡Uy, muchas preguntas seguidas! Esperá un minutito 🙏.";
    return "Se me cortó la conexión 😅. Probá de nuevo en un ratito.";
  }

  /* eventos que manda el servidor (las herramientas) */
  function applyEvent(ev, botEl) {
    if (!ev || !ev.type) return;
    if (ev.type === "cart.updated" && Array.isArray(ev.cart)) {
      cart = ev.cart.filter((l) => allItems[l.id]).map((l) => ({ id: l.id, qty: l.qty }));
      saveCart(); renderRiaCart();
      const c = $("#cartCount"); c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump");
    } else if (ev.type === "order.updated" && ev.order) {
      riaOrder = ev.order; store.set("ria-order", riaOrder, sessionStorage);
      // multimodal: el armador de pedidos de la página refleja lo que se dijo
      if (ev.order.mode) setIntent(ev.order.mode);
      if (Number.isInteger(ev.order.branch)) $("#branchSel").value = String(ev.order.branch); else if (ev.order.branch === "cc") $("#branchSel").value = "cc";
      if (ev.order.name) flow.elements.name.value = ev.order.name;
      if (ev.order.address) flow.elements.address.value = ev.order.address;
      if (ev.order.reference) flow.elements.ref.value = ev.order.reference;
      if (ev.order.note) flow.elements.note.value = ev.order.note;
      if (ev.order.phone) flow.elements.phone.value = ev.order.phone;
      updatePreview();
    } else if (ev.type === "state") {
      riaStage = { stage: ev.stage, token: ev.token }; store.set("ria-stage", riaStage, sessionStorage);
    } else if (ev.type === "location") {
      const d = document.createElement("div");
      d.className = "order-card order-card--pin";
      d.innerHTML = '<b>Entrega con Pin</b><button type="button" class="btn btn--red btn--block">📍 Compartir mi ubicación</button><small>Solo la usamos para este delivery.</small>';
      d.querySelector("button").addEventListener("click", (e2) => {
        const btn = e2.currentTarget;
        if (!navigator.geolocation) { toast("Tu navegador no comparte ubicación: escribí la dirección 🏠"); return; }
        btn.disabled = true; btn.textContent = "📍 Buscando…";
        navigator.geolocation.getCurrentPosition((p) => {
          riaOrder = Object.assign({}, riaOrder, { lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 });
          store.set("ria-order", riaOrder, sessionStorage);
          pin = { lat: riaOrder.lat, lng: riaOrder.lng }; $("#pinBtn").classList.add("is-on");
          btn.textContent = "✅ Ubicación compartida";
          ask("📍 Ubicación compartida");
        }, () => { btn.disabled = false; btn.textContent = "📍 Compartir mi ubicación"; toast("No pudimos obtener tu ubicación: escribí la dirección 🏠"); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
      });
      log.insertBefore(d, botEl && botEl.nextSibling);
    } else if (ev.type === "track") {
      if (!safeTrack(ev.href)) return;
      const d = document.createElement("div");
      d.className = "order-card order-card--track";
      d.innerHTML = "<b>Pedido " + esc(ev.code || "") + '</b><a class="btn btn--red btn--block" href="' + esc(ev.href) + '" target="_blank" rel="noopener">📍 Seguí tu pedido</a>';
      log.insertBefore(d, botEl && botEl.nextSibling);
    } else if (ev.type === "chips") {
      setChips(ev.chips);
    } else if (ev.type === "order.ready") {
      if (!safeWa(ev.href)) return;
      if (!placed.includes(ev.token)) { placed.push(ev.token); store.set("ria-placed", placed.slice(-10), sessionStorage); }
      const track = ev.track && UUID_RE.test(ev.track) ? ev.track : null;
      store.set("pr-last-order", { cart: ev.cart, branch: Number.isInteger(ev.branch) ? ev.branch : null, mode: ev.mode || null, code: track ? ev.code : null, track });
      const card = document.createElement("div");
      card.className = "order-card";
      card.innerHTML = "<b>" + (track ? "Pedido " + esc(ev.code) + " listo ✅" : "Tu pedido está listo para enviar") + "</b><pre>" + esc(ev.message) + '</pre><a class="btn btn--wa btn--block" href="' + esc(ev.href) + '" target="_blank" rel="noopener"' + (ev.copy ? ' data-wa-copy="' + esc(ev.message) + '"' : "") + ">Enviar por " + esc(ev.label) + " →</a>" +
        (track && safeTrack(ev.trackUrl) ? '<a class="btn btn--ghost btn--block" href="' + esc(ev.trackUrl) + '" target="_blank" rel="noopener">📍 Seguí tu pedido</a>' : "") +
        "<small>La sucursal confirma el pago y el tiempo por WhatsApp.</small>";
      log.insertBefore(card, botEl && botEl.nextSibling);
      setChips([]);
    } else if (ev.type === "handoff") {
      if (!safeWa(ev.href)) return;
      const d = document.createElement("div");
      d.className = "order-card order-card--handoff";
      d.innerHTML = '<b>Te paso con una persona</b><a class="btn btn--wa btn--block" href="' + esc(ev.href) + '" target="_blank" rel="noopener">' + esc(ev.label) + " por WhatsApp →</a>";
      log.insertBefore(d, botEl && botEl.nextSibling);
    }
  }
  function decodeUi(b64) {
    try { const bin = atob(b64); const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0)); return JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { return null; }
  }

  async function ask(q, opts) {
    if (busy) return; busy = true;
    const voice = !!(opts && opts.voice);
    setChips([]);
    hist.push({ role: "user", content: q.slice(0, 1200) });
    bubble("user", esc(q));
    const bot = bubble("bot", '<span class="typing" aria-label="Ría está escribiendo"><i></i><i></i><i></i></span>');
    setState(voice ? "thinking" : "idle");
    let raw = "", text = "", status = 0;
    const state = { cart: cart.map((l) => ({ id: l.id, qty: l.qty })), order: riaOrder, lastOrder: lastOrder(), placed, stage: riaStage.stage, token: riaStage.token };
    try {
      const res = await fetch("/api/ria", { method: "POST", headers: { "Content-Type": "application/json", "x-ria-client": "web" }, body: JSON.stringify({ messages: hist.slice(-16), state, channel: voice ? "voice" : "text" }) });
      status = +(res.headers.get("X-Ria-Status") || res.status);
      if (status !== 200 || !res.ok || !res.body) throw new Error("http");
      const reader = res.body.getReader(), dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        raw += dec.decode(value, { stream: true });
        // separa eventos [[ui:...]] completos del texto
        let m;
        while ((m = raw.match(/\[\[ui:([A-Za-z0-9+/=]+)\]\]/))) {
          text += raw.slice(0, m.index); raw = raw.slice(m.index + m[0].length);
          applyEvent(decodeUi(m[1]), bot);
        }
        const pend = raw.indexOf("[[");
        const safe = pend === -1 ? raw : raw.slice(0, pend);
        if (/\[\[error\]\]/.test(raw)) throw new Error("stream");
        if (text + safe) bot.innerHTML = md(text + safe);
        log.scrollTop = log.scrollHeight;
      }
      text += raw.replace(/\[\[[^\]]*\]\]/g, "");
      text = text.trim();
      if (!text) throw new Error("empty");
      bot.innerHTML = md(text);
      hist.push({ role: "assistant", content: text });
      if (voice) speak(text); else setState("idle");
    } catch (e) {
      hist.pop();
      bot.innerHTML = "<p>" + esc(errorMsg(status)) + "</p>" + ERR_LINKS;
      if (voice) speak(errorMsg(status)); else setState("idle");
    }
    hist = hist.slice(-20); store.set("ria-hist", hist, sessionStorage);
    busy = false; log.scrollTop = log.scrollHeight;
    if (!$("#riaChips").innerHTML && !hist.length) setChips(chipsDefault());
  }

  /* ---------- modo voz: micrófono, habla, manos libres, wake lock ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canSpeak = "speechSynthesis" in window;
  let rec = null, listening = false, speaking = false, wakeLock = null;
  const micBtn = $("#riaMic"), hands = $("#riaHands");
  const STATE_TXT = { idle: "Tu asistente de pedidos", listening: "Te escucho…", thinking: "Pensando…", speaking: "Hablando… (tocá el micrófono para interrumpir)" };
  function setState(sname) {
    ria.dataset.voice = sname;
    $("#riaState span").textContent = sname === "listening" ? line("voice_listening", STATE_TXT.listening) : STATE_TXT[sname] || STATE_TXT.idle;
    micBtn.setAttribute("aria-pressed", String(sname === "listening"));
  }
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => (wakeLock = null)); }
      if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { /* sin wake lock */ }
  }
  function voiceText(t) {
    return t.replace(/\*\*/g, "").replace(/https?:\/\/\S+/g, "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .replace(/\+?Bs\.?\s?(\d+)/g, (m0, n) => (m0.startsWith("+") ? "más " : "") + n + " bolivianos").replace(/^\s*[-•]\s*/gm, "").replace(/\s+/g, " ").trim();
  }
  function pickVoice() {
    const vs = speechSynthesis.getVoices();
    return vs.find((v) => /es[-_](BO|419|MX|AR|US)/i.test(v.lang)) || vs.find((v) => /^es/i.test(v.lang)) || null;
  }
  function speak(t) {
    if (!canSpeak) { setState("idle"); afterSpeak(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(voiceText(t));
    const v = pickVoice(); if (v) u.voice = v;
    u.lang = v ? v.lang : "es-419"; u.rate = 1.05;
    u.onstart = () => { speaking = true; setState("speaking"); };
    u.onend = u.onerror = () => { speaking = false; setState("idle"); afterSpeak(); };
    speechSynthesis.speak(u);
  }
  function afterSpeak() { if (hands.checked && !ria.hidden) setTimeout(startListening, 250); else keepAwake(false); }
  function startListening() {
    if (!SR || listening || busy) return;
    if (speaking) { speechSynthesis.cancel(); speaking = false; } // interrumpir a Ría (barge-in)
    rec = new SR();
    rec.lang = "es-BO"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    let finalText = "", lastConf = 1;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { finalText += r[0].transcript; lastConf = r[0].confidence || 1; } else interim += r[0].transcript;
      }
      input.value = (finalText + interim).trim();
    };
    rec.onerror = (e) => { listening = false; setState("idle"); if (e.error === "not-allowed" || e.error === "service-not-allowed") { toast("Permití el micrófono para hablar con Ría 🎙️"); hands.checked = false; } };
    rec.onend = () => {
      listening = false;
      const said = finalText.trim();
      input.value = "";
      if (!said) { setState("idle"); if (hands.checked) setTimeout(startListening, 400); else keepAwake(false); return; }
      if (localCommand(said)) return;
      if (lastConf > 0 && lastConf < 0.45) { bubble("bot", md("No te escuché bien 🙈 ¿Lo repetís o lo escribís?")); setChips(chipsDefault()); setState("idle"); return; }
      ask(said, { voice: true });
    };
    listening = true; setState("listening"); keepAwake(true);
    try { rec.start(); } catch (e) { listening = false; setState("idle"); }
  }
  function stopVoice() { try { if (rec) rec.abort(); } catch (e) {} listening = false; if (canSpeak) speechSynthesis.cancel(); speaking = false; keepAwake(false); setState("idle"); }
  // comandos de voz que no necesitan a la IA
  function localCommand(t) {
    const n = t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    if (/^(para|basta|silencio|callate|stop)$/.test(n)) { stopVoice(); hands.checked = false; return true; }
    return false;
  }
  if (SR) {
    micBtn.hidden = false; $("#riaHandsWrap").hidden = false;
    micBtn.addEventListener("click", () => { if (listening) { try { rec.stop(); } catch (e) {} } else startListening(); });
    hands.addEventListener("change", () => { if (hands.checked) startListening(); else stopVoice(); });
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopVoice(); });
  setState("idle");

  /* ---------- nav, mbar, reveal ---------- */
  const nav = $("#nav");
  function closeNav() {}
  const mbar = $("#mbar");
  const zones = ["#top", "#pedir", ".foot"].map((s) => $(s));
  const vis = new Map();
  function updateMbar() { const hide = [...vis.values()].some(Boolean) || !ria.hidden || !drawer.hidden; mbar.classList.toggle("is-hidden", hide); }
  if ("IntersectionObserver" in window) {
    const zo = new IntersectionObserver((es) => { es.forEach((e) => vis.set(e.target, e.isIntersecting && e.intersectionRatio > .25)); updateMbar(); }, { threshold: [0, .25, .5] });
    zones.forEach((z) => z && zo.observe(z));
  }
  const onScroll = () => nav.classList.toggle("is-solid", window.scrollY > 40);
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  function reveal() {
    const els = $$(".reveal:not(.is-in)");
    if (reduced || !("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("is-in")); return; }
    const ro = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); ro.unobserve(e.target); } }), { threshold: .12 });
    els.forEach((e) => ro.observe(e));
  }

  /* ---------- init ---------- */
  renderLive(); renderHero(); startHero(); renderPromoCards(); renderMenuTabs(); renderMenu(); renderAddons(); renderCombos(); renderReels();
  renderBranches(); renderPartner(); renderStory(); renderFeed(); renderPicker(); renderCart(); renderFlowCart(); syncIntent(); goStep(1);
  $("#year").textContent = new Date().getFullYear();
  watchVideos(); reveal();
  if (window.matchMedia("(max-width: 760px)").matches) $$(".foot details").forEach((d) => (d.open = false));
  setInterval(() => { renderLive(); renderBranches(); updatePreview(); }, 60000);
})();
