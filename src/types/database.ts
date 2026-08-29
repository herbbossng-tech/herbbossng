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

export type CategoryStatus = 'active' | 'inactive'

export interface Category extends Timestamped {
  id: string
  workspace_id: string
  brand_id: string
  parent_id: string | null
  name: string
  slug: string
  description: string | null
  image_url: string | null
  status: CategoryStatus
  sort_order: number
  deleted_at: string | null
}

export type ProductStatus = 'draft' | 'active' | 'archived'
export type AffiliateCommissionType = 'fixed' | 'percentage'

export interface Product extends Timestamped {
  id: string
  workspace_id: string
  brand_id: string
  category_id: string | null
  name: string
  slug: string
  sku: string | null
  short_description: string | null
  description: string | null
  status: ProductStatus
  selling_price: number
  cost_price: number | null
  compare_price: number | null
  affiliate_commission_type: AffiliateCommissionType | null
  affiliate_commission_value: number | null
  track_inventory: boolean
  /** Never write directly — see public.adjust_inventory(). */
  stock_quantity: number
  reserved_quantity: number
  /** Generated column: greatest(stock_quantity - reserved_quantity, 0). */
  available_quantity: number
  low_stock_threshold: number
  /** Generated column: track_inventory and stock_quantity <= low_stock_threshold. */
  is_low_stock: boolean
  weight: number | null
  delivery_information: string | null
  return_policy: string | null
  tags: string[]
  seo_title: string | null
  seo_description: string | null
  deleted_at: string | null
}

export type InventoryTransactionType =
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'RESERVED'
  | 'RELEASED'
  | 'SOLD'
  | 'RETURNED'
  | 'DAMAGED'
  | 'ADJUSTMENT'

export interface InventoryTransaction {
  id: string
  workspace_id: string
  brand_id: string
  product_id: string
  transaction_type: InventoryTransactionType
  quantity: number
  previous_quantity: number
  new_quantity: number
  reason: string | null
  reference_type: string | null
  reference_id: string | null
  created_by: string | null
  created_at: string
}

export interface MediaLibraryItem extends Timestamped {
  id: string
  workspace_id: string
  brand_id: string | null
  bucket: 'products' | 'brands' | 'landing-pages' | 'avatars' | 'documents' | 'affiliates' | 'uploads'
  file_path: string
  file_name: string
  file_type: string
  file_size: number
  mime_type: string | null
  alt_text: string | null
  metadata: Json
  entity_type: string | null
  entity_id: string | null
  is_primary: boolean
  sort_order: number
  deleted_at: string | null
}

/**
 * The Supabase client is intentionally NOT generically typed with a full
 * `Database` schema (see src/lib/supabase.ts). At this schema's size,
 * postgrest-js's `.insert()`/`.update()` generic constraints resolve to
 * `never` — reproduced in isolation against both TypeScript 6.0 and the
 * stable 5.9 line, and even affects unrelated files simply by this file
 * being part of the same compilation (a whole-program instantiation-budget
 * effect, not a bug in these types). Every api.ts function still declares
 * proper parameter and return types using the Row interfaces above and
 * casts Supabase responses explicitly (`as Product`, etc.), so type safety
 * is preserved at every function boundary that the rest of the app
 * actually consumes — only the raw `.insert()`/`.update()` call arguments
 * lose compile-time shape validation against the schema.
 */
