# Ría — plan por fases (master prompt v2, adaptado a Pizza Río)

## Dónde estamos (Ría v2, en producción)
Sitio estático + una función de Vercel (`api/ria.js`). Ría ya es una **asistente de pedidos**, no solo de preguntas:

- **Herramientas deterministas** (`api/_tools.js`): menú, detalles, promos, mejor oferta, sucursales/horarios, carrito (agregar, cambiar, quitar, deshacer, vaciar), "lo de siempre", datos del pedido, lectura final con token, envío al WhatsApp de la sucursal, estado del pedido, pasar a una persona. El modelo nunca calcula precios ni confirma solo.
- **Catálogo único** (`js/catalog.js`) compartido por la web, Ría y los tests.
- **Carrito en vivo**: cada herramienta manda un evento y la web (carrito, contador, armador de pedidos) se actualiza mientras Ría responde.
- **Voz en la web**: micrófono (es-BO), respuesta hablada, manos libres, interrumpir, wake lock, comandos de voz. Modelo rápido (`claude-haiku-5-5`) para turnos de voz; `claude-sonnet-5-5` para texto.
- **Persona original** (`persona/catchphrases.json`) y **23 golden tests** (`npm test`).

**Cómo se "hace" un pedido hoy:** Ría arma el mensaje y el cliente toca **Enviar por WhatsApp** a la sucursal elegida. No hay POS ni base de pedidos: la sucursal confirma pago y tiempo por WhatsApp. Esto es intencional hasta la Fase 1.

## Datos que faltan del dueño (bloquean varias fases)
Lista de precios completa y toppings/modificadores · ingredientes y alérgenos · horarios de las 21 sucursales · direcciones y coordenadas · zonas y costo de delivery · medios de pago (QR, efectivo) · regla de premios (si existe) · número de WhatsApp de Montero.

## Fases
| Fase | Alcance | Listo cuando |
|---|---|---|
| **1** | Supabase: `stores`, `store_hours`, `menu_items`, `modifiers`, `deals`, `customers`, `customer_identities`, `carts`, `orders`, `order_events`; importar menú desde planilla; motor de modificadores y precios; optimizador de ofertas; "Mi Pedido" y últimos 3 pedidos por cliente (OTP por WhatsApp). | Tests de propiedades con combinaciones al azar pasan; el optimizador encuentra la mejor oferta real. |
| **2** | Ría pasa de "armar mensaje" a `place_order` real en la base (idempotente); panel simple para la sucursal. | Golden tests 1–15 y 31–35 contra la base. |
| **3** | Voz v2: STT en streaming con vocabulario propio (barrios, anillos, nombres de pizzas), voz de marca (TTS propio), mantener presionado para hablar, VAD del servidor, deletreo de teléfonos, vista previa visual de la pizza. | p50 < 1,2 s por turno; tests de voz 18–21. |
| **4** | WhatsApp Business API: texto, notas de voz → STT, ubicación, 🍕 para repetir; pagos QR/efectivo con vuelto; avisos por etapa. | Pedido real de punta a punta por WhatsApp. |
| **5** | "Sigue tu Pizza": etapas, ETA (cola de cocina + repartidores), PWA del repartidor con GPS, Entrega con Pin, Puntos de Entrega, Entrega al Auto, Recién Salida, calificación. | Tests 25–30 con un pedido de prueba. |
| **6** | Pantalla de cocina, admin (menú, promos, zonas, frases), analítica, ciclo de aprendizaje (`nlu_misses` → sinónimos), Staff Copilot de solo lectura. | Una sucursal opera un turno completo desde los paneles. |
| **7** | Agente telefónico (Twilio Media Streams), caller ID nuevo/seguimiento, enrutamiento de quejas y pedidos grandes. | Tests 22–24 por teléfono. |
| **8** | PWA instalable, Pedido Express (cuenta regresiva), Tap to Order, push, vista de reloj; Instagram DM y Messenger. | Tests 16–17. |
| **9** | Alexa, atajo para el auto, pedidos de oficina en Slack/Teams, vales. | Repetir y seguir pedido funcionan en cada canal. |
| **10** | Endurecimiento: inyección, carga (50 chats + 10 llamadas), failover, privacidad (borrado de audio/ubicación). | Todo pasa. |

## Fase 0 (recon) pendiente de tu lado
`docs/recon/FEATURE_EVIDENCE.md` usa "investigación pública". Para evidencia observada, corré REA en **tu** Chrome (§2.2 del master prompt), solo en modo pasivo y sin hacer pedidos reales, y agregá una nota "Observado" por fila.
