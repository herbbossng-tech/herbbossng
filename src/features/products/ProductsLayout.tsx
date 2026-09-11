import { NavLink, Outlet } from 'react-router-dom'

import { cn } from '@/lib/utils'

const subNav = [
  { label: 'All Products', href: '/products' },
  { label: 'Categories', href: '/products/categories' },
  { label: 'Inventory', href: '/products/inventory' },
  { label: 'Product Settings', href: '/products/settings' },
]

export function ProductsLayout() {
  return (
    <div className="flex flex-col gap-5">
      <nav className="flex gap-1 overflow-x-auto border-b border-border">
        {subNav.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            end={item.href === '/products'}
            className={({ isActive }) =>
              cn(
                'shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
