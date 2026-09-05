// Reference WhatsApp adapter: Meta's WhatsApp Business Cloud API.
// One example adapter behind the generic channel/provider switch in
// index.ts, exactly like resend.ts/twilio.ts — never permanently
// coupling GCOS to this vendor.
//
// Credential shape: brand_communication_secrets.whatsapp_api_key is
// the Cloud API permanent access token; whatsapp_phone_number_id is
// the sender's Phone Number ID from the Meta developer console.
//
// WhatsApp Business does NOT allow arbitrary free-form outbound
// messages outside a 24-hour customer-service window opened by the
// customer — a business-initiated message (an order confirmation, a
// delivery update sent without the customer having messaged first)
// normally requires a pre-approved message TEMPLATE. To represent
// that honestly without inventing a template management UI this
// phase does not need, a queued body of the exact form
// "TEMPLATE:<name>:<language_code>:<var1>|<var2>|..." is sent as a
// template message; any other body is sent as free-form text, which
// only succeeds if the provider's own 24-hour-window rule is
// satisfied — GCOS does not track that window itself, so the
// provider's own rejection (usually HTTP 400/401 with an explicit
// error code) is what classifies such an attempt, never a fabricated
// success.
export interface WhatsAppRow {
  recipient: string | null
  body: string | null
  api_key: string | null
  sender_id: string | null // phone_number_id, reusing the same generic column claim_communication_log_batch() already maps for this channel
}

export interface WhatsAppResult {
  status: number | null
  body: unknown
  errorMessage: string | null
  providerMessageId: string | null
}

export function buildWhatsAppPayload(row: WhatsAppRow): Record<string, unknown> {
  const to = row.recipient ?? ''
  const templateMatch = /^TEMPLATE:([^:]+):([^:]+):?(.*)$/.exec(row.body ?? '')
  if (templateMatch) {
    const [, name, language, varsRaw] = templateMatch
    const vars = varsRaw ? varsRaw.split('|') : []
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name,
        language: { code: language },
        components: vars.length > 0 ? [{ type: 'body', parameters: vars.map((text) => ({ type: 'text', text })) }] : [],
      },
    }
  }
  return { messaging_product: 'whatsapp', to, type: 'text', text: { body: row.body ?? '' } }
}

export async function dispatchWhatsApp(row: WhatsAppRow): Promise<WhatsAppResult> {
  if (!row.api_key || !row.recipient || !row.sender_id) {
    return { status: null, body: null, errorMessage: 'missing api_key/phone_number_id/recipient at dispatch time', providerMessageId: null }
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${row.sender_id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${row.api_key}` },
      body: JSON.stringify(buildWhatsAppPayload(row)),
    })
    const body = await res.json().catch(() => null)
    const providerMessageId =
      res.ok && body && typeof body === 'object' ? ((body as { messages?: { id?: string }[] }).messages?.[0]?.id ?? null) : null
    return { status: res.status, body, errorMessage: res.ok ? null : JSON.stringify(body)?.slice(0, 500) ?? `HTTP ${res.status}`, providerMessageId }
  } catch (err) {
    return { status: null, body: null, errorMessage: err instanceof Error ? err.message : 'network error', providerMessageId: null }
  }
}
