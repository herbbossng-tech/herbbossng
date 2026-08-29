import type { OrderStatus } from '@/types/database'

export const orderStatuses: OrderStatus[] = [
  'NEW',
  'PENDING',
  'WILL_CALL_BACK',
  'SCHEDULED',
  'PROCESSING_FOR_DISPATCH',
  'DISPATCHED',
  'IN_TRANSIT',
  'PARTIALLY_DELIVERED',
  'DELIVERED',
  'RETURNED',
  'CANCELLED',
]

export const orderStatusLabels: Record<OrderStatus, string> = {
  NEW: 'New',
  PENDING: 'Pending',
  WILL_CALL_BACK: 'Will Call Back',
  SCHEDULED: 'Scheduled',
  PROCESSING_FOR_DISPATCH: 'Processing for Dispatch',
  DISPATCHED: 'Dispatched',
  IN_TRANSIT: 'In Transit',
  PARTIALLY_DELIVERED: 'Partially Delivered',
  DELIVERED: 'Delivered',
  RETURNED: 'Returned',
  CANCELLED: 'Cancelled',
}

/** Derived UI concept only — never a status of its own. */
export const orderNextAction: Record<OrderStatus, string> = {
  NEW: 'Confirm order',
  PENDING: 'Call customer',
  WILL_CALL_BACK: 'Follow up with customer',
  SCHEDULED: 'Prepare for dispatch',
  PROCESSING_FOR_DISPATCH: 'Dispatch order',
  DISPATCHED: 'Awaiting transit',
  IN_TRANSIT: 'Await delivery',
  PARTIALLY_DELIVERED: 'Complete delivery',
  DELIVERED: 'Cash collected',
  RETURNED: 'Process return',
  CANCELLED: 'No action',
}

export type StatusTone = 'default' | 'success' | 'warning' | 'info' | 'destructive' | 'secondary'

export const orderStatusTone: Record<OrderStatus, StatusTone> = {
  NEW: 'info',
  PENDING: 'warning',
  WILL_CALL_BACK: 'warning',
  SCHEDULED: 'default',
  PROCESSING_FOR_DISPATCH: 'default',
  DISPATCHED: 'info',
  IN_TRANSIT: 'info',
  PARTIALLY_DELIVERED: 'warning',
  DELIVERED: 'success',
  RETURNED: 'destructive',
  CANCELLED: 'secondary',
}

export const orderSourceLabels: Record<string, string> = {
  website: 'Website',
  whatsapp: 'WhatsApp',
  phone: 'Phone',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  walk_in: 'Walk-in',
  staff: 'Staff',
  other: 'Other',
}

/** Fields the status-change dialog must collect for a given target status. */
export function statusRequiresField(status: OrderStatus): 'scheduled_at' | 'cancellation_reason' | 'return_reason' | 'cash' | null {
  if (status === 'SCHEDULED') return 'scheduled_at'
  if (status === 'CANCELLED') return 'cancellation_reason'
  if (status === 'RETURNED') return 'return_reason'
  if (status === 'DELIVERED') return 'cash'
  return null
}
