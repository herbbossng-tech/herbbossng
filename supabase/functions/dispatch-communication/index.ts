// Supabase Edge Function: dispatch-communication
//
// The real outbound send for the communication_log queue (0028,
// extended in 0032). Does NOT create a second SMS/WhatsApp/email
// system — it drains communication_log via claim_communication_log_batch()/
// record_communication_dispatch_result() (0032), the only functions
// this code calls with elevated privilege.
//
// Only 'email' (via Resend, the provider named in migration 0006's
// email_templates comment and .env.example) has a real adapter. No
// SMS or WhatsApp provider has been chosen anywhere in this codebase
// — those channels are never queued as 'queued' by
// execute_automation_action() while brand_communication_secrets has no
// provider set for them (see resolve_brand_communication_config_internal(),
// 0032), so claim_communication_log_batch() will not normally return
// them; the defensive branch below exists only so a future
// misconfiguration fails honestly (permanently_failed, not_configured)
// rather than crashing the batch.
//
// Trigger + secrets: identical pattern to dispatch-tracking-event
// (shared CRON_CALLER_SECRET header, SUPABASE_URL/SERVICE_ROLE_KEY
// auto-provided). Not deployed or live-tested in this sandbox — see
// the Phase 11 report.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { classifyHttpResult } from '../_shared/http-classify.ts'
import { buildResendPayload } from './resend.ts'

const BATCH_SIZE = 25
const WORKER_ID = `dispatch-communication:${crypto.randomUUID().slice(0, 8)}`

interface ClaimedCommunication {
  id: string
  channel: 'sms' | 'whatsapp' | 'email' | 'push'
  recipient: string | null
  subject: string | null
  body: string | null
  attempts: number
  workspace_id: string
  brand_id: string
  provider: string | null
  api_key: string | null
  sender_id: string | null
  from_name: string | null
  from_address: string | null
}

async function dispatchResend(row: ClaimedCommunication): Promise<{ status: number | null; body: unknown; errorMessage: string | null }> {
  if (!row.api_key || !row.recipient) {
    return { status: null, body: null, errorMessage: 'missing api_key/recipient at dispatch time' }
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${row.api_key}` },
      body: JSON.stringify(buildResendPayload(row)),
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

  const { data: claimed, error: claimError } = await supabase.rpc('claim_communication_log_batch', {
    p_worker_id: WORKER_ID,
    p_limit: BATCH_SIZE,
  })
  if (claimError) {
    return new Response(JSON.stringify({ error: claimError.message }), { status: 500 })
  }

  const rows = (claimed ?? []) as ClaimedCommunication[]
  let sent = 0
  let retried = 0
  let permanentlyFailed = 0

  for (const row of rows) {
    let result: { status: number | null; body: unknown; errorMessage: string | null }
    let providerMessageId: string | null = null

    if (row.channel === 'email' && row.provider === 'resend') {
      result = await dispatchResend(row)
      if (result.status && result.status >= 200 && result.status < 300 && result.body && typeof result.body === 'object') {
        providerMessageId = (result.body as { id?: string }).id ?? null
      }
    } else {
      // No adapter exists for this channel/provider combination —
      // honest permanent failure, never a fabricated send.
      result = { status: null, body: null, errorMessage: `no adapter for channel=${row.channel} provider=${row.provider ?? '(none)'}` }
    }

    const outcome = row.channel === 'email' && row.provider === 'resend'
      ? classifyHttpResult(result.status, result.errorMessage)
      : { success: false, retryable: false, failureCategory: 'not_configured' as const, errorMessage: result.errorMessage }

    const { error: recordError } = await supabase.rpc('record_communication_dispatch_result', {
      p_id: row.id,
      p_success: outcome.success,
      p_provider_message_id: providerMessageId,
      p_error_message: outcome.errorMessage,
      p_retryable: outcome.retryable,
      p_failure_category: outcome.failureCategory,
    })
    if (recordError) continue

    if (outcome.success) sent++
    else if (outcome.retryable) retried++
    else permanentlyFailed++
  }

  return new Response(
    JSON.stringify({ claimed: rows.length, sent, retried, permanently_failed: permanentlyFailed }),
    { headers: { 'content-type': 'application/json' } },
  )
})
