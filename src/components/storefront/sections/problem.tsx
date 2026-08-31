import type { ProblemData } from '@/types/landing-sections';

export function Problem({ data }: { data: ProblemData }) {
  return (
    <section className="bg-cream px-4 py-12">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="text-2xl font-bold text-brand-dark sm:text-3xl">{data.title}</h2>
        {data.intro && <p className="mx-auto mt-3 max-w-xl text-sm text-brand-dark/60">{data.intro}</p>}
        <div className="mt-8 grid grid-cols-1 gap-4 text-left sm:grid-cols-2">
          {data.signs.map((sign) => (
            <div key={sign.title} className="rounded-xl2 border border-brand-dark/10 bg-white p-5 shadow-card">
              <p className="font-semibold text-brand-dark">{sign.title}</p>
              <p className="mt-1 text-sm text-brand-dark/60">{sign.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
