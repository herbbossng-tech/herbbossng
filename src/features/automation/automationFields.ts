import type { AutomationActionType, AutomationConditionOperator, AutomationEventType } from '@/types/database'

// Hand-maintained lookup tables (same pattern as roles/moduleMeta.ts) —
// mirrors exactly what migration 0028's triggers emit as each event's
// payload (Part K) so the condition builder can offer a real field
// picker instead of a free-text/JSON path input.

export const automationEventTypeLabels: Record<AutomationEventType, string> = {
  'orders.created': 'Order created',
  'orders.status_changed': 'Order status changed',
  'orders.delivered': 'Order delivered',
  'orders.cancelled': 'Order cancelled',
  'orders.returned': 'Order returned',
  'orders.payment_collected': 'Order payment collected',
  'customers.created': 'Customer created',
  'customers.repeat_detected': 'Customer became a repeat buyer',
  'inventory.out_of_stock': 'Product went out of stock',
  'inventory.low_stock': 'Product hit low-stock threshold',
  'tasks.created': 'Follow-up task created',
  'tasks.completed': 'Follow-up task completed',
  'waybills.created': 'Waybill created',
  'waybills.dispatched': 'Waybill dispatched',
  'waybills.delivery_attempted': 'Delivery attempt logged',
  'settlements.created': 'COD settlement created',
  'settlements.completed': 'COD settlement completed',
  'affiliate.commission_earned': 'Affiliate commission earned',
  'affiliate.withdrawal_requested': 'Affiliate withdrawal requested',
  'affiliate.withdrawal_approved': 'Affiliate withdrawal approved',
  'ad_cost.created': 'Ad cost logged',
  'ad_cost.approved': 'Ad cost approved',
  'staff.invited': 'Staff invited',
  'staff.suspended': 'Staff suspended',
}

export const automationEventTypes = Object.keys(automationEventTypeLabels) as AutomationEventType[]

/** Dot-paths into the event payload available for THEN conditions, per event type — mirrors 0028's jsonb_build_object() shapes exactly. */
export const automationEventFields: Record<AutomationEventType, { path: string; label: string }[]> = {
  'orders.created': [
    { path: 'order.total_value', label: 'Order total value' },
    { path: 'order.status', label: 'Order status' },
    { path: 'order.priority', label: 'Order priority' },
    { path: 'order.source', label: 'Order source' },
    { path: 'order.is_repeat_customer', label: 'Is repeat customer' },
  ],
  'orders.status_changed': [
    { path: 'order.total_value', label: 'Order total value' },
    { path: 'old_status', label: 'Previous status' },
    { path: 'new_status', label: 'New status' },
  ],
  'orders.delivered': [{ path: 'order.total_value', label: 'Order total value' }],
  'orders.cancelled': [{ path: 'order.total_value', label: 'Order total value' }],
  'orders.returned': [{ path: 'order.total_value', label: 'Order total value' }],
  'orders.payment_collected': [
    { path: 'order.collected_amount', label: 'Collected amount' },
    { path: 'order.total_value', label: 'Order total value' },
  ],
  'customers.created': [{ path: 'customer.full_name', label: 'Customer name' }],
  'customers.repeat_detected': [{ path: 'customer.total_orders', label: 'Total orders' }],
  'inventory.out_of_stock': [
    { path: 'product.name', label: 'Product name' },
    { path: 'product.stock_quantity', label: 'Stock quantity' },
  ],
  'inventory.low_stock': [
    { path: 'product.name', label: 'Product name' },
    { path: 'product.stock_quantity', label: 'Stock quantity' },
    { path: 'product.low_stock_threshold', label: 'Low-stock threshold' },
  ],
  'tasks.created': [
    { path: 'task.task_type', label: 'Task type' },
    { path: 'task.priority', label: 'Task priority' },
  ],
  'tasks.completed': [{ path: 'task.task_type', label: 'Task type' }],
  'waybills.created': [{ path: 'waybill.waybill_number', label: 'Waybill number' }],
  'waybills.dispatched': [{ path: 'waybill.waybill_number', label: 'Waybill number' }],
  'waybills.delivery_attempted': [
    { path: 'attempt_number', label: 'Attempt number' },
    { path: 'result', label: 'Attempt result' },
  ],
  'settlements.created': [
    { path: 'collected_amount', label: 'Collected amount' },
    { path: 'remitted_amount', label: 'Remitted amount' },
    { path: 'discrepancy', label: 'Discrepancy' },
  ],
  'settlements.completed': [{ path: 'remitted_amount', label: 'Remitted amount' }],
  'affiliate.commission_earned': [{ path: 'commission_amount', label: 'Commission amount' }],
  'affiliate.withdrawal_requested': [{ path: 'amount', label: 'Withdrawal amount' }],
  'affiliate.withdrawal_approved': [{ path: 'amount', label: 'Withdrawal amount' }],
  'ad_cost.created': [{ path: 'amount', label: 'Ad cost amount' }],
  'ad_cost.approved': [{ path: 'amount', label: 'Ad cost amount' }],
  'staff.invited': [{ path: 'email', label: 'Invitee email' }],
  'staff.suspended': [],
}

export const automationConditionOperatorLabels: Record<AutomationConditionOperator, string> = {
  equals: 'equals',
  not_equals: 'does not equal',
  greater_than: 'is greater than',
  less_than: 'is less than',
  greater_or_equal: 'is greater than or equal to',
  less_or_equal: 'is less than or equal to',
  contains: 'contains',
  not_contains: 'does not contain',
  in: 'is one of (comma-separated)',
  not_in: 'is not one of (comma-separated)',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
}

export const automationConditionOperators = Object.keys(automationConditionOperatorLabels) as AutomationConditionOperator[]

/** Operators whose value input is a list rather than a single value. */
export const listValueOperators: AutomationConditionOperator[] = ['in', 'not_in']
/** Operators that take no value at all. */
export const noValueOperators: AutomationConditionOperator[] = ['is_empty', 'is_not_empty']

export const automationActionTypeLabels: Record<AutomationActionType, string> = {
  CREATE_TASK: 'Create a follow-up task',
  ASSIGN_TASK: 'Assign a follow-up task',
  ASSIGN_ORDER: 'Assign the order',
  CREATE_NOTIFICATION: 'Send an in-app notification',
  TRIGGER_APPROVAL: 'Trigger an approval request',
  UPDATE_SUPPORTED_RECORD: 'Add a tag to the order',
  SEND_SMS: 'Send SMS (not yet connected to a provider)',
  SEND_WHATSAPP: 'Send WhatsApp message (not yet connected to a provider)',
  SEND_EMAIL: 'Send email (not yet connected to a provider)',
  LOG_EVENT: 'Log only (no side effect)',
}

export const automationActionTypes = Object.keys(automationActionTypeLabels) as AutomationActionType[]

export const automationTaskTypeOptions = ['CONFIRM_ORDER', 'CALL_BACK', 'VERIFY_ADDRESS', 'DELIVERY_FOLLOW_UP', 'FAILED_DELIVERY', 'CUSTOMER_REQUEST', 'OTHER']
export const automationPriorityOptions = ['low', 'normal', 'high', 'urgent']
