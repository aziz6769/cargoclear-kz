-- CargoClear KZ — Phase 4, migration 1/3: core schema.
-- Apply in order: 000001 (schema) -> 000002 (RLS) -> 000003 (storage). Idempotent where practical.
--
-- Design notes
--  * Every domain record is stored twice: as a few typed, indexable columns AND as the full domain record in
--    `data` (jsonb). `data` is canonical for the calculation engine in packages/core, so no domain field is lost;
--    the typed columns are a denormalised projection for queries, constraints and reporting.
--  * Every child table references its parent through a COMPOSITE foreign key (id, user_id). The database itself
--    therefore refuses a row that points at another user's shipment/carrier/offer, independently of RLS.
--  * Unknown amounts are stored as NULL, never as 0 (base_price may be NULL).

create table if not exists public.app_migrations (
  version    text primary key,
  name       text not null,
  applied_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  full_name          text not null default '' check (char_length(full_name) <= 200),
  company_name       text not null default '' check (char_length(company_name) <= 200),
  email              text not null default '' check (char_length(email) <= 320),
  preferred_language text not null default 'ru' check (preferred_language in ('ru', 'kk', 'en')),
  settings           jsonb not null default '{}'::jsonb,  -- business settings (currency, FX rates, ...); no secrets
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Creates the profile row when a user registers. Reads only the whitelisted metadata keys.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  lang text := coalesce(new.raw_user_meta_data ->> 'preferred_language', 'ru');
begin
  if lang not in ('ru', 'kk', 'en') then lang := 'ru'; end if;
  insert into public.profiles (id, email, full_name, company_name, preferred_language)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 200),
    left(coalesce(new.raw_user_meta_data ->> 'company_name', ''), 200),
    lang
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- shipments
create table if not exists public.shipments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title             text not null check (char_length(title) between 1 and 300),
  origin            text not null default '',
  destination       text not null default '',
  cargo_description text not null default '',
  cargo_weight      numeric(14, 3) check (cargo_weight is null or cargo_weight >= 0),  -- kg
  cargo_volume      numeric(14, 3) check (cargo_volume is null or cargo_volume >= 0),  -- m3
  currency          text not null default 'KZT' check (char_length(currency) = 3),
  status            text not null default 'draft' check (char_length(status) between 1 and 32),
  data              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists shipments_user_created_idx on public.shipments (user_id, created_at desc);

-- ---------------------------------------------------------------- carriers
create table if not exists public.carriers (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 200),
  contact_person text not null default '',
  phone          text not null default '',
  email          text not null default '',
  website        text not null default '',
  notes          text not null default '',
  data           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists carriers_user_name_idx on public.carriers (user_id, name);

-- ---------------------------------------------------------------- comparisons
create table if not exists public.comparisons (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  shipment_id uuid not null,
  title       text not null check (char_length(title) between 1 and 300),
  status      text not null default 'active' check (char_length(status) between 1 and 32),
  data        jsonb not null default '{}'::jsonb,   -- includes offerIds, notes, isDemo flag
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  foreign key (shipment_id, user_id) references public.shipments (id, user_id) on delete restrict
);
create index if not exists comparisons_user_created_idx on public.comparisons (user_id, created_at desc);
create index if not exists comparisons_shipment_idx on public.comparisons (shipment_id);

-- ---------------------------------------------------------------- offers
-- comparison_id is NULL while the offer is being saved and is linked right after its comparison exists
-- (the domain model saves offers first, then the comparison that lists them).
create table if not exists public.offers (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  comparison_id      uuid,
  shipment_id        uuid not null,
  carrier_id         uuid not null,
  base_price         numeric(16, 2) check (base_price is null or base_price >= 0),  -- NULL = not quoted (never 0)
  currency           text not null default 'KZT' check (char_length(currency) = 3),
  delivery_endpoint  text not null default '' check (char_length(delivery_endpoint) <= 32),
  estimated_delivery integer check (estimated_delivery is null or estimated_delivery >= 0),  -- days
  cost_breakdown     jsonb not null default '{}'::jsonb,   -- per-component status/amount/note (included|charged|excluded|unknown|na)
  data               jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, user_id),
  foreign key (comparison_id, user_id) references public.comparisons (id, user_id) on delete cascade,
  foreign key (shipment_id, user_id) references public.shipments (id, user_id) on delete restrict,
  foreign key (carrier_id, user_id) references public.carriers (id, user_id) on delete restrict
);
create index if not exists offers_user_idx on public.offers (user_id);
create index if not exists offers_comparison_idx on public.offers (comparison_id);
create index if not exists offers_carrier_idx on public.offers (carrier_id);
create index if not exists offers_shipment_idx on public.offers (shipment_id);

-- ---------------------------------------------------------------- documents
-- Metadata only. The file itself lives in the private Storage bucket "documents" under "<user_id>/<document_id>/<name>".
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  shipment_id  uuid,
  offer_id     uuid,
  carrier_id   uuid,
  title        text not null default '' check (char_length(title) <= 300),
  doc_type     text not null default 'quote' check (char_length(doc_type) <= 32),
  file_name    text check (file_name is null or char_length(file_name) <= 255),
  storage_path text check (storage_path is null or (storage_path like user_id::text || '/%' and char_length(storage_path) <= 600)),
  file_type    text check (file_type is null or char_length(file_type) <= 127),
  file_size    bigint check (file_size is null or (file_size >= 0 and file_size <= 3145728)),
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id),
  foreign key (shipment_id, user_id) references public.shipments (id, user_id) on delete set null (shipment_id),
  foreign key (offer_id, user_id) references public.offers (id, user_id) on delete set null (offer_id),
  foreign key (carrier_id, user_id) references public.carriers (id, user_id) on delete set null (carrier_id)
);
create index if not exists documents_user_idx on public.documents (user_id, created_at desc);
create index if not exists documents_shipment_idx on public.documents (shipment_id);

-- ---------------------------------------------------------------- events
-- Append-only change log: shipment history and user-entered carrier interactions.
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  shipment_id uuid,
  entity_type text not null default '' check (char_length(entity_type) <= 32),
  entity_id   uuid,
  event_type  text not null check (char_length(event_type) between 1 and 64),
  description text not null default '' check (char_length(description) <= 1000),
  metadata    jsonb not null default '{}'::jsonb,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (id, user_id),
  foreign key (shipment_id, user_id) references public.shipments (id, user_id) on delete cascade
);
create index if not exists events_user_created_idx on public.events (user_id, created_at desc);
create index if not exists events_entity_idx on public.events (user_id, entity_id);
create index if not exists events_shipment_idx on public.events (shipment_id);

-- ---------------------------------------------------------------- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['profiles', 'shipments', 'carriers', 'comparisons', 'offers', 'documents'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

insert into public.app_migrations (version, name) values ('20261113000001', 'core_schema') on conflict do nothing;
