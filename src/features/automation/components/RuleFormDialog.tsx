import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { automationEventTypeLabels, automationEventTypes } from '@/features/automation/automationFields'
import { useBrandsList } from '@/features/brands/hooks'
import { useCreateAutomationRule, useUpdateAutomationRule } from '@/features/automation/hooks'
import type { AutomationRuleFields, AutomationRuleRow } from '@/features/automation/api'
import type { AutomationAction, AutomationCondition, AutomationConditionsLogic, AutomationEventType } from '@/types/database'

import { RuleActionsEditor } from './RuleActionsEditor'
import { RuleConditionsEditor } from './RuleConditionsEditor'

interface RuleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule?: AutomationRuleRow | null
}

const emptyState = {
  name: '',
  description: '',
  eventType: 'orders.created' as AutomationEventType | string,
  brandId: 'all',
  priority: 100,
  conditionsLogic: 'AND' as AutomationConditionsLogic,
  conditions: [] as AutomationCondition[],
  actions: [] as AutomationAction[],
}

export function RuleFormDialog({ open, onOpenChange, rule }: RuleFormDialogProps) {
  const isEdit = Boolean(rule)
  const createRule = useCreateAutomationRule()
  const updateRule = useUpdateAutomationRule()
  const { data: brands } = useBrandsList()
  const [state, setState] = React.useState(emptyState)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    if (rule) {
      setState({
        name: rule.name,
        description: rule.description ?? '',
        eventType: rule.event_type,
        brandId: rule.brand_id ?? 'all',
        priority: rule.priority,
        conditionsLogic: rule.conditions_logic,
        conditions: rule.conditions,
        actions: rule.actions,
      })
    } else {
      setState(emptyState)
    }
    setError(null)
  }, [open, rule])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!state.name.trim()) {
      setError('Name is required.')
      return
    }
    if (state.actions.length === 0) {
      setError('Add at least one action.')
      return
    }
    for (const c of state.conditions) {
      if (!c.field) {
        setError('Every condition needs a field.')
        return
      }
    }

    const fields: AutomationRuleFields = {
      name: state.name.trim(),
      description: state.description.trim() || null,
      eventType: state.eventType,
      brandId: state.brandId === 'all' ? null : state.brandId,
      priority: state.priority,
      conditionsLogic: state.conditionsLogic,
      conditions: state.conditions,
      actions: state.actions,
    }

    try {
      if (isEdit && rule) {
        await updateRule.mutateAsync({ id: rule.id, fields })
      } else {
        await createRule.mutateAsync(fields)
      }
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule')
    }
  }

  const isPending = createRule.isPending || updateRule.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Automation Rule' : 'New Automation Rule'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto p-6 pt-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input value={state.name} onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. Flag high-value orders" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Brand</Label>
              <Select value={state.brandId} onValueChange={(v) => setState((s) => ({ ...s, brandId: v }))}>
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
            <Label>Description (optional)</Label>
            <Textarea rows={2} value={state.description} onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))} />
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">When</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Event</Label>
                <Select value={state.eventType} onValueChange={(v) => setState((s) => ({ ...s, eventType: v, conditions: [] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {automationEventTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {automationEventTypeLabels[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Priority (lower runs first when multiple rules match)</Label>
                <Input
                  type="number"
                  value={state.priority}
                  onChange={(e) => setState((s) => ({ ...s, priority: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">If (optional)</p>
              {state.conditions.length > 1 && (
                <Select value={state.conditionsLogic} onValueChange={(v) => setState((s) => ({ ...s, conditionsLogic: v as AutomationConditionsLogic }))}>
                  <SelectTrigger className="h-8 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AND">Match ALL</SelectItem>
                    <SelectItem value="OR">Match ANY</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <RuleConditionsEditor
              conditions={state.conditions}
              onChange={(conditions) => setState((s) => ({ ...s, conditions }))}
              eventType={state.eventType}
            />
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Then</p>
            <RuleActionsEditor actions={state.actions} onChange={(actions) => setState((s) => ({ ...s, actions }))} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save Rule' : 'Create Rule'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
