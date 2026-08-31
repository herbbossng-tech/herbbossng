import { db } from '@/lib/db';
import { roundMoney } from '@/lib/currency';

export interface PriceQuote {
  unitPrice: number;
  quantityPaid: number;
  quantityFree: number;
  totalQuantity: number;
  subtotal: number;
  discount: number;
  compareAtSubtotal: number;
  shipping: number;
  tax: number;
  total: number;
  currencyCode: string;
  savingsPercent: number;
}

export class PricingError extends Error {}

/**
 * The single source of truth for what an order costs. Always recomputed
 * server-side from DB state (product/offer/office rows) — a client-submitted
 * total or unit price is never trusted (spec §62/§38).
 */
export async function quotePrice(params: {
  productId: string;
  officeId: string;
  offerId: string;
  deliveryAreaId?: string | null;
}): Promise<PriceQuote> {
  const { productId, officeId, offerId, deliveryAreaId } = params;

  const [office, productOffice, offer, offerOffice, deliveryArea] = await Promise.all([
    db.office.findUniqueOrThrow({ where: { id: officeId } }),
    db.productOffice.findUnique({ where: { productId_officeId: { productId, officeId } } }),
    db.offer.findUniqueOrThrow({ where: { id: offerId } }),
    db.offerOffice.findUnique({ where: { offerId_officeId: { offerId, officeId } } }),
    deliveryAreaId ? db.deliveryArea.findUnique({ where: { id: deliveryAreaId } }) : Promise.resolve(null),
  ]);

  if (!productOffice || !productOffice.isActive) {
    throw new PricingError('Product is not available in this office');
  }
  if (offer.productId !== productId) {
    throw new PricingError('Offer does not belong to this product');
  }
  if (!offer.isActive || (offerOffice && !offerOffice.isActive)) {
    throw new PricingError('Offer is not active in this office');
  }
  const now = new Date();
  if (offer.startDate && now < offer.startDate) throw new PricingError('Offer has not started yet');
  if (offer.endDate && now > offer.endDate) throw new PricingError('Offer has ended');

  const decimals = office.currencyDecimalPlaces;
  const basePrice = Number(offerOffice?.price ?? productOffice.price);
  const baseCompareAt = Number(offerOffice?.compareAtPrice ?? productOffice.compareAtPrice ?? 0);

  let quantityPaid = offer.payQty;
  let quantityFree = offer.freeQty;
  let subtotal = basePrice; // offer price is treated as the total price for the payQty bundle
  let compareAtSubtotal = baseCompareAt || basePrice * (quantityPaid + quantityFree);
  let discount = 0;

  switch (offer.type) {
    case 'FIXED_QTY':
    case 'BUY_X_GET_Y': {
      // offer.price (from ProductOffice/OfferOffice) is already the bundle total.
      subtotal = basePrice;
      compareAtSubtotal = baseCompareAt || Number(productOffice.price) * (quantityPaid + quantityFree);
      discount = Math.max(0, compareAtSubtotal - subtotal);
      break;
    }
    case 'PERCENT_DISCOUNT': {
      const unitPrice = Number(productOffice.price);
      const gross = unitPrice * quantityPaid;
      const pct = Number(offer.discountPercent ?? 0);
      discount = roundMoney(gross * (pct / 100), decimals);
      subtotal = roundMoney(gross - discount, decimals);
      compareAtSubtotal = gross;
      break;
    }
    case 'FIXED_DISCOUNT': {
      const unitPrice = Number(productOffice.price);
      const gross = unitPrice * quantityPaid;
      discount = Math.min(gross, Number(offer.discountAmount ?? 0));
      subtotal = roundMoney(gross - discount, decimals);
      compareAtSubtotal = gross;
      break;
    }
  }

  const totalQuantity = quantityPaid + quantityFree;
  const unitPrice = totalQuantity > 0 ? roundMoney(subtotal / totalQuantity, decimals) : subtotal;

  let shipping = Number(office.defaultDeliveryFee);
  if (deliveryArea?.fee != null) shipping = Number(deliveryArea.fee);
  if (office.freeDeliveryThreshold != null && subtotal >= Number(office.freeDeliveryThreshold)) {
    shipping = 0;
  }

  const taxRate = Number(office.taxRate ?? 0);
  const tax = roundMoney(subtotal * (taxRate / 100), decimals);

  const total = roundMoney(subtotal + shipping + tax, decimals);
  const savingsPercent = compareAtSubtotal > 0 ? Math.round(((compareAtSubtotal - subtotal) / compareAtSubtotal) * 100) : 0;

  return {
    unitPrice,
    quantityPaid,
    quantityFree,
    totalQuantity,
    subtotal: roundMoney(subtotal, decimals),
    discount: roundMoney(discount, decimals),
    compareAtSubtotal: roundMoney(compareAtSubtotal, decimals),
    shipping: roundMoney(shipping, decimals),
    tax,
    total,
    currencyCode: office.currencyCode,
    savingsPercent,
  };
}
