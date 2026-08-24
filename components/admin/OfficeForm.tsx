import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { Office } from "@/app/generated/prisma/client";

export function OfficeForm({
  action,
  office,
}: {
  action: (formData: FormData) => Promise<void>;
  office?: Office;
}) {
  return (
    <form action={action} className="space-y-8">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="col-span-full mb-1 text-sm font-semibold text-zinc-900">Identity</legend>
        <div>
          <Label htmlFor="name">Office / country name</Label>
          <Input id="name" name="name" required defaultValue={office?.name} placeholder="Nigeria" />
        </div>
        <div>
          <Label htmlFor="countryCode">ISO country code</Label>
          <Input id="countryCode" name="countryCode" required maxLength={2} defaultValue={office?.countryCode} placeholder="NG" />
        </div>
        <div>
          <Label htmlFor="officeAddress">Office address</Label>
          <Input id="officeAddress" name="officeAddress" defaultValue={office?.officeAddress ?? ""} />
        </div>
        <div>
          <Label htmlFor="officePhone">Office phone</Label>
          <Input id="officePhone" name="officePhone" defaultValue={office?.officePhone ?? ""} />
        </div>
        <div>
          <Label htmlFor="officeEmail">Office email</Label>
          <Input id="officeEmail" name="officeEmail" type="email" defaultValue={office?.officeEmail ?? ""} />
        </div>
        <div>
          <Label htmlFor="whatsappNumber">WhatsApp number</Label>
          <Input id="whatsappNumber" name="whatsappNumber" defaultValue={office?.whatsappNumber ?? ""} placeholder="+234..." />
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="col-span-full mb-1 text-sm font-semibold text-zinc-900">Currency</legend>
        <div>
          <Label htmlFor="currencyCode">Currency code</Label>
          <Input id="currencyCode" name="currencyCode" required defaultValue={office?.currencyCode} placeholder="NGN" />
        </div>
        <div>
          <Label htmlFor="currencySymbol">Symbol</Label>
          <Input id="currencySymbol" name="currencySymbol" required defaultValue={office?.currencySymbol} placeholder="₦" />
        </div>
        <div>
          <Label htmlFor="symbolPosition">Symbol position</Label>
          <Select id="symbolPosition" name="symbolPosition" defaultValue={office?.symbolPosition ?? "before"}>
            <option value="before">Before amount (₦2,699)</option>
            <option value="after">After amount (2,699 kr)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="decimalDigits">Decimal digits</Label>
          <Input id="decimalDigits" name="decimalDigits" type="number" min={0} max={4} defaultValue={office?.decimalDigits ?? 2} />
        </div>
        <div>
          <Label htmlFor="thousandSeparator">Thousand separator</Label>
          <Input id="thousandSeparator" name="thousandSeparator" defaultValue={office?.thousandSeparator ?? ","} />
        </div>
        <div>
          <Label htmlFor="decimalSeparator">Decimal separator</Label>
          <Input id="decimalSeparator" name="decimalSeparator" defaultValue={office?.decimalSeparator ?? "."} />
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="col-span-full mb-1 text-sm font-semibold text-zinc-900">Location & phone</legend>
        <div>
          <Label htmlFor="divisionLabel">Division label</Label>
          <Input id="divisionLabel" name="divisionLabel" required defaultValue={office?.divisionLabel} placeholder="State / County / Region" />
        </div>
        <div>
          <Label htmlFor="phoneCountryCode">Phone country code</Label>
          <Input id="phoneCountryCode" name="phoneCountryCode" required defaultValue={office?.phoneCountryCode} placeholder="+234" />
        </div>
        <div>
          <Label htmlFor="phoneRegex">Phone validation (regex)</Label>
          <Input
            id="phoneRegex"
            name="phoneRegex"
            required
            defaultValue={office?.phoneRegex}
            placeholder="^0[789][01]\\d{8}$"
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="col-span-full mb-1 text-sm font-semibold text-zinc-900">Orders & locale</legend>
        <div>
          <Label htmlFor="orderPrefix">Order number prefix</Label>
          <Input id="orderPrefix" name="orderPrefix" required defaultValue={office?.orderPrefix} placeholder="NG-AF" />
        </div>
        <div>
          <Label htmlFor="timezone">Timezone</Label>
          <Input id="timezone" name="timezone" defaultValue={office?.timezone ?? "Africa/Lagos"} />
        </div>
        <div>
          <Label htmlFor="dateFormat">Date format</Label>
          <Input id="dateFormat" name="dateFormat" defaultValue={office?.dateFormat ?? "dd MMM yyyy"} />
        </div>
        <div>
          <Label htmlFor="language">Language</Label>
          <Input id="language" name="language" defaultValue={office?.language ?? "en"} />
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="col-span-full mb-1 text-sm font-semibold text-zinc-900">Delivery & inventory</legend>
        <div>
          <Label htmlFor="defaultDeliveryFee">Default delivery fee</Label>
          <Input id="defaultDeliveryFee" name="defaultDeliveryFee" type="number" step="0.01" min={0} defaultValue={String(office?.defaultDeliveryFee ?? 0)} />
        </div>
        <div>
          <Label htmlFor="freeDeliveryThreshold">Free delivery above (blank = never)</Label>
          <Input id="freeDeliveryThreshold" name="freeDeliveryThreshold" type="number" step="0.01" min={0} defaultValue={office?.freeDeliveryThreshold ? String(office.freeDeliveryThreshold) : ""} />
        </div>
        <div>
          <Label htmlFor="inventoryStrategy">Inventory deduction strategy</Label>
          <Select id="inventoryStrategy" name="inventoryStrategy" defaultValue={office?.inventoryStrategy ?? "RESERVATION"}>
            <option value="RESERVATION">Reserve on order submission</option>
            <option value="CONFIRMATION">Deduct on confirmation</option>
            <option value="DISPATCH">Deduct on dispatch</option>
          </Select>
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-zinc-700">
        <input type="checkbox" name="isActive" defaultChecked={office?.isActive ?? true} className="h-4 w-4 rounded border-zinc-300" />
        Office is active
      </label>

      <Button type="submit" size="lg">
        {office ? "Save changes" : "Create office"}
      </Button>
    </form>
  );
}
