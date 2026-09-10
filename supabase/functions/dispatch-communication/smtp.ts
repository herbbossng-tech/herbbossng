// Reference email adapter #2: raw SMTP (host/port/username/password),
// the generic alternative to Resend for a brand that wants to send
// through its own mail server/relay instead of a third-party email
// API (0050). Unlike every other adapter in this folder, SMTP is a
// stateful TCP/TLS protocol, not a plain HTTP call — so the client
// library (denomailer, the standard Deno-native SMTP client) is
// imported dynamically INSIDE dispatchSmtp(), after the validation
// guards below, rather than statically at the top of the file. That
// keeps this file loadable and its guards testable under plain
// Node/tsx exactly like twilio.ts/whatsapp.ts's tests (smtp.test.ts
// never reaches the dynamic import, since it only exercises the
// missing-field short-circuits — the same scope those adapters' tests
// cover, given none of them are live-tested against a real account in
// this sandbox either).

export interface SmtpRow {
  recipient: string | null
  subject: string | null
  body: string | null
  host: string | null
  port: number | null
  username: string | null
  password: string | null
  secure: boolean | null
  from_name: string | null
  from_address: string | null
}

export interface SmtpResult {
  status: number | null
  errorMessage: string | null
  providerMessageId: string | null
}

export async function dispatchSmtp(row: SmtpRow): Promise<SmtpResult> {
  if (!row.host || !row.username || !row.password || !row.recipient) {
    return { status: null, errorMessage: 'missing smtp host/username/password/recipient at dispatch time', providerMessageId: null }
  }

  const fromAddress = row.from_address ?? 'no-reply@example.com'
  const fromName = row.from_name ?? 'GCOS'

  try {
    const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts')
    const client = new SMTPClient({
      connection: {
        hostname: row.host,
        port: row.port ?? 587,
        tls: row.secure ?? false,
        auth: { username: row.username, password: row.password },
      },
    })
    await client.send({
      from: `${fromName} <${fromAddress}>`,
      to: row.recipient,
      subject: row.subject ?? '(no subject)',
      content: 'auto',
      html: row.body ?? '',
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
