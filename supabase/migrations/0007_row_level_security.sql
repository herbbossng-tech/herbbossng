-- ============================================================
-- GOLDEN COMMERCE OS — Foundation Migration 0007
-- Row Level Security — enforce workspace isolation everywhere.
--
-- Convention:
--   * Reference data (countries/states/currencies/permissions)
--     is readable by any authenticated user.
--   * Every workspace-owned table is only visible to users with
--     a user_roles grant in that workspace (public.user_workspace_ids()).
--   * Sensitive writes are additionally gated by
--     public.user_has_permission(workspace_id, 'module.action').
--   * audit_logs has no update/delete policy at all — permanent.
-- ============================================================

-- ---------------------------------------------------------------
-- Reference data — public read for any authenticated user.
-- ---------------------------------------------------------------
alter table public.currencies enable row level security;
alter table public.countries enable row level security;
alter table public.states enable row level security;
alter table public.permissions enable row level security;

create policy "read_currencies" on public.currencies for select to authenticated using (true);
create policy "read_countries" on public.countries for select to authenticated using (true);
create policy "read_states" on public.states for select to authenticated using (true);
create policy "read_permissions" on public.permissions for select to authenticated using (true);

-- ---------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------
alter table public.workspaces enable row level security;

create policy "select_own_workspaces" on public.workspaces
  for select to authenticated
  using (id in (select public.user_workspace_ids()));

create policy "update_own_workspace" on public.workspaces
  for update to authenticated
  using (public.user_has_permission(id, 'workspace.manage'))
  with check (public.user_has_permission(id, 'workspace.manage'));

-- ---------------------------------------------------------------
-- brands
-- ---------------------------------------------------------------
alter table public.brands enable row level security;

create policy "select_workspace_brands" on public.brands
  for select to authenticated
  using (workspace_id in (select public.user_workspace_ids()));

create policy "manage_workspace_brands" on public.brands
  for all to authenticated
  using (public.user_has_permission(workspace_id, 'brands.manage'))
  with check (public.user_has_permission(workspace_id, 'brands.manage'));

-- ---------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "select_own_profile" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "select_workspace_member_profiles" on public.profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.user_roles ur1
      join public.user_roles ur2 on ur2.workspace_id = ur1.workspace_id
      where ur1.user_id = auth.uid() and ur2.user_id = profiles.id
    )
  );

create policy "update_own_profile" on public.profiles
  for update to authenticated
  using (id = auth.uid());

-- ---------------------------------------------------------------
-- roles / role_permissions / user_roles
-- ---------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;

create policy "select_visible_roles" on public.roles
  for select to authenticated
  using (workspace_id is null or workspace_id in (select public.user_workspace_ids()));

create policy "manage_workspace_roles" on public.roles
  for all to authenticated
  using (workspace_id is not null and public.user_has_permission(workspace_id, 'roles_permissions.manage'))
  with check (workspace_id is not null and public.user_has_permission(workspace_id, 'roles_permissions.manage'));

create policy "select_visible_role_permissions" on public.role_permissions
  for select to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and (r.workspace_id is null or r.workspace_id in (select public.user_workspace_ids()))
    )
  );

create policy "manage_role_permissions" on public.role_permissions
  for all to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and r.workspace_id is not null
        and public.user_has_permission(r.workspace_id, 'roles_permissions.manage')
    )
  )
  with check (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and r.workspace_id is not null
        and public.user_has_permission(r.workspace_id, 'roles_permissions.manage')
    )
  );

create policy "select_own_user_roles" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid());

create policy "select_workspace_user_roles" on public.user_roles
  for select to authenticated
  using (workspace_id in (select public.user_workspace_ids()));

create policy "manage_user_roles" on public.user_roles
  for all to authenticated
  using (public.user_has_permission(workspace_id, 'staff.manage'))
  with check (public.user_has_permission(workspace_id, 'staff.manage'));

-- ---------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------
alter table public.notifications enable row level security;

create policy "select_notifications" on public.notifications
  for select to authenticated
  using (
    user_id = auth.uid()
    or (user_id is null and workspace_id in (select public.user_workspace_ids()))
  );

create policy "insert_notifications" on public.notifications
  for insert to authenticated
  with check (workspace_id in (select public.user_workspace_ids()));

create policy "update_own_notifications" on public.notifications
  for update to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------
-- audit_logs — select + insert only. No update or delete policy:
-- rows are permanent once written except via service-role tooling.
-- ---------------------------------------------------------------
alter table public.audit_logs enable row level security;

create policy "select_audit_logs" on public.audit_logs
  for select to authenticated
  using (workspace_id in (select public.user_workspace_ids()) and public.user_has_permission(workspace_id, 'audit_logs.view'));

create policy "insert_audit_logs" on public.audit_logs
  for insert to authenticated
  with check (workspace_id in (select public.user_workspace_ids()));

-- ---------------------------------------------------------------
-- system_logs / activity_logs
-- ---------------------------------------------------------------
alter table public.system_logs enable row level security;
alter table public.activity_logs enable row level security;

create policy "select_system_logs" on public.system_logs
  for select to authenticated
  using (workspace_id in (select public.user_workspace_ids()));

create policy "select_activity_logs" on public.activity_logs
  for select to authenticated
  using (workspace_id in (select public.user_workspace_ids()));

create policy "insert_activity_logs" on public.activity_logs
  for insert to authenticated
  with check (workspace_id in (select public.user_workspace_ids()));

-- ---------------------------------------------------------------
-- settings / email_templates / api_keys / media_library
-- ---------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.email_templates enable row level security;
alter table public.api_keys enable row level security;
alter table public.media_library enable row level security;

create policy "select_settings" on public.settings
  for select to authenticated
  using (workspace_id in (select public.user_workspace_ids()));

create policy "manage_settings" on public.settings
  for all to authenticated
  using (public.user_has_permission(workspace_id, 'settings.manage'))
  with check (public.user_has_permission(workspace_id, 'settings.manage'));

create policy "select_email_templates" on public.email_templates
  for select to authenticated
  using (workspace_id in (select public.user_workspace_ids()));

create policy "manage_email_templates" on public.email_templates
  for all to authenticated
  using (public.user_has_permission(workspace_id, 'settings.manage'))
  with check (public.user_has_permission(workspace_id, 'settings.manage'));

create policy "manage_api_keys" on public.api_keys
  for all to authenticated
  using (public.user_has_permission(workspace_id, 'settings.manage'))
  with check (public.user_has_permission(workspace_id, 'settings.manage'));

create policy "select_media_library" on public.media_library
  for select to authenticated
  using (workspace_id in (select public.user_workspace_ids()));

create policy "manage_media_library" on public.media_library
  for all to authenticated
  using (workspace_id in (select public.user_workspace_ids()))
  with check (workspace_id in (select public.user_workspace_ids()));
