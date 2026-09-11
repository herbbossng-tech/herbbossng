// Deterministic unit tests for the WhatsApp Cloud API payload builder
// — no live network call, no real access token. Run locally via
// `npx tsx whatsapp.test.ts`. Exercises the ACTUAL shipped module.
import { buildWhatsAppPayload, dispatchWhatsApp } from './whatsapp.ts'

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

const textPayload = buildWhatsAppPayload({ recipient: '2348011112222', body: 'Your order is confirmed', api_key: 'k', sender_id: '123' })
assertEq(textPayload, { messaging_product: 'whatsapp', to: '2348011112222', type: 'text', text: { body: 'Your order is confirmed' } },
  'a plain body without the TEMPLATE: marker is sent as free-form text')

const templatePayload = buildWhatsAppPayload({
  recipient: '2348011112222',
  body: 'TEMPLATE:order_confirmation:en_US:Jane|GC-1001',
  api_key: 'k',
  sender_id: '123',
})
assertEq(
  templatePayload,
  {
    messaging_product: 'whatsapp',
    to: '2348011112222',
    type: 'template',
    template: { name: 'order_confirmation', language: { code: 'en_US' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Jane' }, { type: 'text', text: 'GC-1001' }] }] },
  },
  'a TEMPLATE:name:language:vars body is sent as a provider-approved template message, never free-form',
)

async function assertMissingCredentialsShortCircuit() {
  const result = await dispatchWhatsApp({ recipient: null, body: 'hi', api_key: 'token', sender_id: '123' })
  assertEq(result.status, null, 'missing recipient short-circuits before any fetch')
  assertEq(result.errorMessage, 'missing api_key/phone_number_id/recipient at dispatch time', 'honest missing-field error message')
}

await assertMissingCredentialsShortCircuit()

console.log(failures === 0 ? '\n=== ALL WHATSAPP ADAPTER TESTS PASSED ===' : `\n=== ${failures} TEST(S) FAILED ===`)
if (failures > 0) throw new Error(`${failures} test(s) failed`)
