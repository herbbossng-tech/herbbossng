"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Section } from "@/lib/rbac";

type NavItem = { href: string; label: string; section: Section };

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", section: "dashboard" },
  { href: "/admin/orders", label: "Orders", section: "orders" },
  { href: "/admin/customers", label: "Customers", section: "customers" },
  { href: "/admin/products", label: "Products", section: "products" },
  { href: "/admin/offers", label: "Offers", section: "offers" },
  { href: "/admin/inventory", label: "Inventory", section: "inventory" },
  { href: "/admin/landing-pages", label: "Landing Pages", section: "landing_pages" },
  { href: "/admin/analytics", label: "Analytics", section: "analytics" },
  { href: "/admin/marketing", label: "Marketing", section: "marketing" },
  { href: "/admin/email", label: "Email", section: "email" },
  { href: "/admin/offices", label: "Offices", section: "offices" },
  { href: "/admin/settings", label: "Settings", section: "settings" },
  { href: "/admin/users", label: "Users", section: "users" },
  { href: "/admin/audit-logs", label: "Audit Logs", section: "audit_logs" },
];

export function AdminShell({
  children,
  userName,
  userRole,
  allowedSections,
  offices,
  currentOfficeId,
}: {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  allowedSections: Section[];
  offices: { id: string; name: string; countryCode: string }[];
  currentOfficeId: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleNav = NAV.filter((item) => allowedSections.includes(item.section));

  async function switchOffice(officeId: string) {
    await fetch("/api/admin/office", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ officeId }),
    });
    router.refresh();
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-64 transform border-r border-zinc-200 bg-brand-green-900 text-white transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2 px-5 border-b border-white/10">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gold-500 text-xs font-bold text-brand-green-900">
            CC
          </div>
          <span className="font-semibold">COD Commerce</span>
        </div>
        <nav className="flex flex-col gap-0.5 p-3">
          {visibleNav.map((item) => {
            const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col lg:pl-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 sm:px-6">
          <button
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
          >
            Menu
          </button>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-zinc-500 sm:inline">Office:</span>
            <select
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm"
              value={currentOfficeId ?? ""}
              onChange={(e) => switchOffice(e.target.value)}
            >
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.countryCode})
                </option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right text-sm">
              <div className="font-medium text-zinc-900">{userName}</div>
              <div className="text-xs text-zinc-500">{userRole.replace(/_/g, " ")}</div>
            </div>
            <button
              onClick={logout}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              Log out
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
