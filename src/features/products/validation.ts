import { z } from 'zod'

export const productFormSchema = z
  .object({
    name: z.string().min(1, 'Product name is required').max(200),
    sku: z.string().max(100),
    categoryId: z.string().nullable(),
    shortDescription: z.string().max(300),
    description: z.string(),
    status: z.enum(['draft', 'active', 'archived']),

    sellingPrice: z.coerce.number().min(0, 'Selling price cannot be negative'),
    costPrice: z.coerce.number().min(0).nullable(),
    comparePrice: z.coerce.number().min(0).nullable(),

    trackInventory: z.boolean(),
    stockQuantity: z.coerce.number().int().min(0),
    lowStockThreshold: z.coerce.number().int().min(0),

    weight: z.coerce.number().min(0).nullable(),
    deliveryInformation: z.string(),
    returnPolicy: z.string(),

    tags: z.array(z.string()),
    seoTitle: z.string().max(70),
    seoDescription: z.string().max(160),

    affiliateCommissionType: z.enum(['fixed', 'percentage']).nullable(),
    affiliateCommissionValue: z.coerce.number().min(0).nullable(),
  })
  .refine((data) => data.comparePrice === null || data.comparePrice >= data.sellingPrice, {
    message: 'Compare-at price should be greater than or equal to the selling price',
    path: ['comparePrice'],
  })

export type ProductFormInput = z.input<typeof productFormSchema>
export type ProductFormSchema = z.infer<typeof productFormSchema>
