import type { Offer, Product } from '@prisma/client';
import { Input, Label, Select, Button } from '@/components/ui';

export function OfferForm({
  offer,
  products,
  defaultProductId,
  action,
}: {
  offer?: Offer;
  products: Product[];
  defaultProductId?: string;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action} className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="col-span-full">
        <Label required>Product</Label>
        <Select name="productId" defaultValue={offer?.productId ?? defaultProductId} required>
          <option value="">Select a product</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label required>Offer name</Label>
        <Input name="name" defaultValue={offer?.name} required placeholder="Buy 3 Get 1 Free" />
      </div>
      <div>
        <Label>Subtitle</Label>
        <Input name="subtitle" defaultValue={offer?.subtitle ?? ''} placeholder="Most popular pick" />
      </div>
      <div>
        <Label required>Type</Label>
        <Select name="type" defaultValue={offer?.type ?? 'FIXED_QTY'}>
          <option value="FIXED_QTY">Fixed quantity (pay N, get N)</option>
          <option value="BUY_X_GET_Y">Buy X get Y free</option>
          <option value="PERCENT_DISCOUNT">Percentage discount</option>
          <option value="FIXED_DISCOUNT">Fixed amount discount</option>
        </Select>
      </div>
      <div>
        <Label required>Sort order</Label>
        <Input type="number" name="sortOrder" defaultValue={offer?.sortOrder ?? 0} />
      </div>
      <div>
        <Label required>Quantity paid</Label>
        <Input type="number" name="payQty" defaultValue={offer?.payQty ?? 1} min={1} required />
      </div>
      <div>
        <Label required>Quantity free</Label>
        <Input type="number" name="freeQty" defaultValue={offer?.freeQty ?? 0} min={0} required />
      </div>
      <div>
        <Label>Discount percent (%)</Label>
        <Input type="number" step="0.01" name="discountPercent" defaultValue={offer?.discountPercent ? Number(offer.discountPercent) : ''} />
      </div>
      <div>
        <Label>Discount amount</Label>
        <Input type="number" step="0.01" name="discountAmount" defaultValue={offer?.discountAmount ? Number(offer.discountAmount) : ''} />
      </div>
      <div>
        <Label>Badge text</Label>
        <Input name="badgeText" defaultValue={offer?.badgeText ?? ''} placeholder="Most Popular" />
      </div>
      <div>
        <Label>Badge color</Label>
        <Input type="color" name="badgeColor" defaultValue={offer?.badgeColor ?? '#b6862c'} />
      </div>
      <div>
        <Label>Start date</Label>
        <Input type="date" name="startDate" defaultValue={offer?.startDate ? offer.startDate.toISOString().slice(0, 10) : ''} />
      </div>
      <div>
        <Label>End date</Label>
        <Input type="date" name="endDate" defaultValue={offer?.endDate ? offer.endDate.toISOString().slice(0, 10) : ''} />
      </div>
      <div className="flex gap-4 pt-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isDefault" defaultChecked={offer?.isDefault} /> Default selected</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={offer?.isActive ?? true} /> Active</label>
      </div>
      <div className="col-span-full">
        <Button type="submit">{offer ? 'Save changes' : 'Create offer'}</Button>
      </div>
    </form>
  );
}
