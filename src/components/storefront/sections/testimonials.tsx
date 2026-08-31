import type { TestimonialsData } from '@/types/landing-sections';

export function Testimonials({ data }: { data: TestimonialsData }) {
  return (
    <section className="bg-white px-4 py-12">
      <div className="mx-auto max-w-5xl text-center">
        <h2 className="text-2xl font-bold text-brand-dark sm:text-3xl">{data.title}</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((t) => (
            <div key={t.name} className="rounded-xl2 border border-brand-dark/10 bg-cream p-5 text-left">
              <div className="mb-2 text-gold">{'★'.repeat(t.rating ?? 5)}</div>
              <p className="text-sm text-brand-dark/80">&ldquo;{t.quote}&rdquo;</p>
              <p className="mt-3 text-xs font-semibold text-brand-dark">
                {t.name} {t.location && <span className="font-normal text-brand-dark/40">· {t.location}</span>}
                {t.verified && <span className="ml-1 text-brand">✓ Verified</span>}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
