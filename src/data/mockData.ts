// Order/revenue figures (hero + "today at a glance" order metrics, the
// revenue/orders-by-day trend charts, the delivery funnel, and recent
// orders) are no longer mocked here — Dashboard.tsx derives them from
// get_order_stats()/get_order_daily_stats()/fetchOrders() instead. These
// four metrics genuinely have no backing module yet in this phase
// (products' own sell-through, affiliates, and marketing conversion are
// out of Orders Operations Engine scope), so they stay mock and are
// clearly labelled as such in the Dashboard.
export const nonOrderKpis = [
  { label: 'Inventory Alerts', value: '5', tone: 'warning' as const, icon: 'boxes' as const },
  { label: 'Active Products', value: '38', icon: 'percent' as const },
  { label: 'Conversion Rate', value: '4.2%', delta: '-1%', trend: 'down' as const, icon: 'percent' as const },
  { label: 'Active Affiliates', value: '28', delta: '+3', icon: 'userCheck' as const },
]

export const topProducts = [
  { name: 'Herbal Detox Pack', sold: 21, revenue: 325500, stock: 64 },
  { name: 'Vita Boost Combo', sold: 17, revenue: 374000, stock: 12 },
  { name: 'Slim Tea 30-Day', sold: 14, revenue: 133000, stock: 5 },
  { name: 'Joint Relief Oil', sold: 9, revenue: 108000, stock: 41 },
]

export const mediaBuyers = [
  { name: 'David K.', spend: 210000, orders: 24, cpo: 8750, roas: 2.9 },
  { name: 'Blessing A.', spend: 165000, orders: 19, cpo: 8684, roas: 2.6 },
  { name: 'Samuel O.', spend: 132000, orders: 16, cpo: 8250, roas: 2.4 },
]

export const notifications = [
  { title: 'Low stock: Slim Tea 30-Day', time: '12m ago', tone: 'warning' as const },
  { title: '14 orders delivered & paid today', time: '38m ago', tone: 'success' as const },
  { title: 'New affiliate joined: Ope A.', time: '1h ago', tone: 'info' as const },
  { title: '3 orders pending confirmation call', time: '2h ago', tone: 'warning' as const },
]
