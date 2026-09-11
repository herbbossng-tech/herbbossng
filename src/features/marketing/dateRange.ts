import * as React from 'react'

import { useWorkspace } from '@/contexts/WorkspaceContext'
import { resolveDateRange, type DateRangePreset } from '@/features/finance/dateRanges'

/** Shared date-range state for every Marketing tab — same presets/timezone resolution as Finance/Analytics/Reports. */
export function useMarketingDateRange(defaultPreset: DateRangePreset = 'last30days') {
  const { activeWorkspace } = useWorkspace()
  const [preset, setPreset] = React.useState<DateRangePreset>(defaultPreset)
  const [customFrom, setCustomFrom] = React.useState('')
  const [customTo, setCustomTo] = React.useState('')

  const resolved = React.useMemo(
    () => resolveDateRange(preset, activeWorkspace.timezone || 'UTC', { from: customFrom, to: customTo }),
    [preset, customFrom, customTo, activeWorkspace.timezone],
  )

  return {
    preset,
    setPreset,
    customFrom,
    customTo,
    setCustom: (from: string, to: string) => {
      setCustomFrom(from)
      setCustomTo(to)
    },
    resolved,
    range: { dateFrom: resolved.from, dateTo: resolved.to },
  }
}
