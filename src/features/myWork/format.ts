export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/** Same scale, but for a future timestamp — "in 2h", "in 3d", or overdue text. */
export function relativeDueTime(iso: string | null | undefined): string {
  if (!iso) return 'no date set'
  const diffMs = new Date(iso).getTime() - Date.now()
  if (diffMs <= 0) return `overdue by ${relativeTime(iso)}`.replace(' ago', '')
  const mins = Math.round(diffMs / 60_000)
  if (mins < 60) return `in ${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `in ${hours}h`
  return `in ${Math.round(hours / 24)}d`
}
