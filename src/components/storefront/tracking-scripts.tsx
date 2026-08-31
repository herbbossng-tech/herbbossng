'use client';

import { useEffect } from 'react';
import { trackPixel, trackGa4 } from '@/lib/tracking/client';

/**
 * Loads Meta Pixel / GA4 base scripts for the current office (public IDs only —
 * never the CAPI access token) and fires PageView/page_view + ViewContent on mount.
 */
export function TrackingScripts({
  metaPixelId,
  ga4MeasurementId,
  contentName,
  value,
  currency,
}: {
  metaPixelId?: string | null;
  ga4MeasurementId?: string | null;
  contentName: string;
  value?: number;
  currency?: string;
}) {
  useEffect(() => {
    if (metaPixelId && typeof window !== 'undefined' && !window.fbq) {
      /* eslint-disable */
      (function (f: any, b: any, e: any, v: any) {
        if (f.fbq) return;
        const n: any = (f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        });
        if (!f._fbq) f._fbq = n;
        n.push = n;
        n.loaded = true;
        n.version = '2.0';
        n.queue = [];
        const t = b.createElement(e);
        t.async = true;
        t.src = v;
        const s = b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t, s);
      })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
      (window as unknown as { fbq: (...args: unknown[]) => void }).fbq('init', metaPixelId);
      (window as unknown as { fbq: (...args: unknown[]) => void }).fbq('track', 'PageView');
    }
    trackPixel('ViewContent', { content_name: contentName, value, currency });

    if (ga4MeasurementId && typeof window !== 'undefined' && !window.gtag) {
      const script = document.createElement('script');
      script.src = `https://www.googletagmanager.com/gtag/js?id=${ga4MeasurementId}`;
      script.async = true;
      document.head.appendChild(script);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        window.dataLayer.push(arguments);
      };
      window.gtag('js', new Date());
      window.gtag('config', ga4MeasurementId);
    }
    trackGa4('view_item', { items: [{ item_name: contentName }], value, currency });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

declare global {
  interface Window {
    dataLayer: unknown[];
  }
}
