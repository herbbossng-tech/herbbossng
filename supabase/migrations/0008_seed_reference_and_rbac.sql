-- ============================================================
-- GOLDEN COMMERCE OS — Foundation Migration 0008
-- Seed: currencies, countries, Nigerian states, permission
-- catalogue, and system role templates.
-- ============================================================

insert into public.currencies (code, name, symbol, decimal_places) values
  ('NGN', 'Nigerian Naira', '₦', 2),
  ('GHS', 'Ghanaian Cedi', '₵', 2),
  ('KES', 'Kenyan Shilling', 'KSh', 2),
  ('ZAR', 'South African Rand', 'R', 2)
on conflict (code) do nothing;

insert into public.countries (name, code, dial_code, currency_code, flag_emoji) values
  ('Nigeria', 'NG', '+234', 'NGN', '🇳🇬'),
  ('Ghana', 'GH', '+233', 'GHS', '🇬🇭'),
  ('Kenya', 'KE', '+254', 'KES', '🇰🇪'),
  ('South Africa', 'ZA', '+27', 'ZAR', '🇿🇦')
on conflict (code) do nothing;

insert into public.states (country_id, name)
select c.id, s.name
from public.countries c
cross join (values
  ('Abia'), ('Adamawa'), ('Akwa Ibom'), ('Anambra'), ('Bauchi'), ('Bayelsa'),
  ('Benue'), ('Borno'), ('Cross River'), ('Delta'), ('Ebonyi'), ('Edo'),
  ('Ekiti'), ('Enugu'), ('FCT - Abuja'), ('Gombe'), ('Imo'), ('Jigawa'),
  ('Kaduna'), ('Kano'), ('Katsina'), ('Kebbi'), ('Kogi'), ('Kwara'),
  ('Lagos'), ('Nasarawa'), ('Niger'), ('Ogun'), ('Ondo'), ('Osun'),
  ('Oyo'), ('Plateau'), ('Rivers'), ('Sokoto'), ('Taraba'), ('Yobe'), ('Zamfara')
) as s(name)
where c.code = 'NG'
on conflict (country_id, name) do nothing;


-- ---------------------------------------------------------------
-- Permission catalogue (module.action)
-- ---------------------------------------------------------------
insert into public.permissions (module, action, slug, category, description) values
  ('dashboard', 'view', 'dashboard.view', 'Dashboard', 'View the executive dashboard'),

  ('orders', 'view', 'orders.view', 'Orders', 'View orders'),
  ('orders', 'create', 'orders.create', 'Orders', 'Create orders'),
  ('orders', 'update', 'orders.update', 'Orders', 'Update order details and status'),
  ('orders', 'delete', 'orders.delete', 'Orders', 'Delete orders'),
  ('orders', 'assign', 'orders.assign', 'Orders', 'Assign orders to staff'),
  ('orders', 'approve', 'orders.approve', 'Orders', 'Approve/complete orders'),
  ('orders', 'export', 'orders.export', 'Orders', 'Export orders'),
  ('orders', 'manage', 'orders.manage', 'Orders', 'Full order management'),

  ('products', 'view', 'products.view', 'Products', 'View products'),
  ('products', 'create', 'products.create', 'Products', 'Create products'),
  ('products', 'update', 'products.update', 'Products', 'Update products'),
  ('products', 'delete', 'products.delete', 'Products', 'Delete products'),
  ('products', 'import', 'products.import', 'Products', 'Bulk import products'),
  ('products', 'export', 'products.export', 'Products', 'Export products'),
  ('products', 'manage', 'products.manage', 'Products', 'Full product management'),

  ('categories', 'view', 'categories.view', 'Categories', 'View categories'),
  ('categories', 'create', 'categories.create', 'Categories', 'Create categories'),
  ('categories', 'update', 'categories.update', 'Categories', 'Update categories'),
  ('categories', 'delete', 'categories.delete', 'Categories', 'Delete categories'),
  ('categories', 'manage', 'categories.manage', 'Categories', 'Full category management'),

  ('landing_pages', 'view', 'landing_pages.view', 'Landing Pages', 'View landing pages'),
  ('landing_pages', 'create', 'landing_pages.create', 'Landing Pages', 'Create landing pages'),
  ('landing_pages', 'update', 'landing_pages.update', 'Landing Pages', 'Update landing pages'),
  ('landing_pages', 'delete', 'landing_pages.delete', 'Landing Pages', 'Delete landing pages'),
  ('landing_pages', 'manage', 'landing_pages.manage', 'Landing Pages', 'Full landing page management'),

  ('customers', 'view', 'customers.view', 'Customers', 'View customers'),
  ('customers', 'create', 'customers.create', 'Customers', 'Create customers'),
  ('customers', 'update', 'customers.update', 'Customers', 'Update customers'),
  ('customers', 'delete', 'customers.delete', 'Customers', 'Delete customers'),
  ('customers', 'export', 'customers.export', 'Customers', 'Export customers'),
  ('customers', 'manage', 'customers.manage', 'Customers', 'Full customer management'),

  ('inventory', 'view', 'inventory.view', 'Inventory', 'View inventory'),
  ('inventory', 'create', 'inventory.create', 'Inventory', 'Create inventory transactions'),
  ('inventory', 'update', 'inventory.update', 'Inventory', 'Adjust inventory'),
  ('inventory', 'delete', 'inventory.delete', 'Inventory', 'Delete inventory records'),
  ('inventory', 'import', 'inventory.import', 'Inventory', 'Bulk import inventory'),
  ('inventory', 'export', 'inventory.export', 'Inventory', 'Export inventory'),
  ('inventory', 'manage', 'inventory.manage', 'Inventory', 'Full inventory management'),

  ('affiliates', 'view', 'affiliates.view', 'Affiliates', 'View affiliates'),
  ('affiliates', 'create', 'affiliates.create', 'Affiliates', 'Create affiliates'),
  ('affiliates', 'update', 'affiliates.update', 'Affiliates', 'Update affiliates'),
  ('affiliates', 'delete', 'affiliates.delete', 'Affiliates', 'Delete affiliates'),
  ('affiliates', 'approve', 'affiliates.approve', 'Affiliates', 'Approve affiliates and withdrawals'),
  ('affiliates', 'export', 'affiliates.export', 'Affiliates', 'Export affiliate data'),
  ('affiliates', 'manage', 'affiliates.manage', 'Affiliates', 'Full affiliate management'),

  ('marketing', 'view', 'marketing.view', 'Marketing', 'View marketing integrations'),
  ('marketing', 'update', 'marketing.update', 'Marketing', 'Update marketing/pixel/CAPI configuration'),
  ('marketing', 'manage', 'marketing.manage', 'Marketing', 'Full marketing management'),

  ('analytics', 'view', 'analytics.view', 'Analytics', 'View analytics'),
  ('analytics', 'export', 'analytics.export', 'Analytics', 'Export analytics'),

  ('reports', 'view', 'reports.view', 'Reports', 'View reports'),
  ('reports', 'export', 'reports.export', 'Reports', 'Export reports'),

  ('staff', 'view', 'staff.view', 'Staff', 'View staff directory'),
  ('staff', 'create', 'staff.create', 'Staff', 'Invite staff'),
  ('staff', 'update', 'staff.update', 'Staff', 'Update staff'),
  ('staff', 'delete', 'staff.delete', 'Staff', 'Remove staff'),
  ('staff', 'assign', 'staff.assign', 'Staff', 'Assign orders/tasks to staff'),
  ('staff', 'manage', 'staff.manage', 'Staff', 'Full staff management, including role grants'),

  ('roles_permissions', 'view', 'roles_permissions.view', 'Roles & Permissions', 'View roles and permissions'),
  ('roles_permissions', 'manage', 'roles_permissions.manage', 'Roles & Permissions', 'Create/edit roles and assign permissions'),

  ('notifications', 'view', 'notifications.view', 'Notifications', 'View notifications'),
  ('notifications', 'manage', 'notifications.manage', 'Notifications', 'Manage notification settings'),

  ('audit_logs', 'view', 'audit_logs.view', 'Audit Logs', 'View audit logs'),

  ('brands', 'view', 'brands.view', 'Brands', 'View brands'),
  ('brands', 'manage', 'brands.manage', 'Brands', 'Create/edit/archive brands'),

  ('workspace', 'view', 'workspace.view', 'Workspace', 'View workspace'),
  ('workspace', 'manage', 'workspace.manage', 'Workspace', 'Manage workspace-level settings'),

  ('settings', 'view', 'settings.view', 'Settings', 'View settings'),
  ('settings', 'manage', 'settings.manage', 'Settings', 'Manage system settings, API keys and email templates'),

  ('support', 'view', 'support.view', 'Support', 'View support/help center'),
  ('support', 'manage', 'support.manage', 'Support', 'Manage support content')
on conflict (slug) do nothing;


-- ---------------------------------------------------------------
-- System role templates (workspace_id is null = available to be
-- cloned/assigned by every workspace). New workspaces should copy
-- these into workspace-scoped roles on creation.
-- ---------------------------------------------------------------
insert into public.roles (workspace_id, name, slug, description, is_system_role) values
  (null, 'Owner', 'owner', 'Full access to every module and setting.', true),
  (null, 'Admin', 'admin', 'Broad operational access, excluding workspace-level billing/ownership actions.', true),
  (null, 'Manager', 'manager', 'Manages day-to-day operations: orders, products, staff assignment, reports.', true),
  (null, 'Customer Support', 'customer-support', 'Owns orders from confirmation through completion.', true),
  (null, 'Warehouse Staff', 'warehouse-staff', 'Packing queue and inventory adjustments.', true),
  (null, 'Finance', 'finance', 'Revenue, affiliate withdrawals, reports.', true),
  (null, 'Marketing', 'marketing', 'Landing pages, campaigns, pixel/CAPI configuration.', true),
  (null, 'Affiliate Manager', 'affiliate-manager', 'Manages affiliates, commissions and withdrawals.', true),
  (null, 'Viewer', 'viewer', 'Read-only access across the workspace.', true)
on conflict (workspace_id, slug) do nothing;

-- Owner: every permission.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'owner' and r.workspace_id is null
on conflict do nothing;

-- Admin: everything except workspace ownership transfer/manage.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'admin' and r.workspace_id is null
  and p.slug <> 'workspace.manage'
on conflict do nothing;

-- Manager: operational modules, full CRUD, no roles/settings/workspace management.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'manager' and r.workspace_id is null
  and p.module in ('dashboard', 'orders', 'products', 'categories', 'landing_pages',
                    'customers', 'inventory', 'affiliates', 'marketing', 'analytics',
                    'reports', 'staff', 'notifications', 'brands')
  and p.action <> 'manage'
on conflict do nothing;

-- Customer Support: dashboard + full order ownership + customer/notification view.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'customer-support' and r.workspace_id is null
  and (
    p.slug in ('dashboard.view', 'orders.view', 'orders.create', 'orders.update',
               'orders.assign', 'orders.approve', 'customers.view', 'customers.create',
               'customers.update', 'notifications.view')
  )
on conflict do nothing;

-- Warehouse Staff: packing queue + inventory.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'warehouse-staff' and r.workspace_id is null
  and (
    p.slug in ('dashboard.view', 'orders.view', 'orders.update',
               'inventory.view', 'inventory.update', 'inventory.create', 'notifications.view')
  )
on conflict do nothing;

-- Finance: revenue-adjacent visibility + affiliate approvals.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'finance' and r.workspace_id is null
  and (
    p.slug in ('dashboard.view', 'orders.view', 'orders.export', 'affiliates.view',
               'affiliates.approve', 'affiliates.export', 'reports.view', 'reports.export',
               'analytics.view', 'notifications.view')
  )
on conflict do nothing;

-- Marketing: landing pages + marketing integrations + analytics.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'marketing' and r.workspace_id is null
  and (
    p.module in ('landing_pages', 'marketing', 'analytics')
    or p.slug in ('dashboard.view', 'products.view', 'brands.view', 'notifications.view')
  )
on conflict do nothing;

-- Affiliate Manager: full affiliate module.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'affiliate-manager' and r.workspace_id is null
  and (
    p.module = 'affiliates'
    or p.slug in ('dashboard.view', 'orders.view', 'reports.view', 'notifications.view')
  )
on conflict do nothing;

-- Viewer: read-only across the board.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'viewer' and r.workspace_id is null
  and p.action = 'view'
on conflict do nothing;
