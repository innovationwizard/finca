// =============================================================================
// src/lib/utils/slug.ts — URL slug derivation
// =============================================================================

/**
 * Derive a URL slug from a display name: strips accents, lowercases, and joins
 * the remaining words with hyphens ("CAÑADA 2" → "canada-2"). A name with no
 * alphanumeric characters falls back to "lote", which `uniqueSlug` then
 * disambiguates.
 */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "lote";
}

/**
 * First slug not already present in `taken`, suffixing "-2", "-3", … on
 * collision. Two distinct names can legitimately produce the same slug
 * ("CAÑADA" and "CANADA"), so suffixing keeps the unique index intact instead
 * of rejecting the second name.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;

  for (let n = 2; n <= 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }

  throw new Error(`No se pudo derivar un slug único a partir de "${base}"`);
}
