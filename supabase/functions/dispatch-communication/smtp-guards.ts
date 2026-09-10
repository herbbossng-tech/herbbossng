// Pure, dependency-free validation for the SMTP adapter (smtp.ts).
// Deliberately has zero imports so this file — and only this file —
// is what smtp.test.ts loads under plain Node/tsx. smtp.ts itself
// statically imports the real Deno-only SMTP client and can no
// longer be loaded outside Deno; see smtp.ts's header comment for why
// that split is required.

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

export type ValidSmtpRow = SmtpRow & { host: string; username: string; password: string; recipient: string }

export type SmtpValidation = { ok: true; row: ValidSmtpRow } | { ok: false; error: string }

export function validateSmtpRow(row: SmtpRow): SmtpValidation {
  if (!row.host || !row.username || !row.password || !row.recipient) {
    return { ok: false, error: 'missing smtp host/username/password/recipient at dispatch time' }
  }
  return { ok: true, row: row as ValidSmtpRow }
}
