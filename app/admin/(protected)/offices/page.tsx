import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";

export default async function OfficesPage() {
  const offices = await prisma.office.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Offices / Markets</h1>
        <LinkButton href="/admin/offices/new">+ Add office</LinkButton>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {offices.map((office) => (
          <Link key={office.id} href={`/admin/offices/${office.id}`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardBody>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-zinc-900">{office.name}</h2>
                  <Badge tone={office.isActive ? "green" : "gray"}>{office.isActive ? "Active" : "Inactive"}</Badge>
                </div>
                <p className="mt-1 text-sm text-zinc-500">
                  {office.countryCode} · {office.currencyCode} ({office.currencySymbol})
                </p>
                <p className="mt-2 text-xs text-zinc-400">
                  Order prefix: {office.orderPrefix} · {office.divisionLabel} level locations
                </p>
              </CardBody>
            </Card>
          </Link>
        ))}
        {offices.length === 0 && (
          <p className="text-sm text-zinc-500">No offices yet. Create your first one.</p>
        )}
      </div>
    </div>
  );
}
