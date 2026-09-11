import { Package, Pencil, Plus, Trash2 } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState, LoadingState } from '@/components/ui/state'
import { Switch } from '@/components/ui/switch'
import { PackageForm } from '@/features/landingPages/components/PackageForm'
import { useCreatePackage, useDeletePackage, useLandingPagePackages, useTogglePackageEnabled, useUpdatePackage } from '@/features/landingPages/hooks'
import type { PackageFormOutput } from '@/features/landingPages/validation'
import { formatCurrency } from '@/lib/currency'
import type { LandingPagePackage } from '@/types/database'

const emptyPackage: PackageFormOutput = {
  name: '',
  quantity: 1,
  price: 0,
  compareAtPrice: '',
  badge: '',
  savingsText: '',
  offerText: '',
  shippingType: 'free',
  shippingAmount: 0,
  shippingDefault: 0,
  shippingRates: [],
  enabled: true,
  isDefault: false,
}

function toFormValues(pkg: LandingPagePackage): PackageFormOutput {
  const rule = pkg.shipping_rule
  return {
    name: pkg.name,
    quantity: pkg.quantity,
    price: pkg.price,
    compareAtPrice: pkg.compare_at_price ?? '',
    badge: pkg.badge ?? '',
    savingsText: pkg.savings_text ?? '',
    offerText: pkg.offer_text ?? '',
    shippingType: rule?.type ?? 'free',
    shippingAmount: rule?.amount ?? 0,
    shippingDefault: rule?.default ?? 0,
    shippingRates: Object.entries(rule?.rates ?? {}).map(([state, amount]) => ({ state, amount })),
    enabled: pkg.enabled,
    isDefault: pkg.is_default,
  }
}

export function PackagesManager({ landingPageId, currencyCode }: { landingPageId: string; currencyCode: string | null }) {
  const { data: packages, isLoading } = useLandingPagePackages(landingPageId)
  const createPackage = useCreatePackage(landingPageId)
  const updatePackage = useUpdatePackage(landingPageId)
  const deletePackage = useDeletePackage(landingPageId)
  const toggleEnabled = useTogglePackageEnabled(landingPageId)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingPackage, setEditingPackage] = React.useState<LandingPagePackage | null>(null)

  const sorted = [...(packages ?? [])].sort((a, b) => a.position - b.position)

  function openCreate() {
    setEditingPackage(null)
    setDialogOpen(true)
  }
  function openEdit(pkg: LandingPagePackage) {
    setEditingPackage(pkg)
    setDialogOpen(true)
  }

  async function submit(values: PackageFormOutput) {
    if (editingPackage) {
      await updatePackage.mutateAsync({ id: editingPackage.id, input: values })
    } else {
      await createPackage.mutateAsync({ input: values, position: sorted.length })
    }
    setDialogOpen(false)
  }

  if (isLoading) return <LoadingState label="Loading packages…" />

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          Add Package
        </Button>
      </div>

      {sorted.length === 0 && (
        <EmptyState icon={Package} title="No packages yet" description="Add at least one package before publishing — the order form needs one to sell." />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((pkg) => (
          <Card key={pkg.id} className={!pkg.enabled ? 'opacity-60' : undefined}>
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">{pkg.name}</p>
                  <p className="text-xs text-muted-foreground">{pkg.quantity} unit(s)</p>
                </div>
                {pkg.badge && <Badge variant="warning">{pkg.badge}</Badge>}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold text-foreground">{formatCurrency(pkg.price, currencyCode)}</span>
                {pkg.compare_at_price && (
                  <span className="text-xs text-muted-foreground line-through">{formatCurrency(pkg.compare_at_price, currencyCode)}</span>
                )}
              </div>
              {pkg.savings_text && <p className="text-xs text-success">{pkg.savings_text}</p>}
              <p className="text-xs text-muted-foreground">
                Shipping: {pkg.shipping_rule?.type === 'free' ? 'Free' : pkg.shipping_rule?.type === 'fixed' ? formatCurrency(pkg.shipping_rule.amount ?? 0, currencyCode) : 'By state'}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={pkg.enabled} onCheckedChange={(checked) => toggleEnabled.mutate({ id: pkg.id, enabled: checked })} />
                  {pkg.enabled ? 'Enabled' : 'Disabled'}
                </label>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(pkg)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => deletePackage.mutate(pkg.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPackage ? 'Edit package' : 'Add package'}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            <PackageForm
              defaultValues={editingPackage ? toFormValues(editingPackage) : emptyPackage}
              isSubmitting={createPackage.isPending || updatePackage.isPending}
              submitLabel={editingPackage ? 'Save changes' : 'Add Package'}
              onSubmit={submit}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
