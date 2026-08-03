/**
 * The signed-out product tour at /demo.
 *
 * On by default because it is entirely synthetic: no auth context, no
 * Firestore, no Gmail, no Stripe, and no writes of any kind. It is a sales
 * surface, so the useful default is visible. Set `DEMO_TOUR=off` to remove it
 * (the routes then 404 rather than redirect, so the path leaks nothing).
 */
export function demoEnabled(): boolean {
  return (process.env.DEMO_TOUR ?? "on").toLowerCase() !== "off";
}
