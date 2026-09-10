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
  /** Public pixel ID, safe for the browser. The CAPI access token/test event code are NOT on this table — see brand_tracking_secrets (0031), never selected by the client. */
  meta_pixel_id: string | null
  /** Public pixel ID, same class as meta_pixel_id. The TikTok access token lives server-side only in brand_tracking_secrets. */
  tiktok_pixel_id: string | null
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
  is_platform_admin: boolean
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
  | 'campaigns'
  | 'commissions'
  | 'wallets'
  | 'withdrawals'
  | 'ad_costs'
  | 'affiliate_reports'
  | 'operations'
  | 'fulfillment'
  | 'waybills'
  | 'delivery_partners'
  | 'tasks'
  | 'settlement'
  | 'marketing'
  | 'analytics'
  | 'reports'
  | 'finance'
  | 'staff'
  | 'roles_permissions'
  | 'notifications'
  | 'audit_logs'
  | 'brands'
  | 'workspace'
  | 'settings'
  | 'support'
  | 'rescue'
  | 'assignment_rules'
  | 'approval_rules'
  | 'automation'
  | 'integrations'
  | 'communications'
  | 'billing'

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
  | 'CONFIRMED'
  | 'WILL_CALL_BACK'
  | 'NEEDS_FOLLOW_UP'
  | 'SCHEDULED'
  | 'PROCESSING_FOR_DISPATCH'
  | 'DISPATCHED'
  | 'IN_TRANSIT'
  | 'PARTIALLY_DELIVERED'
  | 'DELIVERED'
  | 'RETURNED'
  | 'CANCELLED'
  | 'REPEATED_ORDER'

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

  /** Real courier/logistics cost, distinct from shipping_fee (what the customer was charged). NULL until an operator records it — never fabricated. */
  actual_delivery_cost: number | null

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

  /** The affiliate credited with this order, resolved server-side from a referral code — never client-supplied directly. */
  affiliate_id: string | null
  /** The ACTIVE campaign this order was attributed to at creation time. Null if a valid affiliate was resolved but no live campaign covered any ordered product. */
  affiliate_campaign_id: string | null
  affiliate_referral_code_used: string | null

  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  fbclid: string | null
  ttclid: string | null

  packed_at: string | null
  packed_by: string | null
  /** Trigger-maintained from delivery_attempts — never written directly. */
  delivery_attempts_count: number
  failed_delivery_reason: string | null
  settlement_status: 'PENDING' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'DISPUTED'
  settled_at: string | null

  /** Set only by assign_order() (MANUAL) or run_auto_assignment_sweep()/the automation engine (AUTO). Null for orders assigned before 0038, or never assigned. */
  assignment_source: 'MANUAL' | 'AUTO' | null
  assignment_reason: string | null
  assignment_rule_id: string | null
  /** The most recent automatic-assignment attempt for this order, recorded whether or not it resulted in an assignment. Null = never attempted. */
  last_auto_assignment_attempted_at: string | null
  last_auto_assignment_result: AutoAssignmentResult | null

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
  /** Product cost_price at order time (NULL if unset then). Never recomputed from current cost, never backfilled for older rows. */
  unit_cost: number | null
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
  confirmed_count: number
  will_call_back_count: number
  needs_follow_up_count: number
  scheduled_count: number
  processing_count: number
  dispatched_count: number
  in_transit_count: number
  partially_delivered_count: number
  delivered_count: number
  returned_count: number
  cancelled_count: number
  repeated_order_count: number
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

/** get_my_work_summary() — hard-scoped server-side to assigned_to = auth.uid(). */
export interface MyWorkSummary {
  assigned_to_me_count: number
  new_count: number
  pending_confirmation_count: number
  confirmed_count: number
  follow_up_required_count: number
  out_for_delivery_count: number
  delivered_count: number
  cancelled_count: number
  returned_count: number
  overdue_follow_ups_count: number
  due_today_follow_ups_count: number
  oldest_pending_since: string | null
}

export type MyWorkQueueGroup =
  | 'OVERDUE_FOLLOW_UP'
  | 'DUE_TODAY'
  | 'AWAITING_CONFIRMATION'
  | 'NOT_YET_CONTACTED'
  | 'MISSED_CONTACT'
  | 'RECENTLY_ASSIGNED'

/** get_my_priority_queue() row — an order may legitimately appear under more than one queue_group. */
export interface MyWorkQueueItem {
  queue_group: MyWorkQueueGroup
  order_id: string
  order_number: string
  customer_name: string
  customer_phone: string
  product_summary: string | null
  total_amount: number
  customer_city: string | null
  customer_state: string | null
  status: OrderStatus
  priority: OrderPriority
  last_interaction_at: string | null
  last_interaction_summary: string | null
  next_follow_up_at: string | null
  updated_at: string
}

/** get_my_recent_orders() row. */
export interface MyRecentOrder {
  order_id: string
  order_number: string
  customer_name: string
  customer_phone: string
  product_summary: string | null
  total_amount: number
  customer_city: string | null
  customer_state: string | null
  status: OrderStatus
  last_interaction_at: string | null
  last_interaction_summary: string | null
  next_follow_up_at: string | null
  updated_at: string
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

  /** Gates MARKETING communication only — transactional (order/delivery/payment) messages are never blocked by these. See customers.email_opt_in's column comment (migration 0034). */
  email_opt_in: boolean
  sms_opt_in: boolean
  whatsapp_opt_in: boolean

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

export interface LandingPageThankYouUpsellConfig {
  enabled: boolean
  title?: string
  body?: string
  imageUrl?: string
  ctaLabel?: string
  ctaTarget?: string
}

export interface LandingPageThankYouConfig {
  headline?: string
  message?: string
  ctaLabel?: string
  ctaTarget?: string
  showOrderSummary?: boolean
  upsell?: LandingPageThankYouUpsellConfig
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
  thank_you_config: LandingPageThankYouConfig

  /** Copied from the owning workspace at creation time, or set explicitly per-page — see set_landing_page_market() (0031). */
  market_country_code: string | null
  market_currency_code: string | null

  /** The template this page was created from, if any. Null for pages predating the template engine (0031) or built section-by-section. */
  template_id: string | null

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
  | 'PROBLEM_AWARENESS'
  | 'INGREDIENTS'
  | 'COMPARISON'
  | 'GUARANTEE'

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
 * Finance + Analytics + Reports (Phase 4). These interfaces mirror the
 * RPC row shapes defined in supabase/migrations/0022_finance_analytics_reports.sql
 * exactly — see that migration's header comment for the authoritative
 * definition of every field (date-scoping rules, what counts as
 * "eligible", etc.). Never recompute these client-side.
 */
export interface FinanceSummary {
  total_sales_value: number
  total_orders: number
  delivered_revenue: number
  delivered_orders: number
  pending_revenue: number
  pending_orders: number
  returned_value: number
  returned_orders: number
  cancelled_value: number
  cancelled_orders: number
  average_order_value: number
  average_delivered_order_value: number
  cogs_delivered: number
  gross_profit: number
  gross_margin_pct: number
  delivery_success_rate: number
  return_rate: number
  cancellation_rate: number
  /** Numerator/denominator backing delivery_success_rate/return_rate/cancellation_rate — always show these next to the percentage, never the percentage alone. */
  rate_delivered_count: number
  rate_returned_count: number
  rate_cancelled_count: number
  rate_eligible_count: number
  /** Only computed over delivered orders that have actual_delivery_cost recorded — see contribution_profit_orders_count. */
  contribution_profit: number
  /** How many delivered orders actually contributed to contribution_profit. 0 means "not configured yet", not "zero profit". */
  contribution_profit_orders_count: number
}

export interface OrderStatusValueRow {
  status: OrderStatus
  order_count: number
  order_value: number
}

export type DeliveryFunnelStage = 'CREATED' | 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED' | 'CASH_COLLECTED'

export interface DeliveryFunnelStat {
  stage: DeliveryFunnelStage
  order_count: number
  order_value: number
}

export interface RevenueTrendPoint {
  bucket: string
  sales_value: number
  delivered_revenue: number
  pending_revenue: number
}

export type TrendGranularity = 'day' | 'week' | 'month'

export interface ProductPerformanceRow {
  product_id: string
  product_name: string
  sku: string | null
  orders_count: number
  units_sold: number
  sales_value: number
  delivered_revenue: number
  returned_orders: number
  cancelled_orders: number
  cancellation_rate: number
  stock_quantity: number | null
  reserved_quantity: number | null
  available_quantity: number | null
  cogs_delivered: number
  gross_profit: number
  gross_margin_pct: number
  items_delivered: number
  items_with_cost_data: number
}

export interface CustomerAnalyticsSummary {
  total_customers: number
  new_customers: number
  repeat_customers: number
  repeat_order_rate: number
  avg_orders_per_customer: number
  customer_revenue: number
  delivered_customer_revenue: number
}

export interface LandingPageAnalyticsRow {
  landing_page_id: string
  landing_page_name: string
  landing_page_slug: string
  orders_count: number
  sales_value: number
  delivered_revenue: number
  pending_revenue: number
  returned_orders: number
  cancelled_orders: number
  average_order_value: number
}

// ---------------------------------------------------------------
// Affiliates, Campaigns, Commissions, Wallets, Withdrawals & Ad
// Costs (migration 0024). See that migration for the full field
// semantics — approval_status/status on Affiliate can only change via
// approve_affiliate()/reject_affiliate()/suspend_affiliate()/
// reactivate_affiliate(); AffiliateCampaign's status can only change
// via a direct update gated by RLS + the guard_campaign_status_
// transition() trigger.
// ---------------------------------------------------------------

export interface Affiliate {
  id: string
  workspace_id: string
  full_name: string
  email: string | null
  phone: string | null
  business_name: string | null
  referral_code: string
  approval_status: 'pending' | 'approved' | 'rejected'
  status: 'active' | 'suspended'
  applied_at: string
  approved_at: string | null
  approved_by: string | null
  rejected_at: string | null
  rejected_by: string | null
  rejection_reason: string | null
  suspended_at: string | null
  suspended_by: string | null
  suspension_reason: string | null
  payout_method: Json
  notes: string | null
  tags: string[]
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  deleted_at: string | null
}

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
export type CommissionType = 'FIXED_AMOUNT' | 'PERCENTAGE'
export type QualifyingEvent = 'PER_ORDER_CREATED' | 'PER_DELIVERED_ORDER'
export type AffiliateAccess = 'ALL_APPROVED_AFFILIATES' | 'SELECTED_AFFILIATES_ONLY'

export interface AffiliateCampaign {
  id: string
  workspace_id: string
  brand_id: string
  name: string
  slug: string
  description: string | null
  status: CampaignStatus
  commission_type: CommissionType
  commission_value: number
  qualifying_event: QualifyingEvent
  affiliate_access: AffiliateAccess
  allowed_activities: string[]
  start_at: string | null
  end_at: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  deleted_at: string | null
}

export interface AffiliateCampaignProduct {
  id: string
  campaign_id: string
  product_id: string
  created_at: string
  created_by: string | null
}

export interface AffiliateCampaignAffiliate {
  id: string
  campaign_id: string
  affiliate_id: string
  relationship: 'ACCESS' | 'COMMISSION_EXCEPTION'
  created_at: string
  created_by: string | null
}

export interface AffiliateCampaignAsset {
  id: string
  campaign_id: string
  name: string
  file_path: string
  file_type: string | null
  file_size: number | null
  created_at: string
  created_by: string | null
}

export interface AffiliateCommission {
  id: string
  workspace_id: string
  campaign_id: string
  affiliate_id: string
  order_id: string
  qualifying_event: QualifyingEvent
  commission_base_amount: number
  commission_type: CommissionType
  commission_value: number
  commission_amount: number
  currency_code: string
  status: 'ELIGIBLE' | 'EXEMPT' | 'REVERSED'
  wallet_transaction_id: string | null
  reversed_at: string | null
  reversed_reason: string | null
  reversal_wallet_transaction_id: string | null
  created_at: string
}

export interface AffiliateWallet {
  id: string
  workspace_id: string
  affiliate_id: string
  balance: number
  reserved_balance: number
  currency_code: string
  created_at: string
  updated_at: string
}

export type WalletTransactionType =
  | 'COMMISSION_EARNED'
  | 'COMMISSION_REVERSED'
  | 'MANUAL_CREDIT'
  | 'MANUAL_DEBIT'
  | 'WITHDRAWAL_RESERVED'
  | 'WITHDRAWAL_RELEASED'
  | 'WITHDRAWAL_PAID'

export interface AffiliateWalletTransaction {
  id: string
  workspace_id: string
  wallet_id: string
  affiliate_id: string
  transaction_type: WalletTransactionType
  amount: number
  reserved_delta: number
  reference_type: string | null
  reference_id: string | null
  description: string | null
  created_by: string | null
  created_at: string
}

export interface AffiliateWithdrawal {
  id: string
  workspace_id: string
  affiliate_id: string
  amount: number
  currency_code: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID'
  payout_method: Json
  note: string | null
  requested_at: string
  requested_by: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  rejection_reason: string | null
  paid_at: string | null
  paid_by: string | null
  payment_reference: string | null
  reserve_transaction_id: string | null
  release_transaction_id: string | null
  paid_transaction_id: string | null
  created_at: string
  updated_at: string
}

export interface AdCost {
  id: string
  workspace_id: string
  brand_id: string
  campaign_id: string | null
  affiliate_id: string | null
  product_id: string | null
  marketing_campaign_id: string | null
  channel: MarketingChannel | null
  source: string | null
  description: string | null
  external_reference: string | null
  period_start: string
  period_end: string
  initial_cost_amount: number
  initial_orders_count: number
  delivered_orders_count: number | null
  currency_code: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  notes: string | null
  submitted_by: string | null
  submitted_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
}

export type MarketingChannel = 'meta' | 'tiktok' | 'google' | 'affiliate' | 'organic' | 'direct' | 'whatsapp' | 'other'
export type MarketingCampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'

export interface MarketingCampaign {
  id: string
  workspace_id: string
  brand_id: string
  name: string
  description: string | null
  status: MarketingCampaignStatus
  channel: MarketingChannel
  source: string | null
  objective: string | null
  product_id: string | null
  landing_page_id: string | null
  affiliate_campaign_id: string | null
  media_buyer_id: string | null
  market_country_code: string | null
  market_currency_code: string | null
  external_campaign_id: string | null
  utm_campaign: string | null
  tracking_metadata: Record<string, unknown>
  start_date: string | null
  end_date: string | null
  budget_total: number | null
  budget_daily: number | null
  target_orders: number | null
  target_delivered_orders: number | null
  target_delivered_revenue: number | null
  target_delivered_cpa: number | null
  target_delivered_roas: number | null
  target_delivery_rate_pct: number | null
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  deleted_at: string | null
}

export interface MarketingSummary {
  total_ad_spend: number | null
  orders_created: number
  delivered_orders: number
  delivered_revenue: number | null
  delivered_roas: number | null
  delivered_cpa: number | null
  active_campaigns: number
}

export interface MarketingCampaignListRow {
  campaign_id: string
  name: string
  channel: MarketingChannel
  status: MarketingCampaignStatus
  market_country_code: string | null
  currency_code: string | null
  product_id: string | null
  product_name: string | null
  landing_page_id: string | null
  landing_page_name: string | null
  media_buyer_id: string | null
  media_buyer_name: string | null
  start_date: string | null
  end_date: string | null
  budget_total: number | null
  spend: number | null
  budget_utilization_pct: number | null
  orders_created: number
  confirmed_orders: number
  dispatched_orders: number
  delivered_orders: number
  cancelled_orders: number
  returned_orders: number
  delivery_rate_pct: number | null
  delivered_revenue: number | null
  delivered_cpa: number | null
  roas: number | null
  cogs_delivered: number | null
  delivery_cost_delivered: number | null
  contribution_profit: number | null
  profit_data_available: boolean
  created_at: string
}

export interface MarketingCampaignDetail {
  campaign_id: string
  name: string
  description: string | null
  status: MarketingCampaignStatus
  channel: MarketingChannel
  source: string | null
  objective: string | null
  market_country_code: string | null
  currency_code: string | null
  product_id: string | null
  product_name: string | null
  landing_page_id: string | null
  landing_page_name: string | null
  affiliate_campaign_id: string | null
  affiliate_campaign_name: string | null
  media_buyer_id: string | null
  media_buyer_name: string | null
  utm_campaign: string | null
  external_campaign_id: string | null
  start_date: string | null
  end_date: string | null
  budget_total: number | null
  budget_daily: number | null
  notes: string | null
  spend: number | null
  budget_utilization_pct: number | null
  orders_created: number
  confirmed_orders: number
  dispatched_orders: number
  delivered_orders: number
  cancelled_orders: number
  returned_orders: number
  delivery_rate_pct: number | null
  cancellation_rate_pct: number | null
  return_rate_pct: number | null
  delivered_revenue: number | null
  total_order_value: number | null
  average_order_value: number | null
  delivered_cpa: number | null
  initial_cpa: number | null
  roas: number | null
  cogs_delivered: number | null
  delivery_cost_delivered: number | null
  affiliate_commission: number | null
  contribution_profit: number | null
  profit_data_available: boolean
  landing_page_views: number
  landing_page_form_starts: number
  target_orders: number | null
  target_delivered_orders: number | null
  target_delivered_revenue: number | null
  target_delivered_cpa: number | null
  target_delivered_roas: number | null
  target_delivery_rate_pct: number | null
}

export interface MarketingTrendPoint {
  bucket: string
  spend: number | null
  orders_created: number
  delivered_orders: number
  delivered_revenue: number | null
}

export interface MarketingChannelPerformanceRow {
  channel: MarketingChannel | string
  spend: number | null
  orders_created: number
  delivered_orders: number
  delivered_revenue: number | null
  delivered_cpa: number | null
  roas: number | null
}

export interface MarketingMediaBuyerPerformanceRow {
  media_buyer_id: string
  media_buyer_name: string | null
  campaigns_count: number
  spend: number | null
  orders_created: number
  delivered_orders: number
  delivered_revenue: number | null
  delivered_cpa: number | null
  roas: number | null
  contribution_profit: number | null
}

export interface AffiliatePerformanceRow {
  affiliate_id: string
  affiliate_name: string
  referral_code: string
  total_orders: number
  delivered_orders: number
  delivered_revenue: number
  total_commission_earned: number
  total_commission_reversed: number
  net_commission: number
  wallet_balance: number
  wallet_reserved_balance: number
}

export interface CampaignPerformanceRow {
  campaign_id: string
  campaign_name: string
  status: CampaignStatus
  total_orders: number
  delivered_orders: number
  delivered_revenue: number
  total_commission_paid: number
  approved_ad_cost: number
  initial_orders_for_ad_cost: number
  delivered_orders_for_ad_cost: number
}

export interface ProductAffiliatePerformanceRow {
  product_id: string
  product_name: string
  campaign_id: string
  campaign_name: string
  delivered_orders: number
  delivered_revenue: number
  total_commission_paid: number
}

export interface AdCostSummaryRow {
  id: string
  campaign_id: string | null
  campaign_name: string | null
  affiliate_id: string | null
  affiliate_name: string | null
  product_id: string | null
  product_name: string | null
  period_start: string
  period_end: string
  initial_cost_amount: number
  initial_orders_count: number
  delivered_orders_count: number | null
  initial_cost_per_order: number | null
  delivered_cost_per_order: number | null
  currency_code: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
}

// ---------------------------------------------------------------
// COD Operations, Fulfillment & Delivery Control (migration 0025).
// See that migration for full field semantics.
// ---------------------------------------------------------------

export type OrderTaskType = 'CONFIRM_ORDER' | 'CALL_BACK' | 'VERIFY_ADDRESS' | 'DELIVERY_FOLLOW_UP' | 'FAILED_DELIVERY' | 'CUSTOMER_REQUEST' | 'OTHER'
export type OrderTaskStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface OrderTask {
  id: string
  workspace_id: string
  brand_id: string
  order_id: string
  customer_id: string | null
  task_type: OrderTaskType
  title: string
  description: string | null
  priority: TaskPriority
  status: OrderTaskStatus
  assigned_to: string | null
  due_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface DeliveryPartner {
  id: string
  workspace_id: string
  name: string
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  coverage_areas: string[]
  status: 'active' | 'inactive'
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  deleted_at: string | null
}

export type WaybillStatus = 'CREATED' | 'READY' | 'DISPATCHED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED' | 'RETURNED' | 'CANCELLED'

export interface Waybill {
  id: string
  workspace_id: string
  brand_id: string
  order_id: string
  waybill_number: string
  delivery_partner_id: string | null
  destination_address: string | null
  destination_state: string | null
  cod_amount: number
  status: WaybillStatus
  dispatched_at: string | null
  delivered_at: string | null
  returned_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export type DeliveryAttemptResult = 'DELIVERED' | 'CUSTOMER_UNAVAILABLE' | 'CUSTOMER_REFUSED' | 'WRONG_ADDRESS' | 'RESCHEDULED' | 'OTHER'

export interface DeliveryAttempt {
  id: string
  workspace_id: string
  brand_id: string
  order_id: string
  waybill_id: string | null
  delivery_partner_id: string | null
  attempt_number: number
  result: DeliveryAttemptResult
  failure_reason: string | null
  notes: string | null
  attempted_at: string
  created_by: string | null
}

export interface OrderSettlement {
  id: string
  workspace_id: string
  brand_id: string
  order_id: string
  expected_amount: number
  collected_amount: number
  delivery_fee: number
  remitted_amount: number
  discrepancy: number
  status: 'PENDING' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'DISPUTED'
  settled_at: string | null
  settled_by: string | null
  dispute_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface OperationsSummary {
  awaiting_confirmation_count: number
  scheduled_count: number
  processing_count: number
  dispatched_count: number
  in_transit_count: number
  partially_delivered_count: number
  returned_count: number
  failed_deliveries_count: number
  pending_cash_collection_count: number
  pending_cash_collection_amount: number
  settlement_exceptions_count: number
  settlement_outstanding_amount: number
}

export interface RescueBoardRow {
  order_id: string
  order_number: string
  customer_name: string
  customer_phone: string
  total_amount: number
  currency_code: string
  status: OrderStatus
  issue: string
  priority: 'normal' | 'high' | 'urgent'
  assigned_to: string | null
  scheduled_at: string | null
  delivery_attempts_count: number
  open_task_count: number
  last_event_at: string | null
}

export interface TaskStats {
  open_count: number
  in_progress_count: number
  overdue_count: number
  due_today_count: number
  completed_today_count: number
}

export type AssignmentRuleModule = 'orders' | 'tasks'
export type AssignmentStrategy = 'manual' | 'round_robin' | 'least_workload' | 'fixed'

export interface AssignmentRule {
  id: string
  workspace_id: string
  brand_id: string | null
  module: AssignmentRuleModule
  strategy: AssignmentStrategy
  fixed_staff_ids: string[]
  is_active: boolean
  notes: string | null
  /** Minutes an order/task must remain unassigned before it's eligible for automatic assignment. Default 20. Irrelevant when strategy='manual'. */
  aging_minutes: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  deleted_at: string | null
}

export type AutoAssignmentResult =
  | 'ASSIGNED'
  | 'NO_ELIGIBLE_STAFF'
  | 'NO_AVAILABLE_STAFF'
  | 'ALL_STAFF_AT_CAPACITY'
  | 'NO_PERMISSION_MATCH'
  | 'DISABLED_MANUAL_STRATEGY'
  | 'OUTSIDE_ASSIGNMENT_WINDOW'

/** get_workspace_staff() row — one per (workspace, person), gated on staff.view/staff.manage. */
export interface StaffAssignmentSettings {
  workspace_id: string
  user_id: string
  is_available_for_assignment: boolean
  max_active_orders: number | null
  auto_assignment_enabled: boolean
  last_assigned_at: string | null
  updated_at: string
  updated_by: string | null
}

/** run_auto_assignment_sweep() row — one per order the sweep examined. */
export interface AutoAssignmentSweepResult {
  order_id: string
  order_number: string
  result: AutoAssignmentResult | 'DISABLED_MANUAL_STRATEGY'
  assigned_to: string | null
  assignment_reason: string | null
  candidate_count: number
}

/** get_workforce_ops_summary() — Management Command Center workforce metrics. Rate/timing fields are null (never a fabricated 0) when there is no attempt history in the window. */
export interface WorkforceOpsSummary {
  unassigned_count: number
  orders_aging_over_threshold_count: number
  orders_without_eligible_staff_count: number
  orders_assigned_today_count: number
  active_staff_count: number
  available_staff_count: number
  staff_at_capacity_count: number
  assignment_success_rate_24h: number | null
  avg_assignment_time_seconds_24h: number | null
}

export type ApprovalRuleModule = 'orders' | 'affiliates' | 'withdrawals' | 'ad_costs'

export interface ApprovalRule {
  id: string
  workspace_id: string
  brand_id: string | null
  module: ApprovalRuleModule
  action: string
  threshold_amount: number | null
  required_approver_role_id: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  deleted_at: string | null
}

// ---------------------------------------------------------------------
// Phase 8 — Automation / Event Engine (migration 0028). See that
// migration for full field semantics: conditions/actions are always
// structured jsonb (never arbitrary code), event_type/entity_type are
// free text server-side (no enum) but the values below are the full
// set the engine currently emits/consumes.
// ---------------------------------------------------------------------
export type AutomationEventType =
  | 'orders.created'
  | 'orders.status_changed'
  | 'orders.delivered'
  | 'orders.cancelled'
  | 'orders.returned'
  | 'orders.payment_collected'
  | 'customers.created'
  | 'customers.repeat_detected'
  | 'inventory.out_of_stock'
  | 'inventory.low_stock'
  | 'tasks.created'
  | 'tasks.completed'
  | 'waybills.created'
  | 'waybills.dispatched'
  | 'waybills.delivery_attempted'
  | 'settlements.created'
  | 'settlements.completed'
  | 'affiliate.commission_earned'
  | 'affiliate.withdrawal_requested'
  | 'affiliate.withdrawal_approved'
  | 'ad_cost.created'
  | 'ad_cost.approved'
  | 'staff.invited'
  | 'staff.suspended'

export type AutomationEventSource = 'system' | 'user_action' | 'webhook' | 'integration'
export type AutomationEventProcessingStatus = 'pending' | 'processed' | 'failed'

export interface AutomationEvent {
  id: string
  workspace_id: string
  brand_id: string | null
  event_type: AutomationEventType | string
  entity_type: string
  entity_id: string | null
  payload: Json
  source: AutomationEventSource
  correlation_id: string
  idempotency_key: string
  occurred_at: string
  created_at: string
  processed_at: string | null
  processing_status: AutomationEventProcessingStatus
  processing_error: string | null
}

export type AutomationConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'greater_or_equal'
  | 'less_or_equal'
  | 'contains'
  | 'not_contains'
  | 'in'
  | 'not_in'
  | 'is_empty'
  | 'is_not_empty'

export interface AutomationCondition {
  field: string
  operator: AutomationConditionOperator
  value: Json
}

export type AutomationConditionsLogic = 'AND' | 'OR'

export type AutomationActionType =
  | 'CREATE_TASK'
  | 'ASSIGN_TASK'
  | 'ASSIGN_ORDER'
  | 'CREATE_NOTIFICATION'
  | 'TRIGGER_APPROVAL'
  | 'UPDATE_SUPPORTED_RECORD'
  | 'SEND_SMS'
  | 'SEND_WHATSAPP'
  | 'SEND_EMAIL'
  | 'LOG_EVENT'

export interface AutomationAction {
  type: AutomationActionType
  config: Json
}

export type AutomationRuleStatus = 'draft' | 'active' | 'paused' | 'archived'

export interface AutomationRule {
  id: string
  workspace_id: string
  brand_id: string | null
  name: string
  description: string | null
  event_type: AutomationEventType | string
  status: AutomationRuleStatus
  priority: number
  conditions: AutomationCondition[]
  conditions_logic: AutomationConditionsLogic
  actions: AutomationAction[]
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  deleted_at: string | null
}

export type AutomationExecutionStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'retrying' | 'skipped'

export interface AutomationExecution {
  id: string
  event_id: string
  rule_id: string
  workspace_id: string
  brand_id: string | null
  status: AutomationExecutionStatus
  attempts: number
  max_attempts: number
  started_at: string | null
  completed_at: string | null
  next_retry_at: string | null
  error_message: string | null
  result: Json
  correlation_id: string | null
  created_at: string
  updated_at: string
}

export type AutomationExecutionActionStatus = 'pending' | 'succeeded' | 'failed' | 'skipped'

export interface AutomationExecutionAction {
  id: string
  execution_id: string
  action_seq: number
  action_type: AutomationActionType | string
  action_config: Json
  status: AutomationExecutionActionStatus
  result: Json
  error_message: string | null
  created_at: string
  updated_at: string
}

export type ApprovalRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface ApprovalRequest {
  id: string
  workspace_id: string
  brand_id: string | null
  approval_rule_id: string | null
  module: string
  entity_type: string
  entity_id: string
  amount: number | null
  status: ApprovalRequestStatus
  requested_by: string | null
  requested_at: string
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  created_at: string
  updated_at: string
}

export type CommunicationChannel = 'sms' | 'whatsapp' | 'email' | 'push'
export type CommunicationTemplateChannel = 'email' | 'sms'
export type CommunicationTriggeredBy = 'automation' | 'manual' | 'system'
/** not_configured/unsupported are terminal (no provider, or a channel with no adapter). queued/retryable are eligible for the dispatch-communication Edge Function's claim. sent/delivered/permanently_failed reflect a real provider outcome — see migration 0032. */
export type CommunicationStatus =
  | 'not_configured'
  | 'unsupported'
  | 'queued'
  | 'processing'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'retryable'
  | 'permanently_failed'
  | 'skipped_preference'
export type FailureCategory = 'timeout' | 'client_error' | 'server_error' | 'not_configured' | 'unknown'

export interface CommunicationLog {
  id: string
  workspace_id: string
  brand_id: string | null
  channel: CommunicationChannel
  recipient: string | null
  subject: string | null
  body: string | null
  status: CommunicationStatus
  provider: string | null
  provider_message_id: string | null
  related_execution_action_id: string | null
  idempotency_key: string | null
  attempts: number
  max_attempts: number
  next_retry_at: string | null
  claimed_at: string | null
  claimed_by: string | null
  dispatched_at: string | null
  failure_category: FailureCategory | null
  created_at: string

  // Phase 13 additions — see communication_log's table comment (0034).
  entity_type: string | null
  entity_id: string | null
  customer_id: string | null
  communication_type: string | null
  template_key: string | null
  is_transactional: boolean
  triggered_by: CommunicationTriggeredBy
  created_by: string | null
  updated_at: string
}

export interface EmailTemplate {
  id: string
  workspace_id: string | null
  brand_id: string | null
  key: string
  name: string
  channel: CommunicationTemplateChannel
  subject: string | null
  html_body: string
  is_active: boolean
  variables: string[]
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface RenderedCommunicationTemplate {
  subject: string | null
  body: string | null
  template_found: boolean
}

export type TrackingDispatchProvider = 'meta' | 'tiktok'
export type TrackingDispatchEventType =
  | 'PAGE_VIEW'
  | 'VIEW_CONTENT'
  | 'SELECT_PACKAGE'
  | 'INITIATE_CHECKOUT'
  | 'FORM_START'
  | 'ORDER_CREATED'
  | 'ORDER_CONFIRMED'
  | 'PURCHASE'
  | 'ORDER_CANCELLED'
/** not_configured is terminal (no token existed when enqueued). pending/retryable are eligible for the dispatch-tracking-event Edge Function's claim. sent/permanently_failed reflect a real Meta/TikTok API outcome — see migration 0032. */
export type TrackingDispatchStatus = 'not_configured' | 'pending' | 'processing' | 'sent' | 'failed' | 'retryable' | 'permanently_failed'

export interface TrackingDispatchLog {
  id: string
  workspace_id: string
  brand_id: string
  landing_page_id: string | null
  order_id: string | null
  provider: TrackingDispatchProvider
  event_type: TrackingDispatchEventType
  event_id: string
  status: TrackingDispatchStatus
  provider_response: Json | null
  error_message: string | null
  attempts: number
  max_attempts: number
  next_retry_at: string | null
  claimed_at: string | null
  claimed_by: string | null
  dispatched_at: string | null
  failure_category: FailureCategory | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------
// Omnichannel Order Ingestion (migration 0053) — Shopify/WooCommerce/
// Google Sheets as external order sources feeding the SAME orders
// table every other channel uses. Secret fields (access tokens, api
// secrets, consumer secret, refresh token) are never selectable from
// the client — get_external_connections() omits them from its result
// shape entirely, so ExternalConnection below only has what that RPC
// can actually return.
// ---------------------------------------------------------------------
export type ExternalConnectionProvider = 'shopify' | 'woocommerce' | 'google_sheets'
export type ExternalConnectionStatus = 'disconnected' | 'connected' | 'error'

export interface ExternalConnection {
  id: string
  provider: ExternalConnectionProvider
  status: ExternalConnectionStatus
  last_error: string | null
  last_sync_at: string | null
  shopify_shop_domain: string | null
  woocommerce_store_url: string | null
  google_spreadsheet_id: string | null
  google_sheet_name: string | null
  google_column_mapping: Record<string, string>
  google_header_row: boolean
  google_connected: boolean
}

export type ExternalIngestionStatus = 'pending' | 'processing' | 'ingested' | 'needs_review' | 'failed' | 'permanently_failed'

export interface ExternalOrderIngestionLog {
  id: string
  workspace_id: string
  brand_id: string
  connection_id: string
  provider: ExternalConnectionProvider
  external_order_id: string
  external_order_number: string | null
  status: ExternalIngestionStatus
  order_id: string | null
  input_customer: { name?: string; phone?: string; email?: string | null; [key: string]: Json | undefined }
  input_items: Json
  normalized_items: Json | null
  unresolved_items: Json | null
  error_message: string | null
  attempts: number
  max_attempts: number
  next_retry_at: string | null
  created_at: string
  updated_at: string
}

export interface ExternalIngestionHealth {
  pending: number
  processing: number
  needs_review: number
  failed: number
  permanently_failed: number
  ingested_recent: number
  oldest_pending_at: string | null
  last_success_at: string | null
}

// ---------------------------------------------------------------------
// Phase 10 — Customer Support & Rescue Intelligence (migration 0030).
// support_interactions is the one authoritative typed contact-history
// log (orders AND customers); rescue_cases/rescue_attempts is the
// persisted rescue state machine layered on top of the existing
// Rescue Board. Orders/Finance alone still determine actual order
// state and revenue — nothing here is a second source of truth.
// ---------------------------------------------------------------------
export type SupportInteractionType =
  | 'CALL'
  | 'CONFIRMATION_CALL'
  | 'FOLLOW_UP_CALL'
  | 'DELIVERY_FOLLOW_UP'
  | 'ADDRESS_VERIFICATION'
  | 'PHONE_VERIFICATION'
  | 'CUSTOMER_REQUEST'
  | 'CANCELLATION_REQUEST'
  | 'RESCUE_ATTEMPT'
  | 'ESCALATION'
  | 'INTERNAL_NOTE'
  | 'OTHER'

export type SupportInteractionOutcome =
  | 'CUSTOMER_REACHED'
  | 'NO_ANSWER'
  | 'WRONG_NUMBER'
  | 'CALLBACK_REQUESTED'
  | 'CONFIRMED'
  | 'RESCHEDULED'
  | 'CANCELLED'
  | 'ADDRESS_UPDATED'
  | 'PHONE_UPDATED'
  | 'ESCALATED'
  | 'NOT_INTERESTED'
  | 'UNABLE_TO_DELIVER'
  | 'OTHER'

export interface SupportInteraction {
  id: string
  workspace_id: string
  brand_id: string
  order_id: string | null
  customer_id: string | null
  interaction_type: SupportInteractionType
  outcome: SupportInteractionOutcome | null
  summary: string
  related_task_id: string | null
  related_rescue_case_id: string | null
  created_at: string
  created_by: string | null
}

export type RescueCaseStatus =
  | 'OPEN'
  | 'CONTACTING'
  | 'CUSTOMER_REACHED'
  | 'RESCHEDULED'
  | 'ADDRESS_FIXED'
  | 'PHONE_FIXED'
  | 'HANDED_BACK_TO_DELIVERY'
  | 'CONVERTED'
  | 'LOST'
  | 'CANCELLED'

export const RESCUE_CASE_TERMINAL_STATUSES: RescueCaseStatus[] = ['CONVERTED', 'LOST', 'CANCELLED']

export interface RescueCase {
  id: string
  workspace_id: string
  brand_id: string
  order_id: string
  customer_id: string | null
  status: RescueCaseStatus
  reason: string
  priority: TaskPriority
  assigned_to: string | null
  opened_at: string
  closed_at: string | null
  closed_reason: string | null
  escalated: boolean
  escalated_at: string | null
  escalated_by: string | null
  escalation_reason: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface RescueAttempt {
  id: string
  rescue_case_id: string
  workspace_id: string
  brand_id: string
  from_status: RescueCaseStatus | null
  to_status: RescueCaseStatus
  action_note: string | null
  outcome: SupportInteractionOutcome | null
  related_interaction_id: string | null
  created_by: string | null
  created_at: string
}

export interface SupportQueueRow {
  order_id: string
  order_number: string
  customer_id: string | null
  customer_name: string
  customer_phone: string
  order_status: OrderStatus
  priority: 'normal' | 'high' | 'urgent'
  priority_reasons: string[]
  rescue_case_id: string | null
  rescue_status: RescueCaseStatus | null
  rescue_escalated: boolean
  open_task_id: string | null
  open_task_type: OrderTaskType | null
  open_task_due_at: string | null
  last_interaction_at: string | null
  last_interaction_summary: string | null
  assigned_to: string | null
  next_action: string
}

export interface SupportSummary {
  needs_attention_count: number
  due_today_count: number
  overdue_count: number
  awaiting_customer_count: number
  rescue_opportunities_count: number
  escalated_count: number
  completed_today_count: number
}

export interface RescueFunnel {
  opportunities: number
  contacted: number
  customer_reached: number
  rescheduled_or_fixed: number
  returned_to_delivery: number
  delivered: number
  lost: number
}

export interface SupportAnalytics {
  period_days: number
  support_interactions_total: number
  orders_in_scope: number
  orders_contacted: number
  confirmation_calls_total: number
  confirmation_calls_confirmed: number
  rescue_opportunities_opened: number
  rescue_successful: number
  rescue_lost: number
  rescue_avg_resolution_hours: number | null
  overdue_tasks_current: number
  open_tasks_current: number
}

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'GRACE_PERIOD' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED' | 'NONE'
export type BillingInterval = 'monthly' | 'annual'
export type PaymentMethodType = 'card' | 'bank_transfer' | 'gateway' | 'crypto' | 'manual'
export type TenantPaymentStatus = 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'FAILED' | 'REFUNDED'

export interface PlanEntitlements {
  automation_enabled?: boolean
  advanced_reports?: boolean
  marketing_enabled?: boolean
  affiliates_enabled?: boolean
  integrations_enabled?: boolean
  realtime_enabled?: boolean
  api_access?: boolean
  custom_domain?: boolean
  priority_support?: boolean
}

export interface SubscriptionPlan {
  id: string
  slug: string
  name: string
  description: string | null
  monthly_price: number
  annual_price: number | null
  currency_code: string
  trial_days: number
  max_orders: number | null
  max_staff: number | null
  max_warehouses: number | null
  max_brands: number | null
  max_landing_pages: number | null
  entitlements: PlanEntitlements
  is_active: boolean
  is_public: boolean
  is_popular: boolean
  is_custom_pricing: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface TenantSubscription {
  id: string
  workspace_id: string
  plan_id: string
  status: SubscriptionStatus
  billing_interval: BillingInterval
  amount: number
  currency_code: string
  trial_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  renewal_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  payment_provider: string | null
  provider_reference: string | null
  created_at: string
  updated_at: string
}

export interface PaymentMethodConfig {
  id: string
  method_type: PaymentMethodType
  display_label: string
  is_active: boolean
  config: Record<string, unknown>
  sort_order: number
}

export interface CryptoPaymentConfig {
  id: string
  currency_code: string
  network: string
  wallet_address: string
  display_label: string | null
  payment_instructions: string | null
  confirmation_requirements: string | null
  is_active: boolean
  sort_order: number
}

export interface TenantPayment {
  id: string
  workspace_id: string
  subscription_id: string | null
  plan_id: string
  billing_interval: BillingInterval
  amount: number
  currency_code: string
  payment_method_type: PaymentMethodType
  provider: string | null
  provider_reference: string | null
  crypto_config_id: string | null
  crypto_tx_reference: string | null
  status: TenantPaymentStatus
  submitted_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  rejection_reason: string | null
  idempotency_key: string
  created_at: string
}

export interface WorkspaceEntitlements {
  plan_id: string | null
  plan_name: string | null
  status: SubscriptionStatus
  max_orders: number | null
  max_staff: number | null
  max_warehouses: number | null
  max_brands: number | null
  max_landing_pages: number | null
  entitlements: PlanEntitlements
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
