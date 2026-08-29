import { z } from 'zod'

/**
 * Deliberately lenient/market-agnostic — just "looks like a phone number".
 * A real per-market validation engine (E.164 normalization per workspace
 * country, etc.) is future work; this schema must not make that
 * architecture impossible, so validation lives in one place and takes the
 * raw string as-is rather than assuming a single country's format.
 */
const phoneSchema = z
  .string()
  .min(1, 'Phone number is required')
  .refine((value) => value.replace(/[^0-9]/g, '').length >= 7, 'Enter a valid phone number')

export const orderItemInputSchema = z.object({
  productId: z.string().min(1, 'Select a product'),
  quantity: z.coerce.number().int().positive('Quantity must be at least 1'),
})

export const createOrderSchema = z.object({
  source: z.enum(['website', 'whatsapp', 'phone', 'facebook', 'instagram', 'tiktok', 'walk_in', 'staff', 'other']),
  sourceDetail: z.string(),
  customerName: z.string().min(2, 'Enter the customer’s full name'),
  customerPhone: phoneSchema,
  customerEmail: z.string().refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email'),
  customerCountryCode: z.string(),
  customerState: z.string(),
  customerCity: z.string(),
  customerAddress: z.string().min(5, 'Enter a delivery address'),
  customerAddress2: z.string(),
  customerPostalCode: z.string(),
  items: z.array(orderItemInputSchema).min(1, 'Add at least one product'),
  shippingFee: z.coerce.number().min(0),
  discountAmount: z.coerce.number().min(0),
  priority: z.enum(['normal', 'high', 'urgent']),
  internalNotes: z.string(),
})

export type CreateOrderInput = z.input<typeof createOrderSchema>
export type CreateOrderOutput = z.infer<typeof createOrderSchema>

export const orderNoteSchema = z.object({
  body: z.string().min(1, 'Note cannot be empty'),
})
export type OrderNoteInput = z.input<typeof orderNoteSchema>
export type OrderNoteOutput = z.infer<typeof orderNoteSchema>

export const statusChangeSchema = z
  .object({
    scheduledAt: z.string(),
    cancellationReason: z.string(),
    returnReason: z.string(),
    cashCollectedAmount: z.coerce.number().min(0),
    cashCollectionStatus: z.enum(['collected', 'partial', 'failed']),
  })
  .partial()
export type StatusChangeFormInput = z.input<typeof statusChangeSchema>
export type StatusChangeFormOutput = z.infer<typeof statusChangeSchema>
