import { Menu, Search } from 'lucide-react'

import { BrandSwitcher } from '@/components/layout/BrandSwitcher'
import { NotificationsMenu } from '@/components/layout/NotificationsMenu'
import { ProfileMenu } from '@/components/layout/ProfileMenu'
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher'
import { Button } from '@/components/ui/button'

export function Topbar({
  onOpenMobileNav,
  onOpenCommand,
}: {
  onOpenMobileNav: () => void
  onOpenCommand: () => void
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar/60 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMobileNav} aria-label="Open navigation">
          <Menu className="h-4 w-4" />
        </Button>
        <div className="hidden items-center gap-2 sm:flex">
          <WorkspaceSwitcher />
          <BrandSwitcher />
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenCommand}
        className="hidden min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary md:flex md:max-w-sm"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Search orders, customers, products…</span>
        <kbd className="ml-auto hidden shrink-0 items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground lg:flex">
          ⌘K
        </kbd>
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenCommand} aria-label="Search">
          <Search className="h-4 w-4" />
        </Button>
        <NotificationsMenu />
        <ProfileMenu />
      </div>
    </header>
  )
}
