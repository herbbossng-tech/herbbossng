import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'

import { dateRangePresetLabels, formatDateRangeLabel, type DateRangePreset, type DateRangeValue } from '../dateRanges'

const PRESETS: DateRangePreset[] = ['today', 'yesterday', 'last7days', 'last30days', 'thisMonth', 'lastMonth', 'thisYear', 'custom']

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
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value.preset} onValueChange={(v) => onChange(v as DateRangePreset)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p} value={p}>
              {dateRangePresetLabels[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value.preset === 'custom' && (
        <div className="flex items-center gap-1.5">
          <Input type="date" className="w-[150px]" value={customFrom} onChange={(e) => onCustomChange(e.target.value, customTo)} />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" className="w-[150px]" value={customTo} onChange={(e) => onCustomChange(customFrom, e.target.value)} />
        </div>
      )}

      <span className="text-xs text-muted-foreground">{formatDateRangeLabel(value)}</span>
    </div>
  )
}

export type { DateRangePreset, DateRangeValue }
