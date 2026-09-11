import { z } from 'zod'

export const categoryFormSchema = z.object({
  name: z.string().min(1, 'Category name is required').max(120),
  description: z.string(),
  imageUrl: z.string().nullable(),
  parentId: z.string().nullable(),
  status: z.enum(['active', 'inactive']),
  sortOrder: z.coerce.number().int(),
})

export type CategoryFormInput = z.input<typeof categoryFormSchema>
export type CategoryFormSchema = z.infer<typeof categoryFormSchema>
