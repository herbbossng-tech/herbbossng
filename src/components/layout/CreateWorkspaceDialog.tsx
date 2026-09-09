import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCountries, useCreateWorkspace } from '@/features/workspace/hooks'

/**
 * Creates a brand-new, independent workspace (e.g. a second country
 * for the same operator) and switches into it. This never edits or
 * replaces any existing workspace — see create_workspace() (0040).
 */
export function CreateWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: countries } = useCountries()
  const createWorkspace = useCreateWorkspace()

  const [name, setName] = React.useState('')
  const [countryCode, setCountryCode] = React.useState('')
  const [brandName, setBrandName] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setName('')
      setCountryCode('')
      setBrandName('')
      setError(null)
    }
  }, [open])

  const selectedCountry = (countries ?? []).find((c) => c.code === countryCode)

  async function handleCreate() {
    setError(null)
    if (!name.trim()) {
      setError('Workspace name is required.')
      return
    }
    if (!selectedCountry?.currency_code) {
      setError('Choose a country.')
      return
    }
    try {
      await createWorkspace.mutateAsync({
        name: name.trim(),
        countryCode: selectedCountry.code,
        currencyCode: selectedCountry.currency_code,
        brandName: brandName.trim() || undefined,
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Workspace</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            A workspace is a fully independent operational environment — its own orders, customers, inventory, staff, finance, and landing
            pages. Your existing workspaces are never affected by creating a new one.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-ws-name">Workspace name</Label>
            <Input id="new-ws-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Golden COD Kenya" autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Country / market</Label>
            <Select value={countryCode} onValueChange={setCountryCode}>
              <SelectTrigger>
                <SelectValue placeholder="Select a country" />
              </SelectTrigger>
              <SelectContent>
                {(countries ?? []).map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.flag_emoji ? `${c.flag_emoji} ` : ''}
                    {c.name} {c.currency_code ? `(${c.currency_code})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Sets the workspace's currency, phone format, and delivery rules — this cannot be changed later without contacting support.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-ws-brand">First brand name (optional)</Label>
            <Input id="new-ws-brand" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder={name || 'Defaults to the workspace name'} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleCreate} disabled={createWorkspace.isPending}>
            {createWorkspace.isPending ? 'Creating…' : 'Create Workspace'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
