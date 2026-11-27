/** Same rule as the main app's question-criteria: Jaccard similarity of word sets. */
export const DUPLICATE_SIMILARITY = 0.85;

export function normalizeText(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(text: string): Set<string> {
  return new Set(normalizeText(text).split(' ').filter((w) => w.length > 1));
}

export function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return normalizeText(a) === normalizeText(b) ? 1 : 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / (wa.size + wb.size - shared);
}
