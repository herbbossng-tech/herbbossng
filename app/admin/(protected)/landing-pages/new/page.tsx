import { prisma } from "@/lib/prisma";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createLandingPage } from "../actions";

export default async function NewLandingPagePage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  const { productId } = await searchParams;
  const [products, offices] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.office.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">New landing page</h1>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <form action={createLandingPage} className="space-y-4">
          <div>
            <Label htmlFor="productId">Product</Label>
            <Select id="productId" name="productId" defaultValue={productId} required>
              <option value="">Select a product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="officeId">Default office (optional — visitors can still switch)</Label>
            <Select id="officeId" name="officeId" defaultValue="">
              <option value="">No default — use first active office</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="title">Internal title</Label>
            <Input id="title" name="title" required placeholder="Ginseng Five Treasures Tea — Nigeria" />
          </div>
          <div>
            <Label htmlFor="slug">URL slug</Label>
            <Input id="slug" name="slug" required placeholder="ginseng-five-treasures-tea" />
          </div>
          <div>
            <Label htmlFor="stickyCtaText">Sticky mobile CTA text</Label>
            <Input id="stickyCtaText" name="stickyCtaText" placeholder="ORDER FROM {price} • PAY ON DELIVERY" />
          </div>
          <Button type="submit" size="lg">
            Create landing page
          </Button>
        </form>
      </div>
    </div>
  );
}
