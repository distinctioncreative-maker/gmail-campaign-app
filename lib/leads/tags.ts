export const MAX_CONTACT_TAGS = 20;
export const MAX_CONTACT_TAG_LENGTH = 32;

/** Keep tags readable and deterministic while preserving the user's casing. */
export function normalizeTagName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/** Remove blanks and case-insensitive duplicates, then enforce the contact cap. */
export function normalizeContactTags(values: string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const raw of values) {
    const tag = normalizeTagName(raw);
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === MAX_CONTACT_TAGS) break;
  }

  return tags.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function addContactTag(values: string[], value: string): string[] {
  return normalizeContactTags([...values, value]);
}

export function removeContactTag(values: string[], value: string): string[] {
  const key = normalizeTagName(value).toLocaleLowerCase();
  return normalizeContactTags(values.filter((tag) => tag.toLocaleLowerCase() !== key));
}

export function sameContactTags(first: string[], second: string[]): boolean {
  return first.length === second.length && first.every((tag, index) => tag === second[index]);
}
