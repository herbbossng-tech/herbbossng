import type { OrderStatus, PaymentStatus } from '@prisma/client';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'New',
  PENDING_CONFIRMATION: 'Pending Confirmation',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  PACKED: 'Packed',
  DISPATCHED: 'Dispatched',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
  FAILED_DELIVERY: 'Failed Delivery',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  COD_PENDING: 'COD Pending',
  COD_COLLECTED: 'COD Collected',
  REFUNDED: 'Refunded',
  NOT_APPLICABLE: 'Not Applicable',
};

export const ORDER_STATUS_FLOW: OrderStatus[] = [
  'NEW',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'DISPATCHED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

export const TERMINAL_STATUSES: OrderStatus[] = ['CANCELLED', 'RETURNED', 'FAILED_DELIVERY'];
