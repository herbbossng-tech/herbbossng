// Supabase Edge Function: sync-google-sheets-orders
//
// Scheduled (cron-invoked) pull-based sync worker for the Google
// Sheets order source. Refreshes each connection's access token from
// its stored refresh_token (real OAuth — see google-oauth-callback),
// reads the configured sheet via the Sheets API, and hands every NEW
// row (beyond the connection's own sync_cursor.last_row checkpoint) to
// public.ingest_external_order() (0053) — the SAME shared pipeline
// every provider funnels through.
//
// Duplicate protection is layered: (1) sync_cursor.last_row means a
// row already processed is never re-read at all on a healthy run, and
// (2) even if a row WERE re-read (a worker crash before the cursor
// advances, a staff member manually re-running a row), the row's own
// mapped Order ID column (or a synthesic row-<n> key when no Order ID
// column is configured) becomes external_order_id, so
// ingest_external_order()'s own (connection_id, external_order_id)
// uniqueness is the final, authoritative backstop.
//
// Required secrets: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-provided),
// CRON_CALLER_SECRET, GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET
// (needed to refresh an expired access token).
//
// Not deployed or live-tested against a real Google Sheets spreadsheet
// in this sandbox — see the omnichannel ingestion report's Remaining
// Limitations. Column-mapping/row-normalization logic IS tested
// locally (external-ingestion.test.ts).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { normalizeGoogleSheetsRow, type GoogleColumnMapping } from '../_shared/external-ingestion.ts'

interface SheetsConnection {
  id: string
  google_refresh_token: string
  google_access_token: string | null
  google_access_token_expires_at: string | null
  google_spreadsheet_id: string
  google_sheet_name: string | null
  google_column_mapping: GoogleColumnMapping
  google_header_row: boolean
  sync_cursor: { last_row?: number } | null
}

async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<{ accessToken: string; expiresAt: string } | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.access_token) return null
  return { accessToken: body.access_token, expiresAt: new Date(Date.now() + Number(body.expires_in ?? 3600) * 1000).toISOString() }
}

Deno.serve(async (req) => {
  const expectedSecret = Deno.env.get('CRON_CALLER_SECRET')
  if (!expectedSecret || req.headers.get('x-cron-secret') !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'server misconfigured: missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET' }), { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const { data: connections, error: connError } = await supabase.rpc('list_active_external_connections', { p_provider: 'google_sheets' })
  if (connError) {
    return new Response(JSON.stringify({ error: connError.message }), { status: 500 })
  }

  const results: Array<{ connection_id: string; fetched: number; ingested: number; needs_review: number; skipped: number; failed: number; error?: string }> = []

  for (const conn of (connections ?? []) as SheetsConnection[]) {
    let fetched = 0
    let ingested = 0
    let needsReview = 0
    let skipped = 0
    let failed = 0
    let runError: string | null = null
    let lastRow = conn.sync_cursor?.last_row ?? 0

    try {
      let accessToken = conn.google_access_token
      const expiresAt = conn.google_access_token_expires_at ? new Date(conn.google_access_token_expires_at).getTime() : 0
      if (!accessToken || expiresAt < Date.now() + 60_000) {
        const refreshed = await refreshAccessToken(clientId, clientSecret, conn.google_refresh_token)
        if (!refreshed) throw new Error('failed to refresh Google access token — the connection may need to be reconnected')
        accessToken = refreshed.accessToken
        await supabase.rpc('set_google_sheets_oauth_tokens', {
          p_connection_id: conn.id,
          p_refresh_token: null,
          p_access_token: refreshed.accessToken,
          p_expires_at: refreshed.expiresAt,
        })
      }

      const range = conn.google_sheet_name ? `${conn.google_sheet_name}` : 'A:ZZ'
      const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(conn.google_spreadsheet_id)}/values/${encodeURIComponent(range)}`
      const res = await fetch(sheetsUrl, { headers: { authorization: `Bearer ${accessToken}` } })
      if (!res.ok) throw new Error(`Sheets API returned HTTP ${res.status}`)
      const body = (await res.json()) as { values?: string[][] }
      const allRows = body.values ?? []
      const headerRow = conn.google_header_row ? (allRows[0] ?? []) : Object.keys(conn.google_column_mapping)
      const dataRows = conn.google_header_row ? allRows.slice(1) : allRows

      for (let i = lastRow; i < dataRows.length; i++) {
        fetched++
        const rowIndex = conn.google_header_row ? i + 2 : i + 1 // 1-based sheet row number, accounting for the header row
        const normalized = normalizeGoogleSheetsRow(headerRow, dataRows[i], conn.google_column_mapping, rowIndex)
        if (!normalized) {
          skipped++
          continue
        }
        const { data: logRow, error: ingestError } = await supabase.rpc('ingest_external_order', {
          p_connection_id: conn.id,
          p_external_order_id: normalized.external_order_id,
          p_external_order_number: normalized.external_order_number,
          p_customer: normalized.customer,
          p_items: normalized.items,
          p_shipping_fee: normalized.shipping_fee,
          p_discount_amount: normalized.discount_amount,
          p_currency_code: normalized.currency_code,
          p_source_detail: 'Google Sheets',
          p_raw_payload: { row: dataRows[i], row_index: rowIndex },
        })
        if (ingestError) {
          failed++
          continue
        }
        if (logRow.status === 'ingested') ingested++
        else if (logRow.status === 'needs_review') needsReview++
        else failed++
      }

      lastRow = dataRows.length
    } catch (err) {
      runError = err instanceof Error ? err.message : 'sync error'
    }

    await supabase.rpc('update_external_connection_sync_cursor', {
      p_connection_id: conn.id,
      p_cursor: { last_row: lastRow },
      p_status: runError ? 'error' : 'connected',
      p_error: runError,
    })

    results.push({ connection_id: conn.id, fetched, ingested, needs_review: needsReview, skipped, failed, error: runError ?? undefined })
  }

  return new Response(JSON.stringify({ connections: results.length, results }), { headers: { 'content-type': 'application/json' } })
})
