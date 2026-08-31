import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createOrderSchema } from '@/lib/validation/order';
import { quotePrice, PricingError } from '@/lib/pricing';
import { nextOrderNumber } from '@/lib/order-number';
import { recordInventoryMovement } from '@/lib/inventory';
import { rateLimit } from '@/lib/rate-limit';
import { sendNewOrderEmails } from '@/lib/email/send-order-emails';
import { sendPurchaseCapiEvent } from '@/lib/tracking/capi';

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(req: Request) {
  const ip = clientIp(req);

  // Basic abuse protection: 8 order attempts / 5 minutes per IP.
  const rl = rateLimit(`order:${ip}`, 8, 5 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many order attempts. Please try again shortly.' }, { status: 429 });
  }

  let payload;
  try {
    payload = createOrderSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'Invalid order data', details: e instanceof Error ? e.message : e }, { status: 400 });
  }

  // Idempotency: a resubmitted request with the same key returns the original order.
  const existing = await db.order.findUnique({ where: { idempotencyKey: payload.idempotencyKey } });
  if (existing) {
    return NextResponse.json({ orderNumber: existing.orderNumber, orderId: existing.id, total: Number(existing.total), currencyCode: existing.currencyCode });
  }

  const office = await db.office.findUnique({ where: { id: payload.officeId } });
  if (!office || !office.isActive) {
    return NextResponse.json({ error: 'This office is not available' }, { status: 400 });
  }

  const phoneOk = new RegExp(office.phoneRegex).test(payload.phone);
  if (!phoneOk) {
    return NextResponse.json({ error: `Please enter a valid ${office.name} phone number` }, { status: 400 });
  }

  const [division, city, deliveryArea] = await Promise.all([
    db.division.findUnique({ where: { id: payload.divisionId } }),
    db.city.findUnique({ where: { id: payload.cityId } }),
    payload.deliveryAreaId ? db.deliveryArea.findUnique({ where: { id: payload.deliveryAreaId } }) : Promise.resolve(null),
  ]);
  if (!division || division.officeId !== office.id) {
    return NextResponse.json({ error: 'Invalid location selected' }, { status: 400 });
  }
  if (!city || city.divisionId !== division.id) {
    return NextResponse.json({ error: 'Invalid city selected' }, { status: 400 });
  }

  let quote;
  try {
    quote = await quotePrice({
      productId: payload.productId,
      officeId: office.id,
      offerId: payload.offerId,
      deliveryAreaId: deliveryArea?.id,
    });
  } catch (e) {
    if (e instanceof PricingError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  // Overselling guard for tracked inventory before we commit to a transaction.
  const productOffice = await db.productOffice.findUnique({
    where: { productId_officeId: { productId: payload.productId, officeId: office.id } },
  });
  if (productOffice?.trackInventory && productOffice.stockQuantity < quote.totalQuantity) {
    return NextResponse.json({ error: 'This package is currently out of stock' }, { status: 409 });
  }

  const userAgent = req.headers.get('user-agent') ?? undefined;

  try {
    const order = await db.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { officeId_phone: { officeId: office.id, phone: payload.phone } },
        update: { name: payload.customerName, email: payload.email || undefined, address: payload.deliveryAddress, cityId: city.id },
        create: {
          officeId: office.id,
          name: payload.customerName,
          phone: payload.phone,
          email: payload.email || undefined,
          address: payload.deliveryAddress,
          cityId: city.id,
        },
      });

      const orderNumber = await nextOrderNumber(tx, office.id);

      const created = await tx.order.create({
        data: {
          orderNumber,
          officeId: office.id,
          customerId: customer.id,
          productId: payload.productId,
          offerId: payload.offerId,
          landingPageId: payload.landingPageId || null,
          customerName: payload.customerName,
          phone: payload.phone,
          email: payload.email || null,
          deliveryAddress: payload.deliveryAddress,
          divisionName: division.name,
          cityId: city.id,
          cityName: city.name,
          deliveryAreaId: deliveryArea?.id,
          quantityPaid: quote.quantityPaid,
          quantityFree: quote.quantityFree,
          unitPrice: quote.unitPrice,
          subtotal: quote.subtotal,
          discount: quote.discount,
          shipping: quote.shipping,
          tax: quote.tax,
          total: quote.total,
          currencyCode: quote.currencyCode,
          customerNotes: payload.customerNotes || null,
          source: payload.source || null,
          utmSource: payload.utmSource || null,
          utmMedium: payload.utmMedium || null,
          utmCampaign: payload.utmCampaign || null,
          utmContent: payload.utmContent || null,
          utmTerm: payload.utmTerm || null,
          fbclid: payload.fbclid || null,
          gclid: payload.gclid || null,
          fbp: payload.fbp || null,
          fbc: payload.fbc || null,
          eventId: payload.eventId || null,
          landingPageUrl: payload.landingPageUrl || null,
          referrer: payload.referrer || null,
          ipAddress: ip,
          userAgent,
          idempotencyKey: payload.idempotencyKey,
        },
      });

      await tx.orderStatusHistory.create({ data: { orderId: created.id, status: 'NEW', note: 'Order submitted by customer' } });

      if (office.inventoryStrategy === 'RESERVE_ON_ORDER') {
        await recordInventoryMovement(tx, {
          productId: payload.productId,
          officeId: office.id,
          type: 'ORDER_RESERVATION',
          quantity: -quote.totalQuantity,
          reason: `Reserved for order ${orderNumber}`,
          orderId: created.id,
        });
      }

      return created;
    });

    // Notifications/attribution — best-effort, never block the customer's confirmation on these.
    void sendNewOrderEmails(order.id).catch((e) => console.error('[orders] email send failed', e));
    if (payload.eventId) {
      void sendPurchaseCapiEvent({
        officeId: office.id,
        eventId: payload.eventId,
        value: quote.total,
        currency: quote.currencyCode,
        email: payload.email || undefined,
        phone: payload.phone,
        fbp: payload.fbp,
        fbc: payload.fbc,
        ipAddress: ip,
        userAgent,
        eventSourceUrl: payload.landingPageUrl,
      }).catch((e) => console.error('[orders] CAPI send failed', e));
    }

    return NextResponse.json({ orderNumber: order.orderNumber, orderId: order.id, total: quote.total, currencyCode: quote.currencyCode });
  } catch (e) {
    console.error('[orders] failed to create order', e);
    return NextResponse.json({ error: 'Could not place your order. Please try again.' }, { status: 500 });
  }
}
