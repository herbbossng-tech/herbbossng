// Supabase Edge Function: retry-external-ingestion
//
// Scheduled (cron-invoked) backoff-retry sweep for the
// external_order_ingestion_log queue (0053) — the omnichannel
// ingestion equivalent of dispatch-communication/dispatch-tracking-event.
// Claims 'failed' rows whose next_retry_at has passed (and any
// 'processing' row stuck for over 10 minutes from a crashed prior
// attempt) via claim_external_ingestion_retry_batch(), then reprocesses
// each one through process_external_order_ingestion() — the SAME
// pipeline function ingest_external_order() calls for a first attempt,
// operating entirely off the row's own already-stored input_customer/
// input_items (never re-fetches anything from Shopify/WooCommerce/
// Google Sheets).
//
// needs_review rows are intentionally NEVER touched by this sweep —
// they require a human product-mapping decision
// (upsert_external_product_mapping + retry_external_order_ingestion,
// both staff-facing RPCs), not an automatic retry.
//
// Required secrets: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-provided),
// CRON_CALLER_SECRET.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const BATCH_SIZE = 25
const WORKER_ID = `retry-external-ingestion:${crypto.randomUUID().slice(0, 8)}`

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

  const { data: claimedIds, error: claimError } = await supabase.rpc('claim_external_ingestion_retry_batch', {
    p_worker_id: WORKER_ID,
    p_limit: BATCH_SIZE,
  })
  if (claimError) {
    return new Response(JSON.stringify({ error: claimError.message }), { status: 500 })
  }

  const ids = (claimedIds ?? []) as string[]
  let ingested = 0
  let needsReview = 0
  let failed = 0
  let permanentlyFailed = 0

  for (const id of ids) {
    const { data: logRow, error: processError } = await supabase.rpc('process_external_order_ingestion', { p_log_id: id })
    if (processError) {
      failed++
      continue
    }
    switch (logRow.status) {
      case 'ingested':
        ingested++
        break
      case 'needs_review':
        needsReview++
        break
      case 'permanently_failed':
        permanentlyFailed++
        break
      default:
        failed++
    }
  }

  return new Response(
    JSON.stringify({ claimed: ids.length, ingested, needs_review: needsReview, failed, permanently_failed: permanentlyFailed }),
    { headers: { 'content-type': 'application/json' } },
  )
})
