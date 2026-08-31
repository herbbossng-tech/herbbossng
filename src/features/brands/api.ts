import { supabase } from '@/lib/supabase'
import type { Brand } from '@/types/database'

export interface BrandFilters {
  search?: string
  status?: string | 'all'
}

export async function fetchBrands(workspaceId: string, filters: BrandFilters = {}): Promise<Brand[]> {
  let query = supabase.from('brands').select('*').eq('workspace_id', workspaceId).is('deleted_at', null)
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.search) query = query.ilike('name', `%${filters.search}%`)
  const { data, error } = await query.order('name')
  if (error) throw error
  return (data ?? []) as Brand[]
}

export async function fetchBrand(id: string): Promise<Brand> {
  const { data, error } = await supabase.from('brands').select('*').eq('id', id).single()
  if (error) throw error
  return data as Brand
}

export interface BrandFormFields {
  name: string
  domain?: string | null
  email_sender_name?: string | null
  email_sender_address?: string | null
  meta_pixel_id?: string | null
  google_analytics_id?: string | null
  google_tag_manager_id?: string | null
  microsoft_clarity_id?: string | null
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export async function createBrand(workspaceId: string, fields: BrandFormFields, userId: string): Promise<Brand> {
  const { data, error } = await supabase
    .from('brands')
    .insert({ workspace_id: workspaceId, slug: slugify(fields.name), created_by: userId, updated_by: userId, ...fields })
    .select('*')
    .single()
  if (error) throw error
  return data as Brand
}

export async function updateBrand(id: string, fields: Partial<BrandFormFields> & { logo_url?: string | null }, userId: string): Promise<Brand> {
  const { data, error } = await supabase
    .from('brands')
    .update({ ...fields, updated_by: userId })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Brand
}

export async function setBrandStatus(id: string, status: 'active' | 'inactive', userId: string): Promise<Brand> {
  const { data, error } = await supabase.from('brands').update({ status, updated_by: userId }).eq('id', id).select('*').single()
  if (error) throw error
  return data as Brand
}

const LOGO_BUCKET = 'brands'

export function getBrandLogoUrl(filePath: string): string {
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(filePath).data.publicUrl
}

export async function uploadBrandLogo(workspaceId: string, brandId: string, file: File): Promise<string> {
  const extension = file.name.split('.').pop() ?? 'png'
  const filePath = `${workspaceId}/${brandId}/logo-${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(filePath, file, { cacheControl: '3600', upsert: false })
  if (error) throw error
  return getBrandLogoUrl(filePath)
}
