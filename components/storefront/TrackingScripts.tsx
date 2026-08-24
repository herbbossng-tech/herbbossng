import Script from "next/script";
import { prisma } from "@/lib/prisma";

export async function TrackingScripts({ officeId, eventId }: { officeId: string; eventId?: string }) {
  const setting = await prisma.trackingSetting.findFirst({
    where: { OR: [{ officeId }, { officeId: null }] },
    orderBy: { officeId: "desc" },
  });
  if (!setting) return null;

  return (
    <>
      {setting.metaPixelId && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
            n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
            document,'script','https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${setting.metaPixelId}');
            fbq('track', 'PageView'${eventId ? `, {}, {eventID: '${eventId}'}` : ""});
          `}
        </Script>
      )}
      {setting.ga4MeasurementId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${setting.ga4MeasurementId}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${setting.ga4MeasurementId}');
            `}
          </Script>
        </>
      )}
    </>
  );
}
