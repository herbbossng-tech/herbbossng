import { db } from '@/lib/db';
import { PageHeader, Card, Input, Label, Select, Button } from '@/components/ui';
import { createLandingPage } from '../actions';

export default async function NewLandingPagePage() {
  const [products, offices] = await Promise.all([
    db.product.findMany({ orderBy: { name: 'asc' } }),
    db.office.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);

  return (
    <div>
      <PageHeader title="New Landing Page" description="Starts with a standard section set you can reorder, enable/disable and edit." />
      <Card>
        <form action={createLandingPage} className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label required>Product</Label>
            <Select name="productId" required>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Office (optional — leave blank to share across offices)</Label>
            <Select name="officeId">
              <option value="">All offices</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label required>Page title</Label>
            <Input name="title" required placeholder="Ginseng Five Treasures Tea" />
          </div>
          <div>
            <Label required>Slug</Label>
            <Input name="slug" required placeholder="ginseng-five-treasures-tea" />
          </div>
          <div className="col-span-full">
            <Label>SEO title</Label>
            <Input name="seoTitle" />
          </div>
          <div className="col-span-full">
            <Label>SEO description</Label>
            <Input name="seoDescription" />
          </div>
          <div className="col-span-full">
            <Button type="submit">Create landing page</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
