import { supabase } from '@/lib/supabase'
import { supabaseAffiliate } from '@/lib/supabaseAffiliate'
import type {
  Affiliate,
  AffiliateCampaign,
  AffiliateCampaignAsset,
  AffiliateDashboard,
  AffiliateOrderForm,
  AffiliateOrderFormAddon,
  AffiliateOrderFormPackage,
  AffiliateOrderFormSubmission,
  AffiliateOrderFormWithStats,
  AffiliateOrderSummary,
  PublicAffiliateOrderForm,
} from '@/types/database'

export interface OrderFormPackageInput {
  name: string
  quantity: number
  price: number
  compare_at_price?: number | null
  badge?: string | null
  shipping_rule?: { type: 'free' } | { type: 'fixed'; amount: number }
  is_default?: boolean
}

export interface OrderFormAddonInput {
  name: string
  price: number
}

// ---- Authenticated affiliate-portal calls (supabaseAffiliate client) ----

export async function fetchMyDashboard(dateFrom?: string | null, dateTo?: string | null): Promise<AffiliateDashboard> {
  const { data, error } = await supabaseAffiliate
    .rpc('get_my_affiliate_dashboard', { p_date_from: dateFrom ?? null, p_date_to: dateTo ?? null })
    .single()
  if (error) throw error
  return data as AffiliateDashboard
}

export async function fetchMyAvailableCampaigns(): Promise<AffiliateCampaign[]> {
  const { data, error } = await supabaseAffiliate.from('affiliate_campaigns').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AffiliateCampaign[]
}

export async function fetchCampaign(campaignId: string): Promise<AffiliateCampaign> {
  const { data, error } = await supabaseAffiliate.from('affiliate_campaigns').select('*').eq('id', campaignId).single()
  if (error) throw error
  return data as AffiliateCampaign
}

export async function fetchCampaignAssets(campaignId: string): Promise<AffiliateCampaignAsset[]> {
  const { data, error } = await supabaseAffiliate.from('affiliate_campaign_assets').select('*').eq('campaign_id', campaignId)
  if (error) throw error
  return (data ?? []) as AffiliateCampaignAsset[]
}

export async function getCampaignAssetSignedUrl(filePath: string): Promise<string> {
  const { data, error } = await supabaseAffiliate.storage.from('affiliates').createSignedUrl(filePath, 3600)
  if (error) throw error
  return data.signedUrl
}

export async function fetchCampaignProductIds(campaignId: string): Promise<string[]> {
  const { data, error } = await supabaseAffiliate.from('affiliate_campaign_products').select('product_id').eq('campaign_id', campaignId)
  if (error) throw error
  return (data ?? []).map((row) => row.product_id as string)
}

export async function fetchCampaignProducts(campaignId: string) {
  const productIds = await fetchCampaignProductIds(campaignId)
  if (productIds.length === 0) return []
  const { data, error } = await supabaseAffiliate
    .from('products')
    .select('id, name, selling_price, compare_price, track_inventory, stock_quantity')
    .in('id', productIds)
  if (error) throw error
  return data ?? []
}

export async function fetchMyOrderFormsWithStats(): Promise<AffiliateOrderFormWithStats[]> {
  const { data, error } = await supabaseAffiliate.rpc('get_my_order_forms_with_stats')
  if (error) throw error
  return (data ?? []) as AffiliateOrderFormWithStats[]
}

export async function fetchMyOrderFormSubmissions(formId: string, limit = 50, offset = 0): Promise<AffiliateOrderFormSubmission[]> {
  const { data, error } = await supabaseAffiliate.rpc('get_my_order_form_submissions', {
    p_form_id: formId,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return (data ?? []) as AffiliateOrderFormSubmission[]
}

export async function fetchMyAffiliateOrders(status?: string | null, limit = 20, offset = 0): Promise<AffiliateOrderSummary[]> {
  const { data, error } = await supabaseAffiliate.rpc('get_my_affiliate_orders', {
    p_status: status ?? null,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return (data ?? []) as AffiliateOrderSummary[]
}

export async function fetchOrderFormPackages(orderFormId: string): Promise<AffiliateOrderFormPackage[]> {
  const { data, error } = await supabaseAffiliate
    .from('affiliate_order_form_packages')
    .select('*')
    .eq('order_form_id', orderFormId)
    .order('position', { ascending: true })
  if (error) throw error
  return (data ?? []) as AffiliateOrderFormPackage[]
}

export async function fetchOrderFormAddons(orderFormId: string): Promise<AffiliateOrderFormAddon[]> {
  const { data, error } = await supabaseAffiliate
    .from('affiliate_order_form_addons')
    .select('*')
    .eq('order_form_id', orderFormId)
    .order('position', { ascending: true })
  if (error) throw error
  return (data ?? []) as AffiliateOrderFormAddon[]
}

export async function createMyOrderForm(input: {
  campaignId: string
  productId: string
  internalTitle: string
  packages: OrderFormPackageInput[]
  addons?: OrderFormAddonInput[]
}): Promise<AffiliateOrderForm> {
  const { data, error } = await supabaseAffiliate.rpc('create_affiliate_order_form', {
    p_campaign_id: input.campaignId,
    p_product_id: input.productId,
    p_internal_title: input.internalTitle,
    p_packages: input.packages,
    p_addons: input.addons ?? [],
  })
  if (error) throw error
  return data as AffiliateOrderForm
}

export async function updateMyOrderForm(input: {
  formId: string
  internalTitle: string
  packages?: OrderFormPackageInput[] | null
  addons?: OrderFormAddonInput[] | null
  status?: 'ACTIVE' | 'ARCHIVED'
}): Promise<AffiliateOrderForm> {
  const { data, error } = await supabaseAffiliate.rpc('update_affiliate_order_form', {
    p_form_id: input.formId,
    p_internal_title: input.internalTitle,
    p_packages: input.packages ?? null,
    p_status: input.status ?? 'ACTIVE',
    p_addons: input.addons ?? null,
  })
  if (error) throw error
  return data as AffiliateOrderForm
}

export async function archiveMyOrderForm(formId: string, internalTitle: string): Promise<void> {
  const { error } = await supabaseAffiliate.rpc('update_affiliate_order_form', {
    p_form_id: formId,
    p_internal_title: internalTitle,
    p_packages: null,
    p_status: 'ARCHIVED',
  })
  if (error) throw error
}

export async function getMyAffiliateProfile(): Promise<Affiliate | null> {
  const { data, error } = await supabaseAffiliate.from('affiliates').select('*').maybeSingle()
  if (error) throw error
  return (data as Affiliate | null) ?? null
}

// ---- Public, anonymous calls (main supabase client — same as landing pages) ----

export async function fetchPublicOrderForm(formId: string): Promise<PublicAffiliateOrderForm | null> {
  const { data, error } = await supabase.rpc('get_public_affiliate_order_form', { p_form_id: formId })
  if (error) throw error
  const rows = (data ?? []) as PublicAffiliateOrderForm[]
  return rows[0] ?? null
}

// Fire-and-forget analytics ping — a failed view count must never block rendering the form.
export async function recordPublicOrderFormView(formId: string): Promise<void> {
  await supabase.rpc('record_affiliate_order_form_view', { p_form_id: formId })
}

export interface PublicAffiliateOrderInput {
  formId: string
  packageId: string
  customerName: string
  customerPhone: string
  customerAddress: string
  customerState: string
  customerCity: string
  customerEmail?: string
  customerAddress2?: string
  landmark?: string
  customerNotes?: string
  submissionToken: string
  addonIds?: string[]
}

export async function submitPublicAffiliateOrder(input: PublicAffiliateOrderInput) {
  const { data, error } = await supabase.rpc('create_affiliate_order_form_order', {
    p_form_id: input.formId,
    p_package_id: input.packageId,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_customer_address: input.customerAddress,
    p_customer_state: input.customerState,
    p_customer_city: input.customerCity,
    p_customer_email: input.customerEmail || null,
    p_customer_address_2: input.customerAddress2 || null,
    p_landmark: input.landmark || null,
    p_customer_notes: input.customerNotes || null,
    p_submission_token: input.submissionToken,
    p_addon_ids: input.addonIds ?? [],
  })
  if (error) throw error
  return data
}

export function getProductImageUrl(filePath: string): string {
  return supabase.storage.from('products').getPublicUrl(filePath).data.publicUrl
}
