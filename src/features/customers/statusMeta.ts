import type { CustomerStatus } from '@/types/database'

export const customerStatuses: CustomerStatus[] = ['active', 'inactive', 'blocked']

export const customerStatusLabels: Record<CustomerStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  blocked: 'Blocked',
}

export type StatusTone = 'default' | 'success' | 'warning' | 'info' | 'destructive' | 'secondary'

export const customerStatusTone: Record<CustomerStatus, StatusTone> = {
  active: 'success',
  inactive: 'secondary',
  blocked: 'destructive',
}

/** Derived UI concept from real order history — never a status of its own. */
export function customerClassificationLabel(isRepeatCustomer: boolean): string {
  return isRepeatCustomer ? 'Repeat Customer' : 'New Customer'
}
