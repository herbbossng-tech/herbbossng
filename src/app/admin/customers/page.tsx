import Link from 'next/link';
import { db } from '@/lib/db';
import { getActiveOffice } from '@/lib/office-context';
import { PageHeader, Card, Input, EmptyState } from '@/components/ui';

export default async function CustomersPage({ searchParams }: { searchParams: { q?: string } }) {
  const office = await getActiveOffice();
  if (!office) return <EmptyState title="No office configured" />;

  const customers = await db.customer.findMany({
    where: {
      officeId: office.id,
      ...(searchParams.q
        ? { OR: [{ name: { contains: searchParams.q, mode: 'insensitive' } }, { phone: { contains: searchParams.q, mode: 'insensitive' } }] }
        : {}),
    },
    include: { orders: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div>
      <PageHeader title="Customers" description={`${office.name} customer database`} />
      <Card className="mb-4">
        <form method="GET" className="flex gap-3">
          <Input name="q" defaultValue={searchParams.q} placeholder="Search name or phone" className="max-w-xs" />
          <button className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white">Search</button>
        </form>
      </Card>

      {customers.length === 0 ? (
        <EmptyState title="No customers yet" />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-brand-dark/10 text-xs uppercase text-brand-dark/40">
                <th className="p-3">Name</th>
                <th>Phone</th>
                <th>Orders</th>
                <th>Delivered</th>
                <th>Cancelled</th>
                <th>First order</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const delivered = c.orders.filter((o) => o.status === 'DELIVERED').length;
                const cancelled = c.orders.filter((o) => o.status === 'CANCELLED').length;
                return (
                  <tr key={c.id} className="border-b border-brand-dark/5 hover:bg-brand/5">
                    <td className="p-3">
                      <Link href={`/admin/customers/${c.id}`} className="font-medium text-brand hover:underline">{c.name}</Link>
                    </td>
                    <td>{c.phone}</td>
                    <td>{c.orders.length}</td>
                    <td>{delivered}</td>
                    <td>{cancelled}</td>
                    <td className="text-xs text-brand-dark/40">{c.createdAt.toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
