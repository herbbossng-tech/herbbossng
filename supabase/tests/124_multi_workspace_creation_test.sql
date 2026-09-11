-- ============================================================
-- Multi-workspace creation (0040) — dedicated regression/security
-- suite. Verifies the actual reported production bug directly:
-- creating a second workspace (Kenya) must never mutate, replace, or
-- hide an existing workspace (Nigeria) — the root cause was that no
-- creation path existed at all (only Workspace Settings, which
-- UPDATEs the caller's current workspace). create_workspace() is a
-- pure INSERT + Owner grant on a brand-new row; it can never touch
-- an existing workspace.
--
-- Run against a freshly migrated 0001-0040 database with
-- 00_bootstrap_post_migration.sql already applied.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'multi-ws@test.local');

\echo '=== 1. Anonymous cannot call create_workspace ==='
do $$
declare v_failed boolean := false;
begin
  set role anon;
  begin
    perform public.create_workspace('Should Fail', 'NG', 'NGN', null, null);
  exception when others then v_failed := true;
  end;
  reset role;
  assert v_failed, 'anon must not be able to create a workspace';
  raise notice 'OK 1: anon rejected.';
end $$;

\echo '=== 2. Authenticated user creates first workspace (Nigeria), becomes Owner ==='
do $$
declare v_ws1 record; v_count int; v_role_slug text;
begin
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f1', false);
  set role authenticated;
  select * into v_ws1 from public.create_workspace('Golden COD Nigeria', 'NG', 'NGN', 'Africa/Lagos', 'Golden Health');
  reset role;
  assert v_ws1.country_code = 'NG', 'workspace country must be NG';
  assert v_ws1.currency_code = 'NGN', 'workspace currency must be NGN';
  select count(*) into v_count from public.workspaces;
  assert v_count = 1, format('expected exactly 1 workspace after first creation, got %s', v_count);

  select r.slug into v_role_slug
  from public.user_roles ur join public.roles r on r.id = ur.role_id
  where ur.user_id = '00000000-0000-0000-0000-0000000000f1' and ur.workspace_id = v_ws1.id;
  assert v_role_slug = 'owner', format('creator must be granted Owner, got %s', v_role_slug);

  assert exists (select 1 from public.brands where workspace_id = v_ws1.id), 'a default brand must be created alongside the workspace';
  raise notice 'OK 2: Nigeria workspace created (id=%), creator is Owner, default brand exists.', v_ws1.id;
end $$;

\echo '=== 3. Same user creates SECOND workspace (Kenya) — Nigeria must be completely untouched (the reported bug) ==='
do $$
declare v_ws1_before record; v_ws2 record; v_ws1_after record; v_count int;
begin
  select * into v_ws1_before from public.workspaces where country_code = 'NG';

  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f1', false);
  set role authenticated;
  select * into v_ws2 from public.create_workspace('Golden COD Kenya', 'KE', 'KES', 'Africa/Nairobi', 'Golden Health Kenya');
  reset role;

  select * into v_ws1_after from public.workspaces where id = v_ws1_before.id;

  assert v_ws1_after.country_code = 'NG', 'Nigeria workspace country must be unchanged';
  assert v_ws1_after.currency_code = 'NGN', 'Nigeria workspace currency must be unchanged';
  assert v_ws1_after.name = v_ws1_before.name, 'Nigeria workspace name must be unchanged';
  assert v_ws1_after.id != v_ws2.id, 'Kenya must be a genuinely different workspace row';
  assert v_ws2.country_code = 'KE' and v_ws2.currency_code = 'KES', 'Kenya workspace must have its own country/currency';

  select count(*) into v_count from public.workspaces;
  assert v_count = 2, format('expected exactly 2 workspaces (Nigeria + Kenya both coexisting), got %s', v_count);
  raise notice 'OK 3: Kenya created alongside Nigeria — Nigeria completely untouched, both coexist.';
end $$;

\echo '=== 4. User now sees BOTH workspaces via the same RLS the frontend relies on ==='
do $$
declare v_count int;
begin
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f1', false);
  set role authenticated;
  select count(*) into v_count from public.workspaces;
  reset role;
  assert v_count = 2, format('user must see both of their own workspaces via RLS, got %s', v_count);
  raise notice 'OK 4: RLS correctly shows the user both workspaces.';
end $$;

\echo '=== 5. Create Ghana + South Africa too — all four coexist ==='
do $$
declare v_count int;
begin
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f1', false);
  set role authenticated;
  perform public.create_workspace('Golden COD Ghana', 'GH', 'GHS', 'Africa/Accra', null);
  perform public.create_workspace('Golden COD South Africa', 'ZA', 'ZAR', 'Africa/Johannesburg', null);
  select count(*) into v_count from public.workspaces;
  reset role;
  assert v_count = 4, format('expected 4 total workspaces, got %s', v_count);
  raise notice 'OK 5: all four workspaces (NG/KE/GH/ZA) coexist.';
end $$;

\echo '=== 6. A different, unrelated user cannot see any of these four workspaces ==='
do $$
declare v_count int;
begin
  insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f2', 'outsider-ws@test.local');
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f2', false);
  set role authenticated;
  select count(*) into v_count from public.workspaces;
  reset role;
  assert v_count = 0, format('an outsider must see zero of these workspaces via RLS, got %s', v_count);
  raise notice 'OK 6: workspace isolation holds — an unrelated user sees none of them.';
end $$;

\echo '=== 7. Invalid country/currency rejected, no partial workspace created ==='
do $$
declare v_failed boolean := false; v_count_before int; v_count_after int;
begin
  select count(*) into v_count_before from public.workspaces;
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f1', false);
  set role authenticated;
  begin
    perform public.create_workspace('Bad Country', 'ZZ', 'NGN', null, null);
  exception when others then v_failed := true;
  end;
  reset role;
  select count(*) into v_count_after from public.workspaces;
  assert v_failed, 'invalid country code must be rejected';
  assert v_count_after = v_count_before, 'a rejected creation must not leave a partial workspace row behind';
  raise notice 'OK 7: invalid country rejected, no partial row created.';
end $$;

\echo '=== 8. Duplicate-name slug collision is handled, not fatal ==='
do $$
declare v_ws_a record; v_ws_b record;
begin
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f1', false);
  set role authenticated;
  select * into v_ws_a from public.create_workspace('Twin Name', 'NG', 'NGN', null, null);
  select * into v_ws_b from public.create_workspace('Twin Name', 'KE', 'KES', null, null);
  reset role;
  assert v_ws_a.slug != v_ws_b.slug, 'colliding names must get distinct slugs, not fail';
  raise notice 'OK 8: slug collision handled gracefully (% vs %).', v_ws_a.slug, v_ws_b.slug;
end $$;

\echo '=== 9. Cross-workspace mutation still rejected after multi-workspace creation (existing RLS unaffected) ==='
do $$
declare v_ws_ng uuid; v_failed boolean := false;
begin
  select id into v_ws_ng from public.workspaces where country_code = 'NG' and name = 'Golden COD Nigeria';

  -- The adversarial check: an outsider (user f2, who belongs to
  -- neither workspace) must not be able to update it.
  perform set_config('app.test_user_id', '00000000-0000-0000-0000-0000000000f2', false);
  set role authenticated;
  update public.workspaces set name = 'HACKED-BY-OUTSIDER' where id = v_ws_ng;
  reset role;

  perform 1 from public.workspaces where id = v_ws_ng and name = 'HACKED-BY-OUTSIDER';
  if found then v_failed := true; end if;
  assert not v_failed, 'an outsider must never be able to rename a workspace they do not belong to';
  raise notice 'OK 9: cross-workspace mutation by a non-member is a no-op, not a mutation — existing RLS holds after multi-workspace creation.';
end $$;

\echo '=== ALL MULTI-WORKSPACE CREATION TESTS PASSED ==='
