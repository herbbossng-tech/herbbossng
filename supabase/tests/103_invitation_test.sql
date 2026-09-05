\set ON_ERROR_STOP on

do $$
declare
  v_ws uuid; v_brand uuid; v_owner_role uuid; v_viewer_role uuid;
begin
  insert into public.workspaces (name, slug, country_code, currency_code, timezone)
    values ('Invite Test', 'invite-test', 'NG', 'NGN', 'Africa/Lagos') returning id into v_ws;
  insert into public.brands (workspace_id, name, slug) values (v_ws, 'Invite Brand', 'invite-brand') returning id into v_brand;

  select id into v_owner_role from public.roles where slug = 'owner' and workspace_id is null;
  select id into v_viewer_role from public.roles where slug = 'viewer' and workspace_id is null;

  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000e0001', 'inv-owner@test.local'),
    ('00000000-0000-0000-0000-0000000e0002', 'new-staffer@test.local')
  on conflict do nothing;

  insert into public.user_roles (user_id, role_id, workspace_id)
    values ('00000000-0000-0000-0000-0000000e0001', v_owner_role, v_ws);
end $$;

select id as ws from public.workspaces where slug = 'invite-test' \gset
select id as viewer_role from public.roles where slug = 'viewer' and workspace_id is null \gset

set role authenticated;
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000e0001', false);

-- Create an invitation as the workspace Owner. Stash the token in a
-- session GUC (app.tok) rather than a psql variable, since psql's
-- :'var' substitution does not reliably reach inside dollar-quoted
-- do $$ ... $$ bodies further down this script.
select set_config('app.tok', token::text, false) from public.create_staff_invitation(:'ws'::uuid, 'new-staffer@test.local', :'viewer_role'::uuid, null);
\echo Created invitation, token starts with:
select left(current_setting('app.tok'), 8);

-- A second invite to the same pending email must be rejected.
do $$
begin
  begin
    perform public.create_staff_invitation(
      (select id from public.workspaces where slug = 'invite-test'),
      'new-staffer@test.local',
      (select id from public.roles where slug = 'viewer' and workspace_id is null),
      null
    );
    raise exception 'TEST FAILED: duplicate pending invitation was allowed';
  exception when others then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
    raise notice 'PASSED: duplicate pending invitation rejected (%)', sqlerrm;
  end;
end $$;

-- Wrong email cannot accept.
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000e0001', false);
do $$
begin
  begin
    perform public.accept_staff_invitation(current_setting('app.tok'));
    raise exception 'TEST FAILED: wrong-email user accepted the invitation';
  exception when others then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
    raise notice 'PASSED: email mismatch correctly rejected (%)', sqlerrm;
  end;
end $$;

-- Correct invitee accepts.
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000e0002', false);
do $$
declare v_grant public.user_roles%rowtype;
begin
  select * into v_grant from public.accept_staff_invitation(current_setting('app.tok'));
  assert v_grant.user_id = '00000000-0000-0000-0000-0000000e0002', 'TEST FAILED: grant went to the wrong user';
  raise notice 'PASSED: invitee accepted successfully, user_roles row created';
end $$;

-- Re-using the same (now accepted) token must fail.
do $$
begin
  begin
    perform public.accept_staff_invitation(current_setting('app.tok'));
    raise exception 'TEST FAILED: an already-accepted token was reused successfully';
  exception when others then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
    raise notice 'PASSED: reusing an accepted token is rejected (%)', sqlerrm;
  end;
end $$;

-- Revoking a pending invitation prevents acceptance.
set role postgres;
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000e0001', false);
set role authenticated;
select
  set_config('app.invite2_id', id::text, false),
  set_config('app.tok2', token::text, false)
from public.create_staff_invitation(:'ws'::uuid, 'revoke-me@test.local', :'viewer_role'::uuid, null);
select public.revoke_staff_invitation(current_setting('app.invite2_id')::uuid);
select set_config('app.test_user_id', '00000000-0000-0000-0000-0000000e0002', false);
do $$
begin
  begin
    perform public.accept_staff_invitation(current_setting('app.tok2'));
    raise exception 'TEST FAILED: a revoked invitation was accepted';
  exception when others then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
    raise notice 'PASSED: revoked invitation cannot be accepted (%)', sqlerrm;
  end;
end $$;

reset role;
do $$ begin raise notice '=== ALL INVITATION TESTS PASSED ==='; end $$;
