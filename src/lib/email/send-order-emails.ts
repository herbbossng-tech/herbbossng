import type { EmailTemplateKey } from '@prisma/client';
import { db } from '@/lib/db';
import { sendMail } from '@/lib/email/mailer';
import { renderEmailShell, orderSummaryRows, substituteVariables } from '@/lib/email/render';
import { buildOrderEmailVariables } from '@/lib/email/order-variables';

const DEFAULT_BRAND = 'COD Commerce';

function defaultBodyFor(key: EmailTemplateKey, vars: Record<string, string>): { subject: string; header: string; body: string } {
  const summary = orderSummaryRows([
    { label: 'Order Number', value: vars.order_number },
    { label: 'Customer', value: vars.customer_name },
    { label: 'Phone', value: vars.phone },
    ...(vars.email ? [{ label: 'Email', value: vars.email }] : []),
    { label: 'Address', value: vars.delivery_address },
    { label: 'City / State', value: `${vars.city}, ${vars.state}` },
  ]);
  const orderLines = orderSummaryRows([
    { label: 'Package', value: vars.package_name },
    { label: 'Quantity', value: vars.quantity },
    { label: 'Subtotal', value: vars.subtotal },
    { label: 'Shipping', value: vars.shipping },
    { label: 'Total', value: `<strong>${vars.total}</strong>` },
  ]);
  const meta = orderSummaryRows([
    { label: 'Date', value: vars.order_date },
    { label: 'Status', value: vars.order_status },
  ]);

  switch (key) {
    case 'NEW_ORDER_ADMIN':
      return {
        subject: `New Order Received — ${vars.order_number}`,
        header: 'NEW ORDER RECEIVED',
        body: `${summary}<hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />${orderLines}<hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />${meta}`,
      };
    case 'ORDER_CONFIRMATION':
      return {
        subject: `We received your order — ${vars.order_number}`,
        header: 'ORDER RECEIVED',
        body: `<p>Hi ${vars.customer_name}, thank you for your order! We'll contact you shortly to confirm before dispatch.</p>${orderLines}<p style="margin-top:16px;">Payment method: <strong>Cash on Delivery</strong> — you pay when your order arrives.</p>`,
      };
    default:
      return {
        subject: `Order update — ${vars.order_number}`,
        header: vars.order_status,
        body: `<p>Hi ${vars.customer_name}, your order ${vars.order_number} status is now <strong>${vars.order_status}</strong>.</p>`,
      };
  }
}

export async function sendOrderStatusEmail(orderId: string, key: EmailTemplateKey) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { office: true, product: true, offer: true, customer: true },
  });
  if (!order) return { sent: false, reason: 'Order not found' };

  const vars = buildOrderEmailVariables(order);
  const template = await db.emailTemplate.findUnique({ where: { officeId_key: { officeId: order.officeId, key } } });
  const fallback = defaultBodyFor(key, vars);

  const brandName = template?.brandName || DEFAULT_BRAND;
  const primaryColor = template?.primaryColor || '#0f3d2e';
  const subject = substituteVariables(template?.subject || fallback.subject, vars);
  const bodyHtml = substituteVariables(template?.bodyHtml || fallback.body, vars);

  const html = renderEmailShell({
    brandName,
    logoUrl: template?.logoUrl,
    primaryColor,
    headerText: template?.headerText || fallback.header,
    bodyHtml,
    footerText: template?.footerText ? substituteVariables(template.footerText, vars) : brandName,
    buttonText: template?.buttonText ?? undefined,
    buttonUrl: template?.buttonUrl ?? undefined,
  });

  const to = key === 'NEW_ORDER_ADMIN' ? order.office.officeEmail : order.email;
  if (!to) return { sent: false, reason: key === 'NEW_ORDER_ADMIN' ? 'Office has no email configured' : 'Customer has no email' };

  return sendMail(order.officeId, { to, subject, html });
}

/** Fires on order creation: notifies the office and (if provided) the customer. */
export async function sendNewOrderEmails(orderId: string) {
  const results = await Promise.allSettled([
    sendOrderStatusEmail(orderId, 'NEW_ORDER_ADMIN'),
    sendOrderStatusEmail(orderId, 'ORDER_CONFIRMATION'),
  ]);
  return results;
}
