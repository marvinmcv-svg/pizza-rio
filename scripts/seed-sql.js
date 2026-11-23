#!/usr/bin/env node
// Genera supabase/seed.sql desde js/data.js (sucursales) y js/catalog.js (productos).
//   node scripts/seed-sql.js > supabase/seed.sql
// Es idempotente (upserts): volvé a correrlo cada vez que cambies precios o sucursales en data.js.
"use strict";
const D = require("../js/data.js");
const C = require("../js/catalog.js");

const q = (v) => (v == null || v === "" ? "null" : "'" + String(v).replace(/'/g, "''") + "'");
const num = (v) => (v == null ? "null" : Number(v).toFixed(2));
const KIND = { pizza: "main", combo: "combo", promo: "promo", extra: "extra", drink: "drink" };

const out = [];
out.push("-- Generado por scripts/seed-sql.js desde js/data.js. No editar a mano.");
out.push("begin;");

out.push("\n-- Sucursales (horario y dirección solo si están publicados)");
D.branches.forEach((b, i) => {
  out.push(
    "insert into public.stores (id, name, whatsapp, address, plus_code, open_time, close_time, sort) values (" +
      [q(b.id), q(b.name), q(b.whatsapp), q(b.address), q(b.plus), q(b.open), q(b.close), i].join(", ") +
      ") on conflict (id) do update set name = excluded.name, whatsapp = excluded.whatsapp, address = excluded.address," +
      " plus_code = excluded.plus_code, open_time = excluded.open_time, close_time = excluded.close_time, sort = excluded.sort;"
  );
});

out.push("\n-- Productos (precio null = no publicado: el pedido queda «a confirmar»)");
const items = Object.values(C.build(D)).filter((it) => !it.hidden); // los alias ocultos se mandan con el id original
items.forEach((it, i) => {
  out.push(
    "insert into public.menu_items (id, name, kind, category, size, description, price, veg, sort) values (" +
      [q(it.id), q(it.name), q(KIND[it.kind] || "extra"), q(it.category), q(it.size), q(it.desc), num(it.price), it.veg ? "true" : "false", i].join(", ") +
      ") on conflict (id) do update set name = excluded.name, kind = excluded.kind, category = excluded.category, size = excluded.size," +
      " description = excluded.description, price = excluded.price, veg = excluded.veg, sort = excluded.sort;"
  );
});
out.push("commit;");

out.push(`
-- Primer usuario dueño (una sola vez):
-- 1. Supabase → Authentication → Users → Add user → email del dueño + contraseña (marcar «Auto confirm»).
-- 2. Ejecutá (cambiando el email):
--    insert into public.staff (user_id, full_name, email, role)
--    select id, 'Dueño', email, 'owner' from auth.users where email = 'EMAIL_DEL_DUEÑO';
-- El resto del equipo se crea desde /admin → Equipo.`);

process.stdout.write(out.join("\n") + "\n");
