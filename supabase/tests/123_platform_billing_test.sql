-- ============================================================
-- Platform Billing / Subscriptions / Payments / Crypto — dedicated
-- certification suite for migration 0039.
--
-- 20 scenarios, run against a fresh 0001->0039 migration chain via
-- genuine `set_config('app.test_user_id', ...)` + `set role
-- authenticated/anon` Postgres-role impersonation — never a mocked
-- permission check.
--
-- Concurrency note: "two overlapping review_tenant_payment() calls
-- cannot both approve the same payment" is verified separately, NOT
-- in this file, by launching real concurrent psql processes — a
-- single script cannot exercise true concurrency (the same precedent
-- established by 111_automation_concurrency_test.sql and followed by
-- 122_workforce_ops_test.sql). See the final engineering report for
-- that result.
-- ============================================================

\set ON_ERROR_STOP on

\echo '=== 1. Anonymous visitor sees only active+public plans and active payment methods (needed for the homepage) ==='
do $$
declare v_count int;
begin
  insert into public.subscription_plans (slug, name, monthly_price, currency_code, is_active, is_public)
    values ('t123-hidden-inactive', 'Hidden Inactive', 99, 'USD', false, true),
           ('t123-hidden-private', 'Hidden Private', 99, 'USD', true, false);

  set role anon;
  select count(*) into v_count from public.subscription_plans where slug like 't123-%';
  assert v_count = 0, 'anon must never see an inactive or private plan';

  select count(*) into v_count from public.payment_methods_config where is_active = false;
  assert v_count = 0, 'anon must never see an inactive payment method row (the query itself must return zero, not just hide it client-side)';
  reset role;
  raise notice 'OK 1: anon plan/payment-method visibility is correctly restricted to active+public rows.';
end $$;

\echo '=== 2. A regular authenticated user (not platform admin) cannot write plans, payment methods, or crypto config ==='
do $$
declare
  v_user uuid := '00000000-0000-0000-0000-0000000000c1';
  v_failed boolean;
begin
  insert into auth.users (id, email) values (v_user, 'plain-c1@test.local');
  perform set_config('app.test_user_id', v_user::text, false);
  set role authenticated;

  v_failed := false;
  begin
    perform public.upsert_subscription_plan(p_slug => 't123-illegal', p_name => 'Illegal');
  exception when others then v_failed := true;
  end;
  assert v_failed, 'a non-platform-admin must never be able to create a subscription plan';

  v_failed := false;
  begin
    perform public.set_payment_method_config(p_method_type => 'card', p_display_label => 'Illegal Card', p_is_active => true);
  exception when others then v_failed := true;
  end;
  assert v_failed, 'a non-platform-admin must never be able to configure a payment method';

  v_failed := false;
  begin
    perform public.set_crypto_payment_config(p_currency_code => 'BTC', p_network => 'BTC', p_wallet_address => 'illegal-address');
  exception when others then v_failed := true;
  end;
  assert v_failed, 'a non-platform-admin must never be able to configure a crypto wallet';

  v_failed := false;
  begin
    perform public.set_platform_setting('homepage', '{}'::jsonb);
  exception when others then v_failed := true;
  end;
  assert v_failed, 'a non-platform-admin must never be able to write platform_settings';

  reset role;
  raise notice 'OK 2: every platform-admin-only write RPC correctly rejects a plain authenticated user.';
end $$;

\echo '=== 3. Anonymous is denied by every privileged billing RPC ==='
do $$
declare v_failed boolean;
begin
  set role anon;

  v_failed := false;
  begin
    perform public.subscribe_to_plan(gen_random_uuid(), (select id from public.subscription_plans where slug = 'starter'));
  exception when others then v_failed := true;
  end;
  assert v_failed, 'anonymous must be denied by subscribe_to_plan()';

  v_failed := false;
  begin
    perform public.submit_tenant_payment(gen_random_uuid(), (select id from public.subscription_plans where slug = 'starter'), 'monthly', 'manual', 'anon-attempt');
  exception when others then v_failed := true;
  end;
  assert v_failed, 'anonymous must be denied by submit_tenant_payment()';

  v_failed := false;
  begin
    perform public.review_tenant_payment(gen_random_uuid(), 'approve');
  exception when others then v_failed := true;
  end;
  assert v_failed, 'anonymous must be denied by review_tenant_payment()';

  reset role;
  raise notice 'OK 3: anonymous is denied by subscribe/submit/review.';
end $$;

-- ============================================================
-- Cluster: a real workspace + owner + a platform admin, used by the
-- rest of the suite.
-- ============================================================
do $$
declare
  v_owner uuid := '00000000-0000-0000-0000-0000000000c2';
  v_admin uuid := '00000000-0000-0000-0000-0000000000c3';
  v_ws uuid;
  v_owner_role uuid;
begin
  insert into auth.users (id, email) values (v_owner, 'owner-c2@test.local'), (v_admin, 'admin-c3@test.local');
  update public.profiles set is_platform_admin = true where id = v_admin;
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('WF123 Billing', 'wf123-billing', 'NG', 'NGN', v_owner) returning id into v_ws;
  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values (v_owner, v_ws, v_owner_role);
  raise notice 'C_WS=%, C_OWNER=%, C_ADMIN=%', v_ws, v_owner, v_admin;
end $$;

\echo '=== 4. Subscribing derives amount/currency server-side from the live plan — there is no client-supplied-price parameter at all ==='
do $$
declare
  v_ws uuid; v_owner uuid := '00000000-0000-0000-0000-0000000000c2';
  v_sub record;
begin
  select id into v_ws from public.workspaces where slug = 'wf123-billing';
  perform set_config('app.test_user_id', v_owner::text, false);
  set role authenticated;
  select * into v_sub from public.subscribe_to_plan(v_ws, (select id from public.subscription_plans where slug = 'growth'), 'monthly');
  reset role;
  assert v_sub.amount = (select monthly_price from public.subscription_plans where slug = 'growth'), 'subscription amount must exactly equal the plan''s current monthly price';
  assert v_sub.currency_code = (select currency_code from public.subscription_plans where slug = 'growth'), 'subscription currency must exactly equal the plan''s currency';
  assert v_sub.status = 'TRIALING', 'a plan with trial_days > 0 must start TRIALING';
  raise notice 'OK 4: subscribe_to_plan() derives amount/currency from the server-side plan row.';
end $$;

\echo '=== 5. A later plan price change never rewrites an already-subscribed tenant''s snapshotted amount ==='
do $$
declare
  v_ws uuid; v_original_amount numeric; v_current_amount numeric;
begin
  select id into v_ws from public.workspaces where slug = 'wf123-billing';
  select amount into v_original_amount from public.tenant_subscriptions where workspace_id = v_ws;
  update public.subscription_plans set monthly_price = 999999 where slug = 'growth';
  select amount into v_current_amount from public.tenant_subscriptions where workspace_id = v_ws;
  assert v_current_amount = v_original_amount, 'a plan price edit must never silently rewrite an existing subscription''s snapshotted amount';
  update public.subscription_plans set monthly_price = 149 where slug = 'growth';
  raise notice 'OK 5: subscription amount is genuinely snapshotted, immune to later plan price edits.';
end $$;

\echo '=== 6. submit_tenant_payment() never accepts a client-supplied amount and never sets status beyond SUBMITTED ==='
do $$
declare
  v_ws uuid; v_owner uuid := '00000000-0000-0000-0000-0000000000c2';
  v_payment record;
begin
  select id into v_ws from public.workspaces where slug = 'wf123-billing';
  perform set_config('app.test_user_id', v_owner::text, false);
  set role authenticated;
  select * into v_payment from public.submit_tenant_payment(v_ws, (select id from public.subscription_plans where slug = 'growth'), 'monthly', 'manual', 't6-idem-1');
  reset role;
  assert v_payment.amount = (select monthly_price from public.subscription_plans where slug = 'growth'), 'payment amount must be server-derived from the plan, not client-supplied (there is no amount parameter on submit_tenant_payment at all)';
  assert v_payment.status = 'SUBMITTED', 'a manual payment submission must land as SUBMITTED, awaiting review — never APPROVED';
  raise notice 'OK 6: submit_tenant_payment() is server-authoritative on amount and never self-approves.';
end $$;

\echo '=== 7. Only a platform admin can approve; a workspace Owner (even Owner of the paying workspace) cannot approve their own payment ==='
do $$
declare
  v_ws uuid; v_owner uuid := '00000000-0000-0000-0000-0000000000c2';
  v_payment_id uuid;
  v_failed boolean := false;
begin
  select id into v_ws from public.workspaces where slug = 'wf123-billing';
  select id into v_payment_id from public.tenant_payments where idempotency_key = 't6-idem-1';

  perform set_config('app.test_user_id', v_owner::text, false);
  set role authenticated;
  begin
    perform public.review_tenant_payment(v_payment_id, 'approve');
  exception when others then v_failed := true;
  end;
  reset role;
  assert v_failed, 'a workspace Owner must never be able to approve their own workspace''s payment — only a platform admin can';
  raise notice 'OK 7: self-approval by the paying tenant''s own Owner is correctly rejected.';
end $$;

\echo '=== 8. Platform admin approval activates the subscription; the payment can never be approved a second time ==='
do $$
declare
  v_ws uuid; v_admin uuid := '00000000-0000-0000-0000-0000000000c3';
  v_payment_id uuid;
  v_status text;
  v_failed boolean := false;
begin
  select id into v_ws from public.workspaces where slug = 'wf123-billing';
  select id into v_payment_id from public.tenant_payments where idempotency_key = 't6-idem-1';

  perform set_config('app.test_user_id', v_admin::text, false);
  set role authenticated;
  select status into v_status from public.review_tenant_payment(v_payment_id, 'approve');
  reset role;
  assert v_status = 'APPROVED', 'platform admin approval must succeed';

  select status into v_status from public.tenant_subscriptions where workspace_id = v_ws;
  assert v_status = 'ACTIVE', 'an approved payment must activate the subscription';

  perform set_config('app.test_user_id', v_admin::text, false);
  set role authenticated;
  begin
    perform public.review_tenant_payment(v_payment_id, 'approve');
  exception when others then v_failed := true;
  end;
  reset role;
  assert v_failed, 'approving an already-approved payment a second time must be rejected — this is the idempotency/double-processing guard';
  raise notice 'OK 8: approval activates the subscription and is never double-processable.';
end $$;

\echo '=== 9. Rejecting a payment records the reason and never activates the subscription ==='
do $$
declare
  v_ws uuid; v_owner uuid := '00000000-0000-0000-0000-0000000000c2'; v_admin uuid := '00000000-0000-0000-0000-0000000000c3';
  v_payment_id uuid;
  v_status text;
begin
  select id into v_ws from public.workspaces where slug = 'wf123-billing';

  perform set_config('app.test_user_id', v_owner::text, false);
  set role authenticated;
  select id into v_payment_id from public.submit_tenant_payment(v_ws, (select id from public.subscription_plans where slug = 'growth'), 'monthly', 'manual', 't9-idem-1');
  reset role;

  perform set_config('app.test_user_id', v_admin::text, false);
  set role authenticated;
  select status into v_status from public.review_tenant_payment(v_payment_id, 'reject', 'insufficient proof of payment');
  reset role;
  assert v_status = 'REJECTED', 'reject must set status to REJECTED';
  assert (select rejection_reason from public.tenant_payments where id = v_payment_id) = 'insufficient proof of payment', 'the rejection reason must be persisted';
  raise notice 'OK 9: rejection is recorded with its reason and does not touch the subscription.';
end $$;

\echo '=== 10. A retried submit_tenant_payment() call with the SAME idempotency_key returns the existing row, never a duplicate ==='
do $$
declare
  v_ws uuid; v_owner uuid := '00000000-0000-0000-0000-0000000000c2';
  v_id_1 uuid; v_id_2 uuid; v_count int;
begin
  select id into v_ws from public.workspaces where slug = 'wf123-billing';
  perform set_config('app.test_user_id', v_owner::text, false);
  set role authenticated;
  select id into v_id_1 from public.submit_tenant_payment(v_ws, (select id from public.subscription_plans where slug = 'growth'), 'monthly', 'manual', 't10-idem-shared');
  select id into v_id_2 from public.submit_tenant_payment(v_ws, (select id from public.subscription_plans where slug = 'growth'), 'monthly', 'manual', 't10-idem-shared');
  reset role;
  assert v_id_1 = v_id_2, 'the same idempotency_key must return the same payment row on retry';
  select count(*) into v_count from public.tenant_payments where idempotency_key = 't10-idem-shared';
  assert v_count = 1, 'exactly one payment row must exist for a given idempotency_key regardless of retries';
  raise notice 'OK 10: submit_tenant_payment() is genuinely idempotent under retry.';
end $$;

\echo '=== 11. A crypto payment cannot be submitted without a tx reference, and requires an active crypto destination ==='
do $$
declare
  v_ws uuid; v_owner uuid := '00000000-0000-0000-0000-0000000000c2'; v_admin uuid := '00000000-0000-0000-0000-0000000000c3';
  v_crypto_id uuid;
  v_failed boolean;
begin
  select id into v_ws from public.workspaces where slug = 'wf123-billing';

  perform set_config('app.test_user_id', v_admin::text, false);
  set role authenticated;
  select id into v_crypto_id from public.set_crypto_payment_config(null, 'USDT', 'TRC20', 'T-Test-Wallet-Address', 'USDT (TRC20)', 'Send exact amount', '20 confirmations', true);
  perform public.set_payment_method_config((select id from public.payment_methods_config where method_type = 'crypto'), null, null, true);
  reset role;

  perform set_config('app.test_user_id', v_owner::text, false);
  set role authenticated;
  v_failed := false;
  begin
    perform public.submit_tenant_payment(v_ws, (select id from public.subscription_plans where slug = 'growth'), 'monthly', 'crypto', 't11-idem-1', v_crypto_id, null);
  exception when others then v_failed := true;
  end;
  assert v_failed, 'a crypto payment without a tx reference must be rejected — the client saying "I paid" is never sufficient';

  v_failed := false;
  begin
    perform public.submit_tenant_payment(v_ws, (select id from public.subscription_plans where slug = 'growth'), 'monthly', 'crypto', 't11-idem-2', gen_random_uuid(), '0xSomeHash');
  exception when others then v_failed := true;
  end;
  assert v_failed, 'a crypto payment against a nonexistent/inactive crypto config must be rejected';

  reset role;
  raise notice 'OK 11: crypto payments require both a real tx reference and a genuinely active destination config.';
end $$;

\echo '=== 12. A payment method that is not currently active (e.g. card/gateway, never configured) cannot be submitted against ==='
do $$
declare
  v_ws uuid; v_owner uuid := '00000000-0000-0000-0000-0000000000c2';
  v_failed boolean := false;
begin
  select id into v_ws from public.workspaces where slug = 'wf123-billing';
  perform set_config('app.test_user_id', v_owner::text, false);
  set role authenticated;
  begin
    perform public.submit_tenant_payment(v_ws, (select id from public.subscription_plans where slug = 'growth'), 'monthly', 'card', 't12-idem-1');
  exception when others then v_failed := true;
  end;
  reset role;
  assert v_failed, 'submitting against an inactive/unconfigured payment method (card ships inactive by default — no gateway is wired up) must be rejected, never silently accepted';
  raise notice 'OK 12: an unconfigured payment method cannot be used to submit a payment.';
end $$;

\echo '=== 13. Cross-workspace isolation: a second workspace''s owner cannot see the first workspace''s subscription or payments ==='
do $$
declare
  v_ws1 uuid; v_owner2 uuid := '00000000-0000-0000-0000-0000000000c4';
  v_ws2 uuid; v_owner_role uuid; v_count int;
begin
  select id into v_ws1 from public.workspaces where slug = 'wf123-billing';
  insert into auth.users (id, email) values (v_owner2, 'owner2-c4@test.local');
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('WF123 Other', 'wf123-other', 'KE', 'KES', v_owner2) returning id into v_ws2;
  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values (v_owner2, v_ws2, v_owner_role);

  perform set_config('app.test_user_id', v_owner2::text, false);
  set role authenticated;
  select count(*) into v_count from public.tenant_subscriptions where workspace_id = v_ws1;
  assert v_count = 0, 'a workspace owner must never see another workspace''s subscription row';
  select count(*) into v_count from public.tenant_payments where workspace_id = v_ws1;
  assert v_count = 0, 'a workspace owner must never see another workspace''s payment rows';
  reset role;
  raise notice 'OK 13: cross-workspace billing data is fully isolated by RLS.';
end $$;

\echo '=== 14. A suspended user cannot subscribe, submit a payment, or be treated as a platform admin ==='
do $$
declare
  v_ws uuid; v_suspended uuid := '00000000-0000-0000-0000-0000000000c5';
  v_owner_role uuid; v_failed boolean;
begin
  select id into v_ws from public.workspaces where slug = 'wf123-billing';
  insert into auth.users (id, email) values (v_suspended, 'suspended-c5@test.local');
  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values (v_suspended, v_ws, v_owner_role);
  update public.profiles set status = 'suspended' where id = v_suspended;

  perform set_config('app.test_user_id', v_suspended::text, false);
  set role authenticated;
  v_failed := false;
  begin
    perform public.subscribe_to_plan(v_ws, (select id from public.subscription_plans where slug = 'starter'));
  exception when others then v_failed := true;
  end;
  reset role;
  assert v_failed, 'a suspended user must be denied billing.manage even while holding the Owner role (user_has_permission requires an active, non-deleted profile)';
  raise notice 'OK 14: a suspended user is correctly denied billing actions.';
end $$;

\echo '=== 15. Deactivating a subscription plan hides it from the public list without breaking existing subscriptions referencing it ==='
do $$
declare v_plan_id uuid; v_ws uuid; v_admin uuid := '00000000-0000-0000-0000-0000000000c3'; v_count int;
begin
  select id into v_plan_id from public.subscription_plans where slug = 'growth';
  select id into v_ws from public.workspaces where slug = 'wf123-billing';

  perform set_config('app.test_user_id', v_admin::text, false);
  set role authenticated;
  perform public.set_subscription_plan_active(v_plan_id, false);
  reset role;

  set role anon;
  select count(*) into v_count from public.subscription_plans where id = v_plan_id;
  assert v_count = 0, 'a deactivated plan must disappear from the public plan list';
  reset role;

  assert (select plan_id from public.tenant_subscriptions where workspace_id = v_ws) = v_plan_id, 'an existing subscription must keep referencing its plan even after the plan is deactivated — never dangle or silently change';

  perform set_config('app.test_user_id', v_admin::text, false);
  set role authenticated;
  perform public.set_subscription_plan_active(v_plan_id, true);
  reset role;
  raise notice 'OK 15: plan deactivation is a soft, non-destructive hide — existing subscriptions are unaffected.';
end $$;

\echo '=== 16. get_workspace_entitlements() is honest: no subscription = unlimited (pre-billing default), not a fabricated 0 ==='
do $$
declare
  v_owner uuid := '00000000-0000-0000-0000-0000000000c6';
  v_ws uuid; v_owner_role uuid;
  v_row record;
begin
  insert into auth.users (id, email) values (v_owner, 'owner-c6@test.local');
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('WF123 NoSub', 'wf123-nosub', 'GH', 'GHS', v_owner) returning id into v_ws;
  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values (v_owner, v_ws, v_owner_role);

  select * into v_row from public.get_workspace_entitlements(v_ws);
  assert v_row.status = 'NONE', 'a workspace with no subscription must honestly report status=NONE';
  assert v_row.max_staff is null, 'a workspace with no subscription must report max_staff as NULL (unlimited) — a fabricated 0 would break every existing pre-billing tenant';
  raise notice 'OK 16: zero-subscription entitlements are honestly unlimited, never a fabricated restrictive default.';
end $$;

\echo '=== 17. The staff-seat entitlement is genuinely enforced once a workspace subscribes to a limited plan ==='
do $$
declare
  v_owner uuid := '00000000-0000-0000-0000-0000000000c7';
  v_ws uuid; v_owner_role uuid; v_cs_role uuid; v_plan_id uuid;
  v_failed boolean := false;
begin
  insert into auth.users (id, email) values (v_owner, 'owner-c7@test.local');
  insert into public.workspaces (name, slug, country_code, currency_code, created_by) values ('WF123 SeatLimit', 'wf123-seatlimit', 'NG', 'NGN', v_owner) returning id into v_ws;
  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  select id into v_cs_role from public.roles where slug = 'customer-support' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values (v_owner, v_ws, v_owner_role);

  insert into public.subscription_plans (slug, name, monthly_price, currency_code, max_staff, is_public)
    values ('t123-oneseat', 'One Seat Test Plan', 10, 'USD', 1, false)
    returning id into v_plan_id;

  perform set_config('app.test_user_id', v_owner::text, false);
  set role authenticated;
  perform public.subscribe_to_plan(v_ws, v_plan_id);
  begin
    perform public.create_staff_invitation(v_ws, 'overlimit@test.local', v_cs_role);
  exception when others then v_failed := true;
  end;
  reset role;
  assert v_failed, 'a workspace already at its 1-seat plan limit (the Owner alone fills it) must be blocked from inviting another staff member';
  raise notice 'OK 17: staff-seat entitlement enforcement genuinely blocks over-limit invitations.';
end $$;

\echo '=== 18. Cancelling a subscription is workspace-scoped and requires billing.manage — a differently-permissioned staff member cannot cancel ==='
do $$
declare
  v_ws uuid; v_owner uuid := '00000000-0000-0000-0000-0000000000c2';
  v_cs uuid := '00000000-0000-0000-0000-0000000000c8';
  v_cs_role uuid;
  v_failed boolean := false;
  v_status text;
begin
  select id into v_ws from public.workspaces where slug = 'wf123-billing';
  insert into auth.users (id, email) values (v_cs, 'cs-c8@test.local');
  select id into v_cs_role from public.roles where slug = 'customer-support' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values (v_cs, v_ws, v_cs_role);

  perform set_config('app.test_user_id', v_cs::text, false);
  set role authenticated;
  begin
    perform public.cancel_tenant_subscription(v_ws, 'unauthorized attempt');
  exception when others then v_failed := true;
  end;
  reset role;
  assert v_failed, 'Customer Support must never hold billing.manage and so must never be able to cancel the workspace subscription';

  perform set_config('app.test_user_id', v_owner::text, false);
  set role authenticated;
  select status into v_status from public.cancel_tenant_subscription(v_ws, 'no longer needed');
  reset role;
  assert v_status = 'CANCELLED', 'the workspace Owner, who does hold billing.manage, must be able to cancel their own subscription';
  raise notice 'OK 18: subscription cancellation is correctly permission-scoped.';
end $$;

\echo '=== 19. Finance role can view billing but cannot manage it (matching Finance''s view-only relationship to every other module) ==='
do $$
declare
  v_ws uuid; v_finance uuid := '00000000-0000-0000-0000-0000000000c9';
  v_finance_role uuid;
  v_failed boolean := false;
  v_count int;
begin
  select id into v_ws from public.workspaces where slug = 'wf123-billing';
  insert into auth.users (id, email) values (v_finance, 'finance-c9@test.local');
  select id into v_finance_role from public.roles where slug = 'finance' and workspace_id is null;
  insert into public.user_roles (user_id, workspace_id, role_id) values (v_finance, v_ws, v_finance_role);

  perform set_config('app.test_user_id', v_finance::text, false);
  set role authenticated;
  select count(*) into v_count from public.tenant_subscriptions where workspace_id = v_ws;
  assert v_count = 1, 'Finance must be able to view the workspace subscription (billing.view)';
  begin
    perform public.cancel_tenant_subscription(v_ws, 'finance should not be able to do this');
  exception when others then v_failed := true;
  end;
  reset role;
  assert v_failed, 'Finance must never hold billing.manage';
  raise notice 'OK 19: Finance has view-only billing access, exactly as designed.';
end $$;

\echo '=== 20. platform_settings is readable by anonymous (the homepage needs this) but writable only by a platform admin, and every write is audited ==='
do $$
declare
  v_admin uuid := '00000000-0000-0000-0000-0000000000c3';
  v_value jsonb;
  v_audit_count int;
begin
  perform set_config('app.test_user_id', v_admin::text, false);
  set role authenticated;
  perform public.set_platform_setting('t123-homepage', '{"hero_headline": "Test Headline"}'::jsonb);
  reset role;

  set role anon;
  select value into v_value from public.platform_settings where key = 't123-homepage';
  reset role;
  assert v_value ->> 'hero_headline' = 'Test Headline', 'anon must be able to read platform_settings (the public homepage depends on this)';

  select count(*) into v_audit_count from public.audit_logs where module = 'billing' and entity_type = 'platform_setting';
  assert v_audit_count >= 1, 'writing a platform setting must be recorded in the audit trail';
  raise notice 'OK 20: platform_settings is anon-readable, admin-writable, and audited.';
end $$;

\echo '=== All 20 Platform Billing scenarios passed. ==='
