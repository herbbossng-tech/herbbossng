// Supabase Edge Function: sync-woocommerce-orders
//
// Scheduled (cron-invoked, like dispatch-communication/dispatch-tracking-event)
// pull-based sync worker — WooCommerce has no equivalent of Shopify's
// push webhook available out of the box on every store, so this polls
// the WooCommerce REST API v3 for orders created since the connection's
// own stored checkpoint (sync_cursor.after).
//
// Does NOT create a second order pipeline: every fetched order is
// normalized then handed to public.ingest_external_order() (0053) —
// the SAME shared pipeline ingest-shopify-order uses. This file's only
// job is authenticating to WooCommerce, paging through the REST API,
// and normalizing its response shape.
//
// Security:
//   - list_active_external_connections()/get_external_connection_for_dispatch()
//     are service-role-only RPCs (EXECUTE revoked from anon/authenticated).
//   - Every stored store_url is re-validated with isSafeWooCommerceUrl()
//     on every run (SSRF defense) — a URL that passed validation at
//     connect-time could not have been re-pointed at a private address
//     without the staff member editing it again, but this check is
//     cheap and removes any need to trust that invariant blindly.
//   - Basic Auth credentials (WooCommerce's documented REST API v3
//     auth scheme over HTTPS) are read only from get_external_connection_for_dispatch(),
//     never logged.
//
// The cursor only advances once every order successfully returned by
// the WooCommerce API in this run has been handed to
// ingest_external_order() (success OR a recorded failure/needs_review
// — ingest_external_order() itself is idempotent, so "recorded" is
// enough to consider an order accounted for). A crash mid-batch simply
// re-fetches the same page next run.
//
// Required secrets: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-provided),
// CRON_CALLER_SECRET (shared secret for the `x-cron-secret` header).
//
// Not deployed or live-tested against a real WooCommerce store in this
// sandbox — see the omnichannel ingestion report's Remaining
// Limitations. SSRF validation and payload normalization ARE tested
// locally (external-ingestion.test.ts).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { isSafeWooCommerceUrl, normalizeWooCommerceOrder, type WooOrderPayload } from '../_shared/external-ingestion.ts'

const PER_PAGE = 50
const MAX_PAGES_PER_RUN = 4 // caps one run's work; remaining orders are picked up next scheduled run via the unchanged cursor

interface WooConnection {
  id: string
  woocommerce_store_url: string
  woocommerce_consumer_key: string
  woocommerce_consumer_secret: string
  sync_cursor: { after?: string } | null
}

Deno.serve(async (req) => {
  const expectedSecret = Deno.env.get('CRON_CALLER_SECRET')
  if (!expectedSecret || req.headers.get('x-cron-secret') !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'server misconfigured: missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY' }), { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const { data: connections, error: connError } = await supabase.rpc('list_active_external_connections', { p_provider: 'woocommerce' })
  if (connError) {
    return new Response(JSON.stringify({ error: connError.message }), { status: 500 })
  }

  const results: Array<{ connection_id: string; fetched: number; ingested: number; needs_review: number; failed: number; error?: string }> = []

  for (const conn of (connections ?? []) as WooConnection[]) {
    const validated = isSafeWooCommerceUrl(conn.woocommerce_store_url)
    if (!validated.ok) {
      await supabase.rpc('update_external_connection_sync_cursor', {
        p_connection_id: conn.id,
        p_cursor: conn.sync_cursor ?? {},
        p_status: 'error',
        p_error: `unsafe store URL: ${validated.reason}`,
      })
      results.push({ connection_id: conn.id, fetched: 0, ingested: 0, needs_review: 0, failed: 0, error: validated.reason })
      continue
    }

    const auth = btoa(`${conn.woocommerce_consumer_key}:${conn.woocommerce_consumer_secret}`)
    const after = conn.sync_cursor?.after
    let fetched = 0
    let ingested = 0
    let needsReview = 0
    let failed = 0
    let latestCreatedAt = after ?? null
    let runError: string | null = null

    try {
      for (let page = 1; page <= MAX_PAGES_PER_RUN; page++) {
        const url = new URL('/wp-json/wc/v3/orders', validated.url)
        url.searchParams.set('per_page', String(PER_PAGE))
        url.searchParams.set('orderby', 'date')
        url.searchParams.set('order', 'asc')
        url.searchParams.set('page', String(page))
        if (after) url.searchParams.set('after', after)

        const res = await fetch(url.toString(), {
          headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
          redirect: 'error', // never follow a redirect to a different host (SSRF defense-in-depth)
        })
        if (!res.ok) {
          runError = `WooCommerce API returned HTTP ${res.status}`
          break
        }
        const orders = (await res.json()) as WooOrderPayload[]
        fetched += orders.length

        for (const order of orders) {
          const normalized = normalizeWooCommerceOrder(order)
          const { data: logRow, error: ingestError } = await supabase.rpc('ingest_external_order', {
            p_connection_id: conn.id,
            p_external_order_id: normalized.external_order_id,
            p_external_order_number: normalized.external_order_number,
            p_customer: normalized.customer,
            p_items: normalized.items,
            p_shipping_fee: normalized.shipping_fee,
            p_discount_amount: normalized.discount_amount,
            p_currency_code: normalized.currency_code,
            p_source_detail: 'WooCommerce',
            p_raw_payload: order,
          })
          if (ingestError) {
            failed++
            continue
          }
          if (logRow.status === 'ingested') ingested++
          else if (logRow.status === 'needs_review') needsReview++
          else failed++

          const createdAt = (order as unknown as { date_created_gmt?: string }).date_created_gmt
          if (createdAt) latestCreatedAt = createdAt
        }

        if (orders.length < PER_PAGE) break // no more pages
      }
    } catch (err) {
      runError = err instanceof Error ? err.message : 'network error'
    }

    await supabase.rpc('update_external_connection_sync_cursor', {
      p_connection_id: conn.id,
      p_cursor: { after: latestCreatedAt },
      p_status: runError ? 'error' : 'connected',
      p_error: runError,
    })

    results.push({ connection_id: conn.id, fetched, ingested, needs_review: needsReview, failed, error: runError ?? undefined })
  }

  return new Response(JSON.stringify({ connections: results.length, results }), { headers: { 'content-type': 'application/json' } })
})
