import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { RevenueTrendPoint } from '@/types/database'

function compactNumber(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}k`
  return `${value}`
}

const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

export function RevenueTrendChart({ data, currencyCode }: { data: RevenueTrendPoint[]; currencyCode: string | null }) {
  const chartData = data.map((d) => ({
    label: DATE_FMT.format(new Date(`${d.bucket}T00:00:00`)),
    'Sales Value': d.sales_value,
    'Delivered Revenue': d.delivered_revenue,
    'Pending Revenue': d.pending_revenue,
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 6" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }} />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
          tickFormatter={compactNumber}
          width={48}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--color-popover)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            fontSize: 12,
            color: 'var(--color-foreground)',
          }}
          formatter={(value: number, name: string) => [`${currencyCode ?? ''} ${Number(value).toLocaleString()}`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="Sales Value" stroke="var(--color-info)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="Delivered Revenue" stroke="var(--color-success)" strokeWidth={2.5} dot={false} />
        <Line type="monotone" dataKey="Pending Revenue" stroke="var(--color-warning)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
