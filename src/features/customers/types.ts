import type { Customer, CustomerStatus } from '@/types/database'

export interface CustomerFilters {
  search?: string
  classification?: 'all' | 'new' | 'repeat'
  status?: CustomerStatus | 'all'
  hasDelivered?: boolean
  hasReturned?: boolean
  hasPending?: boolean
  state?: string | 'all'
  city?: string | 'all'
  sortBy?: 'created_at' | 'last_order_at' | 'total_orders' | 'total_order_value' | 'delivered_count' | 'returned_count'
  sortDirection?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export type CustomerListItem = Customer

export interface PaginatedCustomers {
  rows: CustomerListItem[]
  totalCount: number
}

export interface CustomerFormValues {
  fullName: string
  phone: string
  alternatePhone: string
  email: string
  state: string
  city: string
  address: string
  addressLine2: string
  landmark: string
  postalCode: string
}
