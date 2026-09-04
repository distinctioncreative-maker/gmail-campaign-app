"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Tooltip } from "@/components/ui/Tooltip";

/** Light/dark toggle. Persists to localStorage and flips data-theme on <html>.
 * The no-flash inline script in the root layout sets the initial theme before
 * paint; this just keeps it in sync and lets the user switch. */
export function ThemeToggle() {
  // Defaults to true because dark is now the product's default theme. Starting
  // at false made the button render a "switch to dark" moon for one frame on a
  // page that was already dark.
  const [dark, setDark] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("massleader.theme", next);
    } catch {
      // ignore storage errors
    }
    setDark(!dark);
  }

  return (
    <Tooltip content={dark ? "Light mode" : "Dark mode"} placement="bottom">
      {(props) => (
        <button
          {...props}
          onClick={toggle}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          className="rounded-md p-2 text-muted transition hover:bg-surface-2 hover:text-foreground"
        >
          <Icon name={dark ? "sun" : "moon"} size={18} />
        </button>
      )}
    </Tooltip>
  );
}
