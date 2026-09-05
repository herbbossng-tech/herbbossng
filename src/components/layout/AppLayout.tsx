import { Building2, Loader2, LogOut } from 'lucide-react'
import * as React from 'react'
import { Outlet } from 'react-router-dom'

import { CommandPalette } from '@/components/command/CommandPalette'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { cn } from '@/lib/utils'

function FullScreenLoading() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  )
}

function NoWorkspaceAccess() {
  const { user, signOut } = useAuth()

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-10">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Building2 className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-xl font-bold">No workspace access</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {user?.email ? <span className="font-medium text-foreground">{user.email}</span> : 'Your account'} isn't a member of any Golden
              Commerce OS workspace yet. Ask a workspace Owner or Admin to invite you.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function AppLayout() {
  const [collapsed, setCollapsed] = React.useState(false)
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)
  const [commandOpen, setCommandOpen] = React.useState(false)
  const { isLoading: workspaceLoading, hasWorkspaceAccess } = useWorkspace()
  const { isLoading: permissionsLoading } = usePermissions()

  if (workspaceLoading) {
    return <FullScreenLoading />
  }

  if (!hasWorkspaceAccess) {
    return <NoWorkspaceAccess />
  }

  if (permissionsLoading) {
    return <FullScreenLoading />
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((v) => !v)} className="hidden lg:flex" />

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
          />
          <Sidebar
            collapsed={false}
            onToggleCollapse={() => setMobileNavOpen(false)}
            className={cn('absolute inset-y-0 left-0 z-50 flex shadow-2xl')}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} onOpenCommand={() => setCommandOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  )
}
