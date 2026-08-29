export const marketPulse = {
  country: 'Nigeria',
  code: 'NG',
  activeOrders: 64,
}

export const heroKpis = [
  {
    label: 'Total Active Orders',
    value: '64',
    unit: 'submissions',
    delta: '+100%',
    deltaLabel: 'across direct funnels',
    trend: 'up' as const,
    icon: 'cart' as const,
  },
  {
    label: 'Delivered Revenue',
    value: '652,000',
    prefix: '₦',
    sub: 'Strict Delivered Rule · 14 Paid',
    icon: 'wallet' as const,
    highlight: true,
  },
  {
    label: 'Pending Confirmation',
    value: '43',
    unit: 'calls required',
    sub: 'Agents calling customer numbers',
    icon: 'phone' as const,
  },
  {
    label: 'Delivery Success Rate',
    value: '93%',
    sub: 'Successful cash collections',
    deltaLabel: 'fulfillment',
    icon: 'check' as const,
  },
]

export const secondaryKpis = [
  { label: "Today's Orders", value: '18', delta: '+12%', icon: 'cart' as const },
  { label: "Today's Revenue", value: '₦194,000', delta: '+8%', icon: 'dollar' as const },
  { label: 'Pending Revenue', value: '₦282,000', icon: 'clock' as const },
  { label: 'Completed Orders', value: '46', delta: '+5%', icon: 'check' as const },
  { label: 'Inventory Alerts', value: '5', tone: 'warning' as const, icon: 'boxes' as const },
  { label: 'Active Products', value: '38', icon: 'percent' as const },
  { label: 'Conversion Rate', value: '4.2%', delta: '-1%', trend: 'down' as const, icon: 'percent' as const },
  { label: 'Active Affiliates', value: '28', delta: '+3', icon: 'userCheck' as const },
]

export const revenueTrend = [
  { day: 'Mon', revenue: 62000 },
  { day: 'Tue', revenue: 81000 },
  { day: 'Wed', revenue: 74000 },
  { day: 'Thu', revenue: 98000 },
  { day: 'Fri', revenue: 121000 },
  { day: 'Sat', revenue: 108000 },
  { day: 'Sun', revenue: 108000 },
]

export const ordersByDay = [
  { day: 'Mon', orders: 6 },
  { day: 'Tue', orders: 9 },
  { day: 'Wed', orders: 8 },
  { day: 'Thu', orders: 11 },
  { day: 'Fri', orders: 13 },
  { day: 'Sat', orders: 10 },
  { day: 'Sun', orders: 7 },
]

export const deliveryFunnel = [
  { stage: 'Orders Submitted', count: 64, tone: 'info' as const },
  { stage: 'Confirmed by Call', count: 52, tone: 'default' as const },
  { stage: 'Out for Delivery', count: 47, tone: 'warning' as const },
  { stage: 'Delivered & Paid', count: 43, tone: 'success' as const },
]

export const recentOrders = [
  { id: '#GC-1042', customer: 'Amaka Obi', city: 'Lagos', product: 'Herbal Detox Pack', amount: 15500, status: 'Delivered' as const },
  { id: '#GC-1041', customer: 'Chinedu Eze', city: 'Abuja', product: 'Vita Boost Combo', amount: 22000, status: 'Out for Delivery' as const },
  { id: '#GC-1040', customer: 'Fatima Bello', city: 'Kano', product: 'Slim Tea 30-Day', amount: 9500, status: 'Pending Call' as const },
  { id: '#GC-1039', customer: 'Tunde Alabi', city: 'Ibadan', product: 'Joint Relief Oil', amount: 12000, status: 'Delivered' as const },
  { id: '#GC-1038', customer: 'Ngozi Umeh', city: 'Enugu', product: 'Herbal Detox Pack', amount: 15500, status: 'Cancelled' as const },
  { id: '#GC-1037', customer: 'Ibrahim Sani', city: 'Kaduna', product: 'Vita Boost Combo', amount: 22000, status: 'Delivered' as const },
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
