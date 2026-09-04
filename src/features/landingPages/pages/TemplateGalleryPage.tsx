import { ChevronLeft, Copy, Lock, SquareStack } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { useCloneLandingPageTemplate, useLandingPageTemplates } from '@/features/landingPages/hooks'
import type { LandingPageTemplate } from '@/features/landingPages/types'

export function TemplateGalleryPage() {
  const canView = usePermission('landing_pages.templates.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Templates are hidden" description="You don't have permission to view landing page templates." />
      </Card>
    )
  }
  return <TemplateGalleryContent />
}

function TemplateGalleryContent() {
  const navigate = useNavigate()
  const { data: templates, isLoading, isError, refetch } = useLandingPageTemplates()
  const canManage = usePermission('landing_pages.templates.manage')
  const cloneTemplate = useCloneLandingPageTemplate()
  const [cloneTarget, setCloneTarget] = React.useState<LandingPageTemplate | null>(null)
  const [cloneName, setCloneName] = React.useState('')
  const [cloneError, setCloneError] = React.useState<string | null>(null)

  if (isLoading) return <LoadingState label="Loading templates…" />
  if (isError) return <ErrorState message="Couldn't load templates." onRetry={() => refetch()} />

  const systemTemplates = (templates ?? []).filter((t) => t.is_system)
  const customTemplates = (templates ?? []).filter((t) => !t.is_system)

  async function submitClone() {
    if (!cloneTarget) return
    setCloneError(null)
    if (!cloneName.trim()) {
      setCloneError('Enter a name for your custom template')
      return
    }
    try {
      const cloned = await cloneTemplate.mutateAsync({ templateId: cloneTarget.id, name: cloneName.trim() })
      setCloneTarget(null)
      setCloneName('')
      navigate(`/landing-pages/new?template=${cloned.id}`)
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : 'Could not duplicate this template')
    }
  }

  function TemplateCard({ template }: { template: LandingPageTemplate }) {
    return (
      <Card className="flex flex-col overflow-hidden">
        <div className="flex aspect-[4/3] items-center justify-center bg-muted">
          {template.preview_image_url ? (
            <img src={template.preview_image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <SquareStack className="h-10 w-10 text-muted-foreground" />
          )}
        </div>
        <CardHeader className="flex-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{template.name}</CardTitle>
            {!template.is_system && <Badge variant="secondary">Custom</Badge>}
          </div>
          {template.description && <p className="text-sm text-muted-foreground">{template.description}</p>}
          <p className="text-xs text-muted-foreground">{template.starter_sections.length} sections</p>
        </CardHeader>
        <CardFooter className="flex gap-2">
          <Button size="sm" className="flex-1" asChild>
            <Link to={`/landing-pages/new?template=${template.id}`}>Use This Template</Link>
          </Button>
          <PermissionGate permission="landing_pages.templates.manage">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCloneTarget(template)
                setCloneName(`My ${template.name}`)
                setCloneError(null)
              }}
            >
              <Copy className="h-4 w-4" />
              Duplicate
            </Button>
          </PermissionGate>
        </CardFooter>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to="/landing-pages" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back to Landing Pages
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Template Gallery</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          System templates are shared across every workspace and read-only. Duplicate one to customize it into your own workspace template — edit
          sections, save, and reuse it for future pages.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">System Templates</h2>
        {systemTemplates.length === 0 ? (
          <EmptyState icon={SquareStack} title="No system templates" description="No system templates are available yet." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {systemTemplates.map((t) => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
        )}
      </div>

      {(customTemplates.length > 0 || canManage) && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Your Workspace Templates</h2>
          {customTemplates.length === 0 ? (
            <EmptyState icon={Copy} title="No custom templates yet" description="Duplicate a system template above to start customizing your own." />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {customTemplates.map((t) => (
                <TemplateCard key={t.id} template={t} />
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={!!cloneTarget} onOpenChange={(open) => !open && setCloneTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate "{cloneTarget?.name}"</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5 py-2">
            <Label>New template name</Label>
            <Input value={cloneName} onChange={(e) => setCloneName(e.target.value)} placeholder="e.g. My Ginseng Template" />
            {cloneError && <p className="text-xs text-destructive">{cloneError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCloneTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitClone} disabled={cloneTemplate.isPending}>
              {cloneTemplate.isPending ? 'Duplicating…' : 'Duplicate Template'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
