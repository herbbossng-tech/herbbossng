import { Copy, Lock, Pencil, Plus, Workflow } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { usePermission } from '@/contexts/PermissionsContext'
import { automationEventTypeLabels, automationEventTypes } from '@/features/automation/automationFields'
import { RuleFormDialog } from '@/features/automation/components/RuleFormDialog'
import { useArchiveAutomationRule, useAutomationRules, useDuplicateAutomationRule, useSetAutomationRuleStatus } from '@/features/automation/hooks'
import type { AutomationRuleRow } from '@/features/automation/api'
import type { AutomationRuleStatus } from '@/types/database'

const statusVariant: Record<AutomationRuleStatus, 'secondary' | 'success' | 'warning' | 'destructive'> = {
  draft: 'secondary',
  active: 'success',
  paused: 'warning',
  archived: 'destructive',
}

export function AutomationRulesPage() {
  const canView = usePermission('automation.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Automation is hidden" description="You don't have permission to view automation rules. Ask a workspace admin for the automation.view permission." />
      </Card>
    )
  }
  return <AutomationRulesContent />
}

function AutomationRulesContent() {
  const { data: rules, isLoading, isError, refetch } = useAutomationRules()
  const canManage = usePermission('automation.manage')
  const setStatus = useSetAutomationRuleStatus()
  const archiveRule = useArchiveAutomationRule()
  const duplicateRule = useDuplicateAutomationRule()

  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [eventFilter, setEventFilter] = React.useState('all')
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingRule, setEditingRule] = React.useState<AutomationRuleRow | null>(null)

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    return (rules ?? []).filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (eventFilter !== 'all' && r.event_type !== eventFilter) return false
      if (term && !r.name.toLowerCase().includes(term) && !(r.description ?? '').toLowerCase().includes(term)) return false
      return true
    })
  }, [rules, search, statusFilter, eventFilter])

  function openCreate() {
    setEditingRule(null)
    setFormOpen(true)
  }

  function openEdit(rule: AutomationRuleRow) {
    setEditingRule(rule)
    setFormOpen(true)
  }

  function nextStatus(rule: AutomationRuleRow): AutomationRuleStatus {
    return rule.status === 'active' ? 'paused' : 'active'
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Automation Rules</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            WHEN an event happens, IF conditions match, THEN run these actions — tasks, assignments, notifications, approvals. Every action re-checks
            the rule owner's live permission before running.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New Rule
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-56" placeholder="Search rules…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Event" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {automationEventTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {automationEventTypeLabels[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-5 py-8">
              <ErrorState message="Couldn't load automation rules." onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="px-5 py-8">
              <LoadingState label="Loading automation rules…" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-8">
              <EmptyState icon={Workflow} title="No automation rules yet" description="Create a rule to automatically create tasks, assign work, or trigger approvals when something happens." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-5 py-3 font-semibold">Event</th>
                    <th className="px-5 py-3 font-semibold">Brand</th>
                    <th className="px-5 py-3 font-semibold">Actions</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((rule) => (
                    <tr key={rule.id} className="border-t border-border/60 hover:bg-accent/40">
                      <td className="px-5 py-3">
                        <p className="font-medium">{rule.name}</p>
                        {rule.description && <p className="text-xs text-muted-foreground">{rule.description}</p>}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{automationEventTypeLabels[rule.event_type as keyof typeof automationEventTypeLabels] ?? rule.event_type}</td>
                      <td className="px-5 py-3 text-muted-foreground">{rule.brand?.name ?? 'All brands'}</td>
                      <td className="px-5 py-3 text-muted-foreground">{rule.actions.length}</td>
                      <td className="px-5 py-3">
                        <Badge variant={statusVariant[rule.status]}>{rule.status}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {canManage && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEdit(rule)}>
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </Button>
                            <Button size="sm" variant="outline" disabled={duplicateRule.isPending} onClick={() => duplicateRule.mutate(rule)}>
                              <Copy className="h-3.5 w-3.5" />
                              Duplicate
                            </Button>
                            {rule.status !== 'archived' && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={setStatus.isPending}
                                onClick={() => setStatus.mutate({ id: rule.id, status: nextStatus(rule) })}
                              >
                                {rule.status === 'active' ? 'Pause' : 'Activate'}
                              </Button>
                            )}
                            {rule.status !== 'archived' && (
                              <Button size="sm" variant="outline" disabled={archiveRule.isPending} onClick={() => archiveRule.mutate(rule.id)}>
                                Archive
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <RuleFormDialog open={formOpen} onOpenChange={setFormOpen} rule={editingRule} />
    </div>
  )
}
