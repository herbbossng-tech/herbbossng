// Deterministic unit test for the Resend payload builder — no live
// network call, no real API key. Run locally via `npx tsx resend.test.ts`.
import { buildResendPayload } from './resend.ts'

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

const payload = buildResendPayload({
  recipient: 'customer@example.com',
  subject: 'Order received',
  body: '<p>Thanks!</p>',
  api_key: 'sk_test_x',
  from_name: 'P11 Store',
  from_address: 'orders@p11.test',
})
assertEq(payload.from, 'P11 Store <orders@p11.test>', 'sender identity comes from the brand\'s own email_sender_name/address, never hardcoded')
assertEq(payload.to, ['customer@example.com'], 'recipient passed through correctly')
assertEq(payload.subject, 'Order received', 'subject passed through correctly')

const fallback = buildResendPayload({ recipient: 'a@b.com', subject: null, body: null, api_key: 'k', from_name: null, from_address: null })
assertEq(fallback.from, 'GCOS <no-reply@example.com>', 'a brand with no sender identity set gets an honest generic fallback, not a crash')

console.log(failures === 0 ? '\n=== ALL RESEND PAYLOAD TESTS PASSED ===' : `\n=== ${failures} TEST(S) FAILED ===`)
if (failures > 0) throw new Error(`${failures} test(s) failed`)
