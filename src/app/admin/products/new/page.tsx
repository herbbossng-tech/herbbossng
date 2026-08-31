import { PageHeader, Card } from '@/components/ui';
import { ProductForm } from '../product-form';
import { createProduct } from '../actions';

export default function NewProductPage() {
  return (
    <div>
      <PageHeader title="New Product" />
      <Card>
        <ProductForm action={createProduct} />
      </Card>
    </div>
  );
}
