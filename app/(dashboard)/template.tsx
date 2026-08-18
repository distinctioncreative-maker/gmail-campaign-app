import type { ReactNode } from "react";

/**
 * The transition between dashboard routes.
 *
 * Every navigation in the app was an instant flat swap: the old screen vanished
 * and the new one was simply there. That reads as a page reload rather than as
 * software, and it is the last obvious place the product felt static after the
 * motion work on Home, Replies and the marketing page.
 *
 * `template.tsx` rather than `layout.tsx` on purpose, and the distinction is the
 * whole mechanism. A layout is preserved across navigations within its segment,
 * so an animation on it runs once and never again. A template is remounted for
 * every route change, which is what gives the animation something to run on. Put
 * this in the layout instead and it silently does nothing after the first load,
 * which is a bug that looks exactly like working code.
 *
 * The animation itself is deliberately small: 12px and 260ms, opacity and
 * transform only. A page transition is the one piece of motion a person sees
 * dozens of times a session, so it has to be under the threshold where it
 * becomes a thing you wait for. Anything with a scale, a slide across, or a
 * duration past ~300ms turns navigation into a performance.
 *
 * Two properties worth stating, because both are easy to lose:
 *
 * **It never delays content.** The animation is `both`, starting from the
 * hidden state, but it begins immediately on mount rather than after a
 * scheduling hop, so nothing is held back waiting for it.
 *
 * **It is pure CSS.** No client component, no hydration cost, no JavaScript on
 * the critical path for something purely decorative. The reduced-motion opt-out
 * lives in globals.css beside the keyframe, so a reader who has asked for
 * stillness gets a plain swap and never a shortened animation.
 */
export default function DashboardTemplate({ children }: { children: ReactNode }) {
  return <div className="route-enter">{children}</div>;
}
