import { hashEmail, hashPhone } from '../_shared/hashing.ts'

/** One row returned by claim_tracking_dispatch_batch() (migration 0032). */
export interface ClaimedTrackingEvent {
  id: string
  provider: 'meta' | 'tiktok'
  event_type: string
  event_id: string
  attempts: number
  workspace_id: string
  brand_id: string
  landing_page_id: string | null
  order_id: string | null
  pixel_id: string | null
  access_token: string | null
  test_event_code: string | null
  landing_page_slug: string | null
  order_total: number | null
  order_currency: string | null
  customer_phone: string | null
  customer_email: string | null
  order_created_at: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  fbclid: string | null
  ttclid: string | null
}

/**
 * GCOS internal event_type -> the Meta/TikTok event name actually sent.
 * MUST stay in sync with src/features/landingPages/public/tracking.ts —
 * the browser fires the SAME name (as a standard or custom event) with
 * the SAME event_id derivation so Meta/TikTok can deduplicate the
 * browser Pixel copy against this server-side CAPI/Events API copy.
 * PURCHASE is the one true revenue event — see enqueue_order_tracking_events()
 * (0031): it is only ever enqueued on delivered+cash-collected, never on
 * order creation/confirmation, matching the existing Finance rule.
 */
const META_EVENT_NAMES: Record<string, string> = {
  PAGE_VIEW: 'PageView',
  VIEW_CONTENT: 'ViewContent',
  SELECT_PACKAGE: 'SelectPackage',
  INITIATE_CHECKOUT: 'InitiateCheckout',
  FORM_START: 'FormStart',
  ORDER_CREATED: 'SubmitApplication',
  ORDER_CONFIRMED: 'SubmitApplication',
  PURCHASE: 'Purchase',
  ORDER_CANCELLED: 'SubmitApplication',
}

const TIKTOK_EVENT_NAMES: Record<string, string> = {
  PAGE_VIEW: 'Browse',
  VIEW_CONTENT: 'ViewContent',
  SELECT_PACKAGE: 'AddToCart',
  INITIATE_CHECKOUT: 'InitiateCheckout',
  FORM_START: 'InitiateCheckout',
  ORDER_CREATED: 'SubmitForm',
  ORDER_CONFIRMED: 'SubmitForm',
  PURCHASE: 'CompletePayment',
  ORDER_CANCELLED: 'SubmitForm',
}

/** Meta standard events considered non-standard/custom by Meta must be sent via a "custom_events" style call in some SDKs; the Conversions API itself accepts any event_name string identically — no branching needed here. */
export function metaEventName(eventType: string): string {
  return META_EVENT_NAMES[eventType] ?? eventType
}

export function tiktokEventName(eventType: string): string {
  return TIKTOK_EVENT_NAMES[eventType] ?? eventType
}

export interface MetaCapiPayload {
  data: Array<{
    event_name: string
    event_time: number
    event_id: string
    action_source: 'website'
    event_source_url?: string
    user_data: Record<string, string[]>
    custom_data?: Record<string, unknown>
  }>
  test_event_code?: string
}

export async function buildMetaPayload(row: ClaimedTrackingEvent): Promise<MetaCapiPayload> {
  const userData: Record<string, string[]> = {}
  const hashedPhone = await hashPhone(row.customer_phone)
  const hashedEmail = await hashEmail(row.customer_email)
  if (hashedPhone) userData.ph = [hashedPhone]
  if (hashedEmail) userData.em = [hashedEmail]
  if (row.fbclid) userData.fbc = [`fb.1.${Date.now()}.${row.fbclid}`]

  const customData: Record<string, unknown> = {}
  if (row.order_total != null) customData.value = row.order_total
  if (row.order_currency) customData.currency = row.order_currency
  if (row.order_id) customData.order_id = row.order_id

  const eventTimeSeconds = row.order_created_at
    ? Math.floor(new Date(row.order_created_at).getTime() / 1000)
    : Math.floor(Date.now() / 1000)

  const payload: MetaCapiPayload = {
    data: [
      {
        event_name: metaEventName(row.event_type),
        event_time: eventTimeSeconds,
        event_id: row.event_id,
        action_source: 'website',
        event_source_url: row.landing_page_slug ? `https://example.com/l/${row.landing_page_slug}` : undefined,
        user_data: userData,
        custom_data: Object.keys(customData).length > 0 ? customData : undefined,
      },
    ],
  }
  if (row.test_event_code) payload.test_event_code = row.test_event_code
  return payload
}

export interface TiktokEventsApiPayload {
  event_source: 'web'
  event_source_id: string
  data: Array<{
    event: string
    event_time: number
    event_id: string
    user: Record<string, string[]>
    properties?: Record<string, unknown>
    page?: { url: string }
  }>
}

export async function buildTiktokPayload(row: ClaimedTrackingEvent): Promise<TiktokEventsApiPayload> {
  const user: Record<string, string[]> = {}
  const hashedPhone = await hashPhone(row.customer_phone)
  const hashedEmail = await hashEmail(row.customer_email)
  if (hashedPhone) user.phone_numbers = [hashedPhone]
  if (hashedEmail) user.emails = [hashedEmail]
  if (row.ttclid) user.ttclid = [row.ttclid]

  const properties: Record<string, unknown> = {}
  if (row.order_total != null) properties.value = row.order_total
  if (row.order_currency) properties.currency = row.order_currency
  if (row.order_id) properties.content_id = row.order_id

  const eventTimeSeconds = row.order_created_at
    ? Math.floor(new Date(row.order_created_at).getTime() / 1000)
    : Math.floor(Date.now() / 1000)

  return {
    event_source: 'web',
    event_source_id: row.pixel_id ?? '',
    data: [
      {
        event: tiktokEventName(row.event_type),
        event_time: eventTimeSeconds,
        event_id: row.event_id,
        user,
        properties: Object.keys(properties).length > 0 ? properties : undefined,
        page: row.landing_page_slug ? { url: `https://example.com/l/${row.landing_page_slug}` } : undefined,
      },
    ],
  }
}

export { classifyHttpResult, type DispatchOutcome, type FailureCategory } from '../_shared/http-classify.ts'
