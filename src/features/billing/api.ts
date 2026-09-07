import { supabase } from '@/lib/supabase'
import type {
  CryptoPaymentConfig,
  PaymentMethodConfig,
  PaymentMethodType,
  SubscriptionPlan,
  TenantPayment,
  TenantSubscription,
  WorkspaceEntitlements,
} from '@/types/database'

// ---------- Tenant-facing reads ----------

export async function fetchPublicPlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabase.from('subscription_plans').select('*').order('sort_order')
  if (error) throw error
  return (data ?? []) as SubscriptionPlan[]
}

export async function fetchActivePaymentMethods(): Promise<PaymentMethodConfig[]> {
  const { data, error } = await supabase.from('payment_methods_config').select('*').eq('is_active', true).order('sort_order')
  if (error) throw error
  return (data ?? []) as PaymentMethodConfig[]
}

export async function fetchActiveCryptoConfigs(): Promise<CryptoPaymentConfig[]> {
  const { data, error } = await supabase.from('crypto_payment_configs').select('*').eq('is_active', true).order('sort_order')
  if (error) throw error
  return (data ?? []) as CryptoPaymentConfig[]
}

export async function fetchWorkspaceSubscription(workspaceId: string): Promise<TenantSubscription | null> {
  const { data, error } = await supabase.from('tenant_subscriptions').select('*').eq('workspace_id', workspaceId).maybeSingle()
  if (error) throw error
  return data as TenantSubscription | null
}

export async function fetchWorkspacePayments(workspaceId: string): Promise<TenantPayment[]> {
  const { data, error } = await supabase
    .from('tenant_payments')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as TenantPayment[]
}

export async function fetchWorkspaceEntitlements(workspaceId: string): Promise<WorkspaceEntitlements> {
  const { data, error } = await supabase.rpc('get_workspace_entitlements', { p_workspace_id: workspaceId }).single()
  if (error) throw error
  return data as unknown as WorkspaceEntitlements
}

// ---------- Tenant-facing writes ----------

export async function subscribeToPlan(workspaceId: string, planId: string, billingInterval: 'monthly' | 'annual'): Promise<TenantSubscription> {
  const { data, error } = await supabase
    .rpc('subscribe_to_plan', { p_workspace_id: workspaceId, p_plan_id: planId, p_billing_interval: billingInterval })
    .single()
  if (error) throw error
  return data as TenantSubscription
}

export interface SubmitPaymentInput {
  workspaceId: string
  planId: string
  billingInterval: 'monthly' | 'annual'
  paymentMethodType: PaymentMethodType
  idempotencyKey: string
  cryptoConfigId?: string | null
  cryptoTxReference?: string | null
}

export async function submitTenantPayment(input: SubmitPaymentInput): Promise<TenantPayment> {
  const { data, error } = await supabase
    .rpc('submit_tenant_payment', {
      p_workspace_id: input.workspaceId,
      p_plan_id: input.planId,
      p_billing_interval: input.billingInterval,
      p_payment_method_type: input.paymentMethodType,
      p_idempotency_key: input.idempotencyKey,
      p_crypto_config_id: input.cryptoConfigId ?? null,
      p_crypto_tx_reference: input.cryptoTxReference ?? null,
    })
    .single()
  if (error) throw error
  return data as TenantPayment
}

export async function cancelTenantSubscription(workspaceId: string, reason?: string): Promise<TenantSubscription> {
  const { data, error } = await supabase.rpc('cancel_tenant_subscription', { p_workspace_id: workspaceId, p_reason: reason ?? null }).single()
  if (error) throw error
  return data as TenantSubscription
}

// ---------- Platform-admin reads ----------

export async function fetchAllPlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabase.from('subscription_plans').select('*').order('sort_order')
  if (error) throw error
  return (data ?? []) as SubscriptionPlan[]
}

export async function fetchAllPaymentMethods(): Promise<PaymentMethodConfig[]> {
  const { data, error } = await supabase.from('payment_methods_config').select('*').order('sort_order')
  if (error) throw error
  return (data ?? []) as PaymentMethodConfig[]
}

export async function fetchAllCryptoConfigs(): Promise<CryptoPaymentConfig[]> {
  const { data, error } = await supabase.from('crypto_payment_configs').select('*').order('sort_order')
  if (error) throw error
  return (data ?? []) as CryptoPaymentConfig[]
}

export interface PendingPaymentRow extends TenantPayment {
  workspace: { id: string; name: string } | null
  plan: { id: string; name: string } | null
}

export async function fetchPendingPayments(): Promise<PendingPaymentRow[]> {
  const { data, error } = await supabase
    .from('tenant_payments')
    .select('*, workspace:workspaces(id, name), plan:subscription_plans(id, name)')
    .in('status', ['PENDING', 'SUBMITTED'])
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as PendingPaymentRow[]
}

export async function fetchAllTenantSubscriptions(): Promise<(TenantSubscription & { workspace: { id: string; name: string } | null; plan: { id: string; name: string } | null })[]> {
  const { data, error } = await supabase
    .from('tenant_subscriptions')
    .select('*, workspace:workspaces(id, name), plan:subscription_plans(id, name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as (TenantSubscription & { workspace: { id: string; name: string } | null; plan: { id: string; name: string } | null })[]
}

// ---------- Platform-admin writes ----------

export interface PlanFormFields {
  id?: string
  slug: string
  name: string
  description?: string | null
  monthlyPrice: number
  annualPrice?: number | null
  currencyCode: string
  trialDays: number
  maxOrders?: number | null
  maxStaff?: number | null
  maxWarehouses?: number | null
  maxBrands?: number | null
  maxLandingPages?: number | null
  entitlements: Record<string, boolean>
  isPublic: boolean
  isPopular: boolean
  isCustomPricing: boolean
  sortOrder: number
}

export async function upsertSubscriptionPlan(fields: PlanFormFields): Promise<SubscriptionPlan> {
  const { data, error } = await supabase
    .rpc('upsert_subscription_plan', {
      p_id: fields.id ?? null,
      p_slug: fields.slug,
      p_name: fields.name,
      p_description: fields.description ?? null,
      p_monthly_price: fields.monthlyPrice,
      p_annual_price: fields.annualPrice ?? null,
      p_currency_code: fields.currencyCode,
      p_trial_days: fields.trialDays,
      p_max_orders: fields.maxOrders ?? null,
      p_max_staff: fields.maxStaff ?? null,
      p_max_warehouses: fields.maxWarehouses ?? null,
      p_max_brands: fields.maxBrands ?? null,
      p_max_landing_pages: fields.maxLandingPages ?? null,
      p_entitlements: fields.entitlements,
      p_is_public: fields.isPublic,
      p_is_popular: fields.isPopular,
      p_is_custom_pricing: fields.isCustomPricing,
      p_sort_order: fields.sortOrder,
    })
    .single()
  if (error) throw error
  return data as SubscriptionPlan
}

export async function setPlanActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_subscription_plan_active', { p_id: id, p_is_active: isActive })
  if (error) throw error
}

export async function setPaymentMethodConfig(fields: {
  id?: string
  methodType?: PaymentMethodType
  displayLabel?: string
  isActive?: boolean
  sortOrder?: number
}): Promise<void> {
  const { error } = await supabase.rpc('set_payment_method_config', {
    p_id: fields.id ?? null,
    p_method_type: fields.methodType ?? null,
    p_display_label: fields.displayLabel ?? null,
    p_is_active: fields.isActive ?? null,
    p_sort_order: fields.sortOrder ?? null,
  })
  if (error) throw error
}

export async function setCryptoPaymentConfig(fields: {
  id?: string
  currencyCode?: string
  network?: string
  walletAddress?: string
  displayLabel?: string | null
  paymentInstructions?: string | null
  confirmationRequirements?: string | null
  isActive?: boolean
  sortOrder?: number
}): Promise<CryptoPaymentConfig> {
  const { data, error } = await supabase
    .rpc('set_crypto_payment_config', {
      p_id: fields.id ?? null,
      p_currency_code: fields.currencyCode ?? null,
      p_network: fields.network ?? null,
      p_wallet_address: fields.walletAddress ?? null,
      p_display_label: fields.displayLabel ?? null,
      p_payment_instructions: fields.paymentInstructions ?? null,
      p_confirmation_requirements: fields.confirmationRequirements ?? null,
      p_is_active: fields.isActive ?? null,
      p_sort_order: fields.sortOrder ?? null,
    })
    .single()
  if (error) throw error
  return data as CryptoPaymentConfig
}

export async function reviewTenantPayment(paymentId: string, decision: 'approve' | 'reject', reason?: string): Promise<TenantPayment> {
  const { data, error } = await supabase.rpc('review_tenant_payment', { p_payment_id: paymentId, p_decision: decision, p_reason: reason ?? null }).single()
  if (error) throw error
  return data as TenantPayment
}

// ---------- Platform-wide settings (homepage config) ----------

export async function fetchPlatformSetting(key: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.from('platform_settings').select('value').eq('key', key).maybeSingle()
  if (error) throw error
  return (data?.value as Record<string, unknown> | undefined) ?? null
}

export async function setPlatformSetting(key: string, value: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc('set_platform_setting', { p_key: key, p_value: value })
  if (error) throw error
}
