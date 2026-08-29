-- ============================================================
-- GOLDEN COMMERCE OS — Foundation Migration 0001
-- Extensions and shared helper functions/triggers
-- ============================================================

create extension if not exists "pgcrypto";

-- Generic updated_at trigger, attached to every mutable table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Stamps updated_at = now() on every row update. Attach via BEFORE UPDATE trigger.';
