import Link from 'next/link';
import { db } from '@/lib/db';

export default async function HomePage() {
  const pages = await db.landingPage.findMany({
    where: { status: 'PUBLISHED' },
    include: { office: true },
    orderBy: { createdAt: 'asc' },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-semibold text-brand">COD Commerce</h1>
      <p className="text-sm text-brand-dark/70">
        Multi-country cash-on-delivery commerce platform. Visit{' '}
        <Link href="/admin" className="text-gold underline">
          /admin
        </Link>{' '}
        to manage products, offices and orders.
      </p>
      {pages.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wide text-brand-dark/50">Published landing pages</p>
          {pages.map((p) => (
            <Link
              key={p.id}
              href={`/${p.slug}${p.office ? `?office=${p.office.countryCode.toLowerCase()}` : ''}`}
              className="rounded-full bg-brand px-4 py-2 text-sm text-white"
            >
              {p.title} {p.office ? `(${p.office.name})` : ''}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
