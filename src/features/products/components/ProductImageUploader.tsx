import { ImagePlus, Loader2, Star, Trash2 } from 'lucide-react'
import * as React from 'react'

import { getProductImageUrl } from '@/features/products/media-api'
import {
  useDeleteProductImage,
  useProductImages,
  useSetPrimaryProductImage,
  useUploadProductImage,
} from '@/features/products/media-hooks'
import { cn } from '@/lib/utils'

export function ProductImageUploader({ productId }: { productId: string }) {
  const { data: images, isLoading } = useProductImages(productId)
  const upload = useUploadProductImage(productId)
  const remove = useDeleteProductImage(productId)
  const setPrimary = useSetPrimaryProductImage(productId)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    const hasPrimary = (images ?? []).some((img) => img.is_primary)
    Array.from(files).forEach((file, index) => {
      upload.mutate({ file, makePrimary: !hasPrimary && index === 0 })
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {(images ?? []).map((image) => (
          <div key={image.id} className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-border">
            <img src={getProductImageUrl(image.file_path)} alt={image.alt_text ?? ''} className="h-full w-full object-cover" />
            {image.is_primary && (
              <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                <Star className="h-2.5 w-2.5 fill-current" />
                Primary
              </span>
            )}
            <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
              {!image.is_primary && (
                <button
                  type="button"
                  onClick={() => setPrimary.mutate(image.id)}
                  className="rounded-md bg-white/90 p-1.5 text-black hover:bg-white"
                  title="Set as primary"
                >
                  <Star className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => remove.mutate(image)}
                className="rounded-md bg-white/90 p-1.5 text-destructive hover:bg-white"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className={cn(
            'flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary',
          )}
        >
          {upload.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          <span className="text-[11px] font-medium">Upload</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {isLoading && <p className="text-xs text-muted-foreground">Loading images…</p>}
      <p className="text-xs text-muted-foreground">PNG, JPG or MP4. The first image you upload becomes the primary image automatically.</p>
      {upload.isError && <p className="text-xs text-destructive">Upload failed. Please try again.</p>}
    </div>
  )
}
