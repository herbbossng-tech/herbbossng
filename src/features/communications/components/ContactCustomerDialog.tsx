import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { useCommunicationTemplates, useSendManualCommunication } from '@/features/communications/hooks'
import type { CommunicationChannel } from '@/types/database'

interface ContactCustomerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  customerName: string
  customerEmail: string | null
  customerPhone: string
}

/**
 * The only UI path to manually message a customer. Always goes through
 * send_manual_communication() (queued via communication_log, never a
 * direct provider call from the browser) and shows the recipient and
 * message before the staff member confirms sending.
 */
export function ContactCustomerDialog({ open, onOpenChange, orderId, customerName, customerEmail, customerPhone }: ContactCustomerDialogProps) {
  const [channel, setChannel] = React.useState<CommunicationChannel>(customerEmail ? 'email' : 'sms')
  const [templateKey, setTemplateKey] = React.useState<string>('none')
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [confirmed, setConfirmed] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const { data: templates } = useCommunicationTemplates()
  const sendCommunication = useSendManualCommunication()

  const channelTemplates = (templates ?? []).filter((t) => t.channel === (channel === 'email' ? 'email' : 'sms') && t.is_active)
  const recipient = channel === 'email' ? customerEmail : customerPhone

  React.useEffect(() => {
    if (!open) {
      setChannel(customerEmail ? 'email' : 'sms')
      setTemplateKey('none')
      setSubject('')
      setBody('')
      setConfirmed(false)
      setError(null)
    }
  }, [open, customerEmail])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!confirmed) {
      setError('Please confirm you want to send this message.')
      return
    }
    if (templateKey === 'none' && !body.trim()) {
      setError('Enter a message or choose a template.')
      return
    }
    try {
      await sendCommunication.mutateAsync({
        orderId,
        channel,
        templateKey: templateKey === 'none' ? null : templateKey,
        subject: channel === 'email' ? subject || null : null,
        body: body || null,
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contact {customerName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSend} className="flex flex-col gap-4 p-6 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as CommunicationChannel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email" disabled={!customerEmail}>
                  Email{!customerEmail ? ' (no email on file)' : ''}
                </SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Recipient: </span>
            <span className="font-medium text-foreground">{recipient || 'Not on file'}</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Template (optional)</Label>
            <Select value={templateKey} onValueChange={setTemplateKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Write a custom message</SelectItem>
                {channelTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.key}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {templateKey === 'none' && (
            <>
              {channel === 'email' && (
                <div className="flex flex-col gap-1.5">
                  <Label>Subject</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label>Message</Label>
                <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What would you like to tell the customer?" />
              </div>
            </>
          )}

          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I confirm I want to send this {channel} message to {recipient || 'this recipient'} now.
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={sendCommunication.isPending || !recipient}>
              {sendCommunication.isPending ? 'Sending…' : 'Send Message'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
