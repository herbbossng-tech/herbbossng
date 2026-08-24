import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";

export default async function OffersPage() {
  const offers = await prisma.offer.findMany({
    orderBy: [{ productId: "asc" }, { sortOrder: "asc" }],
    include: { product: true },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Offers</h1>
        <LinkButton href="/admin/offers/new">+ New offer</LinkButton>
      </div>
      <div className="grid gap-3">
        {offers.map((offer) => (
          <Card key={offer.id}>
            <CardBody className="flex items-center justify-between">
              <div>
                <Link href={`/admin/offers/${offer.id}`} className="font-semibold text-zinc-900 hover:underline">
                  {offer.title}
                </Link>
                <p className="text-xs text-zinc-500">
                  {offer.product.name} · {offer.type.replace(/_/g, " ")} · pay {offer.paidQuantity}, get{" "}
                  {offer.paidQuantity + offer.freeQuantity}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {offer.badge && <Badge tone="gold">{offer.badge}</Badge>}
                <Badge tone={offer.isActive ? "green" : "gray"}>{offer.isActive ? "Active" : "Inactive"}</Badge>
              </div>
            </CardBody>
          </Card>
        ))}
        {offers.length === 0 && <p className="text-sm text-zinc-500">No offers yet.</p>}
      </div>
    </div>
  );
}
