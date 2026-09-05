import { Plus, Trash2 } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'

// Same generic array editor as landingPages/components/SectionConfigEditor.tsx's
// ListEditor — reused here (not imported from there) since it's a small,
// self-contained primitive with no landing-page-specific dependencies.
export function ListEditor<T>({
  items,
  onChange,
  newItem,
  renderItem,
  addLabel,
  emptyLabel,
}: {
  items: T[]
  onChange: (items: T[]) => void
  newItem: T
  renderItem: (item: T, update: (patch: Partial<T>) => void, index: number) => React.ReactNode
  addLabel: string
  emptyLabel?: string
}) {
  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && emptyLabel && <p className="text-sm text-muted-foreground">{emptyLabel}</p>}
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-2 rounded-lg border border-border p-3">
          <div className="flex-1">{renderItem(item, (patch) => onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it))), index)}</div>
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(items.filter((_, i) => i !== index))}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, newItem])} className="self-start">
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </Button>
    </div>
  )
}
