"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

/** Light/dark toggle. Persists to localStorage and flips data-theme on <html>.
 * The no-flash inline script in the root layout sets the initial theme before
 * paint; this just keeps it in sync and lets the user switch. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

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
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
    >
      <Icon name={dark ? "sun" : "moon"} size={18} />
    </button>
  );
}
