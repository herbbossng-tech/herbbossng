'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PackageSelector } from '@/components/storefront/package-selector';
import { OrderForm, type DivisionOption, type OrderFormValues } from '@/components/storefront/order-form';
import { StickyCta } from '@/components/storefront/sticky-cta';
import { trackPixel, trackGa4, captureAttribution, trackServerEvent } from '@/lib/tracking/client';

export interface OfferQuote {
  offerId: string;
  name: string;
  subtitle?: string | null;
  badgeText?: string | null;
  badgeColor?: string | null;
  isDefault: boolean;
  totalQuantity: number;
  quantityFree: number;
  subtotal: number;
  compareAtSubtotal: number;
  savingsPercent: number;
}

interface CurrencyConfig {
  currencySymbol: string;
  currencySymbolPosition: 'BEFORE' | 'AFTER';
  currencyDecimalPlaces: number;
  currencyThousandSep: string;
  currencyDecimalSep: string;
}

export function OrderSectionClient({
  productId,
  productName,
  officeId,
  landingPageId,
  currency,
  divisionLabel,
  phoneCountryCode,
  divisions,
  offers,
  title,
  subtitle,
  showStickyCta,
  stickyCtaLabel,
}: {
  productId: string;
  productName: string;
  officeId: string;
  landingPageId?: string;
  currency: CurrencyConfig;
  divisionLabel: string;
  phoneCountryCode: string;
  divisions: DivisionOption[];
  offers: OfferQuote[];
  title?: string;
  subtitle?: string;
  showStickyCta?: boolean;
  stickyCtaLabel?: string;
}) {
  const router = useRouter();
  const [selectedOfferId, setSelectedOfferId] = useState(offers.find((o) => o.isDefault)?.offerId ?? offers[0]?.offerId ?? '');
  const [deliveryAreaId, setDeliveryAreaId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [checkoutStarted, setCheckoutStarted] = useState(false);

  const selectedOffer = offers.find((o) => o.offerId === selectedOfferId) ?? offers[0];

  function formatMoney(amount: number) {
    const fixed = amount.toFixed(currency.currencyDecimalPlaces);
    const [intPart, decPart] = fixed.split('.');
    const withThousands = (intPart ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, currency.currencyThousandSep);
    const numberStr = decPart ? `${withThousands}${currency.currencyDecimalSep}${decPart}` : withThousands;
    return currency.currencySymbolPosition === 'BEFORE' ? `${currency.currencySymbol}${numberStr}` : `${numberStr}${currency.currencySymbol}`;
  }

  function handleSelectOffer(offerId: string) {
    setSelectedOfferId(offerId);
    const offer = offers.find((o) => o.offerId === offerId);
    if (offer) {
      trackPixel('AddToCart', { content_name: productName, content_ids: [offerId], value: offer.subtotal, currency: 'auto' });
      trackGa4('select_item', { items: [{ item_name: productName, item_variant: offer.name }] });
      trackServerEvent({ officeId, eventType: 'select_item', landingPageId, productId });
    }
  }

  function handleFormStart() {
    if (checkoutStarted) return;
    setCheckoutStarted(true);
    trackPixel('InitiateCheckout', { content_name: productName, value: selectedOffer?.subtotal, currency: 'auto' });
    trackGa4('begin_checkout', { items: [{ item_name: productName }] });
    trackServerEvent({ officeId, eventType: 'begin_checkout', landingPageId, productId });
  }

  async function handleSubmit(values: OrderFormValues) {
    if (!selectedOffer) return;
    setSubmitting(true);
    setError('');

    const eventId = crypto.randomUUID();
    const attribution = captureAttribution();

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          officeId,
          productId,
          offerId: selectedOfferId,
          landingPageId,
          customerName: values.customerName,
          phone: values.phone,
          email: values.email,
          deliveryAddress: values.deliveryAddress,
          divisionId: values.divisionId,
          cityId: values.cityId,
          deliveryAreaId: values.deliveryAreaId || undefined,
          customerNotes: values.customerNotes,
          idempotencyKey: eventId,
          eventId,
          source: 'landing_page',
          ...attribution,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }

      trackPixel('Purchase', { value: json.total, currency: json.currencyCode }, eventId);
      trackGa4('purchase', { transaction_id: json.orderNumber, value: json.total, currency: json.currencyCode });

      router.push(`/thank-you/${json.orderNumber}`);
    } catch {
      setError('Network error — please check your connection and try again.');
      setSubmitting(false);
    }
  }

  const ctaLabel = selectedOffer ? `Place Order — ${formatMoney(selectedOffer.subtotal)}` : 'Place Order';
  const stickyLabel = (stickyCtaLabel ?? 'ORDER FROM {price} • PAY ON DELIVERY').replace(
    '{price}',
    selectedOffer ? formatMoney(selectedOffer.subtotal) : ''
  );

  return (
    <section id="order" className="bg-white px-4 py-12">
      <div className="mx-auto max-w-xl">
        <h2 className="text-center text-2xl font-bold uppercase tracking-wide text-brand-dark sm:text-3xl">{title ?? 'Select your package'}</h2>
        {subtitle && <p className="mt-2 text-center text-sm text-brand-dark/60">{subtitle}</p>}

        <div className="mt-8">
          <PackageSelector offers={offers} selectedOfferId={selectedOfferId} onSelect={handleSelectOffer} formatMoney={formatMoney} />
        </div>

        <div className="mt-10" onFocusCapture={handleFormStart}>
          <OrderForm
            divisionLabel={divisionLabel}
            phoneCountryCode={phoneCountryCode}
            divisions={divisions}
            ctaLabel={ctaLabel}
            submitting={submitting}
            error={error}
            onSubmit={handleSubmit}
            onDeliveryAreaChange={setDeliveryAreaId}
          />
        </div>
      </div>

      {showStickyCta !== false && selectedOffer && (
        <StickyCta
          label={stickyLabel}
          onClick={() => document.getElementById('order-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        />
      )}
    </section>
  );
}
