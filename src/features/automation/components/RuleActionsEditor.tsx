import { AlertTriangle, Info } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  automationActionTypeLabels,
  automationActionTypes,
  automationPriorityOptions,
  automationTaskTypeOptions,
} from '@/features/automation/automationFields'
import { useCommunicationTemplates } from '@/features/communications/hooks'
import { useStaff } from '@/features/staff/hooks'
import type { AutomationAction, AutomationActionType, Json } from '@/types/database'

import { ListEditor } from './ListEditor'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function NotConfiguredNotice() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>If no provider is connected for this brand/channel, this action is recorded as not_configured — never fabricated as sent. Configure providers on the brand's detail page.</span>
    </div>
  )
}

function SendActionConfigForm({
  action,
  config,
  setConfig,
  templateChannel,
  recipientToken,
  templateKey,
}: {
  action: AutomationAction
  config: Record<string, Json>
  setConfig: (patch: Record<string, Json>) => void
  templateChannel: 'email' | 'sms'
  recipientToken: string
  templateKey: string
}) {
  const { data: templates } = useCommunicationTemplates()
  const matchingTemplates = (templates ?? []).filter((t) => t.channel === templateChannel && t.is_active)
  const isTransactional = config.is_transactional !== false

  return (
    <div className="flex flex-col gap-2">
      <NotConfiguredNotice />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Recipient">
          <div className="flex gap-1.5">
            <Input value={(config.recipient as string) ?? ''} onChange={(e) => setConfig({ recipient: e.target.value })} placeholder="Phone number or email" />
            <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setConfig({ recipient: recipientToken })}>
              Use order's customer
            </Button>
          </div>
        </Field>
        <Field label="Template (optional — overrides subject/body below if set)">
          <Select value={templateKey} onValueChange={(v) => setConfig({ template_key: v === 'none' ? null : v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No template — use subject/body below</SelectItem>
              {matchingTemplates.map((t) => (
                <SelectItem key={t.id} value={t.key}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {action.type === 'SEND_EMAIL' && (
          <Field label="Subject">
            <Input value={(config.subject as string) ?? ''} onChange={(e) => setConfig({ subject: e.target.value })} />
          </Field>
        )}
        <div className="sm:col-span-2">
          <Field label="Body">
            <Textarea rows={2} value={(config.body as string) ?? ''} onChange={(e) => setConfig({ body: e.target.value })} />
          </Field>
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Switch checked={!isTransactional} onCheckedChange={(checked) => setConfig({ is_transactional: !checked })} />
        <Label className="text-xs font-normal text-muted-foreground">
          This is a marketing message (respects the customer's opt-out preference — transactional messages never do)
        </Label>
      </div>
      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <span>"Use order's customer" resolves the recipient from the order that triggered this rule, so one rule correctly messages every order's own customer.</span>
      </div>
    </div>
  )
}

function ActionConfigForm({ action, update }: { action: AutomationAction; update: (patch: Partial<AutomationAction>) => void }) {
  const { data: staff } = useStaff()
  const config = (action.config ?? {}) as Record<string, Json>
  const setConfig = (patch: Record<string, Json>) => update({ config: { ...config, ...patch } })

  switch (action.type) {
    case 'CREATE_TASK':
      return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Task type">
            <Select value={(config.task_type as string) ?? 'OTHER'} onValueChange={(v) => setConfig({ task_type: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {automationTaskTypeOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={(config.priority as string) ?? 'normal'} onValueChange={(v) => setConfig({ priority: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {automationPriorityOptions.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Title (optional — defaults to the rule name)">
              <Input value={(config.title as string) ?? ''} onChange={(e) => setConfig({ title: e.target.value })} placeholder="Automated follow-up: …" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Description (optional)">
              <Textarea rows={2} value={(config.description as string) ?? ''} onChange={(e) => setConfig({ description: e.target.value })} />
            </Field>
          </div>
        </div>
      )

    case 'ASSIGN_TASK':
    case 'ASSIGN_ORDER':
      return (
        <p className="text-xs text-muted-foreground">
          Assigns using this workspace's Assignment Rules (round robin / least workload / fixed staff) for{' '}
          {action.type === 'ASSIGN_TASK' ? 'follow-up tasks' : 'orders'}. Configure the strategy under Settings → Assignment Rules.
        </p>
      )

    case 'CREATE_NOTIFICATION':
      return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Notify (optional — leave blank to broadcast)">
            <Select value={(config.user_id as string) || 'any'} onValueChange={(v) => setConfig({ user_id: v === 'any' ? '' : v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Everyone with access</SelectItem>
                {staff?.map((s) => (
                  <SelectItem key={s.user_id} value={s.user_id}>
                    {[s.first_name, s.last_name].filter(Boolean).join(' ') || s.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={(config.priority as string) ?? 'normal'} onValueChange={(v) => setConfig({ priority: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {automationPriorityOptions.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Title">
              <Input value={(config.title as string) ?? ''} onChange={(e) => setConfig({ title: e.target.value })} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Message">
              <Textarea rows={2} value={(config.message as string) ?? ''} onChange={(e) => setConfig({ message: e.target.value })} />
            </Field>
          </div>
        </div>
      )

    case 'TRIGGER_APPROVAL':
      return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Module (optional — defaults to the triggering entity)">
            <Input value={(config.module as string) ?? ''} onChange={(e) => setConfig({ module: e.target.value })} placeholder="orders / ad_costs / withdrawals" />
          </Field>
          <Field label="Amount (optional)">
            <Input type="number" value={(config.amount as string) ?? ''} onChange={(e) => setConfig({ amount: e.target.value })} />
          </Field>
        </div>
      )

    case 'UPDATE_SUPPORTED_RECORD':
      return (
        <Field label="Tag to add to the order (the only supported field/operation)">
          <Input value={(config.value as string) ?? ''} onChange={(e) => setConfig({ field: 'tags', operation: 'add_tag', value: e.target.value })} placeholder="e.g. high-value" />
        </Field>
      )

    case 'SEND_SMS':
    case 'SEND_WHATSAPP':
    case 'SEND_EMAIL': {
      const templateChannel = action.type === 'SEND_EMAIL' ? 'email' : 'sms'
      const recipientToken = action.type === 'SEND_EMAIL' ? '{{customer_email}}' : '{{customer_phone}}'
      const templateKey = (config.template_key as string) ?? 'none'
      return (
        <SendActionConfigForm
          action={action}
          config={config}
          setConfig={setConfig}
          templateChannel={templateChannel}
          recipientToken={recipientToken}
          templateKey={templateKey}
        />
      )
    }

    case 'LOG_EVENT':
      return (
        <Field label="Note (optional)">
          <Input value={(config.note as string) ?? ''} onChange={(e) => setConfig({ note: e.target.value })} />
        </Field>
      )

    default:
      return null
  }
}

export function RuleActionsEditor({ actions, onChange }: { actions: AutomationAction[]; onChange: (actions: AutomationAction[]) => void }) {
  return (
    <ListEditor<AutomationAction>
      items={actions}
      onChange={onChange}
      newItem={{ type: 'LOG_EVENT', config: {} }}
      addLabel="Add action"
      emptyLabel="No actions yet — add at least one action for this rule to do anything."
      renderItem={(action, update) => (
        <div className="flex flex-col gap-3">
          <Field label="Action">
            <Select value={action.type} onValueChange={(v) => update({ type: v as AutomationActionType, config: {} })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {automationActionTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {automationActionTypeLabels[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <ActionConfigForm action={action} update={update} />
        </div>
      )}
    />
  )
}
