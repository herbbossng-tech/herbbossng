import { Link } from 'react-router-dom'

import { ChevronLeft } from 'lucide-react'

import { ProductForm } from '@/features/products/components/ProductForm'
import { useCreateProduct } from '@/features/products/hooks'
import { emptyProductForm } from '@/features/products/mapper'

export function ProductCreatePage() {
  const createProduct = useCreateProduct()

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to="/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back to Products
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Create Product</h1>
        <p className="mt-1 text-sm text-muted-foreground">Add a new product to your catalogue.</p>
      </div>

      <ProductForm
        mode="create"
        defaultValues={emptyProductForm}
        isSubmitting={createProduct.isPending}
        onSubmit={async (values) => {
          const product = await createProduct.mutateAsync(values)
          return { id: product.id }
        }}
      />
    </div>
  )
}
