/**
 * Open tracking and click tracking are two different trades.
 *
 * They used to share one `trackingEnabled` flag that defaulted on, which meant
 * every cold email carried a remote 1x1 image *and* had every link rewritten,
 * and a customer who wanted one had to accept the other.
 *
 * The open pixel is a remote image in a cold email, which filters weigh, in
 * exchange for a number Apple Mail Privacy Protection has already made mostly
 * fiction: it preloads images, so an "open" often means a proxy fetched a
 * picture. The product's own UI already labels opens as directional only.
 * Poor trade, so it defaults off.
 *
 * Click tracking produces a genuinely reliable signal, but every rewritten
 * link points at APP_BASE_URL, one hostname shared by every customer on the
 * platform. One customer sending real spam gets that domain flagged and every
 * other customer's mail then contains a flagged domain. Until per-workspace
 * tracking domains exist, that risk is not one to opt customers into silently,
 * so it also defaults off. When custom domains ship, this default should be
 * revisited: the signal is worth having once the reputation is the customer's
 * own.
 *
 * Both remain one click away, with the trade stated.
 */

export interface TrackingChoice {
  opens: boolean;
  clicks: boolean;
}

/** A campaign as far as tracking is concerned. */
export interface TrackingSource {
  openTrackingEnabled?: boolean;
  clickTrackingEnabled?: boolean;
  /** @deprecated The single flag both settings were split out of. */
  trackingEnabled?: boolean;
}

/**
 * What a campaign actually tracks.
 *
 * Campaigns written before the split have neither new field and only the old
 * one, so the old flag is the fallback for both. Reading it as "off" would
 * silently stop tracking on running campaigns whose owners chose it, which is
 * a different bug from the one being fixed.
 */
export function resolveTracking(campaign: TrackingSource): TrackingChoice {
  const legacy = campaign.trackingEnabled === true;
  return {
    opens: campaign.openTrackingEnabled ?? legacy,
    clicks: campaign.clickTrackingEnabled ?? legacy,
  };
}

/** True when a campaign tracks anything at all. */
export function tracksAnything(campaign: TrackingSource): boolean {
  const choice = resolveTracking(campaign);
  return choice.opens || choice.clicks;
}

/** One line for the campaign page and the wizard summary. */
export function describeTracking(campaign: TrackingSource): string {
  const { opens, clicks } = resolveTracking(campaign);
  if (opens && clicks) return "Opens and clicks";
  if (clicks) return "Clicks only";
  if (opens) return "Opens only";
  return "Off";
}
