/**
 * Cadence brand mark: a soft monoline "pulse" — the rhythm of outreach —
 * paired with the wordmark. No filled square, no initials. Theme-aware
 * (uses currentColor / the brand gradient), scalable.
 */

export const APP_NAME = "Cadence";

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
      {/* rounded container ring — hairline, not a filled square */}
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
        <span className="text-lg font-semibold tracking-tight text-slate-900">{APP_NAME}</span>
      )}
    </span>
  );
}
