import { supabase } from '@/lib/supabase'

const BUCKET = 'landing-pages'

/**
 * Landing page images are referenced directly by public URL from each
 * section's own `config` JSON (config.imageUrl, testimonial.imageUrl, …)
 * rather than through media_library's entity/is_primary gallery model —
 * a page needs many independently-named single-image slots, not one
 * ordered gallery. The upload is still logged to media_library (for
 * audit/workspace-isolation bookkeeping and so the asset shows up
 * alongside other uploaded media), but the section config is the
 * source of truth for *which* image is used where. This also means the
 * public (anon) renderer never needs to query media_library at all —
 * it just reads the URL string already baked into the page's own
 * published section config, via the public storage bucket.
 */
export async function uploadLandingPageImage(
  workspaceId: string,
  brandId: string,
  landingPageId: string,
  file: File,
  userId: string,
): Promise<string> {
  const extension = file.name.split('.').pop() ?? 'jpg'
  const filePath = `${workspaceId}/${brandId}/${landingPageId}/${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (uploadError) throw uploadError

  const { error } = await supabase.from('media_library').insert({
    workspace_id: workspaceId,
    brand_id: brandId,
    bucket: BUCKET,
    file_path: filePath,
    file_name: file.name,
    file_type: file.type.startsWith('video') ? 'video' : 'image',
    file_size: file.size,
    mime_type: file.type,
    entity_type: 'landing_page',
    entity_id: landingPageId,
    created_by: userId,
    updated_by: userId,
  })
  if (error) throw error

  return supabase.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl
}
