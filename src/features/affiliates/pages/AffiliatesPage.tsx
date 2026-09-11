import { Download, Lock, Plus, Search, UsersRound } from 'lucide-react'
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
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { useAffiliates, useCreateAffiliate } from '@/features/affiliates/hooks'
import { exportToCsv } from '@/lib/csv'

const approvalToneMap: Record<string, 'success' | 'secondary' | 'destructive' | 'warning'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
}

export function AffiliatesPage() {
  const canView = usePermission('affiliates.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Affiliates is hidden" description="You don't have permission to view affiliates in this workspace. Ask a workspace admin for the affiliates.view permission." />
      </Card>
    )
  }
  return <AffiliatesContent />
}

function AffiliatesContent() {
  const [search, setSearch] = React.useState('')
  const [approvalStatus, setApprovalStatus] = React.useState('all')
  const [status, setStatus] = React.useState('all')
  const [createOpen, setCreateOpen] = React.useState(false)
  const { data: affiliates, isLoading, isError, refetch } = useAffiliates({ search, approvalStatus, status })

  function handleExport() {
    if (!affiliates || affiliates.length === 0) return
    exportToCsv(
      `affiliates-${new Date().toISOString().slice(0, 10)}.csv`,
      affiliates.map((a) => ({
        name: a.full_name,
        email: a.email ?? '',
        phone: a.phone ?? '',
        referral_code: a.referral_code,
        approval_status: a.approval_status,
        status: a.status,
        applied_at: a.applied_at,
      })),
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Affiliates</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your affiliate directory, approvals and status.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleExport} disabled={!affiliates || affiliates.length === 0}>
            <Download className="h-4 w-4" />
            Export
          </Button>
          <PermissionGate anyOf={['affiliates.create', 'affiliates.manage']}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              New Affiliate
            </Button>
          </PermissionGate>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search name, email, referral code…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={approvalStatus} onValueChange={setApprovalStatus}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All applications</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-5 py-8">
              <ErrorState message="Couldn't load affiliates." onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="px-5 py-8">
              <LoadingState label="Loading affiliates…" />
            </div>
          ) : (affiliates?.length ?? 0) === 0 ? (
            <div className="px-5 py-8">
              <EmptyState icon={UsersRound} title="No affiliates yet" description="Add your first affiliate to start running campaigns." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-5 py-3 font-semibold">Contact</th>
                    <th className="px-5 py-3 font-semibold">Referral Code</th>
                    <th className="px-5 py-3 font-semibold">Application</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Applied</th>
                  </tr>
                </thead>
                <tbody>
                  {affiliates?.map((a) => (
                    <tr key={a.id} className="border-t border-border/60 hover:bg-accent/40">
                      <td className="px-5 py-3">
                        <Link to={`/affiliates/${a.id}`} className="font-medium hover:text-primary">
                          {a.full_name}
                        </Link>
                        {a.business_name && <p className="text-xs text-muted-foreground">{a.business_name}</p>}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {a.email ?? '—'}
                        {a.phone && <p className="text-xs">{a.phone}</p>}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs">{a.referral_code}</td>
                      <td className="px-5 py-3">
                        <Badge variant={approvalToneMap[a.approval_status] ?? 'secondary'} className="capitalize">
                          {a.approval_status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={a.status === 'active' ? 'success' : 'destructive'} className="capitalize">
                          {a.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(a.applied_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateAffiliateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

function CreateAffiliateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [fullName, setFullName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [businessName, setBusinessName] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const createAffiliate = useCreateAffiliate()

  React.useEffect(() => {
    if (!open) {
      setFullName('')
      setEmail('')
      setPhone('')
      setBusinessName('')
      setNotes('')
      setError(null)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!fullName.trim()) {
      setError('Full name is required.')
      return
    }
    try {
      await createAffiliate.mutateAsync({ full_name: fullName, email: email || null, phone: phone || null, business_name: businessName || null, notes: notes || null })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create affiliate')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Affiliate</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Chidinma Okafor" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="affiliate@email.com" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0801 234 5678" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Business name (optional)</Label>
            <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Chidi Media" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <p className="text-xs text-muted-foreground">
            New affiliates start as <strong>pending</strong> — approve them from the detail page before they can be attached to a campaign.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createAffiliate.isPending}>
              {createAffiliate.isPending ? 'Creating…' : 'Create Affiliate'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
