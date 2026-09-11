import type { RescueCaseStatus, SupportInteractionOutcome, SupportInteractionType } from '@/types/database'

export const rescueStatusLabels: Record<RescueCaseStatus, string> = {
  OPEN: 'Open',
  CONTACTING: 'Contacting',
  CUSTOMER_REACHED: 'Customer Reached',
  RESCHEDULED: 'Rescheduled',
  ADDRESS_FIXED: 'Address Fixed',
  PHONE_FIXED: 'Phone Fixed',
  HANDED_BACK_TO_DELIVERY: 'Back to Delivery',
  CONVERTED: 'Converted',
  LOST: 'Lost',
  CANCELLED: 'Cancelled',
}

export const rescueStatusTone: Record<RescueCaseStatus, 'secondary' | 'warning' | 'info' | 'success' | 'destructive'> = {
  OPEN: 'warning',
  CONTACTING: 'info',
  CUSTOMER_REACHED: 'info',
  RESCHEDULED: 'info',
  ADDRESS_FIXED: 'info',
  PHONE_FIXED: 'info',
  HANDED_BACK_TO_DELIVERY: 'secondary',
  CONVERTED: 'success',
  LOST: 'destructive',
  CANCELLED: 'secondary',
}

// Legal manual transitions out of each status — mirrors
// rescue_case_transition_allowed() in migration 0030. CONVERTED/LOST/
// CANCELLED are terminal (no outgoing edges); the automatic
// order-driven sync to CONVERTED/CANCELLED happens server-side and
// is never offered here as a manual action.
export const rescueStatusTransitions: Record<RescueCaseStatus, RescueCaseStatus[]> = {
  OPEN: ['CONTACTING', 'CANCELLED'],
  CONTACTING: ['CUSTOMER_REACHED', 'CANCELLED', 'LOST'],
  CUSTOMER_REACHED: ['RESCHEDULED', 'ADDRESS_FIXED', 'PHONE_FIXED', 'LOST', 'CANCELLED'],
  RESCHEDULED: ['HANDED_BACK_TO_DELIVERY', 'LOST', 'CANCELLED'],
  ADDRESS_FIXED: ['HANDED_BACK_TO_DELIVERY', 'LOST', 'CANCELLED'],
  PHONE_FIXED: ['HANDED_BACK_TO_DELIVERY', 'CONTACTING', 'LOST', 'CANCELLED'],
  HANDED_BACK_TO_DELIVERY: ['CONVERTED', 'LOST', 'CANCELLED'],
  CONVERTED: [],
  LOST: [],
  CANCELLED: [],
}

export const interactionTypeLabels: Record<SupportInteractionType, string> = {
  CALL: 'Call',
  CONFIRMATION_CALL: 'Confirmation Call',
  FOLLOW_UP_CALL: 'Follow-up Call',
  DELIVERY_FOLLOW_UP: 'Delivery Follow-up',
  ADDRESS_VERIFICATION: 'Address Verification',
  PHONE_VERIFICATION: 'Phone Verification',
  CUSTOMER_REQUEST: 'Customer Request',
  CANCELLATION_REQUEST: 'Cancellation Request',
  RESCUE_ATTEMPT: 'Rescue Attempt',
  ESCALATION: 'Escalation',
  INTERNAL_NOTE: 'Internal Note',
  OTHER: 'Other',
}

export const interactionOutcomeLabels: Record<SupportInteractionOutcome, string> = {
  CUSTOMER_REACHED: 'Customer Reached',
  NO_ANSWER: 'No Answer',
  WRONG_NUMBER: 'Wrong Number',
  CALLBACK_REQUESTED: 'Callback Requested',
  CONFIRMED: 'Confirmed',
  RESCHEDULED: 'Rescheduled',
  CANCELLED: 'Cancelled',
  ADDRESS_UPDATED: 'Address Updated',
  PHONE_UPDATED: 'Phone Updated',
  ESCALATED: 'Escalated',
  NOT_INTERESTED: 'Not Interested',
  UNABLE_TO_DELIVER: 'Unable to Deliver',
  OTHER: 'Other',
}

export const priorityTone: Record<string, 'secondary' | 'warning' | 'destructive'> = {
  normal: 'secondary',
  high: 'warning',
  urgent: 'destructive',
}
