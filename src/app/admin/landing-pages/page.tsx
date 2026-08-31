import { db } from '@/lib/db';
import { PageHeader, Card, Badge, LinkButton, EmptyState } from '@/components/ui';

export default async function LandingPagesPage() {
  const pages = await db.landingPage.findMany({
    include: { product: true, office: true },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div>
      <PageHeader
        title="Landing Pages"
        description="Sections-as-data pages. Publish to make them live at /[slug]."
        action={<LinkButton href="/admin/landing-pages/new">New Landing Page</LinkButton>}
      />
      {pages.length === 0 ? (
        <EmptyState title="No landing pages yet" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((p) => (
            <a key={p.id} href={`/admin/landing-pages/${p.id}`}>
              <Card className="transition hover:shadow-cardSelected">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-brand-dark">{p.title}</p>
                  <Badge tone={p.status === 'PUBLISHED' ? 'success' : p.status === 'DRAFT' ? 'warning' : 'neutral'}>{p.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-brand-dark/40">/{p.slug} {p.office ? `· ${p.office.name}` : ''}</p>
                <p className="mt-1 text-xs text-brand-dark/40">{p.product.name}</p>
              </Card>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
