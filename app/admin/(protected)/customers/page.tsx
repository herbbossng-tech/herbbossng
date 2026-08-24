import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentAdminOffice } from "@/lib/office-context";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const office = await getCurrentAdminOffice();
  if (!office) return <p className="text-sm text-zinc-500">Create an office first.</p>;

  const customers = await prisma.customer.findMany({
    where: {
      officeId: office.id,
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { orders: true } } },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">Customers — {office.name}</h1>
      <form className="flex gap-2" method="get">
        <Input name="q" defaultValue={q} placeholder="Search name or phone" className="max-w-xs" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Orders</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/customers/${c.id}`} className="font-medium text-brand-green-700 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{c.phone}</td>
                <td className="px-4 py-3">{c.city ?? "—"}</td>
                <td className="px-4 py-3">{c._count.orders}</td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  No customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
