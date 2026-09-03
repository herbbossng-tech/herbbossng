import { Download, Lock, Search } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, LoadingState } from '@/components/ui/state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePermission } from '@/contexts/PermissionsContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useAffiliatePerformance } from '@/features/affiliates/hooks'
import { useAdCostSummary } from '@/features/adCosts/hooks'
import { useCampaignPerformance } from '@/features/campaigns/hooks'
import { useCustomers } from '@/features/customers/hooks'
import { DateRangeFilter, type DateRangePreset } from '@/features/finance/components/DateRangeFilter'
import { resolveDateRange } from '@/features/finance/dateRanges'
import { useFinanceSummary, useOrderStatusValueBreakdown, useProductPerformance } from '@/features/finance/hooks'
import { useDeliveryReportRows, useSalesReportRows } from '@/features/reports/hooks'
import { orderStatuses, orderStatusLabels } from '@/features/orders/statusMeta'
import { formatCurrency } from '@/lib/currency'
import { exportToCsv } from '@/lib/csv'

export function ReportsPage() {
  const canView = usePermission('reports.view')
  if (!canView) {
    return (
      <Card className="p-8">
        <EmptyState icon={Lock} title="Reports is hidden" description="You don't have permission to view reports in this workspace. Ask a workspace admin for the reports.view permission." />
      </Card>
    )
  }
  return <ReportsContent />
}

function ReportsContent() {
  const { activeWorkspace } = useWorkspace()
  const canExport = usePermission('reports.export')

  const [preset, setPreset] = React.useState<DateRangePreset>('last30days')
  const [customFrom, setCustomFrom] = React.useState('')
  const [customTo, setCustomTo] = React.useState('')

  const range = React.useMemo(
    () => resolveDateRange(preset, activeWorkspace.timezone || 'UTC', { from: customFrom, to: customTo }),
    [preset, customFrom, customTo, activeWorkspace.timezone],
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">Predefined, exportable reports for {activeWorkspace.name}.</p>
        </div>
        <DateRangeFilter
          value={range}
          onChange={setPreset}
          customFrom={customFrom}
          customTo={customTo}
          onCustomChange={(f, t) => {
            setCustomFrom(f)
            setCustomTo(t)
            setPreset('custom')
          }}
        />
      </div>

      <Tabs defaultValue="sales">
        <TabsList className="flex-wrap">
          <TabsTrigger value="sales">Sales Report</TabsTrigger>
          <TabsTrigger value="delivery">Delivery Report</TabsTrigger>
          <TabsTrigger value="products">Product Performance</TabsTrigger>
          <TabsTrigger value="customers">Customer Report</TabsTrigger>
          <TabsTrigger value="summary">Financial Summary</TabsTrigger>
          <TabsTrigger value="affiliates">Affiliate Performance</TabsTrigger>
          <TabsTrigger value="campaigns">Campaign Performance</TabsTrigger>
          <TabsTrigger value="ad-costs">Ad Costs</TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          <SalesReportTab dateFrom={range.from} dateTo={range.to} canExport={canExport} currency={activeWorkspace.currency_code} />
        </TabsContent>
        <TabsContent value="delivery">
          <DeliveryReportTab dateFrom={range.from} dateTo={range.to} canExport={canExport} currency={activeWorkspace.currency_code} />
        </TabsContent>
        <TabsContent value="products">
          <ProductPerformanceReportTab dateFrom={range.from} dateTo={range.to} canExport={canExport} currency={activeWorkspace.currency_code} />
        </TabsContent>
        <TabsContent value="customers">
          <CustomerReportTab canExport={canExport} currency={activeWorkspace.currency_code} />
        </TabsContent>
        <TabsContent value="summary">
          <FinancialSummaryReportTab dateFrom={range.from} dateTo={range.to} canExport={canExport} currency={activeWorkspace.currency_code} />
        </TabsContent>
        <TabsContent value="affiliates">
          <AffiliatePerformanceReportTab dateFrom={range.from} dateTo={range.to} canExport={canExport} currency={activeWorkspace.currency_code} />
        </TabsContent>
        <TabsContent value="campaigns">
          <CampaignPerformanceReportTab canExport={canExport} currency={activeWorkspace.currency_code} />
        </TabsContent>
        <TabsContent value="ad-costs">
          <AdCostReportTab canExport={canExport} currency={activeWorkspace.currency_code} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ReportToolbar({
  search,
  onSearch,
  status,
  onStatus,
  onExport,
  canExport,
  exportDisabled,
}: {
  search: string
  onSearch: (v: string) => void
  status?: string
  onStatus?: (v: string) => void
  onExport: () => void
  canExport: boolean
  exportDisabled: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search…" value={search} onChange={(e) => onSearch(e.target.value)} />
        </div>
        {onStatus && (
          <Select value={status} onValueChange={onStatus}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {orderStatuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {orderStatusLabels[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {canExport && (
        <Button variant="outline" size="sm" onClick={onExport} disabled={exportDisabled}>
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      )}
    </div>
  )
}

function SalesReportTab({ dateFrom, dateTo, canExport, currency }: { dateFrom: string | null; dateTo: string | null; canExport: boolean; currency: string }) {
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const { data, isLoading } = useSalesReportRows({ dateFrom, dateTo, status, search, page: 1, pageSize: 100 })
  const { data: summary } = useFinanceSummary({ dateFrom, dateTo })

  function handleExport() {
    if (!data || data.rows.length === 0) return
    exportToCsv(
      `sales-report-${new Date().toISOString().slice(0, 10)}.csv`,
      data.rows.map((r) => ({
        date: r.created_at,
        order_id: r.order_number,
        customer: r.customer_name,
        product: r.product_summary,
        order_value: r.total_amount,
        status: r.status,
        delivered_value: r.delivered_value,
        currency: r.currency_code,
      })),
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6 text-sm">
          <SummaryTile label="Total Sales" value={formatCurrency(summary.total_sales_value, currency)} />
          <SummaryTile label="Delivered Revenue" value={formatCurrency(summary.delivered_revenue, currency)} />
          <SummaryTile label="Pending Revenue" value={formatCurrency(summary.pending_revenue, currency)} />
          <SummaryTile label="Returned Value" value={formatCurrency(summary.returned_value, currency)} />
          <SummaryTile label="Cancelled Value" value={formatCurrency(summary.cancelled_value, currency)} />
          <SummaryTile label="AOV" value={formatCurrency(summary.average_order_value, currency)} />
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sales Report</CardTitle>
          <CardDescription>Up to 100 most recent matching orders for this period. Adjust filters to narrow it down.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ReportToolbar search={search} onSearch={setSearch} status={status} onStatus={setStatus} onExport={handleExport} canExport={canExport} exportDisabled={!data || data.rows.length === 0} />
          {isLoading ? (
            <LoadingState label="Loading sales report…" />
          ) : (data?.rows.length ?? 0) === 0 ? (
            <EmptyState icon={Lock} title="No matching orders" description="Try widening the date range or clearing filters." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">Date</th>
                    <th className="px-4 py-2.5 font-semibold">Order ID</th>
                    <th className="px-4 py-2.5 font-semibold">Customer</th>
                    <th className="px-4 py-2.5 font-semibold">Product</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Order Value</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Delivered Value</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.rows.map((r) => (
                    <tr key={r.id} className="border-t border-border/60">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{r.order_number}</td>
                      <td className="px-4 py-2.5">{r.customer_name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.product_summary}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(r.total_amount, r.currency_code)}</td>
                      <td className="px-4 py-2.5">{orderStatusLabels[r.status as keyof typeof orderStatusLabels] ?? r.status}</td>
                      <td className="px-4 py-2.5 text-right">{r.delivered_value > 0 ? formatCurrency(r.delivered_value, r.currency_code) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function DeliveryReportTab({ dateFrom, dateTo, canExport, currency }: { dateFrom: string | null; dateTo: string | null; canExport: boolean; currency: string }) {
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const { data, isLoading } = useDeliveryReportRows({ dateFrom, dateTo, status, search, page: 1, pageSize: 100 })
  const { data: summary } = useFinanceSummary({ dateFrom, dateTo })

  function handleExport() {
    if (!data || data.rows.length === 0) return
    exportToCsv(
      `delivery-report-${new Date().toISOString().slice(0, 10)}.csv`,
      data.rows.map((r) => ({
        order_id: r.order_number,
        customer: r.customer_name,
        phone: r.customer_phone,
        location: [r.customer_city, r.customer_state].filter(Boolean).join(', '),
        order_value: r.total_amount,
        status: r.status,
        created_at: r.created_at,
        scheduled_at: r.scheduled_at ?? '',
        dispatched_at: r.dispatched_at ?? '',
        delivered_at: r.delivered_at ?? '',
        returned_at: r.returned_at ?? '',
        assigned_staff: r.assigned_to_email ?? '',
      })),
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 text-sm">
          <SummaryTile label="Total Orders" value={summary.total_orders.toLocaleString()} />
          <SummaryTile label="Delivered" value={summary.delivered_orders.toLocaleString()} />
          <SummaryTile label="Returned" value={summary.returned_orders.toLocaleString()} />
          <SummaryTile label="Success Rate" value={`${summary.delivery_success_rate}%`} />
          <SummaryTile label="Return Rate" value={`${summary.return_rate}%`} />
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery Report</CardTitle>
          <CardDescription>Order tracking timeline and assignment. Up to 100 most recent matching orders.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ReportToolbar search={search} onSearch={setSearch} status={status} onStatus={setStatus} onExport={handleExport} canExport={canExport} exportDisabled={!data || data.rows.length === 0} />
          {isLoading ? (
            <LoadingState label="Loading delivery report…" />
          ) : (data?.rows.length ?? 0) === 0 ? (
            <EmptyState icon={Lock} title="No matching orders" description="Try widening the date range or clearing filters." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">Order</th>
                    <th className="px-4 py-2.5 font-semibold">Customer</th>
                    <th className="px-4 py-2.5 font-semibold">Location</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Value</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Dispatched</th>
                    <th className="px-4 py-2.5 font-semibold">Delivered</th>
                    <th className="px-4 py-2.5 font-semibold">Staff</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.rows.map((r) => (
                    <tr key={r.id} className="border-t border-border/60">
                      <td className="px-4 py-2.5 font-mono text-xs">{r.order_number}</td>
                      <td className="px-4 py-2.5">
                        <p>{r.customer_name}</p>
                        <p className="text-xs text-muted-foreground">{r.customer_phone}</p>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{[r.customer_city, r.customer_state].filter(Boolean).join(', ') || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(r.total_amount, currency)}</td>
                      <td className="px-4 py-2.5">{orderStatusLabels[r.status] ?? r.status}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.dispatched_at ? new Date(r.dispatched_at).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.delivered_at ? new Date(r.delivered_at).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.assigned_to_email ?? 'Unassigned'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ProductPerformanceReportTab({ dateFrom, dateTo, canExport, currency }: { dateFrom: string | null; dateTo: string | null; canExport: boolean; currency: string }) {
  const { data, isLoading } = useProductPerformance({ dateFrom, dateTo })

  function handleExport() {
    if (!data || data.length === 0) return
    exportToCsv(
      `product-performance-${new Date().toISOString().slice(0, 10)}.csv`,
      data.map((p) => ({
        product: p.product_name,
        sku: p.sku ?? '',
        orders: p.orders_count,
        units: p.units_sold,
        sales_value: p.sales_value,
        delivered_revenue: p.delivered_revenue,
        returned_orders: p.returned_orders,
        cancellation_rate: p.cancellation_rate,
        current_stock: p.stock_quantity ?? '',
        available_stock: p.available_quantity ?? '',
        cogs: p.cogs_delivered,
        gross_profit: p.gross_profit,
        margin_pct: p.gross_margin_pct,
      })),
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Product Performance Report</CardTitle>
        <CardDescription>COGS/margin figures use order_items.unit_cost — see the "items with cost data" note for coverage.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ReportToolbar search="" onSearch={() => {}} onExport={handleExport} canExport={canExport} exportDisabled={!data || data.length === 0} />
        {isLoading ? (
          <LoadingState label="Loading product performance…" />
        ) : (data?.length ?? 0) === 0 ? (
          <EmptyState icon={Lock} title="No product sales yet" description="Product performance will appear here once orders come in for this period." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Product</th>
                  <th className="px-4 py-2.5 font-semibold">SKU</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Orders</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Units</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Sales Value</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Delivered Revenue</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Stock / Available</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Gross Profit</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Margin</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((p) => (
                  <tr key={p.product_id} className="border-t border-border/60">
                    <td className="px-4 py-2.5">{p.product_name}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.sku ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">{p.orders_count}</td>
                    <td className="px-4 py-2.5 text-right">{p.units_sold}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(p.sales_value, currency)}</td>
                    <td className="px-4 py-2.5 text-right">{formatCurrency(p.delivered_revenue, currency)}</td>
                    <td className="px-4 py-2.5 text-right">{p.stock_quantity ?? '—'} / {p.available_quantity ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">{formatCurrency(p.gross_profit, currency)}</td>
                    <td className="px-4 py-2.5 text-right">{p.gross_margin_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CustomerReportTab({ canExport, currency }: { canExport: boolean; currency: string }) {
  const [search, setSearch] = React.useState('')
  const { data, isLoading } = useCustomers({ search, page: 1, pageSize: 100, sortBy: 'total_order_value', sortDirection: 'desc' })

  function handleExport() {
    if (!data || data.rows.length === 0) return
    exportToCsv(
      `customer-report-${new Date().toISOString().slice(0, 10)}.csv`,
      data.rows.map((c) => ({
        customer: c.full_name,
        phone: c.phone,
        state: c.state ?? '',
        city: c.city ?? '',
        orders: c.total_orders,
        delivered_orders: c.delivered_count,
        returned_orders: c.returned_count,
        cancelled_orders: c.cancelled_count,
        sales_value: c.total_order_value,
        delivered_revenue: c.delivered_value,
        last_order: c.last_order_at ?? '',
        customer_type: c.is_repeat_customer ? 'Repeat' : 'New',
      })),
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Customer Report</CardTitle>
        <CardDescription>All-time customer figures (not date-filtered) — reuses the Customers page's trigger-maintained totals.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ReportToolbar search={search} onSearch={setSearch} onExport={handleExport} canExport={canExport} exportDisabled={!data || data.rows.length === 0} />
        {isLoading ? (
          <LoadingState label="Loading customer report…" />
        ) : (data?.rows.length ?? 0) === 0 ? (
          <EmptyState icon={Lock} title="No customers found" description="Try a different search." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Customer</th>
                  <th className="px-4 py-2.5 font-semibold">Phone</th>
                  <th className="px-4 py-2.5 font-semibold">Location</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Orders</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Sales Value</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Delivered Revenue</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((c) => (
                  <tr key={c.id} className="border-t border-border/60">
                    <td className="px-4 py-2.5">{c.full_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.phone}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-4 py-2.5 text-right">{c.total_orders}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(c.total_order_value, currency)}</td>
                    <td className="px-4 py-2.5 text-right">{formatCurrency(c.delivered_value, currency)}</td>
                    <td className="px-4 py-2.5">{c.is_repeat_customer ? 'Repeat' : 'New'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function FinancialSummaryReportTab({ dateFrom, dateTo, canExport, currency }: { dateFrom: string | null; dateTo: string | null; canExport: boolean; currency: string }) {
  const { data: summary, isLoading } = useFinanceSummary({ dateFrom, dateTo })
  const { data: breakdown } = useOrderStatusValueBreakdown({ dateFrom, dateTo })

  function handleExport() {
    if (!summary) return
    exportToCsv(`financial-summary-${new Date().toISOString().slice(0, 10)}.csv`, [
      {
        currency,
        total_sales_value: summary.total_sales_value,
        delivered_revenue: summary.delivered_revenue,
        pending_revenue: summary.pending_revenue,
        returned_value: summary.returned_value,
        cancelled_value: summary.cancelled_value,
        average_order_value: summary.average_order_value,
        gross_profit: summary.gross_profit,
        gross_margin_pct: summary.gross_margin_pct,
        delivery_success_rate: summary.delivery_success_rate,
      },
      ...(breakdown ?? []).map((b) => ({ status: b.status, order_count: b.order_count, order_value: b.order_value })),
    ])
  }

  if (isLoading || !summary) return <LoadingState label="Loading financial summary…" />

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Financial Summary Report</CardTitle>
        <CardDescription>The same authoritative figures shown on the Finance page, for this date range.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ReportToolbar search="" onSearch={() => {}} onExport={handleExport} canExport={canExport} exportDisabled={!summary} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          <SummaryTile label="Total Sales Value" value={formatCurrency(summary.total_sales_value, currency)} />
          <SummaryTile label="Delivered Revenue" value={formatCurrency(summary.delivered_revenue, currency)} />
          <SummaryTile label="Pending Revenue" value={formatCurrency(summary.pending_revenue, currency)} />
          <SummaryTile label="Returned Value" value={formatCurrency(summary.returned_value, currency)} />
          <SummaryTile label="Cancelled Value" value={formatCurrency(summary.cancelled_value, currency)} />
          <SummaryTile label="AOV" value={formatCurrency(summary.average_order_value, currency)} />
          <SummaryTile label="Gross Profit" value={formatCurrency(summary.gross_profit, currency)} />
          <SummaryTile label="Gross Margin" value={`${summary.gross_margin_pct}%`} />
          <SummaryTile label="Delivery Success Rate" value={`${summary.delivery_success_rate}%`} />
        </div>
        {breakdown && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Orders</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Value</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((b) => (
                  <tr key={b.status} className="border-t border-border/60">
                    <td className="px-4 py-2.5">{orderStatusLabels[b.status] ?? b.status}</td>
                    <td className="px-4 py-2.5 text-right">{b.order_count}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(b.order_value, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-bold">{value}</p>
    </div>
  )
}

// Affiliate Performance, Campaign Performance and Ad Costs consolidate
// the spec's "Affiliate/Campaign/Commission/Wallet/Withdrawals/Ad Costs
// reports" list into three tables rather than six near-duplicates:
// get_affiliate_performance already carries commission + wallet
// columns per affiliate, and get_campaign_performance already carries
// commission + ad-cost columns per campaign — a Commission-only or
// Wallet-only tab would just be a narrower slice of the same rows.
// Withdrawals has its own dedicated screen (/affiliates/withdrawals)
// with full status/audit detail a summary report would flatten away.
function AffiliatePerformanceReportTab({ dateFrom, dateTo, canExport, currency }: { dateFrom: string | null; dateTo: string | null; canExport: boolean; currency: string }) {
  const { data, isLoading } = useAffiliatePerformance(dateFrom, dateTo)

  function handleExport() {
    if (!data || data.length === 0) return
    exportToCsv(
      `affiliate-performance-${new Date().toISOString().slice(0, 10)}.csv`,
      data.map((a) => ({
        affiliate: a.affiliate_name,
        referral_code: a.referral_code,
        total_orders: a.total_orders,
        delivered_orders: a.delivered_orders,
        delivered_revenue: a.delivered_revenue,
        commission_earned: a.total_commission_earned,
        commission_reversed: a.total_commission_reversed,
        net_commission: a.net_commission,
        wallet_balance: a.wallet_balance,
        wallet_reserved_balance: a.wallet_reserved_balance,
      })),
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Affiliate Performance Report</CardTitle>
        <CardDescription>Delivered revenue reuses the exact Finance definition (DELIVERED + cash collected). Net commission = earned minus reversed.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ReportToolbar search="" onSearch={() => {}} onExport={handleExport} canExport={canExport} exportDisabled={!data || data.length === 0} />
        {isLoading ? (
          <LoadingState label="Loading affiliate performance…" />
        ) : (data?.length ?? 0) === 0 ? (
          <EmptyState icon={Lock} title="No affiliate activity yet" description="Affiliate performance will appear here once attributed orders come in." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Affiliate</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Orders</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Delivered</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Delivered Revenue</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Net Commission</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Wallet Balance</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((a) => (
                  <tr key={a.affiliate_id} className="border-t border-border/60">
                    <td className="px-4 py-2.5">
                      {a.affiliate_name} <span className="font-mono text-xs text-muted-foreground">({a.referral_code})</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">{a.total_orders}</td>
                    <td className="px-4 py-2.5 text-right">{a.delivered_orders}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(a.delivered_revenue, currency)}</td>
                    <td className="px-4 py-2.5 text-right">{formatCurrency(a.net_commission, currency)}</td>
                    <td className="px-4 py-2.5 text-right">{formatCurrency(a.wallet_balance, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CampaignPerformanceReportTab({ canExport, currency }: { canExport: boolean; currency: string }) {
  const { data, isLoading } = useCampaignPerformance()

  function handleExport() {
    if (!data || data.length === 0) return
    exportToCsv(
      `campaign-performance-${new Date().toISOString().slice(0, 10)}.csv`,
      data.map((c) => ({
        campaign: c.campaign_name,
        status: c.status,
        total_orders: c.total_orders,
        delivered_orders: c.delivered_orders,
        delivered_revenue: c.delivered_revenue,
        commission_paid: c.total_commission_paid,
        approved_ad_cost: c.approved_ad_cost,
      })),
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Campaign Performance Report</CardTitle>
        <CardDescription>Approved ad cost only — pending/rejected entries are excluded.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ReportToolbar search="" onSearch={() => {}} onExport={handleExport} canExport={canExport} exportDisabled={!data || data.length === 0} />
        {isLoading ? (
          <LoadingState label="Loading campaign performance…" />
        ) : (data?.length ?? 0) === 0 ? (
          <EmptyState icon={Lock} title="No campaigns yet" description="Campaign performance will appear here once a campaign is created for this brand." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Campaign</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Delivered Orders</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Delivered Revenue</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Commission Paid</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Approved Ad Cost</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((c) => (
                  <tr key={c.campaign_id} className="border-t border-border/60">
                    <td className="px-4 py-2.5">{c.campaign_name}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.status}</td>
                    <td className="px-4 py-2.5 text-right">{c.delivered_orders}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(c.delivered_revenue, currency)}</td>
                    <td className="px-4 py-2.5 text-right">{formatCurrency(c.total_commission_paid, currency)}</td>
                    <td className="px-4 py-2.5 text-right">{formatCurrency(c.approved_ad_cost, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AdCostReportTab({ canExport, currency }: { canExport: boolean; currency: string }) {
  const { data, isLoading } = useAdCostSummary()

  function handleExport() {
    if (!data || data.length === 0) return
    exportToCsv(
      `ad-costs-${new Date().toISOString().slice(0, 10)}.csv`,
      data.map((ac) => ({
        campaign: ac.campaign_name ?? '',
        period_start: ac.period_start,
        period_end: ac.period_end,
        cost: ac.initial_cost_amount,
        initial_orders: ac.initial_orders_count,
        delivered_orders: ac.delivered_orders_count ?? '',
        initial_cost_per_order: ac.initial_cost_per_order ?? '',
        delivered_cost_per_order: ac.delivered_cost_per_order ?? '',
      })),
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ad Costs Report</CardTitle>
        <CardDescription>Only APPROVED entries are shown. "Initial Cost/Order" and "Delivered Cost/Order" — never "CPC", which implies per-click.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ReportToolbar search="" onSearch={() => {}} onExport={handleExport} canExport={canExport} exportDisabled={!data || data.length === 0} />
        {isLoading ? (
          <LoadingState label="Loading ad costs…" />
        ) : (data?.length ?? 0) === 0 ? (
          <EmptyState icon={Lock} title="No approved ad cost entries yet" description="Approve at least one ad cost entry to see it here." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Campaign</th>
                  <th className="px-4 py-2.5 font-semibold">Period</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Cost</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Initial Cost/Order</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Delivered Cost/Order</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((ac) => (
                  <tr key={ac.id} className="border-t border-border/60">
                    <td className="px-4 py-2.5">{ac.campaign_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {new Date(ac.period_start).toLocaleDateString()} – {new Date(ac.period_end).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(ac.initial_cost_amount, currency)}</td>
                    <td className="px-4 py-2.5 text-right">{ac.initial_cost_per_order !== null ? formatCurrency(ac.initial_cost_per_order, currency) : '—'}</td>
                    <td className="px-4 py-2.5 text-right">{ac.delivered_cost_per_order !== null ? formatCurrency(ac.delivered_cost_per_order, currency) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
