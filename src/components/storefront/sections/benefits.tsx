import type { BenefitsData } from '@/types/landing-sections';

export function Benefits({ data }: { data: BenefitsData }) {
  return (
    <section className="bg-white px-4 py-12">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-bold text-brand-dark sm:text-3xl">{data.title}</h2>
        <ul className="mx-auto mt-8 grid max-w-xl grid-cols-1 gap-3 text-left sm:grid-cols-2">
          {data.items.map((item) => (
            <li key={item} className="flex items-start gap-2 rounded-lg bg-cream p-3 text-sm text-brand-dark">
              <span className="mt-0.5 text-brand">✓</span> {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
