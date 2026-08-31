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

export type OrderStatus =
  | 'NEW'
  | 'PENDING'
  | 'WILL_CALL_BACK'
  | 'SCHEDULED'
  | 'PROCESSING_FOR_DISPATCH'
  | 'DISPATCHED'
  | 'IN_TRANSIT'
  | 'PARTIALLY_DELIVERED'
  | 'DELIVERED'
  | 'RETURNED'
  | 'CANCELLED'

export type OrderSource = 'website' | 'whatsapp' | 'phone' | 'facebook' | 'instagram' | 'tiktok' | 'walk_in' | 'manual' | 'affiliate' | 'other'
export type OrderPriority = 'normal' | 'high' | 'urgent'
export type CashCollectionStatus = 'pending' | 'collected' | 'failed' | 'partial'

export interface Order {
  id: string
  workspace_id: string
  brand_id: string
  order_number: string
  source: OrderSource
  status: OrderStatus
  priority: OrderPriority

  customer_id: string | null
  customer_name: string
  customer_phone: string
  customer_email: string | null
  customer_country_code: string | null
  customer_state: string | null
  customer_city: string | null
  customer_address: string
  customer_address_2: string | null
  customer_postal_code: string | null
  customer_notes: string | null

  currency_code: string
  subtotal: number
  shipping_fee: number
  discount_amount: number
  total_amount: number
  cost_amount: number | null
  expected_profit: number | null

  payment_method: string
  cash_collection_status: CashCollectionStatus
  cash_collected_amount: number | null
  cash_collected_at: string | null

  landing_page_id: string | null
  source_detail: string | null
  referrer: string | null
  metadata: Json

  assigned_to: string | null
  scheduled_at: string | null
  callback_at: string | null
  confirmed_at: string | null
  dispatched_at: string | null
  delivered_at: string | null
  returned_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  return_reason: string | null

  internal_notes: string | null
  tags: string[]
  idempotency_key: string | null
  /** Computed once, server-side, by create_order() from prior orders with a matching phone number. Never a status. */
  is_repeat_customer: boolean

  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  deleted_at: string | null
}

export interface OrderItem {
  id: string
  order_id: string
  workspace_id: string
  brand_id: string
  product_id: string | null
  product_name: string
  sku: string | null
  package_id: string | null
  package_name: string | null
  quantity: number
  unit_price: number
  compare_price: number | null
  discount_amount: number
  total_amount: number
  free_quantity: number | null
  metadata: Json
  created_at: string
}

export type OrderEventType =
  | 'ORDER_CREATED'
  | 'STATUS_CHANGED'
  | 'ASSIGNED'
  | 'TAGS_UPDATED'
  | 'CASH_COLLECTED'
  | 'NOTE_ADDED'

export interface OrderEvent {
  id: string
  order_id: string
  workspace_id: string
  brand_id: string
  event_type: OrderEventType | string
  from_status: OrderStatus | null
  to_status: OrderStatus | null
  description: string
  metadata: Json
  created_by: string | null
  created_at: string
}

export interface OrderNote {
  id: string
  order_id: string
  workspace_id: string
  brand_id: string
  body: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface OrderStatusTransition {
  from_status: OrderStatus
  to_status: OrderStatus
  requires_approval: boolean
}

export interface OrderStats {
  total_orders: number
  today_orders: number
  new_count: number
  pending_count: number
  will_call_back_count: number
  scheduled_count: number
  processing_count: number
  dispatched_count: number
  in_transit_count: number
  partially_delivered_count: number
  delivered_count: number
  returned_count: number
  cancelled_count: number
  /** All-time sum of total_amount for every non-cancelled order. Not the same as delivered_revenue. */
  total_sales_value: number
  /** total_sales_value scoped to orders created today. */
  today_sales_value: number
  /** All-time. Only status=DELIVERED with cash_collection_status=collected. Must not collapse to 0 just because nothing delivered today. */
  delivered_revenue: number
  /** delivered_revenue scoped to orders delivered today (by delivered_at, not created_at). */
  today_delivered_revenue: number
  pending_revenue: number
  returned_value: number
  cancelled_value: number
  delivery_success_rate: number
}

/** One row of get_order_daily_stats() — powers dashboard trend charts. */
export interface OrderDailyStat {
  day: string
  order_count: number
  delivered_revenue: number
}

/** Distinct from OrderStatus — a customer relationship state, not an order lifecycle state. */
export type CustomerStatus = 'active' | 'inactive' | 'blocked'

export interface Customer {
  id: string
  workspace_id: string
  brand_id: string

  first_name: string | null
  last_name: string | null
  full_name: string
  phone: string
  /** Market-aware dedup key: dial-code digits + national number. See normalize_phone(). */
  canonical_phone: string
  alternate_phone: string | null
  email: string | null

  country_code: string | null
  state: string | null
  city: string | null
  address: string | null
  address_2: string | null
  landmark: string | null
  postal_code: string | null

  status: CustomerStatus

  /** Everything below is trigger-maintained from orders — never write these from the client. */
  is_repeat_customer: boolean
  total_orders: number
  delivered_count: number
  pending_count: number
  returned_count: number
  cancelled_count: number
  total_order_value: number
  delivered_value: number
  pending_value: number
  returned_value: number
  first_order_at: string | null
  last_order_at: string | null

  /** Captured once from the first order and never overwritten by a later order's source. */
  acquisition_source: string | null

  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  deleted_at: string | null
}

export interface CustomerNote {
  id: string
  customer_id: string
  workspace_id: string
  brand_id: string
  body: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CustomerStats {
  total_customers: number
  new_customers: number
  repeat_customers: number
  active_customers: number
  customers_with_pending_orders: number
}

export type LandingPageStatus = 'draft' | 'published' | 'unpublished' | 'archived'
export type LandingPageType = 'product_sales' | 'direct_response'

export interface WhatsappCtaConfig {
  enabled: boolean
  phone: string | null
  message: string | null
  label: string
}

export interface FloatingCtaConfig {
  enabled: boolean
  label: string
}

export interface LandingPageFormConfig {
  collectEmail?: boolean
  collectAlternatePhone?: boolean
  collectLandmark?: boolean
  collectNotes?: boolean
}

export interface LandingPageSeoConfig {
  metaTitle?: string
  metaDescription?: string
  shareImageUrl?: string
  noindex?: boolean
}

export interface LandingPage {
  id: string
  workspace_id: string
  brand_id: string
  product_id: string | null

  name: string
  slug: string
  title: string | null
  description: string | null

  status: LandingPageStatus
  page_type: LandingPageType

  theme_config: Json
  seo_config: LandingPageSeoConfig
  form_config: LandingPageFormConfig
  tracking_config: Json
  whatsapp_config: WhatsappCtaConfig
  floating_cta_config: FloatingCtaConfig
  order_summary_enabled: boolean

  /** Copied once from the owning workspace at creation time — see migration 0021. */
  market_country_code: string | null
  market_currency_code: string | null

  published_at: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  deleted_at: string | null
}

export type LandingPageSectionType =
  | 'HERO'
  | 'TRUST_STRIP'
  | 'TEXT'
  | 'IMAGE_TEXT'
  | 'BENEFITS'
  | 'HOW_IT_WORKS'
  | 'TESTIMONIALS'
  | 'FAQ'
  | 'CTA_BANNER'
  | 'PACKAGE_SELECTOR'
  | 'ORDER_FORM'

export interface LandingPageSection {
  id: string
  landing_page_id: string
  workspace_id: string
  brand_id: string
  type: LandingPageSectionType
  position: number
  enabled: boolean
  config: Json
  created_at: string
  updated_at: string
}

/** {"type":"free"} | {"type":"fixed","amount":number} | {"type":"by_state","default":number,"rates":Record<string,number>} */
export interface ShippingRule {
  type: 'free' | 'fixed' | 'by_state'
  amount?: number
  default?: number
  rates?: Record<string, number>
}

export interface LandingPagePackage {
  id: string
  landing_page_id: string
  workspace_id: string
  brand_id: string
  name: string
  quantity: number
  price: number
  compare_at_price: number | null
  badge: string | null
  savings_text: string | null
  offer_text: string | null
  shipping_rule: ShippingRule
  position: number
  enabled: boolean
  is_default: boolean
  created_at: string
  updated_at: string
}

export type LandingPageEventType =
  | 'page_view'
  | 'cta_click'
  | 'package_selected'
  | 'form_started'
  | 'form_submitted'
  | 'order_created'
  | 'thank_you_view'

export interface LandingPageEvent {
  id: string
  landing_page_id: string
  workspace_id: string
  brand_id: string
  event_type: LandingPageEventType
  session_id: string | null
  metadata: Json
  created_at: string
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
