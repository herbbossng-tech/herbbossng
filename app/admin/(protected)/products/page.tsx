import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { duplicateProduct, archiveProduct } from "./actions";

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: { offices: true, offers: true, landingPages: true },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Products</h1>
        <LinkButton href="/admin/products/new">+ New product</LinkButton>
      </div>
      <div className="grid gap-3">
        {products.map((product) => (
          <Card key={product.id}>
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Link href={`/admin/products/${product.id}`} className="font-semibold text-zinc-900 hover:underline">
                  {product.name}
                </Link>
                <p className="text-xs text-zinc-500">
                  {product.sku} · {product.offices.length} office price(s) · {product.offers.length} offer(s) ·{" "}
                  {product.landingPages.length} landing page(s)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={product.status === "ACTIVE" ? "green" : product.status === "DRAFT" ? "gray" : "red"}>
                  {product.status}
                </Badge>
                <form action={duplicateProduct.bind(null, product.id)}>
                  <button className="text-xs text-zinc-500 hover:underline">Duplicate</button>
                </form>
                {product.status !== "ARCHIVED" && (
                  <form action={archiveProduct.bind(null, product.id)}>
                    <button className="text-xs text-red-600 hover:underline">Archive</button>
                  </form>
                )}
              </div>
            </CardBody>
          </Card>
        ))}
        {products.length === 0 && <p className="text-sm text-zinc-500">No products yet.</p>}
      </div>
    </div>
  );
}
