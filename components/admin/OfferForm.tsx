import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { Offer, Product } from "@/app/generated/prisma/client";

export function OfferForm({
  action,
  offer,
  products,
  defaultProductId,
}: {
  action: (formData: FormData) => Promise<void>;
  offer?: Offer;
  products: Product[];
  defaultProductId?: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="productId">Product</Label>
        <Select id="productId" name="productId" defaultValue={offer?.productId ?? defaultProductId} required>
          <option value="">Select a product</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="title">Offer title</Label>
          <Input id="title" name="title" required defaultValue={offer?.title} placeholder="Buy 3 Get 1 Free" />
        </div>
        <div>
          <Label htmlFor="type">Offer type</Label>
          <Select id="type" name="type" defaultValue={offer?.type ?? "FIXED_QUANTITY"}>
            <option value="FIXED_QUANTITY">Fixed quantity</option>
            <option value="BUY_X_GET_Y_FREE">Buy X, get Y free</option>
            <option value="PERCENTAGE_DISCOUNT">Percentage discount</option>
            <option value="FIXED_DISCOUNT">Fixed amount discount</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="subtitle">Subtitle</Label>
          <Input id="subtitle" name="subtitle" defaultValue={offer?.subtitle ?? ""} placeholder="Your first pack" />
        </div>
        <div>
          <Label htmlFor="badge">Badge text</Label>
          <Input id="badge" name="badge" defaultValue={offer?.badge ?? ""} placeholder="Most Popular" />
        </div>
        <div>
          <Label htmlFor="paidQuantity">Paid quantity</Label>
          <Input id="paidQuantity" name="paidQuantity" type="number" min={1} required defaultValue={offer?.paidQuantity ?? 1} />
        </div>
        <div>
          <Label htmlFor="freeQuantity">Free quantity</Label>
          <Input id="freeQuantity" name="freeQuantity" type="number" min={0} defaultValue={offer?.freeQuantity ?? 0} />
        </div>
        <div>
          <Label htmlFor="discountPercent">Discount % (for percentage type)</Label>
          <Input id="discountPercent" name="discountPercent" type="number" min={0} max={100} defaultValue={offer?.discountPercent ? String(offer.discountPercent) : ""} />
        </div>
        <div>
          <Label htmlFor="discountAmount">Discount amount (for fixed-discount type)</Label>
          <Input id="discountAmount" name="discountAmount" type="number" min={0} defaultValue={offer?.discountAmount ? String(offer.discountAmount) : ""} />
        </div>
        <div>
          <Label htmlFor="sortOrder">Sort order</Label>
          <Input id="sortOrder" name="sortOrder" type="number" defaultValue={offer?.sortOrder ?? 0} />
        </div>
        <div>
          <Label htmlFor="startsAt">Starts at (optional)</Label>
          <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={offer?.startsAt ? offer.startsAt.toISOString().slice(0, 16) : ""} />
        </div>
        <div>
          <Label htmlFor="endsAt">Ends at (optional)</Label>
          <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={offer?.endsAt ? offer.endsAt.toISOString().slice(0, 16) : ""} />
        </div>
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={2} defaultValue={offer?.description ?? ""} />
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" name="isDefault" defaultChecked={offer?.isDefault ?? false} className="h-4 w-4 rounded border-zinc-300" />
          Selected by default
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" name="isActive" defaultChecked={offer?.isActive ?? true} className="h-4 w-4 rounded border-zinc-300" />
          Active
        </label>
      </div>
      <Button type="submit" size="lg">
        {offer ? "Save changes" : "Create offer"}
      </Button>
    </form>
  );
}
