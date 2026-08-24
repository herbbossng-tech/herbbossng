import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrderPricing, PricingError } from "@/lib/pricing";
import { nextOrderNumber } from "@/lib/order-number";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendNewOrderAdminEmail, sendOrderConfirmationEmail } from "@/lib/email";
import { sendMetaCapiPurchaseEvent } from "@/lib/tracking";

const schema = z.object({
  productId: z.string().min(1),
  officeId: z.string().min(1),
  offerId: z.string().min(1),
  idempotencyKey: z.string().min(8).max(100),
  customerName: z.string().min(2).max(120),
  customerPhone: z.string().min(5).max(30),
  customerEmail: z.string().email().optional().or(z.literal("")),
  deliveryAddress: z.string().min(5).max(500),
  divisionId: z.string().min(1),
  cityId: z.string().min(1),
  landingPageSlug: z.string().optional(),
  utmSource: z.string().max(200).optional(),
  utmMedium: z.string().max(200).optional(),
  utmCampaign: z.string().max(200).optional(),
  utmContent: z.string().max(200).optional(),
  utmTerm: z.string().max(200).optional(),
  fbclid: z.string().max(500).optional(),
  gclid: z.string().max(500).optional(),
  fbp: z.string().max(500).optional(),
  fbc: z.string().max(500).optional(),
  referrer: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rate = checkRateLimit(`order:${ip}`, 8, 5 * 60_000);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many order attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the form and try again." }, { status: 400 });
  }
  const input = parsed.data;

  // Idempotent replay: a resubmission with the same client-generated key
  // returns the original order instead of creating a duplicate.
  const existingByKey = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existingByKey) {
    return NextResponse.json({ orderNumber: existingByKey.orderNumber });
  }

  // Duplicate-order guard: same office+phone+offer within the last 2 minutes
  // is almost certainly a double-submit (double tap, back button, two tabs).
  const recentDuplicate = await prisma.order.findFirst({
    where: {
      officeId: input.officeId,
      customerPhone: input.customerPhone,
      items: { some: { offerId: input.offerId } },
      createdAt: { gte: new Date(Date.now() - 2 * 60_000) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recentDuplicate) {
    return NextResponse.json({ orderNumber: recentDuplicate.orderNumber });
  }

  const [division, city] = await Promise.all([
    prisma.locationDivision.findUnique({ where: { id: input.divisionId } }),
    prisma.city.findUnique({ where: { id: input.cityId } }),
  ]);
  if (!division || division.officeId !== input.officeId) {
    return NextResponse.json({ error: "Invalid location selected" }, { status: 400 });
  }
  if (!city || city.divisionId !== division.id) {
    return NextResponse.json({ error: "Invalid location selected" }, { status: 400 });
  }

  const office = await prisma.office.findUnique({ where: { id: input.officeId } });
  if (!office || !office.isActive) {
    return NextResponse.json({ error: "This store is not currently available" }, { status: 400 });
  }

  let pricing;
  try {
    pricing = await getOrderPricing({
      productId: input.productId,
      officeId: input.officeId,
      offerId: input.offerId,
      cityId: input.cityId,
      divisionId: input.divisionId,
    });
  } catch (error) {
    if (error instanceof PricingError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const product = await prisma.product.findUniqueOrThrow({ where: { id: input.productId } });
  const userAgent = request.headers.get("user-agent") ?? undefined;

  const result = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { officeId_phone: { officeId: input.officeId, phone: input.customerPhone } },
      update: {
        name: input.customerName,
        email: input.customerEmail || undefined,
        address: input.deliveryAddress,
        city: city.name,
        division: division.name,
      },
      create: {
        officeId: input.officeId,
        name: input.customerName,
        phone: input.customerPhone,
        email: input.customerEmail || undefined,
        address: input.deliveryAddress,
        city: city.name,
        division: division.name,
      },
    });

    const orderNumber = await nextOrderNumber(tx, input.officeId);

    const order = await tx.order.create({
      data: {
        orderNumber,
        officeId: input.officeId,
        customerId: customer.id,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail || null,
        deliveryAddress: input.deliveryAddress,
        city: city.name,
        division: division.name,
        currencyCode: office.currencyCode,
        currencySymbol: office.currencySymbol,
        subtotal: pricing.subtotal,
        shipping: pricing.shipping,
        discount: pricing.discount,
        tax: pricing.tax,
        total: pricing.total,
        idempotencyKey: input.idempotencyKey,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        utmContent: input.utmContent,
        utmTerm: input.utmTerm,
        fbclid: input.fbclid,
        gclid: input.gclid,
        fbp: input.fbp,
        fbc: input.fbc,
        landingPageSlug: input.landingPageSlug,
        referrer: input.referrer,
        userAgent,
        ipAddress: ip,
        items: {
          create: {
            productId: input.productId,
            offerId: input.offerId,
            productName: product.name,
            offerTitle: pricing.offerTitle,
            paidQuantity: pricing.paidQuantity,
            freeQuantity: pricing.freeQuantity,
            unitPrice: pricing.unitPrice,
            lineTotal: pricing.subtotal,
          },
        },
        statusHistory: { create: { status: "NEW", note: "Order placed by customer" } },
      },
    });

    if (office.inventoryStrategy === "RESERVATION") {
      const inventory = await tx.inventory.findUnique({ where: { productOfficeId: pricing.productOfficeId } });
      if (inventory) {
        await tx.inventory.update({
          where: { id: inventory.id },
          data: {
            quantityReserved: { increment: pricing.totalQuantity },
            movements: {
              create: {
                type: "ORDER_RESERVATION",
                quantity: -pricing.totalQuantity,
                orderId: order.id,
                reason: `Reserved for order ${orderNumber}`,
              },
            },
          },
        });
      }
    }

    return order;
  });

  // Marketing + operational side effects — never let these fail the order response.
  void sendNewOrderAdminEmail(result, office).catch((e) => console.error("new-order admin email failed:", e));
  void sendOrderConfirmationEmail(result, office).catch((e) => console.error("order confirmation email failed:", e));
  void sendMetaCapiPurchaseEvent(result).catch((e) => console.error("Meta CAPI send failed:", e));
  void prisma.analyticsEvent
    .create({
      data: {
        eventName: "purchase",
        officeId: input.officeId,
        productId: input.productId,
        landingPageSlug: input.landingPageSlug,
        orderId: result.id,
        eventId: result.id,
        value: pricing.total,
        currencyCode: office.currencyCode,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
      },
    })
    .catch((e) => console.error("analytics event failed:", e));

  return NextResponse.json({ orderNumber: result.orderNumber });
}
