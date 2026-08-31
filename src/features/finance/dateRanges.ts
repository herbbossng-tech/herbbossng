/**
 * Finance/Analytics/Reports date-range presets, resolved against the
 * active workspace's timezone (not the browser's) so "Today" means the
 * operator's today, not UTC's or the visitor's. p_date_from/p_date_to on
 * every finance RPC are timestamptz and compared with >=/<=, so `to` is
 * always the END of the last included day, not the start of the next one.
 */

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'last7days'
  | 'last30days'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'custom'

export interface DateRangeValue {
  preset: DateRangePreset
  from: string | null
  to: string | null
}

export const dateRangePresetLabels: Record<DateRangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7days: 'Last 7 Days',
  last30days: 'Last 30 Days',
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
  thisYear: 'This Year',
  custom: 'Custom Range',
}

/** Midnight (or 23:59:59.999) of `date`, as observed in `timeZone`, returned as a real Date instant. */
function zonedDayBoundary(date: Date, timeZone: string, endOfDay: boolean): Date {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  const d = parts.find((p) => p.type === 'day')?.value ?? '01'
  const naiveUtcMidnight = new Date(`${y}-${m}-${d}T00:00:00.000Z`)

  // Find how far `timeZone`'s midnight for this date sits from UTC midnight,
  // then shift so the returned instant is actually midnight *in* timeZone.
  const asTzString = naiveUtcMidnight.toLocaleString('en-US', { timeZone })
  const asUtcString = naiveUtcMidnight.toLocaleString('en-US', { timeZone: 'UTC' })
  const offsetMs = new Date(asTzString).getTime() - new Date(asUtcString).getTime()
  const zonedMidnight = new Date(naiveUtcMidnight.getTime() - offsetMs)

  return endOfDay ? new Date(zonedMidnight.getTime() + 24 * 60 * 60 * 1000 - 1) : zonedMidnight
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

export function resolveDateRange(preset: DateRangePreset, timezone: string, custom?: { from: string; to: string }): DateRangeValue {
  const now = new Date()
  const todayStart = zonedDayBoundary(now, timezone, false)
  const todayEnd = zonedDayBoundary(now, timezone, true)

  switch (preset) {
    case 'today':
      return { preset, from: todayStart.toISOString(), to: todayEnd.toISOString() }
    case 'yesterday': {
      const y = addDays(todayStart, -1)
      return { preset, from: zonedDayBoundary(y, timezone, false).toISOString(), to: zonedDayBoundary(y, timezone, true).toISOString() }
    }
    case 'last7days':
      return { preset, from: zonedDayBoundary(addDays(todayStart, -6), timezone, false).toISOString(), to: todayEnd.toISOString() }
    case 'last30days':
      return { preset, from: zonedDayBoundary(addDays(todayStart, -29), timezone, false).toISOString(), to: todayEnd.toISOString() }
    case 'thisMonth': {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit' }).formatToParts(now)
      const y = parts.find((p) => p.type === 'year')?.value
      const m = parts.find((p) => p.type === 'month')?.value
      const monthStart = zonedDayBoundary(new Date(`${y}-${m}-01T00:00:00.000Z`), timezone, false)
      return { preset, from: monthStart.toISOString(), to: todayEnd.toISOString() }
    }
    case 'lastMonth': {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit' }).formatToParts(now)
      const y = Number(parts.find((p) => p.type === 'year')?.value)
      const m = Number(parts.find((p) => p.type === 'month')?.value)
      const prevMonthDate = new Date(Date.UTC(m === 1 ? y - 1 : y, m === 1 ? 11 : m - 2, 1))
      const nextMonthFirstDay = new Date(Date.UTC(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1, 1))
      const lastDayPrevMonth = new Date(nextMonthFirstDay.getTime() - 24 * 60 * 60 * 1000)
      return {
        preset,
        from: zonedDayBoundary(prevMonthDate, timezone, false).toISOString(),
        to: zonedDayBoundary(lastDayPrevMonth, timezone, true).toISOString(),
      }
    }
    case 'thisYear': {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric' }).formatToParts(now)
      const y = parts.find((p) => p.type === 'year')?.value
      const yearStart = zonedDayBoundary(new Date(`${y}-01-01T00:00:00.000Z`), timezone, false)
      return { preset, from: yearStart.toISOString(), to: todayEnd.toISOString() }
    }
    case 'custom':
      return {
        preset,
        from: custom?.from ? zonedDayBoundary(new Date(`${custom.from}T00:00:00.000Z`), timezone, false).toISOString() : null,
        to: custom?.to ? zonedDayBoundary(new Date(`${custom.to}T00:00:00.000Z`), timezone, true).toISOString() : null,
      }
    default:
      return { preset: 'today', from: todayStart.toISOString(), to: todayEnd.toISOString() }
  }
}

/** Short human label for the resolved range, shown next to KPI cards ("Jan 1 – Jan 15, 2026"). */
export function formatDateRangeLabel(range: DateRangeValue): string {
  if (range.preset !== 'custom' && range.preset !== undefined) {
    if (!range.from) return 'All time'
  }
  if (!range.from || !range.to) return 'All time'
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${fmt.format(new Date(range.from))} – ${fmt.format(new Date(range.to))}`
}
