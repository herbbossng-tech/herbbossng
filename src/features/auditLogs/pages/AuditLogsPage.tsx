import { History, Lock, Search } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { usePermission } from '@/contexts/PermissionsContext'
import { AuditDetailDialog } from '@/features/auditLogs/components/AuditDetailDialog'
import { useAuditLogs } from '@/features/auditLogs/hooks'
import type { AuditLogRow } from '@/features/auditLogs/api'
import { useBrandsList } from '@/features/brands/hooks'
import { moduleLabels, moduleOrder } from '@/features/roles/moduleMeta'
import { useStaff } from '@/features/staff/hooks'

const ACTIONS = [
  'create',
  'update',
  'delete',
  'archive',
  'activate',
  'deactivate',
  'status_change',
  'publish',
  'unpublish',
  'export',
]

const PAGE_SIZE = 30

export function AuditLogsPage() {
  const canView = usePermission('audit_logs.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Audit Logs is hidden" description="You don't have permission to view audit logs in this workspace. Ask a workspace admin for the audit_logs.view permission." />
      </Card>
    )
  }
  return <AuditLogsContent />
}

function AuditLogsContent() {
  const [search, setSearch] = React.useState('')
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')
  const [userId, setUserId] = React.useState('all')
  const [module, setModule] = React.useState('all')
  const [action, setAction] = React.useState('all')
  const [brandId, setBrandId] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [selected, setSelected] = React.useState<AuditLogRow | null>(null)

  const { data: staff } = useStaff()
  const { data: brands } = useBrandsList()
  const { data, isLoading, isError, refetch } = useAuditLogs({
    search,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo ? `${dateTo}T23:59:59.999` : undefined,
    userId,
    module,
    action,
    brandId,
    page,
    pageSize: PAGE_SIZE,
  })

  const totalPages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Audit Logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Append-only record of every important action in this workspace. Read-only.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search module/action…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <Select
          value={module}
          onValueChange={(v) => {
            setModule(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Module" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {moduleOrder.map((m) => (
              <SelectItem key={m} value={m}>
                {moduleLabels[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={action}
          onValueChange={(v) => {
            setAction(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {a.replace('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={userId}
          onValueChange={(v) => {
            setUserId(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="User" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {staff?.map((s) => (
              <SelectItem key={s.user_id} value={s.user_id}>
                {[s.first_name, s.last_name].filter(Boolean).join(' ') || s.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={brandId}
          onValueChange={(v) => {
            setBrandId(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Brand" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All brands</SelectItem>
            {brands?.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            className="w-36"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setPage(1)
            }}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            className="w-36"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              setPage(1)
            }}
          />
        </div>
      </div>

      {isError ? (
        <ErrorState message="Couldn't load audit logs." onRetry={() => refetch()} />
      ) : isLoading && !data ? (
        <LoadingState label="Loading audit logs…" />
      ) : (data?.rows.length ?? 0) === 0 ? (
        <Card className="p-8">
          <EmptyState icon={History} title="No audit events" description="Nothing matches these filters yet." />
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Timestamp</th>
                    <th className="px-5 py-3 font-semibold">User</th>
                    <th className="px-5 py-3 font-semibold">Module</th>
                    <th className="px-5 py-3 font-semibold">Action</th>
                    <th className="px-5 py-3 font-semibold">Entity</th>
                    <th className="px-5 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {data?.rows.map((log) => (
                    <tr key={log.id} className="cursor-pointer border-t border-border/60 hover:bg-accent/40" onClick={() => setSelected(log)}>
                      <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="px-5 py-3">{log.user_name ?? log.user_email ?? 'System'}</td>
                      <td className="px-5 py-3 capitalize">{moduleLabels[log.module as keyof typeof moduleLabels] ?? log.module}</td>
                      <td className="px-5 py-3 capitalize">{log.action.replace('_', ' ')}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">{log.entity_type ?? '—'}</td>
                      <td className="px-5 py-3 text-right text-xs text-primary">View</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm">
              <p className="text-muted-foreground">
                Page {page} of {totalPages} · {data?.totalCount ?? 0} events
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <AuditDetailDialog log={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  )
}
