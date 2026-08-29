import type { Order, OrderPriority, OrderSource, OrderStatus } from '@/types/database'

export interface OrderFilters {
  search?: string
  status?: OrderStatus | 'all'
  source?: OrderSource | 'all'
  assignedTo?: string | 'all' | 'unassigned'
  dateFrom?: string
  dateTo?: string
  sortBy?: 'created_at' | 'order_number' | 'total_amount' | 'customer_name' | 'status'
  sortDirection?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface OrderListItem extends Order {
  assigned_to_email: string | null
  item_summary: string | null
}

export interface PaginatedOrders {
  rows: OrderListItem[]
  totalCount: number
}

export interface OrderItemInput {
  productId: string
  quantity: number
}

export interface CreateOrderFormValues {
  source: OrderSource
  sourceDetail: string
  customerName: string
  customerPhone: string
  customerEmail: string
  customerCountryCode: string
  customerState: string
  customerCity: string
  customerAddress: string
  customerAddress2: string
  customerPostalCode: string
  items: OrderItemInput[]
  shippingFee: number
  discountAmount: number
  priority: OrderPriority
  internalNotes: string
}

export interface StatusChangeInput {
  status: OrderStatus
  scheduledAt?: string
  cancellationReason?: string
  returnReason?: string
  cashCollectedAmount?: number
  cashCollectionStatus?: 'collected' | 'partial' | 'failed'
}
