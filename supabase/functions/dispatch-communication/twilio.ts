// Reference SMS adapter: Twilio's Messages API. This is ONE example
// adapter behind the generic channel/provider switch in index.ts — a
// future SMS provider is added the same way (a new file + one more
// `else if` branch), never by touching the queue/claim/record RPCs or
// the automation engine, which know nothing about "Twilio".
//
// Credential shape: brand_communication_secrets.sms_api_key stores
// "<AccountSid>:<AuthToken>" (Twilio requires both to authenticate;
// the existing schema has a single api_key column, so the combined
// value is documented here and in the Communication Settings UI
// rather than adding provider-specific columns to a table meant to
// stay provider-agnostic). sms_sender_id is the Twilio "From" number
// (E.164) or Messaging Service SID.

export interface TwilioRow {
  recipient: string | null
  body: string | null
  api_key: string | null
  sender_id: string | null
}

export interface TwilioResult {
  status: number | null
  body: unknown
  errorMessage: string | null
  providerMessageId: string | null
}

export async function dispatchTwilioSms(row: TwilioRow): Promise<TwilioResult> {
  if (!row.api_key || !row.recipient || !row.sender_id) {
    return { status: null, body: null, errorMessage: 'missing api_key/sender_id/recipient at dispatch time', providerMessageId: null }
  }
  const [accountSid, authToken] = row.api_key.split(':')
  if (!accountSid || !authToken) {
    return { status: null, body: null, errorMessage: 'sms_api_key must be "<AccountSid>:<AuthToken>"', providerMessageId: null }
  }

  const form = new URLSearchParams()
  form.set('To', row.recipient.startsWith('+') ? row.recipient : `+${row.recipient}`)
  form.set('From', row.sender_id)
  form.set('Body', row.body ?? '')

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      },
      body: form.toString(),
    })
    const body = await res.json().catch(() => null)
    const providerMessageId = res.ok && body && typeof body === 'object' ? ((body as { sid?: string }).sid ?? null) : null
    return { status: res.status, body, errorMessage: res.ok ? null : JSON.stringify(body)?.slice(0, 500) ?? `HTTP ${res.status}`, providerMessageId }
  } catch (err) {
    return { status: null, body: null, errorMessage: err instanceof Error ? err.message : 'network error', providerMessageId: null }
  }
}
