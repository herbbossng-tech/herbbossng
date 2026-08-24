"use client";

type EventName = "page_view" | "view_content" | "select_item" | "begin_checkout";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

const FBQ_EVENT: Partial<Record<EventName, string>> = {
  view_content: "ViewContent",
  select_item: "AddToCart",
  begin_checkout: "InitiateCheckout",
};

export function trackEvent(
  eventName: EventName,
  params: { officeId: string; productId?: string; landingPageSlug?: string; value?: number; currency?: string },
) {
  if (typeof window === "undefined") return;

  const search = new URLSearchParams(window.location.search);
  fetch("/api/storefront/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName,
      officeId: params.officeId,
      productId: params.productId,
      landingPageSlug: params.landingPageSlug,
      utmSource: search.get("utm_source") ?? undefined,
      utmMedium: search.get("utm_medium") ?? undefined,
      utmCampaign: search.get("utm_campaign") ?? undefined,
    }),
    keepalive: true,
  }).catch(() => {});

  const fbEvent = FBQ_EVENT[eventName];
  if (fbEvent && window.fbq) {
    window.fbq("track", fbEvent, params.value ? { value: params.value, currency: params.currency } : {});
  }
  if (window.gtag) {
    window.gtag("event", eventName, { value: params.value, currency: params.currency });
  }
}
