// Deterministic unit tests for the SMTP adapter's validation logic —
// no live network call, no real mail server. Run locally via
// `npx tsx smtp.test.ts`. Exercises the ACTUAL shipped module's
// short-circuit guards — the only parts testable without a real SMTP
// connection (dispatchSmtp's denomailer import is dynamic and never
// reached by either guard below).
import { dispatchSmtp } from './smtp.ts'

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

async function assertMissingRecipientShortCircuit() {
  const result = await dispatchSmtp({
    recipient: null,
    subject: 'hi',
    body: 'hi',
    host: 'smtp.example.com',
    port: 587,
    username: 'user',
    password: 'pass',
    secure: false,
    from_name: null,
    from_address: null,
  })
  assertEq(result.status, null, 'missing recipient short-circuits before any smtp connection attempt')
  assertEq(result.providerMessageId, null, 'no message id fabricated when nothing was sent')
}

async function assertMissingCredentialsShortCircuit() {
  const result = await dispatchSmtp({
    recipient: 'customer@example.com',
    subject: 'hi',
    body: 'hi',
    host: null,
    port: null,
    username: null,
    password: null,
    secure: null,
    from_name: null,
    from_address: null,
  })
  assertEq(
    result.errorMessage,
    'missing smtp host/username/password/recipient at dispatch time',
    'an unconfigured smtp credential fails honestly before any connection attempt, never silently sends unauthenticated',
  )
}

await assertMissingRecipientShortCircuit()
await assertMissingCredentialsShortCircuit()

console.log(failures === 0 ? '\n=== ALL SMTP ADAPTER TESTS PASSED ===' : `\n=== ${failures} TEST(S) FAILED ===`)
if (failures > 0) throw new Error(`${failures} test(s) failed`)
