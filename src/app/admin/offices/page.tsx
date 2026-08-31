import { db } from '@/lib/db';
import { PageHeader, Card, Badge, LinkButton, EmptyState } from '@/components/ui';
import { requirePageAccess } from '@/lib/require-page-access';

export default async function OfficesPage() {
  await requirePageAccess('offices');
  const offices = await db.office.findMany({ orderBy: { sortOrder: 'asc' } });

  return (
    <div>
      <PageHeader
        title="Offices"
        description="Each office is a fully configured country market — currency, locations, delivery, taxes, phone rules."
        action={<LinkButton href="/admin/offices/new">Add Office</LinkButton>}
      />
      {offices.length === 0 ? (
        <EmptyState title="No offices yet" description="Create your first country market to get started." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {offices.map((office) => (
            <a key={office.id} href={`/admin/offices/${office.id}`}>
              <Card className="transition hover:shadow-cardSelected">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-brand-dark">{office.name}</p>
                  <Badge tone={office.isActive ? 'success' : 'neutral'}>{office.isActive ? 'Active' : 'Inactive'}</Badge>
                </div>
                <p className="mt-1 text-sm text-brand-dark/50">
                  {office.currencyCode} · {office.currencySymbol} · {office.divisionLabel} hierarchy
                </p>
                <p className="mt-2 text-xs text-brand-dark/40">Order prefix: {office.orderNumberPrefix}-AF-######</p>
              </Card>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
