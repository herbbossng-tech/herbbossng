import { ImagePlus, Loader2 } from 'lucide-react'
import * as React from 'react'

import { uploadBrandLogo } from '@/features/brands/api'
import { useUpdateBrand } from '@/features/brands/hooks'
import { useWorkspace } from '@/contexts/WorkspaceContext'

export function BrandLogoUploader({ brandId, logoUrl }: { brandId: string; logoUrl: string | null }) {
  const { activeWorkspace } = useWorkspace()
  const updateBrand = useUpdateBrand(brandId)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadBrandLogo(activeWorkspace.id, brandId, file)
      await updateBrand.mutateAsync({ logo_url: url })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-secondary/30 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : logoUrl ? (
          <img src={logoUrl} alt="Brand logo" className="h-full w-full object-cover" />
        ) : (
          <ImagePlus className="h-5 w-5" />
        )}
      </button>
      <div className="text-xs text-muted-foreground">
        <p>PNG or JPG, square works best.</p>
        {error && <p className="text-destructive">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
