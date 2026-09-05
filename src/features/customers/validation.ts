import { z } from 'zod'

import { phoneSchema } from '@/lib/validation/phone'

export const customerFormSchema = z.object({
  fullName: z.string().min(2, 'Enter the customer’s full name'),
  phone: phoneSchema,
  alternatePhone: z.string().refine((v) => v === '' || v.replace(/[^0-9]/g, '').length >= 7, 'Enter a valid phone number'),
  email: z.string().refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email'),
  state: z.string(),
  city: z.string(),
  address: z.string(),
  addressLine2: z.string(),
  landmark: z.string(),
  postalCode: z.string(),
})

export type CustomerFormInput = z.input<typeof customerFormSchema>
export type CustomerFormOutput = z.infer<typeof customerFormSchema>

export const customerNoteSchema = z.object({
  body: z.string().min(1, 'Note cannot be empty'),
})
export type CustomerNoteInput = z.input<typeof customerNoteSchema>
export type CustomerNoteOutput = z.infer<typeof customerNoteSchema>
