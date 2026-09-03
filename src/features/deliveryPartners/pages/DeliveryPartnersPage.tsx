import { Lock, Plus, Truck } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { Textarea } from '@/components/ui/textarea'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { useCreateDeliveryPartner, useDeliveryPartners, useSetDeliveryPartnerStatus } from '@/features/deliveryPartners/hooks'

export function DeliveryPartnersPage() {
  const canView = usePermission('delivery_partners.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Delivery Partners is hidden" description="You don't have permission to view delivery partners. Ask a workspace admin for the delivery_partners.view permission." />
      </Card>
    )
  }
  return <DeliveryPartnersContent />
}

function DeliveryPartnersContent() {
  const { data: partners, isLoading, isError, refetch } = useDeliveryPartners()
  const [createOpen, setCreateOpen] = React.useState(false)
  const setStatus = useSetDeliveryPartnerStatus()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Delivery Partners</h1>
          <p className="mt-1 text-sm text-muted-foreground">Couriers and riders you dispatch orders through.</p>
        </div>
        <PermissionGate permission="delivery_partners.manage">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New Partner
          </Button>
        </PermissionGate>
      </div>

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-5 py-8">
              <ErrorState message="Couldn't load delivery partners." onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="px-5 py-8">
              <LoadingState label="Loading delivery partners…" />
            </div>
          ) : (partners?.length ?? 0) === 0 ? (
            <div className="px-5 py-8">
              <EmptyState icon={Truck} title="No delivery partners yet" description="Add the couriers or riders you work with." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Name</th>
                    <th className="px-5 py-3 font-semibold">Contact</th>
                    <th className="px-5 py-3 font-semibold">Coverage</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {partners?.map((p) => (
                    <tr key={p.id} className="border-t border-border/60 hover:bg-accent/40">
                      <td className="px-5 py-3 font-medium">{p.name}</td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {p.contact_name ?? '—'} {p.contact_phone && <span className="block text-xs">{p.contact_phone}</span>}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{p.coverage_areas.join(', ') || '—'}</td>
                      <td className="px-5 py-3">
                        <Badge variant={p.status === 'active' ? 'success' : 'secondary'} className="capitalize">
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <PermissionGate permission="delivery_partners.manage">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setStatus.mutate({ id: p.id, status: p.status === 'active' ? 'inactive' : 'active' })}
                            disabled={setStatus.isPending}
                          >
                            {p.status === 'active' ? 'Deactivate' : 'Activate'}
                          </Button>
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

      <CreateDeliveryPartnerDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

function CreateDeliveryPartnerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const createPartner = useCreateDeliveryPartner()
  const [name, setName] = React.useState('')
  const [contactName, setContactName] = React.useState('')
  const [contactPhone, setContactPhone] = React.useState('')
  const [coverage, setCoverage] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setName('')
      setContactName('')
      setContactPhone('')
      setCoverage('')
      setNotes('')
      setError(null)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Name is required.')
      return
    }
    try {
      await createPartner.mutateAsync({
        name,
        contact_name: contactName || null,
        contact_phone: contactPhone || null,
        coverage_areas: coverage ? coverage.split(',').map((c) => c.trim()).filter(Boolean) : [],
        notes: notes || null,
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create delivery partner')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Delivery Partner</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GIG Logistics" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Contact name</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Contact phone</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Coverage areas (comma-separated)</Label>
            <Input value={coverage} onChange={(e) => setCoverage(e.target.value)} placeholder="Lagos, Ogun, Oyo" />
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
            <Button type="submit" disabled={createPartner.isPending}>
              {createPartner.isPending ? 'Creating…' : 'Create Partner'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
