'use client';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackPixel(event: string, params?: Record<string, unknown>, eventId?: string) {
  if (typeof window === 'undefined' || !window.fbq) return;
  window.fbq('track', event, params ?? {}, eventId ? { eventID: eventId } : undefined);
}

export function trackGa4(event: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', event, params ?? {});
}

export function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function getSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    let id = sessionStorage.getItem('cod_session_id');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('cod_session_id', id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

export function trackServerEvent(params: {
  officeId: string;
  eventType: 'select_item' | 'begin_checkout';
  landingPageId?: string;
  productId?: string;
}) {
  if (typeof window === 'undefined') return;
  const search = new URLSearchParams(window.location.search);
  void fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      sessionId: getSessionId(),
      utmSource: search.get('utm_source') ?? undefined,
      utmMedium: search.get('utm_medium') ?? undefined,
      utmCampaign: search.get('utm_campaign') ?? undefined,
    }),
    keepalive: true,
  }).catch(() => {});
}

export function captureAttribution() {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get('utm_source') ?? undefined,
    utmMedium: params.get('utm_medium') ?? undefined,
    utmCampaign: params.get('utm_campaign') ?? undefined,
    utmContent: params.get('utm_content') ?? undefined,
    utmTerm: params.get('utm_term') ?? undefined,
    fbclid: params.get('fbclid') ?? undefined,
    gclid: params.get('gclid') ?? undefined,
    fbp: getCookie('_fbp'),
    fbc: getCookie('_fbc') ?? (params.get('fbclid') ? `fb.1.${Date.now()}.${params.get('fbclid')}` : undefined),
    landingPageUrl: window.location.href,
    referrer: document.referrer || undefined,
  };
}
