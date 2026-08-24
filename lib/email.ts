import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { renderEmailTemplate, renderInfoRows, type TemplateVariables } from "@/lib/email-template";
import type { EmailTemplateKey } from "@/app/generated/prisma/enums";
import type { Order, Office } from "@/app/generated/prisma/client";

export async function getTransportForOffice(officeId: string) {
  const setting = await prisma.smtpSetting.findFirst({
    where: { OR: [{ officeId }, { officeId: null }], isActive: true },
    orderBy: { officeId: "desc" }, // office-specific setting wins over the global fallback
  });
  if (!setting) return null;

  const transport = nodemailer.createTransport({
    host: setting.host,
    port: setting.port,
    secure: setting.encryption === "SSL",
    requireTLS: setting.encryption === "TLS",
    auth: { user: setting.username, pass: decryptSecret(setting.passwordEncrypted) },
  });

  return { transport, setting };
}

export async function sendTestEmail(officeId: string | null, recipient: string) {
  const setting = await prisma.smtpSetting.findFirst({ where: { officeId } });
  if (!setting) throw new Error("No SMTP settings configured");

  const transport = nodemailer.createTransport({
    host: setting.host,
    port: setting.port,
    secure: setting.encryption === "SSL",
    requireTLS: setting.encryption === "TLS",
    auth: { user: setting.username, pass: decryptSecret(setting.passwordEncrypted) },
  });

  await transport.sendMail({
    from: `"${setting.fromName}" <${setting.fromEmail}>`,
    to: recipient,
    replyTo: setting.replyTo ?? undefined,
    subject: "COD Commerce — SMTP test email",
    html: "<p>This is a test email from your COD Commerce SMTP configuration. If you received this, sending works.</p>",
  });
}

async function sendTemplate(key: EmailTemplateKey, officeId: string, to: string, variables: TemplateVariables) {
  const template = await prisma.emailTemplate.findUnique({ where: { key } });
  if (!template || !template.isActive) return { skipped: true, reason: "template inactive or missing" };

  const transportInfo = await getTransportForOffice(officeId);
  if (!transportInfo) return { skipped: true, reason: "no SMTP configured" };

  const { subject, html } = renderEmailTemplate(template, variables);

  await transportInfo.transport.sendMail({
    from: `"${transportInfo.setting.fromName}" <${transportInfo.setting.fromEmail}>`,
    to,
    replyTo: transportInfo.setting.replyTo ?? undefined,
    subject,
    html,
  });
  return { skipped: false };
}

function orderVariables(order: Order, office: Office): TemplateVariables {
  return {
    order_number: order.orderNumber,
    customer_name: order.customerName,
    customer_phone: order.customerPhone,
    customer_email: order.customerEmail ?? "",
    delivery_address: order.deliveryAddress,
    city: order.city,
    state: order.division,
    office_name: office.name,
    office_phone: office.officePhone ?? "",
    order_date: order.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    order_status: order.status.replace(/_/g, " "),
    currency: order.currencyCode,
    subtotal: `${order.currencySymbol}${Number(order.subtotal).toLocaleString()}`,
    shipping: Number(order.shipping) === 0 ? "Free" : `${order.currencySymbol}${Number(order.shipping).toLocaleString()}`,
    total: `${order.currencySymbol}${Number(order.total).toLocaleString()}`,
    order_info_rows: renderInfoRows([
      { label: "Order Number", value: order.orderNumber },
      { label: "Customer", value: order.customerName },
      { label: "Phone", value: order.customerPhone },
      { label: "Email", value: order.customerEmail ?? "—" },
      { label: "Address", value: order.deliveryAddress },
      { label: "City / State", value: `${order.city}, ${order.division}` },
    ]),
    order_summary_rows: renderInfoRows([
      { label: "Subtotal", value: `${order.currencySymbol}${Number(order.subtotal).toLocaleString()}` },
      { label: "Shipping", value: Number(order.shipping) === 0 ? "Free" : `${order.currencySymbol}${Number(order.shipping).toLocaleString()}` },
      { label: "Total", value: `${order.currencySymbol}${Number(order.total).toLocaleString()}` },
      { label: "Date", value: order.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) },
      { label: "Status", value: order.status.replace(/_/g, " ") },
    ]),
  };
}

export async function sendNewOrderAdminEmail(order: Order, office: Office) {
  if (!office.officeEmail) return;
  return sendTemplate("NEW_ORDER_ADMIN", office.id, office.officeEmail, orderVariables(order, office));
}

export async function sendOrderConfirmationEmail(order: Order, office: Office) {
  if (!order.customerEmail) return;
  return sendTemplate("ORDER_CONFIRMATION_CUSTOMER", office.id, order.customerEmail, orderVariables(order, office));
}

const STATUS_TEMPLATE_KEY: Partial<Record<string, EmailTemplateKey>> = {
  CONFIRMED: "ORDER_CONFIRMED",
  DISPATCHED: "ORDER_DISPATCHED",
  OUT_FOR_DELIVERY: "ORDER_OUT_FOR_DELIVERY",
  DELIVERED: "ORDER_DELIVERED",
  CANCELLED: "ORDER_CANCELLED",
  FAILED_DELIVERY: "ORDER_FAILED_DELIVERY",
};

export async function sendOrderStatusEmail(order: Order, office: Office) {
  const key = STATUS_TEMPLATE_KEY[order.status];
  if (!key || !order.customerEmail) return;
  return sendTemplate(key, office.id, order.customerEmail, orderVariables(order, office));
}
