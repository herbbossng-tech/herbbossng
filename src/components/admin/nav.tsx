'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@prisma/client';
import { canAccess } from '@/lib/rbac';

const NAV_ITEMS: { href: string; label: string; resource: Parameters<typeof canAccess>[1] }[] = [
  { href: '/admin', label: 'Dashboard', resource: 'orders' },
  { href: '/admin/orders', label: 'Orders', resource: 'orders' },
  { href: '/admin/customers', label: 'Customers', resource: 'customers' },
  { href: '/admin/products', label: 'Products', resource: 'products' },
  { href: '/admin/offers', label: 'Offers', resource: 'offers' },
  { href: '/admin/inventory', label: 'Inventory', resource: 'inventory' },
  { href: '/admin/landing-pages', label: 'Landing Pages', resource: 'landing-pages' },
  { href: '/admin/analytics', label: 'Analytics', resource: 'analytics' },
  { href: '/admin/offices', label: 'Offices', resource: 'offices' },
  { href: '/admin/settings', label: 'Settings', resource: 'settings' },
];

export function AdminNav({ role }: { role: Role }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.filter((item) => canAccess(role, item.resource)).map((item) => {
        const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? 'bg-brand text-white' : 'text-brand-dark/70 hover:bg-brand/5'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
      {role === 'SUPER_ADMIN' && (
        <Link
          href="/admin/users"
          className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
            pathname.startsWith('/admin/users') ? 'bg-brand text-white' : 'text-brand-dark/70 hover:bg-brand/5'
          }`}
        >
          Users
        </Link>
      )}
    </nav>
  );
}
