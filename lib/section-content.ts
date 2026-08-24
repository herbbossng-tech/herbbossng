import type { SectionType } from "@/app/generated/prisma/enums";
import type { Prisma } from "@/app/generated/prisma/client";
import { linesToArray, arrayToLines } from "@/lib/list-format";

// Each landing-page section's `content` JSON has a type-specific shape.
// These helpers convert between that JSON and simple multi-line form fields
// so the admin section editor stays generic instead of bespoke per type.

function linesToPairs(text: string | undefined, keys: [string, string]) {
  return linesToArray(text).map((line) => {
    const [a, ...rest] = line.split("|");
    return { [keys[0]]: (a ?? "").trim(), [keys[1]]: rest.join("|").trim() };
  });
}

function pairsToLines(items: unknown, keys: [string, string]): string {
  if (!Array.isArray(items)) return "";
  return items
    .map((item) => `${item[keys[0]] ?? ""} | ${item[keys[1]] ?? ""}`)
    .join("\n");
}

export function contentToFormValues(type: SectionType, content: Record<string, unknown>): Record<string, string> {
  switch (type) {
    case "ANNOUNCEMENT_BAR":
      return { text: (content.text as string) ?? "" };
    case "HERO":
      return {
        badge: (content.badge as string) ?? "",
        headline: (content.headline as string) ?? "",
        subheadline: (content.subheadline as string) ?? "",
        imageUrl: (content.imageUrl as string) ?? "",
        ctaText: (content.ctaText as string) ?? "",
      };
    case "TRUST_BADGES":
      return { items: pairsToLines(content.items, ["title", "subtitle"]) };
    case "PROBLEM":
      return {
        title: (content.title as string) ?? "",
        intro: (content.intro as string) ?? "",
        points: pairsToLines(content.points, ["title", "description"]),
      };
    case "FORMULA":
      return {
        title: (content.title as string) ?? "",
        intro: (content.intro as string) ?? "",
        ingredients: pairsToLines(content.ingredients, ["name", "description"]),
      };
    case "HOW_IT_WORKS":
      return {
        title: (content.title as string) ?? "",
        steps: pairsToLines(content.steps, ["title", "description"]),
      };
    case "BENEFITS":
      return { title: (content.title as string) ?? "", items: arrayToLines(content.items) };
    case "COMPARISON":
      return {
        title: (content.title as string) ?? "",
        beforeTitle: (content.beforeTitle as string) ?? "",
        afterTitle: (content.afterTitle as string) ?? "",
        beforeItems: arrayToLines(content.beforeItems),
        afterItems: arrayToLines(content.afterItems),
      };
    case "GUARANTEE":
      return {
        title: (content.title as string) ?? "",
        description: (content.description as string) ?? "",
        imageUrl: (content.imageUrl as string) ?? "",
      };
    case "TESTIMONIALS":
      return {
        title: (content.title as string) ?? "",
        items: Array.isArray(content.items)
          ? (content.items as Record<string, unknown>[])
              .map((i) => `${i.name ?? ""} | ${i.location ?? ""} | ${i.rating ?? 5} | ${i.quote ?? ""}`)
              .join("\n")
          : "",
      };
    case "FAQ":
      return {
        title: (content.title as string) ?? "",
        items: Array.isArray(content.items)
          ? (content.items as Record<string, unknown>[]).map((i) => `${i.question ?? ""} :: ${i.answer ?? ""}`).join("\n")
          : "",
      };
    case "ORDER":
      return { title: (content.title as string) ?? "" };
    case "FOOTER":
      return {
        text: (content.text as string) ?? "",
        links: pairsToLines(content.links, ["label", "url"]),
      };
    case "CUSTOM_HTML":
      return { html: (content.html as string) ?? "" };
    default:
      return {};
  }
}

export function formValuesToContent(type: SectionType, form: Record<string, string>): Prisma.InputJsonValue {
  switch (type) {
    case "ANNOUNCEMENT_BAR":
      return { text: form.text };
    case "HERO":
      return {
        badge: form.badge,
        headline: form.headline,
        subheadline: form.subheadline,
        imageUrl: form.imageUrl,
        ctaText: form.ctaText,
      };
    case "TRUST_BADGES":
      return { items: linesToPairs(form.items, ["title", "subtitle"]) };
    case "PROBLEM":
      return { title: form.title, intro: form.intro, points: linesToPairs(form.points, ["title", "description"]) };
    case "FORMULA":
      return { title: form.title, intro: form.intro, ingredients: linesToPairs(form.ingredients, ["name", "description"]) };
    case "HOW_IT_WORKS":
      return { title: form.title, steps: linesToPairs(form.steps, ["title", "description"]) };
    case "BENEFITS":
      return { title: form.title, items: linesToArray(form.items) };
    case "COMPARISON":
      return {
        title: form.title,
        beforeTitle: form.beforeTitle,
        afterTitle: form.afterTitle,
        beforeItems: linesToArray(form.beforeItems),
        afterItems: linesToArray(form.afterItems),
      };
    case "GUARANTEE":
      return { title: form.title, description: form.description, imageUrl: form.imageUrl };
    case "TESTIMONIALS":
      return {
        title: form.title,
        items: linesToArray(form.items).map((line) => {
          const [name, location, rating, ...quoteParts] = line.split("|").map((s) => s.trim());
          return { name, location, rating: Number(rating) || 5, quote: quoteParts.join("|").trim() };
        }),
      };
    case "FAQ":
      return {
        title: form.title,
        items: linesToArray(form.items).map((line) => {
          const [question, ...rest] = line.split("::");
          return { question: (question ?? "").trim(), answer: rest.join("::").trim() };
        }),
      };
    case "ORDER":
      return { title: form.title };
    case "FOOTER":
      return { text: form.text, links: linesToPairs(form.links, ["label", "url"]) };
    case "CUSTOM_HTML":
      return { html: form.html };
    default:
      return {};
  }
}

export const SECTION_FIELD_CONFIG: Record<SectionType, { name: string; label: string; multiline?: boolean; hint?: string }[]> = {
  ANNOUNCEMENT_BAR: [{ name: "text", label: "Announcement text" }],
  HERO: [
    { name: "badge", label: "Badge (optional)" },
    { name: "headline", label: "Headline", multiline: true },
    { name: "subheadline", label: "Subheadline", multiline: true },
    { name: "imageUrl", label: "Hero image URL" },
    { name: "ctaText", label: "CTA button text" },
  ],
  TRUST_BADGES: [{ name: "items", label: "Badges — one per line: Title | Subtitle", multiline: true }],
  PROBLEM: [
    { name: "title", label: "Section title" },
    { name: "intro", label: "Intro text", multiline: true },
    { name: "points", label: "Pain points — one per line: Title | Description", multiline: true },
  ],
  FORMULA: [
    { name: "title", label: "Section title" },
    { name: "intro", label: "Intro text", multiline: true },
    { name: "ingredients", label: "Ingredients — one per line: Name | Description", multiline: true },
  ],
  HOW_IT_WORKS: [
    { name: "title", label: "Section title" },
    { name: "steps", label: "Steps — one per line: Title | Description", multiline: true },
  ],
  BENEFITS: [
    { name: "title", label: "Section title" },
    { name: "items", label: "Benefits — one per line", multiline: true },
  ],
  COMPARISON: [
    { name: "title", label: "Section title" },
    { name: "beforeTitle", label: "\"Before\" column title" },
    { name: "afterTitle", label: "\"After\" column title" },
    { name: "beforeItems", label: "Before items — one per line", multiline: true },
    { name: "afterItems", label: "After items — one per line", multiline: true },
  ],
  GUARANTEE: [
    { name: "title", label: "Title" },
    { name: "description", label: "Description", multiline: true },
    { name: "imageUrl", label: "Badge image URL" },
  ],
  TESTIMONIALS: [
    { name: "title", label: "Section title" },
    { name: "items", label: "Testimonials — one per line: Name | Location | Rating(1-5) | Quote", multiline: true },
  ],
  FAQ: [
    { name: "title", label: "Section title" },
    { name: "items", label: "FAQ — one per line: Question :: Answer", multiline: true },
  ],
  ORDER: [{ name: "title", label: "Section title (e.g. Select your package)" }],
  FOOTER: [
    { name: "text", label: "Footer text", multiline: true },
    { name: "links", label: "Links — one per line: Label | URL", multiline: true },
  ],
  CUSTOM_HTML: [{ name: "html", label: "Raw HTML (rendered as-is — admin-trusted content only)", multiline: true }],
};

export function defaultContentFor(type: SectionType): Prisma.InputJsonValue {
  return formValuesToContent(type, {});
}
