// Deterministic unit tests for the Twilio SMS adapter's validation
// logic — no live network call, no real Account SID/Auth Token. Run
// locally via `npx tsx twilio.test.ts`. Exercises the ACTUAL shipped
// module's short-circuit guards (the only parts testable without a
// real HTTP call or a mocked fetch).
import { dispatchTwilioSms } from './twilio.ts'

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

async function assertMissingFieldsShortCircuit() {
  const result = await dispatchTwilioSms({ recipient: null, body: 'hi', api_key: 'sid:token', sender_id: '+15551234567' })
  assertEq(result.status, null, 'missing recipient short-circuits before any fetch')
  assertEq(result.providerMessageId, null, 'no message id fabricated when nothing was sent')
}

async function assertMalformedCredentialShortCircuit() {
  const result = await dispatchTwilioSms({ recipient: '+2348011112222', body: 'hi', api_key: 'not-a-valid-credential', sender_id: '+15551234567' })
  assertEq(result.errorMessage, 'sms_api_key must be "<AccountSid>:<AuthToken>"', 'a credential without the AccountSid:AuthToken shape fails honestly before any network call, never silently sends unauthenticated')
}

await assertMissingFieldsShortCircuit()
await assertMalformedCredentialShortCircuit()

console.log(failures === 0 ? '\n=== ALL TWILIO ADAPTER TESTS PASSED ===' : `\n=== ${failures} TEST(S) FAILED ===`)
if (failures > 0) throw new Error(`${failures} test(s) failed`)
