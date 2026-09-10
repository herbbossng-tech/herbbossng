// Reference email adapter #2: raw SMTP (host/port/username/password),
// the generic alternative to Resend for a brand that wants to send
// through its own mail server/relay instead of a third-party email
// API (0050).
//
// denomailer (the standard Deno-native SMTP client) is imported
// STATICALLY at the top of this file, not dynamically inside
// dispatchSmtp() as an earlier version of this file did. That earlier
// version used a dynamic import specifically so the file stayed
// loadable under plain Node/tsx for local unit tests — but Supabase
// Edge Functions resolve and bundle dependencies at DEPLOY time; a
// dynamic import() of a URL that isn't part of the static import
// graph is not reliably fetchable at request time in the deployed
// sandbox. That almost certainly meant every real SMTP send failed
// once deployed, regardless of how correct the brand's host/port/
// credentials were — a real, shipped bug, not a configuration issue.
//
// The fix: validation logic (the only part smtp.test.ts can exercise
// without a live SMTP connection) is factored into smtp-guards.ts,
// which has zero imports and is what the test file loads under Node.
// This file is Deno-only from now on and is never loaded by the test.
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import { validateSmtpRow, type SmtpRow } from './smtp-guards.ts'

export type { SmtpRow }

export interface SmtpResult {
  status: number | null
  errorMessage: string | null
  providerMessageId: string | null
}

export async function dispatchSmtp(row: SmtpRow): Promise<SmtpResult> {
  const validation = validateSmtpRow(row)
  if (!validation.ok) {
    return { status: null, errorMessage: validation.error, providerMessageId: null }
  }
  const validRow = validation.row

  const fromAddress = validRow.from_address ?? 'no-reply@example.com'
  const fromName = validRow.from_name ?? 'GCOS'

  try {
    const client = new SMTPClient({
      connection: {
        hostname: validRow.host,
        port: validRow.port ?? 587,
        tls: validRow.secure ?? false,
        auth: { username: validRow.username, password: validRow.password },
      },
    })
    await client.send({
      from: `${fromName} <${fromAddress}>`,
      to: validRow.recipient,
      subject: validRow.subject ?? '(no subject)',
      content: 'auto',
      html: validRow.body ?? '',
    })
    await client.close()
    // denomailer's send() does not surface a provider message id (SMTP
    // has no equivalent of Resend's/Twilio's response id) — resolving
    // without throwing is the only success signal the protocol gives.
    return { status: 200, errorMessage: null, providerMessageId: null }
  } catch (err) {
    return { status: null, errorMessage: err instanceof Error ? err.message : 'smtp send error', providerMessageId: null }
  }
}
