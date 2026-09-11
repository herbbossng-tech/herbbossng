// Meta CAPI (and TikTok Events API) require certain user_data fields to
// be sent as lowercase, SHA-256 hex digests — never plaintext PII.
// https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Normalizes then hashes an email per Meta's documented convention: lowercase, trimmed. */
export async function hashEmail(email: string | null | undefined): Promise<string | null> {
  if (!email) return null
  return sha256Hex(email.trim().toLowerCase())
}

/**
 * Normalizes then hashes a phone number per Meta's documented convention:
 * digits only, E.164 (country code, no leading +/00/spaces). GCOS phone
 * numbers are already stored/normalized with a leading '+' by
 * normalize_phone() (see the orders schema) — this just strips
 * non-digits before hashing, it does not re-derive the country code.
 */
export async function hashPhone(phone: string | null | undefined): Promise<string | null> {
  if (!phone) return null
  const digitsOnly = phone.replace(/[^0-9]/g, '')
  if (!digitsOnly) return null
  return sha256Hex(digitsOnly)
}
