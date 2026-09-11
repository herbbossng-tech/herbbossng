import { FolderTree, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import * as React from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state'
import { PermissionGate, usePermission } from '@/contexts/PermissionsContext'
import { CategoryFormDialog } from '@/features/categories/components/CategoryFormDialog'
import { useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from '@/features/categories/hooks'
import type { Category } from '@/types/database'

export function CategoriesPage() {
  const { data: categories, isLoading, isError, refetch } = useCategories()
  const [search, setSearch] = React.useState('')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingCategory, setEditingCategory] = React.useState<Category | null>(null)
  const [deletingCategory, setDeletingCategory] = React.useState<Category | null>(null)

  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory(editingCategory?.id ?? '')
  const deleteCategory = useDeleteCategory()

  const canManage = usePermission('categories.update')
  const canDelete = usePermission('categories.delete')

  const filtered = (categories ?? []).filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="mt-1 text-sm text-muted-foreground">Organize products into browsable categories.</p>
        </div>
        <PermissionGate permission="categories.create">
          <Button
            onClick={() => {
              setEditingCategory(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="h-4 w-4" />
            Create Category
          </Button>
        </PermissionGate>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search categories…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading && <LoadingState label="Loading categories…" />}
      {isError && <ErrorState message="We couldn't load categories." onRetry={() => refetch()} />}
      {!isLoading && !isError && filtered.length === 0 && (
        <EmptyState
          icon={FolderTree}
          title="No categories yet"
          description="Create your first category to start organizing products."
        />
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((category) => (
            <Card key={category.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{category.name}</p>
                  {category.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{category.description}</p>
                  )}
                </div>
                <Badge variant={category.status === 'active' ? 'success' : 'secondary'}>{category.status}</Badge>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">/{category.slug}</span>
                <div className="flex gap-1">
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingCategory(category)
                        setDialogOpen(true)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="ghost" size="icon" onClick={() => setDeletingCategory(category)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CategoryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editingCategory}
        categories={categories ?? []}
        isSubmitting={createCategory.isPending || updateCategory.isPending}
        onSubmit={(values) => (editingCategory ? updateCategory.mutateAsync(values) : createCategory.mutateAsync(values))}
      />

      <AlertDialog open={!!deletingCategory} onOpenChange={(open) => !open && setDeletingCategory(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this category?</AlertDialogTitle>
            <AlertDialogDescription>
              Products in this category will keep their other data but lose this category assignment. This can't be undone from the UI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingCategory) deleteCategory.mutate(deletingCategory.id)
                setDeletingCategory(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
