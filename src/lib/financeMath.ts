/**
 * Centralized, zero-guarded rate/ratio math shared by Finance, Analytics,
 * Reports and the Dashboard. The database RPCs are the source of truth for
 * every count/value; this module only ever divides numbers those RPCs
 * already returned — it never re-derives revenue or order populations.
 */

/** Safe percentage: numerator/denominator * 100, rounded to 1dp, 0 when the denominator is 0 (never NaN/Infinity). */
export function safeRatePct(numerator: number, denominator: number): number {
  if (!denominator) return 0
  return Math.round((numerator / denominator) * 1000) / 10
}

/** Safe average: numerator/denominator, rounded to 2dp, 0 when the denominator is 0. */
export function safeAverage(numerator: number, denominator: number): number {
  if (!denominator) return 0
  return Math.round((numerator / denominator) * 100) / 100
}

/** "43 delivered / 52 confirmed" — always keep the numerator/denominator visible next to any derived rate. */
export function formatRatio(numerator: number, denominator: number): string {
  return `${numerator.toLocaleString()} / ${denominator.toLocaleString()}`
}
