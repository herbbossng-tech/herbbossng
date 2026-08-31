import type { HowItWorksData } from '@/types/landing-sections';

export function HowItWorks({ data }: { data: HowItWorksData }) {
  return (
    <section className="bg-cream px-4 py-12">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-bold text-brand-dark sm:text-3xl">{data.title}</h2>
        <ol className="mt-8 flex flex-col gap-4 text-left">
          {data.steps.map((step, i) => (
            <li key={step.title} className="flex gap-4 rounded-xl2 border border-brand-dark/10 bg-white p-4 shadow-card">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span>
              <div>
                <p className="font-semibold text-brand-dark">{step.title}</p>
                <p className="mt-1 text-sm text-brand-dark/60">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
