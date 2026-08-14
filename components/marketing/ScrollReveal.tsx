"use client";

import { useEffect } from "react";

/**
 * Makes the landing page's scroll reveals work in every browser.
 *
 * The page already marked sixteen elements with `data-reveal`, but the only rule
 * acting on them sat inside `@supports (animation-timeline: view())`. That is
 * Chrome and Edge and nothing else: Safari has not shipped scroll-driven
 * animations and Firefox keeps them behind a flag, so on an iPhone, on any Mac
 * using Safari, and in Firefox, the marketing page had no entrance animation at
 * all. The site was animated for roughly the half of visitors using a Chromium
 * browser and static for the rest, which is a strange place to have landed given
 * how much of the page's character depends on it.
 *
 * An IntersectionObserver does the same job everywhere, so it is the single
 * mechanism now rather than a second one bolted alongside.
 *
 * Two details that matter more than the effect:
 *
 * **Content is never hidden by CSS that JavaScript has to undo.** The hiding
 * rule is scoped to an attribute this component sets on mount, so if the script
 * fails, never loads, or is blocked, every element is simply visible. Reversing
 * that, hiding by default and revealing with JS, is how a marketing page ends up
 * blank for the people most likely to be running a strict browser.
 *
 * **Reveal is one-shot.** Elements stop being observed once they have appeared,
 * so scrolling back up does not replay anything, and the observer empties itself
 * as the reader moves down the page.
 */
export function ScrollReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-landing-root]");
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (targets.length === 0) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      // Nothing to animate, so mark everything shown and never hide it.
      for (const element of targets) element.setAttribute("data-revealed", "");
      return;
    }

    // Only now does the hiding rule apply, which is what keeps a no-JS render
    // fully readable.
    root.setAttribute("data-reveal-ready", "");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          element.setAttribute("data-revealed", "");
          observer.unobserve(element);
        }
      },
      // Fires a little before the element reaches the viewport, so the motion
      // finishes about as it arrives rather than starting late and being read
      // as lag.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.06 }
    );

    for (const element of targets) {
      // Anything already on screen at load, chiefly the hero, is shown at once:
      // animating what the reader is already looking at reads as a glitch.
      const box = element.getBoundingClientRect();
      if (box.top < window.innerHeight * 0.92) {
        element.setAttribute("data-revealed", "");
      } else {
        observer.observe(element);
      }
    }

    return () => observer.disconnect();
  }, []);

  return null;
}
