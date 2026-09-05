import { ImagePlus, Loader2, X } from 'lucide-react'
import * as React from 'react'

import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { uploadLandingPageImage } from '@/features/landingPages/media'
import { cn } from '@/lib/utils'

interface LandingPageImageFieldProps {
  landingPageId: string
  value: string | undefined
  onChange: (url: string | undefined) => void
  label?: string
}

export function LandingPageImageField({ landingPageId, value, onChange, label }: LandingPageImageFieldProps) {
  const { activeWorkspace, activeBrand } = useWorkspace()
  const { user } = useAuth()
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!activeBrand || !user) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadLandingPageImage(activeWorkspace.id, activeBrand.id, landingPageId, file, user.id)
      onChange(url)
    } catch {
      setError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}
      <div className="flex items-center gap-3">
        {value ? (
          <div className="group relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border border-border">
            <img src={value} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="absolute right-1 top-1 rounded-md bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
              title="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className={cn(
              'flex h-20 w-32 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary',
            )}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            <span className="text-[10px] font-medium">Upload</span>
          </button>
        )}
        {value && (
          <button type="button" className="text-xs text-muted-foreground hover:text-primary" onClick={() => inputRef.current?.click()}>
            Replace
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
