import { ProductForm } from "@/components/admin/ProductForm";
import { createProduct } from "../actions";

export default function NewProductPage() {
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">New product</h1>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <ProductForm action={createProduct} />
      </div>
    </div>
  );
}
