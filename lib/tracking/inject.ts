import "server-only";
import { signTrackingToken, type TrackingPayload } from "./token";

export interface TrackingResult {
  html: string;
  /** Original destination URLs, in link order: index N matches the
   * /api/t/c/{token}/N path segment. Stored server-side on the recipient so
   * the click-redirect endpoint never trusts a client-supplied URL. */
  linkUrls: string[];
}

const HREF_RE = /<a\s+([^>]*?)href\s*=\s*(["'])(.*?)\2([^>]*)>/gi;

/**
 * Rewrite <a href> links to click-redirect URLs and append a 1x1 open
 * pixel. mailto:/tel:/anchor links and the unsubscribe link are left alone
 * because an opt-out link must never depend on a tracking redirect working.
 */
export function injectTracking(
  html: string,
  payload: TrackingPayload,
  appBaseUrl: string
): TrackingResult {
  const token = signTrackingToken(payload);
  const linkUrls: string[] = [];

  const rewritten = html.replace(HREF_RE, (whole, pre: string, quote: string, url: string, post: string) => {
    if (/^(mailto:|tel:|#)/i.test(url.trim())) return whole;
    if (/unsubscribe/i.test(pre) || /unsubscribe/i.test(post) || /unsubscribe/i.test(url)) return whole;
    const idx = linkUrls.length;
    linkUrls.push(url);
    const redirectUrl = `${appBaseUrl}/api/t/c/${token}/${idx}`;
    return `<a ${pre}href=${quote}${redirectUrl}${quote}${post}>`;
  });

  const pixel = `<img src="${appBaseUrl}/api/t/o/${token}" width="1" height="1" alt="" style="display:none" border="0" />`;
  const html2 = /<\/body>/i.test(rewritten)
    ? rewritten.replace(/<\/body>/i, `${pixel}</body>`)
    : `${rewritten}${pixel}`;

  return { html: html2, linkUrls };
}
