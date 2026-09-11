import { Building2, Lock, Plus, Search } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { useCreateBrand, useBrandsList } from '@/features/brands/hooks'

export function BrandsPage() {
  const canView = usePermission('brands.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Brands is hidden" description="You don't have permission to view brands in this workspace. Ask a workspace admin for the brands.view permission." />
      </Card>
    )
  }
  return <BrandsContent />
}

function BrandsContent() {
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const { data: brands, isLoading, isError, refetch } = useBrandsList({ search, status })
  const [createOpen, setCreateOpen] = React.useState(false)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Brands</h1>
          <p className="mt-1 text-sm text-muted-foreground">Product lines/storefronts within this workspace.</p>
        </div>
        <PermissionGate permission="brands.manage">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New Brand
          </Button>
        </PermissionGate>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search brands…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <ErrorState message="Couldn't load brands." onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState label="Loading brands…" />
      ) : (brands?.length ?? 0) === 0 ? (
        <Card className="p-8">
          <EmptyState icon={Building2} title="No brands yet" description="Create your first brand to start listing products and landing pages under it." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {brands?.map((brand) => (
            <Link key={brand.id} to={`/brands/${brand.id}`}>
              <Card className="flex h-full flex-col gap-3 p-5 transition-colors hover:border-primary/40">
                <div className="flex items-center gap-3">
                  {brand.logo_url ? (
                    <img src={brand.logo_url} alt={brand.name} className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <Building2 className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{brand.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{brand.domain ?? brand.slug}</p>
                  </div>
                </div>
                <Badge variant={brand.status === 'active' ? 'success' : 'secondary'} className="w-fit capitalize">
                  {brand.status}
                </Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <CreateBrandDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

function CreateBrandDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const createBrand = useCreateBrand()

  React.useEffect(() => {
    if (!open) {
      setName('')
      setError(null)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Brand name is required.')
      return
    }
    try {
      await createBrand.mutateAsync({ name })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create brand')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Brand</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Brand name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Golden Beauty" autoFocus />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createBrand.isPending}>
              {createBrand.isPending ? 'Creating…' : 'Create Brand'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
