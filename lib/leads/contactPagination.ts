export const CONTACT_PAGE_SIZE = 250;

export interface ContactCursor {
  createdAt: number;
  contactId: string;
}

export function encodeContactCursor(cursor: ContactCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeContactCursor(value: string | undefined): ContactCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as Record<string, unknown>;
    if (
      typeof parsed.createdAt !== "number" ||
      !Number.isFinite(parsed.createdAt) ||
      typeof parsed.contactId !== "string" ||
      parsed.contactId.length === 0
    ) {
      return null;
    }
    return { createdAt: parsed.createdAt, contactId: parsed.contactId };
  } catch {
    return null;
  }
}

export function decodeCursorTrail(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((cursor) => cursor.trim())
    .filter((cursor) => decodeContactCursor(cursor) !== null)
    .slice(-100);
}
