import { fetchPublicLandingPageTracking } from '@/features/landingPages/api'

/**
 * Browser-side conversion tracking runtime for the public renderer.
 * Templates/sections never touch fbq/ttq directly — they call these
 * functions, which resolve to whichever pixel ID(s) are configured for
 * THIS page (get_landing_page_public_tracking(), page-override → brand
 * default, 0031) and no-op entirely when nothing is configured.
 *
 * CRITICAL COD discipline: this module NEVER fires a "Purchase" event.
 * Creating a COD order is not realized revenue — only a delivered order
 * with cash collected is (see orders_enqueue_tracking_events(), 0031
 * PART G, which enqueues the one real PURCHASE-equivalent event
 * server-side, dispatched through Meta CAPI/TikTok Events API using
 * secrets that never reach the browser). The browser only ever sees
 * PageView/ViewContent/a custom SelectPackage/FormStart/OrderCreated —
 * none of which claim revenue.
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    _fbq?: unknown
    ttq?: {
      load: (pixelId: string) => void
      page: () => void
      track: (event: string, data?: Record<string, unknown>) => void
      instance?: (id: string) => unknown
    }
  }
}

let metaPixelId: string | null = null
let tiktokPixelId: string | null = null
let initialized = false

function loadMetaPixel(pixelId: string) {
  if (window.fbq) {
    window.fbq('init', pixelId)
    return
  }
  /* eslint-disable */
  ;(function (f: any, b: Document, e: string, v: string) {
    if (f.fbq) return
    const n: any = (f.fbq = function (...args: unknown[]) {
      n.callMethod ? n.callMethod(...args) : n.queue.push(args)
    })
    if (!f._fbq) f._fbq = n
    n.push = n
    n.loaded = true
    n.version = '2.0'
    n.queue = []
    const t = b.createElement(e) as HTMLScriptElement
    t.async = true
    t.src = v
    const s = b.getElementsByTagName(e)[0]
    s.parentNode?.insertBefore(t, s)
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
  /* eslint-enable */
  window.fbq?.('init', pixelId)
}

function loadTiktokPixel(pixelId: string) {
  if (window.ttq) {
    window.ttq.load(pixelId)
    window.ttq.page()
    return
  }
  /* eslint-disable */
  ;(function (w: any, d: Document, t: string) {
    w.TiktokAnalyticsObject = t
    const ttq = (w[t] = w[t] || [])
    ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'load']
    ttq.setAndDefer = function (obj: any, method: string) {
      obj[method] = function (...args: unknown[]) {
        obj.push([method, ...args])
      }
    }
    for (const m of ttq.methods) ttq.setAndDefer(ttq, m)
    ttq.load = function (pid: string) {
      const script = d.createElement('script')
      script.type = 'text/javascript'
      script.async = true
      script.src = 'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' + pid
      const s = d.getElementsByTagName('script')[0]
      s.parentNode?.insertBefore(script, s)
    }
  })(window, document, 'ttq')
  /* eslint-enable */
  window.ttq?.load(pixelId)
  window.ttq?.page()
}

/** Call once per page load, before any fire* call. Safe to call multiple times — only initializes once. */
export async function initTrackingRuntime(slug: string): Promise<void> {
  if (initialized) return
  initialized = true
  try {
    const status = await fetchPublicLandingPageTracking(slug)
    metaPixelId = status.meta_pixel_id
    tiktokPixelId = status.tiktok_pixel_id
    if (metaPixelId) loadMetaPixel(metaPixelId)
    if (tiktokPixelId) loadTiktokPixel(tiktokPixelId)
  } catch {
    // Tracking is never allowed to break the page.
  }
}

function fireMeta(event: string, data?: Record<string, unknown>, custom = false) {
  if (!metaPixelId || !window.fbq) return
  try {
    window.fbq(custom ? 'trackCustom' : 'track', event, data ?? {})
  } catch {
    // never throw from tracking
  }
}

function fireTiktok(event: string, data?: Record<string, unknown>) {
  if (!tiktokPixelId || !window.ttq) return
  try {
    window.ttq.track(event, data ?? {})
  } catch {
    // never throw from tracking
  }
}

export function firePixelPageView(): void {
  fireMeta('PageView')
  fireTiktok('Browse')
}

export function firePixelViewContent(data: { productName?: string; currency?: string | null; value?: number }): void {
  fireMeta('ViewContent', { content_name: data.productName, currency: data.currency ?? undefined, value: data.value })
  fireTiktok('ViewContent', { content_name: data.productName, currency: data.currency ?? undefined, value: data.value })
}

export function firePixelSelectPackage(data: { packageName?: string; currency?: string | null; value?: number }): void {
  fireMeta('SelectPackage', { content_name: data.packageName, currency: data.currency ?? undefined, value: data.value }, true)
  fireTiktok('AddToCart', { content_name: data.packageName, currency: data.currency ?? undefined, value: data.value })
}

export function firePixelFormStart(): void {
  fireMeta('FormStart', {}, true)
  fireTiktok('InitiateCheckout')
}

/**
 * Fired the moment a COD order is CREATED — deliberately NOT a
 * "Purchase"/revenue event (see module comment). event_id matches the
 * dedup key the server-side ORDER_CREATED dispatch uses
 * (order_id + event_type, see enqueue_tracking_event() 0031) so Meta/
 * TikTok can deduplicate this browser copy against the CAPI/Events API
 * copy once a real dispatcher sends it — the id is included on both
 * sides even though this browser event has no CAPI counterpart today.
 */
export function firePixelOrderCreated(data: { orderId: string; currency?: string | null; value?: number }): void {
  const eventId = `${data.orderId}:ORDER_CREATED`
  fireMeta('SubmitApplication', { currency: data.currency ?? undefined, value: data.value, eventID: eventId }, true)
  fireTiktok('SubmitForm', { currency: data.currency ?? undefined, value: data.value, event_id: eventId })
}
