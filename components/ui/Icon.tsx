import type { SVGProps } from "react";

/**
 * One cohesive line-icon set (Lucide-style, 24×24, currentColor stroke) so the
 * whole app shares a consistent, enterprise-grade visual language instead of
 * OS-dependent emoji. Add new glyphs to PATHS as needed.
 */
export type IconName =
  | "home"
  | "rocket"
  | "users"
  | "mail"
  | "repeat"
  | "ban"
  | "chart"
  | "settings"
  | "help"
  | "team"
  | "admin"
  | "health"
  | "bell"
  | "plus"
  | "search"
  | "check"
  | "x"
  | "chevronRight"
  | "chevronDown"
  | "alert"
  | "shield"
  | "clock"
  | "pause"
  | "play"
  | "stop"
  | "trash"
  | "copy"
  | "download"
  | "send"
  | "sparkles"
  | "arrowLeft"
  | "external"
  | "reply"
  | "hourglass";

const PATHS: Record<IconName, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5M5.5 9.5V20a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9.5" />,
  rocket: (
    <>
      <path d="M4.5 16.5c-1.5 1-2 5-2 5s4-.5 5-2c.6-.9.5-2-.3-2.7-.8-.8-1.8-.9-2.7-.3Z" />
      <path d="M12 15 9 12c1-4 4-8 9-9 .5 3.5-1 7.5-4 9l-2 3Z" />
      <path d="M9 12l-4 1M12 15l-1 4" />
    </>
  ),
  users: (
    <>
      <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
      <circle cx="10" cy="8" r="3.2" />
      <path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 5.2a3.2 3.2 0 0 1 0 5.6" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 5 8-5" />
    </>
  ),
  repeat: (
    <>
      <path d="M17 3.5 20.5 7 17 10.5" />
      <path d="M3.5 12V11a4 4 0 0 1 4-4h13" />
      <path d="M7 20.5 3.5 17 7 13.5" />
      <path d="M20.5 12v1a4 4 0 0 1-4 4h-13" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.6 5.6 12.8 12.8" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <rect x="7.5" y="12" width="3" height="5" rx="0.6" />
      <rect x="13.5" y="8" width="3" height="9" rx="0.6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.5 1.5 0 0 0 .3 1.7l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.5 1.5 0 0 0-2.5.6 1.5 1.5 0 0 0-.9 1.4V22a2 2 0 1 1-4 0v-.1a1.5 1.5 0 0 0-1-1.4 1.5 1.5 0 0 0-1.6.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.5 1.5 0 0 0 .3-1.7 1.5 1.5 0 0 0-1.4-.9H2a2 2 0 1 1 0-4h.1a1.5 1.5 0 0 0 1.4-1 1.5 1.5 0 0 0-.3-1.6l-.1-.1A2 2 0 1 1 5.9 3.5l.1.1a1.5 1.5 0 0 0 1.7.3H8a1.5 1.5 0 0 0 .9-1.4V2a2 2 0 1 1 4 0v.1a1.5 1.5 0 0 0 .9 1.4 1.5 1.5 0 0 0 1.7-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.5 1.5 0 0 0-.3 1.7V8a1.5 1.5 0 0 0 1.4.9H22a2 2 0 1 1 0 4h-.1a1.5 1.5 0 0 0-1.4.9Z" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 4.8.9c0 1.7-2.5 2.5-2.5 2.5" />
      <path d="M12 17h.01" />
    </>
  ),
  team: (
    <>
      <path d="M3 17 9 11l4 4 8-8" />
      <path d="M16 7h5v5" />
    </>
  ),
  admin: (
    <path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L3 18l3 3 6.5-6.5a4 4 0 0 0 5.2-5.2l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z" />
  ),
  health: (
    <path d="M3 12h3l2-5 4 10 2.5-5H21" />
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
      <path d="M10.5 20a1.8 1.8 0 0 0 3 0" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  alert: (
    <>
      <path d="M10.3 3.5 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.5a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  shield: <path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  pause: <path d="M9 5v14M15 5v14" />,
  play: <path d="M7 5l12 7-12 7V5Z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v11" />
      <path d="m8 11 4 4 4-4" />
      <path d="M4 20h16" />
    </>
  ),
  send: <path d="M21 3 10.5 13.5M21 3l-6.5 18-4-8-8-4L21 3Z" />,
  sparkles: (
    <path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15l-1.8-4.2L5.5 9l4.7-1.3L12 3ZM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" />
  ),
  arrowLeft: <path d="M19 12H5m0 0 6-6m-6 6 6 6" />,
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    </>
  ),
  reply: (
    <>
      <path d="M9 8 4 12l5 4" />
      <path d="M4 12h9a7 7 0 0 1 7 7v1" />
    </>
  ),
  hourglass: (
    <>
      <path d="M7 3h10M7 21h10" />
      <path d="M7 3c0 4 3 5 5 7 2-2 5-3 5-7" />
      <path d="M7 21c0-4 3-5 5-7 2 2 5 3 5 7" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  ...props
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
