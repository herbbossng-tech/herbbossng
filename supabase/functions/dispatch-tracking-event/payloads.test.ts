// Deterministic unit tests for the dispatch-tracking-event payload/
// classification logic — no live network calls, no real Meta/TikTok
// credentials. This exercises the ACTUAL shipped module (payloads.ts),
// not a copy. Deno has no runtime access in this sandbox, so these
// were run and verified locally via `npx tsx payloads.test.ts` from
// this directory (Node 22's native Web Crypto/fetch types are a
// superset of what this file uses); a real Deno environment can run
// them unchanged with `deno test`.
import { hashEmail, hashPhone } from '../_shared/hashing.ts'
import { buildMetaPayload, buildTiktokPayload, classifyHttpResult, type ClaimedTrackingEvent, metaEventName, tiktokEventName } from './payloads.ts'

let failures = 0
function assertEq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    console.error(`FAIL ${label}: expected ${e}, got ${a}`)
    failures++
  } else {
    console.log(`OK ${label}`)
  }
}

async function run() {
  // 1. hashing determinism + format — never leaks plaintext PII
  const hashedPhone = await hashPhone('+254712345678')
  assertEq(typeof hashedPhone === 'string' && hashedPhone.length === 64, true, 'hashPhone produces a 64-char hex sha256')
  assertEq(await hashPhone('254712345678'), hashedPhone, 'hashPhone strips non-digits (+ vs no +) to the same hash')
  assertEq(await hashPhone(null), null, 'hashPhone(null) is null')
  assertEq(await hashEmail('Test@Example.com '), await hashEmail('test@example.com'), 'hashEmail normalizes case/whitespace to the same hash')

  // 2. Event name mapping MUST match src/features/landingPages/public/tracking.ts's
  // browser-side choices, and PURCHASE must never be conflated with ORDER_CREATED.
  assertEq(metaEventName('PURCHASE'), 'Purchase', 'meta PURCHASE -> Purchase (the one real revenue event)')
  assertEq(metaEventName('ORDER_CREATED'), 'SubmitApplication', 'meta ORDER_CREATED -> SubmitApplication, never Purchase')
  assertEq(tiktokEventName('PURCHASE'), 'CompletePayment', 'tiktok PURCHASE -> CompletePayment')
  assertEq(tiktokEventName('ORDER_CREATED'), 'SubmitForm', 'tiktok ORDER_CREATED -> SubmitForm, never CompletePayment')

  const baseRow: ClaimedTrackingEvent = {
    id: 'row-1',
    provider: 'meta',
    event_type: 'PURCHASE',
    event_id: 'PURCHASE:meta:order-123',
    attempts: 1,
    workspace_id: 'ws-1',
    brand_id: 'brand-1',
    landing_page_id: 'lp-1',
    order_id: 'order-123',
    pixel_id: 'PIXEL123',
    access_token: 'TOKEN123',
    test_event_code: 'TEST1',
    landing_page_slug: 'ginseng-tea',
    order_total: 10796,
    order_currency: 'KES',
    customer_phone: '+254712345678',
    customer_email: 'buyer@example.com',
    order_created_at: '2026-01-01T00:00:00Z',
    utm_source: 'facebook',
    utm_medium: 'cpc',
    utm_campaign: 'launch',
    utm_content: null,
    utm_term: null,
    fbclid: 'fbclid-abc',
    ttclid: null,
  }

  // 3. Meta payload: event_id passthrough IS the dedup key against the
  // browser's Pixel copy of the same event — must be byte-identical to
  // tracking_dispatch_log.event_id, never re-derived.
  const metaPayload = await buildMetaPayload(baseRow)
  assertEq(metaPayload.data[0].event_id, baseRow.event_id, 'Meta payload event_id matches tracking_dispatch_log.event_id exactly (dedup key)')
  assertEq(metaPayload.data[0].event_name, 'Purchase', 'Meta payload uses the mapped event name')
  assertEq((metaPayload.data[0].custom_data as { value: number }).value, 10796, 'Meta payload carries the authoritative server-resolved order value')
  assertEq((metaPayload.data[0].custom_data as { currency: string }).currency, 'KES', 'Meta payload carries the correct market currency')
  assertEq(metaPayload.data[0].user_data.ph[0], hashedPhone, 'Meta payload hashes the phone, never sends it plaintext')
  assertEq(metaPayload.test_event_code, 'TEST1', 'Meta payload forwards the configured test_event_code')
  assertEq(!JSON.stringify(metaPayload).includes('254712345678'), true, 'Meta payload never contains the raw phone number')

  // 4. TikTok payload
  const tiktokRow: ClaimedTrackingEvent = { ...baseRow, provider: 'tiktok', event_id: 'PURCHASE:tiktok:order-123', pixel_id: 'TTPIXEL', access_token: 'TTTOKEN', ttclid: 'ttclid-xyz' }
  const tiktokPayload = await buildTiktokPayload(tiktokRow)
  assertEq(tiktokPayload.data[0].event_id, tiktokRow.event_id, 'TikTok payload event_id matches the dedup key')
  assertEq(tiktokPayload.data[0].event, 'CompletePayment', 'TikTok payload uses the mapped event name')
  assertEq(tiktokPayload.event_source_id, 'TTPIXEL', 'TikTok payload carries the correct pixel id')
  assertEq(tiktokPayload.data[0].user.ttclid[0], 'ttclid-xyz', 'TikTok payload carries the click id for attribution')

  // 5. Currency is always the order's own market currency — never hardcoded to one country.
  const ngRow: ClaimedTrackingEvent = { ...baseRow, order_currency: 'NGN' }
  const ngPayload = await buildMetaPayload(ngRow)
  assertEq((ngPayload.data[0].custom_data as { currency: string }).currency, 'NGN', 'a Nigeria-market order is sent as NGN, never forced to one default currency')

  // 6. classifyHttpResult decision table — failure injection, no live calls.
  assertEq(classifyHttpResult(200, null), { success: true, retryable: false, failureCategory: null, errorMessage: null }, 'HTTP 200 -> success, terminal')
  assertEq(classifyHttpResult(500, 'boom').retryable, true, 'HTTP 500 -> retryable (server_error)')
  assertEq(classifyHttpResult(500, 'boom').failureCategory, 'server_error', 'HTTP 500 classified as server_error')
  assertEq(classifyHttpResult(429, 'rate limited').retryable, true, 'HTTP 429 (rate limit) -> retryable')
  assertEq(classifyHttpResult(400, 'bad request').retryable, false, 'HTTP 400 -> NOT retryable (a real rejection)')
  assertEq(classifyHttpResult(400, 'bad request').failureCategory, 'client_error', 'HTTP 400 classified as client_error')
  assertEq(classifyHttpResult(null, 'ECONNRESET').retryable, true, 'a network error/timeout (no status) -> retryable')
  assertEq(classifyHttpResult(null, 'ECONNRESET').failureCategory, 'timeout', 'no-response classified as timeout')

  console.log(failures === 0 ? '\n=== ALL EDGE FUNCTION PAYLOAD/CLASSIFICATION TESTS PASSED ===' : `\n=== ${failures} TEST(S) FAILED ===`)
  if (failures > 0) throw new Error(`${failures} test(s) failed`)
}

run()
