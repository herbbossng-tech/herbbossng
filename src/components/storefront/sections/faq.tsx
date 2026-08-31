import type { FaqData } from '@/types/landing-sections';

export function Faq({ data }: { data: FaqData }) {
  return (
    <section className="bg-cream px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-center text-2xl font-bold text-brand-dark sm:text-3xl">{data.title}</h2>
        <div className="mt-8 flex flex-col gap-3">
          {data.items.map((item) => (
            <details key={item.question} className="group rounded-xl2 border border-brand-dark/10 bg-white p-4 shadow-card open:shadow-cardSelected">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-brand-dark">
                {item.question}
                <span className="ml-2 text-brand transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm text-brand-dark/60">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
