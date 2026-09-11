export type FailureCategory = 'timeout' | 'client_error' | 'server_error' | 'not_configured' | 'unknown'

export interface DispatchOutcome {
  success: boolean
  retryable: boolean
  failureCategory: FailureCategory | null
  errorMessage: string | null
}

/**
 * Classifies a provider HTTP response into the honest retryable/
 * permanent taxonomy tracking_dispatch_log/communication_log expect
 * (0032) — never guesses "sent". Shared by dispatch-tracking-event and
 * dispatch-communication so both Edge Functions apply the exact same
 * retry policy: 2xx = success; 429/5xx/no-response = transient
 * (retryable); other 4xx = a real rejection (permanently_failed on
 * this attempt, subject to the caller's own attempts >= max_attempts
 * check inside record_*_dispatch_result()).
 */
export function classifyHttpResult(status: number | null, errorMessage: string | null): DispatchOutcome {
  if (status == null) {
    return { success: false, retryable: true, failureCategory: 'timeout', errorMessage: errorMessage ?? 'network error / no response' }
  }
  if (status >= 200 && status < 300) {
    return { success: true, retryable: false, failureCategory: null, errorMessage: null }
  }
  if (status === 429 || status >= 500) {
    return { success: false, retryable: true, failureCategory: 'server_error', errorMessage: errorMessage ?? `HTTP ${status}` }
  }
  if (status >= 400) {
    return { success: false, retryable: false, failureCategory: 'client_error', errorMessage: errorMessage ?? `HTTP ${status}` }
  }
  return { success: false, retryable: true, failureCategory: 'unknown', errorMessage: errorMessage ?? `unexpected HTTP ${status}` }
}
