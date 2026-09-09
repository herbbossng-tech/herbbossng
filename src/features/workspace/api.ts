import { supabase } from '@/lib/supabase'
import type { Country, Currency, Workspace } from '@/types/database'

export async function fetchCountries(): Promise<Country[]> {
  const { data, error } = await supabase.from('countries').select('*').eq('is_active', true).order('name')
  if (error) throw error
  return (data ?? []) as Country[]
}

export async function fetchCurrencies(): Promise<Currency[]> {
  const { data, error } = await supabase.from('currencies').select('*').eq('is_active', true).order('name')
  if (error) throw error
  return (data ?? []) as Currency[]
}

export interface WorkspaceUpdateFields {
  name?: string
  slug?: string
  country_code?: string | null
  currency_code?: string | null
  timezone?: string
  logo_url?: string | null
  status?: 'active' | 'inactive' | 'suspended'
}

export async function updateWorkspace(id: string, fields: WorkspaceUpdateFields, userId: string): Promise<Workspace> {
  const { data, error } = await supabase
    .from('workspaces')
    .update({ ...fields, updated_by: userId })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Workspace
}

export interface CreateWorkspaceInput {
  name: string
  countryCode: string
  currencyCode: string
  timezone?: string | null
  brandName?: string | null
}

/**
 * Creates a genuinely new, independent workspace and grants the caller
 * Owner of it — never touches any workspace the caller already belongs
 * to. See create_workspace() (migration 0040) for the full contract.
 */
export async function createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
  const { data, error } = await supabase
    .rpc('create_workspace', {
      p_name: input.name,
      p_country_code: input.countryCode,
      p_currency_code: input.currencyCode,
      p_timezone: input.timezone ?? null,
      p_brand_name: input.brandName ?? null,
    })
    .single()
  if (error) throw error
  return data as Workspace
}
