import type { GuaranteeData } from '@/types/landing-sections';

export function Guarantee({ data }: { data: GuaranteeData }) {
  return (
    <section className="bg-brand px-4 py-12 text-white">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-3 text-4xl">{data.icon ?? '🛡️'}</div>
        <h2 className="text-2xl font-bold">{data.title}</h2>
        <p className="mt-3 text-sm text-white/80">{data.description}</p>
      </div>
    </section>
  );
}
