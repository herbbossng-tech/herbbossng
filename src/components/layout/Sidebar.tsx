import { Layers } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { primaryNav, secondaryNav } from '@/data/navigation'
import { cn } from '@/lib/utils'

function NavList({ items }: { items: typeof primaryNav }) {
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === '/'}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-sidebar-active text-sidebar-active-foreground shadow-sm'
                : 'text-sidebar-foreground hover:bg-white/5 hover:text-foreground',
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  isActive ? 'text-sidebar-active-foreground' : 'text-muted-foreground group-hover:text-foreground',
                )}
              />
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge && (
                <Badge variant={isActive ? 'outline' : 'secondary'} className={cn(isActive && 'border-black/20 text-sidebar-active-foreground')}>
                  {item.badge}
                </Badge>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export function Sidebar() {
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 lg:flex">
      <div className="flex items-center gap-3 px-2 pb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Layers className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-extrabold tracking-wide text-foreground">
            GOLDEN <span className="text-primary">COD</span>
          </p>
          <p className="text-[10px] font-semibold tracking-widest text-muted-foreground">COMMERCE OS</p>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto pr-1">
        <NavList items={primaryNav} />
        <div>
          <Separator />
          <div className="mt-4">
            <NavList items={secondaryNav} />
          </div>
        </div>
      </div>
    </aside>
  )
}

function Separator() {
  return <div className="h-px w-full bg-sidebar-border" />
}
