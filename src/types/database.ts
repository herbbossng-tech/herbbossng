/**
 * Hand-authored types mirroring supabase/migrations/000*.sql.
 *
 * Once the real project is linked, replace this file with the CLI-generated
 * equivalent: `supabase gen types typescript --linked > src/types/database.ts`
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

interface Timestamped {
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface Workspace extends Timestamped {
  id: string
  name: string
  slug: string
  country_code: string | null
  currency_code: string | null
  timezone: string
  logo_url: string | null
  status: 'active' | 'inactive' | 'suspended'
  settings: Json
  deleted_at: string | null
}

export interface Brand extends Timestamped {
  id: string
  workspace_id: string
  name: string
  slug: string
  logo_url: string | null
  domain: string | null
  theme: Json
  meta_pixel_id: string | null
  meta_capi_access_token: string | null
  meta_capi_test_event_code: string | null
  google_analytics_id: string | null
  google_tag_manager_id: string | null
  microsoft_clarity_id: string | null
  email_sender_name: string | null
  email_sender_address: string | null
  status: 'active' | 'inactive' | 'archived'
  deleted_at: string | null
}

export interface Profile extends Timestamped {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  avatar_url: string | null
  department: string | null
  status: 'active' | 'inactive' | 'suspended' | 'invited'
  last_login_at: string | null
  default_workspace_id: string | null
  deleted_at: string | null
}

export interface Role extends Timestamped {
  id: string
  workspace_id: string | null
  name: string
  slug: string
  description: string | null
  is_system_role: boolean
  deleted_at: string | null
}

export type PermissionModule =
  | 'dashboard'
  | 'orders'
  | 'products'
  | 'categories'
  | 'landing_pages'
  | 'customers'
  | 'inventory'
  | 'affiliates'
  | 'marketing'
  | 'analytics'
  | 'reports'
  | 'staff'
  | 'roles_permissions'
  | 'notifications'
  | 'audit_logs'
  | 'brands'
  | 'workspace'
  | 'settings'
  | 'support'

export type PermissionAction =
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'assign'
  | 'approve'
  | 'export'
  | 'import'
  | 'manage'

export interface Permission {
  id: string
  module: PermissionModule
  action: PermissionAction
  slug: string
  category: string | null
  description: string | null
  created_at: string
}

export interface RolePermission {
  id: string
  role_id: string
  permission_id: string
  created_at: string
  created_by: string | null
}

export interface UserRole {
  id: string
  user_id: string
  role_id: string
  workspace_id: string
  brand_id: string | null
  created_at: string
  created_by: string | null
}

export interface Notification {
  id: string
  workspace_id: string
  brand_id: string | null
  user_id: string | null
  type: string
  title: string
  message: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  link: string | null
  metadata: Json
  is_read: boolean
  read_at: string | null
  is_archived: boolean
  archived_at: string | null
  created_at: string
  created_by: string | null
  deleted_at: string | null
}

export interface AuditLog {
  id: string
  workspace_id: string | null
  brand_id: string | null
  user_id: string | null
  module: string
  action: string
  entity_type: string | null
  entity_id: string | null
  previous_value: Json
  new_value: Json
  ip_address: string | null
  user_agent: string | null
  device: string | null
  created_at: string
}

export interface Country {
  id: string
  name: string
  code: string
  dial_code: string | null
  currency_code: string | null
  flag_emoji: string | null
  is_active: boolean
  created_at: string
}

export interface State {
  id: string
  country_id: string
  name: string
  code: string | null
  created_at: string
}

export interface Currency {
  id: string
  code: string
  name: string
  symbol: string
  decimal_places: number
  is_active: boolean
  created_at: string
}

export interface Setting extends Timestamped {
  id: string
  workspace_id: string | null
  brand_id: string | null
  category: string
  key: string
  value: Json
}

/** Database generic — enough surface for the Supabase client's generics.
 *  Insert/Update types intentionally loosen required-ness rather than
 *  duplicating every column; refine per-table as features are built. */
type TableDef<Row> = {
  Row: Row
  Insert: Partial<Row>
  Update: Partial<Row>
}

export interface Database {
  public: {
    Tables: {
      workspaces: TableDef<Workspace>
      brands: TableDef<Brand>
      profiles: TableDef<Profile>
      roles: TableDef<Role>
      permissions: TableDef<Permission>
      role_permissions: TableDef<RolePermission>
      user_roles: TableDef<UserRole>
      notifications: TableDef<Notification>
      audit_logs: TableDef<AuditLog>
      countries: TableDef<Country>
      states: TableDef<State>
      currencies: TableDef<Currency>
      settings: TableDef<Setting>
    }
  }
}
