import { AlertTriangle, ChevronLeft, Copy, ExternalLink, Eye, Loader2, Send } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingState } from '@/components/ui/state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { PermissionGate } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { duplicateLandingPage } from '@/features/landingPages/api'
import { PackagesManager } from '@/features/landingPages/components/PackagesManager'
import { PageSettingsForm } from '@/features/landingPages/components/PageSettingsForm'
import { SectionsManager } from '@/features/landingPages/components/SectionsManager'
import { useLandingPage, useLandingPagePackages, useLandingPageSections, useUnpublishLandingPage, useUpdateLandingPage } from '@/features/landingPages/hooks'
import { landingPageStatusLabels, landingPageStatusTone } from '@/features/landingPages/statusMeta'

export function LandingPageEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { activeWorkspace } = useWorkspace()

  const { data: page, isLoading, isError, refetch } = useLandingPage(id)
  const { data: sections } = useLandingPageSections(id)
  const { data: packages } = useLandingPagePackages(id)

  const updatePage = useUpdateLandingPage(id ?? '')
  const unpublishPage = useUnpublishLandingPage(id ?? '')
  const [publishing, setPublishing] = React.useState(false)
  const [duplicating, setDuplicating] = React.useState(false)

  if (isLoading) return <LoadingState label="Loading landing page…" />
  if (isError || !page) return <ErrorState message="We couldn't load this landing page." onRetry={() => refetch()} />

  const hasEnabledPackage = (packages ?? []).some((p) => p.enabled)
  const hasOrderForm = (sections ?? []).some((s) => s.type === 'ORDER_FORM' && s.enabled)
  const hasPackageSelector = (sections ?? []).some((s) => s.type === 'PACKAGE_SELECTOR' && s.enabled)
  const publishBlockers = [
    !page.product_id && 'Select a product for this page.',
    !hasEnabledPackage && 'Add at least one enabled package.',
    !hasPackageSelector && 'Enable a Package Selector section.',
    !hasOrderForm && 'Enable a COD Order Form section.',
  ].filter(Boolean) as string[]

  async function handlePublish() {
    if (!user || publishBlockers.length > 0) return
    setPublishing(true)
    try {
      await updatePage.mutateAsync({ status: 'published', published_at: new Date().toISOString() })
    } finally {
      setPublishing(false)
    }
  }

  async function handleDuplicate() {
    if (!user || !page) return
    setDuplicating(true)
    try {
      const copy = await duplicateLandingPage(page, user.id)
      navigate(`/landing-pages/${copy.id}/edit`)
    } finally {
      setDuplicating(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <Link to="/landing-pages" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
            Back to Landing Pages
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{page.name}</h1>
            <Badge variant={landingPageStatusTone[page.status]}>{landingPageStatusLabels[page.status]}</Badge>
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">/l/{page.slug}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/landing-pages/${page.id}/preview`}>
              <Eye className="h-4 w-4" />
              Preview
            </Link>
          </Button>
          {page.status === 'published' && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/l/${page.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                View live
              </a>
            </Button>
          )}
          <PermissionGate permission="landing_pages.update">
            <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={duplicating}>
              {duplicating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              Duplicate
            </Button>
            {page.status === 'published' ? (
              <Button variant="outline" size="sm" onClick={() => unpublishPage.mutate()} disabled={unpublishPage.isPending}>
                Unpublish
              </Button>
            ) : (
              <Button size="sm" onClick={handlePublish} disabled={publishing || publishBlockers.length > 0}>
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Publish
              </Button>
            )}
          </PermissionGate>
        </div>
      </div>

      {publishBlockers.length > 0 && page.status !== 'published' && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-foreground">Before this page can be published:</p>
            <ul className="mt-1 list-disc pl-4 text-muted-foreground">
              {publishBlockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Tabs defaultValue="sections">
        <TabsList>
          <TabsTrigger value="sections">Sections</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="sections">
          <SectionsManager landingPageId={page.id} />
        </TabsContent>
        <TabsContent value="packages">
          <PackagesManager landingPageId={page.id} currencyCode={activeWorkspace.currency_code} />
        </TabsContent>
        <TabsContent value="settings">
          <PageSettingsForm page={page} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
