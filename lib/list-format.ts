// Small serialization helpers so admins can edit repeatable content (benefits,
// ingredients, FAQ) as plain multi-line text instead of a bespoke repeater
// widget for every field. Still fully data-driven and editable — just a
// lighter-weight input format.

export function linesToArray(text: string | undefined | null): string[] {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function arrayToLines(arr: unknown): string {
  if (!Array.isArray(arr)) return "";
  return arr.join("\n");
}

export type Ingredient = { name: string; description: string };

export function linesToIngredients(text: string | undefined | null): Ingredient[] {
  return linesToArray(text).map((line) => {
    const [name, ...rest] = line.split("|");
    return { name: (name ?? "").trim(), description: rest.join("|").trim() };
  });
}

export function ingredientsToLines(arr: unknown): string {
  if (!Array.isArray(arr)) return "";
  return arr.map((i: Ingredient) => `${i.name} | ${i.description}`).join("\n");
}

export type FaqItem = { question: string; answer: string };

export function linesToFaq(text: string | undefined | null): FaqItem[] {
  return linesToArray(text).map((line) => {
    const [question, ...rest] = line.split("::");
    return { question: (question ?? "").trim(), answer: rest.join("::").trim() };
  });
}

export function faqToLines(arr: unknown): string {
  if (!Array.isArray(arr)) return "";
  return arr.map((f: FaqItem) => `${f.question} :: ${f.answer}`).join("\n");
}
