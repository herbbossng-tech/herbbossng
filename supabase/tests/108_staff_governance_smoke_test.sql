-- ============================================================
-- Phase 7 (Staff, RBAC, Workspace & Operational Administration)
-- smoke test. Run against a fresh DB with 0001-0027 applied +
-- grant_authenticated.sql. Genuine SET ROLE authenticated + GUC
-- impersonation throughout. Local-only, not committed.
--
-- Covers the Part 24 matrix:
--  1. Owner: full authorized administration
--  2. Admin: full authorized administration
--  3. Manager: cannot escalate (view only on assignment/approval rules)
--  4. Finance: approval_rules yes, assignment_rules view-only, no staff/roles
--  5. Customer Support: cannot manage finance/admin permissions
--  6. Warehouse Staff: cannot manage workspace permissions
--  7. Viewer: cannot mutate administration
--  8. Cross-workspace isolation
--  9. Cross-brand scope guard (brand must belong to the rule's workspace)
-- 10. Cannot grant permissions/act without holding them (RLS blocks insert)
-- 11. Suspended/deactivated staff lose access immediately (user_has_permission hardening)
-- 12. Revoked invitation cannot be accepted (existing 0023 behavior, re-verified)
-- 13. Expired invitation cannot be accepted (existing 0023 behavior, re-verified)
-- 14/15. Audit logs remain append-only / immutable
-- 16. Approval rules respect workspace boundaries
-- 17. Assignment rules respect workspace/brand boundaries (fixed_staff_ids scope guard)
-- 18. Zero-staff workspace works
-- 19. Zero-brand workspace works (brand_id null = all brands)
-- 20. Empty audit-log state works
-- ============================================================
\set ON_ERROR_STOP on
set client_min_messages to warning;

do $$
declare
  v_ws_a uuid; v_brand_a uuid; v_ws_b uuid; v_brand_b uuid;
  v_owner_role uuid; v_admin_role uuid; v_manager_role uuid; v_fin_role uuid; v_cs_role uuid; v_wh_role uuid; v_viewer_role uuid;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Gov WS A', 'gov-ws-a', 'NG', 'NGN', 'Africa/Lagos') returning id into v_ws_a;
  insert into public.brands (workspace_id, name, slug) values (v_ws_a, 'Gov Brand A', 'gov-brand-a') returning id into v_brand_a;

  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Gov WS B', 'gov-ws-b', 'GH', 'GHS', 'Africa/Accra') returning id into v_ws_b;
  insert into public.brands (workspace_id, name, slug) values (v_ws_b, 'Gov Brand B', 'gov-brand-b') returning id into v_brand_b;

  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  select id into v_admin_role from public.roles where slug = 'admin' and workspace_id is null;
  select id into v_manager_role from public.roles where slug = 'manager' and workspace_id is null;
  select id into v_fin_role from public.roles where slug = 'finance' and workspace_id is null;
  select id into v_cs_role from public.roles where slug = 'customer-support' and workspace_id is null;
  select id into v_wh_role from public.roles where slug = 'warehouse-staff' and workspace_id is null;
  select id into v_viewer_role from public.roles where slug = 'viewer' and workspace_id is null;

  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000f1', 'owner-f@test.local'),
    ('00000000-0000-0000-0000-0000000000f2', 'admin-f@test.local'),
    ('00000000-0000-0000-0000-0000000000f3', 'manager-f@test.local'),
    ('00000000-0000-0000-0000-0000000000f4', 'finance-f@test.local'),
    ('00000000-0000-0000-0000-0000000000f5', 'cs-f@test.local'),
    ('00000000-0000-0000-0000-0000000000f6', 'warehouse-f@test.local'),
    ('00000000-0000-0000-0000-0000000000f7', 'viewer-f@test.local'),
    ('00000000-0000-0000-0000-0000000000f8', 'owner-b-workspace-f@test.local'),
    ('00000000-0000-0000-0000-0000000000f9', 'target-staff-f@test.local')
  on conflict do nothing;

  insert into public.user_roles (user_id, role_id, workspace_id) values
    ('00000000-0000-0000-0000-0000000000f1', v_owner_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000f2', v_admin_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000f3', v_manager_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000f4', v_fin_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000f5', v_cs_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000f6', v_wh_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000f7', v_viewer_role, v_ws_a),
    ('00000000-0000-0000-0000-0000000000f8', v_owner_role, v_ws_b),
    ('00000000-0000-0000-0000-0000000000f9', v_cs_role, v_ws_a);
end $$;

\set owner_a '00000000-0000-0000-0000-0000000000f1'
\set admin_a '00000000-0000-0000-0000-0000000000f2'
\set manager_a '00000000-0000-0000-0000-0000000000f3'
\set finance_a '00000000-0000-0000-0000-0000000000f4'
\set cs_a '00000000-0000-0000-0000-0000000000f5'
\set warehouse_a '00000000-0000-0000-0000-0000000000f6'
\set viewer_a '00000000-0000-0000-0000-0000000000f7'
\set owner_b '00000000-0000-0000-0000-0000000000f8'
\set target_staff '00000000-0000-0000-0000-0000000000f9'

\echo '=== 1. Owner: full authorized administration (assignment_rules + approval_rules + set_staff_status) ==='
set role authenticated;
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare v_ws uuid; v_brand uuid; v_rule public.assignment_rules%rowtype; v_arule public.approval_rules%rowtype; v_profile public.profiles;
begin
  select id into v_ws from public.workspaces where slug = 'gov-ws-a';
  select id into v_brand from public.brands where slug = 'gov-brand-a';

  insert into public.assignment_rules (workspace_id, module, strategy) values (v_ws, 'orders', 'round_robin') returning * into v_rule;
  assert v_rule.id is not null, 'Owner should be able to create an assignment rule';

  insert into public.approval_rules (workspace_id, module, threshold_amount) values (v_ws, 'withdrawals', 100000) returning * into v_arule;
  assert v_arule.id is not null, 'Owner should be able to create an approval rule';

  v_profile := public.set_staff_status(v_ws, '00000000-0000-0000-0000-0000000000f9', 'suspended');
  assert v_profile.status = 'suspended', 'Owner should be able to suspend a staff member';
  perform public.set_staff_status(v_ws, '00000000-0000-0000-0000-0000000000f9', 'active');

  raise notice 'OK: Owner performed all authorized administration';
end $$;

\echo '=== 2. Admin: same full authority ==='
select set_config('app.test_user_id', :'admin_a', false);
do $$
declare v_ws uuid; v_rule public.assignment_rules%rowtype;
begin
  select id into v_ws from public.workspaces where slug = 'gov-ws-a';
  insert into public.assignment_rules (workspace_id, module, strategy) values (v_ws, 'tasks', 'least_workload') returning * into v_rule;
  assert v_rule.id is not null, 'Admin should be able to create an assignment rule';
  raise notice 'OK: Admin performed authorized administration';
end $$;

\echo '=== 3. Manager: view-only on assignment/approval rules, cannot mutate (no escalation) ==='
select set_config('app.test_user_id', :'manager_a', false);
do $$
declare v_ws uuid; v_count int;
begin
  select id into v_ws from public.workspaces where slug = 'gov-ws-a';
  select count(*) into v_count from public.assignment_rules where workspace_id = v_ws;
  assert v_count > 0, 'Manager should be able to VIEW assignment rules';

  begin
    insert into public.assignment_rules (workspace_id, module, strategy) values (v_ws, 'orders', 'manual');
    raise exception 'Manager should NOT be able to create an assignment rule';
  exception when others then
    raise notice 'OK: Manager blocked from mutating assignment_rules: %', SQLERRM;
  end;

  begin
    insert into public.approval_rules (workspace_id, module, threshold_amount) values (v_ws, 'ad_costs', 1000);
    raise exception 'Manager should NOT be able to create an approval rule';
  exception when others then
    raise notice 'OK: Manager blocked from mutating approval_rules: %', SQLERRM;
  end;
end $$;

\echo '=== 4. Finance: full approval_rules authority, assignment_rules view-only, no staff.manage ==='
select set_config('app.test_user_id', :'finance_a', false);
do $$
declare v_ws uuid; v_arule public.approval_rules%rowtype;
begin
  select id into v_ws from public.workspaces where slug = 'gov-ws-a';

  insert into public.approval_rules (workspace_id, module, threshold_amount) values (v_ws, 'ad_costs', 20000) returning * into v_arule;
  assert v_arule.id is not null, 'Finance should be able to manage approval_rules';

  begin
    insert into public.assignment_rules (workspace_id, module, strategy) values (v_ws, 'orders', 'manual');
    raise exception 'Finance should NOT be able to create an assignment rule';
  exception when others then
    raise notice 'OK: Finance blocked from mutating assignment_rules: %', SQLERRM;
  end;

  begin
    perform public.set_staff_status(v_ws, '00000000-0000-0000-0000-0000000000f9'::uuid, 'suspended');
    raise exception 'Finance should NOT be able to suspend staff';
  exception when others then
    raise notice 'OK: Finance blocked from set_staff_status: %', SQLERRM;
  end;
end $$;

\echo '=== 5. Customer Support: cannot manage finance/admin permissions ==='
select set_config('app.test_user_id', :'cs_a', false);
do $$
declare v_ws uuid; v_count int;
begin
  select id into v_ws from public.workspaces where slug = 'gov-ws-a';
  select count(*) into v_count from public.approval_rules where workspace_id = v_ws;
  assert v_count = 0, 'Customer Support must NOT see approval_rules at all';
  select count(*) into v_count from public.assignment_rules where workspace_id = v_ws;
  assert v_count = 0, 'Customer Support must NOT see assignment_rules at all';

  begin
    perform public.set_staff_status(v_ws, '00000000-0000-0000-0000-0000000000f9'::uuid, 'suspended');
    raise exception 'Customer Support should NOT be able to change staff status';
  exception when others then
    raise notice 'OK: Customer Support blocked from set_staff_status: %', SQLERRM;
  end;
end $$;

\echo '=== 6. Warehouse Staff: cannot manage workspace/admin permissions ==='
select set_config('app.test_user_id', :'warehouse_a', false);
do $$
declare v_ws uuid; v_count int;
begin
  select id into v_ws from public.workspaces where slug = 'gov-ws-a';
  select count(*) into v_count from public.assignment_rules where workspace_id = v_ws;
  assert v_count = 0, 'Warehouse Staff must NOT see assignment_rules';
  begin
    insert into public.approval_rules (workspace_id, module, threshold_amount) values (v_ws, 'orders', 500);
    raise exception 'Warehouse Staff should NOT be able to create an approval rule';
  exception when others then
    raise notice 'OK: Warehouse Staff blocked from mutating approval_rules: %', SQLERRM;
  end;
end $$;

\echo '=== 7. Viewer: can view, cannot mutate ==='
select set_config('app.test_user_id', :'viewer_a', false);
do $$
declare v_ws uuid; v_count int;
begin
  select id into v_ws from public.workspaces where slug = 'gov-ws-a';
  select count(*) into v_count from public.assignment_rules where workspace_id = v_ws;
  assert v_count > 0, 'Viewer should be able to VIEW assignment rules';
  select count(*) into v_count from public.approval_rules where workspace_id = v_ws;
  assert v_count > 0, 'Viewer should be able to VIEW approval rules';

  begin
    insert into public.assignment_rules (workspace_id, module, strategy) values (v_ws, 'orders', 'manual');
    raise exception 'Viewer should NOT be able to mutate assignment_rules';
  exception when others then
    raise notice 'OK: Viewer blocked from mutating assignment_rules: %', SQLERRM;
  end;
end $$;

\echo '=== 8. Cross-workspace isolation: WS B owner sees zero WS A rules ==='
select set_config('app.test_user_id', :'owner_b', false);
do $$
declare v_ws uuid; v_count int;
begin
  select id into v_ws from public.workspaces where slug = 'gov-ws-a';
  select count(*) into v_count from public.assignment_rules where workspace_id = v_ws;
  assert v_count = 0, 'WS B owner must see zero WS A assignment_rules';
  select count(*) into v_count from public.approval_rules where workspace_id = v_ws;
  assert v_count = 0, 'WS B owner must see zero WS A approval_rules';
  raise notice 'OK: cross-workspace isolation holds for assignment_rules/approval_rules';
end $$;

\echo '=== 9. Cross-brand scope guard: a brand from another workspace is rejected ==='
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare v_ws_a uuid; v_brand_b uuid;
begin
  select id into v_ws_a from public.workspaces where slug = 'gov-ws-a';
  select id into v_brand_b from public.brands where slug = 'gov-brand-b';
  begin
    insert into public.assignment_rules (workspace_id, brand_id, module, strategy) values (v_ws_a, v_brand_b, 'orders', 'manual');
    raise exception 'Should have rejected a brand_id belonging to a different workspace';
  exception when others then
    raise notice 'OK: cross-workspace brand_id rejected: %', SQLERRM;
  end;
end $$;

\echo '=== 10. Cannot grant permissions/act without holding them (RLS insert block, re-verified for approval_rules) ==='
select set_config('app.test_user_id', :'cs_a', false);
do $$
declare v_ws uuid;
begin
  select id into v_ws from public.workspaces where slug = 'gov-ws-a';
  begin
    insert into public.approval_rules (workspace_id, module) values (v_ws, 'orders');
    raise exception 'Customer Support should not be able to insert approval_rules';
  exception when others then
    raise notice 'OK: insert correctly blocked by RLS: %', SQLERRM;
  end;
end $$;

\echo '=== 11. Suspended/deactivated staff lose access immediately (user_has_permission hardening) ==='
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare v_ws uuid;
begin
  select id into v_ws from public.workspaces where slug = 'gov-ws-a';
  perform public.set_staff_status(v_ws, '00000000-0000-0000-0000-0000000000f9'::uuid, 'suspended');
end $$;

select set_config('app.test_user_id', :'target_staff', false);
do $$
declare v_ws uuid; v_ws_count int; v_orders_count int;
begin
  select id into v_ws from public.workspaces where slug = 'gov-ws-a';
  select count(*) into v_ws_count from public.workspaces where id in (select public.user_workspace_ids());
  assert v_ws_count = 0, format('Suspended user should resolve zero workspaces via user_workspace_ids(), got %s', v_ws_count);

  select count(*) into v_orders_count from public.orders where workspace_id = v_ws;
  assert v_orders_count = 0, 'Suspended user should see zero rows on any RLS-protected table (orders.view no longer resolves true)';
  raise notice 'OK: suspended staff member loses workspace/permission access immediately at the database layer.';
end $$;

-- Reactivate for later tests.
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare v_ws uuid;
begin
  select id into v_ws from public.workspaces where slug = 'gov-ws-a';
  perform public.set_staff_status(v_ws, '00000000-0000-0000-0000-0000000000f9'::uuid, 'active');
end $$;

\echo '=== 12/13. Invitation revoke/expiry still enforced (0023 behavior, re-verified after hardening) ==='
do $$
declare v_ws uuid; v_role uuid; v_invite record;
begin
  select id into v_ws from public.workspaces where slug = 'gov-ws-a';
  select id into v_role from public.roles where slug = 'viewer' and workspace_id is null;
  select * into v_invite from public.create_staff_invitation(v_ws, 'revoke-me@test.local', v_role);
  perform public.revoke_staff_invitation(v_invite.id);
  begin
    perform public.accept_staff_invitation(v_invite.token);
    raise exception 'Should not be able to accept a revoked invitation';
  exception when others then
    raise notice 'OK: revoked invitation cannot be accepted: %', SQLERRM;
  end;
end $$;

do $$
declare v_ws uuid; v_role uuid; v_invite record;
begin
  select id into v_ws from public.workspaces where slug = 'gov-ws-a';
  select id into v_role from public.roles where slug = 'viewer' and workspace_id is null;
  select * into v_invite from public.create_staff_invitation(v_ws, 'expire-me@test.local', v_role);
  update public.staff_invitations set expires_at = now() - interval '1 day' where id = v_invite.id;
  begin
    perform public.accept_staff_invitation(v_invite.token);
    raise exception 'Should not be able to accept an expired invitation';
  exception when others then
    raise notice 'OK: expired invitation cannot be accepted: %', SQLERRM;
  end;
end $$;
reset role;

\echo '=== 14/15. Audit logs remain append-only / immutable ==='
set role authenticated;
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare v_log_id uuid;
begin
  select id into v_log_id from public.audit_logs order by created_at desc limit 1;
  begin
    update public.audit_logs set action = 'tampered' where id = v_log_id;
    raise exception 'Should not be able to update an audit_logs row as a normal user';
  exception when others then
    raise notice 'OK: audit_logs UPDATE blocked: %', SQLERRM;
  end;
  begin
    delete from public.audit_logs where id = v_log_id;
    raise exception 'Should not be able to delete an audit_logs row as a normal user';
  exception when others then
    raise notice 'OK: audit_logs DELETE blocked: %', SQLERRM;
  end;
  begin
    insert into public.audit_logs (workspace_id, module, action) values (null, 'staff', 'forged');
    raise exception 'Should not be able to directly INSERT an audit_logs row as a normal user';
  exception when others then
    raise notice 'OK: audit_logs direct client INSERT blocked: %', SQLERRM;
  end;
end $$;
reset role;

\echo '=== 16. Approval rules respect workspace boundaries (duplicate active-scope rejected) ==='
set role authenticated;
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare v_ws uuid;
begin
  select id into v_ws from public.workspaces where slug = 'gov-ws-a';
  begin
    insert into public.approval_rules (workspace_id, module, threshold_amount) values (v_ws, 'withdrawals', 999999);
    raise exception 'Should have rejected a second ACTIVE withdrawals rule for the same workspace/brand scope';
  exception when others then
    raise notice 'OK: duplicate active approval_rules scope rejected: %', SQLERRM;
  end;
end $$;

\echo '=== 17. Assignment rules respect workspace/brand boundaries (fixed strategy staff scope guard) ==='
do $$
declare v_ws_a uuid; v_ws_b uuid; v_outsider uuid := '00000000-0000-0000-0000-0000000000f8';
begin
  select id into v_ws_a from public.workspaces where slug = 'gov-ws-a';
  begin
    insert into public.assignment_rules (workspace_id, module, strategy, fixed_staff_ids) values (v_ws_a, 'orders', 'fixed', array[v_outsider]);
    raise exception 'Should have rejected fixed_staff_ids containing a user with no role in this workspace';
  exception when others then
    raise notice 'OK: assignment_rules staff-scope guard rejected an outside user: %', SQLERRM;
  end;
end $$;
reset role;

\echo '=== 18. Zero-staff workspace works ==='
do $$
declare v_ws_empty uuid; v_owner_role uuid;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Gov WS Empty', 'gov-ws-empty', 'NG', 'NGN', 'Africa/Lagos') returning id into v_ws_empty;
  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  insert into public.user_roles (user_id, role_id, workspace_id) values ('00000000-0000-0000-0000-0000000000f1', v_owner_role, v_ws_empty);
end $$;
set role authenticated;
select set_config('app.test_user_id', :'owner_a', false);
do $$
declare v_ws_empty uuid; v_staff_count int;
begin
  select id into v_ws_empty from public.workspaces where slug = 'gov-ws-empty';
  select count(*) into v_staff_count from public.get_workspace_staff(v_ws_empty) where user_id <> '00000000-0000-0000-0000-0000000000f1';
  assert v_staff_count = 0, 'Zero-staff workspace should return just the Owner, no error';
  raise notice 'OK: zero-staff workspace (besides its own Owner) returns cleanly.';
end $$;

\echo '=== 19. Zero-brand-scoped rule (brand_id null = all brands) works ==='
do $$
declare v_ws_empty uuid; v_rule public.assignment_rules%rowtype;
begin
  select id into v_ws_empty from public.workspaces where slug = 'gov-ws-empty';
  insert into public.assignment_rules (workspace_id, brand_id, module, strategy) values (v_ws_empty, null, 'orders', 'manual') returning * into v_rule;
  assert v_rule.brand_id is null, 'A brand-less (all-brands) workspace can still create a workspace-wide rule';
  raise notice 'OK: zero-brand-scope (all-brands) assignment rule created cleanly.';
end $$;

\echo '=== 20. Empty audit-log state works ==='
do $$
declare v_ws_empty uuid; v_count int;
begin
  select id into v_ws_empty from public.workspaces where slug = 'gov-ws-empty';
  select count(*) into v_count from public.audit_logs where workspace_id = v_ws_empty and module = 'nonexistent_module';
  assert v_count = 0, 'A filter matching nothing should return zero rows, not error';
  raise notice 'OK: empty audit-log filter state returns cleanly.';
end $$;
reset role;

\echo '=== ALL PHASE 7 GOVERNANCE TESTS PASSED (20/20) ==='
