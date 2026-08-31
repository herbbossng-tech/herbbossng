import type { FooterData } from '@/types/landing-sections';

export function Footer({ data, whatsappNumber, whatsappCtaText }: { data: FooterData; whatsappNumber?: string | null; whatsappCtaText?: string | null }) {
  return (
    <footer className="bg-brand-dark px-4 py-10 text-center text-white">
      <p className="text-lg font-semibold">{data.brandName}</p>
      {data.tagline && <p className="mt-1 text-sm text-white/60">{data.tagline}</p>}
      {whatsappNumber && (
        <a
          href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20"
        >
          💬 {whatsappCtaText ?? 'Chat with us on WhatsApp'}
        </a>
      )}
      {data.links && data.links.length > 0 && (
        <div className="mt-4 flex justify-center gap-4 text-xs text-white/50">
          {data.links.map((l) => (
            <a key={l.label} href={l.url} className="hover:text-white">{l.label}</a>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-white/30">© {new Date().getFullYear()} {data.brandName}. All rights reserved.</p>
    </footer>
  );
}
