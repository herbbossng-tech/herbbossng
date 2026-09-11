-- ============================================================
-- GOLDEN COMMERCE OS — Affiliate Portal v3, part 1: self-service
-- wallet/withdrawals, ad-cost submission, and payout bank accounts.
--
-- affiliate_wallets/affiliate_withdrawals/ad_costs already existed
-- (0024) for the STAFF side (manual credit, approve/reject/pay).
-- This migration adds the affiliate-portal-facing half: an affiliate
-- requesting their own withdrawal, submitting their own ad spend for
-- approval, and managing the bank accounts they get paid into — all
-- gated by current_affiliate_id(), never a workspace-staff permission.
-- ============================================================


-- ----------------------------------------------------------------
-- PART A — affiliate_bank_accounts: up to 5 saved payout accounts
-- per affiliate. Snapshotted into affiliate_withdrawals.payout_method
-- at request time (that column was always a free-form jsonb blob,
-- 0024) so a later edit/delete of the account never rewrites the
-- record of how a past withdrawal was actually meant to be paid.
-- ----------------------------------------------------------------
create table public.affiliate_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  bank_name text not null,
  account_number text not null,
  account_name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index affiliate_bank_accounts_affiliate_id_idx on public.affiliate_bank_accounts (affiliate_id);

comment on table public.affiliate_bank_accounts is
  'Payout bank accounts an affiliate manages themselves. Max 5 per affiliate, enforced in create_my_bank_account(). Written only via create_my_bank_account()/delete_my_bank_account()/set_my_default_bank_account() — no direct-write RLS policy.';

alter table public.affiliate_bank_accounts enable row level security;

create policy "select_affiliate_bank_accounts_own" on public.affiliate_bank_accounts
  for select to authenticated
  using (affiliate_id = public.current_affiliate_id());

create or replace function public.create_my_bank_account(p_bank_name text, p_account_number text, p_account_name text)
returns public.affiliate_bank_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aff uuid := public.current_affiliate_id();
  v_count integer;
  v_account public.affiliate_bank_accounts%rowtype;
begin
  if v_aff is null then
    raise exception 'insufficient_permission: an active, approved affiliate portal session is required';
  end if;
  if coalesce(trim(p_bank_name), '') = '' or coalesce(trim(p_account_number), '') = '' or coalesce(trim(p_account_name), '') = '' then
    raise exception 'Bank name, account number, and account name are all required';
  end if;

  select count(*) into v_count from public.affiliate_bank_accounts where affiliate_id = v_aff;
  if v_count >= 5 then
    raise exception 'You can save at most 5 bank accounts';
  end if;

  insert into public.affiliate_bank_accounts (affiliate_id, bank_name, account_number, account_name, is_default)
  values (v_aff, trim(p_bank_name), trim(p_account_number), trim(p_account_name), v_count = 0)
  returning * into v_account;

  return v_account;
end;
$$;

grant execute on function public.create_my_bank_account(text, text, text) to authenticated;

create or replace function public.delete_my_bank_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aff uuid := public.current_affiliate_id();
  v_was_default boolean;
  v_next_id uuid;
begin
  if v_aff is null then
    raise exception 'insufficient_permission: an active, approved affiliate portal session is required';
  end if;

  select is_default into v_was_default from public.affiliate_bank_accounts where id = p_account_id and affiliate_id = v_aff;
  if not found then
    raise exception 'Bank account not found';
  end if;

  delete from public.affiliate_bank_accounts where id = p_account_id and affiliate_id = v_aff;

  if v_was_default then
    select id into v_next_id from public.affiliate_bank_accounts where affiliate_id = v_aff order by created_at limit 1;
    if v_next_id is not null then
      update public.affiliate_bank_accounts set is_default = true where id = v_next_id;
    end if;
  end if;
end;
$$;

grant execute on function public.delete_my_bank_account(uuid) to authenticated;

create or replace function public.set_my_default_bank_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aff uuid := public.current_affiliate_id();
begin
  if v_aff is null then
    raise exception 'insufficient_permission: an active, approved affiliate portal session is required';
  end if;
  if not exists (select 1 from public.affiliate_bank_accounts where id = p_account_id and affiliate_id = v_aff) then
    raise exception 'Bank account not found';
  end if;

  update public.affiliate_bank_accounts set is_default = (id = p_account_id) where affiliate_id = v_aff;
end;
$$;

grant execute on function public.set_my_default_bank_account(uuid) to authenticated;


-- ----------------------------------------------------------------
-- PART B — affiliate self-service withdrawal requests. Reuses
-- credit_affiliate_wallet()'s WITHDRAWAL_RESERVED transaction type
-- and the same row-locked balance check as the existing staff-side
-- request_affiliate_withdrawal() (0024) — the only difference is the
-- caller-identity check (current_affiliate_id() instead of a
-- workspace withdrawals.create permission) and pulling payout_method
-- from a saved bank account instead of affiliates.payout_method.
-- ----------------------------------------------------------------
create or replace function public.request_my_affiliate_withdrawal(p_amount numeric, p_bank_account_id uuid, p_note text default null)
returns public.affiliate_withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aff_id uuid := public.current_affiliate_id();
  v_affiliate public.affiliates%rowtype;
  v_account public.affiliate_bank_accounts%rowtype;
  v_wallet public.affiliate_wallets%rowtype;
  v_txn public.affiliate_wallet_transactions%rowtype;
  v_withdrawal public.affiliate_withdrawals%rowtype;
  v_payout_method jsonb;
begin
  if v_aff_id is null then
    raise exception 'insufficient_permission: an active, approved affiliate portal session is required';
  end if;
  select * into v_affiliate from public.affiliates where id = v_aff_id;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select * into v_account from public.affiliate_bank_accounts where id = p_bank_account_id and affiliate_id = v_aff_id;
  if not found then
    raise exception 'Bank account not found';
  end if;
  v_payout_method := jsonb_build_object('bank_name', v_account.bank_name, 'account_number', v_account.account_number, 'account_name', v_account.account_name);

  insert into public.affiliate_wallets (workspace_id, affiliate_id, currency_code)
    values (v_affiliate.workspace_id, v_aff_id, 'NGN')
    on conflict (workspace_id, affiliate_id) do nothing;

  select * into v_wallet from public.affiliate_wallets
    where workspace_id = v_affiliate.workspace_id and affiliate_id = v_aff_id
    for update;

  if v_wallet.balance < p_amount then
    raise exception 'Insufficient balance: available % < requested %', v_wallet.balance, p_amount;
  end if;

  v_txn := public.credit_affiliate_wallet(
    v_affiliate.workspace_id, v_aff_id, 'WITHDRAWAL_RESERVED', -p_amount, p_amount,
    'withdrawal', null, 'Withdrawal requested', v_wallet.currency_code
  );

  insert into public.affiliate_withdrawals (
    workspace_id, affiliate_id, amount, currency_code, payout_method, note,
    requested_by, reserve_transaction_id
  ) values (
    v_affiliate.workspace_id, v_aff_id, p_amount, v_wallet.currency_code, v_payout_method, p_note,
    auth.uid(), v_txn.id
  )
  returning * into v_withdrawal;

  update public.affiliate_wallet_transactions set reference_id = v_withdrawal.id where id = v_txn.id;

  return v_withdrawal;
end;
$$;

grant execute on function public.request_my_affiliate_withdrawal(numeric, uuid, text) to authenticated;

comment on function public.request_my_affiliate_withdrawal(numeric, uuid, text) is
  'Affiliate-portal counterpart to request_affiliate_withdrawal() (0024, staff-only). Same wallet-row-lock/balance-check/reserve-transaction mechanics; payout_method is snapshotted from the affiliate''s own saved bank account, never re-read live at approval time.';

create policy "select_affiliate_withdrawals_own" on public.affiliate_withdrawals
  for select to authenticated
  using (affiliate_id = public.current_affiliate_id());

create policy "select_affiliate_wallet_transactions_own" on public.affiliate_wallet_transactions
  for select to authenticated
  using (affiliate_id = public.current_affiliate_id());

create or replace function public.get_my_affiliate_withdrawals(p_limit integer default 20, p_offset integer default 0)
returns table (
  id uuid,
  amount numeric,
  currency_code text,
  status text,
  note text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  rejection_reason text,
  paid_at timestamptz,
  payment_reference text,
  total_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select w.id, w.amount, w.currency_code, w.status, w.note, w.requested_at, w.reviewed_at, w.rejection_reason,
    w.paid_at, w.payment_reference, count(*) over() as total_count
  from public.affiliate_withdrawals w
  where w.affiliate_id = public.current_affiliate_id()
  order by w.requested_at desc
  limit greatest(coalesce(p_limit, 20), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.get_my_affiliate_withdrawals(integer, integer) to authenticated;

create or replace function public.get_my_wallet_transactions(p_limit integer default 20, p_offset integer default 0)
returns table (
  id uuid,
  transaction_type text,
  amount numeric,
  reserved_delta numeric,
  description text,
  created_at timestamptz,
  total_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, t.transaction_type, t.amount, t.reserved_delta, t.description, t.created_at, count(*) over() as total_count
  from public.affiliate_wallet_transactions t
  where t.affiliate_id = public.current_affiliate_id()
  order by t.created_at desc
  limit greatest(coalesce(p_limit, 20), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.get_my_wallet_transactions(integer, integer) to authenticated;


-- ----------------------------------------------------------------
-- PART C — affiliate self-service ad-cost submission. ad_costs
-- (0024) only had staff insert/select/update policies gated on
-- ad_costs.create/.view workspace permissions — an affiliate portal
-- session has no workspace membership at all, so it needed its own
-- SECURITY DEFINER path rather than a relaxed RLS policy (which
-- would also require loosening it for every other ad_costs column).
-- ----------------------------------------------------------------
create or replace function public.submit_my_ad_cost(
  p_campaign_id uuid,
  p_period_start date,
  p_period_end date,
  p_cost_amount numeric,
  p_orders_count integer,
  p_notes text default null
)
returns public.ad_costs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aff_id uuid := public.current_affiliate_id();
  v_affiliate public.affiliates%rowtype;
  v_campaign public.affiliate_campaigns%rowtype;
  v_ad_cost public.ad_costs%rowtype;
begin
  if v_aff_id is null then
    raise exception 'insufficient_permission: an active, approved affiliate portal session is required';
  end if;
  select * into v_affiliate from public.affiliates where id = v_aff_id;

  select * into v_campaign from public.affiliate_campaigns
    where id = p_campaign_id and workspace_id = v_affiliate.workspace_id and deleted_at is null;
  if not found then
    raise exception 'Campaign not found';
  end if;

  if p_period_end < p_period_start then
    raise exception 'period_end cannot be before period_start';
  end if;
  if p_cost_amount is null or p_cost_amount < 0 then
    raise exception 'cost amount must be non-negative';
  end if;
  if p_orders_count is null or p_orders_count < 0 then
    raise exception 'orders count must be non-negative';
  end if;

  insert into public.ad_costs (
    workspace_id, brand_id, campaign_id, affiliate_id, period_start, period_end,
    initial_cost_amount, initial_orders_count, currency_code, status, notes, submitted_by
  ) values (
    v_affiliate.workspace_id, v_campaign.brand_id, p_campaign_id, v_aff_id, p_period_start, p_period_end,
    p_cost_amount, p_orders_count, 'NGN', 'PENDING', p_notes, auth.uid()
  )
  returning * into v_ad_cost;

  return v_ad_cost;
end;
$$;

grant execute on function public.submit_my_ad_cost(uuid, date, date, numeric, integer, text) to authenticated;

create policy "select_ad_costs_own" on public.ad_costs
  for select to authenticated
  using (affiliate_id = public.current_affiliate_id());

create or replace function public.get_my_ad_costs(p_status text default null, p_limit integer default 20, p_offset integer default 0)
returns table (
  id uuid,
  campaign_id uuid,
  period_start date,
  period_end date,
  initial_cost_amount numeric,
  initial_orders_count integer,
  currency_code text,
  status text,
  notes text,
  rejection_reason text,
  submitted_at timestamptz,
  total_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select a.id, a.campaign_id, a.period_start, a.period_end, a.initial_cost_amount, a.initial_orders_count,
    a.currency_code, a.status, a.notes, a.rejection_reason, a.submitted_at, count(*) over() as total_count
  from public.ad_costs a
  where a.affiliate_id = public.current_affiliate_id()
    and (p_status is null or a.status = p_status)
  order by a.submitted_at desc
  limit greatest(coalesce(p_limit, 20), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.get_my_ad_costs(text, integer, integer) to authenticated;
