-- ============================================================
-- GOLDEN COMMERCE OS — Foundation Migration 0004
-- Reference data: countries, states, currencies
-- ============================================================

create table public.currencies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  symbol text not null,
  decimal_places smallint not null default 2,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.countries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  dial_code text,
  currency_code text references public.currencies (code),
  flag_emoji text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.states (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries (id) on delete cascade,
  name text not null,
  code text,
  created_at timestamptz not null default now(),
  unique (country_id, name)
);

create index states_country_id_idx on public.states (country_id);
