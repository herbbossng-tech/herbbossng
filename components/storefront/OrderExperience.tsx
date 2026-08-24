"use client";

import { useEffect, useRef, useState } from "react";
import { randomId } from "@/lib/client-id";
import { PackageSelector, type OfferOption } from "@/components/storefront/PackageSelector";
import { OrderForm } from "@/components/storefront/OrderForm";
import { formatMoney } from "@/lib/currency";
import { trackEvent } from "@/lib/analytics-client";

type Division = { id: string; name: string; cities: { id: string; name: string }[] };

type CurrencyFormat = {
  currencySymbol: string;
  symbolPosition: string;
  decimalDigits: number;
  thousandSeparator: string;
  decimalSeparator: string;
};

export function OrderExperience({
  title,
  productId,
  officeId,
  offers,
  currencyFormat,
  divisionLabel,
  phoneCountryCode,
  phoneRegex,
  divisions,
  landingPageSlug,
  stickyCtaTemplate,
}: {
  title: string;
  productId: string;
  officeId: string;
  offers: OfferOption[];
  currencyFormat: CurrencyFormat;
  divisionLabel: string;
  phoneCountryCode: string;
  phoneRegex: string;
  divisions: Division[];
  landingPageSlug: string;
  stickyCtaTemplate?: string | null;
}) {
  const defaultOffer = offers.find((o) => o.isDefault) ?? offers[0];
  const [selectedId, setSelectedId] = useState(defaultOffer?.id ?? "");
  const [idempotencyKey] = useState(() => randomId());
  const formRef = useRef<HTMLDivElement>(null);

  const selectedOffer = offers.find((o) => o.id === selectedId) ?? defaultOffer;

  useEffect(() => {
    if (!selectedOffer) return;
    trackEvent("page_view", { officeId, productId, landingPageSlug });
    trackEvent("view_content", {
      officeId,
      productId,
      landingPageSlug,
      value: selectedOffer.pricing.total,
      currency: currencyFormat.currencySymbol,
    });
    // Fire once on mount only — subsequent offer switches are tracked via handleSelect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelect(id: string) {
    setSelectedId(id);
    const offer = offers.find((o) => o.id === id);
    if (offer) {
      trackEvent("select_item", {
        officeId,
        productId,
        landingPageSlug,
        value: offer.pricing.total,
        currency: currencyFormat.currencySymbol,
      });
    }
  }

  if (!selectedOffer) return null;

  const money = (v: number) => formatMoney(v, currencyFormat);
  const ctaText = stickyCtaTemplate
    ? stickyCtaTemplate.replace("{price}", money(selectedOffer.pricing.total))
    : `ORDER FROM ${money(selectedOffer.pricing.total)} • PAY ON DELIVERY`;

  return (
    <section id="order" ref={formRef} className="bg-white px-4 py-12">
      <div className="mx-auto max-w-xl">
        <h2 className="mb-1 text-center text-2xl font-bold text-brand-green-900">{title}</h2>
        <p className="mb-6 text-center text-sm text-zinc-500">Cash on Delivery — pay when it arrives</p>

        <PackageSelector offers={offers} selectedId={selectedOffer.id} onSelect={handleSelect} currencyFormat={currencyFormat} />

        <div className="my-6 rounded-2xl bg-brand-cream p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">Subtotal</span>
            <span className="font-medium text-zinc-800">{money(selectedOffer.pricing.subtotal)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-zinc-500">Delivery</span>
            <span className="font-medium text-zinc-800">{selectedOffer.pricing.shipping === 0 ? "Free" : money(selectedOffer.pricing.shipping)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-zinc-200 pt-2 text-base font-bold text-brand-green-800">
            <span>Total</span>
            <span>{money(selectedOffer.pricing.total)}</span>
          </div>
        </div>

        <OrderForm
          productId={productId}
          officeId={officeId}
          offerId={selectedOffer.id}
          total={selectedOffer.pricing.total}
          currencyFormat={currencyFormat}
          divisionLabel={divisionLabel}
          phoneCountryCode={phoneCountryCode}
          phoneRegex={phoneRegex}
          divisions={divisions}
          landingPageSlug={landingPageSlug}
          idempotencyKey={idempotencyKey}
        />
      </div>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 px-4 pt-3 backdrop-blur sm:hidden">
        <button
          type="button"
          onClick={() => document.getElementById("order-form")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="w-full rounded-2xl bg-brand-green-700 px-4 py-3.5 text-center text-sm font-bold text-white shadow-lg"
        >
          {ctaText}
        </button>
      </div>
    </section>
  );
}
