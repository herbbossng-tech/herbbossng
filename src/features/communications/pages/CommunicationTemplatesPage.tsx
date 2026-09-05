import { FileText, Lock, Plus } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useCommunicationTemplates, useSetCommunicationTemplateActive, useUpsertCommunicationTemplate } from '@/features/communications/hooks'
import type { CommunicationTemplateChannel, EmailTemplate } from '@/types/database'

const CHANNEL_LABELS: Record<CommunicationTemplateChannel, string> = { email: 'Email', sms: 'SMS' }

export function CommunicationTemplatesPage() {
  const canView = usePermission('communications.templates.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Communication Templates hidden" description="You don't have permission to view communication templates." />
      </Card>
    )
  }
  return <CommunicationTemplatesContent />
}

function CommunicationTemplatesContent() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const { data: templates, isLoading, isError, refetch } = useCommunicationTemplates(activeBrand?.id)
  const setActive = useSetCommunicationTemplateActive()
  const [editing, setEditing] = React.useState<EmailTemplate | 'new' | null>(null)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Communication Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Email and SMS message bodies used by automation rules and manual sends. Brand overrides win over workspace overrides, which win over
            system defaults.
          </p>
        </div>
        <PermissionGate permission="communications.templates.manage">
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" />
            New Template
          </Button>
        </PermissionGate>
      </div>

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-5 py-8">
              <ErrorState message="Couldn't load communication templates." onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="px-5 py-8">
              <LoadingState label="Loading templates…" />
            </div>
          ) : (templates?.length ?? 0) === 0 ? (
            <div className="px-5 py-8">
              <EmptyState icon={FileText} title="No templates yet" description="System defaults will still be used until you create an override." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Key</th>
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-5 py-3 font-semibold">Channel</th>
                    <th className="px-5 py-3 font-semibold">Scope</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {templates?.map((t) => (
                    <tr key={t.id} className="border-t border-border/60">
                      <td className="px-5 py-3 font-mono text-xs">{t.key}</td>
                      <td className="px-5 py-3">{t.name}</td>
                      <td className="px-5 py-3">{CHANNEL_LABELS[t.channel]}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {t.brand_id ? 'Brand' : t.workspace_id ? 'Workspace' : 'System default'}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={t.is_active ? 'success' : 'secondary'}>{t.is_active ? 'Active' : 'Disabled'}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <PermissionGate permission="communications.templates.manage">
                          <div className="flex justify-end gap-2">
                            {t.workspace_id === activeWorkspace.id && (
                              <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                                Edit
                              </Button>
                            )}
                            {t.workspace_id && (
                              <Button size="sm" variant="ghost" onClick={() => setActive.mutate({ id: t.id, active: !t.is_active })}>
                                {t.is_active ? 'Disable' : 'Enable'}
                              </Button>
                            )}
                          </div>
                        </PermissionGate>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <TemplateEditorDialog open={editing !== null} template={editing === 'new' ? null : editing} onOpenChange={(open) => !open && setEditing(null)} />
    </div>
  )
}

function TemplateEditorDialog({
  open,
  template,
  onOpenChange,
}: {
  open: boolean
  template: EmailTemplate | null
  onOpenChange: (open: boolean) => void
}) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const upsert = useUpsertCommunicationTemplate()

  const [key, setKey] = React.useState('')
  const [name, setName] = React.useState('')
  const [channel, setChannel] = React.useState<CommunicationTemplateChannel>('email')
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [brandScoped, setBrandScoped] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setKey(template?.key ?? '')
    setName(template?.name ?? '')
    setChannel(template?.channel ?? 'email')
    setSubject(template?.subject ?? '')
    setBody(template?.html_body ?? '')
    setBrandScoped(Boolean(template?.brand_id))
    setError(null)
  }, [open, template])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!key.trim() || !name.trim() || !body.trim()) {
      setError('Key, name and body are required.')
      return
    }
    if (channel === 'email' && !subject.trim()) {
      setError('Subject is required for an email template.')
      return
    }
    try {
      await upsert.mutateAsync({
        workspaceId: activeWorkspace.id,
        brandId: brandScoped ? activeBrand?.id ?? null : null,
        key: key.trim(),
        name: name.trim(),
        channel,
        subject: channel === 'email' ? subject : null,
        htmlBody: body,
        variables: [],
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit Template' : 'New Template'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Key</Label>
              <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="order_confirmation" disabled={Boolean(template)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as CommunicationTemplateChannel)} disabled={Boolean(template)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Order Confirmation" />
          </div>
          {channel === 'email' && (
            <div className="flex flex-col gap-1.5">
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Your order {{order_number}} is confirmed" />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Body</Label>
            <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Hi {{customer_name}}, ..." />
            <p className="text-xs text-muted-foreground">
              Available variables include {'{{customer_name}}'}, {'{{order_number}}'}, {'{{order_total}}'}, {'{{currency}}'}, {'{{delivery_status}}'},{' '}
              {'{{brand_name}}'}.
            </p>
          </div>
          {activeBrand && (
            <div className="flex items-center gap-2">
              <Switch checked={brandScoped} onCheckedChange={setBrandScoped} disabled={Boolean(template)} />
              <Label className="text-sm font-normal">
                Scope to {activeBrand.name} only (unchecked = applies to every brand in this workspace)
              </Label>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving…' : 'Save Template'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
