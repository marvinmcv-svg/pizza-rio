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
  const allItems = {};
  D.menu.forEach((c) => c.items.forEach((i) => (allItems[i.id] = { id: i.id, name: "Pizza " + i.name, price: i.price })));
  D.combos.forEach((c) => (allItems[c.id] = { id: c.id, name: c.name, price: c.price }));
  D.weekly.forEach((w) => { if (!allItems[w.id]) allItems[w.id] = { id: w.id, name: w.title, price: w.price }; });
  if (D.addons.bordes) D.addons.bordes.items.forEach((n, i) => (allItems["borde-" + i] = { id: "borde-" + i, name: n, price: D.addons.bordes.price }));
  if (D.addons.extras) D.addons.extras.items.forEach((n, i) => (allItems["extra-" + i] = { id: "extra-" + i, name: n, price: D.addons.extras.price }));
  if (D.yapa) allItems["yapa-" + D.yapa.id] = { id: "yapa-" + D.yapa.id, name: D.yapa.name + " (martes)", price: D.yapa.price };
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
  function saveCart() { store.set("pr-cart", cart); renderCart(); renderFlowCart(); updatePreview(); }
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

  /* ---------- hero ---------- */
  function renderLive() {
    const t = now(), p = todayPromo(t);
    const known = D.branches.filter((b) => b.open);
    const openKnown = known.filter((b) => branchStatus(b, t).open).map((b) => b.name);
    let txt = D.branches.length + " sucursales en " + C.city;
    if (openKnown.length) txt += " · " + openKnown.join(", ") + " abierta ahora";
    txt += " · Hoy: " + (p ? p.title + " a " + money(p.price) : "Combo Río 2 pa' 2 a " + money(92));
    $("#livePill span").textContent = txt;
    $("#clock").innerHTML = "<b>" + esc(t.hhmm) + "</b> en " + esc(C.city) + " · " + D.branches.length + " sucursales";
  }
  $("#stats").innerHTML = D.stats.map((s) => '<li><b data-count="' + s.value + '" data-dec="' + (s.decimals || 0) + '" data-suf="' + esc(s.suffix) + '">' + (reduced ? s.value + s.suffix : "0") + "</b><span>" + esc(s.label) + "</span></li>").join("");
  function countUp() {
    if (reduced) return;
    $$("[data-count]").forEach((el) => {
      const to = +el.dataset.count, dec = +el.dataset.dec, suf = el.dataset.suf, t0 = performance.now();
      const tick = (t) => { const k = Math.min(1, (t - t0) / 1400), v = to * (1 - Math.pow(1 - k, 3)); el.textContent = v.toFixed(dec) + suf; if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  }
  const fan = $("#fan");
  if (!reduced && window.matchMedia("(pointer: fine)").matches) {
    $(".hero").addEventListener("pointermove", (e) => { const r = fan.getBoundingClientRect(); fan.style.setProperty("--mx", ((e.clientX - r.left) / r.width - .5) * 2); fan.style.setProperty("--my", ((e.clientY - r.top) / r.height - .5) * 2); });
  }
  if (reduced) $$("#fan video").forEach((v) => { v.removeAttribute("autoplay"); v.pause(); });

  /* ---------- marquee ---------- */
  const mq = ["Combo Río 2 pa' 2", "Martes de ChocloMix", "Pizza Churrasco", "Borde Catupiry", "21 sucursales", "#ConVosEnTodas", "Combo Buri"];
  const mqHtml = mq.map((x) => "<span>" + esc(x) + "</span><i>✦</i>").join("");
  $("#marquee").innerHTML = mqHtml + mqHtml;

  /* ---------- weekly ---------- */
  function renderWeekly() {
    const t = now();
    $("#weekly").innerHTML = D.weekly.filter((w) => active(w, t)).map((w, i) => {
      const today = w.day === t.dow;
      const day = w.day == null ? "Todos los días" : (w.name || DAYS[w.day]);
      return '<article class="wk reveal' + (today ? " is-today" : "") + '" style="--d:' + i * 70 + 'ms">' + (today ? '<span class="wk__tag">Hoy</span>' : "") +
        '<span class="wk__day">' + esc(day) + "</span><h3>" + esc(w.title) + "</h3><p>" + esc(w.desc) + "</p>" +
        (w.until ? '<span class="wk__pill">Hasta el ' + esc(w.until.split("-").reverse().slice(0, 2).join("/")) + "</span>" : w.plus ? '<span class="wk__pill">Extra para tu pizza</span>' : '<span class="wk__pill">' + esc(w.name) + "</span>") +
        '<div class="wk__price"><small>' + (w.plus ? "+" : "") + esc(C.currency) + "</small>" + w.price + "</div></article>";
    }).join("");
  }

  /* ---------- spotlight ---------- */
  function renderSpot() {
    const y = D.yapa, t = now(), el = $("#especial");
    if (!y || !active(y, t)) { el.remove(); return; }
    el.innerHTML = '<div class="wrap spot__grid"><div class="spot__img reveal"><img src="' + esc(y.img) + '" width="900" height="1125" loading="lazy" alt="' + esc(y.name) + ' a ' + money(y.price) + '"></div><div class="reveal" style="--d:100ms"><p class="eyebrow">Todos los martes de ' + esc(y.month) + '</p><h2 class="spot__title">' + esc(y.name) + '</h2><p class="spot__lede">' + esc(y.lede) + '</p><div class="spot__price"><small>' + esc(C.currency) + "</small>" + y.price + '</div><button class="btn btn--mustard btn--lg" type="button" data-add="yapa-' + esc(y.id) + '">Agregar al pedido</button><p class="spot__fine">Válido los martes hasta el 30 de ' + esc(y.month) + ".</p></div></div>";
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
    $$("video[data-auto], #fan video, .story__media video").forEach((v) => io.observe(v));
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
  }

  /* ---------- partner, story, feed ---------- */
  function renderPartner() {
    const p = D.partner, el = $("#alianza");
    if (!p) { el.remove(); return; }
    el.innerHTML = '<div class="wrap partner"><div class="reveal"><p class="eyebrow">Alianza · ' + esc(p.name) + '</p><h2 class="partner__title">' + esc(p.title) + "</h2><p>" + esc(p.copy) + '</p><p><small>' + esc(p.fine) + '</small></p><a class="btn btn--cream" href="' + esc(p.url) + '" target="_blank" rel="noopener">Ver la publicación ↗</a></div><div class="partner__card reveal" style="--d:120ms"><b>5</b><span>Honda Navi<br>en sorteo</span><small>Comprá · escaneá el QR · registrá tu código</small></div></div>';
  }
  function renderStory() {
    const s = D.story;
    $("#historia").innerHTML = '<div class="wrap story__grid"><div class="story__media reveal"><video muted playsinline loop preload="none" poster="' + esc(s.video) + '.webp"><source src="' + esc(s.video) + '.mp4" type="video/mp4"></video></div><div class="reveal" style="--d:100ms"><p class="eyebrow">Nuestra historia</p><h2 class="display">Volvimos <span class="hl">al inicio.</span></h2><p>' + esc(s.p1) + "</p><p>" + esc(s.p2) + '</p><ol class="timeline">' + s.timeline.map((x) => "<li><b>" + esc(x.big) + "</b><span>" + esc(x.text) + "</span></li>").join("") + "</ol></div></div>";
  }
  function renderFeed() {
    $("#feed").innerHTML = D.feed.map((f) => '<a href="' + esc(f.url) + '" target="_blank" rel="noopener" aria-label="' + esc(f.alt) + ' (Instagram)"><img src="' + esc(f.img) + '" width="900" height="1125" loading="lazy" alt="' + esc(f.alt) + '"></a>').join("");
  }

  /* ---------- funnel ---------- */
  const flow = $("#flow");
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
    if (n === 4) { $("#summary").textContent = buildMsg(); $("#sendWa").href = target().href; }
  }
  function validate(n) {
    const i = intent();
    if (n === 2 && (i === "delivery" || i === "pickup") && !cart.length) return "Agregá al menos una pizza 🍕";
    if (n === 2 && i === "question" && !F("qText").trim()) return "Contanos tu consulta 🙂";
    if (n === 2 && i === "event" && !F("evDate")) return "Elegí una fecha para tu evento 📅";
    if (n === 3 && !F("name").trim()) return "¿Cómo te llamás? 🙂";
    if (n === 3 && i === "delivery" && !F("address").trim()) return "Necesitamos tu dirección para el delivery 🏠";
    return "";
  }
  $("#flowNext").addEventListener("click", () => { const err = validate(step); if (err) { $("#flowMsg").textContent = err; return; } goStep(step + 1); });
  $("#flowBack").addEventListener("click", () => goStep(Math.max(1, step - 1)));
  $("#steps").addEventListener("click", (e) => { const b = e.target.closest("[data-step]"); if (!b) return; const n = +b.dataset.step; for (let k = step; k < n; k++) { const err = validate(k); if (err) { $("#flowMsg").textContent = err; return; } } goStep(n); });
  flow.addEventListener("change", (e) => { if (e.target.name === "intent") syncIntent(); updatePreview(); });
  flow.addEventListener("input", updatePreview);
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
    if (F("name").trim()) L.push("👤 " + F("name").trim());
    L.push("📍 " + (b ? "Sucursal " + b.name : "Call center"));
    if (i === "delivery") { if (F("address").trim()) L.push("🏠 " + F("address").trim()); if (F("ref").trim()) L.push("↪ " + F("ref").trim()); }
    if (i === "delivery" || i === "pickup") { const w = chipVal("when")[0]; L.push("🕒 " + (w === "later" && F("whenTime") ? "Para las " + F("whenTime") : "Lo antes posible")); }
    if (F("note").trim()) L.push("💬 " + F("note").trim());
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
  $("#sendWa").addEventListener("click", () => {
    const tg = target();
    $("#sendWa").href = tg.href;
    if (tg.copy && navigator.clipboard) navigator.clipboard.writeText(buildMsg()).then(() => toast("Copiamos tu mensaje: pegalo en el chat 📋"), () => {});
  });

  /* ---------- Ría ---------- */
  const ria = $("#ria"), log = $("#riaLog"), input = $("#riaInput");
  let hist = store.get("ria-hist", sessionStorage) || [], busy = false, riaReturn = null;
  const CHIPS = ["¿Qué sucursales están abiertas?", "¿Cuál es la promo de hoy?", "¿Qué trae la Pizza Churrasco?", "Opciones sin carne"];
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
  function renderRia() {
    log.innerHTML = "";
    bubble("bot", md("¡Hola! Soy **Ría**, la recepcionista virtual de Pizza Río 🍕 ¿En qué te ayudo?"));
    hist.forEach((m) => bubble(m.role === "user" ? "user" : "bot", m.role === "user" ? esc(m.content) : md(m.content)));
    $("#riaChips").innerHTML = hist.length ? "" : CHIPS.map((c) => '<button type="button">' + esc(c) + "</button>").join("");
  }
  function openRia() { riaReturn = document.activeElement; ria.hidden = false; renderRia(); input.focus(); updateMbar(); }
  function closeRia() { ria.hidden = true; updateMbar(); if (riaReturn) riaReturn.focus(); }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-ria-open]")) { e.preventDefault(); closeNav(); openRia(); } });
  $("#riaClose").addEventListener("click", closeRia);
  $("#riaChips").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) ask(b.textContent); });
  $("#riaForm").addEventListener("submit", (e) => { e.preventDefault(); const v = input.value.trim(); if (v) { input.value = ""; ask(v); } });
  const ERR_LINKS = '<div class="msg__links"><a href="#menu" data-close-ria>Ver menú</a><a href="#pedir" data-close-ria>Pedir por WhatsApp</a></div>';
  log.addEventListener("click", (e) => { if (e.target.closest("[data-close-ria]")) closeRia(); });
  function errorMsg(status) {
    if ([503, 404, 501, 405].includes(status)) return "Ría se está preparando y muy pronto te va a atender 🛠️.";
    if (status === 429) return "¡Uy, muchas preguntas seguidas! Esperá un minutito 🙏.";
    return "Se me cortó la conexión 😅. Probá de nuevo en un ratito.";
  }
  async function ask(q) {
    if (busy) return; busy = true;
    $("#riaChips").innerHTML = "";
    hist.push({ role: "user", content: q.slice(0, 1200) });
    bubble("user", esc(q));
    const bot = bubble("bot", '<span class="typing" aria-label="Ría está escribiendo"><i></i><i></i><i></i></span>');
    let text = "", status = 0;
    try {
      const res = await fetch("/api/ria", { method: "POST", headers: { "Content-Type": "application/json", "x-ria-client": "web" }, body: JSON.stringify({ messages: hist.slice(-16) }) });
      status = +(res.headers.get("X-Ria-Status") || res.status);
      if (status !== 200) throw new Error("http");
      if (!res.ok || !res.body) throw new Error("http");
      const reader = res.body.getReader(), dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        text += dec.decode(value, { stream: true });
        if (text.includes("[[error]]")) throw new Error("stream");
        bot.innerHTML = md(text); log.scrollTop = log.scrollHeight;
      }
      if (!text.trim()) throw new Error("empty");
      hist.push({ role: "assistant", content: text });
    } catch (e) {
      hist.pop();
      bot.innerHTML = "<p>" + esc(errorMsg(status)) + "</p>" + ERR_LINKS;
    }
    hist = hist.slice(-20); store.set("ria-hist", hist, sessionStorage);
    busy = false; log.scrollTop = log.scrollHeight;
  }

  /* ---------- nav, mbar, reveal ---------- */
  const nav = $("#nav"), burger = $("#burger"), links = $("#navLinks");
  function closeNav() { links.classList.remove("is-open"); burger.setAttribute("aria-expanded", "false"); }
  burger.addEventListener("click", () => { const o = !links.classList.contains("is-open"); links.classList.toggle("is-open", o); burger.setAttribute("aria-expanded", String(o)); });
  links.addEventListener("click", (e) => { if (e.target.closest("a")) closeNav(); });
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
  renderLive(); renderWeekly(); renderSpot(); renderMenuTabs(); renderMenu(); renderAddons(); renderCombos(); renderReels();
  renderBranches(); renderPartner(); renderStory(); renderFeed(); renderPicker(); renderCart(); renderFlowCart(); syncIntent(); goStep(1);
  $("#year").textContent = new Date().getFullYear();
  watchVideos(); reveal(); countUp();
  setInterval(() => { renderLive(); renderBranches(); updatePreview(); }, 60000);
})();
