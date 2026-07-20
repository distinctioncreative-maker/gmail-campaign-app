"use client";

import { useEffect, useState } from "react";

/**
 * Render an epoch-millis timestamp in the viewer's local timezone. Server
 * components format with the server clock (UTC on Cloud Run), which shows the
 * wrong time; this fills in the browser-local string after mount. Initial
 * render is empty on both server and client so hydration matches.
 */
export function LocalTime({
  value,
  className,
  options,
}: {
  value: number;
  className?: string;
  options?: Intl.DateTimeFormatOptions;
}) {
  const [text, setText] = useState("");

  useEffect(() => {
    // Format in the browser's timezone after mount (server render is UTC).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(new Date(value).toLocaleString(undefined, options));
  }, [value, options]);

  return (
    <time dateTime={new Date(value).toISOString()} className={className}>
      {text || "…"}
    </time>
  );
}
