import { ChevronLeft, ChevronRight } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

/** Calendar-day helpers. These operate purely on a Date's local year/month/day
 * components and never call toISOString()/getTime() across a timezone boundary —
 * timezone-correct resolution of the selected calendar dates happens later, in
 * the caller's own date-range utility. This component only ever needs to know
 * "which day did the user click," not what instant that represents anywhere. */
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

/** Monday = 0 .. Sunday = 6, matching the rest of the app's Monday-start week convention. */
function mondayIndexedWeekday(date: Date): number {
  return (date.getDay() + 6) % 7
}

export function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function isBeforeDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() < b.getFullYear() ||
    (a.getFullYear() === b.getFullYear() && a.getMonth() < b.getMonth()) ||
    (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() < b.getDate())
  )
}

function isWithinRange(date: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false
  return !isBeforeDay(date, start) && !isBeforeDay(end, date)
}

interface MonthGridProps {
  month: Date
  rangeStart: Date | null
  rangeEnd: Date | null
  hoverDate: Date | null
  onDayClick: (date: Date) => void
  onDayHover: (date: Date | null) => void
  today: Date
}

function MonthGrid({ month, rangeStart, rangeEnd, hoverDate, onDayClick, onDayHover, today }: MonthGridProps) {
  const leadingBlanks = mondayIndexedWeekday(startOfMonth(month))
  const total = daysInMonth(month)
  const cells: (Date | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: total }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))]
  while (cells.length % 7 !== 0) cells.push(null)

  const effectiveEnd = rangeEnd ?? hoverDate

  return (
    <div className="flex flex-col gap-1">
      <p className="mb-1 text-center text-sm font-semibold text-foreground">
        {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
      </p>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="flex h-7 items-center justify-center text-[11px] font-medium uppercase text-muted-foreground">
            {w}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} className="h-9" />
          const isStart = isSameDay(date, rangeStart)
          const isEnd = isSameDay(date, rangeEnd)
          const inRange = rangeStart && effectiveEnd && !isBeforeDay(effectiveEnd, rangeStart) && isWithinRange(date, rangeStart, effectiveEnd)
          const isToday = isSameDay(date, today)
          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onDayClick(date)}
              onMouseEnter={() => onDayHover(date)}
              aria-label={date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              aria-pressed={isStart || isEnd}
              className={cn(
                'relative h-9 w-full rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                inRange && !isStart && !isEnd && 'bg-primary/15 text-foreground',
                !isStart && !isEnd && !inRange && 'text-foreground hover:bg-accent',
                (isStart || isEnd) && 'bg-primary font-semibold text-primary-foreground hover:brightness-110',
                isToday && !isStart && !isEnd && 'ring-1 ring-inset ring-primary/50',
              )}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export interface RangeCalendarProps {
  /** First month shown (left calendar when numberOfMonths=2). */
  month: Date
  onMonthChange: (month: Date) => void
  rangeStart: Date | null
  rangeEnd: Date | null
  onDayClick: (date: Date) => void
  numberOfMonths?: 1 | 2
  className?: string
}

/** A pure, presentational range calendar — no business logic, no timezone
 * conversion, no knowledge of presets. Renders one or two month grids with
 * previous/next navigation and lets the caller own the actual range state. */
export function RangeCalendar({ month, onMonthChange, rangeStart, rangeEnd, onDayClick, numberOfMonths = 2, className }: RangeCalendarProps) {
  const [hoverDate, setHoverDate] = React.useState<Date | null>(null)
  const today = React.useMemo(() => new Date(), [])
  const secondMonth = addMonths(month, 1)

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, -1))}
          aria-label="Previous month"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(month, 1))}
          aria-label="Next month"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div onMouseLeave={() => setHoverDate(null)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MonthGrid month={month} rangeStart={rangeStart} rangeEnd={rangeEnd} hoverDate={hoverDate} onDayClick={onDayClick} onDayHover={setHoverDate} today={today} />
        {numberOfMonths === 2 && (
          <div className="hidden sm:block">
            <MonthGrid month={secondMonth} rangeStart={rangeStart} rangeEnd={rangeEnd} hoverDate={hoverDate} onDayClick={onDayClick} onDayHover={setHoverDate} today={today} />
          </div>
        )}
      </div>
    </div>
  )
}
