import { AlertTriangle, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useMarketingCampaignList } from '@/features/marketing/hooks'
import { formatCurrency } from '@/lib/currency'

/** Operational budgeting only — no autonomous ad-spending, just visibility into utilization and warnings. */
export function MarketingBudgetPage() {
  const { activeWorkspace } = useWorkspace()
  const currency = activeWorkspace.currency_code
  const { data: rows, isLoading, isError, refetch } = useMarketingCampaignList({
    dateFrom: null,
    dateTo: null,
    status: 'active',
  })

  const budgeted = (rows ?? []).filter((r) => r.budget_total !== null && r.budget_total > 0)
  const money = (n: number | null) => (n === null ? '—' : formatCurrency(n, currency))

  function warningFor(utilization: number | null): { label: string; tone: 'warning' | 'destructive' } | null {
    if (utilization === null) return null
    if (utilization >= 100) return { label: 'Exhausted', tone: 'destructive' }
    if (utilization >= 90) return { label: 'Approaching limit', tone: 'warning' }
    return null
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Budget</h1>
        <p className="mt-1 text-sm text-muted-foreground">Spend-to-date and remaining budget for active campaigns with a configured budget.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="px-5 py-8">
              <ErrorState message="Couldn't load budget status." onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="px-5 py-8">
              <LoadingState label="Loading budget status…" />
            </div>
          ) : budgeted.length === 0 ? (
            <div className="px-5 py-8">
              <EmptyState icon={Wallet} title="No active budgets configured" description="Set a total budget on an active campaign to track utilization here." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3 font-semibold">Campaign</th>
                    <th className="px-5 py-3 font-semibold">Budget</th>
                    <th className="px-5 py-3 font-semibold">Spend-to-Date</th>
                    <th className="px-5 py-3 font-semibold">Remaining</th>
                    <th className="px-5 py-3 font-semibold">Utilization</th>
                    <th className="px-5 py-3 font-semibold">Warning</th>
                  </tr>
                </thead>
                <tbody>
                  {budgeted.map((row) => {
                    const warning = warningFor(row.budget_utilization_pct)
                    const remaining = row.budget_total !== null && row.spend !== null ? row.budget_total - row.spend : null
                    return (
                      <tr key={row.campaign_id} className="border-t border-border/60">
                        <td className="px-5 py-3">
                          <Link to={`/marketing/campaigns/${row.campaign_id}`} className="font-medium text-foreground hover:underline">
                            {row.name}
                          </Link>
                        </td>
                        <td className="px-5 py-3">{money(row.budget_total)}</td>
                        <td className="px-5 py-3">{money(row.spend)}</td>
                        <td className="px-5 py-3">{remaining === null ? '—' : money(remaining)}</td>
                        <td className="px-5 py-3">{row.budget_utilization_pct === null ? '—' : `${row.budget_utilization_pct}%`}</td>
                        <td className="px-5 py-3">
                          {warning ? (
                            <Badge variant={warning.tone}>
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              {warning.label}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
