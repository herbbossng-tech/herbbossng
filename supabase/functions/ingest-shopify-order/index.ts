// Supabase Edge Function: ingest-shopify-order
//
// Public webhook receiver for Shopify's orders/create and orders/paid
// topics. Register this URL in the connected store's custom/private
// app (Notifications settings or the Admin API webhooks endpoint) —
// Shopify POSTs here on every new order.
//
// Does NOT create a second order pipeline: after verifying the
// request is genuinely from the connected Shopify store, it normalizes
// the payload and calls public.ingest_external_order() (0053) — the
// SAME shared pipeline every provider funnels through. All of the
// customer-resolution/product-matching/inventory/duplicate-detection
// logic lives in that one SQL function, not here.
//
// Security:
//   1. The shop is identified via the X-Shopify-Shop-Domain header,
//      used ONLY to look up which connection's api_secret to verify
//      against (get_shopify_connection_by_domain) — never trusted for
//      anything else.
//   2. The request is REJECTED unless X-Shopify-Hmac-Sha256 verifies
//      against that connection's own api_secret, computed over the
//      RAW request body (see external-ingestion.ts's own comment on
//      why this must run before JSON.parse).
//   3. ingest_external_order() itself is idempotent on
//      (connection_id, external_order_id) — Shopify's own automatic
//      webhook retries on a non-2xx response are safe.
//
// Required secrets (set via `supabase secrets set`):
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — auto-provided
//
// Not deployed or live-tested against a real Shopify store in this
// sandbox (no live Supabase project, no Shopify dev store, no Edge
// Function deploy access) — see the omnichannel ingestion report's
// Remaining Limitations. The HMAC verification and payload
// normalization logic ARE tested locally (external-ingestion.test.ts).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { normalizeShopifyOrder, verifyShopifyHmac, type ShopifyOrderPayload } from '../_shared/external-ingestion.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 })
  }

  const shopDomain = req.headers.get('x-shopify-shop-domain')
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256')
  if (!shopDomain) {
    return new Response(JSON.stringify({ error: 'missing X-Shopify-Shop-Domain' }), { status: 400 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'server misconfigured: missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY' }), { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  // get_shopify_connection_by_domain() is declared to return a single
  // public.external_connections row (not setof) — PostgREST already
  // serializes that as one JSON object (or null), so no .single()/
  // .maybeSingle() modifier is needed or wanted here.
  const { data: connection, error: connError } = await supabase.rpc('get_shopify_connection_by_domain', { p_shop_domain: shopDomain })
  if (connError || !connection) {
    // Honest 404: either this shop was never connected, or its
    // connection was disconnected — never process an order for a shop
    // GCOS doesn't recognize.
    return new Response(JSON.stringify({ error: 'unknown or disconnected shop' }), { status: 404 })
  }

  const rawBody = await req.text()
  const verified = await verifyShopifyHmac(connection.shopify_api_secret, rawBody, hmacHeader)
  if (!verified) {
    return new Response(JSON.stringify({ error: 'invalid signature' }), { status: 401 })
  }

  let payload: ShopifyOrderPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON body' }), { status: 400 })
  }

  const normalized = normalizeShopifyOrder(payload)

  const { data: logRow, error: ingestError } = await supabase.rpc('ingest_external_order', {
    p_connection_id: connection.id,
    p_external_order_id: normalized.external_order_id,
    p_external_order_number: normalized.external_order_number,
    p_customer: normalized.customer,
    p_items: normalized.items,
    p_shipping_fee: normalized.shipping_fee,
    p_discount_amount: normalized.discount_amount,
    p_currency_code: normalized.currency_code,
    p_source_detail: 'Shopify',
    p_raw_payload: payload,
  })

  if (ingestError) {
    // A 500 here is exactly what makes Shopify retry the webhook later
    // with backoff — never swallow this as a 200.
    return new Response(JSON.stringify({ error: ingestError.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ status: logRow.status, order_id: logRow.order_id }), { headers: { 'content-type': 'application/json' } })
})
