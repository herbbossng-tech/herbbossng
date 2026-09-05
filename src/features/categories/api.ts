import { supabase } from '@/lib/supabase'
import { slugify } from '@/lib/slug'
import type { Category } from '@/types/database'

import type { CategoryFormSchema } from './validation'

/** Always derived from the zod schema's inferred output — see validation.ts. */
export type CategoryFormValues = CategoryFormSchema

export async function fetchCategories(workspaceId: string, brandId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as Category[]
}

export async function createCategory(
  workspaceId: string,
  brandId: string,
  values: CategoryFormValues,
  userId: string,
): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({
      workspace_id: workspaceId,
      brand_id: brandId,
      name: values.name,
      slug: slugify(values.name),
      description: values.description || null,
      image_url: values.imageUrl,
      parent_id: values.parentId,
      status: values.status,
      sort_order: values.sortOrder,
      created_by: userId,
      updated_by: userId,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as Category
}

export async function updateCategory(id: string, values: CategoryFormValues, userId: string): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .update({
      name: values.name,
      slug: slugify(values.name),
      description: values.description || null,
      image_url: values.imageUrl,
      parent_id: values.parentId,
      status: values.status,
      sort_order: values.sortOrder,
      updated_by: userId,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as Category
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
