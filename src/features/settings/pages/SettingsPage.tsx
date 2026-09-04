import {
  Bell,
  Building2,
  History,
  Package,
  Puzzle,
  ShieldAlert,
  ShieldCheck,
  Shuffle,
  Users,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { usePermissions } from '@/contexts/PermissionsContext'

interface SettingsLink {
  label: string
  description: string
  href: string
  icon: LucideIcon
  permission: string
}

interface SettingsSection {
  label: string
  links: SettingsLink[]
}

const sections: SettingsSection[] = [
  {
    label: 'General',
    links: [
      { label: 'Workspace', description: 'Name, slug, country, currency, timezone, logo, status.', href: '/workspace', icon: Building2, permission: 'workspace.view' },
      { label: 'Brands', description: 'Brand identity, domain, logo, and marketing/analytics identifiers.', href: '/brands', icon: Wallet, permission: 'brands.view' },
    ],
  },
  {
    label: 'Commerce',
    links: [
      { label: 'Product Defaults', description: 'Low-stock threshold and default affiliate commission.', href: '/products/settings', icon: Package, permission: 'products.view' },
    ],
  },
  {
    label: 'Operations',
    links: [
      { label: 'Assignment Rules', description: 'How Orders and Follow-up Tasks are handed to staff.', href: '/settings/assignment-rules', icon: Shuffle, permission: 'assignment_rules.view' },
      { label: 'Approval Rules', description: 'Amount thresholds and required approver roles for sensitive actions.', href: '/settings/approval-rules', icon: ShieldAlert, permission: 'approval_rules.view' },
    ],
  },
  {
    label: 'Security',
    links: [
      { label: 'Staff', description: 'Directory, invitations, status and role assignment.', href: '/staff', icon: Users, permission: 'staff.view' },
      { label: 'Roles & Permissions', description: 'Custom roles and the full permission matrix.', href: '/roles', icon: ShieldCheck, permission: 'roles_permissions.view' },
      { label: 'Audit Logs', description: 'Append-only record of every sensitive change in this workspace.', href: '/audit-logs', icon: History, permission: 'audit_logs.view' },
    ],
  },
  {
    label: 'Notifications',
    links: [
      { label: 'Notifications', description: 'Your notification feed and read/archive state.', href: '/notifications', icon: Bell, permission: 'notifications.view' },
    ],
  },
]

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Administrative configuration for this workspace, organized by area. Each card leads to a real, Supabase-backed screen — nothing here
          is a placeholder toggle.
        </p>
      </div>

      <SettingsSections />

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Puzzle className="h-4 w-4 text-muted-foreground" />
            Integrations
          </CardTitle>
          <CardDescription>
            Meta Pixel, Meta CAPI, Google Analytics/Tag Manager and Microsoft Clarity identifiers are configured per brand — open a brand's
            detail page under Brands. There is no separate global integrations screen because these values are always brand-scoped.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

function SettingsSections() {
  const { hasPermission } = usePermissions()

  return (
    <>
      {sections.map((section) => {
        const visibleLinks = section.links.filter((link) => hasPermission(link.permission))
        if (visibleLinks.length === 0) return null
        return (
          <div key={section.label}>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">{section.label}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleLinks.map((link) => (
                <Link key={link.href} to={link.href}>
                  <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
                    <CardContent className="flex items-start gap-3 p-5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <link.icon className="h-4.5 w-4.5" />
                      </span>
                      <div>
                        <p className="font-semibold text-foreground">{link.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{link.description}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}
