import type { Office } from '@prisma/client';
import { Input, Label, Select, Button } from '@/components/ui';

export function OfficeForm({
  office,
  action,
}: {
  office?: Office;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action} className="grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
      <fieldset className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="col-span-full mb-1 text-sm font-semibold text-brand">Identity</legend>
        <div>
          <Label required>Office / country name</Label>
          <Input name="name" defaultValue={office?.name} required placeholder="Nigeria" />
        </div>
        <div>
          <Label required>ISO country code</Label>
          <Input name="countryCode" defaultValue={office?.countryCode} required placeholder="NG" maxLength={3} />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <input type="checkbox" name="isActive" id="isActive" defaultChecked={office?.isActive ?? true} />
          <label htmlFor="isActive" className="text-sm text-brand-dark">Active</label>
        </div>
      </fieldset>

      <fieldset className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="col-span-full mb-1 mt-2 text-sm font-semibold text-brand">Currency</legend>
        <div>
          <Label required>Currency code</Label>
          <Input name="currencyCode" defaultValue={office?.currencyCode} required placeholder="NGN" maxLength={3} />
        </div>
        <div>
          <Label required>Symbol</Label>
          <Input name="currencySymbol" defaultValue={office?.currencySymbol} required placeholder="₦" />
        </div>
        <div>
          <Label required>Symbol position</Label>
          <Select name="currencySymbolPosition" defaultValue={office?.currencySymbolPosition ?? 'BEFORE'}>
            <option value="BEFORE">Before amount (₦1,000)</option>
            <option value="AFTER">After amount (1,000₦)</option>
          </Select>
        </div>
        <div>
          <Label required>Decimal places</Label>
          <Input type="number" name="currencyDecimalPlaces" defaultValue={office?.currencyDecimalPlaces ?? 2} min={0} max={4} required />
        </div>
        <div>
          <Label required>Thousand separator</Label>
          <Input name="currencyThousandSep" defaultValue={office?.currencyThousandSep ?? ','} maxLength={1} required />
        </div>
        <div>
          <Label required>Decimal separator</Label>
          <Input name="currencyDecimalSep" defaultValue={office?.currencyDecimalSep ?? '.'} maxLength={1} required />
        </div>
      </fieldset>

      <fieldset className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="col-span-full mb-1 mt-2 text-sm font-semibold text-brand">Phone & Location</legend>
        <div>
          <Label required>Phone country code</Label>
          <Input name="phoneCountryCode" defaultValue={office?.phoneCountryCode} required placeholder="+234" />
        </div>
        <div className="sm:col-span-2">
          <Label required>Phone validation regex (local number)</Label>
          <Input name="phoneRegex" defaultValue={office?.phoneRegex ?? '^0[0-9]{10}$'} required />
        </div>
        <div>
          <Label required>Division label</Label>
          <Input name="divisionLabel" defaultValue={office?.divisionLabel ?? 'State'} required placeholder="State / County / Region" />
        </div>
        <div>
          <Label required>Timezone</Label>
          <Input name="timezone" defaultValue={office?.timezone ?? 'Africa/Lagos'} required />
        </div>
        <div>
          <Label required>Locale</Label>
          <Input name="locale" defaultValue={office?.locale ?? 'en-NG'} required />
        </div>
      </fieldset>

      <fieldset className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="col-span-full mb-1 mt-2 text-sm font-semibold text-brand">Orders, delivery & tax</legend>
        <div>
          <Label required>Order number prefix</Label>
          <Input name="orderNumberPrefix" defaultValue={office?.orderNumberPrefix ?? 'NG'} required maxLength={6} />
        </div>
        <div>
          <Label required>Default delivery fee</Label>
          <Input type="number" step="0.01" name="defaultDeliveryFee" defaultValue={Number(office?.defaultDeliveryFee ?? 0)} required />
        </div>
        <div>
          <Label>Free delivery threshold</Label>
          <Input type="number" step="0.01" name="freeDeliveryThreshold" defaultValue={office?.freeDeliveryThreshold ? Number(office.freeDeliveryThreshold) : ''} />
        </div>
        <div>
          <Label>Tax label</Label>
          <Input name="taxLabel" defaultValue={office?.taxLabel ?? ''} placeholder="VAT" />
        </div>
        <div>
          <Label required>Tax rate (%)</Label>
          <Input type="number" step="0.01" name="taxRate" defaultValue={Number(office?.taxRate ?? 0)} required />
        </div>
        <div>
          <Label required>Inventory strategy</Label>
          <Select name="inventoryStrategy" defaultValue={office?.inventoryStrategy ?? 'RESERVE_ON_ORDER'}>
            <option value="RESERVE_ON_ORDER">Reserve on order submission</option>
            <option value="DEDUCT_ON_CONFIRM">Deduct on confirmation</option>
            <option value="DEDUCT_ON_DISPATCH">Deduct on dispatch</option>
          </Select>
        </div>
      </fieldset>

      <fieldset className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="col-span-full mb-1 mt-2 text-sm font-semibold text-brand">Branding & support</legend>
        <div>
          <Label>Office address</Label>
          <Input name="officeAddress" defaultValue={office?.officeAddress ?? ''} />
        </div>
        <div>
          <Label>Office email</Label>
          <Input name="officeEmail" defaultValue={office?.officeEmail ?? ''} />
        </div>
        <div>
          <Label>Office phone</Label>
          <Input name="officePhone" defaultValue={office?.officePhone ?? ''} />
        </div>
        <div>
          <Label>WhatsApp number</Label>
          <Input name="whatsappNumber" defaultValue={office?.whatsappNumber ?? ''} />
        </div>
        <div className="sm:col-span-2">
          <Label>WhatsApp CTA text</Label>
          <Input name="whatsappCtaText" defaultValue={office?.whatsappCtaText ?? 'Chat with us on WhatsApp'} />
        </div>
      </fieldset>

      <div className="col-span-full">
        <Button type="submit">{office ? 'Save changes' : 'Create office'}</Button>
      </div>
    </form>
  );
}
