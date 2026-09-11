import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { Controller, useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { CategoryFormValues } from '@/features/categories/api'
import { type CategoryFormInput, categoryFormSchema } from '@/features/categories/validation'
import type { Category } from '@/types/database'

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  categories,
  onSubmit,
  isSubmitting,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: Category | null
  categories: Category[]
  onSubmit: (values: CategoryFormValues) => Promise<unknown>
  isSubmitting: boolean
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CategoryFormInput, unknown, CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: '',
      description: '',
      imageUrl: null,
      parentId: null,
      status: 'active',
      sortOrder: 0,
    },
  })

  React.useEffect(() => {
    if (open) {
      reset(
        category
          ? {
              name: category.name,
              description: category.description ?? '',
              imageUrl: category.image_url ?? '',
              parentId: category.parent_id,
              status: category.status,
              sortOrder: category.sort_order,
            }
          : { name: '', description: '', imageUrl: '', parentId: null, status: 'active', sortOrder: 0 },
      )
    }
  }, [open, category, reset])

  const submit = async (values: CategoryFormValues) => {
    await onSubmit(values)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{category ? 'Edit Category' : 'Create Category'}</DialogTitle>
          <DialogDescription>Categories help organize products for your storefront and filters.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4 px-6 pb-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" {...register('name')} aria-invalid={!!errors.name} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cat-description">Description</Label>
            <Textarea id="cat-description" rows={2} {...register('description')} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Parent category</Label>
              <Controller
                control={control}
                name="parentId"
                render={({ field }) => (
                  <Select value={field.value ?? 'none'} onValueChange={(v) => field.onChange(v === 'none' ? null : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {categories
                        .filter((c) => c.id !== category?.id)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {category ? 'Save Changes' : 'Create Category'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
