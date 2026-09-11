import { supabase } from '@/lib/supabase'
import type {
  LandingPageAnalyticsRow,
  MarketingCampaign,
  MarketingCampaignDetail,
  MarketingCampaignListRow,
  MarketingChannel,
  MarketingChannelPerformanceRow,
  MarketingMediaBuyerPerformanceRow,
  MarketingSummary,
  MarketingTrendPoint,
  ProductPerformanceRow,
} from '@/types/database'

export interface MarketingDateRange {
  dateFrom: string | null
  dateTo: string | null
}

export interface MarketingCampaignFilters extends MarketingDateRange {
  status?: string | 'all'
  channel?: string | 'all'
  search?: string
}

export async function fetchMarketingSummary(workspaceId: string, brandId: string, range: MarketingDateRange): Promise<MarketingSummary> {
  const { data, error } = await supabase
    .rpc('get_marketing_summary', { p_workspace_id: workspaceId, p_brand_id: brandId, p_date_from: range.dateFrom, p_date_to: range.dateTo })
    .single()
  if (error) throw error
  return data as MarketingSummary
}

export async function fetchMarketingCampaignList(
  workspaceId: string,
  brandId: string,
  filters: MarketingCampaignFilters,
): Promise<MarketingCampaignListRow[]> {
  const { data, error } = await supabase.rpc('get_marketing_campaign_list', {
    p_workspace_id: workspaceId,
    p_brand_id: brandId,
    p_date_from: filters.dateFrom,
    p_date_to: filters.dateTo,
    p_status: filters.status && filters.status !== 'all' ? filters.status : null,
    p_channel: filters.channel && filters.channel !== 'all' ? filters.channel : null,
    p_search: filters.search || null,
  })
  if (error) throw error
  return (data ?? []) as MarketingCampaignListRow[]
}

export async function fetchMarketingCampaignDetail(campaignId: string): Promise<MarketingCampaignDetail> {
  const { data, error } = await supabase.rpc('get_marketing_campaign_detail', { p_campaign_id: campaignId }).single()
  if (error) throw error
  return data as MarketingCampaignDetail
}

export async function fetchMarketingTrend(
  workspaceId: string,
  brandId: string,
  campaignId: string | null,
  range: MarketingDateRange,
): Promise<MarketingTrendPoint[]> {
  const { data, error } = await supabase.rpc('get_marketing_trend', {
    p_workspace_id: workspaceId,
    p_brand_id: brandId,
    p_campaign_id: campaignId,
    p_date_from: range.dateFrom,
    p_date_to: range.dateTo,
  })
  if (error) throw error
  return (data ?? []) as MarketingTrendPoint[]
}

export async function fetchMarketingChannelPerformance(
  workspaceId: string,
  brandId: string,
  range: MarketingDateRange,
): Promise<MarketingChannelPerformanceRow[]> {
  const { data, error } = await supabase.rpc('get_marketing_channel_performance', {
    p_workspace_id: workspaceId,
    p_brand_id: brandId,
    p_date_from: range.dateFrom,
    p_date_to: range.dateTo,
  })
  if (error) throw error
  return (data ?? []) as MarketingChannelPerformanceRow[]
}

export async function fetchMarketingMediaBuyerPerformance(
  workspaceId: string,
  brandId: string,
  range: MarketingDateRange,
): Promise<MarketingMediaBuyerPerformanceRow[]> {
  const { data, error } = await supabase.rpc('get_marketing_media_buyer_performance', {
    p_workspace_id: workspaceId,
    p_brand_id: brandId,
    p_date_from: range.dateFrom,
    p_date_to: range.dateTo,
  })
  if (error) throw error
  return (data ?? []) as MarketingMediaBuyerPerformanceRow[]
}

// Landing Page and Product performance reuse the EXISTING Finance/Analytics
// RPCs from Phase 9/10 (get_landing_page_analytics / get_product_performance)
// — Marketing never recomputes these, it only re-labels the same data as a
// marketing-lens tab so the numbers can never drift from Finance/Analytics.
export async function fetchMarketingLandingPagePerformance(
  workspaceId: string,
  brandId: string,
  range: MarketingDateRange,
  limit = 50,
): Promise<LandingPageAnalyticsRow[]> {
  const { data, error } = await supabase.rpc('get_landing_page_analytics', {
    p_workspace_id: workspaceId,
    p_brand_id: brandId || null,
    p_date_from: range.dateFrom,
    p_date_to: range.dateTo,
    p_limit: limit,
  })
  if (error) throw error
  return (data ?? []) as LandingPageAnalyticsRow[]
}

export async function fetchMarketingProductPerformance(
  workspaceId: string,
  brandId: string,
  range: MarketingDateRange,
  limit = 50,
): Promise<ProductPerformanceRow[]> {
  const { data, error } = await supabase.rpc('get_product_performance', {
    p_workspace_id: workspaceId,
    p_brand_id: brandId || null,
    p_date_from: range.dateFrom,
    p_date_to: range.dateTo,
    p_limit: limit,
  })
  if (error) throw error
  return (data ?? []) as ProductPerformanceRow[]
}

export interface MarketingCampaignFormFields {
  name: string
  description?: string | null
  channel: MarketingChannel
  source?: string | null
  objective?: string | null
  product_id?: string | null
  landing_page_id?: string | null
  affiliate_campaign_id?: string | null
  media_buyer_id?: string | null
  utm_campaign?: string | null
  external_campaign_id?: string | null
  start_date?: string | null
  end_date?: string | null
  budget_total?: number | null
  budget_daily?: number | null
  target_orders?: number | null
  target_delivered_orders?: number | null
  target_delivered_revenue?: number | null
  target_delivered_cpa?: number | null
  target_delivered_roas?: number | null
  target_delivery_rate_pct?: number | null
  notes?: string | null
}

export async function createMarketingCampaign(
  workspaceId: string,
  brandId: string,
  fields: MarketingCampaignFormFields,
  userId: string,
): Promise<MarketingCampaign> {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .insert({ workspace_id: workspaceId, brand_id: brandId, status: 'draft', created_by: userId, updated_by: userId, ...fields })
    .select('*')
    .single()
  if (error) throw error
  return data as MarketingCampaign
}

export async function updateMarketingCampaign(id: string, fields: Partial<MarketingCampaignFormFields>, userId: string): Promise<MarketingCampaign> {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .update({ ...fields, updated_by: userId })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as MarketingCampaign
}

export async function setMarketingCampaignStatus(id: string, status: MarketingCampaign['status'], userId: string): Promise<MarketingCampaign> {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .update({ status, updated_by: userId })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as MarketingCampaign
}

export async function archiveMarketingCampaign(id: string): Promise<void> {
  const { error } = await supabase.from('marketing_campaigns').delete().eq('id', id)
  if (error) throw error
}
