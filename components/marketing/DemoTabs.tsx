"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import styles from "./landing.module.css";

export type DemoTab = {
  /** Short label on the control, two words at most. */
  label: string;
  /**
   * URL fragment that selects this tab, so every demo stays deep-linkable.
   * Merging three sections into one removed the #variation anchor the page used
   * to have, and a tab that can only be reached by clicking is less reachable
   * than the section it replaced. This gives all four demos an address, where
   * before only some had one.
   */
  slug: string;
  /** One line under the tab row saying what this demo shows. */
  hint: string;
  render: () => ReactNode;
};

/**
 * One section holding every product demo, instead of three sections holding one
 * each.
 *
 * The page had four interactive demos spread across three full-width sections,
 * each with its own heading and 240px of vertical padding. A visitor met the
 * same beat, "here is the product working", three separate times on a very long
 * scroll, and the repetition was a large part of why the page read as
 * overwhelming: not the word count, the distance.
 *
 * Two things this buys beyond the height:
 *
 * **Only the active demo is mounted.** `render` is a function rather than a
 * node, so the inactive panels do not build their DOM, run their timers, or
 * start their animation loops. Rendering all four and hiding three with CSS
 * would have kept every cost the section was trying to shed.
 *
 * **The demos become comparable.** Sitting them in one frame invites a visitor
 * to click across and see that compose, variation, operations and the full
 * walkthrough are the same product, which three separate sections actively
 * worked against.
 *
 * Tabs follow the ARIA pattern properly: arrow keys move between them, Home and
 * End jump to the ends, only the active tab is in the tab order, and the panel
 * is labelled by its tab. A segmented control that is really a row of buttons
 * with no roles is the usual shortcut here and it makes the section unusable
 * from a keyboard.
 */
export function DemoTabs({ tabs }: { tabs: DemoTab[] }) {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  // Honour an incoming #slug, and keep listening so a link clicked while the
  // page is already open still works.
  useEffect(() => {
    const fromHash = () => {
      const slug = window.location.hash.replace("#", "");
      const index = tabs.findIndex((tab) => tab.slug === slug);
      if (index >= 0) setActive(index);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);

  const select = (index: number) => {
    setActive(index);
    // replaceState rather than assigning location.hash: the latter scrolls the
    // panel to the top of the viewport, which is jarring when the reader is
    // already looking at it.
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${tabs[index].slug}`);
    }
  };

  const focusTab = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    select(next);
    buttons.current[next]?.focus();
  };

  return (
    <div className={styles.demoTabs}>
      <div
        role="tablist"
        aria-label="Product demos"
        className={styles.demoTabList}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            focusTab(active + 1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            focusTab(active - 1);
          } else if (event.key === "Home") {
            event.preventDefault();
            focusTab(0);
          } else if (event.key === "End") {
            event.preventDefault();
            focusTab(tabs.length - 1);
          }
        }}
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.label}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="tab"
            id={tab.slug}
            aria-selected={index === active}
            aria-controls={`${baseId}-panel-${index}`}
            // Only the selected tab is reachable by Tab; the arrows move within.
            tabIndex={index === active ? 0 : -1}
            onClick={() => select(index)}
            className={styles.demoTab}
            data-active={index === active || undefined}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className={styles.demoTabHint}>{tabs[active].hint}</p>

      <div
        role="tabpanel"
        id={`${baseId}-panel-${active}`}
        aria-labelledby={tabs[active].slug}
        className={styles.demoTabPanel}
        // Keyed so switching tabs remounts rather than reusing state from the
        // previous demo, which would leave one walkthrough mid-sequence inside
        // another.
        key={active}
      >
        {tabs[active].render()}
      </div>
    </div>
  );
}
