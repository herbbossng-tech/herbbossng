import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2 } from 'lucide-react'
import * as React from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { LoadingState } from '@/components/ui/state'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { type ProductSettingsValues, fetchProductSettings, saveProductSettings } from '@/features/products/settings-api'

const schema = z.object({
  defaultLowStockThreshold: z.coerce.number().int().min(0),
  defaultCommissionType: z.enum(['fixed', 'percentage', 'none']),
  defaultCommissionValue: z.coerce.number().min(0),
  requireSku: z.boolean(),
})

type FormInput = z.input<typeof schema>

export function ProductSettingsPage() {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const canManage = usePermission('settings.manage')
  const [saved, setSaved] = React.useState(false)

  const queryKey = ['product-settings', activeWorkspace.id, activeBrand?.id ?? ''] as const
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchProductSettings(activeWorkspace.id, activeBrand!.id),
    enabled: Boolean(activeBrand),
  })

  const {
    register,
    handleSubmit,
    control,
    formState: { isSubmitting },
  } = useForm<FormInput, unknown, ProductSettingsValues>({ resolver: zodResolver(schema), values: data })

  const submit = async (values: ProductSettingsValues) => {
    if (!activeBrand || !user) return
    await saveProductSettings(activeWorkspace.id, activeBrand.id, values, user.id)
    queryClient.setQueryData(queryKey, values)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (isLoading) return <LoadingState label="Loading product settings…" />

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Product Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Defaults applied when creating new products for {activeBrand?.name}.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inventory defaults</CardTitle>
          <CardDescription>Applied to new products; existing products are unaffected.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="defaultLowStockThreshold">Default low stock threshold</Label>
              <Input id="defaultLowStockThreshold" type="number" min={0} disabled={!canManage} {...register('defaultLowStockThreshold')} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Require SKU on new products</p>
                <p className="text-xs text-muted-foreground">Recommended once you connect a warehouse workflow.</p>
              </div>
              <Controller
                control={control}
                name="requireSku"
                render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!canManage} />}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Default affiliate commission</Label>
                <Controller
                  control={control}
                  name="defaultCommissionType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={!canManage}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No commission</SelectItem>
                        <SelectItem value="fixed">Fixed amount</SelectItem>
                        <SelectItem value="percentage">Percentage</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="defaultCommissionValue">Commission value</Label>
                <Input id="defaultCommissionValue" type="number" step="0.01" min={0} disabled={!canManage} {...register('defaultCommissionValue')} />
              </div>
            </div>

            <PermissionGate permission="settings.manage">
              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Settings
                </Button>
                {saved && (
                  <span className="flex items-center gap-1 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    Saved
                  </span>
                )}
              </div>
            </PermissionGate>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
