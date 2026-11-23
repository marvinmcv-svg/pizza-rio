-- Pizza Río · 003 · RPCs (lo único que cambia estados y precios)

create or replace function private.status_rank(s public.order_status) returns int
language sql immutable set search_path = '' as $$
  select case s when 'new' then 0 when 'confirmed' then 1 when 'preparing' then 2 when 'cooking' then 3
                when 'ready' then 4 when 'out_for_delivery' then 5 when 'delivered' then 6 else 99 end
$$;

-- PR- + 5 caracteres sin 0/O/1/I/L
create or replace function private.new_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := 'PR-';
    for i in 1..5 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.orders where code = c);
  end loop;
  return c;
end $$;

create or replace function private.err(code text) returns void
language plpgsql set search_path = '' as $$
begin raise exception using message = code, errcode = 'P0001'; end $$;

-- ================= place_order =================
create or replace function public.place_order(payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  tz constant text := 'America/La_Paz';
  me public.staff;
  is_public boolean;
  v_ref text := nullif(trim(payload ->> 'client_ref'), '');
  v_channel public.order_channel;
  v_service public.service_type;
  st public.stores;
  v_phone text;
  v_name text := nullif(trim(payload ->> 'customer_name'), '');
  v_addr text := nullif(trim(payload ->> 'address'), '');
  v_lat double precision := nullif(payload ->> 'lat', '')::double precision;
  v_lng double precision := nullif(payload ->> 'lng', '')::double precision;
  v_when text := nullif(trim(payload ->> 'scheduled_for'), '');
  v_sched timestamptz;
  v_cust public.customers;
  v_items jsonb := coalesce(payload -> 'items', '[]'::jsonb);
  it jsonb;
  mi public.menu_items;
  q int;
  v_sub numeric(10,2) := 0;
  v_pending boolean := false;
  v_fee numeric(10,2);
  v_day date := (now() at time zone tz)::date;
  v_no int;
  o public.orders;
  existing public.orders;
  lines jsonb := '[]'::jsonb;
  v_pay public.payment_method;
begin
  -- 1. idempotencia
  if v_ref is not null then
    select * into existing from public.orders where client_ref = v_ref;
    if found then
      select * into st from public.stores where id = existing.store_id;
      return jsonb_build_object('ok', true, 'duplicate', true, 'code', existing.code, 'order_no', existing.order_no,
        'tracking_token', existing.tracking_token, 'subtotal', existing.subtotal, 'delivery_fee', existing.delivery_fee,
        'total', existing.total, 'price_pending', existing.price_pending, 'status', existing.status,
        'store', st.name, 'store_whatsapp', st.whatsapp,
        'items', (select coalesce(jsonb_agg(jsonb_build_object('id', item_id, 'name', name, 'qty', qty, 'unit_price', unit_price, 'line_total', line_total)), '[]')
                  from public.order_items where order_id = existing.id));
    end if;
  end if;

  -- 2. quién llama
  me := private.my_staff();
  is_public := me.user_id is null;
  begin
    v_channel := coalesce(nullif(payload ->> 'channel', ''), case when is_public then 'web' else 'phone' end)::public.order_channel;
    v_service := coalesce(nullif(payload ->> 'service', ''), 'delivery')::public.service_type;
    v_pay := nullif(payload ->> 'payment_method', '')::public.payment_method;
  exception when invalid_text_representation then perform private.err('invalid_payload');
  end;
  if is_public and v_channel not in ('web', 'ria') then perform private.err('invalid_channel'); end if;

  -- 3. sucursal
  select * into st from public.stores s
   where s.active and (s.id = payload ->> 'store' or lower(s.name) = lower(trim(payload ->> 'store')));
  if not found then perform private.err('unknown_store'); end if;
  if not is_public and not private.can_store(st.id) then perform private.err('forbidden_store'); end if;
  if st.is_paused and st.paused_until is not null and st.paused_until <= now() then
    update public.stores set is_paused = false, pause_reason = null, paused_until = null where id = st.id;
    st.is_paused := false;
  end if;
  if is_public then
    if st.is_paused then perform private.err('store_paused'); end if;
    if v_service = 'delivery' and not st.accepts_delivery then perform private.err('delivery_unavailable'); end if;
    if v_service = 'pickup' and not st.accepts_pickup then perform private.err('pickup_unavailable'); end if;
    if v_service = 'dine_in' then perform private.err('invalid_service'); end if;
  end if;

  -- 4. datos del cliente
  v_phone := public.normalize_phone(payload ->> 'customer_phone');
  if nullif(trim(payload ->> 'customer_phone'), '') is not null and v_phone is null then perform private.err('invalid_phone'); end if;
  if is_public and v_phone is null then perform private.err('invalid_phone'); end if;
  if v_name is null and (is_public or v_phone is not null) then perform private.err('missing_name'); end if;
  if v_service = 'delivery' and v_addr is null and (v_lat is null or v_lng is null) then perform private.err('missing_address'); end if;
  if v_lat is not null and (v_lat not between -90 and 90 or v_lng is null or v_lng not between -180 and 180) then
    perform private.err('invalid_location');
  end if;

  -- 5. programado: HH:MM de hoy (hora de Bolivia) o ISO
  if v_when is not null and lower(v_when) not in ('asap', 'ya', 'ahora') then
    begin
      if v_when ~ '^\d{1,2}:\d{2}$' then
        v_sched := ((v_day::text || ' ' || v_when)::timestamp) at time zone tz;
      else
        v_sched := v_when::timestamptz;
      end if;
    exception when others then perform private.err('invalid_time');
    end;
    if v_sched < now() - interval '5 minutes' then perform private.err('time_in_past'); end if;
  end if;

  -- 6. anti abuso
  if v_phone is not null then
    select * into v_cust from public.customers where phone = v_phone;
    if found and v_cust.blocked then perform private.err('customer_blocked'); end if;
    if is_public and (select count(*) from public.orders where customer_phone = v_phone
                       and created_at > now() - interval '10 minutes' and channel in ('web', 'ria')) >= 5 then
      perform private.err('rate_limited');
    end if;
  end if;

  -- 7. productos (precio SIEMPRE desde menu_items)
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then perform private.err('empty_order'); end if;
  if jsonb_array_length(v_items) > 30 then perform private.err('too_many_lines'); end if;
  for it in select * from jsonb_array_elements(v_items) loop
    select * into mi from public.menu_items where id = it ->> 'id' and active;
    if not found then perform private.err('unknown_item:' || coalesce(it ->> 'id', '?')); end if;
    if exists (select 1 from public.store_item_availability a where a.store_id = st.id and a.item_id = mi.id and not a.available) then
      perform private.err('sold_out:' || mi.name);
    end if;
    q := least(50, greatest(1, coalesce(nullif(it ->> 'qty', '')::int, 1)));
    if mi.price is null then v_pending := true; else v_sub := v_sub + mi.price * q; end if;
    lines := lines || jsonb_build_object('id', mi.id, 'name', mi.name, 'qty', q, 'unit_price', mi.price,
      'line_total', case when mi.price is null then null else mi.price * q end, 'notes', left(it ->> 'notes', 200));
  end loop;

  -- 8. cliente (CRM) y dirección
  if v_phone is not null then
    insert into public.customers (phone, name, preferred_store, nit, razon_social)
      values (v_phone, v_name, st.id, nullif(payload ->> 'invoice_nit', ''), nullif(payload ->> 'invoice_name', ''))
    on conflict (phone) do update set
      name = coalesce(excluded.name, public.customers.name),
      preferred_store = excluded.preferred_store,
      nit = coalesce(excluded.nit, public.customers.nit),
      razon_social = coalesce(excluded.razon_social, public.customers.razon_social)
    returning * into v_cust;
    if v_service = 'delivery' and v_addr is not null then
      insert into public.customer_addresses (customer_id, address, reference, lat, lng)
        values (v_cust.id, v_addr, nullif(payload ->> 'reference', ''), v_lat, v_lng)
      on conflict (customer_id, address) do update set
        reference = coalesce(excluded.reference, public.customer_addresses.reference),
        lat = coalesce(excluded.lat, public.customer_addresses.lat),
        lng = coalesce(excluded.lng, public.customer_addresses.lng),
        last_used_at = now();
    end if;
  end if;

  -- 10. número del día por sucursal
  insert into public.store_daily_counters (store_id, day, last_no) values (st.id, v_day, 1)
    on conflict (store_id, day) do update set last_no = public.store_daily_counters.last_no + 1
    returning last_no into v_no;

  v_fee := case when v_service = 'delivery' then coalesce(st.delivery_fee, 0) else 0 end;

  insert into public.orders (code, client_ref, store_id, customer_id, channel, service, scheduled_for,
    customer_name, customer_phone, address, reference, lat, lng, notes, subtotal, delivery_fee, price_pending,
    payment_method, cash_change_for, invoice_nit, invoice_name, created_by, order_no, business_day, possible_duplicate)
  values (private.new_code(), v_ref, st.id, v_cust.id, v_channel, v_service, v_sched,
    v_name, v_phone, v_addr, nullif(payload ->> 'reference', ''), v_lat, v_lng, left(nullif(payload ->> 'notes', ''), 500),
    v_sub, v_fee, v_pending, v_pay, nullif(payload ->> 'cash_change_for', '')::numeric,
    nullif(payload ->> 'invoice_nit', ''), nullif(payload ->> 'invoice_name', ''), me.user_id, v_no, v_day,
    -- 9. posible duplicado
    v_phone is not null and exists (select 1 from public.orders d where d.customer_phone = v_phone and d.store_id = st.id
      and d.subtotal = v_sub and d.status <> 'cancelled' and d.created_at > now() - interval '3 minutes'))
  returning * into o;

  insert into public.order_items (order_id, item_id, name, unit_price, qty, line_total, notes)
    select o.id, l ->> 'id', l ->> 'name', (l ->> 'unit_price')::numeric, (l ->> 'qty')::int, (l ->> 'line_total')::numeric, l ->> 'notes'
    from jsonb_array_elements(lines) l;
  insert into public.order_events (order_id, status, note, actor) values (o.id, 'new', 'Canal: ' || v_channel, me.user_id);

  return jsonb_build_object('ok', true, 'duplicate', false, 'code', o.code, 'order_no', o.order_no,
    'tracking_token', o.tracking_token, 'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee,
    'delivery_fee_quoted', v_service = 'delivery' and st.delivery_fee is null,
    'total', o.total, 'price_pending', o.price_pending, 'status', o.status,
    'store', st.name, 'store_whatsapp', st.whatsapp, 'items', lines);
exception
  when unique_violation then
    -- carrera de doble clic con el mismo client_ref
    if v_ref is not null and exists (select 1 from public.orders where client_ref = v_ref) then
      return public.place_order(payload);
    end if;
    raise;
end $$;

-- ================= track_order (público, sin teléfono ni dirección) =================
create or replace function public.track_order(token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'code', o.code, 'order_no', o.order_no, 'status', o.status, 'service', o.service,
    'name', split_part(coalesce(o.customer_name, ''), ' ', 1),
    'created_at', o.created_at, 'scheduled_for', o.scheduled_for,
    'subtotal', o.subtotal, 'total', o.total, 'delivery_fee', o.delivery_fee, 'price_pending', o.price_pending,
    'cancel_reason', (select r.label from public.cancel_reasons r where r.code = o.cancel_reason),
    'store', jsonb_build_object('name', s.name, 'whatsapp', s.whatsapp, 'prep_minutes', s.prep_minutes),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty) order by i.name), '[]') from public.order_items i where i.order_id = o.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('status', e.status, 'at', e.created_at) order by e.created_at), '[]') from public.order_events e where e.order_id = o.id))
  from public.orders o join public.stores s on s.id = o.store_id
  where o.tracking_token = token
$$;

-- ================= set_order_status (personal) =================
create or replace function public.set_order_status(p_order uuid, p_status public.order_status, p_note text default null, p_cancel_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  me public.staff := private.my_staff();
  o public.orders;
  mgr boolean;
  r public.cancel_reasons;
begin
  if me.user_id is null then perform private.err('not_staff'); end if;
  select * into o from public.orders where id = p_order for update;
  if not found then perform private.err('order_not_found'); end if;
  if not private.can_store(o.store_id) then perform private.err('forbidden_store'); end if;
  if o.status = p_status then return jsonb_build_object('ok', true, 'status', o.status, 'unchanged', true); end if;
  mgr := me.role in ('owner', 'admin', 'manager');

  if o.status in ('delivered', 'cancelled') and not mgr then perform private.err('closed_needs_manager'); end if;
  if p_status = 'out_for_delivery' and o.service <> 'delivery' then perform private.err('not_delivery'); end if;

  if me.role = 'kitchen' and p_status not in ('confirmed', 'preparing', 'cooking', 'ready') then perform private.err('role_forbidden'); end if;
  if me.role = 'rider' and p_status not in ('out_for_delivery', 'delivered') then perform private.err('role_forbidden'); end if;

  if p_status = 'cancelled' then
    select * into r from public.cancel_reasons where code = p_cancel_reason;
    if not found then perform private.err('cancel_reason_required'); end if;
    if r.needs_note and nullif(trim(p_note), '') is null then perform private.err('cancel_note_required'); end if;
    if private.status_rank(o.status) >= private.status_rank('preparing') and o.status <> 'cancelled' and not mgr then
      perform private.err('cancel_needs_manager');
    end if;
  elsif o.status <> 'cancelled' and private.status_rank(p_status) < private.status_rank(o.status) and not mgr then
    perform private.err('recall_needs_manager');
  end if;

  update public.orders set
    status        = p_status,
    cancel_reason = case when p_status = 'cancelled' then p_cancel_reason else null end,
    confirmed_at  = case when p_status = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
    started_at    = case when p_status = 'preparing' then coalesce(started_at, now()) else started_at end,
    cooking_at    = case when p_status = 'cooking' then coalesce(cooking_at, now()) else cooking_at end,
    ready_at      = case when p_status = 'ready' then coalesce(ready_at, now()) else ready_at end,
    dispatched_at = case when p_status = 'out_for_delivery' then coalesce(dispatched_at, now()) else dispatched_at end,
    delivered_at  = case when p_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
    cancelled_at  = case when p_status = 'cancelled' then now() else cancelled_at end,
    rider_id      = case when me.role = 'rider' then me.user_id else rider_id end
  where id = o.id;
  insert into public.order_events (order_id, status, note, actor) values (o.id, p_status, left(nullif(trim(p_note), ''), 300), me.user_id);
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

-- ================= equipo =================
create or replace function public.admin_create_staff(p_email text, p_password text, p_full_name text, p_role public.staff_role,
  p_store text default null, p_phone text default null) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  me public.staff := private.my_staff();
  uid uuid := gen_random_uuid();
  em text := lower(trim(p_email));
begin
  if me.user_id is null or me.role not in ('owner', 'admin') then perform private.err('admin_only'); end if;
  if p_role = 'owner' and me.role <> 'owner' then perform private.err('owner_only'); end if;
  if length(coalesce(p_password, '')) < 8 then perform private.err('weak_password'); end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then perform private.err('invalid_email'); end if;
  if nullif(trim(p_full_name), '') is null then perform private.err('missing_name'); end if;
  if p_role not in ('owner', 'admin') and p_store is null then perform private.err('store_required'); end if;
  if exists (select 1 from auth.users where email = em) then perform private.err('email_taken'); end if;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', em,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', trim(p_full_name)), now(), now());
  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid::text, uid, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true),
    'email', now(), now(), now());
  insert into public.staff (user_id, full_name, email, phone, role, store_id)
    values (uid, trim(p_full_name), em, public.normalize_phone(p_phone), p_role,
            case when p_role in ('owner', 'admin') then null else p_store end);
  return uid;
end $$;

create or replace function public.admin_update_staff(p_user uuid, p_role public.staff_role, p_store text, p_active boolean,
  p_full_name text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  me public.staff := private.my_staff();
  t public.staff;
begin
  if me.user_id is null or me.role not in ('owner', 'admin') then perform private.err('admin_only'); end if;
  select * into t from public.staff where user_id = p_user;
  if not found then perform private.err('staff_not_found'); end if;
  if (t.role = 'owner' or p_role = 'owner') and me.role <> 'owner' then perform private.err('owner_only'); end if;
  if p_user = me.user_id and (p_role <> me.role or not p_active) then perform private.err('cannot_demote_self'); end if;
  if p_role not in ('owner', 'admin') and p_store is null then perform private.err('store_required'); end if;
  update public.staff set role = p_role, active = p_active,
    store_id = case when p_role in ('owner', 'admin') then null else p_store end,
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name)
  where user_id = p_user;
end $$;

create or replace function public.admin_set_password(p_user uuid, p_password text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  me public.staff := private.my_staff();
  t public.staff;
begin
  if me.user_id is null or me.role not in ('owner', 'admin') then perform private.err('admin_only'); end if;
  select * into t from public.staff where user_id = p_user;
  if not found then perform private.err('staff_not_found'); end if;
  if t.role = 'owner' and me.role <> 'owner' then perform private.err('owner_only'); end if;
  if length(coalesce(p_password, '')) < 8 then perform private.err('weak_password'); end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
   where id = p_user;
  insert into public.audit_log (actor, action, entity, entity_id, data)
    values (me.user_id, 'password_reset', 'staff', p_user::text, null);
end $$;

-- ================= reportes =================
create or replace function public.report_summary(p_from date, p_to date, p_store text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tz constant text := 'America/La_Paz';
  me public.staff := private.my_staff();
  v_store text := p_store;
  res jsonb;
begin
  if me.user_id is null or me.role not in ('owner', 'admin', 'manager', 'cashier') then perform private.err('forbidden'); end if;
  if me.role not in ('owner', 'admin') and me.store_id is not null then v_store := me.store_id; end if;
  if p_to < p_from or p_to - p_from > 366 then perform private.err('invalid_range'); end if;

  with o as (
    select * from public.orders
    where business_day between p_from and p_to and (v_store is null or store_id = v_store)
  ), ok as (select * from o where status <> 'cancelled'),
  cust as (
    select count(distinct customer_id) n,
           count(distinct customer_id) filter (where c.first_order_at at time zone tz >= p_from
                                               and (c.first_order_at at time zone tz)::date <= p_to) new_n
    from ok left join public.customers c on c.id = ok.customer_id where ok.customer_id is not null
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'store', v_store,
    'orders', (select count(*) from ok),
    'revenue', (select coalesce(sum(total), 0) from ok),
    'avg_ticket', (select round(coalesce(avg(total), 0), 2) from ok),
    'cancelled', (select count(*) from o where status = 'cancelled'),
    'cancelled_pct', (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where status = 'cancelled') / count(*), 1) end from o),
    'customers', (select n from cust),
    'new_customers', (select new_n from cust),
    'avg_prep_min', (select round(avg(extract(epoch from ready_at - confirmed_at) / 60)::numeric, 1) from ok where ready_at is not null and confirmed_at is not null),
    'avg_out_door_min', (select round(avg(extract(epoch from dispatched_at - created_at) / 60)::numeric, 1) from ok where dispatched_at is not null),
    'avg_delivery_min', (select round(avg(extract(epoch from delivered_at - created_at) / 60)::numeric, 1) from ok where service = 'delivery' and delivered_at is not null),
    'late_pct', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where delivered_at - created_at > interval '45 minutes') / count(*), 1) end
                 from ok where service = 'delivery' and delivered_at is not null),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'orders', n, 'revenue', rev) order by d), '[]')
               from (select business_day d, count(*) n, sum(total) rev from ok group by 1) x),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'orders', n) order by h), '[]')
                from (select extract(hour from created_at at time zone tz)::int h, count(*) n from ok group by 1) x),
    'by_store', (select coalesce(jsonb_agg(jsonb_build_object('store', s.name, 'id', x.store_id, 'orders', n, 'revenue', rev) order by rev desc), '[]')
                 from (select store_id, count(*) n, sum(total) rev from ok group by 1) x join public.stores s on s.id = x.store_id),
    'by_channel', (select coalesce(jsonb_agg(jsonb_build_object('channel', c, 'orders', n, 'revenue', rev) order by n desc), '[]')
                   from (select channel c, count(*) n, sum(total) rev from ok group by 1) x),
    'by_service', (select coalesce(jsonb_agg(jsonb_build_object('service', s, 'orders', n, 'revenue', rev) order by n desc), '[]')
                   from (select service s, count(*) n, sum(total) rev from ok group by 1) x),
    'top_items', (select coalesce(jsonb_agg(jsonb_build_object('id', item_id, 'name', name, 'qty', q, 'revenue', rev) order by q desc), '[]')
                  from (select i.item_id, max(i.name) name, sum(i.qty) q, coalesce(sum(i.line_total), 0) rev
                        from public.order_items i join ok on ok.id = i.order_id group by 1 order by 3 desc limit 15) x),
    'cancel_reasons', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'label', label, 'count', n) order by n desc), '[]')
                       from (select o.cancel_reason code, coalesce(r.label, 'Sin motivo') label, count(*) n
                             from o left join public.cancel_reasons r on r.code = o.cancel_reason
                             where o.status = 'cancelled' group by 1, 2) x)
  ) into res;
  return res;
end $$;

-- ================= permisos de ejecución =================
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function public.place_order(jsonb), public.track_order(uuid), public.normalize_phone(text) to anon, authenticated;
grant execute on function public.set_order_status(uuid, public.order_status, text, text),
  public.admin_create_staff(text, text, text, public.staff_role, text, text),
  public.admin_update_staff(uuid, public.staff_role, text, boolean, text),
  public.admin_set_password(uuid, text),
  public.report_summary(date, date, text) to authenticated;
-- RLS usa estos helpers: deben poder ejecutarse (son security definer y solo devuelven booleanos / la fila propia)
grant execute on function private.my_staff(), private.is_staff(), private.is_admin(), private.has_role(public.staff_role[]),
  private.can_store(text) to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
