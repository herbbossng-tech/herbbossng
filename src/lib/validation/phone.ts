import { z } from 'zod'

/**
 * Deliberately lenient/market-agnostic — just "looks like a phone number".
 * Full E.164 validation per workspace market is future work; this schema
 * must not make that architecture impossible, so validation lives in one
 * place and takes the raw string as-is rather than assuming a single
 * country's format. Shared by orders and customers so the two don't drift.
 */
export const phoneSchema = z
  .string()
  .min(1, 'Phone number is required')
  .refine((value) => value.replace(/[^0-9]/g, '').length >= 7, 'Enter a valid phone number')
