# Pizza Río · sitio web + Ría (recepcionista con IA)

Sitio de marketing y pedidos para **Pizza Río** (Santa Cruz de la Sierra, Bolivia): menú, promos, combos, 21 sucursales con su propio WhatsApp, un armador de pedidos en 4 pasos que envía el mensaje al WhatsApp de la sucursal elegida, y **Ría**, la recepcionista virtual con IA.

Todo el contenido sale de las redes de Pizza Río (Instagram @pizzario.bolivia, Linktree, Facebook). Cada dato de `js/data.js` tiene al lado el post de donde salió. Las fotos y los videos son de sus propias publicaciones.

## Estructura

```
index.html          estructura + SEO (Open Graph, schema.org Restaurant)
css/styles.css      sistema de diseño (colores de la marca arriba, con su origen)
js/data.js          TODO el contenido: menú, promos, combos, sucursales, datos (lo usan la web y Ría)
js/app.js           render, carrito, pedido por WhatsApp, estado de sucursales, chat de Ría
api/ria.js          endpoint de la IA (streaming, Claude o NVIDIA NIM)
api/_prompt.js      arma el conocimiento de Ría desde js/data.js + contexto en vivo
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
| `RIA_MODEL` | Opcional: otro modelo de Claude (por defecto `claude-sonnet-5-5`) |
| `NVIDIA_API_KEY` | Clave de NVIDIA NIM (si preferís `nvidia`) |
| `RIA_NVIDIA_MODEL` | Opcional: otro modelo NIM (por defecto `meta/llama-3.3-70b-instruct`) |
| `RIA_PROVIDER` | Opcional: fuerza `anthropic` o `nvidia` |

Ría con Claude: prompt del sistema estático con prompt caching, el contexto en vivo (hora, sucursales abiertas, promo del día) va después de la conversación, esfuerzo `low` (respuestas de chat) y respaldo automático del servidor (`fallbacks: "default"`) si un filtro de seguridad rechaza una respuesta.

## Cómo actualizar el contenido

Todo está en `js/data.js`. Cambiá un precio, una promo o una sucursal ahí y se actualizan la web **y** Ría.

- Promo con fecha de fin: poné `until: "AAAA-MM-DD"`; el día siguiente desaparece sola.
- Horario de una sucursal: agregá `open: "HH:MM", close: "HH:MM"` y se calcula el estado Abierto / Cierra pronto / Cerrado en hora de Bolivia.
- Precio que hoy dice "Precio por WhatsApp": cambiá `price: null` por el número.

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
