'use client';

import type { OfferQuote } from '@/components/storefront/order-section-client';

export function PackageSelector({
  offers,
  selectedOfferId,
  onSelect,
  formatMoney,
}: {
  offers: OfferQuote[];
  selectedOfferId: string;
  onSelect: (offerId: string) => void;
  formatMoney: (amount: number) => string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {offers.map((offer) => {
        const selected = offer.offerId === selectedOfferId;
        return (
          <button
            type="button"
            key={offer.offerId}
            onClick={() => onSelect(offer.offerId)}
            className={`relative w-full rounded-xl2 border-2 bg-white p-4 text-left transition sm:p-5 ${
              selected ? 'border-brand shadow-cardSelected' : 'border-brand-dark/10 shadow-card hover:border-brand/40'
            }`}
          >
            {offer.badgeText && (
              <span
                className="absolute -top-3 right-4 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow"
                style={{ backgroundColor: offer.badgeColor ?? '#b6862c' }}
              >
                {offer.badgeText}
              </span>
            )}
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  selected ? 'border-brand bg-brand' : 'border-brand-dark/25'
                }`}
              >
                {selected && <span className="h-2 w-2 rounded-full bg-white" />}
              </span>
              <div className="flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="font-semibold text-brand-dark">{offer.name}</p>
                  {offer.savingsPercent > 0 && (
                    <span className="text-xs font-bold uppercase tracking-wide text-brand">Save {offer.savingsPercent}%</span>
                  )}
                </div>
                {offer.subtitle && <p className="text-xs text-brand-dark/50">{offer.subtitle}</p>}
                <div className="mt-2 flex items-baseline gap-2">
                  {offer.compareAtSubtotal > offer.subtotal && (
                    <span className="text-sm text-brand-dark/40 line-through">{formatMoney(offer.compareAtSubtotal)}</span>
                  )}
                  <span className="text-lg font-bold text-brand-dark">{formatMoney(offer.subtotal)}</span>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
