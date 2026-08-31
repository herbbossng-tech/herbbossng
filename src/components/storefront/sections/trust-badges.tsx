import type { TrustBadgesData } from '@/types/landing-sections';

export function TrustBadges({ data }: { data: TrustBadgesData }) {
  return (
    <section className="border-y border-brand-dark/10 bg-white px-4 py-6">
      <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-6 sm:gap-10">
        {data.items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-sm font-medium text-brand-dark">
            <span className="text-xl">{item.icon}</span> {item.label}
          </div>
        ))}
      </div>
    </section>
  );
}
