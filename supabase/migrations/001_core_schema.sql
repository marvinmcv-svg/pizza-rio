-- Pizza Río · 001 · esquema base
-- Zona horaria del negocio: America/La_Paz · moneda: Bs (numeric(10,2))

create extension if not exists pgcrypto with schema extensions;

create type public.staff_role as enum ('owner', 'admin', 'manager', 'cashier', 'kitchen', 'rider');
create type public.order_status as enum ('new', 'confirmed', 'preparing', 'cooking', 'ready', 'out_for_delivery', 'delivered', 'cancelled');
-- Canales: web, ría (asistente IA), whatsapp, teléfono, en local y la app de delivery que usan (PedidosYa aparece en sus posts).
create type public.order_channel as enum ('web', 'ria', 'whatsapp', 'phone', 'walk_in', 'pedidosya');
create type public.service_type as enum ('delivery', 'pickup', 'dine_in');
-- Medios de pago: NO están publicados; se dejan los habituales en Bolivia y el dueño confirma.
create type public.payment_method as enum ('cash', 'qr', 'card', 'pedidosya', 'other');
create type public.payment_status as enum ('pending', 'paid', 'refunded');

create table public.stores (
  id           text primary key,                -- = branches[].id en js/data.js
  name         text not null unique,
  whatsapp     text,
  address      text,
  plus_code    text,
  open_time    time,                            -- null = horario no publicado
  close_time   time,
  is_paused    boolean not null default false,
  pause_reason text,
  delivery_fee numeric(10,2),                   -- null = se cotiza por WhatsApp
  active       boolean not null default true,
  sort         int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.menu_items (
  id          text primary key,                 -- mismos ids que catalog()
  name        text not null,
  kind        text not null check (kind in ('main', 'combo', 'promo', 'drink', 'extra', 'sauce', 'side', 'dessert')),
  category    text,
  size        text,
  description text,
  price       numeric(10,2) check (price is null or price >= 0), -- null = precio no publicado (lo fija la sucursal)
  veg         boolean not null default false,
  active      boolean not null default true,
  sort        int not null default 0,
  updated_at  timestamptz not null default now()
);

create table public.store_item_availability (
  store_id   text not null references public.stores(id) on delete cascade,
  item_id    text not null references public.menu_items(id) on delete cascade,
  available  boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (store_id, item_id)
);

create table public.staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  email      text,
  phone      text,
  role       public.staff_role not null,
  store_id   text references public.stores(id),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint staff_store_required check (role in ('owner', 'admin') or store_id is not null)
);

create table public.customers (
  id               uuid primary key default gen_random_uuid(),
  phone            text not null unique,         -- normalizado +591XXXXXXXX
  name             text,
  email            text,
  birthday         date,
  notes            text,
  tags             text[] not null default '{}',
  marketing_opt_in boolean not null default false,
  preferred_store  text references public.stores(id),
  orders_count     int not null default 0,
  total_spent      numeric(12,2) not null default 0,
  first_order_at   timestamptz,
  last_order_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index customers_name_trgm on public.customers using gin (to_tsvector('simple', coalesce(name, '')));
create index customers_last_order on public.customers (last_order_at desc);

create table public.customer_addresses (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  address      text not null,
  reference    text,
  lat          double precision,
  lng          double precision,
  last_used_at timestamptz not null default now(),
  unique (customer_id, address)
);

create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,          -- PR-ABCDE (se muestra al cliente)
  client_ref      text unique,                   -- idempotencia
  store_id        text not null references public.stores(id),
  customer_id     uuid references public.customers(id),
  channel         public.order_channel not null,
  service         public.service_type not null,
  status          public.order_status not null default 'new',
  scheduled_for   timestamptz,
  customer_name   text,
  customer_phone  text,
  address         text,
  reference       text,
  lat             double precision,
  lng             double precision,
  notes           text,
  subtotal        numeric(10,2) not null default 0,
  delivery_fee    numeric(10,2) not null default 0,
  discount        numeric(10,2) not null default 0,
  total           numeric(10,2) not null default 0,
  price_pending   boolean not null default false, -- tiene productos sin precio publicado
  payment_method  public.payment_method,
  payment_status  public.payment_status not null default 'pending',
  cash_change_for numeric(10,2),
  rider_id        uuid references auth.users(id),
  cancel_reason   text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  confirmed_at    timestamptz,
  ready_at        timestamptz,
  dispatched_at   timestamptz,
  delivered_at    timestamptz,
  cancelled_at    timestamptz
);
create index orders_store_status on public.orders (store_id, status, created_at desc);
create index orders_created on public.orders (created_at desc);
create index orders_customer on public.orders (customer_id, created_at desc);

create table public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  item_id    text not null references public.menu_items(id),
  name       text not null,
  unit_price numeric(10,2),                      -- null = precio a confirmar
  qty        int not null check (qty between 1 and 50),
  line_total numeric(10,2),
  notes      text
);
create index order_items_order on public.order_items (order_id);

create table public.order_events (
  id         bigserial primary key,
  order_id   uuid not null references public.orders(id) on delete cascade,
  status     public.order_status not null,
  note       text,
  actor      uuid,
  created_at timestamptz not null default now()
);
create index order_events_order on public.order_events (order_id, created_at);

create table public.audit_log (
  id         bigserial primary key,
  actor      uuid,
  action     text not null,
  entity     text not null,
  entity_id  text,
  data       jsonb,
  created_at timestamptz not null default now()
);
create index audit_created on public.audit_log (created_at desc);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger stores_touch before update on public.stores for each row execute function public.touch_updated_at();
create trigger menu_touch before update on public.menu_items for each row execute function public.touch_updated_at();
create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();
