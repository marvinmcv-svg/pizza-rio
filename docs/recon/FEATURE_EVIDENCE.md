# Feature evidence — Ría vs. the "Dom-class" capability map

Source: master prompt v2, §3 (78 capabilities). One row per capability with **evidence**, **how Ría handles it today**, and **our decision**.

**About the evidence column.** Phase 0 asks for passive REA recon in *your own* browser (Chrome with `--remote-debugging-port=9222`). That can't run from this cloud session, and it must never run against logins, bot protection or real orders. So every row below is marked **"public research"**: the behaviour is as described in the master prompt's public-research summary, not independently observed here. No Domino's code, prompts, assets, copy or product names were used. If you want observed evidence, run REA on your own machine (§2.2) and add an "Observed" note per row.

Legend: ✅ built now · 🟡 partial (honest limitation) · 🗓 planned (phase in `docs/PLAN.md`) · 🔒 blocked on owner data · ⛔ skipped (reason)

## 3A. Conversational ordering core
| # | Capability | Evidence | Ría today | Decision |
|---|---|---|---|---|
| 1 | Delivery or carryout order | public research | ✅ `set_order_details` (delivery / pickup + branch) | Zone check 🔒 (no delivery polygons published) |
| 2 | Whole order in one sentence | public research | ✅ several `cart_add` calls per turn; catalog search with es-BO synonyms | Wings/sides/desserts n/a: Pizza Río doesn't sell them |
| 3 | Guided step-by-step build | public research | ✅ asks one missing detail at a time with 2–4 options + chips | — |
| 4 | Ambiguity clarification | public research | ✅ prompt rule + `review_order.still_missing` | — |
| 5 | Product exploration | public research | ✅ `search_menu` (ingredient/synonym index in `js/catalog.js`) | Grows with the synonym list |
| 6 | Store-specific menu | public research | 🟡 one menu for all 21 branches | 🔒 per-branch availability not published |
| 7 | Find coupons / best deal | public research | ✅ `find_best_deal` (deterministic rules: Combo Buri, Combo Río, ChocloMix Tuesday) | Full optimiser when all prices exist (Phase 1) |
| 8 | "Add X to qualify" | public research | 🟡 combo hints only | No published threshold deals |
| 9 | Upsell at checkout | public research | ✅ max one suggestion, once (prompt rule) | — |
| 10 | Customer asks for a deal | public research | ✅ `get_promos` | `chat_only` deals in Phase 1 table |
| 11 | Tells about new items/deals | public research | ✅ `get_promos.new_items`, once per session | — |
| 12 | Menu, ingredients, locations, hours | public research | 🟡 `get_item_details`, `find_stores`; honest "not published" for hours/addresses | 🔒 hours of 20 branches, addresses, ingredients |
| 13 | Huge combination space | public research | 🟡 one size, no topping builder published | 🔒 modifier price list needed (Phase 1) |
| 14 | Personalised suggestions | public research | 🟡 "lo de siempre" from this device's last order | Profiles in Phase 1 |
| 15 | Read-back + explicit confirmation | public research | ✅ `review_order` → "¿Confirmo?" → `place_order(token)`; token changes if the order changes | — |
| 16 | Payment in the conversation | public research | 🟡 payment coordinated on WhatsApp | 🔒 payment methods/QR provider (Phase 4) |
| 17 | Schedule for later | public research | ✅ `when` field ("para las 20:30") sent to the branch | Capacity check needs hours 🔒 |
| 18 | Personality, playful but all business | public research | ✅ original persona + `persona/catchphrases.json`, easter eggs, polite redirect | — |
| 19 | No judgement of order | public research | ✅ hard rule in system prompt | — |
| 20 | Human handoff | public research | ✅ `handoff_to_human` → WhatsApp button with reason + cart | Staff dashboard in Phase 6 |
| 21 | Learns from every interaction | public research | 🗓 | Phase 6 learning loop (`nlu_misses`, synonyms) |

## 3B. Voice
| # | Capability | Evidence | Ría today | Decision |
|---|---|---|---|---|
| 22 | Mic button in app | public research | ✅ animated mic: idle / listening / thinking / speaking | — |
| 23 | Human-like brand voice | public research | 🟡 browser voices (Spanish) | Custom TTS voice in Phase 3 |
| 24 | Voice + visual in sync | public research | ✅ tool results stream `cart.updated` / `order.updated` events; cart strip, nav count and the order form update while Ría talks | Pizza preview in Phase 3 |
| 25 | Keep phone awake | public research | ✅ Screen Wake Lock during voice | — |
| 26 | Push-to-talk + hands-free + barge-in | public research | ✅ tap-to-talk, "Manos libres" auto-listen, tapping the mic interrupts Ría | Hold-to-talk + server VAD in Phase 3 |
| 27 | Voice tracking | public research | 🟡 `get_order_status` answers honestly (no tracking yet) | Phase 5 |
| 28 | Voice-safe confirmation | public research | ✅ prices spoken as "123 bolivianos"; read-back before placing | Digit-by-digit phone spell-back in Phase 3 |
| 29 | Voice command shortcuts | public research | ✅ "lo de siempre", "deshacer", "¿qué tengo?", "empezar de nuevo", "hablar con alguien", "para/basta" | — |
| 30 | Noise/accent robustness | public research | 🟡 es-BO recognition; low-confidence → re-ask + chips | Custom vocabulary STT in Phase 3 |
| 31 | Voice notes on messaging | public research | 🗓 | Phase 4 (WhatsApp Business API) |

## 3C. Phone ordering
| # | Capability | Evidence | Ría today | Decision |
|---|---|---|---|---|
| 32 | AI answers store phones | public research | 🗓 | Phase 7 |
| 33 | Caller ID: new vs follow-up | public research | 🗓 | Phase 7 |
| 34 | Tracker by phone | public research | 🗓 | Phase 7 (after Phase 5) |
| 35 | Call manager / routing | public research | 🗓 | Phase 7 |
| 36 | Call to order from the car | public research | 🗓 | Phase 7 (same phone agent) |

## 3D. Reorder & frictionless
| # | Capability | Evidence | Ría today | Decision |
|---|---|---|---|---|
| 37 | Saved favourite ("Mi Pedido") | public research | ✅ last order saved on this device (chat and order form) | Account-based in Phase 1 |
| 38 | Reorder by emoji/keyword | public research | 🟡 "lo de siempre" in web chat | 🍕 on WhatsApp in Phase 4 |
| 39 | Reorder recent orders | public research | 🟡 last order only | Last 3 in Phase 1 |
| 40 | Zero-click "Pedido Express" | public research | 🗓 | Phase 8 (needs payments + accounts) |
| 41 | Tap to Order | public research | 🗓 | Phase 8 |
| 42 | Profile "Mi Perfil" | public research | 🟡 device-local only | Phase 1 (Supabase) |
| 43 | Cross-channel account linking | public research | 🗓 | Phase 1/4 with OTP |
| 44 | Guest ordering | public research | ✅ name + address in chat, no account | — |

## 3E. Channels
| # | Channel | Evidence | Ría today | Decision |
|---|---|---|---|---|
| 45 | Website chat | public research | ✅ | — |
| 46 | App with voice | public research | 🟡 web voice works in Chrome/Edge/Safari | PWA in Phase 8 |
| 47 | Messenger | public research | 🗓 | Phase 8 |
| 48 | SMS | public research | ⛔ | WhatsApp covers this in Bolivia |
| 49 | Twitter/X | public research | ⛔ | Instagram DM instead (Phase 8) |
| 50 | Alexa | public research | 🗓 | Phase 9 |
| 51 | Google Assistant | public research | ⛔ | Conversational Actions shut down; PWA voice instead |
| 52 | Smart TV | public research | ⛔ | Low local value |
| 53 | Smartwatch | public research | 🗓 | Phase 9 |
| 54 | Car | public research | 🗓 | Phase 9 (phone agent + shortcut) |
| 55 | Slack/Teams office orders | public research | 🗓 | Phase 9 |
| 56 | Phone | public research | 🗓 | Phase 7 |

## 3F. Tracking & delivery
| # | Capability | Evidence | Ría today | Decision |
|---|---|---|---|---|
| 57–58 | Stage tracker + details | public research | 🟡 honest "no tracking yet" + branch WhatsApp | Phase 5 "Sigue tu Pizza" |
| 59 | AI-predicted ETA | public research | ⛔ for now | 🔒 needs kitchen/driver data (Phase 5) |
| 60 | Live GPS driver map | public research | 🗓 | Phase 5 (driver PWA) |
| 61 | Lock-screen tracking | public research | 🗓 | Phase 8 |
| 62 | Customer ↔ driver contact | public research | 🗓 | Phase 5 |
| 63 | Pin-drop delivery ("Entrega con Pin") | public research | 🟡 free-text address + reference | Phase 5 (map pin + polygons 🔒) |
| 64 | Curated drop-off spots | public research | 🗓 | Phase 5 |
| 65 | Curbside ("Entrega al Auto") | public research | 🗓 | Phase 5 |
| 66 | Cook when close ("Recién Salida") | public research | 🗓 | Phase 5 |
| 67 | Driver app | public research | 🗓 | Phase 5 |
| 68 | Post-delivery feedback | public research | 🗓 | Phase 5 |

## 3G. Loyalty & extras
| # | Capability | Evidence | Ría today | Decision |
|---|---|---|---|---|
| 69–70 | Rewards + rewards-aware upsell | public research | ⛔ for now | 🔒 Pizza Río has no published rewards rule |
| 71 | Nearest store via location | public research | 🟡 by branch name | 🔒 branch coordinates needed |
| 72 | One-tap call/WhatsApp store | public research | ✅ links in chat, order card, branches section | — |
| 73 | Nutrition / allergens | public research | 🟡 never guesses; says "not published" | 🔒 data from owner |
| 74 | Gift cards / vouchers | public research | 🗓 | Phase 9 |
| 75 | Visual pizza builder | public research | 🗓 | Phase 3 (needs topping list 🔒) |

## 3H. Store-side AI
| # | Capability | Evidence | Ría today | Decision |
|---|---|---|---|---|
| 76 | Staff Copilot | public research | 🗓 | Phase 6 |
| 77 | Predictive prep | public research | 🗓 | Phase 6 |
| 78 | Kitchen display | public research | 🗓 | Phase 6 |

**Count (76 rows; 57–58 and 69–70 are one row each):** 24 built ✅ · 17 partial 🟡 · 29 planned 🗓 · 6 skipped ⛔.
