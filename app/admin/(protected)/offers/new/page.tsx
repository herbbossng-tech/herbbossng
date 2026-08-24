import { prisma } from "@/lib/prisma";
import { OfferForm } from "@/components/admin/OfferForm";
import { createOffer } from "../actions";

export default async function NewOfferPage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  const { productId } = await searchParams;
  const products = await prisma.product.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">New offer</h1>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <OfferForm action={createOffer} products={products} defaultProductId={productId} />
      </div>
    </div>
  );
}
