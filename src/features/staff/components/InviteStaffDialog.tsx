import { Check, Copy } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBrandsList } from '@/features/brands/hooks'
import { useRoles } from '@/features/roles/hooks'
import { useCreateInvitation } from '@/features/staff/hooks'

export function InviteStaffDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: roles } = useRoles()
  const { data: brands } = useBrandsList()
  const createInvitation = useCreateInvitation()

  const [email, setEmail] = React.useState('')
  const [roleId, setRoleId] = React.useState('')
  const [brandId, setBrandId] = React.useState('all')
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<{ link: string; expiresAt: string } | null>(null)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setEmail('')
      setRoleId('')
      setBrandId('all')
      setError(null)
      setResult(null)
      setCopied(false)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim()) {
      setError('Email is required.')
      return
    }
    if (!roleId) {
      setError('Select a role.')
      return
    }
    try {
      const invite = await createInvitation.mutateAsync({ email, roleId, brandId: brandId === 'all' ? null : brandId })
      const link = `${window.location.origin}/invitations/accept?token=${invite.token}`
      setResult({ link, expiresAt: invite.expires_at })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create invitation'
      if (message.includes('invitation_already_pending')) setError('This person already has a pending invitation to this workspace.')
      else if (message.includes('already_a_member')) setError('This person is already a member of this workspace.')
      else setError(message)
    }
  }

  async function handleCopy() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may be unavailable — the link is still shown for manual copy.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Staff</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col gap-4 p-6 pt-2">
            <p className="text-sm text-muted-foreground">
              Invitation created. GCOS does not send email yet — copy this link and share it with {email} yourself (WhatsApp, email, however you'd
              normally reach them). It expires {new Date(result.expiresAt).toLocaleDateString()}.
            </p>
            <div className="flex items-center gap-2">
              <Input readOnly value={result.link} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button type="button" variant="outline" size="icon" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label>Email address</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles?.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Brand access</Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All brands in this workspace</SelectItem>
                  {brands?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} only
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createInvitation.isPending}>
                {createInvitation.isPending ? 'Creating…' : 'Create Invitation'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
