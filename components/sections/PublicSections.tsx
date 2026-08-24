import Image from "next/image";

type AnyContent = Record<string, unknown>;

export function AnnouncementBar({ content }: { content: AnyContent }) {
  const text = content.text as string;
  if (!text) return null;
  return (
    <div className="bg-brand-green-900 px-4 py-2 text-center text-xs font-medium tracking-wide text-white sm:text-sm">
      {text}
    </div>
  );
}

export function Hero({ content }: { content: AnyContent }) {
  const badge = content.badge as string | undefined;
  const headline = content.headline as string;
  const subheadline = content.subheadline as string | undefined;
  const imageUrl = content.imageUrl as string | undefined;

  return (
    <section className="bg-brand-cream px-4 py-10 sm:py-14">
      <div className="mx-auto grid max-w-5xl items-center gap-8 sm:grid-cols-2">
        <div>
          {badge && (
            <span className="mb-3 inline-block rounded-full bg-brand-green-100 px-3 py-1 text-xs font-semibold text-brand-green-700">
              {badge}
            </span>
          )}
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-brand-green-900 sm:text-4xl">
            {headline}
          </h1>
          {subheadline && <p className="mt-4 text-base text-zinc-600 sm:text-lg">{subheadline}</p>}
        </div>
        {imageUrl && (
          <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-lg">
            <Image src={imageUrl} alt={headline} fill className="object-cover" priority />
          </div>
        )}
      </div>
    </section>
  );
}

export function TrustBadges({ content }: { content: AnyContent }) {
  const items = (content.items as { title: string; subtitle?: string }[]) ?? [];
  if (items.length === 0) return null;
  return (
    <section className="border-y border-zinc-100 bg-white px-4 py-6">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 sm:grid-cols-3">
        {items.map((item, i) => (
          <div key={i} className="text-center">
            <p className="text-sm font-semibold text-brand-green-800">{item.title}</p>
            {item.subtitle && <p className="text-xs text-zinc-500">{item.subtitle}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function Problem({ content }: { content: AnyContent }) {
  const title = content.title as string;
  const intro = content.intro as string | undefined;
  const points = (content.points as { title: string; description?: string }[]) ?? [];
  return (
    <section className="px-4 py-12">
      <div className="mx-auto max-w-3xl text-center">
        {title && <h2 className="text-2xl font-bold text-brand-green-900">{title}</h2>}
        {intro && <p className="mt-3 text-zinc-600">{intro}</p>}
      </div>
      <div className="mx-auto mt-8 grid max-w-4xl gap-4 sm:grid-cols-2">
        {points.map((point, i) => (
          <div key={i} className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
            <p className="font-semibold text-brand-green-800">{point.title}</p>
            {point.description && <p className="mt-1 text-sm text-zinc-600">{point.description}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function Formula({ content }: { content: AnyContent }) {
  const title = content.title as string;
  const intro = content.intro as string | undefined;
  const ingredients = (content.ingredients as { name: string; description: string }[]) ?? [];
  return (
    <section className="bg-brand-green-50 px-4 py-12">
      <div className="mx-auto max-w-3xl text-center">
        {title && <h2 className="text-2xl font-bold text-brand-green-900">{title}</h2>}
        {intro && <p className="mt-3 text-zinc-600">{intro}</p>}
      </div>
      <div className="mx-auto mt-8 grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ingredients.map((ing, i) => (
          <div key={i} className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="font-semibold text-brand-green-800">{ing.name}</p>
            <p className="mt-1 text-sm text-zinc-600">{ing.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HowItWorks({ content }: { content: AnyContent }) {
  const title = content.title as string;
  const steps = (content.steps as { title: string; description?: string }[]) ?? [];
  return (
    <section className="px-4 py-12">
      <div className="mx-auto max-w-3xl text-center">
        {title && <h2 className="text-2xl font-bold text-brand-green-900">{title}</h2>}
      </div>
      <ol className="mx-auto mt-8 max-w-2xl space-y-4">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-4 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gold-500 text-sm font-bold text-brand-green-900">
              {i + 1}
            </span>
            <div>
              <p className="font-semibold text-brand-green-800">{step.title}</p>
              {step.description && <p className="text-sm text-zinc-600">{step.description}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Benefits({ content }: { content: AnyContent }) {
  const title = content.title as string;
  const items = (content.items as string[]) ?? [];
  return (
    <section className="bg-brand-green-900 px-4 py-12 text-white">
      <div className="mx-auto max-w-3xl text-center">
        {title && <h2 className="text-2xl font-bold">{title}</h2>}
      </div>
      <ul className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 rounded-xl bg-white/5 p-3 text-sm">
            <span className="mt-0.5 text-brand-gold-400">✓</span>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Comparison({ content }: { content: AnyContent }) {
  const title = content.title as string;
  const beforeTitle = (content.beforeTitle as string) ?? "Without";
  const afterTitle = (content.afterTitle as string) ?? "With";
  const beforeItems = (content.beforeItems as string[]) ?? [];
  const afterItems = (content.afterItems as string[]) ?? [];
  return (
    <section className="px-4 py-12">
      <div className="mx-auto max-w-3xl text-center">
        {title && <h2 className="text-2xl font-bold text-brand-green-900">{title}</h2>}
      </div>
      <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
          <p className="mb-3 font-semibold text-zinc-500">{beforeTitle}</p>
          <ul className="space-y-2 text-sm text-zinc-600">
            {beforeItems.map((item, i) => (
              <li key={i}>✕ {item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border-2 border-brand-green-600 bg-brand-green-50 p-5">
          <p className="mb-3 font-semibold text-brand-green-800">{afterTitle}</p>
          <ul className="space-y-2 text-sm text-brand-green-800">
            {afterItems.map((item, i) => (
              <li key={i}>✓ {item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function Guarantee({ content }: { content: AnyContent }) {
  const title = content.title as string;
  const description = content.description as string;
  return (
    <section className="px-4 py-12">
      <div className="mx-auto max-w-2xl rounded-3xl border-2 border-brand-gold-500 bg-brand-cream p-8 text-center">
        <p className="text-3xl">🛡️</p>
        {title && <h2 className="mt-3 text-xl font-bold text-brand-green-900">{title}</h2>}
        {description && <p className="mt-2 text-sm text-zinc-600">{description}</p>}
      </div>
    </section>
  );
}

export function Testimonials({ content }: { content: AnyContent }) {
  const title = content.title as string | undefined;
  const items = (content.items as { name: string; location?: string; quote: string; rating?: number }[]) ?? [];
  return (
    <section className="bg-white px-4 py-12">
      <div className="mx-auto max-w-3xl text-center">
        {title && <h2 className="text-2xl font-bold text-brand-green-900">{title}</h2>}
      </div>
      <div className="mx-auto mt-8 grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((t, i) => (
          <div key={i} className="rounded-2xl border border-zinc-100 p-5 shadow-sm">
            <p className="text-brand-gold-500">{"★".repeat(t.rating ?? 5)}</p>
            <p className="mt-2 text-sm italic text-zinc-700">&ldquo;{t.quote}&rdquo;</p>
            <p className="mt-3 text-sm font-semibold text-zinc-900">
              {t.name}
              {t.location && <span className="font-normal text-zinc-500"> · {t.location}</span>}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Faq({ content }: { content: AnyContent }) {
  const title = content.title as string | undefined;
  const items = (content.items as { question: string; answer: string }[]) ?? [];
  return (
    <section className="px-4 py-12">
      <div className="mx-auto max-w-2xl">
        {title && <h2 className="text-center text-2xl font-bold text-brand-green-900">{title}</h2>}
        <div className="mt-6 space-y-2">
          {items.map((item, i) => (
            <details key={i} className="group rounded-xl border border-zinc-200 bg-white p-4">
              <summary className="cursor-pointer list-none font-medium text-zinc-900">
                {item.question}
              </summary>
              <p className="mt-2 text-sm text-zinc-600">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Footer({ content }: { content: AnyContent }) {
  const text = content.text as string | undefined;
  const links = (content.links as { label: string; url: string }[]) ?? [];
  return (
    <footer className="bg-brand-green-900 px-4 py-8 text-center text-sm text-white/70">
      {text && <p>{text}</p>}
      {links.length > 0 && (
        <div className="mt-2 flex justify-center gap-4">
          {links.map((l, i) => (
            <a key={i} href={l.url} className="hover:text-white">
              {l.label}
            </a>
          ))}
        </div>
      )}
    </footer>
  );
}

export function CustomHtml({ content }: { content: AnyContent }) {
  const html = content.html as string;
  if (!html) return null;
  // Admin-authored content only (RBAC-gated to the landing_pages section) — never end-user input.
  return <section dangerouslySetInnerHTML={{ __html: html }} />;
}
