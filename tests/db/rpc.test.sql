-- Pruebas de la base (RPC, RLS, roles). Corren contra una base con las 3 migraciones + seed.
--   psql "$PG_TEST_URL" -v ON_ERROR_STOP=1 -f tests/db/rpc.test.sql
-- Cada bloque falla con "FAIL: ..." si algo no se cumple. Limpia lo que crea al final (rollback).
\set QUIET on
\o /dev/null
begin;

create temp table t_ctx (k text primary key, v text);
grant all on t_ctx to anon, authenticated;

create or replace function pg_temp.expect_err(sql text, expected text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL: esperaba error %, no hubo error: %', expected, sql;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if sqlerrm not like expected || '%' then raise exception 'FAIL: esperaba %, obtuve % (%)', expected, sqlerrm, sql; end if;
end $$;
grant execute on function pg_temp.expect_err(text, text) to anon, authenticated;

-- ---------- público (clave publicable = rol anon) ----------
set role anon;
select set_config('request.jwt.claim.sub', '', false);

do $$
declare r jsonb; r2 jsonb;
begin
  r := public.place_order('{"client_ref":"t-1","channel":"web","store":"equipetrol","service":"delivery",
        "customer_name":"Ana Pérez","customer_phone":"7 123 4567","address":"Calle 1","items":[{"id":"hawaiana","qty":2,"price":1}]}');
  if not (r ->> 'ok')::boolean then raise exception 'FAIL: place_order'; end if;
  if r ->> 'code' !~ '^PR-[A-HJ-KM-NP-Z2-9]{5}$' then raise exception 'FAIL: código %', r ->> 'code'; end if;
  if (r ->> 'subtotal')::numeric <> (select price * 2 from public.menu_items where id = 'hawaiana') then
    raise exception 'FAIL: el precio no salió de menu_items: %', r ->> 'subtotal';
  end if;
  if (r ->> 'order_no')::int <> 1 then raise exception 'FAIL: order_no %', r ->> 'order_no'; end if;
  insert into t_ctx values ('token', r ->> 'tracking_token'), ('code', r ->> 'code');

  r2 := public.place_order('{"client_ref":"t-1","store":"equipetrol","customer_name":"X","customer_phone":"71234567","address":"x","items":[{"id":"hawaiana"}]}');
  if not (r2 ->> 'duplicate')::boolean or r2 ->> 'code' <> r ->> 'code' then raise exception 'FAIL: idempotencia'; end if;

  -- precio no publicado → queda pendiente
  r := public.place_order('{"client_ref":"t-2","store":"Equipetrol","service":"pickup","customer_name":"Ana","customer_phone":"+591 71234567",
        "items":[{"id":"mixta","qty":1},{"id":"hawaiana","qty":1}]}');
  if not (r ->> 'price_pending')::boolean then raise exception 'FAIL: price_pending'; end if;
  if (r ->> 'order_no')::int <> 2 then raise exception 'FAIL: order_no 2'; end if;
end $$;

-- seguimiento: sin teléfono ni dirección
do $$
declare r jsonb := public.track_order((select v::uuid from t_ctx where k = 'token'));
begin
  if r is null or r ->> 'status' <> 'new' then raise exception 'FAIL: track_order'; end if;
  if r ? 'customer_phone' or r ? 'address' or r::text like '%71234567%' or r::text like '%Calle 1%' then raise exception 'FAIL: track_order filtra datos personales'; end if;
  if r ->> 'name' <> 'Ana' then raise exception 'FAIL: solo el primer nombre'; end if;
  if public.track_order(gen_random_uuid()) is not null then raise exception 'FAIL: token inexistente'; end if;
end $$;

select pg_temp.expect_err($q$select * from public.orders$q$, 'permission denied');
select pg_temp.expect_err($q$select * from public.customers$q$, 'permission denied');
select pg_temp.expect_err($q$select * from public.order_items$q$, 'permission denied');
select pg_temp.expect_err($q$update public.menu_items set price = 1$q$, 'permission denied');
select pg_temp.expect_err($q$select public.set_order_status(gen_random_uuid(), 'ready')$q$, 'permission denied');
select pg_temp.expect_err($q$select public.place_order('{"store":"equipetrol","channel":"phone","customer_name":"A","customer_phone":"71234567","address":"x","items":[{"id":"hawaiana"}]}')$q$, 'invalid_channel');
select pg_temp.expect_err($q$select public.place_order('{"store":"equipetrol","customer_name":"A","customer_phone":"123","address":"x","items":[{"id":"hawaiana"}]}')$q$, 'invalid_phone');
select pg_temp.expect_err($q$select public.place_order('{"store":"equipetrol","customer_name":"A","address":"x","items":[{"id":"hawaiana"}]}')$q$, 'invalid_phone');
select pg_temp.expect_err($q$select public.place_order('{"store":"equipetrol","customer_name":"A","customer_phone":"71234567","items":[{"id":"hawaiana"}]}')$q$, 'missing_address');
select pg_temp.expect_err($q$select public.place_order('{"store":"equipetrol","customer_name":"A","customer_phone":"71234567","address":"x","items":[{"id":"pizza-gratis"}]}')$q$, 'unknown_item:pizza-gratis');
select pg_temp.expect_err($q$select public.place_order('{"store":"equipetrol","customer_name":"A","customer_phone":"71234567","address":"x","items":[]}')$q$, 'empty_order');
select pg_temp.expect_err($q$select public.place_order('{"store":"marte","customer_name":"A","customer_phone":"71234567","address":"x","items":[{"id":"hawaiana"}]}')$q$, 'unknown_store');
select pg_temp.expect_err($q$select public.place_order('{"store":"equipetrol","service":"dine_in","customer_name":"A","customer_phone":"71234567","items":[{"id":"hawaiana"}]}')$q$, 'invalid_service');
select pg_temp.expect_err($q$select public.place_order('{"store":"equipetrol","customer_name":"A","customer_phone":"71234567","address":"x","scheduled_for":"00:00","items":[{"id":"hawaiana"}]}')$q$, 'time_in_past');

-- ---------- dueño y equipo ----------
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local');
insert into public.staff (user_id, full_name, email, role) values ('00000000-0000-0000-0000-0000000000a1', 'Dueño', 'owner@test.local', 'owner');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$
begin
  insert into t_ctx values
    ('mgr', public.admin_create_staff('mgr@test.local', 'clave-segura-1', 'Gerente Equipetrol', 'manager', 'equipetrol')::text),
    ('kit', public.admin_create_staff('kit@test.local', 'clave-segura-2', 'Cocina Equipetrol', 'kitchen', 'equipetrol')::text),
    ('cas', public.admin_create_staff('cas@test.local', 'clave-segura-3', 'Caja Equipetrol', 'cashier', 'equipetrol')::text),
    ('rid', public.admin_create_staff('rid@test.local', 'clave-segura-4', 'Moto Equipetrol', 'rider', 'equipetrol')::text),
    ('mg2', public.admin_create_staff('mg2@test.local', 'clave-segura-5', 'Gerente Banzer', 'manager', 'av-banzer')::text);
end $$;
select pg_temp.expect_err($q$select public.admin_create_staff('x@test.local', 'corta', 'X', 'cashier', 'equipetrol')$q$, 'weak_password');
select pg_temp.expect_err($q$select public.admin_create_staff('y@test.local', 'clave-segura', 'Y', 'cashier', null)$q$, 'store_required');
select pg_temp.expect_err($q$select public.admin_update_staff('00000000-0000-0000-0000-0000000000a1', 'admin', null, true)$q$, 'cannot_demote_self');

-- la contraseña quedó con bcrypt
reset role;
do $$ begin
  if not exists (select 1 from auth.users where email = 'mgr@test.local' and encrypted_password = extensions.crypt('clave-segura-1', encrypted_password)) then
    raise exception 'FAIL: bcrypt';
  end if;
  if (select count(*) from auth.identities where identity_data ->> 'email' like '%@test.local') <> 5 then raise exception 'FAIL: identities'; end if;
end $$;

-- pedido en otra sucursal (para probar el alcance)
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  insert into t_ctx values ('banzer', public.place_order('{"client_ref":"t-3","store":"av-banzer","customer_name":"Luis","customer_phone":"76543210","address":"Calle 2","items":[{"id":"hawaiana"}]}') ->> 'code');
end $$;

-- gerente de Equipetrol: solo ve su sucursal
set role authenticated;
select set_config('request.jwt.claim.sub', (select v from t_ctx where k = 'mgr'), false);
do $$ begin
  if exists (select 1 from public.orders where store_id <> 'equipetrol') then raise exception 'FAIL: gerente ve otras sucursales'; end if;
  if (select count(*) from public.orders) <> 2 then raise exception 'FAIL: gerente no ve sus pedidos'; end if;
  if exists (select 1 from public.audit_log) then raise exception 'FAIL: gerente lee auditoría'; end if;
end $$;
select pg_temp.expect_err($q$update public.orders set status = 'delivered'$q$, 'permission denied');
select pg_temp.expect_err($q$update public.orders set total = 1$q$, 'permission denied');
select pg_temp.expect_err($q$select public.set_order_status((select id from public.orders where code = (select v from t_ctx where k = 'banzer')), 'confirmed')$q$, 'order_not_found');
do $$
declare oid uuid := (select id from public.orders where code = (select v from t_ctx where k = 'code'));
begin
  perform public.set_order_status(oid, 'confirmed');
  update public.orders set payment_method = 'qr', discount = 5 where id = oid;
  if (select total from public.orders where id = oid) <> (select subtotal - 5 + delivery_fee from public.orders where id = oid) then raise exception 'FAIL: total'; end if;
end $$;

-- cocina: puede avanzar hasta "lista", no despachar
select set_config('request.jwt.claim.sub', (select v from t_ctx where k = 'kit'), false);
do $$
declare oid uuid := (select id from public.orders where code = (select v from t_ctx where k = 'code'));
begin
  perform public.set_order_status(oid, 'preparing');
  perform public.set_order_status(oid, 'cooking');
end $$;
select pg_temp.expect_err($q$select public.set_order_status((select id from public.orders where code = (select v from t_ctx where k = 'code')), 'out_for_delivery')$q$, 'role_forbidden');
select pg_temp.expect_err($q$select public.set_order_status((select id from public.orders where code = (select v from t_ctx where k = 'code')), 'confirmed')$q$, 'recall_needs_manager');

-- caja: no puede cancelar después de empezar la preparación
select set_config('request.jwt.claim.sub', (select v from t_ctx where k = 'cas'), false);
select pg_temp.expect_err($q$select public.set_order_status((select id from public.orders where code = (select v from t_ctx where k = 'code')), 'cancelled', null, 'changed_mind')$q$, 'cancel_needs_manager');
select pg_temp.expect_err($q$select public.set_order_status((select id from public.orders where code = (select v from t_ctx where k = 'code')), 'cancelled', null, 'other')$q$, 'cancel_note_required');
select pg_temp.expect_err($q$select public.set_order_status((select id from public.orders where code = (select v from t_ctx where k = 'code')), 'cancelled')$q$, 'cancel_reason_required');

-- vuelve la cocina: lista; moto: despacha y entrega (queda como su repartidor)
select set_config('request.jwt.claim.sub', (select v from t_ctx where k = 'kit'), false);
select public.set_order_status((select id from public.orders where code = (select v from t_ctx where k = 'code')), 'ready') is not null;
select set_config('request.jwt.claim.sub', (select v from t_ctx where k = 'rid'), false);
do $$
declare oid uuid := (select id from public.orders where code = (select v from t_ctx where k = 'code'));
begin
  perform public.set_order_status(oid, 'out_for_delivery');
  perform public.set_order_status(oid, 'delivered');
end $$;
select pg_temp.expect_err($q$select public.set_order_status((select id from public.orders where code = (select v from t_ctx where k = 'code')), 'ready')$q$, 'closed_needs_manager');

-- pedido para recoger: no puede ir "en camino"
select set_config('request.jwt.claim.sub', (select v from t_ctx where k = 'mgr'), false);
select pg_temp.expect_err($q$select public.set_order_status((select id from public.orders where client_ref = 't-2'), 'out_for_delivery')$q$, 'not_delivery');

-- 86: agotado en la sucursal → el público no puede pedirlo
insert into public.store_item_availability (store_id, item_id, available) values ('equipetrol', 'hawaiana', false);
update public.stores set is_paused = true, pause_reason = 'Lluvia', paused_until = now() + interval '30 minutes' where id = 'av-banzer';
reset role;
do $$ begin
  if (select is_paused from public.stores where id = 'av-banzer') then raise exception 'FAIL: gerente pausó otra sucursal'; end if;
end $$;
update public.stores set is_paused = true, pause_reason = 'Lluvia', paused_until = now() + interval '30 minutes' where id = 'av-beni';

set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_err($q$select public.place_order('{"store":"equipetrol","customer_name":"A","customer_phone":"71234567","address":"x","items":[{"id":"hawaiana"}]}')$q$, 'sold_out:Pizza Hawaiana');
select pg_temp.expect_err($q$select public.place_order('{"store":"av-beni","customer_name":"A","customer_phone":"71234567","address":"x","items":[{"id":"hawaiana"}]}')$q$, 'store_paused');

-- anti abuso: 5 pedidos del mismo número en 10 minutos
do $$ begin
  for i in 1..3 loop
    perform public.place_order(jsonb_build_object('store', 'av-banzer', 'customer_name', 'Spam', 'customer_phone', '71112222', 'service', 'pickup', 'items', jsonb_build_array(jsonb_build_object('id', 'hawaiana'))));
  end loop;
end $$;
do $$ begin
  if not (select (public.place_order('{"store":"av-banzer","customer_name":"Spam","customer_phone":"71112222","service":"pickup","items":[{"id":"hawaiana"}]}') ->> 'ok')::boolean) then raise exception 'FAIL'; end if;
  perform public.place_order('{"store":"av-banzer","customer_name":"Spam","customer_phone":"71112222","service":"pickup","items":[{"id":"extra-0"}]}');
end $$;
select pg_temp.expect_err($q$select public.place_order('{"store":"av-banzer","customer_name":"Spam","customer_phone":"71112222","service":"pickup","items":[{"id":"hawaiana"}]}')$q$, 'rate_limited');

-- ---------- dueño: reportes, auditoría, CRM ----------
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$
declare r jsonb := public.report_summary((now() at time zone 'America/La_Paz')::date, (now() at time zone 'America/La_Paz')::date);
begin
  if (r ->> 'orders')::int < 7 then raise exception 'FAIL: report orders %', r ->> 'orders'; end if;
  if jsonb_array_length(r -> 'by_store') < 2 then raise exception 'FAIL: by_store'; end if;
  if (r -> 'top_items' -> 0 ->> 'id') <> 'hawaiana' then raise exception 'FAIL: top item'; end if;
  if not exists (select 1 from public.audit_log where entity = 'orders' and data ? 'status') then raise exception 'FAIL: auditoría de estados'; end if;
  if not exists (select 1 from public.audit_log where entity = 'store_item_availability') then raise exception 'FAIL: auditoría 86'; end if;
  if (select orders_count from public.customers where phone = '+59171234567') <> 2 then raise exception 'FAIL: stats del cliente'; end if;
  if not exists (select 1 from public.orders where customer_phone = '+59171112222' and possible_duplicate) then
    raise exception 'FAIL: possible_duplicate';
  end if;
  if not exists (select 1 from public.order_events e join public.orders o on o.id = e.order_id where o.code = (select v from t_ctx where k = 'code') and e.status = 'delivered') then raise exception 'FAIL: eventos'; end if;
  if (select delivered_at is null or confirmed_at is null or rider_id is null from public.orders where code = (select v from t_ctx where k = 'code')) then raise exception 'FAIL: timestamps/rider'; end if;
end $$;

-- gerente: el reporte queda limitado a su sucursal aunque pida otra
select set_config('request.jwt.claim.sub', (select v from t_ctx where k = 'mgr'), false);
do $$
declare r jsonb := public.report_summary(current_date - 1, current_date + 1, 'av-banzer');
begin
  if r ->> 'store' <> 'equipetrol' then raise exception 'FAIL: alcance del reporte'; end if;
end $$;
select set_config('request.jwt.claim.sub', (select v from t_ctx where k = 'kit'), false);
select pg_temp.expect_err($q$select public.report_summary(current_date, current_date)$q$, 'forbidden');
do $$ begin
  if exists (select 1 from public.customers) then raise exception 'FAIL: cocina ve clientes'; end if;
end $$;

reset role;
\o
\echo 'db tests: OK'
rollback;
