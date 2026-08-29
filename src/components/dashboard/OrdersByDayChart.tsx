import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface OrdersByDayPoint {
  day: string
  orders: number
}

export function OrdersByDayChart({ data }: { data: OrdersByDayPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 6" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="day"
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
          width={28}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: 'var(--color-accent)' }}
          contentStyle={{
            background: 'var(--color-popover)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            fontSize: 12,
            color: 'var(--color-foreground)',
          }}
        />
        <Bar dataKey="orders" fill="var(--color-success)" radius={[6, 6, 6, 6]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}
