import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import type { Order } from "@/app/generated/prisma/client";

/**
 * Sends a server-side Purchase event to the Meta Conversions API, deduplicated
 * against the browser Pixel event via `event_id` (the order's own id/eventId).
 * Silently no-ops when CAPI isn't configured for the office — this must never
 * block order creation.
 */
export async function sendMetaCapiPurchaseEvent(order: Order) {
  try {
    const setting = await prisma.trackingSetting.findFirst({
      where: { OR: [{ officeId: order.officeId }, { officeId: null }], metaCapiEnabled: true },
      orderBy: { officeId: "desc" },
    });
    if (!setting?.metaPixelId || !setting.metaAccessTokenEncrypted) return;

    const accessToken = decryptSecret(setting.metaAccessTokenEncrypted);
    const eventId = order.eventId ?? order.id;

    const payload = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(order.createdAt.getTime() / 1000),
          event_id: eventId,
          event_source_url: order.landingPageSlug ? `${process.env.NEXT_PUBLIC_APP_URL}/${order.landingPageSlug}` : undefined,
          action_source: "website",
          user_data: {
            ph: order.customerPhone ? [await sha256(order.customerPhone.replace(/\D/g, ""))] : undefined,
            em: order.customerEmail ? [await sha256(order.customerEmail.toLowerCase().trim())] : undefined,
            fbp: order.fbp ?? undefined,
            fbc: order.fbc ?? undefined,
            client_ip_address: order.ipAddress ?? undefined,
            client_user_agent: order.userAgent ?? undefined,
          },
          custom_data: {
            currency: order.currencyCode,
            value: Number(order.total),
          },
        },
      ],
    };

    const url = `https://graph.facebook.com/v19.0/${setting.metaPixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("Meta CAPI send failed (non-fatal):", error);
  }
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
