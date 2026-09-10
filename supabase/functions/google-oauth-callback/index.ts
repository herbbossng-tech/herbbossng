// Supabase Edge Function: google-oauth-callback
//
// The redirect target for Google's OAuth 2.0 authorization-code flow —
// this is what makes Google Sheets a REAL OAuth connection rather than
// a pasted access token (access tokens expire in ~1 hour; the
// refresh_token this exchange returns is the credential that actually
// matters, and it never passes through the browser or a form field).
//
// Flow:
//   1. The frontend (BrandDetailPage's Google Sheets connect button)
//      first calls upsert_external_connection(brand_id, 'google_sheets')
//      to get a connection_id, then redirects the browser directly to
//      accounts.google.com's consent screen with
//      state=<connection_id>&redirect_uri=<this function's URL>
//      &access_type=offline&prompt=consent (client_id is not secret —
//      it's embedded in the built frontend as VITE_GOOGLE_OAUTH_CLIENT_ID,
//      exactly like Meta/TikTok pixel ids are public-by-design).
//   2. Google redirects the browser back HERE with ?code=...&state=<connection_id>.
//   3. This function exchanges the code for tokens (client_secret used
//      ONLY here, server-side, never shipped to the browser) and stores
//      them via set_google_sheets_oauth_tokens() (service-role-only RPC).
//   4. Redirects the browser back to the app with a success/failure flag.
//
// Required secrets (set via `supabase secrets set`):
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — auto-provided
//   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET — from the
//     Google Cloud project's OAuth 2.0 Client (Web application type)
//   APP_BASE_URL — the deployed frontend origin to redirect back to
//     (e.g. https://app.example.com); the user lands back on
//     /brands/:id (brand_id resolved server-side from the connection)
//
// Not deployed or live-tested against a real Google Cloud OAuth client
// in this sandbox — see the omnichannel ingestion report's Remaining
// Limitations. This function's own logic has no independently testable
// pure-logic core (it is entirely OAuth token exchange + one RPC call),
// so it is exercised via the SQL-level test suite (129) at the
// set_google_sheets_oauth_tokens() RPC boundary instead.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const connectionId = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')

  const appBaseUrl = Deno.env.get('APP_BASE_URL') ?? ''
  const redirectTo = (status: 'success' | 'error', message?: string) => {
    const target = new URL('/settings/integrations', appBaseUrl || url.origin)
    target.searchParams.set('google_sheets', status)
    if (message) target.searchParams.set('message', message)
    return Response.redirect(target.toString(), 302)
  }

  if (oauthError) {
    return redirectTo('error', oauthError)
  }
  if (!code || !connectionId) {
    return redirectTo('error', 'missing_code_or_state')
  }

  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!clientId || !clientSecret || !supabaseUrl || !serviceRoleKey) {
    return redirectTo('error', 'server_misconfigured')
  }

  const redirectUri = `${url.origin}${url.pathname}`
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const tokenBody = await tokenRes.json().catch(() => null)
  if (!tokenRes.ok || !tokenBody?.access_token) {
    return redirectTo('error', 'token_exchange_failed')
  }

  const expiresAt = new Date(Date.now() + (Number(tokenBody.expires_in ?? 3600) * 1000)).toISOString()
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { error: setError } = await supabase.rpc('set_google_sheets_oauth_tokens', {
    p_connection_id: connectionId,
    p_refresh_token: tokenBody.refresh_token ?? null,
    p_access_token: tokenBody.access_token,
    p_expires_at: expiresAt,
  })
  if (setError) {
    return redirectTo('error', 'store_tokens_failed')
  }

  // Google only returns a refresh_token on the FIRST consent for a
  // given client+scope+account unless the user is forced through
  // prompt=consent again — if a reconnect ever comes back with none,
  // the frontend flow correctly always requests prompt=consent so this
  // should not happen in practice, but the connection is still usable
  // as long as ANY refresh_token was stored previously (this RPC keeps
  // the prior one when p_refresh_token is null).
  return redirectTo('success')
})
