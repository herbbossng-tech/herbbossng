import type { Product } from '@prisma/client';
import { Input, Label, Select, Textarea, Button } from '@/components/ui';

export function ProductForm({ product, action }: { product?: Product; action: (formData: FormData) => void }) {
  const benefits = Array.isArray(product?.benefits) ? (product?.benefits as string[]).join('\n') : '';
  const ingredients = product?.ingredients ? JSON.stringify(product.ingredients, null, 2) : '[\n  { "name": "Ginseng", "description": "..." }\n]';
  const faq = product?.faq ? JSON.stringify(product.faq, null, 2) : '[\n  { "question": "...", "answer": "..." }\n]';

  return (
    <form action={action} className="grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
      <div>
        <Label required>Product name</Label>
        <Input name="name" defaultValue={product?.name} required />
      </div>
      <div>
        <Label required>SKU</Label>
        <Input name="sku" defaultValue={product?.sku} required />
      </div>
      <div>
        <Label required>Slug (URL)</Label>
        <Input name="slug" defaultValue={product?.slug} required placeholder="ginseng-five-treasures-tea" />
      </div>
      <div>
        <Label required>Status</Label>
        <Select name="status" defaultValue={product?.status ?? 'DRAFT'}>
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      </div>
      <div className="col-span-full">
        <Label>Short description</Label>
        <Textarea name="shortDescription" defaultValue={product?.shortDescription ?? ''} rows={2} />
      </div>
      <div className="col-span-full">
        <Label>Long description (markdown)</Label>
        <Textarea name="longDescription" defaultValue={product?.longDescription ?? ''} rows={5} />
      </div>
      <div className="col-span-full">
        <Label>Benefits (one per line)</Label>
        <Textarea name="benefits" defaultValue={benefits} rows={4} />
      </div>
      <div className="col-span-full">
        <Label>Ingredients (JSON array of {'{name, description}'})</Label>
        <Textarea name="ingredientsJson" defaultValue={ingredients} rows={6} className="font-mono text-xs" />
      </div>
      <div className="col-span-full">
        <Label>FAQ (JSON array of {'{question, answer}'})</Label>
        <Textarea name="faqJson" defaultValue={faq} rows={6} className="font-mono text-xs" />
      </div>
      <div className="col-span-full">
        <Label>Guarantee text</Label>
        <Textarea name="guaranteeText" defaultValue={product?.guaranteeText ?? ''} rows={2} />
      </div>
      <div className="col-span-full">
        <Label>Delivery information</Label>
        <Textarea name="deliveryInfo" defaultValue={product?.deliveryInfo ?? ''} rows={2} />
      </div>
      <div className="col-span-full">
        <Label>Disclaimer</Label>
        <Textarea
          name="disclaimer"
          defaultValue={product?.disclaimer ?? 'This product is a wellness product and is not intended to diagnose, treat, cure, or prevent any disease.'}
          rows={2}
        />
      </div>
      <div>
        <Label>SEO title</Label>
        <Input name="seoTitle" defaultValue={product?.seoTitle ?? ''} />
      </div>
      <div>
        <Label>SEO description</Label>
        <Input name="seoDescription" defaultValue={product?.seoDescription ?? ''} />
      </div>
      <div className="col-span-full">
        <Button type="submit">{product ? 'Save changes' : 'Create product'}</Button>
      </div>
    </form>
  );
}
