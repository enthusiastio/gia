/** Lowercased, trimmed and de-duplicated, so tags match however they were typed. */
export function normaliseTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const clean = tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  return [...new Set(clean)].slice(0, 20);
}
