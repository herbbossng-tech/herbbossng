-- ============================================================
-- GOLDEN COMMERCE OS — Affiliate Portal v3 follow-up: a small,
-- lifetime wallet summary RPC for the Wallet page's "Total Earned"/
-- "Total Paid" tiles. get_my_affiliate_dashboard() already exposes
-- current wallet_balance/reserved_balance (always lifetime-current),
-- but has no lifetime-earned or lifetime-paid figures — those are
-- WITHDRAWAL_PAID transactions recorded with amount=0 (only
-- reserved_delta changes at payout time, per mark_affiliate_withdrawal_paid),
-- so "paid" has to come from affiliate_withdrawals.status = 'PAID'
-- directly, not the transaction ledger.
-- ============================================================

create or replace function public.get_my_wallet_summary()
returns table (
  wallet_balance numeric,
  wallet_reserved_balance numeric,
  wallet_currency_code text,
  lifetime_earned numeric,
  lifetime_paid numeric
)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce((select w.balance from public.affiliate_wallets w where w.affiliate_id = public.current_affiliate_id()), 0),
    coalesce((select w.reserved_balance from public.affiliate_wallets w where w.affiliate_id = public.current_affiliate_id()), 0),
    (select w.currency_code from public.affiliate_wallets w where w.affiliate_id = public.current_affiliate_id()),
    coalesce((
      select sum(t.amount) from public.affiliate_wallet_transactions t
      where t.affiliate_id = public.current_affiliate_id() and t.transaction_type = 'COMMISSION_EARNED'
    ), 0),
    coalesce((
      select sum(wd.amount) from public.affiliate_withdrawals wd
      where wd.affiliate_id = public.current_affiliate_id() and wd.status = 'PAID'
    ), 0);
$$;

grant execute on function public.get_my_wallet_summary() to authenticated;

comment on function public.get_my_wallet_summary() is
  'Self-scoping via current_affiliate_id(). lifetime_earned sums COMMISSION_EARNED wallet transactions (a reversal is its own COMMISSION_REVERSED row, so this is not double-corrected — it is a running lifetime total, matching how "Total Earned" reads on the reference console). lifetime_paid sums affiliate_withdrawals.amount where status=PAID, not the transaction ledger (WITHDRAWAL_PAID transactions carry amount=0 by design).';
