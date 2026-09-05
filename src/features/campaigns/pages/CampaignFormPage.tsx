import * as React from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useCreateCampaign } from '@/features/campaigns/hooks'
import type { AffiliateAccess, CommissionType, QualifyingEvent } from '@/types/database'

export function CampaignFormPage() {
  const navigate = useNavigate()
  const createCampaign = useCreateCampaign()

  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [commissionType, setCommissionType] = React.useState<CommissionType>('PERCENTAGE')
  const [commissionValue, setCommissionValue] = React.useState('10')
  const [qualifyingEvent, setQualifyingEvent] = React.useState<QualifyingEvent>('PER_DELIVERED_ORDER')
  const [affiliateAccess, setAffiliateAccess] = React.useState<AffiliateAccess>('ALL_APPROVED_AFFILIATES')
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Campaign name is required.')
      return
    }
    const value = Number(commissionValue)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Commission value must be a positive number.')
      return
    }
    try {
      const campaign = await createCampaign.mutateAsync({
        name,
        description: description || null,
        commission_type: commissionType,
        commission_value: value,
        qualifying_event: qualifyingEvent,
        affiliate_access: affiliateAccess,
        allowed_activities: [],
      })
      navigate(`/affiliates/campaigns/${campaign.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign')
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">New Campaign</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Starts as a Draft. Add products and (optionally) select which affiliates can join before activating it.
        </p>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Campaign name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q4 Launch Push" autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Commission type</Label>
              <Select value={commissionType} onValueChange={(v) => setCommissionType(v as CommissionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENTAGE">Percentage of order value</SelectItem>
                  <SelectItem value="FIXED_AMOUNT">Fixed amount per order</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{commissionType === 'PERCENTAGE' ? 'Percentage (%)' : 'Flat amount'}</Label>
              <Input type="number" min="0" step="0.01" value={commissionValue} onChange={(e) => setCommissionValue(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Commission base is always the sum of ordered items belonging to this campaign's selected products — never the whole order total.
          </p>

          <div className="flex flex-col gap-1.5">
            <Label>Pays out</Label>
            <Select value={qualifyingEvent} onValueChange={(v) => setQualifyingEvent(v as QualifyingEvent)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PER_DELIVERED_ORDER">Per delivered order (recommended for COD)</SelectItem>
                <SelectItem value="PER_ORDER_CREATED">Per order created</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {qualifyingEvent === 'PER_ORDER_CREATED'
                ? 'Pays immediately when the order is placed. Risky for COD — many orders never convert to a delivery.'
                : 'Pays only once the order reaches Delivered, using the same definition Finance uses for delivered revenue.'}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Affiliate access</Label>
            <Select value={affiliateAccess} onValueChange={(v) => setAffiliateAccess(v as AffiliateAccess)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL_APPROVED_AFFILIATES">All approved affiliates</SelectItem>
                <SelectItem value="SELECTED_AFFILIATES_ONLY">Selected affiliates only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate('/affiliates/campaigns')}>
              Cancel
            </Button>
            <Button type="submit" disabled={createCampaign.isPending}>
              {createCampaign.isPending ? 'Creating…' : 'Create Draft Campaign'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
