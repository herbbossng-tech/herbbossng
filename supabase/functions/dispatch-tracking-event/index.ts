// Supabase Edge Function: dispatch-tracking-event
//
// The actual server-side Meta CAPI / TikTok Events API HTTP dispatcher
// tracking_dispatch_log's own table comment (migration 0031) already
// names this function. It does NOT create a second tracking queue —
// it drains the one 0031/0032 already built, via the claim/record RPCs
// in migration 0032 (claim_tracking_dispatch_batch,
// record_tracking_dispatch_result), which are the ONLY functions this
// code calls with elevated privilege.
//
// Trigger: intended to be invoked periodically (e.g. every 1-2 minutes)
// by pg_cron + pg_net, Supabase's Scheduled Functions, or any external
// cron that can POST here with the shared secret below. It is NOT
// invoked by the browser or by any authenticated staff session.
//
// Required secrets (set via `supabase secrets set`):
//   SUPABASE_URL                — auto-provided by the Supabase runtime
//   SUPABASE_SERVICE_ROLE_KEY   — auto-provided by the Supabase runtime
//   CRON_CALLER_SECRET          — shared secret the scheduler sends as
//                                 the `x-cron-secret` header; this
//                                 function refuses any request without
//                                 a matching value so it cannot be
//                                 triggered by an arbitrary internet
//                                 caller even though its URL is public.
//
// This file has NOT been deployed or live-tested against the real Meta
// Graph API / TikTok Events API in this sandbox (no live Supabase
// project, no real Meta/TikTok credentials, no Edge Function deploy
// access) — see the Phase 11 report's Remaining Limitations section.
// The claim/record RPC contract and the failure-classification logic
// ARE tested locally (see supabase/functions/dispatch-tracking-event/*.test.ts).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { buildMetaPayload, buildTiktokPayload, classifyHttpResult, type ClaimedTrackingEvent } from './payloads.ts'

const BATCH_SIZE = 25
const META_API_VERSION = 'v21.0' // verify against https://developers.facebook.com/docs/graph-api/changelog before relying on this in production
const WORKER_ID = `dispatch-tracking-event:${crypto.randomUUID().slice(0, 8)}`

async function dispatchMeta(row: ClaimedTrackingEvent): Promise<{ status: number | null; body: unknown; errorMessage: string | null }> {
  if (!row.pixel_id || !row.access_token) {
    return { status: null, body: null, errorMessage: 'missing pixel_id/access_token at dispatch time' }
  }
  const payload = await buildMetaPayload(row)
  const url = `https://graph.facebook.com/${META_API_VERSION}/${row.pixel_id}/events?access_token=${encodeURIComponent(row.access_token)}`
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    const body = await res.json().catch(() => null)
    return { status: res.status, body, errorMessage: res.ok ? null : JSON.stringify(body)?.slice(0, 500) ?? `HTTP ${res.status}` }
  } catch (err) {
    return { status: null, body: null, errorMessage: err instanceof Error ? err.message : 'network error' }
  }
}

async function dispatchTiktok(row: ClaimedTrackingEvent): Promise<{ status: number | null; body: unknown; errorMessage: string | null }> {
  if (!row.pixel_id || !row.access_token) {
    return { status: null, body: null, errorMessage: 'missing pixel_id/access_token at dispatch time' }
  }
  const payload = await buildTiktokPayload(row)
  const url = 'https://business-api.tiktok.com/open_api/v1.3/event/track/' // verify against TikTok's current Events API docs before relying on this in production
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Access-Token': row.access_token },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => null)
    return { status: res.status, body, errorMessage: res.ok ? null : JSON.stringify(body)?.slice(0, 500) ?? `HTTP ${res.status}` }
  } catch (err) {
    return { status: null, body: null, errorMessage: err instanceof Error ? err.message : 'network error' }
  }
}

Deno.serve(async (req) => {
  const expectedSecret = Deno.env.get('CRON_CALLER_SECRET')
  if (!expectedSecret || req.headers.get('x-cron-secret') !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'server misconfigured: missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY' }), { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const { data: claimed, error: claimError } = await supabase.rpc('claim_tracking_dispatch_batch', {
    p_worker_id: WORKER_ID,
    p_limit: BATCH_SIZE,
  })
  if (claimError) {
    return new Response(JSON.stringify({ error: claimError.message }), { status: 500 })
  }

  const rows = (claimed ?? []) as ClaimedTrackingEvent[]
  let sent = 0
  let retried = 0
  let permanentlyFailed = 0

  for (const row of rows) {
    const result = row.provider === 'meta' ? await dispatchMeta(row) : await dispatchTiktok(row)
    const outcome = classifyHttpResult(result.status, result.errorMessage)

    // NEVER mark sent unless the provider call genuinely returned 2xx.
    const { error: recordError } = await supabase.rpc('record_tracking_dispatch_result', {
      p_id: row.id,
      p_success: outcome.success,
      p_provider_response: result.body ?? null,
      p_error_message: outcome.errorMessage,
      p_retryable: outcome.retryable,
      p_failure_category: outcome.failureCategory,
    })
    if (recordError) {
      // The row stays 'processing' and will be reclaimed as stuck after
      // 10 minutes (claim_tracking_dispatch_batch, 0032) — never
      // silently dropped.
      continue
    }
    if (outcome.success) sent++
    else if (outcome.retryable) retried++
    else permanentlyFailed++
  }

  return new Response(
    JSON.stringify({ claimed: rows.length, sent, retried, permanently_failed: permanentlyFailed }),
    { headers: { 'content-type': 'application/json' } },
  )
})
