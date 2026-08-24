import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OfferForm } from "@/components/admin/OfferForm";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { updateOffer, deleteOffer, upsertOfferOfficePricing } from "../actions";

export default async function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [offer, products, offices, overrides] = await Promise.all([
    prisma.offer.findUnique({ where: { id } }),
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.office.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.offerOffice.findMany({ where: { offerId: id } }),
  ]);
  if (!offer) notFound();

  const overrideByOffice = new Map(overrides.map((o) => [o.officeId, o]));
  const updateOfferWithId = updateOffer.bind(null, offer.id);
  const upsertPricingWithId = upsertOfferOfficePricing.bind(null, offer.id);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">{offer.title}</h1>
        <form action={deleteOffer.bind(null, offer.productId, offer.id)}>
          <button className="text-sm text-red-600 hover:underline">Delete offer</button>
        </form>
      </div>

      <Card>
        <CardHeader className="font-medium">Offer details</CardHeader>
        <CardBody>
          <OfferForm action={updateOfferWithId} offer={offer} products={products} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-medium">Per-office price override</CardHeader>
        <CardBody className="space-y-4">
          <p className="text-xs text-zinc-500">
            Leave blank to auto-calculate this offer&apos;s price from the product&apos;s office selling price. Set an
            explicit price here to override it per office.
          </p>
          {offices.map((office) => {
            const existing = overrideByOffice.get(office.id);
            return (
              <form key={office.id} action={upsertPricingWithId} className="rounded-xl border border-zinc-100 p-4">
                <input type="hidden" name="officeId" value={office.id} />
                <h3 className="mb-2 font-medium text-zinc-900">
                  {office.name} ({office.currencyCode})
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Price</Label>
                    <Input name="price" type="number" step="0.01" min={0} defaultValue={existing ? String(existing.price) : ""} required />
                  </div>
                  <div>
                    <Label>Compare-at price</Label>
                    <Input name="compareAtPrice" type="number" step="0.01" min={0} defaultValue={existing?.compareAtPrice ? String(existing.compareAtPrice) : ""} />
                  </div>
                  <label className="flex items-center gap-2 self-end pb-3 text-sm text-zinc-700">
                    <input type="checkbox" name="isActive" defaultChecked={existing?.isActive ?? true} className="h-4 w-4 rounded border-zinc-300" />
                    Active
                  </label>
                </div>
                <Button type="submit" size="sm" className="mt-3">
                  Save override
                </Button>
              </form>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
