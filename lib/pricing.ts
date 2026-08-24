import { Decimal } from "@/app/generated/prisma/internal/prismaNamespace";
import { prisma } from "@/lib/prisma";

// The single source of truth for order totals. Both the live package-selector
// preview API and the real order-creation API call this — the client-supplied
// total is NEVER trusted (brief §62).

export type PricingInput = {
  offerPrice: number; // resolved offer price for this office (already resolved from OfferOffice override or the offer's own numbers)
  compareAtPrice: number | null;
  paidQuantity: number;
  freeQuantity: number;
  bundleMultiplier: number; // how many times the package is ordered, default 1
  deliveryFee: number;
  freeDeliveryThreshold: number | null;
  currencyCode: string;
  currencySymbol: string;
};

export type PricingResult = {
  paidQuantity: number;
  freeQuantity: number;
  totalQuantity: number;
  unitPrice: number;
  subtotal: number;
  compareAtSubtotal: number | null;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  savingsAmount: number;
  savingsPercent: number;
  currencyCode: string;
  currencySymbol: string;
};

export function calculatePricing(input: PricingInput): PricingResult {
  const paidQuantity = input.paidQuantity * input.bundleMultiplier;
  const freeQuantity = input.freeQuantity * input.bundleMultiplier;
  const subtotal = round2(input.offerPrice * input.bundleMultiplier);
  const compareAtSubtotal =
    input.compareAtPrice !== null ? round2(input.compareAtPrice * input.bundleMultiplier) : null;

  const qualifiesForFreeDelivery =
    input.freeDeliveryThreshold !== null && subtotal >= input.freeDeliveryThreshold;
  const shipping = qualifiesForFreeDelivery ? 0 : input.deliveryFee;

  const tax = 0; // tax engine hook — no office currently configures VAT/tax
  const discount = 0; // discount is already baked into offerPrice vs compareAtPrice
  const total = round2(subtotal + shipping + tax - discount);

  const savingsAmount = compareAtSubtotal !== null ? round2(compareAtSubtotal - subtotal) : 0;
  const savingsPercent =
    compareAtSubtotal && compareAtSubtotal > 0 ? Math.round((savingsAmount / compareAtSubtotal) * 100) : 0;

  return {
    paidQuantity,
    freeQuantity,
    totalQuantity: paidQuantity + freeQuantity,
    unitPrice: round2(input.offerPrice / Math.max(input.paidQuantity, 1)),
    subtotal,
    compareAtSubtotal,
    discount,
    shipping,
    tax,
    total,
    savingsAmount,
    savingsPercent,
    currencyCode: input.currencyCode,
    currencySymbol: input.currencySymbol,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export class PricingError extends Error {}

/**
 * Loads product/office/offer from the database and resolves the price the
 * server trusts, regardless of what the client sent. Throws PricingError for
 * any invalid/inactive/mismatched combination.
 */
export async function getOrderPricing(params: {
  productId: string;
  officeId: string;
  offerId: string;
  bundleMultiplier?: number;
  cityId?: string;
  divisionId?: string;
}): Promise<PricingResult & { productOfficeId: string; offerTitle: string }> {
  const bundleMultiplier = params.bundleMultiplier ?? 1;
  if (!Number.isInteger(bundleMultiplier) || bundleMultiplier < 1 || bundleMultiplier > 20) {
    throw new PricingError("Invalid quantity");
  }

  const [office, productOffice, offer] = await Promise.all([
    prisma.office.findUnique({ where: { id: params.officeId } }),
    prisma.productOffice.findUnique({
      where: { productId_officeId: { productId: params.productId, officeId: params.officeId } },
      include: { inventory: true },
    }),
    prisma.offer.findUnique({
      where: { id: params.offerId },
      include: { officePricing: { where: { officeId: params.officeId } } },
    }),
  ]);

  if (!office || !office.isActive) throw new PricingError("Office is not available");
  if (!productOffice || !productOffice.isActive) throw new PricingError("Product is not available in this office");
  if (!offer || !offer.isActive || offer.productId !== params.productId) {
    throw new PricingError("Offer is not available for this product");
  }
  const now = new Date();
  if (offer.startsAt && offer.startsAt > now) throw new PricingError("Offer is not yet active");
  if (offer.endsAt && offer.endsAt < now) throw new PricingError("Offer has expired");

  let deliveryFee = decToNumber(office.defaultDeliveryFee);
  let isFreeZone = false;
  if (params.cityId || params.divisionId) {
    const zone = await prisma.deliveryZone.findFirst({
      where: {
        officeId: params.officeId,
        OR: [
          params.cityId ? { cityId: params.cityId } : undefined,
          params.divisionId ? { divisionId: params.divisionId, cityId: null } : undefined,
        ].filter(Boolean) as object[],
      },
      orderBy: { cityId: "desc" }, // a city-specific zone outranks a division-wide one
    });
    if (zone) {
      deliveryFee = decToNumber(zone.fee);
      isFreeZone = zone.isFree;
    }
  }

  const officeOverride = offer.officePricing[0];
  if (officeOverride && !officeOverride.isActive) {
    throw new PricingError("Offer is not available for this office");
  }

  let offerPrice: number;
  let compareAtPrice: number | null;

  if (officeOverride) {
    offerPrice = decToNumber(officeOverride.price);
    compareAtPrice = officeOverride.compareAtPrice ? decToNumber(officeOverride.compareAtPrice) : null;
  } else {
    // Fall back to computing from the product's office price using the offer's type.
    const unitSell = decToNumber(productOffice.sellingPrice);
    switch (offer.type) {
      case "FIXED_QUANTITY":
      case "BUY_X_GET_Y_FREE":
        offerPrice = round2(unitSell * offer.paidQuantity);
        compareAtPrice = round2(unitSell * (offer.paidQuantity + offer.freeQuantity));
        break;
      case "PERCENTAGE_DISCOUNT": {
        const percent = offer.discountPercent ? decToNumber(offer.discountPercent) : 0;
        const full = round2(unitSell * offer.paidQuantity);
        offerPrice = round2(full * (1 - percent / 100));
        compareAtPrice = full;
        break;
      }
      case "FIXED_DISCOUNT": {
        const amount = offer.discountAmount ? decToNumber(offer.discountAmount) : 0;
        const full = round2(unitSell * offer.paidQuantity);
        offerPrice = round2(Math.max(full - amount, 0));
        compareAtPrice = full;
        break;
      }
      default:
        throw new PricingError("Unknown offer type");
    }
  }

  const pricing = calculatePricing({
    offerPrice,
    compareAtPrice,
    paidQuantity: offer.paidQuantity,
    freeQuantity: offer.freeQuantity,
    bundleMultiplier,
    deliveryFee: isFreeZone ? 0 : deliveryFee,
    freeDeliveryThreshold: office.freeDeliveryThreshold ? decToNumber(office.freeDeliveryThreshold) : null,
    currencyCode: office.currencyCode,
    currencySymbol: office.currencySymbol,
  });

  const availableStock = productOffice.inventory
    ? productOffice.inventory.quantityOnHand - productOffice.inventory.quantityReserved
    : 0;
  if (office.inventoryStrategy === "RESERVATION" && availableStock < pricing.totalQuantity) {
    throw new PricingError("This item is currently out of stock");
  }

  return { ...pricing, productOfficeId: productOffice.id, offerTitle: offer.title };
}

function decToNumber(value: unknown): number {
  if (value instanceof Decimal) return value.toNumber();
  return Number(value);
}
