"use client";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";

export type OfferOption = {
  id: string;
  title: string;
  subtitle: string | null;
  badge: string | null;
  isDefault: boolean;
  pricing: {
    subtotal: number;
    compareAtSubtotal: number | null;
    total: number;
    shipping: number;
    savingsPercent: number;
    totalQuantity: number;
    paidQuantity: number;
    freeQuantity: number;
  };
};

type CurrencyFormat = {
  currencySymbol: string;
  symbolPosition: string;
  decimalDigits: number;
  thousandSeparator: string;
  decimalSeparator: string;
};

export function PackageSelector({
  offers,
  selectedId,
  onSelect,
  currencyFormat,
}: {
  offers: OfferOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  currencyFormat: CurrencyFormat;
}) {
  const money = (v: number) => formatMoney(v, currencyFormat);

  return (
    <div className="space-y-3">
      {offers.map((offer) => {
        const selected = offer.id === selectedId;
        return (
          <button
            key={offer.id}
            type="button"
            onClick={() => onSelect(offer.id)}
            className={cn(
              "relative w-full rounded-2xl border-2 bg-white p-4 text-left transition-all",
              selected
                ? "border-brand-green-700 shadow-md ring-1 ring-brand-green-700/20"
                : "border-zinc-200 hover:border-zinc-300",
            )}
          >
            {offer.badge && (
              <span className="absolute -top-2.5 right-4 rounded-full bg-brand-gold-500 px-3 py-0.5 text-xs font-bold text-brand-green-900 shadow-sm">
                {offer.badge}
              </span>
            )}
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                  selected ? "border-brand-green-700" : "border-zinc-300",
                )}
              >
                {selected && <span className="h-2.5 w-2.5 rounded-full bg-brand-green-700" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold text-zinc-900">{offer.title}</p>
                  {offer.pricing.savingsPercent > 0 && (
                    <span className="shrink-0 rounded-full bg-brand-green-50 px-2 py-0.5 text-xs font-semibold text-brand-green-700">
                      SAVE {offer.pricing.savingsPercent}%
                    </span>
                  )}
                </div>
                {offer.subtitle && <p className="text-sm text-zinc-500">{offer.subtitle}</p>}
                <div className="mt-1 flex items-baseline gap-2">
                  {offer.pricing.compareAtSubtotal && offer.pricing.compareAtSubtotal > offer.pricing.subtotal && (
                    <span className="text-sm text-zinc-400 line-through">{money(offer.pricing.compareAtSubtotal)}</span>
                  )}
                  <span className="text-lg font-bold text-brand-green-800">{money(offer.pricing.subtotal)}</span>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
