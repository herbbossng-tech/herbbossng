import { supabase } from '@/lib/supabase'
import type { LandingPage, LandingPageEventType, LandingPagePackage, LandingPageSection, LandingPageSectionType, Order } from '@/types/database'

import { defaultConfigFor, starterSections } from './sectionTypes'
import type { LandingPageFilters, LandingPageListItem, LandingPageTemplate, PaginatedLandingPages } from './types'
import type { LandingPageFormOutput, PackageFormOutput } from './validation'

// --- Templates ---

/** System templates (workspace_id null) plus this workspace's own cloned/custom templates. */
export async function fetchLandingPageTemplates(workspaceId: string): Promise<LandingPageTemplate[]> {
  const { data, error } = await supabase
    .from('landing_page_templates')
    .select('*')
    .eq('status', 'active')
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .order('is_system', { ascending: false })
    .order('name')
  if (error) throw error
  return (data ?? []) as unknown as LandingPageTemplate[]
}

export async function cloneLandingPageTemplate(templateId: string, workspaceId: string, name: string): Promise<LandingPageTemplate> {
  const { data, error } = await supabase.rpc('clone_landing_page_template', {
    p_template_id: templateId,
    p_workspace_id: workspaceId,
    p_name: name,
  })
  if (error) throw error
  return data as unknown as LandingPageTemplate
}

export async function fetchLandingPages(
  workspaceId: string,
  brandId: string,
  filters: LandingPageFilters = {},
): Promise<PaginatedLandingPages> {
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? 25
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('landing_pages')
    .select('*, product:products(name)', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .eq('brand_id', brandId)
    .is('deleted_at', null)

  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,slug.ilike.%${filters.search}%`)
  }
  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  query = query.order('created_at', { ascending: false }).range(from, to)

  const { data, error, count } = await query
  if (error) throw error

  const pages = (data ?? []) as unknown as (LandingPage & { product: { name: string } | null })[]
  const pageIds = pages.map((p) => p.id)

  let orderCounts: Record<string, number> = {}
  if (pageIds.length > 0) {
    const { data: orderRows, error: orderError } = await supabase
      .from('orders')
      .select('landing_page_id')
      .in('landing_page_id', pageIds)
      .is('deleted_at', null)
    if (orderError) throw orderError
    orderCounts = (orderRows ?? []).reduce<Record<string, number>>((acc, row) => {
      const id = row.landing_page_id as string
      acc[id] = (acc[id] ?? 0) + 1
      return acc
    }, {})
  }

  const rows: LandingPageListItem[] = pages.map(({ product, ...page }) => ({
    ...page,
    product_name: product?.name ?? null,
    order_count: orderCounts[page.id] ?? 0,
  }))

  return { rows, totalCount: count ?? rows.length }
}

export async function fetchLandingPage(id: string): Promise<LandingPage> {
  const { data, error } = await supabase.from('landing_pages').select('*').eq('id', id).single()
  if (error) throw error
  return data as LandingPage
}

export async function fetchLandingPageBySlug(slug: string): Promise<LandingPage> {
  const { data, error } = await supabase.from('landing_pages').select('*').eq('slug', slug).eq('status', 'published').single()
  if (error) throw error
  return data as LandingPage
}

export async function fetchLandingPageSections(landingPageId: string): Promise<LandingPageSection[]> {
  const { data, error } = await supabase
    .from('landing_page_sections')
    .select('*')
    .eq('landing_page_id', landingPageId)
    .order('position', { ascending: true })
  if (error) throw error
  return (data ?? []) as LandingPageSection[]
}

/** Public-safe variant: only enabled sections, used by the anon renderer. */
export async function fetchPublicLandingPageSections(landingPageId: string): Promise<LandingPageSection[]> {
  const { data, error } = await supabase
    .from('landing_page_sections')
    .select('*')
    .eq('landing_page_id', landingPageId)
    .eq('enabled', true)
    .order('position', { ascending: true })
  if (error) throw error
  return (data ?? []) as LandingPageSection[]
}

export async function fetchLandingPagePackages(landingPageId: string): Promise<LandingPagePackage[]> {
  const { data, error } = await supabase
    .from('landing_page_packages')
    .select('*')
    .eq('landing_page_id', landingPageId)
    .order('position', { ascending: true })
  if (error) throw error
  return (data ?? []) as LandingPagePackage[]
}

export async function fetchPublicLandingPagePackages(landingPageId: string): Promise<LandingPagePackage[]> {
  const { data, error } = await supabase
    .from('landing_page_packages')
    .select('*')
    .eq('landing_page_id', landingPageId)
    .eq('enabled', true)
    .order('position', { ascending: true })
  if (error) throw error
  return (data ?? []) as LandingPagePackage[]
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Creates a minimal draft row, then seeds its starter sections — either
 * from a real landing_page_templates row (starter_sections, the
 * template engine path) or, when no template is selected, the legacy
 * pageType-based preset. A brand-new page is never published; status
 * defaults to 'draft' at the table level. market_country_code is only
 * sent when explicitly chosen — omitted, it falls back to the
 * workspace's own market via set_landing_page_market() (0021/0031),
 * exactly as before.
 */
export async function createLandingPage(
  workspaceId: string,
  brandId: string,
  input: LandingPageFormOutput,
  userId: string,
  template?: LandingPageTemplate,
): Promise<LandingPage> {
  const { data, error } = await supabase
    .from('landing_pages')
    .insert({
      workspace_id: workspaceId,
      brand_id: brandId,
      product_id: input.productId,
      name: input.name,
      slug: input.slug,
      page_type: input.pageType,
      template_id: template?.id ?? null,
      theme_config: template?.default_theme ?? {},
      market_country_code: input.marketCountryCode || null,
      created_by: userId,
      updated_by: userId,
    })
    .select('*')
    .single()
  if (error) throw error
  const page = data as LandingPage

  if (template && template.starter_sections.length > 0) {
    const { error: sectionsError } = await supabase.from('landing_page_sections').insert(
      template.starter_sections.map((s, index) => ({
        landing_page_id: page.id,
        workspace_id: workspaceId,
        brand_id: brandId,
        type: s.type,
        position: index,
        config: s.config ?? defaultConfigFor(s.type),
      })),
    )
    if (sectionsError) throw sectionsError
  } else {
    const sections = starterSections(input.pageType)
    const { error: sectionsError } = await supabase.from('landing_page_sections').insert(
      sections.map((type, index) => ({
        landing_page_id: page.id,
        workspace_id: workspaceId,
        brand_id: brandId,
        type,
        position: index,
        config: defaultConfigFor(type),
      })),
    )
    if (sectionsError) throw sectionsError
  }

  return page
}

export interface UpdateLandingPageFields {
  name?: string
  title?: string | null
  description?: string | null
  product_id?: string | null
  theme_config?: unknown
  seo_config?: unknown
  form_config?: unknown
  tracking_config?: unknown
  whatsapp_config?: unknown
  floating_cta_config?: unknown
  order_summary_enabled?: boolean
  status?: string
  published_at?: string | null
}

export async function updateLandingPage(id: string, fields: UpdateLandingPageFields, userId: string): Promise<LandingPage> {
  const { data, error } = await supabase
    .from('landing_pages')
    .update({ ...fields, updated_by: userId })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as LandingPage
}

export async function publishLandingPage(id: string, userId: string): Promise<LandingPage> {
  return updateLandingPage(id, { status: 'published', published_at: new Date().toISOString() }, userId)
}

export async function unpublishLandingPage(id: string, userId: string): Promise<LandingPage> {
  return updateLandingPage(id, { status: 'unpublished' }, userId)
}

export async function archiveLandingPage(id: string, userId: string): Promise<LandingPage> {
  return updateLandingPage(id, { status: 'archived' }, userId)
}

export async function deleteLandingPage(id: string): Promise<void> {
  const { error } = await supabase.from('landing_pages').delete().eq('id', id)
  if (error) throw error
}

/** Duplicates a page's own fields + all sections + all packages as a new, unpublished Draft with a safe unique slug. */
export async function duplicateLandingPage(page: LandingPage, userId: string): Promise<LandingPage> {
  const baseSlug = slugify(`${page.slug}-copy`)
  let slug = baseSlug
  let suffix = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { count, error } = await supabase.from('landing_pages').select('id', { count: 'exact', head: true }).eq('slug', slug).is('deleted_at', null)
    if (error) throw error
    if (!count) break
    suffix += 1
    slug = `${baseSlug}-${suffix}`
  }

  const { data: newPage, error: insertError } = await supabase
    .from('landing_pages')
    .insert({
      workspace_id: page.workspace_id,
      brand_id: page.brand_id,
      product_id: page.product_id,
      name: `${page.name} (Copy)`,
      slug,
      title: page.title,
      description: page.description,
      page_type: page.page_type,
      template_id: page.template_id,
      status: 'draft',
      theme_config: page.theme_config,
      seo_config: page.seo_config,
      form_config: page.form_config,
      // tracking_config is copied as public pixel-ID config, never secrets
      // (secrets live in landing_page_tracking_secrets, keyed off the NEW
      // page's own id — a duplicate starts with no CAPI/Events-API token
      // of its own and must be configured explicitly).
      tracking_config: page.tracking_config,
      whatsapp_config: page.whatsapp_config,
      floating_cta_config: page.floating_cta_config,
      order_summary_enabled: page.order_summary_enabled,
      // Explicit market_country_code so a duplicated per-market page
      // (e.g. "...— Kenya") keeps ITS OWN market rather than being
      // silently reset to the workspace default by
      // set_landing_page_market()'s insert trigger (0031 PART J).
      market_country_code: page.market_country_code,
      market_currency_code: page.market_currency_code,
      created_by: userId,
      updated_by: userId,
    })
    .select('*')
    .single()
  if (insertError) throw insertError
  const duplicated = newPage as LandingPage

  const [sections, packages] = await Promise.all([fetchLandingPageSections(page.id), fetchLandingPagePackages(page.id)])

  if (sections.length > 0) {
    const { error } = await supabase.from('landing_page_sections').insert(
      sections.map((s) => ({
        landing_page_id: duplicated.id,
        workspace_id: duplicated.workspace_id,
        brand_id: duplicated.brand_id,
        type: s.type,
        position: s.position,
        enabled: s.enabled,
        config: s.config,
      })),
    )
    if (error) throw error
  }

  if (packages.length > 0) {
    const { error } = await supabase.from('landing_page_packages').insert(
      packages.map((p) => ({
        landing_page_id: duplicated.id,
        workspace_id: duplicated.workspace_id,
        brand_id: duplicated.brand_id,
        name: p.name,
        quantity: p.quantity,
        price: p.price,
        compare_at_price: p.compare_at_price,
        badge: p.badge,
        savings_text: p.savings_text,
        offer_text: p.offer_text,
        shipping_rule: p.shipping_rule,
        position: p.position,
        enabled: p.enabled,
        is_default: p.is_default,
      })),
    )
    if (error) throw error
  }

  return duplicated
}

// --- Sections ---

export async function createSection(
  landingPageId: string,
  workspaceId: string,
  brandId: string,
  type: LandingPageSectionType,
  position: number,
): Promise<LandingPageSection> {
  const { data, error } = await supabase
    .from('landing_page_sections')
    .insert({ landing_page_id: landingPageId, workspace_id: workspaceId, brand_id: brandId, type, position, config: defaultConfigFor(type) })
    .select('*')
    .single()
  if (error) throw error
  return data as LandingPageSection
}

export async function updateSection(id: string, fields: Partial<Pick<LandingPageSection, 'config' | 'enabled' | 'position'>>): Promise<LandingPageSection> {
  const { data, error } = await supabase.from('landing_page_sections').update(fields).eq('id', id).select('*').single()
  if (error) throw error
  return data as LandingPageSection
}

export async function deleteSection(id: string): Promise<void> {
  const { error } = await supabase.from('landing_page_sections').delete().eq('id', id)
  if (error) throw error
}

export async function reorderSections(updates: { id: string; position: number }[]): Promise<void> {
  await Promise.all(updates.map((u) => supabase.from('landing_page_sections').update({ position: u.position }).eq('id', u.id)))
}

export async function duplicateSection(section: LandingPageSection): Promise<LandingPageSection> {
  const { data, error } = await supabase
    .from('landing_page_sections')
    .insert({
      landing_page_id: section.landing_page_id,
      workspace_id: section.workspace_id,
      brand_id: section.brand_id,
      type: section.type,
      position: section.position + 1,
      enabled: section.enabled,
      config: section.config,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as LandingPageSection
}

// --- Packages ---

function toShippingRule(input: PackageFormOutput) {
  if (input.shippingType === 'fixed') return { type: 'fixed', amount: input.shippingAmount }
  if (input.shippingType === 'by_state') {
    return {
      type: 'by_state',
      default: input.shippingDefault,
      rates: Object.fromEntries(input.shippingRates.filter((r) => r.state).map((r) => [r.state, r.amount])),
    }
  }
  return { type: 'free' }
}

export async function createPackage(
  landingPageId: string,
  workspaceId: string,
  brandId: string,
  input: PackageFormOutput,
  position: number,
): Promise<LandingPagePackage> {
  const { data, error } = await supabase
    .from('landing_page_packages')
    .insert({
      landing_page_id: landingPageId,
      workspace_id: workspaceId,
      brand_id: brandId,
      name: input.name,
      quantity: input.quantity,
      price: input.price,
      compare_at_price: input.compareAtPrice === '' || input.compareAtPrice === undefined ? null : input.compareAtPrice,
      badge: input.badge || null,
      savings_text: input.savingsText || null,
      offer_text: input.offerText || null,
      shipping_rule: toShippingRule(input),
      enabled: input.enabled,
      is_default: input.isDefault,
      position,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as LandingPagePackage
}

export async function updatePackage(id: string, input: PackageFormOutput): Promise<LandingPagePackage> {
  const { data, error } = await supabase
    .from('landing_page_packages')
    .update({
      name: input.name,
      quantity: input.quantity,
      price: input.price,
      compare_at_price: input.compareAtPrice === '' || input.compareAtPrice === undefined ? null : input.compareAtPrice,
      badge: input.badge || null,
      savings_text: input.savingsText || null,
      offer_text: input.offerText || null,
      shipping_rule: toShippingRule(input),
      enabled: input.enabled,
      is_default: input.isDefault,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as LandingPagePackage
}

export async function deletePackage(id: string): Promise<void> {
  const { error } = await supabase.from('landing_page_packages').delete().eq('id', id)
  if (error) throw error
}

export async function togglePackageEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from('landing_page_packages').update({ enabled }).eq('id', id)
  if (error) throw error
}

export async function reorderPackages(updates: { id: string; position: number }[]): Promise<void> {
  await Promise.all(updates.map((u) => supabase.from('landing_page_packages').update({ position: u.position }).eq('id', u.id)))
}

// --- Tracking config ---

export interface LandingPageTrackingStatus {
  meta_enabled: boolean
  meta_pixel_id: string | null
  meta_capi_configured: boolean
  meta_source: 'page' | 'brand' | 'none'
  tiktok_enabled: boolean
  tiktok_pixel_id: string | null
  tiktok_events_configured: boolean
  tiktok_source: 'page' | 'brand' | 'none'
}

/** Staff-facing: resolves page-override-then-brand-default and reports whether a CAPI/Events-API token exists — never the token itself. */
export async function fetchLandingPageTrackingStatus(landingPageId: string): Promise<LandingPageTrackingStatus> {
  const { data, error } = await supabase.rpc('get_landing_page_tracking_status', { p_landing_page_id: landingPageId })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as LandingPageTrackingStatus
  return row
}

export interface SetLandingPageTrackingInput {
  metaEnabled?: boolean
  metaPixelId?: string | null
  metaCapiAccessToken?: string | null
  metaCapiTestEventCode?: string | null
  tiktokEnabled?: boolean
  tiktokPixelId?: string | null
  tiktokAccessToken?: string | null
}

export async function setLandingPageTracking(landingPageId: string, input: SetLandingPageTrackingInput): Promise<LandingPage> {
  const { data, error } = await supabase.rpc('set_landing_page_tracking', {
    p_landing_page_id: landingPageId,
    p_meta_enabled: input.metaEnabled ?? null,
    p_meta_pixel_id: input.metaPixelId ?? null,
    p_meta_capi_access_token: input.metaCapiAccessToken ?? null,
    p_meta_capi_test_event_code: input.metaCapiTestEventCode ?? null,
    p_tiktok_enabled: input.tiktokEnabled ?? null,
    p_tiktok_pixel_id: input.tiktokPixelId ?? null,
    p_tiktok_access_token: input.tiktokAccessToken ?? null,
  })
  if (error) throw error
  return data as LandingPage
}

/** Anon-safe: only the public pixel IDs a browser needs to load fbq/ttq — no secrets, no "configured" flags. */
export async function fetchPublicLandingPageTracking(slug: string): Promise<{ meta_pixel_id: string | null; tiktok_pixel_id: string | null }> {
  const { data, error } = await supabase.rpc('get_landing_page_public_tracking', { p_landing_page_slug: slug })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as { meta_pixel_id: string | null; tiktok_pixel_id: string | null } | undefined
  return row ?? { meta_pixel_id: null, tiktok_pixel_id: null }
}

// --- Public (anon-safe) ---

export interface PublicOrderInput {
  packageId: string
  customerName: string
  customerPhone: string
  customerAddress: string
  customerState?: string
  customerCity?: string
  customerEmail?: string
  customerAddress2?: string
  landmark?: string
  customerNotes?: string
  submissionToken: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string
  /** Meta/TikTok click identifiers — attribution only, never treated as payment truth. */
  fbclid?: string
  ttclid?: string
  /** ?ref= affiliate referral code. Resolved server-side through the exact same rules as the internal create_order(); an unknown/expired code is silently ignored, never blocking checkout. */
  affiliateReferralCode?: string
}

/**
 * The only public order-creation path. Every price figure comes back
 * from create_public_order() itself, resolved server-side from
 * landing_page_packages — nothing here sends a price, subtotal, or
 * total to the server; there is nothing for a tampered client to
 * even attempt to override.
 */
export async function createPublicOrder(slug: string, input: PublicOrderInput): Promise<Order> {
  const { data, error } = await supabase.rpc('create_public_order', {
    p_landing_page_slug: slug,
    p_package_id: input.packageId,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_customer_address: input.customerAddress,
    p_customer_state: input.customerState || null,
    p_customer_city: input.customerCity || null,
    p_customer_email: input.customerEmail || null,
    p_customer_address_2: input.customerAddress2 || null,
    p_landmark: input.landmark || null,
    p_customer_notes: input.customerNotes || null,
    p_submission_token: input.submissionToken,
    p_utm_source: input.utmSource || null,
    p_utm_medium: input.utmMedium || null,
    p_utm_campaign: input.utmCampaign || null,
    p_utm_content: input.utmContent || null,
    p_utm_term: input.utmTerm || null,
    p_fbclid: input.fbclid || null,
    p_ttclid: input.ttclid || null,
    p_affiliate_referral_code: input.affiliateReferralCode || null,
  })
  if (error) throw error
  return data as Order
}

/** Best-effort analytics beacon — never throws, never blocks the page. */
export async function trackLandingPageEvent(
  slug: string,
  eventType: LandingPageEventType,
  sessionId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.rpc('track_landing_page_event', {
      p_landing_page_slug: slug,
      p_event_type: eventType,
      p_session_id: sessionId ?? null,
      p_metadata: metadata ?? {},
    })
  } catch {
    // Analytics is not allowed to break the page.
  }
}
