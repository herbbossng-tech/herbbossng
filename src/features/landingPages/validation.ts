import { z } from 'zod'

export const landingPageFormSchema = z.object({
  name: z.string().min(2, 'Enter a page name'),
  productId: z.string().min(1, 'Select a product'),
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only'),
  pageType: z.enum(['product_sales', 'direct_response']),
  templateId: z.string(),
  marketCountryCode: z.string(),
})

export type LandingPageFormInput = z.input<typeof landingPageFormSchema>
export type LandingPageFormOutput = z.infer<typeof landingPageFormSchema>

export const packageFormSchema = z.object({
  name: z.string().min(1, 'Enter a package name'),
  quantity: z.coerce.number().int().positive('Quantity must be at least 1'),
  price: z.coerce.number().min(0, 'Price cannot be negative'),
  compareAtPrice: z.union([z.coerce.number().min(0), z.literal('')]).optional(),
  badge: z.string(),
  savingsText: z.string(),
  offerText: z.string(),
  shippingType: z.enum(['free', 'fixed', 'by_state']),
  shippingAmount: z.coerce.number().min(0),
  shippingDefault: z.coerce.number().min(0),
  shippingRates: z.array(z.object({ state: z.string().min(1), amount: z.coerce.number().min(0) })),
  enabled: z.boolean(),
  isDefault: z.boolean(),
})

export type PackageFormInput = z.input<typeof packageFormSchema>
export type PackageFormOutput = z.infer<typeof packageFormSchema>
