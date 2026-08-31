import type { HeroData } from '@/types/landing-sections';

export function Hero({ data, priceLabel }: { data: HeroData; priceLabel?: string }) {
  return (
    <section className="bg-cream px-4 pb-10 pt-8 sm:pt-14">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 sm:flex-row">
        <div className="flex-1 text-center sm:text-left">
          {data.badge && (
            <span className="mb-3 inline-block rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand">
              {data.badge}
            </span>
          )}
          <h1 className="text-3xl font-bold leading-tight text-brand-dark sm:text-4xl">{data.headline}</h1>
          {data.subheadline && <p className="mt-4 text-base text-brand-dark/70">{data.subheadline}</p>}
          {priceLabel && <p className="mt-4 text-2xl font-semibold text-brand">{priceLabel}</p>}
          {data.ctaText && (
            <a
              href="#order"
              className="mt-6 inline-flex items-center justify-center rounded-full bg-brand px-8 py-3.5 text-sm font-semibold text-white shadow-cardSelected transition hover:bg-brand-light"
            >
              {data.ctaText}
            </a>
          )}
          {data.trustPoints && data.trustPoints.length > 0 && (
            <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-medium text-brand-dark/60 sm:justify-start">
              {data.trustPoints.map((t) => (
                <li key={t} className="flex items-center gap-1">
                  <span className="text-brand">✓</span> {t}
                </li>
              ))}
            </ul>
          )}
        </div>
        {data.image && (
          <div className="flex-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.image} alt={data.headline} className="mx-auto w-full max-w-sm rounded-xl2 object-cover shadow-cardSelected" />
          </div>
        )}
      </div>
    </section>
  );
}
