import { Layers, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { type NavItem, navSections } from '@/data/navigation'
import { usePermissions } from '@/contexts/PermissionsContext'
import { cn } from '@/lib/utils'

function NavList({ items, collapsed }: { items: NavItem[]; collapsed: boolean }) {
  const { hasPermission } = usePermissions()
  const visibleItems = items.filter((item) => !item.permission || hasPermission(item.permission))
  if (visibleItems.length === 0) return null

  return (
    <nav className="flex flex-col gap-1">
      {visibleItems.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          end={item.href === '/'}
          title={collapsed ? item.label : undefined}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              collapsed && 'justify-center px-0',
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
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && (
                    <Badge
                      variant={isActive ? 'outline' : 'secondary'}
                      className={cn(isActive && 'border-black/20 text-sidebar-active-foreground')}
                    >
                      {item.badge}
                    </Badge>
                  )}
                </>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  className,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
  className?: string
}) {
  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar py-5 transition-[width] duration-200',
        collapsed ? 'w-[76px] px-2' : 'w-72 px-4',
        className,
      )}
    >
      <div className={cn('flex items-center gap-3 pb-6', collapsed ? 'justify-center px-0' : 'px-2')}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Layers className="h-5 w-5" strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-extrabold tracking-wide text-foreground">
              GOLDEN <span className="text-primary">COD</span>
            </p>
            <p className="truncate text-[10px] font-semibold tracking-widest text-muted-foreground">COMMERCE OS</p>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto pr-1">
        {navSections.map((section, index) => (
          <div key={section.label ?? index}>
            {section.label && !collapsed && (
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {section.label}
              </p>
            )}
            {index > 0 && (section.label ? null : <div className="mb-4 h-px w-full bg-sidebar-border" />)}
            <NavList items={section.items} collapsed={collapsed} />
          </div>
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleCollapse}
        className={cn('mt-2 text-muted-foreground hover:text-foreground', collapsed ? 'justify-center px-0' : 'justify-start')}
      >
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        {!collapsed && 'Collapse'}
      </Button>
    </aside>
  )
}
