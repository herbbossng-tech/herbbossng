import { supabase } from '@/lib/supabase'
import type {
  Affiliate,
  AffiliateCampaign,
  AffiliateCampaignAffiliate,
  AffiliateCampaignAsset,
  AffiliateCampaignProduct,
  AffiliateAccess,
  CampaignPerformanceRow,
  CampaignStatus,
  CommissionType,
  QualifyingEvent,
} from '@/types/database'

export interface CampaignFilters {
  search?: string
  status?: string | 'all'
}

export async function fetchCampaigns(workspaceId: string, brandId: string, filters: CampaignFilters = {}): Promise<AffiliateCampaign[]> {
  let query = supabase.from('affiliate_campaigns').select('*').eq('workspace_id', workspaceId).eq('brand_id', brandId).is('deleted_at', null)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.search) query = query.ilike('name', `%${filters.search}%`)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AffiliateCampaign[]
}

export async function fetchCampaign(id: string): Promise<AffiliateCampaign> {
  const { data, error } = await supabase.from('affiliate_campaigns').select('*').eq('id', id).single()
  if (error) throw error
  return data as AffiliateCampaign
}

export async function fetchCampaignProducts(campaignId: string): Promise<AffiliateCampaignProduct[]> {
  const { data, error } = await supabase.from('affiliate_campaign_products').select('*').eq('campaign_id', campaignId)
  if (error) throw error
  return (data ?? []) as AffiliateCampaignProduct[]
}

export async function fetchCampaignAffiliates(campaignId: string): Promise<AffiliateCampaignAffiliate[]> {
  const { data, error } = await supabase.from('affiliate_campaign_affiliates').select('*').eq('campaign_id', campaignId)
  if (error) throw error
  return (data ?? []) as AffiliateCampaignAffiliate[]
}

export async function fetchCampaignAssets(campaignId: string): Promise<AffiliateCampaignAsset[]> {
  const { data, error } = await supabase.from('affiliate_campaign_assets').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AffiliateCampaignAsset[]
}

export interface CampaignFormFields {
  name: string
  description?: string | null
  commission_type: CommissionType
  commission_value: number
  qualifying_event: QualifyingEvent
  affiliate_access: AffiliateAccess
  allowed_activities: string[]
  start_at?: string | null
  end_at?: string | null
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export async function createCampaign(workspaceId: string, brandId: string, fields: CampaignFormFields, userId: string): Promise<AffiliateCampaign> {
  const { data, error } = await supabase
    .from('affiliate_campaigns')
    .insert({ workspace_id: workspaceId, brand_id: brandId, slug: `${slugify(fields.name)}-${Date.now().toString(36)}`, created_by: userId, updated_by: userId, ...fields })
    .select('*')
    .single()
  if (error) throw error
  return data as AffiliateCampaign
}

export async function updateCampaign(id: string, fields: Partial<CampaignFormFields>, userId: string): Promise<AffiliateCampaign> {
  const { data, error } = await supabase
    .from('affiliate_campaigns')
    .update({ ...fields, updated_by: userId })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as AffiliateCampaign
}

export async function setCampaignStatus(id: string, status: CampaignStatus, userId: string): Promise<AffiliateCampaign> {
  const { data, error } = await supabase.from('affiliate_campaigns').update({ status, updated_by: userId }).eq('id', id).select('*').single()
  if (error) throw error
  return data as AffiliateCampaign
}

export async function setCampaignProducts(campaignId: string, productIds: string[], userId: string): Promise<void> {
  const { error: deleteError } = await supabase.from('affiliate_campaign_products').delete().eq('campaign_id', campaignId)
  if (deleteError) throw deleteError
  if (productIds.length === 0) return
  const { error } = await supabase
    .from('affiliate_campaign_products')
    .insert(productIds.map((product_id) => ({ campaign_id: campaignId, product_id, created_by: userId })))
  if (error) throw error
}

export async function setCampaignAffiliateRelationships(
  campaignId: string,
  relationship: 'ACCESS' | 'COMMISSION_EXCEPTION',
  affiliateIds: string[],
  userId: string,
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('affiliate_campaign_affiliates')
    .delete()
    .eq('campaign_id', campaignId)
    .eq('relationship', relationship)
  if (deleteError) throw deleteError
  if (affiliateIds.length === 0) return
  const { error } = await supabase
    .from('affiliate_campaign_affiliates')
    .insert(affiliateIds.map((affiliate_id) => ({ campaign_id: campaignId, affiliate_id, relationship, created_by: userId })))
  if (error) throw error
}

export async function fetchApprovedAffiliates(workspaceId: string): Promise<Affiliate[]> {
  const { data, error } = await supabase
    .from('affiliates')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('approval_status', 'approved')
    .is('deleted_at', null)
    .order('full_name')
  if (error) throw error
  return (data ?? []) as Affiliate[]
}

const ASSET_BUCKET = 'affiliates'

export async function uploadCampaignAsset(workspaceId: string, campaignId: string, file: File, userId: string): Promise<AffiliateCampaignAsset> {
  const filePath = `${workspaceId}/${campaignId}/${crypto.randomUUID()}-${file.name}`
  const { error: uploadError } = await supabase.storage.from(ASSET_BUCKET).upload(filePath, file, { cacheControl: '3600', upsert: false })
  if (uploadError) throw uploadError
  const { data, error } = await supabase
    .from('affiliate_campaign_assets')
    .insert({ campaign_id: campaignId, name: file.name, file_path: filePath, file_type: file.type, file_size: file.size, created_by: userId })
    .select('*')
    .single()
  if (error) throw error
  return data as AffiliateCampaignAsset
}

export async function getCampaignAssetSignedUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(ASSET_BUCKET).createSignedUrl(filePath, 3600)
  if (error) throw error
  return data.signedUrl
}

export async function deleteCampaignAsset(id: string): Promise<void> {
  const { error } = await supabase.from('affiliate_campaign_assets').delete().eq('id', id)
  if (error) throw error
}

export async function fetchCampaignPerformance(workspaceId: string, brandId: string | null): Promise<CampaignPerformanceRow[]> {
  const { data, error } = await supabase.rpc('get_campaign_performance', { p_workspace_id: workspaceId, p_brand_id: brandId })
  if (error) throw error
  return (data ?? []) as CampaignPerformanceRow[]
}
