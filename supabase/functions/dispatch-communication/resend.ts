export interface ResendRow {
  recipient: string | null
  subject: string | null
  body: string | null
  api_key: string | null
  from_name: string | null
  from_address: string | null
}

export interface ResendPayload {
  from: string
  to: string[]
  subject: string
  html: string
}

/**
 * Builds the Resend API request body. The sender identity always comes
 * from the brand's OWN email_sender_name/email_sender_address
 * (brands table, 0002) — never a hardcoded address — falling back to a
 * generic placeholder only if a brand genuinely never set one.
 */
export function buildResendPayload(row: ResendRow): ResendPayload {
  const fromAddress = row.from_address ?? 'no-reply@example.com'
  const fromName = row.from_name ?? 'GCOS'
  return {
    from: `${fromName} <${fromAddress}>`,
    to: [row.recipient ?? ''],
    subject: row.subject ?? '(no subject)',
    html: row.body ?? '',
  }
}
