// Shared, dependency-free helpers for every omnichannel order-ingestion
// Edge Function (ingest-shopify-order, sync-woocommerce-orders,
// sync-google-sheets-orders). Zero imports — only Web APIs
// (crypto.subtle, URL, TextEncoder) that behave identically in the
// Deno Edge Runtime and plain Node, so this file (and only this file)
// is what every *.test.ts alongside it loads under `npx tsx`. Each
// Edge Function's own index.ts additionally imports the Deno-only
// supabase-js client, which is why the normalization/security logic
// lives here instead — the same split smtp.ts/smtp-guards.ts uses (0053).
//
// Every normalize*() function produces the SAME shape regardless of
// provider — the single normalized order shape ingest_external_order()
// (0053) expects — so the shared SQL pipeline never needs to know
// which provider produced an order.

export interface NormalizedCustomer {
  name: string
  phone: string
  email?: string | null
  country_code?: string | null
  state?: string | null
  city?: string | null
  address?: string | null
  address_2?: string | null
  postal_code?: string | null
}

export interface NormalizedItem {
  external_product_id?: string | null
  external_variant_id?: string | null
  external_sku?: string | null
  name: string
  quantity: number
  unit_price: number
}

export interface NormalizedOrder {
  external_order_id: string
  external_order_number: string | null
  customer: NormalizedCustomer
  items: NormalizedItem[]
  shipping_fee: number
  discount_amount: number
  currency_code: string | null
}

// ================================================================
// Shopify
// ================================================================

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Verifies Shopify's X-Shopify-Hmac-Sha256 header: HMAC-SHA256 of the
 * RAW (unparsed) request body, keyed with the custom app's API secret,
 * base64-encoded. Must be checked against the raw body text BEFORE
 * JSON.parse — Shopify signs the exact bytes it sent, not a
 * re-serialization of the parsed object, which can legally differ
 * (key order, number formatting).
 */
export async function verifyShopifyHmac(apiSecret: string, rawBody: string, headerHmacBase64: string | null): Promise<boolean> {
  if (!headerHmacBase64 || !apiSecret) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const computedBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
  return timingSafeEqualString(computedBase64, headerHmacBase64)
}

interface ShopifyAddress {
  name?: string | null
  phone?: string | null
  country_code?: string | null
  province?: string | null
  city?: string | null
  address1?: string | null
  address2?: string | null
  zip?: string | null
}

interface ShopifyLineItem {
  product_id?: number | string | null
  variant_id?: number | string | null
  sku?: string | null
  name?: string | null
  title?: string | null
  quantity?: number | null
  price?: string | number | null
}

export interface ShopifyOrderPayload {
  id: number | string
  name?: string | null
  order_number?: number | string | null
  currency?: string | null
  total_shipping_price_set?: { shop_money?: { amount?: string } } | null
  total_discounts?: string | null
  customer?: { first_name?: string | null; last_name?: string | null } | null
  email?: string | null
  phone?: string | null
  shipping_address?: ShopifyAddress | null
  billing_address?: ShopifyAddress | null
  line_items?: ShopifyLineItem[] | null
}

export function normalizeShopifyOrder(payload: ShopifyOrderPayload): NormalizedOrder {
  const addr = payload.shipping_address ?? payload.billing_address ?? {}
  const name = addr.name || [payload.customer?.first_name, payload.customer?.last_name].filter(Boolean).join(' ') || 'Shopify Customer'
  const phone = addr.phone || payload.phone || ''
  const items: NormalizedItem[] = (payload.line_items ?? []).map((li) => ({
    external_product_id: li.product_id != null ? String(li.product_id) : null,
    external_variant_id: li.variant_id != null ? String(li.variant_id) : null,
    external_sku: li.sku || null,
    name: li.title || li.name || 'Item',
    quantity: Math.max(1, Math.trunc(Number(li.quantity ?? 1)) || 1),
    unit_price: Number(li.price ?? 0) || 0,
  }))
  return {
    external_order_id: String(payload.id),
    external_order_number: payload.name != null ? String(payload.name) : payload.order_number != null ? String(payload.order_number) : null,
    customer: {
      name,
      phone,
      email: payload.email ?? null,
      country_code: addr.country_code ?? null,
      state: addr.province ?? null,
      city: addr.city ?? null,
      address: addr.address1 ?? null,
      address_2: addr.address2 ?? null,
      postal_code: addr.zip ?? null,
    },
    items,
    shipping_fee: Number(payload.total_shipping_price_set?.shop_money?.amount ?? 0) || 0,
    discount_amount: Number(payload.total_discounts ?? 0) || 0,
    currency_code: payload.currency ?? null,
  }
}

// ================================================================
// WooCommerce
// ================================================================

interface WooBilling {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  email?: string | null
  country?: string | null
  state?: string | null
  city?: string | null
  address_1?: string | null
  address_2?: string | null
  postcode?: string | null
}

interface WooLineItem {
  product_id?: number | null
  variation_id?: number | null
  sku?: string | null
  name?: string | null
  quantity?: number | null
  price?: number | string | null
  total?: string | null
}

export interface WooOrderPayload {
  id: number | string
  number?: string | null
  currency?: string | null
  shipping_total?: string | null
  discount_total?: string | null
  billing?: WooBilling | null
  line_items?: WooLineItem[] | null
}

export function normalizeWooCommerceOrder(payload: WooOrderPayload): NormalizedOrder {
  const b = payload.billing ?? {}
  const name = [b.first_name, b.last_name].filter(Boolean).join(' ') || 'WooCommerce Customer'
  const items: NormalizedItem[] = (payload.line_items ?? []).map((li) => {
    const quantity = Math.max(1, Math.trunc(Number(li.quantity ?? 1)) || 1)
    const unitPrice = li.price != null ? Number(li.price) : Number(li.total ?? 0) / quantity
    return {
      external_product_id: li.product_id != null ? String(li.product_id) : null,
      external_variant_id: li.variation_id != null ? String(li.variation_id) : null,
      external_sku: li.sku || null,
      name: li.name || 'Item',
      quantity,
      unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
    }
  })
  return {
    external_order_id: String(payload.id),
    external_order_number: payload.number != null ? String(payload.number) : null,
    customer: {
      name,
      phone: b.phone || '',
      email: b.email ?? null,
      country_code: b.country ?? null,
      state: b.state ?? null,
      city: b.city ?? null,
      address: b.address_1 ?? null,
      address_2: b.address_2 ?? null,
      postal_code: b.postcode ?? null,
    },
    items,
    shipping_fee: Number(payload.shipping_total ?? 0) || 0,
    discount_amount: Number(payload.discount_total ?? 0) || 0,
    currency_code: payload.currency ?? null,
  }
}

// ================================================================
// Google Sheets
// ================================================================

export interface GoogleColumnMapping {
  name?: string
  phone?: string
  email?: string
  country_code?: string
  state?: string
  city?: string
  address?: string
  address_2?: string
  postal_code?: string
  order_id?: string
  order_number?: string
  item_name?: string
  sku?: string
  quantity?: string
  unit_price?: string
  shipping_fee?: string
  discount_amount?: string
  currency_code?: string
}

/**
 * A spreadsheet row has no native concept of nested line items — one
 * row = one order with a single item (the common "dropshipping order
 * tracker" sheet shape). Multi-item orders from a sheet are explicitly
 * out of scope for v1. Returns null (never a guessed/partial order)
 * when the row has no phone number — a customer cannot be resolved
 * without one, matching every other channel's requirement.
 */
export function normalizeGoogleSheetsRow(headerRow: string[], row: string[], mapping: GoogleColumnMapping, rowIndex: number): NormalizedOrder | null {
  const col = (key: keyof GoogleColumnMapping): string | null => {
    const headerName = mapping[key]
    if (!headerName) return null
    const idx = headerRow.indexOf(headerName)
    if (idx < 0) return null
    const value = row[idx]
    return value != null && value.trim() !== '' ? value.trim() : null
  }

  const phone = col('phone')
  if (!phone) return null

  const externalOrderId = col('order_id') || `row-${rowIndex}`
  const quantity = Math.max(1, Math.trunc(Number(col('quantity') ?? '1')) || 1)
  const unitPrice = Number(col('unit_price') ?? '0') || 0

  return {
    external_order_id: externalOrderId,
    external_order_number: col('order_number') || externalOrderId,
    customer: {
      name: col('name') || 'Sheet Customer',
      phone,
      email: col('email'),
      country_code: col('country_code'),
      state: col('state'),
      city: col('city'),
      address: col('address') || '',
      address_2: col('address_2'),
      postal_code: col('postal_code'),
    },
    items: [{ external_sku: col('sku'), name: col('item_name') || 'Item', quantity, unit_price: unitPrice }],
    shipping_fee: Number(col('shipping_fee') ?? '0') || 0,
    discount_amount: Number(col('discount_amount') ?? '0') || 0,
    currency_code: col('currency_code'),
  }
}

// ================================================================
// SSRF protection for user-supplied WooCommerce store URLs — GCOS
// makes a server-side outbound request to whatever URL a staff member
// types in, which is exactly the shape of request an SSRF check must
// gate: reject anything that isn't a plain public https:// host.
// ================================================================

const BLOCKED_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /^\[::1\]$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
]

export type SafeUrlResult = { ok: true; url: URL } | { ok: false; reason: string }

/**
 * Validates a user-supplied store URL is https and its hostname does
 * not literally name a private/loopback/link-local address before the
 * sync worker ever fetches it. This is a hostname-pattern check, not a
 * DNS resolution — a hostname that only resolves to a private IP at
 * request time (DNS rebinding) is a known residual gap of this class
 * of check; the fetch call site should additionally never follow a
 * redirect to a different host.
 */
export function isSafeWooCommerceUrl(rawUrl: string): SafeUrlResult {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'not a valid URL' }
  }
  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'only an https:// store URL is allowed' }
  }
  const hostname = url.hostname
  if (BLOCKED_HOSTNAME_PATTERNS.some((p) => p.test(hostname))) {
    return { ok: false, reason: 'store URL resolves to a private/loopback/link-local address, which is not allowed' }
  }
  return { ok: true, url }
}
