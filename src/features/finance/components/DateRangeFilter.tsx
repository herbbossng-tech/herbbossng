import { CalendarDays, ChevronDown } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { RangeCalendar, isBeforeDay } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import { dateRangePresetLabels, formatDateRangeLabel, type DateRangePreset, type DateRangeValue } from '../dateRanges'

const QUICK_PRESETS: DateRangePreset[] = [
  'today',
  'yesterday',
  'last7days',
  'last14days',
  'last30days',
  'thisWeek',
  'thisMonth',
  'lastMonth',
  'thisYear',
  'allTime',
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local calendar date -> the plain YYYY-MM-DD string resolveDateRange() expects.
 * Deliberately uses the Date's local y/m/d, never toISOString() (which would
 * shift the date across a UTC boundary) — the actual timezone-correct instant
 * is resolved later by resolveDateRange()/zonedDayBoundary(), unchanged here. */
function toInputString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function fromInputString(value: string): Date | null {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

export function DateRangeFilter({
  value,
  onChange,
  customFrom,
  customTo,
  onCustomChange,
}: {
  value: DateRangeValue
  onChange: (preset: DateRangePreset) => void
  customFrom: string
  customTo: string
  onCustomChange: (from: string, to: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [showCalendar, setShowCalendar] = React.useState(value.preset === 'custom')
  const [visibleMonth, setVisibleMonth] = React.useState(() => fromInputString(customFrom) ?? new Date())
  const [draftStart, setDraftStart] = React.useState<Date | null>(() => fromInputString(customFrom))
  const [draftEnd, setDraftEnd] = React.useState<Date | null>(() => fromInputString(customTo))

  function resetDraftToApplied() {
    const start = fromInputString(customFrom)
    const end = fromInputString(customTo)
    setDraftStart(start)
    setDraftEnd(end)
    setVisibleMonth(start ?? new Date())
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      // Every time the popover opens, the draft starts from whatever is
      // actually applied right now — never leftover state from a previous,
      // uncommitted exploration of the calendar.
      resetDraftToApplied()
      setShowCalendar(value.preset === 'custom')
    }
  }

  function handlePresetClick(preset: DateRangePreset) {
    onChange(preset)
    setOpen(false)
  }

  function handleDayClick(date: Date) {
    if (!draftStart || (draftStart && draftEnd)) {
      // Starting a fresh range.
      setDraftStart(date)
      setDraftEnd(null)
      return
    }
    // draftStart is set, draftEnd is not — this click completes the range.
    if (isBeforeDay(date, draftStart)) {
      // Clicked before the current start: treat it as the new start rather
      // than producing an inverted/invalid range.
      setDraftEnd(draftStart)
      setDraftStart(date)
    } else {
      setDraftEnd(date)
    }
  }

  function handleClear() {
    setDraftStart(null)
    setDraftEnd(null)
  }

  function handleApply() {
    if (!draftStart || !draftEnd) return
    onCustomChange(toInputString(draftStart), toInputString(draftEnd))
    setOpen(false)
  }

  const triggerLabel = value.preset === 'custom' ? formatDateRangeLabel(value) : dateRangePresetLabels[value.preset]

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-between gap-2 font-medium">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span>{triggerLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <div className="flex max-w-[calc(100vw-2rem)] flex-col sm:flex-row">
          <div className="flex shrink-0 flex-col gap-0.5 border-b border-border p-2 sm:w-44 sm:border-b-0 sm:border-r">
            {QUICK_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePresetClick(preset)}
                className={cn(
                  'rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                  value.preset === preset && 'bg-primary/10 font-semibold text-primary',
                )}
              >
                {dateRangePresetLabels[preset]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowCalendar(true)}
              className={cn(
                'rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                showCalendar && 'bg-primary/10 font-semibold text-primary',
              )}
            >
              Custom range
            </button>
          </div>

          {showCalendar && (
            <div className="flex flex-col gap-3 p-3">
              <p className="px-1 text-xs text-muted-foreground">
                {draftStart && draftEnd
                  ? `${draftStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${draftEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : draftStart
                    ? 'Select an end date'
                    : 'Select a start date'}
              </p>
              <RangeCalendar month={visibleMonth} onMonthChange={setVisibleMonth} rangeStart={draftStart} rangeEnd={draftEnd} onDayClick={handleDayClick} numberOfMonths={2} />
              <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                <Button variant="ghost" size="sm" onClick={handleClear}>
                  Clear
                </Button>
                <Button size="sm" onClick={handleApply} disabled={!draftStart || !draftEnd}>
                  Apply Selection
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export type { DateRangePreset, DateRangeValue }
