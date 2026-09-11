import { supabase } from '@/lib/supabase'
import type { MediaLibraryItem } from '@/types/database'

const BUCKET = 'products'

export function getProductImageUrl(filePath: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl
}

export async function fetchProductImages(productId: string): Promise<MediaLibraryItem[]> {
  const { data, error } = await supabase
    .from('media_library')
    .select('*')
    .eq('bucket', BUCKET)
    .eq('entity_type', 'product')
    .eq('entity_id', productId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as MediaLibraryItem[]
}

export async function uploadProductImage(
  workspaceId: string,
  brandId: string,
  productId: string,
  file: File,
  userId: string,
  makePrimary: boolean,
): Promise<MediaLibraryItem> {
  const extension = file.name.split('.').pop() ?? 'jpg'
  const filePath = `${workspaceId}/${brandId}/${productId}/${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (uploadError) throw uploadError

  if (makePrimary) {
    await supabase
      .from('media_library')
      .update({ is_primary: false })
      .eq('entity_type', 'product')
      .eq('entity_id', productId)
  }

  const { data, error } = await supabase
    .from('media_library')
    .insert({
      workspace_id: workspaceId,
      brand_id: brandId,
      bucket: BUCKET,
      file_path: filePath,
      file_name: file.name,
      file_type: file.type.startsWith('video') ? 'video' : 'image',
      file_size: file.size,
      mime_type: file.type,
      entity_type: 'product',
      entity_id: productId,
      is_primary: makePrimary,
      created_by: userId,
      updated_by: userId,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as MediaLibraryItem
}

export async function deleteProductImage(media: MediaLibraryItem): Promise<void> {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([media.file_path])
  if (storageError) throw storageError

  const { error } = await supabase.from('media_library').update({ deleted_at: new Date().toISOString() }).eq('id', media.id)
  if (error) throw error
}

export async function setPrimaryProductImage(productId: string, mediaId: string): Promise<void> {
  await supabase.from('media_library').update({ is_primary: false }).eq('entity_type', 'product').eq('entity_id', productId)

  const { error } = await supabase.from('media_library').update({ is_primary: true }).eq('id', mediaId)
  if (error) throw error
}
