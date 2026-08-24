import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const pages = await prisma.landingPage.findMany({ where: { status: "PUBLISHED" }, take: 5 });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-brand-cream px-4 text-center">
      <div>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-green-700 text-lg font-bold text-white">
          CC
        </div>
        <h1 className="text-2xl font-bold text-brand-green-900">COD Commerce</h1>
        <p className="mt-1 text-sm text-zinc-500">Multi-country cash-on-delivery commerce platform</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/admin" className="rounded-xl bg-brand-green-700 px-5 py-2.5 text-sm font-semibold text-white">
          Go to admin
        </Link>
        {pages.map((p) => (
          <Link key={p.id} href={`/${p.slug}`} className="rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700">
            View {p.title}
          </Link>
        ))}
      </div>
    </div>
  );
}
