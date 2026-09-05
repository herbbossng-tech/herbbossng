import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { AuditLogRow } from '@/features/auditLogs/api'

const HIDDEN_KEYS = new Set(['updated_at', 'created_at', 'updated_by', 'created_by'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function DiffTable({ previous, next }: { previous: unknown; next: unknown }) {
  const prevObj = isRecord(previous) ? previous : {}
  const nextObj = isRecord(next) ? next : {}
  const keys = Array.from(new Set([...Object.keys(prevObj), ...Object.keys(nextObj)]))
    .filter((k) => !HIDDEN_KEYS.has(k))
    .filter((k) => JSON.stringify(prevObj[k]) !== JSON.stringify(nextObj[k]))
    .sort()

  if (keys.length === 0) {
    return <p className="text-sm text-muted-foreground">No field-level changes recorded.</p>
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-secondary/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-semibold">Field</th>
            <th className="px-3 py-2 font-semibold">Previous</th>
            <th className="px-3 py-2 font-semibold">New</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key} className="border-t border-border/60">
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{key}</td>
              <td className="max-w-[160px] break-words px-3 py-2 text-destructive/90">{formatValue(prevObj[key])}</td>
              <td className="max-w-[160px] break-words px-3 py-2 text-success">{formatValue(nextObj[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AuditDetailDialog({ log, onOpenChange }: { log: AuditLogRow | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={Boolean(log)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Audit Event Detail</DialogTitle>
        </DialogHeader>
        {log && (
          <div className="flex flex-col gap-4 p-6 pt-2">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Field label="Timestamp" value={new Date(log.created_at).toLocaleString()} />
              <Field label="User" value={log.user_name ?? log.user_email ?? 'System'} />
              <Field label="Module" value={log.module} />
              <Field label="Action" value={log.action} />
              <Field label="Entity Type" value={log.entity_type ?? '—'} />
              <Field label="Entity ID" value={log.entity_id ?? '—'} mono />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Changes</p>
              <DiffTable previous={log.previous_value} next={log.new_value} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={mono ? 'break-all font-mono text-xs' : 'font-medium'}>{value}</p>
    </div>
  )
}
