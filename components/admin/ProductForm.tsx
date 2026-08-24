import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { arrayToLines, ingredientsToLines, faqToLines } from "@/lib/list-format";
import type { Product } from "@/app/generated/prisma/client";

export function ProductForm({
  action,
  product,
}: {
  action: (formData: FormData) => Promise<void>;
  product?: Product;
}) {
  return (
    <form action={action} className="space-y-8">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="col-span-full mb-1 text-sm font-semibold text-zinc-900">Basics</legend>
        <div>
          <Label htmlFor="name">Product name</Label>
          <Input id="name" name="name" required defaultValue={product?.name} />
        </div>
        <div>
          <Label htmlFor="slug">URL slug</Label>
          <Input id="slug" name="slug" required defaultValue={product?.slug} placeholder="ginseng-five-treasures-tea" />
        </div>
        <div>
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" name="sku" required defaultValue={product?.sku} />
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={product?.status ?? "DRAFT"}>
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <Input id="category" name="category" defaultValue={product?.category ?? ""} />
        </div>
        <div>
          <Label htmlFor="brand">Brand</Label>
          <Input id="brand" name="brand" defaultValue={product?.brand ?? ""} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-sm font-semibold text-zinc-900">Content</legend>
        <div>
          <Label htmlFor="shortDescription">Short description</Label>
          <Textarea id="shortDescription" name="shortDescription" rows={2} defaultValue={product?.shortDescription ?? ""} />
        </div>
        <div>
          <Label htmlFor="longDescription">Long description</Label>
          <Textarea id="longDescription" name="longDescription" rows={5} defaultValue={product?.longDescription ?? ""} />
        </div>
        <div>
          <Label htmlFor="benefits">Benefits (one per line)</Label>
          <Textarea id="benefits" name="benefits" rows={4} defaultValue={arrayToLines(product?.benefits)} />
        </div>
        <div>
          <Label htmlFor="ingredients">Ingredients — one per line, format: Name | Description</Label>
          <Textarea id="ingredients" name="ingredients" rows={5} defaultValue={ingredientsToLines(product?.ingredients)} />
        </div>
        <div>
          <Label htmlFor="faq">FAQ — one per line, format: Question :: Answer</Label>
          <Textarea id="faq" name="faq" rows={5} defaultValue={faqToLines(product?.faq)} />
        </div>
        <div>
          <Label htmlFor="guarantee">Guarantee</Label>
          <Textarea id="guarantee" name="guarantee" rows={2} defaultValue={product?.guarantee ?? ""} />
        </div>
        <div>
          <Label htmlFor="deliveryInfo">Delivery information</Label>
          <Textarea id="deliveryInfo" name="deliveryInfo" rows={2} defaultValue={product?.deliveryInfo ?? ""} />
        </div>
        <div>
          <Label htmlFor="disclaimer">Disclaimer</Label>
          <Textarea
            id="disclaimer"
            name="disclaimer"
            rows={2}
            defaultValue={
              product?.disclaimer ??
              "This product is a wellness product and is not intended to diagnose, treat, cure, or prevent any disease."
            }
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold text-zinc-900">Media</legend>
        <ImageUploader name="heroImageUrl" defaultValue={product?.heroImageUrl} label="Hero image" />
        <ImageUploader name="ogImageUrl" defaultValue={product?.ogImageUrl} label="Social share image" />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold text-zinc-900">SEO</legend>
        <div>
          <Label htmlFor="seoTitle">SEO title</Label>
          <Input id="seoTitle" name="seoTitle" defaultValue={product?.seoTitle ?? ""} />
        </div>
        <div>
          <Label htmlFor="seoDescription">SEO description</Label>
          <Input id="seoDescription" name="seoDescription" defaultValue={product?.seoDescription ?? ""} />
        </div>
      </fieldset>

      <Button type="submit" size="lg">
        {product ? "Save changes" : "Create product"}
      </Button>
    </form>
  );
}
