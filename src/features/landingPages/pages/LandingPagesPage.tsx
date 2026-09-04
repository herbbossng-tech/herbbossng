import { Archive, Copy, ExternalLink, MoreHorizontal, Pencil, Plus, Search, Send, SquareStack, Trash2 } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { useAuth } from '@/contexts/AuthContext'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { archiveLandingPage, duplicateLandingPage, publishLandingPage, unpublishLandingPage } from '@/features/landingPages/api'
import { useDeleteLandingPage, useLandingPages } from '@/features/landingPages/hooks'
import { landingPageStatusLabels, landingPageStatusTone, pageTypeLabels } from '@/features/landingPages/statusMeta'
import type { LandingPageFilters, LandingPageListItem } from '@/features/landingPages/types'
import type { LandingPage } from '@/types/database'

const PAGE_SIZE = 25

export function LandingPagesPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = React.useState<LandingPageFilters>({ status: 'all', page: 1, pageSize: PAGE_SIZE })
  const [searchInput, setSearchInput] = React.useState('')
  const [pendingDelete, setPendingDelete] = React.useState<LandingPageListItem | null>(null)

  React.useEffect(() => {
    const handle = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput, page: 1 })), 300)
    return () => clearTimeout(handle)
  }, [searchInput])

  const { user } = useAuth()
  const { data, isLoading, isError, refetch } = useLandingPages(filters)
  const canCreate = usePermission('landing_pages.create')
  const canUpdate = usePermission('landing_pages.update')
  const canDelete = usePermission('landing_pages.delete')

  const rows = data?.rows ?? []
  const [actionPending, setActionPending] = React.useState<string | null>(null)
  const deletePage = useDeleteLandingPage()

  async function runAction(page: LandingPageListItem, action: (id: string, userId: string) => Promise<unknown>) {
    if (!user) return
    setActionPending(page.id)
    try {
      await action(page.id, user.id)
      refetch()
    } finally {
      setActionPending(null)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Landing Pages</h1>
          <p className="mt-1 text-sm text-muted-foreground">Build and manage COD funnel pages for your products.</p>
        </div>
        <div className="flex items-center gap-2">
          <PermissionGate permission="landing_pages.templates.view">
            <Button variant="outline" asChild>
              <Link to="/landing-pages/templates">
                <SquareStack className="h-4 w-4" />
                Templates
              </Link>
            </Button>
          </PermissionGate>
          <PermissionGate permission="landing_pages.create">
            <Button asChild>
              <Link to="/landing-pages/new">
                <Plus className="h-4 w-4" />
                Create Landing Page
              </Link>
            </Button>
          </PermissionGate>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Page name or slug…" className="pl-9" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <Select value={filters.status ?? 'all'} onValueChange={(v) => setFilters((f) => ({ ...f, status: v as LandingPageFilters['status'], page: 1 }))}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(landingPageStatusLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <LoadingState label="Loading landing pages…" />}
      {isError && <ErrorState message="We couldn't load landing pages." onRetry={() => refetch()} />}
      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState
          icon={SquareStack}
          title="No landing pages yet"
          description="Create your first landing page to start generating COD orders."
          action={
            canCreate && (
              <Button asChild size="sm">
                <Link to="/landing-pages/new">
                  <Plus className="h-4 w-4" />
                  Create Landing Page
                </Link>
              </Button>
            )
          }
        />
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Page</th>
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Orders</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((page) => (
                <tr
                  key={page.id}
                  onClick={() => navigate(`/landing-pages/${page.id}/edit`)}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-accent/40"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{page.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">/l/{page.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{page.product_name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{pageTypeLabels[page.page_type] ?? page.page_type}</td>
                  <td className="px-4 py-3">
                    <Badge variant={landingPageStatusTone[page.status]}>{landingPageStatusLabels[page.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 font-semibold">{page.order_count}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(page.updated_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/landing-pages/${page.id}/edit`)}>
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/landing-pages/${page.id}/preview`)}>
                          <ExternalLink className="h-3.5 w-3.5" />
                          Preview
                        </DropdownMenuItem>
                        {page.status === 'published' && (
                          <DropdownMenuItem asChild>
                            <a href={`/l/${page.slug}`} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3.5 w-3.5" />
                              View live page
                            </a>
                          </DropdownMenuItem>
                        )}
                        {canUpdate && (
                          <>
                            <DropdownMenuSeparator />
                            {page.status !== 'published' && page.status !== 'archived' && (
                              <DropdownMenuItem onClick={() => runAction(page, publishLandingPage)} disabled={actionPending === page.id}>
                                <Send className="h-3.5 w-3.5" />
                                Publish
                              </DropdownMenuItem>
                            )}
                            {page.status === 'published' && (
                              <DropdownMenuItem onClick={() => runAction(page, unpublishLandingPage)} disabled={actionPending === page.id}>
                                <Send className="h-3.5 w-3.5" />
                                Unpublish
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => user && duplicateLandingPage(page as LandingPage, user.id).then(() => refetch())}
                              disabled={actionPending === page.id}
                            >
                              <Copy className="h-3.5 w-3.5" />
                              Duplicate
                            </DropdownMenuItem>
                            {page.status !== 'archived' && (
                              <DropdownMenuItem onClick={() => runAction(page, archiveLandingPage)} disabled={actionPending === page.id}>
                                <Archive className="h-3.5 w-3.5" />
                                Archive
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setPendingDelete(page)} className="text-destructive focus:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the page and its sections/packages. Orders already generated from it are kept — only the landing_page_id link is
              cleared. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) deletePage.mutate(pendingDelete.id, { onSuccess: () => refetch() })
                setPendingDelete(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
