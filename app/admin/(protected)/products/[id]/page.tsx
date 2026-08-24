import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ProductForm } from "@/components/admin/ProductForm";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Button, LinkButton } from "@/components/ui/Button";
import { formatMoney } from "@/lib/currency";
import { updateProduct, upsertProductOfficePricing } from "../actions";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, offices, existingPricing, offers, landingPages] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
    prisma.office.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.productOffice.findMany({ where: { productId: id }, include: { inventory: true } }),
    prisma.offer.findMany({ where: { productId: id }, orderBy: { sortOrder: "asc" } }),
    prisma.landingPage.findMany({ where: { productId: id } }),
  ]);
  if (!product) notFound();

  const pricingByOffice = new Map(existingPricing.map((p) => [p.officeId, p]));
  const updateProductWithId = updateProduct.bind(null, product.id);
  const upsertPricingWithId = upsertProductOfficePricing.bind(null, product.id);

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900">{product.name}</h1>

      <Card>
        <CardHeader className="font-medium">Product details</CardHeader>
        <CardBody>
          <ProductForm action={updateProductWithId} product={product} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="font-medium">Per-office pricing & inventory</CardHeader>
        <CardBody className="space-y-6">
          {offices.map((office) => {
            const existing = pricingByOffice.get(office.id);
            const money = (v: number) =>
              formatMoney(v, {
                currencySymbol: office.currencySymbol,
                symbolPosition: office.symbolPosition,
                decimalDigits: office.decimalDigits,
                thousandSeparator: office.thousandSeparator,
                decimalSeparator: office.decimalSeparator,
              });
            return (
              <form
                key={office.id}
                action={upsertPricingWithId}
                className="rounded-xl border border-zinc-100 p-4"
              >
                <input type="hidden" name="officeId" value={office.id} />
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-medium text-zinc-900">
                    {office.name} ({office.currencyCode})
                  </h3>
                  {existing && (
                    <span className="text-xs text-zinc-500">
                      Selling {money(Number(existing.sellingPrice))} · Stock{" "}
                      {existing.inventory?.quantityOnHand ?? 0}
                    </span>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Cost price</Label>
                    <Input name="costPrice" type="number" step="0.01" min={0} defaultValue={existing ? String(existing.costPrice) : ""} required />
                  </div>
                  <div>
                    <Label>Selling price</Label>
                    <Input name="sellingPrice" type="number" step="0.01" min={0} defaultValue={existing ? String(existing.sellingPrice) : ""} required />
                  </div>
                  <div>
                    <Label>Compare-at price</Label>
                    <Input name="compareAtPrice" type="number" step="0.01" min={0} defaultValue={existing?.compareAtPrice ? String(existing.compareAtPrice) : ""} />
                  </div>
                  <div>
                    <Label>Low stock threshold</Label>
                    <Input name="lowStockThreshold" type="number" min={0} defaultValue={existing ? existing.lowStockThreshold : 10} />
                  </div>
                  <div>
                    <Label>Quantity on hand</Label>
                    <Input name="quantityOnHand" type="number" min={0} defaultValue={existing?.inventory?.quantityOnHand ?? 0} required />
                  </div>
                  <label className="flex items-center gap-2 self-end pb-3 text-sm text-zinc-700">
                    <input type="checkbox" name="isActive" defaultChecked={existing?.isActive ?? true} className="h-4 w-4 rounded border-zinc-300" />
                    Available in this office
                  </label>
                </div>
                <Button type="submit" size="sm" className="mt-3">
                  Save {office.name} pricing
                </Button>
              </form>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between font-medium">
          <span>Offers ({offers.length})</span>
          <LinkButton href={`/admin/offers/new?productId=${product.id}`} size="sm">
            + New offer
          </LinkButton>
        </CardHeader>
        <CardBody>
          <ul className="divide-y divide-zinc-100 text-sm">
            {offers.map((offer) => (
              <li key={offer.id} className="flex items-center justify-between py-2">
                <Link href={`/admin/offers/${offer.id}`} className="hover:underline">
                  {offer.title}
                </Link>
                <span className="text-xs text-zinc-500">{offer.isActive ? "Active" : "Inactive"}</span>
              </li>
            ))}
            {offers.length === 0 && <p className="py-2 text-zinc-500">No offers yet — create one to sell this product.</p>}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between font-medium">
          <span>Landing pages ({landingPages.length})</span>
          <LinkButton href={`/admin/landing-pages/new?productId=${product.id}`} size="sm">
            + New landing page
          </LinkButton>
        </CardHeader>
        <CardBody>
          <ul className="divide-y divide-zinc-100 text-sm">
            {landingPages.map((lp) => (
              <li key={lp.id} className="flex items-center justify-between py-2">
                <Link href={`/admin/landing-pages/${lp.id}`} className="hover:underline">
                  {lp.title} — /{lp.slug}
                </Link>
                <span className="text-xs text-zinc-500">{lp.status}</span>
              </li>
            ))}
            {landingPages.length === 0 && <p className="py-2 text-zinc-500">No landing pages yet.</p>}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
