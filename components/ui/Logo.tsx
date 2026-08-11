/**
 * Cadence brand mark: a soft monoline "pulse" representing the rhythm of
 * outreach, paired with the wordmark. No filled square, no initials.
 * Theme-aware (uses currentColor / the brand gradient) and scalable.
 */

export const APP_NAME = "Cadence";

/**
 * A quiet, typography-first wordmark for navigation chrome. The pulse mark is
 * still available for product illustrations and compact identity moments, but
 * primary navigation stays calmer without a decorative badge competing with
 * the page content.
 */
const WORDMARK_SIZE = {
  /** Mobile header and other tight chrome. */
  sm: "text-[1.0625rem] tracking-[-0.038em]",
  /** Sidebar and top bar. */
  md: "text-[1.1875rem] tracking-[-0.042em]",
  /** Sign-in and anywhere the mark is the only thing on screen. */
  lg: "text-[1.5rem] tracking-[-0.046em]",
} as const;

export function Wordmark({
  className = "",
  descriptor,
  size = "md",
}: {
  className?: string;
  descriptor?: string;
  size?: keyof typeof WORDMARK_SIZE;
}) {
  return (
    <span className={`inline-flex min-w-0 items-baseline gap-2 ${className}`}>
      {/*
        Set in the display face, which it was not.
        The wordmark rendered in Inter while every heading in the product renders
        in Inter Tight, so the one piece of type that is supposed to be the brand
        was the one piece not using the brand face. At this size the difference
        is plainly visible and reads as a logo someone typed rather than set.

        Tracking tightens as the size grows, matching the h1/h2 rule in
        globals.css: a name at 24px needs proportionally more negative tracking
        than the same name at 17px to hold together as one shape.
      */}
      <span className={`font-display font-semibold ${WORDMARK_SIZE[size]}`}>{APP_NAME}</span>
      {descriptor && (
        // text-muted rather than opacity, which is what this used. Opacity on
        // text over a themed surface produces a different colour in light and
        // dark and cannot be checked for contrast; the token is measured.
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          {descriptor}
        </span>
      )}
    </span>
  );
}

export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="cadence-mark" x1="4" y1="6" x2="28" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--brand-from)" />
          <stop offset="1" stopColor="var(--brand-to)" />
        </linearGradient>
      </defs>
      {/* rounded container ring: hairline, not a filled square */}
      <rect x="1.25" y="1.25" width="29.5" height="29.5" rx="9" stroke="url(#cadence-mark)" strokeWidth="1.6" opacity="0.28" />
      {/* the pulse / cadence wave */}
      <path
        d="M5 17.5h4.2l2.4-7.4a1 1 0 0 1 1.9.03l3.3 11.2 2.2-5.1a1 1 0 0 1 .9-.6H27"
        stroke="url(#cadence-mark)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  size = 28,
  className = "",
  wordmark = true,
}: {
  size?: number;
  className?: string;
  wordmark?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      {wordmark && (
        <span className="font-display text-[1.1875rem] font-semibold tracking-[-0.042em] text-foreground">
          {APP_NAME}
        </span>
      )}
    </span>
  );
}
