-- Pizza Río · 002 · operación, seguridad (RLS), triggers y auditoría

-- ---------- columnas operativas ----------
alter table public.stores
  add column paused_until     timestamptz,
  add column accepts_delivery boolean not null default true,
  add column accepts_pickup   boolean not null default true,
  add column prep_minutes     int not null default 20 check (prep_minutes between 5 and 180);

alter table public.customers
  add column alt_phone     text,
  add column nit           text,              -- NIT / CI para la factura
  add column razon_social  text,
  add column allergies     text,
  add column blocked       boolean not null default false,
  add column opt_in_at     timestamptz,
  add column opt_in_source text;

alter table public.customer_addresses
  add column zona   text,                     -- barrio / zona
  add column anillo text;                     -- anillo (Santa Cruz se ubica por anillos)

alter table public.orders
  add column tracking_token     uuid not null unique default gen_random_uuid(),
  add column order_no           int,
  add column business_day       date not null default (now() at time zone 'America/La_Paz')::date,
  add column possible_duplicate boolean not null default false,
  add column invoice_nit        text,
  add column invoice_name       text,
  add column courier            text check (courier is null or courier in ('own', 'pedidosya', 'other')),
  add column courier_ref        text,
  add column courier_cost       numeric(10,2),
  add column started_at         timestamptz,
  add column cooking_at         timestamptz;
create index orders_day_store on public.orders (business_day, store_id);

create table public.store_daily_counters (
  store_id text not null references public.stores(id) on delete cascade,
  day      date not null,
  last_no  int not null default 0,
  primary key (store_id, day)
);

create table public.cancel_reasons (
  code       text primary key,
  label      text not null,
  needs_note boolean not null default false,
  sort       int not null default 0
);
insert into public.cancel_reasons (code, label, needs_note, sort) values
  ('changed_mind',     'El cliente se arrepintió',            false, 1),
  ('no_answer',        'El cliente no contesta',              false, 2),
  ('duplicate',        'Pedido duplicado',                    false, 3),
  ('fake',             'Pedido falso / broma',                false, 4),
  ('out_of_zone',      'Fuera de la zona de delivery',        false, 5),
  ('sold_out',         'Producto agotado',                    false, 6),
  ('store_closed',     'Sucursal cerrada o saturada',         false, 7),
  ('delay',            'Demora excesiva',                     false, 8),
  ('taking_error',     'Error al tomar el pedido',            false, 9),
  ('payment',          'Pago no confirmado',                  false, 10),
  ('wrong_address',    'Dirección equivocada',                false, 11),
  ('absent',           'Cliente ausente en la entrega',       false, 12),
  ('courier',          'Problema con el delivery',            false, 13),
  ('other',            'Otro motivo',                         true,  99);

-- ---------- helpers privados ----------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anon;

create or replace function private.my_staff() returns public.staff
language sql stable security definer set search_path = '' as $$
  select s.* from public.staff s where s.user_id = auth.uid() and s.active
$$;

create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = auth.uid() and s.active)
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = auth.uid() and s.active and s.role in ('owner', 'admin'))
$$;

create or replace function private.has_role(roles public.staff_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = auth.uid() and s.active and s.role = any (roles))
$$;

create or replace function private.can_store(p_store text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = auth.uid() and s.active
                 and (s.role in ('owner', 'admin') or s.store_id is null or s.store_id = p_store))
$$;

-- +591 y 8 dígitos (celulares bolivianos empiezan con 6 o 7; fijos de Santa Cruz con 3)
create or replace function public.normalize_phone(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if length(d) = 11 and left(d, 3) = '591' then d := substr(d, 4); end if;
  if length(d) = 13 and left(d, 5) = '00591' then d := substr(d, 6); end if;
  if length(d) <> 8 or left(d, 1) not in ('2', '3', '4', '6', '7') then return null; end if;
  return '+591' || d;
end $$;

-- ---------- triggers ----------
create or replace function private.order_totals() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.total := greatest(0, coalesce(new.subtotal, 0) + coalesce(new.delivery_fee, 0) - coalesce(new.discount, 0));
  return new;
end $$;
create trigger orders_totals before insert or update of subtotal, delivery_fee, discount on public.orders
  for each row execute function private.order_totals();

create or replace function private.refresh_customer_stats() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c uuid := coalesce(new.customer_id, old.customer_id);
begin
  if c is null then return null; end if;
  update public.customers cu set
    orders_count   = x.n,
    total_spent    = x.spent,
    first_order_at = x.first_at,
    last_order_at  = x.last_at
  from (select count(*)::int n, coalesce(sum(total), 0) spent, min(created_at) first_at, max(created_at) last_at
        from public.orders where customer_id = c and status <> 'cancelled') x
  where cu.id = c;
  if tg_op = 'UPDATE' and old.customer_id is distinct from new.customer_id and old.customer_id is not null then
    update public.customers cu set orders_count = x.n, total_spent = x.spent, first_order_at = x.first_at, last_order_at = x.last_at
    from (select count(*)::int n, coalesce(sum(total), 0) spent, min(created_at) first_at, max(created_at) last_at
          from public.orders where customer_id = old.customer_id and status <> 'cancelled') x
    where cu.id = old.customer_id;
  end if;
  return null;
end $$;
create trigger orders_customer_stats after insert or update of status, total, customer_id on public.orders
  for each row execute function private.refresh_customer_stats();

create or replace function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rid text;
  d jsonb;
  k text;
begin
  if tg_table_name = 'orders' then
    -- solo cambios sensibles del pedido
    d := '{}'::jsonb;
    foreach k in array array['status', 'cancel_reason', 'discount', 'delivery_fee', 'payment_method', 'payment_status', 'total', 'rider_id'] loop
      if (to_jsonb(old) -> k) is distinct from (to_jsonb(new) -> k) then
        d := d || jsonb_build_object(k, jsonb_build_object('from', to_jsonb(old) -> k, 'to', to_jsonb(new) -> k));
      end if;
    end loop;
    if d = '{}'::jsonb then return null; end if;
    insert into public.audit_log (actor, action, entity, entity_id, data)
      values (auth.uid(), 'update', 'orders', new.code, d);
    return null;
  end if;
  d := coalesce(to_jsonb(new), to_jsonb(old));
  rid := case tg_table_name
           when 'store_item_availability' then (d ->> 'store_id') || '/' || (d ->> 'item_id')
           when 'staff' then d ->> 'user_id'
           else d ->> 'id' end;
  if tg_op = 'UPDATE' then
    d := '{}'::jsonb;
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if k not in ('updated_at') and (to_jsonb(old) -> k) is distinct from (to_jsonb(new) -> k) then
        d := d || jsonb_build_object(k, jsonb_build_object('from', to_jsonb(old) -> k, 'to', to_jsonb(new) -> k));
      end if;
    end loop;
    if d = '{}'::jsonb then return null; end if;
  elsif tg_op = 'INSERT' then d := to_jsonb(new);
  else d := to_jsonb(old);
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, data)
    values (auth.uid(), lower(tg_op), tg_table_name, rid, d);
  return null;
end $$;

create trigger audit_stores after insert or update or delete on public.stores for each row execute function private.audit();
create trigger audit_menu after insert or update or delete on public.menu_items for each row execute function private.audit();
create trigger audit_avail after insert or update or delete on public.store_item_availability for each row execute function private.audit();
create trigger audit_staff after insert or update or delete on public.staff for each row execute function private.audit();
create trigger audit_orders after update on public.orders for each row execute function private.audit();

-- ---------- RLS ----------
alter table public.stores                  enable row level security;
alter table public.menu_items              enable row level security;
alter table public.store_item_availability enable row level security;
alter table public.staff                   enable row level security;
alter table public.customers               enable row level security;
alter table public.customer_addresses      enable row level security;
alter table public.orders                  enable row level security;
alter table public.order_items             enable row level security;
alter table public.order_events            enable row level security;
alter table public.audit_log               enable row level security;
alter table public.store_daily_counters    enable row level security;
alter table public.cancel_reasons          enable row level security;

-- Lectura pública (sin datos personales)
create policy stores_read on public.stores for select to anon, authenticated using (true);
create policy menu_read on public.menu_items for select to anon, authenticated using (true);
create policy avail_read on public.store_item_availability for select to anon, authenticated using (true);
create policy reasons_read on public.cancel_reasons for select to anon, authenticated using (true);

create policy stores_insert on public.stores for insert to authenticated with check ((select private.is_admin()));
create policy stores_update on public.stores for update to authenticated
  using ((select private.is_admin()) or ((select private.has_role(array['manager']::public.staff_role[])) and (select private.can_store(id))))
  with check ((select private.is_admin()) or ((select private.has_role(array['manager']::public.staff_role[])) and (select private.can_store(id))));

create policy menu_write on public.menu_items for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy avail_write on public.store_item_availability for all to authenticated
  using ((select private.has_role(array['owner', 'admin', 'manager', 'cashier', 'kitchen']::public.staff_role[])) and (select private.can_store(store_id)))
  with check ((select private.has_role(array['owner', 'admin', 'manager', 'cashier', 'kitchen']::public.staff_role[])) and (select private.can_store(store_id)));

create policy staff_read on public.staff for select to authenticated using (
  user_id = (select auth.uid()) or (select private.is_admin())
  or ((select private.has_role(array['manager']::public.staff_role[])) and (select private.can_store(store_id))));

create policy customers_rw on public.customers for select to authenticated
  using ((select private.has_role(array['owner', 'admin', 'manager', 'cashier']::public.staff_role[])));
create policy customers_upd on public.customers for update to authenticated
  using ((select private.has_role(array['owner', 'admin', 'manager', 'cashier']::public.staff_role[])))
  with check ((select private.has_role(array['owner', 'admin', 'manager', 'cashier']::public.staff_role[])));

create policy addr_read on public.customer_addresses for select to authenticated
  using ((select private.has_role(array['owner', 'admin', 'manager', 'cashier', 'rider']::public.staff_role[])));
create policy addr_write on public.customer_addresses for update to authenticated
  using ((select private.has_role(array['owner', 'admin', 'manager', 'cashier']::public.staff_role[])))
  with check ((select private.has_role(array['owner', 'admin', 'manager', 'cashier']::public.staff_role[])));

create policy orders_read on public.orders for select to authenticated using ((select private.can_store(store_id)));
create policy orders_update on public.orders for update to authenticated
  using ((select private.can_store(store_id))) with check ((select private.can_store(store_id)));
create policy items_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (select private.can_store(o.store_id))));
create policy events_read on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (select private.can_store(o.store_id))));
create policy audit_read on public.audit_log for select to authenticated using ((select private.is_admin()));
-- store_daily_counters: sin políticas → solo las RPC (security definer) lo tocan.

-- ---------- privilegios por columna ----------
revoke all on all tables in schema public from anon, authenticated;
grant select on public.stores, public.menu_items, public.store_item_availability, public.cancel_reasons to anon, authenticated;
grant insert, update (name, whatsapp, address, plus_code, open_time, close_time, is_paused, pause_reason, paused_until,
  delivery_fee, accepts_delivery, accepts_pickup, prep_minutes, active, sort) on public.stores to authenticated;
grant insert, update, delete on public.menu_items to authenticated;
grant insert, update, delete on public.store_item_availability to authenticated;
grant select on public.staff, public.audit_log, public.order_items, public.order_events to authenticated;
grant select on public.customers to authenticated;
grant update (name, email, birthday, notes, tags, marketing_opt_in, preferred_store, alt_phone, nit, razon_social,
  allergies, blocked, opt_in_at, opt_in_source) on public.customers to authenticated;
grant select on public.customer_addresses to authenticated;
grant update (address, reference, lat, lng, zona, anillo) on public.customer_addresses to authenticated;
grant select on public.orders to authenticated;
-- El estado y los precios cambian SOLO por RPC.
grant update (payment_method, payment_status, cash_change_for, rider_id, notes, delivery_fee, discount, address, reference,
  courier, courier_ref, courier_cost, invoice_nit, invoice_name, scheduled_for) on public.orders to authenticated;
grant usage on sequence public.audit_log_id_seq, public.order_events_id_seq to authenticated;

-- ---------- realtime ----------
alter publication supabase_realtime add table public.orders, public.order_events, public.stores, public.store_item_availability;
