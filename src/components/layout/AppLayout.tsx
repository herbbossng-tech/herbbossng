import * as React from 'react'
import { Outlet } from 'react-router-dom'

import { CommandPalette } from '@/components/command/CommandPalette'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const [collapsed, setCollapsed] = React.useState(false)
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)
  const [commandOpen, setCommandOpen] = React.useState(false)

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
