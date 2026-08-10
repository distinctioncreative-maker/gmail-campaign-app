/**
 * The rules a keyboard shortcut has to follow to be worth having.
 *
 * Pure, because the interesting part is when a shortcut must *not* fire. A
 * single-letter shortcut that ignores this is worse than no shortcut at all:
 * someone typing a lead's name into a search box hits `j`, the page jumps, and
 * the feature reads as a bug.
 */

export interface ShortcutContext {
  /** Tag name of the focused element, e.g. "INPUT". */
  tagName: string;
  /** Whether the focused element is editable, from contentEditable. */
  isEditable: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Whether to leave this keystroke alone.
 *
 * Modifiers are excluded as well as text fields: Cmd-K belongs to the command
 * palette, Ctrl-J is a browser shortcut on some platforms, and hijacking either
 * would break something a person already relies on.
 */
export function shouldIgnoreShortcut(ctx: ShortcutContext): boolean {
  if (ctx.metaKey || ctx.ctrlKey || ctx.altKey) return true;
  if (ctx.isEditable) return true;
  return TYPING_TAGS.has(String(ctx.tagName ?? "").toUpperCase());
}

/**
 * The next row index, clamped rather than wrapped.
 *
 * Wrapping from the last row to the first is disorienting in a list someone is
 * working down: the reason to press `j` again at the bottom is usually that the
 * key did not register, and jumping back to the top makes them lose their place.
 * Returns -1 unchanged only when the list is empty.
 */
export function nextRowIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, current + delta));
}
