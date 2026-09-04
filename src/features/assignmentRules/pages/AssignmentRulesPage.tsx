import { ArrowLeft, Lock, Plus, Shuffle } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { Textarea } from '@/components/ui/textarea'
import { usePermission } from '@/contexts/PermissionsContext'
import { useAssignmentRules, useArchiveAssignmentRule, useCreateAssignmentRule, useUpdateAssignmentRule } from '@/features/assignmentRules/hooks'
import { useBrandsList } from '@/features/brands/hooks'
import { useStaff } from '@/features/staff/hooks'
import type { AssignmentRuleModule, AssignmentStrategy } from '@/types/database'

const moduleLabels: Record<AssignmentRuleModule, string> = { orders: 'Orders', tasks: 'Follow-up Tasks' }
const strategyLabels: Record<AssignmentStrategy, string> = {
  manual: 'Manual (staff picks)',
  round_robin: 'Round robin',
  least_workload: 'Least active workload',
  fixed: 'Fixed staff/team',
}

export function AssignmentRulesPage() {
  const canView = usePermission('assignment_rules.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Assignment Rules is hidden" description="You don't have permission to view assignment rules. Ask a workspace admin for the assignment_rules.view permission." />
      </Card>
    )
  }
  return <AssignmentRulesContent />
}

function AssignmentRulesContent() {
  const { data: rules, isLoading, isError, refetch } = useAssignmentRules()
  const canManage = usePermission('assignment_rules.manage')
  const updateRule = useUpdateAssignmentRule()
  const archiveRule = useArchiveAssignmentRule()
  const [createOpen, setCreateOpen] = React.useState(false)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 w-fit">
          <Link to="/settings">
            <ArrowLeft className="h-4 w-4" />
            Settings
          </Link>
        </Button>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Assignment Rules</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configuration foundation for how Orders and Follow-up Tasks are handed to staff. This does not yet run automatically — "Assign to
              me" and the staff picker remain the live path; these rules are what a future automation engine will read.
            </p>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              New Rule
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-5 py-8">
              <ErrorState message="Couldn't load assignment rules." onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="px-5 py-8">
              <LoadingState label="Loading assignment rules…" />
            </div>
          ) : (rules?.length ?? 0) === 0 ? (
            <div className="px-5 py-8">
              <EmptyState icon={Shuffle} title="No assignment rules yet" description="Manual assignment is used by default until a rule is configured." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Module</th>
                    <th className="px-5 py-3 font-semibold">Brand</th>
                    <th className="px-5 py-3 font-semibold">Strategy</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {rules?.map((rule) => (
                    <tr key={rule.id} className="border-t border-border/60 hover:bg-accent/40">
                      <td className="px-5 py-3 font-medium">{moduleLabels[rule.module]}</td>
                      <td className="px-5 py-3 text-muted-foreground">{rule.brand?.name ?? 'All brands'}</td>
                      <td className="px-5 py-3">{strategyLabels[rule.strategy]}</td>
                      <td className="px-5 py-3">
                        <Badge variant={rule.is_active ? 'success' : 'secondary'}>{rule.is_active ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {canManage && (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updateRule.isPending}
                              onClick={() => updateRule.mutate({ id: rule.id, fields: { isActive: !rule.is_active } })}
                            >
                              {rule.is_active ? 'Deactivate' : 'Activate'}
                            </Button>
                            <Button size="sm" variant="outline" disabled={archiveRule.isPending} onClick={() => archiveRule.mutate(rule.id)}>
                              Archive
                            </Button>
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

      <CreateAssignmentRuleDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

function CreateAssignmentRuleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const createRule = useCreateAssignmentRule()
  const { data: brands } = useBrandsList()
  const { data: staff } = useStaff()
  const [module, setModule] = React.useState<AssignmentRuleModule>('orders')
  const [strategy, setStrategy] = React.useState<AssignmentStrategy>('manual')
  const [brandId, setBrandId] = React.useState('all')
  const [fixedStaffIds, setFixedStaffIds] = React.useState<string[]>([])
  const [notes, setNotes] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setModule('orders')
      setStrategy('manual')
      setBrandId('all')
      setFixedStaffIds([])
      setNotes('')
      setError(null)
    }
  }, [open])

  function toggleStaff(id: string) {
    setFixedStaffIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (strategy === 'fixed' && fixedStaffIds.length === 0) {
      setError('Select at least one staff member for the fixed strategy.')
      return
    }
    try {
      await createRule.mutateAsync({
        module,
        strategy,
        brandId: brandId === 'all' ? null : brandId,
        fixedStaffIds: strategy === 'fixed' ? fixedStaffIds : [],
        notes: notes || null,
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create rule')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Assignment Rule</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Module</Label>
              <Select value={module} onValueChange={(v) => setModule(v as AssignmentRuleModule)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="orders">Orders</SelectItem>
                  <SelectItem value="tasks">Follow-up Tasks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Brand</Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger>
                  <SelectValue />
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
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Strategy</Label>
            <Select value={strategy} onValueChange={(v) => setStrategy(v as AssignmentStrategy)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual (staff picks)</SelectItem>
                <SelectItem value="round_robin">Round robin</SelectItem>
                <SelectItem value="least_workload">Least active workload</SelectItem>
                <SelectItem value="fixed">Fixed staff/team</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {strategy === 'fixed' && (
            <div className="flex flex-col gap-1.5">
              <Label>Staff</Label>
              <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-md border border-border p-2">
                {staff?.length === 0 && <p className="px-1 py-1 text-xs text-muted-foreground">No staff in this workspace yet.</p>}
                {staff?.map((s) => (
                  <label key={s.user_id} className="flex items-center gap-2 px-1 py-0.5 text-sm">
                    <Checkbox checked={fixedStaffIds.includes(s.user_id)} onCheckedChange={() => toggleStaff(s.user_id)} />
                    {[s.first_name, s.last_name].filter(Boolean).join(' ') || s.email}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createRule.isPending}>
              {createRule.isPending ? 'Creating…' : 'Create Rule'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
