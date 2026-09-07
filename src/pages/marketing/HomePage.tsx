import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Globe2,
  Headset,
  Layers,
  LayoutGrid,
  LineChart,
  Lock,
  Megaphone,
  Menu,
  Package,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UsersRound,
  Workflow,
  X,
} from 'lucide-react'
import * as React from 'react'
import { Link, Navigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LoadingState } from '@/components/ui/state'
import { useAuth } from '@/contexts/AuthContext'

const modules = [
  {
    icon: ShoppingCart,
    name: 'Orders & COD',
    description:
      'Capture orders from any channel, confirm by phone, track cash-on-delivery status from dispatch through collection — one order record from first contact to remittance.',
  },
  {
    icon: Package,
    name: 'Inventory & Warehouses',
    description:
      'Stock levels, transactions and warehouse-aware fulfillment so a confirmed order is never dispatched against stock that doesn’t exist.',
  },
  {
    icon: Truck,
    name: 'Delivery Operations',
    description:
      'Rescue boards for stalled deliveries, delivery-partner tracking, and a rescue-case workflow for orders that need a second attempt.',
  },
  {
    icon: Banknote,
    name: 'Finance & Reconciliation',
    description:
      'Cash collection, settlements, expenses and revenue reporting reconciled against the same order ledger everyone else in the business sees.',
  },
  {
    icon: LayoutGrid,
    name: 'Landing Pages',
    description:
      'A built-in page builder with templates, package pricing and an embedded COD checkout — plus Meta and TikTok pixel/CAPI tracking wired in.',
  },
  {
    icon: Megaphone,
    name: 'Marketing Intelligence',
    description:
      'Ad spend, campaign performance and attribution tied back to real delivered revenue — not guesses.',
  },
  {
    icon: UsersRound,
    name: 'Affiliates',
    description:
      'Referral tracking, commission calculation, wallets and withdrawal approvals for a partner-driven sales channel.',
  },
  {
    icon: Headset,
    name: 'Customer Support',
    description:
      'A shared view of every customer’s order history, notes and follow-ups, so no conversation starts from zero.',
  },
  {
    icon: Workflow,
    name: 'Automation',
    description:
      'Rule-based actions on order and task events — assignment, status changes, notifications — running on real triggers, not a cron job someone forgot about.',
  },
]

const lifecycleSteps = [
  'Captured',
  'Assigned',
  'Confirmed',
  'Fulfilled',
  'Delivered',
  'Cash Collected',
  'Remitted',
  'Reconciled',
  'Reported',
]

const roleCards = [
  { role: 'Customer Support', sees: 'Their assigned orders, follow-ups due, and customer history — not the finance ledger.' },
  { role: 'Warehouse Staff', sees: 'Fulfillment queues, stock levels and dispatch tasks — not affiliate commissions.' },
  { role: 'Finance', sees: 'Revenue, settlements and cash collection — not another team’s support notes.' },
  { role: 'Owner / Admin', sees: 'The whole operation, exactly as configured — every module, every workspace they belong to.' },
]

const capabilities = [
  { icon: Globe2, title: 'Multi-workspace, multi-currency', body: 'Each workspace carries its own country and currency. Switch context and every order, report and figure switches with it — never a mixed ledger.' },
  { icon: ShieldCheck, title: 'Role-based access', body: 'Nine built-in roles, from Owner to Viewer, enforced at the database layer — not just hidden buttons in the UI.' },
  { icon: Lock, title: 'Workspace isolation', body: 'Row-level security scopes every table to the workspaces a user actually belongs to. There is no query path around it.' },
  { icon: LineChart, title: 'Real reporting', body: 'Dashboards and reports read the same order and finance data your team works from all day — not a separate, drifting copy.' },
]

function HomeHeader() {
  const [open, setOpen] = React.useState(false)
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Layers className="h-4.5 w-4.5" strokeWidth={2.5} />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-extrabold tracking-wide text-foreground">
              GOLDEN <span className="text-primary">COD</span>
            </span>
            <span className="block text-[10px] font-semibold tracking-widest text-muted-foreground">COMMERCE OS</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <a href="#modules" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Modules
          </a>
          <a href="#how-it-works" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            How it works
          </a>
          <a href="#security" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Security
          </a>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/login">
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground md:hidden"
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border/70 px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1">
            <a href="#modules" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent">
              Modules
            </a>
            <a href="#how-it-works" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent">
              How it works
            </a>
            <a href="#security" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent">
              Security
            </a>
            <div className="mt-2 flex flex-col gap-2 border-t border-border/70 pt-3">
              <Button variant="outline" asChild>
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild>
                <Link to="/login">
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}

function HomeContent() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <HomeHeader />

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border/70">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(60rem 30rem at 50% -10%, var(--color-primary) 0%, transparent 60%)',
            opacity: 0.08,
          }}
        />
        <div className="relative mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 sm:py-28 lg:px-8">
          <Badge variant="secondary" className="mx-auto">
            Built for African COD commerce operations
          </Badge>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            One operating system for your entire commerce operation
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Orders, inventory, delivery, finance, marketing, landing pages, affiliates and customer support — running
            on one shared record, with every staff member seeing exactly the slice of it their role permits.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link to="/login">
                Get started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#modules">Explore the platform</a>
            </Button>
          </div>
        </div>
      </section>

      {/* PROBLEM / OPERATOR REALITY */}
      <section className="border-b border-border/70 bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">The reality most COD operators run on</h2>
              <p className="mt-4 text-muted-foreground">
                A spreadsheet for orders. WhatsApp for confirmations. Another spreadsheet for delivery status. A
                notebook for cash collected. A separate dashboard for ad spend. None of it agrees with any of the
                others, and nobody can say — right now — how many orders are actually sitting unassigned.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {['Spreadsheets', 'WhatsApp threads', 'Manual order forms', 'Disconnected delivery tools', 'Standalone finance sheets', 'Separate ad dashboards'].map(
                (item) => (
                  <div key={item} className="rounded-lg border border-border/70 bg-background px-3 py-2.5 text-sm text-muted-foreground">
                    {item}
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ONE SOURCE OF TRUTH */}
      <section className="border-b border-border/70">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">One order record. Every team works from it.</h2>
          <p className="mt-4 text-muted-foreground">
            GCOS replaces the disconnected tools with a single operational system. An order captured on a landing
            page is the same order a warehouse team fulfills, a delivery rider updates, a finance team reconciles,
            and a support agent follows up on — never re-entered, never out of sync.
          </p>
        </div>
      </section>

      {/* MODULES */}
      <section id="modules" className="border-b border-border/70 bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Everything one commerce operation needs</h2>
            <p className="mt-3 text-muted-foreground">Nine connected modules, not nine separate products.</p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((mod) => (
              <Card key={mod.name} className="flex flex-col gap-3 p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <mod.icon className="h-5 w-5" />
                </span>
                <p className="font-semibold text-foreground">{mod.name}</p>
                <p className="text-sm text-muted-foreground">{mod.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ROLE-AWARE OPERATIONS */}
      <section className="border-b border-border/70">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Every staff member sees their own operation</h2>
            <p className="mt-3 text-muted-foreground">
              Role-based access is enforced at the database layer, not just a hidden sidebar item.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {roleCards.map((r) => (
              <Card key={r.role} className="flex flex-col gap-2 p-5">
                <p className="font-semibold text-foreground">{r.role}</p>
                <p className="text-sm text-muted-foreground">{r.sees}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* OPERATIONAL LIFECYCLE / HOW IT WORKS */}
      <section id="how-it-works" className="border-b border-border/70 bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">One order, start to finish</h2>
            <p className="mt-3 text-muted-foreground">The same lifecycle every order in GCOS moves through.</p>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {lifecycleSteps.map((step, i) => (
              <React.Fragment key={step}>
                <div className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground">
                  {step}
                </div>
                {i < lifecycleSteps.length - 1 && <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* MULTI-COUNTRY / CURRENCY + CAPABILITIES */}
      <section className="border-b border-border/70">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Built for how the operation actually runs</h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {capabilities.map((cap) => (
              <Card key={cap.title} className="flex gap-4 p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <cap.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-foreground">{cap.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{cap.body}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* SECURITY / TRUST */}
      <section id="security" className="border-b border-border/70 bg-card/40">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <BadgeCheck className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Access boundaries you can rely on</h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Every workspace, brand, order and financial record is scoped by row-level security in the database —
            the same boundary a permission check in the interface enforces, not a separate, weaker one. A staff
            member's access follows their role wherever they look: the dashboard, search, or a direct link.
          </p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section>
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Bring your operation onto one system</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Sign in to your workspace, or ask your workspace owner for an invitation.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link to="/login">
                Sign in
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Layers className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            <span className="font-semibold text-foreground">Golden COD — Commerce OS</span>
          </div>
          <p>&copy; {new Date().getFullYear()} Golden COD. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

/**
 * The public entry point at "/". An authenticated session is redirected
 * straight to /dashboard — this marketing page is for signed-out
 * visitors only, never a second landing surface for existing operators.
 */
export function HomePage() {
  const { session, loading } = useAuth()

  if (loading) {
    return <LoadingState label="Loading…" />
  }

  if (session) {
    return <Navigate to="/dashboard" replace />
  }

  return <HomeContent />
}
