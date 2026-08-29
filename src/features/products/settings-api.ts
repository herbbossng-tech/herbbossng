import { supabase } from '@/lib/supabase'

export interface ProductSettingsValues {
  defaultLowStockThreshold: number
  defaultCommissionType: 'fixed' | 'percentage' | 'none'
  defaultCommissionValue: number
  requireSku: boolean
}

const CATEGORY = 'products'
const KEY = 'defaults'

export const defaultProductSettings: ProductSettingsValues = {
  defaultLowStockThreshold: 5,
  defaultCommissionType: 'none',
  defaultCommissionValue: 0,
  requireSku: false,
}

export async function fetchProductSettings(workspaceId: string, brandId: string): Promise<ProductSettingsValues> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('workspace_id', workspaceId)
    .eq('brand_id', brandId)
    .eq('category', CATEGORY)
    .eq('key', KEY)
    .maybeSingle()

  if (error) throw error
  if (!data) return defaultProductSettings
  return { ...defaultProductSettings, ...(data.value as Partial<ProductSettingsValues>) }
}

export async function saveProductSettings(
  workspaceId: string,
  brandId: string,
  values: ProductSettingsValues,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from('settings').upsert(
    {
      workspace_id: workspaceId,
      brand_id: brandId,
      category: CATEGORY,
      key: KEY,
      value: values,
      updated_by: userId,
    },
    { onConflict: 'workspace_id,brand_id,category,key' },
  )

  if (error) throw error
}
