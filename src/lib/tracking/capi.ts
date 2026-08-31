import crypto from 'crypto';
import { db } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto';

function sha256(value: string) {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/**
 * Sends a server-side Purchase event to the Meta Conversions API. Fires only
 * when the office has a Pixel ID + access token configured and CAPI enabled.
 * Uses the same `eventId` as the client-side Pixel Purchase event so Meta can
 * deduplicate. The access token is decrypted here only — it never reaches
 * the browser.
 */
export async function sendPurchaseCapiEvent(params: {
  officeId: string;
  eventId: string;
  value: number;
  currency: string;
  email?: string;
  phone?: string;
  fbp?: string;
  fbc?: string;
  ipAddress?: string;
  userAgent?: string;
  eventSourceUrl?: string;
}) {
  const tracking = await db.trackingSetting.findUnique({ where: { officeId: params.officeId } });
  if (!tracking?.isActive || !tracking.metaCapiEnabled || !tracking.metaPixelId || !tracking.metaEncryptedAccessToken) {
    return { sent: false, reason: 'CAPI not configured/enabled for this office' };
  }

  const accessToken = decryptSecret(tracking.metaEncryptedAccessToken);
  const userData: Record<string, unknown> = {};
  if (params.email) userData.em = [sha256(params.email)];
  if (params.phone) userData.ph = [sha256(params.phone.replace(/[^0-9]/g, ''))];
  if (params.fbp) userData.fbp = params.fbp;
  if (params.fbc) userData.fbc = params.fbc;
  if (params.ipAddress) userData.client_ip_address = params.ipAddress;
  if (params.userAgent) userData.client_user_agent = params.userAgent;

  const body = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: params.eventId,
        event_source_url: params.eventSourceUrl,
        action_source: 'website',
        user_data: userData,
        custom_data: { currency: params.currency, value: params.value },
      },
    ],
  };

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${tracking.metaPixelId}/events?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('[capi] Meta CAPI request failed', res.status, text);
      return { sent: false, reason: `Meta API error ${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error('[capi] Meta CAPI request threw', e);
    return { sent: false, reason: e instanceof Error ? e.message : 'Unknown error' };
  }
}
