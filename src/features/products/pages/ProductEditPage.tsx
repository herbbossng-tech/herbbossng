import { ChevronLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { ErrorState, LoadingState } from '@/components/ui/state'
import { ProductForm } from '@/features/products/components/ProductForm'
import { useProduct, useUpdateProduct } from '@/features/products/hooks'
import { productToFormValues } from '@/features/products/mapper'

export function ProductEditPage() {
  const { id } = useParams<{ id: string }>()
  const { data: product, isLoading, isError, refetch } = useProduct(id)
  const updateProduct = useUpdateProduct(id ?? '')

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to="/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back to Products
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{product ? product.name : 'Edit Product'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Update product details, pricing and media.</p>
      </div>

      {isLoading && <LoadingState label="Loading product…" />}
      {isError && <ErrorState message="We couldn't load this product." onRetry={() => refetch()} />}
      {product && (
        <ProductForm
          mode="edit"
          productId={product.id}
          defaultValues={productToFormValues(product)}
          isSubmitting={updateProduct.isPending}
          onSubmit={async (values) => {
            await updateProduct.mutateAsync(values)
            return undefined
          }}
        />
      )}
    </div>
  )
}
