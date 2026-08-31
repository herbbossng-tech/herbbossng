import type { FormulaData } from '@/types/landing-sections';

export function Formula({ data }: { data: FormulaData }) {
  return (
    <section className="bg-white px-4 py-12">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="text-2xl font-bold text-brand-dark sm:text-3xl">{data.title}</h2>
        {data.intro && <p className="mx-auto mt-3 max-w-xl text-sm text-brand-dark/60">{data.intro}</p>}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {data.ingredients.map((ing) => (
            <div key={ing.name} className="rounded-xl2 border border-brand-dark/10 bg-cream p-4">
              {ing.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ing.image} alt={ing.name} className="mx-auto mb-3 h-16 w-16 rounded-full object-cover" />
              )}
              <p className="font-semibold text-brand-dark">{ing.name}</p>
              <p className="mt-1 text-xs text-brand-dark/60">{ing.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
