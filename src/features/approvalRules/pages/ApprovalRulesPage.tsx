import { ArrowLeft, Lock, Plus, ShieldAlert } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { Textarea } from '@/components/ui/textarea'
import { usePermission } from '@/contexts/PermissionsContext'
import { useApprovalRules, useArchiveApprovalRule, useCreateApprovalRule, useUpdateApprovalRule } from '@/features/approvalRules/hooks'
import { useBrandsList } from '@/features/brands/hooks'
import { useRoles } from '@/features/roles/hooks'
import { formatCurrency } from '@/lib/currency'
import type { ApprovalRuleModule } from '@/types/database'

const moduleLabels: Record<ApprovalRuleModule, string> = {
  orders: 'Orders',
  affiliates: 'Affiliates',
  withdrawals: 'Withdrawals',
  ad_costs: 'Ad Costs',
}

export function ApprovalRulesPage() {
  const canView = usePermission('approval_rules.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Approval Rules is hidden" description="You don't have permission to view approval rules. Ask a workspace admin for the approval_rules.view permission." />
      </Card>
    )
  }
  return <ApprovalRulesContent />
}

function ApprovalRulesContent() {
  const { data: rules, isLoading, isError, refetch } = useApprovalRules()
  const canManage = usePermission('approval_rules.manage')
  const updateRule = useUpdateApprovalRule()
  const archiveRule = useArchiveApprovalRule()
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
            <h1 className="text-2xl font-extrabold tracking-tight">Approval Rules</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configuration for approval thresholds on Orders, Affiliates, Withdrawals and Ad Costs. This defines policy only — the existing
              approve actions in those modules are unchanged and still single-step, permission-gated.
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
              <ErrorState message="Couldn't load approval rules." onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="px-5 py-8">
              <LoadingState label="Loading approval rules…" />
            </div>
          ) : (rules?.length ?? 0) === 0 ? (
            <div className="px-5 py-8">
              <EmptyState icon={ShieldAlert} title="No approval rules yet" description="Every approve action currently requires only the relevant *.approve permission." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Module</th>
                    <th className="px-5 py-3 font-semibold">Brand</th>
                    <th className="px-5 py-3 font-semibold">Threshold</th>
                    <th className="px-5 py-3 font-semibold">Required Approver Role</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {rules?.map((rule) => (
                    <tr key={rule.id} className="border-t border-border/60 hover:bg-accent/40">
                      <td className="px-5 py-3 font-medium">{moduleLabels[rule.module]}</td>
                      <td className="px-5 py-3 text-muted-foreground">{rule.brand?.name ?? 'All brands'}</td>
                      <td className="px-5 py-3">
                        {rule.threshold_amount !== null ? `Amount > ${formatCurrency(rule.threshold_amount, null)}` : 'Always'}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{rule.required_approver_role?.name ?? '—'}</td>
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

      <CreateApprovalRuleDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

function CreateApprovalRuleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const createRule = useCreateApprovalRule()
  const { data: brands } = useBrandsList()
  const { data: roles } = useRoles()
  const [module, setModule] = React.useState<ApprovalRuleModule>('withdrawals')
  const [brandId, setBrandId] = React.useState('all')
  const [threshold, setThreshold] = React.useState('')
  const [approverRoleId, setApproverRoleId] = React.useState('none')
  const [notes, setNotes] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setModule('withdrawals')
      setBrandId('all')
      setThreshold('')
      setApproverRoleId('none')
      setNotes('')
      setError(null)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await createRule.mutateAsync({
        module,
        brandId: brandId === 'all' ? null : brandId,
        thresholdAmount: threshold.trim() ? Number(threshold) : null,
        requiredApproverRoleId: approverRoleId === 'none' ? null : approverRoleId,
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
          <DialogTitle>New Approval Rule</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Module</Label>
              <Select value={module} onValueChange={(v) => setModule(v as ApprovalRuleModule)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="orders">Orders</SelectItem>
                  <SelectItem value="affiliates">Affiliates</SelectItem>
                  <SelectItem value="withdrawals">Withdrawals</SelectItem>
                  <SelectItem value="ad_costs">Ad Costs</SelectItem>
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
            <Label>Amount threshold (optional — leave blank to always require approval)</Label>
            <Input type="number" step="0.01" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="e.g. 50000" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Required approver role (optional)</Label>
            <Select value={approverRoleId} onValueChange={setApproverRoleId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any holder of the module's approve permission</SelectItem>
                {roles?.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
