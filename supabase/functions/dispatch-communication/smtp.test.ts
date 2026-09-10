// Deterministic unit tests for the SMTP adapter's validation logic —
// no live network call, no real mail server. Run locally via
// `npx tsx smtp.test.ts`. Tests smtp-guards.ts directly (zero
// imports, safe under plain Node) rather than smtp.ts, which now
// statically imports a Deno-only SMTP client and can no longer be
// loaded outside Deno — see smtp.ts's header comment for why.
import { validateSmtpRow } from './smtp-guards.ts'

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

function assertMissingRecipientShortCircuit() {
  const result = validateSmtpRow({
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
  assertEq(result.ok, false, 'missing recipient short-circuits before any smtp connection attempt')
}

function assertMissingCredentialsShortCircuit() {
  const result = validateSmtpRow({
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
    result.ok ? null : result.error,
    'missing smtp host/username/password/recipient at dispatch time',
    'an unconfigured smtp credential fails honestly before any connection attempt, never silently sends unauthenticated',
  )
}

function assertCompleteRowValidates() {
  const result = validateSmtpRow({
    recipient: 'customer@example.com',
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
  assertEq(result.ok, true, 'a fully configured row validates successfully')
}

assertMissingRecipientShortCircuit()
assertMissingCredentialsShortCircuit()
assertCompleteRowValidates()

console.log(failures === 0 ? '\n=== ALL SMTP ADAPTER TESTS PASSED ===' : `\n=== ${failures} TEST(S) FAILED ===`)
if (failures > 0) throw new Error(`${failures} test(s) failed`)
