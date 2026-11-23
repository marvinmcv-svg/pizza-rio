# Pizza Río · sitio web + Ría (recepcionista con IA)

Sitio de marketing y pedidos para **Pizza Río** (Santa Cruz de la Sierra, Bolivia): menú, promos, combos, 21 sucursales con su propio WhatsApp, un armador de pedidos en 4 pasos que envía el mensaje al WhatsApp de la sucursal elegida, **Ría** (la recepcionista virtual con IA), y un backend opcional en Supabase con **Sigue tu Pizza** (seguimiento público) y un **backoffice** (`/admin`) para el equipo.

Todo el contenido sale de las redes de Pizza Río (Instagram @pizzario.bolivia, Linktree, Facebook). Cada dato de `js/data.js` tiene al lado el post de donde salió. Las fotos y los videos son de sus propias publicaciones.

## Estructura

```
index.html          estructura + SEO (Open Graph, schema.org Restaurant)
css/styles.css      sistema de diseño (colores de la marca arriba, con su origen)
js/data.js          TODO el contenido: menú, promos, combos, sucursales, datos (lo usan la web y Ría)
js/app.js           render, carrito, pedido por WhatsApp, estado de sucursales, chat de Ría
api/ria.js          endpoint de la IA (streaming, Claude o NVIDIA NIM)
api/_prompt.js      reglas y conocimiento de Ría desde js/data.js + contexto en vivo
api/_tools.js       herramientas deterministas de Ría (menú, carrito, promos, sucursales, pedido)
js/catalog.js       catálogo único con ids y precios (web + Ría + tests)
js/config.js        URL y clave PUBLICABLE de Supabase (vacío = backend apagado)
api/_backend.js     llamadas de Ría a la base (place_order, track_order), corte a los 6 s
supabase/           migraciones 001–003 + seed.sql (generado)
scripts/seed-sql.js genera supabase/seed.sql desde js/data.js
sigue-tu-pizza/     página pública de seguimiento (?t=<token>)
admin/              backoffice del equipo (Supabase Auth)
persona/            frases originales de Ría
tests/golden/       golden tests (npm test)
tests/db/           pruebas de la base: RLS, RPC, roles (npm run test:db)
docs/               evidencia de funciones (recon) y plan por fases
assets/img          posts (webp)   assets/video  reels (mp4 + póster webp)
assets/hero         reels del abanico del hero   assets/brand  íconos e imagen para compartir
site.webmanifest, favicon.ico
```

Sitio estático sin build + una función serverless de Vercel. Node ≥ 20.

## Correr en local

```bash
npm install
npx vercel dev
```

Abrí `http://localhost:3000`. Para probar la card de "Hoy" un martes: `http://localhost:3000/?dia=2` (0 = domingo … 6 = sábado).

## Publicar

Importá el repo en Vercel (zero-config). Después agregá la clave de la IA en **Vercel → Project → Settings → Environment Variables** y hacé **Redeploy**. Sin clave, el chat muestra "Ría se está preparando…" y el resto del sitio funciona igual.

| Variable | Para qué |
|---|---|
| `ANTHROPIC_API_KEY` | Clave de Claude (proveedor elegido: `anthropic`) |
| `RIA_MODEL` | Opcional: otro modelo de Claude para texto (por defecto `claude-sonnet-5-5`) |
| `RIA_VOICE_MODEL` | Opcional: modelo para turnos de voz (por defecto `claude-haiku-5-5`, más rápido) |
| `NVIDIA_API_KEY` | Clave de NVIDIA NIM (si preferís `nvidia`) |
| `RIA_NVIDIA_MODEL` | Opcional: otro modelo NIM (por defecto `meta/llama-3.3-70b-instruct`; en producción: `nvidia/nemotron-3-ultra-550b-a55b`) |
| `RIA_PROVIDER` | Opcional: fuerza `anthropic` o `nvidia` |

## Backend (Supabase): pedidos registrados, seguimiento y backoffice

Sin backend, todo sigue funcionando como antes (el pedido sale por WhatsApp). Con backend:

- Cada pedido de la web o de Ría queda **registrado** con código (`PR-K7M2Q`), número del día por sucursal y **precio calculado por la base** (el navegador nunca manda precios). El mensaje de WhatsApp lleva el código y el link **Sigue tu Pizza**.
- Si la base no responde en 6 s, el pedido **igual sale por WhatsApp**: nunca se pierde un pedido.
- Sucursal pausada, producto agotado («86»), celular inválido o pedidos en ráfaga se rechazan con un mensaje claro.
- `/admin`: Hoy, Pedidos (tablero en vivo con aviso sonoro), Nuevo pedido (teléfono / en local / WhatsApp / PedidosYa), Clientes (CRM con segmentos y CSV), Sucursales (pausar con reanudación automática), Agotados (86), Menú, Reportes, Equipo, Auditoría y Mi cuenta. Cada rol ve solo lo suyo (cocina y delivery, solo su sucursal y sus pasos).

### Ponerlo en marcha (una vez, ~15 minutos)

1. **Crear el proyecto** en [supabase.com](https://supabase.com) → New project, región **São Paulo (sa-east-1)**, la más cercana a Santa Cruz.
2. **Aplicar las migraciones** en orden: SQL Editor → pegar y ejecutar `supabase/migrations/001_core_schema.sql`, luego `002_…`, luego `003_…` (o `supabase db push` con la CLI).
3. **Cargar menú y sucursales**: `npm run seed` y ejecutar `supabase/seed.sql` en el SQL Editor.
4. **Crear al dueño**: Authentication → Users → *Add user* (email del dueño + contraseña, marcar *Auto confirm*). Después, en el SQL Editor:
   ```sql
   insert into public.staff (user_id, full_name, email, role)
   select id, 'Dueño', email, 'owner' from auth.users where email = 'EMAIL_DEL_DUEÑO';
   ```
   El resto del equipo se crea desde `/admin` → Equipo.
5. **Conectar el sitio**: Project Settings → API → copiar la **URL** y la **clave publicable** (`sb_publishable_…` o `anon`) en `js/config.js`. Esa clave es pública por diseño; **nunca** pongas la `service_role`.
6. **Seguridad recomendada** (Authentication → Settings): apagar *Allow new users to sign up*; prender *Leaked password protection*. Correr Advisors → Security y Performance.
7. Publicar. Probar: un pedido desde la web → aparece en `/admin/#/pedidos` → el link de seguimiento avanza al cambiar el estado.

### Precios: mantener sincronizado

La web muestra `js/data.js`; la base cobra `menu_items`. Al cambiar un precio, cambialo en los dos: en `/admin` → Menú **y** en `data.js` (o editá `data.js`, corré `npm run seed` y ejecutá `seed.sql` otra vez).

## Ría: asistente de pedidos (texto y voz)

- **Arma pedidos completos** en una frase («dos hawaianas con borde, delivery a Equipetrol»): busca en el menú, agrega al carrito, pide solo lo que falta (incluido el celular), lee el resumen con el total del sistema y, con un «sí», registra el pedido y deja listo el botón **Enviar por WhatsApp** a la sucursal elegida.
- **La confirmación la decide el servidor**: el pedido solo se confirma si llegó esperando el «sí» y el último mensaje es un sí claro («sí pero sin borde» no cuenta). El modelo no puede confirmar en el mismo turno en que lee el resumen.
- **Entrega con Pin**: si no sabe explicar la dirección, Ría muestra «Compartir mi ubicación» y el pin va en el pedido.
- **Sigue tu Pizza**: «¿dónde está mi pizza?» devuelve el estado real desde la base, con botón al seguimiento.
- **Ofertas con total exacto**: `get_deals` sugiere el combo que conviene con `total_if_accepted` calculado por el sistema.
- **Nunca inventa ni calcula**: precios, promos, horarios y totales salen de herramientas deterministas (`api/_tools.js`). Productos sin precio publicado quedan «a confirmar».
- **Carrito en vivo**: lo que Ría agrega aparece al instante en el carrito y en el armador de pedidos de la página.
- **Voz**: botón de micrófono (español de Bolivia), respuesta hablada, «Manos libres», interrumpir tocando el micrófono, pantalla encendida durante la voz. Funciona en Chrome, Edge y Safari; en Firefox queda solo texto.
- **«Lo de siempre»**: repite el último pedido hecho desde ese dispositivo.
- **Pasar a una persona**: quejas, eventos o si no entiende → botón al WhatsApp de la sucursal o del call center con el motivo y el carrito.

Técnica: prompt del sistema estático con prompt caching; el contexto en vivo (hora, canal, carrito, datos del pedido) va después de la conversación; esfuerzo `low`; en texto, respaldo del servidor (`fallbacks: "default"`) si un filtro de seguridad rechaza. Pruebas: `npm test` (37 golden tests: herramientas, guardia de confirmación, registro en la base simulado, y punta a punta contra una API falsa) y `npm run test:db` con `PG_TEST_URL` apuntando a una base con las migraciones (RLS, precios del servidor, idempotencia, 86, pausas, roles, auditoría, reportes). Plan para seguimiento, pagos, teléfono y más: `docs/PLAN.md`.

## Cómo actualizar el contenido

Todo está en `js/data.js`. Cambiá un precio, una promo o una sucursal ahí y se actualizan la web **y** Ría.

- Promo con fecha de fin: poné `until: "AAAA-MM-DD"`; el día siguiente desaparece sola.
- Horario de una sucursal: agregá `open: "HH:MM", close: "HH:MM"` y se calcula el estado Abierto / Cierra pronto / Cerrado en hora de Bolivia.
- Precio que hoy dice "Precio por WhatsApp": cambiá `price: null` por el número.
- Carrusel de la portada: `hero` (una entrada por diapositiva; `until` la oculta sola al vencer, `day` la pone primera ese día).
- Tarjetas "Descubrí nuestras promos": `promoCards` (la imagen es el post tal cual; `add` es el id que se suma al pedido).

## Falta confirmar (no está publicado, por eso no aparece)

| Dato | Dónde agregarlo en `js/data.js` |
|---|---|
| Horarios de 20 de las 21 sucursales (solo Equipetrol tiene horario en su caja; Piraí abre 11:00, sin cierre) | `branches[].open` / `close` |
| Direcciones o Plus Codes de las sucursales | `branches[].address` / `plus` |
| Número de WhatsApp de Montero (Linktree usa un link corto) | `branches[0].whatsapp` |
| Precios de Mixta, Jamón, Tocinátor, Napolitana, Choclo, Chorizo Argentino, Carnívora, Especial Río, Cheeseburguer, Pollo con Crema, Nacho Supremo (y las 2 "Strogonoff" de la carta) | `menu[2].items[].price` |
| Ingredientes de cada pizza | `menu[].items[].desc` |
| Precios de gaseosas sueltas (500 ml, 1,5 L, 2 L se ven en la carta pero no se leen) | `addons.sodas` |
| Costo y tiempo de delivery, zonas, medios de pago, apps de delivery | `facts` |
| Combo Buri (Bs 69): se publicó en septiembre sin fecha de fin; confirmá si sigue | `combos` |
| Contenido y precio del Combo Navi (alianza Honda) y fecha de fin del sorteo | `partner` |
| Año de fundación (hay un aniversario el 14 de marzo, sin año) | `story.timeline` |
| Dominio final (los meta tags apuntan a `pizza-rio-orpin.vercel.app`) | `index.html` |

## Promos con vencimiento

- **Martes de ChocloMix (Bs 36)**: todos los martes de noviembre → vence el **30/11/2026** (se oculta sola). En diciembre cargá la promo nueva.
- **Especial del mes** (`yapa`): ChocloMix noviembre, vence el **30/11/2026**.
- **Sorteo Honda Navi**: sin fecha publicada; sacá `partner` cuando termine.
