import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";

export default async function LandingPagesPage() {
  const pages = await prisma.landingPage.findMany({
    orderBy: { createdAt: "desc" },
    include: { product: true, office: true },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Landing Pages</h1>
        <LinkButton href="/admin/landing-pages/new">+ New landing page</LinkButton>
      </div>
      <div className="grid gap-3">
        {pages.map((page) => (
          <Card key={page.id}>
            <CardBody className="flex items-center justify-between">
              <div>
                <Link href={`/admin/landing-pages/${page.id}`} className="font-semibold text-zinc-900 hover:underline">
                  {page.title}
                </Link>
                <p className="text-xs text-zinc-500">
                  /{page.slug} · {page.product.name} {page.office ? `· default office: ${page.office.name}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={page.status === "PUBLISHED" ? "green" : page.status === "DRAFT" ? "gray" : "red"}>
                  {page.status}
                </Badge>
                {page.status === "PUBLISHED" && (
                  <a href={`/${page.slug}`} target="_blank" className="text-xs text-brand-green-700 hover:underline">
                    View live
                  </a>
                )}
              </div>
            </CardBody>
          </Card>
        ))}
        {pages.length === 0 && <p className="text-sm text-zinc-500">No landing pages yet.</p>}
      </div>
    </div>
  );
}
