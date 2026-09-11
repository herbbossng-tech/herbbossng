// Supabase Edge Function: activate-affiliate-portal-access
//
// The one step in affiliate portal login that plain SQL genuinely
// cannot do: creating an auth.users row WITH a password. Supabase
// manages auth.users itself — there is no supported way to insert a
// password-holding row via a plpgsql RPC, so this is the only place
// in the affiliate-portal flow that needs a real Edge Function instead
// of a SECURITY DEFINER RPC.
//
// Flow:
//   1. Staff calls create_affiliate_portal_setup_token(affiliate_id)
//      (RPC, 0056) and shares the returned raw token with the
//      affiliate directly (same manual-share convention as staff
//      invitations — see that table's own comment).
//   2. The affiliate opens /affiliate/setup-password?token=... and
//      submits a password. The frontend POSTs {token, password} here.
//   3. This function hashes the token the SAME way the RPC did
//      (sha256, hex) — never sees or trusts a client-supplied
//      affiliate id — looks up the still-valid, unused token row, and
//      uses the service-role admin API to create the auth.users row.
//   4. affiliates.auth_user_id/portal_access_enabled are set and the
//      token is marked used, both via the service-role client
//      (bypasses RLS entirely — that is expected here, this function
//      IS the trusted boundary for this one operation).
//   5. Returns { email } so the frontend can immediately call
//      supabase.auth.signInWithPassword({ email, password }) using its
//      own (anon-key) client and land the affiliate in their portal.
//
// Required secrets: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-provided).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  let body: { token?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid_json_body' }, 400)
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!token) {
    return jsonResponse({ error: 'missing_token' }, 400)
  }
  if (password.length < 8) {
    return jsonResponse({ error: 'password_too_short: minimum 8 characters' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'server_misconfigured: missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY' }, 500)
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const tokenHash = await sha256Hex(token)

  const { data: setupToken, error: tokenError } = await supabase
    .from('affiliate_portal_setup_tokens')
    .select('id, affiliate_id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (tokenError) {
    return jsonResponse({ error: tokenError.message }, 500)
  }
  if (!setupToken || setupToken.used_at || new Date(setupToken.expires_at).getTime() < Date.now()) {
    return jsonResponse({ error: 'invalid_or_expired_token' }, 400)
  }

  const { data: affiliate, error: affiliateError } = await supabase
    .from('affiliates')
    .select('id, email, auth_user_id, approval_status, status')
    .eq('id', setupToken.affiliate_id)
    .maybeSingle()

  if (affiliateError) {
    return jsonResponse({ error: affiliateError.message }, 500)
  }
  if (!affiliate || !affiliate.email) {
    return jsonResponse({ error: 'affiliate_has_no_email' }, 400)
  }
  if (affiliate.auth_user_id) {
    return jsonResponse({ error: 'portal_access_already_active' }, 409)
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: affiliate.email,
    password,
    email_confirm: true,
  })
  if (createError || !created?.user) {
    return jsonResponse({ error: createError?.message ?? 'failed_to_create_portal_account' }, 500)
  }

  const { error: linkError } = await supabase
    .from('affiliates')
    .update({ auth_user_id: created.user.id, portal_access_enabled: true })
    .eq('id', affiliate.id)
  if (linkError) {
    return jsonResponse({ error: linkError.message }, 500)
  }

  await supabase.from('affiliate_portal_setup_tokens').update({ used_at: new Date().toISOString() }).eq('id', setupToken.id)

  return jsonResponse({ email: affiliate.email }, 200)
})
