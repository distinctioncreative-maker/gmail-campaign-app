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
/** Whole anchors, so the visible label can be inspected too. */
const LINK_RE = /<a\s+[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
const OPT_OUT_TEXT = /\b(unsubscribe|opt[\s-]?out|remove me|stop receiving)\b/i;

/**
 * Hrefs whose visible label reads as an opt-out.
 *
 * The attribute-and-URL check below catches a link whose href contains the
 * word, which covers the system-generated one. It misses a hand-written
 * opt-out pointing somewhere like /preferences with only the label saying so,
 * and rewriting that would make a legally required opt-out depend on the
 * tracking redirect working.
 */
function optOutHrefs(html: string): Set<string> {
  const found = new Set<string>();
  for (const match of html.matchAll(LINK_RE)) {
    const label = match[3].replace(/<[^>]*>/g, " ");
    if (OPT_OUT_TEXT.test(label)) found.add(match[2]);
  }
  return found;
}

/**
 * Rewrite <a href> links to click-redirect URLs and append a 1x1 open
 * pixel. mailto:/tel:/anchor links and the unsubscribe link are left alone
 * because an opt-out link must never depend on a tracking redirect working.
 */
export function injectTracking(
  html: string,
  payload: TrackingPayload,
  appBaseUrl: string,
  choice: { opens: boolean; clicks: boolean } = { opens: true, clicks: true }
): TrackingResult {
  const token = signTrackingToken(payload);
  const linkUrls: string[] = [];
  const optOut = optOutHrefs(html);

  const rewriteLink = (
    whole: string,
    pre: string,
    quote: string,
    url: string,
    post: string
  ): string => {
    if (/^(mailto:|tel:|#)/i.test(url.trim())) return whole;
    if (/unsubscribe/i.test(pre) || /unsubscribe/i.test(post) || /unsubscribe/i.test(url)) {
      return whole;
    }
    if (optOut.has(url)) return whole;
    const idx = linkUrls.length;
    linkUrls.push(url);
    const redirectUrl = `${appBaseUrl}/api/t/c/${token}/${idx}`;
    return `<a ${pre}href=${quote}${redirectUrl}${quote}${post}>`;
  };

  const rewritten = choice.clicks ? html.replace(HREF_RE, rewriteLink) : html;

  if (!choice.opens) return { html: rewritten, linkUrls };

  const pixel = `<img src="${appBaseUrl}/api/t/o/${token}" width="1" height="1" alt="" style="display:none" border="0" />`;
  const html2 = /<\/body>/i.test(rewritten)
    ? rewritten.replace(/<\/body>/i, `${pixel}</body>`)
    : `${rewritten}${pixel}`;

  return { html: html2, linkUrls };
}
